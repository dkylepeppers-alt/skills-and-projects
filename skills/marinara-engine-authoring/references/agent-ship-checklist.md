# Shipping a package

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
7. Update the package-count assertion near the end of `scripts/validate-catalog.mjs` (it hard-codes the published agent-only, feature, and ruleset counts — currently 24, 15, and 0; staging-only packages are excluded).
8. Manual install evidence in the PR.

## Build

```bash
node scripts/build-agent-catalog.mjs [id …]     # agent-only packages
node scripts/build-feature-packages.mjs [id …]  # Engine-derived feature packages
node scripts/build-ruleset-packages.mjs         # ruleset data packages (always rebuilds all)
node scripts/sync-package-locales.mjs           # after changing manifest/agents strings
```

The agent builder skips any package with a `server` or `client` entrypoint — those own their build elsewhere, and running the wrong builder strips their payload out of `files[]` and the artifact.

`generatedAt` is preserved across rebuilds so a no-op rebuild is byte-identical. If `git status` shows only a `generatedAt` diff, discard it. Refresh it deliberately with `MARINARA_CATALOG_STAMP_GENERATED_AT=1`.

## Validate

```bash
npm run check
node scripts/test-catalog-lanes.mjs
node scripts/validate-package-locales.mjs
node scripts/validate-catalog.mjs
git diff --check
```

Feature packages that vendor Engine sources also run `node scripts/validate-vendored-engine.mjs --baseline-ref origin/staging` with `MARINARA_ENGINE_ROOT` set to an Engine `staging` checkout. It flags drift between `sources/engine/` and the Engine; `scripts/vendored-engine-baseline.json` may only lose entries, never gain them. Translated package UIs are also protected by `scripts/package-ui-translation-baseline.json`: removing a shipped translation key fails localization validation unless the baseline is updated with a reason.

`npm run format` applies Prettier. Generated bundles, artifacts, catalogs, and captured Engine snapshots are excluded from formatting — rebuild them instead.

Then install or update through **Agents → Download Agents** in a compatible Engine checkout and verify the supported modes, restart behavior, uninstall cleanup, and an offline restart where relevant. Describe exactly what was tested. Do not tick checklist items you did not personally verify.

## Engine version lanes

`engine.min` (inclusive) and `engine.maxExclusive` are the only lane control. The builder publishes an entry into every Engine-major lane the range intersects:

- `>=2.3.0 <3.0.0` → v2 only
- `>=2.3.0 <4.0.0` → v2 and v3
- `>=3.2.0 <3.3.0` → v3 only

`catalog/catalog.json` is an exact v2 alias for older Engine releases. Never hand-place or copy entries between lanes. A package built against Engine `staging` must declare that staging version (or later) as its minimum — do not lower the range to make it appear for stable users. For `schemaVersion: 2`, `builtAgainst.engineVersion` must fall inside the declared range.

## Visibility tiers

`scripts/catalog-incomplete.mjs`:

| Set | stable (`main`) | staging |
|---|---|---|
| `INCOMPLETE_PACKAGE_IDS` | hidden | hidden |
| `STAGING_ONLY_PACKAGE_IDS` | hidden | visible, installable |

Both keep the package building normally. At the time of writing, `pixelforge` is incomplete and `modern-life-sim` and `ruleset-5e-2014` are staging-only; Quartermaster and Relationship Tracker graduated to stable for Engine v2.5.0. Read the file for the current sets. Promotion path is `INCOMPLETE` → `STAGING_ONLY` → neither; an id may not sit in both. Staging-only packages are cut from the published lanes and written to a preview overlay under `catalog/preview/`, which stable Engines never request.

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
