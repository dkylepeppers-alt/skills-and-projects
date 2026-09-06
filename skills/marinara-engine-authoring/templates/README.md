# Templates

Every JSON file here has been parsed by the Engine's real schemas (see
`../scripts/`). Replace the content, keep the shape.

| File | What it demonstrates |
|---|---|
| `lorebook.marinara.json` | native envelope, nested folders, a recursion tree (parent seeds children via `delayUntilRecursion`), a weighted mutual-exclusion group, and an Outlet entry |
| `character.marinara.json` | V2 card with Marinara `extensions` (backstory, appearance, depth_prompt), macro use in every text field, `<START>` example dialogue |
| `persona.marinara.json` | persona envelope with the fields the `{{persona*}}` macros read |
| `map-template.json` | 8 locations across region → settlement → building → floor/room, all three `childPresentation` styles, a hidden link, `modelMemory` used to hold a secret |
| `agent-package/` | a downloadable Agent package skeleton; see its own README |

The four content templates share one setting (the Ashen Vale) on purpose, so
they read as a pack and show how the pieces reference each other. Note that the
map's `lorebookEntryIds` are empty and the lorebook's `characterIds` are empty:
those IDs only exist after import. Link them in the app.
