/* Shared: 3D dice + recursive glossary engine */
  /* ---------- 3D die renderer (library-free canvas) ---------- */
  var PHI=(1+Math.sqrt(5))/2;
  function v_sub(a,b){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
  function v_add(a,b){return[a[0]+b[0],a[1]+b[1],a[2]+b[2]];}
  function v_scale(a,s){return[a[0]*s,a[1]*s,a[2]*s];}
  function v_dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
  function v_cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function v_len(a){return Math.sqrt(v_dot(a,a));}
  function v_norm(a){var l=v_len(a)||1;return v_scale(a,1/l);}
  function v_cent(V,idx){var c=[0,0,0];idx.forEach(function(i){c=v_add(c,V[i]);});return v_scale(c,1/idx.length);}
  function orderFace(V,idx){
    var c=v_cent(V,idx),n=v_norm(c),ref=v_norm(v_sub(V[idx[0]],c)),ax=v_norm(v_cross(n,ref));
    return idx.slice().sort(function(a,b){var va=v_sub(V[a],c),vb=v_sub(V[b],c);return Math.atan2(v_dot(va,ax),v_dot(va,ref))-Math.atan2(v_dot(vb,ax),v_dot(vb,ref));});
  }
  function triFaces(V){
    var n=V.length,min=Infinity,i,j,k;
    for(i=0;i<n;i++)for(j=i+1;j<n;j++){var d=v_len(v_sub(V[i],V[j]));if(d<min)min=d;}
    function adj(a,b){return Math.abs(v_len(v_sub(V[a],V[b]))-min)<1e-6*min;}
    var F=[];for(i=0;i<n;i++)for(j=i+1;j<n;j++)if(adj(i,j))for(k=j+1;k<n;k++)if(adj(i,k)&&adj(j,k))F.push([i,j,k]);
    return F;
  }
  var TET=[[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]];
  var OCTA=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  var CUBE=[[1,1,1],[1,1,-1],[1,-1,1],[1,-1,-1],[-1,1,1],[-1,1,-1],[-1,-1,1],[-1,-1,-1]];
  var CUBE_F=[[0,1,2,3],[4,5,6,7],[0,1,4,5],[2,3,6,7],[0,2,4,6],[1,3,5,7]];
  var ICO=[[0,1,PHI],[0,1,-PHI],[0,-1,PHI],[0,-1,-PHI],[1,PHI,0],[1,-PHI,0],[-1,PHI,0],[-1,-PHI,0],[PHI,0,1],[PHI,0,-1],[-PHI,0,1],[-PHI,0,-1]];
  function makeDodeca(){
    var icoF=triFaces(ICO);
    var DV=icoF.map(function(f){return v_cent(ICO,f);});
    var DF=ICO.map(function(_,u){var g=[];icoF.forEach(function(f,fi){if(f.indexOf(u)>=0)g.push(fi);});return g;});
    return {verts:DV,faces:DF};
  }
  function trapezohedron(n){
    var z0=0.38,h=1.15,V=[[0,0,h],[0,0,-h]],up=[],lo=[],i;
    for(i=0;i<n;i++){var a=2*Math.PI*i/n;V.push([Math.cos(a),Math.sin(a),z0]);up.push(V.length-1);}
    for(i=0;i<n;i++){var a=2*Math.PI*i/n+Math.PI/n;V.push([Math.cos(a),Math.sin(a),-z0]);lo.push(V.length-1);}
    var F=[];for(i=0;i<n;i++){var ni=(i+1)%n;F.push([0,up[i],lo[i],up[ni]]);F.push([1,lo[i],up[ni],lo[ni]]);}
    return {verts:V,faces:F};
  }
  var GEO_CACHE={};
  function buildGeometry(sides){
    if(GEO_CACHE[sides]) return GEO_CACHE[sides];
    var V,F;
    if(sides===4){V=TET;F=triFaces(V);}
    else if(sides===6){V=CUBE;F=CUBE_F;}
    else if(sides===8){V=OCTA;F=triFaces(V);}
    else if(sides===20){V=ICO;F=triFaces(V);}
    else if(sides===12){var d=makeDodeca();V=d.verts;F=d.faces;}
    else {var t=trapezohedron(5);V=t.verts;F=t.faces;}
    var R=0;V.forEach(function(v){R=Math.max(R,v_len(v));});
    V=V.map(function(v){return v_scale(v,1/R);});
    F=F.map(function(f){return orderFace(V,f);});
    var labels;
    if(sides===100) labels=["00","10","20","30","40","50","60","70","80","90"];
    else if(sides===10) labels=["0","1","2","3","4","5","6","7","8","9"];
    else {labels=[];for(var i=0;i<F.length;i++)labels.push(String(i+1));}
    return (GEO_CACHE[sides]={verts:V,faces:F,labels:labels});
  }
  var dieAnims=[];
  function startDie(canvas, sides){
    var geo=buildGeometry(sides), ctx=canvas.getContext("2d");
    var disp=74, dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=disp*dpr; canvas.height=disp*dpr; canvas.style.width=disp+"px"; canvas.style.height=disp+"px";
    ctx.scale(dpr,dpr);
    var cx=disp/2, cy=disp/2, scale=disp*0.4, light=v_norm([0.35,0.55,1]);
    var reduce=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var rot=0.6, tilt=0.5, raf=null, stopped=false;
    function rotate(v){
      var cy_=Math.cos(rot),sy=Math.sin(rot),x=v[0]*cy_+v[2]*sy,z=-v[0]*sy+v[2]*cy_,y=v[1];
      var cx_=Math.cos(tilt),sx=Math.sin(tilt);return [x,y*cx_-z*sx,y*sx+z*cx_];
    }
    function frame(){
      if(stopped) return;
      ctx.clearRect(0,0,disp,disp);
      var rv=geo.verts.map(rotate), items=[];
      geo.faces.forEach(function(f,fi){
        var pts=f.map(function(i){return rv[i];}),nx=0,ny=0,nz=0,k;
        for(k=0;k<pts.length;k++){var a=pts[k],b=pts[(k+1)%pts.length];nx+=(a[1]-b[1])*(a[2]+b[2]);ny+=(a[2]-b[2])*(a[0]+b[0]);nz+=(a[0]-b[0])*(a[1]+b[1]);}
        var nl=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;nz/=nl;if(nz<=0.02)return;
        nx/=nl;ny/=nl;var cz=0;pts.forEach(function(p){cz+=p[2];});
        items.push({pts:pts,n:[nx,ny,nz],cz:cz/pts.length,label:geo.labels[fi]});
      });
      items.sort(function(a,b){return a.cz-b.cz;});
      items.forEach(function(it){
        ctx.beginPath();
        it.pts.forEach(function(p,k){var X=cx+p[0]*scale,Y=cy-p[1]*scale;if(k===0)ctx.moveTo(X,Y);else ctx.lineTo(X,Y);});
        ctx.closePath();
        var sh=0.42+0.58*Math.max(0,v_dot(it.n,light));
        ctx.fillStyle="rgb("+Math.round(214*sh)+","+Math.round(130*sh)+","+Math.round(62*sh)+")";
        ctx.fill();
        ctx.lineWidth=1;ctx.strokeStyle="rgba(245,200,140,.85)";ctx.stroke();
        if(it.n[2]>0.34){
          var c=[0,0];it.pts.forEach(function(p){c[0]+=p[0];c[1]+=p[1];});
          var fs=Math.max(6,scale*0.4*it.n[2]);
          ctx.fillStyle="#241405";ctx.font="700 "+fs.toFixed(1)+'px "Cinzel",serif';
          ctx.textAlign="center";ctx.textBaseline="middle";
          ctx.fillText(it.label, cx+(c[0]/it.pts.length)*scale, cy-(c[1]/it.pts.length)*scale);
        }
      });
      if(!reduce){rot+=0.011;raf=requestAnimationFrame(frame);}
    }
    frame();
    var ctrl={stop:function(){stopped=true;if(raf)cancelAnimationFrame(raf);}};
    dieAnims.push(ctrl); return ctrl;
  }

  /* ---------- Glossary: underline known terms, expand definitions inline (recursive) ---------- */
  var GLOSSARY = {
    "die-4":{term:"d4",def:"A four-sided die (a tetrahedron). The smallest common die; used by some small weapons and spells.",die:4},
    "die-6":{term:"d6",def:"A six-sided die — the familiar cube. Used for many superiority dice and weapon damage.",die:6},
    "die-8":{term:"d8",def:"An eight-sided die — common for weapon damage and class dice such as superiority dice.",die:8},
    "die-10":{term:"d10",def:"A ten-sided die — used for d10 Hit Dice and many damage and healing rolls.",die:10},
    "die-12":{term:"d12",def:"A twelve-sided die (a dodecahedron). Used by heavy weapons such as the greataxe (1d12).",die:12},
    "die-20":{term:"d20",def:"A twenty-sided die — the core die. Attack rolls, saving throws, ability checks, and Initiative all roll a d20.",die:20},
    "die-100":{term:"d100",def:"Percentile dice: roll two d10s (one for tens, one for ones) to get a number from 1 to 100.",die:100},
    "advantage":{term:"Advantage",def:"Roll two d20s and use the higher roll. Advantage doesn't stack — and if you have both Advantage and Disadvantage on the same roll, they cancel out and you roll a single d20."},
    "disadvantage":{term:"Disadvantage",def:"Roll two d20s and use the lower roll. If you have both Advantage and Disadvantage on a roll, they cancel and you roll one d20."},
    "bonus-action":{term:"Bonus Action",def:"A quick extra action you can take on your turn on top of your action and movement. You get only one Bonus Action per turn, and only when a feature specifically grants one."},
    "magic-action":{term:"Magic action",def:"The action you take to cast a spell that has a casting time of an action, or to use a magic item or a feature that calls for a Magic action. It's one of the named actions you can take on your turn, in place of the Attack or another action."},
    "short-rest":{term:"Short Rest",def:"A break of at least 1 hour spent doing light activity. You can spend Hit Dice to heal, and some features recharge on a short rest. You can take several in a day."},
    "long-rest":{term:"Long Rest",def:"At least 8 hours of rest (up to 1 hour of light activity allowed). It restores all lost hit points, returns half your spent Hit Dice, and refreshes spell slots and most per-rest features. You benefit from only one Long Rest per 24 hours."},
    "prone":{term:"Prone",def:"A condition. A Prone creature can only crawl and attacks with Disadvantage. Attack rolls against it have Advantage if the attacker is within 5 feet, and Disadvantage otherwise. Standing up costs half your movement."},
    "saving-throw":{term:"Saving Throw",def:"A d20 roll to resist an effect, adding the relevant ability modifier plus your Proficiency Bonus if you're proficient. You succeed if the total meets or beats the effect's DC."},
    "ability-check":{term:"Ability Check",def:"A d20 roll plus an ability modifier (plus your Proficiency Bonus if proficient in a relevant skill) to attempt something uncertain, compared against a DC."},
    "ability-score":{term:"Ability Score",def:"The rating of one of the six abilities (Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma), usually 1–20. Its modifier is (score − 10) ÷ 2 rounded down — that modifier is what you add to d20 rolls."},
    "initiative":{term:"Initiative",def:"A Dexterity check rolled at the start of combat to set turn order, highest first. The Alert feat lets you add your Proficiency Bonus."},
    "proficiency-bonus":{term:"Proficiency Bonus",def:"A bonus tied to your level (+2 at levels 1–4) that you add to attack rolls, saving throws, and ability checks you're proficient with."},
    "tremorsense":{term:"Tremorsense",def:"You can pinpoint creatures and moving objects within range, as long as both you and them are in contact with the same ground or surface. It can't detect flying or incorporeal creatures."},
    "darkvision":{term:"Darkvision",def:"Within range you see in Dim Light as if it were Bright Light, and in Darkness as if it were Dim Light (in shades of gray)."},
    "bright-light":{term:"Bright Light",def:"Normal illumination. Most creatures see normally in Bright Light."},
    "dim-light":{term:"Dim Light",def:"A shadowy area, also called shadows. It is Lightly Obscured, giving Disadvantage on Wisdom (Perception) checks that rely on sight."},
    "resistance":{term:"Resistance",def:"If you have Resistance to a damage type, you take half damage from it. It's applied after other modifiers, and multiple instances of Resistance don't stack."},
    "poisoned":{term:"Poisoned",def:"A condition. A Poisoned creature has Disadvantage on attack rolls and ability checks."},
    "extra-attack":{term:"Extra Attack",def:"Starting at level 5, you can attack twice whenever you take the Attack action on your turn. You're level 4, so not yet."},
    "magic-weapon":{term:"Magic Weapon",def:"A weapon with magical properties. Attacks made with it count as magical, so they overcome a target's Resistance or immunity to damage from nonmagical attacks."},
    "armor-class":{term:"Armor Class (AC)",def:"How hard you are to hit. An attacker's d20 roll plus its bonuses must equal or exceed your AC to land. It's set by your armor (or 10 + your Dexterity modifier unarmored), plus a shield, a Fighting Style, and other bonuses. Tap the AC shield on your sheet to see how yours is built up."},
    "dc":{term:"Difficulty Class (DC)",def:"The target number for a d20 roll. To succeed on a saving throw or ability check, the total must equal or exceed the DC set by the effect or the GM."},
    "cantrip":{term:"Cantrip",def:"A level-0 spell you know permanently and can cast at will — it costs no spell slot and never needs preparing. You can cast one any time you have an action (or whatever casting time it lists). Some cantrips, like Guidance, still require Concentration. Their damage scales with your character level, not with slots. (One limit: if you cast a spell that takes a Bonus Action, the only other spell you can cast that turn is a cantrip with a casting time of one action.)"},
    "spell-slot":{term:"Spell Slot",def:"A unit of magical fuel. Casting a leveled (1st-level or higher) spell spends one slot of that spell's level or higher; cantrips don't use slots. Casting with a higher-level slot often makes the spell stronger (upcasting). You regain expended slots on a long rest."},
    "concentration":{term:"Concentration",def:"Some spells last only while you concentrate on them, and you can concentrate on just one at a time — casting a second Concentration spell ends the first. Concentration also ends if you become Incapacitated or die, and when you take damage you must make a Constitution saving throw (DC 10, or half the damage taken if higher) or lose it."},
    "reaction":{term:"Reaction",def:"An instant response to a specific trigger — you can take it even on another creature's turn. You get one Reaction per round; it refreshes at the start of your turn. The most common one is an Opportunity Attack."},
    "reach":{term:"Reach",def:"The distance you can hit with a melee attack — 5 feet for most creatures (your space plus the squares next to you). Leaving an enemy's reach can provoke an Opportunity Attack unless you Disengage."},
    "opportunity-attack":{term:"Opportunity Attack",def:"A Reaction: when a creature you can see leaves your reach using its movement, you can spend your Reaction to make one melee attack against it. It happens right before it leaves. Taking the Disengage action (or being shoved/teleported) avoids provoking it."},
    "dash":{term:"Dash (action)",def:"Gain extra movement equal to your Speed for this turn — effectively doubling how far you can move."},
    "disengage":{term:"Disengage (action)",def:"Your movement doesn't provoke Opportunity Attacks for the rest of the turn."},
    "dodge":{term:"Dodge (action)",def:"Until the start of your next turn, attack rolls against you have Disadvantage and you make Dexterity saves with Advantage — provided you can see the attacker and aren't Incapacitated or at 0 speed."},
    "hide":{term:"Hide (action)",def:"Make a Dexterity (Stealth) check (DC 15) while out of sight or behind cover. On a success you have the Invisible condition until you're found, you make a sound above a whisper, or you attack."},
    "help":{term:"Help (action)",def:"Give an ally Advantage on an ability check they make, or — if they're within 5 feet of a target — Advantage on their next attack roll against that target before your next turn."},
    "ready-action":{term:"Ready (action)",def:"Pick a trigger and a single action (or your movement). When the trigger occurs before your next turn, you use your Reaction to take the readied action."},
    "search":{term:"Search (action)",def:"Make a Wisdom check — Perception, Insight, Investigation, or Medicine — to find something hidden or to discern a clue."},
    "blinded":{term:"Blinded",def:"You can't see and automatically fail any ability check that requires sight. Attack rolls against you have Advantage, and your attack rolls have Disadvantage."},
    "charmed":{term:"Charmed",def:"You can't attack the charmer or target it with harmful abilities or effects, and the charmer has Advantage on ability checks to interact socially with you."},
    "deafened":{term:"Deafened",def:"You can't hear and automatically fail any ability check that requires hearing."},
    "exhaustion":{term:"Exhaustion",def:"Measured in levels (1–6). Each level gives a cumulative −2 penalty to every d20 Test and reduces your Speed by 5 feet; at level 6 you die. A long rest removes one level."},
    "frightened":{term:"Frightened",def:"While the source of your fear is within line of sight, you have Disadvantage on ability checks and attack rolls, and you can't willingly move closer to it."},
    "grappled":{term:"Grappled",def:"Your Speed is 0 and can't increase, and you have Disadvantage on attack rolls against any target other than the grappler. It ends if the grappler is Incapacitated or you're moved out of its reach."},
    "incapacitated":{term:"Incapacitated",def:"You can't take any action, Bonus Action, or Reaction, your Concentration is broken, and you can't speak. If you become Incapacitated in combat you also can't take your turn's movement."},
    "invisible":{term:"Invisible",def:"You can't be seen without the aid of magic or a special sense. Attack rolls against you have Disadvantage and your attack rolls have Advantage; you also gain a Surprise edge on Initiative if hidden."},
    "paralyzed":{term:"Paralyzed",def:"You're Incapacitated and can't move or speak. You automatically fail Strength and Dexterity saves, attack rolls against you have Advantage, and any attack that hits you from within 5 feet is a critical hit."},
    "petrified":{term:"Petrified",def:"You're transformed to stone: Incapacitated, can't move or speak, and unaware of your surroundings. Attacks against you have Advantage, you auto-fail Str and Dex saves, you have Resistance to all damage, and you're immune to poison and disease."},
    "restrained":{term:"Restrained",def:"Your Speed is 0 and can't increase. Attack rolls against you have Advantage and your attack rolls have Disadvantage, and you have Disadvantage on Dexterity saving throws."},
    "stunned":{term:"Stunned",def:"You're Incapacitated, can't move, and can speak only falteringly. You auto-fail Strength and Dexterity saves, and attack rolls against you have Advantage."},
    "unconscious":{term:"Unconscious",def:"You're Incapacitated, can't move or speak, and are unaware of your surroundings. You drop what you're holding and fall Prone. You auto-fail Str and Dex saves; attacks against you have Advantage; any hit from within 5 feet is a critical hit."},
    "difficult-terrain":{term:"Difficult Terrain",def:"Each foot of movement through Difficult Terrain costs 1 extra foot (rubble, deep snow, a creature's space, etc.), so it takes twice the movement to cross."},
    "sk-athletics":{term:"Athletics",def:"A Strength skill for climbing, jumping, swimming, and grappling or shoving."},
    "sk-acrobatics":{term:"Acrobatics",def:"A Dexterity skill for keeping your balance, tumbling, and staying on your feet."},
    "sk-sleight":{term:"Sleight of Hand",def:"A Dexterity skill for palming objects, picking pockets, and other manual trickery."},
    "sk-stealth":{term:"Stealth",def:"A Dexterity skill for moving silently and staying hidden from notice."},
    "sk-arcana":{term:"Arcana",def:"An Intelligence skill recalling lore about spells, magic items, and the planes."},
    "sk-history":{term:"History",def:"An Intelligence skill recalling lore about past events, people, and civilizations."},
    "sk-investigation":{term:"Investigation",def:"An Intelligence skill for studying clues, searching for hidden details, and reasoning things out."},
    "sk-nature":{term:"Nature",def:"An Intelligence skill recalling lore about terrain, plants, animals, and weather."},
    "sk-religion":{term:"Religion",def:"An Intelligence skill recalling lore about deities, rites, and holy symbols."},
    "sk-animal":{term:"Animal Handling",def:"A Wisdom skill for calming, controlling, or reading the intentions of animals."},
    "sk-insight":{term:"Insight",def:"A Wisdom skill for reading body language and sensing lies or true intentions."},
    "sk-medicine":{term:"Medicine",def:"A Wisdom skill for stabilizing the dying and diagnosing illness."},
    "sk-perception":{term:"Perception",def:"A Wisdom skill for noticing things with your senses; its passive value sets how alert you are."},
    "sk-survival":{term:"Survival",def:"A Wisdom skill for tracking, foraging, navigating, and enduring the wilds."},
    "sk-deception":{term:"Deception",def:"A Charisma skill for convincingly lying or hiding the truth."},
    "sk-intimidation":{term:"Intimidation",def:"A Charisma skill for influencing others through threats or a hostile presence."},
    "sk-performance":{term:"Performance",def:"A Charisma skill for entertaining an audience with music, acting, or storytelling."},
    "sk-persuasion":{term:"Persuasion",def:"A Charisma skill for influencing others with tact, charm, or good-faith argument."},
    "tool-artisans":{term:"Artisan's Tools",def:"A set of specialized tools for a single craft. Proficiency lets you add your Proficiency Bonus to ability checks made to use them, and often to checks where that craft's knowledge applies. You also need the tools on hand to do the work."},
    "tool-cartographers":{term:"Cartographer's Tools",def:"Quills, compasses, calipers, and rulers for making and reading maps. Proficiency adds your Proficiency Bonus to checks to draw an accurate map, determine where you are from one, or estimate distance, terrain, and travel time."},
    "tool-smiths":{term:"Smith's Tools",def:"Hammers, tongs, and a portable forge for working metal. Proficiency adds your Proficiency Bonus to checks to forge or repair metal gear and weapons, pry or bend metal, and judge the quality of metalwork."},
    "tool-calligraphers":{term:"Calligrapher's Supplies",def:"Inks, quills, and parchment for fine writing. Proficiency adds your Proficiency Bonus to checks to produce elegant documents, identify the hand behind a script, or detect a forgery."},
    "tool-gaming":{term:"Gaming Set",def:"A set for a game of chance or skill — dice, playing cards, or a board game. Proficiency adds your Proficiency Bonus to ability checks you make to play the game, to read your opponents, or to spot cheating."},
    "dmg-piercing":{term:"Piercing",def:"Physical damage from punctures and stabs — arrows, spears, a bite."},
    "dmg-slashing":{term:"Slashing",def:"Physical damage from cuts and slices — swords, axes, claws."},
    "dmg-bludgeoning":{term:"Bludgeoning",def:"Physical damage from blunt force — hammers, clubs, a slam, or a fall."},
    "wp-ammunition":{term:"Ammunition",def:"This weapon needs ammunition (arrows, bolts, needles) to make a ranged attack; each shot spends one piece. After a fight you can recover half the ammunition you fired."},
    "wp-finesse":{term:"Finesse",def:"When you attack with a Finesse weapon you choose Strength or Dexterity for both the attack and the damage roll — most characters use Dexterity."},
    "wp-heavy":{term:"Heavy",def:"A Heavy weapon is large and unwieldy: you attack with Disadvantage unless your Strength (for a melee weapon) or Dexterity (for a ranged one) is at least 13."},
    "wp-light":{term:"Light",def:"A Light weapon is easy to wield in one hand. When you take the Attack action with one, you can also attack with a different Light weapon in your other hand as a Bonus Action."},
    "wp-loading":{term:"Loading",def:"You can fire only one piece of ammunition from a Loading weapon when you take the Attack action, no matter how many attacks you could otherwise make."},
    "wp-range":{term:"Range",def:"Ranged and thrown weapons list two distances, e.g. 80/320: the normal range and the long range in feet. Past the normal range you attack with Disadvantage; you can't hit a target beyond the long range."},
    "wp-thrown":{term:"Thrown",def:"You can throw this weapon to make a ranged attack, using the same ability modifier you'd use to attack with it in melee. Its two numbers (e.g. 20/60) are its normal and long range in feet."},
    "wp-twohanded":{term:"Two-Handed",def:"This weapon takes two hands to attack with, so you can't also hold a shield or a second weapon while you attack with it."},
    "wp-versatile":{term:"Versatile",def:"You can wield this weapon with one or two hands. The die in parentheses (e.g. 1d10) is the damage when you use two hands."},
    "armor-light":{term:"Light Armor",def:"The lightest armor — padded, leather, or studded leather. Your AC is its base value plus your full Dexterity modifier."},
    "armor-medium":{term:"Medium Armor",def:"Hide, chain shirt, scale mail, breastplate, or half plate. Your AC is its base value plus your Dexterity modifier, capped at +2."},
    "armor-heavy":{term:"Heavy Armor",def:"The heaviest armor — ring mail, chain mail, splint, or plate. It sets your AC outright with no Dexterity bonus, and some types need a minimum Strength."}
  };
  var ALIASES = {
    "advantage":"advantage","disadvantage":"disadvantage",
    "bonus action":"bonus-action",
    "magic action":"magic-action",
    "short rest":"short-rest","long rest":"long-rest",
    "prone":"prone","prone condition":"prone",
    "saving throw":"saving-throw","saving throws":"saving-throw","save":"saving-throw","saves":"saving-throw",
    "ability check":"ability-check","ability checks":"ability-check","check":"ability-check","checks":"ability-check",
    "ability score":"ability-score","ability scores":"ability-score","ability modifier":"ability-score",
    "initiative":"initiative",
    "proficiency bonus":"proficiency-bonus",
    "tremorsense":"tremorsense","darkvision":"darkvision",
    "bright light":"bright-light","dim light":"dim-light",
    "resistance":"resistance","resist":"resistance",
    "poisoned":"poisoned","poisoned condition":"poisoned",
    "extra attack":"extra-attack",
    "magic weapon":"magic-weapon","magical":"magic-weapon",
    "armor class":"armor-class","ac":"armor-class",
    "cantrip":"cantrip","cantrips":"cantrip",
    "spell slot":"spell-slot","spell slots":"spell-slot","slot":"spell-slot","slots":"spell-slot",
    "concentration":"concentration","concentrate":"concentration","concentrating":"concentration",
    "dc":"dc","difficulty class":"dc",
    "reaction":"reaction","opportunity attack":"opportunity-attack","disengage":"disengage",
    "blinded":"blinded","charmed":"charmed","deafened":"deafened","exhaustion":"exhaustion","frightened":"frightened",
    "grappled":"grappled","incapacitated":"incapacitated","invisible":"invisible","paralyzed":"paralyzed","petrified":"petrified",
    "restrained":"restrained","stunned":"stunned","unconscious":"unconscious","difficult terrain":"difficult-terrain",
    "athletics":"sk-athletics","acrobatics":"sk-acrobatics","sleight of hand":"sk-sleight","stealth":"sk-stealth",
    "arcana":"sk-arcana","history":"sk-history","investigation":"sk-investigation","nature":"sk-nature","religion":"sk-religion",
    "animal handling":"sk-animal","insight":"sk-insight","medicine":"sk-medicine","perception":"sk-perception","survival":"sk-survival",
    "deception":"sk-deception","intimidation":"sk-intimidation","performance":"sk-performance","persuasion":"sk-persuasion",
    "artisan's tools":"tool-artisans","artisans tools":"tool-artisans","artisan's tool":"tool-artisans",
    "cartographer's tools":"tool-cartographers","cartographers tools":"tool-cartographers",
    "smith's tools":"tool-smiths","smiths tools":"tool-smiths",
    "calligrapher's supplies":"tool-calligraphers","calligraphers supplies":"tool-calligraphers",
    "gaming set":"tool-gaming","gaming sets":"tool-gaming",
    "piercing":"dmg-piercing","slashing":"dmg-slashing","bludgeoning":"dmg-bludgeoning",
    "ammunition":"wp-ammunition","finesse":"wp-finesse","heavy":"wp-heavy","loading":"wp-loading",
    "range":"wp-range","thrown":"wp-thrown","two-handed":"wp-twohanded","two-handed weapon":"wp-twohanded","versatile":"wp-versatile",
    "light armor":"armor-light","medium armor":"armor-medium","heavy armor":"armor-heavy"
  };
  function escapeRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }
  var aliasAlt = Object.keys(ALIASES).sort(function(a,b){return b.length-a.length;}).map(escapeRe).join("|");
  var diceAlt  = "\\d*d(?:100|20|12|10|8|6|4)";
  var TERM_RE  = new RegExp("\\b(?:"+aliasAlt+"|"+diceAlt+")\\b","gi");
  function termKey(matched){
    var raw=matched.toLowerCase();
    if(ALIASES[raw]) return ALIASES[raw];
    var dm=raw.match(/^\d*d(100|20|12|10|8|6|4)$/);
    return dm ? "die-"+dm[1] : null;
  }
  var glossExpanded = null;

  function linkifyTerms(root){
    var walker=document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), targets=[], n;
    while(n=walker.nextNode()){
      if(n.parentNode && n.parentNode.classList && n.parentNode.classList.contains("gloss-term")) continue;
      TERM_RE.lastIndex=0;
      if(TERM_RE.test(n.nodeValue)) targets.push(n);
    }
    targets.forEach(function(node){
      var text=node.nodeValue, frag=document.createDocumentFragment(), last=0, m;
      TERM_RE.lastIndex=0;
      while(m=TERM_RE.exec(text)){
        if(m.index>last) frag.appendChild(document.createTextNode(text.slice(last,m.index)));
        var key=termKey(m[0]);
        if(key){
          var btn=document.createElement("button");
          btn.type="button"; btn.className="gloss-term"; btn.textContent=m[0];
          btn.setAttribute("data-term", key);
          frag.appendChild(btn);
        } else {
          frag.appendChild(document.createTextNode(m[0]));
        }
        last=m.index+m[0].length;
      }
      if(last<text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
  }
  function resetGlossary(){ dieAnims.forEach(function(a){a.stop();}); dieAnims=[]; refGlossary.innerHTML=""; glossExpanded=new Set(); }
  function expandTerm(key){
    var g=GLOSSARY[key]; if(!g) return;
    if(glossExpanded.has(key)){
      var ex=refGlossary.querySelector('[data-gd="'+key+'"]');
      if(ex){ ex.scrollIntoView({block:"nearest"}); ex.classList.add("flash"); setTimeout(function(){ ex.classList.remove("flash"); },600); }
      return;
    }
    glossExpanded.add(key);
    var box=document.createElement("div"); box.className="gloss-def"; box.setAttribute("data-gd",key);
    var h=document.createElement("span"); h.className="gd-term"; h.textContent=g.term; box.appendChild(h);
    var b=document.createElement("div"); b.className="gd-body"; b.textContent=g.def;
    if(g.die){
      var row=document.createElement("div"); row.className="gd-row";
      var fig=document.createElement("div"); fig.className="die-wrap";
      var canvas=document.createElement("canvas"); canvas.className="die-canvas"; fig.appendChild(canvas);
      row.appendChild(fig); row.appendChild(b); box.appendChild(row);
      refGlossary.appendChild(box);
      startDie(canvas, g.die);
    } else {
      box.appendChild(b);
      refGlossary.appendChild(box);
    }
    linkifyTerms(b);
    box.scrollIntoView({block:"nearest"});
  }
  refOverlay.addEventListener("click", function(e){
    var t=e.target.closest(".gloss-term"); if(!t) return;
    e.stopPropagation();
    if(t.hasAttribute("data-ref")){ openRef(t.getAttribute("data-ref"), t); return; }   // inline ref-link: open that entry
    expandTerm(t.getAttribute("data-term"));
  });

  function openAC(trigger){
    resetGlossary();
    lastTrigger=trigger||null; currentRefPool=null;
    refTitle.textContent="Armor Class";
    refChips.innerHTML=""; refChips.style.display="none";
    refDice.style.display="block";
    refBody.innerHTML="";
    var intro=document.createElement("p"); intro.className="muted";
    intro.textContent="Toggle gear to see how your AC changes."; refBody.appendChild(intro);
    AC_PARTS.forEach(function(p){
      var btn=document.createElement("button"); btn.type="button"; btn.className="ac-toggle";
      btn.innerHTML='<span class="acbox">✓</span><span class="acname">'+p.label+'</span><span class="acnote">'+p.note+'</span>';
      btn.addEventListener("click", function(){
        state.ac[p.id]=!state.ac[p.id];
        persist(); renderACStud(); paintAC();
      });
      refBody.appendChild(btn);
    });
    refFoot.innerHTML='<span class="uses-left" id="acBreak"></span>';
    paintAC();
    refOverlay.classList.add("show");
    document.getElementById("refClose").focus();
  }
  function paintAC(){
    refDice.textContent = "AC " + computeAC(state.ac);
    var btns=refBody.querySelectorAll(".ac-toggle");
    AC_PARTS.forEach(function(p,i){
      var b=btns[i]; if(!b) return;
      b.classList.toggle("on", !!state.ac[p.id]);
      // Defense only functions while wearing armor — show it inactive otherwise
      b.classList.toggle("inactive", p.id==="defense" && !state.ac.armor);
    });
    var brk=document.getElementById("acBreak"); if(brk) brk.textContent=acBreakdown(state.ac);
  }
