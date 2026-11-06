# Writing prompt templates

The prompt is the package. These are the conventions the shipped agents follow — match them, because the Engine's parsers and the users' expectations are both built around them.

## Shape of a working template

Every first-party template does the same five things, in roughly this order:

1. **State the job in one line**, naming the trigger. "Track meaningful quest changes after the latest assistant message." "Rewrite only `<assistant_response>`."
2. **Draw the inclusion line explicitly.** What counts, and what does not. Quest: goals with stakes, progression, or narrative weight — not trivial requests or ordinary conversation. Lorebook Keeper: durable facts — not temporary moods, ordinary scene beats, or anything already in `<chat_summary>`.
3. **Give the exact output schema** as a literal JSON block, keys and types spelled out.
4. **Give the no-op return value verbatim.** `{ "updates": [] }`. `{"editNeeded":false,"editedText":"","changes":[]}`. Without this the model invents busywork on quiet turns, which is the single most common failure mode.
5. **State the preservation and replacement semantics.** Which fields carry over untouched, which lists are replaced wholesale, what happens on conflict.

`Respond ONLY with valid JSON.` appears near the top or bottom of every structured agent. Keep it.

Bind the output contract to an actual result handler. A new package id and a plausible JSON schema do not add a new tracker parser. Check the targeted Engine's result dispatch before copying the generic tracker template; for a rewriter, set `defaultSettings.resultType: "text_rewrite"` and emit that handler's exact shape. For in-app custom Agents, use `settings.resultType` and the matching approved `settings.customCapabilities`; the separate custom import contract is in [agent-definition.md](agent-definition.md). Engine v2.5.1 and later deprecate package definitions' top-level `resultType` in favor of `defaultSettings.resultType` ([pinned schema](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/schemas/capability-package.schema.ts)).

## Patterns worth copying

**Exact-name matching.** When updates key off a name, say so in capitals — Quest: copy `questName` EXACTLY as it appears, do not reword, recapitalize, or paraphrase, "or you will create a duplicate instead of updating." Naming the failure consequence works better than the instruction alone.

**Full-list replacement.** If sending a list overwrites the stored one, say that in the same breath as the instruction to send it: "include the COMPLETE objective list … because the list you send replaces the stored one."

**Bounded state.** Trackers cap themselves and give a resolution path when full. Quest allows three active quests and tells the model to complete or fail resolved ones before creating a new one, rather than silently dropping.

**Realistic drift.** State that advances on its own needs explicit guidance about rate. World State: conversation beats push time forward a minute or two, a scene change can jump hours.

**Inference floor.** Say when to guess and when to return null. World State: infer from genre, setting, and context; use null only when there is genuinely no way to infer.

**Read-only context.** Rewriters must be told not to leak the scaffolding: "Use tracker data and other agent results only as read-only reference … Never copy tracker JSON, tracker tags, or agent-result blocks into editedText."

**Negative scope for rewriters.** Preserve events, facts, dialogue intent, speaker meaning, order, tags, and logic. Do not add story beats. Return the full final message, never a diff, excerpt, option list, or commentary.

**Enum in a string field.** `"action": "create|update|complete|fail"` inside the schema block, rather than a separate paragraph listing valid actions.

## Incremental tracker output

World State, Character Tracker, Custom Tracker, and Inventory Tracker now open their templates with a dual contract. When the Engine's context contains `tracker_incremental_updates: supported` (the Engine adds that line only for those four agent types), the agent returns only changed rows — `{"updates": [rows], "removed": ["existing identity"]}`, `{}` for no change, locked rows never touched. Without the marker, it falls back to the legacy full-array output. Do not use this protocol in a new package unless the Engine names that package's agent type, because the marker never appears for it; ship the full-output contract instead.

## Placeholders

`{{key}}` interpolates. Two sources:

- **Settings** — the key must exist in `defaultSettings`. Prose Guardian's `{{banned}}`, `{{avoid}}`, `{{prefer}}` map to the settings of the same name; Director's `{{directorMode}}` likewise. A placeholder with no matching setting interpolates to nothing.
- **Engine macros** — `{{user}}` (Character Tracker) resolves to the persona name.

Give every settings-backed placeholder a sensible default in `defaultSettings` and make the prompt read correctly when that setting is empty.

## Context tags the Engine supplies

Referenced by existing packages. Availability varies by phase and mode, so confirm against a package that shares your phase before depending on one.

| Tag | Used by |
|---|---|
| `<assistant_response>` | rewriters and post-processing agents — the message just produced |
| `<latest_user_message>` | pre-generation agents |
| `<conversation_messages>` | history window |
| `<chat_summary>` | rolling summary; agents are told not to duplicate it |
| `<current_game_state>` | trackers — includes prior tracked state, e.g. `worldCustomFields` |
| `<character_cards>`, `<user_persona>`, `<char>` | identity context |
| `<writable_lorebooks>`, `<existing_entries>`, `<entry_catalog>` | lorebook agents |
| `<available_sprites>`, `<available_backgrounds>` | expression / background |
| `<agent_runtime_context>` | generic runtime block |
| `<previous_cyoa_choices>`, `<connected_devices>`, `<spotify_current_playback>` | package-specific |

Angle brackets also appear as placeholder metasyntax inside schemas (`<item>`, `<noun>`, `<bool>`) — those are notation for the model, not Engine-injected blocks.

## Length and cost

Shipped templates run roughly 900–3,700 characters. The Beholder prompt is pinned by hash at 3,709 characters because it was benchmarked. Longer is not better: every template runs on every qualifying turn, so an agent that only matters occasionally belongs on `runInterval` rather than in a longer prompt.

When shipping presets, vary them along a real axis users care about — scope (Single Focus vs Epic Campaign), domain (Mystery Board), or framing (Real-Life Goals) — not along tone. Every preset must still return the same output schema, or the parser breaks when the user switches.
