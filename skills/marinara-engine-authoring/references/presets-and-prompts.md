# Prompt presets

Schema: `packages/shared/src/schemas/prompt.schema.ts`. Docs: `docs/prompts/presets.md`, `preset-variables.md`, `generation-parameters.md`, `prompt-overrides.md`. Export type: `marinara_preset`.

A preset is a container (`createPromptPresetSchema`) plus sections, groups, and choice blocks that reference it by `presetId`.

## Export shape (verified against a real export)

```json
{
  "type": "marinara_preset",
  "version": 1,
  "exportedAt": "…",
  "data": { "preset": {…}, "sections": [], "groups": [], "choiceBlocks": [] }
}
```

Four facts about this file that the schemas alone do not tell you:

- **Several preset fields are exported as JSON strings**, not as their parsed types — `sectionOrder`, `groupOrder`, `variableGroups`, `variableValues`, `defaultChoices`, and even `isDefault` (`"false"`). The importer runs everything through a `safeParseJson` helper that accepts either form, so authoring with real arrays and objects is correct and safer.
- **`parameters` does not travel.** The importer hardcodes `parameters: {}` and the exported preset object has no `parameters` key at all. Generation settings are not part of a shared preset — say so rather than letting someone assume their temperature came along.
- **`wrapInXml` and `xmlTagName` appear on exported sections but the importer ignores them.** They do not round-trip. `wrapFormat` on the preset is the setting that survives.
- **Booleans coerce as `x === true || x === "true"`**, so a missing `enabled` on a section, group, or choice block imports as **false**, not as the schema default of true. Write booleans explicitly.

IDs in the file are the source install's. Import remaps them: groups first, then sections against the new group IDs, then `sectionOrder` / `groupOrder` filtered through the remap. A section pointing at a group that is not in the file lands ungrouped rather than failing.

## Preset

| Field | Default |
|---|---|
| `name` | required, ≤200 |
| `description` | `""` |
| `imagePath` | `null` |
| `conversationPrompt` | `""` |
| `gamePrompt` | `""` |
| `variableGroups[]` | `[]` |
| `variableValues{}` | `{}` |
| `parameters` | generation parameters, below |
| `wrapFormat` | `"xml"` — `xml` \| `markdown` \| `none` |
| `isDefault` | `false` |
| `author` | `""` |

Update also accepts `sectionOrder[]`, `groupOrder[]`, and `defaultChoices` (a variable name → string or string array).

## Sections

Each section is one block of the assembled prompt.

```
presetId, identifier, name (≤200)
content: string
role: "system" | "user" | "assistant"      default system
enabled: boolean                            default true
isMarker: boolean                           default false
groupId: string | null
markerConfig: MarkerConfig | null
injectionPosition: "ordered" | "depth"      default ordered
injectionDepth: int ≥ 0                     default 0
injectionOrder: int                         default 100
forbidOverrides: boolean                    default false
skipWrap: boolean                           default false
```

`ordered` places the section by `injectionOrder` among the other ordered sections. `depth` injects it `injectionDepth` messages back inside the chat history — the same interruption effect as a lorebook entry at position 2, and worth the same restraint.

`skipWrap` (Engine 2.5.0+) sends one plain section without the preset's XML tag or Markdown heading while the rest stays wrapped. It round-trips through export and import, coerced like the other booleans. A group's own wrapper can still surround it, it has no effect when `wrapFormat` is `none`, and markers always keep their wrapper — the app never stores `skipWrap: true` on a marker.

`forbidOverrides` stops a character card's `system_prompt` / `post_history_instructions` from replacing this section. Use it on sections whose behavior the preset must guarantee.

**Decision blocks and caching.** A section can hold `{{#if decision:"…"}}` so its text is sent only on turns where a statement about the chat is true. Statements in disabled sections and groups are never asked. Put branches that change often late in the prompt, such as post-history instructions: a changed branch stops the provider's prompt cache from reusing everything after it.

## Markers

A marker section is a slot the Engine fills. `isMarker: true` plus a `markerConfig.type`:

`character`, `lorebook`, `persona`, `chat_history`, `chat_summary`, `current_scene_summary`, `recalled_scenes`, `recalled_messages`, `id_macro_cards`, `world_info_before`, `world_info_after`, `dialogue_examples`, `agent_data`.

