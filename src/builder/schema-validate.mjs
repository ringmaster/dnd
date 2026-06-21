/* Validate a character SOURCE object against character-schema.json.
 * Returns { errors:[...], unknown:[...] }. Pure; the builder can inline it later.
 *
 * CLI: node src/builder/schema-validate.mjs src/characters/*.json
 */
import fs from "fs";
import path from "path";
import url from "url";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
export const SCHEMA = JSON.parse(fs.readFileSync(path.join(HERE, "character-schema.json"), "utf8"));

const jtype = (v) => Array.isArray(v) ? "array" : v === null ? "null" : typeof v;

function resolve(spec, schema) {
  // follow a `ref` to a def, merging any local overrides (required, desc)
  if (spec && spec.ref) {
    const d = schema.defs[spec.ref];
    if (!d) return spec;
    return Object.assign({}, d, { required: spec.required, desc: spec.desc || d.desc });
  }
  return spec;
}

function typeOk(spec, v) {
  const types = Array.isArray(spec.type) ? spec.type : [spec.type];
  const t = jtype(v);
  for (const want of types) {
    if (want === "dice" && t === "string") return true;
    if (want === "enum") return spec.enum.indexOf(v) >= 0;
    if (want === "map" && t === "object") return true;
    if (want === "variant" && t === "object") return true;
    if (want === t) return true;
  }
  return false;
}

export function validate(ch, schema = SCHEMA) {
  const errors = [], unknown = [];
  function walk(spec, v, pathStr) {
    spec = resolve(spec, schema);
    if (!spec || !spec.type) return;
    if (v === null && !spec.required) return;   // explicit null = "no value"; fine for optional fields
    if (!typeOk(spec, v)) {
      errors.push(`${pathStr}: expected ${Array.isArray(spec.type) ? spec.type.join("|") : spec.type}${spec.enum ? " (" + spec.enum.join("/") + ")" : ""}, got ${jtype(v)}`);
      return;
    }
    const t = jtype(v);
    if (t === "object") {
      if (spec.type === "variant") {
        const tag = v[spec.on];
        const variant = (spec.variants || {})[tag];
        if (!variant) { errors.push(`${pathStr}.${spec.on}: unknown variant '${tag}'`); return; }
        checkFields(Object.assign({ [spec.on]: { type: "string" } }, variant.fields || {}), v, pathStr);
      } else if (spec.type === "map") {
        for (const k in v) walk(spec.values || { type: "string" }, v[k], `${pathStr}.${k}`);
      } else if (spec.fields) {
        checkFields(spec.fields, v, pathStr);
      }
    } else if (t === "array" && spec.items) {
      v.forEach((it, i) => walk(spec.items, it, `${pathStr}[${i}]`));
    }
  }
  function checkFields(fields, v, pathStr) {
    for (const key in fields) {
      const fspec = resolve(fields[key], schema);
      if (v[key] === undefined) {
        if (fspec.required) errors.push(`${pathStr}.${key}: required field missing`);
        continue;
      }
      walk(fields[key], v[key], `${pathStr}.${key}`);
    }
    for (const key in v) if (!(key in fields)) unknown.push(`${pathStr}.${key}`);
  }
  checkFields(schema.root, ch, "");
  return { errors, unknown };
}

// ---- CLI ----
if (process.argv[1] && process.argv[1].endsWith("schema-validate.mjs")) {
  let bad = 0;
  for (const f of process.argv.slice(2)) {
    const ch = JSON.parse(fs.readFileSync(f, "utf8"));
    const { errors, unknown } = validate(ch);
    console.log(`\n=== ${ch.name || f} ===`);
    if (errors.length) { bad++; errors.forEach((e) => console.log("  ✗ " + e)); }
    else console.log("  ✓ valid");
    if (unknown.length) console.log("  · unknown fields (not in schema): " + unknown.join(", "));
  }
  console.log("\n" + (bad ? bad + " character(s) FAILED schema" : "ALL CHARACTERS MATCH THE SCHEMA ✓"));
  process.exit(bad ? 1 : 0);
}
