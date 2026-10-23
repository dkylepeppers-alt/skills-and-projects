# `agents.json` and `manifest.json` field reference

Package fields below distinguish the Engine v2.5.1 loader from companion-catalog conventions. Source pins: Engine [`8042ef6`](https://github.com/Pasta-Devs/Marinara-Engine/blob/8042ef6ec638801de45b8d82f82cd2dea85f51a4/packages/shared/src/schemas/capability-package.schema.ts), Agents [`0d97d85`](https://github.com/Pasta-Devs/Marinara-Agents/blob/0d97d8520dfd7ae9ec0d5e2a7f016b9b233e78e3/scripts/validate-catalog.mjs). Recheck these contracts when targeting another release.

## Choose the import format

| Destination | File contract |
|---|---|
| Official Download Agents catalog | Package `manifest.json` with `schemaVersion: 1` or `2`, pointing to an `agents.json` array of definitions with `id`, `defaultPromptTemplate`, and `defaultSettings`. |
| In-app custom Agent file/folder import | Config with `type`, `name`, `phase`, `promptTemplate`, and `settings`; defaults and optional fields follow `createAgentConfigSchema`. A catalog definition is not this config. |
| In-app custom Agent export ZIP | `marinara-agents.json` folder envelope (`kind: "marinara.agent-folder"`, `version: 1`), plus `Agents/<segment>/manifest.json` (`kind: "marinara.agent"`, `version: 1`, `config`), `prompt.md`, and `settings.json`. Config refers to the latter files with `promptTemplatePath` and `settingsPath`. This `version` is not catalog `schemaVersion`. |

The custom import API wraps the normalized config as `{ agent, source: "file" | "folder", approvedCapabilities: [...], acknowledgePermissions: true }`. The UI presents requested capabilities for review; approval is not an author-supplied grant. Imports require the Agent-import policy enabled and privileged access. The server accepts only approved capabilities the config requested, strips transferred tool grants and unsafe local bindings, records provenance, and resets `connectionId`/`imagePath` to null. Do not promise imported Agents retain source credentials or function access.

Custom permissions live in `settings.customCapabilities` (true-valued capability ids); they are distinct from package-manifest `permissions`. Valid ids in v2.5.1: `create_characters`, `create_lorebooks`, `edit_lorebooks`, `edit_messages`, `edit_trackers`, `change_frontend_styling`, `change_backgrounds`, `change_sprites`, `control_media`, `control_haptics`, `edit_about_me`, `trigger_image_generation`, `access_vectors`, `edit_main_prompt`, `manage_chat_characters`. Match the selected result type to its required capability; use the runtime's mapping rather than inferring permission from an Agent's name.

Pinned import/export sources: [`agent.schema.ts`](https://github.com/Pasta-Devs/Marinara-Engine/blob/8042ef6ec638801de45b8d82f82cd2dea85f51a4/packages/shared/src/schemas/agent.schema.ts), [`agents.routes.ts`](https://github.com/Pasta-Devs/Marinara-Engine/blob/8042ef6ec638801de45b8d82f82cd2dea85f51a4/packages/server/src/routes/agents.routes.ts), [`agent-transfer.ts`](https://github.com/Pasta-Devs/Marinara-Engine/blob/8042ef6ec638801de45b8d82f82cd2dea85f51a4/packages/client/src/lib/agent-transfer.ts), and capability ids/result mapping in [`types/agent.ts`](https://github.com/Pasta-Devs/Marinara-Engine/blob/8042ef6ec638801de45b8d82f82cd2dea85f51a4/packages/shared/src/types/agent.ts).

## agents.json

Top level is an **array** of agent definitions. Most packages ship exactly one. At least one entry's `id` must equal the package id.

### Required by the Engine package-definition schema

| Field | Notes |
|---|---|
| `id` | kebab-case, unique across the entire catalog, not just the package |
| `name` | display name in the Agents panel |
| `description` | for the entry matching the package id, must equal `manifest.description` (with or without the appended activation sentence) |
| `phase` | `pre_generation` \| `post_processing` \| `parallel` |
| `category` | `writer` \| `tracker` \| `misc` — validator rejects anything else |
| `defaultPromptTemplate` | must be a string; validator checks the type, not the content |
| `enabledByDefault` | boolean; use `false` for opt-in catalog Agents — chat selections control activation |

### Optional

| Field | Values seen | Use |
|---|---|---|
| `defaultTools` | array of tool-name strings | Catalog convention: `[]` when none. Engine schema makes this optional. Check tool availability for the targeted release. |
| `author` | string | `"Pasta Devs"` for first-party; use the actual author for personal content. Optional to the Engine. |
| `resultType` | Engine result-type enum | Legacy top-level compatibility field, deprecated in v2.5.1. Author new result types in `defaultSettings.resultType`; `"text_rewrite"` replaces the assistant message and belongs only on genuine rewriters. |
| `modeAllowlist` | `roleplay`, `conversation`, `game` | Restrict to modes the prompt actually makes sense in. Omit = all modes. |
| `defaultInjectAsSection` | `true` / `false` | Trackers only: inject tracked state back into the prompt as a labeled section. |
| `defaultSettings` | object | Per-agent settings surfaced in the UI. Keys become `{{placeholders}}` in the prompt. |
| `promptTemplates` | array | User-selectable presets. See below. |
| `runInterval` | positive integer | Run on a cadence instead of every turn. The definition schema rejects `0`; Illustrator's manual-only `0` is a separate Engine settings/UI scheduling option. |
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
| `schemaVersion` | Both `1` and `2` load in Engine v2.5.1. `1` is sufficient for the agent-only template; `2` additionally requires `capabilityApi` (`{ major, minor }`) and `builtAgainst` (`{ engineVersion, engineCommit }`), and forbids them when `1`. Use `2` when a contribution/permission requires an API declaration. |
| `id` | `^[a-z0-9]+(?:-[a-z0-9]+)*$`, ≤80 chars, equals the directory name |
| `version` | semver |
| `description` | ≤2000 chars. Builder appends the activation sentence from `catalog-package-guidance.mjs`. |
| `engine` | Inclusive `min`, exclusive `maxExclusive`; the range decides publication lanes, while actual installation also checks Capability API and contribution contracts. `2.3.0` is the companion builder's fallback, not proof a new package works there. Declare and test the release whose behavior the payload needs. |
| `kind` | array from `agent`, `maps`, `conversation-calls`, `ruleset`, `turn-game`. Agent-only: `["agent"]`. |
| `entrypoints` | agent-only: `{ "agents": "agents.json" }`. A `server` or `client` entrypoint makes the agent-catalog builder skip the package entirely. |
| `files` | **generated** — path/sha256/bytes per declared file |
| `permissions` | Current companion schema accepts `agent-runtime`, `chat-read`, `chat-write`, `network`, `prompt-context`, `routes`, `storage`, `ui`. Engine v2.5.1 additionally recognizes `achievements`, `conversation-actions`, `mari-actions`, `scenes`, `tools`; using these in this catalog needs its schema/validation updated too. Check API gates before declaring them. |
| `restartRequired` | must equal `Boolean(entrypoints.server)`. `false` for agent-only. |
| `localizations` | optional inline name/description overrides per locale |
| `contributions` | slots, assets, Home tabs, Game Mode setup. Feature packages use it, and so do ruleset packages: `contributions.assets.paths` must list `ruleset.json` and every `catalogs/<id>.json`, because the ruleset builder reads it to hash and zip them. Deliberately an open object in the catalog schema — the Engine owns the contract and grows it per Capability API. Agent-only packages omit it |

Cross-checks the validator runs: a `client` entrypoint requires the `ui` permission; `maps` requires `routes` plus four contribution slots; every entrypoint and contributed asset path must appear in `files`; declared hashes and sizes must match both the working tree and the ZIP.

Engine v2.5.1 supports Capability API **1.341**. Schema-2 packages require the same major and a minor no higher than 341; schema-1 packages skip that API-version check but still face strict manifest and contribution validation. `builtAgainst` is provenance, not a substitute for compatibility: the companion builder checks its Engine version is within the declared range, and the installer separately checks the running Engine range. Catalog parsing drops entries whose newer fields cannot be parsed rather than breaking the whole catalog. Sources: pinned schema above and [`package-manager.service.ts`](https://github.com/Pasta-Devs/Marinara-Engine/blob/8042ef6ec638801de45b8d82f82cd2dea85f51a4/packages/server/src/services/capability-packages/package-manager.service.ts).

## locales

`packages/<id>/locales/en.json` is **generated** from `manifest.json` + `agents.json` by `node scripts/sync-package-locales.mjs` (and by the builder). Edit the sources, regenerate.

Translations are hand-made: copy `en.json` to a BCP 47 name (`ko.json`, `pt-BR.json`), update `_meta.locale`, translate only what you can maintain. Partial files are fine and fall back to English. Never change agent or prompt-template ids. Validate with `node scripts/validate-package-locales.mjs`.
