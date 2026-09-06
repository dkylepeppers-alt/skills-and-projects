# Export envelopes and import paths

Every native Marinara export is the same wrapper, defined in `packages/shared/src/types/export.ts`:

```json
{ "type": "marinara_<entity>", "version": 1, "exportedAt": "<ISO timestamp>", "data": { } }
```

`version` is the literal `1`. The importer rejects anything else.

| `type` | `data` payload | Import surface |
|---|---|---|
| `marinara_lorebook` | `{ lorebook, entries[], folders[] }` | Lorebooks panel → Import (download-arrow icon) |
| `marinara_character` | V2 card plus `avatar`, `sprites[]`, `gallery[]`, `metadata` | Characters panel → Import |
| `marinara_persona` | persona fields | Personas → Import |
| `marinara_preset` | `{ preset, sections[], groups[], choiceBlocks[] }` | Presets → Import |
| `marinara_chat_preset` / `marinara_chat_settings_profile` | chat settings profile | Chat settings |
| `marinara_memory_recall` | chat memory chunks with embeddings | Chat memory |
| `marinara_profile` | whole-profile backup | Backup/restore |

Native lorebook and character exports use the `.marinara.json` suffix; the app picks the importer by inspecting the envelope, not the filename, so the suffix is convention rather than requirement.

## Native vs compatible

Each type that can leave Marinara offers two export formats:

- **Marinara Native** — the envelope above. Keeps folders, Marinara-only entry fields, sprites, and galleries. Round-trips losslessly.
- **Compatible JSON** — a foreign-format file (SillyTavern World Info, plain `chara_card_v2`). Marinara-only fields are dropped, folders are flattened.

Bulk lorebook export produces `marinara-lorebooks.zip` and always uses native format.

**Author native.** The compatible path exists for interop with other tools, not as a simpler way in.

## What the importer will accept beyond the envelope

The lorebook importer detects foreign files automatically and accepts SillyTavern World Info and the V2 `character_book` shape alongside native envelopes. Files can be dropped in batches, mixing formats.

The map importer is looser than most: it accepts a bare `SpatialContextDefinition`, a `{ definition, hierarchyProfile }` template, or a record with `data` and an optional `portableLore` bundle. See `maps.md`.

## Timestamps

Native imports honor `createdAt` / `updatedAt` from the file rather than stamping import time. Personas accept either an ISO string or a numeric epoch (seconds or milliseconds — values below 1e12 are treated as seconds). If a file has no timestamps, the import still succeeds.

## Files with no envelope

**Regex scripts** export as a bare JSON array — `[ {script}, {script} ]` — with no `type`/`version` wrapper. Each item is validated on its own by `importRegexScriptSchema`. Detect this shape by the array plus a `findRegex` key.

That makes two detection paths: envelope files keyed by `type`, and shape-detected files (regex arrays, bare map definitions).

## Fields that do not survive a round trip

Native export is lossless for lorebooks and cards, but not universally:

- A **preset** export carries no `parameters` — the importer hardcodes `parameters: {}`. Temperature, token limits, and penalties stay behind.
- Preset **section** exports include `wrapInXml` and `xmlTagName`, which the importer ignores.
- A **map template** drops chat-scoped image references; only Global Gallery references travel.
- **Compatible JSON** exports drop every Marinara-only field by design.

## Things that are not importable as files

- **Chats** come in through the SillyTavern folder-import wizard or profile backup, not as hand-authored files.
- **Agent packages** install through the catalog, not through an import dialog. See `agent-packages.md`.
- **Personal extensions** are created in the app and require an explicit content-hash approval step; they are not drop-in JSON.
