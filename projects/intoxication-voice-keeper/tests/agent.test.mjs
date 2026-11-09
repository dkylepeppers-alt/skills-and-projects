// Offline structural checks. The Engine import path is checked separately by check-engine.mts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { assemble, outputFiles } from "../build.mjs";

// Pinned from Engine v2.5.2 (fc0333c) packages/shared/src/types/agent.ts.
const CONTEXT_SOURCE_IDS = [
  "chatHistory", "characters", "persona", "activatedLorebookEntries", "chatSummary",
  "authorNotes", "trackerData", "recalledMemories", "previousOutput",
];
// Engine macros this prompt is allowed to use; every other {{key}} must be an agent setting.
const ENGINE_MACROS = new Set(["user", "char"]);

const config = assemble();
const templates = [
  { id: "default", promptTemplate: config.promptTemplate },
  ...config.settings.promptTemplates,
];

test("custom agent shape for Engine v2.5.2 import", () => {
  assert.equal(config.phase, "pre_generation");
  assert.equal(config.resultType, "context_injection");
  assert.equal(config.settings.resultType, "context_injection");
  assert.equal(config.settings.jsonContextOutput, true);
  assert.equal(config.settings.customCapabilities, undefined, "needs no capability");
  assert.equal(config.settings.enabledTools, undefined, "imports strip tools anyway");
  assert.deepEqual(Object.keys(config.settings.contextSources).sort(), [...CONTEXT_SOURCE_IDS].sort());
  assert.equal(config.settings.contextSources.previousOutput, true, "state lives in previous output");
  assert.ok(config.settings.contextSize >= 1 && config.settings.contextSize <= 200);
  assert.ok(config.settings.maxTokens >= 128 && config.settings.maxTokens <= 32768);
});

test("every prompt option shares one output contract", () => {
  const contract = config.promptTemplate.slice(config.promptTemplate.indexOf("## 4. Private state"));
  assert.ok(contract.length > 500);
  for (const { id, promptTemplate } of templates) {
    assert.ok(!promptTemplate.includes("%%STYLE%%"), `${id}: style slot left unfilled`);
    assert.ok(promptTemplate.endsWith(contract), `${id}: output contract differs from the default`);
    assert.match(promptTemplate, /Respond ONLY with valid JSON\./, id);
    assert.match(promptTemplate, /return exactly: \{"text":""\}/, `${id}: no-op value`);
  }
  assert.deepEqual(config.settings.promptTemplates.map((t) => t.id), ["heightened", "lean", "custom"]);
  assert.match(config.settings.promptTemplates.at(-1).promptTemplate, /\[YOUR INSTRUCTIONS/);
});

test("prompts use only Engine macros, never settings-backed placeholders", () => {
  // The 2.5.2 agent editor rebuilds settings on save and drops unknown keys, so a
  // settings-backed {{placeholder}} would go blank after any edit. Values are inlined at build.
  for (const { id, promptTemplate } of templates) {
    assert.ok(!/%%[A-Za-z]+%%/.test(promptTemplate), `${id}: build-time value left unfilled`);
    for (const [, key] of promptTemplate.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)) {
      assert.ok(ENGINE_MACROS.has(key), `${id}: {{${key}}} is not an Engine macro`);
    }
    assert.match(promptTemplate, /only at level 3 or higher/, `${id}: slur level inlined`);
  }
});

test("state example in the prompt is valid JSON", () => {
  const start = config.promptTemplate.indexOf("{\n  \"storyTime\"");
  const end = config.promptTemplate.indexOf("\n}\n", start) + 2;
  const example = JSON.parse(config.promptTemplate.slice(start, end));
  assert.ok(Array.isArray(example.characters));
  assert.equal(typeof example.characters[0].level, "number");
});

test("both import shapes carry the same config", () => {
  const files = outputFiles(config);
  const single = JSON.parse(files["intoxication-voice-keeper.marinara-agent.json"]);
  assert.equal(single.kind, "marinara.agent");
  assert.equal(single.version, 1);
  assert.deepEqual(single.config, config);
  const base = "Intoxication-Voice-Keeper/Agents/intoxication-voice-keeper";
  const manifest = JSON.parse(files[`${base}/manifest.json`]);
  assert.equal(manifest.config.promptTemplatePath, "prompt.md");
  assert.equal(files[`${base}/prompt.md`], config.promptTemplate);
  assert.deepEqual(JSON.parse(files[`${base}/settings.json`]), config.settings);
  const envelope = JSON.parse(files["Intoxication-Voice-Keeper/marinara-agents.json"]);
  assert.equal(envelope.kind, "marinara.agent-folder");
  assert.equal(envelope.agents[0].path, `${base}/manifest.json`);
  assert.ok(Object.hasOwn(files, envelope.agents[0].path), "envelope entry path names a shipped file");
});
