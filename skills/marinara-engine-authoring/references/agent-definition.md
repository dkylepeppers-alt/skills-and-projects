# `agents.json` and `manifest.json` field reference

Derived from the 42 package directories in `Pasta-Devs/Marinara-Agents` (41 with an `agents.json`; the ruleset package has none). Values listed are the ones actually in use; anything outside them is unproven.

## agents.json

Top level is an **array** of agent definitions. Most packages ship exactly one. At least one entry's `id` must equal the package id.

### Required on every definition

| Field | Notes |
|---|---|
| `id` | kebab-case, unique across the entire catalog, not just the package |
| `name` | display name in the Agents panel |
| `description` | for the entry matching the package id, must equal `manifest.description` (with or without the appended activation sentence) |
| `phase` | `pre_generation` \| `post_processing` \| `parallel` |
| `category` | `writer` \| `tracker` \| `misc` — validator rejects anything else |
| `defaultPromptTemplate` | must be a string; validator checks the type, not the content |
| `defaultTools` | array; `[]` for most. Observed tools: `roll_dice`, `search_lorebook`, `spotify_*` |
| `author` | `"Pasta Devs"` for first-party |
| `enabledByDefault` | `false` in every shipped package — users opt in per chat |

### Optional

| Field | Values seen | Use |
|---|---|---|
| `resultType` | `"text_rewrite"` | The agent replaces the assistant message. Only for genuine rewriters (continuity, prose-guardian, html). Mirror it into `defaultSettings.resultType` as those packages do. |
| `modeAllowlist` | `roleplay`, `conversation`, `game` | Restrict to modes the prompt actually makes sense in. Omit = all modes. |
| `defaultInjectAsSection` | `true` / `false` | Trackers only: inject tracked state back into the prompt as a labeled section. |
| `defaultSettings` | object | Per-agent settings surfaced in the UI. Keys become `{{placeholders}}` in the prompt. |
| `promptTemplates` | array | User-selectable presets. See below. |
| `runInterval` | `1`, `5`, `8` | Run every N turns instead of every turn. Use for expensive agents (card-evolution-auditor `8`, illustrator `5`, lorebook-keeper `1`). |
| `execution` | `pipeline` \| `host` \| `feature` | Feature packages. Agent-only packages omit it. |
| `runtimeDisabled` | `true` / `false` | Feature packages whose runtime lives outside the agent pipeline. |
| `libraryHidden` | `true` | Hides the agent from the library list (noodle, slurp, pixelforge, gacha-forge). |

### promptTemplates

```json
{
  "id": "single-focus",
  "name": "Single Focus",
  "description": "Tracks exactly one quest at a time; when it resolves, the next one begins. Minimal and low-token.",
  "promptTemplate": "…full replacement prompt…"
}
```

`id` is kebab-case. `name` and `description` are interface copy and get localized; `promptTemplate` is behavior and is never translated. When a package ships presets, `defaultSettings` conventionally carries `defaultPromptTemplateName` and `defaultPromptTemplateDescription` so the built-in default appears in the same picker as the presets.

A `custom` preset is a common courtesy: a stripped starter with a `[YOUR INSTRUCTIONS]` line the user replaces, keeping the output format intact so the tracker keeps parsing.

## manifest.json

Schema: `schemas/package-manifest.schema.json`, `additionalProperties: false`.

Required: `schemaVersion`, `id`, `name`, `version`, `engine`, `kind`, `entrypoints`, `files`, `permissions`.

| Field | Notes |
|---|---|
| `schemaVersion` | `1` for agent-only. `2` additionally requires `capabilityApi` (`{ major, minor }`) and `builtAgainst` (`{ engineVersion, engineCommit }`), and forbids them when `1`. |
| `id` | `^[a-z0-9]+(?:-[a-z0-9]+)*$`, ≤80 chars, equals the directory name |
| `version` | semver |
| `description` | ≤2000 chars. Builder appends the activation sentence from `catalog-package-guidance.mjs`. |
| `engine` | `{ "min": "2.3.0", "maxExclusive": "4.0.0" }` — this range alone decides which catalog lanes the package publishes into. Minimums in use run from `2.3.0` to `2.4.6`; raise it only when the package needs newer Engine behavior |
| `kind` | array from `agent`, `maps`, `conversation-calls`, `ruleset`, `turn-game`. Agent-only: `["agent"]`. |
| `entrypoints` | agent-only: `{ "agents": "agents.json" }`. A `server` or `client` entrypoint makes the agent-catalog builder skip the package entirely. |
| `files` | **generated** — path/sha256/bytes per declared file |
| `permissions` | subset of `agent-runtime`, `chat-read`, `chat-write`, `network`, `prompt-context`, `routes`, `storage`, `ui` |
| `restartRequired` | must equal `Boolean(entrypoints.server)`. `false` for agent-only. |
| `localizations` | optional inline name/description overrides per locale |
| `contributions` | feature packages only: slots, assets, Home tabs, Game Mode setup. Deliberately an open object in the catalog schema — the Engine owns the contract and grows it per Capability API. Agent-only packages omit it |

Cross-checks the validator runs: a `client` entrypoint requires the `ui` permission; `maps` requires `routes` plus four contribution slots; every entrypoint and contributed asset path must appear in `files`; declared hashes and sizes must match both the working tree and the ZIP.

## locales

`packages/<id>/locales/en.json` is **generated** from `manifest.json` + `agents.json` by `node scripts/sync-package-locales.mjs` (and by the builder). Edit the sources, regenerate.

Translations are hand-made: copy `en.json` to a BCP 47 name (`ko.json`, `pt-BR.json`), update `_meta.locale`, translate only what you can maintain. Partial files are fine and fall back to English. Never change agent or prompt-template ids. Validate with `node scripts/validate-package-locales.mjs`.
