import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const env = { ...process.env, VITE_PUBLICATION_ID: "mooseys-mommy" };
function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env, shell: process.platform === "win32" });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(npm, ["run", "check:runtime"]);
run(npx, ["tsc"]);
run(npx, ["vite", "build", "--config", "vite.moose.config.ts"]);
run("node", ["scripts/prepare-sites-build.mjs"]);
run("node", ["scripts/configure-publication-build.mjs"]);
run("node", ["scripts/check-moose-public-release.mjs"]);
