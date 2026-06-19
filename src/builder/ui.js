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
    skills:[], armor:"", shield:false, originFeat:"", asis:{}, weapons:[], masteries:[], cantrips:[], prepared:[],
    choices:{ style:"", expertise:"", order:"" },
    customs:[]            // structured carriers for anything the builder doesn't model (see captureCustoms)
  };
  /* top-level keys the builder owns/regenerates; everything else on a loaded
     character is captured as a custom "root" element so it survives round-trip */
  var KNOWN_ROOT = {id:1,out:1,name:1,subtitle:1,portrait:1,title:1,footer:1,storageKey:1,level:1,hitDie:1,proficiencyBonus:1,saves:1,checkModNote:1,speed:1,ac:1,hp:1,masteryMax:1,masteryDefault:1,rest:1,studs:1,weapons:1,cards:1,riderHead:1,hitRiders:1,build:1};
  /* card types the builder generates; loaded cards of any other type are kept as custom "card" elements */
  var MANAGED_CARDS = {abilities:1,hitpoints:1,attacks:1,spellcasting:1,skills:1,pools:1,inventory:1,features:1,buildlog:1};
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
  function needsExpertise(){ return featureReached("Deft Explorer")||featureReached("Scholar"); }
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
  function cantripsKnown(){ var c=state.cls, n=0; if(c==="wizard"||c==="cleric") n=state.level<4?3:(state.level<10?4:5); if(state.choices.order==="thaumaturge") n+=1; return n; }
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
    if(pc) sc.prepared={ max:pc, default:state.prepared.slice(), catalog:classLeveledSpells().map(function(id){ var c={ id:id, name:CAT.spells[id].name, note:spellSub(CAT.spells[id]), level:CAT.spells[id].level }; if(CAT.spells[id].cast) c.cast=CAT.spells[id].cast; return c; }) };
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
  function subclassGrants(){ if(state.level<3 || !state.subclass) return []; return ((CAT.subclasses[state.subclass]||{}).grants)||[]; }
  function classPoolSources(){
    var out=[]; (CLASS_POOLS[state.cls]||[]).forEach(function(cp){ if(!featureReached(cp.feature)) return;
      out.push({ id:cp.id, name:cp.feature, effects:{ grantsPool:{ id:cp.id, label:cp.label, max:cp.max(state.level), rest:cp.rest, ref:cp.ref, storm:cp.storm, note:cp.note, use:cp.use, reminder:cp.reminder } } }); });
    return out;
  }
  function featureList(){
    var cd=classData(), fbl=cd.featuresByLevel||{}, cf=(CAT.classFeatures||{})[state.cls]||{}, out=[];
    for(var l=1;l<=state.level;l++) (fbl[String(l)]||[]).forEach(function(name){ if(name==="Ability Score Improvement"||/Subclass$/.test(name)) return; out.push({ ref:(cf[name]&&cf[name].refId)||"", name:name, sub:"Level "+l }); });
    var scName=(CAT.subclasses[state.subclass]||{}).name||"";
    subclassGrants().forEach(function(g){ out.push({ ref:g.id, name:g.name, sub:scName }); });
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
    var b=ch.build||{};
    state.name = ch.name || state.name;
    state.level = ch.level || b.level || state.level;
    state.species = b.species || state.species;
    state.cls = b.class || state.cls;
    state.subclass = b.subclass || "";
    state.background = b.background || state.background;
    if(b.abilities){ var base={STR:10,DEX:10,CON:10,INT:10,WIS:10,CHA:10}; ABIL.forEach(function(a){ if(b.abilities[a]!=null) base[a]=b.abilities[a]; }); state.base=base; }
    state.weapons = (ch.weapons||[]).map(function(w){ return typeof w==="string"?w:w.id; });
    state.masteries = (ch.masteryDefault||[]).slice();
    state.armor = (ch.ac && (typeof ch.ac.armor==="string"?ch.ac.armor:(ch.ac.armor&&ch.ac.armor.id))) || "";
    state.shield = !!(ch.ac && ch.ac.shield);
    state.skills=[]; state.originFeat=""; state.asis={}; state.cantrips=[]; state.prepared=[];
    state.choices={style:"",expertise:"",order:""};
    (b.sources||[]).forEach(function(s){
      var id=s.id||"", eff=s.effects||{};
      if(/-skills$/.test(id) && eff.skills) state.skills=eff.skills.slice();
      var am=/^asi-(\d+)$/.exec(id);
      if(am){ var lv=+am[1];
        if(s.grantsFeat) state.asis[lv]={mode:"feat",feat:s.grantsFeat};
        else if(eff.abilityIncrease){ var k=Object.keys(eff.abilityIncrease);
          if(k.length===1 && eff.abilityIncrease[k[0]]===2) state.asis[lv]={mode:"asi2",a:k[0]};
          else state.asis[lv]={mode:"asi11",a:k[0],b:k[1]||k[0]}; } }
      else if(s.grantsFeat && /^feat-/.test(id)) state.originFeat=s.grantsFeat;
      if(id==="fighting-style" && s.name){ var fm=/Fighting Style:\s*(.+)$/.exec(s.name); if(fm){ var st=FIGHTING_STYLES.filter(function(x){return x.name===fm[1].trim();})[0]; if(st) state.choices.style=st.id; } }
      if(id==="expertise" && eff.expertise) state.choices.expertise=eff.expertise[0];
      if(id==="divine-order" && s.name) state.choices.order=/Thaumaturge/i.test(s.name)?"thaumaturge":"protector";
      if(id==="spellcasting" && eff.spellcasting){ var spc=eff.spellcasting;
        if(spc.cantrips) state.cantrips=spc.cantrips.map(function(c){ return typeof c==="string"?c:c.ref; });
        if(spc.prepared && spc.prepared.default) state.prepared=spc.prepared.default.slice(); }
    });
    captureCustoms(ch, b);
    // snapshot for pristine pass-through: until the user edits something, re-export
    // exactly what was loaded so a character survives the round trip untouched
    state._orig = JSON.parse(JSON.stringify(ch));
    state._sig = editSig();
    return true;
  }
  /* a signature of every field the form can change; if it still matches the
     value captured at load time, nothing has been edited */
  function editSig(){
    return JSON.stringify([ state.name, state.species, state.cls, state.subclass, state.background, state.level,
      state.base, state.skills, state.armor, state.shield, state.originFeat, state.asis,
      state.weapons, state.masteries, state.cantrips, state.prepared, state.choices, state.customs ]);
  }
  /* Capture everything the builder can't reproduce so nothing is lost on a
     round-trip: unknown top-level fields, build sources that buildBlock()
     wouldn't regenerate, and cards of a type the builder doesn't manage.
     Each becomes a typed envelope {kind, key?, label, value} (see scaffold). */
  function captureCustoms(ch, b){
    state.customs=[];
    var genIds={}; buildBlock().sources.forEach(function(s){ if(s.id) genIds[s.id]=1; });
    (b.sources||[]).forEach(function(s){ if(!s || (s.id && genIds[s.id])) return; state.customs.push({ kind:"source", label:(s.name||s.id||"build source"), value:s }); });
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
    // feature sub-choices that grant mechanics (override the generic class-feature ref)
    var ch=state.choices;
    if(featureReached("Fighting Style") && ch.style){ var st=FIGHTING_STYLES.filter(function(x){return x.id===ch.style;})[0]; if(st) sources.push({ id:"fighting-style", name:"Fighting Style: "+st.name, refId:"fightingstyle", ref:{ title:"Fighting Style: "+st.name, chips:[{t:"Combat feat"}], body:[st.note+"."] } }); }
    if(needsExpertise() && ch.expertise) sources.push({ id:"expertise", name:"Expertise: "+ch.expertise, effects:{ expertise:[ch.expertise] } });
    if(featureReached("Divine Order") && ch.order){ var od = ch.order==="thaumaturge" ? {t:"Thaumaturge", b:"You know an extra cleric cantrip and add your Wisdom modifier to Intelligence (Arcana or Religion) checks."} : {t:"Protector", b:"You gain proficiency with martial weapons and heavy armor."}; sources.push({ id:"divine-order", name:"Divine Order: "+od.t, refId:"divineorder", ref:{ title:"Divine Order: "+od.t, body:[od.b] } }); }
    // subclass features (gained at level 3+)
    var scName=(CAT.subclasses[state.subclass]||{}).name||"";
    subclassGrants().forEach(function(g){ sources.push({ id:g.id, name:scName+": "+g.name, effects:g.effects, ref:g.ref, refId:g.id }); });
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
    if(state.level>=3 && state.subclass){ add(3,{cls:"choice", html:"<b>Subclass:</b> "+esc((CAT.subclasses[state.subclass]||{}).name||titleCase(state.subclass))});
      subclassGrants().forEach(function(g){ add(3,{html:"<b>"+esc(g.name)+"</b>"+(g.ref&&g.ref.body?(" — "+esc(g.ref.body[0])):"")}); }); }
    var ch=state.choices;
    if(featureReached("Fighting Style")&&ch.style){ var st=FIGHTING_STYLES.filter(function(x){return x.id===ch.style;})[0]; add(featureLevel("Fighting Style"),{cls:"choice", html:"<b>Fighting Style:</b> "+esc(st?st.name:"")}); }
    if(needsExpertise()&&ch.expertise) add(featureLevel(featureReached("Scholar")?"Scholar":"Deft Explorer"),{cls:"choice", html:"<b>Expertise:</b> "+esc(ch.expertise)});
    if(featureReached("Divine Order")&&ch.order) add(featureLevel("Divine Order"),{cls:"choice", html:"<b>Divine Order:</b> "+esc(ch.order==="thaumaturge"?"Thaumaturge":"Protector")});
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
    // pristine pass-through: unedited since load -> return the original verbatim
    if(state._orig && state._sig === editSig()) return JSON.parse(JSON.stringify(state._orig));
    var d = derive(), cd = classData();
    var slug = state.name.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"") || "hero";
    var hr = hitRiderData(), cmn = checkModNote();
    var ch = {
      id: slug, out: slug+".html", name: state.name,
      subtitle: ((CAT.species[state.species]||{}).name||"")+" "+((cd.name)||"")+" · Level "+state.level,
      portrait: slug+".png",
      title: state.name, footer: "Built with the character builder",
      storageKey: "dnd_"+slug, level: state.level, hitDie: d.hitDie,
      proficiencyBonus: d.pb, saves: d.saves, checkModNote: cmn||undefined, speed: d.speed,
      ac: (function(){ var ac={}; if(state.armor) ac.armor=state.armor; if(state.shield) ac.shield={label:"Shield",bonus:2,note:"+2 AC",default:true}; if(state.choices.style==="defense") ac.style={label:"Defense",bonus:1,note:"+1 AC while armored",requiresArmor:true,default:true}; return ac; })(),
      hp: { max: d.hp },
      masteryMax: cd.weaponMastery || 0, masteryDefault: state.masteries.slice(),
      rest: { short:["Spend Hit Dice to heal","Recover short-rest features"], long:["HP → maximum","Spell slots → full","Hit Dice → half restored","All per-rest features reset"], shortToast:"Short rest taken.", longToast:"Long rest — fully restored." },
      studs: genStuds(), weapons: state.weapons.map(function(id){ var w={id:id,carried:true}, cat=CAT.weapons[id]||{}, ranged=(cat.props||[]).some(function(p){return /range|ammunition/.test(p);}), twoH=(cat.props||[]).indexOf("two-handed")>=0;
        if(state.choices.style==="archery" && ranged) w.atkBonus=2;
        if(state.choices.style==="dueling" && !ranged && !twoH) w.dmgBonus=2;
        return w; }), cards: genCards(),
      riderHead: (hr.riders.length && hr.head) ? hr.head : undefined,
      hitRiders: hr.riders.length ? hr.riders : undefined,
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
        selField("Class", state.cls, Object.keys(CAT.classes).map(function(k){return [k,CAT.classes[k].name];}), function(v){ state.cls=v; state.subclass=""; state.skills=[]; state.originFeat=""; state.cantrips=[]; state.prepared=[]; state.choices={style:"",expertise:"",order:""}; render(); }, "", classHelp()),
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

    // feature sub-choices (Fighting Style, Expertise, Divine Order)
    var choiceCard=null, choiceFields=[];
    if(featureReached("Fighting Style")) choiceFields.push(selField("Fighting Style", state.choices.style, [["","— choose —"]].concat(FIGHTING_STYLES.map(function(s){return [s.id,s.name];})), function(v){ state.choices.style=v; render(); }, "", FIGHTING_STYLES.map(function(s){return s.name+" — "+s.note;})));
    if(needsExpertise()){ var ps=proficientSkills(); choiceFields.push(selField("Expertise", state.choices.expertise, [["","— choose a proficient skill —"]].concat(ps.map(function(s){return [s,s];})), function(v){ state.choices.expertise=v; render(); }, ps.length?"":"Pick class skills first.")); }
    if(featureReached("Divine Order")) choiceFields.push(selField("Divine Order", state.choices.order, [["","— choose —"],["protector","Protector — martial weapons & heavy armor"],["thaumaturge","Thaumaturge — extra cantrip & Arcana bonus"]], function(v){ state.choices.order=v; render(); }));
    if(choiceFields.length) choiceCard=el("div",{class:"bcard"},[el("h2",{text:"Feature Choices"})].concat(choiceFields));

    // custom elements: anything the builder doesn't model, kept structured + round-tripped
    var customCard = el("div",{class:"bcard"},[ el("h2",{text:"Custom Elements"}),
      el("div",{class:"bsub",text:"Anything the builder doesn't model (e.g. combat, ref, bespoke cards/features). Captured on load and added to the output. Add your own ad hoc."}) ]);
    state.customs.forEach(function(cu, idx){
      var head=el("div",{class:"cust-head"},[
        el("span",{class:"cust-kind",text:CUSTOM_KINDS[cu.kind]||cu.kind}),
        el("input",{class:"binput cust-label", value:cu.label||"", placeholder:"label", oninput:function(e){ cu.label=e.target.value; }}),
        cu.kind==="root" ? el("input",{class:"binput cust-key", value:cu.key||"", placeholder:"field name", oninput:function(e){ cu.key=e.target.value; refreshOut(); }}) : null,
        el("button",{class:"bbtn tiny", type:"button", text:"Remove", onclick:function(){ state.customs.splice(idx,1); render(); }})
      ].filter(Boolean));
      var errEl=el("span",{class:"bf-h cust-err"});
      var ta=el("textarea",{class:"bout cust-json", rows:"6", value:JSON.stringify(cu.value,null,2),
        oninput:function(e){ try{ cu.value=JSON.parse(e.target.value); errEl.textContent=""; refreshOut(); }catch(ex){ errEl.textContent="Invalid JSON — fix to apply: "+ex.message; } }});
      customCard.appendChild(el("div",{class:"cust-row"},[head, ta, errEl]));
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

    root.appendChild(el("div",{class:"bcol"},[loadCard, core, abilCard, gearCard, wpnCard, spellCard, skillCard, featCard, choiceCard, advCard, customCard].filter(Boolean)));
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
