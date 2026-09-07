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
