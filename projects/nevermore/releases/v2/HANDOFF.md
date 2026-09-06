# Nevermore Woodlands and Crypts v2

The rebuilt native map contains **79 locations, 82 embedded images, and 30 portable lore entries**. All 67 original location IDs and all 67 original location-reference images are preserved. Twelve woodland locations and their reference plates were added. The Jericho Woodlands overview was updated; its original is retained in the source archive.

## Import

1. Open World Maps and import `Nevermore-Woodlands-Crypts-v2.world-map.json` as a template. The JSON is the native import file; the source ZIP is an authoring archive.
2. For the first validation, choose **separate copies** for bundled lore rather than reusing exact-ID matches. Six recovered entries contain corrected spatial information; reusing an existing exact ID can keep its old content.
3. Apply the template to a disposable Roleplay chat. Review the draft and Save/enable as required by the import surface. Confirm the current/starting location is Wednesday and Enid’s Room.
4. Keep the older source lorebook out of the disposable test chat’s ordinary activation scope so it does not inject contradictory old crypt geography. The import does not delete or update that source book.
5. Inspect artwork restoration warnings and the new woodland references. The file is approximately 91 MB because it embeds the images, including lossless generated PNGs. Import performance has not been measured on the target device.

This file was validated against actual source modules. It has **not** been imported, saved or exercised in your running Marinara installation. Runtime import, provider reference use, and re-export remain unverified.

## What changed

- All original location IDs, the starting location, owner mode and supplied definition revision were preserved. The content is intended to be tested as a new template, not forcibly applied over protected live history.
- The crypt uses four containment components, all representing the same underground complex. Including the surface world, the definition has five roots.
- `crypts-labyrinth` is no longer a child of academy grounds. The three intended entrances are the surface connections.
- `crypts-second-rite`, `crypts-union` and `crypts-covenant` are separate roots. Threshold and First Rite remain beneath the entrance hub.
- `crypts-breath` now belongs to Second Rite, on the far side of the first gate.
- `crypts-vestment` moved from Union to Threshold.
- Holding Dark was renamed Threshold Hall without changing `crypts-holding`.
- Every chamber precedes its progression door. Echo Niche is a side recess, not an onward route.
- Dorm bedroom visits use Dorm Upper Floor. Ravencroft bedroom visits and roof access use the Family Wing gallery.
- Reciprocal available links with distinct directional labels were normalized to two unidirectional records. Each hidden entrance or progression gate has one canonical bidirectional link.
- Twelve woodland additions comprise three sectors and nine destinations. All sectors use list presentation for their children; the regional root uses the updated overview and reviewed marker placements.
- The first 50 active locations follow the accepted global index. The remaining 29 are retained in regional source order.

`source/change-manifest.json` provides exact before/after field values for every changed existing location and the parents of all additions.

## Crypt operating sequence

The starting file has three **hidden** entrances and three **blocked** progression doors. These are authored state controls, not automatic narrative triggers. The ordinary Iron Gate inside Threshold is not another progression lock.

Reveal the selected entrance by editing the link on the **source location** below from `hidden` to `available`, then save the map:

| Source location / ID | Target / ID |
|---|---|
| Poe Statue / `nevermore-poe-statue` | Poe Stair-Mouth / `crypts-stair-mouth` |
| Iron Maiden Closet / `ravencroft-iron-maiden` | Ravencroft Tunnel-Mouth / `crypts-tunnel-mouth` |
| Dorm Common Room / `dorms-common` | Crawlspace Mouth / `crypts-crawlspace` |

Any one entrance grants access to Threshold and First Rite. Reveal the other entrances separately when appropriate. Each canonical link is bidirectional, so a revealed entrance also provides a return path.

Complete the established stage in its chamber, then explicitly change its exit-door link from `blocked` to `available`:

| Stage chamber | Edit link on | Link target |
|---|---|---|
| Chamber of Caresses | Door of First Touch / `crypts-door-1` | Breath Passage / `crypts-breath` |
| Chamber of Mouths | Door of Worship / `crypts-door-2` | Chamber of Harmonies / `crypts-chamber-3` |
| Chamber of Harmonies | Door of Three / `crypts-door-3` | Approach Hall / `crypts-approach` |

Do not create another available reverse link. The canonical bidirectional link already handles the return route after opening. Reblocking a door closes travel in both directions; leave opened gates available while the party needs to retreat through them. Reaching the altar does not itself establish its boon.

The full ordinary route is: entrance mouth → Iron Gate → Threshold Hall → first chamber → first door → Breath Passage → second chamber → second door → third chamber → third door → Approach Hall → altar. Parent navigation can abstract movement within an already-accessible group; it cannot cross the three sealed boundaries in the supplied topology.

## Woodland additions

| Sector | Detailed locations |
|---|---|
| Ridge Woods / `woods-ridge` | Boundary Trail Junction / `woods-junction`; Ridge Lookout / `woods-lookout`; Weathered Ranger Cabin / `woods-cabin` |
| Blackwater Hollow / `woods-blackwater` | Old Stone Bridge / `woods-bridge`; Abandoned Sawmill / `woods-sawmill`; Flooded Quarry / `woods-quarry` |
| Western Old Woods / `woods-western` | Charcoal Clearing / `woods-clearing`; Root Cellar Ruin / `woods-cellar`; Standing-Stone Ring / `woods-stones` |

