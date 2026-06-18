# D&D

A collection of characters and other D&D material for games I'm playing in (not running).

## Character Sheets

| Character | Sheet |
| --- | --- |
| Dain Stonebreaker — Battle Master Combat Sheet | [View](https://ringmaster.github.io/dnd/dain_stonebreaker.html) |
| Brynja Ashbow — Fey Wanderer Ranger Sheet | [View](https://ringmaster.github.io/dnd/brynja_ashbow.html) |
| Elias Thorn — Divination Wizard Sheet | [View](https://ringmaster.github.io/dnd/elias_thorn.html) |
| Tobin Bramblefoot — Life Cleric Sheet | [View](https://ringmaster.github.io/dnd/tobin_bramblefoot.html) |

> An index of all sheets is at [`https://ringmaster.github.io/dnd/`](https://ringmaster.github.io/dnd/), and a **[character builder](https://ringmaster.github.io/dnd/builder.html)** scaffolds a new character from the content catalogs (species, class, subclass, background, feats) with live derived stats.

> The links above point to the **rendered** pages served by GitHub Pages. The source lives in [`src/`](src/).

## How this repo is organized

- `src/` — **source** for the character sheets: a shared engine (`src/engine/`) and one data file per character (`src/characters/*.json`).
- `docs/` — **generated** self-contained HTML. This folder is **git-ignored** and produced by the build (locally or in CI); it is not committed. Edit `src/`, never `docs/`.

## Building the sheets

The sheets are built by a zero-dependency Node script that inlines the shared engine and a character's data into one self-contained file:

```sh
node src/build.mjs
```

This regenerates every `docs/*.html` from `src/characters/*.json`. The engine renders each card from an inlined `CHARACTER` object at load, and **derives** the combat math (to-hit, damage, crit, AC, passive Perception, saves, spell DC) from the character's inputs — so changing an ability score or proficiency updates the whole sheet. Each sheet also has a **Combat Mode** card: an action-economy view of your turn (Action / Bonus Action / Reaction / …) showing only currently-valid moves with their bonuses and enemy-facing DCs. State still saves to the browser's local storage.

Building locally is purely for preview — the output in `docs/` is git-ignored and won't be committed.

To add a character, drop a new `src/characters/<name>.json` (copy an existing one as a template) and rebuild.

## Publishing (GitHub Pages)

Publishing is automated by [`.github/workflows/pages.yml`](.github/workflows/pages.yml): on every push to `main` it runs `node src/build.mjs` and deploys the freshly built `docs/` to GitHub Pages. Nothing built is committed.

One-time setup — switch Pages to the Actions source:

1. Go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions** (not "Deploy from a branch").

After that, every push to `main` rebuilds and redeploys automatically. You can also trigger it manually from the **Actions** tab (the workflow has `workflow_dispatch`).
