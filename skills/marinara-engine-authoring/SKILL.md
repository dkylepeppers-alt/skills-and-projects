---
name: marinara-engine-authoring
description: Use when creating, editing, converting, packaging, validating, or debugging content for Marinara Engine or Marinara Agents. Covers lorebooks and Outlets, character cards and personas, portrait and sprite packages, 2D/3D avatars (PNGTuber, mesh, VRM, MMD, GLB/FBX), hierarchical maps, prompt presets and macros, regex scripts, custom agents and tools, personal extensions, themes, downloadable capability packages, Game rulesets, creature/tile/board packs, world kits, world files, and story scripts. Trigger for Marinara content requests even when no file format is named, including .marinara.json, .world-map.json, .ruleset.json, .worldkit.json, .world.json, .tilepack.json, .creatures.json, .experience.json, .mavatar, .vrm, .pmx, and Marinara-directed SillyTavern conversions.
---

# Marinara Engine Authoring

Everything the user can put *into* Marinara Engine, plus the packages that extend it. Two source repos own the truth:

- **`Pasta-Devs/Marinara-Engine`** — the app. Owns the zod schemas for every content type (`packages/shared/src/schemas/`), the import/export routes (`packages/server/src/routes/`), the importers (`packages/server/src/services/import/`), and the user docs (`docs/`).
- **`Pasta-Devs/Marinara-Agents`** — the downloadable Agent catalog. Owns package manifests, agent definitions, and the map package's own schemas.

Checked baseline: **Engine v2.5.2** (released 2026-11-05), release commit `fc0333c3fe978cda5e0b919bd6faec985901704e`; companion Agents commit `ffde8ea4035868c064eb3b2ffd675f1f807c57ed`. See `references/source-baseline.json` for the pinned repositories. A request to update this skill means audit it against the requested **Engine source release**, including schemas, import/export boundaries and runtime consumers; copying an older skills-repository package is not that audit. Preserve user-authored additions while reconciling source changes.

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

## Route by artifact

| The user wants | Read |
|---|---|
| A lorebook / worldbook, entries, keys, timing, Outlets | `references/lorebooks.md` |
| A character card, persona, or group | `references/characters-personas.md` |
| A character identity sheet, facial-expression portraits, matching full-body portraits, sprite filenames, or a portable portrait package | `references/portrait-workflow.md` and, when packaging a native character file, `references/characters-personas.md` |
| A PNGTuber, mesh/VRM/MMD/GLB/FBX avatar, blink/talk faces, avatar settings, or .mavatar/.save/.vrm/.vrma/.pmx/.vmd/.glb/.fbx files | `references/avatars.md` |
| A hierarchical / spatial map | `references/maps.md` |
| A prompt preset, sections, markers, generation parameters | `references/presets-and-prompts.md` |
| Macros, `{{#if}}` conditionals, preset variables | `references/macros.md` |
| Regex scripts, custom tools, personal/External extensions, themes | `references/extensions-and-scripts.md`; for extension JavaScript (browser and server APIs, quickstarts, debugging) also the Engine guides it links in `docs/extending/` |
| A downloadable Agent package | `references/agent-packages.md` |
| An in-app custom Agent, its file/folder export, activation, capabilities, or output contract | `references/agent-definition.md` and `references/agent-prompt-craft.md` |
| A Game ruleset, creature/tile/board pack, world kit, generated world, Experience map pack, or world-bound story script | `references/game-content.md` |
| To know what file shape imports at all | `references/export-envelopes.md` |

Version note: these references track **v2.5.2**, rather than an unpinned `main`. Existing minimum-version notes remain feature-specific: decision activation, entry images, `{{include::}}`, `skipWrap`, and maps above 500 locations arrived on the 2.5.0 line; 2D/3D Avatars and expanded Game formats on 2.5.1. New in **2.5.2**: per-chat card field alternatives (`extensions.cardFieldAlternatives`), persona `summary` / `mes_example`, uncapped character `summary`, `{{date|time|weekday.world_state}}` macros, `{{characters}}` including inactive members, creator notes never reaching the model, presets no longer setting token limits, chat-settings-profile `personaId` / `lorebookIds`, MMD and GLB/FBX avatars, Capability API above 1.341 (v2.5.2 supports 1.816) and the Agent Organizer store. An older install ignores or rejects these. Use the version the user supplies; if it is unknown and changes the deliverable, inspect it before relying on a newer contract. Capability API compatibility is a separate gate from the Engine version range.

