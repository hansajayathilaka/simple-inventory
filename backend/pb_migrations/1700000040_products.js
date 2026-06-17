/// <reference path="../pb_data/types.d.ts" />

// Products. Fixed fields cover the common retail attributes; the `attributes`
// JSON field holds the dynamic, owner-defined values keyed by attribute key
// (see attribute_definitions). Validation of `attributes` against the active
// definitions is enforced server-side in pb_hooks.
migrate(
  (db) => {
    const dao = new Dao(db);
    const AUTH = '@request.auth.id != ""';
    const OWNER = '@request.auth.role = "owner"';

    const categories = dao.findCollectionByNameOrId("categories");
    const uom = dao.findCollectionByNameOrId("uom");

    const c = new Collection({
      name: "products",
      type: "base",
      // Staff read products (POS needs them); owners maintain the catalog.
      listRule: AUTH,
      viewRule: AUTH,
      createRule: OWNER,
      updateRule: OWNER,
      deleteRule: OWNER,
      schema: [
        { name: "sku", type: "text", required: true },
        { name: "barcode", type: "text" },
        { name: "name", type: "text", required: true },
        { name: "description", type: "text" },
        {
          name: "category",
          type: "relation",
          options: {
            collectionId: categories.id,
            maxSelect: 1,
            cascadeDelete: false,
          },
        },
        {
          name: "base_uom",
          type: "relation",
          options: { collectionId: uom.id, maxSelect: 1, cascadeDelete: false },
        },
        { name: "cost_price", type: "number", options: { min: 0 } },
        { name: "sell_price", type: "number", required: true, options: { min: 0 } },
        { name: "tax_rate", type: "number", options: { min: 0, max: 100 } },
        {
          name: "image",
          type: "file",
          options: {
            maxSelect: 1,
            maxSize: 5242880,
            mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
          },
        },
        { name: "is_active", type: "bool" },
        // dynamic attribute values keyed by attribute_definitions.key
        { name: "attributes", type: "json", options: { maxSize: 2000000 } },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_products_sku ON products (sku)",
        "CREATE INDEX idx_products_barcode ON products (barcode)",
        "CREATE INDEX idx_products_name ON products (name)",
      ],
    });
    dao.saveCollection(c);
  },
  (db) => {
    const dao = new Dao(db);
    dao.deleteCollection(dao.findCollectionByNameOrId("products"));
  }
);
