// Shared server-side helpers for the shop business logic.
//
// IMPORTANT: PocketBase's JSVM executes every hook/route handler in an isolated
// scope, so functions declared at the top of a *.pb.js file are NOT visible
// inside its handlers. All shared logic therefore lives here and is pulled in
// with require(`${__hooks}/utils.js`) *inside* each handler.
//
// All functions take a `dao` (typically a transaction dao) so callers can run
// them atomically.

// Apply a single stock movement and keep inventory.qty_on_hand in sync.
// `qty` is signed: positive adds stock, negative removes it.
function applyMovement(dao, m) {
  const mv = new Record(dao.findCollectionByNameOrId("stock_movements"));
  mv.set("product", m.product);
  mv.set("type", m.type);
  mv.set("qty", m.qty);
  if (m.unit_cost != null) mv.set("unit_cost", m.unit_cost);
  if (m.reference) mv.set("reference", m.reference);
  if (m.note) mv.set("note", m.note);
  if (m.created_by) mv.set("created_by", m.created_by);
  dao.saveRecord(mv);

  let inv = null;
  try {
    inv = dao.findFirstRecordByFilter("inventory", "product = {:p}", {
      p: m.product,
    });
  } catch (_) {
    inv = null;
  }
  if (!inv) {
    inv = new Record(dao.findCollectionByNameOrId("inventory"));
    inv.set("product", m.product);
    inv.set("qty_on_hand", 0);
    inv.set("reorder_level", 0);
  }
  inv.set("qty_on_hand", (inv.getFloat("qty_on_hand") || 0) + m.qty);
  dao.saveRecord(inv);
  return mv;
}

// --- Per-batch (lot) pricing & cost (FIFO) ---------------------------------
//
// Every inbound movement (opening stock, PO receipt, restock, returned goods)
// opens a stock_batch with its own unit_cost + sell_price and a qty_remaining.
// Sales draw down the oldest open lots first, so the cost of a sale is the cost
// of the exact lots consumed. These helpers run inside the same transaction as
// applyMovement so inventory.qty_on_hand and the batches stay in lock-step.

// Open a new stock lot. `qty` must be positive.
function openBatch(dao, b) {
  const rec = new Record(dao.findCollectionByNameOrId("stock_batches"));
  rec.set("product", b.product);
  rec.set("qty_received", b.qty);
  rec.set("qty_remaining", b.qty);
  if (b.unit_cost != null) rec.set("unit_cost", money(b.unit_cost));
  if (b.sell_price != null) rec.set("sell_price", money(b.sell_price));
  rec.set("source_type", b.source_type);
  if (b.source_reference) rec.set("source_reference", b.source_reference);
  rec.set("received_at", b.received_at || new Date().toISOString());
  if (b.note) rec.set("note", b.note);
  if (b.created_by) rec.set("created_by", b.created_by);
  dao.saveRecord(rec);
  return rec;
}

// Selling price of the lot a sale would currently draw from (oldest open lot),
// or null when no open lot exists. POS uses this so the price reflects the stock
// being sold rather than only the catalogue price.
function oldestOpenBatchPrice(dao, productId) {
  const open = dao.findRecordsByFilter(
    "stock_batches",
    "product = {:p} && qty_remaining > 0",
    "received_at,created",
    1,
    0,
    { p: productId }
  );
  if (!open || open.length === 0) return null;
  const sp = open[0].getFloat("sell_price");
  return sp > 0 ? sp : null;
}

// Draw `qty` units from the product's open lots, oldest first (FIFO). Records an
// invoice_item_batches link per lot consumed and returns the total cost drawn.
// If the open lots cannot cover `qty` (oversell / legacy untracked stock), the
// shortfall is recorded with a null lot at the product's cost_price so the line
// cost stays meaningful.
function consumeFIFO(dao, { product, qty, invoice_item, created_by }) {
  let remaining = qty;
  let costTotal = 0;
  const open = dao.findRecordsByFilter(
    "stock_batches",
    "product = {:p} && qty_remaining > 0",
    "received_at,created",
    0,
    0,
    { p: product }
  );
  for (const batch of open) {
    if (remaining <= 0) break;
    const avail = batch.getFloat("qty_remaining");
    const take = Math.min(avail, remaining);
    const unitCost = batch.getFloat("unit_cost") || 0;

    batch.set("qty_remaining", money(avail - take));
    dao.saveRecord(batch);

    const link = new Record(dao.findCollectionByNameOrId("invoice_item_batches"));
    link.set("invoice_item", invoice_item);
    link.set("batch", batch.id);
    link.set("product", product);
    link.set("qty", take);
    link.set("unit_cost", unitCost);
    dao.saveRecord(link);

    costTotal += take * unitCost;
    remaining = money(remaining - take);
  }

  if (remaining > 0) {
    // shortfall: no lot to draw from. Fall back to the product cost.
    let fallbackCost = 0;
    try {
      fallbackCost = dao.findRecordById("products", product).getFloat("cost_price") || 0;
    } catch (_) {
      fallbackCost = 0;
    }
    const link = new Record(dao.findCollectionByNameOrId("invoice_item_batches"));
    link.set("invoice_item", invoice_item);
    link.set("product", product);
    link.set("qty", remaining);
    link.set("unit_cost", fallbackCost);
    dao.saveRecord(link);
    costTotal += remaining * fallbackCost;
  }

  return money(costTotal);
}

