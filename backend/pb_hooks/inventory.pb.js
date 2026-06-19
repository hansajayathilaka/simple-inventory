/// <reference path="../pb_data/types.d.ts" />

// Owner-only inventory endpoints: direct restock, manual adjustment, and
// receiving a purchase order. All stock changes go through the shared
// applyMovement helper so inventory + ledger stay consistent. Helpers are
// required *inside* each handler (JSVM handlers run in isolated scope).

// POST /api/inventory/restock
// body: { product, qty, unit_cost?, supplier?, note? }
routerAdd(
  "POST",
  "/api/inventory/restock",
  (c) => {
    const { applyMovement, requireOwner } = require(`${__hooks}/utils.js`);
    const { auth, data } = requireOwner(c);
    const qty = Number(data.qty);
    if (!data.product || !(qty > 0))
      throw new BadRequestError("product and positive qty are required.");

    let out = null;
    $app.dao().runInTransaction((tx) => {
      const mv = applyMovement(tx, {
        product: data.product,
        type: "restock",
        qty: qty,
        unit_cost: data.unit_cost != null ? Number(data.unit_cost) : null,
        note: data.note || "",
        created_by: auth.id,
      });
      const inv = tx.findFirstRecordByFilter("inventory", "product = {:p}", {
        p: data.product,
      });
      out = { movement: mv.id, qty_on_hand: inv.getFloat("qty_on_hand") };
    });
    return c.json(200, out);
  },
  $apis.requireRecordAuth()
);

// POST /api/inventory/adjust
// body: { product, qty (signed), note }   // e.g. -2 for shrinkage
routerAdd(
  "POST",
  "/api/inventory/adjust",
  (c) => {
    const { applyMovement, requireOwner } = require(`${__hooks}/utils.js`);
    const { auth, data } = requireOwner(c);
    const qty = Number(data.qty);
    if (!data.product || !Number.isFinite(qty) || qty === 0)
      throw new BadRequestError("product and non-zero qty are required.");
    if (!data.note) throw new BadRequestError("A reason note is required.");

    let out = null;
    $app.dao().runInTransaction((tx) => {
      const mv = applyMovement(tx, {
        product: data.product,
        type: "adjustment",
        qty: qty,
        note: data.note,
        created_by: auth.id,
      });
      const inv = tx.findFirstRecordByFilter("inventory", "product = {:p}", {
        p: data.product,
      });
      out = { movement: mv.id, qty_on_hand: inv.getFloat("qty_on_hand") };
    });
    return c.json(200, out);
  },
  $apis.requireRecordAuth()
);

// POST /api/inventory/reorder-level
// body: { product, reorder_level }   // sets the low-stock threshold (no movement)
routerAdd(
  "POST",
  "/api/inventory/reorder-level",
  (c) => {
    const { requireOwner } = require(`${__hooks}/utils.js`);
    const { data } = requireOwner(c);
    const level = Number(data.reorder_level);
    if (!data.product || !Number.isFinite(level) || level < 0)
      throw new BadRequestError("product and a non-negative reorder_level are required.");

    let out = null;
    $app.dao().runInTransaction((tx) => {
      let inv = null;
      try {
        inv = tx.findFirstRecordByFilter("inventory", "product = {:p}", {
          p: data.product,
        });
      } catch (_) {
        inv = null;
      }
      if (!inv) {
        inv = new Record(tx.findCollectionByNameOrId("inventory"));
        inv.set("product", data.product);
        inv.set("qty_on_hand", 0);
      }
      inv.set("reorder_level", level);
      tx.saveRecord(inv);
      out = { product: data.product, reorder_level: inv.getFloat("reorder_level") };
    });
    return c.json(200, out);
  },
  $apis.requireRecordAuth()
);

// POST /api/purchasing/receive/:id  -> receive a draft purchase order
// Creates purchase movements for every line and marks the PO as received.
routerAdd(
  "POST",
  "/api/purchasing/receive/:id",
  (c) => {
    const { applyMovement, requireOwner } = require(`${__hooks}/utils.js`);
    const { auth } = requireOwner(c);
    const poId = c.pathParam("id");

    let out = null;
    $app.dao().runInTransaction((tx) => {
      const po = tx.findRecordById("purchase_orders", poId);
      if (po.get("status") === "received")
        throw new BadRequestError("Purchase order already received.");

      const items = tx.findRecordsByFilter(
        "purchase_order_items",
        "purchase_order = {:id}",
        "",
        0,
        0,
        { id: poId }
      );
      if (items.length === 0)
        throw new BadRequestError("Purchase order has no items.");

      let total = 0;
      for (const it of items) {
        const qty = it.getFloat("qty");
        const cost = it.getFloat("unit_cost");
        total += qty * cost;
        applyMovement(tx, {
          product: it.get("product"),
          type: "purchase",
          qty: qty,
          unit_cost: cost,
          reference: po.id,
          created_by: auth.id,
        });
      }

      po.set("status", "received");
      po.set("total_cost", Math.round(total * 100) / 100);
      po.set("received_at", new Date().toISOString());
      tx.saveRecord(po);
      out = { id: po.id, status: "received", total_cost: po.getFloat("total_cost") };
    });
    return c.json(200, out);
  },
  $apis.requireRecordAuth()
);
