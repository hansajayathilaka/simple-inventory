/// <reference path="../pb_data/types.d.ts" />

// A purchase order is only mutable while it is a draft. Once received it has
// produced stock movements + lots, so editing or deleting it (or its items)
// would desync inventory. These guards enforce that server-side, regardless of
// client. The receive route in inventory.pb.js uses the superuser dao and
// bypasses these request hooks.
//
// NOTE: JSVM runs each handler in an isolated scope, so handlers cannot see
// functions declared at module top level — each guard is self-contained.

onRecordBeforeUpdateRequest((e) => {
  if (e.record.originalCopy().get("status") === "received")
    throw new BadRequestError("A received purchase order cannot be edited.");
}, "purchase_orders");

onRecordBeforeDeleteRequest((e) => {
  if (e.record.get("status") === "received")
    throw new BadRequestError("A received purchase order cannot be deleted.");
}, "purchase_orders");

onRecordBeforeCreateRequest((e) => {
  let received = false;
  try {
    received =
      $app
        .dao()
        .findRecordById("purchase_orders", e.record.get("purchase_order"))
        .get("status") === "received";
  } catch (_) {
    received = false;
  }
  if (received)
    throw new BadRequestError(
      "Items of a received purchase order cannot be changed."
    );
}, "purchase_order_items");

onRecordBeforeUpdateRequest((e) => {
  let received = false;
  try {
    received =
      $app
        .dao()
        .findRecordById("purchase_orders", e.record.get("purchase_order"))
        .get("status") === "received";
  } catch (_) {
    received = false;
  }
  if (received)
    throw new BadRequestError(
      "Items of a received purchase order cannot be changed."
    );
}, "purchase_order_items");

onRecordBeforeDeleteRequest((e) => {
  let received = false;
  try {
    received =
      $app
        .dao()
        .findRecordById("purchase_orders", e.record.get("purchase_order"))
        .get("status") === "received";
  } catch (_) {
    received = false;
  }
  if (received)
    throw new BadRequestError(
      "Items of a received purchase order cannot be changed."
    );
}, "purchase_order_items");