Upgrade note: **2.5.2 cannot be rolled back by any updater.** On first start it upgrades the data folder to storage format 10 (connection accounts, MMD and GLB/FBX avatars); 2.5.1 refuses to open it, the launcher and in-app updater refuse the downgrade, and the chat-file conversion command refuses any format ≥ 8. Tell users to make a full backup (**Download Backup**) before upgrading; the only way back is restoring a pre-upgrade backup (Engine `docs/UPGRADING.md` → **Downgrading to an older version**). Do not suggest editing the format number. Historical note: data below format 8 (a 2.5.1 or older folder that 2.5.2 has never opened) can still have its chat files converted back for an older build with that command; 2.5.0 also drops newer connection, image and game data when it saves.

Coverage: the six content templates (lorebook, character, persona, map, preset, regex) are checked against the v2.5.2 release schemas with Zod 4; the map's hierarchy profile is checked against the pinned Agents model through the validator's Zod 4 bridge shim (World Maps 1.8.0 still uses a Zod 3 API; see `scripts/README.md`). Other formats have their own validators or binary import checks, listed in their references. Schema acceptance is distinct from importer normalization, asset decoding, runtime behavior and a live UI import test. Personal extensions, themes, custom Agents and tools also have file/folder workflows; do not assume everything outside `.marinara.json` is UI-only.

Several often apply at once. A "setting pack" is usually a lorebook plus a map plus one or two cards, and the cross-links between them matter — read all three.

## Working discipline

**Do not author from memory.** Check the actual schema and consuming importer/parser for each field. Strict objects reject unknown keys; other boundaries strip, normalize or preserve them. Importers may default a field differently from its API create schema. Field presence in a type declaration alone does not prove a feature works or round-trips.

**Validate before delivering.** If a Marinara-Engine checkout is available, run the artifact through the actual schema — see `scripts/README.md`. This catches the failure modes that matter (dangling parent IDs, duplicate layer orders, unknown enum values) far faster than an import attempt does.

**Choose the artifact's real format.** Prefer native exports for the content they carry, but verify their actual omissions and ID remapping. Character native exports do not carry avatar model files; preset import discards generation parameters. Maps, Game assets, ruleset packages, avatar binaries and extension ZIPs use separate contracts. Consult `references/export-envelopes.md` rather than wrapping every artifact in `.marinara.json` or promising universal losslessness.

**Start from the matching template or upstream example.** The six content templates are checked against v2.5.2. Agent-package templates are builder inputs: regenerate their file hashes before distributing them. For large Game contracts or binary formats, start from the pinned examples/tools in the relevant reference, not a fabricated generic envelope.

## Content that references other content

Marinara artifacts point at each other by ID, and IDs are assigned at import time. That constrains what can be authored offline:

- A map location's `lorebookEntryIds` must resolve in the destination. Either link in the app or use the current portable map lore bundle and its reviewed restore/remapping workflow (`references/maps.md`). Do not substitute a flat guessed lore format.
- A lorebook's `characterIds` / `personaIds` are the same problem. Leave them empty and link in the Lorebooks panel.
- A character's `character_book` is embedded lore that travels with the card — this one *does* work offline, and is the right vehicle for lore that belongs to one character.
- `{{21-character-card-ID}}` macros need the real card ID from the app; they cannot be pre-filled.

Say this plainly when handing over a multi-part pack, rather than shipping IDs that will dangle.

## Coming from SillyTavern

Marinara imports SillyTavern World Info, character cards and install folders through dedicated mappings. Some ST extensions preserve Outlet 7, ephemeral/recursion flags, decisions and embedded lore images; support differs by exporter. Compatible character PNG and JSON also retain different assets/onboarding. Check the exact conversion route in the relevant reference and record losses, rather than treating every Compatible export alike.
