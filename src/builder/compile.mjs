/* Node entry point for the compile spine: loads the content catalogs from disk
   and delegates to the pure core (compile-core.mjs). Keeps the golden-test CLI.
   The browser viewer inlines compile-core.mjs with catalogs passed in instead. */
import fs from "fs";
import path from "path";
import url from "url";
import { compile as core, views } from "./compile-core.mjs";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const CONTENT = path.join(HERE, "..", "content");
const load = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return {}; } };
const CAT = {
  feats: load(path.join(HERE, "feats.json")),
  spells: load(path.join(CONTENT, "spells.json")),
  species: load(path.join(CONTENT, "species.json")),
  backgrounds: load(path.join(CONTENT, "backgrounds.json")),
  weapons: load(path.join(CONTENT, "weapons.json")),
  armor: load(path.join(CONTENT, "armor.json")),
};

export function compile(input){ return core(input, CAT); }
export { views };

/* ---- golden test CLI: node compile.mjs --check <golden.json> <character.json>… ---- */
function norm(v){ if (Array.isArray(v)) return v.map(norm); if (v && typeof v === "object"){ const o={}; Object.keys(v).sort().forEach(k => o[k]=norm(v[k])); return o; } return v; }
const eq = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

if (process.argv[2] === "--check"){
  const golden = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
  let ok = true;
  for (const f of process.argv.slice(4)){
    const c = compile(JSON.parse(fs.readFileSync(f, "utf8")));
    const v = views(c), g = golden[c.name];
    console.log("\n=== " + c.name + " ===");
    if (!g){ console.log("  (no golden entry)"); ok = false; continue; }
    for (const k of Object.keys(g)){ const good = eq(v[k], g[k]); if (!good) ok = false; console.log("  " + (good?"✓":"✗") + " " + k + (good ? "" : "\n    golden: " + JSON.stringify(g[k]) + "\n    got:    " + JSON.stringify(v[k]))); }
  }
  console.log("\n" + (ok ? "COMPILE MATCHES GOLDEN ✓" : "DRIFT FROM GOLDEN ✗"));
  process.exit(ok ? 0 : 1);
}
