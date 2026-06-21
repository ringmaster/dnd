# Character Format (schema v1)

> Generated from `src/builder/character-schema.json` by `npm run schema:docs`. Do not edit by hand.

Describes the character SOURCE format (the JSON in src/characters/ and what the builder exports). A field spec is { type, desc, required?, derived?, fields?, items?, values?, enum?, ref?, example? }. type ∈ string|number|boolean|dice|enum|object|array|map|variant. 'map' = object with arbitrary keys (values spec applies to each); 'variant' = tagged union selected by `on` field. 'derived' fields are computed by compile() and need not be authored.

## Top-level fields

| Field | Type | Notes |
|---|---|---|
| `id` | string | Slug used for storage and filenames. **required** |
| `out` | string | Output HTML filename, e.g. 'kaeral_vance.html'. **required** |
| `name` | string | Character name. **required** |
| `subtitle` | string | Species · Class · Subclass · Lvl line under the name. |
| `title` | string | HTML <title> / share title. |
| `footer` | string | Footer label. |
| `portrait` | string | Portrait image filename (embedded at build if present). |
| `storageKey` | string | localStorage key for runtime sheet state. |
| `level` | number | Total character level. **required** |
| `hitDie` | [dieType](#dieType) | Single-class hit die. |
| `hitDice` | array of object | Multiclass hit dice, merged by die type. |
| `proficiencyBonus` | number | Computed from level if omitted. _derived_ |
| `saves` | array of [ability](#ability) | Saving-throw proficiencies. **required** |
| `speed` | number | Walking speed in feet. |
| `ac` | object | Armor/shield/style the character owns; what's worn is chosen on the sheet. |
| `hp` | object | **required** |
| `masteryMax` | number | Number of weapon masteries the character has. |
| `masteryDefault` | array of string | Default-mastered weapon ids. |
| `studs` | array of [stud](#stud) | Header stat studs. |
| `weapons` | array of [weapon](#weapon) | Owned/known weapons. |
| `rest` | object | Rest-modal copy. |
| `cards` | array of [card](#card) | Ordered sheet cards. **required** |
| `ref` | map of [ref](#ref) | Reference modals keyed by refId. Largely materialized by compile() from sources; authored entries supplement them. |
| `pools` | map of [pool](#pool) | Resource pools keyed by id. Usually derived from source grantsPool; may be authored. |
| `hitRiders` | array of object | On-hit damage riders shown in the attack view. |
| `riderHead` | string | Heading shown above the hit riders. |
| `checkModNote` | map of string | Ability → note explaining a bonus to that ability's checks. |
| `bespoke` | boolean | Hand-authored, not-necessarily-RAW. Waives legality; shows a banner. |
| `homebrew` | boolean | Allowed-illegal build. Waives legality; shows a banner. |
| `homebrewNote` | string | Optional explanation shown on the bespoke/homebrew banner. |
| `identity` | object | Stamped by compile() (species/class/subclass/background/classes). _derived_ |
| `combat` | object | Combat-mode block derived by compile() from weapons + pools + features. _derived_ |
| `build` | [build](#build) | **required** |

### `ac`

Armor/shield/style the character owns; what's worn is chosen on the sheet.

| Field | Type | Notes |
|---|---|---|
| `armor` | string or object | Default-worn armor: a catalog armor id, or a full block. |
| `armory` | array of string | Owned armor ids (first = default). |
| `shield` | object |  |
| `style` | object | Fighting-style AC bonus (Defense). |
| `unarmored` | object | Unarmored Defense (Monk/Barbarian). |

### `hp`

| Field | Type | Notes |
|---|---|---|
| `max` | number | Maximum hit points. **required** |

### `rest`

Rest-modal copy.

| Field | Type | Notes |
|---|---|---|
| `short` | array of string |  |
| `long` | array of string |  |
| `shortToast` | string |  |
| `longToast` | string |  |

## Definitions

Reusable shapes referenced above.

### ability

An ability score code.

Type: enum: STR / DEX / CON / INT / WIS / CHA

### dieType

A polyhedral die.

Type: enum: d4 / d6 / d8 / d10 / d12 / d20

### restKind

Which rest recharges a resource.

Type: enum: short / long

### chip

A small tag rendered on a card or ref modal.

| Field | Type | Notes |
|---|---|---|
| `t` | string | Tag text. **required** |
| `c` | enum: ember / storm | Optional accent color (ember = offense/emphasis, storm = defense/utility). |

### ref

A reference-modal entry (tapping a feature/weapon/spell opens this). Keyed by refId in the top-level `ref` map.

| Field | Type | Notes |
|---|---|---|
| `title` | string | Modal heading. **required** |
| `body` | array of string | Paragraphs of rules text. Glossary terms auto-linkify. **required** |
| `dice` | string | A roll/summary line shown under the title, e.g. 'To hit: d20 +5 · 1d8+3'. |
| `chips` | array of [chip](#chip) | Tags shown under the title. |
| `level` | number | Spell level (spell refs only). |
| `pool` | string | Id of a resource pool this ref spends. |
| `concentration` | string | If set, casting this requires Concentration (value is the spell name). |

### weapon

A carried or known weapon. May reference a catalog weapon by id, or be fully inline.

| Field | Type | Notes |
|---|---|---|
| `id` | string | Catalog weapon id (e.g. 'longsword'); inherits its stats. |
| `name` | string | Display name (for inline/custom weapons). |
| `carried` | boolean | Owned/drawn by the character. |
| `ability` | enum: STR / DEX / CON / INT / WIS / CHA / FIN | Attack ability; FIN = Finesse (best of STR/DEX). |
| `dmgDice` | dice string (e.g. `1d8+2`) | Base damage dice, e.g. '1d8'. |
| `props` | array of string | Weapon properties/keywords, e.g. ['slashing','finesse','thrown 20/60']. |
| `atkBonus` | number | Flat bonus to attack rolls (magic, Archery, etc.). |
| `dmgBonus` | number | Flat bonus to damage. |
| `addProps` | array of string | Extra props layered onto a catalog weapon. |
| `ref` | string | refId for this weapon's detail modal. |

### stud

A header stat 'stud' (AC, Init, Speed, etc.).

| Field | Type | Notes |
|---|---|---|
| `ref` | string | Built-in stat ref id, e.g. 'stat_ac'. **required** |
| `label` | string | Short label. **required** |
| `id` | string | DOM id for live updates (e.g. 'acVal'). |

### pool

A spendable resource (Ki, Channel Divinity, spell slots, …). Tracked on the sheet.

| Field | Type | Notes |
|---|---|---|
| `id` | string | Pool id (the map key; present on source grantsPool blocks). |
| `label` | string | Display name. **required** |
| `max` | number or string | Maximum uses (a number; in source grantsPool it may be the string 'prof'). **required** |
| `rest` | [restKind](#restKind) | **required** |
| `ref` | string | refId of the modal explaining this resource. |
| `storm` | boolean | Render with the storm (defensive/utility) accent. |
| `note` | string | Short recharge note. |
| `use` | string | Spend-button label. |
| `reminder` | string | Toast/reminder text when spent. |
| `slotLevel` | number | Spell-slot level (slot pools only). |

### source

A declarative build source: a feat/feature/proficiency the builder emits and compile() materializes. Lives in build.sources.

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable identifier for this source. **required** |
| `name` | string | Human label. |
| `include` | string | Resolve from a catalog: 'background:<id>', 'species:<id>:<trait>', or 'class:<cls>:<Feature>'. |
| `effects` | [effects](#effects) | Mechanical grants. |
| `grantsFeat` | string | Feat id this source grants (origin/ASI feat). |
| `refId` | string | Key under which `ref` is materialized. |
| `ref` | [ref](#ref) | Inline reference modal for this source. |

### effects

Mechanical grants attached to a source/feature.

| Field | Type | Notes |
|---|---|---|
| `skills` | array of string | Skill proficiencies granted. |
| `expertise` | array of string | Skills gaining Expertise. |
| `tools` | array of string | Tool proficiencies. |
| `language` | array of string | Languages known. |
| `abilityIncrease` | map of number | Ability → bonus (background +2/+1). |
| `checkBonus` | map of string | Ability → bonus expression (e.g. CHA → 'wisMod'). |
| `initiativeBonus` | string | Initiative bonus, often 'prof'. |
| `alwaysPrepared` | array of object | Spells always prepared (don't count against limits). |
| `grantsPool` | [pool](#pool) | A resource pool granted (pool gets an `id`). |
| `spellcasting` | object | Confers spellcasting. On a class feature it's a marker (ability/progression/list); on the builder's 'spellcasting' source it's the full materialized block (ability + slots/cantrips/prepared). |

### card

A card rendered on the sheet, selected by its `type`.

Tagged union selected by `type`. Variants:

- **abilities** — _(no extra fields)_
- **hitpoints** — _(no extra fields)_
- **skills** — _(no extra fields)_
- **attacks** — fields: `extras`
- **spellcasting** — _(no extra fields)_
- **pools** — fields: `title`, `hint`, `pools`, `extras`
- **inventory** — fields: `items`, `magic`
- **features** — fields: `title`, `list`
- **background** — fields: `hint`, `paras`
- **buildlog** — fields: `title`, `hint`, `levels`

### build

Authoring metadata: declarative choices compile() expands into the sheet. Stripped from the shipped CHARACTER (kept as CHARACTER_SOURCE for editing).

| Field | Type | Notes |
|---|---|---|
| `species` | string | Species id. **required** |
| `background` | string | Background id. **required** |
| `class` | string | Single-class: class id. |
| `subclass` | string | Single-class: subclass id. |
| `classes` | array of object | Multiclass: one entry per class. |
| `abilities` | map of number | Base ability scores (pre-background/ASI), keyed by ability code. **required** |
| `sources` | array of [source](#source) | The declarative grants. **required** |
