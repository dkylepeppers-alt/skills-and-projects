# Validate authored artifacts against the release source

The harness imports the Engine's actual Zod schemas. The baseline is **Engine v2.5.2**, commit `fc0333c3fe978cda5e0b919bd6faec985901704e`, with **Agents** commit `ffde8ea4035868c064eb3b2ffd675f1f807c57ed` for map hierarchy profiles. Repository pins are also in `../references/source-baseline.json`.

## Setup and run

Use Node 24 (the release supports Node >=24 and <27), **Zod 4.6.x** and a TypeScript loader. Engine v2.5.2 moved its shared schemas from Zod 3 to Zod 4 (`^4.6.7`); with Zod 3 the harness crashes before any check (`lorebookScopeSchema.prefault is not a function`). To check against Engine v2.5.1 or older, install Zod 3.25.76 instead. A full application install is unnecessary for these schema checks. The source checkout must resolve `zod` from its own directory or a parent directory; installing it only beside an unrelated CLI is insufficient.

```bash
mkdir marinara-validation
cd marinara-validation
npm init -y
npm install zod@4.6.7 tsx@4.20.6
git clone https://github.com/Pasta-Devs/Marinara-Engine.git
git -C Marinara-Engine checkout fc0333c3fe978cda5e0b919bd6faec985901704e
git clone https://github.com/Pasta-Devs/Marinara-Agents.git
git -C Marinara-Agents checkout ffde8ea4035868c064eb3b2ffd675f1f807c57ed

MARINARA_ENGINE_ROOT="$PWD/Marinara-Engine" \
MARINARA_AGENTS_ROOT="$PWD/Marinara-Agents" \
node --import tsx /absolute/path/to/skill/scripts/validate-artifact.ts file.json
```

Run from the directory that contains the loader's `node_modules`, or give `--import` an absolute loader path. `npx tsx` also works on ordinary hosts; `node --import tsx` avoids the CLI's IPC listener on hosts that prohibit sockets. Supply one or more JSON file paths. Exit code 0 means all performed checks passed; 1 means a file failed; 2 means required configuration/arguments are missing. Unknown formats fail explicitly instead of reporting unperformed validation as success. Other files continue after a malformed input.

## Checked scope

| Artifact | Checks |
|---|---|
| Native lorebook | Book, folders, every entry, unique folder source IDs, dangling entry folder references, and embedded entry images. Image checks mirror allowed MIME/signature, canonical base64, caption/count and decoded size limits; they do not perform a full codec decode. |
| Map | Definition structure, parent cycles, dangling links, layer ordering, depth/count limits; optional hierarchy profile plus location/type references. |
| Native character | V2 card shape and nested release character schema. This is a strict authoring check; it does not emulate native import's salvage of invalid onboarding/sheets, restore sprites/gallery, or decode avatar models. |
| Native persona | Create boundary; import's tolerant salvage/defaulting can accept more than this strict authoring check. Embedded image restoration is not simulated. |
| Native preset | Preset/groups/sections/choices, duplicate remapping IDs, marker configuration and order/group references. Mirrors imported boolean coercion, JSON-string fields, legacy mode-prompt aliases, scoped-regex normalization and `skipWrap`. Parameters carried in a file produce a warning because native import discards them. |
| Current regex export / legacy array | Unwraps `kind: "marinara.regex-scripts"` / `regexScripts`; every script is checked against `importRegexScriptSchema`; warns separately for patterns that import but fail the editor's backtracking-safety check. |

The six matching files in `../templates/` have passed against these pins. Custom Agents/tools, themes, extensions, Game content, avatar binaries and package manifests have different validators/importers; follow the relevant reference. This CLI does **not** validate them, ZIP payload hashes, runtime macro results, story/world cross-links, or live UI behavior.

Folder-shaped exports and binary `.marinara` packages need their actual loader/unpacking step before this JSON CLI: validate each extracted supported native envelope. Passing a whole folder package to this tool is an unsupported-format failure, not an import claim.

A configured but unloadable Agents model fails a map with a hierarchy profile. Without `MARINARA_AGENTS_ROOT`, profile checks are explicitly skipped. The bridge re-exports the real Engine spatial schemas/utilities for the pinned maps model, from a built checkout's actual shared `dist/index.js` when present. No fabricated replacement schema is used. Future maps model imports may need a bridge update.

Zod 4 shim: World Maps 1.8.0 (`maps-model.ts:49-50` at the pinned Agents commit) still calls Zod 3 `.innerType()` on the Engine's refined `spatialContextDefinitionSchema`. Under Engine v2.5.2 that throws `innerType is not a function`. The maps model's shared import always resolves to `maps-shared-bridge.cjs`, which loads a built checkout's `dist/index.js` when present (else the source schemas) and adds `innerType()` only when it is missing, returning the same Engine schema cloned without its refinement checks, which is what Zod 3 returned. Engine parsing is unchanged, and the shim applies to built and source checkouts alike. A regression confirms an invalid profile still fails.

## Regression checks

Use the same environment and loader:

```bash
MARINARA_ENGINE_ROOT="$PWD/Marinara-Engine" \
MARINARA_AGENTS_ROOT="$PWD/Marinara-Agents" \
node --import tsx /absolute/path/to/skill/scripts/test-validate-artifact.mjs
```

These exercise all six templates plus failure cases: unknown/unsupported envelopes, missing inputs, malformed/null data, duplicate preset source IDs, serialized-null markers, invalid marker types and regex flags, scoped-regex normalization, new preset fields, an invalid hierarchy profile (when `MARINARA_AGENTS_ROOT` is set), and continuing after a bad file. Fixtures use a temporary directory under the working directory and are removed afterward.

Schema success is not a live import test. If the application differs, compare its exact source release and normalization path before changing a valid artifact or promising lossless behavior.
