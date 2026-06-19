// Starts PocketBase + Vite dev server + Electron for local development.
// Usage: node scripts/dev-electron.mjs
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import http from "node:http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const isWin = process.platform === "win32";
const npm = isWin ? "npm.cmd" : "npm";

const children = [];

function spawnProc(name, cmd, args, env = {}) {
  const child = spawn(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: isWin,
    env: { ...process.env, ...env },
  });
  child.on("exit", (code) => {
    console.log(`[${name}] exited with code ${code}`);
    shutdown();
  });
  children.push(child);
  return child;
}

function waitForPort(port, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      http
        .get(`http://127.0.0.1:${port}`, (res) => { res.resume(); resolve(); })
        .on("error", () => {
          if (Date.now() - start > timeoutMs)
            return reject(new Error(`Port ${port} not ready after ${timeoutMs}ms`));
          setTimeout(tick, 500);
        });
    };
    tick();
  });
}

function shutdown() {
  for (const c of children) {
    try { c.kill("SIGTERM"); } catch {}
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

spawnProc("backend", npm, ["run", "backend"]);
spawnProc("frontend", npm, ["run", "frontend"]);

console.log("[electron] waiting for Vite dev server on port 5173...");
waitForPort(5173)
  .then(() => {
    console.log("[electron] Vite ready — launching Electron");
    spawnProc("electron", npm, ["--workspace", "electron", "run", "start"]);
  })
  .catch((err) => {
    console.error("[electron]", err.message);
    shutdown();
  });
