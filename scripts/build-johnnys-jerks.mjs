import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const env = { ...process.env, VITE_PUBLICATION_ID: "johnnys-jerks" };

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env, shell: process.platform === "win32" });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("Building Johnny's Jerks post-draft website...");
run(npx, ["tsc", "--noEmit"]);
run(npx, ["vite", "build", "--config", "vite.johnny.config.ts"]);

const htmlPath = path.join(root, "dist", "johnnys-jerks", "index.html");
if (existsSync(htmlPath)) {
  let html = readFileSync(htmlPath, "utf8");
  html = html.replace(
    /<title>.*?<\/title>/i,
    "<title>Johnny's Jerks - 2026 Redraft Post-Draft Almanac &amp; Matchup Desk</title>"
  );
  html = html.replace(
    /<meta\s+name="description"\s+content=".*?"\s*\/?>/i,
    '<meta name="description" content="Johnny\'s Jerks: 2026 redraft league post-draft recap, live matchup dynamics, and odds." />'
  );
  writeFileSync(htmlPath, html, "utf8");
}

console.log("Johnny's Jerks build completed successfully in dist/johnnys-jerks/");
