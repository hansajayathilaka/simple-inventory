// Idempotent full-stack seed script. Builds a realistic hardware-store dataset:
// users, lookups (UOM/categories/brands), suppliers, customers, a hardware
// product catalogue, stock (FIFO lots via restock + a received purchase order),
// reorder levels, sample sales (invoices), and a return.
//
// Re-running is safe: lookups/products are keyed by a unique field; the
// transactional demo data (stock lots, purchase orders, invoices) is only
// created when the relevant collection is still empty, so reruns don't pile up.
// Set SEED_DEMO=0 to seed only users + catalogue (skip stock/PO/sales).
//
// Usage:
//   node backend/seed/seed.mjs
// Env (with defaults):
//   PB_URL=http://127.0.0.1:8090
//   PB_ADMIN_EMAIL=admin@shop.local   PB_ADMIN_PASSWORD=admin12345
//   SEED_OWNER_EMAIL=owner@shop.local SEED_OWNER_PASSWORD=owner12345
//   SEED_CASHIER_EMAIL=cashier@shop.local SEED_CASHIER_PASSWORD=cashier12345
//   SEED_DEMO=1

const BASE = process.env.PB_URL || "http://127.0.0.1:8090";
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || "admin@shop.local";
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || "admin12345";
const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL || "owner@shop.local";
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD || "owner12345";
const CASHIER_EMAIL = process.env.SEED_CASHIER_EMAIL || "cashier@shop.local";
const CASHIER_PASSWORD = process.env.SEED_CASHIER_PASSWORD || "cashier12345";
const SEED_DEMO = process.env.SEED_DEMO !== "0";

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

async function authPassword(collectionPath, identity, password) {
  const res = await api("POST", collectionPath, { identity, password });
  return res.ok ? res.data.token : null;
}

async function ensureUser(token, { email, password, name, role }) {
  const res = await api(
    "POST",
    "/api/collections/users/records",
    {
      email,
      password,
      passwordConfirm: password,
      name,
      role,
      active: true,
      emailVisibility: true,
    },
    token
  );
  if (res.ok) console.log(`  created ${role}: ${email}`);
  else if (JSON.stringify(res.data).includes("already in use"))
    console.log(`  ${role} already exists: ${email}`);
  else throw new Error(`Failed to create ${email}: ${JSON.stringify(res.data)}`);
}

// Create a record if no row matches record[unique]; returns the record id either
// way so it can be referenced by relations.
async function ensureRecord(token, collection, unique, record) {
  const filter = encodeURIComponent(`${unique}='${record[unique]}'`);
  const found = await api(
    "GET",
    `/api/collections/${collection}/records?filter=(${filter})`,
    null,
    token
  );
  if (found.ok && found.data.items && found.data.items.length > 0) {
    console.log(`  ${collection} already has: ${record[unique]}`);
    return found.data.items[0].id;
  }
  const res = await api("POST", `/api/collections/${collection}/records`, record, token);
  if (res.ok) {
    console.log(`  created ${collection}: ${record[unique]}`);
    return res.data.id;
  }
  throw new Error(`Failed ${collection}: ${JSON.stringify(res.data)}`);
}

async function count(token, collection, filter) {
  const q = filter ? `?filter=(${encodeURIComponent(filter)})&perPage=1` : "?perPage=1";
  const res = await api("GET", `/api/collections/${collection}/records${q}`, null, token);
  return res.ok ? res.data.totalItems : 0;
}

