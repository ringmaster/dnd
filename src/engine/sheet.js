/* Shared: state, rendering orchestration, and interactions — all read from CHARACTER. */

/* ----- reference content: auto ability modals + character-specific entries ----- */
var REF = {};
ABIL_ORDER.forEach(function(k){
  var sv=saveMod(k), chk=abilCheckMod(k);
  var body=["Ability score "+CHARACTER.abilities[k]+" ("+fmt(abilMod(k))+" modifier).","Governs: "+GOVERNS[k]+"."];
  var chips = CHARACTER.saves.indexOf(k)>=0 ? [{t:"Save proficiency",c:"storm"}] : [];
  if(checkMod(k)){
    chips=chips.concat([{t:fmt(checkMod(k))+" to checks",c:"ember"}]);
    if(CHARACTER.checkModNote && CHARACTER.checkModNote[k]) body.push(CHARACTER.checkModNote[k]+", so a bare "+ABIL_NAME[k]+" check is d20 "+fmt(chk)+".");
  }
  REF["abil_"+k]={ title:ABIL_NAME[k], dice:"Check: d20 "+fmt(chk)+"   ·   Save: d20 "+fmt(sv), chips:chips, body:body };
});
Object.keys(CHARACTER.ref||{}).forEach(function(k){ REF[k]=CHARACTER.ref[k]; });

/* ----- pools derived from data ----- */
var POOL_MAX={}, POOL_REMINDER={}, POOL_EL={};
Object.keys(CHARACTER.pools).forEach(function(id){
  var p=CHARACTER.pools[id];
  POOL_MAX[id]=p.max; POOL_REMINDER[id]=p.reminder||""; POOL_EL[id]=[id+"Rivets", !!p.storm];
});

/* ----- AC config ----- */
var AC_PARTS=[];
["armor","shield","style"].forEach(function(k){ if(CHARACTER.ac[k]) AC_PARTS.push({id:k,label:CHARACTER.ac[k].label,note:CHARACTER.ac[k].note,requiresArmor:!!CHARACTER.ac[k].requiresArmor}); });
function acDefault(){
  var ac=CHARACTER.ac, o={};
  if(ac.armor) o.armor = ac.armor.default!==false;
  if(ac.shield) o.shield = ac.shield.default===true;
  if(ac.style) o.style = ac.style.default!==false;
  return o;
}
function acBreakdown(a){
  var parts=[], ac=CHARACTER.ac, dex=abilMod("DEX");
  if(a.armor && ac.armor){ parts.push(ac.armor.label.toLowerCase()+" "+ac.armor.base+(ac.armor.addDex?(" + Dex "+fmt(dex)):"")); }
  else parts.push("10 + Dex "+fmt(dex));
  if(a.shield && ac.shield) parts.push("shield "+fmt(ac.shield.bonus));
  if(a.style && ac.style && a.armor) parts.push(ac.style.label+" "+fmt(ac.style.bonus));
  return parts.join(" + ")+" = "+computeAC(a);
}

/* ----- weapons / mastery ----- */
var WEAPONS = CHARACTER.weapons;
var MASTERY_MAX = CHARACTER.masteryMax;
function wById(id){ for(var i=0;i<WEAPONS.length;i++){ if(WEAPONS[i].id===id) return WEAPONS[i]; } return null; }

/* ----- prepared spells (optional) ----- */
var PREPARED_MAX = CHARACTER.prepared ? CHARACTER.prepared.max : 0;
var SPELL_CATALOG = CHARACTER.prepared ? CHARACTER.prepared.catalog : [];
function spById(id){ for(var i=0;i<SPELL_CATALOG.length;i++){ if(SPELL_CATALOG[i].id===id) return SPELL_CATALOG[i]; } return null; }

