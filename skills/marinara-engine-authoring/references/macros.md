# Macros and conditionals

Docs: `docs/prompts/macros.md`, `docs/prompts/conditional-prompts.md`, `docs/prompts/preset-variables.md`.

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

`{{input}}` (latest user message), `{{model}}`, `{{chatId}}`, `{{lastGenerationType}}`, `{{idle_duration}}`, `{{gameStoryboardKeyframeCount}}`, `{{agent::TYPE}}`.

`{{agent::TYPE}}` inserts a saved agent output and is resolved last, so agent text cannot inject further macros. The Preset Editor's Agent Sections group writes the correct tag for you.

## Outlets and lorebook size

`{{outlet::name}}` collects activated lorebook entries whose position is Outlet and whose `outletName` matches exactly — case-sensitive. Entries sharing a name are joined in `order`, newline-separated. No matches resolves to nothing; outlet content cannot call another outlet.

`{{lorebooksize::<lorebookId>}}` resolves to that book's entry count.

`{{include::ENTRY}}` (Engine 2.5.0+) pastes the content of a lorebook entry, found by ID or by case-insensitive name. Inside an entry, a name is looked up in that entry's own book; elsewhere, in the books this chat uses. `{{include::BOOK::ENTRY}}` names the book explicitly, and that book need not be attached or enabled. The included entry need not activate and may be disabled, so "include-only" entries are a valid pattern. Included text resolves its own macros and may include further entries; a cycle or a missing target resolves to nothing. Names are plain text — `{{include::{{char}}}}` does not work.

Because names are portable and IDs are not, offline-authored content should include by name.

## Time and randomness

`{{date}}` (`YYYY-MM-DD`), `{{time}}` (`HH:MM`), `{{datetime}}` / `{{isotime}}`, `{{weekday}}`, `{{timezone}}`.

`{{random}}` (0–100), `{{random:X:Y}}`, `{{random::A::B::C}}` (picks one, resolves macros only inside the winner), `{{random::A@2::B@0.5}}` (weighted), `{{roll:XdY}}`.

## Variables

`{{setvar::name::value}}`, `{{getvar::name}}`, `{{addvar::name::value}}`, `{{addnumvar::name::value}}` (Marinara extension — always numeric, invalid values count as 0, overflow ignored), `{{incvar::name}}`, `{{decvar::name}}`.

Chat variables are the same per-chat storage, also editable in **Chat Settings → Chat Variables**. Once set, a chat variable resolves as a bare `{{name}}` — names must match `^[A-Za-z_]\w{0,63}$`, must not be 21 characters long (reserved for card IDs), and cannot shadow a built-in macro. A `{{setvar}}` in a section or entry overwrites a chat variable of the same name.

## Formatting

`{{newline}}` / `{{\n}}`, `{{trim}}`, `{{trimStart}}`, `{{trimEnd}}`, `{{uppercase}}…{{/uppercase}}`.

## Conditionals

```
{{#if condition}}…{{else if other}}…{{else}}…{{/if}}
```

Branches are checked top to bottom; the first true branch is kept and its macros resolved, the rest discarded. No true branch and no `{{else}}` resolves to nothing.

Conditions support `==`, `contains`, `&&`, `||`, and parentheses for grouping. A bare value is truthy when non-empty — `{{#if scenario}}` includes the block only when a scenario exists.

Equality lists may use the compact form `{{#if character == "Maukie" || "Pantalone"}}`; writing each side out (`character == "Maukie" || character == "Pantalone"`) is equivalent and clearer. A bare word that is not a keyword or variable is treated as its own text, so quote literals.

### Decision conditions (Engine 2.5.0+)

A condition can ask the user's **Decision model** about the recent chat:

```
{{#if decision:"The latest message moves the scene to a new place"}}
Open with one or two sentences describing the new location.
{{/if}}

{{#if decision_choice:"Kaelen's mood in the latest message" == "angry"}}…{{else if decision_choice:"Kaelen's mood in the latest message" == "sad"}}…{{/if}}
```

`decision:` is yes/no. `decision_choice:` picks one of the values it is compared against anywhere in the prompt, or none. Both combine with `&&`, `||`, `{{else}}`, and nesting, and macros inside the statement resolve first.

Modifiers go after the statement, in any order: `sticky:N` (keep a yes for N turns), `cooldown:N` (then read as no for N turns), `until:"…"` / `while:"…"` (keep a yes until a second statement is true, or while it stays true; `decision:` only, optionally `:and` / `:or` against sticky), `every:N` (ask only every N turns), `priority:high|low` (which statements fit under the per-turn allowance, default 32).

**No answer means no.** Without a Decision model, or when it fails, every decision condition is false. Use decisions to add or trim guidance, never to carry content the story needs or to gate consent and safety text. Give each block a sensible `{{else}}` or nothing. State observable facts about "the latest message" and name who — not questions, instructions, or mood words. Put frequently changing decision blocks late in the prompt to keep provider prompt caching.

## Preset variables

Any `{{NAME}}` that is not a built-in is looked up as a preset variable, then as a chat variable; a preset variable wins a name clash. If nothing defines it, the tag is left in the text verbatim — which is how a typo'd macro ends up visible in the model's context. Preset variables come from the preset's `variableGroups` / `variableValues` or from choice blocks; see `presets-and-prompts.md`.
