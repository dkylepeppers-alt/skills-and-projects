# Native map contract

Contents: envelope · definition · locations · topology · hierarchy profile · payload boundaries.

Read source-truth.md for the revisions behind these limits. Numeric limits below are
implementation constraints; recommended writing lengths and art choices are separate.

## Envelope and import surfaces

Author one UTF-8 JSON object with `format: "marinara-hierarchical-map"`,
`formatVersion: 4`, `name` and `definition` at the top level.
Optional top-level payloads: `hierarchyProfile`, `portableLore`, `artwork`.
Start from the shipped valid template; omit absent optional objects rather than using
invalid stubs. The native map importer reads JSON, not a ZIP of loose images.
A distribution ZIP must be extracted before selecting the JSON member.

The library importer selects `record.data` if it is an object, otherwise `record`;
it then selects that object's `definition` if present, otherwise the original raw
value. This is NOT a simple fallback from data.definition to root.definition: a stray
object-valued data wrapper can hide a root definition. Workspace import selects
root.definition or the raw value. Top-level is interoperable with both.

The library name comes from a nonblank root `name` or the filename-derived name,
not automatically from the root location. Do not mistake permissive format metadata
handling for support for arbitrary future formats.

## Definition

The definition object is strict: unknown keys are rejected.

| Field | Contract |
| --- | --- |
| schemaVersion | Required literal 1 |
| ownerMode | Required roleplay or game |
| enabled | Required boolean |
| locations | Required array, at most 5,000 (archived count too) |
| startingLocationId | Required null or valid ID of an existing active location |
| revision | Required nonnegative safe integer |

A null start and even an empty definition can pass these checks. Separate save/enable
flows can add state-dependent constraints. For a new template, false/0 and a sensible
active starting node are authoring defaults, not a universal import requirement.
Never reset a supplied live revision simply because new templates start at zero.

## Locations

Location, link and coordinate objects are strict. Strings marked trimmed are normalized
before length/identity comparisons. JSON does not represent undefined; omit optional fields.

| Field | Type and behavior |
| --- | --- |
| id | Required trimmed 1–128 string matching `^[A-Za-z0-9][A-Za-z0-9._:-]*$` |
| parentId | Required valid ID or null; ID spelling does not imply ancestry |
| name | Required trimmed 1–200 string |
| kind | Required region / settlement / place / building / floor / room |
| description | Required string, max 4,000; empty permitted; schema does not trim |
| modelMemory | Optional string, max 8,000 |
| awarenessSummary | Optional string, max 1,000; do not depend on owner-prompt use |
| icon | Optional trimmed 1–64 string; literal text; editor input separately capped at 16 |
| referenceImageId | Optional trimmed 1–200 string |
| useReferenceImage | Optional boolean |
| mapBackgroundImageId | Optional trimmed 1–200 string |
| mapBackgroundPosition | Optional strict object with finite x/y numbers in 0–100 |
| lorebookEntryIds | Default []; at most 50 trimmed nonempty strings, no duplicates |
| childPresentation | Default list; map / layers / list |
| placement | Optional strict x/y coordinates in 0–100 |
| layerOrder | Optional safe integer; required for children of a layers parent |
| links | Default []; at most 50 direct link objects |
| status | Default active; active / archived |
| sortOrder | Default 0; safe integer |

Kinds are fixed base categories. Custom vocabulary lives in hierarchyProfile; do not
put `kind: "deck"` or `kind: "district"` in a native location. Kinds also participate
in profile/draft/UI behavior; avoid claiming they are universally mechanically inert.

## Links and structure

A link requires `targetId` using the same ID rules. Optional `label` is trimmed,
1–200 characters. `bidirectional` defaults false; `state` defaults available and
accepts available/hidden/blocked. Link targets may cross branches or roots.

Structural checks reject duplicate normalized location IDs, missing/self parents,
parent cycles, nesting deeper than 20 (root counts as 1), missing/self link targets,
duplicate targets from one source, duplicate lore IDs and missing/archived start.
For every layers parent, ALL direct children need distinct layerOrder values,
including archived children. Negative numbers and gaps are legal.

Multiple roots are valid. A single root is a useful organizational default, not a
hard requirement. Siblings need not follow a fixed kind hierarchy. Placement is
optional even for map children; inspect display when missing rather than claiming an
import rejection. Unique names are a usability recommendation, not a schema rule.

Presentations belong to the parent:

- map: children drawn on its canvas; their placement aligns markers to its background.
- layers: children sorted/stacked by their layerOrder.
- list: simple child list.

Canvas coordinates are UI percentages, not travel distance, exact world geometry,
automatic compass facts or token-visible map knowledge.

## Hierarchy profile

Profile version 1 includes mode auto/template/custom, trimmed name 1–120,
1–40 types, locationTypeIds (default {}), showConnections (default true) and
linkPresentations (default {}). A type has id (trimmed 1–80 with the ID pattern),
label (trimmed 1–80), baseKind (six native kinds), optional trimmed description ≤240.
Link styles allow an optional six-digit hex color and solid/dashed/dotted lineStyle.

Author unique type IDs and assign each location to a real type. Style a connection
with `spatialLinkPresentationKey`: sort the two location IDs with `localeCompare`
and join them with `|` (`quay|salt-house`). The profile schema accepts any string
key, and normalization keeps only keys that helper would produce. A `::` key is
not that format.
A profile has a stricter exported schema, but import calls normalization using its BASE
schema: invalid base shape falls back to defaults; valid base shape can receive repaired
assignments and filtered link styles. Thus profile defects can silently lose custom
presentation instead of rejecting the map. Preflight must report its profile coverage
as limited unless it exercises that normalization.

## What can travel in one map file?

| Payload | Native support / boundary |
| --- | --- |
| Locations, text, symbols, links, coordinates, layers, status/start | Definition |
| Type vocabulary and link presentation | hierarchyProfile |
| Location reference and child-map background bytes | artwork; bindings use source keys remapped on import |
| Linked entries or complete lorebooks, folders, recognized settings, references | portableLore; destination API and remapping still apply |
| Artwork prompt/provider/model/dimensions | Recognized artwork metadata, not generation instructions |
| Audio, ambient tracks, video, 3D, PDFs, arbitrary binary attachments | No native map payload slot confirmed; deliver companions, not fake schema fields |
| NPC cards, personas, schedules, encounters, inventory, quests | Separate native artifacts or prose/lore; not automatic map state |
| Prompt presets, outlet placement, scripts, regex, Agent code | Separate installation/import workflow |
| Tactical Game maps and image tiles | Separate Game subsystem; do not synthesize binding/state in world-map JSON |
| Chat history, snapshots, Gallery database, credentials | Not a new map pack payload |
| Art masters, prompt sheets, canon ledger, license/provenance, JSON manifests | Companion authoring source files; arbitrary envelope extras are not guaranteed to round-trip |

Embedded content is not necessarily executed, projected or displayed. Trace the
consumer before promising a behavior. Never put credentials, private author notes
intended to remain secret, or executable surprise payloads in a distributable pack.
