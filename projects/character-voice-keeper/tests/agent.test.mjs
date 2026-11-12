// Offline structural checks. The Engine import path is checked separately by check-engine.mts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { assemble, importConfig, outputFiles } from "../build.mjs";

// Pinned from Engine v2.5.2 (fc0333c) packages/shared/src/types/agent.ts.
const CONTEXT_SOURCE_IDS = [
  "chatHistory", "characters", "persona", "activatedLorebookEntries", "chatSummary",
  "authorNotes", "trackerData", "recalledMemories", "previousOutput",
];
// Engine macros this prompt is allowed to use; every other {{key}} must be an agent setting.
const ENGINE_MACROS = new Set(["user", "char"]);

const assembled = assemble();
const config = importConfig(assembled);
const templates = [
  { id: "default", promptTemplate: config.promptTemplate },
  ...config.settings.promptTemplates,
];

test("custom agent shape for Engine v2.5.2 import", () => {
  assert.equal(config.type, "character-voice-keeper");
  assert.equal(config.phase, "pre_generation");
  assert.equal(config.resultType, "context_injection");
  assert.equal(config.settings.resultType, "context_injection");
  assert.equal(config.settings.jsonContextOutput, true);
  assert.equal(config.settings.customCapabilities, undefined, "needs no capability");
  assert.equal(config.settings.enabledTools, undefined, "imports strip tools anyway");
  assert.deepEqual(Object.keys(config.settings.contextSources).sort(), [...CONTEXT_SOURCE_IDS].sort());
  assert.equal(config.settings.contextSources.previousOutput, true, "profiles live in previous output");
  assert.equal(config.settings.contextSources.chatHistory, true, "voices are read from dialogue");
  assert.equal(config.settings.contextSources.characters, true, "voices start from the cards");
  assert.ok(config.settings.contextSize >= 1 && config.settings.contextSize <= 200);
  assert.ok(config.settings.maxTokens >= 128 && config.settings.maxTokens <= 32768);
  assert.equal(config.folderName, undefined, "build-only folder name never reaches the import config");
});

test("every prompt option shares one output contract", () => {
  const contract = config.promptTemplate.slice(config.promptTemplate.indexOf("## 5. Private state"));
  assert.ok(contract.length > 500);
  for (const { id, promptTemplate } of templates) {
    assert.ok(!promptTemplate.includes("%%STYLE%%"), `${id}: style slot left unfilled`);
    assert.ok(promptTemplate.endsWith(contract), `${id}: output contract differs from the default`);
    assert.match(promptTemplate, /Respond ONLY with valid JSON\./, id);
    assert.match(promptTemplate, /return exactly: \{"text":""\}/, `${id}: no-op value`);
    assert.match(promptTemplate, /include the COMPLETE characters list/, `${id}: replacement semantics`);
    assert.match(promptTemplate, /Copy each "name" EXACTLY/, `${id}: exact-name matching`);
  }
  assert.deepEqual(config.settings.promptTemplates.map((t) => t.id), ["strict", "lean", "custom"]);
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
    assert.match(promptTemplate, /At most 5, the most important first/, `${id}: speaker cap inlined`);
    assert.match(promptTemplate, /under 220 words/, `${id}: note length inlined`);
  }
});

test("the agent never voices the user's character", () => {
  for (const { id, promptTemplate } of templates) {
    assert.match(promptTemplate, /Never profile \{\{user\}\}'s voice/, id);
    assert.match(promptTemplate, /Do not write \{\{user\}\}'s words, actions or feelings/, id);
  }
});

test("state example in the prompt is valid JSON with the documented fields", () => {
  const start = config.promptTemplate.indexOf("{\n  \"characters\"");
  const end = config.promptTemplate.indexOf("\n}\n", start) + 2;
  const example = JSON.parse(config.promptTemplate.slice(start, end));
  const [profile] = example.characters;
  for (const field of ["name", "kind", "present", "confidence", "register", "rhythm", "vocabulary", "address",
    "humor", "emotion", "dialect", "signature", "guards", "contrast", "arc", "drift"]) {
    assert.ok(Object.hasOwn(profile, field), `missing ${field}`);
  }
  assert.ok(Array.isArray(profile.signature) && Array.isArray(profile.drift));
  assert.equal(typeof profile.address, "object");
});

test("prompt stays within the size of shipped agents", () => {
  // Shipped templates run about 900-3,700 characters; stateful custom agents run longer.
  // Keep every option under 8,000 so the agent stays cheap enough to run before every reply.
  for (const { id, promptTemplate } of templates) assert.ok(promptTemplate.length < 8000, `${id}: ${promptTemplate.length}`);
});

test("both import shapes carry the same config", () => {
  const files = outputFiles(assembled);
  const single = JSON.parse(files["character-voice-keeper.marinara-agent.json"]);
  assert.equal(single.kind, "marinara.agent");
  assert.equal(single.version, 1);
  assert.deepEqual(single.config, config);
  const base = "Character-Voice-Keeper/Agents/character-voice-keeper";
  const manifest = JSON.parse(files[`${base}/manifest.json`]);
  assert.equal(manifest.config.promptTemplatePath, "prompt.md");
  assert.equal(manifest.config.settingsPath, "settings.json");
  assert.equal(files[`${base}/prompt.md`], config.promptTemplate);
  assert.deepEqual(JSON.parse(files[`${base}/settings.json`]), config.settings);
  const envelope = JSON.parse(files["Character-Voice-Keeper/marinara-agents.json"]);
  assert.equal(envelope.kind, "marinara.agent-folder");
  assert.equal(envelope.agents[0].path, `${base}/manifest.json`);
  assert.ok(Object.hasOwn(files, envelope.agents[0].path), "envelope entry path names a shipped file");
});