/* ----- state ----- */
var defaults = { hpMax:CHARACTER.hp.max, hpCur:CHARACTER.hp.max, temp:0, dsSucc:0, dsFail:0,
                 ac:acDefault(), masteries:(CHARACTER.masteryDefault||[]).slice() };
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
function renderACStud(){ if(acVal) acVal.textContent=computeAC(state.ac); }
function renderMasterySummary(){
  var span=document.getElementById("wmSummary"); if(!span) return;
  var parts=state.masteries.map(function(id){ var w=wById(id); return w?w.mastery+" ("+w.name.toLowerCase()+")":null; }).filter(Boolean);
  span.textContent=(parts.length?parts.join(" · ")+" · ":"")+state.masteries.length+" of "+MASTERY_MAX+" mastered";
}
function renderAttacks(){
  if(!attackList) return; attackList.innerHTML="";
  WEAPONS.forEach(function(w){
    if(w.carried!==true || !w.dmgDice) return;
    var mastered = state.masteries.indexOf(w.id)>=0;
    var tag = mastered ? ' <span class="mastery">'+esc(w.mastery)+'</span>' : '';
    var sub = (w.props||[]).join(" · ") + ((w.props&&w.props.length)?" · ":"") + "crit "+critDmg(w);
    var b=document.createElement("button"); b.type="button"; b.className="tap"; b.setAttribute("data-ref", w.id);
    b.innerHTML='<div class="tap-name">'+esc(w.name)+tag+'</div>'+
      '<div class="tap-dice">To hit: d20 '+weaponToHit(w)+' · Damage: '+weaponDmg(w)+'</div>'+
      '<div class="tap-sub">'+esc(sub)+' · <span class="info-tag">tap for rules ⓘ</span></div>';
    attackList.appendChild(b);
  });
}
function renderPrepared(){
  if(!preparedList) return; preparedList.innerHTML="";
  state.prepared.forEach(function(id){ var sp=spById(id); if(!sp) return;
    var b=document.createElement("button"); b.type="button"; b.className="feat"; b.setAttribute("data-ref", id);
    b.innerHTML='<b>'+esc(sp.name)+'</b><span>'+esc(sp.note)+'</span>'; preparedList.appendChild(b);
  });
  var c=document.getElementById("prepCount"); if(c) c.textContent=state.prepared.length+"/"+PREPARED_MAX;
}

/* ----- HP logic ----- */
function commitHp(){ var c=parseInt(hpCur.value,10); if(isNaN(c)) c=state.hpCur; var m=parseInt(hpMax.value,10); if(isNaN(m)||m<1) m=state.hpMax; state.hpMax=m; state.hpCur=Math.max(0,Math.min(m,c)); persist(); renderHP(); }
function spendPool(pool){ if(state[pool]<=0) return false; state[pool]--; persist(); renderPools(); refreshModalUses(pool); return true; }

/* ----- ARMOR CLASS modal ----- */
function openAC(trigger){
  resetGlossary(); lastTrigger=trigger||null; currentRefPool=null;
  refTitle.textContent="Armor Class"; refChips.innerHTML=""; refChips.style.display="none"; refDice.style.display="block"; refBody.innerHTML="";
  var intro=document.createElement("p"); intro.className="muted"; intro.textContent="Toggle gear to see how your AC changes."; refBody.appendChild(intro);
  AC_PARTS.forEach(function(p){
    var btn=document.createElement("button"); btn.type="button"; btn.className="ac-toggle";
    btn.innerHTML='<span class="acbox">✓</span><span class="acname">'+esc(p.label)+'</span><span class="acnote">'+esc(p.note)+'</span>';
    btn.addEventListener("click", function(){ state.ac[p.id]=!state.ac[p.id]; persist(); renderACStud(); paintAC(); });
    refBody.appendChild(btn);
  });
  refFoot.innerHTML='<span class="uses-left" id="acBreak"></span>'; paintAC(); refOverlay.classList.add("show"); document.getElementById("refClose").focus();
}
function paintAC(){
  refDice.textContent="AC "+computeAC(state.ac);
  var btns=refBody.querySelectorAll(".ac-toggle");
  AC_PARTS.forEach(function(p,i){ var b=btns[i]; if(!b) return; b.classList.toggle("on", !!state.ac[p.id]); b.classList.toggle("inactive", p.requiresArmor && !state.ac.armor); });
  var brk=document.getElementById("acBreak"); if(brk) brk.textContent=acBreakdown(state.ac);
}

