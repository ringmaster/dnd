/* Shared: state, rendering orchestration, and interactions — all read from CHARACTER. */

/* ----- equipment: armor / shield / hands (declared early; the stat refs read effSpeed) ----- */
var ARMORY = (CHARACTER.ac && CHARACTER.ac.armory) ? CHARACTER.ac.armory.slice()
           : (CHARACTER.ac && CHARACTER.ac.armor) ? [CHARACTER.ac.armor] : [];
var SHIELD = (CHARACTER.ac && CHARACTER.ac.shield) || null;
var AC_STYLE = (CHARACTER.ac && CHARACTER.ac.style) || null;
var AC_UNARMORED = (CHARACTER.ac && CHARACTER.ac.unarmored) || null;   // Monk/Barbarian: 10 + Dex + another ability while unarmored
var MAGE_ARMOR = (CHARACTER.ac && CHARACTER.ac.mageArmor) || null;     // a spell, not gear: while active and unarmored, base AC becomes (base + Dex)
var ACCESSORIES = (CHARACTER.ac && CHARACTER.ac.accessories) || [];    // worn items (e.g. Ring of Protection) that add to AC and/or saves
var AC_FLAT = (CHARACTER.ac && CHARACTER.ac.bonus) || 0;               // always-on AC bonus (e.g. homebrew wards)
var AC_FLAT_NOTE = (CHARACTER.ac && CHARACTER.ac.bonusNote) || "";
function armorById(id){ for(var i=0;i<ARMORY.length;i++){ if(ARMORY[i].id===id) return ARMORY[i]; } return null; }
function armorDefaultId(){ for(var i=0;i<ARMORY.length;i++){ if(ARMORY[i].default!==false) return ARMORY[i].id; } return ""; }
function equippedArmor(){ var id = (typeof state==="object" && state) ? state.armorId : armorDefaultId(); return id ? armorById(id) : null; }
/* Mage Armor is a togglable spell: it only sets your base AC while you wear no physical armor. */
function mageArmorOn(){ return !!MAGE_ARMOR && ((typeof state==="object" && state) ? !!state.mageArmor : MAGE_ARMOR.default!==false); }
function mageArmorActive(){ return mageArmorOn() && !equippedArmor(); }
/* worn accessories (Ring of Protection, etc.) — default-on ids when state isn't ready yet */
function accessoryDefaultIds(){ return ACCESSORIES.filter(function(a){ return a.default!==false; }).map(function(a){ return a.id; }); }
function wornIds(){ return (typeof state==="object" && state && Array.isArray(state.worn)) ? state.worn : accessoryDefaultIds(); }
function accessoryWorn(id){ return wornIds().indexOf(id)>=0; }
function wornBonus(key){ var ids=wornIds(), n=0; ACCESSORIES.forEach(function(a){ if(ids.indexOf(a.id)>=0) n+=(a[key]||0); }); return n; }
function wornAcBonus(){ return wornBonus("ac"); }
function wornSaveBonus(){ return wornBonus("save"); }
function handCount(w){ return (w && (w.props||[]).indexOf("two-handed")>=0) ? 2 : 1; }
function handsUsed(){ var n=0; (state.carried||[]).forEach(function(id){ var w=wById(id); if(w) n+=handCount(w); }); if(state.shield && SHIELD) n+=1; return n; }
function handsFree(){ return 2 - handsUsed(); }
function hasVersatile(w){ return /versatile \d+d\d+/.test(((w&&w.props)||[]).join(" ")); }
/* a versatile weapon is wielded two-handed when it's in hand and nothing else occupies a hand */
function versatileActive(w){ return hasVersatile(w) && state.carried.indexOf(w.id)>=0 && (handsUsed()-handCount(w))===0; }
function effSpeed(){ var s=CHARACTER.speed, arm=equippedArmor(); if(arm && arm.strReq && CHARACTER.abilities.STR < arm.strReq) s-=10; return s; }
function acBreakdown(){
  var parts=[], dex=abilMod("DEX"), arm=equippedArmor();
  if(arm){ parts.push(arm.label.toLowerCase()+" "+arm.base+(arm.addDex?(" + Dex "+fmt(arm.dexCap!=null?Math.min(dex,arm.dexCap):dex)):"")); }
  else if(mageArmorActive()) parts.push(MAGE_ARMOR.label.toLowerCase()+" "+MAGE_ARMOR.base+" + Dex "+fmt(dex));
  else parts.push("10 + Dex "+fmt(dex));
  if(state.shield && SHIELD) parts.push("shield "+fmt(SHIELD.bonus));
  if(state.style && AC_STYLE && arm) parts.push(AC_STYLE.label+" "+fmt(AC_STYLE.bonus));
  ACCESSORIES.forEach(function(a){ if(accessoryWorn(a.id) && a.ac) parts.push(a.label.toLowerCase()+" "+fmt(a.ac)); });
  if(AC_FLAT) parts.push((AC_FLAT_NOTE||"bonus")+" "+fmt(AC_FLAT));
  return parts.join(" + ")+" = "+computeAC();
}

/* ----- reference content: auto ability modals + character-specific entries ----- */
var REF = {};
/* (re)build the per-ability modals; called again when a save-affecting item (e.g. a Ring of Protection) is toggled */
function buildAbilityRefs(){
  var saveItem=(typeof wornSaveBonus==="function"?wornSaveBonus():0);
  ABIL_ORDER.forEach(function(k){
    var sv=saveMod(k), chk=abilCheckMod(k);
    var body=["Ability score "+CHARACTER.abilities[k]+" ("+fmt(abilMod(k))+" modifier).","Governs: "+GOVERNS[k]+"."];
    var chips = CHARACTER.saves.indexOf(k)>=0 ? [{t:"Save proficiency",c:"storm"}] : [];
    if(saveItem) chips=chips.concat([{t:fmt(saveItem)+" to saves",c:"storm"}]);
    if(checkMod(k)){
      chips=chips.concat([{t:fmt(checkMod(k))+" to checks",c:"ember"}]);
      if(CHARACTER.checkModNote && CHARACTER.checkModNote[k]) body.push(CHARACTER.checkModNote[k]+", so a bare "+ABIL_NAME[k]+" check is d20 "+fmt(chk)+".");
    }
    REF["abil_"+k]={ title:ABIL_NAME[k], dice:"Check: d20 "+fmt(chk)+"   ·   Save: d20 "+fmt(sv), chips:chips, body:body };
  });
}
buildAbilityRefs();
/* generic derived stat modals — computed, not hand-authored (a character may still override) */
(function(){
  var initB=CHARACTER.initiativeBonus||0, dex=abilMod("DEX");
  var initChips=[{t:"Dex "+fmt(dex)}]; if(initB) initChips.push({t:"Prof "+fmt(initB)+" (Alert)",c:"ember"});
  var initBody=[initB
    ? "Initiative is your Dexterity modifier ("+fmt(dex)+") plus your Proficiency Bonus from Alert ("+fmt(initB)+"), for d20 "+fmt(initiative())+"."
    : "Initiative equals your Dexterity modifier ("+fmt(dex)+"), rolled on a d20 at the start of combat to set turn order."];
  if(initB) initBody.push("Alert also lets you swap your Initiative result with a willing ally's right after rolling.");
  REF["stat_init"]={title:"Initiative", dice:"Initiative: d20 "+fmt(initiative()), chips:initChips, body:initBody};

  var spd=effSpeed(), penal=spd<CHARACTER.speed;
  // extra movement modes granted by features (fly/swim/climb/burrow + hover)
  var capW=function(s){ return s.charAt(0).toUpperCase()+s.slice(1); };
  var XS=CHARACTER.speeds||{}, MODE_ORDER=["fly","swim","climb","burrow"];
  var modeChips=MODE_ORDER.filter(function(m){return XS[m];}).map(function(m){ return {t:capW(m)+" "+XS[m]+" ft"+(m==="fly"&&XS.hover?" (hover)":""), c:"storm"}; });
  var modeBody=MODE_ORDER.filter(function(m){return XS[m];}).map(function(m){ return capW(m)+" speed "+XS[m]+" ft"+(m==="fly"&&XS.hover?" (you can hover)":"")+"."; });
  REF["stat_speed"]={title:"Speed", dice:spd+" feet", chips:[{t:"Base "+CHARACTER.speed}].concat(penal?[{t:"−10 heavy armor",c:"ember"}]:[]).concat(modeChips),
    body:["Your walking speed is "+spd+" feet — how far you can move on your turn."+(penal?" Your Strength is below your heavy armor's requirement, so it's reduced by 10.":""),"Difficult terrain costs double, and the Dash action lets you move that far again."].concat(modeBody)};

  // Defenses: damage resistances / immunities from features (a synthetic stud surfaces it)
  var RES=CHARACTER.resistances||[], IMM=CHARACTER.immunities||[];
  if(RES.length || IMM.length){
    var dChips=RES.map(function(t){return {t:"Resist "+t,c:"storm"};}).concat(IMM.map(function(t){return {t:"Immune "+t,c:"ember"};}));
    var dBody=[];
    if(RES.length) dBody.push("Resistance to "+RES.join(", ")+" damage — you take half damage of those types (applied after other modifiers; resistance doesn't stack).");
    if(IMM.length) dBody.push("Immunity to "+IMM.join(", ")+" damage — you take none of those types.");
    REF["stat_defenses"]={title:"Defenses", dice:(RES.length?RES.length+" resist":"")+(RES.length&&IMM.length?" · ":"")+(IMM.length?IMM.length+" immune":""), chips:dChips, body:dBody};
  }

  REF["stat_prof"]={title:"Proficiency Bonus", dice:fmt(PB), chips:[{t:"Level "+CHARACTER.level,c:"storm"}],
    body:["Your Proficiency Bonus is "+fmt(PB)+", set by your character level (it rises as you advance).",
      "It's added to attack rolls, saving throws, and ability checks you're proficient with"+(hasSpellcasting()?", and to your spell save DC and spell attack bonus.":".")]};

  var per=findSkill("Perception"), pm=per?skillMod(per):abilMod("WIS");
  var passBody=["Passive Perception = 10 + your Perception modifier ("+fmt(pm)+"), so "+passivePerception()+"."];
  passBody.push(per&&per.prof
    ? "You're proficient in Perception (Wis "+fmt(abilMod("WIS"))+" + proficiency "+fmt(PB)+(per.exp?" + expertise "+fmt(PB):"")+")."
    : "You aren't proficient in Perception, so it's just your Wisdom modifier ("+fmt(abilMod("WIS"))+").");
  passBody.push("It's the DC enemies must beat to sneak past you when you aren't actively searching.");
  REF["stat_pass"]={title:"Passive Perception", dice:String(passivePerception()), chips:[{t:"10 + Perception "+fmt(pm),c:"ember"}], body:passBody};
})();

