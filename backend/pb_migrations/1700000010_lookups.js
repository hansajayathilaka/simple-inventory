/// <reference path="../pb_data/types.d.ts" />

// Lookup / reference collections. These are owner-managed and act as targets
// for `relation`-type product attributes (e.g. UOM, brand/make, ingredient)
// as well as for fixed product fields (category, base_uom) and suppliers.
//
// Access: any authenticated staff can read; only owners can write.
migrate(
  (db) => {
    const dao = new Dao(db);

    const AUTH = '@request.auth.id != ""';
    const OWNER = '@request.auth.role = "owner"';

    const ownerWritable = (extra) => ({
      type: "base",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: OWNER,
      updateRule: OWNER,
      deleteRule: OWNER,
      ...extra,
    });

    // --- categories (parent self-relation added after creation) ---
    const categories = new Collection(
      ownerWritable({
        name: "categories",
        schema: [
          { name: "name", type: "text", required: true },
          { name: "description", type: "text" },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_categories_name ON categories (name)",
        ],
      })
    );
    dao.saveCollection(categories);

    // add self-referential optional parent now that the id is known
    const cats = dao.findCollectionByNameOrId("categories");
    cats.schema.addField(
      new SchemaField({
        name: "parent",
        type: "relation",
        options: { collectionId: cats.id, maxSelect: 1, cascadeDelete: false },
      })
    );
    dao.saveCollection(cats);

    // --- units of measure ---
    const uom = new Collection(
      ownerWritable({
        name: "uom",
        schema: [
          { name: "name", type: "text", required: true },
          { name: "abbreviation", type: "text", required: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_uom_name ON uom (name)"],
      })
    );
    dao.saveCollection(uom);

    // --- brands (a.k.a. "make") ---
    const brands = new Collection(
      ownerWritable({
        name: "brands",
        schema: [
          { name: "name", type: "text", required: true },
          { name: "description", type: "text" },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_brands_name ON brands (name)"],
      })
    );
    dao.saveCollection(brands);

    // --- ingredients (example reference list) ---
    const ingredients = new Collection(
      ownerWritable({
        name: "ingredients",
        schema: [
          { name: "name", type: "text", required: true },
          { name: "description", type: "text" },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_ingredients_name ON ingredients (name)",
        ],
      })
    );
    dao.saveCollection(ingredients);

    // --- suppliers ---
    const suppliers = new Collection(
      ownerWritable({
        name: "suppliers",
        schema: [
          { name: "name", type: "text", required: true },
          { name: "contact_person", type: "text" },
          { name: "phone", type: "text" },
          { name: "email", type: "email" },
          { name: "address", type: "text" },
          { name: "notes", type: "text" },
          { name: "is_active", type: "bool" },
        ],
        indexes: ["CREATE INDEX idx_suppliers_name ON suppliers (name)"],
      })
    );
    dao.saveCollection(suppliers);
  },
  (db) => {
    const dao = new Dao(db);
    for (const name of [
      "suppliers",
      "ingredients",
      "brands",
      "uom",
      "categories",
    ]) {
      try {
        dao.deleteCollection(dao.findCollectionByNameOrId(name));
      } catch (_) {}
    }
  }
);
