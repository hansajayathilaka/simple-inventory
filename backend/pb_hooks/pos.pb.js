/// <reference path="../pb_data/types.d.ts" />

// POS endpoints: checkout (sale) and return/refund. Both run atomically in a
// transaction and perform all stock + numbering logic server-side, so any
// client (desktop now, networked terminals later) gets identical behaviour.

// POST /api/pos/checkout
// body: {
//   customer?: string,
//   items: [{ product, qty, unit_price, discount? }],
//   discount_total?: number,          // invoice-level discount
//   payment_method?: "cash"|"card"|"other",
//   note?: string
// }
routerAdd(
  "POST",
  "/api/pos/checkout",
  (c) => {
    const { applyMovement, consumeFIFO, oldestOpenBatchPrice, nextNumber, money } =
      require(`${__hooks}/utils.js`);
    const info = $apis.requestInfo(c);
    const auth = info.authRecord;
    if (!auth) throw new UnauthorizedError("Authentication required.");
    const data = info.data || {};
    const lines = Array.isArray(data.items) ? data.items : [];
    if (lines.length === 0) throw new BadRequestError("No items to sell.");

    let out = null;
    $app.dao().runInTransaction((tx) => {
      const invoice = new Record(tx.findCollectionByNameOrId("invoices"));
      invoice.set("cashier", auth.id);
      if (data.customer) invoice.set("customer", data.customer);
      invoice.set("payment_method", data.payment_method || "cash");
      invoice.set("note", data.note || "");
      invoice.set("status", "draft");
      tx.saveRecord(invoice); // get an id for the items

      let subtotal = 0;
      let lineDiscounts = 0;
      let taxTotal = 0;

      for (const line of lines) {
        const product = tx.findRecordById("products", line.product);
        const qty = Number(line.qty);
        if (!(qty > 0)) throw new BadRequestError("Invalid quantity.");
        // price precedence: explicit override -> oldest open lot's price ->
        // product catalogue price.
        const unitPrice =
          line.unit_price != null
            ? Number(line.unit_price)
            : oldestOpenBatchPrice(tx, product.id) != null
            ? oldestOpenBatchPrice(tx, product.id)
            : product.getFloat("sell_price");
        const gross = money(qty * unitPrice);
        const discount = money(line.discount || 0);
        if (discount < 0 || discount > gross)
          throw new BadRequestError("Invalid line discount.");
        const taxRate = product.getFloat("tax_rate") || 0;
        const net = money(gross - discount);
        const tax = money((net * taxRate) / 100);

        const item = new Record(tx.findCollectionByNameOrId("invoice_items"));
        item.set("invoice", invoice.id);
        item.set("product", product.id);
        item.set("qty", qty);
        item.set("unit_price", unitPrice);
        item.set("discount", discount);
        item.set("tax_rate", taxRate);
        item.set("line_total", money(net + tax));
        tx.saveRecord(item); // need the id to link consumed lots

        // draw the sold qty from stock lots (FIFO) and record the true cost
        const costTotal = consumeFIFO(tx, {
          product: product.id,
          qty: qty,
          invoice_item: item.id,
          created_by: auth.id,
        });
        item.set("cost_total", costTotal);
        tx.saveRecord(item);

        subtotal += gross;
        lineDiscounts += discount;
        taxTotal += tax;

        // decrement stock via the ledger
        applyMovement(tx, {
          product: product.id,
          type: "sale",
          qty: -qty,
          reference: invoice.id,
          created_by: auth.id,
        });
      }

      const invoiceDiscount = money(data.discount_total || 0);
      const discountTotal = money(lineDiscounts + invoiceDiscount);
      subtotal = money(subtotal);
      taxTotal = money(taxTotal);
      if (invoiceDiscount < 0 || invoiceDiscount > money(subtotal - lineDiscounts))
        throw new BadRequestError("Invalid invoice discount.");
      const grandTotal = money(subtotal - discountTotal + taxTotal);

      invoice.set("subtotal", subtotal);
      invoice.set("discount_total", discountTotal);
      invoice.set("tax_total", taxTotal);
      invoice.set("grand_total", grandTotal);
      invoice.set("number", nextNumber(tx, "invoices", "INV-"));
      invoice.set("status", "paid");

      // cash handling: record tendered amount + change when provided
      let changeGiven = 0;
      if (data.amount_tendered != null && data.amount_tendered !== "") {
        const tendered = money(data.amount_tendered);
        changeGiven = money(Math.max(0, tendered - grandTotal));
        invoice.set("amount_tendered", tendered);
        invoice.set("change_given", changeGiven);
      }
      tx.saveRecord(invoice);

      out = {
        id: invoice.id,
        number: invoice.get("number"),
        grand_total: grandTotal,
        change_given: changeGiven,
      };
    });

    return c.json(200, out);
  },
  $apis.requireRecordAuth()
);

