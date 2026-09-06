# Validating authored artifacts

`validate-artifact.ts` runs a file through Marinara Engine's own zod schemas rather than a copy of them. That means it catches exactly what the app catches, and its error messages are the app's error messages — which matters, because the import dialogs mostly report a single terse failure with no field path.

## Setup

Needs a Marinara-Engine checkout, plus a Marinara-Agents checkout if you want hierarchy profiles checked (the Hierarchical Maps package owns that schema, not the Engine).

```bash
git clone https://github.com/Pasta-Devs/Marinara-Engine.git
git clone https://github.com/Pasta-Devs/Marinara-Agents.git      # optional, for maps

mkdir marinara-validate && cd marinara-validate
npm init -y
npm install zod@3 tsx
```

The schema files import `zod` by bare specifier and resolve it by walking up from their own directory, so the checkouts must be able to reach a `node_modules` containing zod. Either clone them inside the validate directory, or symlink:

```bash
ln -s "$PWD/node_modules" <parent-directory-of-the-checkouts>/node_modules
```

## Run

```bash
MARINARA_ENGINE_ROOT=../Marinara-Engine \
MARINARA_AGENTS_ROOT=../Marinara-Agents \
npx tsx validate-artifact.ts my-lorebook.marinara.json my-map.json
```

Exit code is 0 when everything passes, 1 otherwise.

## What it checks

Artifact type is detected from the envelope `type`, or from the shape for bare payloads.

| Artifact | Checks |
|---|---|
| Lorebook | book settings, every folder, every entry, plus `folderId` values that name no folder in the file |
| Map | the full definition including all structural rules (parent cycles, dangling links, layer ordering, depth and count limits), the hierarchy profile, and cross-references between `locationTypeIds`, the type list, and the location list |
| Character | the V2 card |
| Persona | persona create input |
| Preset | the preset container, every group, section, and choice block, plus marker sections missing a `markerConfig`, dangling `groupId`s, `sectionOrder`/`groupOrder` entries naming things not in the file, and a warning when the file carries `parameters` that import will discard |
| Regex scripts | every script in the bare array against `importRegexScriptSchema`, plus a warning when a pattern imports but would be rejected by the in-app editor's backtracking check |

The lorebook `folderId` and map cross-reference checks are additions on top of the schemas — the schemas validate each object in isolation, but a dangling `folderId` imports silently at root and a location with no assigned hierarchy type falls back to a default. Both are easy to ship by accident and annoying to notice later.

Custom tools, personal extensions, and themes are not wired up, because none of them are authored as standalone import files — they are created through the app. The harness reports them as unrecognized. Adding one is a few lines: import the schema from the same directory and add a `case`.

Preset and regex validation mirrors the importer rather than the create path, because that is what actually runs on an imported file. Two consequences worth knowing: booleans are coerced as `x === true || x === "true"`, so a missing `enabled` is treated as **false**; and JSON-string fields (`sectionOrder`, `variableGroups`, `options`, …) are accepted in either form, since real exports serialize them as strings.

## When it disagrees with the app

The Engine is the moving part. If a file validates here and the app rejects it, the checkout is behind — pull and retry before assuming the harness is wrong.
