/// <reference path="../pb_data/types.d.ts" />

// Customers. Cashiers can read and create (quick-add at POS) and update;
// only owners can delete.
migrate(
  (db) => {
    const dao = new Dao(db);
    const AUTH = '@request.auth.id != ""';
    const OWNER = '@request.auth.role = "owner"';

    const c = new Collection({
      name: "customers",
      type: "base",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: AUTH,
      updateRule: AUTH,
      deleteRule: OWNER,
      schema: [
        { name: "name", type: "text", required: true },
        { name: "phone", type: "text" },
        { name: "email", type: "email" },
        { name: "address", type: "text" },
        { name: "notes", type: "text" },
        { name: "loyalty_points", type: "number", options: { min: 0 } },
      ],
      indexes: [
        "CREATE INDEX idx_customers_name ON customers (name)",
        "CREATE INDEX idx_customers_phone ON customers (phone)",
      ],
    });
    dao.saveCollection(c);
  },
  (db) => {
    const dao = new Dao(db);
    dao.deleteCollection(dao.findCollectionByNameOrId("customers"));
  }
);
