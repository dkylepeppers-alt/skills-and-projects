import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

export type CompatibilityIssue = {
  sourceId: string;
  field: string;
  severity: "info" | "blocking";
  message: string;
};

export type RegexImportInput = {
  name: string;
  enabled: boolean;
  findRegex: string;
  replaceString: string;
  trimStrings: string[];
  placement: ("ai_output" | "user_input")[];
  flags: string;
  promptOnly: boolean;
  applyMode: "prompt" | "display" | "both";
  targetCharacterIds: string[];
  targetPromptPresetIds: string[];
  order: number;
  minDepth: number | null;
  maxDepth: number | null;
};

export type EnginePresetApi = {
  importPreset(envelope: unknown): Promise<{ success: boolean; type?: string; id?: string; error?: string }>;
  getPresetFull(id: string): Promise<any>;
  listRegexScripts(): Promise<Array<{ id: string; order: number; [field: string]: unknown }>>;
  importRegexScript(input: RegexImportInput): Promise<any>;
};

const LEGACY_PLACEMENTS = new Map<number, "ai_output" | "user_input">([
  [1, "user_input"],
  [2, "ai_output"],
]);

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true" || value === "1";
  return fallback;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function stringArray(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === "string" && item.length > 0);
}

function nullableInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) ? number : null;
}

function splitDelimitedPattern(value: string, explicitFlags: unknown): { pattern: string; flags: string; malformed?: boolean } {
  if (!value.startsWith("/")) {
    return { pattern: value, flags: typeof explicitFlags === "string" ? explicitFlags : "" };
  }
  for (let slash = value.length - 1; slash > 0; slash -= 1) {
    if (value[slash] !== "/") continue;
    let backslashes = 0;
    for (let i = slash - 1; i >= 0 && value[i] === "\\"; i--) backslashes++;
    if (backslashes % 2 !== 0) continue;
    const suffix = value.slice(slash + 1);
    if (!/^[dgimsuvy]*$/.test(suffix)) continue;
    const pattern = value.slice(1, slash);
    const flags = suffix;
    try {
      new RegExp(pattern.replace(/\{\{[^}]*\}\}/g, "x"), flags);
      return { pattern, flags };
    } catch {
      continue;
    }
  }
  return { pattern: value, flags: "", malformed: true };
}

function readApplyMode(script: Record<string, unknown>): "prompt" | "display" | "both" {
  if (script.applyMode === "prompt" || script.applyMode === "display" || script.applyMode === "both") {
    return script.applyMode;
  }
  const promptOnly = asBoolean(script.promptOnly ?? script.prompt_only ?? script.onlyFormatPrompt);
  const displayOnly = asBoolean(script.markdownOnly ?? script.markdown_only ?? script.onlyFormatDisplay);
  if (promptOnly && !displayOnly) return "prompt";
  if (displayOnly && !promptOnly) return "display";
  return "both";
}

