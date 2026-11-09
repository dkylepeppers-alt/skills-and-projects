# v1.0.1 validation record

Recorded 2026-11-09 for the files listed in `SHA256SUMS`. Target: Marinara Engine v2.5.2,
commit `fc0333c3fe978cda5e0b919bd6faec985901704e`.

## Fixes over v1.0.0

- **Folder import paths.** The folder envelope's entry path now includes the
  `Intoxication-Voice-Keeper/` folder name. Engine folder import keeps that name in every path
  (`webkitRelativePath`), and it resolves `prompt.md` and `settings.json` relative to the entry
  path. In v1.0.0 neither file resolved, so the import silently used the inline copies.
- **Editor save.** Sobering rate, slur level and the note word limit are now written into the
  prompt text. v1.0.0 kept them as settings-backed placeholders. The 2.5.2 agent editor
  (`AgentEditor.tsx`) rebuilds `settings` on save and drops keys it does not know, so those
  placeholders would have gone blank after any edit.

## Passed

- `node --test tests/agent.test.mjs`: 5/5. The tests now also require Engine macros only in
  every prompt, no unfilled build values, and an envelope entry path that names a shipped file.
- `tests/check-engine.mts` against the pinned Engine checkout (zod 4.6.7, tsx 4.20.6):
  - Both import shapes pass `normalizeAgentImportEntry` and `importAgentConfigSchema`, with no
    requested capabilities.
  - In the folder shape, `promptTemplatePath` and `settingsPath` resolve through the Engine's
    `collectFolderPackageEntries`. The same check fails against the v1.0.0 build.

## Not verified

- Runtime placement check skipped (the Engine server dependencies are not installed). It was
  confirmed by reading the source instead, as recorded for v1.0.0.
- No live import in a running Engine and no model run.
- Saving in the editor still drops the cosmetic `defaultPromptTemplateName` and
  `defaultPromptTemplateDescription` labels. The prompts and modes are unaffected.
