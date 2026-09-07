# Hierarchical Maps — effective-state adapter (PROPOSED)

**Status:** PROPOSED patch notes for Task 6. Not an upstream Agents/Engine commit.
**Does not activate** the hierarchical-maps desktop package.
**CompanionHostBridge** remains PROPOSED (unchanged).

## Intent

Native World Maps must read the same effective topology as companion travel:

1. Immutable definition (Nevermore v2 / companion edges) is never mutated in place.
2. Branch-specific edge overlays (entrance reveals, gate opens) produce an effective definition.
3. `resolveSpatialRoute` / destinations / owner-turn validation all consume that effective result.
4. Parent navigation cannot bypass sealed crypt containment roots.

## Inspected wiring targets

Pinned Agents `ee1a4a01d1091a9f5e4086c58f608e401aa1d879`:

- `.../spatial-context/state-resolution.ts` — effective spatial state boundary
- `.../spatial-context/owner-turn.ts` — commandId, expectedDefinitionRevision, expectedCurrentLocationId, travelMode

Pinned Engine `9bbee87d1a44c33f704977bd8c25aafbec9b85aa`:

- `packages/shared/src/utils/spatial-context.ts` — route / destination algorithm

## Local companion implementation

Until an authorized upstream patch lands, the companion ships:

- `src/world/effective-map.ts` — overlay resolver
- `src/world/travel.ts` — journeys / commands
- `src/adapters/spatial-owner.ts` — PROPOSED proposal/dry-run surface

Unit topology proofs live in `tests/travel-gates.test.ts`.
Live HTTP Engine receipts are **separate** evidence files and are not required to pass Task 6 unit gates.
