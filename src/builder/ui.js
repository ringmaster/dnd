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
    name:"New Hero", species:"human", cls:"ranger", subclass:"", background:"guide", level:4,
    base:{STR:15,DEX:14,CON:13,INT:12,WIS:10,CHA:8},
    skills:[], armor:"", shield:false, originFeat:"", asis:{}, weapons:[], masteries:[], cantrips:[], prepared:[]
  };
  function reachedASIs(){ return ASI_LEVELS.filter(function(l){ return l<=state.level; }); }
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

  /* ----- derived values from current state ----- */
  function abilityIncreases(){
    var inc = {};
    var bg = CAT.backgrounds[state.background];
    if(bg && bg.effects && bg.effects.abilityIncrease) for(var k in bg.effects.abilityIncrease) inc[k]=(inc[k]||0)+bg.effects.abilityIncrease[k];
    return inc;
  }
  function asiIncreases(){
    var inc={};
    reachedASIs().forEach(function(l){ var a=state.asis[l]; if(!a) return;
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
  function grantedSkills(){
    var set = {};
    var bg = CAT.backgrounds[state.background];
    if(bg && bg.effects && bg.effects.skills) bg.effects.skills.forEach(function(s){ set[s]="background"; });
    state.skills.forEach(function(s){ if(!set[s]) set[s]="class"; });
    return set;
  }
  function derive(){
    var sc = finalScores(), pb = pbForLevel(state.level), cd = classData();
    var d = { scores:sc, pb:pb, mods:{} };
    ABIL.forEach(function(a){ d.mods[a]=mod(sc[a]); });
    d.saves = (cd.saves||[]);
    // AC from equipped armor (+ shield)
    var arm = state.armor && CAT.armor[state.armor];
    if(arm){ var dex=d.mods.DEX; var dadd = arm.addDex ? (arm.dexCap!=null?Math.min(dex,arm.dexCap):dex) : 0; d.ac = arm.base + dadd; d.acNote = arm.label; }
    else { d.ac = 10 + d.mods.DEX; d.acNote = "No armor (10 + Dex)"; }
    if(state.shield){ d.ac += 2; d.acNote += " + shield"; }
    // HP (average)
    var die = cd.hitDie || "d8";
    d.hp = (DIE_MAX[die]||8) + (state.level-1)*(DIE_AVG[die]||5) + state.level*d.mods.CON;
    d.initiative = d.mods.DEX + (hasFeat("alert")?pb:0);
    var perProf = !!grantedSkills()["Perception"];
    d.passivePer = 10 + d.mods.WIS + (perProf?pb:0);
    if(cd.spellAbility){ var sm=d.mods[cd.spellAbility]; d.spellDC=8+pb+sm; d.spellAtk=pb+sm; d.spellAbility=cd.spellAbility; }
    d.speed = SPEED[state.species] || 30;
    d.hitDie = die;
    return d;
  }
  function hasFeat(id){
    var bg = CAT.backgrounds[state.background];
    if(bg && bg.grantsFeat===id) return true;
    if(state.originFeat===id) return true;
    return reachedASIs().some(function(l){ var a=state.asis[l]; return a && a.mode==="feat" && a.feat===id; });
  }
  function backgroundFeat(){ var bg=CAT.backgrounds[state.background]; return bg && bg.grantsFeat; }

  /* ----- spell slots by character level + class features ----- */
  var HALF_SLOTS={1:[2],2:[2],3:[3],4:[3],5:[4,2],6:[4,2],7:[4,3],8:[4,3],9:[4,3,2],10:[4,3,2],11:[4,3,3],12:[4,3,3],13:[4,3,3,1],14:[4,3,3,1],15:[4,3,3,2],16:[4,3,3,2],17:[4,3,3,3,1],18:[4,3,3,3,1],19:[4,3,3,3,2],20:[4,3,3,3,2]};
  var FULL_SLOTS={1:[2],2:[3],3:[4,2],4:[4,3],5:[4,3,2],6:[4,3,3],7:[4,3,3,1],8:[4,3,3,2],9:[4,3,3,3,1],10:[4,3,3,3,2],11:[4,3,3,3,2,1],12:[4,3,3,3,2,1],13:[4,3,3,3,2,1,1],14:[4,3,3,3,2,1,1],15:[4,3,3,3,2,1,1,1],16:[4,3,3,3,2,1,1,1],17:[4,3,3,3,2,1,1,1,1],18:[4,3,3,3,3,1,1,1,1],19:[4,3,3,3,3,2,1,1,1],20:[4,3,3,3,3,2,2,1,1]};
  function ordinalB(n){ var s=["th","st","nd","rd"],v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); }
  function spellSlotsFor(){
    var cd=classData(); if(!cd.spellAbility) return null;
    var table=cd.caster==="full"?FULL_SLOTS:cd.caster==="half"?HALF_SLOTS:null; if(!table) return null;
    var counts=table[Math.min(state.level,20)]||[]; if(!counts.length) return null;
    return counts.map(function(n,i){ var lvl=i+1; return {id:"slot"+lvl,label:"Level "+lvl+" Slots",max:n,rest:"long",ref:"spellslots"+lvl,storm:true,note:"long rest",use:"Spend a slot",reminder:"Spend a "+ordinalB(lvl)+"-level spell slot.",slotLevel:lvl}; });
  }
  /* spells known/prepared by class + level */
  var PREP_FULL=[0,4,5,6,7,9,10,11,12,14,15,16,16,17,18,19,21,22,23,24,25];
  var PREP_HALF=[0,2,3,4,5,6,6,7,7,9,9,10,10,11,11,12,12,14,14,15,15];
  function cantripsKnown(){ var c=state.cls; if(c==="wizard"||c==="cleric") return state.level<4?3:(state.level<10?4:5); return 0; }
  function preparedCount(){ var cd=classData(); if(!cd.spellAbility) return 0; var t=cd.caster==="full"?PREP_FULL:(cd.caster==="half"?PREP_HALF:null); return t?t[Math.min(state.level,20)]:0; }
  function maxSpellLevel(){ return (spellSlotsFor()||[]).length; }
  function classCantrips(){ return Object.keys(CAT.spells).filter(function(id){ var s=CAT.spells[id]; return s.level===0 && (s.classes||[]).indexOf(state.cls)>=0; }).sort(); }
  function classLeveledSpells(){ var mx=maxSpellLevel(); return Object.keys(CAT.spells).filter(function(id){ var s=CAT.spells[id]; return s.level>=1 && s.level<=mx && (s.classes||[]).indexOf(state.cls)>=0; }).sort(function(a,b){ var s=CAT.spells; return s[a].level-s[b].level || (s[a].name<s[b].name?-1:1); }); }
  function spellSub(reg){ var d=derive(), ab=classData().spellAbility, mod=ab?d.mods[ab]:0; var sg=function(n){return (n>=0?"+":"")+n;};
    var s=reg.dice?String(reg.dice).replace(/\{dc\}/g,d.spellDC).replace(/\{atk\}/g,sg(d.spellAtk)).replace(/\{mod\}/g,sg(mod)):"";
    return (s || (reg.level===0?"cantrip":"level "+reg.level))+(reg.concentration?" · Conc.":""); }
  function spellEntries(){
    var sc={ ability:classData().spellAbility };
    var slots=spellSlotsFor(); if(slots) sc.slots=slots;
    if(state.cantrips.length) sc.cantrips=state.cantrips.map(function(id){ return { ref:id, name:CAT.spells[id].name, sub:spellSub(CAT.spells[id]) }; });
    var pc=preparedCount();
    if(pc) sc.prepared={ max:pc, default:state.prepared.slice(), catalog:classLeveledSpells().map(function(id){ return { id:id, name:CAT.spells[id].name, note:spellSub(CAT.spells[id]), level:CAT.spells[id].level }; }) };
    return sc;
  }
  function classFeatureSources(){
    var cd=classData(), fbl=cd.featuresByLevel||{}, cf=(CAT.classFeatures||{})[state.cls]||{}, out=[];
    for(var l=1;l<=state.level;l++) (fbl[String(l)]||[]).forEach(function(name){ if(cf[name]) out.push({ id:cf[name].refId||name, name:(cd.name||"")+": "+name, include:"class:"+state.cls+":"+name }); });
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
    ]
  };
  function featureReached(name){ var fbl=classData().featuresByLevel||{}; for(var l=1;l<=state.level;l++){ if((fbl[String(l)]||[]).indexOf(name)>=0) return true; } return false; }
  function classPoolSources(){
    var out=[]; (CLASS_POOLS[state.cls]||[]).forEach(function(cp){ if(!featureReached(cp.feature)) return;
      out.push({ id:cp.id, name:cp.feature, effects:{ grantsPool:{ id:cp.id, label:cp.label, max:cp.max(state.level), rest:cp.rest, ref:cp.ref, storm:cp.storm, note:cp.note, use:cp.use, reminder:cp.reminder } } }); });
    return out;
  }
  function featureList(){
    var cd=classData(), fbl=cd.featuresByLevel||{}, cf=(CAT.classFeatures||{})[state.cls]||{}, out=[];
    for(var l=1;l<=state.level;l++) (fbl[String(l)]||[]).forEach(function(name){ if(name==="Ability Score Improvement") return; out.push({ ref:(cf[name]&&cf[name].refId)||"", name:name, sub:"Level "+l }); });
    return out;
  }

  /* ----- build block + scaffold output ----- */
  function buildBlock(){
    var cd = classData();
    var sources = [];
    sources.push({ id:state.background, name:"Background: "+(CAT.backgrounds[state.background]||{}).name, include:"background:"+state.background });
    if(state.skills.length) sources.push({ id:state.cls+"-skills", name:(cd.name||state.cls)+" skills", effects:{ skills: state.skills.slice() } });
    var sp = CAT.species[state.species];
    if(sp) Object.keys(sp.traits).forEach(function(tr){ sources.push({ id:tr, name:(sp.name+": "+sp.traits[tr].name), include:"species:"+state.species+":"+tr }); });
    // class spellcasting (slots + chosen cantrips/prepared) + class features up to level
    if(cd.spellAbility && spellSlotsFor()) sources.push({ id:"spellcasting", name:"Spellcasting", effects:{ spellcasting:spellEntries() } });
    classFeatureSources().forEach(function(s){ sources.push(s); });
    classPoolSources().forEach(function(s){ sources.push(s); });
    // level-1 origin feat (e.g. Human Versatile)
    if(state.originFeat) sources.push({ id:"feat-"+state.originFeat, name:"Origin feat: "+(CAT.feats[state.originFeat]||{}).name, grantsFeat:state.originFeat });
    // hit dice pool scales with level
    sources.push({ id:"hitdice", name:"Hit Dice ("+(cd.hitDie||"d8")+")", effects:{ grantsPool:{ id:"hd", label:"Hit Dice", max:state.level, rest:"long", ref:"hitdice", storm:false, note:"long rest", use:"Spend Hit Die", reminder:"Spend a Hit Die on a short rest to heal." } } });
    // ASIs at 4/8/12/16/19 (cumulative ability increases or feats)
    reachedASIs().forEach(function(l){ var a=state.asis[l]; if(!a) return;
      if(a.mode==="feat" && a.feat) sources.push({ id:"asi-"+l, name:"Level "+l+" feat: "+(CAT.feats[a.feat]||{}).name, grantsFeat:a.feat });
      else { var inc={}; if(a.mode==="asi2"&&a.a) inc[a.a]=2; else if(a.mode==="asi11"){ if(a.a)inc[a.a]=(inc[a.a]||0)+1; if(a.b)inc[a.b]=(inc[a.b]||0)+1; }
        if(Object.keys(inc).length) sources.push({ id:"asi-"+l, name:"Level "+l+": Ability Score Improvement", effects:{ abilityIncrease:inc } }); }
    });
    return {
      species:state.species, class:state.cls, subclass:state.subclass||undefined, background:state.background,
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
    if(state.level>=3 && state.subclass) add(3,{cls:"choice", html:"<b>Subclass:</b> "+esc((CAT.subclasses[state.subclass]||{}).name||titleCase(state.subclass))});
    reachedASIs().forEach(function(l){ var a=state.asis[l]; if(!a) return; var h;
      if(a.mode==="feat") h="<b>Feat:</b> "+esc(featName(a.feat)||"(choose one)");
      else if(a.mode==="asi2") h="<b>Ability Score Improvement:</b> +2 "+esc(a.a||"?");
      else h="<b>Ability Score Improvement:</b> +1 "+esc(a.a||"?")+", +1 "+esc(a.b||"?");
      add(l,{cls:"choice", html:h});
    });
    return Object.keys(byLevel).map(Number).sort(function(a,b){return a-b;}).map(function(l){ return {title:"Level "+l, tag:cd.name||"", items:byLevel[l]}; });
  }
  function genCards(){
    var cd=classData(), cards=[ {type:"abilities"}, {type:"hitpoints"}, {type:"attacks"} ];
    if(cd.spellAbility) cards.push({type:"spellcasting"});
    cards.push({type:"skills"});
    cards.push({type:"pools", title:"Resources", pools:"*"});
    if(state.weapons.length) cards.push({type:"inventory", items:[]});
    var feats=featureList(); if(feats.length) cards.push({type:"features", title:"Features & Traits", list:feats});
    cards.push({type:"buildlog", title:"Build Log", hint:"every choice, level by level", levels:genBuildLog()});
    return cards;
  }
  function scaffold(){
    var d = derive(), cd = classData();
    var slug = state.name.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"") || "hero";
    var ch = {
      id: slug, out: slug+".html", name: state.name,
      subtitle: ((CAT.species[state.species]||{}).name||"")+" "+((cd.name)||"")+" · Level "+state.level,
      title: state.name, footer: "Built with the character builder",
      storageKey: "dnd_"+slug, level: state.level, hitDie: d.hitDie,
      proficiencyBonus: d.pb, saves: d.saves, speed: d.speed,
      ac: (function(){ var ac={}; if(state.armor) ac.armor=state.armor; if(state.shield) ac.shield={label:"Shield",bonus:2,note:"+2 AC",default:true}; return ac; })(),
      hp: { max: d.hp },
      masteryMax: cd.weaponMastery || 0, masteryDefault: state.masteries.slice(),
      rest: { short:["Spend Hit Dice to heal","Recover short-rest features"], long:["HP → maximum","Spell slots → full","Hit Dice → half restored","All per-rest features reset"], shortToast:"Short rest taken.", longToast:"Long rest — fully restored." },
      studs: genStuds(), weapons: state.weapons.map(function(id){ return { id:id, carried:true }; }), cards: genCards(), combat: null,
      build: buildBlock()
    };
    return ch;
  }

  /* ----- help text for the current selection of each field ----- */
  function traitBody(t){ return (t.ref && t.ref.body && t.ref.body[0]) || ""; }
  function speciesHelp(){ var sp=CAT.species[state.species]; if(!sp) return ""; return ["Traits for "+sp.name+":"].concat(Object.keys(sp.traits).map(function(k){ return sp.traits[k].name+" — "+traitBody(sp.traits[k]); })); }
  function classHelp(){ var cd=classData(); if(!cd.name) return ""; var caster=cd.caster==="full"?"full caster":cd.caster==="half"?"half caster":"non-caster"; return [cd.desc||"", "Hit die "+cd.hitDie+" · saves "+(cd.saves||[]).join("/")+" · "+caster+(cd.spellAbility?(" ("+cd.spellAbility+")"):"")+" · choose "+((cd.skillChoices||{}).count||0)+" skills."]; }
  function subclassHelp(){ if(!state.subclass) return "Your subclass is chosen at level 3 and shapes your class's identity."; var s=CAT.subclasses[state.subclass]; if(!s) return ""; return [s.desc||"", "Features: "+(s.features||[]).join(", ")+"."]; }
  function backgroundHelp(){ var b=CAT.backgrounds[state.background]; return b ? [(b.ref&&b.ref.body&&b.ref.body[0])||""] : ""; }
  function featHelp(){ if(!state.originFeat) return "A level-1 Origin feat. Human Versatile grants one; other species don't. (ASI feats at 4/8/12/16/19 are chosen under Advancement.)"; var f=CAT.feats[state.originFeat]; return (f&&f.ref&&f.ref.body) ? f.ref.body : (f?[f.name]:""); }
  function armorHelp(){ if(!state.armor) return "No armor: AC = 10 + your Dexterity modifier. A shield adds +2."; var a=CAT.armor[state.armor]; return a?[a.label+" — "+a.note]:""; }

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
    if(state.level<3) state.subclass="";                       // subclass is a level-3 choice
    var cd = classData(), sp = CAT.species[state.species], bg = CAT.backgrounds[state.background];
    var d = derive();
    // drop spell picks no longer valid for the class/level
    state.cantrips = state.cantrips.filter(function(id){ return classCantrips().indexOf(id)>=0; });
    state.prepared = state.prepared.filter(function(id){ return classLeveledSpells().indexOf(id)>=0; });

    // identity + core selects
    var core = el("div",{class:"bcard"},[
      el("h2",{text:"Identity"}),
      field("Name", el("input",{class:"binput", value:state.name, oninput:function(e){ state.name=e.target.value; refreshOut(); }})),
      el("div",{class:"bgrid"},[
        selField("Species", state.species, Object.keys(CAT.species).map(function(k){return [k,CAT.species[k].name];}), function(v){ state.species=v; render(); }, "", speciesHelp()),
        selField("Class", state.cls, Object.keys(CAT.classes).map(function(k){return [k,CAT.classes[k].name];}), function(v){ state.cls=v; state.subclass=""; state.skills=[]; state.originFeat=""; state.cantrips=[]; state.prepared=[]; render(); }, "", classHelp()),
        selField("Subclass", state.subclass, state.level<3 ? [["","— locked —"]] : [["","— none —"]].concat((cd.subclasses||[]).map(function(s){return [s,(CAT.subclasses[s]||{}).name || titleCase(s)];})), function(v){ state.subclass=v; render(); }, state.level<3 ? "Subclass is gained at level 3." : "Pick a class first.", subclassHelp()),
        selField("Background", state.background, Object.keys(CAT.backgrounds).map(function(k){return [k,CAT.backgrounds[k].name];}), function(v){ state.background=v; render(); }, "", backgroundHelp()),
        selField("Level", String(state.level), Array.from({length:20},function(_,i){return [String(i+1),"Level "+(i+1)];}), function(v){ state.level=parseInt(v,10); render(); }, "", "Your character level (1–20). Higher levels raise Proficiency Bonus, HP, spell slots, and unlock features.")
      ])
    ]);

    // equipped gear -> AC (Mage Armor is a spell, not armor, so it isn't here)
    var armorOpts=[["","No armor (10 + Dex)"]].concat(Object.keys(CAT.armor).filter(function(k){return k!=="magearmor";}).map(function(k){return [k,CAT.armor[k].label];}));
    var gearCard = el("div",{class:"bcard"},[ el("h2",{text:"Equipped"}),
      el("div",{class:"bsub",text:"Armor Class is built from what you have equipped."}),
      selField("Armor", state.armor, armorOpts, function(v){ state.armor=v; render(); }, "", armorHelp()),
      el("label",{class:"bcheck"},[ el("input",{type:"checkbox", checked: state.shield?"checked":null, onchange:function(e){ state.shield=e.target.checked; render(); }}), el("span",{text:"Shield (+2 AC)"}) ])
    ]);

    // spells: cantrips + prepared from the class list (casters only)
    var spellCard=null;
    if(cd.spellAbility){
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
        spellCard.appendChild(el("div",{class:"bsub",text:"Prepared spells ("+state.prepared.length+"/"+pc+") — up to spell level "+maxSpellLevel()+":"}));
        var pw=el("div",{class:"bchips"});
        classLeveledSpells().forEach(function(id){ var s=CAT.spells[id], on=state.prepared.indexOf(id)>=0;
          pw.appendChild(el("button",{class:"bchip"+(on?" on":""), type:"button", text:s.name+" · L"+s.level, onclick:function(){
            var i=state.prepared.indexOf(id); if(i>=0) state.prepared.splice(i,1); else { if(state.prepared.length>=pc) return; state.prepared.push(id); } render();
          }}));
        });
        spellCard.appendChild(pw);
      }
    }

    // weapons: pick your kit + masteries
    var wpnCard = el("div",{class:"bcard"},[ el("h2",{text:"Weapons"}),
      el("div",{class:"bsub",text:"Tap weapons to add them to your kit — they show in Attacks and Inventory."}) ]);
    var wWrap=el("div",{class:"bchips"});
    Object.keys(CAT.weapons).sort(function(a,b){ return CAT.weapons[a].name<CAT.weapons[b].name?-1:1; }).forEach(function(id){
      var w=CAT.weapons[id], on=state.weapons.indexOf(id)>=0;
      wWrap.appendChild(el("button",{class:"bchip"+(on?" on":""), type:"button", text:w.name, onclick:function(){
        var i=state.weapons.indexOf(id);
        if(i>=0){ state.weapons.splice(i,1); var mi=state.masteries.indexOf(id); if(mi>=0) state.masteries.splice(mi,1); }
        else state.weapons.push(id);
        render();
      }}));
    });
    wpnCard.appendChild(wWrap);
    if(cd.weaponMastery){
      wpnCard.appendChild(el("div",{class:"bsub",text:"Weapon Mastery — choose up to "+cd.weaponMastery+" from your kit ("+state.masteries.length+"/"+cd.weaponMastery+"):"}));
      var mWrap=el("div",{class:"bchips"});
      state.weapons.forEach(function(id){ var w=CAT.weapons[id]; if(!w||!w.mastery) return; var on=state.masteries.indexOf(id)>=0;
        mWrap.appendChild(el("button",{class:"bchip"+(on?" on":""), type:"button", text:w.name+" · "+w.mastery, onclick:function(){
          var i=state.masteries.indexOf(id);
          if(i>=0) state.masteries.splice(i,1); else { if(state.masteries.length>=cd.weaponMastery) return; state.masteries.push(id); }
          render();
        }}));
      });
      if(!state.weapons.length) mWrap.appendChild(el("span",{class:"bf-h",text:"Add weapons to your kit first."}));
      wpnCard.appendChild(mWrap);
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
    var abilCard = el("div",{class:"bcard"},[ el("h2",{text:"Ability Scores"}),
      el("div",{class:"bsub",text:"Background adds "+(Object.keys(inc).map(function(k){return fmt(inc[k])+" "+k;}).join(", ")||"nothing")+". Optimize assigns your current values to the best stats for the class."}),
      arrayRow ].concat(abilRows));

    // skills
    var skillCard = el("div",{class:"bcard"},[ el("h2",{text:"Skills"}) ]);
    var granted = grantedSkills();
    if(bg && bg.effects && bg.effects.skills) skillCard.appendChild(el("div",{class:"bsub",text:"Background grants: "+bg.effects.skills.join(", ")}));
    if(cd.skillChoices){
      var chosen = state.skills.length, max=cd.skillChoices.count;
      skillCard.appendChild(el("div",{class:"bsub",text:"Choose "+max+" class skills ("+chosen+"/"+max+"):"}));
      var wrap=el("div",{class:"bchips"});
      cd.skillChoices.from.forEach(function(s){
        var isBg = bg && bg.effects && bg.effects.skills && bg.effects.skills.indexOf(s)>=0;
        var on = state.skills.indexOf(s)>=0;
        var b=el("button",{class:"bchip"+(on?" on":"")+(isBg?" dim":""), type:"button", text:s+" ("+SKILL_ABIL[s]+")", onclick:function(){
          if(isBg) return;
          var i=state.skills.indexOf(s);
          if(i>=0) state.skills.splice(i,1);
          else { if(state.skills.length>=max){ return; } state.skills.push(s); }
          render();
        }});
        wrap.appendChild(b);
      });
      skillCard.appendChild(wrap);
    }

    // origin feat (level 1)
    var featCard = el("div",{class:"bcard"},[ el("h2",{text:"Origin Feat"}) ]);
    var bgFeat = backgroundFeat();
    if(bgFeat) featCard.appendChild(el("div",{class:"bsub",text:"From background: "+((CAT.feats[bgFeat]||{}).name||bgFeat).replace(/\s*\(.*\)$/,"")}));
    featCard.appendChild(selField("Extra origin feat (e.g. Human Versatile)", state.originFeat, featOptions(), function(v){ state.originFeat=v; render(); }, "", featHelp()));

    // advancement: subclass (L3) + ASIs (4/8/12/16/19)
    var advCard = el("div",{class:"bcard"},[ el("h2",{text:"Advancement"}) ]);
    var reached = reachedASIs();
    advCard.appendChild(el("div",{class:"bsub",text: state.level<3 ? "Subclass unlocks at level 3." : (reached.length ? "Each ASI: +2 to one ability, +1 to two, or a feat." : "First Ability Score Improvement comes at level 4.")}));
    reached.forEach(function(l){
      if(!state.asis[l]) state.asis[l]=asiDefault();
      var a=state.asis[l], detail;
      var modeSel=select(a.mode, [["asi2","+2 one"],["asi11","+1 / +1"],["feat","Feat"]], function(v){ a.mode=v; render(); });
      if(a.mode==="feat") detail=select(a.feat, featOptions(), function(v){ a.feat=v; render(); });
      else if(a.mode==="asi2") detail=select(a.a, ABIL.map(function(k){return [k,ABIL_NAME[k]];}), function(v){ a.a=v; render(); });
      else detail=el("span",{class:"adv-two"},[ select(a.a, ABIL.map(function(k){return [k,k];}), function(v){a.a=v;render();}), select(a.b, ABIL.map(function(k){return [k,k];}), function(v){a.b=v;render();}) ]);
      advCard.appendChild(el("div",{class:"adv-row"},[ el("span",{class:"adv-lvl",text:"L"+l}), modeSel, detail ]));
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

    root.appendChild(el("div",{class:"bcol"},[core, abilCard, gearCard, wpnCard, spellCard, skillCard, featCard, advCard].filter(Boolean)));
    root.appendChild(el("div",{class:"bcol"},[derivedCard, outCard]));
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

  document.addEventListener("DOMContentLoaded", function(){ root=document.getElementById("builder"); render(); });
})();
