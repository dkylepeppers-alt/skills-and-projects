# Live HTTP Engine honesty (World Map Companion)

**Status:** live Fastify HTTP import/readback recorded (2026-09-07, America/Chicago).  
**Does not supersede Task 1.** Task 1 remains the in-process `createFileNativeDB` round-trip in `runtimeObservation.json` / `installation-receipt.json`.  
**Not Task 6.** This receipt is not travel/topology evidence.

## Pins

| Item | Value |
|---|---|
| Live Engine `/api/health` | `status=ok`, version `2.4.5`, commit `9bbee87d1a44`, build `2.4.5+9bbee87d1a44` |
| Engine checkout | `9bbee87d1a44c33f704977bd8c25aafbec9b85aa` |
| Agents pin (inspected) | `ee1a4a01d1091a9f5e4086c58f608e401aa1d879` |
| Implementation tip | `740cdee2cb618969a540d827800a8ef2043a30d3` (`origin/implementation/world-map-companion` after PR #11) |
| Source archive SHA-256 | `43801992b7e07ffb24c0395f32ce87b4ea4f3a40aed929eb0462e3e41b7adc93` (unchanged; `source/presets/` not modified) |

## Verified over live HTTP (`http://127.0.0.1:7860`)

| Probe | Result |
|---|---|
| `GET /api/health` | ok; `capabilityPackages.packages=[]` before and after |
| `GET /api/csrf/origin-status` | trusted for `http://127.0.0.1:7860` |
| `POST /api/import/marinara` (full FF5.4 envelope) | success → native preset id `qCr4WA0FVIdyjxgOs2l2m` |
| `GET /api/prompts/{id}/full` | 69 sections / 12 groups / 11 choice blocks; content/name/enabled/marker matched by `identifier` |
| `GET /api/prompts/{id}/export` | `marinara_preset` envelope with remapped id `qCr4WA0FVIdyjxgOs2l2m` |
| `GET /api/prompts` | stock Universal + newly imported FF5.4 |
| `GET /api/regex-scripts` | still only 2 seed scripts (native preset import did **not** install `extensions.regex_scripts`) |
| `GET /api/capability-packages/installed` | `[]` |
| `GET /api/capability-packages/catalog` | 36 packages; `hierarchical-maps` 1.4.2 present in catalog but **not** installed; `world-map-companion` **absent** |
| CompanionHostBridge HTTP | `GET/POST` `/api/companion-host-bridge`, `/api/companion/host-bridge`, `/api/capability-packages/world-map-companion/activate` → **404** |
| `GET .../world-map-companion/client` | 404 Active client package not found |

Machine-readable remaps and probe bodies: `compatibility/live-http-observation.json` only.

## Still in-process-only (not claimed as live HTTP)

- Task 1 `verifyInstalledPreset` + 25/25 regex install/readback (`runtimeObservation.json`).
- Task 2 no-op lifecycle observation (`lifecycle-observation.json`).
- CompanionHostBridge adapter unit tests (`src/host/companion-host-bridge.ts`) — PROPOSED companion adapter, not an Engine export.
- `POST /api/regex-scripts/import` for the 25 FF5.4 scripts — **skipped** on this live host to avoid bulk-mutating the running Engine regex collection beyond the one imported preset.

## Host / mutation notes

- Live server data dir: workspace Engine default `packages/server/data` (no `DATA_DIR` override). Before import the library had only the stock Universal preset — not a populated user desktop DB — so a single remapping FF5.4 preset import was treated as an acceptable honesty probe.
- Server remained healthy after import (`/api/health` still ok; packages still `[]`).
- Task 1 remaps stay authoritative for the in-process receipt (`pLwe7NpVlr3mtoYe34-jD`). Live HTTP remapped to a **different** preset id (`qCr4WA0FVIdyjxgOs2l2m`); do not mix the two id maps.

## Blockers (honest)

1. Live host advertises empty capability packages — no companion/maps activation on this process.
2. No HTTP CompanionHostBridge / `activatePackage` surface for World Map Companion.
3. Native `marinara_preset` import still omits envelope regex scripts (same gap Task 1 documented).
4. Desktop / private installer activation remains UNVERIFIED.

