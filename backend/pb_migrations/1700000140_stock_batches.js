/// <reference path="../pb_data/types.d.ts" />

// Per-batch (lot) pricing & cost tracking.
//
// stock_batches  = one row per inbound lot (opening stock, PO receipt, restock,
//   or returned goods). Each lot carries its own unit_cost AND sell_price, and a
//   qty_remaining that is drawn down FIFO as items are sold. This makes margin
//   accurate (sale cost = the cost of the exact lots consumed) and lets the shop
//   set a selling price per stock lot.
//
// invoice_item_batches = the link recording which lots (and how much of each) a
//   sale line consumed, with the lot's unit_cost. Used for true line cost and as
//   the basis for the cost of returned goods.
//
// Like `inventory`, both are server-managed: all writes go through pb_hooks
// (utils.js helpers) so the ledger, inventory level and batches stay consistent.
migrate(
  (db) => {
    const dao = new Dao(db);
    const AUTH = '@request.auth.id != ""';

    const products = dao.findCollectionByNameOrId("products");
    const users = dao.findCollectionByNameOrId("users");

    const batches = new Collection({
      name: "stock_batches",
      type: "base",
      listRule: AUTH,
      viewRule: AUTH,
      // Managed exclusively by server-side hooks/routes (superuser dao).
      createRule: null,
      updateRule: null,
      deleteRule: null,
      schema: [
        {
          name: "product",
          type: "relation",
          required: true,
          options: { collectionId: products.id, maxSelect: 1, cascadeDelete: true },
        },
        { name: "qty_received", type: "number", required: true },
        { name: "qty_remaining", type: "number", required: true },
        { name: "unit_cost", type: "number", options: { min: 0 } },
        // per-lot selling price (the headline "selling price per stock" feature)
        { name: "sell_price", type: "number", options: { min: 0 } },
        {
          name: "source_type",
          type: "select",
          required: true,
          options: {
            maxSelect: 1,
            values: ["opening", "purchase", "restock", "return", "adjustment"],
          },
        },
        // reference to the source document (PO id / movement id / return id)
        { name: "source_reference", type: "text" },
        { name: "received_at", type: "date" },
        { name: "note", type: "text" },
        {
          name: "created_by",
          type: "relation",
          options: { collectionId: users.id, maxSelect: 1, cascadeDelete: false },
        },
      ],
      indexes: [
        "CREATE INDEX idx_batches_product ON stock_batches (product)",
        // FIFO draw order: oldest received first within a product
        "CREATE INDEX idx_batches_fifo ON stock_batches (product, received_at)",
      ],
    });
    dao.saveCollection(batches);

    const invoiceItems = dao.findCollectionByNameOrId("invoice_items");
    const batchesId = dao.findCollectionByNameOrId("stock_batches").id;

    const links = new Collection({
      name: "invoice_item_batches",
      type: "base",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      schema: [
        {
          name: "invoice_item",
          type: "relation",
          required: true,
          options: { collectionId: invoiceItems.id, maxSelect: 1, cascadeDelete: true },
        },
        {
          // nullable: a sale beyond tracked lots (oversell / legacy stock) has no lot
          name: "batch",
          type: "relation",
          options: { collectionId: batchesId, maxSelect: 1, cascadeDelete: false },
        },
        {
          name: "product",
          type: "relation",
          required: true,
          options: { collectionId: products.id, maxSelect: 1, cascadeDelete: false },
        },
        { name: "qty", type: "number", required: true },
        { name: "unit_cost", type: "number", options: { min: 0 } },
      ],
      indexes: [
        "CREATE INDEX idx_iib_item ON invoice_item_batches (invoice_item)",
        "CREATE INDEX idx_iib_batch ON invoice_item_batches (batch)",
      ],
    });
    dao.saveCollection(links);

    // Add cost capture to invoice_items: total cost of the lots consumed by the
    // line (enables true profit/margin reporting in a later phase).
    invoiceItems.schema.addField(
      new SchemaField({ name: "cost_total", type: "number", options: { min: 0 } })
    );
    dao.saveCollection(invoiceItems);

    // Backfill: turn existing on-hand stock into one "opening" lot per product so
    // it is FIFO-consumable. Cost/sell price seed from the product's current
    // values; received_at backdated so opening stock is always drawn first.
    const invRows = dao.findRecordsByFilter("inventory", "qty_on_hand > 0", "", 0, 0);
    for (const inv of invRows) {
      const productId = inv.get("product");
      let product = null;
      try {
        product = dao.findRecordById("products", productId);
      } catch (_) {
        continue; // orphan inventory row, skip
      }
      const qty = inv.getFloat("qty_on_hand");
      const b = new Record(dao.findCollectionByNameOrId("stock_batches"));
      b.set("product", productId);
      b.set("qty_received", qty);
      b.set("qty_remaining", qty);
      b.set("unit_cost", product.getFloat("cost_price") || 0);
      b.set("sell_price", product.getFloat("sell_price") || 0);
      b.set("source_type", "opening");
      b.set("received_at", "2000-01-01 00:00:00.000Z");
      b.set("note", "Opening stock (migrated)");
      dao.saveRecord(b);
    }
  },
  (db) => {
    const dao = new Dao(db);
    for (const name of ["invoice_item_batches", "stock_batches"]) {
      try {
        dao.deleteCollection(dao.findCollectionByNameOrId(name));
      } catch (_) {}
    }
    try {
      const invoiceItems = dao.findCollectionByNameOrId("invoice_items");
      const f = invoiceItems.schema.getFieldByName("cost_total");
      if (f) invoiceItems.schema.removeField(f.id);
      dao.saveCollection(invoiceItems);
    } catch (_) {}
  }
);
