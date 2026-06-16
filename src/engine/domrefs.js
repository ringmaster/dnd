/* Shared: DOM references for the static modal/footer shell (must load before glossary.js) */
var refOverlay=document.getElementById("refOverlay");
var refTitle=document.getElementById("refTitle"), refDice=document.getElementById("refDice"),
    refChips=document.getElementById("refChips"), refBody=document.getElementById("refBody"),
    refFoot=document.getElementById("refFoot"), refGlossary=document.getElementById("refGlossary");
var restOverlay=document.getElementById("restOverlay");
var toastEl=document.getElementById("toast"), toastT=null;
var sync=document.getElementById("sync"), syncText=document.getElementById("syncText");
var grid=document.getElementById("grid"), headerGrid=document.getElementById("headerGrid");
var lastTrigger=null, currentRefPool=null;
function toast(msg){ toastEl.textContent=msg; toastEl.classList.add("show"); clearTimeout(toastT); toastT=setTimeout(function(){ toastEl.classList.remove("show"); }, 2800); }
