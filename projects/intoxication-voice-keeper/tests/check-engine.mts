// Run the built agent through Marinara Engine's own import code.
//
//   MARINARA_ENGINE_ROOT=/path/to/Marinara-Engine node --import tsx tests/check-engine.mts
//
// Needs a full Engine checkout (client + shared source) and zod 4 + tsx resolvable from the
// checkout or a parent folder. See skills/marinara-engine-authoring/scripts/README.md.
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { assemble, outputFiles } from "../build.mjs";

const engineRoot = process.env.MARINARA_ENGINE_ROOT;
if (!engineRoot || !existsSync(resolve(engineRoot, "packages/client/src/lib/agent-transfer.ts"))) {
  console.error("Set MARINARA_ENGINE_ROOT to a full Marinara Engine checkout");
  process.exit(2);
}
const sharedIndex = resolve(engineRoot, "packages/shared/src/index.ts");
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === "@marinara-engine/shared" ? sharedIndex : specifier, context);
  },
});

const shared = await import(sharedIndex);
const transfer = await import(resolve(engineRoot, "packages/client/src/lib/agent-transfer.ts"));
const folders = await import(resolve(engineRoot, "packages/client/src/lib/folder-package-transfer.ts"));

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) failures++;
};

function verifyImport(label: string, entries: Array<{ raw: unknown; resolveTextFile?: (p: unknown) => string | null }>, source: "file" | "folder") {
  console.log(`${label}`);
  check("one agent entry found", entries.length === 1, `${entries.length}`);
  const normalized = transfer.normalizeAgentImportEntry(entries[0]?.raw, entries[0]?.resolveTextFile);
  check("normalizeAgentImportEntry accepts it", !!normalized);
  if (!normalized) return;
  const { requestedCapabilities, ...agent } = normalized;
  check("requests no capabilities", requestedCapabilities.length === 0, JSON.stringify(requestedCapabilities));
  check("phase pre_generation", agent.phase === "pre_generation", String(agent.phase));
  check("resultType context_injection", agent.resultType === "context_injection", String(agent.resultType));
  check("prompt template resolved", agent.promptTemplate.length > 1000, `${agent.promptTemplate.length} chars`);
  const parsed = shared.importAgentConfigSchema.safeParse({ agent, source, approvedCapabilities: [], acknowledgePermissions: true });
  check("importAgentConfigSchema", parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues));
  const settings = agent.settings as Record<string, unknown>;
  check("jsonContextOutput kept", settings.jsonContextOutput === true);
  const sources = shared.normalizeCustomAgentContextSources(settings);
  check("previousOutput context source on", sources.previousOutput === true);
  check("chat history + characters on", sources.chatHistory && sources.characters);
  const options = shared.normalizeAgentPromptTemplateOptions(settings.promptTemplates);
  check("3 named prompt options", options.length === 3, options.map((o: { id: string }) => o.id).join(","));
  check("no capability map derived", Object.keys(shared.normalizeCustomAgentCapabilities(settings)).length === 0);
}

const config = assemble();
const files = outputFiles(config);

const singleName = `${config.type}.marinara-agent.json`;
const single = JSON.parse(files[singleName]);
verifyImport(`single file ${singleName}`, shared.getFolderImportEntries(single, ["agents"]).map((raw: unknown) => ({ raw, resolveTextFile: () => null })), "file");

const folderFiles = Object.entries(files)
  .filter(([path]) => path !== singleName)
  .map(([path, text]) => ({ path, text }));
const folderEntries = folders.collectFolderPackageEntries(folderFiles, {
  rootFilenames: ["marinara-agents.json", "marinara-agent.json"],
  collectionKeys: ["agents"],
});
verifyImport("folder Intoxication-Voice-Keeper/", folderEntries, "folder");
// Folder paths carry the chosen folder's name, as the browser's webkitRelativePath does. The
// separate prompt and settings files must resolve, not fall back to the inline copies.
const folderConfig = shared.getFolderManifestConfig(folderEntries[0]?.raw) ?? {};
check("promptTemplatePath resolves", folderEntries[0]?.resolveTextFile(folderConfig.promptTemplatePath) === config.promptTemplate);
check("settingsPath resolves", folderEntries[0]?.resolveTextFile(folderConfig.settingsPath) === `${JSON.stringify(config.settings, null, 2)}\n`);

// Runtime: a pre-generation context_injection custom agent is placed as a runtime agent section,
// and the JSON-context contract adds the {"text","agent-context"} output instruction.
try {
  const sections = await import(resolve(engineRoot, "packages/server/src/services/generation/runtime-agent-sections.ts"));
  const eligible = sections.buildRuntimeAgentSectionEligibleTypes({
    enableAgents: true,
    activeAgentIds: [config.type],
    configuredAgents: [{ type: config.type, phase: config.phase, settings: config.settings }],
  });
  console.log("runtime");
  check("eligible for main-prompt injection", eligible.has(config.type));
} catch (error) {
  console.log(`runtime\n  skip  server modules did not load here (${(error as Error).message.split("\n")[0]})`);
}

console.log(failures ? `FAIL: ${failures} check(s)` : "PASS: Engine import path accepts both shapes");
process.exit(failures ? 1 : 0);