export function convertLegacyRegexScript(
  source: Record<string, unknown>,
  options: { order: number; targetPresetId?: string },
) {
  const sourceId = typeof source.id === "string" ? source.id : `legacy-index-${options.order}`;
  const issues: CompatibilityIssue[] = [];
  const rawPlacement = asArray(source.placement);
  const placement: ("ai_output" | "user_input")[] = [];
  const unsupported: unknown[] = [];
  for (const value of rawPlacement) {
    const mapped = typeof value === "number" ? LEGACY_PLACEMENTS.get(value) : value;
    if (mapped !== "ai_output" && mapped !== "user_input") {
      unsupported.push(value);
    } else if (!placement.includes(mapped)) {
      placement.push(mapped);
    }
  }
  if (unsupported.length > 0 || placement.length === 0) {
    issues.push({
      sourceId,
      field: "placement",
      severity: "blocking",
      message: `No exact Engine placement exists for: ${JSON.stringify(unsupported.length ? unsupported : rawPlacement)}`,
    });
  }

  const runOnEdit = asBoolean(source.runOnEdit);
  if (runOnEdit) {
    issues.push({
      sourceId,
      field: "runOnEdit",
      severity: "blocking",
      message: "The pinned Engine has no run-on-edit field or equivalent import behavior.",
    });
  } else if ("runOnEdit" in source) {
    issues.push({
      sourceId,
      field: "runOnEdit",
      severity: "info",
      message: "Preserved in the legacy sidecar; false requires no edit-time mutation.",
    });
  }

  const substituteRegex = source.substituteRegex ?? 0;
  if (substituteRegex !== 0 && substituteRegex !== false && substituteRegex !== "0") {
    issues.push({
      sourceId,
      field: "substituteRegex",
      severity: "blocking",
      message: "The pinned Engine has no substituteRegex execution mode.",
    });
  } else if ("substituteRegex" in source) {
    issues.push({
      sourceId,
      field: "substituteRegex",
      severity: "info",
      message: "Preserved in the legacy sidecar; zero selects ordinary regex replacement.",
    });
  }

  const { pattern, flags, malformed } = splitDelimitedPattern(String(source.findRegex ?? ""), source.flags);
  if (malformed) issues.push({ sourceId, field: "findRegex", severity: "blocking", message: "Malformed delimited pattern or flags." });
  const applyMode = readApplyMode(source);
  const input: RegexImportInput = {
    name: String(source.name ?? source.scriptName ?? ""),
    enabled: "enabled" in source ? asBoolean(source.enabled, true) : !asBoolean(source.disabled),
    findRegex: pattern,
    replaceString: String(source.replaceString ?? ""),
    trimStrings: stringArray(source.trimStrings),
    placement: placement.length > 0 ? placement : ["ai_output"],
    flags,
    promptOnly: applyMode === "prompt",
    applyMode,
    targetCharacterIds: stringArray(source.targetCharacterIds),
    targetPromptPresetIds: options.targetPresetId
      ? [options.targetPresetId]
      : stringArray(source.targetPromptPresetIds),
    order: options.order,
    minDepth: nullableInteger(source.minDepth),
    maxDepth: nullableInteger(source.maxDepth),
  };
  for (const field of ["minDepth", "maxDepth"] as const) {
    const raw = source[field];
    if (raw !== null && raw !== undefined && raw !== "" &&
        (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0)) {
      issues.push({ sourceId, field, severity: "blocking", message: "Depth must be a nonnegative safe integer or null." });
    }
  }
  if (!input.name || !input.findRegex) {
    issues.push({ sourceId, field: !input.name ? "scriptName" : "findRegex", severity: "blocking", message: "Required Engine value is empty." });
  }
  if (input.minDepth !== null && input.maxDepth !== null && input.minDepth > input.maxDepth) {
    issues.push({ sourceId, field: "maxDepth", severity: "blocking", message: "Maximum depth is below minimum depth." });
  }
  try {
    new RegExp(input.findRegex.replace(/\{\{[^}]*\}\}/g, "x"), input.flags);
  } catch {
    issues.push({ sourceId, field: "findRegex", severity: "blocking", message: "Pattern or flags are invalid for the Engine JavaScript runtime." });
  }
  return { sourceId, preservedLegacy: structuredClone(source), input, issues };
}