/* ----- WEAPON MASTERY modal ----- */
function openMastery(trigger){
  resetGlossary(); lastTrigger=trigger||null; currentRefPool=null;
  refTitle.textContent="Weapon Mastery"; refChips.innerHTML=""; refChips.style.display="none"; refDice.style.display="block"; refBody.innerHTML="";
  var intro=document.createElement("p"); intro.className="muted";
  intro.textContent="Choose up to "+MASTERY_MAX+" weapons to master; you can change these after each long rest. Each weapon's mastery property is fixed to that weapon.";
  refBody.appendChild(intro);
  WEAPONS.forEach(function(w){
    var btn=document.createElement("button"); btn.type="button"; btn.className="wm-row";
    btn.innerHTML='<span class="acbox">✓</span><span class="wm-main"><span class="wm-name">'+esc(w.name)+(w.carried?'':' <span class="own">(not carried)</span>')+' <span class="mastery">'+esc(w.mastery)+'</span></span><span class="wm-eff">'+esc(w.masteryEff||w.eff||"")+'</span></span>';
    btn.addEventListener("click", function(){ toggleMastery(w.id); });
    refBody.appendChild(btn);
  });
  refFoot.innerHTML='<span class="uses-left" id="wmCount"></span>'; paintMastery(); refOverlay.classList.add("show"); document.getElementById("refClose").focus();
}
function toggleMastery(id){
  var i=state.masteries.indexOf(id);
  if(i>=0){ state.masteries.splice(i,1); }
  else { if(state.masteries.length>=MASTERY_MAX){ toast("You can master "+MASTERY_MAX+" weapons — deselect one first."); return; } state.masteries.push(id); }
  persist(); paintMastery(); renderMasterySummary(); renderAttacks();
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
  intro.textContent="Choose up to "+PREPARED_MAX+" spells to prepare; you can change these after a long rest. Always-prepared spells don't count.";
  refBody.appendChild(intro);
  SPELL_CATALOG.forEach(function(sp){
    var btn=document.createElement("button"); btn.type="button"; btn.className="wm-row";
    btn.innerHTML='<span class="acbox">✓</span><span class="wm-main"><span class="wm-name">'+esc(sp.name)+'</span><span class="wm-eff">'+esc(sp.note)+'</span></span>';
    btn.addEventListener("click", function(){ togglePrepare(sp.id); });
    refBody.appendChild(btn);
  });
  refFoot.innerHTML='<span class="uses-left" id="prepFoot"></span>'; paintPrepare(); refOverlay.classList.add("show"); document.getElementById("refClose").focus();
}
function togglePrepare(id){
  var i=state.prepared.indexOf(id);
  if(i>=0){ state.prepared.splice(i,1); }
  else { if(state.prepared.length>=PREPARED_MAX){ toast("You can prepare "+PREPARED_MAX+" — unprepare one first."); return; } state.prepared.push(id); }
  persist(); paintPrepare(); renderPrepared();
}
function paintPrepare(){
  refDice.textContent="Prepared: "+state.prepared.length+" / "+PREPARED_MAX;
  var rows=refBody.querySelectorAll(".wm-row");
  SPELL_CATALOG.forEach(function(sp,i){ if(rows[i]) rows[i].classList.toggle("on", state.prepared.indexOf(sp.id)>=0); });
  var f=document.getElementById("prepFoot"); if(f) f.textContent="Swap after a long rest.";
}

