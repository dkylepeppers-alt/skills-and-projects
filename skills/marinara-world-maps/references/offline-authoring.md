# Offline authoring, portable lore and delivery

Contents: source layout · tools · lore contract · import semantics · companions · iteration.

Keep editable sources separate from the native build artifact. Never edit the user's
only supplied map, delete artwork to shrink the file without agreement, or reset live IDs.

## Source layout

Use a project folder containing:

- map.json: canonical top-level envelope with definition and optional hierarchyProfile.
- lore/: native Marinara lorebook exports with lorebook, entries and folders.
- links.json: location-to-entry selectors (exact IDs preferred).
- art/reference/ and art/background/: filenames equal location IDs.
- art-plan.json: roles, camera prompts, provenance, review and revision metadata.
- canon.md and style-bible.md: authored facts, uncertainty and creative constraints.
- build/: named, versioned .world-map.json outputs.

Use filenames safe on the intended operating systems; a valid location ID containing a
colon is not a portable Windows filename. Preserve existing IDs; use an explicit mapping/
assembly step when filesystem-safe slugs differ instead of renaming live locations.
The simple bundled builder expects exact ID filenames and does not implement that mapping.

## Tools

Node 18+ runs the ordinary CLI scripts. Source-contract tests require Node 24 and a
compatible Zod package, independent of a full Engine installation.

```bash
node scripts/validate-map.mjs source.world-map.json --json
node scripts/art-inventory.mjs source.world-map.json --json
node scripts/build-pack.mjs --definition map.json --images art --out build/world-v1.world-map.json
node scripts/build-pack.mjs --definition map.json --images art --lorebook lore/book.marinara.json --links links.json --lore-mode linked-entries --out build/world-with-lore.world-map.json
```

Create the build directory first. Output must be a NEW filename: the builder refuses
to overwrite existing outputs or source inputs. Validator is read-only; its exit codes
are 0 for structural pass (warnings allowed), 1 for checked contract errors, 2 for
read/parse failure. JSON reports separate errors and warnings. Builder exits 2 on failure.

Builder options: --name, --pack, --owner roleplay|game, --quiet; repeat --lorebook for
multiple native books. Choose --lore-mode complete-lorebooks to include all entries/folders
from supplied books, not only selected entries and their ancestor folders. It preserves
an existing artwork array, portableLore and profile if not replacing them. Adding art
replaces an identical source key only and preserves unrelated assets. Supplying new lore
over an existing bundle requires explicit --replace-lore; inspect all old bindings first.
That option replaces the bundle, not a complete cross-install migration of old IDs.

Unknown envelope metadata is preserved in the build when an envelope is supplied,
but the app may discard it. Unknown strict definition fields are errors. The builder
refuses unrecognized formats or newer envelope versions rather than silently downgrading them.
Inspect their current source contract before conversion. The builder
uses the audited recognized lore settings, not arbitrary field spreading. Keep full
source lorebooks separately to preserve future/unknown data.

Image matches must be unique per ID/role. Missing source directories, unknown image IDs,
duplicate role files, ambiguous lore names and malformed link maps fail rather than
silently dropping work. Optional dimensions are metadata; neither builder nor preflight
fully decodes image formats. Check image bytes with a real decoder and inspect them.

Art inventory reports every kind including floors/rooms, assignment and bundle matching.
It does not decide that every optional role needs art or prove that images display.

## Portable lore: supported offline binding

Raw lore IDs work only where matching entries already exist. A portable bundle makes
the association reconstructable in a different install.

Definition: lorebookEntryIds contains the source entry's original ID.
Bundle: books[].entries[] carries that originalId plus a bundle-local key and data.
Reference: references[] names locationId, originalEntryId and entryKey.
Import: entryKey maps to a destination ID; matching originalEntryId values in that
location's existing lorebookEntryIds are rewritten. A reference alone does NOT attach
an entry if the definition never lists its original ID.

Exact links example:

```json
{
  "academy.west-dorm": [{"id": "entry-source-123"}],
  "academy.library": ["Library Rules", {"id": "entry-source-456"}]
}
```

Names are matched case-insensitively after trim; duplicates must be resolved with IDs.
Builder keys are ordinal, not slugs of arbitrary source IDs, so “entry a” and “entry-a”
cannot accidentally collide. Native source IDs must be globally unique across entries.

## Bundle structure and integrity

Top-level portableLore has schemaVersion 1, mode, books and references.
Modes: map-only (books must be empty), linked-entries, complete-lorebooks.
Null/omitted means absent. An empty object is invalid.

