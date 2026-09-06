# Repository preparation checks

Checked on 2026-09-06 before remote publication:

- Both skills: 47 original files preserved byte for byte.
- Existing world map regression suite: 14 passed, zero failed.
- All committed JSON parsed; both skill frontmatter names verified.
- Nevermore release: 79 locations, 82 embedded images, archived checksums verified.
- Rebuilt from the organized project: exact release hash reproduced,
  `d10bef3e1d39945224d3981767fdb4c6a7a018b0710efb7322dd790be0dfd2fa`.
- Original generated source JSON reproduced without differences.
- Image verification: 82 images decoded; 69 original images unchanged; no unused assets.
- Source verification using the recorded upstream revisions: 63 route cases passed,
  schemas passed, all portable lore bindings remapped.
- Workflow YAML parsed and publishing shell syntax checked.

The publishing helper was not run against GitHub. Hosted CI has not run. No live
Marinara app import/save/re-export was performed. The GitHub connection did not
expose a repository-creation action, so remote creation and push remain pending.
