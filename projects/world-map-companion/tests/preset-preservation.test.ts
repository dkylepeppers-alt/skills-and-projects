import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildCompatibilityPlan,
  convertLegacyRegexScript,
  installPresetCompatibility,
  verifyInstalledPreset,
} from "../compatibility/preset-compatibility.ts";

const sourcePath = fileURLToPath(new URL("../source/presets/ff54-agent-gating.original.marinara.json", import.meta.url));
const mapPath = fileURLToPath(new URL("../compatibility/preset-import-map.json", import.meta.url));
const sourceBytes = readFileSync(sourcePath);
const source = JSON.parse(sourceBytes.toString("utf8"));
const fieldMap = JSON.parse(readFileSync(mapPath, "utf8"));

test("field ledger covers every source field and names a transport disposition", () => {
  assert.equal(fieldMap.engine.revision, "9bbee87d1a44c33f704977bd8c25aafbec9b85aa");
  for (const [sourceKey, mappingKey] of [
    [[source], "envelope"],
    [[source.data.preset], "preset"],
    [source.data.sections, "section"],
    [source.data.groups, "group"],
    [source.data.choiceBlocks, "choiceBlock"],
    [source.extensions.regex_scripts, "legacyRegex"],
  ] as const) {
    assert.deepEqual(Object.keys(fieldMap.fields[mappingKey]).sort(), [...new Set(sourceKey.flatMap((row: any) => Object.keys(row)))].sort());
    for (const mapping of Object.values(fieldMap.fields[mappingKey]) as any[]) {
      assert.ok(["native", "normalized", "remapped", "default-equivalent", "sidecar", "translated"].includes(mapping.disposition));
      assert.equal(typeof mapping.destination, "string");
    }
  }
});

test("legacy regex conversion preserves scope, flags, disabled state, depth, and edit metadata", () => {
  const translated = source.extensions.regex_scripts.map((script: any, index: number) =>
    convertLegacyRegexScript(script, { order: 20 + index, targetPresetId: "new-preset" }),
  );
  assert.equal(translated.length, 25);
  assert.deepEqual(translated[0].input.placement, ["ai_output", "user_input"]);
  assert.equal(translated[0].input.flags, "gi");
  assert.equal(translated[0].input.enabled, true);
  assert.equal(translated[0].input.applyMode, "prompt");
  assert.equal(translated[1].input.applyMode, "display");
  assert.equal(translated[3].input.minDepth, 2);
  assert.equal(translated[3].input.maxDepth, null);
  assert.deepEqual(translated[0].input.targetPromptPresetIds, ["new-preset"]);
  assert.ok(translated.every((entry: any) => entry.preservedLegacy.runOnEdit === false));
  assert.ok(translated.every((entry: any) => entry.issues.every((issue: any) => issue.severity !== "blocking")));

  const disabled = convertLegacyRegexScript({ ...source.extensions.regex_scripts[0], disabled: true }, { order: 0 });
  assert.equal(disabled.input.enabled, false);
  const unsupported = convertLegacyRegexScript({ ...source.extensions.regex_scripts[0], placement: [3], runOnEdit: true }, { order: 0 });
  assert.ok(unsupported.issues.some((issue: any) => issue.field === "placement" && issue.severity === "blocking"));
  assert.ok(unsupported.issues.some((issue: any) => issue.field === "runOnEdit" && issue.severity === "blocking"));
});

test("installer remaps native IDs, scopes regexes to the imported preset, and verifies all records", async () => {
  const plan = buildCompatibilityPlan(source);
  const fake = createFakeEngine(source);
  const result = await installPresetCompatibility(plan, fake);
  assert.equal(result.complete, true);
  assert.equal(Object.keys(result.idMap.sections).length, 69);
  assert.equal(Object.keys(result.idMap.groups).length, 12);
  assert.equal(Object.keys(result.idMap.choiceBlocks).length, 11);
  assert.equal(Object.keys(result.idMap.regexScripts).length, 25);
  assert.ok(fake.importedRegex.every((entry: any) => entry.targetPromptPresetIds[0] === result.presetId));
  assert.ok(fake.importedRegex.every((entry: any, index: number) => entry.order === 7 + index));
  assert.deepEqual(result.verification.unaccounted, []);
});

test("verification blocks packaging when an imported field changes", async () => {
  const plan = buildCompatibilityPlan(source);
  const fake = createFakeEngine(source);
  const installed = await installPresetCompatibility(plan, fake);
  const changed = structuredClone(fake.fullPreset);
  changed.sections[0].enabled = "false";
  const verification = verifyInstalledPreset(plan, changed, installed.idMap);
  assert.equal(verification.complete, false);
  assert.ok(verification.unaccounted.some((item: any) => item.sourcePath.endsWith(".enabled")));
});

