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
```

`ordered` places the section by `injectionOrder` among the other ordered sections. `depth` injects it `injectionDepth` messages back inside the chat history — the same interruption effect as a lorebook entry at position 2, and worth the same restraint.

`forbidOverrides` stops a character card's `system_prompt` / `post_history_instructions` from replacing this section. Use it on sections whose behavior the preset must guarantee.

## Markers

A marker section is a slot the Engine fills. `isMarker: true` plus a `markerConfig.type`:

`character`, `lorebook`, `persona`, `chat_history`, `chat_summary`, `id_macro_cards`, `world_info_before`, `world_info_after`, `dialogue_examples`, `agent_data`.

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

`randomPick` picks for the user — useful for tone or weather variables that should vary run to run.

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
enabledParameters: { temperature?, maxTokens?, topP?, topK?, frequencyPenalty?, presencePenalty?, reasoningEffort?, verbosity? }
squashSystemMessages (true)  showThoughts (true)  useMaxContext (false)
stopSequences: []            strictRoleFormatting (true)  singleUserMessage (false)
```

`enabledParameters` is the on/off layer: a parameter with a value but no enable flag may not be sent. Providers reject unsupported parameters, so `reasoningEffort` and `verbosity` should be `null` unless the target model takes them.

`singleUserMessage` collapses the whole prompt into one user turn — necessary for some providers, destructive to role-sensitive prompting elsewhere.

## Chat settings profiles

Separate and much smaller (`chat-preset.schema.ts`, exported as `marinara_chat_settings_profile`): `{ name, mode, settings: { connectionId?, promptPresetId?, metadata? } }`, with `settings` strict. It stores which connection and preset a chat mode uses, not prompt content.
