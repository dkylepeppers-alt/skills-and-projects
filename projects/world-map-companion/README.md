# World Map Companion

Implementation of the [full campaign plan](docs/2026-09-07-implementation-plan.md), based on the complete Nevermore v2 map and the unchanged FF5.4 Agent Gating preset.

The first release remains gated on the complete campaign system, Engine/Maps integration, private installation, and whole-world acceptance. Individual implementation commits are development checkpoints, not a smaller release.

## Preset preservation

The original preset and `source/presets/ff54-baseline.json` are immutable inputs. Run:

```sh
python3 projects/world-map-companion/scripts/audit-preset.py
node --test projects/world-map-companion/tests/preset-audit.test.ts
```

The auditor verifies both archived hashes and every preset record. It reports all 69 sections, 12 groups, 11 choice blocks, 25 regex scripts, the original defaults, and the seven disabled agent markers. `--output PATH` writes a separate report; neither input can be used as its output.

Archive integrity is separate from Engine import and behavior verification. Passing this audit alone does not establish runtime compatibility.

## Source baselines

- Engine: `9bbee87d1a44c33f704977bd8c25aafbec9b85aa`
- Agents: `ee1a4a01d1091a9f5e4086c58f608e401aa1d879`
- Private implementation branch: `implementation/world-map-companion`

Upstream source checkouts and dependencies stay outside this repository. Nevermore source IDs, lore, topology, and artwork remain under their existing project paths.

## History selection (Task 4)

Authoritative swipe/edit/delete/branch/checkpoint selection and durable pending-job recovery live in `src/state/history.ts` and `src/state/checkpoints.ts`, backed by the Task 3 file repository (not Engine `CapabilityDocumentStore`). Contract and status: [`docs/history-selection.md`](docs/history-selection.md). Merged at `4008b1e`. Live Engine `selectHistory` wire-up remains PROPOSED / UNVERIFIED.

## Compatibility adapter

`compatibility/preset-compatibility.ts` imports through an `EnginePresetApi` adapter, records native ID remaps, and installs the 25 embedded scripts through the separate regex API. It preserves the complete original envelope as its source sidecar. The field ledger records native values, documented normalization, and sidecar-only metadata.

All regexes are scoped to the new preset. Installation preflights executable fields, requires exact text preservation, checks one-to-one object identities and parent relationships, and compares every translated regex field against readback. It never enables disabled preset markers.

Pass an asynchronous `checkpoint(receipt)` callback backed by durable storage; resume with the saved `resume` receipt after interruption. A failed checkpoint stops further writes. A receipt belongs to one exact source and imported preset. Retrying a complete receipt verifies and reuses its records. The native preset-create API has no idempotency key: if that first response is lost before any receipt exists, inspect the host's imported presets before starting another installation.

```sh
cd projects/world-map-companion
npm test
```

These local tests verify adapter failure handling and preservation contracts. Separate source-runtime checks are required before compatibility is release-ready.

Live Engine import/export for Task 1 is **blocked** in this workspace (no Engine checkout). See `compatibility/engine-import-status.md` and the pinned Engine/Agents revisions above.
