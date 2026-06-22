/* Build the offline rules corpus: a lightweight search index plus per-category
 * data shards, written to docs/rules/. The sheet's search lazy-loads index.json
 * and fetches a shard on demand (cached), so any spell/feat is searchable
 * offline — not just what's on the character.
 *
 * Shard entry shape (uniform, so scraped sources can drop in later):
 *   { id, name, type, sub?, desc }   // desc is markdown shown in the ref modal
 * Index entry shape (compact):
 *   { i:id, n:name, t:type, s:shard, sub? }
 *
 * Run: node src/builder/rules-index.mjs   (or via `npm run rules` / build.mjs)
 */
import fs from "fs";
import path from "path";
import url from "url";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const rj = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const generic = (s) => String(s == null ? "" : s)
  .replace(/\{dc\}/g, "DC").replace(/\bDC DC\b/g, "DC")
  .replace(/\{atk\}/g, "your spell attack").replace(/\{mod\}/g, "your modifier");

// Pull a plain object literal out of an engine JS fragment by brace-matching.
function extractObject(file, marker) {
  const src = fs.readFileSync(file, "utf8");
  const at = src.indexOf(marker);
  if (at < 0) throw new Error("marker not found: " + marker);
  let i = src.indexOf("{", at), depth = 0, inStr = false, q = "", esc = false;
  const start = i;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === q) inStr = false; continue; }
    if (ch === '"' || ch === "'") { inStr = true; q = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { i++; break; } }
  }
  // eslint-disable-next-line no-eval
  return (0, eval)("(" + src.slice(start, i) + ")");
}

// Render a sheet `ref` ({title, chips:[{t}], body:[...]}) as markdown.
function refDesc(ref, header) {
  const lines = [];
  if (header) lines.push("**" + header + "**");
  const chips = (ref.chips || []).map((c) => c.t).filter(Boolean);
  if (chips.length) lines.push("_" + chips.join(" · ") + "_");
  (ref.body || []).forEach((b) => lines.push(generic(b)));
  return lines.join("\n\n");
}

export function buildRules() {
const spells = rj(path.join(ROOT, "src", "content", "spells.json"));
const feats = rj(path.join(ROOT, "src", "builder", "feats.json"));
const classes = rj(path.join(ROOT, "src", "content", "classes.json"));
const classFeatures = rj(path.join(ROOT, "src", "content", "class-features.json"));
const subclasses = rj(path.join(ROOT, "src", "content", "subclasses.json"));
// fold optional content packs in too, so their features are searchable and a
// deleted pack file drops cleanly out of the corpus on rebuild
const PACKDIR = path.join(ROOT, "src", "content", "packs");
if (fs.existsSync(PACKDIR)) {
  for (const pf of fs.readdirSync(PACKDIR).filter((f) => f.endsWith(".json"))) {
    const pack = rj(path.join(PACKDIR, pf));
    for (const sid in (pack.subclasses || {})) if (!subclasses[sid]) subclasses[sid] = pack.subclasses[sid];
  }
}
const glossary = extractObject(path.join(ROOT, "src", "engine", "glossary.js"), "var GLOSSARY = {");

function spellInfoLine(s) {
  const parts = [];
  if (s.castTime) parts.push("Cast " + s.castTime);
  if (s.range) parts.push("Range " + s.range);
  let comp = s.components || "";
  if (s.material) comp = (comp ? comp + " " : "") + "(" + s.material + ")";
  if (comp) parts.push("Components " + comp);
  if (s.duration) parts.push("Duration " + s.duration);
  if (s.ritual) parts.push("Ritual");
  return parts.join("  ·  ");
}
function spellDesc(s) {
  const header = (s.level === 0 ? "Cantrip" : "Level " + s.level) + (s.school ? " · " + cap(s.school) : "");
  const cls = (s.classes || []).map(cap).join(", ");
  const lines = ["**" + header + "**" + (cls ? "  \nClasses: " + cls : "")];
  const info = spellInfoLine(s);
  if (info) lines.push(info);
  if (s.dice) lines.push("_" + generic(s.dice) + "_");
  (s.body || []).forEach((b) => lines.push(generic(b)));
  return lines.join("\n\n");
}

const spellShard = {}, spellIndex = [];
for (const id of Object.keys(spells)) {
  const s = spells[id];
  spellShard[id] = { id, name: s.name, type: "spell", sub: (s.level === 0 ? "Cantrip" : "Lvl " + s.level) + (s.school ? " " + cap(s.school) : ""), desc: spellDesc(s) };
  spellIndex.push({ i: id, n: s.name, t: "spell", s: "spells", sub: spellShard[id].sub });
}

function featDesc(f) {
  if (f.magicInitiate) {
    const mi = f.magicInitiate;
    return "**Origin Feat — Magic Initiate (" + mi.list + ")**\n\nYou learn the cantrips " + (mi.cantrips || []).map((c) => (spells[c] || {}).name || c).join(" and ") +
      ", and the level-1 spell " + ((spells[mi.spell] || {}).name || mi.spell) + " (castable once per long rest without a slot). " + cap(mi.ability) + " is the spellcasting ability.";
  }
  return "**Origin Feat**\n\n" + ((f.ref && f.ref.body) || []).join("\n\n");
}
const featShard = {}, featIndex = [];
for (const id of Object.keys(feats)) {
  const f = feats[id];
  featShard[id] = { id, name: f.name, type: "feat", sub: "Origin feat", desc: featDesc(f) };
  featIndex.push({ i: id, n: f.name, t: "feat", s: "feats", sub: "Origin feat" });
}

// ---- Class & subclass features (so e.g. "Twilight Sanctuary" is searchable
//      even on a character who isn't a Cleric) ----
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 40);
const sub2class = {};
for (const c of Object.keys(classes)) for (const s of (classes[c].subclasses || [])) sub2class[s] = classes[c].name;

