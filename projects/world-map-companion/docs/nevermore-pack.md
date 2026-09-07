# World Map Companion — Nevermore World Pack (Task 5)

**Date:** 2026-09-07  
**Merged tip (pack):** `740cdee` (PR #11 → `implementation/world-map-companion`)  
**Docs tip:** `01cc141` (includes Task 4 docs + live HTTP honesty)  
**Pack root:** `projects/nevermore/companion/`  
**Validate:** `python3 projects/world-map-companion/scripts/validate-world-pack.py`  
**Tests:** `cd projects/world-map-companion && node --test tests/world-pack.test.ts`

## Purpose

Ship a machine-readable Nevermore campaign pack for World Map Companion: every location/edge/asset joins the v2 map **by ID**, not display name. Unknown facts stay explicitly labeled. No invented canon.

## Status

| Surface | Status |
|---|---|
| Pack files under `projects/nevermore/companion/` | **IMPLEMENTED** at `740cdee` |
| Validator + Node world-pack tests | **IMPLEMENTED** |
| Task 6 travel / effective topology | separate (do not treat this doc as travel proof) |
| Live Engine import / bridge activation | separate receipts (`live-http-observation.json`, Task 1 in-process) — not this pack |
| Archive FF5.4 presets + Nevermore v2 release map/art | **FROZEN** |

## Identity

| Field | Value |
|---|---|
| `packId` | `world-pack:nevermore-v2` |
| `worldId` | `world:nevermore` |
| Source map | `projects/nevermore/releases/v2/Nevermore-Woodlands-Crypts-v2.world-map.json` |
| Source content hash | `d10bef3e1d39945224d3981767fdb4c6a7a018b0710efb7322dd790be0dfd2fa` |
| Starting location | `dorm-wednesday-enid` |

Authoritative coverage and gap list: `projects/nevermore/companion/manifest.json`.

## Files

| File | Role |
|---|---|
| `manifest.json` | Coverage, preservation policy, gaps, assumptions |
| `locations.json` | 79 locations + edges + assets mirrored from v2 by ID |
| `profiles.json` | Briefing/event-frequency profiles (coarse) |
| `npcs.json` | Recurring NPC census (12) with placement certainty |
| `aliases.json` | Ambiguous name → candidate NPC IDs |
| `schedules.json` / `services.json` / `events.json` | Sparse authored overlays; gaps stay explicit |

## Coverage (exit)

| Check | Result |
|---|---|
| Locations | **79/79** |
| Assets | **82/82** |
| Edge records | **79** (match v2) |
| Location kinds | 38 `playable-scene` / 23 `regional-container` / 10 `boundary-gate` / 8 `circulation` |
| Recurring NPC census | **12**, complete for supplied lore materials |
| Regions | town, campus, residences, Ravencroft, woodland, crypt components |

Join rule: **ID only**. Display-name matching is not authoritative.

## NPC placement honesty

Initial placements use `initialPlacement.certainty`:

- `sourced` — map/lore directly supports the opening position
- `uncertain` — associated location known; opening presence not proven
- `unknown` / `assumption` — labeled in notes; never filled with invented UUIDs or homes

Native character UUIDs are **not bound** in this pack (handoff: no invented remapping).

## Preservation

Do not edit:

- `projects/nevermore/source/original.world-map.json`
- `projects/nevermore/releases/v2/`
- `projects/world-map-companion/source/presets/`

Unknown facts policy: explicit `UNKNOWN` / `UNCERTAIN` / `ASSUMPTION` markers — never invent canon.

## Documented gaps (non-exhaustive)

See `manifest.json` `gaps` for the full list. Durable examples:

- Exact campus class/meal/office hours UNKNOWN
- Sheriff of Jericho mentioned in lore but excluded (no character entry)
- Faculty beyond Principal Weems not in supplied lorebook census
- Ophelia / Esmeralda / Belladonna permanent residences UNKNOWN
- Gomez continuous vs visiting presence UNCERTAIN
- Travel durations between edges UNKNOWN (no authored route-cost table)
- Thing vent routes are narrative, not map edges

Authored assumptions (also in manifest): school-day circulation without exact clocks; dorm bedroom IDs as student home bases when the map provides them; visitor NPCs without homes use Ravencroft Manor as visit target only.

## Non-claims

- Does **not** prove Task 6 effective topology or native spatial-owner transactions.
- Does **not** activate CompanionHostBridge or prove desktop `activatePackage`.
- Does **not** supersede Task 1 in-process import receipt or live HTTP honesty observation.
- Does **not** invent native UUIDs, extra faculty, or sealed-boundary bypasses.

## Related docs

- Pack skim README: `projects/nevermore/companion/README.md`
- Host / bridge contract: `docs/host-contract.md`
- History selection (Task 4): `docs/history-selection.md`
- Plan Task 5 exit text: `docs/2026-09-07-implementation-plan.md` (§10 Task 5)
