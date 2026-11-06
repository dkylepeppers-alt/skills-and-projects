# Game content files

Verified against **Engine v2.5.2**, commit `fc0333c3fe978cda5e0b919bd6faec985901704e`. Source parsers and routes below are authoritative; do not infer an import contract from a filename, changelog, design proposal or generic export envelope. These are data formats, with their own discriminators, rather than `.marinara.json` envelopes.

## Choose the format first

| Deliverable | File/document discriminator | Actual validator |
|---|---|---|
| Ruleset on its own | JSON with `schemaVersion: 1`, bare `id`, integer `version`, `resolution`, `sheet`, etc. | `parseRulesetDefinition` |
| Ruleset with external catalogs | `.ruleset.json`: `format: "marinara-ruleset"`, `version: 1`, `manifest`, `files` | Server `readRulesetPackageFile` |
| Creature art | `.creatures.json`, `creaturePackVersion: 1` | `parseCreaturePack` |
| Overworld/town/place tile art | `.tilepack.json`, `tilePackVersion: 1` (palette) or `2` (PNG sheets) | `parseTilePack`, plus server image cleaning for v2 |
| Battlefield/props/icons/portraits art | JSON with `boardPackVersion: 1` | `parseBoardPack` |
| Setting vocabulary kit | `.worldkit.json`, `format: "marinara-world-kit"`, `version: 1` | `readWorldKitFile` / `parseWorldKit` |
| Whole generated world | `.world.json`, `format: "marinara-world"`, `version: 2` (reader also accepts 1) | `readWorldFile` |
| Story script for one world | `storyVersion: 1`; embedded as top-level world-file `story` or saved through story routes | `checkStoryScript(game, input)` |

There is **no `.mruleset` format in this pinned source**. The portable ruleset package is plain JSON `.ruleset.json`, never a ZIP. A hierarchical `.world-map.json` from the World Maps Agent is also a different format from `.world.json`; see [maps.md](maps.md).

## Rulesets: data, catalogs, and manifests

Primary sources: [ruleset schema and semantic parser](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/schemas/ruleset.schema.ts), [author guide](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/docs/extending/writing-rulesets.md), [small 2d6 example](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/docs/examples/rulesets/ember-roads.json), [import/check routes](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/routes/game-rulesets.routes.ts).

Start from an example with the right resolution kind. Required root fields are `schemaVersion: 1`, `id`, `version`, `name`, `coverage`, `resolution`, `sheet`, `gm`; `rests` defaults to `[]`. Optional blocks include `edition`, `license`, `party`, `clocks`, `gmReference`, `catalogs`, `items`, `battle`, `combat`, `layers`. Root and declared nested objects are strict: do not invent formulas or keys.

- Bare ruleset ID: lowercase letters/digits joined by single hyphens, max 64. `engine-legacy` and `traditional` are reserved. The file carries the bare ID; the importer supplies `local/<id>` or repository-owner namespace.
- Ruleset `version` is an integer ≥1. Raise it whenever rules or catalogs change; a stored version cannot be rewritten with different content. Games pin the exact version/options. Raise `sheet.version` for layout changes; author supported `sheet.migrations` for moved values.
- Five resolution kinds exist: `dice-sum`, `dice-pool`, `dice-highest`, `roll-against`, `symbol-pool`. The Engine owns their math. Unsupported mechanics require Engine changes; rulesets contain no arbitrary code/expression evaluator.
- Sheet IDs generally start with a lowercase letter and use letters/digits/underscores. Skills, saves, fields, derived references, pools, tracks, rests and catalog references must actually exist and fit their declared types; `parseRulesetDefinition` checks these, beyond the editor JSON Schema.
- Prompt-facing text uses `promptSafeText`: one nonempty line, no control characters, square brackets, `{{` or `}}`. Individual caps differ; `name` ≤80, `edition` ≤160, `gmReference` ≤16,000. Do not apply prose multiline assumptions to these fields.
- Ruleset text ≤512 KiB; a saved character-sheet envelope ≤64 KiB. Up to 12 catalogs, each ≤2,000 entries; external catalog file ≤2 MiB. Up to 12 layers; they narrow declared options/add guidance rather than adding new sheet fields or changing resolution kind.
- `$comment` is stripped from any object and root `$schema` before the standalone ruleset schema parses. This does not make arbitrary other metadata valid. The packaged reader has tighter annotation rules below.

