# Templates

The six content templates below pass against **Engine v2.5.2** at `fc0333c3fe978cda5e0b919bd6faec985901704e` (Zod 4). The map hierarchy profile also passes the companion Agents model at `ffde8ea4035868c064eb3b2ffd675f1f807c57ed`, loaded through the validator's Zod 4 bridge shim. None of them use 2.5.2-only fields; they passed the v2.5.1 schemas before this update. Replace content while preserving each format's actual shape; run the validator after edits.

| File | What it demonstrates |
|---|---|
| `lorebook.marinara.json` | Native envelope, nested folders, recursion keys, weighted exclusion group and Outlet. |
| `character.marinara.json` | V2 card with Marinara extensions, macros and example dialogue. |
| `persona.marinara.json` | Native persona with fields read by persona macros. |
| `map-template.json` | Eight locations, emoji icons, three child presentation styles, layers, hidden link and model memory. |
| `preset.marinara.json` | Native preset, explicit enabled flags/order IDs, group, `skipWrap`, character/history markers, choice defaults and mode prompts. |
| `regex-scripts.json` | Current `marinara.regex-scripts` wrapper and one display-only regex; legacy bare arrays remain importable. |
| `agent-package/` | Catalog builder inputs, separate from native Agent-config transfers. Manifest and definitions pass the release schemas, but placeholder hashes must be regenerated before installation. |

The original four content templates share the Ashen Vale setting. Their destination-dependent character/lore IDs are empty: link in the app, or use the map's actual portable-lore workflow for bundled remapping. These samples are schema-tested; no live application import test is implied.

Game, avatar and extension formats use their own tools/parsers. See the matching references for pinned upstream examples rather than wrapping them in a generic native envelope.
