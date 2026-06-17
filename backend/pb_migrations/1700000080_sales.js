/// <reference path="../pb_data/types.d.ts" />

// Sales. An invoice groups invoice_items. When an invoice is finalized
// (status=paid) hooks assign the sequential number, create `sale`
// stock_movements and decrement inventory, and validate discount limits.
//
// Cashiers can create and read invoices but cannot edit/delete finalized ones
// (corrections go through returns); owners retain full control.
migrate(
  (db) => {
    const dao = new Dao(db);
    const AUTH = '@request.auth.id != ""';
    const OWNER = '@request.auth.role = "owner"';

    const customers = dao.findCollectionByNameOrId("customers");
    const users = dao.findCollectionByNameOrId("users");
    const products = dao.findCollectionByNameOrId("products");

    const invoices = new Collection({
      name: "invoices",
      type: "base",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: AUTH,
      updateRule: OWNER,
      deleteRule: OWNER,
      schema: [
        { name: "number", type: "text" }, // assigned by hook on finalize
        {
          name: "customer",
          type: "relation",
          options: {
            collectionId: customers.id,
            maxSelect: 1,
            cascadeDelete: false,
          },
        },
        {
          name: "cashier",
          type: "relation",
          required: true,
          options: { collectionId: users.id, maxSelect: 1, cascadeDelete: false },
        },
        { name: "subtotal", type: "number", options: { min: 0 } },
        { name: "discount_total", type: "number", options: { min: 0 } },
        { name: "tax_total", type: "number", options: { min: 0 } },
        { name: "grand_total", type: "number", options: { min: 0 } },
        {
          name: "payment_method",
          type: "select",
          options: { maxSelect: 1, values: ["cash", "card", "other"] },
        },
        {
          name: "status",
          type: "select",
          required: true,
          options: {
            maxSelect: 1,
            values: ["draft", "paid", "void", "partially_returned", "returned"],
          },
        },
        { name: "note", type: "text" },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_invoices_number ON invoices (number) WHERE number != ''",
        "CREATE INDEX idx_invoices_status ON invoices (status)",
        "CREATE INDEX idx_invoices_cashier ON invoices (cashier)",
      ],
    });
    dao.saveCollection(invoices);

    const invId = dao.findCollectionByNameOrId("invoices").id;
    const items = new Collection({
      name: "invoice_items",
      type: "base",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: AUTH,
      updateRule: AUTH,
      deleteRule: AUTH,
      schema: [
        {
          name: "invoice",
          type: "relation",
          required: true,
          options: { collectionId: invId, maxSelect: 1, cascadeDelete: true },
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
        { name: "discount", type: "number", options: { min: 0 } },
        { name: "tax_rate", type: "number", options: { min: 0, max: 100 } },
        { name: "line_total", type: "number", options: { min: 0 } },
      ],
      indexes: [
        "CREATE INDEX idx_invitems_invoice ON invoice_items (invoice)",
        "CREATE INDEX idx_invitems_product ON invoice_items (product)",
      ],
    });
    dao.saveCollection(items);
  },
  (db) => {
    const dao = new Dao(db);
    for (const name of ["invoice_items", "invoices"]) {
      try {
        dao.deleteCollection(dao.findCollectionByNameOrId(name));
      } catch (_) {}
    }
  }
);
