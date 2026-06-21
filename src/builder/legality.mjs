/* Shared character-legality checker.
 *
 * Pure: takes a SOURCE character (the thing with a `build` block — exactly what
 * the builder's scaffold() produces and what ships in src/characters/) plus the
 * content catalogs, and returns a list of rule issues. Because it reads the
 * declarative build.sources, the same function powers the builder's live
 * "Completeness" panel and the round-trip test's "every shipped character is
 * legal" assertion.
 *
 * Each issue: { level: "error" | "warn", msg, anchor }.
 *   error — a rules violation or an unfilled mandatory choice (illegal character)
 *   warn  — something suspicious but not strictly illegal
 * anchor is the id of the builder card the issue points at.
 *
 * A character may opt out entirely with `homebrew: true` or `bespoke: true`.
 *
 * Node:    import { checkLegality } from "./legality.mjs"
 * Browser: build.mjs inlines this with `export` stripped, exposing checkLegality
 *          as a global the builder calls.
 */
export function checkLegality(ch, cat){
  const out = [];
  const add = (level, msg, anchor) => out.push({ level, msg, anchor });
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const featName = id => ((cat.feats || {})[id] || {}).name ? cat.feats[id].name.replace(/\s*\(.*\)$/, "") : id;
  // 2024 point-buy cost table
  const PB = { 8:0, 9:1, 10:2, 11:3, 12:4, 13:5, 14:7, 15:9 };

  if (ch && (ch.homebrew || ch.bespoke)) return out;   // opted out of legality

  const b = ch.build || {};
  const species = b.species;
  const sp = (cat.species || {})[species] || {};
  const bgId = b.background;
  const bg = (cat.backgrounds || {})[bgId] || {};
  const sources = b.sources || [];
  const classes = Array.isArray(b.classes) ? b.classes
    : (b.class ? [{ class: b.class, subclass: b.subclass, level: ch.level }] : []);
  const clsKey = cl => cl.class || cl.cls;

  // ---- a subclass must be chosen once a class reaches its subclass level ----
  classes.forEach(cl => {
    const cd = (cat.classes || {})[clsKey(cl)] || {};
    const scLvl = cd.subclassLevel || 3;
    if ((cl.level || 0) >= scLvl && !cl.subclass)
      add("error", `${cd.name || clsKey(cl)} reaches level ${scLvl} but no subclass is chosen`, "advancement");
  });

  // ---- every reached Ability Score Improvement must be filled ----
  const multi = classes.length > 1;
  classes.forEach(cl => {
    const cd = (cat.classes || {})[clsKey(cl)] || {};
    const asiLevels = cd.asiLevels || [4, 8, 12, 16, 19];
    asiLevels.filter(l => l <= (cl.level || 0)).forEach(l => {
      const key = multi ? clsKey(cl) + ":" + l : String(l);
      const filled = sources.some(s => s.id === "asi-" + key && (s.grantsFeat || (s.effects && s.effects.abilityIncrease)));
      if (!filled) add("error", `Level-${l} Ability Score Improvement is not filled in`, "advancement");
    });
  });

  // ---- a reached Fighting Style must be chosen ----
  const reaches = name => classes.some(cl => {
    const fbl = ((cat.classes || {})[clsKey(cl)] || {}).featuresByLevel || {};
    for (let l = 1; l <= (cl.level || 0); l++) if ((fbl[String(l)] || []).indexOf(name) >= 0) return true;
    return false;
  });
  const hasFightingStyle = sources.some(s => s.id === "fighting-style") || !!(ch.ac && ch.ac.style);
  if (reaches("Fighting Style") && !hasFightingStyle)
    add("error", "Fighting Style is not chosen", "feature-choices");
  // ---- a reached Expertise feature must grant at least one expertise ----
  if ((reaches("Expertise") || reaches("Deft Explorer") || reaches("Scholar"))
      && !sources.some(s => s.effects && s.effects.expertise && s.effects.expertise.length))
    add("error", "Expertise skills are not chosen", "feature-choices");

  // ---- class skills: right count, from the class list, no overlap with background ----
  const bgSkills = (bg.effects && bg.effects.skills) || [];
  const skillSrc = sources.find(s => /-skills$/.test(s.id || ""));
  const classSkills = (skillSrc && skillSrc.effects && skillSrc.effects.skills) || [];
  const primary = classes[0] || {};
  const pcd = (cat.classes || {})[clsKey(primary)] || {};
  const want = (pcd.skillChoices && pcd.skillChoices.count) || 0;
  if (classSkills.length < want)
    add("error", `Choose ${want} ${pcd.name || "class"} skill${want === 1 ? "" : "s"} — only ${classSkills.length} chosen`, "skills");
  if (pcd.skillChoices && pcd.skillChoices.from) classSkills.forEach(s => {
    if (pcd.skillChoices.from.indexOf(s) < 0) add("warn", `${s} isn't on the ${pcd.name} skill list`, "skills");
  });
  classSkills.forEach(s => {
    if (bgSkills.indexOf(s) >= 0) add("error", `${s} is already granted by ${bg.name || "the background"} — pick a different class skill`, "skills");
  });

  // ---- species Skillful: bonus skill must be chosen ----
  const skillfulTrait = Object.keys(sp.traits || {}).find(t => sp.traits[t].grantsSkill);
  if (skillfulTrait) {
    const sfSrc = sources.find(s => (s.include || "").indexOf(":" + skillfulTrait) >= 0 || s.id === skillfulTrait);
    const sfSkill = sfSrc && sfSrc.effects && sfSrc.effects.skills && sfSrc.effects.skills[0];
    if (!sfSkill) add("error", `${sp.name} ${cap(sp.traits[skillfulTrait].name || skillfulTrait)} grants a skill — none chosen`, "feature-choices");
    else if (bgSkills.indexOf(sfSkill) >= 0 || classSkills.indexOf(sfSkill) >= 0)
      add("error", `${sfSkill} (Skillful) duplicates a skill you already have — pick a different one`, "feature-choices");
  }

  // ---- species lineage / ancestry must be chosen (Elf, Gnome, Tiefling, Dragonborn, Goliath) ----
  if (sp.lineage && !sources.some(s => s.id === "lineage"))
    add("error", `${sp.name} ${sp.lineage.label} is not chosen`, "feature-choices");

  // ---- species Versatile: extra Origin feat must be chosen ----
  // recognized either as a builder-style feat-* source or a grantsFeat on the trait's own source
  const versTrait = Object.keys(sp.traits || {}).find(t => sp.traits[t].grantsOriginFeat);
  const hasVersFeat = sources.some(s => s.grantsFeat && (/^feat-/.test(s.id || "") || (s.include || "").indexOf(":" + versTrait) >= 0));
  if (versTrait && !hasVersFeat)
    add("error", `${sp.name} ${cap(sp.traits[versTrait].name || versTrait)} grants an Origin feat — none chosen`, "origin-feat");

  // ---- no feat taken more than once ----
  const feats = [];
  if (bg.grantsFeat) feats.push(bg.grantsFeat);
  sources.forEach(s => { if (s.grantsFeat) feats.push(s.grantsFeat); });
  const seen = {};
  feats.forEach(f => { if (seen[f]) add("error", `Feat “${featName(f)}” is taken more than once`, "advancement"); seen[f] = 1; });

  // ---- base ability scores must be a legal array (standard / heroic / point-buy) ----
  const ab = b.abilities || {};
  const order = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
  const arr = order.map(k => ab[k]).filter(v => v != null);
  if (arr.length === 6) {
    const sorted = arr.slice().sort((a, z) => z - a).join(",");
    const STD = "15,14,13,12,10,8", HEROIC = "17,15,14,12,10,8";
    const pointBuy = arr.every(v => v >= 8 && v <= 15) && arr.reduce((c, v) => c + (PB[v] || 99), 0) <= 27;
    if (sorted !== STD && sorted !== HEROIC && !pointBuy)
      add("error", `Ability scores (${arr.join("/")}) aren't a Standard array, Heroic array, or legal point-buy`, "ability-scores");
  }

  return out;
}
