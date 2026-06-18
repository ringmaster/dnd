/* Shared: card render functions. Each returns an HTML string built from CHARACTER + derived math.
   Dynamic sub-parts (rivets, hp values, attack/prepared lists) are left as empty
   containers and filled by sheet.js. */
function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function poolBlock(id){
  var p=CHARACTER.pools[id]; if(!p) return "";
  return '<div class="pool"><div class="pool-head">'+
    '<button class="pname" data-ref="'+esc(p.ref)+'" type="button">'+esc(p.label)+' ⓘ</button>'+
    '<span class="pnote">'+esc(p.note||"")+'</span></div>'+
    '<div class="rivets" id="'+id+'Rivets"></div></div>';
}
function featBtn(f, first){
  var style = first ? ' style="margin-top:.5rem"' : '';
  var span = f.spanId ? '<span id="'+f.spanId+'">'+esc(f.sub)+'</span>' : '<span>'+esc(f.sub)+'</span>';
  return '<button class="feat" data-ref="'+esc(f.ref)+'" type="button"'+style+'><b>'+esc(f.name)+'</b>'+span+'</button>';
}
function label(text, m){ return '<div class="hp-label" style="text-align:left;margin:'+(m||'.7rem 0 .35rem')+'">'+esc(text)+'</div>'; }

function studDisplay(s){
  switch(s.ref){
    case "stat_ac":    return computeAC(defaults.ac);
    case "stat_init":  return fmt(initiative());
    case "stat_prof":  return fmt(PB);
    case "stat_pass":  return passivePerception();
    case "stat_speed": return CHARACTER.speed;
    default:           return s.value;
  }
}
function svgIcon(name){
  var p = name==="search" ? '<circle cx="7" cy="7" r="4.3"/><line x1="10.4" y1="10.4" x2="14.5" y2="14.5"/>'
        : name==="close"  ? '<line x1="3.5" y1="3.5" x2="12.5" y2="12.5"/><line x1="12.5" y1="3.5" x2="3.5" y2="12.5"/>'
        : name==="sheet"  ? '<rect x="3" y="2" width="10" height="12" rx="1.5"/><line x1="5.5" y1="6" x2="10.5" y2="6"/><line x1="5.5" y1="8.5" x2="10.5" y2="8.5"/><line x1="5.5" y1="11" x2="8.5" y2="11"/>'
        : '';
  return '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true">'+p+'</svg>';
}
function renderHeaderHTML(){
  var studs = CHARACTER.studs.map(function(s){
    return '<button class="stud" data-ref="'+esc(s.ref)+'" type="button"><span class="sl">'+esc(s.label)+'</span><span class="sv"'+(s.id?' id="'+s.id+'"':'')+'>'+esc(studDisplay(s))+'</span></button>';
  }).join("");
  return '<div class="who"><h1>'+esc(CHARACTER.name)+'</h1><div class="sub">'+esc(CHARACTER.subtitle)+'</div></div>'+
    '<div class="studs" id="hstuds">'+studs+'<button class="stud-search" id="searchOpen" type="button" aria-label="Search">'+svgIcon("search")+'</button></div>'+
    '<div class="hsearch" id="hsearch" style="display:none">'+
      '<span class="hsearch-ic">'+svgIcon("search")+'</span>'+
      '<input id="searchInput" class="hsearch-input" type="text" autocomplete="off" placeholder="Search rules & sheet…" aria-label="Search rules and sheet">'+
      '<button class="stud-search" id="searchClose" type="button" aria-label="Close search">'+svgIcon("close")+'</button>'+
      '<div class="hsearch-results" id="searchResults" style="display:none"></div>'+
    '</div>';
}

