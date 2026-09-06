# Hierarchical maps (spatial context)

Two owners: the **definition** schema is Engine-side at `packages/shared/src/schemas/spatial-context.schema.ts`, with structural validation in `packages/shared/src/utils/spatial-context.ts`. The **hierarchy profile** and the portable-lore bundle belong to the Hierarchical Maps package, vendored in the Agents repo at `packages/hierarchical-maps/src/engine/packages/maps-shared/src/maps-model.ts`.

Template: `templates/map-template.json` — validated against both schemas.

## What the importer accepts

The map library import (`SpatialMapLibrary.tsx`) parses the file, then looks for a definition in this order: `record.data.definition` → `record.definition` → the whole file. So all three of these work:

```json
{ "version": 1, "definition": { … }, "hierarchyProfile": { … } }
{ "data": { "definition": { … } }, "portableLore": { … } }
{ "schemaVersion": 1, "ownerMode": "roleplay", … }
```

The first is the standard template export and the one to author. Whatever the definition fails on, the user sees only "This is not a valid map file", so validate before handing the file over.

## Definition

`.strict()` — an unknown key fails the parse.

```
schemaVersion: 1                  literal
ownerMode: "roleplay" | "game"
enabled: boolean                  false for a template
locations: SpatialLocation[]      max 500
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
| `icon` | no | ≤64, a kebab-case Lucide name |
| `lorebookEntryIds` | defaults `[]` | max 50, no duplicates; real entry IDs only |
| `childPresentation` | defaults `"list"` | `map` \| `layers` \| `list` |
| `placement` | no | `{ x, y }`, each 0–100, for children of a `map` parent |
| `layerOrder` | no | integer, **required** on every child of a `layers` parent, unique among siblings |
| `links` | defaults `[]` | max 50 |
| `status` | defaults `"active"` | `active` \| `archived` |
| `sortOrder` | defaults `0` | integer |
| `referenceImageId`, `useReferenceImage`, `mapBackgroundImageId`, `mapBackgroundPosition` | no | image bindings; only Global Gallery references survive a template export |

Links are `.strict()`: `{ targetId, label?, bidirectional (default false), state (default "available") }`, state being `available` | `hidden` | `blocked`.

## Structural rules the validator enforces

Beyond the field types, `validateSpatialContextDefinition` rejects:

- duplicate location IDs
- `startingLocationId` that is missing or points at an archived location
- a location that is its own parent, or a `parentId` that does not exist
- parent cycles, or nesting deeper than 20 levels
- self-links, links to a nonexistent target, duplicate link targets on one location
- duplicate `lorebookEntryIds` on one location
- more than 500 locations, more than 50 links on one location
- a child of a `layers` parent with no `layerOrder`, or two siblings sharing one

Limits live in `SPATIAL_CONTEXT_LIMITS`. The three that bite most often: the layer-order requirement, the parent cycle check, and link targets typo'd out of existence.

## Hierarchy profile

```
version: 1
mode: "auto" | "template" | "custom"
name: string (1–120)
types: [{ id, label (≤80), baseKind, description? }]   1–40, ids unique
locationTypeIds: { "<locationId>": "<typeId>" }         every value must name a real type
showConnections: boolean
linkPresentations: { "<a>::<b>": { color: "#rrggbb", lineStyle } }
```

Types are the display layer over `kind`. Assign every location a type; the default template gives one type per base kind (`type_region` … `type_room`).

## Authoring a map by hand

Pick the hierarchy first — the tree is the map. `region → settlement → place/building → floor → room` is the natural nesting, and `kind` should match the depth you are actually at rather than the word that sounds right.

`childPresentation` is a decision per parent, not a global style:

- **`map`** — children get `placement` coordinates and draw on a canvas. Use for a region's settlements or a town's buildings.
- **`layers`** — children are stacked levels and every one needs a unique `layerOrder`. Use for a building's floors.
- **`list`** — children are a plain list. Use for rooms and anything where geography does not matter.

The three text fields do different jobs. `description` is prose the player reads. `awarenessSummary` is the one-liner shown when the place is merely nearby, so keep it short and non-spoiling. `modelMemory` is private — put the secret the room is hiding here, not in `description`.

Link `state` is how a map holds a secret. A passage the player has not found is `hidden`; one they know about but cannot use is `blocked`. Both are real locations with real links, which means the model can reveal them at the right moment without the map being edited mid-scene.

## Cross-linking lore

`lorebookEntryIds` needs entry IDs that only exist after the lorebook is imported, so an offline-authored map ships with empty arrays and gets linked in the app.

The alternative is the **portable lore bundle** the workspace produces on export — `{ schemaVersion: 1, mode, books[], entries[], references[] }`, where `mode` is `map-only`, `linked-entries`, or `complete-lorebooks`. On import Marinara matches each entry against existing ones by exact ID, then by content fingerprint, and either reuses or creates. It is a real interchange format, but it is produced by the app's exporter; hand-building one is not worth it compared to importing the lorebook and the map separately and linking once.

## Related

`docs/agents/hierarchical-maps.md` and `docs/game/map-time-weather.md` in the Engine repo cover the runtime behavior — travel, spatial snapshots, and how location context reaches the prompt.
