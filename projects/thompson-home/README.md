# Thompson Home

Source for the **Thompson Home** world map in Marinara Engine (template
`00mw8m8yr40000YY4voq-`). The `golden-triangle-v1` build grows the original
53-location house-and-lot map into 137 locations covering the family's wider
world.

| Area | New locations |
| --- | --- |
| Golden Triangle region, Interstate 10 | 2 |
| Vidor: the Thompsons' street, Main Street, Market Basket, Vidor High, church, park | 10 |
| Raelynn's place (same street) | 11 |
| Macy's house (edge of Vidor) | 9 |
| Orange: riverfront, Lacy's house, Ashton's house | 18 |
| Beaumont: Crockett Street, Lamar University with Cardinal Village dorms | 22 |
| ExxonMobil Beaumont Refinery | 11 |

The 53 original locations keep their IDs, text, artwork and lore. Only these
changed: `thompson.property` now sits under `vidor.street`; `thompson.lot` lost
one sentence that said no street exists; the driveway, front lawn and patio
gained outgoing links.

## Files

| Path | Role |
| --- | --- |
| `world.py` | Authored locations, links, link styles, hierarchy types, the 50-name index order and directory lore |
| `maps.py` | The 13 map canvases: child placement and the schematic SVG backgrounds drawn from the same rectangles |
| `render.py` | Renders the schematic `art/background/*.svg` and `.png` (needs `rsvg-convert`). These are the layout masters the Seedream backgrounds were drawn from |
| `art-final/` | The art in use: 13 map backgrounds and 84 scene images (one per new location), Seedream 5.5 via SpicyAPI, saved as JPEG |
| `tools/` | The generation and edit scripts used for `art-final/`. They call the Engine through a local `api.sh` helper (not in the repo) that reads the Android secret from its file |
| `build.py` | Merges the expansion onto the baseline. `--apply` uploads art, creates lore and saves the template in the Engine |
| `check.py` | Reachability, hub size, duplicate-name and length checks on a build or an exported template |
| `source/live-template-rev2.json` | The template as it was before the expansion (revision 2). Baseline for offline builds and the rollback copy |
| `state.json` | Gallery image IDs and lore entry IDs created in this install, so a re-run does not duplicate them |
| `releases/golden-triangle-v1/` | The definition and hierarchy profile that were saved to the Engine |

## Build

```bash
python3 render.py
python3 build.py                 # writes build/thompson-home.world-map.json
python3 check.py build/thompson-home.world-map.json
node ../../skills/marinara-world-maps/scripts/validate-map.mjs build/thompson-home.world-map.json
python3 build.py --apply         # Engine must be running on 127.0.0.1:7860
```

`--apply` reads the Android secret from its file and never prints it. It saves
with the template's current revision, so it fails rather than overwriting an
edit made in the app.

## What the release file is not

The release in the Engine is template revision 5 (revisions 3 and 4 were an
earlier schematic-art save and its rollback).

`releases/golden-triangle-v1/thompson-home.world-map.json` is a record, not a
portable pack. Its artwork and lore fields hold this install's Gallery and
lorebook IDs, and it embeds no image bytes. Importing it into another install
would lose the art and lore bindings. Export from World Maps in the app for a
portable copy.

## Canon and invention

Canon comes from the **Thompson Family** lorebook and the character cards:
Raelynn lives a few houses down and uses the Thompsons' back door; the book
club rotates between Lacy's, Ashton's, Macy's and Laura's; the twins share a
Lamar dorm room; Kenna lives on campus and comes home on weekends; Kyle Sr. is
a refinery shift supervisor.

Everything else is authored for the map and marked in each location's
`modelMemory`: room layouts of the four homes, the hall names (Morris, Combs),
putting Lacy and Ashton in Orange, the Crockett Street district, and the
refinery site plan. Real place names are used for Lamar buildings and Vidor
landmarks, but their arrangement is schematic.

## Art

All 97 images were made with Seedream 5.5 edit (`bytedance/seedream-5.5/edit`)
through the Engine's SpicyAPI image connection.

- Backgrounds: each schematic was redrawn in the style of the original map's
  floor plans and aerials, so markers placed from `maps.py` still line up.
  Lacy's plan was edited once more to replace a white background with yard.
- Scene images: generated in the style of the original Thompson photos. The
  generator added people to 18 of them despite the prompt; those were edited to
  remove the people (`tools/edit.py`, then `tools/edit2.py` with a
  scene-specific prompt for the ones the first pass missed).
- Marker alignment was checked by eye on the plans. On the region, Beaumont and
  Orange aerials Seedream moved some features, so a few markers may sit a little
  off the building they name.

`state.json` maps location IDs to the Gallery IDs in this install: `bg` and
`ref` are the Seedream uploads in use; `art` holds the superseded schematic
uploads, which nothing references.

## Verification recorded for this release (2026-11-10)

- Skill structural validator: 0 errors.
- Saved to the Engine as template revision 5 and read back identical to the build.
- All 138 Gallery images the map references exist and are served (13 new
  backgrounds, 84 new scene images, plus the original map's art).
- Saved into a disposable Roleplay chat with the map enabled: no warnings.
  An ordinary one-hop move, three routed `travel_now` trips, one
  `step_by_step` hop and two expected rejections (a far destination without
  routing; the concealed lab) all behaved as designed. The chat was deleted.

Not checked: how the canvases and link colors look in the app's map editor,
whether illustrations actually use the new scene images, and the lore
diagnostics during a real generation.
