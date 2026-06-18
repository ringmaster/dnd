/* Compile a character's `build.sources` (declarative effects) into the
   materialized fields the engine reads. This is the single-source-of-truth
   step: pools, skill/check grants, and the spellcasting always-prepared list
   are GENERATED from effects instead of hand-authored.

   Generates: skillProf, skillExp, checkMods, initiativeBonus, pools, and the
   spellcasting card's `always` array. Other fields pass through untouched. */

const AB = { str:"STR", dex:"DEX", con:"CON", int:"INT", wis:"WIS", cha:"CHA" };
const abilMod = (scores, k) => Math.floor((scores[k] - 10) / 2);
function resolveVal(v, ctx){
  if (typeof v === "number") return v;
  if (v === "prof") return ctx.pb;
  const m = /^([a-z]{3})Mod$/.exec(String(v));
  if (m && AB[m[1]]) return abilMod(ctx.scores, AB[m[1]]);
  return v; // pass non-formula values (e.g. already-resolved) through
}

export function compile(input){
  const c = JSON.parse(JSON.stringify(input));
  const ctx = { pb: c.proficiencyBonus, scores: c.abilities };
  const sources = (c.build && c.build.sources) || [];
  if (!sources.length) return c;   // un-annotated characters pass through unchanged

  const skills = new Set(), exp = new Set(), checkMods = {}, pools = {}, always = [];
  let init = 0;
  for (const s of sources){
    const e = s.effects || {};
    (e.skills||[]).forEach(x => skills.add(x));
    (e.expertise||[]).forEach(x => exp.add(x));
    if (e.checkBonus) for (const a in e.checkBonus) checkMods[a] = (checkMods[a]||0) + resolveVal(e.checkBonus[a], ctx);
    if (e.initiativeBonus != null) init += resolveVal(e.initiativeBonus, ctx);
    if (e.grantsPool){ const p = Object.assign({}, e.grantsPool); const id = p.id; delete p.id; if (p.max != null) p.max = resolveVal(p.max, ctx); pools[id] = p; }
    (e.alwaysPrepared||[]).forEach(a => always.push(typeof a === "string" ? { name:a } : a));
  }

  c.skillProf = [...skills].sort();
  c.skillExp = [...exp].sort();
  if (Object.keys(checkMods).length) c.checkMods = checkMods; else delete c.checkMods;
  c.initiativeBonus = init;
  if (Object.keys(pools).length) c.pools = pools;
  const sc = (c.cards||[]).find(x => x.type === "spellcasting");
  if (sc && always.length) sc.always = always;
  return c;
}

/* ---- golden test CLI: node compile.mjs --check <golden.json> <character.json>… ---- */
import fs from "fs";
function norm(v){
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === "object"){ const o={}; Object.keys(v).sort().forEach(k => o[k]=norm(v[k])); return o; }
  return v;
}
const eq = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

if (process.argv[2] === "--check"){
  const golden = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
  const files = process.argv.slice(4);
  let ok = true;
  for (const f of files){
    const c = compile(JSON.parse(fs.readFileSync(f, "utf8")));
    const g = golden[c.name];
    if (!g){ console.log("no golden for " + c.name); ok = false; continue; }
    const got = { skillProf:[...(c.skillProf||[])].sort(), skillExp:[...(c.skillExp||[])].sort(), checkMods:c.checkMods||{}, initiativeBonus:c.initiativeBonus||0, pools:c.pools||{}, always:((c.cards||[]).find(x=>x.type==="spellcasting")||{}).always||[] };
    console.log("\n=== " + c.name + " ===");
    for (const k of Object.keys(g)){ const good = eq(got[k], g[k]); if (!good) ok = false; console.log("  " + (good?"✓":"✗") + " " + k + (good?"":"\n    golden: "+JSON.stringify(g[k])+"\n    got:    "+JSON.stringify(got[k]))); }
  }
  console.log("\n" + (ok ? "COMPILE MATCHES GOLDEN ✓" : "DRIFT FROM GOLDEN ✗"));
  process.exit(ok ? 0 : 1);
}
