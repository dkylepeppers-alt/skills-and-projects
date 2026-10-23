# Macros and conditionals

Contents: [Identity](#identity) · [Conversation](#conversation-mode) · [Runtime](#runtime) · [Lorebook macros](#outlets-and-lorebook-size) · [Time/random](#time-and-randomness) · [Variables](#variables) · [Formatting](#formatting) · [Conditionals/decisions](#conditionals) · [Preset variables](#preset-variables)

Docs: `docs/prompts/macros.md`, `docs/prompts/conditional-prompts.md`, `docs/prompts/preset-variables.md`.

Verified against Engine **v2.5.1**, commit `8042ef6ec638801de45b8d82f82cd2dea85f51a4`: [macro implementation](https://github.com/Pasta-Devs/Marinara-Engine/blob/8042ef6ec638801de45b8d82f82cd2dea85f51a4/packages/shared/src/utils/macro-engine.ts), [prompt assembler](https://github.com/Pasta-Devs/Marinara-Engine/blob/8042ef6ec638801de45b8d82f82cd2dea85f51a4/packages/server/src/services/prompt/assembler.ts), [conditional guide](https://github.com/Pasta-Devs/Marinara-Engine/blob/8042ef6ec638801de45b8d82f82cd2dea85f51a4/docs/prompts/conditional-prompts.md). Source code wins when documentation differs.

A macro is `{{tag}}` text replaced when the prompt is built. There is no switch — any field that supports macros always resolves them. Built-in names are case-insensitive. Macros work in character cards, personas, lorebook entries, prompt sections, and chat messages.

## Identity

| Macro | Resolves to |
|---|---|
| `{{user}}` / `{{userName}}` | persona name, or `User` |
| `{{char}}` / `{{charName}}` | current character's name, or `Character` |
| `{{userNamePhonetic}}` / `{{charNamePhonetic}}` | phonetic name, falling back to the plain name |
| `{{characters}}` | every character in the chat, comma-joined |
| `{{group}}` | the other active characters in a group, excluding the responder |
| `{{persona}}` | persona description + personality + backstory + appearance + scenario |
| `{{personaDescription}}`, `{{personaPersonality}}`, `{{personaBackstory}}`, `{{personaAppearance}}`, `{{personaScenario}}` | individual persona fields |
| `{{description}}`, `{{personality}}`, `{{backstory}}`, `{{appearance}}`, `{{scenario}}`, `{{example}}`, `{{charSysInfo}}`, `{{charPostHistory}}` | the responding character's fields |
| `{{<21-char-card-ID>}}` | another character's name; in Roleplay chats with a prompt preset it also pulls that card's description, personality, appearance, backstory, scenario, and examples into context. Elsewhere it is only the name |
| `{{persona-<21-char-card-ID>}}` | the same for another persona |

ID macros need a real card ID copied from the app, so they cannot be pre-filled in authored content. The referenced card's greetings are excluded; its lorebooks keep their normal activation rules. A card already in the chat just becomes its name and is not added twice.

## Conversation mode

`{{convo_display}}`, `{{char_about}}`, `{{persona_about}}`, `{{convo_behavior}}`, `{{context}}` / `{{status}}`, `{{commands}}` / `{{commandList}}`, `{{reactRules}}` / `{{emojiReact}}`, `{{replyRules}}`, `{{memories}}` / `{{memoryRecall}}`, `{{lorebook}}` / `{{lore}}`.

Placing `{{char_about}}` / `{{persona_about}}` yourself in a one-character conversation suppresses Marinara's automatic participant block, so the bios are not inserted twice. Group conversations keep the automatic block regardless.

## Runtime

`{{input}}` (latest user message), `{{model}}`, `{{reasoning}}`, `{{chatId}}`, `{{lastGenerationType}}`, `{{idle_duration}}`, `{{gameStoryboardKeyframeCount}}`, `{{agent::TYPE}}`.

`{{reasoning}}` reports the effective level sent to the model: `low`, `medium`, `high`, `xhigh`, `max`, or `off`. `{{#if reasoning}}` is false for `off`. An existing preset or chat variable with that exact spelling retains ownership of the name, unlike most built-ins; Maximum reports the highest level the selected model supports.

`{{agent::TYPE}}` inserts a saved agent output and is resolved last, so agent text cannot inject further macros. The Preset Editor's Agent Sections group writes the correct tag for you.

## Outlets and lorebook size

`{{outlet::name}}` collects activated lorebook entries whose position is Outlet and whose `outletName` matches exactly — case-sensitive. Entries sharing a name are joined in `order`, newline-separated. No matches resolves to nothing; outlet content cannot call another outlet.

`{{lorebooksize::<lorebookId>}}` resolves to that book's total entry count, including disabled entries and folders' contents; unknown IDs resolve to `0`.

`{{include::ENTRY}}` (Engine 2.5.0+) pastes the content of a lorebook entry, found by ID or by case-insensitive name. Inside an entry, a name is looked up in that entry's own book; elsewhere, in the books this chat uses. `{{include::BOOK::ENTRY}}` names the book explicitly, and that book need not be attached or enabled. The included entry need not activate and may be disabled, so "include-only" entries are a valid pattern. Included text resolves its own macros and may include further entries; a cycle or a missing target resolves to nothing. Names are plain text — `{{include::{{char}}}}` does not work.

An unqualified **entry ID** can find an entry in any book; only an unqualified name is restricted to the current books. Book names also ignore case. Use unique names to avoid ambiguous first matches. Includes copy **content only**: they do not activate the source entry or copy its images, keys, position, timing, or decision-activation field. In a lorebook scan, expansion happens before recursion and token budgeting, so the pasted text can seed recursion and counts against the including entry's budget. Put a text conditional in the included content if that text itself needs a condition.

Because names are portable and IDs are not, offline-authored content should include by name.

## Time and randomness

`{{date}}` (`YYYY-MM-DD`), `{{time}}` (`HH:MM`), `{{datetime}}` / `{{isotime}}`, `{{weekday}}`, `{{timezone}}`.

`{{random}}` (0–100), `{{random:X:Y}}`, `{{random::A::B::C}}` (picks one option), `{{random::A@2::B@0.5}}` (weighted), `{{roll:XdY}}`.

Range endpoints are inclusive nonnegative integers (reversed endpoints are normalized). A missing weight is 1; decimal and zero weights work, and all-zero weights produce empty text. **Keep random options free of variable writes.** The conditional-resolution pass processes variable operations before the random choice, so `setvar` in an unselected option can still run. The selected option then receives a nested macro-resolution pass; that does not make random options lazy for side effects.

## Variables

`{{setvar::name::value}}`, `{{getvar::name}}`, `{{addvar::name::value}}`, `{{addnumvar::name::value}}` (Marinara extension — always numeric, invalid values count as 0, overflow ignored), `{{incvar::name}}`, `{{decvar::name}}`.

Chat variables are the same per-chat storage, also editable in **Chat Settings → Chat Variables**. Once set, a chat variable resolves as a bare `{{name}}` — names must match `^[A-Za-z_]\w{0,63}$`, must not be 21 characters long (reserved for card IDs), and cannot shadow a built-in macro. A `{{setvar}}` in a section or entry overwrites a chat variable of the same name.

Variable operations run left to right and persist across turns and app restarts in that chat. Use `getvar` / `setvar` for names containing dots or dashes; they are not bare-variable names. An earlier user message keeps displaying the tag the user typed, and resolves with the variable's current value when a prompt is built.

## Formatting

`{{newline}}` / `{{\n}}`, `{{trim}}`, `{{trimStart}}`, `{{trimEnd}}`, `{{uppercase}}…{{/uppercase}}`, `{{lowercase}}…{{/lowercase}}`.

`{{noop}}`, `{{original}}`, `{{// author note}}`, and `{{banned "text"}}` are removed. `original` has no original-prompt insertion behavior here; `banned` does not filter words. There is no general macro escape; an unknown tag stays literal only while no variable defines it. Custom Tool fields and the restricted Impersonate template are not full-macro contexts.

## Conditionals

```
{{#if condition}}…{{else if other}}…{{else}}…{{/if}}
```

Branches are checked top to bottom; the first true branch is kept and its macros resolved, the rest discarded. No true branch and no `{{else}}` resolves to nothing.

| Operators | Behavior |
|---|---|
| `==`, `=`, `is`; `!=`, `is not` | Equality/inequality; numeric when both operands are finite numbers, otherwise trimmed case-insensitive text |
| `>`, `<`, `>=`, `<=` | Numeric comparisons; false when either side is not numeric |
| `contains`, `includes`; `not contains`, `not includes` | Case-insensitive substring checks |
| `&&`, `||`, parentheses | AND before OR; parentheses group explicitly |

A bare value is false when empty or equal to `false`, `0`, `no`, `off`, `null`, or `undefined` (ignoring case). `{{#if scenario}}` includes the block only when a scenario has truthy content. Operands can be read macros, field aliases (`character` / `speaker` mean `char`), preset/chat variables, explicit `var:name` / `var.name`, or quoted literals. Use straight quotes around literals with spaces; escaped quotes and `\n` inside quoted values are supported.

Equality lists may use the compact form `{{#if character == "Maukie" || "Pantalone"}}`; writing each side out (`character == "Maukie" || character == "Pantalone"`) is equivalent and clearer. A bare word that is not a keyword or variable is treated as its own text, so quote literals.

**Group blocks.** A standalone `[` line, text containing character macros or character conditions, and standalone `]` line repeat that block once per character when the chat has at least two characters. Each pass resolves `char`, fields, and character conditions against that character. In a solo chat the brackets remain literal. Outside the block, character macros refer to the current/primary character.

### Decision conditions (Engine 2.5.0+)

A condition can ask the user's **Decision model** about the recent chat:

```
{{#if decision:"The latest message moves the scene to a new place"}}
Open with one or two sentences describing the new location.
{{/if}}

{{#if decision_choice:"Kaelen's mood in the latest message" == "angry"}}…{{else if decision_choice:"Kaelen's mood in the latest message" == "sad"}}…{{/if}}
```

`decision:` is yes/no. `decision_choice:` picks one of the values it is compared against anywhere in the prompt, or none. Both combine with `&&`, `||`, `{{else}}`, and nesting, and macros inside the statement resolve first.

Modifiers go after the statement, in any order: `sticky:N` (keep a yes for the next N turns), `cooldown:N` (then read as no for N turns), `until:"…"` / `while:"…"` (keep a yes until a second statement is true, or while it stays true; `decision:` only), `every:N` (ask on first reach, then every N turns; false between checks), `priority:high|low` (default medium).

With sticky, `until` defaults to `:and` (end at whichever ends first), while `while` defaults to `:or` (whichever ends last). Append `:and` / `:or` explicitly to change this; `:restrict` / `:extend` are aliases. Once latched on, the second statement is asked instead of the first. **An unanswered until/while check preserves the existing hold**, rather than ending it. For `decision_choice`, sticky holds the chosen option; cooldown makes all comparisons false. Regenerating/swiping the same latest message does not advance timers. Repeated statements use the longest sticky/cooldown and highest priority supplied.

**No answer means no.** Without a Decision model, or when it fails, every decision condition is false. Use decisions to add or trim guidance, never to carry content the story needs or to gate consent and safety text. Give each block a sensible `{{else}}` or nothing. State observable facts about "the latest message" and name who — not questions, instructions, or mood words. Put frequently changing decision blocks late in the prompt to keep provider prompt caching.

No-answer comparisons stay false even for `decision_choice:"…" != "calm"`; a missing answer is not an empty-string option. The separate latched until/while rule above preserves an already-active hold.

**Planning and cost.** The default 32-statement allowance is applied in stages, not as one global request/spending cap. Main prompt statements are planned first; lorebook activation and activated-entry content use the remaining allowance. Pre/parallel agents plan against a combined prompt/agent allowance again, and post-processing agents get a separate allowance. Activation questions and Smart response order are separate. Disabled sections/groups and unselected choice options are excluded; a settled fixed condition can rule out unreachable statements. Random-pick selected pools can require all candidate options to be planned. Several batches can occur in one turn. Successful answers may be reused for identical turn/model/statement/options while cached; a restart, eviction, edit, failed answer, or changed inputs can require another request. Peek Prompt never asks.

Keep expansions small: depth, expansion-count, output-length and dice limits bound macro execution, and oversized/deep output can be cut off without an author-facing error.

## Preset variables

Any `{{NAME}}` that is not a built-in is looked up as a preset variable, then as a chat variable; a preset variable wins a name clash. If nothing defines it, the tag is left in the text verbatim — which is how a typo'd macro ends up visible in the model's context. Preset variables come from the preset's `variableGroups` / `variableValues` or from choice blocks; see `presets-and-prompts.md`.
