# Shipping a package

Contents: [Setup](#setup) · [Checklist](#new-package-checklist) · [Build](#build) · [Validate](#validate) · [Version lanes](#engine-version-lanes) · [Visibility](#visibility-tiers) · [Validation scope](#what-validation-checks) · [PR gates](#pr-gates).

## Setup

Node 24+, git, `zip`/`unzip`. Feature packages also need a neighboring Marinara Engine checkout:

```
Developer/
├── Marinara-Engine/
└── Marinara-Agents/
```

Set `MARINARA_ENGINE_ROOT` if it lives elsewhere. Run `npm ci` after a fresh checkout and whenever `package.json` or `package-lock.json` changes.

## New package checklist

1. Directory `packages/<id>/` with `manifest.json`.
2. `agents.json` defining at least one agent whose `id` equals the package id, with a `description` matching `manifest.description`.
3. An entry in `scripts/catalog-package-guidance.mjs` giving `modes` and the `activation` sentence — otherwise the description ships without activation guidance.
4. Correct category, modes, entrypoints, permissions, engine range, and `restartRequired`.
5. Run the builder to produce `files[]`, the ZIP artifact, `locales/en.json`, and the catalog entry.
6. A README row in the matching category table. Validation looks for the literal string `](packages/<id>/manifest.json)` in `README.md`.
   Also add Agent Organizer store data: a `store/store.json` entry (`section`, 1-60 character `tagline`, optional `featured`), a 2400 × 900 `store/banners/<id>.webp`, and a `store/icons/src/<id>.svg` unless the package is an app; then `node scripts/build-store.mjs`. Validation fails without them (see `agent-packages.md`).
7. Update the package-count assertion near the end of `scripts/validate-catalog.mjs` when the published set changes. At Agents `ffde8ea`, it asserts 44 total: 26 without server entrypoints, 18 features, 0 rulesets; previews are excluded. Its “agent-only” count includes client-only packages, so read the actual predicate rather than equating it with the JSON-only build lane.
8. Manual install evidence in the PR.

For an existing package's minor/major bump, add the new version to `packages/<id>/CHANGELOG.md` using the repository's release-note format before building; the catalog builder rejects missing notes. Patch bumps may omit notes. Catalog lane builders generate `notes.json` sidecars from these changelogs.

## Build

```bash
node scripts/build-agent-catalog.mjs [id …]     # agent-only packages
node scripts/build-feature-packages.mjs [id …]  # Engine-derived feature packages
node scripts/build-ruleset-packages.mjs         # ruleset data packages (always rebuilds all)
node scripts/sync-package-locales.mjs           # after changing manifest/agents strings
```

The agent builder skips any package with a `server` or `client` entrypoint so it cannot strip their executable payload from `files[]` or the archive. Use that package's designated feature/custom builder; a skipped package has not been rebuilt.

`generatedAt` is preserved across rebuilds so a no-op rebuild is byte-identical. If `git status` shows only a `generatedAt` diff, discard it. Refresh it deliberately with `MARINARA_CATALOG_STAMP_GENERATED_AT=1`.

## Validate

```bash
npm run check
node scripts/test-catalog-lanes.mjs
node scripts/validate-package-locales.mjs
node scripts/validate-catalog.mjs
node scripts/tests/catalog-release-notes.regression.mjs
git diff --check
```

Feature packages that vendor Engine sources also run `node scripts/validate-vendored-engine.mjs --baseline-ref origin/staging` with `MARINARA_ENGINE_ROOT` set to an Engine `staging` checkout. It flags drift between `sources/engine/` and the Engine; `scripts/vendored-engine-baseline.json` may only lose entries, never gain them. Translated package UIs are also protected by `scripts/package-ui-translation-baseline.json`: removing a shipped translation key fails localization validation unless the baseline is updated with a reason.

`npm run format` applies Prettier. Generated bundles, artifacts, catalogs, and captured Engine snapshots are excluded from formatting — rebuild them instead.

Then install or update through **Agents → Agent Organizer** in a compatible Engine checkout and verify the supported modes, restart behavior, uninstall cleanup, and an offline restart where relevant. Describe exactly what was tested. Do not tick checklist items you did not personally verify.

## Engine version lanes

`engine.min` (inclusive) and `engine.maxExclusive` are the only lane control. The builder publishes an entry into every Engine-major lane the range intersects:

- `>=2.3.0 <3.0.0` → v2 only
- `>=2.3.0 <4.0.0` → v2 and v3
- `>=3.2.0 <3.3.0` → v3 only

`catalog/catalog.json` is an exact v2 alias for older Engine releases. Never hand-place or copy entries between lanes. For `schemaVersion: 2`, `builtAgainst.engineVersion` must fall inside the declared range. Set `engine.min` to the earliest Engine whose required behavior you can demonstrate, and declare the Capability API that behavior needs; a checkout's branch name alone does not establish a minimum version. Do not lower either requirement to force visibility for an incompatible Engine.

Engine v2.5.2 (`fc0333c`) supports Capability API 1.816. New packages declare `engine.min: "2.5.2"`. The loader accepts manifest schemas 1 and 2, checks the Engine range separately from the schema-2 API requirement, and does not offer incompatible newer package versions as updates. An `engine.min` of `2.5.1` with a Capability API minor above 341 (World Maps 1.380, Otome Hearth and Story Writer 1.386, Long-Term Memory 1.390 at Agents `ffde8ea`) installs only on 2.5.2, so state that in user-facing copy; verify the actual manifest and archive before promising a successful install. The manifest schema and installer remain the authority over README shorthand.

## Visibility tiers

`scripts/catalog-incomplete.mjs`:

| Set | stable (`main`) | staging |
|---|---|---|
| `INCOMPLETE_PACKAGE_IDS` | hidden | hidden |
| `STAGING_ONLY_PACKAGE_IDS` | hidden | visible, installable |

Both keep the package building normally. At Agents `ffde8ea`, `pixelforge` is incomplete and `blackjack`, `modern-life-sim` and `ruleset-5e-2014` are staging-only; Quartermaster and Relationship Tracker graduated to stable for Engine v2.5.0, 2D Avatars and 3D Avatars for v2.5.1, and Otome Hearth and Saucelings for v2.5.2. Read the file for the current sets. Promotion path is `INCOMPLETE` → `STAGING_ONLY` → neither; an id may not sit in both. Staging-only packages are cut from the published lanes and written to a preview overlay under `catalog/preview/`, which stable Engines never request.

Graduating a package: delete the id from both sets, rebuild, update the count assertion and README tables, land it all in one PR.

For local testing, `MARINARA_CATALOG_INCLUDE_INCOMPLETE=1` publishes everything into the normal lanes. Never commit a catalog generated that way.

## What validation checks

Every versioned lane and the legacy alias; package count and identity; engine compatibility; categories; README coverage; manifests against the schema; permissions; entrypoints; declared file hashes and sizes; ZIP checksums and contents; generated JavaScript syntax; runtime registration; per-package contracts.

## PR gates

- Branch from `staging`; open an issue first; `Closes #<n>` in the description.
- Open a draft PR when work starts, mark ready only after local validation and self-review.
- Ready PRs need the catalog check, CodeQL, Code Quality, and CodeRabbit. Dependency changes also need the low-severity audit.
- Outside and first-time contributors need an approving review from `SpicyMarinara`. Only `SpicyMarinara` promotes `staging` → `main`.
- Never auto-check validation or test-plan boxes — they are a human verification list.
- Explain why the change is needed, not just which files moved.
- Commit payload, manifest, ZIP, catalog entry, and captured Engine sources together.
- Never commit credentials, private user data, local model files, or unreviewed executable archives.

Changes to permissions, archive handling, install/update behavior, executable entrypoints, or Engine snapshots are security-sensitive and need explicit validation notes.

Pinned evidence: companion [`AGENTS.md`](https://github.com/Pasta-Devs/Marinara-Agents/blob/ffde8ea4035868c064eb3b2ffd675f1f807c57ed/AGENTS.md), [`validate-catalog.mjs`](https://github.com/Pasta-Devs/Marinara-Agents/blob/ffde8ea4035868c064eb3b2ffd675f1f807c57ed/scripts/validate-catalog.mjs), [`catalog-lanes.mjs`](https://github.com/Pasta-Devs/Marinara-Agents/blob/ffde8ea4035868c064eb3b2ffd675f1f807c57ed/scripts/catalog-lanes.mjs), and Engine [`capability-package.schema.ts`](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/schemas/capability-package.schema.ts) / [`package-manager.service.ts`](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/services/capability-packages/package-manager.service.ts).
