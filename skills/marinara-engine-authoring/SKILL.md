---
name: marinara-engine-authoring
description: Author anything that goes into Marinara Engine — lorebooks, character cards, personas, hierarchical maps, prompt presets, regex scripts, custom tools, personal extensions, themes, and downloadable Agent packages — against the real schemas in Pasta-Devs/Marinara-Engine and Pasta-Devs/Marinara-Agents. Use this whenever the user mentions Marinara Engine, Marinara Agents, a `.marinara.json` file, a worldbook or lorebook entry for Marinara, a character card or persona for Marinara, a spatial/hierarchical map, an Outlet entry, a prompt preset or preset variables, or wants to build, convert, port from SillyTavern, validate, or debug any importable Marinara artifact. Use it even when the user only describes the content ("a worldbook for my setting", "a map of this town", "an agent that tracks X") without naming a format.
---

# Marinara Engine Authoring

Everything the user can put *into* Marinara Engine, plus the packages that extend it. Two source repos own the truth:

- **`Pasta-Devs/Marinara-Engine`** — the app. Owns the zod schemas for every content type (`packages/shared/src/schemas/`), the import/export routes (`packages/server/src/routes/`), the importers (`packages/server/src/services/import/`), and the user docs (`docs/`).
- **`Pasta-Devs/Marinara-Agents`** — the downloadable Agent catalog. Owns package manifests, agent definitions, and the map package's own schemas.

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
| A hierarchical / spatial map | `references/maps.md` |
| A prompt preset, sections, markers, generation parameters | `references/presets-and-prompts.md` |
| Macros, `{{#if}}` conditionals, preset variables | `references/macros.md` |
| Regex scripts, custom tools, personal extensions, themes | `references/extensions-and-scripts.md` |
| A downloadable Agent package | `references/agent-packages.md` |
| To know what file shape imports at all | `references/export-envelopes.md` |

Version note: the references track Engine v2.5.0 and the Agents catalog as of October 2026. Decision activation and `decision:` conditions, lorebook entry images, `{{include::}}`, preset `skipWrap`, and maps above 500 locations need Engine 2.5.0 or later. An older install fails or ignores them, so ask which version the user runs before relying on them.

Coverage note: lorebook, character, persona, map, preset, and regex-script formats have each been verified against the Engine's own schemas — the first four via templates in this skill, the last two against real exports. Custom tools, personal extensions, and themes are documented from their schemas but have no file format to verify, since they are created in the app.

Several often apply at once. A "setting pack" is usually a lorebook plus a map plus one or two cards, and the cross-links between them matter — read all three.

## Working discipline

**Do not author from memory.** Every content type here has a strict or near-strict zod schema, and Marinara has diverged from SillyTavern in ways that are easy to guess wrong (Outlet position 7, entry folders, `ephemeral`, `activationConditions`, layer ordering on maps). Before emitting a file, check the field against the schema listed in the relevant reference. A hallucinated key on a `.strict()` schema fails the whole import with one terse error.

**Validate before delivering.** If a Marinara-Engine checkout is available, run the artifact through the actual schema — see `scripts/README.md`. This catches the failure modes that matter (dangling parent IDs, duplicate layer orders, unknown enum values) far faster than an import attempt does.

**Prefer the native envelope.** Marinara reads its own `.marinara.json` exports losslessly and reads foreign formats (SillyTavern World Info, V2 character cards) through a lossy mapping. When authoring fresh content, emit native.

**Start from `templates/`.** Every file there has been parsed by the real Engine schema and is valid as shipped. Replace the content, keep the shape.

## Content that references other content

Marinara artifacts point at each other by ID, and IDs are assigned at import time. That constrains what can be authored offline:

- A map location's `lorebookEntryIds` refers to entry IDs that do not exist until the lorebook is imported. Author the map with empty arrays and link inside the app, or ship the map with a portable-lore bundle (`references/maps.md`).
- A lorebook's `characterIds` / `personaIds` are the same problem. Leave them empty and link in the Lorebooks panel.
- A character's `character_book` is embedded lore that travels with the card — this one *does* work offline, and is the right vehicle for lore that belongs to one character.
- `{{21-character-card-ID}}` macros need the real card ID from the app; they cannot be pre-filled.

Say this plainly when handing over a multi-part pack, rather than shipping IDs that will dangle.

## Coming from SillyTavern

Marinara imports SillyTavern World Info files, V2 character cards, and whole ST install folders, and maps ST fields onto its own. What Marinara adds on top — Outlets, entry folders, `ephemeral`, scheduling, activation conditions, per-entry vector settings, `additionalMatchingSources` — has no ST equivalent and is lost on a round trip through Compatible JSON. When converting an existing ST worldbook, the interesting work is deciding which of those additions to apply, not the field mapping itself.
