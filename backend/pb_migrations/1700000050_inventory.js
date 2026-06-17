/// <reference path="../pb_data/types.d.ts" />

// Inventory = current stock level per product (one row per product).
// stock_movements = the append-only ledger that explains every change. Hooks
// keep inventory.qty_on_hand in sync from the movements, so the level is always
// reconstructable and auditable.
migrate(
  (db) => {
    const dao = new Dao(db);
    const AUTH = '@request.auth.id != ""';
    const OWNER = '@request.auth.role = "owner"';

    const products = dao.findCollectionByNameOrId("products");
    const users = dao.findCollectionByNameOrId("users");

    const inventory = new Collection({
      name: "inventory",
      type: "base",
      listRule: AUTH,
      viewRule: AUTH,
      // Managed exclusively by server-side hooks/routes (which use the
      // superuser dao and bypass these rules). No direct API writes.
      createRule: null,
      updateRule: null,
      deleteRule: null,
      schema: [
        {
          name: "product",
          type: "relation",
          required: true,
          options: {
            collectionId: products.id,
            maxSelect: 1,
            cascadeDelete: true,
          },
        },
        { name: "qty_on_hand", type: "number", options: { min: null } },
        { name: "reorder_level", type: "number", options: { min: 0 } },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_inventory_product ON inventory (product)",
      ],
    });
    dao.saveCollection(inventory);

    const movements = new Collection({
      name: "stock_movements",
      type: "base",
      listRule: AUTH,
      viewRule: AUTH,
      // Append-only ledger created only by server-side hooks/routes.
      createRule: null,
      updateRule: null,
      deleteRule: null,
      schema: [
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
        {
          name: "type",
          type: "select",
          required: true,
          options: {
            maxSelect: 1,
            values: ["purchase", "restock", "sale", "return", "adjustment"],
          },
        },
        // signed quantity: positive adds stock, negative removes
        { name: "qty", type: "number", required: true },
        { name: "unit_cost", type: "number", options: { min: 0 } },
        // free-form reference to the source document (invoice/PO id)
        { name: "reference", type: "text" },
        { name: "note", type: "text" },
        {
          name: "created_by",
          type: "relation",
          options: { collectionId: users.id, maxSelect: 1, cascadeDelete: false },
        },
      ],
      indexes: [
        "CREATE INDEX idx_movements_product ON stock_movements (product)",
        "CREATE INDEX idx_movements_type ON stock_movements (type)",
        "CREATE INDEX idx_movements_reference ON stock_movements (reference)",
      ],
    });
    dao.saveCollection(movements);
  },
  (db) => {
    const dao = new Dao(db);
    for (const name of ["stock_movements", "inventory"]) {
      try {
        dao.deleteCollection(dao.findCollectionByNameOrId(name));
      } catch (_) {}
    }
  }
);