Catalog declarations can contain inline `entries` or name their external `asset` (`catalogs/<id>.json`); external files hold `{ schemaVersion: 1, catalog: "<declared catalog id>", entries: [...] }`. A catalog can also borrow from an installed ruleset using `from:{ruleset,catalog,sheet?}` (API ≥1.220), optionally remapping sheet IDs and adding/replacing inline entries; this remains a dependency, not embedded borrowed content. Validate through `parseRulesetCatalogFile(definition, catalogId, document)` and whole-package checks, including cross-catalog creature spellcasting, amends and conjured weapons. A ruleset on its own does not bring missing external catalogs with it.

### A capability manifest is not a ruleset definition

The package's `manifest` uses [capabilityPackageManifestSchema](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/schemas/capability-package.schema.ts). It describes compatibility, contributors, assets and hashes. Its `version` is semver text, unlike the ruleset's integer version. A v2 manifest adds `capabilityApi: {major, minor}` and `builtAgainst: {engineVersion, engineCommit}`; v2.5.2 supports Capability API **1.816** (v2.5.1: 1.341). Engine version, manifest schema version, ruleset schema version and Capability API version are different axes.

A generic capability package can have code entrypoints, permissions, UI contributions and kinds `agent`, `maps`, `conversation-calls`, `turn-game`, `ruleset`. A portable **ruleset-only** file must pass the stricter [package reader](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/services/game/ruleset-package-file.ts):

```json
{
  "format": "marinara-ruleset",
  "version": 1,
  "manifest": { "...": "a complete capability manifest, not this placeholder" },
  "files": { "ruleset.json": "<strict base64 of exact UTF-8 bytes>" }
}
```

This illustrates the envelope only. Do not deliver it with placeholders. The four top-level keys are exact. Inside the complete manifest:

- `kind` is exactly `["ruleset"]`; `entrypoints: {}`, `permissions: []`; no `localizations`, no restart requirement, no other contributions.
- `contributions` has only `assets`, whose `paths` exactly match `files` and `manifest.files[].path`. The latter records each exact file's lowercase SHA-256 and byte length. Hash decoded bytes, not the base64 text or a later reserialized object.
- Only `ruleset.json` and declared `catalogs/<id>.json` are allowed, at most 13 files. Every catalog file must be declared by the ruleset, and every declaration must resolve. Base64 must be canonical and decode as UTF-8.
- Envelope ≤24 MiB; decoded documents together ≤16 MiB; serialized manifest ≤64 KiB; each document also has its individual cap. Packaged `$comment` must be a string ≤2,000 characters; root `$schema` may only be the Engine's `main`/`staging` raw GitHub ruleset-schema URL, not an arbitrary or commit-pinned URL. Keep source provenance outside these strict documents.
- `ruleset.json` requires manifest schema 2 and Capability API ≥1.20; external catalogs ≥1.21; additional features and larger files raise that floor. Do not set every package to 1.20 merely because it is a ruleset.

For a concrete validation/review use `POST /api/game-rulesets/check` with `{definition: "<JSON text>"}` or `{package: <parsed package object>}`. It saves nothing and reports path/message issues plus the least supported `capabilityApi` for the content. `POST /api/game-rulesets/import` takes `{definition}`; `/import-package` takes `{package, dryRun?}`. Import requires the custom-Agent-import policy and privileged access; the check route also requires privileged access. In UI use Agents → Import agents → Game Mode ruleset. Do not install a ruleset file as an executable Agent package. See [agent-packages.md](agent-packages.md) for that separate lifecycle.

## Creature packs: art is separate from bestiary mechanics

Sources: [creature schema/parser](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/features/world/creature-pack.ts), [author guide](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/docs/extending/writing-creature-packs.md), [routes](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/routes/game-creature-packs.routes.ts).

