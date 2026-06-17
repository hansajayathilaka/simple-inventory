/// <reference path="../pb_data/types.d.ts" />

// Returns / refunds. A return references the original invoice and the items
// being returned. Hooks create `return` stock_movements (restocking inventory),
// compute the refund, and update the original invoice status.
migrate(
  (db) => {
    const dao = new Dao(db);
    const AUTH = '@request.auth.id != ""';
    const OWNER = '@request.auth.role = "owner"';

    const invoices = dao.findCollectionByNameOrId("invoices");
    const invoiceItems = dao.findCollectionByNameOrId("invoice_items");
    const products = dao.findCollectionByNameOrId("products");
    const users = dao.findCollectionByNameOrId("users");

    const returns = new Collection({
      name: "returns",
      type: "base",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: AUTH,
      updateRule: OWNER,
      deleteRule: OWNER,
      schema: [
        { name: "number", type: "text" },
        {
          name: "invoice",
          type: "relation",
          required: true,
          options: {
            collectionId: invoices.id,
            maxSelect: 1,
            cascadeDelete: false,
          },
        },
        { name: "refund_total", type: "number", options: { min: 0 } },
        { name: "reason", type: "text" },
        {
          name: "cashier",
          type: "relation",
          required: true,
          options: { collectionId: users.id, maxSelect: 1, cascadeDelete: false },
        },
      ],
      indexes: [
        "CREATE INDEX idx_returns_invoice ON returns (invoice)",
        "CREATE UNIQUE INDEX idx_returns_number ON returns (number) WHERE number != ''",
      ],
    });
    dao.saveCollection(returns);

    const retId = dao.findCollectionByNameOrId("returns").id;
    const items = new Collection({
      name: "return_items",
      type: "base",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: AUTH,
      updateRule: AUTH,
      deleteRule: AUTH,
      schema: [
        {
          name: "return",
          type: "relation",
          required: true,
          options: { collectionId: retId, maxSelect: 1, cascadeDelete: true },
        },
        {
          name: "invoice_item",
          type: "relation",
          options: {
            collectionId: invoiceItems.id,
            maxSelect: 1,
            cascadeDelete: false,
          },
        },
        {
          name: "product",
          type: "relation",
          required: true,
          options: {
            collectionId: products.id,
            maxSelect: 1,
            cascadeDelete: false,
          },
        },
        { name: "qty", type: "number", required: true, options: { min: 0 } },
        { name: "unit_price", type: "number", required: true, options: { min: 0 } },
        { name: "line_total", type: "number", options: { min: 0 } },
      ],
      indexes: ["CREATE INDEX idx_retitems_return ON return_items (return)"],
    });
    dao.saveCollection(items);
  },
  (db) => {
    const dao = new Dao(db);
    for (const name of ["return_items", "returns"]) {
      try {
        dao.deleteCollection(dao.findCollectionByNameOrId(name));
      } catch (_) {}
    }
  }
);