Each book: key, originalId, name, settings, folders[], entries[].
Each folder: key, originalId, parentKey (nullable), data containing name/enabled/order.
Each entry: key, originalId, name, folderKey (nullable), fingerprint, data.
Each reference: locationId, locationName, entryKey (nullable), originalLorebookId
(nullable), originalLorebookName, originalEntryId, originalEntryName.

Entries belong INSIDE books, not at bundle root. Book keys and original IDs are unique
among books; entry keys and original IDs are unique across all books; folder keys are
unique within each book. Folder parent/entry folder keys must refer within that book;
non-null reference entry keys must exist globally. Maximums: 100 books, 10,000 references,
20,000 entries and 5,000 folders per book.

The parser checks the wrapper and recognized settings but does not deeply schema-validate
every entry setting. API creation can still fail. Stronger authoring checks (e.g. folder
cycles or broken relationships) are useful even when the permissive wrapper accepts them.

The full recognized book/entry whitelists live in scripts/portable-lore.mjs and must be
checked against the source when updating. They include vectorization exclusions,
budget/entry/recursion controls, outlet/depth/role, filters, timing, relationship,
dynamic-state, activation and schedule settings where allowed. Do not import SillyTavern
constraints into Marinara's native schema just because the concepts look familiar.

Fingerprints use the source's key-sorted portable data and entry-v1 double hash.
Compute honestly; do not sabotage matching to force duplication. Relationships can
reference entries not selected for a linked-only bundle. Audit those dependencies;
include necessary entries/books or report external references. Import remaps supported
relationship entry references in its second pass, not arbitrary IDs embedded in prose,
character filters, executable instructions or other companion files.

## What import actually does

“Complete lorebooks” describes the bundled selection, not a byte-identical database
clone. Import creates books only when entries need importing, and creates folders
needed by those entries and their ancestors; empty books/unused folders may not be
restored. Native book covers and owner/scope bindings are not in this portable whitelist.
Created books receive map-import provenance/tags, generatedBy import, sourceAgentId
hierarchical-maps, and a null imagePath. Preserve original exports when those details matter.

A matching dialog offers reuse versus separate copies when bundled books are present.
At the pinned implementation, exact entry ID takes precedence, without requiring equal
content. Otherwise fingerprint plus normalized portable-content equality is searched
across candidate entries, not just a same-named destination book. Ambiguous matches
need a choice. Reusing an old exact ID can retain old content; it is not an offline
lore UPDATE operation. Choose separate copies deliberately when isolation is desired.

Artwork source IDs are remapped to real Gallery IDs. Global image content may be reused.
Malformed entries can be skipped early; decode/upload errors are counted later. Inspect
warnings and missing bindings rather than promising one import always restores everything.

Import is not one universal draft-only transaction:

- World Maps library import creates a template/shared-world record immediately after
  dependencies are resolved. Template/shared-world normalization can change owner,
  enablement and revision defaults.
- Chat workspace import prepares a map draft for review/save, but lore creation and
  artwork upload can already have persisted. Cancelling the draft does not imply
  all dependency side effects were undone.
- Applying a template to a chat and enabling the map are separate from file import.
  Verify the actual current location and owner mode after applying.

Give the exact surface seen in the target build. Normally: open World Maps → Templates
or Shared worlds → Import, select the JSON, resolve lore choices, inspect restored art,
then apply the chosen map to a disposable Roleplay/Game chat and save/enable as needed.
If using the in-chat Import, explicitly say to review and Save its draft. Never call a
ZIP of arbitrary files a directly supported map importer input.

## Companions and limits

Art masters, art manifests, canon notes, license records and preview sheets are valuable
source companions. Audio/ambience, character cards, personas, presets/macros, scripts,
Agent packages, Game Setup and tactical maps require their own supported formats and
activation steps. A URL in lore is text, not a guaranteed fetched attachment. An outlet
macro's insertion point belongs to the prompt preset, not hierarchyProfile or location.

Do not bundle unrelated personal libraries, credentials or private working notes by
default. When distributing third-party/reference art, retain provenance and applicable
permissions without asserting ownership of assets the user did not create.

## Iterate safely

Keep original IDs and source mapping records. In live chats, history/current/start or
tactical bindings can protect nodes against deletion or replacement. Add/archive only
with those protections understood; archive changes accessibility and is not a free
prompt compression operation. Keep the user's current revision, or create a new template
explicitly rather than forging state. Test substantial restructuring in a new chat.

For each build, compare location IDs/parents/links, lore bindings/settings and artwork
hashes. Re-export after an actual import to inspect normalization/remapping; do not demand
byte equality where legitimate destination IDs change. Report structural pass,
source-confirmed behavior and unperformed runtime tests separately.
