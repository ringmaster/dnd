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
    <p class="lede">Tap a character to open their sheet, or <a href="builder.html" style="color:var(--ember-bright)">build a new one →</a></p>
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

// ---- builder page: inline every content catalog + the builder UI ----
const CONTENT = path.join(SRC, "content");
const readJson = (p) => JSON.parse(read(p));
const CAT = {
  species: readJson(path.join(CONTENT, "species.json")),
  classes: readJson(path.join(CONTENT, "classes.json")),
  subclasses: readJson(path.join(CONTENT, "subclasses.json")),
  backgrounds: readJson(path.join(CONTENT, "backgrounds.json")),
  feats: readJson(path.join(SRC, "builder", "feats.json")),
  spells: readJson(path.join(CONTENT, "spells.json")),
  weapons: readJson(path.join(CONTENT, "weapons.json")),
  armor: readJson(path.join(CONTENT, "armor.json")),
};
const uiJs = read(path.join(SRC, "builder", "ui.js"));
const catJson = JSON.stringify(CAT).replace(/<\/script/gi, "<\\/script");
const builderHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Character Builder · D&D</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=Spectral:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
<style>
${styles}
  .bwrap{max-width:1100px;margin:0 auto;padding:2rem 1rem 4rem}
  .btop{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:1.4rem}
  .btop h1{font-family:"Cinzel",serif;font-weight:900;letter-spacing:.04em;font-size:1.7rem;margin:0}
  .btop a{color:var(--ember-bright);font-family:"Cinzel",serif;font-size:.8rem;text-decoration:none}
  #builder{display:grid;grid-template-columns:1fr;gap:1.2rem}
  @media(min-width:860px){ #builder{grid-template-columns:1.3fr 1fr;align-items:start} }
  .bcol{display:flex;flex-direction:column;gap:1.2rem;min-width:0}
  .bcard{background:linear-gradient(180deg,var(--slate-panel),#191d25);border:1px solid var(--iron);border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.04);padding:1.1rem 1.2rem}
  .bcard h2{font-family:"Cinzel",serif;font-weight:700;font-size:1rem;letter-spacing:.05em;margin:0 0 .8rem;color:var(--bone)}
  .bderived{position:sticky;top:1rem}
  .bsub{color:var(--ash);font-size:.82rem;margin:.1rem 0 .6rem}
  .bgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.7rem}
  .bf{display:flex;flex-direction:column;gap:.25rem;margin-bottom:.5rem}
  .bf-l{font-family:"Cinzel",serif;font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--ash)}
  .bf-h{font-size:.74rem;color:var(--ash-dim)}
  .binput,.bsel,.babil{font-family:"Spectral",serif;background:#12151b;color:var(--bone);border:1px solid var(--iron-light);border-radius:8px;padding:.55rem .6rem;font-size:.9rem;width:100%}
  .bsel{cursor:pointer}
  .brow{display:flex;align-items:center;gap:.6rem;margin:.3rem 0}
  .bab-n{font-family:"Cinzel",serif;font-size:.8rem;width:2.4rem;color:var(--ember-bright)}
  .babil{width:4.2rem;text-align:center}
  .bab-i{font-size:.74rem;color:var(--ash-dim);width:3.5rem}
  .bab-f{font-size:.85rem;color:var(--bone)}
  .bchips{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.4rem}
  .bchip{font-family:"Spectral",serif;background:#12151b;color:var(--ash);border:1px solid var(--iron-light);border-radius:999px;padding:.35rem .7rem;font-size:.78rem;cursor:pointer}
  .bchip.on{background:linear-gradient(180deg,#3a2e22,#2a2118);border-color:var(--ember);color:var(--ember-bright)}
  .bchip.dim{opacity:.55;cursor:not-allowed;border-style:dashed}
  .bstats{display:grid;grid-template-columns:repeat(2,1fr);gap:.5rem}
  .bstat{display:flex;justify-content:space-between;align-items:baseline;background:#12151b;border:1px solid var(--iron);border-radius:8px;padding:.5rem .7rem}
  .bs-l{font-family:"Cinzel",serif;font-size:.62rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ash)}
  .bs-v{font-size:1.05rem;color:var(--ember-bright);font-family:"Cinzel",serif}
  .brow2{display:flex;gap:.5rem;margin-bottom:.6rem}
  .bbtn{font-family:"Cinzel",serif;background:linear-gradient(180deg,#2c333e,#222831);color:var(--bone);border:1px solid var(--iron-light);border-radius:8px;padding:.55rem .9rem;cursor:pointer;font-size:.8rem}
  .bbtn.ember{border-color:var(--ember);color:var(--ember-bright)}
  .bout{width:100%;font-family:ui-monospace,Menlo,monospace;font-size:.74rem;background:#0e1014;color:var(--bone);border:1px solid var(--iron);border-radius:8px;padding:.7rem;resize:vertical}
</style>
</head>
<body>
  <div class="bwrap">
    <div class="btop"><h1>Character Builder</h1><a href="index.html">← All characters</a></div>
    <div id="builder"></div>
  </div>
  <script>var CAT = ${catJson};</script>
  <script>${uiJs.replace(/<\/script/gi, "<\\/script")}</script>
</body>
</html>
`;
fs.writeFileSync(path.join(DOCS, "builder.html"), builderHtml);
console.log("built docs/builder.html  (" + builderHtml.length + " bytes)");
console.log("done — " + built + " sheet(s).");