/* derivable resource modals — generated from pools/abilities (a character may still override) */
(function(){
  var P=CHARACTER.pools||{};
  if(P.hd){ var die=CHARACTER.hitDie||"d8", con=abilMod("CON");
    REF[P.hd.ref||"hitdice"]={title:"Hit Dice", dice:"1"+die+(con?" "+fmt(con):"")+" healing each",
      chips:[{t:P.hd.max+" dice at lvl "+CHARACTER.level},{t:"Spent on a short rest",c:"storm"}],
      body:["During a short rest you can spend Hit Dice to heal, rolling 1"+die+(con?" "+fmt(con):"")+" each (1"+die+" + your Constitution modifier). You regain spent Hit Dice on a long rest.","Tap Spend Hit Die to mark one used, then roll and apply it with Heal."]};
  }
  if(P.insp){ REF[P.insp.ref||"inspiration"]={title:"Heroic Inspiration", pool:"insp",
    chips:[{t:"Reroll a d20",c:"ember"},{t:"After a long rest",c:"storm"}],
    body:["When you have Heroic Inspiration you can expend it to reroll any d20 and use either roll. You can hold only one at a time.","The GM may also award it for great play."]};
  }
  Object.keys(P).forEach(function(id){ var p=P[id]; if(!p.slotLevel) return;
    REF[p.ref||("spellslots"+p.slotLevel)]={title:"Spell Slots (Level "+p.slotLevel+")", dice:p.max+" level-"+p.slotLevel+" slot"+(p.max===1?"":"s"), pool:id,
      chips:[{t:"Long rest",c:"storm"}],
      body:[p.max+" level-"+p.slotLevel+" slot"+(p.max===1?"":"s")+", regained on a long rest."].concat(hasSpellcasting()?["Spell save DC "+spellDC()+"; spell attack "+fmt(spellAtk())+". Tap Use to spend a slot."]:["Tap Use to spend a slot."])};
  });
})();

Object.keys(CHARACTER.ref||{}).forEach(function(k){ REF[k]=CHARACTER.ref[k]; });

/* ----- pools derived from data ----- */
var POOL_MAX={}, POOL_REMINDER={}, POOL_EL={};
Object.keys(CHARACTER.pools).forEach(function(id){
  var p=CHARACTER.pools[id];
  POOL_MAX[id]=p.max; POOL_REMINDER[id]=p.reminder||""; POOL_EL[id]=[id+"Rivets", !!p.storm];
});

/* ----- weapons / mastery ----- */
var WEAPONS = CHARACTER.weapons;
var MASTERY_MAX = CHARACTER.masteryMax;
function wById(id){ for(var i=0;i<WEAPONS.length;i++){ if(WEAPONS[i].id===id) return WEAPONS[i]; } return null; }
/* weapons in your kit (data `carried` flags the starting loadout); whether each
   is currently in-hand is live state (state.carried), toggled from Inventory. */
var OWNED = WEAPONS.filter(function(w){ return w.carried===true; }).map(function(w){ return w.id; });
/* a hand-valid starting loadout: reserve a hand for a default shield, then draw owned weapons that fit */
function defaultCarried(){
  var hands=(SHIELD && SHIELD.default===true)?1:0, out=[];
  OWNED.forEach(function(id){ var hc=handCount(wById(id)); if(hands+hc<=2){ out.push(id); hands+=hc; } });
  return out;
}
/* generate a default rules modal for any weapon without a hand-authored ref, so every
   weapon is tappable (drawn or stowed); openRef fills in the live to-hit / damage / crit */
WEAPONS.forEach(function(w){
  if(REF[w.id] || !w.dmgDice) return;
  REF[w.id] = {
    title: w.name,
    chips: (w.props||[]).map(function(p){ return { t: p.charAt(0).toUpperCase()+p.slice(1) }; }),
    body: ["Your "+w.name.toLowerCase()+"."+((w.props&&w.props.length)?" Properties: "+w.props.join(", ")+".":"")]
      .concat(w.masteryEff ? ["Mastery — "+w.mastery+": "+w.masteryEff] : [])
  };
});

/* ----- prepared spells (optional) ----- */
var PREPARED_MAX = CHARACTER.prepared ? CHARACTER.prepared.max : 0;
var SPELL_CATALOG = CHARACTER.prepared ? CHARACTER.prepared.catalog : [];
function spById(id){ for(var i=0;i<SPELL_CATALOG.length;i++){ if(SPELL_CATALOG[i].id===id) return SPELL_CATALOG[i]; } return null; }

/* ----- spell slots (pools tagged with a slotLevel) ----- */
function slotPoolsList(){
  var out=[];
  Object.keys(CHARACTER.pools).forEach(function(id){ var p=CHARACTER.pools[id]; if(p.slotLevel) out.push({id:id, level:p.slotLevel, max:POOL_MAX[id]}); });
  out.sort(function(a,b){ return a.level-b.level; });
  return out;
}
function ordinal(n){ var s=["th","st","nd","rd"], v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); }
/* how many ways you could cast a spell of the given minimum level right now */
function spellSlotsAvail(level, freePool){
  var n=0;
  if(freePool && state[freePool]>0) n+=state[freePool];
  slotPoolsList().forEach(function(sp){ if(sp.level>=level) n+=state[sp.id]; });
  return n;
}

/* ----- state ----- */
var defaults = { hpMax:CHARACTER.hp.max, hpCur:CHARACTER.hp.max, temp:0, dsSucc:0, dsFail:0, view:"attacks", conc:"",
                 armorId:armorDefaultId(), shield:!!(SHIELD&&SHIELD.default===true), style:!!(AC_STYLE&&AC_STYLE.default!==false),
                 mageArmor:!!(MAGE_ARMOR&&MAGE_ARMOR.default!==false), worn:accessoryDefaultIds(),
                 masteries:(CHARACTER.masteryDefault||[]).slice(), carried:defaultCarried() };
Object.keys(CHARACTER.pools).forEach(function(id){ defaults[id]=CHARACTER.pools[id].max; });
if(CHARACTER.prepared) defaults.prepared = CHARACTER.prepared.default.slice();
var state = JSON.parse(JSON.stringify(defaults));
function applyDefaults(loaded){
  var s = JSON.parse(JSON.stringify(defaults));
  if(loaded && typeof loaded==="object"){ for(var k in defaults){ if(k in loaded) s[k]=loaded[k]; } }
  return s;
}

function setStatus(s){
  sync.classList.remove("saved","saving","error");
  if(s==="saving"){ sync.classList.add("saving"); syncText.textContent="saving…"; }
  else if(s==="error"){ sync.classList.add("error"); syncText.textContent="save error"; }
  else if(s==="loading"){ syncText.textContent="loading…"; }
  else { sync.classList.add("saved"); syncText.textContent=(STORE_CONFIG.mode==="remote"?"synced":"saved"); }
}
var saveTimer=null;
function persist(){ setStatus("saving"); clearTimeout(saveTimer); saveTimer=setTimeout(function(){ Promise.resolve(store.save(state)).then(function(){ setStatus("saved"); }).catch(function(){ setStatus("error"); }); }, 250); }

/* ----- dynamic element handles (assigned in wireSheet, after render) ----- */
var hpCur,hpMax,tempWrap,deathSaves,hpAdjust,tempRow,hitDicePool,attackList,preparedList,acVal;
var hstuds,hsearch,searchInput,searchResults,SEARCH_INDEX=null,searchTimer=null;

