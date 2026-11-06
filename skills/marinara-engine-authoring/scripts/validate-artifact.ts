/**
 * Validate an authored Marinara artifact against the Engine's own zod schemas.
 *
 *   MARINARA_ENGINE_ROOT=~/dev/Marinara-Engine npx tsx validate-artifact.ts file.json [more.json …]
 *
 * Map hierarchy profiles additionally need MARINARA_AGENTS_ROOT (the Hierarchical
 * Maps package owns that schema, not the Engine). Extension packages, custom tools
 * and ruleset packages reuse Engine client/server importers, so they need a full
 * Engine checkout. See README.md in this directory for setup.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { lintExtensionSource } from "./lint-extension.mjs";

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

let warnings = 0;
function warn(message: string) {
  warnings += 1;
  console.log(`  warn  ${message}`);
}

/** Engine release this skill targets; every build assumes it or later. */
const ENGINE_FLOOR = [2, 5, 2];
const SUPPORTED_CAPABILITY_MINOR = 816;

function semverBelow(value: unknown, floor: number[]) {
  const match = typeof value === "string" ? /^(\d+)\.(\d+)\.(\d+)/.exec(value) : null;
  if (!match) return false;
  const parts = match.slice(1, 4).map(Number);
  for (let i = 0; i < 3; i += 1) if (parts[i] !== floor[i]) return parts[i]! < floor[i]!;
  return false;
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
const EXTENSION_KINDS = new Set([
  "marinara.personal-extension",
  "marinara.personal-server-extension",
  "marinara.extension",
  "marinara.server-extension",
]);
const TOOL_COLLECTION_KEYS = ["functions", "customTools", "tools"];

function unwrap(raw: any): { kind: string; payload: any } {
  if (record(raw) && raw.format === "marinara-ruleset") return { kind: "ruleset_package", payload: raw };
  if (record(raw) && EXTENSION_KINDS.has(raw.kind)) return { kind: "extension_manifest", payload: raw };
  if (
    record(raw) &&
    (raw.kind === "marinara.function" ||
      raw.kind === "marinara.function-folder" ||
      TOOL_COLLECTION_KEYS.some((key) => Array.isArray(raw[key])))
  )
    return { kind: "custom_tools", payload: raw };
  if (record(raw) && typeof raw.id === "string" && record(raw.entrypoints) && Array.isArray(raw.kind))
    return { kind: "agent_manifest", payload: raw };
  if (Array.isArray(raw) && raw.length > 0 && raw.every((item) => record(item) && "defaultPromptTemplate" in item))
    return { kind: "agent_definitions", payload: raw };
  if (record(raw) && "storyVersion" in raw) return { kind: "story_script", payload: raw };
  if (record(raw) && (raw.type === "marinara_chat_settings_profile" || raw.type === "marinara_chat_preset")) {
    if (raw.version !== 1) throw new Error(`unsupported envelope version (${String(raw.version)})`);
    return { kind: "chat_settings_profile", payload: raw.data };
  }
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

// ── Engine modules beyond the schema directory ────────────────────────────
// These reuse the Engine's own importers/readers (client and server source) so
// the checks follow the real import path. They need a full Engine checkout.
let sharedIndex: any;
let engineHooks: { deregister(): void } | null = null;
async function engineShared() {
  if (!sharedIndex) {
    const index = resolve(engineRoot!, "packages/shared/src/index.ts");
    engineHooks = registerHooks({ resolve(specifier, context, nextResolve) {
      return nextResolve(specifier === "@marinara-engine/shared" ? index : specifier, context);
    } });
    sharedIndex = await import(index);
  }
  return sharedIndex;
}
async function engineModule(relativePath: string) {
  await engineShared();
  const path = resolve(engineRoot!, relativePath);
  if (!existsSync(path)) throw new Error(`MARINARA_ENGINE_ROOT has no ${relativePath}; use a full Engine checkout`);
  return import(path);
}

function listTextFiles(root: string, prefix: string, out: Array<{ path: string; text: string }> = []) {
  for (const name of readdirSync(root)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(root, name);
    if (statSync(full).isDirectory()) listTextFiles(full, `${prefix}${name}/`, out);
    else if (/\.(json|js|mjs|cjs|css|md|txt)$/i.test(name)) out.push({ path: `${prefix}${name}`, text: readFileSync(full, "utf8") });
  }
  return out;
}

async function validateAgentManifest(manifest: any, filePath: string) {
  const shared = await engineShared();
  report("capability package manifest", shared.capabilityPackageManifestSchema.safeParse(manifest));
  if (semverBelow(manifest.engine?.min, ENGINE_FLOOR))
    warn(`engine.min ${manifest.engine.min} is below the 2.5.2 floor this skill builds for`);
  const minor = manifest.capabilityApi?.minor;
  if (typeof minor === "number" && minor > SUPPORTED_CAPABILITY_MINOR)
    problem(`capabilityApi.minor ${minor} is above the ${SUPPORTED_CAPABILITY_MINOR} that Engine v2.5.2 supports; it will not install`);
  const dir = resolve(dirname(filePath));
  for (const file of Array.isArray(manifest.files) ? manifest.files : []) {
    const target = typeof file?.path === "string" ? resolve(dir, file.path) : null;
    if (!target || !inside(dir, target) || !existsSync(target)) continue;
    const bytes = readFileSync(target);
    const sha = createHash("sha256").update(bytes).digest("hex");
    if (file.sha256 !== sha || file.bytes !== bytes.length)
      warn(`files[] entry ${file.path} does not match the file on disk; run the catalog builder to regenerate it`);
  }
  const agentsPath = typeof manifest.entrypoints?.agents === "string" ? resolve(dir, manifest.entrypoints.agents) : null;
  if (agentsPath && existsSync(agentsPath)) {
    const definitions = JSON.parse(readFileSync(agentsPath, "utf8"));
    await validateAgentDefinitions(definitions, `${relative(dir, agentsPath)} `);
    const own = Array.isArray(definitions) ? definitions.find((item: any) => item?.id === manifest.id) : null;
    if (!own) problem(`agents.json has no agent whose id equals the package id "${manifest.id}"`);
    else await checkPackageDescription(manifest, own);
  }
}

function inside(dir: string, target: string) {
  const rel = relative(dir, target);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * The Agents catalog rule (validate-catalog.mjs): the package-id agent's description equals
 * manifest.description, or manifest.description without this package's activation sentence
 * from catalog-package-guidance.mjs. That sentence is known only with MARINARA_AGENTS_ROOT.
 */
async function checkPackageDescription(manifest: any, own: any) {
  const manifestText = String(manifest.description ?? "").trim();
  const agentText = String(own.description ?? "");
  if (agentText === manifest.description) return;
  if (agentsRoot) {
    const guidancePath = resolve(agentsRoot, "scripts/catalog-package-guidance.mjs");
    if (existsSync(guidancePath)) {
      const guidance = await import(guidancePath);
      if (agentText !== guidance.withoutPackageActivationGuidance(manifest.id, manifest.description))
        problem("the package agent's description must equal manifest.description, or it without this package's activation sentence");
      return;
    }
  }
  if (manifestText.startsWith(`${agentText.trim()} `) && agentText.trim())
    warn("the package agent's description is manifest.description minus a trailing part; set MARINARA_AGENTS_ROOT to confirm that part is this package's activation sentence");
  else problem("the package agent's description must equal manifest.description (or it without the activation sentence)");
}

async function validateAgentDefinitions(definitions: any, label = "") {
  const shared = await engineShared();
  report(`${label}packaged agent definitions`, shared.packagedAgentDefinitionsSchema.safeParse(definitions));
}

async function validateExtensionManifest(manifest: any, filePath: string) {
  const transfer = await engineModule("packages/client/src/lib/folder-package-transfer.ts");
  const importer = await engineModule("packages/client/src/lib/personal-extension-import.ts");
  const shared = await engineShared();
  const dir = resolve(dirname(filePath));
  const folder = dir.split(/[\\/]/).pop() || "Extension";
  const files = listTextFiles(dir, `${folder}/`);
  const entries = transfer.collectFolderPackageEntries(files, {
    rootFilenames: ["marinara-extensions.json", "marinara-extension.json", "marinara-personal-extensions.json"],
    collectionKeys: ["extensions", "personalExtensions"],
  });
  const wanted = `${folder}/${relative(dir, resolve(filePath)).replace(/\\/g, "/")}`;
  const entry = entries.find((item: any) => item.path === wanted);
  if (!entry) {
    // The Engine prefers a root collection file (marinara-extensions.json …) over manifest.json.
    problem(entries.length
      ? `the Engine's folder import would use another file in this folder (${entries[0].path}) instead of this manifest`
      : "the Engine importer finds no extension here");
    return;
  }
  const draft = importer.normalizePersonalExtensionImportEntry(entry, folder);
  if (!draft) {
    problem("the Engine importer finds no extension here: check the manifest's relative paths (server needs JS; browser needs CSS or JS)");
    return;
  }
  report(`personal extension "${draft.name}" (${draft.runtime})`, shared.createPersonalExtensionSchema.safeParse(draft));
  if (manifest.kind === "marinara.extension" && !Object.prototype.hasOwnProperty.call(manifest.config ?? manifest, "capabilities"))
    warn("legacy marinara.extension without capabilities imports as full_page_access; add \"capabilities\": [] for the sandbox");
  if (draft.capabilities?.includes("full_page_access"))
    warn("full_page_access runs unsandboxed in Marinara's page; use it only for code the user fully trusts");
  const source = draft.runtime === "server" ? draft.serverJs : draft.js;
  if (source) {
    const lint = lintExtensionSource(source, { runtime: draft.runtime, capabilities: draft.capabilities ?? [] });
    for (const finding of lint) (finding.level === "error" ? problem : warn)(`lint: ${finding.message}`);
    if (!lint.length) console.log("  ok    extension lint");
  }
}

const TOOL_PACKAGE_FILES = new Set(["marinara-functions.json", "manifest.json"]);

/**
 * Mirrors the Functions panel import. A ZIP or folder package (a marinara-functions.json
 * collection, or manifest.json per tool) goes through collectFolderPackageEntries, which
 * resolves each tool's *Path fields beside that tool's own manifest. A loose JSON file is
 * imported with no file resolution at all, so its *Path fields are ignored.
 */
async function validateCustomTools(raw: any, filePath: string) {
  const transfer = await engineModule("packages/client/src/lib/custom-tool-transfer.ts");
  const folders = await engineModule("packages/client/src/lib/folder-package-transfer.ts");
  const shared = await engineShared();
  const dir = resolve(dirname(filePath));
  const name = filePath.split(/[\\/]/).pop()!.toLowerCase();
  let entries: Array<{ raw: unknown; resolveTextFile: (path: unknown) => string | null }>;
  if (TOOL_PACKAGE_FILES.has(name)) {
    const folder = dir.split(/[\\/]/).pop() || "Functions";
    entries = folders.collectFolderPackageEntries(listTextFiles(dir, `${folder}/`), {
      rootFilenames: ["marinara-functions.json"],
      collectionKeys: TOOL_COLLECTION_KEYS,
    });
    console.log(`  info  checked as a folder/ZIP package rooted at ${folder}/ (paths resolve beside each tool manifest)`);
  } else {
    entries = shared.getFolderImportEntries(raw, TOOL_COLLECTION_KEYS)
      .map((entry: unknown) => ({ raw: entry, resolveTextFile: () => null }));
    const pathKeys = /"(parametersSchemaPath|parametersPath|staticResultPath|scriptBodyPath|scriptPath|scriptPaths)"/;
    if (pathKeys.test(JSON.stringify(raw)))
      warn("a loose JSON tool file is imported without resolving *Path fields; ship the folder as a ZIP (marinara-functions.json or manifest.json per tool) instead");
  }
  if (!entries.length) problem("the Engine importer finds no custom tools here");
  for (const [index, entry] of entries.entries()) {
    const prepared = transfer.prepareCustomToolImportEntry(entry.raw, entry.resolveTextFile);
    if (!prepared) {
      problem(`tool[${index}] is not an importable custom tool (it needs a name and description)`);
      continue;
    }
    report(`tool[${index}] ${prepared.config.name}`, shared.createCustomToolSchema.safeParse(prepared.config));
    if (prepared.config.executionType === "script" && !prepared.config.scriptBody)
      problem(`tool[${index}] is a script tool with no script body`);
    if (prepared.review) warn(`tool[${index}] is a ${prepared.config.executionType} tool: it imports disabled and needs review`);
  }
}

async function validateRulesetPackage(raw: any) {
  const reader = await engineModule("packages/server/src/services/game/ruleset-package-file.ts");
  const result = reader.readRulesetPackageFile(raw);
  if (result.ok) {
    console.log(`  ok    ruleset package (${Object.keys(result.catalogs).length} catalog(s), ${Object.keys(result.locales).length} translation(s))`);
    return;
  }
  failures += 1;
  console.log("  FAIL  ruleset package");
  for (const issue of result.issues) console.log(`        ${issue}`);
}

async function validateStoryScript(raw: any) {
  const shared = await engineShared();
  report("story script (structure only; world bindings need the game's world)", shared.storyScriptSchema.safeParse(raw));
}

async function validateChatSettingsProfile(data: any) {
  const shared = await engineShared();
  if (!record(data)) {
    problem("settings profile data must be an object");
    return;
  }
  if (typeof data.name !== "string" || !data.name.trim()) problem("settings profile needs a name");
  const mode = data.mode === "visual_novel" ? "roleplay" : data.mode;
  report("chat mode", shared.chatModeSchema.safeParse(mode));
  report("settings profile settings", shared.chatPresetSettingsSchema.safeParse(data.settings ?? {}));
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
    // The bridge loads the release's built shared entrypoint when available, else the
    // maps model's actual Engine schema dependencies from source, and applies the Zod 4
    // `.innerType()` shim in the same module instance the maps model receives.
    const sharedModule = resolve(dirname(resolve(process.argv[1]!)), "maps-shared-bridge.cjs");
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
      case "agent_manifest":
        await validateAgentManifest(payload, path);
        break;
      case "agent_definitions":
        await validateAgentDefinitions(payload);
        break;
      case "extension_manifest":
        await validateExtensionManifest(payload, path);
        break;
      case "custom_tools":
        await validateCustomTools(payload, path);
        break;
      case "ruleset_package":
        await validateRulesetPackage(payload);
        break;
      case "story_script":
        await validateStoryScript(payload);
        break;
      case "chat_settings_profile":
        await validateChatSettingsProfile(payload);
        break;
      default:
        problem(`unrecognized artifact type (${kind}); no schema validation was performed`);
      }
    } catch (error) {
      problem((error as Error).message);
    }
  }

  engineHooks?.deregister();
  const warned = warnings ? ` (${warnings} warning(s))` : "";
  console.log(failures === 0 ? `\nAll checks passed${warned}.` : `\n${failures} problem(s) found${warned}.`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