Strict root: `{creaturePackVersion: 1, id, name, version, author?, tileSize, sheets, creatures}`. Creature mechanics belong in a ruleset bestiary catalog, not here. Imported art files become `local/<id>`; changed art needs a higher integer `version` (1–100,000).

- `name` ≤80; optional `author` ≤80. Pack ID ≤80 allows one optional namespace; individual creature/sheet IDs use lowercase letters/digits/`_`/`-`, max 64.
- `tileSize` is 16–96, a multiple of 16. Up to 64 sheets, each `{id, png, width, height}` with sides 1–8192; `png` must be its own `data:image/png;base64,...`, never a remote URL. File text max 32,000,000 characters in `parseCreaturePack`.
- Up to 2,000 creatures: `{id, match, size, w, h, frames, variants}`. `match` has 1–16 strings ≤160; `size` is `tiny|small|medium|large|huge|gargantuan`; frame width/height `w/h` are 1–6 **cells**. `frames` is `1` (still) or `3` (step/stand/step).
- Each of 1–8 variants is `{sheet, x, y}`, top-left **cell** coordinates, not pixels. A full block spans `frames*w` cells across and `4*h` down; row order is down, left, right, up. All variants of a creature share dimensions.
- Matches can be `<catalog>/<entry>`, `<ruleset>/<catalog>/<entry>`, or enemy names. Prefer stable ruleset/catalog IDs; names are a fallback. Earlier duplicate matches win and produce notes. Parsing rejects duplicate IDs, missing sheets, PNG-header/dimension mismatch, or blocks outside sheets.

Import with Pixelforge's Creatures tab or `POST /api/game-tile-packs/creatures/import` `{definition: "<file text>"}`; choose the pack separately for fights. Unmatched creatures retain their fallback tokens. Art size does not define attack range, collision, health or a ruleset creature's mechanical footprint.

## Tile and board art packs

Sources: [tile parsers/constants](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/features/world/tile-pack.ts), [board parser/constants](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/features/world/board-pack.ts), [tile routes](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/routes/game-tile-packs.routes.ts), [board routes](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/routes/game-board-packs.routes.ts).

| Contract | Authoring constraints |
|---|---|
| Drawn tile pack v1 | `{tilePackVersion:1,id,name,family,version,author?,palette,tiles}`. A tile variant is 16 rows of 16 characters. `.` is transparent; other characters index palette via `0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ`. Palette has 1–62 `#rrggbb`/`#rrggbbaa` colors. Max 8 variants; text ≤1,000,000 characters. |
| Image tile pack v2 | Same identity/family fields; replace palette with `tileSize`, `sheets`, `tiles`, optional `characters`. Tile entries are `{sheet,x,y,w?,h?}` in cells. Max 16 sheets, each side ≤4096; combined ≤16,777,216 pixels; sheet data-URL strings together ≤6,000,000 characters, file text ≤6,300,000. Cell size 16–96 in multiples of 16; ordinary sprites ≤8×8 cells. |
| Board pack v1 | `{boardPackVersion:1,id,name,version,author?,environment?,tileSize,sheets,tiles}`. Max 600 tile IDs, 8 variants each, 32 sheets with sides ≤8192; file text ≤24,000,000 characters. PNG sheets and tile rects work like creature/image tile packs; ordinary rects ≤8×8 cells. `environment` is a supported tactical environment or `props`, `icons`, `portraits`; absent means explicit pack references only. |

Copy tile keys from `WORLD_TILE_IDS`, seasonal keys from `WORLD_SEASONAL_TILE_IDS`; inventing a descriptive key does not add a terrain to the Engine. Unknown tile IDs are dropped **with notes**, not necessarily import errors. Drawn v1 also drops image-only IDs. Image tile edge blocks must be 4×4, 4×6 or 4×30; fringe blocks 4×4. Optional walking characters have their own 3-column ×4-facing block, frame `w` 1–2 and `h` 1–3, up to 64 characters, plus aggregate canvas limits and recolour-region checks. Use `parseTilePack` for the whole constraint set. It checks complete PNG chunks/CRCs/dimensions, bounds, sheet IDs, palette symbols and layouts; server saving additionally decodes/cleans image sheets.