// Weighted-average unit cost of the lots an invoice line was sold from, used to
// price returned goods back into stock. Returns null for legacy lines that have
// no lot links (caller should fall back to the product cost).
function returnUnitCost(dao, invoiceItemId) {
  const links = dao.findRecordsByFilter(
    "invoice_item_batches",
    "invoice_item = {:id}",
    "",
    0,
    0,
    { id: invoiceItemId }
  );
  if (!links || links.length === 0) return null;
  let qty = 0;
  let cost = 0;
  for (const l of links) {
    const q = l.getFloat("qty");
    qty += q;
    cost += q * (l.getFloat("unit_cost") || 0);
  }
  return qty > 0 ? money(cost / qty) : null;
}

// Generate the next sequential document number, e.g.
// nextNumber(dao, "invoices", "INV-") -> "INV-000001".
function nextNumber(dao, collection, prefix) {
  const res = new DynamicModel({ c: 0 });
  dao
    .db()
    .newQuery(
      `SELECT COUNT(*) AS c FROM ${collection} WHERE number != '' AND number IS NOT NULL`
    )
    .one(res);
  return prefix + String((res.c || 0) + 1).padStart(6, "0");
}

// Round to 2 decimals to avoid floating-point cruft on money values.
function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Require the caller to be an authenticated owner; returns { auth, data }.
function requireOwner(c) {
  const info = $apis.requestInfo(c);
  const auth = info.authRecord;
  if (!auth) throw new UnauthorizedError("Authentication required.");
  if (auth.get("role") !== "owner")
    throw new ForbiddenError("Owner role required.");
  return { auth, data: info.data || {} };
}

// Total quantity already returned for a given invoice_item id.
function sumReturnedQty(dao, invoiceItemId) {
  const res = new DynamicModel({ s: 0 });
  dao
    .db()
    .newQuery(
      "SELECT COALESCE(SUM(qty),0) AS s FROM return_items WHERE invoice_item = {:id}"
    )
    .bind({ id: invoiceItemId })
    .one(res);
  return res.s || 0;
}

// Whether every unit sold on an invoice has been returned.
function isFullyReturned(dao, invoiceId) {
  const sold = new DynamicModel({ s: 0 });
  dao
    .db()
    .newQuery(
      "SELECT COALESCE(SUM(qty),0) AS s FROM invoice_items WHERE invoice = {:id}"
    )
    .bind({ id: invoiceId })
    .one(sold);
  const returned = new DynamicModel({ s: 0 });
  dao
    .db()
    .newQuery(
      "SELECT COALESCE(SUM(ri.qty),0) AS s FROM return_items ri " +
        "JOIN returns r ON r.id = ri.[return] WHERE r.invoice = {:id}"
    )
    .bind({ id: invoiceId })
    .one(returned);
  return (returned.s || 0) >= (sold.s || 0) && (sold.s || 0) > 0;
}

// Read a product record's dynamic attributes JSON as a plain object.
function readAttrs(record) {
  let raw = record.get("attributes");
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  try {
    return JSON.parse(String(raw || "{}")) || {};
  } catch (_) {
    return {};
  }
}

// Validate a product's dynamic attributes against the active definitions.
function validateProductAttributes(record) {
  const defs = $app
    .dao()
    .findRecordsByFilter(
      "attribute_definitions",
      "applies_to = 'product'",
      "",
      200,
      0
    );
  if (!defs || defs.length === 0) return;

  const attrs = readAttrs(record);
  for (const d of defs) {
    const key = d.get("key");
    const label = d.get("label") || key;
    const type = d.get("type");
    const required = d.get("is_required");
    const multiple = d.get("is_multiple");
    const val = attrs[key];
    const empty =
      val === undefined ||
      val === null ||
      val === "" ||
      (Array.isArray(val) && val.length === 0);

    if (required && empty)
      throw new BadRequestError(`Attribute "${label}" is required.`);
    if (empty) continue;

    if (type === "number") {
      const vals = Array.isArray(val) ? val : [val];
      for (const v of vals)
        if (isNaN(Number(v)))
          throw new BadRequestError(`Attribute "${label}" must be a number.`);
    } else if (type === "boolean") {
      if (typeof val !== "boolean")
        throw new BadRequestError(`Attribute "${label}" must be true/false.`);
    } else if (type === "select") {
      const allowed = (d.get("options") && d.get("options").values) || [];
      const vals = Array.isArray(val) ? val : [val];
      for (const v of vals)
        if (allowed.length && allowed.indexOf(v) === -1)
          throw new BadRequestError(`Attribute "${label}" has an invalid option.`);
    } else if (type === "relation") {
      const target = d.get("target_collection");
      if (!target)
        throw new BadRequestError(
          `Attribute "${label}" is misconfigured (no target collection).`
        );
      const ids = Array.isArray(val) ? val : [val];
      if (!multiple && ids.length > 1)
        throw new BadRequestError(`Attribute "${label}" accepts a single value.`);
      for (const id of ids) {
        try {
          $app.dao().findRecordById(target, id);
        } catch (_) {
          throw new BadRequestError(
            `Attribute "${label}" references a missing ${target} record.`
          );
        }
      }
    }
  }
}

module.exports = {
  applyMovement,
  openBatch,
  oldestOpenBatchPrice,
  consumeFIFO,
  returnUnitCost,
  nextNumber,
  money,
  requireOwner,
  sumReturnedQty,
  isFullyReturned,
  readAttrs,
  validateProductAttributes,
};
