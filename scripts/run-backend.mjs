// Runs the local PocketBase server (serves API + admin UI + applies migrations).
// Usage: node scripts/run-backend.mjs
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.join(__dirname, "..", "backend");
const binName = process.platform === "win32" ? "pocketbase.exe" : "pocketbase";
const binPath = path.join(backendDir, binName);

if (!existsSync(binPath)) {
  console.error(
    `PocketBase binary not found at ${binPath}.\n` +
      `Run "npm run backend:download" first.`
  );
  process.exit(1);
}

const host = process.env.PB_HOST || "127.0.0.1";
const port = process.env.PB_PORT || "8090";

// Enable verbose dev logging (request logs + SQL + errors to the console) by
// default for local development. Set PB_DEV=0 to disable.
const args = ["serve", "--http", `${host}:${port}`];
if (process.env.PB_DEV !== "0") args.push("--dev");

const child = spawn(binPath, args, {
  cwd: backendDir,
  stdio: "inherit",
});

const shutdown = () => child.kill("SIGTERM");
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
child.on("exit", (code) => process.exit(code ?? 0));
