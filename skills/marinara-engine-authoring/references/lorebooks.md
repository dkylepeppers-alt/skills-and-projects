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
| `vectorIncludeAssistant` | `false` | include assistant messages in the semantic-search query |
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

**Decision activation** (Engine 2.5.0+)

`decisionStatement` (≤500 chars) plus `decisionMode`: `off` (default) | `require` | `trigger`. The statement is a true/false claim about the recent chat, answered by the user's **Decision model**.

- `require` — the entry still needs its ordinary route (keys, `constant`, semantic match, attached map location) *and* a yes. Filters passing mentions, or makes a `constant` entry situational.
- `trigger` — a yes is an extra route in, even with no key match. Catches paraphrases and situations.

No Decision model, or no answer, reads as no: `require` admits nothing new and `trigger` adds nothing. Never gate lore the story depends on behind `require`, and give important `trigger` entries ordinary keys too. The entry's own `sticky` / `cooldown` hold or rest the statement without asking again. Write statements as observable facts about the latest message, naming who — "In the latest message, a dragon is physically present", not "Is there a dragon?". `{{user}}` / `{{char}}` work inside the statement. Decision activation only applies to chat turns; game setup and agents' own lorebook scans read it as no.

On import an unknown `decisionMode` silently becomes `off` and the statement is cut to 500 characters, so a typo just disables the feature. This is distinct from a `{{#if decision:"…"}}` block inside `content`, which trims the text of an entry that already activated (see `macros.md`).

**Images** (Engine 2.5.0+)

`images[]` — up to 4 reference images sent to the model whenever the entry activates. In the database each is `{ path, caption }` with a server-generated path; in an export file each is `{ dataUrl, caption }`, a base64 PNG, JPEG, or WebP of at most 5 MB with a caption of at most 500 characters. The importer verifies every image's bytes before creating anything, and **one bad image fails the whole lorebook import**. When authoring offline, leave `images` as `[]` and attach art in the app, unless you have real image files to embed.

**Structured extras**

`relationships` (string→string map), `dynamicState` (free-form record), `activationConditions[]` (`{ field, operator, value }` with operators `equals`, `not_equals`, `contains`, `not_contains`, `gt`, `lt`), `schedule` (`{ activeTimes[], activeDates[], activeLocations[] }`, or `null`).

## Authoring patterns worth using

- **Tree structure.** A region entry with `preventRecursion: false` seeding child entries with `delayUntilRecursion: true`. Keeps the token budget on what the scene actually touched.
- **Mutual exclusion.** Variants of the same fact share a `group` and split `groupWeight`; only one fires. Add `cooldown` so the choice holds for a few turns instead of flickering.
- **Rules through an Outlet.** Narration constraints belong in a prompt section via `{{outlet::name}}`, not injected at position 0 where they compete with lore for budget.
- **Sticky for scene facts.** A fact that must survive a few turns after its keyword stops appearing.
- **Situational constants.** A `constant` entry with `decisionMode: "require"` — combat rules with "A fight is happening in the latest message" — stays out of the prompt on quiet turns, though its statement is asked each turn. Pair it with `sticky` so it holds through the scene without being asked again.
- **Shared text in one place.** `{{include::Entry name}}` pastes another entry's content from the same book, even a disabled one, so boilerplate can live in a single "include-only" entry. See `macros.md`.

## Differences from SillyTavern

Marinara reads ST World Info and the V2 `character_book`, mapping fields onto its own. It adds, with no ST equivalent: Outlet position and `outletName`, entry folders, `ephemeral`, `activationConditions`, `schedule`, `relationships`, `dynamicState`, `locked`, `additionalMatchingSources`, `generationTriggerFilters`, per-entry vector settings, decision activation, and entry images. Compatible JSON export drops most of them. The exception: it writes `decisionStatement` / `decisionMode` on each entry and the images under `extensions.marinaraImages`, which SillyTavern ignores and Marinara reads back on import.

After importing, semantic search needs its vectors rebuilt; keyword activation works immediately.
