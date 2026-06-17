// Idempotent seed script: creates the owner + a sample cashier and some base
// lookup data (units of measure, categories, a brand). Assumes a PocketBase
// admin (superuser) already exists and the server is running.
//
// Usage:
//   node backend/seed/seed.mjs
// Env (with defaults):
//   PB_URL=http://127.0.0.1:8090
//   PB_ADMIN_EMAIL=admin@shop.local   PB_ADMIN_PASSWORD=admin12345
//   SEED_OWNER_EMAIL=owner@shop.local SEED_OWNER_PASSWORD=owner12345
//   SEED_CASHIER_EMAIL=cashier@shop.local SEED_CASHIER_PASSWORD=cashier12345

const BASE = process.env.PB_URL || "http://127.0.0.1:8090";
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || "admin@shop.local";
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || "admin12345";

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
  if (res.ok) {
    console.log(`  created ${role}: ${email}`);
  } else if (JSON.stringify(res.data).includes("already in use")) {
    console.log(`  ${role} already exists: ${email}`);
  } else {
    throw new Error(`Failed to create ${email}: ${JSON.stringify(res.data)}`);
  }
}

async function ensureLookup(token, collection, unique, record) {
  const filter = encodeURIComponent(`${unique}='${record[unique]}'`);
  const found = await api(
    "GET",
    `/api/collections/${collection}/records?filter=(${filter})`,
    null,
    token
  );
  if (found.ok && found.data.items && found.data.items.length > 0) {
    console.log(`  ${collection} already has: ${record[unique]}`);
    return;
  }
  const res = await api(
    "POST",
    `/api/collections/${collection}/records`,
    record,
    token
  );
  if (res.ok) console.log(`  created ${collection}: ${record[unique]}`);
  else throw new Error(`Failed ${collection}: ${JSON.stringify(res.data)}`);
}

async function main() {
  console.log(`Seeding ${BASE} ...`);
  const auth = await api("POST", "/api/admins/auth-with-password", {
    identity: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  if (!auth.ok) {
    console.error(
      `Admin auth failed. Create one first:\n` +
        `  ./backend/pocketbase admin create ${ADMIN_EMAIL} ${ADMIN_PASSWORD}`
    );
    process.exit(1);
  }
  const token = auth.data.token;

  console.log("Users:");
  await ensureUser(token, {
    email: process.env.SEED_OWNER_EMAIL || "owner@shop.local",
    password: process.env.SEED_OWNER_PASSWORD || "owner12345",
    name: "Shop Owner",
    role: "owner",
  });
  await ensureUser(token, {
    email: process.env.SEED_CASHIER_EMAIL || "cashier@shop.local",
    password: process.env.SEED_CASHIER_PASSWORD || "cashier12345",
    name: "Cashier",
    role: "cashier",
  });

  console.log("Units of measure:");
  await ensureLookup(token, "uom", "name", { name: "Pieces", abbreviation: "pcs" });
  await ensureLookup(token, "uom", "name", { name: "Kilogram", abbreviation: "kg" });
  await ensureLookup(token, "uom", "name", { name: "Litre", abbreviation: "L" });

  console.log("Categories:");
  await ensureLookup(token, "categories", "name", { name: "General" });
  await ensureLookup(token, "categories", "name", { name: "Beverages" });

  console.log("Brands:");
  await ensureLookup(token, "brands", "name", { name: "Generic" });

  console.log("Seed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
