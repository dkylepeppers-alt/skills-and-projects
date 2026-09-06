---
name: marinara-world-maps
description: Design, build, audit, repair and package Marinara Engine hierarchical world maps, including offline worldbuilding, location trees, travel links, symbols, location prose, portable lorebooks, reference artwork and child-map backgrounds. Use for World Maps/spatial context, .world-map.json files, map packs, location-art coverage (including floors and rooms), lore-to-location binding, or creating towns, campuses, dungeons, houses, vessels and fictional worlds for Marinara.
---

# Marinara World Maps

Build a world that is coherent to explore, interesting to inhabit, visually consistent,
and honest about what the app implements. Default to authoring outside the app:
editable map, lore, art sources and manifests first; an importable JSON pack second.
Operate independently of the general Marinara authoring skill. Leave that skill unchanged.

## Private skills and projects workflow

Use [dkylepeppers-alt/skills-and-projects](https://github.com/dkylepeppers-alt/skills-and-projects)
as the user's canonical private home for these skills and their project sources.
Read its current `AGENTS.md`, relevant README, and existing files before editing;
compare repository and installed skill revisions before reconciling differences.

- Maintain reusable packages under `skills/marinara-engine-authoring/` and
  `skills/marinara-world-maps/`; keep project-specific content under
  `projects/<short-name>/`.
- For Nevermore, use `projects/nevermore/source/` for source material and
  `projects/nevermore/art/` for artwork. Inspect the project guide and release
  history to identify the current baseline; do not assume an old chat attachment
  or a hard-coded release version is current.
- Follow the repository's branch, validation and Git LFS conventions. Build in
  ignored `build/` folders and preserve released snapshots under
  `projects/<short-name>/releases/<version>/`. Treat Nevermore's `toolkit/`
  as a release-specific snapshot.
- Keep repository skill copies and installed personal skills aligned when
  updating a skill; verify each save separately and report any access or sync gap.
  Preserve source IDs, lore bindings, artwork and unfinished-work status.
- The private repository owns authored project history; the upstream Engine and
  Agents implementations remain authoritative for schemas and runtime behavior.
  Keep upstream checkouts read-only during personal content work.
- A request for an explanation or review does not authorize project edits.
  Make task-scoped changes when requested; do not silently change maps, regenerate
  art, publish publicly, or treat this workflow as blanket merge permission.
  If repository access fails, state the gap and use supplied files provisionally.

## Source authority

Read [source-truth.md](references/source-truth.md) before making technical claims.
Trace the target build's importer → parser → persistence → consumer. Treat repository
docs, old skills, model explanations and example packs as hypotheses, not contracts.
Record both Engine and World Maps package revisions; their versions can differ.

Separate evidence levels in every handoff:

- **Structural preflight:** file shape, references and the script's checked invariants.
- **Source-confirmed:** inspected implementation at named revisions.
- **Runtime-imported:** actually imported, saved and exercised in the target app.
- **Creative recommendation:** a design choice, not a parser rule or guarantee.

A locally written validator is not independent proof that the app accepts its output.
Use the real source contract as an oracle where available; otherwise state that gap.

## Route by work

| Work | Read |
| --- | --- |
| Fields, formats, limits and hierarchy profiles | [schema.md](references/schema.md) |
| Prompt projection, movement, secrets, lore activation | [runtime.md](references/runtime.md) |
| Worldbuilding, social geography, topology and scale | [worldcraft.md](references/worldcraft.md) |
| Names, descriptions, private scene guidance and symbols | [writing-locations.md](references/writing-locations.md) |
| Campus, house, city, tower, vessel, dungeon and wilderness recipes | [patterns.md](references/patterns.md) |
| Art direction, generation/editing, coverage and binding | [artwork.md](references/artwork.md) |
| Offline source layout, lore bundles, builder and import handoff | [offline-authoring.md](references/offline-authoring.md) |
| In-app drafting/expansion or prompt overrides | [ai-builder.md](references/ai-builder.md) |

For an end-to-end world, read schema, runtime, worldcraft, artwork and offline authoring.
Use the other references when their decisions arise; do not load unrelated general
Marinara documentation just because it exists.

## Keep six layers distinct

1. **Containment:** parent IDs organize locations. Active parent/child traversal is
   also native; a floor is not automatically a non-traversable folder.
2. **Travel:** directed available links augment containment. Link state restricts
   an edge, not every way of reaching its target.
3. **Prompt context:** the current location's description/model memory plus bounded
   names and destinations. Parent descriptions are not automatically inherited.
4. **Lore:** location-to-entry links plus independently evaluated lorebook settings.
   Binding an entry is not a promise that its whole content reaches every prompt.
5. **Visuals:** a current-location reference and a parent's child-map background
   are independent roles. Neither image nor coordinates replace textual orientation.
6. **Distribution:** the native envelope bundles supported payloads. Companion
   authoring files are not magically imported just because they share a ZIP.

## Offline workflow

1. Inspect supplied files without modifying originals. Safely inventory archives:
   reject traversal paths/symlinks and excessive expansion; identify actual JSON members.
2. Establish the intended experience, canon source, scope, owner mode and target
   build. Ask only questions that materially affect design; otherwise state assumptions.
3. Draft a play brief: central promise, everyday life, pressures, signature places,
   likely journeys, growth points and intended revelations.
4. Build a location inventory including every root, region, settlement, building,
   floor and room. Preserve existing IDs. Give structural nodes deliberate scene
   and artwork policies, not accidental omissions.
5. Design containment and travel separately. Walk public, private, accessible,
   service and emergency routes. Test alternate access to every gated destination.
6. Write each playable node to stand on its own. Keep reusable canon in lore;
   keep essentials here. Mark inventions and disputed canon in a source sidecar.
7. Plan images by location ID AND role. Approve a style bible and a small set of
   representative plates before large batches. Use the art workflow below the main skill.
8. Bind real source lore IDs or supported portable references. Resolve duplicate
   names explicitly; never guess a UUID or deliberately falsify a fingerprint.
9. Assemble using `scripts/build-pack.mjs`; preserve existing artwork, profiles
   and bundles. Keep prompts, provenance, licenses and source masters separately.
10. Run `scripts/validate-map.mjs` and `scripts/art-inventory.mjs`; inspect all
    errors and decide each warning. Exercise the actual source checks if available.
11. Deliver the importable JSON and, when requested, a companion source archive.
    Explain the exact import surface, lore matching choice, save/apply/enable steps,
    ID remapping, known risks and what has not been tested in the app.

## Guardrails that prevent recurring errors

- Emit literal emoji or compact symbols for `icon`, not Lucide names. Do not
  rewrite every symbol without reviewing existing choices.
- Do not describe 50 names as a 50-location storage cap, a proximity-selected index
  or the server's complete set of recognizable locations.
- Do not equate graph hops with user turns: distinguish ordinary movement,
  explicit routed travel and assistant directives.
- Do not promise that narrative discovery opens a pre-existing hidden link.
- Treat `modelMemory` as model guidance, not a secure secret or a state machine.
- Do not rely on `awarenessSummary` for owner-prompt facts without finding its consumer.
- Put bytes in `artwork[].data`. A `sourceImageId` is a remapping key, not an
  image or a guaranteed destination Gallery UUID.
- Keep portable entries inside `portableLore.books[].entries`, not at bundle root.
  A bundle parser passing does not validate all destination lore API settings.
- Do not ship `portableLore: {}`. Omit absent lore.
- Do not claim that import is transactional or that nothing persists before Save:
  lore/art and library imports have distinct persistence steps.
- Do not put unsupported flags, NPC schedules, encounters, audio, scripts or
  tactical-map state into strict location objects. Offer supported companion formats.
- Keep source repositories read-only for personal content work. Do not install
  app packages, change presets, spend on image batches or publish upstream without scope.

## Completion

Use [the world brief](assets/world-brief.md) and [art plan](assets/art-plan.example.json)
as editable companion starters. Copy [the minimal definition](templates/definition.minimal.json)
for a small build or [the complete example envelope](templates/world-map.export.json)
for profile and portable-lore wiring. Its artwork is intentionally unassigned.

Report actual locations/art roles/lore bindings, distinguish missing from deliberately
unassigned, and include floors and rooms in coverage. Preserve the full user fixture
outside the skill; ship small generic templates instead of someone's campaign or
megabytes of private art. Use concise import instructions and never label untested
runtime behavior as proven.
