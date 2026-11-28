# Gallery Illustrator 1.0.1 verification

Recorded November 27, 2026.

- All 17 project unit tests passed on Node 24. Rebuilding reproduced the 12 package files listed in SHA256SUMS.
- The built extension passed its Chromium test at a 412 × 860 viewport against the mock Engine API. The first storage read failed deliberately. The panel exposed Retry, recovered the existing disabled tag, accepted edits, synchronized all five prompts, and preserved the old tag after saving the new ones.
- The single-file and folder imports passed the pinned Engine's actual normalization, schema, capability and template checks.
- PATCH11 applied to a clean worktree containing the PATCH10 files it changes. The Engine shared build and server TypeScript check passed. The gallery-reference-pool regression passed, including same-name owners, a refused first pick, a conflicting slot, legacy records, missing and reordered replay inputs, and a catalog larger than 120 entries.
- The integration checkout used staging df60575 and PATCH10. Four context mismatches in PATCH10's two generation routes were adapted to run the checks without the separate local PATCH2–9 bundle. PATCH11 does not modify either of those routes. The regression used an empty interface list for the Engine's host-ID initialization because the test host restricts network-interface enumeration.
- The repository validator and Git LFS integrity check passed. Live image generation against the user's Marinara instance and SpicyAPI remains unverified.

## Avatars and UI-import lookup (2026-11-28)

- PATCH12 (after PATCH11) adds `ca:<character id>` and `pa:<persona id>` pool ids for avatars. Checked on the
  user's live install (staging `df60575` + PATCH2–9 + PATCH8b + PATCH10 + PATCH11 + PATCH12): the
  gallery-reference-pool regression passes, including avatars refused outside the cast, an avatar sharing its
  owner's letter with their gallery body picture, owners without an avatar, and the per-chat filter keeping cast
  avatars only. `tsc --noEmit` on the server reports no errors. The patches apply in order and reproduce the live
  tree exactly.
- The extension lists each owner's avatar first in that owner's Pool view and recognizes the Agent after a UI
  import (`custom-import-custom-import-gallery-illustrator-…`). 18 unit tests and the Chromium test pass; the
  browser test tags a persona avatar and checks the synced row (`pa:p1 | Quinn | face | - | p1`).
