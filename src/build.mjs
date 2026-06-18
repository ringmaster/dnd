/* Zero-dependency build: assemble shared engine + per-character data into
   self-contained single files in docs/. Run: node src/build.mjs */
import fs from "fs";
import path from "path";
import url from "url";
import { compile } from "./builder/compile.mjs";

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

fs.mkdirSync(DOCS, { recursive: true });

const charFiles = fs.readdirSync(path.join(SRC, "characters")).filter((f) => f.endsWith(".json"));
if (!charFiles.length) { console.error("No characters in src/characters/"); process.exit(1); }

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

let built = 0;
const index = [];
for (const cf of charFiles) {
  let data;
  try { data = JSON.parse(read(path.join(SRC, "characters", cf))); }
  catch (e) { console.error("Bad JSON in " + cf + ": " + e.message); process.exit(1); }
  if (!data.out) { console.error(cf + " is missing an `out` filename"); process.exit(1); }

  // expand declarative effects (build.sources) into materialized fields the engine reads
  data = compile(data);
  // `build` is authoring metadata (effect provenance) — keep it out of the shipped sheet
  delete data.build;

  // inline data; guard against a literal </script> inside any string
  const dataJson = JSON.stringify(data).replace(/<\/script/gi, "<\\/script");
  const script = indent("var CHARACTER = " + dataJson + ";\n\n" + engineJs, "  ");

  const html = template
    .replace("{{TITLE}}", (data.title || data.name || "Character Sheet"))
    .replace("{{STYLES}}", styles)
    .replace("{{SCRIPT}}", script);

  fs.writeFileSync(path.join(DOCS, data.out), html);
  console.log("built docs/" + data.out + "  (" + html.length + " bytes, from " + cf + ")");
  index.push({ name: data.name, subtitle: data.subtitle || "", out: data.out });
  built++;
}

// hub page listing every character
index.sort((a, b) => a.name.localeCompare(b.name));
const cards = index.map((c) =>
  '    <a class="pc" href="' + esc(c.out) + '">\n' +
  '      <span class="pc-name">' + esc(c.name) + '</span>\n' +
  '      <span class="pc-sub">' + esc(c.subtitle) + '</span>\n' +
  '      <span class="pc-go">View sheet →</span>\n' +
  '    </a>').join("\n");
const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>D&D Characters</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=Spectral:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
<style>
  :root{ --slate-deep:#131519; --slate-panel:#1d212a; --iron:#3a414d; --iron-light:#4d5563;
    --ember:#d9853f; --ember-bright:#f0a85a; --bone:#e9e3d5; --ash:#9aa0a8; --ash-dim:#6b7079;
    --shadow-carve: inset 0 1px 0 rgba(255,255,255,.05), inset 0 -2px 6px rgba(0,0,0,.5), 0 2px 4px rgba(0,0,0,.4); }
  *{box-sizing:border-box} html,body{margin:0;padding:0}
  body{ background: radial-gradient(1200px 600px at 20% -10%, #20242d 0%, transparent 60%), radial-gradient(900px 500px at 100% 0%, #1b1f27 0%, transparent 55%), var(--slate-deep);
    color:var(--bone); font-family:"Spectral", Georgia, serif; min-height:100vh; -webkit-text-size-adjust:100%; }
  .wrap{max-width:760px;margin:0 auto;padding:3rem 1rem 4rem}
  h1{font-family:"Cinzel",serif;font-weight:900;letter-spacing:.04em;font-size:1.9rem;margin:0 0 .2rem}
  .lede{color:var(--ash);font-size:.95rem;margin:0 0 2rem}
  .pcs{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem}
  .pc{display:flex;flex-direction:column;gap:.25rem;text-decoration:none;color:var(--bone);
    background:linear-gradient(180deg,var(--slate-panel),#191d25);border:1px solid var(--iron);border-radius:12px;
    box-shadow:0 4px 12px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.04);padding:1.1rem 1.2rem;
    transition:border-color .15s, transform .08s}
  .pc:hover{border-color:var(--ember)} .pc:active{transform:translateY(1px)}
  .pc-name{font-family:"Cinzel",serif;font-weight:700;font-size:1.15rem;color:var(--bone)}
  .pc-sub{color:var(--ash);font-size:.82rem;letter-spacing:.04em;text-transform:uppercase}
  .pc-go{margin-top:.5rem;color:var(--ember-bright);font-family:"Cinzel",serif;font-size:.8rem;letter-spacing:.05em}
  footer{color:var(--ash-dim);font-size:.74rem;margin-top:2.5rem;text-align:center}
</style>
</head>
<body>
  <div class="wrap">
    <h1>D&amp;D Characters</h1>
    <p class="lede">Tap a character to open their sheet.</p>
    <div class="pcs">
${cards}
    </div>
    <footer>Generated from <code>src/</code> · ${index.length} character${index.length === 1 ? "" : "s"}</footer>
  </div>
</body>
</html>
`;
fs.writeFileSync(path.join(DOCS, "index.html"), indexHtml);
console.log("built docs/index.html  (" + index.length + " character" + (index.length === 1 ? "" : "s") + ")");
console.log("done — " + built + " sheet(s).");