async function main() {
  console.log(`Seeding ${BASE} ...`);
  const adminToken = await authPassword("/api/admins/auth-with-password", ADMIN_EMAIL, ADMIN_PASSWORD);
  if (!adminToken) {
    console.error(
      `Admin auth failed. Create one first:\n` +
        `  ./backend/pocketbase admin create ${ADMIN_EMAIL} ${ADMIN_PASSWORD}`
    );
    process.exit(1);
  }

  // --- Users ---
  console.log("Users:");
  await ensureUser(adminToken, { email: OWNER_EMAIL, password: OWNER_PASSWORD, name: "Shop Owner", role: "owner" });
  await ensureUser(adminToken, { email: CASHIER_EMAIL, password: CASHIER_PASSWORD, name: "Cashier", role: "cashier" });

  const ownerToken = await authPassword("/api/collections/users/auth-with-password", OWNER_EMAIL, OWNER_PASSWORD);
  const cashierToken = await authPassword("/api/collections/users/auth-with-password", CASHIER_EMAIL, CASHIER_PASSWORD);
  if (!ownerToken) throw new Error("Owner auth failed after seeding owner user.");

  // --- Lookups (units, categories, brands) ---
  console.log("Units of measure:");
  const uom = {};
  for (const u of [
    { name: "Pieces", abbreviation: "pcs" },
    { name: "Box", abbreviation: "box" },
    { name: "Metre", abbreviation: "m" },
    { name: "Kilogram", abbreviation: "kg" },
    { name: "Litre", abbreviation: "L" },
    { name: "Pair", abbreviation: "pr" },
  ]) {
    uom[u.name] = await ensureRecord(ownerToken, "uom", "name", u);
  }

  console.log("Categories:");
  const cat = {};
  for (const name of [
    "Fasteners",
    "Hand Tools",
    "Power Tools",
    "Plumbing",
    "Electrical",
    "Paint & Finishes",
    "Adhesives & Sealants",
  ]) {
    cat[name] = await ensureRecord(ownerToken, "categories", "name", { name });
  }

  console.log("Brands:");
  for (const name of ["Generic", "Stanley", "Bosch", "Makita", "DeWalt", "3M"]) {
    await ensureRecord(ownerToken, "brands", "name", { name });
  }

  // --- Suppliers ---
  console.log("Suppliers:");
  const sup = {};
  for (const s of [
    { name: "BuildMart Distributors", contact_person: "Nimal Perera", phone: "0112-345678", email: "sales@buildmart.lk", is_active: true },
    { name: "ToolPro Supplies", contact_person: "Sunil Fernando", phone: "0114-998877", email: "orders@toolpro.lk", is_active: true },
    { name: "PlumbLine Trading", contact_person: "Ravi Kumar", phone: "0117-223344", email: "info@plumbline.lk", is_active: true },
  ]) {
    sup[s.name] = await ensureRecord(ownerToken, "suppliers", "name", s);
  }

  // --- Customers ---
  console.log("Customers:");
  for (const cst of [
    { name: "John Carpenter", phone: "0771-234567", email: "john@example.com", loyalty_points: 0 },
    { name: "Acme Construction", phone: "0112-555000", email: "accounts@acme.lk", address: "12 Industrial Rd, Colombo", loyalty_points: 0 },
    { name: "Mary Silva", phone: "0769-887766", loyalty_points: 0 },
  ]) {
    await ensureRecord(ownerToken, "customers", "name", cst);
  }

  // --- Products (hardware catalogue) ---
  console.log("Products:");
  const products = [
    { sku: "FST-HB-M8x50", barcode: "4001000000017", name: "Hex Bolt M8 x 50mm", category: cat["Fasteners"], base_uom: uom["Pieces"], cost_price: 0.15, sell_price: 0.4, tax_rate: 15 },
    { sku: "FST-WS-4x40", barcode: "4001000000024", name: "Wood Screw 4 x 40mm (Box 100)", category: cat["Fasteners"], base_uom: uom["Box"], cost_price: 2.5, sell_price: 5.0, tax_rate: 15 },
    { sku: "FST-WP-8", barcode: "4001000000031", name: "Wall Plug 8mm (Pack 50)", category: cat["Fasteners"], base_uom: uom["Box"], cost_price: 1.2, sell_price: 2.75, tax_rate: 15 },
    { sku: "HT-HAM-16", barcode: "4002000000014", name: "Claw Hammer 16oz", category: cat["Hand Tools"], base_uom: uom["Pieces"], cost_price: 4.5, sell_price: 9.5, tax_rate: 15 },
    { sku: "HT-SD-6PC", barcode: "4002000000021", name: "Screwdriver Set 6pc", category: cat["Hand Tools"], base_uom: uom["Pieces"], cost_price: 3.8, sell_price: 8.0, tax_rate: 15 },
    { sku: "HT-TAPE-5M", barcode: "4002000000038", name: "Measuring Tape 5m", category: cat["Hand Tools"], base_uom: uom["Pieces"], cost_price: 2.0, sell_price: 4.5, tax_rate: 15 },
    { sku: "PT-DRL-18V", barcode: "4003000000011", name: "Cordless Drill 18V", category: cat["Power Tools"], base_uom: uom["Pieces"], cost_price: 45.0, sell_price: 89.0, tax_rate: 15 },
    { sku: "PT-GRD-750", barcode: "4003000000028", name: "Angle Grinder 750W", category: cat["Power Tools"], base_uom: uom["Pieces"], cost_price: 28.0, sell_price: 55.0, tax_rate: 15 },
    { sku: "PL-PVC-1IN", barcode: "4004000000018", name: 'PVC Pipe 1" x 3m', category: cat["Plumbing"], base_uom: uom["Pieces"], cost_price: 3.2, sell_price: 6.5, tax_rate: 15 },
    { sku: "PL-VLV-12", barcode: "4004000000025", name: 'Ball Valve 1/2"', category: cat["Plumbing"], base_uom: uom["Pieces"], cost_price: 2.4, sell_price: 5.5, tax_rate: 15 },
    { sku: "PL-PTFE", barcode: "4004000000032", name: "PTFE Thread Tape", category: cat["Plumbing"], base_uom: uom["Pieces"], cost_price: 0.3, sell_price: 0.9, tax_rate: 15 },
    { sku: "EL-WIRE-25", barcode: "4005000000015", name: "Copper Wire 2.5mm (per m)", category: cat["Electrical"], base_uom: uom["Metre"], cost_price: 0.45, sell_price: 0.95, tax_rate: 15 },
    { sku: "EL-SCK-13A", barcode: "4005000000022", name: "Wall Socket 13A", category: cat["Electrical"], base_uom: uom["Pieces"], cost_price: 1.8, sell_price: 4.0, tax_rate: 15 },
    { sku: "EL-LED-9W", barcode: "4005000000039", name: "LED Bulb 9W", category: cat["Electrical"], base_uom: uom["Pieces"], cost_price: 1.1, sell_price: 2.8, tax_rate: 15 },
    { sku: "PN-EML-4L", barcode: "4006000000012", name: "Emulsion Paint White 4L", category: cat["Paint & Finishes"], base_uom: uom["Litre"], cost_price: 9.0, sell_price: 17.5, tax_rate: 15 },
    { sku: "PN-BRSH-2IN", barcode: "4006000000029", name: 'Paint Brush 2"', category: cat["Paint & Finishes"], base_uom: uom["Pieces"], cost_price: 0.9, sell_price: 2.2, tax_rate: 15 },
    { sku: "AD-SG-20G", barcode: "4007000000019", name: "Super Glue 20g", category: cat["Adhesives & Sealants"], base_uom: uom["Pieces"], cost_price: 0.6, sell_price: 1.75, tax_rate: 15 },
    { sku: "AD-MSK-24", barcode: "4007000000026", name: "Masking Tape 24mm", category: cat["Adhesives & Sealants"], base_uom: uom["Pieces"], cost_price: 0.5, sell_price: 1.4, tax_rate: 15 },
  ];
  const prodId = {};
  for (const p of products) {
    prodId[p.sku] = await ensureRecord(ownerToken, "products", "sku", { ...p, is_active: true });
  }

  if (!SEED_DEMO) {
    console.log("SEED_DEMO=0 -> skipping stock/purchasing/sales demo data.");
    console.log("Seed complete.");
    return;
  }

  // --- Stock lots (Phase 1: per-batch pricing via restock) ---
  // Skip products that already carry lots, so reruns stay idempotent.
  console.log("Stock (restock -> opens FIFO lots):");
  const initialStock = {
    "FST-HB-M8x50": [{ qty: 1000, cost: 0.15 }],
    "FST-WS-4x40": [{ qty: 80, cost: 2.5 }],
    "FST-WP-8": [{ qty: 120, cost: 1.2 }],
    "HT-HAM-16": [{ qty: 40, cost: 4.5 }],
    "HT-SD-6PC": [{ qty: 30, cost: 3.8 }],
    "HT-TAPE-5M": [{ qty: 60, cost: 2.0 }],
    // two lots at different cost + selling price -> demonstrates FIFO + per-lot pricing
    "PT-DRL-18V": [
      { qty: 10, cost: 45.0, sell_price: 89.0 },
      { qty: 8, cost: 48.0, sell_price: 95.0 },
    ],
    "PT-GRD-750": [{ qty: 12, cost: 28.0 }],
    "PL-PVC-1IN": [{ qty: 90, cost: 3.2 }],
    "PL-VLV-12": [{ qty: 150, cost: 2.4 }],
    "PL-PTFE": [{ qty: 300, cost: 0.3 }],
    "EL-WIRE-25": [{ qty: 500, cost: 0.45 }],
    "EL-SCK-13A": [{ qty: 200, cost: 1.8 }],
    "EL-LED-9W": [{ qty: 250, cost: 1.1 }],
    "PN-EML-4L": [{ qty: 35, cost: 9.0 }],
    "PN-BRSH-2IN": [{ qty: 80, cost: 0.9 }],
    "AD-SG-20G": [{ qty: 140, cost: 0.6 }],
    "AD-MSK-24": [{ qty: 160, cost: 0.5 }],
  };
  for (const [sku, lots] of Object.entries(initialStock)) {
    const id = prodId[sku];
    const existing = await count(ownerToken, "stock_batches", `product='${id}'`);
    if (existing > 0) {
      console.log(`  ${sku} already has lots`);
      continue;
    }
    for (const lot of lots) {
      const res = await api(
        "POST",
        "/api/inventory/restock",
        { product: id, qty: lot.qty, unit_cost: lot.cost, sell_price: lot.sell_price },
        ownerToken
      );
      if (!res.ok) throw new Error(`restock ${sku}: ${JSON.stringify(res.data)}`);
    }
    console.log(`  stocked ${sku} (${lots.length} lot(s))`);
  }

  // --- Reorder levels (drives the low-stock report) ---
  console.log("Reorder levels:");
  const reorder = { "HT-HAM-16": 10, "HT-SD-6PC": 10, "PT-DRL-18V": 5, "PT-GRD-750": 5, "PN-EML-4L": 12 };
  for (const [sku, level] of Object.entries(reorder)) {
    const res = await api("POST", "/api/inventory/reorder-level", { product: prodId[sku], reorder_level: level }, ownerToken);
    if (res.ok) console.log(`  ${sku} reorder=${level}`);
  }

  // --- Purchasing: a received PO (adds purchase lots) + a draft PO ---
  if ((await count(ownerToken, "purchase_orders")) === 0) {
    console.log("Purchasing:");
    // received PO from BuildMart -> new fastener lots
    const po1 = await api(
      "POST",
      "/api/collections/purchase_orders/records",
      { reference: "PO-SEED-001", supplier: sup["BuildMart Distributors"], status: "draft", note: "Initial fastener top-up" },
      ownerToken
    );
    if (!po1.ok) throw new Error(`PO create: ${JSON.stringify(po1.data)}`);
    const po1Items = [
      { product: prodId["FST-HB-M8x50"], qty: 500, unit_cost: 0.16 },
      { product: prodId["FST-WS-4x40"], qty: 50, unit_cost: 2.6 },
    ];
    for (const it of po1Items) {
      const r = await api(
        "POST",
        "/api/collections/purchase_order_items/records",
        { purchase_order: po1.data.id, ...it, line_total: Math.round(it.qty * it.unit_cost * 100) / 100 },
        ownerToken
      );
      if (!r.ok) throw new Error(`PO item: ${JSON.stringify(r.data)}`);
    }
    const recv = await api("POST", `/api/purchasing/receive/${po1.data.id}`, {}, ownerToken);
    if (!recv.ok) throw new Error(`PO receive: ${JSON.stringify(recv.data)}`);
    console.log("  received PO-SEED-001 (BuildMart) -> purchase lots created");

    // a draft PO left open for the UI to show
    const po2 = await api(
      "POST",
      "/api/collections/purchase_orders/records",
      { reference: "PO-SEED-002", supplier: sup["ToolPro Supplies"], status: "draft", note: "Power tool restock (pending)" },
      ownerToken
    );
    if (po2.ok) {
      await api(
        "POST",
        "/api/collections/purchase_order_items/records",
        { purchase_order: po2.data.id, product: prodId["PT-DRL-18V"], qty: 5, unit_cost: 47.0, line_total: 235.0 },
        ownerToken
      );
      console.log("  created draft PO-SEED-002 (ToolPro)");
    }
  } else {
    console.log("Purchasing: purchase orders already exist, skipping.");
  }

  // --- Sample sales (invoices) + a return ---
  if (cashierToken && (await count(cashierToken, "invoices")) === 0) {
    console.log("Sales:");
    const sales = [
      { items: [{ product: prodId["HT-HAM-16"], qty: 1 }, { product: prodId["FST-WS-4x40"], qty: 2 }], payment_method: "cash" },
      // drill sold without a price -> uses oldest lot's sell price (89.00)
      { items: [{ product: prodId["PT-DRL-18V"], qty: 1 }, { product: prodId["EL-LED-9W"], qty: 4 }], payment_method: "card" },
      { items: [{ product: prodId["PL-PVC-1IN"], qty: 3 }, { product: prodId["PL-PTFE"], qty: 2 }, { product: prodId["PL-VLV-12"], qty: 2 }], payment_method: "cash" },
      { items: [{ product: prodId["PN-EML-4L"], qty: 2 }, { product: prodId["PN-BRSH-2IN"], qty: 2 }], payment_method: "cash" },
    ];
    let firstInvoice = null;
    for (const s of sales) {
      const res = await api("POST", "/api/pos/checkout", s, cashierToken);
      if (!res.ok) throw new Error(`checkout: ${JSON.stringify(res.data)}`);
      if (!firstInvoice) firstInvoice = res.data.id;
      console.log(`  sold ${res.data.number} total=${res.data.grand_total}`);
    }

    // a partial return against the first sale
    const items = await api("GET", `/api/collections/invoice_items/records?filter=(invoice='${firstInvoice}')`, null, cashierToken);
    if (items.ok && items.data.items.length) {
      const ret = await api(
        "POST",
        "/api/pos/return",
        { invoice: firstInvoice, reason: "Customer changed mind", items: [{ invoice_item: items.data.items[0].id, qty: 1 }] },
        cashierToken
      );
      if (ret.ok) console.log(`  return ${ret.data.number} refund=${ret.data.refund_total}`);
    }
  } else {
    console.log("Sales: invoices already exist (or no cashier), skipping.");
  }

  console.log("Seed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
