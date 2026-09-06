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
| `{{<21-char-card-ID>}}` | another character's name, and pulls that card's description, personality, appearance, backstory, scenario, and examples into context |
| `{{persona-<21-char-card-ID>}}` | the same for another persona |

ID macros need a real card ID copied from the app, so they cannot be pre-filled in authored content. The referenced card's greetings are excluded; its lorebooks keep their normal activation rules.

## Conversation mode

`{{convo_display}}`, `{{char_about}}`, `{{persona_about}}`, `{{convo_behavior}}`, `{{context}}` / `{{status}}`, `{{commands}}` / `{{commandList}}`, `{{reactRules}}` / `{{emojiReact}}`, `{{replyRules}}`, `{{memories}}` / `{{memoryRecall}}`, `{{lorebook}}` / `{{lore}}`.

Placing `{{char_about}}` / `{{persona_about}}` yourself in a one-character conversation suppresses Marinara's automatic participant block, so the bios are not inserted twice. Group conversations keep the automatic block regardless.

## Runtime

`{{input}}` (latest user message), `{{model}}`, `{{chatId}}`, `{{lastGenerationType}}`, `{{idle_duration}}`, `{{gameStoryboardKeyframeCount}}`, `{{agent::TYPE}}`.

`{{agent::TYPE}}` inserts a saved agent output and is resolved last, so agent text cannot inject further macros. The Preset Editor's Agent Sections group writes the correct tag for you.

## Outlets and lorebook size

`{{outlet::name}}` collects activated lorebook entries whose position is Outlet and whose `outletName` matches exactly — case-sensitive. Entries sharing a name are joined in `order`, newline-separated. No matches resolves to nothing; outlet content cannot call another outlet.

`{{lorebooksize::<lorebookId>}}` resolves to that book's entry count.

## Time and randomness

`{{date}}` (`YYYY-MM-DD`), `{{time}}` (`HH:MM`), `{{datetime}}` / `{{isotime}}`, `{{weekday}}`, `{{timezone}}`.

`{{random}}` (0–100), `{{random:X:Y}}`, `{{random::A::B::C}}` (picks one, resolves macros only inside the winner), `{{random::A@2::B@0.5}}` (weighted), `{{roll:XdY}}`.

## Variables

`{{setvar::name::value}}`, `{{getvar::name}}`, `{{addvar::name::value}}`, `{{addnumvar::name::value}}` (Marinara extension — always numeric, invalid values count as 0, overflow ignored), `{{incvar::name}}`, `{{decvar::name}}`.

## Formatting

`{{newline}}` / `{{\n}}`, `{{trim}}`, `{{trimStart}}`, `{{trimEnd}}`, `{{uppercase}}…{{/uppercase}}`.

## Conditionals

```
{{#if condition}}…{{else if other}}…{{else}}…{{/if}}
```

Branches are checked top to bottom; the first true branch is kept and its macros resolved, the rest discarded. No true branch and no `{{else}}` resolves to nothing.

Conditions support `==`, `contains`, `&&`, `||`, and parentheses for grouping. A bare value is truthy when non-empty — `{{#if scenario}}` includes the block only when a scenario exists.

Each side of a comparison must be written out. `{{#if character == "Maukie" || "Pantalone"}}` does not do what it looks like; write `character == "Maukie" || character == "Pantalone"`.

## Preset variables

Any `{{NAME}}` that is not a built-in is looked up as a preset variable. If nothing defines it, the tag is left in the text verbatim — which is how a typo'd macro ends up visible in the model's context. Preset variables come from the preset's `variableGroups` / `variableValues` or from choice blocks; see `presets-and-prompts.md`.
