// End-to-end backend smoke test. Exercises the full business flow against a
// running PocketBase server (with the bootstrap migration applied, so the
// default admin + owner already exist).
//
// Usage: PB_URL=http://127.0.0.1:8090 node backend/tests/smoke.mjs
// Exits non-zero on the first failed assertion.

const BASE = process.env.PB_URL || "http://127.0.0.1:8090";
let passed = 0;

function assert(cond, label) {
  if (cond) {
    passed++;
    console.log("✓", label);
  } else {
    console.error("✗", label);
    process.exit(1);
  }
}

async function api(method, path, body, token) {
  const r = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { ok: r.ok, status: r.status, data };
}

async function main() {
  // bootstrap admin + owner
  const admin = await api("POST", "/api/admins/auth-with-password", {
    identity: "admin@shop.local",
    password: "admin12345",
  });
  assert(admin.ok, "admin (bootstrap) authenticates");
  const at = admin.data.token;

  const ownerAuth = await api("POST", "/api/collections/users/auth-with-password", {
    identity: "owner@shop.local",
    password: "owner12345",
  });
  assert(ownerAuth.ok && ownerAuth.data.record.role === "owner", "owner authenticates with owner role");
  const ot = ownerAuth.data.token;

  // create a cashier via admin
  const cashier = await api(
    "POST",
    "/api/collections/users/records",
    {
      email: "smoke-cashier@shop.local",
      password: "cash12345",
      passwordConfirm: "cash12345",
      name: "Smoke Cashier",
      role: "cashier",
      active: true,
      emailVisibility: true,
    },
    at
  );
  assert(cashier.ok, "owner/admin creates a cashier");
  const cashierAuth = await api("POST", "/api/collections/users/auth-with-password", {
    identity: "smoke-cashier@shop.local",
    password: "cash12345",
  });
  const ct = cashierAuth.data.token;

  // lookups + attribute definition (relation -> brands)
  const uom = await api("POST", "/api/collections/uom/records", { name: "Each", abbreviation: "ea" }, ot);
  const brand = await api("POST", "/api/collections/brands/records", { name: "SmokeBrand" }, ot);
  assert(uom.ok && brand.ok, "owner creates lookups (uom, brand)");

  const attr = await api(
    "POST",
    "/api/collections/attribute_definitions/records",
    { key: "make", label: "Make", type: "relation", target_collection: "brands", is_required: true, applies_to: "product" },
    ot
  );
  assert(attr.ok, "owner creates a required relation attribute (make -> brands)");

  // product with the required attribute
  const product = await api(
    "POST",
    "/api/collections/products/records",
    { sku: "SMOKE-1", name: "Smoke Widget", sell_price: 100, tax_rate: 10, base_uom: uom.data.id, is_active: true, attributes: { make: brand.data.id } },
    ot
  );
  assert(product.ok, "owner creates a product with the required attribute");

  const missing = await api(
    "POST",
    "/api/collections/products/records",
    { sku: "SMOKE-2", name: "No Make", sell_price: 50, attributes: {} },
    ot
  );
  assert(!missing.ok, "product missing required attribute is rejected");

  const cashierProduct = await api(
    "POST",
    "/api/collections/products/records",
    { sku: "SMOKE-3", name: "X", sell_price: 1 },
    ct
  );
  assert(!cashierProduct.ok, "cashier is blocked from creating products");

  // restock (owner) then verify cashier cannot
  const restock = await api("POST", "/api/inventory/restock", { product: product.data.id, qty: 50, unit_cost: 60 }, ot);
  assert(restock.ok && restock.data.qty_on_hand === 50, "owner restock sets qty_on_hand to 50");

  // restock opens a stock lot carrying its own cost + selling price
  const lots1 = await api("GET", `/api/collections/stock_batches/records?filter=(product='${product.data.id}')`, null, ot);
  assert(
    lots1.data.items.length === 1 &&
      lots1.data.items[0].qty_remaining === 50 &&
      lots1.data.items[0].unit_cost === 60 &&
      lots1.data.items[0].sell_price === 100,
    "restock opens a lot (qty 50, cost 60, sell price defaults to product price 100)"
  );
  const cashierRestock = await api("POST", "/api/inventory/restock", { product: product.data.id, qty: 5 }, ct);
  assert(!cashierRestock.ok, "cashier is blocked from restock");

  // checkout (cashier): qty 3, line discount 10, 10% tax -> 319
  const checkout = await api(
    "POST",
    "/api/pos/checkout",
    { items: [{ product: product.data.id, qty: 3, unit_price: 100, discount: 10 }], payment_method: "cash" },
    ct
  );
  assert(checkout.ok && checkout.data.grand_total === 319, "checkout computes grand_total 319");
  assert(/^INV-\d{6}$/.test(checkout.data.number), "checkout assigns a sequential invoice number");

  const invAfterSale = await api("GET", `/api/collections/inventory/records?filter=(product='${product.data.id}')`, null, ot);
  assert(invAfterSale.data.items[0].qty_on_hand === 47, "inventory decremented to 47 after sale");

  // the sale drew 3 units from the lot (FIFO) and captured their cost (3 * 60)
  const lotsAfterSale = await api("GET", `/api/collections/stock_batches/records?filter=(product='${product.data.id}')`, null, ot);
  assert(lotsAfterSale.data.items[0].qty_remaining === 47, "lot drawn down to 47 remaining after sale");
  const soldItems = await api("GET", `/api/collections/invoice_items/records?filter=(invoice='${checkout.data.id}')`, null, ot);
  assert(soldItems.data.items[0].cost_total === 180, "invoice line captures FIFO cost_total of 180 (3 * 60)");

  // --- FIFO across lots at different cost AND selling price ---
  // Two lots for a fresh product, then a sale spanning both lots.
  const fifoProd = await api(
    "POST",
    "/api/collections/products/records",
    { sku: "SMOKE-FIFO", name: "FIFO Widget", sell_price: 99, base_uom: uom.data.id, is_active: true, attributes: { make: brand.data.id } },
    ot
  );
  await api("POST", "/api/inventory/restock", { product: fifoProd.data.id, qty: 5, unit_cost: 10, sell_price: 20 }, ot);
  await api("POST", "/api/inventory/restock", { product: fifoProd.data.id, qty: 5, unit_cost: 15, sell_price: 25 }, ot);
  // sell 7 with NO unit_price -> price comes from the oldest open lot (20)
  const fifoSale = await api(
    "POST",
    "/api/pos/checkout",
    { items: [{ product: fifoProd.data.id, qty: 7 }], payment_method: "cash" },
    ct
  );
  assert(fifoSale.ok && fifoSale.data.grand_total === 140, "checkout uses oldest lot's sell price (7 * 20 = 140)");
  const fifoItems = await api("GET", `/api/collections/invoice_items/records?filter=(invoice='${fifoSale.data.id}')`, null, ot);
  assert(fifoItems.data.items[0].cost_total === 80, "FIFO cost spans lots: 5*10 + 2*15 = 80");
  const fifoLots = await api("GET", `/api/collections/stock_batches/records?filter=(product='${fifoProd.data.id}')&sort=received_at`, null, ot);
  assert(
    fifoLots.data.items[0].qty_remaining === 0 && fifoLots.data.items[1].qty_remaining === 3,
    "oldest lot fully drawn (0), newer lot drawn to 3"
  );

  // return 1 unit
  const items = await api("GET", `/api/collections/invoice_items/records?filter=(invoice='${checkout.data.id}')`, null, ct);
  const ret = await api(
    "POST",
    "/api/pos/return",
    { invoice: checkout.data.id, reason: "damaged", items: [{ invoice_item: items.data.items[0].id, qty: 1 }] },
    ct
  );
  assert(ret.ok && ret.data.refund_total > 0, "return is processed with a refund");

  const invAfterReturn = await api("GET", `/api/collections/inventory/records?filter=(product='${product.data.id}')`, null, ot);
  assert(invAfterReturn.data.items[0].qty_on_hand === 48, "inventory restocked to 48 after return");

  // the return opens a new lot for the goods coming back into stock
  const lotsAfterReturn = await api("GET", `/api/collections/stock_batches/records?filter=(product='${product.data.id}' %26%26 source_type='return')`, null, ot);
  assert(
    lotsAfterReturn.data.items.length === 1 &&
      lotsAfterReturn.data.items[0].qty_remaining === 1 &&
      lotsAfterReturn.data.items[0].unit_cost === 60,
    "return opens a lot (qty 1) priced at the original FIFO cost (60)"
  );

  const invoice2 = await api("GET", `/api/collections/invoices/records/${checkout.data.id}`, null, ot);
  assert(invoice2.data.status === "partially_returned", "invoice status becomes partially_returned");

  // custom lookups: owner creates a real reference collection at runtime,
  // CRUDs it, and uses it as a relation-attribute target.
  const cashierList = await api("POST", "/api/lookups", { label: "Color" }, ct);
  assert(!cashierList.ok, "cashier is blocked from creating a custom list");

  const newList = await api("POST", "/api/lookups", { label: "Color" }, ot);
  assert(
    newList.ok && newList.data.name === "lk_color",
    "owner creates a custom list (Color -> lk_color)"
  );

  const listed = await api("GET", "/api/lookups", null, ct);
  assert(
    listed.ok && listed.data.some((l) => l.name === "lk_color"),
    "custom list appears in GET /api/lookups"
  );

  const colorItem = await api(
    "POST",
    "/api/collections/lk_color/records",
    { name: "Red" },
    ot
  );
  assert(colorItem.ok, "owner CRUDs items in the custom collection");

  const colorAttr = await api(
    "POST",
    "/api/collections/attribute_definitions/records",
    { key: "color", label: "Color", type: "relation", target_collection: "lk_color", applies_to: "product" },
    ot
  );
  assert(colorAttr.ok, "relation attribute can target the custom collection");

  const coloredProduct = await api(
    "POST",
    "/api/collections/products/records",
    { sku: "SMOKE-COLOR", name: "Colored Widget", sell_price: 10, attributes: { make: brand.data.id, color: colorItem.data.id } },
    ot
  );
  assert(coloredProduct.ok, "product referencing a custom-list item validates");

  const dupList = await api("POST", "/api/lookups", { label: "Color" }, ot);
  assert(!dupList.ok, "duplicate custom list is rejected");

  const delInUse = await api("DELETE", "/api/lookups/lk_color", null, ot);
  assert(!delInUse.ok, "custom list in use by an attribute cannot be deleted");

  // an unused custom list can be created and deleted cleanly
  const tempList = await api("POST", "/api/lookups", { label: "Material" }, ot);
  assert(tempList.ok, "owner creates a second custom list (Material)");
  const cashierDel = await api("DELETE", "/api/lookups/lk_material", null, ct);
  assert(!cashierDel.ok, "cashier is blocked from deleting a custom list");
  const delUnused = await api("DELETE", "/api/lookups/lk_material", null, ot);
  assert(delUnused.ok, "owner deletes an unused custom list");
  const goneList = await api("GET", "/api/lookups", null, ot);
  assert(
    !goneList.data.some((l) => l.name === "lk_material"),
    "deleted list no longer appears in GET /api/lookups"
  );

  // app_settings: seeded singleton, owner-editable
  const settings = await api("GET", "/api/collections/app_settings/records", null, ot);
  assert(settings.ok && settings.data.items.length === 1, "app_settings has a seeded singleton row");
  const settingsId = settings.data.items[0].id;
  const updSettings = await api(
    "PATCH",
    `/api/collections/app_settings/records/${settingsId}`,
    { company_name: "Smoke Shop" },
    ot
  );
  assert(updSettings.ok && updSettings.data.company_name === "Smoke Shop", "owner can update app_settings");
  const cashierSettings = await api(
    "PATCH",
    `/api/collections/app_settings/records/${settingsId}`,
    { company_name: "Hacked" },
    ct
  );
  assert(!cashierSettings.ok, "cashier cannot update app_settings");

  console.log(`\nAll ${passed} assertions passed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
