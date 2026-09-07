# Effective-state adapter — proposed integration steps

1. When companion commits an edge overlay event on a branch, publish an effective definition revision bump (companion-owned), or inject link-state overlays into the definition copy used by `resolveEffectiveSpatialState`.
2. Ensure `commitSpatialOwnerTurn` validates against that effective definition (same revision the client sent as `expectedDefinitionRevision`).
3. On history swipe/branch rollback, drop overlays that are not in the selected lineage — routes re-block without editing the shared world archive.
4. Keep discovery/social permission out of the physical adjacency graph.

**Honesty:** This document is not a merged Agents patch. Archive presets and Nevermore v2 release bytes remain frozen.
