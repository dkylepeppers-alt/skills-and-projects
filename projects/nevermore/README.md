# Nevermore

Latest release: [Nevermore — Woodlands and Crypt Progression v2](releases/v2/Nevermore-Woodlands-Crypts-v2.world-map.json).
It contains 79 locations and 82 embedded images. Read the
[release handoff](releases/v2/HANDOFF.md) before importing.

Source lorebook: **Addams Family & Nevermore Academy**, preserved in
`source/original-lore.marinara.json`. The original supplied map is
`source/original.world-map.json`. Neither baseline is overwritten by the builder.

## Source and output

| Path | Role |
| --- | --- |
| `rebuild.py` | Authored map changes and location descriptions; generates working map/lore inputs |
| `source/global-index.json` | Ordered 50-location global index; deliberately promotes useful destinations |
| `source/original*.json` | Immutable supplied map and recovered lorebook baselines |
| `source/revised-lore.marinara.json` | Generated spatial corrections to the source lore |
| `source/directories.marinara.json` | Generated regional directory lore |
| `source/lore-links.json`, `source/change-manifest.json` | Generated bindings and change record |
| `source/art-plan.json`, `source/STYLE-AND-CANON.md` | Artwork prompts, provenance, and creative constraints |
| `source/*.jpg` | Original visual references used during the v2 work |
| `art/` | New generated artwork used by the builder |
| `toolkit/` | Frozen v2 assembly and structural-validation scripts |
| `build/`, `source/map.json` | Ignored generated working outputs |
| `checks/verify-source.mjs` | Optional checks against the actual Engine and Agents sources |
| `releases/v2/` | Archived import file, handoff, checksums, and recorded verification |

Edit `rebuild.py` for location/lore changes, rather than editing its generated
JSON outputs in isolation. The global index is read from its existing file and
can be edited directly. The raw location array's first 50 records determine the
known-name index; the map still contains all 79 locations.

## Rebuild

From this directory, with Node.js 24 and Python 3.10+:

```bash
python3 -m venv .venv
. .venv/bin/activate
python3 -m pip install -r requirements.txt
python3 build.py --out build/Nevermore-rebuilt.world-map.json
```

The output filename must be new. The wrapper resolves all paths relative to this
project, builds the portable lore and artwork, verifies images, and runs the
structural validator. It leaves the archived v2 map unchanged. Build-time metadata
may differ; the archived release has its own exact SHA-256 checksum.

## Verification boundaries

The original v2 checks preserved 67 location IDs and 69 original images, checked
all 82 image bindings, and exercised 63 route cases using the actual source
resolver. Hidden entrances and the three blocked progression gates are deliberate.
The five root components prevent parent traversal from bypassing those gates.
The eight structural warnings are explained in the release handoff.

Recorded source checks used:

- `Pasta-Devs/Marinara-Engine`: `f6efd5ee607b2f084ac48ee30807aef04ea8d34f`
- Agents checkout: `fc5efce8439a0aa3e20a7b475e8d8d083ffefe15`

These are external reference checkouts, not vendored into this personal repository.
To rerun the source checks, set `MARINARA_CHECKOUT_BASE` to a directory containing
the matching `engine/`, `agents/`, and `oracle-deps/node_modules/zod/` directories:

```bash
MARINARA_CHECKOUT_BASE=/absolute/path/to/checkouts node checks/verify-source.mjs build/Nevermore-rebuilt.world-map.json
```

Use the matching source revisions and a compatible Zod installation. Source
checks write fresh ignored reports under `checks/`. Archived reports describe the
v2 release at the time of its verification. A live app import/save/re-export has
**not** been verified. Do that before relying on a new release in an active game.
