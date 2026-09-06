# Templates

Copy `manifest.json` and `agents.json` into `packages/<id>/`, replace every
placeholder, then run `node scripts/build-agent-catalog.mjs <id>`.

- `files[]` in the manifest is a placeholder. The builder overwrites the path,
  sha256, and byte count. Do not compute them by hand.
- `locales/en.json` is generated. Do not create it by hand.
- `guidance-entry.mjs` is a snippet, not a file to copy in — paste it into
  `scripts/catalog-package-guidance.mjs`.
- The manifest and the matching agent definition must carry the identical
  `description`.
- The `agents.json` template is shaped for a tracker. For a writer add
  `"resultType": "text_rewrite"` and drop `defaultInjectAsSection`; for a
  pre-generation agent set `"phase": "pre_generation"`.
