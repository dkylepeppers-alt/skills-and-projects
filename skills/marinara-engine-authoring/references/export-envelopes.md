# Export envelopes and import paths

Checked against Engine **v2.5.1**, commit `8042ef6ec638801de45b8d82f82cd2dea85f51a4`, 2026-10-23; [checked release notes](https://github.com/Pasta-Devs/Marinara-Engine/releases/tag/v2.5.1).

The standard `marinara_*` entity exports use this wrapper, defined in `packages/shared/src/types/export.ts`. Other packages, themes, extensions, custom tools/functions, regex scripts and avatar models use different contracts below:

```json
{ "type": "marinara_<entity>", "version": 1, "exportedAt": "<ISO timestamp>", "data": { } }
```

`version` is the literal `1`. The importer rejects anything else.

| `type` | `data` payload | Import surface |
|---|---|---|
| `marinara_lorebook` | `{ lorebook, entries[], folders[] }` | Lorebooks panel → Import (download-arrow icon) |
| `marinara_character` | V2 card plus `avatar`, `sprites[]`, `gallery[]`, `metadata` | Characters panel → Import |
| `marinara_persona` | persona fields plus static `avatar`, `sprites[]`, `gallery[]`, timestamp `metadata` | Personas → Import |
| `marinara_preset` | `{ preset, sections[], groups[], choiceBlocks[] }` | Presets → Import |
| `marinara_chat_preset` / `marinara_chat_settings_profile` | chat settings profile | Chat settings |
| `marinara_memory_recall` | chat memory chunks with embeddings | Chat memory |
| `marinara_profile` | whole-profile backup | Backup/restore |

Native lorebook and character exports use the `.marinara.json` suffix; the JSON importer validates the envelope. Do not rely on filename independence for every UI: PNG, CharX, native ZIP, theme and avatar selectors also use extensions/signatures to select their route. A `.marinara` native package is a ZIP with `data.json` plus an optional static `avatar.png/jpg/jpeg/webp/gif/avif`; its JSON is the envelope above. It is not an Agent package or animated avatar archive.

## Native vs compatible

Export choices depend on the entity; not every content type has the same pair of formats.

- **Marinara Native** keeps the entity's native data and supported embedded images. It does not promise that every stored field, external ID, secret, generated runtime file or damaged image round-trips. See the limitations below.
- **Compatible JSON** is an interop mapping (e.g. SillyTavern World Info or a plain `chara_card_v2`), not a smaller native envelope. Lorebook compatible exports retain several Marinara extension fields (including Outlets, activation/recursion/vector settings, decision activation and embedded images), but drop folders and other native state; use `lorebooks.md` for the exact retention list.
- **Compatible PNG Card** is a static profile PNG with embedded V2 card data. For characters, both compatible formats fold non-empty `backstory` / `appearance` into `description`, clear sheet selection/reference use and omit gallery images; baked greeting assets return to their web links. PNG additionally keeps interactive onboarding and embeds sprites in `data.extensions.marinara.sprites`; Compatible JSON omits those two. Native keeps them in their own fields. See `characters-personas.md`.

Bulk lorebook export produces `marinara-lorebooks.zip` and always uses native format.

**Author native.** The compatible path exists for interop with other tools, not as a simpler way in.

## Native upload routes and other accepted formats

`POST /api/import/marinara` reads a JSON envelope. `POST /api/import/marinara-package` takes one multipart `file`, accepting native ZIP packages and native JSON uploaded as a file for large embedded galleries. A native ZIP requires `data.json`, allows at most 8 entries, at most 256 MiB per entry and 1 GiB total upload/unpacked content. Adding arbitrary files to that ZIP does not create new supported asset collections. In particular, a model beside `data.json` will not install an animated avatar.

The character importer also handles V2/V3 JSON, metadata-bearing PNG and `.charx` archives (foreign formats are mapped). PNG extraction recognizes `chara`/`ccv3` metadata in `tEXt`, `zTXt` and `iTXt`, preferring V3 data. Use an actual card exporter instead of treating a normal picture as a PNG card.

## What the importer will accept beyond the envelope

The lorebook importer detects foreign files automatically and accepts SillyTavern World Info and the V2 `character_book` shape alongside native envelopes. Files can be dropped in batches, mixing formats.

The map importer is looser than most: it accepts a bare `SpatialContextDefinition`, a `{ definition, hierarchyProfile }` template, or a record with `data` and an optional `portableLore` bundle. See `maps.md`.

## Timestamps

Native imports honor `createdAt` / `updatedAt` from the file rather than stamping import time. Personas accept either an ISO string or a numeric epoch (seconds or milliseconds — values below 1e12 are treated as seconds). If a file has no timestamps, the import still succeeds.

## Files outside the entity envelope

**Regex scripts** export as `{ kind: "marinara.regex-scripts", version: 1, exportedAt, regexScripts: [...] }`, retaining preset scope IDs and order. The UI still accepts legacy bare arrays, single scripts and recognized collections, then validates each normalized item with `importRegexScriptSchema`. This is not the standard entity envelope. See `extensions-and-scripts.md`.

Other non-envelope contracts:

| Artifact | File/shape | Reference |
|---|---|---|
| Custom tool/function | JSON `marinara.function-folder` / `marinara.function` manifest entries, or `marinara-functions.zip` with schema/script companion files | `extensions-and-scripts.md` |
| Personal extension | Source files, JSON, folder or `.personal-extension.zip`; native `manifest.json` kind `marinara.personal-extension` / `marinara.personal-server-extension` and source paths | `extensions-and-scripts.md` |
| Theme | CSS, direct `{ name, css }` JSON or `marinara.theme-folder` JSON with `marinara.theme` entries | `extensions-and-scripts.md` |
| Animated avatar | `.save`, `.mavatar`, `.vrm`, `.vrma` imported for an existing character/persona; strict `avatar.json` settings stored separately | `avatars.md` |
| Game packages | Ruleset, creature, story, tile and other Game content have package-specific manifests/archives | Read the matching Game/package reference; never guess a `marinara_*` type |

Detection is route-specific: entity envelopes by `type`, some content by shape, packages by manifest, and model/card files by extension plus checked content.

## Fields that do not survive a round trip

Do not call native export universally lossless:

- A **preset** export carries no `parameters` or stock `systemKey`; the importer hardcodes `parameters: {}`. Temperature, token limits, and penalties stay behind. `scopedRegexMode` and `defaultChoices` do travel; section/group IDs are remapped.
- Preset **section** exports include `wrapInXml` and `xmlTagName`, which the importer ignores.
- A **map template** drops chat-scoped image references; only Global Gallery references travel.
- **Compatible** mappings have entity-specific losses, particularly card galleries/onboarding/PNG differences above.
- **Animated avatar models/settings** are absent from character/persona card exports. Native profile export and backup include `avatar-models`, as well as static image directories. Keep original model files for a card-only transfer.
- **Profile exports** redact credentials and local destinations: Discord Mirror webhook, DeepL API key, DeepLX URL and Intiface URL do not transfer. Restoring onto the same install preserves its existing local destinations. Token-count settings such as agents' Max Output Tokens are retained; they are not credentials. Profile import quarantines executable extensions/tools and themes rather than activating them. Agent-owned data tables are excluded (full data-directory backup is the install backup).
- **Lorebook entry images** travel as embedded data URLs, capped at 64 MiB of images per export. A missing image file is skipped on export with a warning.

## Other route boundaries

- **Chats** also import as SillyTavern JSONL files through `/api/import/st-chat`; `/st-chat-into-group` creates a branch inheriting the target chat's roster/settings. Whole-folder import and profile backup are additional paths. Do not invent a `marinara_chat` envelope.
- **Downloadable capability Agent packages** install through catalog/package routes. Local agent-definition JSON/ZIP/folder transfers use their separate app import flow and do not install arbitrary capability runtime packages. See `agent-packages.md`.
- **Personal extensions** have file/package imports, but importing a draft is not authorization to execute it; the policy gates and exact-content-hash approval still apply.

## Pinned implementation sources

- [Entity envelope union](https://github.com/Pasta-Devs/Marinara-Engine/blob/8042ef6ec638801de45b8d82f82cd2dea85f51a4/packages/shared/src/types/export.ts)
- [Native importer and restoration](https://github.com/Pasta-Devs/Marinara-Engine/blob/8042ef6ec638801de45b8d82f82cd2dea85f51a4/packages/server/src/services/import/marinara.importer.ts)
- [JSON/native ZIP/JSONL/foreign card routes](https://github.com/Pasta-Devs/Marinara-Engine/blob/8042ef6ec638801de45b8d82f82cd2dea85f51a4/packages/server/src/routes/import.routes.ts)
- [Native/compatible character and persona exports](https://github.com/Pasta-Devs/Marinara-Engine/blob/8042ef6ec638801de45b8d82f82cd2dea85f51a4/packages/server/src/routes/characters.routes.ts)
- [Profile/backup assets, redaction and quarantine](https://github.com/Pasta-Devs/Marinara-Engine/blob/8042ef6ec638801de45b8d82f82cd2dea85f51a4/packages/server/src/routes/backup.routes.ts)
- [Extension package transfer](https://github.com/Pasta-Devs/Marinara-Engine/blob/8042ef6ec638801de45b8d82f82cd2dea85f51a4/packages/client/src/lib/personal-extension-transfer.ts)
- [Theme transfer UI](https://github.com/Pasta-Devs/Marinara-Engine/blob/8042ef6ec638801de45b8d82f82cd2dea85f51a4/packages/client/src/components/panels/SettingsPanel.tsx)
