# Regex scripts, custom tools, personal extensions, themes

Checked against Engine **v2.5.2**, commit `fc0333c3fe978cda5e0b919bd6faec985901704e`, 2026-11-06; [checked release notes](https://github.com/Pasta-Devs/Marinara-Engine/releases/tag/v2.5.2).

Four extension surfaces. Schemas: `regex.schema.ts`, `custom-tool.schema.ts`, `personal-extension.schema.ts`, `theme.schema.ts`. Docs: `docs/extending/`.

All four have app file-transfer paths described below. Their wrappers differ from the standard `marinara_*` entity envelope; use the checked format instead of inventing one.

## Regex scripts

Find/replace run over messages.

**Current export shape:** `{ "kind": "marinara.regex-scripts", "version": 1, "exportedAt": "<ISO>", "regexScripts": [ {…} ] }`, downloaded as `marinara-regexes.json`. This is a `kind` wrapper, not the entity envelope's `type`/`data`. The UI importer also accepts legacy bare arrays, a single script, or `regexScripts` / `regexes` / `scripts` collections, then sends each normalized item to `/api/regex-scripts/import` for `importRegexScriptSchema` validation. Foreign `scriptName`, `disabled`, delimited `/pattern/flags`, and numeric ST placements are mapped there. ST placements 0/2 map to `ai_output`, 1 to `user_input`; unsupported placement values are dropped with a warning; if none remain the normalized script defaults to `ai_output`.

`importRegexScriptSchema` and `createRegexScriptSchema` differ in one way that matters: **import skips the catastrophic-backtracking check.** Import validates depth range and pattern syntax; create/update validate depth range and run `isPatternSafe`. Runtime still skips unsafe imported patterns, and since 2.5.2 regex scripts arriving inside imported character cards get a stricter static safety analysis so a pattern cannot stall the server or page while checked or run (#8055). So a pattern that imports fine may be rejected when the user later edits and saves it in the app. Write patterns that pass the stricter check regardless — use bounded quantifiers (a capped `{0,20000}?` repetition) rather than an unbounded lazy `*?` scan, which is what the shipped FF5 scripts do.

| Field | Default | Notes |
|---|---|---|
| `name` | — | required, 1–200 |
| `enabled` | `true` | |
| `findRegex` | — | required, non-empty |
| `replaceString` | `""` | |
| `trimStrings[]` | `[]` | strings stripped from the match |
| `placement[]` | — | required, at least one of `ai_output`, `user_input` |
| `flags` | `"gi"` | must be valid JS regex flags |
| `promptOnly` | `false` | |
| `applyMode` | optional | `prompt` \| `display` \| `both` |
| `targetCharacterIds[]`, `targetPromptPresetIds[]` | `[]` | scope the script |
| `order` | optional | |
| `minDepth`, `maxDepth` | `null` | `minDepth` must not exceed `maxDepth` |

Two things constrain the pattern. `{{macros}}` are resolved *before* the pattern compiles, so they are legal inside `findRegex` — the validator strips them before checking syntax so macro braces are not read as a malformed `{n,m}` quantifier. And patterns are rejected for catastrophic backtracking risk: nested quantifiers and overly long patterns fail `isPatternSafe`. Write `[^"]*` rather than `(.*)*`.

Exported scripts carry `name`, `enabled`, `findRegex`, `replaceString`, `trimStrings`, `placement`, `flags`, `promptOnly`, `applyMode`, `targetCharacterIds`, **`targetPromptPresetIds` and `order`**, `minDepth`, `maxDepth`. Preserve intentional scope IDs for same-install transfer; they may not identify existing resources elsewhere. Imports append using an order base plus any supplied order.

In a Roleplay chat with Individual group mode, `prompt` and `both` scripts follow the character receiving the prompt: the responder's own replies count as `ai_output`, while the user's and other characters' messages count as `user_input`. `targetCharacterIds` still decides who gets the rewritten prompt.

`applyMode` is the useful distinction. `display` cleans up what the user reads without touching what the model sees on the next turn; `prompt` does the opposite; `both` changes the message permanently. A script that strips an artifact from output should usually be `display` only, so the model still sees its own original text and stays consistent.

## Custom tools

Function-calling tools the model can invoke.

| Field | Default | Notes |
|---|---|---|
| `name` | — | required, `^[a-z][a-z0-9_]*$`, ≤100 — lowercase snake_case, enforced |
| `description` | — | required, 1–500; this is what the model reads to decide when to call it |
| `parametersSchema` | `{}` | JSON Schema object for the arguments |
| `executionType` | `"static"` | `webhook` \| `static` \| `script` |
| `webhookUrl` | `null` | must be a valid URL |
| `staticResult` | `null` | fixed string returned to the model |
| `scriptBody` | `null` | source for `executionType: "script"` |
| `includeHiddenContext` | `false` | |
| `enabled` | `true` | |
| `sortOrder` | optional | |

Tools only reach the model on a tool-capable connection with **Enable Tool Use** on for the chat. Claude and Grok subscription transports ignore native tool definitions. In Game chats `search_lorebook` additionally needs **Let the GM search lore**.

`description` does the real work — the model chooses tools by description, so name the trigger condition, not just the capability. `static` is the right default for anything that returns a constant or a lookup table; reach for `webhook` or `script` only when the result genuinely has to be computed.

### Custom-tool transfer

Use **Presets → Functions** for JSON/ZIP import. Single-tool export from the editor is a `.json` `kind: "marinara.function-folder"`, version 1, `folderName: "Function Calls"`, with `functions: [{ path: "Function Calls/<safe-name>/manifest.json", manifest: { kind: "marinara.function", version: 1, config: { …tool fields… } } }]`. Inline config uses the table above.

Bulk export downloads `marinara-functions.zip`: root `marinara-functions.json` (same function-folder wrapper) and each function's manifest plus `parameters.schema.json`; scripts use `scriptBodyPath: "script.js"`, and static results longer than 2,000 characters use `staticResultPath: "static-result.txt"`. The importer also accepts `functions` / `customTools` / `tools` collections and inline `parametersSchema` / `parameters`; package paths include `parametersSchemaPath` / `parametersPath`, `scriptBodyPath` / `scriptPath` / `scriptPaths` and `staticResultPath`. Bare JSON cannot resolve missing companion files: use inline bodies or the ZIP.

Webhook and script imports are forced to `enabled: false` and `includeHiddenContext: false`, with review information describing their destination/type and requested settings. Static tools keep their normalized settings. Agent import skips bundled functions; import functions through their own surface. Tool exports can contain webhook credentials; the app confirms before that export. Keep source secrets out of distributable examples.

## Personal extensions

User-installed CSS/JS. File import creates or updates an extension draft; it does not grant approval to run it. External imports require both `ENABLE_EXTERNAL_EXTENSIONS=true` and the app's Danger Zone opt-in. Execution requires approval of the exact content hash. A same-name import can update an existing extension, so review its version and contents.

```
name: 1–200                     version: string | number | null
description: ≤2000
runtime: "client" | "server"    default client
capabilities: []                read_active_characters | read_active_persona | full_page_access
css / js / serverJs: string | null
```

The runtime split is enforced:

- `runtime: "server"` requires `serverJs` and **forbids any capabilities** — server extensions cannot request browser-context access.
- `runtime: "client"` requires at least one of `css` or `js`.

CSS is capped at **262,144 UTF-8 bytes (256 KiB)**, shared with themes; character count is not the byte budget. Extension storage is capped at 1,000,000 bytes of JSON.

Approval takes `{ contentHash: "sha256:<64 hex>", acknowledgeSandboxedCode: true, acknowledgeFullPageAccess?: true }`, and rollback targets a prior content hash. Contribution kinds are `button`, `menu-item`, `panel`, and `command`. A command targets an existing contribution from the same extension revision using `targetContributionId`; it has no callback. Surface contributions use `top-bar`, `chats`, `bots`, `characters`, `personas`, `lorebooks`, `presets`, `connections`, `agents`, or `settings`, with `header`, `before-content`, or `after-content` positions. UI descriptors are validated plain data, not host HTML/React callbacks.

Browser extensions gain `marinara.dice.registerFormat(options)` in 2.5.2, teaching `/roll` a custom notation (`id`, `label`, `parse(notation)` returning null for notation it does not read; see Engine `docs/extending/writing-personal-extensions.md` → **Add a dice format**). Extension dice text in a `/roll` message always renders as escaped plain text (#8773).

Revision history keeps 0-10 revisions per extension (default 10): `GET` / `PATCH /api/personal-extensions/revision-history` with `{ limit, confirmPrune?: true }` (2.5.2).

Every runtime (browser, full-page, and server) gets `marinara.estimateTextTokens(text): number`, a synchronous model-agnostic estimate needing no capability.

Browser extensions normally run in an opaque-origin Worker sandbox, not in the host DOM. `full_page_access` is an external-only trust mode requiring its extra acknowledgement, not an extra sandbox capability for Professor Mari drafts. A Personal Extension row never keeps it (it is stripped on save), and since 2.5.2 Professor Mari refuses to draft a Personal Extension with it rather than saving one that switches itself off at restart (#8113). Server code runs in a separate restricted process, never by in-process import. Prefer narrow context capabilities and declarative contributions.

### Writing the code: read the Engine docs

This reference covers the file contract, packaging and trust gates. It does **not** cover the runtime APIs or working code. Before writing extension JavaScript, read the pinned Engine guides (v2.5.2), and recheck them against the user's installed version:

| Need | Engine doc |
|---|---|
| Browser extension quickstart with working code | [Browser Extension quickstart](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/docs/extending/writing-personal-extensions.md#browser-extension-quickstart) |
| Full browser API (`ui.registerContribution`, `ui.showWindow`, `marinara.storage`, timers, `onCleanup`, `dice.registerFormat`) | [Browser API reference](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/docs/extending/writing-personal-extensions.md#browser-api-reference) |
| What each context capability unlocks | [Context capabilities](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/docs/extending/writing-personal-extensions.md#context-capabilities), [What a Browser Extension can do](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/docs/extending/writing-personal-extensions.md#what-a-browser-extension-can-do) |
| Marinara-rendered panels and their element descriptors | [Add a Marinara-rendered panel](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/docs/extending/writing-personal-extensions.md#add-a-marinara-rendered-panel) |
| Reading the active chat, characters and persona | [Use active chat context](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/docs/extending/writing-personal-extensions.md#use-active-chat-context) |
| Token estimates and dice formats | [Estimate text tokens](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/docs/extending/writing-personal-extensions.md#estimate-text-tokens), [Add a dice format](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/docs/extending/writing-personal-extensions.md#add-a-dice-format) |
| Full-page (unsandboxed) External Extensions and legacy code | [Legacy and full page extensions](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/docs/extending/writing-personal-extensions.md#legacy-and-full-page-extensions) |
| Server extension quickstart and API | [Server Extension quickstart](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/docs/extending/writing-personal-extensions.md#server-extension-quickstart) |
| Manifest fields and validation limits | [Package and manifest reference](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/docs/extending/writing-personal-extensions.md#package-and-manifest-reference), [Validation limits](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/docs/extending/writing-personal-extensions.md#validation-limits) |
| Updating, rollback, recovery and debugging | [Update and recovery lifecycle](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/docs/extending/writing-personal-extensions.md#update-and-recovery-lifecycle), [Debugging](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/docs/extending/writing-personal-extensions.md#debugging) |
| User-side install, the two External Extension gates, platform support, revisions | [Personal Extensions](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/docs/extending/personal-extensions.md) |
| Security invariants and how each runtime is isolated | [Personal Extension Architecture](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/docs/development/personal-extensions.md) |

Use only APIs those guides document for 2.5.2 or the later release being targeted.

### Extension files and packages

The Settings extension importer accepts `.zip`, `.json`, `.css`, `.js`, `.mjs`, `.cjs`, `.server.js`, `.server.mjs`, `.server.cjs` and folders. Loose `.server.*` files become server extensions; ordinary JS/CSS become client drafts. JSON may contain a direct config, a manifest/config, or `extensions` / `personalExtensions` collections. Folder/ZIP manifests can name `cssPath` / `cssPaths`, `jsPath` / `jsPaths`, or `serverJsPath` / `serverJsPaths`; inline `css`, `js` and `serverJs` are also supported. Paths resolve within the selected package, not arbitrary local files.

A native extension export downloads `<safe-name>.personal-extension.zip`:

```text
Personal Extensions/<safe-name>/manifest.json
Personal Extensions/<safe-name>/extension.css        # client CSS, when present
Personal Extensions/<safe-name>/extension.js         # client JS, when present
Personal Extensions/<safe-name>/server-extension.js  # server runtime instead
```

The manifest is `{ "kind": "marinara.personal-extension", "version": 1, "config": { "name": "Example", "runtime": "client", "enabled": false, "capabilities": [], "jsPath": "extension.js" } }`; server kind is `marinara.personal-server-extension` with `serverJsPath`. Config also carries description and optional version/CSS path. Keep `capabilities: []` explicit for a modern sandboxed package. Legacy `kind: "marinara.extension"` without any capabilities declaration is classified as `full_page_access`; do not use that legacy shape for new sandboxed code. Import still follows the policy/hash approval gates above. A profile import quarantines extensions and tools rather than silently enabling their executable content.

## Themes

`{ name (1–200), css, installedAt? }`. CSS is subject to the same **256 KiB UTF-8** byte limit. `setActiveTheme` takes `{ id }` or `{ id: null }` to clear.

The theme schema is unchanged in 2.5.2, but **Roleplay Messages Background Opacity** (Settings → Appearance → Roleplay) now governs every Roleplay message box, including card and persona box colors and preset gradients. Custom themes and card CSS that set the background themselves still win (#8424).

Themes are pure CSS against the app's own variables. `DESIGN.md` and `DESIGN.json` in the Engine repo root are the token reference — read those before writing selectors, since hard-coded colors will fight the light/dark switch.

Themes import through Settings → Themes → Import File as `.css` or `.json`. A minimal JSON is `{ "name": "Example", "css": ":root { --background: #101018; }" }`. The importer also accepts `themes` collections and manifest/config entries. Current theme export is a `.json` `kind: "marinara.theme-folder"`, version 1, containing a `themes` array with a `marinara.theme` manifest/config entry; it is not a `marinara_theme` export envelope. Import syncs a theme to the server; it does not automatically activate it. Profile-imported themes are forced inactive.

## CSS authoring boundaries

Choose the surface before writing selectors:

- **App themes and page extension CSS:** `sanitizeAppCss` normalizes accidentally escaped newlines, then `stripDangerousCss` blocks script/network constructs. External/relative `url()` resources and `@import` are removed/neutralized. Embedded image/font data URLs are allowed; `@font-face` needs embedded font sources and no `local()`. App CSS may set theme variables and use positioning/pseudo-elements; it is not confined to a card box.
- **Creator-notes card CSS:** parsed from `<style>` blocks, sanitized and scoped per card. It cannot override protected theme tokens, use `:has()` to probe outside the card, or escape to host siblings. Fonts/keyframes are namespaced. `@chat-mode roleplay { … }`, `conversation` and `game` select mode-specific blocks. Use flat complete rules; nested selector rules and global `@property` registrations do not survive scoping.
- **Message/greeting HTML CSS:** scoped to its own message/card box. Nested selector rules, `@property`, document-global at-rules and scope-sibling selectors are dropped. With **Load images from other websites in messages** off (the default, still off in v2.5.2), external images wait for user loading and CSS cannot fetch remote backgrounds/fonts. Embed portable images or use Engine media instead of promising that remote CSS assets display automatically. This message setting does not turn app theme CSS into unrestricted network CSS.

The v2.5.1 release notes describe the remote-image and CSS scoping changes (#7829). Test rendered output in the intended surface: schema-valid CSS can be transformed or removed by the client sanitizer.

## Pinned implementation sources

- [Regex schema/import distinction](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/schemas/regex.schema.ts)
- [Custom-tool fields](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/schemas/custom-tool.schema.ts)
- [Extension schema and approvals](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/schemas/personal-extension.schema.ts)
- [Extension capabilities/contributions](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/types/personal-extension.ts)
- [Extension file normalization](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/client/src/lib/personal-extension-import.ts)
- [Extension ZIP export](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/client/src/lib/personal-extension-transfer.ts)
- [Extension import UI/policy](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/client/src/components/panels/settings/PersonalExtensionsSettings.tsx)
- [Theme import/export](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/client/src/components/panels/SettingsPanel.tsx)
- [CSS byte cap](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/schemas/css-size.ts)
- [App CSS sanitizer entry](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/client/src/lib/theme-css.ts)
- [Card CSS sanitizer/scoper](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/client/src/lib/card-css.ts)
- [Message CSS sanitizer/scoper](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/client/src/lib/chat-message-css.ts)
- [Profile import quarantine](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/routes/backup.routes.ts)
- [Regex export serialization and regex/function import UI](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/client/src/components/panels/PresetsPanel.tsx)
- [Custom-tool package files and import normalization](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/client/src/lib/custom-tool-transfer.ts)
- [Single-tool export](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/client/src/components/agents/ToolEditor.tsx)
