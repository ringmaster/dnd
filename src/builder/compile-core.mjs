/* Pure compile core — no filesystem. Catalogs are passed in as `cat`:
   { feats, spells, species, backgrounds, weapons, armor }.
   Used by compile.mjs (Node, fs-loaded catalogs) and inlined into the static
   viewer (docs/view.html) so a character JSON can be compiled in the browser. */

function mergeWeapon(w, cat){
  const base = (cat.weapons && cat.weapons[w.id]) || {};
  const out = Object.assign({}, base, w);
  if (w.addProps){ out.props = (base.props || []).concat(w.addProps); delete out.addProps; }
  return out;
}
function resolveInclude(pathStr, cat){
  const p = String(pathStr).split(":");
  if (p[0] === "species" && cat.species[p[1]] && cat.species[p[1]].traits && cat.species[p[1]].traits[p[2]]){
    const tr = cat.species[p[1]].traits[p[2]];
    return { effects: tr.effects, ref: tr.ref, refId: p[2] };
  }
  if (p[0] === "background" && cat.backgrounds[p[1]]){
    const b = cat.backgrounds[p[1]];
    return { effects: b.effects, grantsFeat: b.grantsFeat, ref: b.ref, refId: p[1] };
  }
  if (p[0] === "class" && cat.classFeatures && cat.classFeatures[p[1]] && cat.classFeatures[p[1]][p[2]]){
    const f = cat.classFeatures[p[1]][p[2]];
    return { effects: f.effects, ref: f.ref, refId: f.refId || p[2] };
  }
  return null;
}
function expandGrants(sources, cat){
  const grants = [];
  for (const s of sources){
    grants.push(s);
    for (const inc of [].concat(s.include || [])){ const g = resolveInclude(inc, cat); if (g) grants.push(g); }
  }
  return grants;
}
const sg = n => (n >= 0 ? "+" : "") + n;
function subst(s, t){ return s == null ? s : String(s).replace(/\{dc\}/g, t.dc).replace(/\{atk\}/g, t.atk).replace(/\{mod\}/g, t.mod); }
function spellRef(reg, t){
  const chips = [{ t: reg.level === 0 ? "Cantrip" : "Level " + reg.level }];
  if (reg.concentration) chips.push({ t: "Concentration", c: "storm" });
  (reg.chips || []).forEach(c => chips.push(c));
  const ref = { title: reg.title || reg.name, chips, body: (reg.body || []).map(b => subst(b, t)) };
  if (reg.level >= 1) ref.level = reg.level;
  if (reg.dice) ref.dice = subst(reg.dice, t);
  if (reg.concentration) ref.concentration = reg.name;
  return ref;
}
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
/* ----- Magic Initiate: derive effects + description from a {list, ability, cantrips, spell} block ----- */
function cap(s){ return s ? s.charAt(0).toUpperCase()+s.slice(1).toLowerCase() : s; }
function spName(id, cat){ return (cat.spells[id] || {}).name || id; }
function miSub(reg){ if (!reg) return "cantrip"; const bits=["cantrip"]; if (reg.concentration) bits.push("Concentration");
  (reg.chips||[]).forEach(ch => { if (!/^(Cantrip|Level|Concentration|Ritual)/.test(ch.t)) bits.push(ch.t); }); return bits.join(" · "); }
function miEffects(mi, feat, cat){
  const sname = spName(mi.spell, cat);
  return {
    grantsSpells: mi.cantrips.map(id => spName(id, cat)).concat([sname]),
    grantsPool: { id:"mi", label: sname+" — free", max:1, rest:"long", ref:mi.spell, storm:true, note:"long rest", use:"Use free cast", reminder:"Magic Initiate: free cast of "+sname+" (no slot)." },
    initiate: { label: feat.name+" · "+cap(mi.ability), pool:"mi", spells: mi.cantrips.map(id => ({ ref:id, name:spName(id, cat), sub:miSub(cat.spells[id]) })) }
  };
}
function miRef(feat, mi, cat, dc, atk){
  const cnames = mi.cantrips.map(id => spName(id, cat)), sname = spName(mi.spell, cat), ab = cap(mi.ability);
  return {
    title: feat.name,
    chips: [{ t: ab+" casting", c:"storm" }, { t:"DC "+dc+" · atk "+atk }],
    body: [
      "From the "+mi.list+" spell list you know the cantrips "+cnames.join(" and ")+", and the level-1 spell "+sname+". "+ab+" is this feat's spellcasting ability, so your save DC is "+dc+" and your spell attack is "+atk+".",
      "You always have "+sname+" prepared and can cast it once per long rest without a spell slot (or with any slot you have); cantrips are at will. When you gain a level you may swap any of these for another "+mi.list+" spell of the same level."
    ]
  };
}
function featEffects(fe, cat){ return fe ? (fe.magicInitiate ? miEffects(fe.magicInitiate, fe, cat) : fe.effects) : null; }

