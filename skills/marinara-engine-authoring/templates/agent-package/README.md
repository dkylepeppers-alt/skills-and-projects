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
- Add the package's Agent Organizer store data (`store/store.json` entry,
  banner, icon) and run `node scripts/build-store.mjs`; catalog validation
  fails without it. See `references/agent-packages.md`.
- These templates target the Agent Organizer catalog (Download Agents before
  Engine 2.5.2), not the in-app custom
  Agent file/folder importer; see `references/agent-definition.md` for that format.
- Select and test `engine.min` for the behavior used. The template's `2.3.0`
  is the catalog baseline, not a compatibility test for a new package.
- The `agents.json` template is shaped for a tracker. Bind its output to a
  verified Engine result handler before use; a new id does not create a parser.
  For a rewriter add `"resultType": "text_rewrite"` inside `defaultSettings`
  and drop `defaultInjectAsSection`; for a
  pre-generation agent set `"phase": "pre_generation"`.
