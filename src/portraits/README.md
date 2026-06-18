# Character portraits

Drop a portrait image here named after the character's `id` (the `id` field in
`src/characters/<name>.json`). Square images look best — they're framed as a
square in the Background card and in the Open Graph share image.

| Character        | id                  | file to add                          |
| ---------------- | ------------------- | ------------------------------------ |
| Brynja Ashbow    | `brynja_ashbow`     | `src/portraits/brynja_ashbow.png`    |
| Dain Stonebreaker| `dain_stonebreaker` | `src/portraits/dain_stonebreaker.png`|
| Tobin Bramblefoot| `tobin_bramblefoot` | `src/portraits/tobin_bramblefoot.png`|
| Elias Thorn      | `elias_thorn`       | `src/portraits/elias_thorn.png`      |

`.png`, `.jpg`, `.jpeg`, and `.webp` are all accepted. To use a different
filename, set `"portrait": "myfile.png"` on the character JSON.

When a portrait is present:
- `node src/build.mjs` embeds it (base64) into the sheet's Background card, so
  the single-file sheet stays offline-capable.
- `node src/builder/og-images.mjs` composites it into the 1200×630 share image.

When it's absent, both fall back gracefully (no frame; a monogram placeholder
on the share image).