/* ----- render orchestration ----- */
function renderAll(){
  headerGrid.innerHTML = renderHeaderHTML();
  grid.innerHTML = renderGridHTML();
  var fl=document.getElementById("footerLabel"); if(fl) fl.textContent = CHARACTER.footer || CHARACTER.name;
  var sr=document.getElementById("shortRestList"), lr=document.getElementById("longRestList");
  if(sr) sr.innerHTML=(CHARACTER.rest.short||[]).map(function(t){return "<li>"+esc(t)+"</li>";}).join("");
  if(lr) lr.innerHTML=(CHARACTER.rest.long||[]).map(function(t){return "<li>"+esc(t)+"</li>";}).join("");
}
function renderAbilities(){
  var w=document.getElementById("abilities"); if(!w) return; w.innerHTML="";
  ABIL_ORDER.forEach(function(k){
    var b=document.createElement("button"); b.type="button"; b.className="ability"; b.setAttribute("data-ref","abil_"+k);
    b.innerHTML='<div class="name">'+k+'</div><div class="amod">'+fmt(abilMod(k))+'</div><div class="arow"><span class="sc">'+CHARACTER.abilities[k]+'</span><span class="sv">save '+fmt(saveMod(k))+'</span></div>';
    w.appendChild(b);
  });
}
function renderSkills(){
  var w=document.getElementById("skills"); if(!w) return; w.innerHTML="";
  SKILLS.forEach(function(s){
    var d=document.createElement("button"); d.type="button"; d.className="skill"+(s.prof?" prof":"")+(s.exp?" exp":"");
    d.setAttribute("data-skill", s.name);
    var star=s.exp?' <span class="exp-tag">EX</span>':'';
    d.innerHTML='<span class="pip"></span><span class="sname">'+esc(s.name)+star+'</span><span class="smod">'+fmt(skillMod(s))+'</span>';
    w.appendChild(d);
  });
}
function renderPools(){
  Object.keys(POOL_EL).forEach(function(pool){
    var elId=POOL_EL[pool][0], storm=POOL_EL[pool][1], el=document.getElementById(elId); if(!el) return;
    el.innerHTML=""; var max=POOL_MAX[pool], count=state[pool];
    for(var i=0;i<max;i++){
      var b=document.createElement("button"); b.type="button";
      b.className="rivet"+(storm?" storm":"")+(i<count?" charged":"");
      b.setAttribute("aria-label",(i<count?"charged":"spent")+" "+(i+1));
      (function(idx){ b.addEventListener("click", function(){ state[pool]=(idx<state[pool])?idx:idx+1; persist(); renderPools(); refreshModalUses(pool); }); })(i);
      el.appendChild(b);
    }
  });
  renderCombat();
}
function renderDeath(){
  [["dsSucc","succ"],["dsFail","fail"]].forEach(function(pair){
    var el=document.getElementById(pair[0]); if(!el) return; el.innerHTML="";
    for(var i=0;i<3;i++){
      var b=document.createElement("button"); b.type="button"; b.className="ds-pip "+pair[1]+(i<state[pair[0]]?" on":"");
      b.setAttribute("aria-label",pair[1]+" "+(i+1));
      (function(idx,key){ b.addEventListener("click", function(){ state[key]=(state[key]===idx+1)?idx:idx+1; persist(); renderDeath(); }); })(i,pair[0]);
      el.appendChild(b);
    }
  });
}
function renderHP(){
  hpCur.value=state.hpCur; hpMax.value=state.hpMax;
  tempWrap.innerHTML = state.temp>0 ? '<span class="temp-badge">＋'+state.temp+' temp HP</span>' : '<span class="mini-label" style="color:var(--ash-dim)">no temp HP</span>';
  var atZero = parseInt(state.hpCur,10)===0;
  deathSaves.style.display = atZero ? "block" : "none";
  [tempWrap,hpAdjust,tempRow,hitDicePool].forEach(function(el){ if(el) el.style.display = atZero ? "none" : ""; });
  if(!atZero && (state.dsSucc||state.dsFail)){ state.dsSucc=0; state.dsFail=0; persist(); renderDeath(); }
}
function renderACStud(){ if(acVal) acVal.textContent=computeAC(); }
function renderMasterySummary(){
  var span=document.getElementById("wmSummary"); if(!span) return;
  var parts=state.masteries.map(function(id){ var w=wById(id); return w?w.mastery+" ("+w.name.toLowerCase()+")":null; }).filter(Boolean);
  span.textContent=(parts.length?parts.join(" · ")+" · ":"")+state.masteries.length+" of "+MASTERY_MAX+" mastered";
}
function renderAttacks(){
  if(!attackList) return; attackList.innerHTML=""; var shown=0;
  WEAPONS.forEach(function(w){
    if(state.carried.indexOf(w.id)<0 || !w.dmgDice) return;
    shown++;
    var mastered = state.masteries.indexOf(w.id)>=0;
    var tag = (mastered ? ' <span class="mastery">'+esc(w.mastery)+'</span>' : '') + (versatileActive(w) ? ' <span class="mastery">two-handed</span>' : '');
    var sub = (w.props||[]).join(" · ") + ((w.props&&w.props.length)?" · ":"") + "crit "+critDmg(w);
    var b=document.createElement("button"); b.type="button"; b.className="tap"; b.setAttribute("data-ref", w.id);
    b.innerHTML='<div class="tap-name">'+esc(w.name)+tag+'</div>'+
      '<div class="tap-dice">To hit: d20 '+weaponToHit(w)+' · Damage: '+weaponDmg(w)+'</div>'+
      '<div class="tap-sub">'+esc(sub)+' · <span class="info-tag">tap for rules ⓘ</span></div>';
    attackList.appendChild(b);
  });
  if(!shown){ var e=document.createElement("p"); e.className="muted"; e.textContent="No weapon drawn — draw one in Inventory."; attackList.appendChild(e); }
}
/* Inventory equips armor + shield (drives AC) and draws/stows weapons (drives Attacks). */
function invRow(toggleLabel, on, onToggle, nameHTML, ref){
  var row=document.createElement("div"); row.className="inv-weap"+(on?" drawn":"");
  var toggle=document.createElement("button"); toggle.type="button"; toggle.className="iw-toggle"; toggle.textContent=toggleLabel;
  toggle.addEventListener("click", onToggle);
  var name=document.createElement(ref?"button":"div"); name.className="iw-name"; if(ref){ name.type="button"; name.setAttribute("data-ref", ref); }
  name.innerHTML=nameHTML;
  row.appendChild(toggle); row.appendChild(name); return row;
}
function renderInvEquip(){
  var el=document.getElementById("invEquip"); if(!el) return; el.innerHTML="";
  if(ARMORY.length){
    var h=document.createElement("div"); h.className="inv-sub"; h.textContent="Armor · tap to wear (one at a time)"; el.appendChild(h);
    ARMORY.forEach(function(a){ var on=state.armorId===a.id;
      el.appendChild(invRow(on?"Worn":"Wear", on, function(){ equipArmor(a.id); },
        '<span class="iw-n">'+esc(a.label)+'</span><span class="iw-m">'+esc(a.note)+'</span>'));
    });
  }
  if(SHIELD){
    var on=!!state.shield;
    el.appendChild(invRow(on?"Held":"Hold", on, equipShield,
      '<span class="iw-n">'+esc(SHIELD.label)+'</span><span class="iw-m">+'+SHIELD.bonus+' AC · 1 hand</span>'));
  }
  if(ACCESSORIES.length){
    var ha=document.createElement("div"); ha.className="inv-sub"; ha.textContent="Worn · tap to don or doff"; el.appendChild(ha);
    ACCESSORIES.forEach(function(a){ var won=accessoryWorn(a.id);
      el.appendChild(invRow(won?"Worn":"Wear", won, function(){ toggleAccessory(a.id); },
        '<span class="iw-n">'+esc(a.label)+'</span><span class="iw-m">'+esc(a.note||("+"+(a.ac||0)+" AC"))+'</span>', a.ref));
    });
  }
  var hf=document.createElement("div"); hf.className="inv-hands"; hf.textContent="Hands: "+handsUsed()+" / 2 used"; el.appendChild(hf);
}
function renderInvWeapons(){
  var el=document.getElementById("invWeapons"); if(!el) return; el.innerHTML="";
  OWNED.forEach(function(id){ var w=wById(id); if(!w) return;
    var drawn=state.carried.indexOf(id)>=0, twoH=handCount(w)>1, vers=versatileActive(w);
    var tag=(w.mastery?'<span class="iw-m">'+esc(w.mastery)+'</span>':'')+(twoH?'<span class="iw-m">2H</span>':(vers?'<span class="iw-m">2H · '+esc((w.props||[]).join(" ").match(/versatile (\d+d\d+)/)[1])+'</span>':''));
    el.appendChild(invRow(drawn?"Drawn":"Draw", drawn, function(){ toggleCarried(id); },
      '<span class="iw-n">'+esc(w.name)+'</span>'+tag+'<span class="info-tag">ⓘ</span>', w.id));
  });
}
function renderInventory(){ renderInvEquip(); renderInvWeapons(); }
function toggleCarried(id){
  var i=state.carried.indexOf(id);
  if(i>=0){ state.carried.splice(i,1); }
  else { var w=wById(id); if(handsUsed()+handCount(w)>2){ toast("No free hand — stow something first."); return; } state.carried.push(id); }
  persist(); renderInventory(); renderAttacks(); renderCombat(); renderACStud();
  if(refOverlay.classList.contains("show")){ if(document.querySelector(".wm-row")) paintMastery(); paintAC(); }
}
function moveTarget(mv){ return mv.gloss ? (' data-gloss="'+esc(mv.gloss)+'"') : ((mv.ref||mv.weapon) ? (' data-ref="'+esc(mv.ref||mv.weapon)+'"') : ''); }
function meterText(id, asFree){ return '<span class="cm-left">'+state[id]+'/'+POOL_MAX[id]+(asFree?' free':' left')+'</span>'; }
function combatMove(mv){
  var bits=[], grey=false;
  if(mv.weapon){ var w=wById(mv.weapon); if(w){ var mastered=state.masteries.indexOf(w.id)>=0;
    if(state.carried.indexOf(w.id)<0) grey=true;   // stowed weapon
    bits.push('<span class="cm-num">d20 '+weaponToHit(w)+' · '+weaponDmg(w)+'</span>'+(mastered?(' · '+esc(w.mastery)):'')); } }
  if(mv.detail) bits.push(esc(mv.detail));
  var sub=bits.join(' · ');
  if(mv.spellLevel!=null){
    var avail=spellSlotsAvail(mv.spellLevel, mv.freePool);
    if(avail<=0) grey=true;
    sub+=(sub?' · ':'')+'<span class="cm-left">'+avail+' slot'+(avail===1?'':'s')+'</span>';
  }
  var meter = mv.pool || mv.show;
  if(meter){ if(mv.pool && state[mv.pool]<=0) grey=true; sub+=(sub?' · ':'')+meterText(meter, !!mv.show); }
  var html='<button class="cm-move'+(grey?' spent':'')+'"'+moveTarget(mv)+' type="button"><span class="cm-name">'+esc(mv.label)+'</span><span class="cm-sub">'+sub+'</span></button>';
  // nested riders (e.g. maneuvers) — only shown while their resource remains
  if(mv.riders && mv.riders.length){
    var avail = mv.riders.filter(function(r){ return !r.pool || state[r.pool]>0; });
    if(avail.length){
      html += '<div class="cm-riders">'+avail.map(function(r){
        var sub2 = esc(r.detail||"") + (r.pool ? (' · '+meterText(r.pool,false)) : "");
        return '<button class="cm-rider"'+moveTarget(r)+' type="button"><span class="cm-rname">'+esc(r.label)+'</span><span class="cm-rsub">'+sub2+'</span></button>';
      }).join('')+'</div>';
    }
  }
  return html;
}
function weaponDetail(w){
  var ranged=(w.props||[]).some(function(p){ return /range|ammunition/.test(p); });
  var bits=[ranged?"ranged":"melee"];
  if(state.masteries.indexOf(w.id)>=0 && w.mastery) bits.push(w.mastery);
  return bits.join(" · ");
}
/* every spell you can actually cast right now: prepared + always-prepared + cantrips + free-cast pools */
function castableSpellIds(){
  var set={}; (state.prepared||[]).forEach(function(id){ set[id]=1; });
  var sc=(CHARACTER.cards||[]).find(function(x){ return x.type==="spellcasting"; });
  if(sc){ (sc.always||[]).forEach(function(a){ if(a.ref) set[a.ref]=1; });
    (sc.cantrips||[]).forEach(function(c){ if(c.ref) set[c.ref]=1; });
    (sc.initiate&&sc.initiate.spells||[]).forEach(function(c){ if(c.ref) set[c.ref]=1; }); }
  Object.keys(CHARACTER.pools||{}).forEach(function(id){ var p=CHARACTER.pools[id]; if(p.ref) set[p.ref]=1; });
  return set;
}
function renderCombat(){
  var el=document.getElementById("combatBody"); if(!el || !CHARACTER.combat) return;
  var note = CHARACTER.combat.note ? ('<p class="cm-banner">'+CHARACTER.combat.note+'</p>') : "";
  var hasSpells = !!(CHARACTER.cards||[]).find(function(x){ return x.type==="spellcasting"; });
  var castable = castableSpellIds();
  var groups = CHARACTER.combat.groups.map(function(g){
    var moves = g.moves, weaponGroup = g.moves.some(function(m){ return m.weapon; });
    // weapon attacks reflect what's currently drawn (authored move if there is one, else a generated one)
    if(weaponGroup){
      var byWeapon={}; g.moves.forEach(function(m){ if(m.weapon) byWeapon[m.weapon]=m; });
      var nonWeapon = g.moves.filter(function(m){ return !m.weapon; });
      var drawn = state.carried.map(function(id){ var w=wById(id); if(!w||!w.dmgDice) return null;
        return byWeapon[id] || { label:"Attack — "+w.name, weapon:id, detail:weaponDetail(w) }; }).filter(Boolean);
      moves = drawn.concat(nonWeapon);
    }
    // a leveled-spell move only shows if that spell is actually prepared/known right now
    moves = moves.filter(function(m){ return m.spellLevel==null || castable[m.ref]; });
    // surface every prepared spell whose cast time matches this group, so Combat Mode
    // always offers what you can actually cast (deduped against authored moves above)
    if(SPELL_CATALOG && SPELL_CATALOG.length){
      var have={}; moves.forEach(function(m){ if(m.ref) have[m.ref]=1; });
      (state.prepared||[]).forEach(function(id){
        var sp=spById(id); if(!sp || have[id]) return;
        if((sp.cast||"Action")!==g.cost) return;
        moves.push({ label:"Cast "+sp.name, ref:id, spellLevel:sp.level, detail:sp.note });
      });
    }
    var alsoItems = (g.more||[]).map(function(m){ return '<button class="gloss-term" data-gloss="'+esc(m.gloss)+'" type="button">'+esc(m.label)+'</button>'; });
    var navItems = [];
    if(weaponGroup) navItems.push('<button class="gloss-term cm-more-spells" data-scroll="[data-card=&quot;inventory&quot;]" type="button">Other weapons ↓</button>');
    if(hasSpells && g.cost==="Action") navItems.push('<button class="gloss-term cm-more-spells" data-scroll="[data-card=&quot;spellcasting&quot;]" type="button">Other spells ↓</button>');
    var nav = navItems.length ? '<div class="cm-nav'+(navItems.length===1?' solo':'')+'">'+navItems.join('')+'</div>' : "";
    var also = alsoItems.length ? '<div class="cm-more">Also: '+alsoItems.join(' · ')+'</div>' : "";
    var more = nav + also;
    return '<div class="cm-group'+(g.reaction?' cm-reaction':'')+'"><div class="cm-cost">'+esc(g.cost)+'</div>'+moves.map(combatMove).join("")+more+'</div>';
  }).join("");
  el.innerHTML = note + groups;
}
function setView(v){
  var av=document.getElementById("attackView"), cv=document.getElementById("combatView"); if(!cv) return;
  var t=document.getElementById("atkTitle"), btn=document.getElementById("atkToggle"), combat=(v==="combat");
  av.style.display = combat?"none":""; cv.style.display = combat?"":"none";
  if(t) t.textContent = combat?"Combat Mode":"Attacks";
  if(btn) btn.textContent = combat?"← Attacks":"Combat Mode →";
}

