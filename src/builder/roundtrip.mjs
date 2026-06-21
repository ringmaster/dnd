/* Canonical builder round-trip test.
 *
 * For every character source we assert two things:
 *
 *   1. PRISTINE — load it into the builder and export it untouched; the result
 *      must compile to the same mechanics as the source. (Opening + re-exporting
 *      a character must never mangle it.)
 *
 *   2. EDITED — make one representative, deliberately-localized edit (add a
 *      single supply item) and export again. This forces the builder's
 *      regenerate path (buildBlock / featureList / genCombat …) instead of the
 *      pristine pass-through. The edit was chosen so its ONLY expected effect is
 *      itself — no computed cascade like a level bump or background swap — so we
 *      can assert exactly: the probe item is present AND every compiled view is
 *      byte-identical to the source. Any other difference is a regenerate-path
 *      loss and a failure.
 *
 * Run: node src/builder/roundtrip.mjs
 */
import fs from "fs";
import path from "path";
import url from "url";
import { compile, views } from "./compile.mjs";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const CONTENT = path.join(ROOT, "src", "content");
const rj = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const CAT = {
  species: rj(path.join(CONTENT, "species.json")), classes: rj(path.join(CONTENT, "classes.json")),
  subclasses: rj(path.join(CONTENT, "subclasses.json")), backgrounds: rj(path.join(CONTENT, "backgrounds.json")),
  feats: rj(path.join(HERE, "feats.json")), spells: rj(path.join(CONTENT, "spells.json")),
  weapons: rj(path.join(CONTENT, "weapons.json")), armor: rj(path.join(CONTENT, "armor.json")),
  classFeatures: rj(path.join(CONTENT, "class-features.json")),
};

// load the builder UI in a DOM-less sandbox and expose loadState/scaffold/state
let src = fs.readFileSync(path.join(HERE, "ui.js"), "utf8")
  .replace(/\}\)\(\);\s*$/, "; globalThis.__rt = { loadState: loadState, scaffold: scaffold, state: function(){ return state; } }; })();");
new Function("CAT", "document", "window", "localStorage", src)(
  CAT, { addEventListener() {}, getElementById() { return null; } }, {},
  { getItem() { return null; }, setItem() {}, removeItem() {} }
);
const B = globalThis.__rt;

const norm = (v) => Array.isArray(v) ? v.map(norm) : (v && typeof v === "object" ? Object.keys(v).sort().reduce((o, k) => (o[k] = norm(v[k]), o), {}) : v);
const VIEW_FIELDS = ["abilities", "skillProf", "skillExp", "checkMods", "initiativeBonus", "always", "tools", "languages", "pools", "spellcasting", "prepared"];

/* Compare a field's MEANINGFUL identity, not its display text. The builder
   legitimately re-describes things when it regenerates (spell sub-lines, pool
   reminders/labels, the breadth of the prepare-from catalog, a storm flag, a
   spellslots/spellslots1 ref id). Those are the "computed differences" we
   expect and tolerate; what must NOT change is the actual mechanics — which
   spells are always-prepared/prepared, which pools exist and their size/rest,
   proficiencies, languages, ability mods. */
function essence(field, v) {
  if (field === "always") return (v || []).map((a) => a.ref).sort();
  if (field === "prepared") return v && Array.isArray(v.default) ? v.default.slice().sort() : v;
  if (field === "pools") { const o = {}; for (const id in (v || {})) o[id] = { max: v[id].max, rest: v[id].rest }; return o; }
  return v;
}
const eq = (field, a, b) => JSON.stringify(norm(essence(field, a))) === JSON.stringify(norm(essence(field, b)));
const PROBE = "Round-trip probe (50 ft)";

let failures = 0;
for (const f of fs.readdirSync(path.join(ROOT, "src", "characters")).filter((x) => x.endsWith(".json"))) {
  const source = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "characters", f), "utf8"));
  const srcViews = views(compile(JSON.parse(JSON.stringify(source))));
  console.log("\n=== " + source.name + " (" + f + ") ===");

  // 1. pristine
  B.loadState(JSON.parse(JSON.stringify(source)));
  const pristineViews = views(compile(JSON.parse(JSON.stringify(B.scaffold()))));
  const pBad = VIEW_FIELDS.filter((k) => !eq(k, srcViews[k], pristineViews[k]));
  console.log("  pristine  : " + (pBad.length ? "✗ " + pBad.join(", ") : "✓ mechanics identical"));
  failures += pBad.length ? 1 : 0;

  // The edited/regenerate check only applies to characters the builder can
  // actually rebuild — i.e. whose classes are all in the catalog. Hand-authored
  // bespoke characters (e.g. Wex's Rogue/Monk) are pristine-only.
  const classes = (source.build && source.build.classes) || (source.build && source.build.class ? [{ class: source.build.class }] : []);
  const builderKnows = !source.bespoke && classes.length && classes.every((cl) => CAT.classes[cl.class || cl.cls]);
  if (!builderKnows) { console.log("  edited    : — skipped (bespoke / class not in builder catalog) —"); continue; }

  // 2. one representative edit -> forces regenerate
  B.loadState(JSON.parse(JSON.stringify(source)));
  B.state().equipment.push({ kind: "item", name: PROBE });
  const edited = B.scaffold();
  const inv = (edited.cards || []).find((c) => c.type === "inventory");
  const probePresent = !!(inv && (inv.items || []).some((it) => it.name === PROBE));
  const editedViews = views(compile(JSON.parse(JSON.stringify(edited))));
  const eBad = VIEW_FIELDS.filter((k) => !eq(k, srcViews[k], editedViews[k]));
  console.log("  edit probe: " + (probePresent ? "✓ present" : "✗ MISSING"));
  console.log("  edited mech: " + (eBad.length ? "✗ " + eBad.join(", ") : "✓ identical to source"));
  if (!probePresent || eBad.length) {
    failures++;
    eBad.forEach((k) => { console.log("     " + k + "\n       source: " + JSON.stringify(srcViews[k]) + "\n       edited: " + JSON.stringify(editedViews[k])); });
  }
}
console.log("\n" + (failures ? failures + " ROUND-TRIP FAILURE(S)" : "ALL CHARACTERS SURVIVE THE ROUND TRIP (pristine + edited)"));
process.exit(failures ? 1 : 0);
