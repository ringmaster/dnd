/* Zero-dependency build: assemble shared engine + per-character data into
   self-contained single files in docs/. Run: node src/build.mjs */
import fs from "fs";
import path from "path";
import url from "url";

const SRC = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(SRC, "..");
const ENGINE = path.join(SRC, "engine");
const DOCS = path.join(ROOT, "docs");

// engine fragments concatenated in dependency order (all share one IIFE scope)
const ORDER = ["derive.js", "storage.js", "domrefs.js", "glossary.js", "components.js", "sheet.js"];

const read = (p) => fs.readFileSync(p, "utf8");
const template = read(path.join(SRC, "template.html"));
const styles = read(path.join(ENGINE, "styles.css")).trimEnd();
const engineJs = ORDER.map((f) => "/* ===== engine/" + f + " ===== */\n" + read(path.join(ENGINE, f)).trimEnd()).join("\n\n");

function indent(s, pad) { return s.split("\n").map((l) => (l.length ? pad + l : l)).join("\n"); }

const charFiles = fs.readdirSync(path.join(SRC, "characters")).filter((f) => f.endsWith(".json"));
if (!charFiles.length) { console.error("No characters in src/characters/"); process.exit(1); }

let built = 0;
for (const cf of charFiles) {
  let data;
  try { data = JSON.parse(read(path.join(SRC, "characters", cf))); }
  catch (e) { console.error("Bad JSON in " + cf + ": " + e.message); process.exit(1); }
  if (!data.out) { console.error(cf + " is missing an `out` filename"); process.exit(1); }

  // inline data; guard against a literal </script> inside any string
  const dataJson = JSON.stringify(data).replace(/<\/script/gi, "<\\/script");
  const script = indent("var CHARACTER = " + dataJson + ";\n\n" + engineJs, "  ");

  const html = template
    .replace("{{TITLE}}", (data.title || data.name || "Character Sheet"))
    .replace("{{STYLES}}", styles)
    .replace("{{SCRIPT}}", script);

  fs.writeFileSync(path.join(DOCS, data.out), html);
  console.log("built docs/" + data.out + "  (" + html.length + " bytes, from " + cf + ")");
  built++;
}
console.log("done — " + built + " sheet(s).");
