# Source authority and refresh procedure

Rechecked 2026-11-08. The contract below is the latest **released** Engine and the
Agents commit that contains World Maps 1.8.0. Unreleased staging is recorded separately
and does not change these files.

- [Marinara Engine v2.5.2](https://github.com/Pasta-Devs/Marinara-Engine/tree/fc0333c3fe978cda5e0b919bd6faec985901704e): `fc0333c3fe978cda5e0b919bd6faec985901704e`. Tag `v2.5.2`, published 2026-11-05. `main` on 2026-11-08 is this commit. Shared package depends on Zod `^4.6.7`. Node range is `>=24 <27`.
- [Marinara Agents](https://github.com/Pasta-Devs/Marinara-Agents/tree/ffde8ea4035868c064eb3b2ffd675f1f807c57ed): `ffde8ea4035868c064eb3b2ffd675f1f807c57ed`. `main` on 2026-11-08 is this commit. World Maps `packages/hierarchical-maps/manifest.json` is version **1.8.0**, manifest schema 2, Capability API **1.380**, `engine.min` `2.5.1`, `engine.maxExclusive` `4.0.0`, `builtAgainst` Engine 2.5.1 commit `3f9868540ed9264ddd228cf1b559cf1b7f2ce4de`.

Unreleased on 2026-11-08, not the authoring target:

- Engine staging `27e363843f768bbedf04b8467e10f443fa832d09` is 186 commits ahead of v2.5.2. The spatial-context schema, structural validator, location-reference reader, and lorebook forced-entry files are the same blobs as the release. The only spatial-named file that differs is `docs/game/map-time-weather.md` (3 lines): it renames Classic / Overworld RPG wording to VN / Overworld. That is not a hierarchical-map file change.
- Agents staging `819692bc7d0e1636d427c1044897d56ff0d26ce0` has the same `packages/hierarchical-maps/` tree as `ffde8ea`.

Do not infer package compatibility from an Engine version alone. Engine v2.5.2
`supportedCapabilityApi` is `{ major: 1, minor: 816 }`. Engine v2.5.1 is minor 341.
`getCapabilityApiCompatibilityIssue` rejects a schema-2 package whose minor is above
the running Engine. World Maps 1.380 therefore installs on 2.5.2 and is rejected by
2.5.1 even though the manifest says `engine.min` `2.5.1`. Read the installed manifest
before promising an install. The spatial-context schema blob is unchanged from v2.5.1;
the 5,000-location cap arrived in Engine v2.5.0 (`f043ebe59`) and World Maps 1.5.0.
Engines before v2.5.0 cap a map at 500 and skip a larger map when a game starts;
`validate-map.mjs` warns `legacy_location_cap` above 500.

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

- The schema allows 5,000 stored nodes, including archived nodes (`SPATIAL_CONTEXT_LIMITS.maxLocations` and `SPATIAL_MAP_LOCATION_LIMIT`). The owner prompt indexes the first 50 active nodes in definition order, reports how many names were omitted, and separately takes 50 resolved one-hop destinations. This is not adaptive ranking. The retired cap is 500, from before World Maps 1.5.0.
- An assistant `spatial_move` commits the current place, an existing one-hop destination, or a farther active place when `resolveSpatialRoute` finds a path of active containment and available links (maximum 64 locations). Hidden and blocked links are not opened. The turn prompt still says a known arrival through a newly revealed or secret route is recorded directly. That sentence is not what the move consumer does. Name-only location guidance, without a move directive, remains one hop. Do not encode the prompt's secret-route sentence as an unlocking mechanism.
- `awarenessSummary` is stored, edited in the location inspector, and copied from AI drafts. `buildOwnerSpatialProjection` does not read it.
- Roleplay agent context `currentLocation` is `{ path, description }` from the owner projection (`agentCurrentLocationFromProjection`). The Illustrator reads that block under Tracker data. It does not include `modelMemory`. Game owner mode does not fill this agent field.
- Current Engine location-forced lore has a preliminary 2,048 estimated-token budget (`CURRENT_LOCATION_LORE_TOKEN_BUDGET`) before merging with ordinary activations and applying further budgets. An entry skipped by that preliminary path may still activate ordinarily. This is not a size limit on the portable bundle and not an unconditional ban on its content. The lorebook service file changed between v2.5.1 and v2.5.2; this constant is still present at the v2.5.2 pin.
- A parser accepting an artwork data-URL prefix is not an image decode. `parseBundledArtwork` skips malformed records and keeps the last accepted record for a duplicate `sourceImageId`. Import can continue with failures restoring some images. Library import restores referenced images into Global Gallery; chat import can restore chat-owned images to that chat. `sourceImageId` is the remapping key. `global-gallery:<id>` references can be preserved on a template; other chat Gallery IDs are dropped from template data.
- Profile normalization uses the base schema and fallback/repair logic. Do not claim that every invalid profile rejects the whole map. Link-style keys that survive normalization are `spatialLinkPresentationKey` values: the two location IDs sorted with `localeCompare` and joined with `|`.
- World Maps 1.8.0 `maps-model.ts` lines 49–50 still call Zod 3 `.innerType()` on `spatialContextDefinitionSchema`. Zod 4 does not provide that method. `scripts/engine-contract-bridge.mjs` adds it only when it is missing, cloning the Engine schema without its refinement checks, which is what Zod 3 returned. Engine parsing of the original schema is unchanged. Loading the maps model without that shim throws `innerType is not a function`.

## Avoid circular proof

Run the script's regressions, then run `tests/source-contract.mjs` against a real
checkout when available. That test imports the actual schema, structural functions
and portable-lore module; it must not replace them with another local copy of the
same validator. Record revisions and test output. If dependencies/source cannot be
loaded, report source inspection and structural preflight separately.

Run from this skill's directory with Node 24 and Zod 4.6.x. Node 24 strips the
TypeScript in the checkouts. Do not add a second TypeScript loader; it re-enters
the same module and fails. The source-contract hook resolves `@marinara-engine/shared`
through `scripts/engine-contract-bridge.mjs` and rewrites relative `.js` specifiers
to the sibling `.ts` source.

```bash
node --test tests/regression.test.mjs
node tests/source-contract.mjs --engine /path/to/Marinara-Engine --agents /path/to/Marinara-Agents --zod /path/to/node_modules/zod/index.js --fixture /path/to/map.world-map.json
```

Check out Engine `fc0333c3fe978cda5e0b919bd6faec985901704e` and Agents
`ffde8ea4035868c064eb3b2ffd675f1f807c57ed`. `--zod` redirects dependency resolution
without modifying source checkouts. Use Zod 4.6.x; Zod 3 crashes this Engine before
a map check. The sample lore importer test uses an in-memory API checked by real
destination schemas; it is not a live app import. The bridge always loads the
checkout's spatial schema and utility sources, never a built `packages/shared/dist/`,
so a stale build cannot stand in for the pinned commit.
Node may warn that Agents files are typeless because that repository does not set
`"type": "module"`. Leave the upstream package untouched; Node reparses those files
as ESM and the check can still pass.

Refresh affected reference claims AND tests after upstream changes. Keep a mismatch
as evidence until understood; never weaken a test merely to make local code pass.
Do not edit upstream sources or file an issue while only authoring a personal map.
