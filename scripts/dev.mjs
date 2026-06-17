// Runs backend (PocketBase) and frontend (Vite) together for development.
// Usage: node scripts/dev.mjs
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const procs = [
  { name: "backend", cmd: "node", args: ["scripts/run-backend.mjs"] },
  { name: "frontend", cmd: process.platform === "win32" ? "npm.cmd" : "npm", args: ["run", "frontend"] },
];

const children = procs.map(({ name, cmd, args }) => {
  const child = spawn(cmd, args, { cwd: root, stdio: "inherit" });
  child.on("exit", (code) => {
    console.log(`[${name}] exited with code ${code}`);
    shutdown();
  });
  return child;
});

function shutdown() {
  for (const c of children) c.kill("SIGTERM");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
