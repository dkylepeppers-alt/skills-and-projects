# Prompt presets

Contents: [Export/import](#export-shape-verified-against-a-real-export) · [Preset fields](#preset) · [Sections](#sections) · [Markers](#markers) · [Groups/choices](#groups-and-choice-blocks) · [ST import](#sillytavern-preset-import) · [Parameters](#generation-parameters) · [Profiles](#chat-settings-profiles)

Schema: `packages/shared/src/schemas/prompt.schema.ts`. Docs: `docs/prompts/presets.md`, `preset-variables.md`, `generation-parameters.md`. Export type: `marinara_preset`.

Verified against Engine **v2.5.1**, commit `8042ef6ec638801de45b8d82f82cd2dea85f51a4`: [schema](https://github.com/Pasta-Devs/Marinara-Engine/blob/8042ef6ec638801de45b8d82f82cd2dea85f51a4/packages/shared/src/schemas/prompt.schema.ts), [native import](https://github.com/Pasta-Devs/Marinara-Engine/blob/8042ef6ec638801de45b8d82f82cd2dea85f51a4/packages/server/src/services/import/marinara.importer.ts), [export route](https://github.com/Pasta-Devs/Marinara-Engine/blob/8042ef6ec638801de45b8d82f82cd2dea85f51a4/packages/server/src/routes/prompts.routes.ts), [assembly](https://github.com/Pasta-Devs/Marinara-Engine/blob/8042ef6ec638801de45b8d82f82cd2dea85f51a4/packages/server/src/services/prompt/assembler.ts). Source code wins over older docs and legacy export columns.

A preset is a container (`createPromptPresetSchema`) plus sections, groups, and choice blocks that reference it by `presetId`.

**Choose the mode surface first.** Roleplay assembles sections and markers. Conversation and Game use the preset's single `conversationPrompt` or `gamePrompt`, with a possible chat-local override; they do not assemble the Sections list. Put guidance in the field used by the target mode. See [mode behavior](https://github.com/Pasta-Devs/Marinara-Engine/blob/8042ef6ec638801de45b8d82f82cd2dea85f51a4/docs/prompts/presets.md#how-conversation-and-game-modes-differ).

## Export shape (verified against a real export)

```json
{
  "type": "marinara_preset",
  "version": 1,
  "exportedAt": "…",
  "data": { "preset": {…}, "sections": [], "groups": [], "choiceBlocks": [] }
}
```

Import/export behavior that the create schemas alone do not tell you:

- **Several preset fields are exported as JSON strings**, not as their parsed types — `sectionOrder`, `groupOrder`, `variableGroups`, `variableValues`, and `defaultChoices`. The importer accepts those JSON strings or parsed arrays/objects, so author with real arrays and objects. The stored `isDefault` value is also a string but is not restored on import.
- **`parameters` does not travel.** The importer hardcodes `parameters: {}` and the exported preset object has no `parameters` key at all. Generation settings are not part of a shared preset — say so rather than letting someone assume their temperature came along.
- **`wrapInXml` and `xmlTagName` appear on exported sections but the importer ignores them.** They do not round-trip. `wrapFormat` on the preset is the setting that survives.
- **Section/group booleans coerce as `x === true || x === "true"`**, so a missing `enabled` on a section or group imports as **false**, not as the schema default of true. Write booleans explicitly. Choice blocks have no `enabled` field; their `multiSelect` / `randomPick` flags use the same coercion.
- **`scopedRegexMode` and `defaultChoices` survive native import.** Unknown regex modes become `disabled`. Default choice values must be a string or an all-string array; invalid entries are discarded.
- **`imagePath`, `isDefault`, and stock `systemKey` are not restored by this importer.** Do not rely on exported local image paths, default status, or stock-preset identity in a shareable file. Export deletes `systemKey` as well as `parameters`.

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
| `scopedRegexMode` | `"disabled"` — `disabled` \| `exclusive` \| `chat`; preset scoped-regex default, see `extensions-and-scripts.md` |
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

`ordered` follows the preset's **`sectionOrder` ID array**. The assembler iterates that array; `injectionOrder` is stored metadata and does not independently sort it. Supply IDs and a complete `sectionOrder` in an authored export: omitted IDs are not automatically rendered merely because a section exists in `sections[]`. `depth` injects the section `injectionDepth` messages back inside the chat history — the same interruption effect as a lorebook entry at position 2, and worth the same restraint.

`skipWrap` (Engine 2.5.0+) sends one plain section without the preset's XML tag or Markdown heading while the rest stays wrapped. It round-trips through export and import, coerced like the other booleans. A group's own wrapper can still surround it, it has no effect when `wrapFormat` is `none`, and assembly ignores it on markers even if an imported marker stores true.

`forbidOverrides` is stored and imported for compatibility, but the v2.5.1 assembler does not read it. The [database schema](https://github.com/Pasta-Devs/Marinara-Engine/blob/8042ef6ec638801de45b8d82f82cd2dea85f51a4/packages/server/src/db/schema/prompts.ts) marks it, `wrapInXml`, and `xmlTagName` as legacy columns no longer used by assembly. Do not promise that this flag enforces a prompt rule; write required guidance in the prompt surface the mode actually uses.

Image/video **Prompt Overrides** are a separate feature using `${name}` variables from each registered media template, not preset sections or general `{{macro}}` syntax. See [media prompt overrides](https://github.com/Pasta-Devs/Marinara-Engine/blob/8042ef6ec638801de45b8d82f82cd2dea85f51a4/docs/prompts/prompt-overrides.md).

**Decision blocks and caching.** A section can hold `{{#if decision:"…"}}` so its text is sent only on turns where a statement about the chat is true. Statements in disabled sections and groups are never asked. Put branches that change often late in the prompt, such as post-history instructions: a changed branch stops the provider's prompt cache from reusing everything after it.

## Markers

A marker section is a slot the Engine fills. `isMarker: true` plus a `markerConfig.type`:

`character`, `lorebook`, `persona`, `chat_history`, `chat_summary`, `current_scene_summary`, `recalled_scenes`, `recalled_messages`, `id_macro_cards`, `world_info_before`, `world_info_after`, `dialogue_examples`, `agent_data`.

The three memory markers serve Advanced Memory Recall: `current_scene_summary` places the temporary summary of the earlier part of an ongoing scene; `recalled_scenes` places all recalled scene summaries, each followed by its message excerpt, and without an enabled marker that block appears before chat history; `recalled_messages` is a legacy placement that an enabled `recalled_scenes` marker overrides. Use `recalled_scenes` in new presets.

Options: `characterFields[]` limits which card fields the `character` marker emits; `lorebookFormat` is `full` | `worldbook_only` | `character_only`; `chatHistoryOptions` takes `maxMessages` and `includeSystemMessages`; `agentType` names the agent for an `agent_data` marker.

A marker section carries an empty `content` and a `markerConfig`; a plain section carries content and `markerConfig: null`. A realistic preset interleaves them — Marinara's universal preset runs Role → Instructions → NPC Playbook → Guidelines as plain sections, then Setting (`lorebook`), Characters (`character`), Dialogue Examples, Persona, Past Events (`chat_summary`), Chat History as markers, then a plain Output Format section last, with `injectionOrder` stepping by 100 so sections can be inserted between later.

Markers are how a preset controls *where* card text, lore, and history land relative to the author's own instructions. A preset that puts all its rules before `chat_history` behaves very differently from one that puts them after.

## Groups and choice blocks

Groups (`createPromptGroupSchema`) organize sections: `{ presetId, name, parentGroupId, order, enabled }`. Parent IDs survive import, but prompt assembly wraps **adjacent ordered sections with the same direct `groupId`**. A chat-history marker breaks that run. Keep grouped sections contiguous in `sectionOrder`; do not assume parent-group nesting creates nested runtime wrappers or that `groupOrder` rearranges sections.

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

## SillyTavern preset import

The [ST preset importer](https://github.com/Pasta-Devs/Marinara-Engine/blob/8042ef6ec638801de45b8d82f82cd2dea85f51a4/packages/server/src/services/import/st-prompt.importer.ts) intentionally ignores generation parameters too. It prefers `prompt_order` for `character_id: 100001`, falling back to the first order. Description/personality/scenario markers consolidate into one `character` marker, and Before/After world info into one `lorebook` marker; duplicate consolidated types are dropped. Recognized post-history/jailbreak entries placed after history become ungrouped user-role depth-0 sections. Unknown markers become ordinary content sections. It can infer groups from wrapper patterns and variable groups from `setvar` assignments, but this is a conversion, not a lossless native preset contract; inspect order, markers, roles and variable choices after import.

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