Board tile families are `bt_<terrain>`, `bt_edge_water`, `bt_edge_wall`, `bt_height1..3`, fixed `bo_` overlays, `bp_<prop>`, `bz_<zone>`, `ic_<icon>` and `pt_<portrait>[@<expression>]`. Board edge blocks are 4×4. Its parser and the creature parser inspect PNG signature/IHDR dimensions rather than the tile parser's full chunk/CRC validation: a schema/header check is not proof every image decodes. Missing art falls back to the Engine drawing; portraits/icons are board art packs, separate from character portrait packages.

Imports use `{definition: "<JSON text>"}` at `/api/game-tile-packs/import` or `/api/game-tile-packs/boards/import`; privileged writes file packs under `local/<id>`. Saving/importing does not itself select an art pack. Keep notes in validation reports: a success that dropped unknown tiles can still lose intended content.

## Setting kits, world files, and stories

Sources: [kit schema](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/schemas/world-kit.schema.ts), [share readers/exporters](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/features/world/share-files.ts), [world-library/story routes](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/routes/game-worlds.routes.ts), [story schema/checker](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/features/world/story.ts), [story author guide](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/docs/extending/writing-story-scripts.md).

A kit file is `{format:"marinara-world-kit",version:1,exportedAt,kit}`. `kit` itself has `schemaVersion:1`: setting words/scales/layers, sizes, group kinds, travel and change controls; optional terrain, people, loot, money, shop and other supported vocabularies. IDs start with a lowercase letter and use lowercase letters/digits/underscores, max 40. Exactly one of the 1–8 layers marks `settlements:true`. Use `parseWorldKit`; a kit is not a free-form lorebook or a location tree.

A current world file is `{format:"marinara-world",version:2,exportedAt,name,kit,world,story?,snapshot?}`. `world` is the generator recipe `{seed,generatorVersion,grounding,brief,edits?}`. Keep exported recipe IDs and a matching snapshot together; do not fabricate a snapshot or transplant a story onto a similar-looking seed. File UTF-8 limit is 8,000,000 bytes. The reader also accepts v1. These share envelopes check format/version and their payload parsers, rather than treating every envelope key as a strict Zod object.

`readWorldFile` can repair unsupported brief details and drop invalid edits, unplayable battlefields, unfit towns or a story that no longer fits, returning **notes**. This differs from a direct story save, which rejects the invalid story whole. A generator version this Engine cannot regenerate can load from a valid snapshot only when snapshot and recipe name the same generator; otherwise import fails. Review the parsed result/notes before claiming lossless portability. Library import: `POST /api/game-worlds/import` with `{text:"<world-file text>"}`; it needs privileged access and creates a reusable world, not a running campaign save.

An Experience can contribute a map pack with `contributions.gameSurface.mapPack: {kit, worlds?, tiles?}` in its capability manifest: assets end `.worldkit.json`, `.world.json`, `.tilepack.json`; at most 32 worlds. Paths must be declared/hash-pinned package assets; the manifest requires schema 2, Capability API ≥1.72, `contributions.gameSurface.setup` (Engine-owned setup), and the game-surface slot. It locks new-game setup to that kit and its provided worlds. This is a generic capability package workflow, not a ruleset-only envelope.

Engine 2.5.2 (Capability API up to 1.816) extends map packs and Experiences; declare the minor of the newest piece you ship (comments above `supportedCapabilityApi` in the schema):