const featureShard = {}, featureIndex = [];
const addFeature = (id, name, sub, ref) => {
  let key = id || slug(name);
  while (featureShard[key]) key += "_";
  featureShard[key] = { id: key, name, type: "feature", sub, desc: refDesc(ref, name) };
  featureIndex.push({ i: key, n: name, t: "feature", s: "features", sub });
};
for (const cls of Object.keys(classFeatures)) {
  const cn = (classes[cls] && classes[cls].name) || cap(cls);
  for (const fname of Object.keys(classFeatures[cls])) {
    const f = classFeatures[cls][fname];
    if (!f.ref) continue;
    addFeature(f.refId, f.ref.title || fname, cn + " feature", f.ref);
  }
}
for (const id of Object.keys(subclasses)) {
  const sc = subclasses[id];
  const cn = sc.class || sub2class[id] || "";
  const sub = sc.name + (cn ? " (" + cn + ")" : "") + " feature";
  for (const g of (sc.grants || [])) { if (g.ref) addFeature(g.id, g.ref.title || g.name, sub, g.ref); }
}

// ---- Rules glossary (conditions, actions, core terms) ----
const glossShard = {}, glossIndex = [];
for (const id of Object.keys(glossary)) {
  const g = glossary[id];
  if (!g || !g.term) continue;
  glossShard[id] = { id, name: g.term, type: "rules", sub: "Rules glossary", desc: "**" + g.term + "**\n\n" + generic(g.def) };
  glossIndex.push({ i: id, n: g.term, t: "rules", s: "glossary", sub: "Rules glossary" });
}

const entries = spellIndex.concat(featIndex, featureIndex, glossIndex);
const index = { version: 1, built: entries.length, entries };

const OUT = path.join(ROOT, "docs", "rules");
fs.mkdirSync(OUT, { recursive: true });
const wj = (name, obj) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj));
wj("index.json", index);
wj("spells.json", spellShard);
wj("feats.json", featShard);
wj("features.json", featureShard);
wj("glossary.json", glossShard);
console.log("built docs/rules/  (" + index.entries.length + " entries: " + spellIndex.length + " spells, " +
  featIndex.length + " feats, " + featureIndex.length + " features, " + glossIndex.length + " rules)");
}

if (process.argv[1] && process.argv[1].endsWith("rules-index.mjs")) buildRules();
