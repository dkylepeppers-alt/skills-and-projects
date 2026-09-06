# Regex scripts, custom tools, personal extensions, themes

Four small extension surfaces. Schemas: `regex.schema.ts`, `custom-tool.schema.ts`, `personal-extension.schema.ts`, `theme.schema.ts`. Docs: `docs/extending/`.

Regex scripts do export and import as files. Custom tools, personal extensions, and themes are created in the app; for those, this reference gives the exact field set so a generated body is correct before the user pastes it in.

## Regex scripts

Find/replace run over messages.

**File shape: a bare JSON array — no envelope.** A regex export is `[ {…}, {…} ]`, one object per script, and the import route validates each item with `importRegexScriptSchema`. Verified against a real 15-script export.

`importRegexScriptSchema` and `createRegexScriptSchema` differ in one way that matters: **import skips the catastrophic-backtracking check.** Both validate depth range and pattern syntax, but only the create path runs `isPatternSafe`. So a pattern that imports fine may be rejected when the user later edits and saves it in the app. Write patterns that pass the stricter check regardless — use bounded quantifiers (a capped `{0,20000}?` repetition) rather than an unbounded lazy `*?` scan, which is what the shipped FF5 scripts do.

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

Exported scripts carry `name`, `enabled`, `findRegex`, `replaceString`, `trimStrings`, `placement`, `flags`, `promptOnly`, `applyMode`, `targetCharacterIds`, `minDepth`, `maxDepth`. `targetPromptPresetIds` and `order` are in the schema but absent from exports; omit them.

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
| `includeHiddenContext` | `false` | |
| `enabled` | `true` | |
| `sortOrder` | optional | |

`description` does the real work — the model chooses tools by description, so name the trigger condition, not just the capability. `static` is the right default for anything that returns a constant or a lookup table; reach for `webhook` or `script` only when the result genuinely has to be computed.

## Personal extensions

User-installed CSS/JS. Security-sensitive: they require an explicit approval step keyed to a content hash, so they cannot be silently dropped in.

```
name: 1–200                     version: string | number | null
description: ≤2000
runtime: "client" | "server"    default client
capabilities: []                read_active_characters | read_active_persona | full-page access
css / js / serverJs: string | null
```

The runtime split is enforced:

- `runtime: "server"` requires `serverJs` and **forbids any capabilities** — server extensions cannot request browser-context access.
- `runtime: "client"` requires at least one of `css` or `js`.

CSS is byte-capped (shared with themes). Extension storage is capped at 1,000,000 bytes of JSON.

Approval takes `{ contentHash: "sha256:<64 hex>", acknowledgeSandboxedCode: true, acknowledgeFullPageAccess?: true }`, and rollback targets a prior content hash. Contribution surfaces are `button`, `menu-item`, and `panel` placed in surfaces like `top-bar`, `chats`, `bots`, `characters`.

Ask for the narrowest capability set that works. The full-page capability needs a second explicit acknowledgement for a reason.

## Themes

`{ name (1–200), css, installedAt? }`. CSS is subject to the same byte limit. `setActiveTheme` takes `{ id }` or `{ id: null }` to clear.

Themes are pure CSS against the app's own variables. `DESIGN.md` and `DESIGN.json` in the Engine repo root are the token reference — read those before writing selectors, since hard-coded colors will fight the light/dark switch.
