import { spawnSync } from "node:child_process";

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
console.log("Johnny's Jerks build completed successfully in dist/johnnys-jerks/");
