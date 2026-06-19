// Electron main process.
// Responsibilities:
//   1. Spawn the bundled PocketBase binary as a sidecar (data in userData).
//   2. Wait for it to become healthy.
//   3. Load the built React UI (or the Vite dev server in development).
//   4. Tear the sidecar down cleanly on quit.
const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");

const PB_HOST = "127.0.0.1";
const PB_PORT = 8090;
const PB_URL = `http://${PB_HOST}:${PB_PORT}`;
const isDev = !app.isPackaged;

let pbProcess = null;
let mainWindow = null;

function backendPaths() {
  const binName = process.platform === "win32" ? "pocketbase.exe" : "pocketbase";
  if (isDev) {
    const root = path.join(__dirname, "..", "backend");
    return {
      bin: path.join(root, binName),
      migrations: path.join(root, "pb_migrations"),
      hooks: path.join(root, "pb_hooks"),
    };
  }
  const res = path.join(process.resourcesPath, "backend");
  return {
    bin: path.join(res, binName),
    migrations: path.join(res, "pb_migrations"),
    hooks: path.join(res, "pb_hooks"),
  };
}

function startPocketBase() {
  const { bin, migrations, hooks } = backendPaths();
  if (!fs.existsSync(bin)) {
    throw new Error(
      `PocketBase binary not found at ${bin}. ` +
        `Run "npm run backend:download" before packaging.`
    );
  }
  const dataDir = path.join(app.getPath("userData"), "pb_data");
  fs.mkdirSync(dataDir, { recursive: true });

  pbProcess = spawn(
    bin,
    [
      "serve",
      "--http",
      `${PB_HOST}:${PB_PORT}`,
      "--dir",
      dataDir,
      "--migrationsDir",
      migrations,
      "--hooksDir",
      hooks,
    ],
    { stdio: "inherit" }
  );
  pbProcess.on("exit", (code) => {
    console.log(`PocketBase exited with code ${code}`);
    pbProcess = null;
  });
}

function waitForHealth(timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      http
        .get(`${PB_URL}/api/health`, (res) => {
          res.resume();
          if (res.statusCode === 200) return resolve();
          retry();
        })
        .on("error", retry);
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs)
        return reject(new Error("PocketBase did not become healthy in time."));
      setTimeout(tick, 300);
    };
    tick();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    title: "Simple Inventory",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL || "http://localhost:5173";
  if (isDev) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(process.resourcesPath, "frontend", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// --- Printing IPC (used by the renderer's window.desktop bridge) ---

ipcMain.handle("desktop:get-printers", async () => {
  if (!mainWindow) return [];
  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    return printers.map((p) => ({ name: p.name, displayName: p.displayName }));
  } catch (err) {
    console.error("getPrinters failed", err);
    return [];
  }
});

// Render an HTML string in an offscreen window and print it, optionally silently
// to a named device.
ipcMain.handle("desktop:print-html", async (_event, html, options = {}) => {
  const printWin = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: false },
  });
  try {
    await printWin.loadURL(
      "data:text/html;charset=utf-8," + encodeURIComponent(html)
    );
    await new Promise((resolve, reject) => {
      printWin.webContents.print(
        {
          silent: options.silent !== false,
          printBackground: true,
          deviceName: options.deviceName || undefined,
        },
        (success, failureReason) =>
          success ? resolve() : reject(new Error(failureReason || "print failed"))
      );
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    printWin.close();
  }
});

app.whenReady().then(async () => {
  try {
    startPocketBase();
    await waitForHealth();
  } catch (err) {
    console.error(err);
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function shutdown() {
  if (pbProcess) {
    pbProcess.kill();
    pbProcess = null;
  }
}
app.on("before-quit", shutdown);
process.on("exit", shutdown);
