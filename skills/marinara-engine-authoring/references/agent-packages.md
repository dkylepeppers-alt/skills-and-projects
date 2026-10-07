# Downloadable Agent packages

Packages for the official catalog at `Pasta-Devs/Marinara-Agents`, consumed by Marinara Engine through **Agents → Download Agents**. Field detail is in `agent-definition.md`, prompt conventions in `agent-prompt-craft.md`, build and PR process in `agent-ship-checklist.md`. Templates: `templates/agent-package/`.

## First: which kind of package

| | Agent-only package | Feature package |
|---|---|---|
| Contains | `manifest.json` + `agents.json` + `locales/` | plus `src/`, `client.js`, `server.mjs` |
| Built by | `scripts/build-agent-catalog.mjs` | `scripts/build-feature-packages.mjs` or `build-<id>-package.mjs` |
| Needs Engine checkout | no | yes (`MARINARA_ENGINE_ROOT`) |
| `restartRequired` | `false` | `true` iff it has a server entrypoint |
| Examples | prose-guardian, quest, world-state, cyoa | hierarchical-maps, conversation-calls, noodle, slurp2, quartermaster |

A third kind, the **ruleset package** (`kind: ["ruleset"]`, e.g. `ruleset-5e-2014`), ships a validated `ruleset.json` data asset for Game Mode instead of an Agent: `entrypoints: {}`, no permissions, no restart, built by `scripts/build-ruleset-packages.mjs`. Its schema is the Engine's `ruleset.schema.ts` (documented in Engine `docs/extending/writing-rulesets.md`) and each optional block needs a minimum Capability API. It is out of scope for this skill; read those sources before attempting one.

**Default to agent-only.** It is pure JSON — a prompt, a category, a phase, and some settings — and covers most of what people actually want. Only reach for a feature package when the behavior genuinely needs executable runtime, HTTP routes, or its own UI surface. If the user is describing behavior rather than infrastructure, they want agent-only; say so and build that.

## Anatomy of an agent-only package

```
packages/<id>/
├── manifest.json      # hand-written source; the builder rewrites description/files/engine.min
├── agents.json        # hand-written source; the builder reformats it
└── locales/
    ├── en.json        # GENERATED — never hand-edit
    └── ko.json        # optional translation, copied from en.json
```

`id` is kebab-case, matches the directory name, matches `manifest.id`, and at least one entry in `agents.json` must use it as its `id`.

Two rules the validator enforces that trip people up:

- The `agents.json` entry whose `id` equals the package id must have a `description` **identical** to `manifest.description`, either with or without the trailing activation sentence. Write it once, paste it in both.
- `manifest.description` gets an activation sentence appended automatically at build time — but only for ids listed in `scripts/catalog-package-guidance.mjs`. A new package must add its own entry there (`modes` + `activation`) or its description ships without the "Add the Agent in Chat Settings → …" line that every other package has.

## Choosing category and phase

`category` (writer / tracker / misc) decides which section of the Agents panel the agent lands in, and must match the catalog entry's category and the README table it is listed under. `phase` decides when it runs.

- **`pre_generation`** — runs before the main model replies and injects into its prompt. Directors, retrieval, routers, anything that shapes the coming response.
- **`post_processing`** — runs on the finished reply. Trackers, auditors, rewriters, illustrators. This is the common case.

Catalog descriptions are now written in plain, user-facing language — what the user gets, not the mechanism ("Keeps track of your quests, their goals, and their rewards."). Match that tone in new `description` text.
- **`parallel`** — runs alongside generation without gating it. Ambient stuff (combat, echo-chamber).

`resultType: "text_rewrite"` is what makes a post-processing agent replace the message instead of just recording state. Only Continuity Checker, Prose Guardian, and Immersive HTML use it. If your agent is not literally editing the assistant's prose, leave it off.

Trackers additionally set `defaultInjectAsSection` (whether their state is injected back into the prompt as a visible section) and almost always `modeAllowlist: ["roleplay"]`.

## Writing the prompt template

`defaultPromptTemplate` is the whole product for an agent-only package. It is not a system prompt — it is a single-purpose instruction that must return machine-parseable output on every turn. `agent-prompt-craft.md` covers the house patterns: strict JSON contracts, the no-op return value, exact-name matching for updates, full-list replacement semantics, `{{placeholder}}` binding to `defaultSettings` keys, and which `<context_tags>` the Engine supplies.

`promptTemplates[]` supplies user-selectable presets (Quest ships five: Epic Campaign, Real-Life Goals, Single Focus, Mystery Board, Custom). Presets are behavior and are never translated; their `name`/`description` are interface copy and are.

## Build, validate, ship

```bash
npm ci                                      # after fresh checkout or lockfile change
node scripts/build-agent-catalog.mjs <id>   # rebuilds manifest files[], artifact, locale, catalog entry
npm run check
node scripts/test-catalog-lanes.mjs
node scripts/validate-package-locales.mjs
node scripts/validate-catalog.mjs
git diff --check
```

Then install the package through **Agents → Download Agents** in a Marinara Engine checkout and actually exercise it in the modes it claims.

Generated and never hand-edited: `locales/en.json`, `manifest.files[]` hashes and byte counts, `artifacts/*.zip`, `catalog/**/catalog.json`. Change the source, rerun the builder. If a rebuild produces only a `generatedAt` diff, discard it.

## Standing constraints

- Base everything on `staging` and open an issue before implementing a new package.
- Every published package needs a README row in its correct category table, or catalog validation fails.
- Adding a published package changes the count assertion near the end of `validate-catalog.mjs` (agent-only, feature, and ruleset counts; staging-only packages are not counted). Update it in the same PR.
- Permissions are narrowly scoped and justified. An agent-only package needs no more than `agent-runtime`, `chat-read`, `prompt-context`, `storage`, `ui` — and often fewer. `network` and `routes` on a JSON-only package are a red flag.
- About Me is a core Conversation feature and must never be published as an agent package.
- Never invent Engine behavior. If a field, tool, or context tag is not observably used by an existing package in the repo, check before relying on it.
