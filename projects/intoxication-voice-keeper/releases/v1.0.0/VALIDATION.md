# v1.0.0 validation record

Recorded 2026-11-09 for the files listed in `SHA256SUMS`.

Target: Marinara Engine v2.5.2, commit `fc0333c3fe978cda5e0b919bd6faec985901704e`.

## Passed

- `node --test tests/agent.test.mjs` (Node 22.23.4): 5/5. Covers agent shape, the context-source
  ids, a shared output contract across all four prompt modes, every placeholder backed by a
  setting or Engine macro, valid JSON in the state example, and identical config in both shapes.
- `tests/check-engine.mts` against the pinned Engine checkout (zod 4.6.7, tsx 4.20.6). It
  runs the Engine's own code:
  - `getFolderImportEntries` for the single file, and `collectFolderPackageEntries` for the folder
  - `normalizeAgentImportEntry` from `client/src/lib/agent-transfer.ts`
  - `importAgentConfigSchema`
  - `normalizeCustomAgentContextSources`, `normalizeAgentPromptTemplateOptions` and
    `normalizeCustomAgentCapabilities`

  Both shapes import with no requested capabilities. Phase `pre_generation`, result type
  `context_injection`, `jsonContextOutput` and the Previous output source all survive import.
  The three named prompt options are kept.

## Not verified

- Runtime placement check skipped: the Engine's server modules need its installed dependencies
  (`pino`), and this checkout had none. Placement was confirmed by reading the source instead:
  `runtime-agent-sections.ts` makes a custom `pre_generation` + `context_injection` agent
  eligible. `agent-pipeline.ts` collects its `text`. `agents.storage.ts` and `agent-output.ts`
  keep and return `agent-context`.
- No live import in a running Engine.
- No model run. The quality of the notes and state tracking depends on the agent's model and
  has not been measured.
