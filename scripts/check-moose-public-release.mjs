import fs from "node:fs";
import path from "node:path";

const forbidden = [
  "1312209616372772864",
  "Ape Invitational Dynasty",
  "managerName",
  "owner_id",
  "refresh_token",
  "client_secret",
  "sduda351",
];
const root = path.resolve("dist/client");
const files = [];
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(full);
    else if (/\.(?:html|js|json|css)$/i.test(entry.name)) files.push(full);
  }
}
visit(root);
const failures = [];
for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  for (const needle of forbidden) if (content.includes(needle)) failures.push(`${path.relative(root, file)} contains ${needle}`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Moosey's Mommy public privacy scan passed.");
