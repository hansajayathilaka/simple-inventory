/// <reference path="../pb_data/types.d.ts" />

// Attribute definitions power the dynamic, owner-defined product attributes.
// Each definition describes one attribute the owner wants on products. The
// `type` can be a primitive (text/number/boolean/date/select) or `relation`,
// in which case `target_collection` names a lookup collection (e.g. "uom",
// "brands", "ingredients") and the product stores the referenced record id(s).
migrate(
  (db) => {
    const dao = new Dao(db);
    const AUTH = '@request.auth.id != ""';
    const OWNER = '@request.auth.role = "owner"';

    const c = new Collection({
      name: "attribute_definitions",
      type: "base",
      // Staff read attributes (to render product forms); owners define them.
      listRule: AUTH,
      viewRule: AUTH,
      createRule: OWNER,
      updateRule: OWNER,
      deleteRule: OWNER,
      schema: [
        // machine key used inside products.attributes JSON, e.g. "make"
        { name: "key", type: "text", required: true },
        // human label shown in the UI, e.g. "Make"
        { name: "label", type: "text", required: true },
        {
          name: "type",
          type: "select",
          required: true,
          options: {
            maxSelect: 1,
            values: ["text", "number", "boolean", "date", "select", "relation"],
          },
        },
        // for type=select: the allowed option values
        { name: "options", type: "json", options: { maxSize: 2000000 } },
        // for type=relation: the target lookup collection name
        { name: "target_collection", type: "text" },
        { name: "is_required", type: "bool" },
        // allow multiple values (multi-select / multi-relation)
        { name: "is_multiple", type: "bool" },
        // which entity the attribute applies to (future-proof; default product)
        {
          name: "applies_to",
          type: "select",
          required: true,
          options: { maxSelect: 1, values: ["product"] },
        },
        { name: "sort_order", type: "number" },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_attrdef_key ON attribute_definitions (applies_to, key)",
      ],
    });
    dao.saveCollection(c);
  },
  (db) => {
    const dao = new Dao(db);
    dao.deleteCollection(dao.findCollectionByNameOrId("attribute_definitions"));
  }
);