/* ----- Search ----- */
function buildSearchIndex(){
  var idx=[], gSeen={};
  ABIL_ORDER.forEach(function(k){ idx.push({label:ABIL_NAME[k], open:function(t){ openRef("abil_"+k,t); }, anchor:'[data-ref="abil_'+k+'"]'}); });
  SKILLS.forEach(function(s){ var key=ALIASES[s.name.toLowerCase()]; if(key) gSeen[key]=1; idx.push({label:s.name, open:(function(kk){return function(t){ openGlossModal(kk,t); };})(key), anchor:'[data-skill="'+s.name+'"]'}); });
  Object.keys(REF).forEach(function(id){ if(id.indexOf("abil_")===0) return; var inGrid=!!document.querySelector('.grid [data-ref="'+id+'"]'); idx.push({label:REF[id].title, open:(function(rid){return function(t){ openRef(rid,t); };})(id), anchor: inGrid?('.grid [data-ref="'+id+'"]'):null}); });
  Object.keys(GLOSSARY).forEach(function(k){ if(k.indexOf("die-")===0||gSeen[k]) return; idx.push({label:GLOSSARY[k].term, open:(function(kk){return function(t){ openGlossModal(kk,t); };})(k), anchor:null}); });
  return idx;
}
function openSearch(){
  if(!SEARCH_INDEX) SEARCH_INDEX=buildSearchIndex();
  hstuds.style.display="none"; hsearch.style.display="flex";
  searchInput.value=""; searchResults.innerHTML=""; searchResults.style.display="none";
  searchInput.focus();
}
function closeSearch(){
  hsearch.style.display="none"; hstuds.style.display="";
  searchInput.value=""; searchResults.innerHTML=""; searchResults.style.display="none";
}
function runSearch(){
  var q=searchInput.value.trim().toLowerCase();
  searchResults.innerHTML="";
  if(!q){ searchResults.style.display="none"; return; }
  var matches=SEARCH_INDEX.filter(function(e){ return e.label.toLowerCase().indexOf(q)>=0; });
  matches.sort(function(a,b){ var as=a.label.toLowerCase().indexOf(q)===0?0:1, bs=b.label.toLowerCase().indexOf(q)===0?0:1; return as!==bs ? as-bs : a.label.localeCompare(b.label); });
  matches.slice(0,12).forEach(function(e){
    var row=document.createElement("div"); row.className="sr-row";
    var main=document.createElement("button"); main.type="button"; main.className="sr-main"; main.textContent=e.label;
    main.addEventListener("click", function(){ var fn=e.open; closeSearch(); fn(null); });
    row.appendChild(main);
    if(e.anchor){
      var jump=document.createElement("button"); jump.type="button"; jump.className="sr-jump"; jump.setAttribute("aria-label","Go to it on the sheet"); jump.innerHTML=svgIcon("sheet");
      jump.addEventListener("click", function(){ var a=e.anchor; closeSearch(); scrollToAnchor(a); });
      row.appendChild(jump);
    }
    searchResults.appendChild(row);
  });
  if(!matches.length){ var none=document.createElement("div"); none.className="sr-empty"; none.textContent="Nothing on this sheet."; searchResults.appendChild(none); }
  renderCorpusMatches(q, matches);   // offline rules library: every spell & feat, not just this character's
  if(q.length>=2){
    var ob=document.createElement("button"); ob.type="button"; ob.className="sr-online";
    ob.innerHTML=svgIcon("search")+'<span>Search the web (Open5e)</span>';
    ob.addEventListener("click", function(){ remoteSearch(q); });
    searchResults.appendChild(ob);
  }
  searchResults.style.display="block";
}
/* ----- offline rules library -----
   A static, cached corpus (docs/rules/) shipped alongside the sheets, so any
   spell or feat is searchable — not just the ones on this character. Loaded on
   demand and cached (Cache API), it works offline after first use. */
var RULES=null, RULES_LOADING=false;
function rulesBase(){ return location.pathname.replace(/[^/]*$/, "") + "rules/"; }
// The service worker (sw.js) owns offline caching of the corpus in a versioned
// cache that busts on each rebuild, so here we just fetch — the SW serves from
// cache when offline and refreshes when a new build ships.
function cachedJson(u){ return fetch(u).then(function(r){ if(!(r && r.ok)) throw new Error("fetch failed"); return r.json(); }); }
function loadRules(){
  if(RULES) return Promise.resolve(RULES);
  return cachedJson(rulesBase()+"index.json").then(function(j){ RULES=(j&&j.entries)||[]; return RULES; }).catch(function(){ RULES=[]; return RULES; });
}
function renderCorpusMatches(q, localMatches){
  function paint(){
    var local={}; localMatches.forEach(function(m){ local[m.label.toLowerCase()]=1; });
    var cm=RULES.filter(function(e){ return e.n.toLowerCase().indexOf(q)>=0 && !local[e.n.toLowerCase()]; });
    cm.sort(function(a,b){ var as=a.n.toLowerCase().indexOf(q)===0?0:1, bs=b.n.toLowerCase().indexOf(q)===0?0:1; return as!==bs ? as-bs : a.n.localeCompare(b.n); });
    if(!cm.length) return;
    var head=document.createElement("div"); head.className="sr-src"; head.textContent="Rules library"; searchResults.appendChild(head);
    cm.slice(0,10).forEach(function(e){
      var row=document.createElement("div"); row.className="sr-row";
      var main=document.createElement("button"); main.type="button"; main.className="sr-main";
      main.innerHTML='<span>'+esc(e.n)+'</span><span class="sr-tag">'+esc(e.sub||e.t)+'</span>';
      main.addEventListener("click", function(){ closeSearch(); openCorpusEntry(e); });
      row.appendChild(main); searchResults.appendChild(row);
    });
  }
  if(RULES){ paint(); return; }
  if(RULES_LOADING) return;
  RULES_LOADING=true;
  loadRules().then(function(){ RULES_LOADING=false; if(searchInput.value.trim().toLowerCase()===q) runSearch(); });
}
function openCorpusEntry(e){
  cachedJson(rulesBase()+e.s+".json").then(function(shard){
    var x=shard[e.i]; if(!x) return;
    var foot = (e.t==="feature"||e.t==="rules")
      ? "From your offline rules library — 2024 rules."
      : "From your offline rules library (SRD). This sheet uses 2024 rules — wording may differ.";
    openRemoteModal(Object.assign({}, x, {_foot:foot}));
  }).catch(function(){});
}
function scrollToAnchor(sel){
  var el=document.querySelector(sel); if(!el) return;
  var card=el.closest(".card")||el;
  card.scrollIntoView({behavior:"smooth", block:"start"});
  var flashEl=(el.offsetParent!==null)?el:card;
  flashEl.classList.add("search-flash"); setTimeout(function(){ flashEl.classList.remove("search-flash"); }, 1500);
}
/* Fallback: when nothing on the sheet or in the glossary matches, query the
   open Open5e SRD reference (spells, items, conditions, rules). */