/* ----- REFERENCE MODAL ----- */
function openRef(id, trigger){
  if(id==="stat_ac"){ openAC(trigger); return; }
  if(id==="weaponmastery"){ openMastery(trigger); return; }
  var r=REF[id]; if(!r) return;
  resetGlossary(); lastTrigger=trigger||null; currentRefPool=r.pool||null;
  refTitle.textContent=r.title;
  refDice.textContent=r.dice||""; refDice.style.display=r.dice?"block":"none"; if(r.dice) linkifyTerms(refDice);
  refChips.innerHTML="";
  (r.chips||[]).forEach(function(c){ var s=document.createElement("span"); s.className="chip"+(c.c?(" "+c.c):""); s.textContent=c.t; refChips.appendChild(s); });
  refChips.style.display=(r.chips&&r.chips.length)?"flex":"none";
  refBody.innerHTML=""; (r.body||[]).forEach(function(p){ var el=document.createElement("p"); el.textContent=p; refBody.appendChild(el); });
  linkifyTerms(refBody);
  refFoot.innerHTML="";
  if(r.pool){
    var btn=document.createElement("button"); btn.type="button"; btn.className="btn ember"; btn.id="refUseBtn";
    btn.addEventListener("click", function(){ if(spendPool(r.pool)){ toast(POOL_REMINDER[r.pool]); } else { toast("None left — rest to recover."); } });
    var left=document.createElement("span"); left.className="uses-left"; left.id="refUsesLeft";
    refFoot.appendChild(btn); refFoot.appendChild(left);
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
  Object.keys(CHARACTER.pools).forEach(function(id){ if(CHARACTER.pools[id].rest==="short") state[id]=CHARACTER.pools[id].max; });
  persist(); renderPools(); closeRest(); toast(CHARACTER.rest.shortToast||"Short rest.");
}
function doLongRest(){
  state.hpCur=parseInt(state.hpMax,10); state.temp=0;
  Object.keys(CHARACTER.pools).forEach(function(id){ state[id]=CHARACTER.pools[id].max; });
  state.dsSucc=0; state.dsFail=0;
  persist(); renderPools(); renderHP(); renderDeath(); closeRest(); toast(CHARACTER.rest.longToast||"Long rest — fully restored.");
}

/* ----- wiring (after render; assigns dynamic handles + listeners) ----- */
function wireSheet(){
  hpCur=document.getElementById("hpCur"); hpMax=document.getElementById("hpMax"); tempWrap=document.getElementById("tempWrap");
  deathSaves=document.getElementById("deathSaves"); hpAdjust=document.getElementById("hpAdjust"); tempRow=document.getElementById("tempRow");
  hitDicePool=document.getElementById("hitDicePool"); attackList=document.getElementById("attackList"); preparedList=document.getElementById("preparedList"); acVal=document.getElementById("acVal");

  hpCur.addEventListener("change", commitHp);
  hpCur.addEventListener("keydown", function(e){ if(e.key==="Enter") hpCur.blur(); });
  hpMax.addEventListener("change", commitHp);
  document.getElementById("dmgBtn").addEventListener("click", function(){ var v=parseInt(document.getElementById("hpDelta").value,10); if(isNaN(v)||v<=0) return; if(state.temp>0){ var a=Math.min(state.temp,v); state.temp-=a; v-=a; } state.hpCur=Math.max(0,state.hpCur-v); persist(); renderHP(); document.getElementById("hpDelta").value=""; });
  document.getElementById("healBtn").addEventListener("click", function(){ var v=parseInt(document.getElementById("hpDelta").value,10); if(isNaN(v)||v<=0) return; state.hpCur=Math.min(parseInt(state.hpMax,10),state.hpCur+v); persist(); renderHP(); document.getElementById("hpDelta").value=""; });
  document.getElementById("tempBtn").addEventListener("click", function(){ var v=parseInt(document.getElementById("tempIn").value,10); if(isNaN(v)||v<0) v=0; state.temp=v; persist(); renderHP(); document.getElementById("tempIn").value=""; });
  document.getElementById("spendHd").addEventListener("click", function(){ if(spendPool("hd")) toast(POOL_REMINDER.hd); else toast("No hit dice remaining."); });
  document.getElementById("restBtn").addEventListener("click", openRest);
  var pb=document.getElementById("prepareBtn"); if(pb) pb.addEventListener("click", function(){ openPrepare(pb); });

  document.getElementById("refClose").addEventListener("click", closeRef);
  refOverlay.addEventListener("click", function(e){ if(e.target===refOverlay) closeRef(); });
  document.getElementById("restClose").addEventListener("click", closeRest);
  restOverlay.addEventListener("click", function(e){ if(e.target===restOverlay) closeRest(); });
  document.getElementById("shortRest").addEventListener("click", doShortRest);
  document.getElementById("longRest").addEventListener("click", doLongRest);
  document.addEventListener("keydown", function(e){ if(e.key==="Escape"){ closeRef(); closeRest(); } });

  document.addEventListener("click", function(e){
    var sk=e.target.closest("[data-skill]"); if(sk){ openGlossModal(ALIASES[sk.getAttribute("data-skill").toLowerCase()], sk); return; }
    var t=e.target.closest("[data-ref]"); if(!t) return; openRef(t.getAttribute("data-ref"), t);
  });

  document.getElementById("resetLink").addEventListener("click", function(){
    if(confirm("Reset the sheet to starting values? This clears HP and all trackers.")){
      state=JSON.parse(JSON.stringify(defaults));
      Promise.resolve(store.clear()).then(function(){ persist(); });
      renderPools(); renderHP(); renderDeath(); renderACStud(); renderMasterySummary(); renderAttacks(); if(CHARACTER.prepared) renderPrepared(); toast("Sheet reset.");
    }
  });
}

/* ----- init ----- */
(async function init(){
  renderAll(); wireSheet();
  setStatus("loading");
  var loaded=null; try { loaded=await store.load(); } catch(e){}
  state=applyDefaults(loaded);
  if(!state.ac || typeof state.ac!=="object") state.ac=JSON.parse(JSON.stringify(defaults.ac));
  if(!Array.isArray(state.masteries)) state.masteries=defaults.masteries.slice();
  if(CHARACTER.prepared && !Array.isArray(state.prepared)) state.prepared=defaults.prepared.slice();
  renderAbilities(); renderSkills();
  renderPools(); renderHP(); renderDeath(); renderACStud(); renderMasterySummary(); renderAttacks();
  if(CHARACTER.prepared) renderPrepared();
  setStatus("saved");
})();
