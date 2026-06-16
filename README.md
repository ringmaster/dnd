# D&D

A collection of characters and other D&D material for games I'm playing in (not running).

## Character Sheets

| Character | Sheet |
| --- | --- |
| Dain Stonebreaker — Battle Master Combat Sheet | [View](https://ringmaster.github.io/dnd/dain_stonebreaker.html) |
| Brynja Ashbow — Fey Wanderer Ranger Sheet | [View](https://ringmaster.github.io/dnd/brynja_ashbow.html) |

> The links above point to the **rendered** pages served by GitHub Pages. The HTML source lives in [`docs/`](docs/).

## How this repo is organized

- `src/` — **source** for the character sheets: a shared engine (`src/engine/`) and one data file per character (`src/characters/*.json`).
- `docs/` — **generated** self-contained HTML, published via GitHub Pages at `https://ringmaster.github.io/dnd/<filename>`. These are build outputs; edit `src/`, not `docs/`.

## Building the sheets

The sheets are built by a zero-dependency Node script that inlines the shared engine and a character's data into one self-contained file:

```sh
node src/build.mjs
```

This regenerates every `docs/*.html` from `src/characters/*.json`. The engine renders each card from an inlined `CHARACTER` object at load, and **derives** the combat math (to-hit, damage, crit, AC, passive Perception, saves, spell DC) from the character's inputs — so changing an ability score or proficiency updates the whole sheet. Each sheet also has a **Combat Mode** card: an action-economy view of your turn (Action / Bonus Action / Reaction / …) showing only currently-valid moves with their bonuses and enemy-facing DCs. State still saves to the browser's local storage.

To add a character, drop a new `src/characters/<name>.json` (copy an existing one as a template) and rebuild.

## Publishing (GitHub Pages)

Pages is served from the `main` branch, `/docs` folder. To enable it (one-time):

1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Set branch to **`main`** and folder to **`/docs`**, then **Save**.

New pages added to `docs/` go live automatically after each push.
