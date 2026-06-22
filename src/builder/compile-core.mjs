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
// Spell chip colors follow ONE convention, enforced here so authored data can't
// drift. A chip is gray unless it names something you TRACK or that CHANGES A
// ROLL — never for static stat-block facts:
//   gray  = printed facts: range, area, target, shape, duration, casting time
//   storm = a casting constraint worth flagging: Concentration, Ritual
//   ember = a tactical effect that alters an outcome (Auto-hit, Ignores cover,
//           Grants Advantage, No reactions, damage riders) — author opt-in
// Anything that reads as a standard descriptor is forced gray; only chips the
// author accented AND that aren't standard descriptors keep their ember accent.
const CHIP_CONSTRAINT = /\b(concentration|ritual)\b/i;
const CHIP_STANDARD = /\b(ft|feet|foot|touch|self|sight|unlimited|radius|cone|cube|sphere|cylinder|line|wall|column|square|mile|miles|aura|void|fly|range|ranged|instantaneous|action|reaction|hour|hours|hr|minute|minutes|min|round|rounds|day|days|week|weeks|permanent|special)\b/i;
function normChips(chips){
  const out = [];
  for (const c of (chips || [])){
    const text = (c && c.t != null) ? String(c.t).trim() : "";
    if (!text) continue;                              // drop dangling colorless/textless cruft
    let col;
    if (CHIP_CONSTRAINT.test(text)) col = "storm";    // Concentration / Ritual → flagged
    else if (CHIP_STANDARD.test(text)) col = undefined; // static stat-block fact → gray
    else col = c.c;                                   // standout effect keeps its authored accent
    out.push(col ? { t: text, c: col } : { t: text });
  }
  return out;
}
// One consistent "casting · range · components · duration" line for a spell,
// shown wherever a known spell is displayed. Same shape used by the corpus.
function spellInfoLine(reg){
  const parts = [];
  if (reg.castTime) parts.push("Cast " + reg.castTime);
  if (reg.range) parts.push("Range " + reg.range);
  let comp = reg.components || "";
  if (reg.material) comp = (comp ? comp + " " : "") + "(" + reg.material + ")";
  if (comp) parts.push("Components " + comp);
  if (reg.duration) parts.push("Duration " + reg.duration);
  if (reg.ritual) parts.push("Ritual");
  return parts.join("  ·  ");
}
function spellRef(reg, t, classLabel){
  // Lead chip names the spell the way it appears on this character: "Cleric 3",
  // "Wizard cantrip", or just "Level 3" when no class on the sheet grants it.
  const lvlWord = reg.level === 0 ? "cantrip" : reg.level;
  const lead = classLabel ? classLabel + " " + lvlWord : (reg.level === 0 ? "Cantrip" : "Level " + reg.level);
  const raw = [{ t: lead }];
  if (reg.school) raw.push({ t: cap(reg.school) });
  if (reg.concentration) raw.push({ t: "Concentration", c: "storm" });
  (reg.chips || []).forEach(c => raw.push(c));
  const ref = { title: reg.title || reg.name, chips: normChips(raw), body: (reg.body || []).map(b => subst(b, t)) };
  if (reg.level >= 1) ref.level = reg.level;
  if (reg.dice) ref.dice = subst(reg.dice, t);
  if (reg.concentration) ref.concentration = reg.name;
  const info = spellInfoLine(reg);
  if (info) ref.info = info;
  if (reg.upcast) ref.upcast = true;   // casting with a higher slot improves it
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

/* Combat Mode is derived, not authored: it falls out of the carried weapons,
   the spellcasting ability, and the character's features (surfaced as pools).
   The sheet still injects *prepared* spells (which change at runtime) by cast
   time; this provides the static scaffold + always-on/free-cast moves. */
const COMBAT_MOVES = {
  actionsurge:     { cost:"Action",       label:"Action Surge",     detail:"take one extra action" },
  channeldivinity: { cost:"Action",       label:"Channel Divinity", detail:"Divine Spark / Turn Undead" },
  secondwind:      { cost:"Bonus Action", label:"Second Wind",      detail:"regain HP" },
  stonecunning:    { cost:"Bonus Action", label:"Stonecunning",     detail:"tremorsense 60 ft for 10 min" },
};
const ANYTIME_MOVES = {
  lucky:       [{ cost:"Reaction", label:"Lucky — impose Disadvantage", detail:"on an attack against you" },
                { cost:"Anytime (a d20 Test)", label:"Lucky — gain Advantage", detail:"on your d20 Test" }],
  inspiration: [{ cost:"Anytime (a d20 Test)", label:"Heroic Inspiration — reroll", detail:"keep either result" }],
};
const ACTION_MORE = [["Dash","dash"],["Disengage","disengage"],["Dodge","dodge"],["Hide","hide"],["Help","help"],["Search","search"],["Ready","ready-action"]].map(x => ({ label:x[0], gloss:x[1] }));
function deriveCombat(c, cat){
  const SPELLS = cat.spells || {}, pools = c.pools || {}, caster = !!c.spellcasting;
  const by = { "Action":[], "Bonus Action":[], "Reaction":[], "Anytime (a d20 Test)":[] };
  (c.weapons || []).filter(w => w.carried && w.dmgDice).forEach(w => by["Action"].push({ label:"Attack — "+w.name, weapon:w.id }));
  for (const pid in pools){
    const ref = pools[pid].ref;
    if (SPELLS[ref]){ const sp = SPELLS[ref], cost = sp.cast || "Action"; if (by[cost]) by[cost].push({ label:"Cast "+sp.name, ref, spellLevel:sp.level, freePool:pid, detail:"free cast" }); }
    else if (COMBAT_MOVES[ref]){ const m = COMBAT_MOVES[ref]; by[m.cost].push({ label:m.label, ref, pool:pid, detail:m.detail }); }
    else if (ANYTIME_MOVES[ref]){ ANYTIME_MOVES[ref].forEach(m => by[m.cost].push({ label:m.label, ref, pool:pid, detail:m.detail })); }
  }
  const groups = [];
  if (by["Action"].length || caster) groups.push({ cost:"Action", more: ACTION_MORE, moves: by["Action"] });
  if (by["Bonus Action"].length || caster) groups.push({ cost:"Bonus Action", moves: by["Bonus Action"] });
  groups.push({ cost:"Movement", moves:[{ label:"Move", detail:"up to your Speed ("+(c.speed||30)+" ft)" }] });
  groups.push({ cost:"Reaction", reaction:true, moves:[{ label:"Opportunity Attack", gloss:"opportunity-attack", detail:"one melee attack when a foe leaves your reach" }].concat(by["Reaction"]) });
  if (by["Anytime (a d20 Test)"].length) groups.push({ cost:"Anytime (a d20 Test)", moves: by["Anytime (a d20 Test)"] });
  const note = "Your turn: <b>Move</b> up to your Speed, take <b>one Action</b>, and <b>one Bonus Action</b>. You also get one <button class=\"gloss-term\" data-gloss=\"reaction\" type=\"button\">Reaction</button>, used when its trigger happens (often on someone else’s turn).";
  return { note, groups };
}

export function compile(input, cat){
  cat = cat || {};
  cat = { feats:cat.feats||{}, spells:cat.spells||{}, species:cat.species||{}, backgrounds:cat.backgrounds||{}, weapons:cat.weapons||{}, armor:cat.armor||{}, classFeatures:cat.classFeatures||{} };
  const FEATS = cat.feats, SPELLS = cat.spells, ARMOR = cat.armor;
  const c = JSON.parse(JSON.stringify(input));
  if (Array.isArray(c.weapons)) c.weapons = c.weapons.map(w => mergeWeapon(w, cat));
  if (c.ac && typeof c.ac.armor === "string"){ const id = c.ac.armor; c.ac.armor = Object.assign({ id }, ARMOR[id]); }
  if (c.ac && Array.isArray(c.ac.armory)) c.ac.armory = c.ac.armory.map(x => typeof x === "string" ? Object.assign({ id:x }, ARMOR[x]) : x);
  // stamp explicit identity so a compiled (build-stripped) character still
  // names its class/species/subclass — never inferred from stats. `classes`
  // carries the full multiclass breakdown; class/subclass fall back to the first.
  if (c.build) {
    const mc = Array.isArray(c.build.classes) ? c.build.classes : null;
    c.identity = {
      species: c.build.species || null,
      class: c.build.class || (mc && mc[0] && mc[0].class) || null,
      subclass: c.build.subclass || (mc && mc[0] && mc[0].subclass) || null,
      background: c.build.background || null,
      classes: mc,
    };
  }
  // proficiency bonus follows total character level (sum of multiclass levels)
  if (c.proficiencyBonus == null && c.level) c.proficiencyBonus = Math.floor((c.level - 1) / 4) + 2;
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
  let spellcasting = null, initiate = null, innateAbility = null;
  const resist = new Set(), immune = new Set(), speeds = {};
  for (const e of eff){
    (e.resistances||[]).forEach(x => resist.add(x));
    (e.immunities||[]).forEach(x => immune.add(x));
    if (e.speeds) for (const m in e.speeds){ const v = e.speeds[m]; if (m === "hover") speeds.hover = speeds.hover || !!v; else speeds[m] = Math.max(speeds[m] || 0, resolveVal(v, ctx)); }
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
    // general innate/granted spellcasting (lineages, racial traits, future feats):
    // known cantrips + level-gated leveled spells castable free 1x/long rest (or with a slot).
    if (e.spellGrants){ const g = e.spellGrants;
      const ab = Array.isArray(g.ability) ? g.ability.slice().sort((x,y) => abilMod(c.abilities, y) - abilMod(c.abilities, x))[0] : g.ability;
      if (ab && !innateAbility) innateAbility = ab;
      const lbl = g.label ? g.label + " · " : "";
      (g.cantrips||[]).forEach(id => always.push({ ref:id, name:spName(id, cat), sub: lbl + "cantrip" }));
      (g.leveled||[]).forEach(L => { if ((c.level||0) >= (L.level||1)) {
        const prof = L.uses === "prof", max = prof ? c.proficiencyBonus : 1;
        always.push({ ref:L.spell, name:spName(L.spell, cat), sub: lbl + (prof ? "free (Prof/long rest)" : "free 1×/long rest") });
        pools["ig" + L.spell] = { label: spName(L.spell, cat) + " — free", max, rest:"long", ref:L.spell, storm:true, note:"long rest", use:"Use free cast", reminder:(g.label||"Innate Magic") + ": free cast of " + spName(L.spell, cat) + " (no slot)." };
      }});
    }
  }

  if (skills.size || hadKey(eff, "skills")) c.skillProf = [...skills].sort();
  if (exp.size || hadKey(eff, "expertise")) c.skillExp = [...exp].sort();
  if (Object.keys(checkMods).length) c.checkMods = checkMods; else if (hadKey(eff, "checkBonus")) delete c.checkMods;
  if (hadKey(eff, "initiativeBonus") || c.initiativeBonus != null) c.initiativeBonus = init;
  if (tools.size) c.tools = [...tools].sort();
  // immunity supersedes resistance to the same type
  if (immune.size) c.immunities = [...immune].sort();
  if (resist.size){ const r = [...resist].filter(x => !immune.has(x)).sort(); if (r.length) c.resistances = r; }
  if (Object.keys(speeds).length) c.speeds = speeds;
  if (langChoices || langNames.size) c.languages = { known: [...langNames], choices: langChoices };
  if (Object.keys(pools).length) c.pools = pools;
  // hit dice are implied by class + level — synthesize the pool unless authored.
  // hitDice (array of {die,count}) supports multiclass (e.g. 10d10 + 6d6); a
  // single hitDie + level is the single-class shorthand.
  if (!(c.pools && c.pools.hd)) {
    const con = abilMod(c.abilities || {}, "CON");
    let pool = null;
    if (Array.isArray(c.hitDice) && c.hitDice.length) {
      const total = c.hitDice.reduce((n, h) => n + (h.count || 0), 0);
      const mix = c.hitDice.map(h => h.count + h.die).join(" + ");
      pool = { label: "Hit Dice", max: total, rest: "long", ref: "hitdice", storm: false, note: mix + " (" + sg(con) + " each) · short rest", use: "Use", reminder: "Hit Die: spend one, roll its die " + sg(con) + ", then add it with Heal." };
    } else if (c.hitDie && c.level) {
      const heal = "1" + c.hitDie + sg(con);
      pool = { label: "Hit Dice", max: c.level, rest: "long", ref: "hitdice", storm: false, note: heal + " · short rest", use: "Use", reminder: "Hit Die: roll " + heal + ", then add it with Heal." };
    }
    if (pool) { c.pools = c.pools || {}; c.pools.hd = pool; }
  }

  let sc = (c.cards||[]).find(x => x.type === "spellcasting");
  if (spellcasting){
    c.spellcasting = { ability: spellcasting.ability };
    if (spellcasting.prepared) c.prepared = spellcasting.prepared;
    if (sc){
      if (spellcasting.slots) sc.slotPools = spellcasting.slots.map(s => s.id);
      else if (spellcasting.slotPool) sc.slotPool = spellcasting.slotPool;
      if (spellcasting.cantrips) sc.cantrips = spellcasting.cantrips;
      if (spellcasting.prepared) sc.prepared = true;
    }
  } else if (innateAbility){
    c.spellcasting = { ability: innateAbility };   // a non-caster with innate spells still has a casting ability
  }
  // a non-caster with innate magic gets a spellcasting card to render it
  if (!sc && c.spellcasting && always.length){ sc = { type:"spellcasting", title:"Innate Magic" }; (c.cards = c.cards || []).push(sc); }
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
    const myClasses = (Array.isArray(c.build && c.build.classes) ? c.build.classes.map(x => x.class) : [c.build && c.build.class]).filter(Boolean);
    for (const id of ids){
      const reg = SPELLS[id]; if (!reg) continue;
      const onMy = (reg.classes || []).filter(cl => myClasses.includes(cl));
      const classLabel = onMy.length ? cap(onMy[0]) : null;
      const ref = spellRef(reg, t, classLabel);
      if (poolOf[id]) ref.freePool = poolOf[id];
      c.ref[id] = Object.assign(ref, c.ref[id] || {});
    }
  }
  c.combat = c.combat || deriveCombat(c, cat);   // authored block wins; otherwise derive
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
