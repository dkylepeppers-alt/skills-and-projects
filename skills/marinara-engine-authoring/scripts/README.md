# Validate authored artifacts against the release source

The harness imports the Engine's actual Zod schemas. The baseline is **Engine v2.5.2**, commit `fc0333c3fe978cda5e0b919bd6faec985901704e`, with **Agents** commit `ffde8ea4035868c064eb3b2ffd675f1f807c57ed` for map hierarchy profiles. Repository pins are also in `../references/source-baseline.json`.

## Setup and run

Use Node 24 (the release supports Node >=24 and <27), **Zod 4.6.x** and a TypeScript loader. Engine v2.5.2 moved its shared schemas from Zod 3 to Zod 4 (`^4.6.7`); with Zod 3 the harness crashes before any check (`lorebookScopeSchema.prefault is not a function`). A full application install is unnecessary for these schema checks. The source checkout must resolve `zod` from its own directory or a parent directory; installing it only beside an unrelated CLI is insufficient.

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
| Agent package `manifest.json` | `capabilityPackageManifestSchema`; fails a Capability API minor above 816 (v2.5.2's ceiling); warns when `engine.min` is below 2.5.2 or a `files[]` hash/size does not match the file beside it (run the catalog builder). When `entrypoints.agents` exists beside it, also checks that file and the catalog's description rule using the Agents repo's own `withoutPackageActivationGuidance` (the package-id agent's description equals `manifest.description`, or it without the package's activation sentence). Fails if no Agents checkout is available. |
| Agent `agents.json` | `packagedAgentDefinitionsSchema`. |
| Personal/External extension `manifest.json` | Collects the manifest's folder exactly as **Import Extension Folder** does, runs the Engine's own `collectFolderPackageEntries` and `normalizePersonalExtensionImportEntry`, then `createPersonalExtensionSchema`, then the extension lint below. Fails if a root collection file (`marinara-extensions.json` …) in that folder would be imported instead of the given manifest. Warns on `full_page_access` and on legacy `marinara.extension` without `capabilities`. |
| Custom tool (`marinara.function`, `marinara.function-folder`, or `functions` / `customTools` / `tools` collections) | Mirrors the Functions import. A file named `marinara-functions.json` or `manifest.json` is checked as a ZIP/folder package rooted at its directory (`collectFolderPackageEntries`; each tool's `*Path` fields resolve beside its own manifest). Any other JSON is checked as a loose file, which the Engine imports without resolving `*Path` fields, so those produce a warning. Then `prepareCustomToolImportEntry` and `createCustomToolSchema`; fails a script tool with no body; warns that webhook/script tools import disabled for review. |
| Ruleset package `.ruleset.json` | The Engine server's own `readRulesetPackageFile`: format, manifest, base64, hashes, sizes, catalogs and translations. |
| Story script (`storyVersion`) | `storyScriptSchema` structure only. World bindings (places, people, fights) need the game's world and are not checked. |
| Chat settings profile (`marinara_chat_settings_profile` / `marinara_chat_preset`) | Mirrors the import route: name, chat mode (`visual_novel` → `roleplay`), strict `chatPresetSettingsSchema`. |

The extension, custom-tool and ruleset checks import Engine client/server source (`packages/client/src/lib/…`, `packages/server/src/services/game/ruleset-package-file.ts`), so they need a **full** Engine checkout, not only `packages/shared`. Warnings (`warn`) do not change the exit code.

All content, extension and agent-package files in `../templates/` pass against these pins. This CLI does **not** validate themes, in-app custom Agent configs, other Game content (worlds, kits, tile/creature packs), avatar binaries, ZIP payloads, runtime macro results, story/world cross-links, or live UI behavior; follow the relevant reference for those.

Folder-shaped exports and binary `.marinara` packages need their actual loader/unpacking step before this JSON CLI: validate each extracted supported native envelope. Passing a whole folder package to this tool is an unsupported-format failure, not an import claim.

**The Agents checkout is required** for map hierarchy profiles and agent packages; those checks fail rather than skip or approximate without it. The validator uses `MARINARA_AGENTS_ROOT`, or a `Marinara-Agents` folder next to the Engine checkout (the layout the setup above creates), so the variable is optional in that layout. An Agents model that is present but cannot load also fails. The bridge re-exports the real Engine spatial schemas/utilities for the pinned maps model, from a built checkout's actual shared `dist/index.js` when present. No fabricated replacement schema is used. Future maps model imports may need a bridge update.

Zod 4 shim: World Maps 1.8.0 (`maps-model.ts:49-50` at the pinned Agents commit) still calls Zod 3 `.innerType()` on the Engine's refined `spatialContextDefinitionSchema`. Under Engine v2.5.2 that throws `innerType is not a function`. The maps model's shared import always resolves to `maps-shared-bridge.cjs`, which loads a built checkout's `dist/index.js` when present (else the source schemas) and adds `innerType()` only when it is missing, returning the same Engine schema cloned without its refinement checks, which is what Zod 3 returned. Engine parsing is unchanged, and the shim applies to built and source checkouts alike. A regression confirms an invalid profile still fails.

## Regression checks

Use the same environment and loader. The tests need a full Engine checkout and the Agents checkout, and refuse to run without them:

```bash
MARINARA_ENGINE_ROOT="$PWD/Marinara-Engine" \
MARINARA_AGENTS_ROOT="$PWD/Marinara-Agents" \
node --import tsx /absolute/path/to/skill/scripts/test-validate-artifact.mjs
```

These exercise all six templates plus failure cases: unknown/unsupported envelopes, missing inputs, malformed/null data, duplicate preset source IDs, serialized-null markers, invalid marker types and regex flags, scoped-regex normalization, new preset fields, an invalid hierarchy profile, Agents-checkout auto-detection and the failure without one, continuing after a bad file, and the newer formats: extension templates and broken extensions, the agent-package template, Capability API and `engine.min` gates, custom tools, story scripts, settings profiles and a tampered ruleset package. Fixtures use a temporary directory under the working directory and are removed afterward.

Schema success is not a live import test. If the application differs, compare its exact source release and normalization path before changing a valid artifact or promising lossless behavior.

## Extension lint and offline stub

Both need only Node (no Engine checkout, no TypeScript loader). They follow Engine v2.5.2 `docs/extending/writing-personal-extensions.md` (Browser API version 6) and `PERSONAL_EXTENSION_UI_LIMITS`.

**`lint-extension.mjs`** statically checks extension JavaScript:

```bash
node lint-extension.mjs path/to/manifest.json          # reads runtime, capabilities and JS paths from it
node lint-extension.mjs extension.js --runtime client --capabilities read_active_characters
```

- **Errors:** `marinara.*` members the runtime does not document; sandbox-forbidden globals (`document`, `window`, `fetch`, browser storage, `importScripts`; `require` / `process` on the server); `import` statements; capabilities on a Server Extension; bad contribution ids or kinds; a command without `targetContributionId` or with callbacks; more than 4 dice formats.
- **Warnings:** context `characters` / `persona` read without the matching capability, or a capability requested but unused; registrations without `marinara.onCleanup`; bare `setTimeout` / `setInterval` instead of the managed `marinara.*` timers; raw `fetch` in full-page code instead of `marinara.fetch`.

It is a text scan that ignores comments and string contents, not a parser: it cannot follow aliases such as `const { ui } = marinara`. The validator runs it automatically on extension manifests.

**`marinara-extension-stub.mjs`** is an offline stand-in for the `marinara` global, for unit-testing extension logic:

```js
import { readFileSync } from "node:fs";
import { createMarinaraStub, runExtension } from "./marinara-extension-stub.mjs";

const stub = createMarinaraStub({ capabilities: [], context: { chatId: "c1", characterIds: ["a"] } });
await runExtension(readFileSync("extension.js", "utf8"), stub);   // only `marinara` in scope
await stub.activate("my-panel");                                  // press/open a contribution (commands resolve to their target)
await stub.event("my-panel", { elementId: "save", values: { note: "hi" } });
stub.setContext({ chatId: "c2" });                                // notify context subscribers
stub.advanceTimers(60_000);                                       // run managed timers
await stub.roll("2 boost", [3, 5]);                               // run registered dice formats
await stub.stop();                                                // run onCleanup callbacks
// Inspect: stub.storage, stub.contributions, stub.contribution(id), stub.windows, stub.logs, stub.diceFormats
```

It enforces the documented contract (contribution ids, kinds, surfaces and positions, per-kind update fields, command rules, element kinds and UI limits, capability-filtered context fields, the 1,000,000-byte storage cap, dice limits) and throws on anything else. `runExtension` exposes only `marinara` and standard JavaScript built-ins, so DOM or network use fails as it would in the sandbox. It does not simulate rendering, theming, approval, host timing or the real token estimator (`estimateTextTokens` is a rough placeholder), so still confirm in the app.

Run their tests with `node test-extension-tools.mjs`. The Engine's own `docs/examples/personal-extensions/` examples lint clean and run in the stub.
