import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const clientDir = path.resolve("dist/client");
const assetsDir = path.join(clientDir, "assets");

async function rewrite(filePath, transform) {
  const source = await readFile(filePath, "utf8");
  await writeFile(filePath, transform(source));
}

await rewrite(path.join(clientDir, "index.html"), (html) =>
  html.replaceAll("/assets/", "./assets/"),
);

for (const name of await readdir(assetsDir)) {
  const filePath = path.join(assetsDir, name);
  if (name.endsWith(".js")) {
    await rewrite(filePath, (code) => code.replaceAll("/assets/", "./assets/"));
  }
  if (name.endsWith(".css")) {
    await rewrite(filePath, (css) => css.replaceAll("/assets/", "./"));
  }
}

await writeFile(path.join(clientDir, ".nojekyll"), "");
console.log("Prepared relative asset paths for GitHub Pages.");
