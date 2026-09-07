# World Map Companion — Knowledge & Consequences (Task 8)

**Date:** 2026-09-07  
**Merged tip:** `2f6b0b4` (PR #18 → `implementation/world-map-companion`; craft tip `93aa107` / proof `5bb138d`)  
**Code:** `src/world/knowledge.ts`, `src/world/consequences.ts`, `src/world/affordances.ts`, `src/adapters/trackers.ts`  
**Tests:** `tests/knowledge-consequences.test.ts`  
**Unit proof receipt:** `compatibility/task8-knowledge-unit-proof.json` (distinct from live HTTP)  
**Chain:** Mentor craft PASS → Marinara domain PASS → merge

## Purpose

Separate **actual** world state from what each audience may know. Evidence-based communication updates rumored/known placements without inventing confirmation. Location journals, clues, rumors, objects, damage, services, and faction clocks persist as campaign overlays. Tracker adapters link to native quest/inventory/bond identities — never duplicate them.

## Load-bearing contract: earned knowledge

Craft HOLD on the first tip taught the durable rule (re-PASS at `93aa107`):

1. **Non-author projections never seed from `actualPlacements`.**  
   `projectForAudience` for `player` / `character` iterates **observer-known subjects only**. Unknown NPCs must be absent from placement rows (no expected/existence leak from the actual map). Author may see the full actual set.
2. **`falseClaim` is author-only.**  
   Player and character reports omit the key entirely. Author may retain `falseClaim: true` so a false rumor never moves the real NPC while still staying out of player-view.

Proof tests assert both. Jar-green without those filters is not enough.

## Status

| Surface | Status |
|---|---|
| Knowledge / consequences / affordances (unit-tested) | **IMPLEMENTED** at `2f6b0b4` |
| Tracker adapter | **PROPOSED**; live tracker API **UNVERIFIED** |
| CompanionHostBridge / spatial-owner | **PROPOSED** |
| Engine `CapabilityDocumentStore` | **not used** |
| Archive FF5.4 presets | **FROZEN** |

## Projections

`projectForAudience(state, audience, observerId, …)` yields per-subject:

| Field | Meaning |
|---|---|
| `actual` | Authoritative placement (nulled / omitted for non-author when unearned) |
| `known` | What this observer believes (sighting / communicated / rumor / …) |
| `lastSeen` | Last observed placement + time |
| `expected` | Schedule expectation — **not** a sighting |

Secrets (`SecretFact.detail`) stay out of player-view and character prompts. Schedules predict expected whereabouts; they never prove a sighting.

`communicateReport` updates the recipient’s rumored placement and `knownNpcIds` from the claimed report (earned knowledge path).

Stale sightings: freshness options clear actual/last-seen in player projection when age/divergence warrants.

## Consequences & affordances

- Left-behind objects, damage, service overrides, faction clocks — branch fork copies lineage; later divergence is per-branch.
- Journals distinguish established facts from leads; appointments can link into the location journal.
- Closed business / service override blocks buy affordance without inventing topology (Task 6 physical map stays separate).

## Tracker adapter (PROPOSED)

`promoteLeadToNativeQuest` / `linkObjectToInventory` / `linkFactionClockToBond`:

- One native quest identity (reject duplicates)
- One clock per bond-pair; reject conflicting scales / duplicate `nativeItemId` / `nativeBondId`
- Companion does not dual-write native quest/inventory/bond domains
- Live Engine tracker read/write remains **UNVERIFIED**

## Exit criteria (unit)

Covered cases include: false rumor, stale sighting, private room, communicated clue, left-behind object, closed business, consequence-after-branch, journal facts vs leads, tracker uniqueness, service override, **unknown-NPC omission**, **`falseClaim` omission**, appointment journal, communicate→rumored, stale freshness. Suite **110/110** at merge.

## Non-claims

- Does **not** activate CompanionHostBridge or prove live tracker APIs.
- Does **not** edit frozen FF5.4 presets or invent secret leaks into player `secrets[]` (residual Low: earned secrets still may not surface in that array — not a merge blocker).
- Does **not** implement Task 9 prompt/mode matrix.

## Related

- Travel / topology: `docs/travel-topology.md`
- Simulation / schedules: `docs/simulation.md`
- Host / bridge: `docs/host-contract.md`
