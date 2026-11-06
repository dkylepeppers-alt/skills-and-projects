# Downloadable Agent packages

Packages for the official catalog at `Pasta-Devs/Marinara-Agents`, consumed by Marinara Engine through **Agents → Agent Organizer** (named **Download Agents** before 2.5.2). Field detail is in `agent-definition.md`, including the separate in-app custom Agent import/export format; prompt conventions are in `agent-prompt-craft.md`, build and PR process in `agent-ship-checklist.md`. Templates: `templates/agent-package/`.

## First: which kind of package

| | Agent-only package | Feature package |
|---|---|---|
| Contains | `manifest.json` + `agents.json` + `locales/` | plus `src/`, `client.js`, `server.mjs` |
| Built by | `scripts/build-agent-catalog.mjs` | `scripts/build-feature-packages.mjs` or `build-<id>-package.mjs` |
| Needs Engine checkout | no | yes (`MARINARA_ENGINE_ROOT`) |
| `restartRequired` | `false` | `true` iff it has a server entrypoint |
| Examples | prose-guardian, quest, world-state, cyoa | hierarchical-maps, conversation-calls, noodle, slurp2, quartermaster |

A third kind, the **ruleset package** (`kind: ["ruleset"]`, e.g. `ruleset-5e-2014`), ships a validated `ruleset.json` data asset for Game Mode instead of an Agent: `entrypoints: {}`, no permissions, no restart, its asset files declared in `contributions.assets.paths`, built by `scripts/build-ruleset-packages.mjs`. Use [game-content.md](game-content.md) for rulesets and the other Game content families; their Engine contracts and import surfaces differ from `agents.json`. Optional ruleset blocks have their own minimum Capability API.

**Default to agent-only.** It is pure JSON — a prompt, a category, a phase, and some settings — and covers most of what people actually want. Only reach for a feature package when the behavior genuinely needs executable runtime, HTTP routes, or its own UI surface. If the user is describing behavior rather than infrastructure, they want agent-only; say so and build that.

## Anatomy of an agent-only package

```
packages/<id>/
├── manifest.json      # hand-written source; builder adds guidance/files and defaults a missing engine.min
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

`category` (writer / tracker / misc) is still the schema enum and must match the catalog entry's category and the README table it is listed under. Since 2.5.2 the Agents sidebar with no chat open groups agents by their Agent Organizer store **section** (`store/store.json`, below) rather than by category, so choose both deliberately. Official and downloaded agents can no longer be copied into custom agents (2.5.2), so a user who wants a variant needs a custom agent written from scratch. `phase` decides when it runs.

- **`pre_generation`** — runs before the main model replies and injects into its prompt. Directors, retrieval, routers, anything that shapes the coming response.
- **`post_processing`** — runs on the finished reply. Trackers, auditors, rewriters, illustrators. This is the common case.

- **`parallel`** — runs alongside generation without gating it. Ambient stuff (combat, echo-chamber).

Catalog descriptions are written in plain, user-facing language — what the user gets, not the mechanism ("Keeps track of your quests, their goals, and their rewards."). Match that tone in new `description` text.

`defaultSettings.resultType: "text_rewrite"` makes a post-processing agent replace the message instead of just recording state. If your agent is not literally editing the assistant's prose, leave it off. The top-level `resultType` remains readable for legacy packages but is deprecated since the v2.5.1 loader.

Trackers additionally set `defaultInjectAsSection` (whether their state is injected back into the prompt as a visible section) and almost always `modeAllowlist: ["roleplay"]`.

## Writing the prompt template

`defaultPromptTemplate` is the whole product for an agent-only package. It is not a system prompt — it is a single-purpose instruction that must return machine-parseable output on every turn. `agent-prompt-craft.md` covers the house patterns: strict JSON contracts, the no-op return value, exact-name matching for updates, full-list replacement semantics, `{{placeholder}}` binding to `defaultSettings` keys, and which `<context_tags>` the Engine supplies.

`promptTemplates[]` supplies user-selectable presets (Quest ships five: Epic Campaign, Real-Life Goals, Single Focus, Mystery Board, Custom). Presets are behavior and are never translated; their `name`/`description` are interface copy and are.

## Build, validate, ship

```bash
npm ci                                      # after fresh checkout or lockfile change
node scripts/build-agent-catalog.mjs <id>   # rebuilds manifest files[], artifact, locale, catalog entry
node scripts/build-store.mjs                # after adding/changing store/store.json or store images
npm run check
node scripts/test-catalog-lanes.mjs
node scripts/validate-package-locales.mjs
node scripts/validate-catalog.mjs
node scripts/tests/catalog-release-notes.regression.mjs
git diff --check
```

Then install the package through **Agents → Agent Organizer** in a Marinara Engine checkout and actually exercise it in the modes it claims.

Generated and never hand-edited: `locales/en.json`, `manifest.files[]` hashes and byte counts, `artifacts/*.zip`, `catalog/**/catalog.json`. Change the source, rerun the builder. If a rebuild produces only a `generatedAt` diff, discard it.

## Standing constraints

- Base everything on `staging` and open an issue before implementing a new package.
- Every published package needs a README row in its correct category table, or catalog validation fails.
- Every published package also needs Agent Organizer store data (Agents `CONTRIBUTING.md` → **Store data**): a `store/store.json` entry with `section` (`apps`, `games`, `writing`, `memory`, `trackers`, `adventure`, `media` or `alive`), a `tagline` of 1-60 characters and an optional positive-integer `featured` position; a hand-made `store/banners/<id>.webp` banner (2400 × 900); and, except for apps, a `store/icons/src/<id>.svg` icon. Optional screenshots go in `store/previews/<id>-1.webp` to `-4.webp`, numbered without gaps. Run `node scripts/build-store.mjs` to render the small banner and WebP icon and rewrite the `store.json` sidecars; `validate-catalog.mjs` fails on a missing entry, banner or icon, or a stale sidecar.
- Adding a published package changes the count assertion near the end of `validate-catalog.mjs` (agent-only, feature, and ruleset counts; staging-only packages are not counted). Update it in the same PR.
- A minor/major version bump requires a matching `packages/<id>/CHANGELOG.md` entry; rebuild the release-note sidecars with the catalog. Read the current repository release-note format before writing one.
- Permissions are narrowly scoped and justified. An agent-only package needs no more than `agent-runtime`, `chat-read`, `prompt-context`, `storage`, `ui` — and often fewer. `network` and `routes` on a JSON-only package are a red flag.
- About Me is a core Conversation feature and must never be published as an agent package.
- Never invent Engine behavior. If a field, tool, or context tag is not observably used by an existing package in the repo, check before relying on it.

Contract baseline: Engine [v2.5.2 / `fc0333c`](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/schemas/capability-package.schema.ts), companion Agents [`ffde8ea`](https://github.com/Pasta-Devs/Marinara-Agents/blob/ffde8ea4035868c064eb3b2ffd675f1f807c57ed/AGENTS.md). Live catalog wording such as “first release after v2.5.0” must be resolved against the target loader's API and version checks; it is not a reason to invent a higher minimum than the payload requires.
