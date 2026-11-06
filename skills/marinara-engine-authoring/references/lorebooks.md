# Lorebooks

Contents: [Book fields](#book-fields) · [Folders](#folders) · [Entries](#entry-fields) · [Authoring patterns](#authoring-patterns-worth-using) · [SillyTavern](#differences-from-sillytavern)

Schema: `packages/shared/src/schemas/lorebook.schema.ts`. Docs: `docs/lorebooks/`. Template: `templates/lorebook.marinara.json` (validated against the real schema).

Verified against Engine **v2.5.2**, commit `fc0333c3fe978cda5e0b919bd6faec985901704e`. Source contracts: [schema](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/schemas/lorebook.schema.ts), [native importer](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/services/import/marinara.importer.ts), [scan orchestration](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/services/lorebook/index.ts). Defaults below describe the create API; import behavior is called out separately. Source code wins over prose docs.

File shape: the `marinara_lorebook` envelope with `data: { lorebook, entries[], folders[] }`.

## Book fields

| Field | Default | Notes |
|---|---|---|
| `name` | — | required, 1–200 chars |
| `description` | `""` | |
| `category` | `"uncategorized"` | `world` \| `character` \| `npc` \| `spellbook` \| `uncategorized` |
| `scanDepth` | `2` | recent messages scanned for keys; `0` scans all history |
| `tokenBudget` | `2048` | book cap on injected lore; `0` removes this cap, not a disable switch; chat-wide budgets still apply |
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
| `sourceAgentId` | `null` | source agent identity; do not invent an installation-local ID |

Leave the character/persona/chat links empty when authoring offline — those IDs do not exist until the target is in the app.

**Native-import differences.** Write real JSON booleans, not strings: several lorebook and entry flags use `Boolean(value)`, so `"false"` becomes true. Omitted book `excludeFromVectorization` imports as false, despite the create API's true default; write it explicitly. `hiddenFromLibrary` is not copied by the importer. Scope links and `sourceAgentId` are copied without cross-install ID remapping; folder IDs are remapped. Use unlinked scope fields for a portable authored book.

## Folders

`folders[]` entries carry `id`, `name`, `parentFolderId`, `order`, `enabled`. Nesting survives import: the importer creates every folder at root first, builds an old-ID → new-ID remap, then re-parents through the same cycle guard the app uses. A dangling or cyclic parent silently leaves that folder at root rather than failing the import — so a wrong `parentFolderId` produces a flat book, not an error.

Entries point at folders through `folderId` using the exported folder `id`. `null` means root.

## Entry fields

Required: `name` (1–200). Everything else defaults.

**Content and matching**

`content`, `description`, `keys[]`, `secondaryKeys[]`, `selective`, `selectiveLogic` (`and` | `and_all` | `or` | `not` | `not_all`), `matchWholeWords`, `caseSensitive`, `useRegex`, `probability` (percent, `null` = always), `scanDepth` (`null` inherits the book; `0` scans all history; positive values scan that many recent messages).

`description` is routing metadata for the Knowledge Router, not injected lore. Put model-visible facts in `content`.

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
| `ephemeral` | fresh activations | disables itself in this chat after this many; sticky-held turns do not decrement it; `0`/`null` = unlimited |

**Recursion**

`preventRecursion` defaults to **`true`** — an entry does not seed further entries unless you turn it off. `excludeRecursion` keeps an entry from being matched *by* recursion. `delayUntilRecursion` makes an entry activate only on a recursion pass, which is how a parent-region entry seeds its children without the children firing on their own.

Recursion also needs `recursiveScanning: true` on the book. A "recursion seed" that does nothing is almost always one of these three flags left at its default.

**Grouping and control**

`group` (only one eligible entry per group activates), `groupWeight`, `tag` (free-text label), `locked` (blocks the Lorebook Keeper agent from editing it), `constant` (no keyword needed; other gates and budgets still apply), `enabled`, `excludeFromVectorization`.

**Decision activation** (Engine 2.5.0+)

`decisionStatement` (≤500 chars) plus `decisionMode`: `off` (default) | `require` | `trigger`. The statement is a true/false claim about the recent chat, answered by the user's **Decision model**.

- `require` — the entry still needs its ordinary route (keys, `constant`, semantic match, attached map location) *and* a yes. Filters passing mentions, or makes a `constant` entry situational.
- `trigger` — a yes is an extra route in, even with no key match. Catches paraphrases and situations.

No Decision model, or no answer, reads as no: `require` admits nothing new and `trigger` adds nothing; an existing sticky hold may still retain the entry. Never gate lore the story depends on behind `require`, and give important `trigger` entries ordinary keys too. The entry's own `sticky` / `cooldown` hold or rest the statement without asking again. Write statements as observable facts about the latest message, naming who — "In the latest message, a dragon is physically present", not "Is there a dragon?". `{{user}}` / `{{char}}` work inside the statement. Decision activation only applies to chat turns; game setup and agents' own lorebook scans have no affirmative decision answers.

`require` is asked only for an otherwise eligible candidate. `trigger` need not be asked when an ordinary route or sticky hold already admits the entry. Content decisions are planned only for entries about to activate, after activation decisions; recursive discovery can require several batches. Peek Prompt uses available answers without asking. A decision block inside `content` trims text after activation rather than replacing the entry's activation field, so it does not avoid entry timing or budget processing.

On import an unknown `decisionMode` silently becomes `off` and the statement is cut to 500 characters, so a typo just disables the feature. This is distinct from a `{{#if decision:"…"}}` block inside `content`, which trims the text of an entry that already activated (see `macros.md`).

**Images** (Engine 2.5.0+)

`images[]` — up to 4 reference images eligible to be sent when the entry activates. In the database each is `{ path, caption }` with a server-generated path; in an export file each is `{ dataUrl, caption }`, a base64 PNG, JPEG, or WebP of at most 5 MiB with a caption of at most 500 characters. The importer verifies every image's bytes before creating anything, and **one bad image fails the whole lorebook import**. When authoring offline, leave `images` as `[]` and attach art in the app, unless you have real image files to embed.

Delivery also depends on placement: normal Before/After content must actually be emitted, and an Outlet must be read by a surviving `{{outlet::name}}` branch. An image-only entry is valid. References are sent as separate user-role messages before history, not at the entry's text depth. The [image delivery helper](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/services/generation/lorebook-image-prompt.ts) caps a turn at **16 images / 20 MiB**; unavailable or excess references can be omitted. Use a vision-capable model. JSON export embeds at most 64 MiB of image bytes and skips missing files; do not use exported server paths as portable assets.

**Structured extras**

`relationships` (string→string map), `dynamicState` (free-form record), `activationConditions[]` (`{ field, operator, value }` with operators `equals`, `not_equals`, `contains`, `not_contains`, `gt`, `lt`), `schedule` (`{ activeTimes[], activeDates[], activeLocations[] }`, or `null`).

Conditions read game-state fields, not arbitrary prompt variables. With no game state, conditions and schedules pass. Schedule lists match substrings of the current `time`, `date`, and `location`, ignoring case; a missing corresponding game-state field does not block the entry. These are not wall-clock schedules. See the [keyword scanner](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/services/lorebook/keyword-scanner.ts).

## Authoring patterns worth using

- **Tree structure.** A region entry with `preventRecursion: false` seeding child entries with `delayUntilRecursion: true`. Keeps the token budget on what the scene actually touched.
- **Mutual exclusion.** Variants of the same fact share a `group` and split `groupWeight`; only one fires. `sticky` holds the winning variant; `cooldown` rests it after activation rather than preserving it.
- **Rules through an Outlet.** Place activated narration constraints precisely with `{{outlet::name}}`. Outlet entries still consume lorebook token and entry budgets.
- **Sticky for scene facts.** A fact that must survive a few turns after its keyword stops appearing.
- **Situational constants.** A `constant` entry with `decisionMode: "require"` — combat rules with "A fight is happening in the latest message" — stays out of the prompt on quiet turns, though its statement is asked each turn. Pair it with `sticky` so it holds through the scene without being asked again.
- **Agent-only reference lore** (2.5.2+). In **Chat Settings → Agents**, an agent's **Attach lorebook for the specific agent** gives that agent, in that chat, its own **Reference lorebook** (stored as chat metadata `agentLorebookAttachments: { [agentKey]: { enabled, lorebookId } }`). Matching entries follow the normal trigger rules but go only to that agent, not the main reply; agents running together may still see them. Use it for tracker or director lore that should not reach the story prompt. It is an in-app link, not part of the book file.
- **Shared text in one place.** `{{include::Entry name}}` pastes another entry's content from the same book, even a disabled one, so boilerplate can live in a single "include-only" entry. See `macros.md`.

## Differences from SillyTavern

Marinara reads ST World Info and V2 `character_book`, but native and foreign position numbers differ: ST `4` (`@D`) becomes native `2`; ST `2`/`5` become Before and `3`/`6` become After. **Outlet `7` and `outletName` are supported on both paths.** Do not apply ST position numbers to native files.

The [compatible exporter](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/routes/lorebooks.routes.ts) retains ordinary matching/placement/timing/group fields, `ephemeral`, `locked`, recursion flags, regex, and entry vector exclusion (`vectorized`). It also preserves `decisionStatement` / `decisionMode` and reference images under `extensions.marinaraImages`; Marinara reads these back, while foreign consumers need not understand them. It drops folder structure, book scope/category/scan and vector tuning, entry context filters/additional matching sources, and structured extras (`relationships`, `dynamicState`, `activationConditions`, `schedule`). Prefer native export for Marinara fidelity.

The [ST importer](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/services/import/st-lorebook.importer.ts) also recognizes slash-delimited regex keys, normalizes their pattern bodies, and escapes literal companion keys when mixing them with regex. Verify whole-word and case behavior after importing complex ST key lists.

**Import behavior changes in 2.5.2** ([changelog](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/CHANGELOG.md), #8786):

- Embedded card books keep Outlet entries and outlet names when the card is saved. SillyTavern and Chub cards import each entry's real `extensions` placement, depth, role, probability, selective logic, group and weight, sticky/cooldown/delay, scan depth, matching and recursion options instead of defaults; Compatible export writes them back in ST shape.
- Importing and reimporting an embedded book use the card book's own `token_budget`. A book carrying Marinara's card default of 512 now imports at **512, not 2048**, and fits fewer entries; set an explicit budget on the card's book if it needs more.
- **Reimport Embedded Lorebook** replaces the entries and applies the card book's settings, but keeps the linked book's name, category and max recursion depth.
- A native book from another install that was global but scoped only to chats missing here imports as **not global, scope `all`**: the user adds it to chats. Only character, persona and chat links that exist on this install are kept.
- JSON cards and `.charx` files with a byte-order mark now import.

After importing, semantic search needs its vectors rebuilt; keyword activation works immediately. Since 2.5.2 the embedding model is set on a Connections **account** (**Advanced → More → Semantic search (embeddings)**, or an **Embedding provider** account), with a **Test embedding** button to check it.
