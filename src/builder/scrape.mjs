/* Scraper scaffold — pulls structured reference data from external sources and
 * (a) caches raw responses under .cache/ and (b) drives enrichment of the
 * repo's own content. Run manually (it needs network); it is NOT part of the
 * offline `build`, so CI stays deterministic.
 *
 * Sources are pluggable. Each source is an async generator of raw records plus
 * a `normalize(record)` mapping to a uniform shape. Today's live source is the
 * Open5e API (clean JSON, the SRD data); a wikidot HTML source is stubbed in as
 * a template for the categories Open5e lacks (homebrew items, monsters).
 *
 * Usage:
 *   node src/builder/scrape.mjs spells          # cache Open5e spells -> .cache/open5e-spells.json
 *   node src/builder/scrape.mjs enrich-spells   # merge cached metadata into src/content/spells.json
 *   node src/builder/scrape.mjs spells enrich-spells
 */
import fs from "fs";
import path from "path";
import url from "url";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const CACHE = path.join(ROOT, ".cache");
const rj = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const wj = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + "\n");
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

async function getJson(u) {
  const r = await fetch(u, { headers: { "User-Agent": "dnd-sheets-scraper/1.0" } });
  if (!r.ok) throw new Error("HTTP " + r.status + " for " + u);
  return r.json();
}

/* ---- Source: Open5e spells (paginated REST) ---- */
async function fetchOpen5eSpells() {
  let next = "https://api.open5e.com/v1/spells/?limit=100";
  const all = [];
  while (next) {
    process.stdout.write(".");
    const page = await getJson(next);
    all.push(...(page.results || []));
    next = page.next;
  }
  process.stdout.write("\n");
  return all;
}

/* Map an Open5e spell record to the four display fields the sheet renders.
 * `components` keeps the V/S/M letters; `material` rides separately so the UI
 * can show the letters compactly and the material on demand. */
function normSpellMeta(s) {
  const m = {
    range: s.range || "",
    components: s.components || "",
    castTime: s.casting_time || "",
    duration: s.duration || "",
  };
  if (s.material) m.material = s.material;
  if (String(s.ritual).toLowerCase() === "yes" || s.can_be_cast_as_ritual) m.ritual = true;
  // higher_level present ⇒ casting with a higher slot improves the spell
  if (s.higher_level && String(s.higher_level).trim()) m.upcast = true;
  return m;
}

/* ---- Source stub: dnd5e.wikidot.com (HTML) ----
 * Wikidot exposes one page per entry (e.g. /spell:fireball, /wondrous-items).
 * A real implementation fetches the page text and parses the
 * `<div class="page-content">` table rows. Left as a documented template so the
 * magic-item / monster categories can be added without re-deriving the shape. */
// async function fetchWikidot(listPath, parseRow) { /* fetch + regex-parse rows */ }

function cacheSpells(records) {
  fs.mkdirSync(CACHE, { recursive: true });
  // index by normalized name; prefer WOTC/SRD documents when a name collides
  const byName = {};
  const rank = (s) => (/wizards|wotc|srd/i.test(s.document__slug || s.document__title || "") ? 0 : 1);
  for (const s of records) {
    const k = norm(s.name);
    if (!byName[k] || rank(s) < rank(byName[k])) byName[k] = s;
  }
  const meta = {};
  for (const k of Object.keys(byName)) meta[k] = Object.assign({ name: byName[k].name }, normSpellMeta(byName[k]));
  wj(path.join(CACHE, "open5e-spells.json"), meta);
  console.log("cached " + Object.keys(meta).length + " spell metas -> .cache/open5e-spells.json");
  return meta;
}

function enrichSpells() {
  const metaPath = path.join(CACHE, "open5e-spells.json");
  if (!fs.existsSync(metaPath)) { console.error("no cache — run `node src/builder/scrape.mjs spells` first"); process.exit(1); }
  const meta = rj(metaPath);
  const spellsPath = path.join(ROOT, "src", "content", "spells.json");
  const spells = rj(spellsPath);
  let filled = 0; const misses = [];
  for (const id of Object.keys(spells)) {
    const s = spells[id];
    const m = meta[norm(s.name)] || meta[norm(id)];
    if (!m) { misses.push(s.name); continue; }
    // only add display + scaling fields; never touch authored `cast`/`concentration`/`school`
    let touched = false;
    for (const [src, dst] of [["range", "range"], ["components", "components"], ["material", "material"], ["castTime", "castTime"], ["duration", "duration"], ["ritual", "ritual"], ["upcast", "upcast"]]) {
      if (m[src] != null && m[src] !== "" && s[dst] == null) { s[dst] = m[src]; touched = true; }
    }
    if (touched) filled++;
  }
  wj(spellsPath, spells);
  console.log("enriched " + filled + "/" + Object.keys(spells).length + " spells");
  if (misses.length) console.log("no Open5e match (" + misses.length + "): " + misses.join(", "));
}

const cmds = process.argv.slice(2);
if (!cmds.length) { console.log("usage: node src/builder/scrape.mjs [spells] [enrich-spells]"); process.exit(0); }
for (const cmd of cmds) {
  if (cmd === "spells") cacheSpells(await fetchOpen5eSpells());
  else if (cmd === "enrich-spells") enrichSpells();
  else { console.error("unknown command: " + cmd); process.exit(1); }
}
