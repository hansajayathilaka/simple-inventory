// Downloads the PocketBase binary matching the current OS/arch into backend/.
// Usage: node scripts/download-pocketbase.mjs
import { createWriteStream } from "node:fs";
import { mkdir, chmod, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";

const PB_VERSION = "0.22.21";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.join(__dirname, "..", "backend");

const platformMap = { win32: "windows", darwin: "darwin", linux: "linux" };
const archMap = { x64: "amd64", arm64: "arm64" };

const os = platformMap[process.platform];
const arch = archMap[process.arch];
if (!os || !arch) {
  console.error(`Unsupported platform/arch: ${process.platform}/${process.arch}`);
  process.exit(1);
}

const binName = process.platform === "win32" ? "pocketbase.exe" : "pocketbase";
const binPath = path.join(backendDir, binName);

if (existsSync(binPath)) {
  console.log(`PocketBase already present at ${binPath}`);
  process.exit(0);
}

const zipName = `pocketbase_${PB_VERSION}_${os}_${arch}.zip`;
const url = `https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/${zipName}`;
const zipPath = path.join(backendDir, zipName);

console.log(`Downloading ${url} ...`);
await mkdir(backendDir, { recursive: true });

const res = await fetch(url);
if (!res.ok) {
  console.error(`Download failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}
await pipeline(Readable.fromWeb(res.body), createWriteStream(zipPath));

// Unzip (use system unzip on *nix, tar on Windows which ships bsdtar).
console.log("Extracting ...");
const unzip =
  process.platform === "win32"
    ? spawnSync("tar", ["-xf", zipPath, "-C", backendDir], { stdio: "inherit" })
    : spawnSync("unzip", ["-o", zipPath, "-d", backendDir], { stdio: "inherit" });
if (unzip.status !== 0) {
  console.error("Extraction failed. Ensure 'unzip' (or tar) is installed.");
  process.exit(1);
}

await rm(zipPath, { force: true });
if (process.platform !== "win32") await chmod(binPath, 0o755);

const files = await readdir(backendDir);
if (!files.includes(binName)) {
  console.error("PocketBase binary not found after extraction.");
  process.exit(1);
}
console.log(`PocketBase ${PB_VERSION} ready at ${binPath}`);
