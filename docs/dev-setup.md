# Development Setup

## Prerequisites

- **Node.js ≥ 20** (the repo is tested on Node 22)
- **unzip** (Linux/macOS) for the PocketBase download script; Windows uses the
  built-in `tar`

## 1. Backend (PocketBase)

```bash
# one-time: download the PocketBase binary into backend/
npm run backend:download

# create an admin (superuser) account — interactive prompt
./backend/pocketbase admin create admin@shop.local admin12345

# run the server (applies migrations automatically on start)
npm run backend
```

- REST API: <http://127.0.0.1:8090/api/>
- Admin UI: <http://127.0.0.1:8090/_/>

Migrations in `backend/pb_migrations/` are applied automatically when the server
starts. To run them manually:

```bash
cd backend && ./pocketbase migrate up
```

### Seed sample data

With the server running and an admin created:

```bash
npm run backend:seed
```

This creates an **owner** (`owner@shop.local` / `owner12345`), a **cashier**
(`cashier@shop.local` / `cashier12345`), and base lookups (UOM, categories,
brand). All seed steps are idempotent.

## 2. Frontend (Vite + React)

```bash
npm run frontend     # http://127.0.0.1:5173
```

The frontend reads the backend URL from `VITE_PB_URL` (defaults to
`http://127.0.0.1:8090`). To point at a LAN server, set it in `frontend/.env`:

```
VITE_PB_URL=http://192.168.1.10:8090
```

## 3. Run both together

```bash
npm run dev          # backend + frontend
```

## 4. Desktop app (Electron)

Run the desktop shell in development (it spawns the PocketBase sidecar and loads
the Vite dev server):

```bash
npm run backend:download         # once, if not already done
npm run frontend                 # terminal 1 (Vite on :5173)
npm --workspace electron install # once
npm --workspace electron start   # terminal 2 (Electron)
```

### Build the Windows installer

On a **Windows** machine (electron-builder targets the host OS):

```bash
npm run backend:download         # fetches pocketbase.exe into backend/
npm --workspace electron install
npm run dist                     # builds the React app + NSIS installer
```

The installer is written to `electron/out/`. The packaged app bundles the
PocketBase binary, migrations and hooks as resources and stores its database in
the user's app-data directory. On first launch the bootstrap migration creates a
default superuser (`admin@shop.local` / `admin12345`) and owner
(`owner@shop.local` / `owner12345`) — **change these after first login.**

## Project structure

```
backend/
  pb_migrations/   versioned schema (collections, rules)
  pb_hooks/        business logic (utils.js + *.pb.js routes/hooks)
  seed/            seed.mjs
frontend/          Vite + React + TS (typed service layer over the PB SDK)
electron/          Electron main process + packaging
scripts/           download-pocketbase / run-backend / dev
docs/              data-model.md, dev-setup.md
```

## Notes on PocketBase JSVM (important for hooks)

PocketBase runs each hook/route handler in an **isolated scope**. Functions
declared at the top level of a `*.pb.js` file are **not** visible inside its
handlers. Put shared logic in `backend/pb_hooks/utils.js` and import it *inside*
each handler:

```js
routerAdd("POST", "/api/...", (c) => {
  const { applyMovement } = require(`${__hooks}/utils.js`);
  // ...
});
```

This version targets **PocketBase 0.22.x** (Dao/SchemaField migration API).
