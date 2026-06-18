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

  var state = {
    name:"New Hero", species:"human", cls:"ranger", subclass:"", background:"guide", level:4,
    base:{STR:15,DEX:14,CON:13,INT:12,WIS:10,CHA:8},
    skills:[], armor:"", extraFeat:""
  };

  function mod(s){ return Math.floor((s-10)/2); }
  function fmt(n){ return (n>=0?"+":"")+n; }
  function pbForLevel(l){ return Math.floor((l-1)/4) + 2; }
  function el(tag, attrs, kids){ var e=document.createElement(tag); attrs=attrs||{};
    for(var k in attrs){ if(k==="class") e.className=attrs[k]; else if(k==="html") e.innerHTML=attrs[k]; else if(k==="text") e.textContent=attrs[k]; else if(k.slice(0,2)==="on") e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); }
    (kids||[]).forEach(function(c){ if(c) e.appendChild(c); }); return e; }
  function opt(v, label, sel){ return el("option", {value:v, text:label, selected: sel?"selected":null}); }

  /* ----- derived values from current state ----- */
  function abilityIncreases(){
    var inc = {};
    var bg = CAT.backgrounds[state.background];
    if(bg && bg.effects && bg.effects.abilityIncrease) for(var k in bg.effects.abilityIncrease) inc[k]=(inc[k]||0)+bg.effects.abilityIncrease[k];
    return inc;
  }
  function finalScores(){
    var inc = abilityIncreases(), out={};
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
    // AC
    var arm = state.armor && CAT.armor[state.armor];
    if(arm){ var dex=d.mods.DEX; var dadd = arm.addDex ? (arm.dexCap!=null?Math.min(dex,arm.dexCap):dex) : 0; d.ac = arm.base + dadd; d.acNote = arm.label; }
    else { d.ac = 10 + d.mods.DEX; d.acNote = "Unarmored (10 + Dex)"; }
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
    return (bg && bg.grantsFeat===id) || state.extraFeat===id;
  }
  function backgroundFeat(){ var bg=CAT.backgrounds[state.background]; return bg && bg.grantsFeat; }

  /* ----- build block + scaffold output ----- */
  function buildBlock(){
    var cd = classData(), inc = abilityIncreases();
    var sources = [];
    sources.push({ id:state.background, name:"Background: "+(CAT.backgrounds[state.background]||{}).name, include:"background:"+state.background });
    // class skill choices
    if(state.skills.length) sources.push({ id:state.cls+"-skills", name:(cd.name||state.cls)+" skills", effects:{ skills: state.skills.slice() } });
    // species traits (all of the chosen species)
    var sp = CAT.species[state.species];
    if(sp) Object.keys(sp.traits).forEach(function(tr){ sources.push({ id:tr, name:(sp.name+": "+sp.traits[tr].name), include:"species:"+state.species+":"+tr }); });
    // extra (origin/ASI) feat
    if(state.extraFeat) sources.push({ id:"feat-"+state.extraFeat, name:"Feat: "+(CAT.feats[state.extraFeat]||{}).name, grantsFeat:state.extraFeat });
    return {
      species:state.species, class:state.cls, subclass:state.subclass||undefined, background:state.background,
      abilities: Object.assign({}, state.base),
      sources: sources
    };
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
      ac: Object.assign({ armor: state.armor || undefined }, {}),
      hp: { max: d.hp },
      masteryMax: cd.weaponMastery || 0, masteryDefault: [],
      weapons: [], cards: [], combat: null,
      build: buildBlock()
    };
    return ch;
  }

  /* ----- rendering ----- */
  var root;
  function field(label, control, hint){
    return el("label",{class:"bf"},[ el("span",{class:"bf-l",text:label}), control, hint?el("span",{class:"bf-h",text:hint}):null ]);
  }
  function select(value, options, onchange){
    var s=el("select",{class:"bsel", onchange:function(e){ onchange(e.target.value); }});
    options.forEach(function(o){ s.appendChild(opt(o[0],o[1], o[0]===value)); }); return s;
  }
  function render(){
    root.innerHTML="";
    var cd = classData(), sp = CAT.species[state.species], bg = CAT.backgrounds[state.background];
    var d = derive();

    // identity + core selects
    var core = el("div",{class:"bcard"},[
      el("h2",{text:"Identity"}),
      field("Name", el("input",{class:"binput", value:state.name, oninput:function(e){ state.name=e.target.value; refreshOut(); }})),
      el("div",{class:"bgrid"},[
        field("Species", select(state.species, Object.keys(CAT.species).map(function(k){return [k,CAT.species[k].name];}), function(v){ state.species=v; render(); })),
        field("Class", select(state.cls, Object.keys(CAT.classes).map(function(k){return [k,CAT.classes[k].name];}), function(v){ state.cls=v; state.subclass=""; state.skills=[]; render(); })),
        field("Subclass", select(state.subclass, [["","— none —"]].concat((cd.subclasses||[]).map(function(s){return [s,(CAT.subclasses[s]||{name:s}).name];})), function(v){ state.subclass=v; render(); })),
        field("Background", select(state.background, Object.keys(CAT.backgrounds).map(function(k){return [k,CAT.backgrounds[k].name];}), function(v){ state.background=v; render(); })),
        field("Level", select(String(state.level), Array.from({length:20},function(_,i){return [String(i+1),"Level "+(i+1)];}), function(v){ state.level=parseInt(v,10); render(); })),
        field("Armor", select(state.armor, [["","Unarmored"]].concat(Object.keys(CAT.armor).map(function(k){return [k,CAT.armor[k].label];})), function(v){ state.armor=v; render(); }))
      ])
    ]);

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
    var abilCard = el("div",{class:"bcard"},[ el("h2",{text:"Ability Scores"}), el("div",{class:"bsub",text:"Background adds "+(Object.keys(inc).map(function(k){return fmt(inc[k])+" "+k;}).join(", ")||"nothing")+"."}) ].concat(abilRows));

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

    // feats
    var featCard = el("div",{class:"bcard"},[ el("h2",{text:"Feats"}) ]);
    var bgFeat = backgroundFeat();
    if(bgFeat) featCard.appendChild(el("div",{class:"bsub",text:"Origin feat from background: "+((CAT.feats[bgFeat]||{}).name||bgFeat)}));
    featCard.appendChild(field("Extra feat (ASI / Versatile)", select(state.extraFeat, [["","— none —"]].concat(Object.keys(CAT.feats).map(function(k){return [k,CAT.feats[k].name];})), function(v){ state.extraFeat=v; render(); })));

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
        el("button",{class:"bbtn ember", type:"button", text:"Download .json", onclick:downloadJson})
      ]),
      outArea
    ]);

    root.appendChild(el("div",{class:"bcol"},[core, abilCard, skillCard, featCard]));
    root.appendChild(el("div",{class:"bcol"},[derivedCard, outCard]));
    refreshOut();
  }
  function refreshOut(){ var t=document.getElementById("bOut"); if(t) t.value = JSON.stringify(scaffold(), null, 2); }
  function downloadJson(){
    var ch=scaffold(), blob=new Blob([JSON.stringify(ch,null,2)], {type:"application/json"});
    var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=ch.id+".json"; document.body.appendChild(a); a.click(); a.remove();
  }

  document.addEventListener("DOMContentLoaded", function(){ root=document.getElementById("builder"); render(); });
})();
