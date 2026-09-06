# Lorebooks

Schema: `packages/shared/src/schemas/lorebook.schema.ts`. Docs: `docs/lorebooks/`. Template: `templates/lorebook.marinara.json` (validated against the real schema).

File shape: the `marinara_lorebook` envelope with `data: { lorebook, entries[], folders[] }`.

## Book fields

| Field | Default | Notes |
|---|---|---|
| `name` | — | required, 1–200 chars |
| `description` | `""` | |
| `category` | `"uncategorized"` | `world` \| `character` \| `npc` \| `spellbook` \| `uncategorized` |
| `scanDepth` | `2` | messages scanned for keys |
| `tokenBudget` | `2048` | cap on injected lore |
| `entryLimit` | 100 | max entries activated per generation |
| `recursiveScanning` | `false` | let activated entries trigger further entries |
| `maxRecursionDepth` | `3` | 1–10 |
| `excludeFromVectorization` | `true` | book-level semantic-search opt-out |
| `vectorQueryDepth`, `vectorScoreThreshold`, `vectorMaxResults` | 10 / 0.3 / 10 | semantic search tuning |
| `characterId` / `characterIds` | `null` / `[]` | mutually exclusive — using both is a validation error |
| `personaId` / `personaIds` | `null` / `[]` | same rule |
| `chatId` | `null` | chat-scoped book |
| `isGlobal` | `false` | cannot be combined with any character or persona target |
| `enabled` | `true` | |
| `hiddenFromLibrary` | `false` | |
| `scope` | `{ mode: "all", chatIds: [] }` | `all` \| `disabled` \| `specific` |
| `tags` | `[]` | |
| `generatedBy` | `null` | forced to `"import"` on import; `lorebook-maker` is normalized to `agent` |

Leave the character/persona/chat links empty when authoring offline — those IDs do not exist until the target is in the app.

## Folders

`folders[]` entries carry `id`, `name`, `parentFolderId`, `order`, `enabled`. Nesting survives import: the importer creates every folder at root first, builds an old-ID → new-ID remap, then re-parents through the same cycle guard the app uses. A dangling or cyclic parent silently leaves that folder at root rather than failing the import — so a wrong `parentFolderId` produces a flat book, not an error.

Entries point at folders through `folderId` using the exported folder `id`. `null` means root.

## Entry fields

Required: `name` (1–200). Everything else defaults.

**Content and matching**

`content`, `description`, `keys[]`, `secondaryKeys[]`, `selective`, `selectiveLogic` (`and` | `and_all` | `or` | `not` | `not_all`), `matchWholeWords`, `caseSensitive`, `useRegex`, `probability` (percent, `null` = always).

`additionalMatchingSources[]` scans extra fields for this entry's keys: `character_name`, `character_description`, `character_personality`, `character_scenario`, `character_tags`, `persona_description`, `persona_tags`.

**Filters**

`characterFilterMode` / `characterFilterIds`, `characterTagFilterMode` / `characterTagFilters`, `generationTriggerFilterMode` / `generationTriggerFilters` — each mode is `any` | `include` | `exclude`. Generation triggers are the `{{lastGenerationType}}` labels (`normal`, `continue`, `regenerate`, `impersonate`, `guided`, `autonomous`, `turn_game`, `preview`, `game_setup`, `lorebook_scan`, `retry_agents`, and more over time).

**Placement**

`position` accepts only `0`, `1`, `2`, `7`:

| Value | Meaning |
|---|---|
| `0` | Before chat history |
| `1` | After chat history |
| `2` | At depth — injected *inside* recent messages, `depth` messages back (default 4) |
| `7` | Outlet — not injected at all; collected by `{{outlet::name}}` |

`order` (default 100) sets insertion order among co-activated entries; lower is earlier. `role` (`system` | `user` | `assistant`) only matters at position 2.

Position 2 reads as an interruption dropped into the conversation. Use it for a rule the model keeps dropping or a fact that just changed — not for ordinary lore.

For Outlets, set `outletName` to an exact case-sensitive string and put `{{outlet::that_name}}` in a prompt section. Entries sharing an outlet name are joined in `order`, separated by newlines. Outlet entries still obey every normal activation rule; only entries active this generation are collected. An outlet with nothing active resolves to empty, and outlet content cannot call another outlet.

**Timing** — all start unset

| Field | Counts | Effect |
|---|---|---|
| `sticky` | messages | stays active this many more messages after triggering |
| `cooldown` | messages | cannot re-trigger for this many messages |
| `delay` | messages | cannot trigger until this many messages into the chat |
| `ephemeral` | activations | disables itself after this many; `0`/`null` = unlimited |

**Recursion**

`preventRecursion` defaults to **`true`** — an entry does not seed further entries unless you turn it off. `excludeRecursion` keeps an entry from being matched *by* recursion. `delayUntilRecursion` makes an entry activate only on a recursion pass, which is how a parent-region entry seeds its children without the children firing on their own.

Recursion also needs `recursiveScanning: true` on the book. A "recursion seed" that does nothing is almost always one of these three flags left at its default.

**Grouping and control**

`group` (only one entry per group activates), `groupWeight`, `tag` (free-text label), `locked` (blocks the Lorebook Keeper agent from editing it), `constant` (always active, no keys), `enabled`, `excludeFromVectorization`.

**Structured extras**

`relationships` (string→string map), `dynamicState` (free-form record), `activationConditions[]` (`{ field, operator, value }` with operators `equals`, `not_equals`, `contains`, `not_contains`, `gt`, `lt`), `schedule` (`{ activeTimes[], activeDates[], activeLocations[] }`, or `null`).

## Authoring patterns worth using

- **Tree structure.** A region entry with `preventRecursion: false` seeding child entries with `delayUntilRecursion: true`. Keeps the token budget on what the scene actually touched.
- **Mutual exclusion.** Variants of the same fact share a `group` and split `groupWeight`; only one fires. Add `cooldown` so the choice holds for a few turns instead of flickering.
- **Rules through an Outlet.** Narration constraints belong in a prompt section via `{{outlet::name}}`, not injected at position 0 where they compete with lore for budget.
- **Sticky for scene facts.** A fact that must survive a few turns after its keyword stops appearing.

## Differences from SillyTavern

Marinara reads ST World Info and the V2 `character_book`, mapping fields onto its own. It adds, with no ST equivalent: Outlet position and `outletName`, entry folders, `ephemeral`, `activationConditions`, `schedule`, `relationships`, `dynamicState`, `locked`, `additionalMatchingSources`, `generationTriggerFilters`, and per-entry vector settings. All of those are dropped by Compatible JSON export.

After importing, semantic search needs its vectors rebuilt; keyword activation works immediately.
