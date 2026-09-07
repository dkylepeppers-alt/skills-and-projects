# Engine import/export status (Task 1)

**Status:** live in-process Engine round-trip recorded (2026-09-07).

Pinned Marinara Engine import → readback → `verifyInstalledPreset` → regex install → export completed against checkout `9bbee87d1a44c33f704977bd8c25aafbec9b85aa` using real `importMarinara` / prompts / regex storage (`createFileNativeDB`). Remapped IDs and normalized values are in `runtimeObservation.json` only. `source/presets/` bytes were not modified.

## Pinned revisions

| Repository | Revision |
|---|---|
| Marinara Engine (staging) | `9bbee87d1a44c33f704977bd8c25aafbec9b85aa` |
| Marinara Agents (staging) | `ee1a4a01d1091a9f5e4086c58f608e401aa1d879` |

## What ran

Harness: `scripts/engine-ff54-roundtrip.ts` via Bun against the Engine pin. System Node v20 cannot load Engine (`node:zlib.zstdDecompressSync`).

| Step | Result |
|---|---|
| Source SHA-256 | `43801992b7e07ffb24c0395f32ce87b4ea4f3a40aed929eb0462e3e41b7adc93` (unchanged) |
| `importMarinara` | success → native preset id `pLwe7NpVlr3mtoYe34-jD` |
| `verifyInstalledPreset` | complete; unaccounted length 0 |
| Regex import scoped to new preset | 25/25; readback matched |
| Export | `compatibility/runtime-export.marinara.json` |
| Observation / receipt | `runtimeObservation.json`, `installation-receipt.json` |

## Live HTTP follow-up (does not supersede Task 1)

A separate live Fastify HTTP exercise against `http://127.0.0.1:7860` (Engine `2.4.5` / `9bbee87d1a44`) is recorded in `live-http-status.md` and `live-http-observation.json` (2026-09-07). That path imported the same frozen FF5.4 envelope via `POST /api/import/marinara` and read it back via `GET /api/prompts/{id}/full` + `/export`. It does **not** replace this Task 1 in-process receipt; remapped IDs differ (`qCr4WA0FVIdyjxgOs2l2m` live HTTP vs `pLwe7NpVlr3mtoYe34-jD` in-process). Regex HTTP import was skipped on the live host. Capability packages remained `[]`.