The three memory markers serve Advanced Memory Recall: `current_scene_summary` places the temporary summary of the earlier part of an ongoing scene; `recalled_scenes` places all recalled scene summaries, each followed by its message excerpt, and without an enabled marker that block appears before chat history; `recalled_messages` is a legacy placement that an enabled `recalled_scenes` marker overrides. Use `recalled_scenes` in new presets.

Options: `characterFields[]` limits which card fields the `character` marker emits; `lorebookFormat` is `full` | `worldbook_only` | `character_only`; `chatHistoryOptions` takes `maxMessages` and `includeSystemMessages`; `agentType` names the agent for an `agent_data` marker.

A marker section carries an empty `content` and a `markerConfig`; a plain section carries content and `markerConfig: null`. A realistic preset interleaves them — Marinara's universal preset runs Role → Instructions → NPC Playbook → Guidelines as plain sections, then Setting (`lorebook`), Characters (`character`), Dialogue Examples, Persona, Past Events (`chat_summary`), Chat History as markers, then a plain Output Format section last, with `injectionOrder` stepping by 100 so sections can be inserted between later.

Markers are how a preset controls *where* card text, lore, and history land relative to the author's own instructions. A preset that puts all its rules before `chat_history` behaves very differently from one that puts them after.

## Groups and choice blocks

Groups (`createPromptGroupSchema`) nest sections for organization: `{ presetId, name, parentGroupId, order, enabled }`.

Choice blocks turn a preset into a form the user fills before generating:

```
variableName: ^\w+$, ≤100      becomes {{variableName}}
question: ≤500
options: [{ id, label, value }]   at least one
multiSelect: boolean            default false
separator: ≤20                  default ", "
randomPick: boolean             default false
displayMode: auto | buttons | listbox
optionSort: manual | alphabetical
```

The chosen `value` is substituted wherever `{{variableName}}` appears, and `defaultChoices` on the preset supplies the pre-selected value for each variable.

The pattern this enables, seen in Marinara's own universal preset: a section whose entire content is one variable. `Role` is the string `You are {{role}}!` and `Guidelines` is just `{{guidelines}}` — the substance lives in the choice block's option values, several hundred words each, and the user picks one from a form instead of editing prompt text. Use it for the axes a user genuinely wants to switch (perspective, tense, response length, language, GM style) rather than for everything.

`randomPick` picks for the user. On a multi-select variable it draws one of the selected options on every generation — useful for tone or weather that should vary run to run. On a single-select variable it only preselects a random option for each new chat, which then stays fixed until the user changes it.

Option values are ordinary prompt text, so they can hold `{{#if decision:"…"}}` blocks (see `macros.md`). Only selected options are asked about; for a random-pick variable every option in the selected pool is. Preset variables also resolve in character greetings.

## Generation parameters

```
temperature 0–2 (1)        topP 0–1 (1)          topK ≥0 (0)         minP 0–1 (0)
maxTokens ≥1 (4096)        maxContext ≥1 (128000)
frequencyPenalty −2..2 (0) presencePenalty −2..2 (0)
reasoningEffort: low | medium | high | xhigh | maximum | null
verbosity: low | medium | high | null
serviceTier: flex | priority | null
assistantPrefill, assistantReasoningPrefill: string
customThinkingTags: [{ open, close }]  max 20
customParameters: {}       managedCustomParameters: { name: { enabled, value } }
customHeaders?: { name: value }   ≤32 non-secret request headers; auth, transport, and provider-key headers are rejected
enabledParameters: { temperature?, maxTokens?, topP?, topK?, frequencyPenalty?, presencePenalty?, reasoningEffort?, verbosity? }
squashSystemMessages (true)  showThoughts (true)  useMaxContext (false)
stopSequences: []            strictRoleFormatting (true)  singleUserMessage (false)
```

`enabledParameters` is the on/off layer: a parameter with a value but no enable flag may not be sent. Providers reject unsupported parameters, so `reasoningEffort` and `verbosity` should be `null` unless the target model takes them.

`singleUserMessage` collapses the whole prompt into one user turn — necessary for some providers, destructive to role-sensitive prompting elsewhere.

## Chat settings profiles

Separate and much smaller (`chat-preset.schema.ts`, exported as `marinara_chat_settings_profile`): `{ name, mode, settings: { connectionId?, promptPresetId?, metadata? } }`, with `settings` strict. It stores which connection and preset a chat mode uses, not prompt content.
