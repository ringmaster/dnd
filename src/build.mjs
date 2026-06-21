/* Zero-dependency build: assemble shared engine + per-character data into
   self-contained single files in docs/. Run: node src/build.mjs */
import fs from "fs";
import path from "path";
import url from "url";
import { compile } from "./builder/compile.mjs";
import { buildRules } from "./builder/rules-index.mjs";
import { portraitDataUri, ogTitle, ogDesc, ogImageUrl, ogPageUrl } from "./builder/share.mjs";

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

const buildStamp = new Date().toLocaleString("en-US", {
  dateStyle: "long", timeStyle: "short",
});

let built = 0;
const index = [];
for (const cf of charFiles) {
  let data, rawSource;
  try { rawSource = read(path.join(SRC, "characters", cf)); data = JSON.parse(rawSource); }
  catch (e) { console.error("Bad JSON in " + cf + ": " + e.message); process.exit(1); }
  if (!data.out) { console.error(cf + " is missing an `out` filename"); process.exit(1); }

  // the un-compiled source (keeps `build`) rides along so the sheet can Edit/Export it
  const sourceJson = JSON.stringify(JSON.parse(rawSource)).replace(/<\/script/gi, "<\\/script");

  // expand declarative effects (build.sources) into materialized fields the engine reads
  data = compile(data);
  // `build` is authoring metadata (effect provenance) — keep it out of the shipped sheet
  delete data.build;

  // embed the portrait (if any) so the single-file sheet stays offline-capable
  const portrait = portraitDataUri(data);
  if (portrait) data.portrait = portrait;

  // inline data; guard against a literal </script> inside any string
  const dataJson = JSON.stringify(data).replace(/<\/script/gi, "<\\/script");
  const script = indent("var CHARACTER = " + dataJson + ";\nvar CHARACTER_SOURCE = " + sourceJson + ";\n\n" + engineJs, "  ");

  const html = template
    .replace("{{TITLE}}", (data.title || data.name || "Character Sheet"))
    .replace(/\{\{OG_TITLE\}\}/g, esc(ogTitle(data)))
    .replace(/\{\{OG_DESC\}\}/g, esc(ogDesc(data)))
    .replace(/\{\{OG_URL\}\}/g, esc(ogPageUrl(data)))
    .replace(/\{\{OG_IMAGE\}\}/g, esc(ogImageUrl(data)))
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
  .build-cta{display:inline-flex;align-items:center;gap:.5rem;text-decoration:none;margin:0 0 1.6rem;
    font-family:"Cinzel",serif;font-weight:700;font-size:.85rem;letter-spacing:.04em;color:var(--ember-bright);
    background:linear-gradient(180deg,#3a2e22,#2a2118);border:1px solid var(--ember);border-radius:10px;
    padding:.7rem 1.1rem;box-shadow:0 4px 12px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.05);transition:border-color .15s, transform .08s}
  .build-cta:hover{border-color:var(--ember-bright)} .build-cta:active{transform:translateY(1px)}
</style>
</head>
<body>
  <div class="wrap">
    <h1>D&amp;D Characters</h1>
    <p class="lede">Tap a character to open their sheet.</p>
    <a class="build-cta" href="builder.html">⚒ Build a new character →</a>
    <p class="lede" style="margin-top:1rem">Have a character JSON? <a href="view.html" style="color:var(--ember-bright)">Render it in the viewer →</a></p>
    <div class="pcs">
${cards}
    </div>
    <footer>Generated from <code>src/</code> · ${index.length} character${index.length === 1 ? "" : "s"} · Generated on ${buildStamp}</footer>
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
  classFeatures: readJson(path.join(CONTENT, "class-features.json")),
};
const uiJs = read(path.join(SRC, "builder", "ui.js"));
// the legality checker is shared with the round-trip test; inline it (export stripped) so the builder
// can surface a live Completeness panel from the same rules the test enforces
const legalityJs = read(path.join(SRC, "builder", "legality.mjs")).replace(/^export\s+/gm, "");
const schemaJson = read(path.join(SRC, "builder", "character-schema.json")).replace(/<\/script/gi, "<\\/script");
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
  .bf-l{font-family:"Cinzel",serif;font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--ash);display:flex;align-items:center;gap:.4rem}
  .bf-q{flex:none;width:1.05rem;height:1.05rem;line-height:1;border-radius:50%;border:1px solid var(--iron-light);background:#12151b;color:var(--ash);font-family:"Cinzel",serif;font-size:.62rem;cursor:pointer;padding:0}
  .bf-q:hover{border-color:var(--ember);color:var(--ember-bright)}
  .bf-pop{margin-top:.35rem;background:#0e1014;border:1px solid var(--iron);border-left:2px solid var(--ember);border-radius:8px;padding:.5rem .65rem;font-size:.8rem;color:var(--ash);line-height:1.45}
  .bf-pop p{margin:0 0 .4rem} .bf-pop p:last-child{margin:0}
  .adv-row{display:flex;align-items:center;gap:.5rem;margin:.4rem 0}
  .adv-lvl{font-family:"Cinzel",serif;font-size:.72rem;color:var(--ember-bright);min-width:1.8rem}
  .adv-row .bsel{flex:1;min-width:0}
  .adv-two{display:flex;gap:.4rem;flex:1}
  .barrays{display:flex;flex-wrap:wrap;gap:.4rem;margin:.2rem 0 .7rem}
  .bbtn.tiny{padding:.4rem .7rem;font-size:.72rem;min-height:0}
  .bf-h{font-size:.74rem;color:var(--ash-dim)}
  .bcheck{display:flex;align-items:center;gap:.5rem;font-size:.85rem;color:var(--bone);cursor:pointer;margin-top:.4rem}
  .bcheck input{width:1.05rem;height:1.05rem;accent-color:var(--ember)}
  .bsel:disabled{opacity:.6;cursor:not-allowed}
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
  .cust-row{border:1px solid var(--iron);border-radius:10px;padding:.6rem;margin-bottom:.7rem;background:rgba(0,0,0,.18)}
  .cust-head{display:flex;align-items:center;gap:.4rem;margin-bottom:.45rem;flex-wrap:wrap}
  .cust-kind{font-family:"Cinzel",serif;font-size:.62rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ember-bright);border:1px solid var(--ember);border-radius:6px;padding:.18rem .4rem;white-space:nowrap}
  .cust-label{flex:1 1 8rem;min-width:6rem}
  .cust-key{flex:1 1 7rem;min-width:5rem;font-family:ui-monospace,Menlo,monospace}
  .cust-json{margin-top:0}
  .cust-err{color:#e0736b;display:block;margin-top:.25rem;min-height:1em}
  .eq-list{margin-top:.6rem;display:flex;flex-direction:column;gap:.3rem}
  .eq-row{display:flex;align-items:center;gap:.5rem;border:1px solid var(--iron);border-radius:8px;padding:.35rem .5rem;background:rgba(0,0,0,.18)}
  .eq-kind{font-family:"Cinzel",serif;font-size:.58rem;letter-spacing:.06em;text-transform:uppercase;border-radius:5px;padding:.16rem .38rem;white-space:nowrap;border:1px solid var(--iron-light);color:var(--ash)}
  .eq-weapon{color:var(--ember-bright);border-color:var(--ember)}
  .eq-armor,.eq-shield{color:#86b6d6;border-color:#3a5a72}
  .eq-name{flex:1;color:var(--bone)}
  .eq-search{position:relative}
  .eq-results{position:absolute;left:0;right:0;top:100%;z-index:20;margin-top:.2rem;background:#0e1014;border:1px solid var(--iron-light);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.55);max-height:18rem;overflow:auto}
  .eq-res{display:flex;align-items:center;gap:.5rem;width:100%;text-align:left;background:transparent;border:none;border-bottom:1px solid var(--iron);padding:.5rem .6rem;cursor:pointer;color:var(--bone);font-size:.85rem}
  .eq-res:last-child{border-bottom:none}
  .eq-res:hover,.eq-res:focus{background:#1a1f29}
  .eq-rname{flex:1}
  .skill-list{display:flex;flex-direction:column;gap:.1rem;margin-top:.5rem}
  .skill-row{display:flex;align-items:center;gap:.6rem;padding:.3rem .45rem;border-radius:6px;cursor:default}
  .skill-row.on{background:rgba(224,164,88,.09)}
  .skill-row.na{opacity:.5}
  .sk-cb{width:16px;height:16px;accent-color:var(--ember);cursor:pointer}
  .sk-chit{width:16px;text-align:center;color:var(--ember-bright)}
  .sk-na{width:16px;text-align:center;color:var(--iron-light)}
  .sk-name{flex:1;color:var(--bone)}
  .sk-ab{font-family:"Cinzel",serif;font-size:.66rem;letter-spacing:.05em;color:var(--ash)}
  .skill-row:not(.na){cursor:pointer}
  .cls-list{display:flex;flex-direction:column;gap:.45rem;margin-top:.4rem}
  .cls-row{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap}
  .cls-row .bsel{flex:1 1 7rem;min-width:5rem}
  .cls-tag{font-family:"Cinzel",serif;font-size:.58rem;letter-spacing:.06em;text-transform:uppercase;color:var(--ash);border:1px solid var(--iron-light);border-radius:5px;padding:.2rem .4rem;white-space:nowrap}
  .bcomp{position:sticky;top:1rem}
  .bcomp.good{border-color:#2f6b46}
  .bcomp.bad{border-color:#7a3b3b}
  .bcomp.hb{border-color:#6b5a2f}
  .comp-ok{color:#7fd49b;font-size:.86rem;font-weight:600}
  .comp-note{color:#d9c37a;font-size:.78rem;margin:.2rem 0 .4rem;line-height:1.35}
  .comp-h{color:var(--bone);font-size:.78rem;margin:.4rem 0 .3rem}
  .comp-h.soft{color:var(--ash)}
  .comp-row{display:flex;gap:.5rem;align-items:flex-start;width:100%;text-align:left;background:rgba(122,59,59,.14);border:1px solid rgba(122,59,59,.5);color:var(--bone);border-radius:7px;padding:.4rem .55rem;margin:.25rem 0;font-size:.8rem;cursor:pointer;font-family:inherit;line-height:1.3}
  .comp-row:hover{background:rgba(122,59,59,.26)}
  .comp-row.soft{background:rgba(107,90,47,.14);border-color:rgba(107,90,47,.5)}
  .comp-row.soft:hover{background:rgba(107,90,47,.26)}
  .comp-dot{color:#e0888a;font-weight:700;flex:none}
  .comp-row.soft .comp-dot{color:#d9c37a}
  .comp-msg{flex:1 1 auto}
  .hb-toggle{display:flex;gap:.45rem;align-items:flex-start;font-size:.78rem;color:var(--ash);margin:.1rem 0 .5rem;cursor:pointer}
  .hb-toggle input{margin-top:.15rem}
  .bcard.flash{animation:compflash 1.2s ease-out}
  @keyframes compflash{0%,40%{box-shadow:0 0 0 2px var(--ember-bright),0 4px 12px rgba(0,0,0,.35)}100%{box-shadow:0 4px 12px rgba(0,0,0,.35)}}
  .jt-tree{font-size:.82rem;max-width:100%;overflow:hidden}
  .jt-node{min-width:0;max-width:100%}
  .jt-scalar{display:inline-flex;gap:.3rem;align-items:center;flex-wrap:wrap;min-width:0;max-width:100%}
  .jt-type{flex:none;width:auto;min-width:0;padding:.12rem .28rem;font-size:.68rem}
  .jt-chip{background:#0e1014;border:1px solid var(--iron-light);border-radius:6px;padding:.22rem .5rem;color:var(--bone);font-family:ui-monospace,Menlo,monospace;font-size:.76rem;cursor:text;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}
  .jt-chip.dice{color:var(--ember-bright)}
  .jt-chip.empty{color:var(--ash-dim);font-style:italic}
  .jt-chip.jt-bool{font-family:inherit;cursor:pointer}
  .jt-chip.jt-bool.on{color:#7fd49b}
  .jt-edit{padding:.2rem .4rem;font-size:.78rem;max-width:100%;box-sizing:border-box}
  .jt-keyedit{max-width:8rem}
  .jt-head{display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;margin-bottom:.3rem;min-width:0}
  .jt-count{color:var(--ash);font-size:.7rem}
  .jt-children{border-left:1px solid var(--iron);margin-left:.35rem;padding-left:.55rem;display:flex;flex-direction:column;gap:.32rem;margin-top:.2rem;min-width:0}
  .jt-row{display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;min-width:0;max-width:100%}
  .jt-key{flex:none;color:var(--ember-bright);background:none;font-family:inherit;font-size:.76rem;cursor:pointer;padding:.1rem .15rem;border:none;border-bottom:1px dotted var(--iron-light);max-width:9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .jt-key.idx{color:var(--ash-dim);font-family:ui-monospace,Menlo,monospace;border:none;cursor:default;min-width:1.1rem;text-align:right}
  .jt-x{flex:none;background:none;border:1px solid var(--iron);color:var(--ash);border-radius:5px;padding:.05rem .32rem;font-size:.7rem;cursor:pointer;line-height:1.4}
  .jt-add{align-self:flex-start;margin-top:.1rem}
  .jt-enum{flex:0 1 auto;min-width:0;max-width:100%;padding:.18rem .3rem;font-size:.76rem}
  .jt-add-sel{max-width:15rem}
  .jt-row > .jt-node,.jt-row > .jt-scalar{flex:1 1 auto;min-width:0}
</style>
</head>
<body>
  <div class="bwrap">
    <div class="btop"><h1>Character Builder</h1><a href="index.html">← All characters</a></div>
    <div id="builder"></div>
  </div>
  <script>var CAT = ${catJson};</script>
  <script>var CHARACTER_SCHEMA = ${schemaJson};</script>
  <script>${legalityJs.replace(/<\/script/gi, "<\\/script")}</script>
  <script>${uiJs.replace(/<\/script/gi, "<\\/script")}</script>
</body>
</html>
`;
fs.writeFileSync(path.join(DOCS, "builder.html"), builderHtml);
console.log("built docs/builder.html  (" + builderHtml.length + " bytes)");

// ---- static viewer: compile + render any character JSON entirely client-side ----
const coreSrc = read(path.join(SRC, "builder", "compile-core.mjs")).replace(/^export\s+/gm, "");
const viewerBoot = `
${coreSrc}
var CAT = ${catJson};
var ENGINE_SRC = ${JSON.stringify(engineJs)};

function showError(msg){ var e=document.getElementById("vwErr"); if(e){ e.textContent=msg; e.style.display="block"; } }
function hideLoader(){ var l=document.getElementById("vwLoader"); if(l) l.style.display="none"; }
function renderCharacter(raw){
  // keep the build-bearing source so the rendered sheet's Edit/Export hand the
  // ACTUAL construction back to the builder (not a lossy, build-stripped compile)
  var source = JSON.parse(JSON.stringify(raw));
  var compiled;
  try { compiled = compile(raw, CAT); } catch(e){ showError("Could not compile: " + e.message); return; }
  if (compiled.build) delete compiled.build;
  var json = JSON.stringify(compiled).replace(/<\\/script/gi, "<\\\\/script");
  var srcJson = JSON.stringify(source).replace(/<\\/script/gi, "<\\\\/script");
  var s = document.createElement("script");
  s.text = '(function(){"use strict"; var CHARACTER = ' + json + '; var CHARACTER_SOURCE = ' + srcJson + ';\\n' + ENGINE_SRC + '\\n})();';
  document.body.appendChild(s);
  hideLoader();
}
function tryRaw(text){
  var raw; try { raw = JSON.parse(text); } catch(e){ showError("That isn't valid JSON: " + e.message); return; }
  renderCharacter(raw);
}
function fromParam(){
  var m = location.search.match(/[?&]c=([^&]+)/); if(!m) return null;
  try { return JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]))))); } catch(e){ return null; }
}
document.addEventListener("DOMContentLoaded", function(){
  var p = fromParam(); if(p){ renderCharacter(p); return; }
  var preview = /[?&]preview=1/.test(location.search);
  if(preview){ try { var s=localStorage.getItem("dnd_preview"); if(s){ renderCharacter(JSON.parse(s)); return; } } catch(e){} }
  // build loader UI
  var L=document.getElementById("vwLoader");
  document.getElementById("vwFile").addEventListener("change", function(e){
    var f=e.target.files[0]; if(!f) return; var r=new FileReader(); r.onload=function(){ tryRaw(String(r.result)); }; r.readAsText(f);
  });
  document.getElementById("vwRender").addEventListener("click", function(){ tryRaw(document.getElementById("vwText").value); });
  var hadPreview=false; try { hadPreview=!!localStorage.getItem("dnd_preview"); } catch(e){}
  if(hadPreview){ var b=document.getElementById("vwPreview"); b.style.display="inline-flex"; b.addEventListener("click", function(){ try{ renderCharacter(JSON.parse(localStorage.getItem("dnd_preview"))); }catch(e){ showError("No valid preview saved."); } }); }
});
`;
const viewerStyles = styles + `
  .vw-loader{position:fixed;inset:0;z-index:50;display:flex;align-items:flex-start;justify-content:center;overflow:auto;background:var(--slate-deep);padding:3rem 1rem}
  .vw-panel{max-width:620px;width:100%;background:linear-gradient(180deg,var(--slate-panel),#191d25);border:1px solid var(--iron);border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.5);padding:1.6rem 1.5rem}
  .vw-panel h1{font-family:"Cinzel",serif;font-weight:900;letter-spacing:.04em;font-size:1.5rem;margin:0 0 .3rem}
  .vw-panel p{color:var(--ash);font-size:.9rem;margin:0 0 1.2rem}
  .vw-row{display:flex;gap:.6rem;flex-wrap:wrap;align-items:center;margin-bottom:1rem}
  .vw-btn{font-family:"Cinzel",serif;letter-spacing:.04em;background:linear-gradient(180deg,#2c333e,#222831);color:var(--bone);border:1px solid var(--iron-light);border-radius:9px;padding:.6rem 1rem;cursor:pointer;font-size:.82rem}
  .vw-btn.ember{border-color:var(--ember);color:var(--ember-bright)}
  .vw-file{color:var(--ash);font-size:.82rem}
  .vw-text{width:100%;min-height:200px;font-family:ui-monospace,Menlo,monospace;font-size:.76rem;background:#0e1014;color:var(--bone);border:1px solid var(--iron);border-radius:9px;padding:.7rem;resize:vertical}
  .vw-err{display:none;color:#e8896b;font-size:.82rem;margin:.6rem 0 0;border:1px solid #6b2f22;background:rgba(180,70,40,.1);border-radius:8px;padding:.5rem .7rem}
  .vw-hint{color:var(--ash-dim);font-size:.74rem;margin-top:.8rem}`;
const viewerBody = `
<div class="vw-loader" id="vwLoader">
  <div class="vw-panel">
    <h1>Render a Character</h1>
    <p>Paste or upload a character JSON (a source file from <code>src/characters/</code>, or one exported from the builder). It's compiled and rendered right here — no server.</p>
    <div class="vw-row">
      <label class="vw-btn">Choose file…<input type="file" id="vwFile" accept=".json,application/json" style="display:none"></label>
      <button class="vw-btn ember" id="vwPreview" type="button" style="display:none">Load builder preview</button>
      <a class="vw-btn" href="builder.html">Open builder →</a>
    </div>
    <textarea class="vw-text" id="vwText" placeholder="{ &quot;name&quot;: &quot;…&quot;, &quot;build&quot;: { … } }"></textarea>
    <div class="vw-row" style="margin-top:.8rem"><button class="vw-btn ember" id="vwRender" type="button">Render →</button></div>
    <div class="vw-err" id="vwErr"></div>
    <div class="vw-hint">Tip: link a character with <code>?c=&lt;base64-json&gt;</code>, or come from the builder's Preview button.</div>
  </div>
</div>`;
const viewerHtml = template
  .replace("{{TITLE}}", "Character Viewer")
  .replace("{{STYLES}}", viewerStyles)
  .replace("{{SCRIPT}}", viewerBoot.replace(/<\/script/gi, "<\\/script"))   // escape only inlined script text
  .replace('<header>', viewerBody + "\n<header>");
fs.writeFileSync(path.join(DOCS, "view.html"), viewerHtml);
console.log("built docs/view.html  (" + viewerHtml.length + " bytes)");
buildRules();   // offline rules corpus (docs/rules/) for the in-sheet search

// ---- service worker: precache the rules corpus + serve sheets offline ----
// Versioned per build so a new deploy busts stale corpus/sheet caches.
const swVersion = "dnd-" + Date.now();
const sw = `/* Generated by src/build.mjs — offline cache for the D&D sheets. */
var VERSION = ${JSON.stringify(swVersion)};
var CORE = ["./rules/index.json","./rules/spells.json","./rules/feats.json","./rules/features.json","./rules/glossary.json"];
self.addEventListener("install", function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(VERSION).then(function(c){ return c.addAll(CORE).catch(function(){}); }));
});
self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.map(function(k){ if(k!==VERSION) return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method!=="GET") return;
  var url = new URL(req.url);
  if(url.origin!==location.origin) return;   // leave fonts / Open5e / other origins alone
  if(url.pathname.indexOf("/rules/")>=0){
    // corpus shards: cache-first within the versioned cache (busts on rebuild)
    e.respondWith(caches.open(VERSION).then(function(c){
      return c.match(req).then(function(hit){
        return hit || fetch(req).then(function(r){ if(r&&r.ok) c.put(req, r.clone()); return r; });
      });
    }));
    return;
  }
  // sheets & same-origin assets: network-first, fall back to cache when offline
  e.respondWith(fetch(req).then(function(r){
    if(r&&r.ok){ var copy=r.clone(); caches.open(VERSION).then(function(c){ c.put(req, copy); }); }
    return r;
  }).catch(function(){ return caches.match(req); }));
});
`;
fs.writeFileSync(path.join(DOCS, "sw.js"), sw);
console.log("built docs/sw.js  (" + swVersion + ")");
console.log("done — " + built + " sheet(s).");
