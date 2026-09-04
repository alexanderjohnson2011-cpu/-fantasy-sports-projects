import fs from "node:fs";
import path from "node:path";

const publication = process.env.VITE_PUBLICATION_ID || "apes-mac-salad";
if (publication !== "mooseys-mommy") process.exit(0);

const indexPath = path.resolve("dist/client/index.html");
let html = fs.readFileSync(indexPath, "utf8");
const title = "Moosey’s Mommy · Fantasy League Desk";
const description = "Moosey’s Mommy: league-specific draft analysis, power rankings, matchups, forecasts, and the Hall of Callers.";
html = html
  .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
  .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${description}" />`);

const publicOrigin = (process.env.PUBLIC_SITE_URL || "").replace(/\/$/, "");
if (publicOrigin) {
  const tags = [
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${publicOrigin}" />`,
    `<meta property="og:image" content="${publicOrigin}/assets/app/mooseys-mommy-og.png" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${publicOrigin}/assets/app/mooseys-mommy-og.png" />`,
  ].join("\n    ");
  html = html.replace("</head>", `    ${tags}\n  </head>`);
}
fs.writeFileSync(indexPath, html);
console.log("Configured Moosey's Mommy publication metadata.");
