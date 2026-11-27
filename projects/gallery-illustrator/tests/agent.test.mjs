// Offline structural checks for the Gallery Illustrator custom Agent.
// The Engine import path is checked separately by check-engine.mts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { agentFiles, assemble, importConfig } from "../build.mjs";
import { POOL_END, POOL_START, replacePoolBlock } from "../src/extension/pool-core.js";

// Engine staging df60575 packages/shared/src/types/agent.ts (v2.5.2 has the first nine).
const CONTEXT_SOURCE_IDS = [
  "chatHistory", "characters", "persona", "activatedLorebookEntries", "chatSummary",
  "authorNotes", "trackerData", "recalledMemories", "previousOutput",
  "charactersPublicFace", "personaPublicFace",
];
const ENGINE_MACROS = new Set(["user", "char"]);

const assembled = assemble();
const config = importConfig(assembled);
const templates = [{ id: "default", promptTemplate: config.promptTemplate }, ...config.settings.promptTemplates];

test("custom image agent shape", () => {
  assert.equal(config.type, "gallery-illustrator");
  assert.notEqual(config.type, "illustrator", "must not collide with the built-in Illustrator");
  assert.equal(config.phase, "post_processing");
  assert.equal(config.resultType, "image_prompt");
  assert.equal(config.settings.resultType, "image_prompt");
  assert.deepEqual(config.settings.customCapabilities, { trigger_image_generation: true }, "image ability only");
  assert.equal(config.settings.enabledTools, undefined, "imports strip tools anyway");
  assert.equal(config.settings.jsonContextOutput, undefined, "the image_prompt JSON is the whole output");
  assert.deepEqual(Object.keys(config.settings.contextSources).sort(), [...CONTEXT_SOURCE_IDS].sort());
  for (const source of ["chatHistory", "characters", "persona", "trackerData", "previousOutput"]) {
    assert.equal(config.settings.contextSources[source], true, `${source} on`);
  }
  assert.ok(config.settings.runInterval >= 1, "runs on a cadence like the Illustrator");
  assert.equal(config.settings.useAvatarReferences, true, "avatar references remain the fallback without picks");
  assert.equal(config.settings.includeCharacterAppearance, false, "references carry identity; prose would conflict");
  assert.equal(config.folderName, undefined);
});

test("every prompt option shares the reference rules and output contract", () => {
  const contract = config.promptTemplate.slice(config.promptTemplate.indexOf("## 2. Choose references"));
  assert.ok(contract.length > 2000);
  for (const { id, promptTemplate } of templates) {
    assert.ok(!promptTemplate.includes("%%STYLE%%"), `${id}: style slot unfilled`);
    assert.ok(promptTemplate.endsWith(contract), `${id}: sections 2-4 differ from the default`);
    assert.match(promptTemplate, /Respond ONLY with valid JSON/, id);
    assert.match(promptTemplate, /\{"shouldGenerate":false,"reason":"<a few words>"\}/, `${id}: no-op value`);
    assert.match(promptTemplate, /"references": \[/, `${id}: references field`);
    assert.match(promptTemplate, /"aspectRatio": "portrait"/, `${id}: aspect field the Engine reads`);
    assert.match(promptTemplate, /Use only ids that appear in the pool, copied exactly/, id);
    assert.match(promptTemplate, /Never write a character's name in "prompt"/, `${id}: names never reach the image model`);
    assert.match(promptTemplate, /person A, person B/, `${id}: matches the Engine's order line`);
  }
  assert.deepEqual(config.settings.promptTemplates.map((t) => t.id), ["selfie", "comic", "background", "custom"]);
  assert.match(config.settings.promptTemplates.at(-1).promptTemplate, /\[YOUR INSTRUCTIONS/);
});

test("each prompt has exactly one pool marker pair the extension can rewrite", () => {
  for (const { id, promptTemplate } of templates) {
    assert.equal(promptTemplate.split(POOL_START).length, 2, `${id}: one start marker`);
    assert.equal(promptTemplate.split(POOL_END).length, 2, `${id}: one end marker`);
    const rewritten = replacePoolBlock(promptTemplate, ["cg:abc | Mara | face | close-up"]);
    assert.ok(rewritten?.includes(`${POOL_START}\ncg:abc | Mara | face | close-up\n${POOL_END}`), id);
    assert.equal(rewritten.replace(/<!-- reference-pool:start -->[\s\S]*<!-- reference-pool:end -->/, ""),
      promptTemplate.replace(/<!-- reference-pool:start -->[\s\S]*<!-- reference-pool:end -->/, ""), `${id}: rest kept`);
  }
});

test("prompts use only Engine macros and inline build values", () => {
  for (const { id, promptTemplate } of templates) {
    assert.ok(!/%%[A-Za-z]+%%/.test(promptTemplate), `${id}: build value unfilled`);
    for (const [, key] of promptTemplate.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)) {
      assert.ok(ENGINE_MACROS.has(key), `${id}: {{${key}}} is not an Engine macro`);
    }
    assert.match(promptTemplate, /At most 10 references in total/, `${id}: reference cap inlined`);
    assert.match(promptTemplate, /between 60 and 180 words/, `${id}: prompt length inlined`);
  }
});

test("the documented example output is valid JSON once placeholders are filled", () => {
  const start = config.promptTemplate.indexOf('{\n  "shouldGenerate": true');
  const end = config.promptTemplate.indexOf("\n}\n", start) + 2;
  const example = JSON.parse(config.promptTemplate.slice(start, end));
  assert.equal(example.shouldGenerate, true);
  assert.ok(Array.isArray(example.characters) && Array.isArray(example.references));
  assert.deepEqual(example.references.map((r) => r.role), ["face", "body", "location"], "faces first");
});

test("prompt size stays reasonable for an every-few-turns agent", () => {
  // Without the pool block. A synced pool adds roughly 15-25 tokens per tagged picture.
  for (const { id, promptTemplate } of templates) assert.ok(promptTemplate.length < 7000, `${id}: ${promptTemplate.length}`);
});

test("both import shapes carry the same config", () => {
  const files = agentFiles(assembled);
  const single = JSON.parse(files["gallery-illustrator.marinara-agent.json"]);
  assert.equal(single.kind, "marinara.agent");
  assert.deepEqual(single.config, config);
  const base = "Gallery-Illustrator/Agents/gallery-illustrator";
  const manifest = JSON.parse(files[`${base}/manifest.json`]);
  assert.equal(manifest.config.promptTemplatePath, "prompt.md");
  assert.equal(files[`${base}/prompt.md`], config.promptTemplate);
  assert.deepEqual(JSON.parse(files[`${base}/settings.json`]), config.settings);
  const envelope = JSON.parse(files["Gallery-Illustrator/marinara-agents.json"]);
  assert.equal(envelope.kind, "marinara.agent-folder");
  assert.ok(Object.hasOwn(files, envelope.agents[0].path));
});
