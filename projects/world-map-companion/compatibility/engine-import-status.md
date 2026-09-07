# Engine import/export status (Task 1)

**Status:** blocked in this workspace.

Live Marinara Engine import → readback → export was not run because no Engine
checkout is present. Do not invent remapped IDs or normalized export values.

## Pinned revisions

| Repository | Revision |
|---|---|
| Marinara Engine (staging) | `9bbee87d1a44c33f704977bd8c25aafbec9b85aa` |
| Marinara Agents (staging) | `ee1a4a01d1091a9f5e4086c58f608e401aa1d879` |

## What remains when an Engine checkout is available

1. Import the immutable FF5.4 envelope through `POST /api/import/marinara`.
2. Read `GET /api/prompts/{newPresetId}/full` and pass it through `verifyInstalledPreset`.
3. Export `GET /api/prompts/{newPresetId}/export` and record remapped IDs / normalized values in `runtimeObservation` without changing `source/presets/` bytes.
4. Install all 25 regex scripts through `POST /api/regex-scripts/import`, scoped to the new preset ID, then read them back.

Local archive proofs and the compatibility adapter/tests remain the in-repo Task 1 evidence until that round-trip exists.