function createFakeEngine(envelope: any) {
  const id = (prefix: string, index: number) => `${prefix}-${index}`;
  const groupMap = Object.fromEntries(envelope.data.groups.map((item: any, index: number) => [item.id, id("group", index)]));
  const presetId = "preset-imported";
  const fullPreset = {
    preset: {
      ...envelope.data.preset,
      id: presetId,
      sectionOrder: JSON.stringify(envelope.data.sections.map((_: any, index: number) => id("section", index))),
      groupOrder: JSON.stringify(envelope.data.groups.map((_: any, index: number) => id("group", index))),
      variableGroups: JSON.stringify(JSON.parse(envelope.data.preset.variableGroups)),
      variableValues: JSON.stringify(JSON.parse(envelope.data.preset.variableValues)),
      defaultChoices: JSON.stringify(JSON.parse(envelope.data.preset.defaultChoices)),
      isDefault: "false",
      parameters: JSON.stringify({}),
      scopedRegexMode: "disabled",
      systemKey: "",
    },
    groups: envelope.data.groups.map((group: any, index: number) => ({
      ...group,
      id: id("group", index),
      presetId,
      parentGroupId: group.parentGroupId ? groupMap[group.parentGroupId] : null,
    })),
    sections: envelope.data.sections.map((section: any, index: number) => ({
      ...section,
      id: id("section", index),
      presetId,
      groupId: section.groupId ? groupMap[section.groupId] : null,
    })),
    choiceBlocks: envelope.data.choiceBlocks.map((choice: any, index: number) => ({
      ...choice,
      id: id("choice", index),
      presetId,
    })),
  };
  const importedRegex: any[] = [];
  return {
    fullPreset,
    importedRegex,
    async importPreset() { return { success: true, type: "marinara_preset", id: presetId }; },
    async getPresetFull() { return fullPreset; },
    async listRegexScripts() { return [...Array.from({ length: 7 }, (_, order) => ({ id: `existing-${order}`, order })), ...importedRegex]; },
    async importRegexScript(input: any) {
      const row = { ...structuredClone(input), id: id("regex", importedRegex.length) };
      importedRegex.push(row);
      return row;
    },
  };
}


test("verification requires exact text but permits documented native timestamp normalization", async () => {
  const changedSource = structuredClone(source);
  changedSource.data.sections[0].content = '1';
  const plan = buildCompatibilityPlan(changedSource);
  const fake = createFakeEngine(changedSource);
  fake.fullPreset.preset.updatedAt = '2099-01-01T00:00:00.000Z';
  assert.equal(verifyInstalledPreset(plan, fake.fullPreset).complete, true);
  fake.fullPreset.sections[0].content = '1.0';
  assert.equal(verifyInstalledPreset(plan, fake.fullPreset).complete, false);
});

test("installer checks regex readback and stops before writes on an unsupported executable field", async () => {
  const fake = createFakeEngine(source);
  const importScript = fake.importRegexScript;
  fake.importRegexScript = async (input) => importScript({ ...input, replaceString: 'CORRUPTED' });
  const result = await installPresetCompatibility(buildCompatibilityPlan(source), fake);
  assert.equal(result.complete, false);
  assert.ok(result.failures.length > 0);
  const bad = structuredClone(source);
  bad.extensions.regex_scripts[0].runOnEdit = true;
  let writes = 0;
  fake.importPreset = async () => { writes++; throw new Error('must not import'); };
  await assert.rejects(installPresetCompatibility(buildCompatibilityPlan(bad), fake), /unsupported/i);
  assert.equal(writes, 0);
});

test("duplicate native identifiers and missing or extra records cannot pass preservation", () => {
  const fake = createFakeEngine(source);
  fake.fullPreset.sections[1].identifier = fake.fullPreset.sections[0].identifier;
  assert.throws(() => verifyInstalledPreset(buildCompatibilityPlan(source), fake.fullPreset), /ambiguous/i);
  const extra = createFakeEngine(source);
  extra.fullPreset.sections.push({ ...extra.fullPreset.sections[0], id: 'extra', identifier: 'extra' });
  assert.equal(verifyInstalledPreset(buildCompatibilityPlan(source), extra.fullPreset).complete, false);
});

test("regex parsing honors an explicitly empty flag suffix and rejects malformed depths", () => {
  const base = source.extensions.regex_scripts[0];
  const exact = convertLegacyRegexScript({ ...base, findRegex: '/x/' }, { order: 0 });
  assert.equal(exact.input.flags, '');
  const escaped = convertLegacyRegexScript({ ...base, findRegex: '/x\\\\/g' }, { order: 0 });
  assert.equal(escaped.input.findRegex, 'x\\\\');
  for (const depth of [-1, 'wrong', 1.5]) {
    assert.ok(convertLegacyRegexScript({ ...base, minDepth: depth }, { order: 0 }).issues.some(i => i.severity === 'blocking'));
  }
});

