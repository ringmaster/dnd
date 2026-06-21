/* Generate a human-readable Markdown field reference from character-schema.json.
 * Run: node src/builder/schema-docs.mjs   (writes CHARACTER_FORMAT.md)
 */
import fs from "fs";
import path from "path";
import url from "url";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const schema = JSON.parse(fs.readFileSync(path.join(HERE, "character-schema.json"), "utf8"));

const esc = (s) => String(s == null ? "" : s).replace(/\|/g, "\\|");

function typeLabel(spec) {
  if (!spec) return "any";
  if (spec.ref) return `[${spec.ref}](#${spec.ref})`;
  const t = spec.type;
  if (Array.isArray(t)) return t.join(" or ");
  if (t === "enum") return "enum: " + (spec.enum || []).join(" / ");
  if (t === "array") return "array of " + typeLabel(spec.items);
  if (t === "map") return "map of " + typeLabel(spec.values);
  if (t === "variant") return "one of: " + Object.keys(spec.variants || {}).join(", ");
  if (t === "dice") return "dice string (e.g. `1d8+2`)";
  return t || "any";
}

function fieldsTable(fields) {
  const rows = ["| Field | Type | Notes |", "|---|---|---|"];
  for (const k of Object.keys(fields)) {
    const f = fields[k];
    const flags = [];
    if (f.required) flags.push("**required**");
    if (f.derived) flags.push("_derived_");
    const notes = esc(f.desc || "") + (flags.length ? " " + flags.join(", ") : "");
    rows.push(`| \`${k}\` | ${esc(typeLabel(f))} | ${notes.trim()} |`);
  }
  return rows.join("\n");
}

const md = [];
md.push(`# Character Format (schema v${schema.version})`, "");
md.push("> Generated from `src/builder/character-schema.json` by `npm run schema:docs`. Do not edit by hand.", "");
md.push(schema.note, "");
md.push("## Top-level fields", "", fieldsTable(schema.root), "");

// inline (non-ref) object fields at the root get their own sub-section
for (const k of Object.keys(schema.root)) {
  const f = schema.root[k];
  if (f.type === "object" && f.fields) {
    md.push("", `### \`${k}\``, "", esc(f.desc || ""), "", fieldsTable(f.fields));
  }
}

md.push("", "## Definitions", "", "Reusable shapes referenced above.", "");
for (const dn of Object.keys(schema.defs)) {
  const d = schema.defs[dn];
  md.push("", `### ${dn}`, "", esc(d.desc || ""));
  if (d.type === "variant") {
    md.push("", `Tagged union selected by \`${d.on}\`. Variants:`, "");
    for (const vn of Object.keys(d.variants)) {
      const vf = Object.keys(d.variants[vn].fields || {});
      md.push(`- **${vn}**` + (vf.length ? " — fields: " + vf.map((x) => "`" + x + "`").join(", ") : " — _(no extra fields)_"));
    }
  } else if (d.fields) {
    md.push("", fieldsTable(d.fields));
  } else {
    md.push("", "Type: " + esc(typeLabel(d)));
  }
}

const out = path.join(ROOT, "CHARACTER_FORMAT.md");
fs.writeFileSync(out, md.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n");
console.log("wrote " + path.relative(ROOT, out) + " (" + Object.keys(schema.root).length + " top-level fields, " + Object.keys(schema.defs).length + " defs)");