The main woodland loop connects Jericho, Old Stone Bridge, Abandoned Sawmill, Boundary Trail Junction, and Academy Gates. The existing town-to-academy connection completes it. Western forest access branches from the junction. No additional gate through the academy’s western wall, crypt entrance, supernatural property, distance or historical ownership is asserted.

## Maintaining the global index

`source/global-index.json` is the authoritative companion list of 50 selected IDs. It is not a native map field. `rebuild.py` reads it and emits those locations first, retaining every other record afterward. It verifies that all selected IDs are unique, active and present.

| Positions | Selection |
|---|---|
| 1–4 | World root, Jericho, Main Street, academy grounds |
| 5–14 | Campus landmarks and major buildings |
| 15–19 | Principal academic destinations |
| 20–22 | Common room, dorm corridor, starting bedroom |
| 23–30 | Ravencroft principal destinations and circulation |
| 31–43 | Crypt hub, Threshold Hall, stages, chambers, doors and altar |
| 44–50 | Three woodland sectors, junction, bridge, sawmill and lookout |

Append low-level additions to their regional source section. Promote a location into the global index only when its recurring importance warrants replacing an existing indexed ID. Displacement from the index never deletes or archives the location. Increasing context size or changing `sortOrder` does not increase this native 50-name slice.

Four compact directories are bundled and attached at exact locations: woodland, campus, Ravencroft and crypt. Their local attachment does not bypass lore eligibility or token budgets. Character entries remain their original lengths, so inspect actual lore diagnostics where many entries compete for the location-forced preselection budget.

## Lore preservation and corrections

All 26 source IDs were matched in the recovered native book. The portable bundle includes those linked entries, plus four newly authored directory entries. Six source entries received localized spatial corrections: The Crypts of Nevermore, First Rite, Second Rite, Union, Crypt laterals, and Ravencroft wings. Their IDs are preserved and their portable fingerprints are computed from their actual corrected payloads.

The full original lore export is preserved in the source archive. Other content and settings are preserved through the supported portable whitelist. Character/persona ownership bindings and arbitrary export metadata are not promised to round-trip through portable lore. Existing name-based relationships remain as supplied; no invented UUID remapping was applied to prose.

## Validation evidence

- Actual Engine schema and hierarchy-profile schema accept the final definition/profile.
- Actual owner projection emits the selected 50 names and reports 29 omitted names.
- Default reachability is 54 surface/woodland locations; all 25 crypt locations are inaccessible from the start.
- 63 route assertions verify each entrance independently, staged unlocking, retreat, and each gate as a cut even when the other gates are open.
- All 79 locations become reachable after revealing an entrance and opening all progression gates.
- Actual portable-lore parser/importer ran with an in-memory API checked by real destination lore schemas: 30 entries imported and all location bindings remapped.
- All 82 embedded images decode and match dimension metadata; 79/79 references and 3/3 backgrounds resolve; no unused assets remain.
- 69 original image payloads are byte-identical. The sole changed original payload is the regional overview, whose previous bytes remain in the source archive.
- Structural warnings about separate roots, inaccessible crypts, shared-corridor siblings, single-child wrappers and a truncated name index are intentional. The grounds' 13 destinations remain below the separate 50-destination projection limit.

Source revisions tested:

- Engine: `f6efd5ee607b2f084ac48ee30807aef04ea8d34f`
- Agents: `fc5efce8439a0aa3e20a7b475e8d8d083ffefe15`

These are inspected source checkouts, not a claim about your installed revisions. Detailed reports are in `checks/`.

## Runtime acceptance still to perform

- Import and inspect restored images in a disposable chat.
- Confirm the actual spatial block and lore diagnostics at a dorm room, woodland location and each crypt stage.
- Verify a rejected gate and a successful explicit unlock through the app.
- Verify the desired illustration pipeline actually attaches a current-location reference.
- Save, re-export and compare location relationships, lore remapping and image bindings. Destination IDs legitimately change during import; raw byte equality is not expected for the whole re-export.

## Rebuilding from the source archive

The archive contains the original map and lore, authored changes, global index, generated assets and prompts, local build tools and checks. It does not require modifying Marinara source. Python 3, Node 18+ and Pillow are needed for ordinary assembly/image verification; the optional real-source checks require Node 24 and the corresponding external checkouts/Zod dependency.

From the extracted project folder, choose a NEW output filename because the builder refuses overwrite:

```bash
python rebuild.py
mkdir -p build
node toolkit/build-pack.mjs --definition source/map.json --images art --pack nevermore-map-pack --lorebook source/revised-lore.marinara.json --lorebook source/directories.marinara.json --links source/lore-links.json --out build/Nevermore-rebuilt.world-map.json
python finalize.py build/Nevermore-rebuilt.world-map.json
node toolkit/validate-map.mjs build/Nevermore-rebuilt.world-map.json
node toolkit/art-inventory.mjs build/Nevermore-rebuilt.world-map.json
```

The project-specific assertions in `finalize.py` and `checks/verify-source.mjs` describe this 79-location release. Update their expected inventories when deliberately expanding beyond it. Do not weaken the blocked-route or preservation checks to make an unintended change pass.

## Release integrity

Native map: 91087299 bytes; SHA-256 `d10bef3e1d39945224d3981767fdb4c6a7a018b0710efb7322dd790be0dfd2fa`.
