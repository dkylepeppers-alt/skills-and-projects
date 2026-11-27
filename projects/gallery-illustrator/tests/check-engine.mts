// Run the built agent through Marinara Engine's own import code, and (when the checkout carries
// PATCH10) through the patch's reference parser with the agent's documented example output.
//
//   MARINARA_ENGINE_ROOT=/path/to/Marinara-Engine node --import tsx tests/check-engine.mts
//
// Needs a full Engine checkout (client + shared source) and zod 4 + tsx resolvable from the
// checkout or a parent folder. See skills/marinara-engine-authoring/scripts/README.md.
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { agentFiles, assemble, importConfig } from "../build.mjs";

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

function verifyImport(
  label: string,
  entries: Array<{ raw: unknown; resolveTextFile?: (p: unknown) => string | null }>,
  source: "file" | "folder",
) {
  console.log(label);
  check("one agent entry found", entries.length === 1, `${entries.length}`);
  const normalized = transfer.normalizeAgentImportEntry(entries[0]?.raw, entries[0]?.resolveTextFile);
  check("normalizeAgentImportEntry accepts it", !!normalized);
  if (!normalized) return;
  const { requestedCapabilities, ...agent } = normalized;
  check(
    "requests only trigger_image_generation",
    JSON.stringify(requestedCapabilities) === JSON.stringify(["trigger_image_generation"]),
    JSON.stringify(requestedCapabilities),
  );
  check("phase post_processing", agent.phase === "post_processing", String(agent.phase));
  check("resultType image_prompt", agent.resultType === "image_prompt", String(agent.resultType));
  check("prompt template resolved", agent.promptTemplate.length > 3000, `${agent.promptTemplate.length} chars`);
  const parsed = shared.importAgentConfigSchema.safeParse({
    agent,
    source,
    approvedCapabilities: requestedCapabilities,
    acknowledgePermissions: true,
  });
  check("importAgentConfigSchema", parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues));
  const settings = agent.settings as Record<string, unknown>;
  const sources = shared.normalizeCustomAgentContextSources(settings);
  check("chat history, characters, persona, trackers, previous output on",
    sources.chatHistory && sources.characters && sources.persona && sources.trackerData && sources.previousOutput);
  const options = shared.normalizeAgentPromptTemplateOptions(settings.promptTemplates);
  check("4 named prompt options", options.length === 4, options.map((o: { id: string }) => o.id).join(","));
  const capabilities = shared.normalizeCustomAgentCapabilities(settings);
  check("capability map is image generation only", JSON.stringify(capabilities) === '{"trigger_image_generation":true}', JSON.stringify(capabilities));
  if (typeof shared.customAgentHasCapability === "function") {
    check("Engine sees the image ability", shared.customAgentHasCapability(settings, "trigger_image_generation"));
  }
}

const assembled = assemble();
const config = importConfig(assembled);
const files = agentFiles(assembled);
const singleName = `${config.type}.marinara-agent.json`;
const single = JSON.parse(files[singleName]);
verifyImport(
  `single file ${singleName}`,
  shared.getFolderImportEntries(single, ["agents"]).map((raw: unknown) => ({ raw, resolveTextFile: () => null })),
  "file",
);

const folderFiles = Object.entries(files)
  .filter(([path]) => path !== singleName)
  .map(([path, text]) => ({ path, text }));
const folderEntries = folders.collectFolderPackageEntries(folderFiles, {
  rootFilenames: ["marinara-agents.json", "marinara-agent.json"],
  collectionKeys: ["agents"],
});
verifyImport("folder Gallery-Illustrator/", folderEntries, "folder");
const folderConfig = shared.getFolderManifestConfig(folderEntries[0]?.raw) ?? {};
check("promptTemplatePath resolves", folderEntries[0]?.resolveTextFile(folderConfig.promptTemplatePath) === config.promptTemplate);
check(
  "settingsPath resolves",
  folderEntries[0]?.resolveTextFile(folderConfig.settingsPath) === `${JSON.stringify(config.settings, null, 2)}\n`,
);

// PATCH10, when this checkout carries it: the agent's example output parses into the request list it means.
const poolModule = resolve(engineRoot, "packages/server/src/services/image/gallery-reference-pool.ts");
if (existsSync(poolModule)) {
  try {
    const pool = await import(poolModule);
    console.log("PATCH10");
    const example = {
      references: [
        { id: "gg:harbor", role: "location", subject: "harbor" },
        { id: "cg:abcBody", role: "body", subject: "Mara" },
        { id: "cg:abcFace", role: "face", subject: "Mara" },
      ],
    };
    const parsed = pool.parsePoolReferences(example.references);
    check("example references parse, faces first", parsed.map((r: { id: string }) => r.id).join(",") === "cg:abcFace,cg:abcBody,gg:harbor");
    check("cap matches the prompt (10)", pool.POOL_MAX_REFERENCES === 10);
  } catch (error) {
    console.log(`PATCH10\n  skip  server modules did not load here (${(error as Error).message.split("\n")[0]})`);
  }
} else {
  console.log("PATCH10\n  skip  this checkout does not carry the patch");
}

console.log(failures ? `FAIL: ${failures} check(s)` : "PASS: Engine import path accepts both shapes");
process.exit(failures ? 1 : 0);