export function buildCompatibilityPlan(envelope: any) {
  if (!envelope || envelope.type !== "marinara_preset" || envelope.version !== 1 || !envelope.data?.preset) {
    throw new Error("Expected a Marinara preset v1 envelope");
  }
  for (const key of ["sections", "groups", "choiceBlocks"] as const) {
    if (!Array.isArray(envelope.data[key])) throw new Error(`Preset data.${key} must be an array`);
  }
  const legacyRegex = envelope.extensions?.regex_scripts;
  if (!Array.isArray(legacyRegex)) throw new Error("Preset extensions.regex_scripts must be an array");
  return {
    sourceEnvelope: structuredClone(envelope),
    sourcePresetId: String(envelope.data.preset.id),
    sourceCounts: {
      sections: envelope.data.sections.length,
      groups: envelope.data.groups.length,
      choiceBlocks: envelope.data.choiceBlocks.length,
      regexScripts: legacyRegex.length,
    },
  };
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

const JSON_FIELDS = new Set(["variableGroups", "variableValues", "defaultChoices", "sectionOrder", "groupOrder", "markerConfig", "options", "trimStrings", "placement", "targetCharacterIds", "targetPromptPresetIds"]);
const BOOLEAN_FIELDS = new Set(["enabled", "isDefault", "isMarker", "wrapInXml", "forbidOverrides", "multiSelect", "randomPick", "promptOnly"]);
function same(left: unknown, right: unknown, field: string): boolean {
  const normalize = (value: unknown) => JSON_FIELDS.has(field) || BOOLEAN_FIELDS.has(field) ? parseJson(value) : value;
  return isDeepStrictEqual(normalize(left), normalize(right));
}

/** Legacy export columns the pinned importer ignores; missing native equals documented default. */
function defaultEquivalent(expected: unknown, observed: unknown, fallback: unknown, field: string): boolean {
  const effectiveObserved = observed === undefined || observed === null ? fallback : observed;
  return same(expected ?? fallback, effectiveObserved, field);
}

function uniqueIndex(rows: any[], key: (row: any) => string): Map<string, any> {
  const result = new Map<string, any>();
  const ids = new Set<string>();
  for (const row of rows) {
    const k = key(row);
    if (!k || !row.id || result.has(k) || ids.has(row.id)) throw new Error("Ambiguous native or source record identity");
    result.set(k, row);
    ids.add(row.id);
  }
  return result;
}

function deriveIdMap(plan: ReturnType<typeof buildCompatibilityPlan>, actual: any) {
  const source = plan.sourceEnvelope.data;
  const idMap = { sections: {} as Record<string, string>, groups: {} as Record<string, string>, choiceBlocks: {} as Record<string, string>, regexScripts: {} as Record<string, string> };
  uniqueIndex(source.sections, item => item.identifier);
  uniqueIndex(source.groups, item => `${item.name}\0${item.order}`);
  uniqueIndex(source.choiceBlocks, item => item.variableName);
  const actualSectionByIdentifier = uniqueIndex(actual.sections, item => item.identifier);
  const actualGroupByKey = uniqueIndex(actual.groups, item => `${item.name}\0${item.order}`);
  const actualChoiceByVariable = uniqueIndex(actual.choiceBlocks, item => item.variableName);
  for (const item of source.sections) {
    const found: any = actualSectionByIdentifier.get(item.identifier);
    if (found) idMap.sections[item.id] = found.id;
  }
  for (const item of source.groups) {
    const found: any = actualGroupByKey.get(`${item.name}\0${item.order}`);
    if (found) idMap.groups[item.id] = found.id;
  }
  for (const item of source.choiceBlocks) {
    const found: any = actualChoiceByVariable.get(item.variableName);
    if (found) idMap.choiceBlocks[item.id] = found.id;
  }
  return idMap;
}

export function verifyInstalledPreset(plan: ReturnType<typeof buildCompatibilityPlan>, actual: any, suppliedIdMap?: ReturnType<typeof deriveIdMap>) {
  const source = plan.sourceEnvelope.data;
  const idMap = suppliedIdMap ?? deriveIdMap(plan, actual);
  const unaccounted: Array<{ sourcePath: string; expected: unknown; actual: unknown }> = [];
  const check = (path: string, expected: unknown, observed: unknown) => {
    if (!same(expected, observed, path.split(".").at(-1)!)) unaccounted.push({ sourcePath: path, expected, actual: observed });
  };
  for (const key of ["sections", "groups", "choiceBlocks"] as const) {
    check(`data.${key}.length`, source[key].length, actual[key].length);
  }
  const presetFields = ["name", "description", "imagePath", "conversationPrompt", "gamePrompt", "variableGroups", "variableValues", "wrapFormat", "isDefault", "author", "createdAt"];
  for (const field of presetFields) check(`data.preset.${field}`, source.preset[field], actual.preset[field]);
  check("data.preset.defaultChoices", source.preset.defaultChoices, actual.preset.defaultChoices);
  check("data.preset.sectionOrder", (parseJson(source.preset.sectionOrder) as string[]).map((id: string) => idMap.sections[id]), actual.preset.sectionOrder);
  check("data.preset.groupOrder", (parseJson(source.preset.groupOrder) as string[]).map((id: string) => idMap.groups[id]), actual.preset.groupOrder);

  const sectionsById = new Map(actual.sections.map((item: any) => [item.id, item]));
  const sectionFields = ["identifier", "name", "content", "role", "enabled", "isMarker", "markerConfig", "injectionPosition", "injectionDepth", "injectionOrder", "forbidOverrides"];
  for (const item of source.sections) {
    const observed: any = sectionsById.get(idMap.sections[item.id]);
    if (!observed) { unaccounted.push({ sourcePath: `data.sections[${item.id}]`, expected: "installed", actual: null }); continue; }
    check(`data.sections[${item.id}].presetId`, actual.preset.id, observed.presetId);
    check(`data.sections[${item.id}].groupId`, item.groupId ? idMap.groups[item.groupId] : null, observed.groupId);
    for (const field of sectionFields) check(`data.sections[${item.id}].${field}`, item[field], observed[field]);
    // wrapInXml / xmlTagName do not round-trip through the pinned importer.
    if (!defaultEquivalent(item.wrapInXml, observed.wrapInXml, false, "wrapInXml")) {
      unaccounted.push({ sourcePath: `data.sections[${item.id}].wrapInXml`, expected: item.wrapInXml, actual: observed.wrapInXml });
    }
    if (!defaultEquivalent(item.xmlTagName, observed.xmlTagName, "", "xmlTagName")) {
      unaccounted.push({ sourcePath: `data.sections[${item.id}].xmlTagName`, expected: item.xmlTagName, actual: observed.xmlTagName });
    }
  }

  const groupsById = new Map(actual.groups.map((item: any) => [item.id, item]));
  for (const item of source.groups) {
    const observed: any = groupsById.get(idMap.groups[item.id]);
    if (!observed) { unaccounted.push({ sourcePath: `data.groups[${item.id}]`, expected: "installed", actual: null }); continue; }
    check(`data.groups[${item.id}].presetId`, actual.preset.id, observed.presetId);
    for (const field of ["name", "order", "enabled"]) check(`data.groups[${item.id}].${field}`, item[field], observed[field]);
    check(`data.groups[${item.id}].parentGroupId`, item.parentGroupId ? idMap.groups[item.parentGroupId] : null, observed.parentGroupId);
  }

  const choicesById = new Map(actual.choiceBlocks.map((item: any) => [item.id, item]));
  for (const item of source.choiceBlocks) {
    const observed: any = choicesById.get(idMap.choiceBlocks[item.id]);
    if (!observed) { unaccounted.push({ sourcePath: `data.choiceBlocks[${item.id}]`, expected: "installed", actual: null }); continue; }
    check(`data.choiceBlocks[${item.id}].presetId`, actual.preset.id, observed.presetId);
    for (const field of ["variableName", "question", "options", "multiSelect", "separator", "randomPick", "displayMode", "optionSort", "sortOrder"]) {
      check(`data.choiceBlocks[${item.id}].${field}`, item[field], observed[field]);
    }
  }
  return { complete: unaccounted.length === 0, unaccounted, idMap };
}

export type InstallationReceipt = {
  schemaVersion: 1;
  sourceHash: string;
  presetId: string;
  orderBase: number;
  regexScripts: Record<string, string>;
};

/** Resume only a receipt for this source. Checkpoint failures stop further writes.
 * A lost initial preset-create response has no native idempotency key: inspect
 * the host before starting a new installation, rather than retrying blindly.
 */
export async function installPresetCompatibility(
  plan: ReturnType<typeof buildCompatibilityPlan>,
  api: EnginePresetApi,
  options: { resume?: InstallationReceipt; checkpoint?: (receipt: InstallationReceipt) => Promise<void> } = {},
) {
  const preflight = plan.sourceEnvelope.extensions.regex_scripts.flatMap((row: any, index: number) =>
    convertLegacyRegexScript(row, { order: index }).issues.filter(issue => issue.severity === "blocking"));
  if (preflight.length) throw new Error(`Unsupported executable fields: ${JSON.stringify(preflight)}`);
  const sourceHash = createHash("sha256").update(JSON.stringify(plan.sourceEnvelope)).digest("hex");
  const existing = await api.listRegexScripts();
  let receipt: InstallationReceipt;
  if (options.resume) {
    const saved = options.resume;
    if (saved.schemaVersion !== 1 || saved.sourceHash !== sourceHash || !saved.presetId ||
        !Number.isSafeInteger(saved.orderBase) || saved.orderBase < 0 ||
        !saved.regexScripts || typeof saved.regexScripts !== "object" || Array.isArray(saved.regexScripts)) {
      throw new Error("Installation receipt does not match this source or schema");
    }
    receipt = structuredClone(saved);
  } else {
    const imported = await api.importPreset(plan.sourceEnvelope);
    if (!imported.success || !imported.id) throw new Error(imported.error ?? "Engine preset import failed without an ID; inspect the host before retrying");
    receipt = {
      schemaVersion: 1, sourceHash, presetId: imported.id,
      orderBase: existing.reduce((highest, item) => Math.max(highest, item.order), -1) + 1,
      regexScripts: {},
    };
    await options.checkpoint?.(structuredClone(receipt));
  }
  const full = await api.getPresetFull(receipt.presetId);
  const verification = verifyInstalledPreset(plan, full);
  const idMap = verification.idMap;
  const issues: CompatibilityIssue[] = [];
  const failures: Array<{ sourceId: string; error: string }> = [];
  if (verification.complete) {
    for (const [index, legacy] of plan.sourceEnvelope.extensions.regex_scripts.entries()) {
      const converted = convertLegacyRegexScript(legacy, { order: receipt.orderBase + index, targetPresetId: receipt.presetId });
      issues.push(...converted.issues);
      try {
        const savedId = receipt.regexScripts[converted.sourceId];
        // Recover an acknowledged native create whose receipt write was lost.
        const matches = existing.filter(row => savedId ? row.id === savedId :
          row.order === converted.input.order && same(row.targetPromptPresetIds, [receipt.presetId], "targetPromptPresetIds"));
        if (matches.length > 1) throw new Error("Ambiguous installed regex; repair before resuming");
        if (savedId && matches.length !== 1) throw new Error("Receipt references a missing regex; repair before resuming");
        const row = matches[0] ?? await api.importRegexScript(converted.input);
        if (!row?.id) throw new Error("Engine returned no regex ID");
        const changed = Object.entries(converted.input).filter(([field, value]) => !same(value, row[field], field));
        if (changed.length) throw new Error(`Regex import differs: ${changed.map(([field]) => field).join(", ")}`);
        idMap.regexScripts[converted.sourceId] = row.id;
        receipt.regexScripts[converted.sourceId] = row.id;
      } catch (error) {
        failures.push({ sourceId: converted.sourceId, error: error instanceof Error ? error.message : String(error) });
        break;
      }
      // Keep this outside the API catch: failed durable bookkeeping must halt.
      await options.checkpoint?.(structuredClone(receipt));
    }
  }
  const readback = await api.listRegexScripts();
  for (const [index, legacy] of plan.sourceEnvelope.extensions.regex_scripts.entries()) {
    const converted = convertLegacyRegexScript(legacy, { order: receipt.orderBase + index, targetPresetId: receipt.presetId });
    const matches = readback.filter(row => row.id === idMap.regexScripts[converted.sourceId]);
    const changed = Object.entries(converted.input).filter(([field, value]) =>
      matches.length !== 1 || !same(value, matches[0][field], field));
    if (changed.length) failures.push({ sourceId: converted.sourceId, error: `Regex readback differs: ${changed.map(([field]) => field).join(", ")}` });
  }
  const countsComplete =
    Object.keys(idMap.sections).length === plan.sourceCounts.sections &&
    Object.keys(idMap.groups).length === plan.sourceCounts.groups &&
    Object.keys(idMap.choiceBlocks).length === plan.sourceCounts.choiceBlocks &&
    Object.keys(idMap.regexScripts).length === plan.sourceCounts.regexScripts;
  return {
    complete: verification.complete && countsComplete && failures.length === 0 && !issues.some(issue => issue.severity === "blocking"),
    presetId: receipt.presetId, idMap, issues, failures, verification, receipt,
  };
}
