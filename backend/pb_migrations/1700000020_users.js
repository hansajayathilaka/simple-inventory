/// <reference path="../pb_data/types.d.ts" />

// Extend the built-in `users` auth collection with shop-staff fields and lock
// down management to owners. A user can always read/refresh their own record
// via the auth endpoints regardless of these list/view rules.
migrate(
  (db) => {
    const dao = new Dao(db);
    const users = dao.findCollectionByNameOrId("users");

    // NOTE: the built-in users auth collection already ships with a `name`
    // (text) and `avatar` (file) field, so we only add role + active here.
    users.schema.addField(
      new SchemaField({
        name: "role",
        type: "select",
        required: true,
        options: { maxSelect: 1, values: ["owner", "cashier"] },
      })
    );
    users.schema.addField(
      new SchemaField({ name: "active", type: "bool" })
    );

    // Only owners manage staff accounts.
    const OWNER = '@request.auth.role = "owner"';
    users.listRule = OWNER;
    users.viewRule = OWNER;
    users.createRule = OWNER;
    users.updateRule = OWNER;
    users.deleteRule = OWNER;

    dao.saveCollection(users);
  },
  (db) => {
    const dao = new Dao(db);
    const users = dao.findCollectionByNameOrId("users");
    for (const f of ["role", "active"]) {
      const field = users.schema.getFieldByName(f);
      if (field) users.schema.removeField(field.id);
    }
    users.listRule = null;
    users.viewRule = null;
    users.createRule = null;
    users.updateRule = null;
    users.deleteRule = null;
    dao.saveCollection(users);
  }
);
