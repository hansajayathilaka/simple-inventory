# Data Model

All collections are defined as versioned PocketBase migrations in
`backend/pb_migrations/`. Business logic lives in `backend/pb_hooks/`.

## Access-rule conventions

- `AUTH` = `@request.auth.id != ""` — any authenticated staff member
- `OWNER` = `@request.auth.role = "owner"`

Inventory and the stock ledger have **no direct write rules** — they are
mutated only by server-side routes/hooks (which use the superuser dao and
bypass collection rules). This guarantees stock can only change through audited
business operations.

## Auth & users

### `users` (auth)
Built-in auth collection, extended with:

| field    | type             | notes                          |
| -------- | ---------------- | ------------------------------ |
| name     | text (built-in)  | staff display name             |
| role     | select           | `owner` \| `cashier`           |
| active   | bool             | whether the account is enabled |

Rules: all management (list/view/create/update/delete) is `OWNER`. Each user can
still read/refresh their own record via the auth endpoints.

## Lookup / reference collections

Owner-managed (`OWNER` writes, `AUTH` reads). These are the targets for
`relation`-type product attributes and for fixed product fields.

- **`categories`** — `name`*, `description`, `parent` (self-relation)
- **`uom`** — `name`*, `abbreviation`* (units of measure)
- **`brands`** — `name`*, `description` (a.k.a. "make")
- **`ingredients`** — `name`*, `description`
- **`suppliers`** — `name`*, `contact_person`, `phone`, `email`, `address`,
  `notes`, `is_active`

### Owner-created custom lists (`lk_*`)

The owner can create brand-new reference lists at runtime — no developer needed
— from **Catalog → Lookups → + New list**. Each list is a *real* PocketBase
collection named `lk_<slug>` with `name`* + `description` and the same
`OWNER`-writes / `AUTH`-reads rules as the built-ins, so it is fully CRUD-able
and usable as a `relation` attribute target.

- **`lookup_collections`** — registry of custom lists: `name`* (the real
  collection name, e.g. `lk_color`), `label` (e.g. `Color`). Written only by the
  privileged routes below; `AUTH` reads.
- Routes (`pb_hooks/lookups.pb.js`): `GET /api/lookups` (list), `POST
  /api/lookups` `{label}` (owner — create collection + register), `DELETE
  /api/lookups/:name` (owner — drop; blocked while an attribute targets it).
- Mutating the schema inside a request makes PocketBase reload and replay the
  first such handler per boot, so the routes are idempotent. PocketBase
  automigrate also writes a `*_lk_*.js` migration into each install's
  environment to persist the new collection; those files are git-ignored
  (per-install runtime artifacts, not repo schema).

## Dynamic attributes

### `attribute_definitions`
Owner-defined attributes that appear on products. (`OWNER` writes, `AUTH` reads.)

| field             | type   | notes                                                   |
| ----------------- | ------ | ------------------------------------------------------- |
| key               | text   | machine key used in `products.attributes` (e.g. `make`) |
| label             | text   | UI label (e.g. `Make`)                                  |
| type              | select | `text`/`number`/`boolean`/`date`/`select`/`relation`    |
| options           | json   | allowed values when `type=select`                       |
| target_collection | text   | target lookup collection when `type=relation` (built-in or `lk_*`) |
| is_required       | bool   | enforced server-side on product save                    |
| is_multiple       | bool   | allow multiple values                                   |
| applies_to        | select | `product` (future-proof for other entities)             |
| sort_order        | number | display ordering                                        |

Unique on `(applies_to, key)`.

## Products

### `products`
`OWNER` writes, `AUTH` reads.

| field      | type     | notes                                            |
| ---------- | -------- | ------------------------------------------------ |
| sku        | text     | unique                                           |
| barcode    | text     | indexed (scanner lookups)                        |
| name       | text     | indexed                                          |
| description| text     |                                                  |
| category   | relation | → categories                                     |
| base_uom   | relation | → uom                                            |
| cost_price | number   |                                                  |
| sell_price | number   | required                                         |
| tax_rate   | number   | percent (0–100)                                  |
| image      | file     | single image                                     |
| is_active  | bool     |                                                  |
| attributes | json     | dynamic values keyed by `attribute_definitions.key` |

`attributes` is validated against the active definitions on every create/update
(see `pb_hooks/products.pb.js` → `validateProductAttributes`).

## Inventory & ledger

### `inventory` (no direct writes)
One row per product. `product`* (unique relation), `qty_on_hand`,
`reorder_level`.

### `stock_movements` (append-only, no direct writes)
The audit ledger. Every stock change is one row.

| field      | type     | notes                                                   |
| ---------- | -------- | ------------------------------------------------------- |
| product    | relation | → products                                              |
| type       | select   | `purchase`/`restock`/`sale`/`return`/`adjustment`       |
| qty        | number   | **signed** (+ adds, − removes)                          |
| unit_cost  | number   |                                                         |
| reference  | text     | source doc id (invoice / PO / return)                   |
| note       | text     |                                                         |
| created_by | relation | → users                                                 |

## Purchasing (restock)

- **`purchase_orders`** — `reference`, `supplier`*, `status`
  (`draft`/`received`/`cancelled`), `total_cost`, `note`, `created_by`,
  `received_at`. `OWNER` only.
- **`purchase_order_items`** — `purchase_order`*, `product`*, `qty`*,
  `unit_cost`*, `line_total`.

Receiving a PO (`POST /api/purchasing/receive/:id`) creates `purchase`
movements for every line and marks it received.

## Customers

### `customers`
`name`*, `phone`, `email`, `address`, `notes`, `loyalty_points`.
Cashiers can read/create/update (quick-add at POS); only owners delete.

## Sales

### `invoices`
`AUTH` create/read; `OWNER` update/delete (finalized invoices are corrected via
returns, not edits).

| field          | type     | notes                                                          |
| -------------- | -------- | -------------------------------------------------------------- |
| number         | text     | sequential `INV-000001`, assigned on checkout                  |
| customer       | relation | → customers (optional)                                         |
| cashier        | relation | → users (required)                                             |
| subtotal       | number   | sum of line gross                                             |
| discount_total | number   | line + invoice discounts                                       |
| tax_total      | number   |                                                                |
| grand_total    | number   |                                                                |
| payment_method | select   | `cash`/`card`/`other`                                          |
| status         | select   | `draft`/`paid`/`void`/`partially_returned`/`returned`         |
| note           | text     |                                                                |

### `invoice_items`
`invoice`*, `product`*, `qty`*, `unit_price`*, `discount`, `tax_rate`,
`line_total`.

## Returns

- **`returns`** — `number` (`RET-000001`), `invoice`*, `refund_total`, `reason`,
  `cashier`*.
- **`return_items`** — `return`*, `invoice_item`, `product`*, `qty`*,
  `unit_price`*, `line_total`.

Creating a return (`POST /api/pos/return`) restocks inventory, computes the
refund, and updates the original invoice's status.

## Server-side API (custom routes)

All in `backend/pb_hooks/`:

| route                                | role    | purpose                              |
| ------------------------------------ | ------- | ------------------------------------ |
| `POST /api/pos/checkout`             | staff   | create a paid invoice + decrement stock |
| `POST /api/pos/return`               | staff   | create a return + restock            |
| `POST /api/inventory/restock`        | owner   | add stock for a product              |
| `POST /api/inventory/adjust`         | owner   | signed manual adjustment (with note) |
| `POST /api/purchasing/receive/:id`   | owner   | receive a purchase order             |

Standard CRUD for every collection is available via PocketBase's auto-generated
REST API under `/api/collections/<name>/records`.