function remoteSearch(q){
  searchResults.innerHTML='<div class="sr-empty">Searching the 5e reference…</div>'; searchResults.style.display="block";
  var cats=[["spells","spell"],["magicitems","item"],["conditions","condition"],["sections","rule"]];
  Promise.all(cats.map(function(c){
    return fetch("https://api.open5e.com/v1/"+c[0]+"/?search="+encodeURIComponent(q)+"&limit=20")
      .then(function(r){ return r.ok?r.json():{results:[]}; })
      .then(function(j){ return (j.results||[]).map(function(x){ return {name:x.name, type:c[1], desc:x.desc||x.description||""}; }); })
      .catch(function(){ return []; });
  })).then(function(lists){
    if(searchInput.value.trim().toLowerCase()!==q) return;   // stale query
    var all=[], seen={};
    lists.forEach(function(l){ l.forEach(function(x){ if(!x.name) return; var k=x.name.toLowerCase()+"|"+x.type; if(seen[k]) return; seen[k]=1; all.push(x); }); });
    // the API search also matches description text — prefer entries whose name matches the query
    var nameHits=all.filter(function(x){ return x.name.toLowerCase().indexOf(q)>=0; });
    var finalList=(nameHits.length?nameHits:all);
    finalList.sort(function(a,b){ var as=a.name.toLowerCase().indexOf(q)===0?0:1, bs=b.name.toLowerCase().indexOf(q)===0?0:1; return as-bs; });
    renderRemoteResults(finalList);
  }).catch(function(){ if(searchInput.value.trim().toLowerCase()===q){ searchResults.innerHTML='<div class="sr-empty">Couldn\'t reach the 5e reference.</div>'; } });
}
function renderRemoteResults(all){
  searchResults.innerHTML="";
  if(!all.length){ searchResults.innerHTML='<div class="sr-empty">No matches on the sheet or in the 5e reference.</div>'; return; }
  var head=document.createElement("div"); head.className="sr-src"; head.textContent="From the 5e reference (SRD)"; searchResults.appendChild(head);
  all.slice(0,8).forEach(function(x){
    var row=document.createElement("div"); row.className="sr-row";
    var main=document.createElement("button"); main.type="button"; main.className="sr-main";
    main.innerHTML='<span>'+esc(x.name)+'</span><span class="sr-tag">'+esc(x.type)+'</span>';
    main.addEventListener("click", function(){ closeSearch(); openRemoteModal(x); });
    row.appendChild(main); searchResults.appendChild(row);
  });
  searchResults.style.display="block";
}
function openRemoteModal(x){
  resetGlossary(); currentRefPool=null; lastTrigger=null;
  refTitle.textContent=x.name;
  refDice.textContent=""; refDice.style.display="none";
  refChips.innerHTML='<span class="chip storm">5e reference · '+esc(x.type)+'</span>'; refChips.style.display="flex";
  refBody.innerHTML="";
  var md=String(x.desc||"").trim();
  if(md && typeof marked!=="undefined" && marked.parse){
    try { refBody.innerHTML=marked.parse(md); } catch(err){ refBody.innerHTML=""; }
  }
  if(!refBody.childNodes.length && md){
    String(md).split(/\n\n+/).forEach(function(t){ t=t.replace(/\s*\n\s*/g," ").trim(); if(t){ var p=document.createElement("p"); p.textContent=t; refBody.appendChild(p); } });
  }
  if(!refBody.childNodes.length){ var p=document.createElement("p"); p.textContent="No description available."; refBody.appendChild(p); }
  linkifyTerms(refBody);
  refFoot.innerHTML='<span class="uses-left">'+esc(x._foot || "via Open5e · SRD (5e). Your sheet uses 2024 rules — wording may differ.")+'</span>';
  refOverlay.classList.add("show"); document.getElementById("refClose").focus();
}

/* ----- Concentration ----- */
function renderConc(){
  var bar=document.getElementById("concBar"); if(!bar) return;
  if(state.conc){ bar.style.display="block"; bar.innerHTML='<span class="conc-lbl">Concentrating on</span><b>'+esc(state.conc)+'</b><span class="conc-tap">tap to manage</span>'; }
  else { bar.style.display="none"; bar.innerHTML=""; }
}
function setConc(name){ state.conc=name||""; persist(); renderConc(); }
function stopConcentration(){ setConc(""); toast("Concentration ended."); }
/* Casting a concentration spell starts (or switches) concentration. For pooled
   spells the resource is spent as part of the cast; otherwise it's just the cast. */
function castSpell(r){
  var commit=function(){
    if(r.pool){ if(!spendPool(r.pool)){ toast("None left — rest to recover."); return; } toast(POOL_REMINDER[r.pool]); }
    setConc(r.concentration);
    if(!r.pool) toast("Casting "+r.concentration+" — now concentrating.");
  };
  if(state.conc && state.conc!==r.concentration){ concCastConfirm(r.concentration, commit); }
  else { commit(); }
}
function concCastConfirm(newName, onYes){
  var old=state.conc;
  resetGlossary(); currentRefPool=null;
  refTitle.textContent="Switch Concentration?";
  refDice.textContent=""; refDice.style.display="none"; refChips.innerHTML=""; refChips.style.display="none";
  refBody.innerHTML="";
  var p=document.createElement("p"); p.textContent="Casting "+newName+" ends your concentration on "+old+" — you can only concentrate on one effect at a time."; refBody.appendChild(p);
  refFoot.innerHTML="";
  var yes=document.createElement("button"); yes.type="button"; yes.className="btn ember"; yes.textContent="Cast "+newName;
  yes.addEventListener("click", function(){ onYes(); closeRef(); });
  var no=document.createElement("button"); no.type="button"; no.className="btn"; no.textContent="Keep "+old;
  no.addEventListener("click", closeRef);
  refFoot.appendChild(yes); refFoot.appendChild(no);
  refOverlay.classList.add("show"); document.getElementById("refClose").focus();
}
/* ----- Casting a leveled spell: choose which slot (or a free cast) to spend ----- */
function castOptions(r){
  var free=null;
  if(r.freePool && POOL_MAX[r.freePool]!=null){
    free={ pool:r.freePool, free:true, label:"Free cast — no slot", n:state[r.freePool], max:POOL_MAX[r.freePool] };
  }
  var slots=[];
  slotPoolsList().forEach(function(sp){
    if(sp.level < (r.level||1)) return;
    slots.push({ pool:sp.id, level:sp.level, n:state[sp.id], max:sp.max });
  });
  slots.sort(function(a,b){ return a.level-b.level; });
  // Primary = the lowest slot you can actually spend right now, so when your
  // level-3 slots are gone the button defaults to your lowest available 4th+.
  // If every castable slot is depleted, fall back to the lowest level (shown
  // disabled). Every other level — lower-and-used or higher — goes in the menu.
  var baseIdx=-1;
  for(var i=0;i<slots.length;i++){ if(slots[i].n>0){ baseIdx=i; break; } }
  if(baseIdx<0) baseIdx=0;
  var base=slots.length ? slots[baseIdx] : null;
  var others=slots.filter(function(_,i){ return i!==baseIdx; });
  return { free:free, base:base, others:others };
}
function castOptBtn(r, o, cls){
  var b=document.createElement("button"); b.type="button"; b.className="btn "+cls+(o.n>0?" ember":"");
  b.disabled=o.n<=0; b.style.opacity=o.n<=0?".5":"1";
  var lbl=o.free ? o.label : ordinal(o.level)+"-level slot";
  b.innerHTML='<span class="cast-lbl">'+esc(lbl)+'</span><span class="cast-n">'+o.n+"/"+o.max+'</span>';
  b.addEventListener("click", function(){ if(o.n>0) doCast(r, o.pool); });
  return b;
}
function renderCastFoot(r){
  refFoot.innerHTML="";
  var o=castOptions(r);
  var any=(o.free&&o.free.n>0) || (o.base&&o.base.n>0) || o.others.some(function(u){ return u.n>0; });
  if(r.concentration && state.conc && state.conc!==r.concentration){
    var note=document.createElement("span"); note.className="uses-left cast-conc";
    note.textContent="Casting ends concentration on "+state.conc+".";
    refFoot.appendChild(note);
  }
  if(!o.free && !o.base){ var s=document.createElement("span"); s.className="uses-left"; s.textContent="No spell slots."; refFoot.appendChild(s); return; }
  var wrap=document.createElement("div"); wrap.className="cast-controls";
  if(o.free) wrap.appendChild(castOptBtn(r, o.free, "cast-opt cast-full"));
  if(o.base){
    var split=document.createElement("div"); split.className="cast-split";
    var mainBtn=castOptBtn(r, o.base, "cast-opt cast-main");
    // Heads-up when every slot at the spell's own level is spent, so the default
    // button would burn a higher slot than the spell needs.
    if(o.base.level > (r.level||1)){
      mainBtn.classList.add("over-slot");
      var lbl=mainBtn.querySelector(".cast-lbl");
      if(lbl) lbl.insertAdjacentHTML("afterbegin", '<span class="cast-warn" title="No '+esc(ordinal(r.level||1))+'-level slot left — this spends a higher '+esc(ordinal(o.base.level))+'-level slot.">⚠</span> ');
    }
    split.appendChild(mainBtn);
    if(o.others.length){
      var menu=document.createElement("div"); menu.className="cast-upcast";
      var head=document.createElement("div"); head.className="cast-up-head";
      head.textContent= r.upcast ? "Other slots — higher levels improve this spell" : "Cast with another slot level"; menu.appendChild(head);
      var grid=document.createElement("div"); grid.className="cast-up-grid";
      o.others.forEach(function(u){ grid.appendChild(castOptBtn(r, u, "btn tiny cast-opt cast-up")); });
      menu.appendChild(grid);
      var disc=document.createElement("button"); disc.type="button"; disc.className="btn cast-disc"+(r.upcast?" has-upcast":"");
      disc.setAttribute("aria-expanded","false");
      disc.setAttribute("aria-label", r.upcast ? "Choose a slot level — upcasting improves this spell" : "Choose a slot level");
      // ✦ marks a spell that gains something from a higher slot; bare ▾ otherwise
      disc.innerHTML=(r.upcast?'<span class="cast-up-ic" title="Upcasting improves this spell">✦</span>':'')+'<span class="cast-tri">▾</span>';
      disc.addEventListener("click", function(){
        var open=menu.classList.toggle("open");
        disc.setAttribute("aria-expanded", open?"true":"false");
        disc.querySelector(".cast-tri").textContent= open?"▴":"▾";
      });
      split.appendChild(disc);
      wrap.appendChild(split);
      wrap.appendChild(menu);
    } else {
      wrap.appendChild(split);
    }
  }
  refFoot.appendChild(wrap);
  if(!any){ var w=document.createElement("span"); w.className="uses-left"; w.textContent="None left — take a rest."; refFoot.appendChild(w); }
}
function doCast(r, poolId){
  var fire=function(){
    if(!spendPool(poolId)){ toast("None left — rest to recover."); return; }
    if(r.concentration) setConc(r.concentration);
    var p=CHARACTER.pools[poolId], how = p && p.slotLevel ? (" · "+ordinal(p.slotLevel)+"-level slot") : (p && !p.slotLevel ? " · free" : "");
    toast("Cast "+r.title+how+(r.concentration?" — concentrating.":"."));
    closeRef();
  };
  if(r.concentration && state.conc && state.conc!==r.concentration){ concCastConfirm(r.concentration, fire); }
  else fire();
}
function concDamageModal(dmg){
  var dc=Math.max(10, Math.floor(dmg/2)), con=saveMod("CON");
  resetGlossary(); currentRefPool=null; lastTrigger=null;
  refTitle.textContent="Concentration Check";
  refDice.textContent="Con save: d20 "+fmt(con)+"   ·   DC "+dc; refDice.style.display="block";
  refChips.innerHTML=""; refChips.style.display="none";
  refBody.innerHTML="";
  var p=document.createElement("p"); p.textContent="You took "+dmg+" damage while concentrating on "+state.conc+". Make a Constitution saving throw to maintain concentration."; refBody.appendChild(p);
  var p2=document.createElement("p"); p2.className="muted"; p2.textContent="DC is 10, or half the damage taken if that's higher (here "+dc+"). On a failed save, the effect ends."; refBody.appendChild(p2);
  linkifyTerms(refBody);
  refFoot.innerHTML="";
  var fail=document.createElement("button"); fail.type="button"; fail.className="btn ember"; fail.textContent="Failed — end it";
  fail.addEventListener("click", function(){ stopConcentration(); closeRef(); });
  var held=document.createElement("button"); held.type="button"; held.className="btn"; held.textContent="Held";
  held.addEventListener("click", closeRef);
  refFoot.appendChild(fail); refFoot.appendChild(held);
  refOverlay.classList.add("show"); document.getElementById("refClose").focus();
}
function openConcManage(){
  if(!state.conc) return;
  resetGlossary(); currentRefPool=null; lastTrigger=null;
  refTitle.textContent="Concentration";
  refDice.textContent=""; refDice.style.display="none"; refChips.innerHTML=""; refChips.style.display="none";
  refBody.innerHTML="";
  var p=document.createElement("p"); p.textContent="You're concentrating on "+state.conc+"."; refBody.appendChild(p);
  var p2=document.createElement("p"); p2.className="muted"; p2.textContent="It also ends if you cast another concentration spell, become Incapacitated, or fail a Constitution save when you take damage."; refBody.appendChild(p2);
  refFoot.innerHTML="";
  var stop=document.createElement("button"); stop.type="button"; stop.className="btn ember"; stop.textContent="Stop concentrating";
  stop.addEventListener("click", function(){ stopConcentration(); closeRef(); });
  var keep=document.createElement("button"); keep.type="button"; keep.className="btn"; keep.textContent="Keep concentrating";
  keep.addEventListener("click", closeRef);
  refFoot.appendChild(stop); refFoot.appendChild(keep);
  refOverlay.classList.add("show"); document.getElementById("refClose").focus();
}
function spLevelOf(sp){ return sp && sp.level!=null ? sp.level : 1; }
function levelLabel(l){ return l===0 ? "Cantrips" : "Level "+l; }
function groupByLevel(list){
  var by={}; list.forEach(function(sp){ var l=spLevelOf(sp); (by[l]=by[l]||[]).push(sp); });
  return Object.keys(by).map(Number).sort(function(a,b){return a-b;}).map(function(l){ return {level:l, spells:by[l]}; });
}
function levelHead(l){ var h=document.createElement("div"); h.className="spell-level-head"; h.textContent=levelLabel(l); return h; }
function renderPrepared(){
  if(!preparedList) return; preparedList.innerHTML="";
  var prepared=state.prepared.map(spById).filter(Boolean);
  groupByLevel(prepared).forEach(function(grp){
    preparedList.appendChild(levelHead(grp.level));
    grp.spells.forEach(function(sp){
      var b=document.createElement("button"); b.type="button"; b.className="feat"; b.setAttribute("data-ref", sp.id);
      b.innerHTML='<b>'+esc(sp.name)+'</b><span>'+esc(sp.note)+'</span>'; preparedList.appendChild(b);
    });
  });
  var c=document.getElementById("prepCount"); if(c) c.textContent=state.prepared.length+"/"+PREPARED_MAX;
}

