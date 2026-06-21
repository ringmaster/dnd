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

export function buildRules() {
const spells = rj(path.join(ROOT, "src", "content", "spells.json"));
const feats = rj(path.join(ROOT, "src", "builder", "feats.json"));

function spellDesc(s) {
  const header = (s.level === 0 ? "Cantrip" : "Level " + s.level) + (s.school ? " · " + cap(s.school) : "");
  const cls = (s.classes || []).map(cap).join(", ");
  const lines = ["**" + header + "**" + (cls ? "  \nClasses: " + cls : "")];
  if (s.dice) lines.push("_" + generic(s.dice) + "_");
  if (s.cast) lines.push("Casting time: " + s.cast);
  (s.chips || []).forEach((c) => { /* chips fold into the body context; skip to keep it clean */ });
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

const index = { version: 1, built: spellIndex.length + featIndex.length, entries: spellIndex.concat(featIndex) };

const OUT = path.join(ROOT, "docs", "rules");
fs.mkdirSync(OUT, { recursive: true });
const wj = (name, obj) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj));
wj("index.json", index);
wj("spells.json", spellShard);
wj("feats.json", featShard);
console.log("built docs/rules/  (" + index.entries.length + " entries: " + spellIndex.length + " spells, " + featIndex.length + " feats)");
}

if (process.argv[1] && process.argv[1].endsWith("rules-index.mjs")) buildRules();
