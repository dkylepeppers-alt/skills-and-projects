# Characters and personas

Schemas: `packages/shared/src/schemas/character.schema.ts`, `persona.schema.ts`. Templates: `templates/character.marinara.json`, `templates/persona.marinara.json` (both parsed by the real schemas).

## Character cards

Marinara's card is `chara_card_v2` with `spec_version: "2.0"`. The `data` object is `.passthrough()`, so unknown keys survive rather than being stripped — but only Marinara's own fields do anything.

**Core fields** (all default to `""` or `[]` except `name`, which is required):

`name`, `description`, `personality`, `scenario`, `first_mes`, `mes_example`, `creator_notes`, `system_prompt`, `post_history_instructions`, `tags[]`, `creator`, `character_version` (default `"1.0"`), `alternate_greetings[]`.

**`extensions`** — where Marinara's additions live:

| Field | Default | Notes |
|---|---|---|
| `talkativeness` | `0.5` | 0–1; how often the card speaks in group chats |
| `fav` | `false` | |
| `world` | `""` | |
| `depth_prompt` | `{ prompt: "", depth: 4, role: "system" }` | a per-card note injected at depth |
| `backstory` | `""` | Marinara field, surfaced by `{{backstory}}` |
| `appearance` | `""` | Marinara field, surfaced by `{{appearance}}` |
| `imageAppearanceEnabled`, `imageAppearance` | optional | when enabled, image prompts use `imageAppearance` instead of `appearance` — for a visual description that differs from the prose one |
| `versioningEnabled` | `true` | keep card revisions and bump the visible version on edit |
| `convoDisplayName`, `convoDisplayNameInCard`, `aboutMe`, `convoBehavior` | optional | Conversation mode only |
| `rulesetSheets` | optional | Game Mode starting builds keyed by ruleset id. Size-bounded but not shape-checked; on import an unusable sheet is dropped with a warning rather than failing the card. Leave it out unless the user has a ruleset package installed and supplies a sheet |

`convoBehavior` is `{ instruction, insertionStrategy }` where the strategy is one of `constant_before`, `constant_after`, `post_history_replace`, `post_history_before`, `post_history_after`, `macro`. Choosing `macro` means the text appears only where `{{convo_behavior}}` is placed.

**`character_book`** — embedded lore that travels with the card, in V2 shape (`name`, `description`, `scan_depth`, `token_budget`, `recursive_scanning`, `entries[]`). Entries use the V2 field names — `insertion_order`, `secondary_keys`, `case_sensitive`, `comment`, `position` as `before_char`/`after_char`/`at_depth` or `0`–`6` — not Marinara's native entry names. This is the only cross-content link that works fully offline, so it is the right vehicle for lore belonging to one character. Setting `character_book` to `null` is normal for cards whose lore lives in a standalone book.

**Native export extras.** A `marinara_character` envelope's `data` may also carry `avatar` (data URL), `sprites[]`, `gallery[]`, and `metadata` (`createdAt`, `updatedAt`, `comment`). Omit them when authoring fresh — the card imports fine without an avatar, and the user can add art in the app.

**Compatible exports fold in Marinara fields.** Compatible JSON and PNG exports append non-empty `backstory` and `appearance` to `description` and remove them from `extensions`, so other V2 readers keep that text. Native export keeps the fields separate. When converting a card that came out of Marinara as Compatible JSON, expect that text inside `description`.

## Personas

The player-side card. Only `name` is required; everything else is optional.

**Text fields:** `comment`, `creator`, `personaVersion`, `versioningEnabled`, `creatorNotes`, `phoneticName`, `description`, `personality`, `scenario`, `backstory`, `appearance`, `imageAppearanceEnabled` / `imageAppearance` (image-prompt override, as on cards), `convoDisplayName`, `aboutMe`, `tags[]`, `savedStatusOptions[]`.

`{{persona}}` expands to description, personality, backstory, appearance, and scenario joined by newlines; each also has its own macro.

**Presentation:** `nameColor`, `dialogueColor`, `boxColor` accept a solid color or exactly one local CSS gradient — `url()`, `image()`, `expression()`, backslashes, semicolons and braces are rejected. `avatarCrop`, `trackerCardColors` (mode `default`/`chat`/`custom`, plus stat icons, opacities, portrait framing).

**Stats:** `personaStats` is `{ enabled, bars[], rpgStats?, rulesetSheets? }`. Bars are `{ name, value, max, color }`. `rpgStats` adds `{ enabled, attributes[], hp: { value, max }, pools[] }`. Every value/max pair is checked: `max` at least 1, `value` between 0 and `max`.

`createdAt` / `updatedAt` are accepted on create/import only, as an ISO string or an epoch number.

## Groups

`createGroupSchema`: `{ name, description, avatarPath?, characterIds[] }`. `createPersonaGroupSchema` is the same with `personaIds[]`. Both need real IDs from the app, so groups are an in-app step, not an authored file.

## Writing the card itself

The schema will accept anything; these are the choices that make a card work.

- **`description` is the load-bearing field.** Use `{{char}}` and `{{user}}` rather than literal names so the card survives renaming and persona switches.
- **Split what changes from what doesn't.** Stable identity goes in `description`/`personality`; scene state goes in `scenario`; things the model keeps forgetting go in `depth_prompt` where they sit near the latest turn.
- **`mes_example` uses `<START>` blocks** with `{{user}}:` and `{{char}}:` turns. One or two exchanges that demonstrate voice beat five that demonstrate plot.
- **`first_mes` sets the format contract** — if it opens with narration in asterisks and quoted dialogue, the model will follow. Whatever prose habits appear here will be copied all session.
- **`alternate_greetings` are entry points, not variations in tone.** Each should open a different scene.
- **Keep `system_prompt` and `post_history_instructions` empty** unless the card genuinely needs to override the user's preset. Cards that ship opinionated system prompts fight whatever preset the user has chosen.
