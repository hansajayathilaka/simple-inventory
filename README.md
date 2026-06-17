# Simple Inventory — Shop Management & POS

A shop management / point-of-sale system for small retail shops.

- **Inventory** management with a full stock-movement ledger
- **User management** with two roles: **Owner** and **Cashier**
- **Customer management**
- **Product management** with **dynamic, owner-defined attributes** (including
  attributes that reference other collections, e.g. UOM, brand/make, ingredient)
- **Owner**: manage inventory, restock, suppliers, users, products & attributes,
  view reports
- **Cashier**: sell goods, create invoices, give discounts, process returns

## Tech stack

| Layer      | Technology                                  |
| ---------- | ------------------------------------------- |
| Backend    | [PocketBase](https://pocketbase.io) (single Go binary) |
| Frontend   | Vite + React + TypeScript                   |
| Desktop    | Electron (Windows installer via electron-builder) |
| Data fetch | PocketBase JS SDK + TanStack Query          |

The backend URL is configurable (`VITE_PB_URL`), so the same build runs as a
**standalone single-PC app** today, or against a **LAN server** later, without
code changes.

## Repository layout

```
backend/    PocketBase: migrations (schema), hooks (business logic), seed
frontend/   Vite + React + TS UI (typed service/API layer over PocketBase SDK)
electron/   Electron main process + packaging config
docs/        data-model.md, dev-setup.md
```

## Getting started

See [docs/dev-setup.md](docs/dev-setup.md) for full instructions.

```bash
# 1. Backend (downloads PocketBase, runs migrations, serves admin + API)
npm run backend:download   # one-time: fetch the PocketBase binary
npm run backend            # http://127.0.0.1:8090 (admin at /_/)

# 2. Frontend
npm run frontend           # http://127.0.0.1:5173
```

## Project status

Built in phases — see the build plan. Implemented so far:

- [x] Phase 0 — Project scaffolding & tooling
- [x] Phase 1 — Backend data model & PocketBase setup
- [x] Phase 2 — Auth & user management
- [x] Phase 3 — Product management + dynamic attributes
- [x] Phase 4 — Inventory, suppliers & restock
- [x] Phase 5 — Customer management
- [x] Phase 6 — Sales / POS
- [x] Phase 7 — Returns / refunds
- [x] Phase 8 — Reports & exports
- [x] Phase 9 — Receipt / invoice printing
- [x] Phase 10 — Electron packaging (Windows)
- [ ] Phase 11 — Testing, hardening & docs
