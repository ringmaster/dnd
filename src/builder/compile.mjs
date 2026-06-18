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
const CONTENT = path.join(HERE, "..", "content");
let FEATS = {}, SPELLS = {}, SPECIES = {}, BACKGROUNDS = {};
try { FEATS = JSON.parse(fs.readFileSync(path.join(HERE, "feats.json"), "utf8")); } catch (e) { FEATS = {}; }
try { SPELLS = JSON.parse(fs.readFileSync(path.join(CONTENT, "spells.json"), "utf8")); } catch (e) { SPELLS = {}; }
try { SPECIES = JSON.parse(fs.readFileSync(path.join(CONTENT, "species.json"), "utf8")); } catch (e) { SPECIES = {}; }
try { BACKGROUNDS = JSON.parse(fs.readFileSync(path.join(CONTENT, "backgrounds.json"), "utf8")); } catch (e) { BACKGROUNDS = {}; }

/* resolve an include path ("species:human:resourceful", "background:guide") to a grant */
function resolveInclude(pathStr){
  const p = String(pathStr).split(":");
  if (p[0] === "species" && SPECIES[p[1]] && SPECIES[p[1]].traits && SPECIES[p[1]].traits[p[2]]){
    const tr = SPECIES[p[1]].traits[p[2]];
    return { effects: tr.effects, ref: tr.ref, refId: p[2] };
  }
  if (p[0] === "background" && BACKGROUNDS[p[1]]){
    const b = BACKGROUNDS[p[1]];
    return { effects: b.effects, grantsFeat: b.grantsFeat, ref: b.ref, refId: p[1] };
  }
  return null;
}
/* expand sources into grants, pulling in any include:"..." catalog entries */
function expandGrants(sources){
  const grants = [];
  for (const s of sources){
    grants.push(s);
    for (const inc of [].concat(s.include || [])){ const g = resolveInclude(inc); if (g) grants.push(g); }
  }
  return grants;
}

const sg = n => (n >= 0 ? "+" : "") + n;
function subst(s, t){ return s == null ? s : String(s).replace(/\{dc\}/g, t.dc).replace(/\{atk\}/g, t.atk).replace(/\{mod\}/g, t.mod); }
/* materialize a registry spell into a ref entry, substituting per-character numbers */
function spellRef(reg, t){
  const chips = [{ t: reg.level === 0 ? "Cantrip" : "Level " + reg.level }];
  if (reg.concentration) chips.push({ t: "Concentration", c: "storm" });
  (reg.chips || []).forEach(c => chips.push(c));
  const ref = { title: reg.title || reg.name, chips, body: (reg.body || []).map(b => subst(b, t)) };
  if (reg.level >= 1) ref.level = reg.level;          // cantrips stay info-only (no slot picker)
  if (reg.dice) ref.dice = subst(reg.dice, t);
  if (reg.concentration) ref.concentration = reg.name;
  return ref;
}
/* materialize a generic feature/feat ref (token substitution, no auto chips) */
function matRef(r, t){
  const o = {};
  for (const k in r){
    if (k === "body") o.body = (r.body || []).map(b => subst(b, t));
    else if (k === "dice") o.dice = subst(r.dice, t);
    else if (k === "chips") o.chips = (r.chips || []).map(c => Object.assign({}, c, { t: subst(c.t, t) }));
    else o[k] = r[k];
  }
  return o;
}

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
  const sources = expandGrants((c.build && c.build.sources) || []);
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

  // ---- inject shared content refs (per-character ref still overrides) ----
  const sm = c.spellcasting ? abilMod(c.abilities, c.spellcasting.ability) : 0;
  const t = c.spellcasting
    ? { dc: c.proficiencyBonus + sm + 8, atk: sg(c.proficiencyBonus + sm), mod: sg(sm) }
    : { dc: "", atk: "", mod: "" };
  c.ref = c.ref || {};

  // feat refs (via grantsFeat) + included catalog refs (species traits, backgrounds)
  for (const s of sources){
    const f = s.grantsFeat && FEATS[s.grantsFeat];
    if (f && f.ref){ const rid = f.refId || s.grantsFeat; c.ref[rid] = Object.assign(matRef(f.ref, t), c.ref[rid] || {}); }
    if (s.ref && s.refId){ c.ref[s.refId] = Object.assign(matRef(s.ref, t), c.ref[s.refId] || {}); }
  }

  // spell refs (the per-character ref keeps any overlay like freePool)
  if (c.spellcasting){
    const ids = new Set();
    if (sc){
      (sc.cantrips || []).forEach(s => s.ref && ids.add(s.ref));
      (sc.initiate && sc.initiate.spells || []).forEach(s => s.ref && ids.add(s.ref));
      (sc.always || []).forEach(s => s.ref && ids.add(s.ref));
    }
    if (c.prepared && c.prepared.catalog) c.prepared.catalog.forEach(s => ids.add(s.id));
    const poolOf = {};
    for (const id in pools) if (pools[id].ref){ ids.add(pools[id].ref); poolOf[pools[id].ref] = id; }   // free-cast pool spells
    c.ref = c.ref || {};
    for (const id of ids){
      const reg = SPELLS[id]; if (!reg) continue;
      const ref = spellRef(reg, t);
      if (poolOf[id]) ref.freePool = poolOf[id];   // spell castable free from its pool
      c.ref[id] = Object.assign(ref, c.ref[id] || {});
    }
  }

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
