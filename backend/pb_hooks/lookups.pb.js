/// <reference path="../pb_data/types.d.ts" />

// Owner-managed custom reference collections.
//
// These routes let the shop owner create, list and delete real PocketBase
// collections at runtime (no developer needed). Each custom list is a normal
// `base` collection named `lk_<slug>` with a `name` + `description` field, so it
// can be CRUD-ed through the generic collection API and targeted by
// `relation`-type product attributes. A row is mirrored into the
// `lookup_collections` registry so the UI can enumerate + label them.
//
// Helpers are required *inside* each handler (JSVM handlers run isolated).

// GET /api/lookups -> [{ name, label }]  (any authenticated staff)
routerAdd(
  "GET",
  "/api/lookups",
  (c) => {
    const rows = $app
      .dao()
      .findRecordsByFilter("lookup_collections", "id != ''", "label", 200, 0);
    const out = rows.map((r) => ({
      name: r.get("name"),
      label: r.get("label"),
    }));
    return c.json(200, out);
  },
  $apis.requireRecordAuth()
);

// POST /api/lookups   body: { label }   (owner only)
// Creates a real `lk_<slug>` collection and registers it.
//
// IMPORTANT: changing the schema (saveCollection) inside a request makes
// PocketBase reload and *replay* this handler for the first schema mutation
// after boot. So every step below is idempotent: a genuine duplicate is one
// that already has a registry row; a half-finished replay (collection created
// but registry row not yet written) is completed rather than rejected.
routerAdd(
  "POST",
  "/api/lookups",
  (c) => {
    const { requireOwner } = require(`${__hooks}/utils.js`);
    const { data } = requireOwner(c);

    const label = String(data.label || "").trim();
    if (!label) throw new BadRequestError("A list name (label) is required.");

    const slug = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!slug)
      throw new BadRequestError(
        "List name must contain at least one letter or digit."
      );
    const name = "lk_" + slug;

    const findReg = () => {
      try {
        return $app
          .dao()
          .findFirstRecordByFilter("lookup_collections", "name = {:n}", { n: name });
      } catch (_) {
        return null;
      }
    };
    const collectionExists = () => {
      try {
        $app.dao().findCollectionByNameOrId(name);
        return true;
      } catch (_) {
        return false;
      }
    };

    // A registry row is the source of truth for "this list already exists".
    if (findReg())
      throw new BadRequestError(`A list named "${label}" already exists.`);

    // Create the real collection only if it isn't already there (replay-safe).
    if (!collectionExists()) {
      const AUTH = '@request.auth.id != ""';
      const OWNER = '@request.auth.role = "owner"';
      const col = new Collection({
        name: name,
        type: "base",
        listRule: AUTH,
        viewRule: AUTH,
        createRule: OWNER,
        updateRule: OWNER,
        deleteRule: OWNER,
        schema: [
          { name: "name", type: "text", required: true },
          { name: "description", type: "text" },
        ],
        indexes: [`CREATE UNIQUE INDEX idx_${name}_name ON ${name} (name)`],
      });
      $app.dao().saveCollection(col);
    }

    // Register it (idempotent — only if a row isn't present yet).
    if (!findReg()) {
      const reg = new Record(
        $app.dao().findCollectionByNameOrId("lookup_collections")
      );
      reg.set("name", name);
      reg.set("label", label);
      $app.dao().saveRecord(reg);
    }

    return c.json(200, { name: name, label: label });
  },
  $apis.requireRecordAuth()
);

// DELETE /api/lookups/:name   (owner only)
// Drops the custom collection and its registry row. Blocked if any attribute
// definition still targets it, to avoid dangling references.
routerAdd(
  "DELETE",
  "/api/lookups/:name",
  (c) => {
    const { requireOwner } = require(`${__hooks}/utils.js`);
    requireOwner(c);

    const name = c.pathParam("name");
    // safety: only ever delete our own lk_* collections, never a core one
    if (!name || name.indexOf("lk_") !== 0)
      throw new BadRequestError("Only custom lists can be deleted.");

    const findReg = () => {
      try {
        return $app
          .dao()
          .findFirstRecordByFilter("lookup_collections", "name = {:n}", { n: name });
      } catch (_) {
        return null;
      }
    };

    // Nothing registered and no collection -> already gone (replay-safe).
    let col = null;
    try {
      col = $app.dao().findCollectionByNameOrId(name);
    } catch (_) {
      col = null;
    }
    if (!col && !findReg())
      throw new BadRequestError("List not found.");

    const refs = $app
      .dao()
      .findRecordsByFilter(
        "attribute_definitions",
        "target_collection = {:n}",
        "",
        1,
        0,
        { n: name }
      );
    if (refs && refs.length > 0)
      throw new BadRequestError(
        "This list is used by a product attribute. Remove that attribute first."
      );

    // Drop the collection only if it still exists (deleteCollection mutates the
    // schema and may replay this handler — see the POST note above).
    if (col) $app.dao().deleteCollection(col);

    const reg = findReg();
    if (reg) $app.dao().deleteRecord(reg);

    return c.json(200, { name: name, deleted: true });
  },
  $apis.requireRecordAuth()
);
