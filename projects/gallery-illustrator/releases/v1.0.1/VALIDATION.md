# Gallery Illustrator 1.0.1 verification

Recorded November 27, 2026.

- All 17 project unit tests passed on Node 24. Rebuilding reproduced the 12 package files listed in SHA256SUMS.
- The built extension passed its Chromium test at a 412 × 860 viewport against the mock Engine API. The first storage read failed deliberately. The panel exposed Retry, recovered the existing disabled tag, accepted edits, synchronized all five prompts, and preserved the old tag after saving the new ones.
- The single-file and folder imports passed the pinned Engine's actual normalization, schema, capability and template checks.
- PATCH11 applied to a clean worktree containing the PATCH10 files it changes. The Engine shared build and server TypeScript check passed. The gallery-reference-pool regression passed, including same-name owners, a refused first pick, a conflicting slot, legacy records, missing and reordered replay inputs, and a catalog larger than 120 entries.
- The integration checkout used staging df60575 and PATCH10. Four context mismatches in PATCH10's two generation routes were adapted to run the checks without the separate local PATCH2–9 bundle. PATCH11 does not modify either of those routes. The regression used an empty interface list for the Engine's host-ID initialization because the test host restricts network-interface enumeration.
- The repository validator and Git LFS integrity check passed. Live image generation against the user's Marinara instance and SpicyAPI remains unverified.
