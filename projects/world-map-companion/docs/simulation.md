# World Map Companion — Time, Schedules & Director (Task 7)

**Date:** 2026-09-07  
**Merged tip:** `6b303a9` (PR #16 → `implementation/world-map-companion`)  
**Code:** `src/simulation/` (`clock.ts`, `schedules.ts`, `npcs.ts`, `director.ts`)  
**Tests:** `tests/simulation.test.ts` (suite **93/93** at merge, including prior tasks)  
**Depends on:** Task 6 effective topology for sealed-route refusal

## Purpose

One reconciled story clock (no dual independent clocks). Deterministic schedule batching with explicit priorities. Event-triggered director for narrative judgment only — **not** per-NPC polling. Schedules never override a witnessed placement or teleport through a sealed/blocked route.

## Status

| Surface | Status |
|---|---|
| Clock / schedules / roster / director validation (unit-tested) | **IMPLEMENTED** at `6b303a9` |
| Director LLM host wiring | **PROPOSED** (`callsLlmItself: false`) |
| CompanionHostBridge / spatial-owner | **PROPOSED** |
| Engine `CapabilityDocumentStore` | **not used** (`false` in honesty labels) |
| Archive FF5.4 presets | **FROZEN** |

## Clock

`CompanionStoryClock` owns campaign story minutes. `reconcileWithNative` absorbs native world-state date/time/weather into one published commit.

Advance kinds: `wait` | `travel` | `appointment` | `long_skip` | `conversation` | `ooc` | `edit_retry` | `status_inspect`.  
OOC / edit / status force **zero** elapsed. Unknown travel duration refuses invented minutes.

Honesty: `dualIndependentClocks: false`, `capabilityDocumentStore: false`.

## Schedules

Deterministic priority (lower rank wins): **witnessed > commitment > appointment > goal > routine**.

- Expectations are **not** sightings (`isSighting: false`).
- Moves require `physicalCanReach` on the Task 6 effective map.
- Appointments mark missed after due + grace without presence.
- Operating hours may stay `UNKNOWN` explicitly.

## Roster / ticks

`SimulationTickInput.exchangeId` dedupes group-chat: multiple participants share one tick (`ticked: false` on repeat). Witness pins beat schedules until released. Interrupts suspend routine moves.

## Director

`DIRECTOR_HONESTY.perNpcPolling === false`. Event-triggered batch with budgets (`DEFAULT_DIRECTOR_BUDGET`). Validates proposals (blocked travel rejected). Does not call an LLM itself — builds invocation payloads for future host wiring.

Triggers include missed appointment, goal blocked, long-skip summary, interrupted scene, author request.

## Exit criteria (unit)

Covered in `tests/simulation.test.ts`:

- Ordinary day batch priorities along reachable routes
- Missed meeting / interrupted routine / day-long skip
- Zero-elapsed OOC/edit/status; group-chat no duplicated ticks
- Witnessed placement beats schedule; no sealed-gate teleport
- Director rejects blocked travel and per-NPC polling labels
- Honesty labels stay clear (bridge / spatial-owner PROPOSED)

## Non-claims

- Does **not** activate CompanionHostBridge or prove live Engine clock APIs.
- Does **not** invent campus hours or route durations.
- Does **not** implement Task 8 observation/consequences projections.

## Related

- Travel / topology (Task 6): `docs/travel-topology.md`
- Pack gaps (hours UNKNOWN): `docs/nevermore-pack.md`
- History selection: `docs/history-selection.md`