function effectsOf(sources, cat){
  const out = [];
  for (const s of sources){
    if (s.effects) out.push(s.effects);
    if (s.grantsFeat && cat.feats[s.grantsFeat]){ const e = featEffects(cat.feats[s.grantsFeat], cat); if (e) out.push(e); }
  }
  return out;
}
function hadKey(eff, k){ return eff.some(e => e[k] != null); }

export function compile(input, cat){
  cat = cat || {};
  cat = { feats:cat.feats||{}, spells:cat.spells||{}, species:cat.species||{}, backgrounds:cat.backgrounds||{}, weapons:cat.weapons||{}, armor:cat.armor||{}, classFeatures:cat.classFeatures||{} };
  const FEATS = cat.feats, SPELLS = cat.spells, ARMOR = cat.armor;
  const c = JSON.parse(JSON.stringify(input));
  if (Array.isArray(c.weapons)) c.weapons = c.weapons.map(w => mergeWeapon(w, cat));
  if (c.ac && typeof c.ac.armor === "string"){ const id = c.ac.armor; c.ac.armor = Object.assign({ id }, ARMOR[id]); }
  if (c.ac && Array.isArray(c.ac.armory)) c.ac.armory = c.ac.armory.map(x => typeof x === "string" ? Object.assign({ id:x }, ARMOR[x]) : x);
  const sources = expandGrants((c.build && c.build.sources) || [], cat);
  if (!sources.length) return c;
  const eff = effectsOf(sources, cat);

  if (c.build.abilities){
    const ab = Object.assign({}, c.build.abilities);
    for (const e of eff) if (e.abilityIncrease) for (const k in e.abilityIncrease) ab[k] = (ab[k]||0) + e.abilityIncrease[k];
    c.abilities = ab;
  }
  const ctx = { pb: c.proficiencyBonus, scores: c.abilities };

  const skills = new Set(), exp = new Set(), tools = new Set(), checkMods = {}, pools = {}, always = [];
  let init = 0, langChoices = 0; const langNames = new Set();
  let spellcasting = null, initiate = null;
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

  const sm = c.spellcasting ? abilMod(c.abilities, c.spellcasting.ability) : 0;
  const t = c.spellcasting
    ? { dc: c.proficiencyBonus + sm + 8, atk: sg(c.proficiencyBonus + sm), mod: sg(sm) }
    : { dc: "", atk: "", mod: "" };
  c.ref = c.ref || {};

  for (const s of sources){
    const f = s.grantsFeat && FEATS[s.grantsFeat];
    if (f){
      let fref = f.ref;
      if (f.magicInitiate){ const fsm = abilMod(c.abilities, f.magicInitiate.ability); fref = miRef(f, f.magicInitiate, cat, c.proficiencyBonus + fsm + 8, sg(c.proficiencyBonus + fsm)); }
      if (fref){ const rid = f.refId || s.grantsFeat; c.ref[rid] = Object.assign(matRef(fref, t), c.ref[rid] || {}); }
    }
    if (s.ref && s.refId){ c.ref[s.refId] = Object.assign(matRef(s.ref, t), c.ref[s.refId] || {}); }
  }

  if (c.spellcasting){
    const ids = new Set();
    if (sc){
      (sc.cantrips || []).forEach(s => s.ref && ids.add(s.ref));
      (sc.initiate && sc.initiate.spells || []).forEach(s => s.ref && ids.add(s.ref));
      (sc.always || []).forEach(s => s.ref && ids.add(s.ref));
    }
    if (c.prepared && c.prepared.catalog) c.prepared.catalog.forEach(s => ids.add(s.id));
    const poolOf = {};
    for (const id in pools) if (pools[id].ref){ ids.add(pools[id].ref); poolOf[pools[id].ref] = id; }
    for (const id of ids){
      const reg = SPELLS[id]; if (!reg) continue;
      const ref = spellRef(reg, t);
      if (poolOf[id]) ref.freePool = poolOf[id];
      c.ref[id] = Object.assign(ref, c.ref[id] || {});
    }
  }
  return c;
}

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
