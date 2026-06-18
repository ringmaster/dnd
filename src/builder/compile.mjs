/* Compile a character's `build.sources` (declarative effects) into the
   materialized fields the engine reads — the single-source-of-truth step.

   Generated fields:
     abilities          <- build.abilities (base) + effects.abilityIncrease
     skillProf          <- effects.skills
     skillExp           <- effects.expertise
     checkMods          <- effects.checkBonus           (val: number | "prof" | "wisMod"…)
     initiativeBonus    <- effects.initiativeBonus
     tools, languages   <- effects.tools / effects.languages
     pools              <- effects.grantsPool           (pool.max may be a formula)
     spellcasting,prepared, and the spellcasting card  <- effects.spellcasting / effects.initiate / effects.alwaysPrepared
   A source may also `grantsFeat:"id"`, pulling that feat's effects from the
   shared feats registry (src/builder/feats.json). */
import fs from "fs";
import path from "path";
import url from "url";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
let FEATS = {};
try { FEATS = JSON.parse(fs.readFileSync(path.join(HERE, "feats.json"), "utf8")); } catch (e) { FEATS = {}; }

const AB = { str:"STR", dex:"DEX", con:"CON", int:"INT", wis:"WIS", cha:"CHA" };
const abilMod = (scores, k) => Math.floor((scores[k] - 10) / 2);
function resolveVal(v, ctx){
  if (typeof v === "number") return v;
  if (v === "prof") return ctx.pb;
  const m = /^([a-z]{3})Mod$/.exec(String(v));
  if (m && AB[m[1]]) return abilMod(ctx.scores, AB[m[1]]);
  return v;
}
function effectsOf(sources){            // flatten a source's own effects + any feat it grants
  const out = [];
  for (const s of sources){
    if (s.effects) out.push(s.effects);
    if (s.grantsFeat && FEATS[s.grantsFeat] && FEATS[s.grantsFeat].effects) out.push(FEATS[s.grantsFeat].effects);
  }
  return out;
}

export function compile(input){
  const c = JSON.parse(JSON.stringify(input));
  const sources = (c.build && c.build.sources) || [];
  if (!sources.length) return c;
  const eff = effectsOf(sources);

  // 1. abilities first (everything else may read final scores)
  if (c.build.abilities){
    const ab = Object.assign({}, c.build.abilities);
    for (const e of eff) if (e.abilityIncrease) for (const k in e.abilityIncrease) ab[k] = (ab[k]||0) + e.abilityIncrease[k];
    c.abilities = ab;
  }
  const ctx = { pb: c.proficiencyBonus, scores: c.abilities };

  // 2. accumulate the rest
  const skills = new Set(), exp = new Set(), tools = new Set(), checkMods = {}, pools = {}, always = [];
  let init = 0, langChoices = 0; const langNames = new Set();
  let spellcasting = null, prepared = null, initiate = null;
  for (const e of eff){
    (e.skills||[]).forEach(x => skills.add(x));
    (e.expertise||[]).forEach(x => exp.add(x));
    (e.tools||[]).forEach(x => tools.add(x));
    if (typeof e.languages === "number") langChoices += e.languages;
    (e.language ? [].concat(e.language) : []).forEach(x => langNames.add(x));
    if (e.checkBonus) for (const a in e.checkBonus) checkMods[a] = (checkMods[a]||0) + resolveVal(e.checkBonus[a], ctx);
    if (e.initiativeBonus != null) init += resolveVal(e.initiativeBonus, ctx);
    if (e.grantsPool){ const p = Object.assign({}, e.grantsPool); const id = p.id; delete p.id; if (p.max != null) p.max = resolveVal(p.max, ctx); pools[id] = p; }
    (e.alwaysPrepared||[]).forEach(a => always.push(typeof a === "string" ? { name:a } : a));
    if (e.spellcasting){ spellcasting = e.spellcasting; (e.spellcasting.slots||[]).forEach(sp => { const p = Object.assign({}, sp); const id = p.id; delete p.id; if (p.max != null) p.max = resolveVal(p.max, ctx); pools[id] = p; }); }
    if (e.initiate) initiate = e.initiate;
  }

  if (skills.size || hadKey(eff, "skills")) c.skillProf = [...skills].sort();
  if (exp.size || hadKey(eff, "expertise")) c.skillExp = [...exp].sort();
  if (Object.keys(checkMods).length) c.checkMods = checkMods; else if (hadKey(eff, "checkBonus")) delete c.checkMods;
  if (hadKey(eff, "initiativeBonus") || c.initiativeBonus != null) c.initiativeBonus = init;
  if (tools.size) c.tools = [...tools].sort();
  if (langChoices || langNames.size) c.languages = { known: [...langNames], choices: langChoices };
  if (Object.keys(pools).length) c.pools = pools;

  // spellcasting card + top-level fields
  const sc = (c.cards||[]).find(x => x.type === "spellcasting");
  if (spellcasting){
    c.spellcasting = { ability: spellcasting.ability };
    if (spellcasting.prepared) c.prepared = spellcasting.prepared;
    if (sc){
      if (spellcasting.slots) sc.slotPools = spellcasting.slots.map(s => s.id);
      else if (spellcasting.slotPool) sc.slotPool = spellcasting.slotPool;
      if (spellcasting.cantrips) sc.cantrips = spellcasting.cantrips;
      if (spellcasting.prepared) sc.prepared = true;
    }
  }
  if (sc && always.length) sc.always = always;
  if (sc && initiate) sc.initiate = initiate;

  return c;
}
function hadKey(eff, k){ return eff.some(e => e[k] != null); }

/* ---- golden test CLI: node compile.mjs --check <golden.json> <character.json>… ---- */
function norm(v){ if (Array.isArray(v)) return v.map(norm); if (v && typeof v === "object"){ const o={}; Object.keys(v).sort().forEach(k => o[k]=norm(v[k])); return o; } return v; }
const eq = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
export function views(c){
  const sc = (c.cards||[]).find(x => x.type === "spellcasting") || null;
  return {
    abilities: c.abilities || {},
    skillProf: [...(c.skillProf||[])].sort(),
    skillExp: [...(c.skillExp||[])].sort(),
    checkMods: c.checkMods || {},
    initiativeBonus: c.initiativeBonus || 0,
    always: sc ? (sc.always || []) : [],
    tools: [...(c.tools||[])].sort(),
    languages: c.languages || null,
    pools: c.pools || {},
    spellcasting: c.spellcasting || null,
    prepared: c.prepared || null,
    spellcastingCard: sc,
  };
}

if (process.argv[2] === "--check"){
  const golden = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
  let ok = true;
  for (const f of process.argv.slice(4)){
    const c = compile(JSON.parse(fs.readFileSync(f, "utf8")));
    const v = views(c), g = golden[c.name];
    console.log("\n=== " + c.name + " ===");
    if (!g){ console.log("  (no golden entry)"); ok = false; continue; }
    for (const k of Object.keys(g)){ const good = eq(v[k], g[k]); if (!good) ok = false; console.log("  " + (good?"✓":"✗") + " " + k + (good ? "" : "\n    golden: " + JSON.stringify(g[k]) + "\n    got:    " + JSON.stringify(v[k]))); }
  }
  console.log("\n" + (ok ? "COMPILE MATCHES GOLDEN ✓" : "DRIFT FROM GOLDEN ✗"));
  process.exit(ok ? 0 : 1);
}
