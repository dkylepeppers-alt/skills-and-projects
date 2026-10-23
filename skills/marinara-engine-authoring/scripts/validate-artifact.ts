/**
 * Validate an authored Marinara artifact against the Engine's own zod schemas.
 *
 *   MARINARA_ENGINE_ROOT=~/dev/Marinara-Engine npx tsx validate-artifact.ts file.json [more.json …]
 *
 * Map hierarchy profiles additionally need MARINARA_AGENTS_ROOT (the Hierarchical
 * Maps package owns that schema, not the Engine). Everything else needs only the
 * Engine checkout. See README.md in this directory for setup.
 */
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";

const engineRoot = process.env.MARINARA_ENGINE_ROOT;
const agentsRoot = process.env.MARINARA_AGENTS_ROOT;
if (!engineRoot) {
  console.error("Set MARINARA_ENGINE_ROOT to a Marinara-Engine checkout.");
  process.exit(2);
}

const schemaDir = resolve(engineRoot, "packages/shared/src/schemas");
const load = (file: string) => import(resolve(schemaDir, file));

let lorebookSchemas: any;
let characterSchemas: any;
let personaSchemas: any;
let spatialSchemas: any;
let promptSchemas: any;
let regexSchemas: any;
let hierarchyProfileSchema: any = null;
let mapsModelError: string | null = null;
let failures = 0;

function record(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function problem(message: string) {
  failures += 1;
  console.log(`  FAIL  ${message}`);
}

function uniqueIds(items: any[], label: string) {
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (!record(item)) throw new Error(`${label}[${index}] must be an object`);
    const id = item.id;
    if (typeof id !== "string" || !id) {
      problem(`${label}[${index}] needs a nonempty source id for import remapping`);
    } else if (seen.has(id)) {
      problem(`${label}[${index}] has duplicate source id "${id}"`);
    }
    seen.add(id);
  }
}