test('an interrupted install resumes the same preset and does not duplicate acknowledged regexes', async () => {
  const fake = createFakeEngine(source);
  let presetImports = 0;
  const importPreset = fake.importPreset;
  fake.importPreset = async () => { presetImports++; return importPreset(); };
  let checkpoint: any;
  await assert.rejects(installPresetCompatibility(buildCompatibilityPlan(source), fake, {
    checkpoint: async receipt => {
      checkpoint = structuredClone(receipt);
      if (Object.keys(receipt.regexScripts).length === 5) throw new Error('simulated interruption');
    },
  }), /interruption/);
  const resumed = await installPresetCompatibility(buildCompatibilityPlan(source), fake, { resume: checkpoint });
  assert.equal(resumed.complete, true);
  assert.equal(presetImports, 1);
  assert.equal(fake.importedRegex.length, 25);
  const again = await installPresetCompatibility(buildCompatibilityPlan(source), fake, { resume: resumed.receipt });
  assert.equal(again.complete, true);
  assert.equal(presetImports, 1);
  assert.equal(fake.importedRegex.length, 25);
  await assert.rejects(installPresetCompatibility(buildCompatibilityPlan(source), fake, {
    resume: { ...resumed.receipt, sourceHash: 'wrong' },
  }), /receipt/i);
});

test("wrapping fields are default-equivalent when the native readback omits them", () => {
  const plan = buildCompatibilityPlan(source);
  const fake = createFakeEngine(source);
  for (const section of fake.fullPreset.sections) {
    delete section.wrapInXml;
    delete section.xmlTagName;
  }
  assert.equal(verifyInstalledPreset(plan, fake.fullPreset).complete, true);
  fake.fullPreset.sections[0].wrapInXml = "true";
  assert.equal(verifyInstalledPreset(plan, fake.fullPreset).complete, false);
});

test("translated regexes retain the full legacy record alongside Engine input", () => {
  const legacy = source.extensions.regex_scripts;
  assert.equal(legacy.length, 25);
  for (const [index, script] of legacy.entries()) {
    const converted = convertLegacyRegexScript(script, { order: index, targetPresetId: "preset-x" });
    assert.deepEqual(converted.preservedLegacy, script);
    assert.equal(converted.input.targetPromptPresetIds[0], "preset-x");
    assert.equal(typeof converted.input.flags, "string");
    assert.ok(converted.input.placement.every((value: string) => value === "ai_output" || value === "user_input"));
    assert.equal(converted.input.enabled, !script.disabled);
    assert.equal(converted.preservedLegacy.runOnEdit, false);
    assert.equal(converted.preservedLegacy.substituteRegex, 0);
  }
  const substituteBlocked = convertLegacyRegexScript({ ...legacy[0], substituteRegex: 1 }, { order: 0 });
  assert.ok(substituteBlocked.issues.some((issue: any) => issue.field === "substituteRegex" && issue.severity === "blocking"));
  const depthPair = convertLegacyRegexScript({ ...legacy[0], minDepth: 5, maxDepth: 2 }, { order: 0 });
  assert.ok(depthPair.issues.some((issue: any) => issue.field === "maxDepth" && issue.severity === "blocking"));
  const both = convertLegacyRegexScript({ ...legacy[0], markdownOnly: false, promptOnly: false }, { order: 0 });
  assert.equal(both.input.applyMode, "both");
  assert.equal(both.input.promptOnly, false);
});

test("field ledger and runtime observation document the recorded Engine round-trip", () => {
  assert.equal(fieldMap.runtimeObservation.status, "recorded");
  assert.equal(fieldMap.runtimeObservation.mode, "in-process-engine-import");
  assert.equal(fieldMap.runtimeObservation.nativePresetId, "pLwe7NpVlr3mtoYe34-jD");
  assert.equal(fieldMap.runtimeObservation.pins.engine, "9bbee87d1a44c33f704977bd8c25aafbec9b85aa");
  assert.equal(fieldMap.runtimeObservation.pins.agents, "ee1a4a01d1091a9f5e4086c58f608e401aa1d879");
  assert.equal(fieldMap.runtimeObservation.verification.unaccounted, 0);
  assert.equal(fieldMap.runtimeObservation.verification.regexScoped, "25/25");
  assert.equal(fieldMap.fields.section.wrapInXml.disposition, "default-equivalent");
  assert.equal(fieldMap.fields.legacyRegex.runOnEdit.disposition, "sidecar");
  assert.match(fieldMap.artifactSpecificEquivalences.sectionWrapping, /69/);
});

test("disabled agent marker sections stay disabled through verification", () => {
  const plan = buildCompatibilityPlan(source);
  const fake = createFakeEngine(source);
  const disabledIds = source.data.sections
    .filter((row: any) => {
      const marker = typeof row.markerConfig === "string" ? JSON.parse(row.markerConfig) : row.markerConfig;
      return marker?.type === "agent_data" && row.enabled === "false";
    })
    .map((row: any) => row.id);
  assert.equal(disabledIds.length, 7);
  const verification = verifyInstalledPreset(plan, fake.fullPreset);
  assert.equal(verification.complete, true);
  for (const sourceId of disabledIds) {
    const nativeId = verification.idMap.sections[sourceId];
    const observed = fake.fullPreset.sections.find((row: any) => row.id === nativeId);
    assert.equal(observed.enabled, "false");
  }
});
