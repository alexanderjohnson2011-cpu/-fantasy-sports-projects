#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteName = (process.env.SITE_NAME || "").toLowerCase();
const url = (process.env.URL || "").toLowerCase();
const pubId = (process.env.VITE_PUBLICATION_ID || "").toLowerCase();

const isJohnny = siteName.includes("johnny") || url.includes("johnny") || pubId === "johnnys-jerks";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args) {
  const res = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (res.error) {
    console.error(res.error);
    process.exit(1);
  }
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

const clientDir = path.join(root, "dist", "client");
const johnnyDir = path.join(root, "dist", "johnnys-jerks");

if (isJohnny) {
  console.log(`[Netlify Build] Detected Johnny's Jerks site (SITE_NAME='${siteName}', URL='${url}')`);
  run(npm, ["run", "build:johnny"]);

  mkdirSync(clientDir, { recursive: true });
  cpSync(johnnyDir, clientDir, { recursive: true });
  console.log("[Netlify Build] Successfully populated dist/client for johnnysjerks.netlify.app");
} else {
  console.log(`[Netlify Build] Detected Almanac site (SITE_NAME='${siteName}', URL='${url}')`);
  run(npm, ["run", "build"]);

  run(npm, ["run", "build:johnny"]);
  const nestedJohnny = path.join(clientDir, "johnny");
  mkdirSync(nestedJohnny, { recursive: true });
  cpSync(johnnyDir, nestedJohnny, { recursive: true });
  console.log("[Netlify Build] Successfully populated dist/client for apesmacsalad.netlify.app");
}
