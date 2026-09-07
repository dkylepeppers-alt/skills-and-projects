# World Map Companion — Travel & Effective Topology (Task 6)

**Date:** 2026-09-07  
**Merged tip:** `0b483bf` (PR #13 → `implementation/world-map-companion`; later tip includes Task 7)  
**Code:** `src/world/` (`spatial-graph.ts`, `effective-map.ts`, `travel.ts`)  
**Tests:** `tests/travel-gates.test.ts`  
**Depends on:** Task 5 Nevermore pack (ID-joined edges)

## Purpose

One effective topology for every travel consumer: immutable map definition + branch overlays. Player and NPC movement share the same physical constraints. Discovery, social permission, and closed services are separate filters — they do not invent edges.

## Status

| Surface | Status |
|---|---|
| Effective map + travel / journeys (unit-tested) | **IMPLEMENTED** |
| Spatial-owner adapter | **PROPOSED** (no package `activate`) |
| Live Engine HTTP honesty | **separate receipt** (`NOT_RUN` by default in travel tests) |
| CompanionHostBridge live wire-up | **PROPOSED** / UNVERIFIED |
| Archive FF5.4 + Nevermore v2 release | **FROZEN** |

## Effective map

`resolveEffectiveMap(base, overlay)`:

- **Base** — immutable `SpatialDefinition` (Nevermore v2 / companion edges). Overlays never mutate it (`freezeDefinition` / clone).
- **Edge state overlays** — per-edge `available` | `hidden` | `blocked` keyed `fromId->toId`.
- **Discovery overlays** — per-observer known locations / edge keys (knowing ≠ opening).
- **Social permission** — separate from physical access.
- **Service overlays** — open/closed; no topology invention.

Physical helpers (`physicalRoute`, `physicalCanReach`, `physicalReachable`, `physicalDestinations`) read the effective definition only. Observer-visible destinations apply discovery/social filters on top.

## Travel

`validateTravelCommand` / `planJourney` / `advanceJourneyStep` / `interruptJourney` / `resumeJourney` / `planPartySplit` / `proposeNpcTravel`:

- Shared physical constraints for `player` and `npc`.
- Commands carry `commandId`, `expectedDefinitionRevision`, `expectedCurrentLocationId` for native spatial-owner coherence (adapter still PROPOSED).
- Modes: `step_by_step` | `travel_now`.
- Travel-time proposals stay honest: Nevermore has no authored route-cost table → `certainty: "unknown"` unless explicitly authored/assumed.

## Exit criteria (unit)

Verified in `tests/travel-gates.test.ts`:

- Immutable base not mutated by overlays
- **63** Nevermore route assertions; default surface reach **54**; all-open gates **79**; sealed crypt boundaries hold (no parent-nav bypass)
- Hidden entrances independently discoverable
- Branch rollback restores blocked routes without mutating base
- Closed service ≠ topology; social permission separate
- Party split / mid-journey interrupt+resume / fast-travel prereqs
- Player and NPC equally rejected on sealed gates
- Spatial-owner honesty **PROPOSED**; live HTTP receipt distinct

## Non-claims

- Does **not** prove live spatial-owner package activation or Engine route instrumentation.
- Does **not** invent travel durations or open sealed crypts via parent navigation.
- Does **not** replace Task 7 schedule/clock behavior.

## Related

- Pack contract: `docs/nevermore-pack.md`
- Simulation (Task 7): `docs/simulation.md`
- Host / bridge: `docs/host-contract.md`
