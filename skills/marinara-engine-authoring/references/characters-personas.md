# Characters and personas

Checked against Engine **v2.5.2**, commit `fc0333c3fe978cda5e0b919bd6faec985901704e`, 2026-11-06. Release notes: [v2.5.2](https://github.com/Pasta-Devs/Marinara-Engine/releases/tag/v2.5.2) and [v2.5.1](https://github.com/Pasta-Devs/Marinara-Engine/releases/tag/v2.5.1).

Schemas: `packages/shared/src/schemas/character.schema.ts`, `persona.schema.ts`. Templates: `templates/character.marinara.json`, `templates/persona.marinara.json` (both parsed by the real schemas).

## Character cards

Marinara's card is `chara_card_v2` with `spec_version: "2.0"`. The `data` object is `.passthrough()`, so unknown keys survive rather than being stripped — but only Marinara's own fields do anything.

**Core fields** (all default to `""` or `[]` except `name`, which is required):

`name`, `summary` (trimmed; no length cap since 2.5.2, ≤500 before; a library blurb, not prompt text), `description`, `personality`, `scenario`, `first_mes`, `mes_example`, `creator_notes`, `system_prompt`, `post_history_instructions`, `tags[]`, `creator`, `character_version` (default `"1.0"`), `alternate_greetings[]`.

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
| `onboarding` | optional | Interactive persona/card questions; absent or disabled means no onboarding. See the concrete contract below |
| `cardFieldAlternatives` | optional | Per-chat replacements for one prose field: `[{ id, field, value, chatIds[] }]`, `field` one of `summary`, `description`, `personality`, `backstory`, `appearance`, `scenario`, `mes_example`. Ids must be unique, and a field may have only one alternative per chat. Card export/import, duplication and character↔persona conversion keep the text but clear `chatIds`; whole-profile backups keep them. Author offline alternatives with `chatIds: []` and let the user tick chats in the app |
| `rulesetSheets` | optional | Game Mode starting builds keyed by ruleset id. Size-bounded but not shape-checked; on import an unusable sheet is dropped with a warning rather than failing the card. Leave it out unless the user has a ruleset package installed and supplies a sheet |

`convoBehavior` is `{ instruction, insertionStrategy }` where the strategy is one of `constant_before`, `constant_after`, `post_history_replace`, `post_history_before`, `post_history_after`, `macro`. Choosing `macro` means the text appears only where `{{convo_behavior}}` is placed.

**`character_book`** — embedded lore that travels with the card, in V2 shape (`name`, `description`, `scan_depth`, `token_budget`, `recursive_scanning`, `entries[]`). Entries use the V2 field names — `insertion_order`, `secondary_keys`, `case_sensitive`, `comment`, `position` as `before_char`/`after_char`/`at_depth` or `0`–`7` (`7` is an Outlet, named in the entry's `extensions.outlet_name`) — not Marinara's native entry names. Since 2.5.2, import reads each entry's real `extensions` settings (position, depth, role, probability, selective logic, group and weight, sticky/cooldown/delay, scan depth, matching and recursion options, `outlet_name`) instead of defaults, and an embedded book imports at its own `token_budget` (a book carrying Marinara's card default of 512 now imports at 512, not 2048; a book with no budget still gets 2048); see `lorebooks.md`. This is the only cross-content link that works fully offline, so it is the right vehicle for lore belonging to one character. Setting `character_book` to `null` is normal for cards whose lore lives in a standalone book.

**Native export extras.** A `marinara_character` envelope's `data` may also carry `avatar` (data URL), `sprites[]`, `gallery[]`, and `metadata` (`createdAt`, `updatedAt`, `comment`). Omit them for a text-only card; embed actual image bytes when delivering a portable art package (see `portrait-workflow.md`). `avatar` here is a static profile picture. Animated 2D/3D avatar models and their settings are separate and never travel in card exports; see `avatars.md`.

**Sprites (2.5.2).** Sprites may sit in folders, which travel in native exports and backups. Sprite names may carry outfit and condition facets after the expression, mood first (`happy_pajamas`, `angry_formalwear_soaked_01`); a trailing number only marks another version. When no sprite matches every word, the Expression Engine drops the last word first, so `happy_pajamas_wounded` falls back to `happy_pajamas`, then any `happy` sprite. The character Sprites tab lost **Upload Folder** (use **Upload images** and multi-select); the persona editor keeps it. A character with only sprites no longer shows as an avatar in chats until **Show this avatar in chats** is on (see `avatars.md`).

**Compatible exports fold in Marinara fields.** Compatible JSON and PNG exports append non-empty `backstory` and `appearance` to `description` and remove them from `extensions`, so other V2 readers keep that text. Native export keeps the fields separate. Compatible JSON omits interactive `extensions.onboarding` and sprites. Compatible PNG retains onboarding and embeds sprites in `data.extensions.marinara.sprites`; both compatible formats omit the gallery and clear character-sheet selection/reference use. Baked gallery greeting images revert to their original web links in compatible exports. When converting a card that came out of Marinara as Compatible JSON, expect that text inside `description`.

## Interactive onboarding (`extensions.onboarding`)

A card can ship a skeleton persona and separate per-chat character questions. The block has `enabled` (default false), five persona template strings (`description`, `personality`, `backstory`, `appearance`, `scenario`, all default empty), and two question arrays, `variables` and `cardVariables` (both default empty). There is no separate name template: the persona question `player` supplies its name; when absent, Engine inserts a free-text name question.

Each question is `{ id, variableName, question, options, allowCustom, multiSelect, separator, displayMode, optionSort }`. `id` is a string; `variableName` and `question` default empty; `options` defaults `[]`; `allowCustom` and `multiSelect` default false; `separator` defaults `", "`; `displayMode` is `auto` (default), `buttons`, or `listbox`; `optionSort` is `manual` (default) or `alphabetical`. Each option is `{ id, label, value, description? }`, with the first three required strings. Empty `value` uses its label. No options means free text; otherwise the first option is the default. Multi-select joins values using `separator`. This shared choice behavior also applies to presets (`presets-and-prompts.md`).

| Question list | Where answers go | Macro lifetime |
|---|---|---|
| `variables` | The new persona's five fields, resolved once | Persona answers become text; `{{user}}` and `{{char}}` deliberately stay live; other macros resolve once using creation-time context |
| `cardVariables` | That chat's variables; card source stays unchanged | Card Description, Personality, Scenario and extension Backstory/Appearance read `{{variableName}}` at prompt time; persona text can also retain a card-variable tag for later chat resolution |

Use case-sensitive ASCII names starting with a letter/underscore, then letters/digits/underscores. Do not use reserved built-in macro names or repeat a name across the two lists. Persisted card-variable names are limited to 64 characters, values to 10,000 characters, and onboarding writes at most 100 card variables. The broader chat-variable map allows 500 total. An invalid schema block is dropped on card import rather than rejecting the card; imports cap **each** question list at its first 100 and repair empty/duplicate IDs. The question schema deliberately permits unfinished authoring content; schema acceptance does not prove that variable names or references work. Use `validateOnboarding` for naming/reference diagnostics, including unused questions, undeclared tags and `{{if}}` without `#`.

Use `{{#if}}` for dependent questions: relevance follows what the macro engine actually reads in reachable field text or selected option values. Persona and card questions have separate answer contexts; do not make a card option depend on a persona-only variable. Questions can use `{{char}}` and `{{user}}` for display.

Choice defaults seed card variables when a chat starts without answering the wizard; free-text questions have no default and may leave a literal tag. Seeded values cannot contain unresolved non-built-in tags; a default depending on another default is settled in up to two passes. Wizard answers replace defaults in that chat. Two cards declaring one name share one chat value (last saved wins); removing a card removes its owned variables unless another remaining card declares the name. Reopening character questions edits saved chat answers. This is independent of creating a persona.

Native and Compatible PNG card exports retain onboarding; Compatible JSON omits it. Keep per-chat answers out of a reusable card. The Roleplay wizard asks the questions; Quick Start, Conversation setup and starting directly from a card do not currently ask them.

## Personas

The player-side card. Only `name` is required; everything else is optional.

**Text fields:** `comment`, `creator`, `personaVersion`, `versioningEnabled`, `creatorNotes`, `phoneticName`, `summary` (library blurb only), `mes_example` (**Example Dialogue**, reaches the prompt), `description`, `personality`, `scenario`, `backstory`, `appearance`, `imageAppearanceEnabled` / `imageAppearance` (image-prompt override, as on cards), `convoDisplayName`, `aboutMe`, nullable `convoBehavior` (`instruction` plus the same insertion strategies as cards), `tags[]`, `savedStatusOptions[]`.

Personas also accept `cardFieldAlternatives` (same shape and rules as on cards) and can have a TTS voice. **Import character as persona** copies the phonetic name, image appearance override, Conversation profile and ruleset sheets.

`{{persona}}` expands to description, personality, backstory, appearance, and scenario joined by newlines; each also has its own macro.

**Presentation:** `nameColor`, `dialogueColor`, `boxColor` accept a solid color or exactly one local CSS gradient — `url()`, `image()`, `expression()`, backslashes, semicolons and braces are rejected. `avatarCrop`, `trackerCardColors` (mode `default`/`chat`/`custom`, plus stat icons, opacities, portrait framing).

**Stats:** `personaStats` is `{ enabled, bars[], rpgStats?, rulesetSheets? }`. Bars are `{ name, value, max, color }`. `rpgStats` adds `{ enabled, attributes[], hp: { value, max }, pools[] }`. Numbers must be finite. RPG `hp` and pool value/max pairs are range-checked (`max` at least 1, `value` between 0 and `max`); ordinary `bars` have finite numbers but do not use that RPG range refinement.

Native persona exports also embed static `avatar`, `sprites[]`, `gallery[]` and timestamp `metadata`. Selected sheets use gallery `isCharacterSheet: true`; import binds the new image ID. Compatible persona export is text/presentation data without these image assets or sheet-reference selection. Animated model files remain separate (`avatars.md`).

`createdAt` / `updatedAt` are accepted on create/import only, as an ISO string or an epoch number.

## Groups

`createGroupSchema`: `{ name, description, avatarPath?, characterIds[] }`. `createPersonaGroupSchema` is `{ name, description, personaIds[] }` and has no `avatarPath`. Both need real IDs from the app, so groups are an in-app step, not an authored file.

## Writing the card itself

The schema will accept anything; these are the choices that make a card work.

- **`description` is the load-bearing field.** Use `{{char}}` and `{{user}}` rather than literal names so the card survives renaming and persona switches.
- **Split what changes from what doesn't.** Stable identity goes in `description`/`personality`; scene state goes in `scenario`; things the model keeps forgetting go in `depth_prompt` where they sit near the latest turn.
- **`mes_example` uses `<START>` blocks** with `{{user}}:` and `{{char}}:` turns. One or two exchanges that demonstrate voice beat five that demonstrate plot.
- **`first_mes` sets the format contract** — if it opens with narration in asterisks and quoted dialogue, the model will follow. Whatever prose habits appear here will be copied all session.
- **`alternate_greetings` are entry points, not variations in tone.** Each should open a different scene.
- **Creator notes never reach the model**: not through presets, `{{<id>}}` macros, agents or summaries, and an ID macro written only in creator notes no longer pulls another card in. Put model instructions in real prompt fields. Card CSS in `creator_notes` still works, and Professor Mari still reads them on request.
- **Card CSS controls moved.** **Card Theming** (Disabled / Exclusive / Chat) is now in **Chat Settings → Characters** (**Party** in Game), and inline name coloring is per chat (**Color Character Names in Text**).
- **Keep `system_prompt` and `post_history_instructions` empty** unless the card genuinely needs to override the user's preset. Cards that ship opinionated system prompts fight whatever preset the user has chosen.

## Pinned implementation sources

- [Character schema](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/schemas/character.schema.ts)
- [Persona schema](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/schemas/persona.schema.ts)
- [Character/persona export builders and PNG route](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/routes/characters.routes.ts)
- [Native card/persona restoration](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/services/import/marinara.importer.ts)
- [Onboarding relevance, defaults, normalization and persistence helpers](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/utils/onboarding.ts)
- [Chat-variable name/value limits](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/utils/chat-variables.ts)
- [Interactive onboarding guide](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/docs/characters/interactive-onboarding.md)
