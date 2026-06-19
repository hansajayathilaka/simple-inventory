/// <reference path="../pb_data/types.d.ts" />

// Registry of owner-created reference collections ("custom lookups").
//
// The shop owner can, at runtime and without a developer, create brand-new
// reference lists (e.g. "Color", "Material"). Each such list is a *real*
// PocketBase collection named `lk_<slug>`, created by the owner-only routes in
// pb_hooks/lookups.pb.js. This collection just records which custom lists exist
// and their human-friendly label, so the UI can list them as CRUD tabs and
// offer them as targets for `relation`-type product attributes.
//
// Rows here are written only by the privileged hook routes (full dao access),
// so direct create/update/delete via the API is disabled; any authenticated
// staff may read it (the catalog + attribute screens need it).
migrate(
  (db) => {
    const dao = new Dao(db);
    const AUTH = '@request.auth.id != ""';

    const c = new Collection({
      name: "lookup_collections",
      type: "base",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      schema: [
        // the real collection name, e.g. "lk_color"
        { name: "name", type: "text", required: true },
        // human-friendly label shown in the UI, e.g. "Color"
        { name: "label", type: "text", required: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_lookup_collections_name ON lookup_collections (name)",
      ],
    });
    dao.saveCollection(c);
  },
  (db) => {
    const dao = new Dao(db);
    // Drop the registry. Note: the actual lk_* collections created at runtime
    // are user data and are left untouched by this down-migration.
    try {
      dao.deleteCollection(dao.findCollectionByNameOrId("lookup_collections"));
    } catch (_) {}
  }
);
