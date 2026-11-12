# v1.0.0 validation record

Recorded 2026-11-12 for the files listed in `SHA256SUMS`. Target: Marinara Engine v2.5.2,
commit `fc0333c3fe978cda5e0b919bd6faec985901704e`.

## Passed

- `node --test tests/agent.test.mjs`: 7/7. Covers:
  - the import shape: phase, result type, context sources, no capabilities or tools
  - one shared output contract with the no-op value, exact-name matching and full-list replacement in every mode
  - Engine macros only, with no unfilled build values
  - never voicing the user's persona
  - a valid state example, and prompt size
  - identical config in both import shapes
- `tests/check-engine.mts` against the pinned Engine source (zod 4.6.7, tsx 4.20.6):
  - The single file and the folder both pass `normalizeAgentImportEntry` and
    `importAgentConfigSchema`, with no requested capabilities, `jsonContextOutput` kept,
    `previousOutput` on, and three named prompt options (`strict`, `lean`, `custom`).
  - In the folder shape, `promptTemplatePath` and `settingsPath` resolve through the Engine's
    `collectFolderPackageEntries`.
- Confirmed by reading the pinned source:
  - `buildRuntimeAgentSectionEligibleTypes` admits a configured `pre_generation` agent whose
    `settings.resultType` is `context_injection`.
  - `isAgentAvailableInChatMode` allows custom agent types in every mode.
  - `character-voice-keeper` is not a built-in or retired agent id.

## Not verified

- The runtime placement check in `check-engine.mts` was skipped, because the Engine server's
  npm dependencies are not installed here. The source reading above stands in for it.
- No live import in a running Engine and no model run.
- Saving in the editor drops the cosmetic `defaultPromptTemplateName` and
  `defaultPromptTemplateDescription` labels, as with Intoxication Voice Keeper. The prompts
  and modes are unaffected.