var CARD = {
  abilities: function(){ return '<h2>Abilities <span class="hint">tap for detail · all checks roll d20</span></h2><div class="abilities" id="abilities"></div>'; },
  hitpoints: function(){
    var hdNote = (CHARACTER.pools.hd && CHARACTER.pools.hd.note) || "short rest";
    return '<h2>Hit Points</h2>'+
      '<div class="hp-top"><input class="hp-cur" id="hpCur" type="text" inputmode="numeric" aria-label="Current hit points"><span class="hp-sep">/</span><input class="hp-max" id="hpMax" type="text" inputmode="numeric" aria-label="Maximum hit points"></div>'+
      '<div class="hp-label">Current / Max</div>'+
      '<div class="row" id="tempWrap" style="margin-bottom:.6rem"></div>'+
      '<div class="row" id="hpAdjust"><input class="num" id="hpDelta" type="number" min="0" inputmode="numeric" placeholder="#" aria-label="Amount"><button class="btn tiny" id="dmgBtn" type="button">Damage</button><button class="btn tiny ember" id="healBtn" type="button">Heal</button></div>'+
      '<div class="row" id="tempRow" style="margin-top:.6rem"><span class="mini-label">Temp HP</span><input class="num" id="tempIn" type="number" min="0" inputmode="numeric" placeholder="0" aria-label="Set temporary hit points"><button class="btn tiny" id="tempBtn" type="button">Set</button></div>'+
      '<div class="pool" id="hitDicePool" style="margin-top:.8rem"><div class="pool-head"><button class="pname" data-ref="hitdice" type="button">Hit Dice ⓘ</button><span class="pnote">'+esc(hdNote)+'</span></div><div class="rivets" id="hdRivets"></div><div class="row" style="justify-content:flex-start;margin-top:.5rem"><button class="btn tiny" id="spendHd" type="button">Spend Hit Die</button></div></div>'+
      '<div class="row" style="justify-content:flex-start;margin-top:.7rem"><button class="btn ember" id="restBtn" type="button">Rest</button></div>'+
      '<div id="deathSaves" style="margin-top:.8rem;display:none"><div class="hp-label" style="text-align:left;margin-bottom:.4rem">Death Saves</div><div class="ds-row"><span class="lbl">Saves +</span><div class="rivets" id="dsSucc"></div></div><div class="ds-row"><span class="lbl">Saves −</span><div class="rivets" id="dsFail"></div></div></div>';
  },
  attacks: function(card){
    var extras=(card.extras||[]).map(function(f,i){ return featBtn(f, i===0); }).join("");
    var toggle = CHARACTER.combat ? '<button class="card-toggle" id="atkToggle" type="button">Combat Mode →</button>' : '<span class="hint">one attack / turn</span>';
    return '<h2><span id="atkTitle">Attacks</span> '+toggle+'</h2>'+
           '<div id="attackView"><div id="attackList"></div>'+extras+'</div>'+
           (CHARACTER.combat ? '<div id="combatView" style="display:none"><div id="combatBody"></div></div>' : '');
  },
  pools: function(card){
    var pools=(card.pools||[]).map(poolBlock).join("");
    var extras=(card.extras||[]).map(function(f,i){ return featBtn(f, i===0); }).join("");
    var hint=card.hint?' <span class="hint">'+esc(card.hint)+'</span>':'';
    return '<h2>'+esc(card.title||"Resources")+hint+'</h2>'+pools+extras;
  },
  spellcasting: function(card){
    var html='<h2>Spellcasting <span class="hint">'+esc(ABIL_NAME[CHARACTER.spellcasting.ability])+' · save DC '+spellDC()+' · atk '+fmt(spellAtk())+'</span></h2>';
    if(card.slotPools) card.slotPools.forEach(function(id){ html+=poolBlock(id); });
    else if(card.slotPool) html+=poolBlock(card.slotPool);
    html+='<div style="margin-top:.6rem">';
    if(card.cantrips && card.cantrips.length){ html+='<div class="spell-level-head" style="margin-top:.1rem">Cantrips · at will</div>'; html+=card.cantrips.map(function(f){return featBtn(f,false);}).join(""); }
    if(card.always && card.always.length){ html+=label("Always prepared",".7rem 0 .35rem"); html+=card.always.map(function(f){return featBtn(f,false);}).join(""); }
    if(card.prepared){
      html+='<div class="hp-label" style="text-align:left;margin:.7rem 0 .35rem">Prepared spells <span id="prepCount" class="count-tag">0/0</span></div><div id="preparedList"></div>'+
            '<div class="row" style="justify-content:flex-start;margin-top:.5rem"><button class="btn tiny" id="prepareBtn" type="button">Prepare spells…</button></div>';
    }
    if(card.initiate){
      html+=label(card.initiate.label,".8rem 0 .35rem");
      html+=(card.initiate.spells||[]).map(function(f){return featBtn(f,false);}).join("");
    }
    html+='</div>';
    if(card.initiate && card.initiate.pool){ html+=poolBlock(card.initiate.pool); }
    return html;
  },
  skills: function(){
    var foot="";
    var t=CHARACTER.tools||[], lang=CHARACTER.languages;
    if(t.length) foot+='<div class="prof-line"><span class="prof-lbl">Tools</span>'+t.map(esc).join(" · ")+'</div>';
    if(lang){ var parts=(lang.known||[]).slice(); if(lang.choices) parts.push(lang.choices+" of choice"); if(parts.length) foot+='<div class="prof-line"><span class="prof-lbl">Languages</span>'+parts.map(esc).join(" · ")+'</div>'; }
    return '<h2>Skills <span class="hint">tap a skill · ● proficient · roll d20 + value</span></h2><div class="skills" id="skills"></div>'+(foot?'<div class="prof-foot">'+foot+'</div>':'');
  },
  inventory: function(card){
    var html='<h2>Inventory <span class="hint">gear &amp; carried items</span></h2>';
    if(card.magic){ html+='<button class="inv-magic" data-ref="'+esc(card.magic.ref)+'" type="button"><b>'+esc(card.magic.name)+'</b><span class="mtag">'+esc(card.magic.tag)+'</span><span class="desc">'+esc(card.magic.desc)+'</span></button>'; }
    html+=(card.items||[]).map(function(it){ return '<div class="inv-row"><span class="iname">'+esc(it.name)+'</span><span class="itag">'+esc(it.tag)+'</span></div>'; }).join("");
    return html;
  },
  features: function(card){
    return '<h2>Features &amp; Traits <span class="hint">tap any for rules</span></h2>'+(card.list||[]).map(function(f){return featBtn(f,false);}).join("");
  },
  background: function(card){
    var paras=(card.paras||[]).map(function(p){return '<p>'+esc(p)+'</p>';}).join("");
    return '<h2>Background <span class="hint">'+esc(card.hint||"")+'</span></h2><div class="bg-text">'+paras+'</div>';
  },
  buildlog: function(card){
    var lvls=(card.levels||[]).map(function(lv){
      var items=(lv.items||[]).map(function(it){
        var cls=it.cls?(' class="'+it.cls+'"'):'';
        return '<li'+cls+'>'+(it.html||esc(it.text))+'</li>';
      }).join("");
      return '<div class="lvl"><h4>'+esc(lv.title)+(lv.tag?' <span class="tag">'+esc(lv.tag)+'</span>':'')+'</h4><ul>'+items+'</ul></div>';
    }).join("");
    return '<details><summary>Build Log — choices by level</summary><div class="lvl-wrap">'+lvls+'</div></details>';
  }
};

function renderGridHTML(){
  return CHARACTER.cards.map(function(card){
    var fn=CARD[card.type]; if(!fn) return "";
    var full = (card.type==="background"||card.type==="buildlog"||card.full) ? ' style="grid-column:1 / -1"' : '';
    var cls = "card" + (card.type==="buildlog" ? " buildlog" : "");
    return '<section class="'+cls+'"'+full+'>'+fn(card)+'</section>';
  }).join("");
}
