/**
 * Validate an authored Marinara artifact against the Engine's own zod schemas.
 *
 *   MARINARA_ENGINE_ROOT=~/dev/Marinara-Engine npx tsx validate-artifact.ts file.json [more.json …]
 *
 * Map hierarchy profiles additionally need MARINARA_AGENTS_ROOT (the Hierarchical
 * Maps package owns that schema, not the Engine). Everything else needs only the
 * Engine checkout. See README.md in this directory for setup.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
let failures = 0;

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
  if (raw && typeof raw === "object" && typeof raw.type === "string" && raw.version === 1) {
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

function validateLorebook(data: any) {
  report("lorebook", lorebookSchemas.createLorebookSchema.safeParse(data.lorebook));
  for (const [index, folder] of (data.folders ?? []).entries()) {
    const { id, ...rest } = folder;
    report(`folder[${index}] ${folder.name ?? ""}`, lorebookSchemas.createLorebookFolderSchema.safeParse(rest));
  }
  const folderIds = new Set((data.folders ?? []).map((folder: any) => folder.id));
  for (const [index, entry] of (data.entries ?? []).entries()) {
    const { folderId, ...rest } = entry;
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
  const definition = raw?.data?.definition ?? raw?.definition ?? raw;
  report("map definition", spatialSchemas.spatialContextDefinitionSchema.safeParse(definition));
  const profile = raw?.hierarchyProfile ?? raw?.data?.hierarchyProfile;
  if (!profile) return;
  if (!hierarchyProfileSchema) {
    console.log("  skip  hierarchyProfile (set MARINARA_AGENTS_ROOT to check it)");
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
  const preset = data.preset ?? {};
  report(
    "preset",
    promptSchemas.createPromptPresetSchema.safeParse({
      name: String(preset.name ?? ""),
      description: String(preset.description ?? ""),
      imagePath: preset.imagePath ?? null,
      conversationPrompt: String(preset.conversationPrompt ?? ""),
      gamePrompt: String(preset.gamePrompt ?? ""),
      variableGroups: loose(preset.variableGroups, []),
      variableValues: loose(preset.variableValues, {}),
      parameters: {},
      wrapFormat: preset.wrapFormat ?? "xml",
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
        markerConfig: section.markerConfig ? loose(section.markerConfig, null) : null,
        injectionPosition: section.injectionPosition ?? "ordered",
        injectionDepth: Number(section.injectionDepth ?? 0),
        injectionOrder: Number(section.injectionOrder ?? 100),
        forbidOverrides: bool(section.forbidOverrides),
      }),
    );
    if (bool(section.isMarker) && !section.markerConfig) {
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
    try {
      ({ spatialHierarchyProfileSchema: hierarchyProfileSchema } = await import(mapsModel));
    } catch {
      console.warn("! Could not load the maps model; hierarchy profiles will be skipped.");
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
        console.log(`  skip  unrecognized artifact type (${kind})`);
    }
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} problem(s) found.`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