// POST /api/pos/return
// body: { invoice: string, reason?: string, items: [{ invoice_item, qty }] }
routerAdd(
  "POST",
  "/api/pos/return",
  (c) => {
    const {
      applyMovement,
      openBatch,
      returnUnitCost,
      nextNumber,
      money,
      sumReturnedQty,
      isFullyReturned,
    } = require(`${__hooks}/utils.js`);
    const info = $apis.requestInfo(c);
    const auth = info.authRecord;
    if (!auth) throw new UnauthorizedError("Authentication required.");
    const data = info.data || {};
    if (!data.invoice) throw new BadRequestError("Missing invoice.");
    const lines = Array.isArray(data.items) ? data.items : [];
    if (lines.length === 0) throw new BadRequestError("No items to return.");

    let out = null;
    $app.dao().runInTransaction((tx) => {
      const invoice = tx.findRecordById("invoices", data.invoice);

      const ret = new Record(tx.findCollectionByNameOrId("returns"));
      ret.set("invoice", invoice.id);
      ret.set("reason", data.reason || "");
      ret.set("cashier", auth.id);
      tx.saveRecord(ret);

      // total originally sold per invoice_item, to cap the return qty
      let refundTotal = 0;
      for (const line of lines) {
        const srcItem = tx.findRecordById("invoice_items", line.invoice_item);
        if (srcItem.get("invoice") !== invoice.id)
          throw new BadRequestError("Item does not belong to invoice.");
        const qty = Number(line.qty);
        if (!(qty > 0)) throw new BadRequestError("Invalid return quantity.");

        // cap: cannot return more than already returned + remaining
        const alreadyReturned = sumReturnedQty(tx, srcItem.id);
        const soldQty = srcItem.getFloat("qty");
        if (alreadyReturned + qty > soldQty)
          throw new BadRequestError("Return quantity exceeds sold quantity.");

        const unitPrice = srcItem.getFloat("unit_price");
        // proportional refund of the net line price (excl. tax for simplicity)
        const perUnitNet =
          (srcItem.getFloat("line_total") || 0) / (soldQty || 1);
        const lineRefund = money(perUnitNet * qty);

        const retItem = new Record(tx.findCollectionByNameOrId("return_items"));
        retItem.set("return", ret.id);
        retItem.set("invoice_item", srcItem.id);
        retItem.set("product", srcItem.get("product"));
        retItem.set("qty", qty);
        retItem.set("unit_price", unitPrice);
        retItem.set("line_total", lineRefund);
        tx.saveRecord(retItem);

        refundTotal += lineRefund;

        // restock via the ledger
        applyMovement(tx, {
          product: srcItem.get("product"),
          type: "return",
          qty: qty,
          reference: ret.id,
          created_by: auth.id,
        });
        // open a lot for the returned goods so they re-enter FIFO. Cost comes
        // from the lots the item was originally sold from (falls back to the
        // product cost for legacy lines with no lot links).
        let retCost = returnUnitCost(tx, srcItem.id);
        if (retCost == null) {
          try {
            retCost = tx.findRecordById("products", srcItem.get("product")).getFloat("cost_price") || 0;
          } catch (_) {
            retCost = 0;
          }
        }
        openBatch(tx, {
          product: srcItem.get("product"),
          qty: qty,
          unit_cost: retCost,
          sell_price: unitPrice,
          source_type: "return",
          source_reference: ret.id,
          created_by: auth.id,
        });
      }

      ret.set("refund_total", money(refundTotal));
      ret.set("number", nextNumber(tx, "returns", "RET-"));
      tx.saveRecord(ret);

      // update invoice status: fully vs partially returned
      const fully = isFullyReturned(tx, invoice.id);
      invoice.set("status", fully ? "returned" : "partially_returned");
      tx.saveRecord(invoice);

      out = { id: ret.id, number: ret.get("number"), refund_total: money(refundTotal) };
    });

    return c.json(200, out);
  },
  $apis.requireRecordAuth()
);
