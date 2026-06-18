/* Shared: derived math. Everything computed from CHARACTER inputs. */
var PB = CHARACTER.proficiencyBonus;
var ABIL_ORDER = ["STR","DEX","CON","INT","WIS","CHA"];
var ABIL_NAME = {STR:"Strength",DEX:"Dexterity",CON:"Constitution",INT:"Intelligence",WIS:"Wisdom",CHA:"Charisma"};
var GOVERNS = {
  STR:"Athletics", DEX:"Acrobatics, Sleight of Hand, Stealth", CON:"—",
  INT:"Arcana, History, Investigation, Nature, Religion",
  WIS:"Animal Handling, Insight, Medicine, Perception, Survival",
  CHA:"Deception, Intimidation, Performance, Persuasion"
};
var SKILL_DEF = [
  ["Acrobatics","DEX"],["Animal Handling","WIS"],["Arcana","INT"],["Athletics","STR"],
  ["Deception","CHA"],["History","INT"],["Insight","WIS"],["Intimidation","CHA"],
  ["Investigation","INT"],["Medicine","WIS"],["Nature","INT"],["Perception","WIS"],
  ["Performance","CHA"],["Persuasion","CHA"],["Religion","INT"],["Sleight of Hand","DEX"],
  ["Stealth","DEX"],["Survival","WIS"]
];
var SKILLS = SKILL_DEF.map(function(d){
  return { name:d[0], ability:d[1],
           prof:(CHARACTER.skillProf||[]).indexOf(d[0])>=0,
           exp:(CHARACTER.skillExp||[]).indexOf(d[0])>=0 };
});
function findSkill(name){ for(var i=0;i<SKILLS.length;i++){ if(SKILLS[i].name===name) return SKILLS[i]; } return null; }

function mod(score){ return Math.floor((score-10)/2); }
function abilMod(k){ return mod(CHARACTER.abilities[k]); }
function fmt(n){ return (n>=0?"+":"")+n; }
function checkMod(k){ return (CHARACTER.checkMods && CHARACTER.checkMods[k]) || 0; }   // e.g. Otherworldly Glamour
function abilCheckMod(k){ return abilMod(k) + checkMod(k); }
function saveMod(k){ return abilMod(k) + (CHARACTER.saves.indexOf(k)>=0?PB:0); }
function skillMod(s){ return abilMod(s.ability) + (s.prof?PB:0) + (s.exp?PB:0) + checkMod(s.ability); }

function weaponAbil(w){
  if(w.ability==="FIN") return abilMod("STR")>=abilMod("DEX") ? "STR" : "DEX";
  return w.ability;
}
function weaponToHitNum(w){ return abilMod(weaponAbil(w)) + (w.proficient===false?0:PB) + (w.atkBonus||0); }
function weaponDmgFlat(w){ return abilMod(weaponAbil(w)) + (w.dmgBonus||0); }
function weaponToHit(w){ return fmt(weaponToHitNum(w)); }
/* damage dice — uses the versatile (two-handed) die when the weapon is wielded with both hands */
function weaponDice(w){
  if(typeof versatileActive==="function" && versatileActive(w)){ var m=(w.props||[]).join(" ").match(/versatile (\d+d\d+)/); if(m) return m[1]; }
  return w.dmgDice;
}
function weaponDmg(w){ return weaponDice(w) + " " + fmt(weaponDmgFlat(w)); }
function critDmg(w){
  var m = (weaponDice(w)||"").match(/^(\d+)d(\d+)$/); if(!m) return weaponDice(w);
  return (parseInt(m[1],10)*2)+"d"+m[2]+fmt(weaponDmgFlat(w));
}

/* AC from the currently-equipped armor + shield + style (state-driven; see sheet.js equipment helpers) */
function computeAC(){
  var dex=abilMod("DEX"), arm=(typeof equippedArmor==="function"?equippedArmor():null), base;
  if(arm){ var dexAdd = arm.addDex ? (arm.dexCap!=null ? Math.min(dex, arm.dexCap) : dex) : 0; base = arm.base + dexAdd; }
  else base = 10 + dex;
  if(state.shield && SHIELD) base += SHIELD.bonus;
  if(state.style && AC_STYLE && arm) base += AC_STYLE.bonus;
  return base;
}
function passivePerception(){ var s=findSkill("Perception"); return 10 + (s ? skillMod(s) : abilMod("WIS")); }
function initiative(){ return abilMod("DEX") + (CHARACTER.initiativeBonus||0); }
function hasSpellcasting(){ return !!CHARACTER.spellcasting; }
function spellDC(){ return 8 + PB + abilMod(CHARACTER.spellcasting.ability); }
function spellAtk(){ return PB + abilMod(CHARACTER.spellcasting.ability); }
