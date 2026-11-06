# Hierarchical maps (spatial context)

Verified against **Engine v2.5.2**, commit `fc0333c3fe978cda5e0b919bd6faec985901704e`, and **World Maps 1.8.0** (Capability API 1.380) in Agents commit `ffde8ea4035868c064eb3b2ffd675f1f807c57ed` (2026-11-05). The spatial-context schema is unchanged from 2.5.1, and the World Maps changelog from 1.4 to 1.8 adds no file-format change beyond the 5,000-location cap. Engine sources: [schema](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/schemas/spatial-context.schema.ts), [structural validator](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/utils/spatial-context.ts). Agents sources: [model](https://github.com/Pasta-Devs/Marinara-Agents/blob/ffde8ea4035868c064eb3b2ffd675f1f807c57ed/packages/hierarchical-maps/src/engine/packages/maps-shared/src/maps-model.ts), [library importer](https://github.com/Pasta-Devs/Marinara-Agents/blob/ffde8ea4035868c064eb3b2ffd675f1f807c57ed/packages/hierarchical-maps/src/engine/packages/client/src/features/spatial-context/SpatialMapLibrary.tsx), [workspace exporter/artwork parser](https://github.com/Pasta-Devs/Marinara-Agents/blob/ffde8ea4035868c064eb3b2ffd675f1f807c57ed/packages/hierarchical-maps/src/engine/packages/client/src/features/spatial-context/SpatialMapWorkspace.tsx), [portable lore parser](https://github.com/Pasta-Devs/Marinara-Agents/blob/ffde8ea4035868c064eb3b2ffd675f1f807c57ed/packages/hierarchical-maps/src/engine/packages/client/src/features/spatial-context/portable-lore.ts).

This is the World Maps Agent's hierarchy. Game Mode's generated worlds, `.world.json`, tile packs and battlefield art use different contracts; see [game-content.md](game-content.md).

Two owners: the **definition** schema is Engine-side at `packages/shared/src/schemas/spatial-context.schema.ts`, with structural validation in `packages/shared/src/utils/spatial-context.ts`. The **hierarchy profile** and the portable-lore bundle belong to the Hierarchical Maps package, vendored in the Agents repo at `packages/hierarchical-maps/src/engine/packages/maps-shared/src/maps-model.ts`.

Template: `templates/map-template.json` — validated against both schemas. Under Engine v2.5.2 the hierarchy profile check needs the validator's Zod 4 bridge shim, because World Maps 1.8.0's maps model still calls Zod 3 `.innerType()` (`scripts/README.md`).

Runtime additions that need no file change: since World Maps 1.7 a chat can give the World Maps agent its own **Reference lorebook** (Chat Settings → Agents; `lorebooks.md`), whose matching entries feed chat-specific map creation, replacement, expansion and previews. Since 2.5.2 the Illustrator receives the current place's path and description, and since World Maps 1.6 a Game Master move to a place more than one step away follows the shortest route.

## What the importer accepts

The map library import (`SpatialMapLibrary.tsx`) parses JSON, takes `record.data` if it is an object (otherwise `record`), then uses that object's `definition` if present, otherwise the whole file. Do not supply an unrelated object-valued `data`: it shadows a top-level `definition`. These three ordinary shapes work:

```json
{ "version": 1, "definition": { … }, "hierarchyProfile": { … } }
{ "data": { "definition": { … } }, "portableLore": { … } }
{ "schemaVersion": 1, "ownerMode": "roleplay", … }
```

The first is the minimal reusable template shape in this skill. The current workspace export is a `.world-map.json` with `{ format: "marinara-hierarchical-map", formatVersion: 4, name, definition, hierarchyProfile, portableLore, artwork? }`. Older `.hierarchical-map.json` files remain importable. Do not wrap either in a generic `.marinara.json` content envelope. The library discriminates by the definition's schema, not the filename or a required `format` value, and reports the first schema issue. Validate before handing the file over.

## Definition

`.strict()` — an unknown key fails the parse.

```
schemaVersion: 1                  literal
ownerMode: "roleplay" | "game"
enabled: boolean                  false for a template
locations: SpatialLocation[]      max 5,000
startingLocationId: string|null
revision: number                  0 for a fresh template
```

## Location

`.strict()`. IDs match `^[A-Za-z0-9][A-Za-z0-9._:-]*$`, max 128 chars.

| Field | Required | Notes |
|---|---|---|
| `id` | yes | unique across the map |
| `parentId` | yes | `null` for a root |
| `name` | yes | ≤200 |
| `kind` | yes | `region` \| `settlement` \| `place` \| `building` \| `floor` \| `room` |
| `description` | yes | ≤4,000 — what the player sees |
| `modelMemory` | no | ≤8,000 — private context for the model only |
| `awarenessSummary` | no | ≤1,000 — one line used for nearby-place awareness |
| `icon` | no | Engine accepts a nonempty string ≤64; current Maps authoring uses one emoji grapheme (manual input ≤16), not a Lucide name |
| `lorebookEntryIds` | defaults `[]` | max 50, no duplicates; real entry IDs only |
| `childPresentation` | defaults `"list"` | `map` \| `layers` \| `list` |
| `placement` | no | `{ x, y }`, each 0–100, for children of a `map` parent |
| `layerOrder` | no | integer, **required** on every child of a `layers` parent, unique among siblings |
| `links` | defaults `[]` | max 50 |
| `status` | defaults `"active"` | `active` \| `archived` |
| `sortOrder` | defaults `0` | integer |
| `referenceImageId`, `useReferenceImage`, `mapBackgroundImageId`, `mapBackgroundPosition` | no | Gallery image bindings; IDs ≤200, position `{x,y}` at 0–100; portable artwork is separate from a reusable template |

Links are `.strict()`: `{ targetId, label?, bidirectional (default false), state (default "available") }`, state being `available` | `hidden` | `blocked`.

## Structural rules the validator enforces

Beyond the field types, `validateSpatialContextDefinition` rejects:

- duplicate location IDs
- non-null `startingLocationId` that is missing or points at an archived location (null is schema-valid; enabling a usable map requires an active start in the UI)
- a location that is its own parent, or a `parentId` that does not exist
- parent cycles, or nesting deeper than 20 levels
- self-links, links to a nonexistent target, duplicate link targets on one location
- duplicate `lorebookEntryIds` on one location
- more than 5,000 locations, more than 50 links on one location
- a child of a `layers` parent with no `layerOrder`, or two siblings sharing one

Limits live in `SPATIAL_CONTEXT_LIMITS`. The Hierarchical Maps package applies the same 5,000-location ceiling. The three that bite most often: the layer-order requirement, the parent cycle check, and link targets typo'd out of existence.

## Hierarchy profile

```
version: 1
mode: "auto" | "template" | "custom"
name: string (1–120)
types: [{ id, label (≤80), baseKind, description? (≤240) }]   1–40, ids unique
locationTypeIds: { "<locationId>": "<typeId>" }         defaults {}, values must name real types
showConnections: boolean                             defaults true
linkPresentations: { "<a>::<b>": { color?, lineStyle? } }   defaults {}
```

Types are the display layer over `kind`; IDs use the location-ID character pattern but max 80 characters. `color` is `#rrggbb`; `lineStyle` is `solid`, `dashed` or `dotted`. Assign every location a type for predictable display; the default template gives one type per base kind (`type_region` … `type_room`). Missing assignments are valid and normalization fills them by base kind (then the first type). The profile schema checks type IDs, not whether every location key exists in the definition; normalize/validate against the definition as well.

## Authoring a map by hand

Pick the hierarchy first — the tree is the map. `region → settlement → place/building → floor → room` is the natural nesting, and `kind` should match the depth you are actually at rather than the word that sounds right.

`childPresentation` is a decision per parent, not a global style:

- **`map`** — children get `placement` coordinates and draw on a canvas. Use for a region's settlements or a town's buildings. The canvas is square (a 100 × 100 grid), so a child-map background should be square artwork, for example 1024 × 1024 px.
- **`layers`** — children are stacked levels and every one needs a unique `layerOrder`. Use for a building's floors.
- **`list`** — children are a plain list. Use for rooms and anything where geography does not matter.

The three text fields do different jobs. `description` is prose the player reads. `awarenessSummary` is the one-liner shown when the place is merely nearby, so keep it short and non-spoiling. `modelMemory` is private — put the secret the room is hiding here, not in `description`.

Link `state` controls traversal. A passage the player has not found is `hidden`; one they know about but cannot use is `blocked`. Only `available` links to active locations are offered as destinations. Parent/child travel and available links form routes (maximum 64 locations); hidden/blocked links require an authoritative state update before they become traversable. Do not promise that visible AI narration alone reveals a link or moves the marker.

## Cross-linking lore

`lorebookEntryIds` needs entry IDs that only exist after the lorebook is imported, so an offline-authored map ships with empty arrays and gets linked in the app.

The alternative is the **portable lore bundle** the workspace produces on export — `{ schemaVersion: 1, mode, books[], references[] }`, with entries and folders **nested inside each book**, not a top-level `entries` array. `mode` is `map-only`, `linked-entries`, or `complete-lorebooks`. A book holds `{key, originalId, name, settings, folders, entries}`. Entry records hold `{key, originalId, name, folderKey, fingerprint, data}`; references tie a location to an entry key and readable original-book/entry provenance.

`parsePortableLoreBundle` rejects unsupported versions/modes, duplicate book/entry identifiers, missing folder/entry references, more than 100 books or 10,000 references, or more than 20,000 entries/5,000 folders in one book. `map-only` must have no books. A malformed supplied `portableLore` rejects the map import; missing portable lore is fine. Use the app exporter for this format and validate embedded entry content against the lorebook contract too.

Restoring lore is reviewed. Exact IDs are authoritative only within the destination lorebook; IDs from another book require a choice. Otherwise one unique complete-content/settings fingerprint can be reused. Names alone never match. The user can reuse matches and import the rest, choose an ambiguous destination, or import separate collision-safe copies. Map-only exports preserve provenance/existing exact links but cannot recreate missing books. Created books survive map deletion.

Linked lore applies at the **exact current location**, not its descendants. It bypasses keyword matching, while enabled state, chat exclusions, conditions, timing, probability and token budgets still apply.

## Artwork and shared worlds

`createSpatialMapTemplateData` makes a reusable template with `ownerMode: "roleplay"`, `enabled: false`, `revision: 0`. It drops chat-owned artwork bindings while preserving `global-gallery:<id>` references. A template reference is not an embedded image and is not portable to another account by itself.

The separate workspace export can include referenced chat and Global Gallery artwork at top-level `artwork`: records contain `sourceImageId`, `filename`, an image data URL in `data`, plus prompt/provider/model and nullable width/height metadata. Supported data-URL image types are JPEG, PNG, GIF, WebP and AVIF. `parseBundledArtwork` skips malformed records and deduplicates source IDs (last accepted record wins); it does not strictly reject the whole file like the definition parser. Import restores referenced images and remaps IDs; library imports restore them into Global Gallery, while chat imports can restore chat-owned images to that chat. Prefer the app exporter rather than inventing Gallery IDs.

Templates make independent copies. Shared worlds instead keep an account-owned canonical hierarchy/artwork set. Each linked chat retains its own location, history, snapshots, Game bindings and unpublished changes; publishing is a reviewed revision/conflict operation. A portable map file does not establish a shared-world link or carry a campaign's travel history.

After importing into a workspace, review and save before treating the map as authoritative. Preserve existing location IDs in a campaign with history or Game bindings. Archive protected locations; do not edit JSON to bypass the UI's permanent-deletion safeguards.

## Related

`docs/agents/hierarchical-maps.md` and `docs/game/map-time-weather.md` in the Engine repo cover the runtime behavior — travel, spatial snapshots, and how location context reaches the prompt.
