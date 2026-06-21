/* Character builder UI. Reads the inlined CAT (content catalogs) and drives a
   live form: selections -> derived stats + a build block ready to drop into
   src/characters/. Vanilla browser JS, no dependencies. */
(function(){
  var ABIL = ["STR","DEX","CON","INT","WIS","CHA"];
  var ABIL_NAME = {STR:"Strength",DEX:"Dexterity",CON:"Constitution",INT:"Intelligence",WIS:"Wisdom",CHA:"Charisma"};
  var SKILL_ABIL = {Acrobatics:"DEX","Animal Handling":"WIS",Arcana:"INT",Athletics:"STR",Deception:"CHA",History:"INT",Insight:"WIS",Intimidation:"CHA",Investigation:"INT",Medicine:"WIS",Nature:"INT",Perception:"WIS",Performance:"CHA",Persuasion:"CHA",Religion:"INT","Sleight of Hand":"DEX",Stealth:"DEX",Survival:"WIS"};
  var DIE_AVG = {d6:4, d8:5, d10:6, d12:7};
  var DIE_MAX = {d6:6, d8:8, d10:10, d12:12};
  var SPEED = {human:30, dwarf:30, halfling:30, elf:30};

  var ASI_LEVELS = [4,8,12,16,19];
  var state = {
    // classes is the canonical multiclass breakdown; cls/subclass/level are kept
    // in sync as the PRIMARY class + TOTAL level (syncPrimary) for single-class code
    classes:[{cls:"ranger", subclass:"", level:4}],
    name:"New Hero", species:"human", cls:"ranger", subclass:"", background:"guide", level:4,
    base:{STR:15,DEX:14,CON:13,INT:12,WIS:10,CHA:8},
    skills:[], originFeat:"", asis:{}, masteries:[], cantrips:[], prepared:[],
    equipment:[],          // unified inventory: {kind:'weapon'|'armor'|'shield'|'item', id?, name}
    languages:[],          // known languages (resolved, not "choices")
    choices:{ style:"", expertise:[], order:"", skillful:"", lineage:"" },
    bio:"",               // Background-card story text (paragraphs separated by blank lines)
    homebrew:false,       // when true, legality issues are non-blocking and the export is flagged homebrew
    bespoke:false,        // hand-authored character with custom, not-necessarily-RAW content (legality waived)
    homebrewNote:"",      // optional explanation shown on the sheet banner
    customs:[]            // structured carriers for anything the builder doesn't model (see captureCustoms)
  };
  /* top-level keys the builder owns/regenerates; everything else on a loaded
     character is captured as a custom "root" element so it survives round-trip.
     `ref` is here because compile() auto-generates the reference modals from the
     build sources; `combat` because the builder now generates a combat block. */
  var KNOWN_ROOT = {id:1,out:1,name:1,subtitle:1,portrait:1,title:1,footer:1,storageKey:1,level:1,hitDie:1,proficiencyBonus:1,saves:1,checkModNote:1,speed:1,ac:1,hp:1,masteryMax:1,masteryDefault:1,rest:1,studs:1,weapons:1,cards:1,riderHead:1,hitRiders:1,combat:1,ref:1,build:1,identity:1,homebrew:1,bespoke:1,homebrewNote:1,hitDice:1,
    // fields compile() DERIVES from the build sources — decomposed back into the
    // form (see decompose()), never kept as opaque custom blobs
    abilities:1,always:1,cantrips:1,checkMods:1,initiate:1,initiativeBonus:1,languages:1,pools:1,prepared:1,skillExp:1,skillProf:1,slotPool:1,slotPools:1,spellcasting:1,tools:1};
  /* card types the builder generates; loaded cards of any other type are kept as custom "card" elements */
  var MANAGED_CARDS = {abilities:1,hitpoints:1,attacks:1,spellcasting:1,skills:1,pools:1,inventory:1,features:1,background:1,buildlog:1};
  var CUSTOM_KINDS = {root:"Top-level field", source:"Build source / feature", card:"Card"};
  var FIGHTING_STYLES=[
    {id:"archery", name:"Archery", note:"+2 to ranged weapon attack rolls"},
    {id:"defense", name:"Defense", note:"+1 AC while wearing armor"},
    {id:"dueling", name:"Dueling", note:"+2 damage with a one-handed melee weapon"},
    {id:"greatweapon", name:"Great Weapon Fighting", note:"reroll 1s and 2s on two-handed/versatile damage"},
    {id:"twoweapon", name:"Two-Weapon Fighting", note:"add your ability modifier to the off-hand attack's damage"},
    {id:"protection", name:"Protection", note:"Reaction: impose Disadvantage on an attack against a nearby ally"}
  ];
  function proficientSkills(){ var set={}, bg=CAT.backgrounds[state.background]; if(bg&&bg.effects&&bg.effects.skills) bg.effects.skills.forEach(function(s){set[s]=1;}); state.skills.forEach(function(s){set[s]=1;}); return Object.keys(set).sort(); }
  function featureLevel(name){ var fbl=classData().featuresByLevel||{}; for(var l=1;l<=20;l++){ if((fbl[String(l)]||[]).indexOf(name)>=0) return l; } return 1; }
  /* How many Expertise skills the character may choose: Deft Explorer/Scholar grant 1 each;
     a Rogue/Bard "Expertise" feature grants 2 each time it's gained (Rogue 1 & 6, Bard 2 & 9). */
  function expertiseCount(){ var n=0; state.classes.forEach(function(cl){ var fbl=(CAT.classes[cl.cls]||{}).featuresByLevel||{};
    for(var l=1;l<=cl.level;l++) (fbl[String(l)]||[]).forEach(function(nm){ if(nm==="Deft Explorer"||nm==="Scholar") n+=1; else if(nm==="Expertise") n+=2; }); }); return n; }
  function needsExpertise(){ return expertiseCount()>0; }
  function classAsiLevels(cls){ return (CAT.classes[cls]||{}).asiLevels || ASI_LEVELS; }
  /* ASI "slots" — per class at its own ASI levels. Each slot has a stable key
     (the level number for single-class back-compat; class:level for multiclass)
     used for state.asis + the asi-<key> source id. */
  function reachedASIs(){
    var multi=state.classes.length>1, out=[];
    state.classes.forEach(function(cl){ classAsiLevels(cl.cls).forEach(function(al){ if(al<=cl.level){
      out.push(multi ? { key:cl.cls+":"+al, lvl:al, label:((CAT.classes[cl.cls]||{}).name||cl.cls)+" "+al }
                     : { key:String(al), lvl:al, label:"Level "+al }); } }); });
    return out;
  }
  function asiDefault(){ return { mode:"asi2", a:(classData().priority||ABIL)[0], b:(classData().priority||ABIL)[1], feat:"" }; }

  function mod(s){ return Math.floor((s-10)/2); }
  function fmt(n){ return (n>=0?"+":"")+n; }
  function pbForLevel(l){ return Math.floor((l-1)/4) + 2; }
  function el(tag, attrs, kids){ var e=document.createElement(tag); attrs=attrs||{};
    for(var k in attrs){ var v=attrs[k];
      if(v==null || v===false) continue;                                  // skip absent attrs (don't set disabled="null"!)
      if(k==="class") e.className=v; else if(k==="html") e.innerHTML=v; else if(k==="text") e.textContent=v;
      else if(k.slice(0,2)==="on") e.addEventListener(k.slice(2), v);
      else if(v===true) e.setAttribute(k, "");                            // boolean attr
      else e.setAttribute(k, v);
    }
    (kids||[]).forEach(function(c){ if(c) e.appendChild(c); }); return e; }
  function opt(v, label, sel, dis){ return el("option", {value:v, text:label, selected: sel?"selected":null, disabled: dis?"disabled":null}); }
  function titleCase(s){ return String(s).split(/[-_ ]+/).map(function(w){ return w ? w.charAt(0).toUpperCase()+w.slice(1) : w; }).join(" "); }

  /* ----- inventory helpers (state.equipment is the single source of truth) ----- */
  function eqOf(kind){ return state.equipment.filter(function(e){ return e.kind===kind; }); }
  function eqWeaponIds(){ return eqOf("weapon").map(function(e){ return e.id; }).filter(function(id){ return CAT.weapons[id]; }); }
  function eqArmorIds(){ return eqOf("armor").map(function(e){ return e.id; }).filter(function(id){ return CAT.armor[id]; }); }
  function eqHasShield(){ return eqOf("shield").length>0; }
  function eqItems(){ return eqOf("item"); }
  /* best (highest base AC) owned armor — the sheet's default-worn piece */
  function bestArmorId(){ var ids=eqArmorIds(); if(!ids.length) return ""; return ids.slice().sort(function(a,b){ return (CAT.armor[b].base||0)-(CAT.armor[a].base||0); })[0]; }

  /* ----- derived values from current state ----- */
  function abilityIncreases(){
    var inc = {};
    var bg = CAT.backgrounds[state.background];
    if(bg && bg.effects && bg.effects.abilityIncrease) for(var k in bg.effects.abilityIncrease) inc[k]=(inc[k]||0)+bg.effects.abilityIncrease[k];
    return inc;
  }
  function asiIncreases(){
    var inc={};
    reachedASIs().forEach(function(slot){ var a=state.asis[slot.key]; if(!a) return;
      if(a.mode==="asi2" && a.a){ inc[a.a]=(inc[a.a]||0)+2; }
      else if(a.mode==="asi11"){ if(a.a) inc[a.a]=(inc[a.a]||0)+1; if(a.b) inc[a.b]=(inc[a.b]||0)+1; }
    });
    return inc;
  }
  function totalIncreases(){ var bg=abilityIncreases(), asi=asiIncreases(), out={}; ABIL.forEach(function(k){ var v=(bg[k]||0)+(asi[k]||0); if(v) out[k]=v; }); return out; }
  function finalScores(){
    var inc = totalIncreases(), out={};
    ABIL.forEach(function(a){ out[a] = (state.base[a]||10) + (inc[a]||0); });
    return out;
  }
  function classData(){ return CAT.classes[state.cls] || {}; }
  /* keep the primary-class mirror (cls/subclass) and total level in sync with the
     canonical state.classes breakdown — single-class code reads the mirror */
  function syncPrimary(){ if(!state.classes||!state.classes.length) state.classes=[{cls:"ranger",subclass:"",level:1}];
    var p=state.classes[0]; state.cls=p.cls; state.subclass=p.subclass||""; state.level=state.classes.reduce(function(n,x){return n+(x.level||0);},0); }
  function grantedSkills(){
    var set = {};
    var bg = CAT.backgrounds[state.background];
    if(bg && bg.effects && bg.effects.skills) bg.effects.skills.forEach(function(s){ set[s]="background"; });
    state.skills.forEach(function(s){ if(!set[s]) set[s]="class"; });
    return set;
  }
  /* skills proficiency is auto-granted (locked) — not a class choice — by the
     background, a species trait, a class feature, or a subclass grant */
  function autoSkills(){
    var set={};
    function add(skills, label){ (skills||[]).forEach(function(s){ if(!set[s]) set[s]=label; }); }
    var bg=CAT.backgrounds[state.background]; if(bg&&bg.effects) add(bg.effects.skills, "background");
    var sp=CAT.species[state.species];
    if(sp) Object.keys(sp.traits||{}).forEach(function(tr){ var t=sp.traits[tr]; if(t.effects) add(t.effects.skills, sp.name); });
    var cf=(CAT.classFeatures||{})[state.cls]||{}, fbl=classData().featuresByLevel||{};
    for(var l=1;l<=state.level;l++) (fbl[String(l)]||[]).forEach(function(name){ var f=cf[name]; if(f&&f.effects) add(f.effects.skills, name); });
    subclassGrants().forEach(function(g){ if(g.effects) add(g.effects.skills, (CAT.subclasses[state.subclass]||{}).name||"subclass"); });
    if(speciesSkillTrait() && state.choices.skillful) add([state.choices.skillful], (CAT.species[state.species]||{}).name+" Skillful");
    return set;
  }
  function derive(){
    var sc = finalScores(), pb = pbForLevel(state.level), cd = classData();
    var d = { scores:sc, pb:pb, mods:{} };
    ABIL.forEach(function(a){ d.mods[a]=mod(sc[a]); });
    d.saves = (cd.saves||[]);
    // AC preview from the best owned armor (+ shield + Defense) — the sheet lets
    // you change what's actually equipped
    var armId = bestArmorId(), arm = armId && CAT.armor[armId];
    if(arm){ var dex=d.mods.DEX; var dadd = arm.addDex ? (arm.dexCap!=null?Math.min(dex,arm.dexCap):dex) : 0; d.ac = arm.base + dadd; d.acNote = arm.label; }
    else { d.ac = 10 + d.mods.DEX; d.acNote = "No armor (10 + Dex)"; }
    if(eqHasShield()){ d.ac += 2; d.acNote += " + shield"; }
    if(arm && state.choices.style==="defense"){ d.ac += 1; d.acNote += " + Defense"; }
    // HP (average): first character level = max die + CON; every other level =
    // that class's average die + CON. (Single-class reduces to the old formula.)
    var dice=[]; state.classes.forEach(function(cl){ var dd=(CAT.classes[cl.cls]||{}).hitDie||"d8"; for(var i=0;i<cl.level;i++) dice.push(dd); });
    d.hp = dice.reduce(function(h,dd,idx){ return h + (idx===0?(DIE_MAX[dd]||8):(DIE_AVG[dd]||5)) + d.mods.CON; }, 0);
    d.initiative = d.mods.DEX + (hasFeat("alert")?pb:0);
    var perProf = !!grantedSkills()["Perception"];
    d.passivePer = 10 + d.mods.WIS + (perProf?pb:0);
    var sp=primaryCaster(); if(sp && sp.ability){ var sm=d.mods[sp.ability]; d.spellDC=8+pb+sm; d.spellAtk=pb+sm; d.spellAbility=sp.ability; }
    d.speed = SPEED[state.species] || 30;
    d.hitDie = cd.hitDie || "d8";   // primary class hit die (single-class shorthand)
    return d;
  }
  function hasFeat(id){
    var bg = CAT.backgrounds[state.background];
    if(bg && bg.grantsFeat===id) return true;
    if(state.originFeat===id) return true;
    return reachedASIs().some(function(slot){ var a=state.asis[slot.key]; return a && a.mode==="feat" && a.feat===id; });
  }
  function backgroundFeat(){ var bg=CAT.backgrounds[state.background]; return bg && bg.grantsFeat; }
  /* a species trait flagged as granting a bonus origin feat / skill (Human Versatile / Skillful) */
  function speciesTraitWith(flag){ var sp=CAT.species[state.species]; if(!sp) return null; var t=sp.traits||{}; for(var k in t){ if(t[k][flag]) return k; } return null; }
  function speciesGrantsFeat(){ return !!speciesTraitWith("grantsOriginFeat"); }
  function speciesSkillTrait(){ return speciesTraitWith("grantsSkill"); }

  /* ----- spell slots by character level + class features ----- */
  var HALF_SLOTS={1:[2],2:[2],3:[3],4:[3],5:[4,2],6:[4,2],7:[4,3],8:[4,3],9:[4,3,2],10:[4,3,2],11:[4,3,3],12:[4,3,3],13:[4,3,3,1],14:[4,3,3,1],15:[4,3,3,2],16:[4,3,3,2],17:[4,3,3,3,1],18:[4,3,3,3,1],19:[4,3,3,3,2],20:[4,3,3,3,2]};
  var FULL_SLOTS={1:[2],2:[3],3:[4,2],4:[4,3],5:[4,3,2],6:[4,3,3],7:[4,3,3,1],8:[4,3,3,2],9:[4,3,3,3,1],10:[4,3,3,3,2],11:[4,3,3,3,2,1],12:[4,3,3,3,2,1],13:[4,3,3,3,2,1,1],14:[4,3,3,3,2,1,1],15:[4,3,3,3,2,1,1,1],16:[4,3,3,3,2,1,1,1],17:[4,3,3,3,2,1,1,1,1],18:[4,3,3,3,3,1,1,1,1],19:[4,3,3,3,3,2,1,1,1],20:[4,3,3,3,3,2,2,1,1]};
  /* Warlock Pact Magic: {n: slot count, lvl: slot level} — every slot is the same level, recharged on a short rest. */
  var PACT_SLOTS={1:{n:1,lvl:1},2:{n:2,lvl:1},3:{n:2,lvl:2},4:{n:2,lvl:2},5:{n:2,lvl:3},6:{n:2,lvl:3},7:{n:2,lvl:4},8:{n:2,lvl:4},9:{n:2,lvl:5},10:{n:2,lvl:5},11:{n:3,lvl:5},12:{n:3,lvl:5},13:{n:3,lvl:5},14:{n:3,lvl:5},15:{n:3,lvl:5},16:{n:3,lvl:5},17:{n:4,lvl:5},18:{n:4,lvl:5},19:{n:4,lvl:5},20:{n:4,lvl:5}};
  /* Third-caster slots (Eldritch Knight / Arcane Trickster), indexed by that class's level (none before 3). */
  var THIRD_SLOTS={3:[2],4:[3],5:[3],6:[3],7:[4,2],8:[4,2],9:[4,2],10:[4,3],11:[4,3],12:[4,3],13:[4,3,2],14:[4,3,2],15:[4,3,2],16:[4,3,3],17:[4,3,3],18:[4,3,3],19:[4,3,3,1],20:[4,3,3,1]};
  function ordinalB(n){ var s=["th","st","nd","rd"],v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); }
  /* the (first) spellcasting class — for spell ability, cantrips, prepared list */
  /* Spellcasting is granted by features, not by the base class: every reached class feature OR
     subclass grant that declares effects.spellcasting contributes a source. Each carries the class
     level it scales with (full=lvl, half=lvl/2, third=lvl/3; pact is tracked separately). This is
     what lets a subclass (Eldritch Knight, Arcane Trickster) add third-caster spellcasting. */
  function casterSources(){
    var out=[];
    state.classes.forEach(function(cl){
      var cf=(CAT.classFeatures||{})[cl.cls]||{};
      for(var name in cf){ var sc=cf[name].effects&&cf[name].effects.spellcasting; if(sc && clsReached(name, cl)) out.push({cls:cl.cls, level:cl.level, sc:sc, feature:name}); }
      var scLvl=(CAT.classes[cl.cls]||{}).subclassLevel||3;
      if(cl.level>=scLvl && cl.subclass){ (((CAT.subclasses[cl.subclass]||{}).grants)||[]).forEach(function(g){ if(g.effects&&g.effects.spellcasting) out.push({cls:cl.cls, level:cl.level, sc:g.effects.spellcasting, feature:g.name}); }); }
    });
    return out;
  }
  /* the primary spellcasting source — drives spell ability, the cantrip/prepared pickers, and the spell list */
  function primaryCaster(){ var s=casterSources(); if(!s.length) return null; var x=s[0]; return {cls:x.cls, level:x.level, ability:x.sc.ability, progression:x.sc.progression, list:x.sc.list, sc:x.sc}; }
  /* multiclass spellcaster level: full = level, half = floor(level/2), third = floor(level/3); pact is separate */
  function combinedCasterLevel(){ var t=0; casterSources().forEach(function(s){ var p=s.sc.progression; if(p==="full") t+=s.level; else if(p==="half") t+=Math.floor(s.level/2); else if(p==="third") t+=Math.floor(s.level/3); }); return t; }
  function slotObj(lvl,n){ return {id:"slot"+lvl,label:"Level "+lvl+" Slots",max:n,rest:"long",ref:"spellslots"+lvl,storm:true,note:"long rest",use:"Spend a slot",reminder:"Spend a "+ordinalB(lvl)+"-level spell slot.",slotLevel:lvl}; }
  function pactObj(pm){ return {id:"slot"+pm.lvl,label:"Pact Magic (Lvl "+pm.lvl+")",max:pm.n,rest:"short",ref:"spellslots"+pm.lvl,storm:true,note:"short rest",use:"Spend a slot",reminder:"Spend a "+ordinalB(pm.lvl)+"-level Pact Magic slot (recovers on a short rest).",slotLevel:pm.lvl}; }
  function spellSlotsFor(){
    var srcs=casterSources(); if(!srcs.length) return null;
    var regular=srcs.filter(function(s){return s.sc.progression!=="pact";}), pacts=srcs.filter(function(s){return s.sc.progression==="pact";});
    var pools=[];
    if(regular.length===1 && !pacts.length){
      var s=regular[0], table=s.sc.progression==="full"?FULL_SLOTS:s.sc.progression==="half"?HALF_SLOTS:s.sc.progression==="third"?THIRD_SLOTS:null;
      if(table) (table[Math.min(s.level,20)]||[]).forEach(function(n,i){ pools.push(slotObj(i+1,n)); });
    } else if(regular.length){                                   // multiclass: combine into the full-caster slot table
      (FULL_SLOTS[Math.min(combinedCasterLevel(),20)]||[]).forEach(function(n,i){ pools.push(slotObj(i+1,n)); });
    }
    pacts.forEach(function(s){ var pm=PACT_SLOTS[Math.min(s.level,20)]; if(pm) pools.push(pactObj(pm)); });   // pact magic stays separate
    return pools.length?pools:null;
  }
  /* spells known/prepared by class + level */
  var PREP_FULL=[0,4,5,6,7,9,10,11,12,14,15,16,16,17,18,19,21,22,23,24,25];
  var PREP_HALF=[0,2,3,4,5,6,6,7,7,9,9,10,10,11,11,12,12,14,14,15,15];
  var PREP_PACT=[0,2,3,4,5,6,7,8,9,10,10,11,11,12,12,13,13,14,14,15,15];
  /* cantrips known by class & level (2024 PHB). Half-casters (paladin/ranger) and barbarian get none. */
  var CANTRIPS_KNOWN={
    bard:function(l){return l>=10?4:(l>=4?3:2);}, cleric:function(l){return l>=10?5:(l>=4?4:3);},
    druid:function(l){return l>=10?4:(l>=4?3:2);}, sorcerer:function(l){return l>=10?6:(l>=4?5:4);},
    warlock:function(l){return l>=10?4:(l>=4?3:2);}, wizard:function(l){return l>=10?5:(l>=4?4:3);}
  };
  function cantripsKnown(){ var p=primaryCaster(); if(!p) return 0; var n; if(p.sc.cantripsKnown) n=p.sc.cantripsKnown[Math.min(p.level,20)]||0; else { var fn=CANTRIPS_KNOWN[p.list]; n=fn?fn(p.level):0; } if(state.choices.order==="thaumaturge") n+=1; return n; }
  function preparedCount(){ var p=primaryCaster(); if(!p) return 0; if(p.sc.preparedKnown) return p.sc.preparedKnown[Math.min(p.level,20)]||0; var c=p.progression, t=c==="full"?PREP_FULL:(c==="half"?PREP_HALF:(c==="pact"?PREP_PACT:null)); return t?t[Math.min(p.level,20)]:0; }
  function maxSpellLevel(){ var s=spellSlotsFor()||[]; return s.reduce(function(m,p){ return Math.max(m, p.slotLevel||0); }, 0); }
  function classCantrips(){ var p=primaryCaster(); if(!p) return []; return Object.keys(CAT.spells).filter(function(id){ var s=CAT.spells[id]; return s.level===0 && (s.classes||[]).indexOf(p.list)>=0; }).sort(); }
  /* how many spells from OUTSIDE the caster's restricted schools it may prepare (Eldritch Knight /
     Arcane Trickster get one "any school" pick at levels 3/8/14/20); 0 = strict, Infinity = no limit */
  function anySchoolCap(){ var p=primaryCaster(); if(!p||!p.sc.schools) return Infinity; return p.sc.anySchool?(p.sc.anySchool[Math.min(p.level,20)]||0):0; }
  function offSchool(id){ var p=primaryCaster(); if(!p||!p.sc.schools) return false; var sc=CAT.spells[id]&&CAT.spells[id].school; return !!(sc && p.sc.schools.indexOf(sc)<0); }
  /* leveled spells the caster may prepare: from its spell list, within slot range. School-restricted
     casters only see their allowed schools UNLESS they have any-school picks available, in which case
     the full list is shown and the off-school count is capped at selection time. */
  function classLeveledSpells(){ var p=primaryCaster(); if(!p) return []; var mx=maxSpellLevel();
    var sch=null; if(p.sc.schools && anySchoolCap()<=0){ sch={}; p.sc.schools.forEach(function(x){ sch[x]=1; }); }
    return Object.keys(CAT.spells).filter(function(id){ var s=CAT.spells[id]; if(s.level<1||s.level>mx) return false; if((s.classes||[]).indexOf(p.list)<0) return false; if(sch && s.school && !sch[s.school]) return false; return true; }).sort(function(a,b){ var s=CAT.spells; return s[a].level-s[b].level || (s[a].name<s[b].name?-1:1); }); }
  function spellSub(reg){ var d=derive(), p=primaryCaster(), ab=p?p.ability:null, mod=ab?d.mods[ab]:0; var sg=function(n){return (n>=0?"+":"")+n;};
    var s=reg.dice?String(reg.dice).replace(/\{dc\}/g,d.spellDC).replace(/\{atk\}/g,sg(d.spellAtk)).replace(/\{mod\}/g,sg(mod)):"";
    return (s || (reg.level===0?"cantrip":"level "+reg.level))+(reg.concentration?" · Conc.":""); }
  function spellEntries(){
    var p=primaryCaster(); var sc={ ability:p?p.ability:undefined };
    var slots=spellSlotsFor(); if(slots) sc.slots=slots;
    if(state.cantrips.length) sc.cantrips=state.cantrips.map(function(id){ return { ref:id, name:CAT.spells[id].name, sub:spellSub(CAT.spells[id]) }; });
    var pc=preparedCount();
    if(pc) sc.prepared={ max:pc, default:state.prepared.slice(), catalog:classLeveledSpells().map(function(id){ var c={ id:id, name:CAT.spells[id].name, note:spellSub(CAT.spells[id]), level:CAT.spells[id].level }; if(CAT.spells[id].cast) c.cast=CAT.spells[id].cast; return c; }) };
    return sc;
  }
  function classFeatureSources(){
    var out=[];
    state.classes.forEach(function(cl){ var cd=CAT.classes[cl.cls]||{}, fbl=cd.featuresByLevel||{}, cf=(CAT.classFeatures||{})[cl.cls]||{};
      for(var l=1;l<=cl.level;l++) (fbl[String(l)]||[]).forEach(function(name){ if(cf[name]) out.push({ id:cf[name].refId||name, name:(cd.name||"")+": "+name, include:"class:"+cl.cls+":"+name }); }); });
    return out;
  }
  /* class resource pools whose size scales with level (the ref comes from class-features) */
  var CLASS_POOLS = {
    fighter: [
      { feature:"Second Wind", id:"sw", label:"Second Wind", ref:"secondwind", storm:true, rest:"short", note:"short rest", use:"Use Second Wind", max:function(l){return l>=10?4:(l>=4?3:2);}, reminder:"Second Wind: roll 1d10 + your fighter level, then add it with Heal." },
      { feature:"Action Surge", id:"as", label:"Action Surge", ref:"actionsurge", storm:false, rest:"short", note:"short rest", use:"Use", max:function(l){return l>=17?2:1;}, reminder:"Action Surge — take one extra action this turn." }
    ],
    wizard: [
      { feature:"Arcane Recovery", id:"arcrec", label:"Arcane Recovery", ref:"arcanerecovery", storm:false, rest:"long", note:"once per day", use:"Use", max:function(){return 1;}, reminder:"Arcane Recovery: on a short rest, recover slots totaling up to half your wizard level (round up), none above 5th." }
    ],
    cleric: [
      { feature:"Channel Divinity", id:"cd", label:"Channel Divinity", ref:"channeldivinity", storm:false, rest:"short", note:"regain 1 on a short rest", use:"Use", max:function(l){return l>=18?4:(l>=6?3:2);}, reminder:"Channel Divinity: Divine Spark or Turn Undead." }
    ],
    monk: [
      { feature:"Ki", id:"ki", label:"Ki / Focus Points", ref:"ki", storm:true, rest:"short", note:"short rest", use:"Spend Ki", max:function(l){return l;}, reminder:"Spend Ki: Flurry of Blows, Patient Defense, or Step of the Wind." }
    ],
    barbarian: [
      { feature:"Rage", id:"rage", label:"Rage", ref:"rage", storm:true, rest:"long", note:"long rest", use:"Rage", max:function(l){return l>=17?6:(l>=12?5:(l>=6?4:(l>=3?3:2)));}, reminder:"Rage: Bonus Action — resistance to bludgeoning/piercing/slashing and bonus melee damage." }
    ],
    bard: [
      { feature:"Bardic Inspiration", id:"bi", label:"Bardic Inspiration", ref:"bardicinspiration", storm:true, rest:"long", note:"long rest (short at 5th)", use:"Inspire", max:function(l,d){return Math.max(1, d.mods.CHA);}, reminder:"Bardic Inspiration: Bonus Action — give an ally a die to add to a check, attack, or save." }
    ],
    sorcerer: [
      { feature:"Font of Magic", id:"sp", label:"Sorcery Points", ref:"fontofmagic", storm:true, rest:"long", note:"long rest", use:"Spend", max:function(l){return l;}, reminder:"Sorcery Points: convert to spell slots or fuel Metamagic." }
    ],
    paladin: [
      { feature:"Lay on Hands", id:"loh", label:"Lay on Hands (HP pool)", ref:"layonhands", storm:false, rest:"long", note:"long rest", use:"Heal", max:function(l){return 5*l;}, reminder:"Lay on Hands: as a Bonus Action, spend points to heal (or 5 to cure a disease/poison)." },
      { feature:"Channel Divinity", id:"cd", label:"Channel Divinity", ref:"channeldivinity", storm:false, rest:"short", note:"regain on a short rest", use:"Use", max:function(l){return l>=11?3:2;}, reminder:"Channel Divinity: fuel your Oath's options." }
    ],
    druid: [
      { feature:"Wild Shape", id:"ws", label:"Wild Shape", ref:"wildshape", storm:true, rest:"short", note:"regain on short/long rest", use:"Transform", max:function(l){return l>=17?4:(l>=6?3:2);}, reminder:"Wild Shape: Bonus Action — transform into a known beast form." }
    ]
  };
  /* is a class feature reached in any class (or a specific class) at its level */
  function clsReached(name, cl){ var fbl=(CAT.classes[cl.cls]||{}).featuresByLevel||{}; for(var l=1;l<=cl.level;l++){ if((fbl[String(l)]||[]).indexOf(name)>=0) return true; } return false; }
  function featureReached(name){ return state.classes.some(function(cl){ return clsReached(name, cl); }); }
  /* every class's subclass grants (each class's subclass, once it reaches its subclass level) */
  function subclassGrants(){
    var out=[];
    state.classes.forEach(function(cl){ var scLvl=(CAT.classes[cl.cls]||{}).subclassLevel||3; if(cl.level>=scLvl && cl.subclass) out=out.concat(((CAT.subclasses[cl.subclass]||{}).grants)||[]); });
    return out;
  }
  function classPoolSources(){
    var out=[], d=derive();   // some pools size off an ability modifier (e.g. Bardic Inspiration = CHA)
    state.classes.forEach(function(cl){ (CLASS_POOLS[cl.cls]||[]).forEach(function(cp){ if(!clsReached(cp.feature, cl)) return;
      var mx=cp.max(cl.level, d); if(mx<=0) return;
      out.push({ id:cp.id, name:cp.feature, effects:{ grantsPool:{ id:cp.id, label:cp.label, max:mx, rest:cp.rest, ref:cp.ref, storm:cp.storm, note:cp.note, use:cp.use, reminder:cp.reminder } } }); }); });
    return out;
  }
  function featureList(){
    var out=[], multi=state.classes.length>1;
    // class features by level, per class; subclass grants per class
    state.classes.forEach(function(cl){
      var cd=CAT.classes[cl.cls]||{}, fbl=cd.featuresByLevel||{}, cf=(CAT.classFeatures||{})[cl.cls]||{}, pfx=multi?(cd.name+": "):"";
      for(var l=1;l<=cl.level;l++) (fbl[String(l)]||[]).forEach(function(name){ if(name==="Ability Score Improvement"||/Subclass$/.test(name)) return; out.push({ ref:(cf[name]&&cf[name].refId)||"", name:pfx+name, sub:(multi?cd.name+" ":"Level ")+l }); });
      var scLvl=cd.subclassLevel||3;
      if(cl.level>=scLvl && cl.subclass){ var scName=(CAT.subclasses[cl.subclass]||{}).name||""; (((CAT.subclasses[cl.subclass]||{}).grants)||[]).forEach(function(g){ out.push({ ref:g.id, name:g.name, sub:scName }); }); }
    });
    // species traits
    var sp=CAT.species[state.species];
    if(sp) Object.keys(sp.traits||{}).forEach(function(tr){ out.push({ ref:tr, name:sp.traits[tr].name, sub:sp.name }); });
    if(sp && sp.lineage && state.choices.lineage && sp.lineage.options[state.choices.lineage]){ var lo=sp.lineage.options[state.choices.lineage]; out.push({ ref:lo.refId, name:sp.lineage.label+": "+lo.name, sub:sp.name }); }
    // background, and the origin feat it grants
    var bg=CAT.backgrounds[state.background];
    if(bg){ out.push({ ref:state.background, name:"Background: "+bg.name, sub:"" });
      if(bg.grantsFeat) out.push({ ref:bg.grantsFeat, name:featName(bg.grantsFeat), sub:bg.name+" origin feat" }); }
    // extra origin feat (Human Versatile, etc.)
    if(state.originFeat) out.push({ ref:state.originFeat, name:featName(state.originFeat), sub:"Origin feat" });
    // ASIs: feats and ability bumps
    reachedASIs().forEach(function(slot){ var a=state.asis[slot.key]; if(!a) return;
      if(a.mode==="feat" && a.feat) out.push({ ref:a.feat, name:featName(a.feat), sub:slot.label+" feat" });
      else out.push({ ref:"", name:"Ability Score Improvement", sub:slot.label }); });
    return out;
  }

  /* ----- on-hit damage riders (Dreadful Strikes, maneuvers, Hunter's Mark) ----- */
  function maneuverDC(){ var d=derive(); return 8 + d.pb + Math.max(d.mods.STR, d.mods.DEX); }
  function hitRiderData(){
    var riders=[], head=null, dc=maneuverDC();
    function subDC(s){ return s==null ? s : String(s).replace(/\{dc\}/g, dc); }
    function take(src){ if(!src) return; if(src.riderHead) head=src.riderHead;
      (src.hitRiders||[]).forEach(function(r){ var rr=Object.assign({}, r); if(rr.note) rr.note=subDC(rr.note); if(rr.offNote) rr.offNote=subDC(rr.offNote); riders.push(rr); }); }
    var cf=(CAT.classFeatures||{})[state.cls]||{}, fbl=classData().featuresByLevel||{};
    for(var l=1;l<=state.level;l++) (fbl[String(l)]||[]).forEach(function(name){ take(cf[name]); });
    subclassGrants().forEach(take);
    return { head:head, riders:riders };
  }
  /* a plain-language note for ability-check bonuses (e.g. Otherworldly Glamour) */
  function checkModNote(){
    var notes=[];
    subclassGrants().forEach(function(g){ var cb=g.effects&&g.effects.checkBonus; if(!cb) return;
      Object.keys(cb).forEach(function(tgt){ var src=String(cb[tgt]).replace(/Mod$/,"").toUpperCase(); if(ABIL_NAME[src]&&ABIL_NAME[tgt]) notes.push(g.name+": add your "+ABIL_NAME[src]+" modifier to all "+ABIL_NAME[tgt]+" checks."); }); });
    return notes.join(" ");
  }

  /* ----- round-trip: rebuild form state from an existing character JSON ----- */
  function loadState(ch){
    if(!ch || typeof ch!=="object") return false;
    // identity is read explicitly: from the build block (source files) or the
    // compiled `identity` stamp (build-stripped sheets) — never inferred.
    var b=ch.build||{}, id=ch.identity||{};
    state.name = ch.name || state.name;
    state.homebrew = !!ch.homebrew;
    state.bespoke = !!ch.bespoke;
    state.homebrewNote = ch.homebrewNote || "";
    state.species = b.species || id.species || state.species;
    state.background = b.background || id.background || state.background;
    // class breakdown: build.classes / identity.classes (multiclass) or a single class
    var mcls = (Array.isArray(b.classes) && b.classes) || (Array.isArray(id.classes) && id.classes) || null;
    state.classes = (mcls && mcls.length)
      ? mcls.map(function(c){ return { cls:c.class||c.cls, subclass:c.subclass||"", level:c.level||1 }; })
      : [{ cls:(b.class||id.class||state.cls), subclass:(b.subclass||id.subclass||""), level:(ch.level||b.level||state.level) }];
    syncPrimary();
    if(b.abilities){ var base={STR:10,DEX:10,CON:10,INT:10,WIS:10,CHA:10}; ABIL.forEach(function(a){ if(b.abilities[a]!=null) base[a]=b.abilities[a]; }); state.base=base; }
    state.masteries = (ch.masteryDefault||[]).slice();
    var bgCard = (ch.cards||[]).find(function(c){ return c && c.type==="background"; });
    state.bio = (bgCard && bgCard.paras) ? bgCard.paras.join("\n\n") : "";
    // rebuild the unified inventory from weapons + armory + shield + inert items
    state.equipment = [];
    // any catalog weapon/armor name (plus "shield") is "gear", not an inert supply
    var gearNames = { shield:1 };
    Object.keys(CAT.weapons).forEach(function(id){ gearNames[CAT.weapons[id].name.toLowerCase()]=1; });
    Object.keys(CAT.armor).forEach(function(id){ gearNames[CAT.armor[id].label.toLowerCase()]=1; });
    var baseName = function(n){ return String(n).replace(/\s*\(.*\)\s*$/,"").trim().toLowerCase(); };
    (ch.weapons||[]).forEach(function(w){ var id=typeof w==="string"?w:w.id; if(id && CAT.weapons[id]) state.equipment.push({kind:"weapon", id:id, name:CAT.weapons[id].name}); });
    var armory = (ch.ac && (ch.ac.armory || (ch.ac.armor ? [ch.ac.armor] : []))) || [];
    armory.forEach(function(a){ var id=typeof a==="string"?a:(a&&a.id); if(id && CAT.armor[id]) state.equipment.push({kind:"armor", id:id, name:CAT.armor[id].label}); });
    if(ch.ac && ch.ac.shield) state.equipment.push({kind:"shield", name:"Shield"});
    var invCard=(ch.cards||[]).find(function(c){ return c && c.type==="inventory"; });
    if(invCard && Array.isArray(invCard.items)) invCard.items.forEach(function(it){ if(it && it.name && !gearNames[baseName(it.name)]) state.equipment.push({kind:"item", name:it.name, tag:it.tag}); });
    state.skills=[]; state.originFeat=""; state.asis={}; state.cantrips=[]; state.prepared=[]; state.languages=[];
    state.choices={style:"",expertise:[],order:"",skillful:"",lineage:""};
    (b.sources||[]).forEach(function(s){
      var id=s.id||"", eff=s.effects||{};
      if(/-skills$/.test(id) && eff.skills) state.skills=eff.skills.slice();
      var am=/^asi-(.+)$/.exec(id);   // key is the level (single-class) or class:level (multiclass)
      if(am){ var lv=am[1];
        if(s.grantsFeat) state.asis[lv]={mode:"feat",feat:s.grantsFeat};
        else if(eff.abilityIncrease){ var k=Object.keys(eff.abilityIncrease);
          if(k.length===1 && eff.abilityIncrease[k[0]]===2) state.asis[lv]={mode:"asi2",a:k[0]};
          else state.asis[lv]={mode:"asi11",a:k[0],b:k[1]||k[0]}; } }
      else if(s.grantsFeat) state.originFeat=s.grantsFeat;   // extra origin feat (Human Versatile, etc.) however it's tagged
      if(id==="fighting-style" && s.name){ var fm=/Fighting Style:\s*(.+)$/.exec(s.name); if(fm){ var st=FIGHTING_STYLES.filter(function(x){return x.name===fm[1].trim();})[0]; if(st) state.choices.style=st.id; } }
      if(eff.expertise) state.choices.expertise=eff.expertise.slice();   // all chosen Expertise skills (Deft Explorer/Scholar = 1, Rogue/Bard = 2 each)
      if(eff.skills && id===speciesSkillTrait()) state.choices.skillful=eff.skills[0];   // Human Skillful's chosen skill
      if(id==="divine-order" && s.name) state.choices.order=/Thaumaturge/i.test(s.name)?"thaumaturge":"protector";
      if(id==="lineage" && s.refId){ var lin=(CAT.species[b.species||state.species]||{}).lineage; if(lin) Object.keys(lin.options).forEach(function(lk){ if(lin.options[lk].refId===s.refId) state.choices.lineage=lk; }); }
      if(eff.spellcasting){ var spc=eff.spellcasting;   // spellcasting source, however its id is tagged (e.g. ranger-spellcasting)
        if(spc.cantrips) state.cantrips=spc.cantrips.map(function(c){ return typeof c==="string"?c:c.ref; });
        if(spc.prepared && spc.prepared.default) state.prepared=spc.prepared.default.slice(); }
      if(Array.isArray(eff.language)) state.languages=eff.language.slice();   // known languages, resolved
    });
    // Fighting Style is carried in ac.style (a derived AC bonus), not a source — recover it from the label
    if(!state.choices.style && ch.ac && ch.ac.style && ch.ac.style.label){
      var lbl=String(ch.ac.style.label).toLowerCase();
      var fs=FIGHTING_STYLES.filter(function(x){ return lbl.indexOf(x.name.toLowerCase())>=0; })[0];
      if(fs) state.choices.style=fs.id;
    }
    if(!(b.sources && b.sources.length)) decompose(ch);   // build-stripped compiled char
    captureCustoms(ch);
    // snapshot for pristine pass-through: until the user edits something, re-export
    // exactly what was loaded so a character survives the round trip untouched
    state._orig = JSON.parse(JSON.stringify(ch));
    state._sig = editSig();
    return true;
  }
  /* When a character arrives compiled (no build sources), pull its derived
     fields back into the form model instead of dropping them. Skills that the
     background already grants are excluded so they regenerate from that source
     rather than being double-counted as class picks. */
  function decompose(ch){
    var bgEff=(CAT.backgrounds[state.background]||{}).effects||{};
    if(Array.isArray(ch.skillProf)){ var bgSk=bgEff.skills||[]; state.skills=ch.skillProf.filter(function(s){ return bgSk.indexOf(s)<0; }); }
    if(Array.isArray(ch.skillExp) && ch.skillExp.length) state.choices.expertise=ch.skillExp.slice();
    if(Array.isArray(ch.cantrips)) state.cantrips=ch.cantrips.map(function(c){ return typeof c==="string"?c:c.ref; });
    if(ch.prepared && Array.isArray(ch.prepared.default)) state.prepared=ch.prepared.default.slice();
    if(ch.abilities){ var base={STR:10,DEX:10,CON:10,INT:10,WIS:10,CHA:10}, bgInc=bgEff.abilityIncrease||{};
      ABIL.forEach(function(a){ base[a]=(ch.abilities[a]!=null?ch.abilities[a]:10)-(bgInc[a]||0); }); state.base=base; }
  }
  /* a signature of every field the form can change; if it still matches the
     value captured at load time, nothing has been edited */
  function editSig(){
    return JSON.stringify([ state.name, state.species, state.classes, state.background,
      state.base, state.skills, state.equipment, state.originFeat, state.asis,
      state.masteries, state.cantrips, state.prepared, state.languages, state.choices, state.bio, state.customs ]);
  }
  /* Capture the things the builder genuinely doesn't model, so they're not
     lost once the character is edited: unknown top-level fields (e.g. combat,
     ref) and cards of a type the builder doesn't generate (e.g. a Background
     bio card). Each becomes a typed envelope {kind, key?, label, value}.
     Build sources are deliberately NOT auto-captured — the builder regenerates
     the ones it models, and an unedited character is preserved verbatim by the
     pristine pass-through in scaffold(), so capturing them would only show
     confusing duplicates of things like "Spellcasting" or "Hit Dice". */
  function captureCustoms(ch){
    state.customs=[];
    Object.keys(ch).forEach(function(k){ if(KNOWN_ROOT[k]) return; state.customs.push({ kind:"root", key:k, label:k, value:ch[k] }); });
    (ch.cards||[]).forEach(function(c){ if(c && c.type && !MANAGED_CARDS[c.type]) state.customs.push({ kind:"card", label:(c.title||c.type), value:c }); });
  }
  function addCustom(kind){
    var starter = kind==="source" ? { id:"custom-feature", name:"Custom Feature", ref:{ title:"Custom Feature", chips:[], body:["Describe what this feature does."] } }
      : kind==="card" ? { type:"background", hint:"", paras:["Custom card text."] }
      : { hello:"world" };
    var label = kind==="source" ? "Custom Feature" : kind==="card" ? "Custom card" : "newField";
    var e = { kind:kind, label:label, value:starter };
    if(kind==="root") e.key="customField";
    state.customs.push(e); render();
  }
  function applyCustoms(ch){
    (state.customs||[]).forEach(function(cu){ if(!cu) return;
      if(cu.kind==="root" && cu.key) ch[cu.key]=cu.value;
      else if(cu.kind==="source"){ (ch.build.sources=ch.build.sources||[]).push(cu.value); }
      else if(cu.kind==="card"){ (ch.cards=ch.cards||[]).push(cu.value); }
    });
    return ch;
  }

  /* ----- typed, SCHEMA-AWARE JSON tree editor (for Custom Elements) -----
     Scalars render as compact STATIC chips; tapping a chip swaps it in place for
     an input (no full re-render, so it's cheap and mobile-friendly). When a
     schema spec is known for a node, it drives the UI: enum/ability → dropdown,
     dice → flagged input, a known object's "+ field" offers a dropdown of valid
     unused field names with correct defaults, the card `type` is an enum, and
     field descriptions show as tooltips. Off-schema (homebrew) falls back to
     plain type inference with a type selector. */
  var DICE_RE=/^\s*\d*d\d+(\s*[+-]\s*\d+)?\s*$/i;
  var SCHEMA=(typeof CHARACTER_SCHEMA!=="undefined")?CHARACTER_SCHEMA:null;
  function jtype(v){ return Array.isArray(v)?"array":v===null?"null":typeof v; }
  function rs(spec){ if(spec && spec.ref && SCHEMA && SCHEMA.defs[spec.ref]){ var d=SCHEMA.defs[spec.ref]; return Object.assign({}, d, {required:spec.required, desc:spec.desc||d.desc}); } return spec; }
  function specFields(spec, value){ spec=rs(spec); if(!spec) return null;
    if(spec.type==="variant"){ var v=(spec.variants||{})[value&&value[spec.on]]; return v?Object.assign({}, v.fields):null; }
    return spec.fields||null; }
  function childSpec(spec, value, key){ spec=rs(spec); if(!spec) return null;
    if(spec.type==="variant"){ if(key===spec.on) return {type:"enum", enum:Object.keys(spec.variants||{})}; var v=(spec.variants||{})[value&&value[spec.on]]; return (v&&v.fields&&v.fields[key])||null; }
    if(spec.type==="array") return spec.items||null;
    if(spec.type==="map") return spec.values||null;
    if(spec.fields) return spec.fields[key]||null;
    return null; }
  function availableFields(spec, value){ var f=specFields(spec, value); if(!f) return null; return Object.keys(f).filter(function(k){ return !(k in value); }); }
  function defaultFor(spec){ spec=rs(spec); if(!spec) return ""; if(spec.enum) return spec.enum[0]; var t=Array.isArray(spec.type)?spec.type[0]:spec.type;
    return t==="number"?0:t==="boolean"?false:(t==="object"||t==="map"||t==="variant")?{}:t==="array"?[]:""; }
  function jtTypeSel(value, set){
    var s=select(jtype(value), [["string","abc"],["number","123"],["boolean","T/F"],["object","{}"],["array","[ ]"]], function(nt){
      set(nt==="string"?"":nt==="number"?0:nt==="boolean"?false:nt==="object"?{}:nt==="array"?[]:null); render();
    });
    s.className="bsel jt-type"; return s;
  }
  function jtEnum(value, set, options){ var s=select(String(value), options.map(function(o){ return [o,o]; }), function(v){ set(v); }); s.className="bsel jt-enum"; return s; }
  function jtScalar(value, set, isDice){
    var t=jtype(value);
    if(t==="boolean"){
      var b=el("button",{class:"jt-chip jt-bool"+(value?" on":""), type:"button"});
      b.textContent=value?"true":"false";
      b.addEventListener("click", function(){ value=!value; set(value); b.textContent=value?"true":"false"; if(b.classList&&b.classList.toggle) b.classList.toggle("on", value); });
      return b;
    }
    var dice=isDice||(t==="string"&&DICE_RE.test(value));
    var chip=el("button",{class:"jt-chip"+(dice?" dice":"")+(value===""?" empty":""), type:"button"});
    chip.textContent = value===""?"(empty)":String(value);
    chip.addEventListener("click", function(){
      var input=el("input",{class:"binput jt-edit", type:t==="number"?"number":"text", placeholder:isDice?"e.g. 1d8+2":null});
      input.value=String(value); chip.replaceWith(input); input.focus(); try{ input.select(); }catch(e){}
      var done=false;
      function back(commit){ if(done) return; done=true; if(commit){ var nv=t==="number"?(input.value===""?0:Number(input.value)):input.value; value=nv; set(nv); } input.replaceWith(jtScalar(value, set, isDice)); }
      input.addEventListener("blur", function(){ back(true); });
      input.addEventListener("keydown", function(e){ if(e.key==="Enter"){ e.preventDefault(); input.blur(); } else if(e.key==="Escape"){ back(false); } });
    });
    return chip;
  }
  function jtKey(k, onRename, desc){
    var b=el("button",{class:"jt-key", type:"button", title:desc||null}); b.textContent=k;
    b.addEventListener("click", function(){
      var input=el("input",{class:"binput jt-edit jt-keyedit"}); input.value=k;
      b.replaceWith(input); input.focus(); try{ input.select(); }catch(e){}
      var done=false;
      function back(){ if(done) return; done=true; var nk=input.value.trim(); if(nk && nk!==k){ onRename(nk); } else { input.replaceWith(jtKey(k, onRename, desc)); } }
      input.addEventListener("blur", back);
      input.addEventListener("keydown", function(e){ if(e.key==="Enter"){ e.preventDefault(); input.blur(); } });
    });
    return b;
  }
  function jtRow(keyEl, valueNode, onRemove){
    return el("div",{class:"jt-row"},[ keyEl, valueNode, el("button",{class:"jt-x", type:"button", "aria-label":"Remove", text:"✕", onclick:onRemove}) ]);
  }
  function jtAddObj(spec, value, set){
    var avail=availableFields(spec, value);
    if(avail){   // schema-known object: offer a dropdown of valid unused fields
      if(!avail.length) return el("span",{class:"bf-h jt-add", text:"All schema fields present."});
      var opts=[["","+ add field…"]].concat(avail.map(function(f){ var fs=rs(childSpec(spec,value,f)); var ty=fs?(Array.isArray(fs.type)?fs.type.join("/"):(fs.enum?"enum":fs.type)):"?"; return [f, f+" · "+ty]; })).concat([["__free__","+ custom field…"]]);
      var s=select("", opts, function(v){ if(!v) return; if(v==="__free__"){ value["field"+(Object.keys(value).length+1)]=""; } else { value[v]=defaultFor(childSpec(spec,value,v)); } set(value); render(); });
      s.className="bsel jt-add jt-add-sel"; return s;
    }
    return el("button",{class:"bbtn tiny ember jt-add", type:"button", text:"+ field", onclick:function(){ value["field"+(Object.keys(value).length+1)]=""; set(value); render(); }});
  }
  function jsonNode(value, set, spec){
    spec=rs(spec);
    var t=jtype(value);
    var showType = !spec || Array.isArray(spec.type);   // selector only when type is unconstrained
    if(t==="object"||t==="array"){
      var kids=el("div",{class:"jt-children"});
      if(t==="array"){
        value.forEach(function(item,i){ kids.appendChild(jtRow(
          el("span",{class:"jt-key idx", text:i+""}),
          jsonNode(item, function(nv){ value[i]=nv; set(value); }, childSpec(spec,value,i)),
          function(){ value.splice(i,1); set(value); render(); })); });
        kids.appendChild(el("button",{class:"bbtn tiny ember jt-add", type:"button", text:"+ item", onclick:function(){ value.push(defaultFor(childSpec(spec,value,0))); set(value); render(); }}));
      } else {
        Object.keys(value).forEach(function(k){ var ks=rs(childSpec(spec,value,k));
          kids.appendChild(jtRow(
            jtKey(k, function(nk){ var nv={}; Object.keys(value).forEach(function(x){ nv[x===k?nk:x]=value[x]; }); set(nv); render(); }, ks&&ks.desc),
            jsonNode(value[k], function(nv){ value[k]=nv; set(value); }, childSpec(spec,value,k)),
            function(){ delete value[k]; set(value); render(); })); });
        kids.appendChild(jtAddObj(spec, value, set));
      }
      var n=t==="array"?value.length:Object.keys(value).length;
      var head=el("div",{class:"jt-head"},[]);
      if(showType) head.appendChild(jtTypeSel(value,set));
      head.appendChild(el("span",{class:"jt-count", text:(t==="array"?"list":"object")+" · "+n+(n===1?" entry":" entries")}));
      return el("div",{class:"jt-node"},[ head, kids ]);
    }
    var valEl = (spec && spec.enum) ? jtEnum(value, set, spec.enum) : jtScalar(value, set, !!(spec && spec.type==="dice"));
    var node=el("div",{class:"jt-node jt-scalar"},[]);
    if(showType && !(spec && spec.enum)) node.appendChild(jtTypeSel(value,set));
    node.appendChild(valEl);
    return node;
  }
  /* the schema spec that anchors a custom element's value (root field / card / source) */
  function specForCustom(cu){ if(!SCHEMA) return null;
    if(cu.kind==="card") return {ref:"card"};
    if(cu.kind==="source") return {ref:"source"};
    if(cu.kind==="root") return SCHEMA.root[cu.key]||null;
    return null; }

  /* ----- build block + scaffold output ----- */
  function buildBlock(){
    var cd = classData();
    var sources = [];
    sources.push({ id:state.background, name:"Background: "+(CAT.backgrounds[state.background]||{}).name, include:"background:"+state.background });
    if(state.skills.length) sources.push({ id:state.cls+"-skills", name:(cd.name||state.cls)+" skills", effects:{ skills: state.skills.slice() } });
    if(state.languages.length) sources.push({ id:"languages", name:"Languages", effects:{ language: state.languages.slice() } });
    var sp = CAT.species[state.species];
    if(sp) Object.keys(sp.traits).forEach(function(tr){ var src={ id:tr, name:(sp.name+": "+sp.traits[tr].name), include:"species:"+state.species+":"+tr };
      if(sp.traits[tr].grantsSkill && state.choices.skillful) src.effects={ skills:[state.choices.skillful] };   // Human Skillful's chosen skill
      sources.push(src); });
    // chosen species lineage / ancestry (Elf, Gnome, Tiefling, Dragonborn, Goliath)
    if(sp && sp.lineage && state.choices.lineage && sp.lineage.options[state.choices.lineage]){
      var lo=sp.lineage.options[state.choices.lineage];
      sources.push({ id:"lineage", name:sp.lineage.label+": "+lo.name, effects:lo.effects, ref:lo.ref, refId:lo.refId });
    }
    // class features up to level (their refs/effects; spellcasting features carry only a marker effect
    // that the builder reads to detect casters — the full block is emitted last so it wins in compile)
    classFeatureSources().forEach(function(s){ sources.push(s); });
    classPoolSources().forEach(function(s){ sources.push(s); });
    // feature sub-choices that grant mechanics (override the generic class-feature ref)
    var ch=state.choices;
    if(featureReached("Fighting Style") && ch.style){ var st=FIGHTING_STYLES.filter(function(x){return x.id===ch.style;})[0]; if(st) sources.push({ id:"fighting-style", name:"Fighting Style: "+st.name, refId:"fightingstyle", ref:{ title:"Fighting Style: "+st.name, chips:[{t:"Combat feat"}], body:[st.note+"."] } }); }
    var xpSkills=(Array.isArray(ch.expertise)?ch.expertise:(ch.expertise?[ch.expertise]:[])).filter(Boolean);
    if(needsExpertise() && xpSkills.length) sources.push({ id:"expertise", name:"Expertise: "+xpSkills.join(", "), effects:{ expertise:xpSkills.slice() } });
    if(featureReached("Divine Order") && ch.order){ var od = ch.order==="thaumaturge" ? {t:"Thaumaturge", b:"You know an extra cleric cantrip and add your Wisdom modifier to Intelligence (Arcana or Religion) checks."} : {t:"Protector", b:"You gain proficiency with martial weapons and heavy armor."}; sources.push({ id:"divine-order", name:"Divine Order: "+od.t, refId:"divineorder", ref:{ title:"Divine Order: "+od.t, body:[od.b] } }); }
    // subclass features (gained at level 3+)
    var scName=(CAT.subclasses[state.subclass]||{}).name||"";
    subclassGrants().forEach(function(g){ sources.push({ id:g.id, name:scName+": "+g.name, effects:g.effects, ref:g.ref, refId:g.id }); });
    // level-1 origin feat (e.g. Human Versatile)
    if(state.originFeat) sources.push({ id:"feat-"+state.originFeat, name:"Origin feat: "+(CAT.feats[state.originFeat]||{}).name, grantsFeat:state.originFeat });
    // hit dice are derived by compile from class + level — not authored here
    // ASIs at 4/8/12/16/19 (cumulative ability increases or feats)
    reachedASIs().forEach(function(slot){ var l=slot.key, a=state.asis[l]; if(!a) return;
      if(a.mode==="feat" && a.feat) sources.push({ id:"asi-"+l, name:slot.label+" feat: "+(CAT.feats[a.feat]||{}).name, grantsFeat:a.feat });
      else { var inc={}; if(a.mode==="asi2"&&a.a) inc[a.a]=2; else if(a.mode==="asi11"){ if(a.a)inc[a.a]=(inc[a.a]||0)+1; if(a.b)inc[a.b]=(inc[a.b]||0)+1; }
        if(Object.keys(inc).length) sources.push({ id:"asi-"+l, name:slot.label+": Ability Score Improvement", effects:{ abilityIncrease:inc } }); }
    });
    // The full spellcasting block (slots + chosen cantrips/prepared) is emitted LAST so that, in compile's
    // last-assignment-wins effect merge, it overrides the marker-only effects.spellcasting on the class
    // feature / subclass grant that the builder uses to detect casters.
    if(primaryCaster() && spellSlotsFor()) sources.push({ id:"spellcasting", name:"Spellcasting", effects:{ spellcasting:spellEntries() } });
    return {
      species:state.species, background:state.background,
      classes: state.classes.map(function(c){ return { class:c.cls, subclass:c.subclass||undefined, level:c.level }; }),
      abilities: Object.assign({}, state.base),
      sources: sources
    };
  }
  function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function cap(a){ return a.charAt(0)+a.slice(1).toLowerCase(); }
  function featName(id){ return ((CAT.feats[id]||{}).name||"").replace(/\s*\(.*\)$/,""); }
  function genStuds(){ return [ {ref:"stat_ac",label:"AC",id:"acVal"},{ref:"stat_init",label:"Init"},{ref:"stat_speed",label:"Speed"},{ref:"stat_prof",label:"Prof"},{ref:"stat_pass",label:"Pass.Per"} ]; }
  function genBuildLog(){
    var cd=classData(), sp=CAT.species[state.species], bg=CAT.backgrounds[state.background], bgInc=abilityIncreases();
    var cf=(CAT.classFeatures||{})[state.cls]||{}, fbl=cd.featuresByLevel||{}, byLevel={};
    function add(l,it){ (byLevel[l]=byLevel[l]||[]).push(it); }
    // class features by level (skip the choices handled explicitly below)
    Object.keys(fbl).forEach(function(ls){ var l=+ls; if(l>state.level) return; fbl[ls].forEach(function(name){
      if(name==="Ability Score Improvement" || /Subclass$/.test(name)) return;
      add(l, {html:"<b>"+esc(name)+"</b>"+(cf[name]&&cf[name].ref&&cf[name].ref.body?(" — "+esc(cf[name].ref.body[0])):"")});
    }); });
    // level-1 specifics
    if(sp) add(1,{html:"<b>Species: "+esc(sp.name)+"</b> — "+Object.keys(sp.traits).map(function(k){return esc(sp.traits[k].name);}).join(", ")+" · Speed "+derive().speed});
    add(1,{html:"<b>Ability scores:</b> "+ABIL.map(function(a){return cap(a)+" "+((state.base[a]||10)+(bgInc[a]||0));}).join(", ")+(Object.keys(bgInc).length?" <span class=\"tag\">(background "+Object.keys(bgInc).map(function(k){return "+"+bgInc[k]+" "+k;}).join(" / ")+")</span>":"")});
    if(bg) add(1,{cls:"choice", html:"<b>Background: "+esc(bg.name)+"</b>"+(bg.grantsFeat?(" — Origin feat "+esc(featName(bg.grantsFeat))):"")});
    if(state.skills.length) add(1,{cls:"choice", html:"<b>Skills ("+esc(cd.name||"")+", choose "+((cd.skillChoices||{}).count||0)+"):</b> "+state.skills.map(esc).join(", ")});
    if(state.originFeat) add(1,{cls:"choice", html:"<b>Origin feat:</b> "+esc(featName(state.originFeat))});
    if(state.level>=3 && state.subclass){ add(3,{cls:"choice", html:"<b>Subclass:</b> "+esc((CAT.subclasses[state.subclass]||{}).name||titleCase(state.subclass))});
      subclassGrants().forEach(function(g){ add(3,{html:"<b>"+esc(g.name)+"</b>"+(g.ref&&g.ref.body?(" — "+esc(g.ref.body[0])):"")}); }); }
    var ch=state.choices;
    if(featureReached("Fighting Style")&&ch.style){ var st=FIGHTING_STYLES.filter(function(x){return x.id===ch.style;})[0]; add(featureLevel("Fighting Style"),{cls:"choice", html:"<b>Fighting Style:</b> "+esc(st?st.name:"")}); }
    var xpLog=(Array.isArray(ch.expertise)?ch.expertise:(ch.expertise?[ch.expertise]:[])).filter(Boolean);
    if(needsExpertise()&&xpLog.length) add(featureLevel(featureReached("Scholar")?"Scholar":featureReached("Deft Explorer")?"Deft Explorer":"Expertise"),{cls:"choice", html:"<b>Expertise:</b> "+esc(xpLog.join(", "))});
    if(featureReached("Divine Order")&&ch.order) add(featureLevel("Divine Order"),{cls:"choice", html:"<b>Divine Order:</b> "+esc(ch.order==="thaumaturge"?"Thaumaturge":"Protector")});
    reachedASIs().forEach(function(slot){ var a=state.asis[slot.key]; if(!a) return; var h;
      if(a.mode==="feat") h="<b>Feat:</b> "+esc(featName(a.feat)||"(choose one)");
      else if(a.mode==="asi2") h="<b>Ability Score Improvement:</b> +2 "+esc(a.a||"?");
      else h="<b>Ability Score Improvement:</b> +1 "+esc(a.a||"?")+", +1 "+esc(a.b||"?");
      add(slot.lvl,{cls:"choice", html:h});
    });
    return Object.keys(byLevel).map(Number).sort(function(a,b){return a-b;}).map(function(l){ return {title:"Level "+l, tag:cd.name||"", items:byLevel[l]}; });
  }
  function bgHint(){
    var parts=[ (CAT.species[state.species]||{}).name, (CAT.backgrounds[state.background]||{}).name ];
    if(state.level>=3 && state.subclass) parts.push((CAT.subclasses[state.subclass]||{}).name);
    return parts.filter(Boolean).join(" · ");
  }
  function genCards(){
    var cd=classData(), cards=[ {type:"abilities"}, {type:"hitpoints"}, {type:"attacks"} ];
    if(primaryCaster()) cards.push({type:"spellcasting"});
    cards.push({type:"skills"});
    cards.push({type:"pools", title:"Resources", pools:"*"});
    if(eqWeaponIds().length || eqArmorIds().length || eqHasShield() || eqItems().length){
      cards.push({ type:"inventory", items: eqItems().map(function(e){ return e.tag ? {name:e.name, tag:e.tag} : {name:e.name}; }) });
    }
    var feats=featureList(); if(feats.length) cards.push({type:"features", title:"Features & Traits", list:feats});
    if(state.bio && state.bio.trim()) cards.push({ type:"background", hint:bgHint(), paras:state.bio.split(/\n\s*\n/).map(function(p){return p.trim();}).filter(Boolean) });
    cards.push({type:"buildlog", title:"Build Log", hint:"every choice, level by level", levels:genBuildLog()});
    return cards;
  }
  /* Combat Mode is derived by the compile spine (deriveCombat) from weapons,
     spellcasting, and features — not authored here. */
  function scaffold(){
    // pristine pass-through: unedited since load -> return the original verbatim
    if(state._orig && state._sig === editSig()) return JSON.parse(JSON.stringify(state._orig));
    syncPrimary();
    var d = derive(), cd = classData();
    var slug = state.name.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"") || "hero";
    var hr = hitRiderData(), cmn = checkModNote();
    var ch = {
      id: slug, out: slug+".html", name: state.name,
      subtitle: ((CAT.species[state.species]||{}).name||"")+" · "+(state.classes.length>1 ? state.classes.map(function(cl){ return ((CAT.classes[cl.cls]||{}).name||cl.cls)+" "+cl.level; }).join(" / ") : (((CAT.classes[state.cls]||{}).name||state.cls)+(state.subclass&&CAT.subclasses[state.subclass] ? " · "+CAT.subclasses[state.subclass].name : "")))+" · Lvl "+state.level,
      portrait: slug+".png",
      title: state.name, footer: "Built with the character builder",
      storageKey: "dnd_"+slug, level: state.level, hitDie: d.hitDie,
      // multiclass: per-class dice merged by type (compile derives the hd pool); single-class uses hitDie
      hitDice: state.classes.length>1 ? (function(){ var by={}, ord=[]; state.classes.forEach(function(cl){ var dd=(CAT.classes[cl.cls]||{}).hitDie||"d8"; if(by[dd]==null){ by[dd]=0; ord.push(dd); } by[dd]+=cl.level; }); return ord.map(function(dd){ return {die:dd, count:by[dd]}; }); })() : undefined,
      proficiencyBonus: d.pb, saves: d.saves, checkModNote: cmn||undefined, speed: d.speed,
      // ownership only — the sheet decides what's actually worn/held. Best armor
      // is listed first so it's the default-equipped piece; the rest are swappable.
      ac: (function(){ var ac={}; var best=bestArmorId(), ids=eqArmorIds();
        if(ids.length){ ac.armory=[best].concat(ids.filter(function(id){ return id!==best; })); }
        if(eqHasShield()) ac.shield={label:"Shield",bonus:2,note:"+2 AC",default:true};
        if(state.choices.style==="defense") ac.style={label:"Defense",bonus:1,note:"+1 AC while armored",requiresArmor:true,default:true};
        return ac; })(),
      hp: { max: d.hp },
      masteryMax: cd.weaponMastery || 0, masteryDefault: state.masteries.slice(),
      rest: { short:["Spend Hit Dice to heal","Recover short-rest features"], long:["HP → maximum","Spell slots → full","Hit Dice → half restored","All per-rest features reset"], shortToast:"Short rest taken.", longToast:"Long rest — fully restored." },
      studs: genStuds(), weapons: eqWeaponIds().map(function(id){ var w={id:id,carried:true}, cat=CAT.weapons[id]||{}, ranged=(cat.props||[]).some(function(p){return /range|ammunition/.test(p);}), twoH=(cat.props||[]).indexOf("two-handed")>=0;
        if(state.choices.style==="archery" && ranged) w.atkBonus=2;
        if(state.choices.style==="dueling" && !ranged && !twoH) w.dmgBonus=2;
        return w; }), cards: genCards(),
      riderHead: (hr.riders.length && hr.head) ? hr.head : undefined,
      hitRiders: hr.riders.length ? hr.riders : undefined,
      homebrew: state.homebrew || undefined,
      bespoke: state.bespoke || undefined,
      homebrewNote: state.homebrewNote || undefined,
      build: buildBlock()
    };
    return applyCustoms(ch);
  }

  /* ----- help text for the current selection of each field ----- */
  function traitBody(t){ return (t.ref && t.ref.body && t.ref.body[0]) || ""; }
  function speciesHelp(){ var sp=CAT.species[state.species]; if(!sp) return ""; return ["Traits for "+sp.name+":"].concat(Object.keys(sp.traits).map(function(k){ return sp.traits[k].name+" — "+traitBody(sp.traits[k]); })); }
  function classHelp(){ var cd=classData(); if(!cd.name) return ""; var caster=cd.caster==="full"?"full caster":cd.caster==="half"?"half caster":"non-caster"; return [cd.desc||"", "Hit die "+cd.hitDie+" · saves "+(cd.saves||[]).join("/")+" · "+caster+(cd.spellAbility?(" ("+cd.spellAbility+")"):"")+" · choose "+((cd.skillChoices||{}).count||0)+" skills."]; }
  function subclassHelp(){ if(!state.subclass) return "Your subclass is chosen at level 3 and shapes your class's identity."; var s=CAT.subclasses[state.subclass]; if(!s) return ""; return [s.desc||"", "Features: "+(s.features||[]).join(", ")+"."]; }
  function backgroundHelp(){ var b=CAT.backgrounds[state.background]; return b ? [(b.ref&&b.ref.body&&b.ref.body[0])||""] : ""; }
  function featHelp(){ if(!state.originFeat) return "A level-1 Origin feat. Human Versatile grants one; other species don't. (ASI feats at 4/8/12/16/19 are chosen under Advancement.)"; var f=CAT.feats[state.originFeat]; return (f&&f.ref&&f.ref.body) ? f.ref.body : (f?[f.name]:""); }

  /* ----- ability arrays ----- */
  var STANDARD_ARRAY=[15,14,13,12,10,8];
  var HEROIC_ARRAY=[17,15,14,12,10,8];
  function setArray(vals){ ABIL.forEach(function(a,i){ state.base[a]=vals[i]; }); render(); }
  function optimizeForClass(){
    var pr=(classData().priority)||ABIL.slice();
    var vals=ABIL.map(function(a){ return state.base[a]||10; }).sort(function(x,y){ return y-x; });
    var out={}; pr.forEach(function(a,i){ out[a]=vals[i]; });
    ABIL.forEach(function(a){ if(out[a]==null) out[a]=10; });
    state.base=out; render();
  }

  /* ----- rendering ----- */
  var root;
  /* a labelled control. NOTE: container is a <div>, not <label> — wrapping a
     <select> in a <label> makes the click forward and the dropdown reopen/close,
     which reads as "can't be changed". */
  function field(label, control, hint, help){
    var lab=el("span",{class:"bf-l",text:label}), pop=null;
    if(help){
      pop=el("div",{class:"bf-pop"}, [].concat(help).map(function(p){ return el("p",{text:p}); }));
      pop.style.display="none";
      lab.appendChild(el("button",{class:"bf-q", type:"button", "aria-label":"What is this?", text:"?", onclick:function(){ pop.style.display = pop.style.display==="none"?"block":"none"; }}));
    }
    return el("div",{class:"bf"},[ lab, control, hint?el("span",{class:"bf-h",text:hint}):null, pop ].filter(Boolean));
  }
  function select(value, options, onchange){
    var s=el("select",{class:"bsel", onchange:function(e){ onchange(e.target.value); }});
    options.forEach(function(o){ s.appendChild(opt(o[0],o[1], o[0]===value, o[2])); }); return s;
  }
  /* a select field that explains itself when it can't be changed (≤1 selectable option) */
  function selField(label, value, options, onchange, hint, help){
    var enabled=options.filter(function(o){ return !o[2]; });
    var s=select(value, options, onchange);
    var fixed = enabled.length<=1;
    if(fixed) s.disabled=true;
    return field(label, s, fixed ? (hint || "Only one option available for this build.") : "", help);
  }
  /* feat options: collapse the class-specific Magic Initiate variants to one
     undecorated "Magic Initiate", and disable feats restricted to other classes */
  function featOptions(){
    var miByClass={wizard:"magicinitiate-wiz", cleric:"magicinitiate-cleric", druid:"magicinitiate", ranger:"magicinitiate"};
    var miPick=miByClass[state.cls];
    var out=[["","— none —"]];
    Object.keys(CAT.feats).forEach(function(id){
      var f=CAT.feats[id];
      if(/^magicinitiate/.test(id)){ if(id===miPick) out.push([id, "Magic Initiate"]); return; }
      if(f.requires && f.requires.class && f.requires.class.indexOf(state.cls)<0)
        out.push([id, f.name+" ("+f.requires.class.map(titleCase).join("/")+" only)", true]);
      else out.push([id, f.name]);
    });
    return out;
  }
  function render(){
    root.innerHTML="";
    syncPrimary();
    if(state.classes[0].level<3) state.classes[0].subclass="";  // subclass is a level-3 choice
    syncPrimary();
    var cd = classData(), sp = CAT.species[state.species], bg = CAT.backgrounds[state.background];
    var d = derive();
    // drop spell picks no longer valid for the class/level
    state.cantrips = state.cantrips.filter(function(id){ return classCantrips().indexOf(id)>=0; });
    state.prepared = state.prepared.filter(function(id){ return classLeveledSpells().indexOf(id)>=0; });

    // class rows (multiclass): one row per class with class + level + subclass
    var classList = el("div",{class:"cls-list"});
    state.classes.forEach(function(cl, i){
      var cdi = CAT.classes[cl.cls] || {}, scLvl = cdi.subclassLevel || 3;
      var subOpts = cl.level < scLvl ? [["","— lvl "+scLvl+" —"]] : [["","— none —"]].concat((cdi.subclasses||[]).map(function(s){ return [s,(CAT.subclasses[s]||{}).name||titleCase(s)]; }));
      var row = el("div",{class:"cls-row"},[
        select(cl.cls, Object.keys(CAT.classes).map(function(k){return [k,CAT.classes[k].name];}), function(v){ cl.cls=v; cl.subclass=""; if(i===0){ state.skills=[]; state.originFeat=""; state.cantrips=[]; state.prepared=[]; state.choices={style:"",expertise:[],order:"",skillful:state.choices.skillful,lineage:state.choices.lineage}; } render(); }),
        select(String(cl.level), Array.from({length:20},function(_,n){return [String(n+1),"Lvl "+(n+1)];}), function(v){ cl.level=parseInt(v,10); render(); }),
        select(cl.subclass, subOpts, function(v){ cl.subclass=v; render(); }),
        (i>0 ? el("button",{class:"bbtn tiny", type:"button", "aria-label":"Remove class", text:"✕", onclick:function(){ state.classes.splice(i,1); render(); }}) : el("span",{class:"cls-tag", text:"primary"}))
      ]);
      classList.appendChild(row);
    });
    classList.appendChild(el("button",{class:"bbtn tiny ember", type:"button", text:"+ Add class", onclick:function(){ state.classes.push({cls:"fighter", subclass:"", level:1}); render(); }}));

    // identity + core selects
    var core = el("div",{class:"bcard"},[
      el("h2",{text:"Identity"}),
      field("Name", el("input",{class:"binput", value:state.name, oninput:function(e){ state.name=e.target.value; refreshOut(); }})),
      el("div",{class:"bgrid"},[
        selField("Species", state.species, Object.keys(CAT.species).map(function(k){return [k,CAT.species[k].name];}), function(v){ state.species=v; if(!speciesGrantsFeat()) state.originFeat=""; if(!speciesSkillTrait()) state.choices.skillful=""; state.choices.lineage=""; render(); }, "", speciesHelp()),
        selField("Background", state.background, Object.keys(CAT.backgrounds).map(function(k){return [k,CAT.backgrounds[k].name];}), function(v){ state.background=v; render(); }, "", backgroundHelp())
      ]),
      el("div",{class:"bsub",text:"Classes — total level "+state.level+" · proficiency bonus "+fmt(pbForLevel(state.level))+(state.classes.length>1?" · saves from your first class":"")}),
      classList
    ]);

    // equipment: one autocomplete to add weapons, armor, shields, and supplies.
    // Equipping (worn armor, drawn weapons) happens on the sheet, not here.
    var EQ_OPTS = [];
    Object.keys(CAT.weapons).forEach(function(id){ EQ_OPTS.push({label:CAT.weapons[id].name, kind:"weapon", id:id}); });
    Object.keys(CAT.armor).filter(function(k){return k!=="magearmor";}).forEach(function(id){ EQ_OPTS.push({label:CAT.armor[id].label, kind:"armor", id:id}); });
    EQ_OPTS.push({label:"Shield", kind:"shield"});
    var eqInput = el("input",{class:"binput", placeholder:"Search weapons, armor, shields, supplies…", autocomplete:"off"});
    var eqResults = el("div",{class:"eq-results"}); eqResults.style.display="none";
    function addEquipItem(o){
      if(o.kind==="shield" && eqHasShield()){ eqInput.value=""; eqResults.style.display="none"; return; }
      state.equipment.push(o.id ? {kind:o.kind, id:o.id, name:o.label} : {kind:"item", name:o.label});
      render();
    }
    function showEqResults(){
      var q=(eqInput.value||"").trim().toLowerCase(); eqResults.innerHTML="";
      if(!q){ eqResults.style.display="none"; return; }
      var matches=EQ_OPTS.filter(function(o){ return o.label.toLowerCase().indexOf(q)>=0; });
      matches.sort(function(a,b){ var as=a.label.toLowerCase().indexOf(q)===0?0:1, bs=b.label.toLowerCase().indexOf(q)===0?0:1; return as!==bs?as-bs:a.label.localeCompare(b.label); });
      matches.slice(0,8).forEach(function(o){ eqResults.appendChild(el("button",{class:"eq-res", type:"button", onclick:function(){ addEquipItem(o); }},[ el("span",{class:"eq-kind eq-"+o.kind, text:o.kind}), el("span",{class:"eq-rname", text:o.label}) ])); });
      var typed=eqInput.value.trim();
      eqResults.appendChild(el("button",{class:"eq-res", type:"button", onclick:function(){ addEquipItem({kind:"item", label:typed}); }},[ el("span",{class:"eq-kind eq-item", text:"supply"}), el("span",{class:"eq-rname", text:'Add “'+typed+'” as a supply'}) ]));
      eqResults.style.display="block";
    }
    eqInput.addEventListener("input", showEqResults);
    eqInput.addEventListener("keydown", function(e){ if(e.key==="Enter"){ e.preventDefault(); var q=eqInput.value.trim(); if(!q) return; var m=EQ_OPTS.filter(function(o){ return o.label.toLowerCase()===q.toLowerCase(); })[0]; addEquipItem(m||{kind:"item", label:q}); } });
    var eqList = el("div",{class:"eq-list"});
    if(!state.equipment.length) eqList.appendChild(el("div",{class:"bf-h",text:"No equipment yet — add weapons, armor, and supplies above."}));
    state.equipment.forEach(function(e, idx){
      eqList.appendChild(el("div",{class:"eq-row"},[
        el("span",{class:"eq-kind eq-"+e.kind, text:e.kind}),
        el("span",{class:"eq-name", text:e.name||e.id||"?"}),
        el("button",{class:"bbtn tiny", type:"button", "aria-label":"Remove", text:"✕", onclick:function(){ state.equipment.splice(idx,1); render(); }})
      ]));
    });
    var equipCard = el("div",{class:"bcard"},[ el("h2",{text:"Equipment"}),
      el("div",{class:"bsub",text:"Weapons, armor, shields, and supplies the character owns. Which armor is worn and which weapons are drawn is decided on the sheet (AC and attacks are derived there)."}),
      el("div",{class:"eq-search"},[ eqInput, eqResults ]),
      eqList
    ]);

    // spells: cantrips + prepared from the class list (casters only)
    var spellCard=null;
    if(primaryCaster()){
      spellCard=el("div",{class:"bcard"},[ el("h2",{text:"Spells"}) ]);
      var cKnown=cantripsKnown();
      if(cKnown){
        spellCard.appendChild(el("div",{class:"bsub",text:"Cantrips ("+state.cantrips.length+"/"+cKnown+"):"}));
        var cw=el("div",{class:"bchips"});
        classCantrips().forEach(function(id){ var on=state.cantrips.indexOf(id)>=0;
          cw.appendChild(el("button",{class:"bchip"+(on?" on":""), type:"button", text:CAT.spells[id].name, onclick:function(){
            var i=state.cantrips.indexOf(id); if(i>=0) state.cantrips.splice(i,1); else { if(state.cantrips.length>=cKnown) return; state.cantrips.push(id); } render();
          }}));
        });
        spellCard.appendChild(cw);
      }
      var pc=preparedCount();
      if(pc){
        var cap=anySchoolCap(), offNote=(cap>0 && cap<Infinity) ? " · up to "+cap+" from any school" : "";
        spellCard.appendChild(el("div",{class:"bsub",text:"Prepared spells ("+state.prepared.length+"/"+pc+") — up to spell level "+maxSpellLevel()+offNote+":"}));
        var pw=el("div",{class:"bchips"});
        classLeveledSpells().forEach(function(id){ var s=CAT.spells[id], on=state.prepared.indexOf(id)>=0, off=offSchool(id);
          pw.appendChild(el("button",{class:"bchip"+(on?" on":"")+(off?" alt":""), type:"button", text:s.name+" · L"+s.level+(off?" ✦":""), onclick:function(){
            var i=state.prepared.indexOf(id);
            if(i>=0){ state.prepared.splice(i,1); }
            else { if(state.prepared.length>=pc) return;
              if(off && state.prepared.filter(offSchool).length>=cap) return;   // off-school any-school cap reached
              state.prepared.push(id); }
            render();
          }}));
        });
        spellCard.appendChild(pw);
        if(cap>0 && cap<Infinity) spellCard.appendChild(el("div",{class:"bhint",text:"✦ = outside your school restriction (limited to "+cap+")."}));
      }
    }

    // weapon mastery: mastered weapon TYPES (a class feature), independent of
    // what the character actually carries
    var masteryCard=null;
    if(cd.weaponMastery){
      masteryCard = el("div",{class:"bcard"},[ el("h2",{text:"Weapon Mastery"}),
        el("div",{class:"bsub",text:"Weapon types you've mastered — up to "+cd.weaponMastery+" ("+state.masteries.length+"/"+cd.weaponMastery+"). Independent of your inventory."}) ]);
      var mWrap=el("div",{class:"bchips"});
      Object.keys(CAT.weapons).filter(function(id){ return CAT.weapons[id].mastery; }).sort(function(a,b){ return CAT.weapons[a].name<CAT.weapons[b].name?-1:1; }).forEach(function(id){
        var w=CAT.weapons[id], on=state.masteries.indexOf(id)>=0;
        mWrap.appendChild(el("button",{class:"bchip"+(on?" on":""), type:"button", text:w.name+" · "+w.mastery, onclick:function(){
          var i=state.masteries.indexOf(id);
          if(i>=0) state.masteries.splice(i,1); else { if(state.masteries.length>=cd.weaponMastery) return; state.masteries.push(id); }
          render();
        }}));
      });
      masteryCard.appendChild(mWrap);
    }

    // abilities
    var inc = abilityIncreases();
    var abilRows = ABIL.map(function(a){
      var input = el("input",{class:"babil", type:"number", min:"1", max:"20", value:String(state.base[a]), oninput:function(e){ state.base[a]=parseInt(e.target.value,10)||10; render(); }});
      var fin = (state.base[a]||10)+(inc[a]||0);
      return el("div",{class:"brow"},[
        el("span",{class:"bab-n",text:a}), input,
        el("span",{class:"bab-i",text: inc[a]?("+"+inc[a]+" bg"):""}),
        el("span",{class:"bab-f",text:"= "+fin+" ("+fmt(mod(fin))+")"})
      ]);
    });
    var arrayRow = el("div",{class:"barrays"},[
      el("button",{class:"bbtn tiny", type:"button", text:"Standard array", title:"15 14 13 12 10 8", onclick:function(){ setArray(STANDARD_ARRAY); }}),
      el("button",{class:"bbtn tiny", type:"button", text:"Heroic array", title:"17 15 14 12 10 8", onclick:function(){ setArray(HEROIC_ARRAY); }}),
      el("button",{class:"bbtn tiny ember", type:"button", text:"Optimize for "+(cd.name||"class"), onclick:optimizeForClass })
    ]);
    var abilCard = el("div",{class:"bcard", id:"ability-scores"},[ el("h2",{text:"Ability Scores"}),
      el("div",{class:"bsub",text:"Background adds "+(Object.keys(inc).map(function(k){return fmt(inc[k])+" "+k;}).join(", ")||"nothing")+". Optimize assigns your current values to the best stats for the class."}),
      arrayRow ].concat(abilRows));

    // skills — sheet-like list: ● locked chits for granted skills, checkboxes for class choices
    var skillCard = el("div",{class:"bcard", id:"skills"},[ el("h2",{text:"Skills"}) ]);
    var auto = autoSkills();
    state.skills = state.skills.filter(function(s){ return !auto[s]; });   // drop class picks that a background/feature now grants (no duplicates)
    var classFrom = (cd.skillChoices && cd.skillChoices.from) || [];
    var max = cd.skillChoices ? cd.skillChoices.count : 0;
    var pickedCount = state.skills.filter(function(s){ return !auto[s]; }).length;
    var subBits=[]; var bgsk=(bg&&bg.effects&&bg.effects.skills)||[];
    if(bgsk.length) subBits.push("● granted skills are locked");
    if(max) subBits.push("choose "+max+" class skill"+(max>1?"s":"")+" ("+pickedCount+"/"+max+")");
    skillCard.appendChild(el("div",{class:"bsub",text: subBits.join(" · ")||"No skill choices for this build."}));
    var skillList = el("div",{class:"skill-list"});
    Object.keys(SKILL_ABIL).sort().forEach(function(sk){
      var locked=auto[sk], canChoose=classFrom.indexOf(sk)>=0, chosen=state.skills.indexOf(sk)>=0, on=!!locked||chosen;
      var ctrl;
      if(locked){ ctrl=el("span",{class:"sk-chit", title:"From "+locked, text:"●"}); }
      else if(canChoose){ ctrl=el("input",{type:"checkbox", class:"sk-cb", checked:chosen?"checked":null, onchange:function(e){
          var i=state.skills.indexOf(sk);
          if(e.target.checked){ if(i<0){ if(pickedCount>=max){ e.target.checked=false; return; } state.skills.push(sk); } }
          else if(i>=0) state.skills.splice(i,1);
          render();
        }}); }
      else { ctrl=el("span",{class:"sk-na", text:"·"}); }
      skillList.appendChild(el("label",{class:"skill-row"+(on?" on":"")+(!locked&&!canChoose?" na":"")},[
        ctrl, el("span",{class:"sk-name",text:sk}), el("span",{class:"sk-ab",text:SKILL_ABIL[sk]})
      ]));
    });
    skillCard.appendChild(skillList);
    var langInput = el("input",{class:"binput", placeholder:"e.g. Common, Elvish, Dwarvish", oninput:function(e){ state.languages=e.target.value.split(",").map(function(s){return s.trim();}).filter(Boolean); refreshOut(); }});
    langInput.value = state.languages.join(", ");
    skillCard.appendChild(field("Languages", langInput, "Known languages, comma-separated."));

    // origin feat (level 1): every background grants one (shown read-only); only
    // species with the Versatile trait (Human) grant a second, selectable one
    var featCard = el("div",{class:"bcard", id:"origin-feat"},[ el("h2",{text:"Origin Feat"}) ]);
    var bgFeat = backgroundFeat();
    if(bgFeat) featCard.appendChild(el("div",{class:"bsub",text:"From background: "+((CAT.feats[bgFeat]||{}).name||bgFeat).replace(/\s*\(.*\)$/,"")}));
    if(speciesGrantsFeat()) featCard.appendChild(selField((CAT.species[state.species].name)+" extra origin feat", state.originFeat, featOptions(), function(v){ state.originFeat=v; render(); }, "", featHelp()));
    else featCard.appendChild(el("div",{class:"bf-h",text:(CAT.species[state.species]||{}).name+" doesn't grant an extra origin feat — only the background's."}));

    // advancement: subclass (L3) + ASIs (4/8/12/16/19)
    var advCard = el("div",{class:"bcard", id:"advancement"},[ el("h2",{text:"Advancement"}) ]);
    var reached = reachedASIs();
    advCard.appendChild(el("div",{class:"bsub",text: state.level<3 ? "Subclass unlocks at level 3." : (reached.length ? "Each ASI: +2 to one ability, +1 to two, or a feat." : "First Ability Score Improvement comes at level 4.")}));
    reached.forEach(function(slot){
      if(!state.asis[slot.key]) state.asis[slot.key]=asiDefault();
      var a=state.asis[slot.key], detail;
      var modeSel=select(a.mode, [["asi2","+2 one"],["asi11","+1 / +1"],["feat","Feat"]], function(v){ a.mode=v; render(); });
      if(a.mode==="feat") detail=select(a.feat, featOptions(), function(v){ a.feat=v; render(); });
      else if(a.mode==="asi2") detail=select(a.a, ABIL.map(function(k){return [k,ABIL_NAME[k]];}), function(v){ a.a=v; render(); });
      else detail=el("span",{class:"adv-two"},[ select(a.a, ABIL.map(function(k){return [k,k];}), function(v){a.a=v;render();}), select(a.b, ABIL.map(function(k){return [k,k];}), function(v){a.b=v;render();}) ]);
      advCard.appendChild(el("div",{class:"adv-row"},[ el("span",{class:"adv-lvl",text:slot.label.replace("Level ","L")}), modeSel, detail ]));
    });

    // derived panel
    var stat = function(l,v){ return el("div",{class:"bstat"},[ el("span",{class:"bs-l",text:l}), el("span",{class:"bs-v",text:String(v)}) ]); };
    var derivedCard = el("div",{class:"bcard bderived"},[ el("h2",{text:"Derived"}),
      el("div",{class:"bstats"},[
        stat("Prof Bonus", fmt(d.pb)), stat("AC", d.ac), stat("HP (avg)", d.hp), stat("Speed", d.speed+" ft"),
        stat("Initiative", fmt(d.initiative)), stat("Passive Per", d.passivePer),
        stat("Saves", d.saves.join(", ")||"—"),
        d.spellDC?stat("Spell DC", d.spellDC):null, d.spellAtk!=null?stat("Spell Atk", fmt(d.spellAtk)):null
      ].filter(Boolean))
    ]);

    // completeness / legality panel — same checker the round-trip test enforces
    var legalIssues = [];
    try { if(typeof checkLegality==="function") legalIssues = checkLegality(scaffold(), CAT) || []; } catch(e){ legalIssues=[]; }
    var legalErrors = legalIssues.filter(function(i){ return i.level==="error"; });
    var legalWarns = legalIssues.filter(function(i){ return i.level==="warn"; });
    function issueRow(i, soft){
      return el("button",{class:"comp-row"+(soft?" soft":""), type:"button", title:"Jump to the relevant card", onclick:function(){
        var t=document.getElementById(i.anchor); if(t){ t.scrollIntoView({behavior:"smooth", block:"center"}); t.classList.add("flash"); setTimeout(function(){ t.classList.remove("flash"); },1200); }
      }},[ el("span",{class:"comp-dot",text: soft?"!":"✗"}), el("span",{class:"comp-msg",text:i.msg}) ]);
    }
    var hbToggle = el("label",{class:"hb-toggle"},[
      el("input",{type:"checkbox", checked: state.homebrew?"checked":null, onchange:function(e){ state.homebrew=e.target.checked; render(); }}),
      el("span",{text:" Homebrew — allow a non-legal build (flags the export)"})
    ]);
    var bsToggle = el("label",{class:"hb-toggle"},[
      el("input",{type:"checkbox", checked: state.bespoke?"checked":null, onchange:function(e){ state.bespoke=e.target.checked; render(); }}),
      el("span",{text:" Bespoke — hand-authored, custom content (not necessarily RAW)"})
    ]);
    var waived = state.homebrew || state.bespoke;
    var compBody=[hbToggle, bsToggle];
    if(waived){
      var note=state.bespoke
        ? "⚙ Bespoke — this character has custom traits that don't necessarily match the rules as written. Legality isn't enforced and the sheet shows a Bespoke banner."
        : "⚙ Homebrew — legality isn't enforced and the export is flagged homebrew.";
      compBody.push(el("div",{class:"comp-note",text:note}));
      var noteTa=el("input",{class:"binput", placeholder:"Optional note shown on the sheet banner…", value:state.homebrewNote||"", oninput:function(e){ state.homebrewNote=e.target.value; refreshOut(); }});
      compBody.push(noteTa);
    } else if(!legalIssues.length){
      compBody.push(el("div",{class:"comp-ok",text:"✓ Legal character — every required choice is made."}));
    } else {
      if(legalErrors.length) compBody.push(el("div",{class:"comp-h",text:legalErrors.length+" thing"+(legalErrors.length>1?"s":"")+" to fix before this is a legal character:"}));
      legalErrors.forEach(function(i){ compBody.push(issueRow(i,false)); });
      if(legalWarns.length) compBody.push(el("div",{class:"comp-h soft",text:"Worth checking:"}));
      legalWarns.forEach(function(i){ compBody.push(issueRow(i,true)); });
    }
    var completenessCard = el("div",{class:"bcard bcomp "+(waived?"hb":(legalErrors.length?"bad":"good"))},
      [ el("h2",{text:"Completeness"}) ].concat(compBody));

    // output
    var outArea = el("textarea",{class:"bout", id:"bOut", readonly:"readonly", rows:"14"});
    var outCard = el("div",{class:"bcard"},[ el("h2",{text:"Character JSON"}),
      el("div",{class:"bsub",text:"A starting scaffold — drop into src/characters/, then add weapons, cards, combat, and subclass features."}),
      el("div",{class:"brow2"},[
        el("button",{class:"bbtn", type:"button", text:"Copy", onclick:function(){ var t=document.getElementById("bOut"); t.select(); try{document.execCommand("copy");}catch(e){} }}),
        el("button",{class:"bbtn", type:"button", text:"Download .json", onclick:downloadJson}),
        el("button",{class:"bbtn ember", type:"button", text:"Preview →", onclick:previewChar})
      ]),
      outArea
    ]);

    // feature sub-choices (Lineage, Fighting Style, Expertise, Divine Order)
    var choiceCard=null, choiceFields=[];
    var spLin=(CAT.species[state.species]||{}).lineage;
    if(spLin){ var linOpts=Object.keys(spLin.options).map(function(k){ return [k, spLin.options[k].name]; });
      choiceFields.push(selField(spLin.label, state.choices.lineage, [["","— choose —"]].concat(linOpts), function(v){ state.choices.lineage=v; render(); }, "", linOpts.map(function(o){ return spLin.options[o[0]].ref.body[0]; }))); }
    if(speciesSkillTrait()) choiceFields.push(selField((CAT.species[state.species].name)+" Skillful — extra skill", state.choices.skillful, [["","— choose a skill —"]].concat(Object.keys(SKILL_ABIL).sort().map(function(s){return [s,s+" ("+SKILL_ABIL[s]+")"];})), function(v){ state.choices.skillful=v; render(); }, "", "Human Skillful grants proficiency in one skill of your choice."));
    if(featureReached("Fighting Style")) choiceFields.push(selField("Fighting Style", state.choices.style, [["","— choose —"]].concat(FIGHTING_STYLES.map(function(s){return [s.id,s.name];})), function(v){ state.choices.style=v; render(); }, "", FIGHTING_STYLES.map(function(s){return s.name+" — "+s.note;})));
    if(needsExpertise()){ var ps=proficientSkills(), xcnt=expertiseCount();
      if(!Array.isArray(state.choices.expertise)) state.choices.expertise=state.choices.expertise?[state.choices.expertise]:[];
      for(var ei=0; ei<xcnt; ei++){ (function(idx){
        var taken={}; state.choices.expertise.forEach(function(s,j){ if(j!==idx && s) taken[s]=1; });   // no duplicate Expertise picks
        var opts=[["","— choose a proficient skill —"]].concat(ps.filter(function(s){ return !taken[s]; }).map(function(s){ return [s,s]; }));
        choiceFields.push(selField("Expertise"+(xcnt>1?" "+(idx+1):""), state.choices.expertise[idx]||"", opts, function(v){ state.choices.expertise[idx]=v; render(); }, ps.length?"":"Pick class skills first."));
      })(ei); }
    }
    if(featureReached("Divine Order")) choiceFields.push(selField("Divine Order", state.choices.order, [["","— choose —"],["protector","Protector — martial weapons & heavy armor"],["thaumaturge","Thaumaturge — extra cantrip & Arcana bonus"]], function(v){ state.choices.order=v; render(); }));
    if(choiceFields.length) choiceCard=el("div",{class:"bcard", id:"feature-choices"},[el("h2",{text:"Feature Choices"})].concat(choiceFields));

    // background story -> the sheet's Background card
    var bioTa = el("textarea",{class:"bout", rows:"7", oninput:function(e){ state.bio=e.target.value; refreshOut(); }});
    bioTa.value = state.bio || "";
    var bioCard = el("div",{class:"bcard"},[ el("h2",{text:"Background Story"}),
      el("div",{class:"bsub",text:"Bio for the sheet's Background card ("+(bgHint())+"). Separate paragraphs with a blank line. Leave empty to omit the card."}),
      bioTa ]);

    // custom elements: anything the builder doesn't model, kept structured + round-tripped
    var customCard = el("div",{class:"bcard"},[ el("h2",{text:"Custom Elements"}),
      el("div",{class:"bsub",text:"Things the builder doesn't model — captured on load (e.g. combat, ref, a Background card) and preserved through the round trip. Edit fields as a typed tree, or switch to raw JSON."}) ]);
    if(!state.customs.length) customCard.appendChild(el("div",{class:"bf-h",text:"None. Use the buttons below to add one."}));
    state.customs.forEach(function(cu, idx){
      var head=el("div",{class:"cust-head"},[
        el("span",{class:"cust-kind",text:CUSTOM_KINDS[cu.kind]||cu.kind}),
        // a top-level field is identified by its JSON field name (the key); cards/sources
        // carry a friendly display label instead. Only one box, clearly purposed.
        cu.kind==="root"
          ? el("input",{class:"binput cust-key", value:cu.key||"", placeholder:"field name", "aria-label":"JSON field name", oninput:function(e){ cu.key=e.target.value; refreshOut(); }})
          : el("input",{class:"binput cust-label", value:cu.label||"", placeholder:"label", "aria-label":"Label", oninput:function(e){ cu.label=e.target.value; }}),
        el("button",{class:"bbtn tiny", type:"button", text:cu._raw?"Tree view":"Raw JSON", onclick:function(){ cu._raw=!cu._raw; render(); }}),
        el("button",{class:"bbtn tiny", type:"button", text:"Remove", onclick:function(){ state.customs.splice(idx,1); render(); }})
      ].filter(Boolean));
      var body;
      if(cu._raw){
        var errEl=el("span",{class:"bf-h cust-err"});
        // NB: a <textarea>'s text is its .value PROPERTY, not a value attribute.
        var ta=el("textarea",{class:"bout cust-json", rows:"6",
          oninput:function(e){ try{ cu.value=JSON.parse(e.target.value); errEl.textContent=""; refreshOut(); }catch(ex){ errEl.textContent="Invalid JSON — fix to apply: "+ex.message; } }});
        ta.value=JSON.stringify(cu.value, null, 2);
        body=el("div",{},[ta, errEl]);
      } else {
        body=el("div",{class:"jt-tree"},[ jsonNode(cu.value, function(nv){ cu.value=nv; refreshOut(); }, specForCustom(cu)) ]);
      }
      customCard.appendChild(el("div",{class:"cust-row"},[head, body]));
    });
    customCard.appendChild(el("div",{class:"brow2"},[
      el("button",{class:"bbtn tiny", type:"button", text:"+ Feature/source", onclick:function(){ addCustom("source"); }}),
      el("button",{class:"bbtn tiny", type:"button", text:"+ Field", onclick:function(){ addCustom("root"); }}),
      el("button",{class:"bbtn tiny", type:"button", text:"+ Card", onclick:function(){ addCustom("card"); }})
    ]));

    // load an existing character JSON back into the form to edit it
    var loadCard = el("div",{class:"bcard"},[ el("h2",{text:"Load"}),
      el("div",{class:"bsub",text:"Edit an existing character: load its JSON from src/characters/ (best with builder-made files)."}),
      el("input",{type:"file", accept:".json,application/json", class:"binput", onchange:function(e){ var f=e.target.files[0]; if(!f) return; var r=new FileReader();
        r.onload=function(){ try{ var ch=JSON.parse(r.result); if(loadState(ch)) render(); else alert("That doesn't look like a character JSON."); }catch(err){ alert("Couldn't parse JSON: "+err.message); } };
        r.readAsText(f); }})
    ]);

    root.appendChild(el("div",{class:"bcol"},[loadCard, core, abilCard, equipCard, masteryCard, spellCard, skillCard, featCard, choiceCard, advCard, bioCard, customCard].filter(Boolean)));
    root.appendChild(el("div",{class:"bcol"},[derivedCard, completenessCard, outCard]));
    refreshOut();
  }
  function refreshOut(){ var t=document.getElementById("bOut"); if(t) t.value = JSON.stringify(scaffold(), null, 2); }
  function previewChar(){
    try { localStorage.setItem("dnd_preview", JSON.stringify(scaffold())); } catch(e){}
    window.open("view.html?preview=1", "_blank");
  }
  function downloadJson(){
    var ch=scaffold(), blob=new Blob([JSON.stringify(ch,null,2)], {type:"application/json"});
    var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=ch.id+".json"; document.body.appendChild(a); a.click(); a.remove();
  }

  document.addEventListener("DOMContentLoaded", function(){
    root=document.getElementById("builder");
    // handoff from a sheet's "Edit" link: import the character it stashed, then clear it
    try {
      if(/[?&]import=1/.test(location.search)){
        var imp=localStorage.getItem("dnd_builder_import");
        if(imp){ loadState(JSON.parse(imp)); localStorage.removeItem("dnd_builder_import"); }
      }
    } catch(e){}
    render();
  });
})();
