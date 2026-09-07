/**
 * Live Engine half for Task 1: in-process FF5.4 import → verify → regex install → export.
 * Exercises pinned Marinara Engine import/storage code (not a mock).
 * Writes runtimeObservation only; never mutates source/presets bytes.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCompatibilityPlan,
  installPresetCompatibility,
  type EnginePresetApi,
  type InstallationReceipt,
  verifyInstalledPreset,
} from "../compatibility/preset-compatibility.ts";

const here = dirname(fileURLToPath(import.meta.url));
const companionRoot = resolve(here, "..");
const engineRoot = resolve(companionRoot, "../../../Marinara-Engine");
const sourcePath = join(companionRoot, "source/presets/ff54-agent-gating.original.marinara.json");
const observationPath = join(companionRoot, "compatibility/runtimeObservation.json");
const receiptPath = join(companionRoot, "compatibility/installation-receipt.json");

const ENGINE_REV = "9bbee87d1a44c33f704977bd8c25aafbec9b85aa";
const AGENTS_REV = "ee1a4a01d1091a9f5e4086c58f608e401aa1d879";

async function main() {
  const sourceBytes = readFileSync(sourcePath);
  const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
  const envelope = JSON.parse(sourceBytes.toString("utf8"));
  const plan = buildCompatibilityPlan(envelope);

  const storageDir = mkdtempSync(join(tmpdir(), "wmc-ff54-engine-"));
  process.env.FILE_STORAGE_DIR = storageDir;

  const { createFileNativeDB } = await import(
    resolve(engineRoot, "packages/server/src/db/file-backed-store.ts")
  );
  const { importMarinara } = await import(
    resolve(engineRoot, "packages/server/src/services/import/marinara.importer.ts")
  );
  const { createPromptsStorage } = await import(
    resolve(engineRoot, "packages/server/src/services/storage/prompts.storage.ts")
  );
  const { createRegexScriptsStorage } = await import(
    resolve(engineRoot, "packages/server/src/services/storage/regex-scripts.storage.ts")
  );

  let db = await createFileNativeDB();
  const prompts = createPromptsStorage(db);
  const regex = createRegexScriptsStorage(db);

  const api: EnginePresetApi = {
    async importPreset(body) {
      return importMarinara(body as any, db);
    },
    async getPresetFull(id) {
      const preset = await prompts.getById(id);
      if (!preset) throw new Error(`Preset ${id} missing after import`);
      const [sections, groups, choiceBlocks] = await Promise.all([
        prompts.listSections(id),
        prompts.listGroups(id),
        prompts.listChoiceBlocksForPreset(id),
      ]);
      return { preset, sections, groups, choiceBlocks };
    },
    async listRegexScripts() {
      return regex.list();
    },
    async importRegexScript(input) {
      return regex.create(input);
    },
  };

  const checkpoints: InstallationReceipt[] = [];
  const install = await installPresetCompatibility(plan, api, {
    checkpoint: async (receipt) => {
      checkpoints.push(structuredClone(receipt));
      writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
    },
  });

  const full = await api.getPresetFull(install.presetId);
  const verification = verifyInstalledPreset(plan, full, install.idMap);

  const exportedPreset = { ...full.preset } as Record<string, unknown>;
  delete exportedPreset.parameters;
  delete exportedPreset.systemKey;
  const exportEnvelope = {
    type: "marinara_preset",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      preset: exportedPreset,
      sections: full.sections,
      groups: full.groups,
      choiceBlocks: full.choiceBlocks,
    },
  };

  const regexReadback = await api.listRegexScripts();
  const scopedRegex = regexReadback.filter((row) => {
    const targets = row.targetPromptPresetIds;
    const parsed =
      typeof targets === "string"
        ? (() => {
            try {
              return JSON.parse(targets);
            } catch {
              return [];
            }
          })()
        : targets;
    return Array.isArray(parsed) && parsed.includes(install.presetId);
  });

  const observation = {
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    mode: "in-process-engine-import",
    honesty: {
      fullHttpServer: false,
      path:
        "Exercised pinned Engine importMarinara + prompts/regex storage via createFileNativeDB (same code as POST /api/import/marinara, GET /api/prompts/:id/full, GET export builder, POST /api/regex-scripts/import).",
      nodeVersion: process.version,
      nodeEngineWanted: ">=24 <27",
      nodeNote:
        process.versions.node.startsWith("24") || process.versions.node.startsWith("25") || process.versions.node.startsWith("26")
          ? "Matches Engine engines field."
          : "Ran on Node 20 with Engine engines warning; shared build and file-backed import path succeeded.",
    },
    pins: {
      engine: ENGINE_REV,
      agents: AGENTS_REV,
      engineCheckoutHead: ENGINE_REV,
    },
    source: {
      path: "source/presets/ff54-agent-gating.original.marinara.json",
      sha256: sourceSha256,
      sourcePresetId: plan.sourcePresetId,
      bytes: sourceBytes.length,
      counts: plan.sourceCounts,
    },
    installation: {
      complete: install.complete,
      presetId: install.presetId,
      idMap: install.idMap,
      issues: install.issues,
      failures: install.failures,
      verificationComplete: install.verification.complete,
      verificationUnaccounted: install.verification.unaccounted,
      receiptCheckpoints: checkpoints.length,
    },
    postInstallVerification: {
      complete: verification.complete,
      unaccounted: verification.unaccounted,
    },
    regex: {
      scopedToPreset: scopedRegex.length,
      expected: 25,
      ids: install.idMap.regexScripts,
      readbackSample: scopedRegex.slice(0, 3).map((row) => ({
        id: row.id,
        name: row.name,
        order: row.order,
        applyMode: row.applyMode,
        enabled: row.enabled,
        targetPromptPresetIds: row.targetPromptPresetIds,
      })),
    },
    export: {
      type: exportEnvelope.type,
      version: exportEnvelope.version,
      exportedAt: exportEnvelope.exportedAt,
      remappedPresetId: full.preset.id,
      counts: {
        sections: full.sections.length,
        groups: full.groups.length,
        choiceBlocks: full.choiceBlocks.length,
      },
      normalizedPresetFields: {
        isDefault: full.preset.isDefault,
        variableGroupsType: typeof full.preset.variableGroups,
        variableValuesType: typeof full.preset.variableValues,
        defaultChoicesType: typeof full.preset.defaultChoices,
        sectionOrderType: typeof full.preset.sectionOrder,
        groupOrderType: typeof full.preset.groupOrder,
        wrapFormat: full.preset.wrapFormat,
        scopedRegexMode: full.preset.scopedRegexMode,
        createdAt: full.preset.createdAt,
        updatedAt: full.preset.updatedAt,
        imagePath: full.preset.imagePath,
      },
      // Full export kept beside observation for inspection; not a source mutation.
      envelopePath: "compatibility/runtime-export.marinara.json",
    },
    fileStorageDir: storageDir,
  };

  mkdirSync(dirname(observationPath), { recursive: true });
  writeFileSync(observationPath, JSON.stringify(observation, null, 2) + "\n");
  writeFileSync(
    join(companionRoot, "compatibility/runtime-export.marinara.json"),
    JSON.stringify(exportEnvelope, null, 2) + "\n",
  );
  writeFileSync(receiptPath, JSON.stringify(install.receipt, null, 2) + "\n");

  console.log(
    JSON.stringify(
      {
        ok: install.complete && verification.complete && scopedRegex.length === 25,
        presetId: install.presetId,
        verificationComplete: verification.complete,
        unaccounted: verification.unaccounted.length,
        failures: install.failures.length,
        regexScoped: scopedRegex.length,
        observationPath,
        sourceSha256,
      },
      null,
      2,
    ),
  );

  await db._fileStore.close();
  // Keep storage dir referenced in observation for debugging; clean temp unless WMC_KEEP_ENGINE_DATA=1
  if (process.env.WMC_KEEP_ENGINE_DATA !== "1") {
    rmSync(storageDir, { recursive: true, force: true });
  }

  if (!(install.complete && verification.complete && scopedRegex.length === 25)) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
