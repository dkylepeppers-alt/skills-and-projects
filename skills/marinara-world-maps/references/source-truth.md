# Source authority and refresh procedure

Baseline inspected 2026-09-06, staging source (not a claim about the user's installed build):

- [Marinara Engine](https://github.com/Pasta-Devs/Marinara-Engine/tree/36f5379b2e7d0084d1b8116d178947f1baa65270): `36f5379b2e7d0084d1b8116d178947f1baa65270`.
- [Marinara Agents](https://github.com/Pasta-Devs/Marinara-Agents/tree/614504a664f87e521718e104156fd7ae558bdead): `614504a664f87e521718e104156fd7ae558bdead`.

Do not infer package compatibility from an Engine version alone. Read the installed
World Maps manifest/catalog lane and compare the files below. A newer staging change
may not yet be installed or released.

## Read the implementation in this order

In Engine, paths below are relative to the repository root. In Agents, prefix
every path below with `packages/hierarchical-maps/src/engine/packages/`.

| Claim | Repository | Exact relative path |
| --- | --- | --- |
| Definition types, trimming, defaults, strict keys | Engine | `packages/shared/src/schemas/spatial-context.schema.ts` |
| Structural checks, destinations, directed routes, transition acceptance | Engine | `packages/shared/src/utils/spatial-context.ts` |
| Library import selection and immediate record creation | Agents | `client/src/features/spatial-context/SpatialMapLibrary.tsx` |
| Native export, artwork parsing, chat-workspace import | Agents | `client/src/features/spatial-context/SpatialMapWorkspace.tsx` |
| Lore whitelist, fingerprint, parser, matching, remapping and persistence | Agents | `client/src/features/spatial-context/portable-lore.ts` |
| Profile normalization, template/shared-world transformations, prompt defaults | Agents | `maps-shared/src/maps-model.ts` |
| Owner projection and prompt formatting | Agents | `maps-shared/src/runtime-prompt.ts` |
| Shared-world selection, one-effective-definition resolution and relinking constraints | Agents | `server/src/services/spatial-context/shared-world.service.ts`, `server/src/routes/spatial-context.routes.ts` |
| Assistant movement, discovery, per-message/swipe state | Agents | `server/src/services/spatial-context/state-resolution.ts` |
| Save checks against real lore/history | Agents | `server/src/services/spatial-context/definition.service.ts` |
| AI draft schema, size specs, normalization | Agents | `server/src/services/spatial-context/ai-draft.ts` |
| Gallery lookup and reference merge ordering | Engine | `packages/server/src/services/image/spatial-location-reference.ts` |
| Forced location lore eligibility and budgets | Engine | `packages/server/src/services/lorebook/index.ts` |
| Forced entry activation gates | Engine | `packages/server/src/services/lorebook/keyword-scanner.ts` |

Follow call sites when claiming an image provider limit, prompt macro expansion,
deletion protection, active-map save gate, or import transaction. A type declaration
or prompt sentence alone is not evidence of enforcement.

## Confirmed distinctions

- The schema allows 500 stored nodes. The owner prompt indexes the first 50 active
  nodes in definition order and separately takes 50 resolved one-hop destinations.
  Current source also reports omitted known names. This is not adaptive ranking.
- The prompt says a known user-led arrival through a new/secret route is recorded
  directly. The assistant-move consumer still checks the existing one-hop destination
  set. Treat this as a source-level contradiction; do not encode the prompt's promise
  as a supported unlocking mechanism.
- Current Engine location-forced lore has a preliminary 2,048 estimated-token budget
  before merging with ordinary activations and applying further budgets. An entry
  skipped by that preliminary path may still activate ordinarily. This is not a
  size limit on the portable bundle and not an unconditional ban on its content.
- A parser accepting an artwork data-URL prefix is not an image decode. Import can
  continue with failures restoring some images.
- Profile normalization uses the base schema and fallback/repair logic. Do not
  claim that every invalid profile rejects the whole map.

## Avoid circular proof

Run the script's regressions, then run `tests/source-contract.mjs` against a real
checkout when available. That test imports the actual schema, structural functions
and portable-lore module; it must not replace them with another local copy of the
same validator. Record revisions and test output. If dependencies/source cannot be
loaded, report source inspection and structural preflight separately.

Run from this skill's directory, with Node 24 and actual checkout paths:

```bash
node --test tests/regression.test.mjs
node tests/source-contract.mjs --engine /path/to/Marinara-Engine --agents /path/to/Marinara-Agents --zod /path/to/node_modules/zod/index.js --fixture /path/to/map.world-map.json
```

The optional --zod redirects dependency resolution without modifying source checkouts.
Use the dependency version required by that checkout. The sample lore importer test
uses an in-memory API checked by real destination schemas; it is not a live app import.

Refresh affected reference claims AND tests after upstream changes. Keep a mismatch
as evidence until understood; never weaken a test merely to make local code pass.
Do not edit upstream sources or file an issue while only authoring a personal map.
