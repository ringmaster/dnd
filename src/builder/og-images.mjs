/* Build-time generator for Open Graph share images (1200x630 PNG per
   character) used by link previews on SMS/iMessage, Slack, Discord, etc.
   These crawlers don't run JS and won't render SVG, so we rasterize a
   themed composite — portrait + name + species/subclass/level — to PNG.

   This is the ONE part of the build that needs a dependency (@resvg/resvg-js).
   It is deliberately separate from `node src/build.mjs` (which stays
   zero-dependency); CI runs it as its own step after `npm ci`.

   Run: node src/builder/og-images.mjs   (after `npm install`) */
import fs from "fs";
import path from "path";
import { Resvg } from "@resvg/resvg-js";
import { compile } from "./compile.mjs";
import { ROOT, FONTS, ogTitle, portraitDataUri } from "./share.mjs";

const SRC = path.join(ROOT, "src");
const OUT = path.join(ROOT, "docs", "og");
const CINZEL = path.join(FONTS, "Cinzel-Bold.ttf");
const SPECTRAL = path.join(FONTS, "Spectral-Regular.ttf");

const W = 1200, H = 630;
const PS = 500, PX = 60, PY = (H - PS) / 2;        // portrait frame
const RX = 610, RW = W - RX - 70;                   // right text column

const EMBER = "#e7b466", BONE = "#d9d4c8", ASH = "#9aa0ab", PANEL = "#11141a";

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* Cheap width estimate so long names/subtitles shrink to fit the column.
   Cinzel (display caps) runs wide; Spectral (body serif) narrower. */
function fitSize(text, max, family, startPx, minPx) {
  const k = family === "Cinzel" ? 0.62 : 0.52;
  let px = startPx;
  while (px > minPx && text.length * px * k > max) px -= 2;
  return px;
}

/* Split a subtitle like "Dwarf · Battle Master · Lvl 4" into up to two lines
   on the middle separator when it's long, so it never overruns the card. */
function subtitleLines(sub) {
  if (!sub) return [];
  const parts = sub.split(" · ");
  if (parts.length <= 2 || sub.length <= 30) return [sub];
  const mid = Math.ceil(parts.length / 2);
  return [parts.slice(0, mid).join(" · "), parts.slice(mid).join(" · ")];
}

function initials(name) {
  return (name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function portraitSvg(data) {
  const uri = portraitDataUri(data);
  if (uri) {
    return '<image href="' + uri + '" x="' + PX + '" y="' + PY + '" width="' + PS + '" height="' + PS +
      '" preserveAspectRatio="xMidYMid slice" clip-path="url(#pc)"/>';
  }
  // placeholder: initials on a panel
  return '<rect x="' + PX + '" y="' + PY + '" width="' + PS + '" height="' + PS + '" rx="18" fill="' + PANEL + '"/>' +
    '<text x="' + (PX + PS / 2) + '" y="' + (PY + PS / 2 + 60) + '" text-anchor="middle" font-family="Cinzel" font-weight="700" font-size="180" fill="#3a4150">' + esc(initials(ogTitle(data))) + '</text>';
}

function composeSvg(data) {
  const name = ogTitle(data);
  const nameSize = fitSize(name, RW, "Cinzel", 78, 44);
  const subLines = subtitleLines(data.subtitle || "");
  const subSize = fitSize(subLines[0] || "", RW, "Spectral", 40, 26);
  let ty = 250 - (subLines.length > 1 ? 20 : 0);
  const subTspans = subLines.map((ln, i) => '<text x="' + RX + '" y="' + (ty + 66 + i * (subSize + 14)) + '" font-family="Spectral" font-size="' + subSize + '" fill="' + BONE + '">' + esc(ln) + '</text>').join("");

  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
    '<defs>' +
    '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d0f13"/><stop offset="1" stop-color="#171b22"/></linearGradient>' +
    '<clipPath id="pc"><rect x="' + PX + '" y="' + PY + '" width="' + PS + '" height="' + PS + '" rx="18"/></clipPath>' +
    '</defs>' +
    '<rect width="' + W + '" height="' + H + '" fill="url(#bg)"/>' +
    '<rect x="14" y="14" width="' + (W - 28) + '" height="' + (H - 28) + '" rx="20" fill="none" stroke="#2a2f3a" stroke-width="2"/>' +
    portraitSvg(data) +
    '<rect x="' + PX + '" y="' + PY + '" width="' + PS + '" height="' + PS + '" rx="18" fill="none" stroke="' + EMBER + '" stroke-width="4"/>' +
    '<text x="' + RX + '" y="' + ty + '" font-family="Cinzel" font-weight="700" font-size="' + nameSize + '" fill="' + EMBER + '">' + esc(name) + '</text>' +
    subTspans +
    '<rect x="' + (RX + 2) + '" y="' + (ty + 66 + subLines.length * (subSize + 14) + 6) + '" width="120" height="4" rx="2" fill="' + EMBER + '"/>' +
    '<text x="' + RX + '" y="556" font-family="Cinzel" font-weight="700" font-size="26" fill="#6f7682" letter-spacing="2">D&amp;D 2024 · CHARACTER SHEET</text>' +
    '</svg>';
}

function render(svg) {
  const r = new Resvg(svg, {
    background: "#0d0f13",
    fitTo: { mode: "width", value: W },
    font: { loadSystemFonts: false, fontFiles: [CINZEL, SPECTRAL], defaultFontFamily: "Spectral" },
  });
  return r.render().asPng();
}

function main() {
  for (const f of [CINZEL, SPECTRAL]) {
    if (!fs.existsSync(f)) { console.error("Missing font: " + f); process.exit(1); }
  }
  fs.mkdirSync(OUT, { recursive: true });
  const files = fs.readdirSync(path.join(SRC, "characters")).filter((f) => f.endsWith(".json"));
  let n = 0;
  for (const cf of files) {
    let data = JSON.parse(fs.readFileSync(path.join(SRC, "characters", cf), "utf8"));
    data = compile(data);
    const png = render(composeSvg(data));
    fs.writeFileSync(path.join(OUT, data.id + ".png"), png);
    const has = portraitDataUri(data) ? "portrait" : "placeholder";
    console.log("og/" + data.id + ".png  (" + png.length + " bytes, " + has + ")");
    n++;
  }
  console.log("done — " + n + " share image(s).");
}

main();
