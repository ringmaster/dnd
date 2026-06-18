/* Shared helpers for share/preview assets (Open Graph). Used by both the
   zero-dependency build (src/build.mjs) and the rasterizing OG image
   generator (src/builder/og-images.mjs), so the two never drift on where
   portraits live, the canonical site URL, or how the preview text reads. */
import fs from "fs";
import path from "path";
import url from "url";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..", "..");
export const PORTRAITS = path.join(ROOT, "src", "portraits");
export const FONTS = path.join(ROOT, "src", "fonts");

/* The published GitHub Pages origin. Absolute URLs are required: link-preview
   crawlers (iMessage, Slack, Twitter, …) can't resolve relative og:image paths. */
export const BASE_URL = "https://ringmaster.github.io/dnd/";

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };

/* Find a character's portrait file. An explicit `portrait` field wins;
   otherwise we look for <id>.<ext> in src/portraits. Returns null if none. */
export function findPortrait(data) {
  const tries = [];
  if (data.portrait) tries.push(path.isAbsolute(data.portrait) ? data.portrait : path.join(PORTRAITS, data.portrait));
  for (const ext of [".png", ".jpg", ".jpeg", ".webp"]) tries.push(path.join(PORTRAITS, (data.id || "") + ext));
  for (const p of tries) {
    if (p && fs.existsSync(p)) return { path: p, ext: path.extname(p).toLowerCase() };
  }
  return null;
}

export function portraitDataUri(data) {
  const f = findPortrait(data);
  if (!f) return null;
  const mime = MIME[f.ext] || "image/png";
  return "data:" + mime + ";base64," + fs.readFileSync(f.path).toString("base64");
}

export const ogTitle = (data) => data.name || data.title || "Character Sheet";
export function ogDesc(data) {
  return data.subtitle ? (data.subtitle + " — a D&D 2024 character sheet") : "A D&D 2024 character sheet.";
}
export const ogImageUrl = (data) => BASE_URL + "og/" + data.id + ".png";
export const ogPageUrl = (data) => BASE_URL + data.out;