/* ----- HP logic ----- */
function commitHp(){ var c=parseInt(hpCur.value,10); if(isNaN(c)) c=state.hpCur; var m=parseInt(hpMax.value,10); if(isNaN(m)||m<1) m=state.hpMax; state.hpMax=m; state.hpCur=Math.max(0,Math.min(m,c)); persist(); renderHP(); }
function spendPool(pool){ if(state[pool]<=0) return false; state[pool]--; persist(); renderPools(); refreshModalUses(pool); return true; }

/* ----- ARMOR CLASS modal — equips the same gear the Inventory does ----- */
function acToggleBtn(label, note, onClick){
  var btn=document.createElement("button"); btn.type="button"; btn.className="ac-toggle";
  btn.innerHTML='<span class="acbox">✓</span><span class="acname">'+esc(label)+'</span><span class="acnote">'+esc(note)+'</span>';
  btn.addEventListener("click", onClick); return btn;
}
function equipArmor(id){ state.armorId = (state.armorId===id) ? "" : id; persist(); renderACStud(); paintAC(); renderInvEquip(); }
function equipShield(){ if(!state.shield && handsFree()<1){ toast("No free hand for a shield — stow a weapon first."); return; } state.shield=!state.shield; persist(); renderACStud(); paintAC(); renderInvEquip(); renderAttacks(); renderCombat(); }
function toggleStyle(){ state.style=!state.style; persist(); renderACStud(); paintAC(); }
function toggleMageArmor(){ state.mageArmor=!state.mageArmor; persist(); renderACStud(); paintAC(); }
/* worn accessories drive AC (live) and saves (rebuild ability modals + re-render abilities) */
function toggleAccessory(id){
  if(!Array.isArray(state.worn)) state.worn=accessoryDefaultIds();
  var i=state.worn.indexOf(id); if(i>=0) state.worn.splice(i,1); else state.worn.push(id);
  persist(); buildAbilityRefs(); renderAbilities(); renderACStud(); paintAC(); renderInvEquip();
}
function openAC(trigger){
  resetGlossary(); lastTrigger=trigger||null; currentRefPool=null;
  refTitle.textContent="Armor Class"; refChips.innerHTML=""; refChips.style.display="none"; refDice.style.display="block"; refBody.innerHTML="";
  var intro=document.createElement("p"); intro.textContent="Armor Class is how hard you are to hit: an attacker's d20 roll plus its bonuses must equal or beat it to land. Equip gear here or from your Inventory."; refBody.appendChild(intro);
  linkifyTerms(intro);
  if(ARMORY.length>1){ var h=document.createElement("div"); h.className="hp-label"; h.style.cssText="text-align:left;margin:.5rem 0 .3rem"; h.textContent="Armor · equip one"; refBody.appendChild(h); }
  ARMORY.forEach(function(a){ refBody.appendChild(acToggleBtn(a.label, a.note, function(){ equipArmor(a.id); })); });
  if(MAGE_ARMOR) refBody.appendChild(acToggleBtn(MAGE_ARMOR.label, MAGE_ARMOR.note||"spell · base AC "+MAGE_ARMOR.base+" + Dex", toggleMageArmor));
  if(SHIELD) refBody.appendChild(acToggleBtn(SHIELD.label, SHIELD.note||"+"+SHIELD.bonus+" AC", equipShield));
  if(AC_STYLE) refBody.appendChild(acToggleBtn(AC_STYLE.label, AC_STYLE.note||"+"+AC_STYLE.bonus+" AC", toggleStyle));
  ACCESSORIES.forEach(function(a){ refBody.appendChild(acToggleBtn(a.label, a.note||"+"+(a.ac||0)+" AC", function(){ toggleAccessory(a.id); })); });
  refFoot.innerHTML='<span class="uses-left" id="acBreak"></span>'; refOverlay.classList.add("show"); paintAC(); document.getElementById("refClose").focus();
}
function paintAC(){
  if(!refOverlay.classList.contains("show")) return;
  refDice.textContent="AC "+computeAC();
  var btns=refBody.querySelectorAll(".ac-toggle"), i=0;
  ARMORY.forEach(function(a){ var b=btns[i++]; if(b) b.classList.toggle("on", state.armorId===a.id); });
  if(MAGE_ARMOR){ var bm=btns[i++]; if(bm){ bm.classList.toggle("on", mageArmorOn()); bm.classList.toggle("inactive", !!equippedArmor()); } }
  if(SHIELD){ var bs=btns[i++]; if(bs) bs.classList.toggle("on", !!state.shield); }
  if(AC_STYLE){ var by=btns[i++]; if(by){ by.classList.toggle("on", !!state.style); by.classList.toggle("inactive", !equippedArmor()); } }
  ACCESSORIES.forEach(function(a){ var ba=btns[i++]; if(ba) ba.classList.toggle("on", accessoryWorn(a.id)); });
  var brk=document.getElementById("acBreak"); if(brk) brk.textContent=acBreakdown();
}