function report(label: string, result: { success: boolean; error?: any }) {
  if (result.success) {
    console.log(`  ok    ${label}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL  ${label}`);
  for (const issue of result.error.issues) {
    console.log(`        ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
}

/** Native envelopes wrap the payload; bare payloads are accepted too. */
function unwrap(raw: any): { kind: string; payload: any } {
  if (record(raw) && raw.kind === "marinara.regex-scripts") {
    if (raw.version !== 1) throw new Error(`unsupported regex export version (${String(raw.version)})`);
    if (!Array.isArray(raw.regexScripts)) throw new Error("regexScripts must be an array");
    return { kind: "regex_scripts", payload: raw.regexScripts };
  }
  if (record(raw) && typeof raw.type === "string") {
    if (raw.version !== 1) throw new Error(`unsupported envelope version (${String(raw.version)})`);
    return { kind: raw.type, payload: raw.data };
  }
  if (raw?.definition || raw?.data?.definition || raw?.schemaVersion === 1) return { kind: "map", payload: raw };
  if (raw?.lorebook || Array.isArray(raw?.entries)) return { kind: "marinara_lorebook", payload: raw };
  if (raw?.spec === "chara_card_v2") return { kind: "marinara_character", payload: raw };
  // Regex scripts export as a bare array with no envelope.
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0]?.findRegex === "string") {
    return { kind: "regex_scripts", payload: raw };
  }
  return { kind: "unknown", payload: raw };
}

/** The importer's accepted signatures (isAllowedImageBuffer, limited to lorebook types). */
function imageMime(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP")
    return "image/webp";
  return null;
}

/** Mirrors the importer's decodeLorebookImages, which rejects the whole book on any failure. */
function imageProblem(images: unknown): string | null {
  if (images === undefined || images === null) return null;
  if (!Array.isArray(images)) return "must be an array";
  if (images.length > 4) return "at most 4 images per entry";
  for (const image of images) {
    const { dataUrl, caption = "" } = (image ?? {}) as Record<string, unknown>;
    if (typeof caption !== "string" || caption.length > 500) return "caption must be a string of at most 500 characters";
    if (typeof dataUrl !== "string") return "each image needs a dataUrl (exports embed bytes, not paths)";
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!match) return "dataUrl must be base64 PNG, JPEG, or WebP";
    const bytes = Buffer.from(match[2]!, "base64");
    if (bytes.toString("base64") !== match[2]) return "dataUrl base64 is not canonical";
    if (bytes.length > 5 * 1024 * 1024) return "image larger than 5 MB";
    if (imageMime(bytes) !== match[1]) return `bytes are not a valid ${match[1]}`;
  }
  return null;
}

function validateLorebook(data: any) {
  if (!record(data) || !record(data.lorebook)) throw new Error("lorebook payload needs a lorebook object");
  if (data.entries !== undefined && !Array.isArray(data.entries)) throw new Error("entries must be an array");
  if (data.folders !== undefined && !Array.isArray(data.folders)) throw new Error("folders must be an array");
  if (data.folders?.length) uniqueIds(data.folders, "folder");
  report("lorebook", lorebookSchemas.createLorebookSchema.safeParse(data.lorebook));
  for (const [index, folder] of (data.folders ?? []).entries()) {
    const { id, ...rest } = folder;
    report(`folder[${index}] ${folder.name ?? ""}`, lorebookSchemas.createLorebookFolderSchema.safeParse(rest));
  }
  const folderIds = new Set((data.folders ?? []).map((folder: any) => folder.id));
  for (const [index, entry] of (data.entries ?? []).entries()) {
    const { folderId, images, ...rest } = entry;
    // Exports embed images as data URLs; the schema only knows server paths. Mirror
    // the importer, where one bad image fails the whole book.
    const badImage = imageProblem(images);
    if (badImage) {
      failures += 1;
      console.log(`  FAIL  entry[${index}] images: ${badImage} — the whole lorebook import will fail`);
    }
    report(
      `entry[${index}] ${entry.name ?? ""}`,
      lorebookSchemas.createLorebookEntrySchema.safeParse({ ...rest, lorebookId: "validation", folderId: null }),
    );
    if (folderId && !folderIds.has(folderId)) {
      failures += 1;
      console.log(`  FAIL  entry[${index}] folderId "${folderId}" is not in folders[] — it will import at root`);
    }
  }
}

function validateMap(raw: any) {
  // Mirror SpatialMapLibrary's candidate selection, including a data object
  // shadowing the top-level definition and an explicitly null definition.
  const data = record(raw?.data) ? raw.data : record(raw) ? raw : null;
  const definition = data && "definition" in data ? data.definition : raw;
  report("map definition", spatialSchemas.spatialContextDefinitionSchema.safeParse(definition));
  const profile = data?.hierarchyProfile;
  if (!profile) return;
  if (!hierarchyProfileSchema) {
    if (mapsModelError) {
      // A configured checkout that cannot be loaded must not read as a pass.
      failures += 1;
      console.log(`  FAIL  hierarchyProfile not checked: maps model failed to load (${mapsModelError})`);
    } else {
      console.log("  skip  hierarchyProfile (set MARINARA_AGENTS_ROOT to check it)");
    }
    return;
  }
  report("hierarchyProfile", hierarchyProfileSchema.safeParse(profile));
  const typeIds = new Set(profile.types?.map((type: any) => type.id) ?? []);
  const locationIds = new Set(definition?.locations?.map((location: any) => location.id) ?? []);
  for (const [locationId, typeId] of Object.entries(profile.locationTypeIds ?? {})) {
    if (!locationIds.has(locationId)) {
      failures += 1;
      console.log(`  FAIL  locationTypeIds names unknown location "${locationId}"`);
    }
    if (!typeIds.has(typeId)) {
      failures += 1;
      console.log(`  FAIL  location "${locationId}" references unknown type "${String(typeId)}"`);
    }
  }
  for (const location of definition?.locations ?? []) {
    if (!(location.id in (profile.locationTypeIds ?? {}))) {
      console.log(`  warn  location "${location.id}" has no hierarchy type assigned`);
    }
  }
}

/** Preset exports serialize several fields as JSON strings; the importer parses either form. */
function loose(value: any, fallback: any) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/** The importer coerces booleans as `x === true || x === "true"` — a missing flag imports as false. */
function bool(value: any) {
  return value === true || value === "true";
}

function validatePreset(data: any) {
  if (!record(data) || !record(data.preset)) throw new Error("preset payload needs a preset object");
  for (const field of ["groups", "sections", "choiceBlocks"]) {
    if (data[field] !== undefined && !Array.isArray(data[field])) throw new Error(`${field} must be an array`);
  }
  uniqueIds(data.groups ?? [], "group");
  uniqueIds(data.sections ?? [], "section");
  const preset = data.preset;
  const scopedRegexMode = ["disabled", "exclusive", "chat"].includes(preset.scopedRegexMode)
    ? preset.scopedRegexMode : "disabled";
  if (preset.scopedRegexMode !== undefined && preset.scopedRegexMode !== scopedRegexMode) {
    console.log("  warn  scopedRegexMode is invalid; import normalizes it to disabled");
  }
  report(
    "preset",
    promptSchemas.createPromptPresetSchema.safeParse({
      name: String(preset.name ?? ""),
      description: String(preset.description ?? ""),
      imagePath: preset.imagePath ?? null,
      conversationPrompt: String(preset.conversationPrompt ?? preset.conversation_prompt ?? ""),
      gamePrompt: String(preset.gamePrompt ?? preset.game_prompt ?? ""),
      variableGroups: loose(preset.variableGroups, []),
      variableValues: loose(preset.variableValues, {}),
      parameters: {},
      wrapFormat: preset.wrapFormat ?? "xml",
      scopedRegexMode,
      author: String(preset.author ?? ""),
    }),
  );
  if (preset.parameters !== undefined) {
    console.log("  warn  preset carries `parameters`, but import discards them (hardcoded to {})");
  }

  const groupIds = new Set<string>();
  for (const [index, group] of (data.groups ?? []).entries()) {
    groupIds.add(String(group.id));
    report(
      `group[${index}] ${group.name ?? ""}`,
      promptSchemas.createPromptGroupSchema.safeParse({
        presetId: "validation",
        name: String(group.name ?? ""),
        parentGroupId: null,
        order: Number(group.order ?? 100),
        enabled: bool(group.enabled),
      }),
    );
  }

  const sectionIds = new Set<string>();
  for (const [index, section] of (data.sections ?? []).entries()) {
    sectionIds.add(String(section.id));
    const markerConfig = section.markerConfig ? loose(section.markerConfig, null) : null;
    report(
      `section[${index}] ${section.name ?? ""}`,
      promptSchemas.createPromptSectionSchema.safeParse({
        presetId: "validation",
        identifier: String(section.identifier ?? ""),
        name: String(section.name ?? ""),
        content: String(section.content ?? ""),
        role: section.role ?? "system",
        enabled: bool(section.enabled),
        isMarker: bool(section.isMarker),
        groupId: null,
        markerConfig,
        injectionPosition: section.injectionPosition ?? "ordered",
        injectionDepth: Number(section.injectionDepth ?? 0),
        injectionOrder: Number(section.injectionOrder ?? 100),
        forbidOverrides: bool(section.forbidOverrides),
        skipWrap: bool(section.skipWrap),
      }),
    );
    if (bool(section.isMarker) && !markerConfig) {
      failures += 1;
      console.log(`  FAIL  section[${index}] is a marker with no markerConfig`);
    }
    if (section.groupId && !groupIds.has(String(section.groupId))) {
      console.log(`  warn  section[${index}] groupId is not in groups[] — it will import ungrouped`);
    }
  }

  for (const [index, choice] of (data.choiceBlocks ?? []).entries()) {
    report(
      `choice[${index}] ${choice.variableName ?? ""}`,
      promptSchemas.createChoiceBlockSchema.safeParse({
        presetId: "validation",
        variableName: String(choice.variableName ?? ""),
        question: String(choice.question ?? ""),
        options: loose(choice.options, []),
        multiSelect: bool(choice.multiSelect),
        separator: String(choice.separator ?? ", "),
        randomPick: bool(choice.randomPick),
        displayMode: choice.displayMode ?? "auto",
        optionSort: choice.optionSort ?? "manual",
      }),
    );
  }

  for (const id of loose(preset.sectionOrder, []) as string[]) {
    if (!sectionIds.has(String(id))) console.log(`  warn  sectionOrder names a section not in the file (${id})`);
  }
  for (const id of loose(preset.groupOrder, []) as string[]) {
    if (!groupIds.has(String(id))) console.log(`  warn  groupOrder names a group not in the file (${id})`);
  }
}

function validateRegexScripts(scripts: any[]) {
  for (const [index, script] of scripts.entries()) {
    report(`script[${index}] ${script.name ?? ""}`, regexSchemas.importRegexScriptSchema.safeParse(script));
    // Import skips the backtracking check that the in-app editor applies on save.
    const strict = regexSchemas.createRegexScriptSchema.safeParse(script);
    if (!strict.success && strict.error.issues.some((issue: any) => issue.path[0] === "findRegex")) {
      console.log(`  warn  script[${index}] imports, but the in-app editor will reject this pattern on save`);
    }
  }
}

async function main() {
  if (process.argv.length < 3) {
    console.error("Usage: validate-artifact.ts file.json [more.json …]");
    process.exit(2);
  }
  [lorebookSchemas, characterSchemas, personaSchemas, spatialSchemas, promptSchemas, regexSchemas] =
    await Promise.all([
      load("lorebook.schema.js"),
      load("character.schema.js"),
      load("persona.schema.js"),
      load("spatial-context.schema.js"),
      load("prompt.schema.js"),
      load("regex.schema.js"),
    ]);

  if (agentsRoot) {
    const mapsModel = resolve(
      agentsRoot,
      "packages/hierarchical-maps/src/engine/packages/maps-shared/src/maps-model.js",
    );
    // Use the release's built shared entrypoint when available. The source-only
    // fallback re-exports the maps model's actual Engine schema dependencies,
    // avoiding unrelated generated registries imported by shared/src/index.ts.
    const builtShared = resolve(engineRoot, "packages/shared/dist/index.js");
    const bridge = resolve(dirname(resolve(process.argv[1]!)), "maps-shared-bridge.cjs");
    const sharedModule = existsSync(builtShared) ? builtShared : bridge;
    const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
      return nextResolve(specifier === "@marinara-engine/shared" ? sharedModule : specifier, context);
    } });
    try {
      ({ spatialHierarchyProfileSchema: hierarchyProfileSchema } = await import(mapsModel));
    } catch (error) {
      mapsModelError = (error as Error).message.split("\n")[0]!;
      console.warn(`! Could not load the maps model from MARINARA_AGENTS_ROOT: ${mapsModelError}`);
    } finally {
      hooks.deregister();
    }
  }

  for (const path of process.argv.slice(2)) {
    console.log(`\n${path}`);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      failures += 1;
      console.log(`  FAIL  not parseable JSON: ${(error as Error).message}`);
      continue;
    }
    try {
      const { kind, payload } = unwrap(raw);
      switch (kind) {
      case "marinara_lorebook":
        validateLorebook(payload);
        break;
      case "map":
        validateMap(payload);
        break;
      case "marinara_character":
        report(
          "character card",
          characterSchemas.characterCardV2Schema.safeParse({
            spec: payload.spec,
            spec_version: payload.spec_version,
            data: payload.data,
          }),
        );
        break;
      case "marinara_persona":
        report("persona", personaSchemas.personaCreateInputSchema.safeParse(payload));
        break;
      case "marinara_preset":
        validatePreset(payload);
        break;
      case "regex_scripts":
        validateRegexScripts(payload);
        break;
      default:
        problem(`unrecognized artifact type (${kind}); no schema validation was performed`);
      }
    } catch (error) {
      problem((error as Error).message);
    }
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} problem(s) found.`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
