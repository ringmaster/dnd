/* Effects reconciler (exploration toward the builder).
   Each character may carry an additive `build.sources` list — every feature /
   feat / background / class grant declares its mechanical `effects`. This sums
   them and checks they reproduce the flat fields the engine reads today.

   Vocabulary (effects.*):
     skills:[..]            grant skill proficiencies          -> skillProf
     expertise:[..]         grant expertise                    -> skillExp
     checkBonus:{ABIL:val}  add to checks of an ability         -> checkMods   (val: number | "prof" | "wisMod"…)
     initiativeBonus:val    add to initiative                   -> initiativeBonus
     pool:"id"              grant a resource pool               -> pools[id]
     alwaysPrepared:[..]    spells always prepared              -> spellcasting card `always`
   Captured but NOT yet reconciled (no engine field today):
     tools, languages, feat, grantsSpells, abilityIncrease
   Run: node src/builder/effects.mjs src/characters/*.json */
import fs from "fs";

const AB = { str:"STR", dex:"DEX", con:"CON", int:"INT", wis:"WIS", cha:"CHA" };
const mod = (scores, k) => Math.floor((scores[k] - 10) / 2);
function resolveVal(v, ctx){
  if (typeof v === "number") return v;
  if (v === "prof") return ctx.pb;
  const m = /^([a-z]{3})Mod$/.exec(String(v));
  if (m && AB[m[1]]) return mod(ctx.scores, AB[m[1]]);
  return 0;
}
function setDiff(actualArr, gotSet){
  const exp = new Set(actualArr || []);
  return {
    ok: [...exp].every(x => gotSet.has(x)) && [...gotSet].every(x => exp.has(x)),
    missing: [...exp].filter(x => !gotSet.has(x)),   // on the sheet but no effect produced it
    extra:   [...gotSet].filter(x => !exp.has(x)),   // an effect produced it but it's not on the sheet
  };
}

export function reconcile(file){
  const c = JSON.parse(fs.readFileSync(file, "utf8"));
  const ctx = { pb: c.proficiencyBonus, scores: c.abilities };
  const sources = (c.build && c.build.sources) || [];
  const g = { skills:new Set(), expertise:new Set(), checkMods:{}, init:0, pools:new Set(), always:new Set(), captured:[] };
  for (const s of sources){
    const e = s.effects || {};
    (e.skills||[]).forEach(x => g.skills.add(x));
    (e.expertise||[]).forEach(x => g.expertise.add(x));
    if (e.checkBonus) for (const a in e.checkBonus) g.checkMods[a] = (g.checkMods[a]||0) + resolveVal(e.checkBonus[a], ctx);
    if (e.initiativeBonus != null) g.init += resolveVal(e.initiativeBonus, ctx);
    if (e.pool) g.pools.add(e.pool);
    (e.alwaysPrepared||[]).forEach(x => g.always.add(x));
    for (const k of ["tools","languages","feat","grantsSpells","abilityIncrease"]) if (e[k] != null) g.captured.push((s.id||s.name) + ": " + k + "=" + JSON.stringify(e[k]));
  }
  const sc = (c.cards||[]).find(x => x.type === "spellcasting");
  const actualAlways = sc && sc.always ? sc.always.map(a => a.name) : [];
  const rows = [
    ["skillProf",      setDiff(c.skillProf, g.skills)],
    ["skillExp",       setDiff(c.skillExp, g.expertise)],
    ["pools",          setDiff(Object.keys(c.pools||{}), g.pools)],
    ["alwaysPrepared", setDiff(actualAlways, g.always)],
  ];
  const cmActual = c.checkMods || {}, cmKeys = new Set([...Object.keys(cmActual), ...Object.keys(g.checkMods)]);
  const cmDetail = [...cmKeys].map(k => k + ": sheet " + (cmActual[k]||0) + " / effects " + (g.checkMods[k]||0));
  const cmOk = [...cmKeys].every(k => (cmActual[k]||0) === (g.checkMods[k]||0));
  const initOk = (c.initiativeBonus||0) === g.init;
  return { name:c.name, rows, cm:{ok:cmOk, detail:cmDetail}, init:{ok:initOk, sheet:c.initiativeBonus||0, got:g.init}, captured:g.captured, nSources:sources.length };
}

const files = process.argv.slice(2);
if (!files.length){ console.error("usage: node src/builder/effects.mjs <character.json>…"); process.exit(1); }
let allOk = true;
for (const f of files){
  const r = reconcile(f);
  console.log("\n=== " + r.name + "  (" + r.nSources + " sources) ===");
  for (const [field, d] of r.rows){ if (!d.ok) allOk = false; console.log("  " + (d.ok?"✓":"✗") + " " + field + (d.ok ? "" : "   missing:[" + d.missing + "]  extra:[" + d.extra + "]")); }
  if (!r.cm.ok) allOk = false;   console.log("  " + (r.cm.ok?"✓":"✗") + " checkMods  (" + (r.cm.detail.join("; ")||"none") + ")");
  if (!r.init.ok) allOk = false; console.log("  " + (r.init.ok?"✓":"✗") + " initiativeBonus  (sheet " + r.init.sheet + " / effects " + r.init.got + ")");
  if (r.captured.length){ console.log("  captured, no engine field yet:"); r.captured.forEach(x => console.log("    · " + x)); }
}
console.log("\n" + (allOk ? "ALL RECONCILE ✓" : "MISMATCHES ABOVE ✗"));