/* ----- WEAPON MASTERY modal ----- */
function openMastery(trigger){
  resetGlossary(); lastTrigger=trigger||null; currentRefPool=null;
  refTitle.textContent="Weapon Mastery"; refChips.innerHTML=""; refChips.style.display="none"; refDice.style.display="block"; refBody.innerHTML="";
  var intro=document.createElement("p"); intro.className="muted";
  intro.textContent="Choose up to "+MASTERY_MAX+" weapons to master; you can change these after each long rest. Each weapon's mastery property is fixed to that weapon.";
  refBody.appendChild(intro);
  WEAPONS.forEach(function(w){
    var owned=OWNED.indexOf(w.id)>=0, drawn=state.carried.indexOf(w.id)>=0;
    var statusLbl = drawn ? '' : (owned ? ' <span class="own">(stowed)</span>' : ' <span class="own">(not in kit)</span>');
    var btn=document.createElement("button"); btn.type="button"; btn.className="wm-row";
    btn.innerHTML='<span class="acbox">✓</span><span class="wm-main"><span class="wm-name">'+esc(w.name)+statusLbl+' <span class="mastery">'+esc(w.mastery)+'</span></span><span class="wm-eff">'+esc(w.masteryEff||w.eff||"")+'</span></span>';
    btn.addEventListener("click", function(){ toggleMastery(w.id); });
    refBody.appendChild(btn);
  });
  refFoot.innerHTML='<span class="uses-left" id="wmCount"></span>'; paintMastery(); refOverlay.classList.add("show"); document.getElementById("refClose").focus();
}
function toggleMastery(id){
  var i=state.masteries.indexOf(id);
  if(i>=0){ state.masteries.splice(i,1); }
  else { if(state.masteries.length>=MASTERY_MAX){ toast("You can master "+MASTERY_MAX+" weapons — deselect one first."); return; } state.masteries.push(id); }
  persist(); paintMastery(); renderMasterySummary(); renderAttacks(); renderCombat();
}
function paintMastery(){
  refDice.textContent="Mastered: "+state.masteries.length+" / "+MASTERY_MAX;
  var rows=refBody.querySelectorAll(".wm-row");
  WEAPONS.forEach(function(w,i){ if(rows[i]) rows[i].classList.toggle("on", state.masteries.indexOf(w.id)>=0); });
  var c=document.getElementById("wmCount"); if(c) c.textContent="Swap your choices after any long rest.";
}

/* ----- PREPARED SPELLS modal ----- */
function openPrepare(trigger){
  resetGlossary(); lastTrigger=trigger||null; currentRefPool=null;
  refTitle.textContent="Prepare Spells"; refChips.innerHTML=""; refChips.style.display="none"; refDice.style.display="block"; refBody.innerHTML="";
  var intro=document.createElement("p"); intro.className="muted";
  intro.textContent="Choose up to "+PREPARED_MAX+" spells to prepare; you can change these after a long rest. You prepare a single pool of spells of any level you have slots for — there's no per-level cap. Cantrips and always-prepared spells don't count.";
  refBody.appendChild(intro);
  groupByLevel(SPELL_CATALOG).forEach(function(grp){
    refBody.appendChild(levelHead(grp.level));
    grp.spells.forEach(function(sp){
      var btn=document.createElement("button"); btn.type="button"; btn.className="wm-row"; btn.setAttribute("data-id", sp.id);
      btn.innerHTML='<span class="acbox">✓</span><span class="wm-main"><span class="wm-name">'+esc(sp.name)+'</span><span class="wm-eff">'+esc(sp.note)+'</span></span>';
      btn.addEventListener("click", function(){ togglePrepare(sp.id); });
      refBody.appendChild(btn);
    });
  });
  refFoot.innerHTML='<span class="uses-left" id="prepFoot"></span>'; paintPrepare(); refOverlay.classList.add("show"); document.getElementById("refClose").focus();
}
function togglePrepare(id){
  var i=state.prepared.indexOf(id);
  if(i>=0){ state.prepared.splice(i,1); }
  else { if(state.prepared.length>=PREPARED_MAX){ toast("You can prepare "+PREPARED_MAX+" — unprepare one first."); return; } state.prepared.push(id); }
  persist(); paintPrepare(); renderPrepared(); renderCombat();
}
function paintPrepare(){
  refDice.textContent="Prepared: "+state.prepared.length+" / "+PREPARED_MAX;
  refBody.querySelectorAll(".wm-row").forEach(function(row){
    var id=row.getAttribute("data-id"); row.classList.toggle("on", state.prepared.indexOf(id)>=0);
  });
  var f=document.getElementById("prepFoot"); if(f) f.textContent="Swap after a long rest.";
}

/* render body paragraphs, turning [[refId|Text]] markup into tappable ref-links,
   then glossary-linkifying the remaining prose */
function bodyParas(container, paras){
  (paras||[]).forEach(function(p){
    var el=document.createElement("p");
    String(p).split(/(\[\[[^\]]+\]\])/).forEach(function(seg){
      var m=seg.match(/^\[\[([^|\]]+)\|([^\]]+)\]\]$/);
      if(m){ var b=document.createElement("button"); b.type="button"; b.className="gloss-term ref-link"; b.setAttribute("data-ref", m[1]); b.textContent=m[2]; el.appendChild(b); }
      else if(seg){ el.appendChild(document.createTextNode(seg)); }
    });
    container.appendChild(el);
  });
  linkifyTerms(container);
}
/* ----- REFERENCE MODAL ----- */
/* On-a-hit damage riders (Dreadful Strikes, Hunter's Mark, …) shown at the
   bottom of every weapon modal. A rider is "active" only when its condition
   is met — e.g. Hunter's Mark needs you to be concentrating on it. */
function hitRiderActive(rd){
  if(rd.requiresConc) return state.conc===rd.requiresConc;
  if(rd.pool) return state[rd.pool]>0;
  return true;
}
function appendHitRiders(container){
  var riders=CHARACTER.hitRiders||[]; if(!riders.length) return;
  var wrap=document.createElement("div"); wrap.className="hit-riders";
  var head=document.createElement("div"); head.className="hr-head"; head.textContent=CHARACTER.riderHead||"On a hit, you can add"; wrap.appendChild(head);
  riders.forEach(function(rd){
    var active=hitRiderActive(rd);
    var b=document.createElement("button"); b.type="button"; b.className="hr-box"+(active?"":" hr-off");
    if(rd.ref) b.setAttribute("data-rider", rd.ref);   // expand inline (keeps the attack in view), not navigate away
    var note=active ? (rd.note||"") : (rd.offNote || (rd.requiresConc?("needs Concentration on "+rd.requiresConc):(rd.pool?"none left — rest to recover":"not available")));
    if(rd.pool){ note=(note?note+" · ":"")+state[rd.pool]+"/"+POOL_MAX[rd.pool]+" left"; }
    b.innerHTML='<span class="hr-dmg">'+esc(rd.dmg)+'</span><span class="hr-text"><span class="hr-name">'+esc(rd.label)+'</span><span class="hr-note">'+esc(note)+'</span></span>';
    wrap.appendChild(b);
  });
  container.appendChild(wrap);
}
/* Expand a rider's reference INLINE at the bottom of the current modal (like an
   inline glossary entry) so the weapon's to-hit/damage stays visible — tapping a
   maneuver/superiority option must not replace the attack card. */
function expandRef(refId){
  var r=REF[refId]; if(!r || !refGlossary) return;
  var existing=refGlossary.querySelector('[data-gd="rider-'+refId+'"]');
  if(existing){ existing.scrollIntoView({block:"nearest"}); existing.classList.add("flash"); setTimeout(function(){ existing.classList.remove("flash"); },600); return; }
  var box=document.createElement("div"); box.className="gloss-def"; box.setAttribute("data-gd","rider-"+refId);
  var h=document.createElement("span"); h.className="gd-term"; h.textContent=r.title; box.appendChild(h);
  if(r.dice){ var d=document.createElement("div"); d.className="gd-body"; d.style.color="var(--ember-bright)"; d.textContent=r.dice; box.appendChild(d); }
  (r.body||[]).forEach(function(p){ var pb=document.createElement("div"); pb.className="gd-body"; pb.textContent=p; box.appendChild(pb); linkifyTerms(pb); });
  refGlossary.appendChild(box);
  box.scrollIntoView({block:"nearest"});
}
function openRef(id, trigger){
  if(id==="stat_ac"){ openAC(trigger); return; }
  if(id==="weaponmastery"){ openMastery(trigger); return; }
  var r=REF[id]; if(!r) return;
  resetGlossary(); lastTrigger=trigger||null; currentRefPool=r.pool||null;
  refTitle.textContent=r.title;
  // weapon refs: reflect the live to-hit / damage / crit (versatile-aware), not the authored dice
  var wpn=wById(id), diceText=r.dice||"", chips=r.chips||[];
  if(wpn && wpn.dmgDice){
    diceText="To hit: d20 "+weaponToHit(wpn)+"   ·   Damage: "+weaponDmg(wpn)+(versatileActive(wpn)?" (two-handed)":"");
    var critTxt="Crit "+critDmg(wpn);
    if(chips.some(function(c){ return /^Crit/.test(c.t); })) chips=chips.map(function(c){ return /^Crit/.test(c.t) ? Object.assign({},c,{t:critTxt}) : c; });
    else chips=chips.concat([{t:critTxt, c:"ember"}]);
    if(state.masteries.indexOf(wpn.id)>=0 && wpn.mastery && !chips.some(function(c){ return c.t===wpn.mastery; })) chips=chips.concat([{t:wpn.mastery, c:"storm"}]);
  }
  refDice.textContent=diceText; refDice.style.display=diceText?"block":"none"; if(diceText) linkifyTerms(refDice);
  refChips.innerHTML="";
  chips.forEach(function(c){ var s=document.createElement("span"); s.className="chip"+(c.c?(" "+c.c):""); s.textContent=c.t; refChips.appendChild(s); });
  refChips.style.display=chips.length?"flex":"none";
  refBody.innerHTML="";
  if(r.info){ var info=document.createElement("div"); info.className="spell-meta"; info.textContent=r.info; refBody.appendChild(info); }
  bodyParas(refBody, r.body);
  if(wpn && wpn.dmgDice) appendHitRiders(refBody);
  refFoot.innerHTML="";
  if(r.level!=null){
    renderCastFoot(r);
  } else if(r.pool){
    var btn=document.createElement("button"); btn.type="button"; btn.className="btn ember"; btn.id="refUseBtn";
    btn.addEventListener("click", function(){
      if(r.concentration){ castSpell(r); }
      else if(spendPool(r.pool)){ toast(POOL_REMINDER[r.pool]); }
      else { toast("None left — rest to recover."); }
    });
    var left=document.createElement("span"); left.className="uses-left"; left.id="refUsesLeft";
    refFoot.appendChild(btn); refFoot.appendChild(left);
  } else if(r.concentration){
    var cast=document.createElement("button"); cast.type="button"; cast.className="btn ember"; cast.textContent="Cast";
    cast.addEventListener("click", function(){ castSpell(r); });
    refFoot.appendChild(cast);
  }
  refOverlay.classList.add("show");
  if(r.pool){ refreshModalUses(r.pool); }
  document.getElementById("refClose").focus();
}
function refreshModalUses(pool){
  if(!refOverlay.classList.contains("show") || currentRefPool!==pool) return;
  var btn=document.getElementById("refUseBtn"), left=document.getElementById("refUsesLeft"); if(!btn) return;
  var remaining=state[pool], max=POOL_MAX[pool];
  btn.textContent=(CHARACTER.pools[pool] && CHARACTER.pools[pool].use) || "Use";
  btn.disabled=remaining<=0; btn.style.opacity=remaining<=0?".5":"1";
  if(left) left.textContent=remaining+" / "+max+" remaining";
}
function closeRef(){ refOverlay.classList.remove("show"); currentRefPool=null; resetGlossary(); if(lastTrigger&&lastTrigger.focus) lastTrigger.focus(); }
function openGlossModal(key, trigger){
  var g=GLOSSARY[key]; if(!g) return;
  resetGlossary(); lastTrigger=trigger||null; currentRefPool=null;
  refTitle.textContent=g.term; refDice.textContent=""; refDice.style.display="none"; refChips.innerHTML=""; refChips.style.display="none"; refBody.innerHTML="";
  var p=document.createElement("p"); p.textContent=g.def; refBody.appendChild(p); linkifyTerms(refBody);
  refFoot.innerHTML=""; refOverlay.classList.add("show"); document.getElementById("refClose").focus();
}

