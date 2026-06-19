/// <reference path="../pb_data/types.d.ts" />

// Record cash handling on invoices: how much the customer tendered and the
// change given back. Both optional (only meaningful for cash sales). Set by the
// checkout route so receipts — including reprints — can show them.
migrate(
  (db) => {
    const dao = new Dao(db);
    const c = dao.findCollectionByNameOrId("invoices");
    c.schema.addField(
      new SchemaField({ name: "amount_tendered", type: "number", options: { min: 0 } })
    );
    c.schema.addField(
      new SchemaField({ name: "change_given", type: "number", options: { min: 0 } })
    );
    dao.saveCollection(c);
  },
  (db) => {
    const dao = new Dao(db);
    const c = dao.findCollectionByNameOrId("invoices");
    for (const f of ["amount_tendered", "change_given"]) {
      const field = c.schema.getFieldByName(f);
      if (field) c.schema.removeField(field.id);
    }
    dao.saveCollection(c);
  }
);
