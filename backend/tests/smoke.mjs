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

  const invoice2 = await api("GET", `/api/collections/invoices/records/${checkout.data.id}`, null, ot);
  assert(invoice2.data.status === "partially_returned", "invoice status becomes partially_returned");

  console.log(`\nAll ${passed} assertions passed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