/* ----- REST ----- */
function openRest(){ restOverlay.classList.add("show"); }
function closeRest(){ restOverlay.classList.remove("show"); }
function doShortRest(){
  Object.keys(CHARACTER.pools).forEach(function(id){ var p=CHARACTER.pools[id]; if(p.rest!=="short") return;
    // shortRegain N = recover only N uses on a short rest (e.g. Wild Shape, Channel Divinity); otherwise refill fully
    state[id] = p.shortRegain ? Math.min(p.max, (parseInt(state[id],10)||0) + p.shortRegain) : p.max; });
  state.conc=""; persist(); renderPools(); renderConc(); closeRest(); toast(CHARACTER.rest.shortToast||"Short rest.");
}
function doLongRest(){
  state.hpCur=parseInt(state.hpMax,10); state.temp=0;
  Object.keys(CHARACTER.pools).forEach(function(id){ state[id]=CHARACTER.pools[id].max; });
  state.dsSucc=0; state.dsFail=0; state.conc="";
  persist(); renderPools(); renderHP(); renderDeath(); renderConc(); closeRest(); toast(CHARACTER.rest.longToast||"Long rest — fully restored.");
}

/* ----- wiring (after render; assigns dynamic handles + listeners) ----- */
function wireSheet(){
  hpCur=document.getElementById("hpCur"); hpMax=document.getElementById("hpMax"); tempWrap=document.getElementById("tempWrap");
  deathSaves=document.getElementById("deathSaves"); hpAdjust=document.getElementById("hpAdjust"); tempRow=document.getElementById("tempRow");
  hitDicePool=document.getElementById("hitDicePool"); attackList=document.getElementById("attackList"); preparedList=document.getElementById("preparedList"); acVal=document.getElementById("acVal");

  hpCur.addEventListener("change", commitHp);
  hpCur.addEventListener("keydown", function(e){ if(e.key==="Enter") hpCur.blur(); });
  hpMax.addEventListener("change", commitHp);
  document.getElementById("dmgBtn").addEventListener("click", function(){
    var v=parseInt(document.getElementById("hpDelta").value,10); if(isNaN(v)||v<=0) return;
    var dmg=v;
    if(state.temp>0){ var a=Math.min(state.temp,v); state.temp-=a; v-=a; }
    state.hpCur=Math.max(0,state.hpCur-v); persist(); renderHP(); document.getElementById("hpDelta").value="";
    if(state.conc){ if(parseInt(state.hpCur,10)===0){ stopConcentration(); } else { concDamageModal(dmg); } }
  });
  document.getElementById("healBtn").addEventListener("click", function(){ var v=parseInt(document.getElementById("hpDelta").value,10); if(isNaN(v)||v<=0) return; state.hpCur=Math.min(parseInt(state.hpMax,10),state.hpCur+v); persist(); renderHP(); document.getElementById("hpDelta").value=""; });
  document.getElementById("tempBtn").addEventListener("click", function(){ var v=parseInt(document.getElementById("tempIn").value,10); if(isNaN(v)||v<0) v=0; state.temp=v; persist(); renderHP(); document.getElementById("tempIn").value=""; });
  document.getElementById("spendHd").addEventListener("click", function(){ if(spendPool("hd")) toast(POOL_REMINDER.hd); else toast("No hit dice remaining."); });
  document.getElementById("restBtn").addEventListener("click", openRest);
  var pb=document.getElementById("prepareBtn"); if(pb) pb.addEventListener("click", function(){ openPrepare(pb); });
  var tg=document.getElementById("atkToggle"); if(tg) tg.addEventListener("click", function(){ state.view=(state.view==="combat")?"attacks":"combat"; persist(); setView(state.view); });
  var cb=document.getElementById("concBar"); if(cb) cb.addEventListener("click", openConcManage);
  hstuds=document.getElementById("hstuds"); hsearch=document.getElementById("hsearch"); searchInput=document.getElementById("searchInput"); searchResults=document.getElementById("searchResults");
  var so=document.getElementById("searchOpen"), sc=document.getElementById("searchClose");
  if(so){
    so.addEventListener("click", openSearch);
    sc.addEventListener("click", closeSearch);
    searchInput.addEventListener("input", function(){ clearTimeout(searchTimer); searchTimer=setTimeout(runSearch, 180); });
    searchInput.addEventListener("keydown", function(e){
      if(e.key==="Escape"){ closeSearch(); return; }
      if(e.key==="Enter"){
        e.preventDefault();
        var q=searchInput.value.trim().toLowerCase();
        if(q.length>=2){ remoteSearch(q); }
      }
    });
  }

  document.getElementById("refClose").addEventListener("click", closeRef);
  refOverlay.addEventListener("click", function(e){ if(e.target===refOverlay) closeRef(); });
  document.getElementById("restClose").addEventListener("click", closeRest);
  restOverlay.addEventListener("click", function(e){ if(e.target===restOverlay) closeRest(); });
  document.getElementById("shortRest").addEventListener("click", doShortRest);
  document.getElementById("longRest").addEventListener("click", doLongRest);
  document.addEventListener("keydown", function(e){ if(e.key==="Escape"){ closeRef(); closeRest(); } });

  document.addEventListener("click", function(e){
    var gl=e.target.closest("[data-gloss]"); if(gl){ openGlossModal(gl.getAttribute("data-gloss"), gl); return; }
    var sc=e.target.closest("[data-scroll]"); if(sc){ scrollToAnchor(sc.getAttribute("data-scroll")); return; }
    var sk=e.target.closest("[data-skill]"); if(sk){ openGlossModal(ALIASES[sk.getAttribute("data-skill").toLowerCase()], sk); return; }
    var rd=e.target.closest("[data-rider]"); if(rd){ expandRef(rd.getAttribute("data-rider")); return; }
    var t=e.target.closest("[data-ref]"); if(!t) return; openRef(t.getAttribute("data-ref"), t);
  });

  document.getElementById("resetLink").addEventListener("click", function(){
    if(confirm("Reset the sheet to starting values? This clears HP and all trackers.")){
      state=JSON.parse(JSON.stringify(defaults));
      Promise.resolve(store.clear()).then(function(){ persist(); });
      renderPools(); renderHP(); renderDeath(); renderACStud(); renderMasterySummary(); renderAttacks(); renderInventory(); if(CHARACTER.prepared) renderPrepared(); renderConc(); toast("Sheet reset.");
    }
  });
  var editLink=document.getElementById("editLink"); if(editLink) editLink.addEventListener("click", editChar);
  var exportLink=document.getElementById("exportLink"); if(exportLink) exportLink.addEventListener("click", exportChar);
}

/* ----- Edit / Export the character's source JSON ----- */
function sourceDoc(){ return (typeof CHARACTER_SOURCE!=="undefined" && CHARACTER_SOURCE) ? CHARACTER_SOURCE : CHARACTER; }
function exportChar(){
  var src=sourceDoc();
  var blob=new Blob([JSON.stringify(src, null, 2)], {type:"application/json"});
  var url=URL.createObjectURL(blob), a=document.createElement("a");
  a.href=url; a.download=(src.id||"character")+".json"; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
}
function editChar(){
  var src=sourceDoc();
  try { localStorage.setItem("dnd_builder_import", JSON.stringify(src)); }
  catch(e){ toast("Couldn't hand off to the editor."); return; }
  window.open("builder.html?import=1", "_blank");
}

/* ----- init ----- */
(async function init(){
  renderAll(); wireSheet();
  setStatus("loading");
  var loaded=null; try { loaded=await store.load(); } catch(e){}
  state=applyDefaults(loaded);
  if(state.armorId && !armorById(state.armorId)) state.armorId=defaults.armorId;
  if(!Array.isArray(state.masteries)) state.masteries=defaults.masteries.slice();
  if(!Array.isArray(state.carried)) state.carried=defaults.carried.slice();
  else state.carried=state.carried.filter(function(id){ return OWNED.indexOf(id)>=0; });
  while(handsUsed()>2 && state.carried.length){ state.carried.pop(); }   // trim an over-capacity loadout (e.g. migrated saves)
  if(CHARACTER.prepared && !Array.isArray(state.prepared)) state.prepared=defaults.prepared.slice();
  if(!Array.isArray(state.worn)) state.worn=defaults.worn.slice();
  else state.worn=state.worn.filter(function(id){ for(var i=0;i<ACCESSORIES.length;i++){ if(ACCESSORIES[i].id===id) return true; } return false; });
  buildAbilityRefs();   // saves depend on worn accessories loaded from storage
  renderAbilities(); renderSkills();
  renderPools(); renderHP(); renderDeath(); renderACStud(); renderMasterySummary(); renderAttacks(); renderInventory();
  if(CHARACTER.prepared) renderPrepared();
  if(CHARACTER.combat) setView(state.view);
  renderConc();
  setStatus("saved");
})();

// Register the offline service worker (precaches the rules corpus + this sheet
// for full offline use). No-ops on file:// or where unsupported.
if (typeof navigator !== "undefined" && navigator.serviceWorker && location.protocol.indexOf("http") === 0) {
  var regSW = function(){ navigator.serviceWorker.register("sw.js").catch(function(){}); };
  if (document.readyState === "complete") regSW();
  else window.addEventListener("load", regSW);
}
