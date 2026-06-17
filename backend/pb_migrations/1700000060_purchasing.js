/// <reference path="../pb_data/types.d.ts" />

// Purchasing: owner restock flow. A purchase_order groups line items from a
// supplier; finalizing it produces `purchase` stock_movements (handled in
// pb_hooks) which raise inventory.
migrate(
  (db) => {
    const dao = new Dao(db);
    const AUTH = '@request.auth.id != ""';
    const OWNER = '@request.auth.role = "owner"';

    const suppliers = dao.findCollectionByNameOrId("suppliers");
    const products = dao.findCollectionByNameOrId("products");
    const users = dao.findCollectionByNameOrId("users");

    const po = new Collection({
      name: "purchase_orders",
      type: "base",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: OWNER,
      updateRule: OWNER,
      deleteRule: OWNER,
      schema: [
        { name: "reference", type: "text" },
        {
          name: "supplier",
          type: "relation",
          required: true,
          options: {
            collectionId: suppliers.id,
            maxSelect: 1,
            cascadeDelete: false,
          },
        },
        {
          name: "status",
          type: "select",
          required: true,
          options: { maxSelect: 1, values: ["draft", "received", "cancelled"] },
        },
        { name: "total_cost", type: "number", options: { min: 0 } },
        { name: "note", type: "text" },
        {
          name: "created_by",
          type: "relation",
          options: { collectionId: users.id, maxSelect: 1, cascadeDelete: false },
        },
        { name: "received_at", type: "date" },
      ],
      indexes: [
        "CREATE INDEX idx_po_supplier ON purchase_orders (supplier)",
        "CREATE INDEX idx_po_status ON purchase_orders (status)",
      ],
    });
    dao.saveCollection(po);

    const poId = dao.findCollectionByNameOrId("purchase_orders").id;
    const items = new Collection({
      name: "purchase_order_items",
      type: "base",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: OWNER,
      updateRule: OWNER,
      deleteRule: OWNER,
      schema: [
        {
          name: "purchase_order",
          type: "relation",
          required: true,
          options: { collectionId: poId, maxSelect: 1, cascadeDelete: true },
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
        { name: "unit_cost", type: "number", required: true, options: { min: 0 } },
        { name: "line_total", type: "number", options: { min: 0 } },
      ],
      indexes: [
        "CREATE INDEX idx_poitems_po ON purchase_order_items (purchase_order)",
      ],
    });
    dao.saveCollection(items);
  },
  (db) => {
    const dao = new Dao(db);
    for (const name of ["purchase_order_items", "purchase_orders"]) {
      try {
        dao.deleteCollection(dao.findCollectionByNameOrId(name));
      } catch (_) {}
    }
  }
);