| Minor | Addition |
|---|---|
| 1.344 | `mapPack.creatures`: `.creaturepack.json` assets, drawn before the library's creatures |
| 1.345 | Audio assets (`.ogg`, `.mp3`, `.wav`, ≤16 MB each) and map-pack `music` by place, elsewhere and in fights; a story `music` action cues a track |
| 1.346 | `mapPack.people`: a `.people.json` asset with named people, portraits, expressions, walking look, speech and lore |
| 1.355 | `mapPack.rulesets`: a ruleset id plus `.overlay.json` merged into that ruleset while the Experience is on; an overlay that does not fit is dropped whole |
| 1.357 | `mapPack.dungeons`: `.tilepack.json` dungeon sets for hand-made maps |
| 1.372 | `contributions.gameSurface.setup.defaults`: GM setup values filled into the Game wizard |
| 1.373 | Data-only Experience (`kind: ["experience"]`): no entrypoints, permissions or code; shared as one `.experience.json` the user reviews before import |
| 1.374 | A ruleset in the Agents catalog is a `<id>.ruleset.json` package file, never a ZIP, and declares 1.374 or newer |

Story scripts gain more in the same range (knowledge 1.348, seasons 1.351, 256 flags 1.353, party-size fight variants 1.356, and further script features from 1.358); check the schema comments before using one. Since 2.5.2 the agent catalog lists `.ruleset.json` and `.experience.json` entries (#8390).

### Story scripts are bound to the actual world

Minimal shape: `{storyVersion:1,flags:[],directions:[],events:[],cutscenes:[]}`. All lists default to `[]`; objects are strict. Limits: 64 flags, 64 directions, 128 events, 64 cutscenes; each event has 1–32 actions and at most 8 conditions; page scenes 1–40 pages, beat scenes 1–20 beats. IDs are 1–40 lowercase letters/digits/`_`/`-`, unique within each list.

- Flags: `{id,kind:"bool"|"number",initial,gm?:true,note?,quest?}`. Values/conditions must fit flag kind; boolean flags allow only `=`/`!=`. Quest `{title,text,goal?,hidden?:true}` uses `goal` only on numbers. `show` must name a quest flag.
- Directions: `{id,text,if?}`. Conditions are `{flag,is,value}`; all must hold. Events: `{id,when,if?,repeat?:true,gm?:true,note?,do:[...]}`. Triggers are `start`, `arrive`, `meet`, `day`, `turn`, `fight`, `broke`, `deed`, `flags`, `gm`, `step`, each with its own strict keys. A `gm` trigger needs `gm:true`.
- Actions have exactly a supported shape: `{set,value}`, `{add,amount}`, `{tell}`, `{cutscene}`, `{show}`, or `{world:{deed,...}}`. They do not directly give items, start fights, move the party or end a game; `tell` requests narration from the GM.
- Cutscenes are `{id,kind:"pages",background?,pages:[{speaker?,expression?,text}]}` or `{id,kind:"beats",beats:[...]}`. A speaker is a named world-person ID or `player`, not an arbitrary party-member ID; no speaker means narration. Backgrounds match `backgrounds:...`. Expressions use `STORY_EXPRESSIONS`, which differs from the board portrait-art mood list.
- Ordinary story text uses prompt-safe single lines; pages/beats/directions/tell ≤600 characters, notes ≤200; quest title ≤80/text ≤300. Optional `intro:{mode:"defined"|"guided",text,locked?}` permits line breaks, up to 8,000 characters, no macro braces; `guided` also forbids square brackets, while `defined` can contain them. The intro schema is the explicit exception to story text hygiene.

`checkStoryScript(game,input)` checks real places, named people, groups, cutscenes, flag types, enabled deed kinds, painted battlefield props and walkable `step` cells. A generated place map has no stable cells for a step trigger: use a reachable cell of its hand-made map, or a town cell reachable from the square and not on a free lot. It rejects repeating meet/deed self-trigger loops and >16,000 characters of beats referenced by GM-owned events. A shape-only parse cannot validate these links.

Save with `{story:<object>}` to `PUT /api/game/:chatId/story` or privileged `PUT /api/game-worlds/:id/story`; GET/DELETE exist too. Stories travel with world files or Experience map-pack worlds, rather than a separate generic story-file importer. Events run in script order, at most 32 per turn, once unless eligible to repeat; state folds from recorded replies, so swipes/regeneration take back their effects. Preserve world IDs and validate again after hand edits.
