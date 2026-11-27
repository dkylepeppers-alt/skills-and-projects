// Offline checks for the Gallery Reference Pool extension: its pure logic, the built script, the ZIP.
import assert from "node:assert/strict";
import { test } from "node:test";
import { inflateRawSync } from "node:zlib";
import { extensionFiles, extensionScript, outputFiles, storedZip } from "../build.mjs";
import {
  EMPTY_POOL_TEXT,
  POOL_END,
  POOL_START,
  applyPoolToAgent,
  buildPoolLines,
  characterName,
  cleanText,
  findAgent,
  normalizeTag,
  normalizeTags,
  pageItems,
  poolId,
  poolWarnings,
  replacePoolBlock,
} from "../src/extension/pool-core.js";

const prompt = (body = "(empty)") => `Intro\n${POOL_START}\n${body}\n${POOL_END}\nRules after.`;

test("ids, tags and text are validated", () => {
  assert.equal(poolId("cg", "abc_123-x"), "cg:abc_123-x");
  assert.equal(poolId("cg", "../etc"), null);
  assert.equal(poolId("zz", "abc"), null);
  assert.equal(cleanText(" a |b\n<!-- c -->  ", 40), "a b c");
  assert.equal(cleanText("x".repeat(100), 10).length, 10);
  assert.equal(normalizeTag("cg:a", { role: "face" })?.role, "face");
  assert.equal(normalizeTag("cg:a", { role: "hat" }), null, "unknown role removes the tag");
  assert.equal(normalizeTag("bad id", { role: "face" }), null);
  assert.equal(normalizeTag("cg:a", { role: "face", url: "https://evil.example/x.png" }).url, "", "only app URLs");
  assert.equal(normalizeTag("cg:a", { role: "face", url: "/api/characters/c/gallery/file/a.png" }).url,
    "/api/characters/c/gallery/file/a.png");
  assert.deepEqual(Object.keys(normalizeTags({ "cg:a": { role: "face" }, "xx:b": { role: "face" }, "cg:c": null })), ["cg:a"]);
});

test("pool lines group by owner, faces first, skip disabled", () => {
  const tags = normalizeTags({
    "cg:m2": { role: "body", owner: "Mara", caption: "rain coat" },
    "gg:room": { role: "location", owner: "Harbor", caption: "dusk" },
    "cg:m1": { role: "face", owner: "Mara", caption: "close-up" },
    "pg:q1": { role: "face", owner: "Quinn" },
    "cg:off": { role: "outfit", owner: "Mara", enabled: false },
  });
  assert.deepEqual(buildPoolLines(tags), [
    "gg:room | Harbor | location | dusk",
    "cg:m1 | Mara | face | close-up",
    "cg:m2 | Mara | body | rain coat",
    "pg:q1 | Quinn | face | -",
  ]);
});

test("the marker block is replaced and nothing else changes", () => {
  assert.equal(replacePoolBlock(prompt(), ["a", "b"]), `Intro\n${POOL_START}\na\nb\n${POOL_END}\nRules after.`);
  assert.equal(replacePoolBlock(prompt("old"), []), `Intro\n${POOL_START}\n${EMPTY_POOL_TEXT}\n${POOL_END}\nRules after.`);
  assert.equal(replacePoolBlock("no markers", ["a"]), null);
  assert.equal(replacePoolBlock(`${POOL_END}${POOL_START}`, ["a"]), null, "reversed markers");
  assert.equal(replacePoolBlock(prompt() + POOL_START, ["a"]), null, "duplicate markers");
});

test("applyPoolToAgent updates the default prompt and every option, keeping other settings", () => {
  const agent = {
    id: "a1",
    type: "gallery-illustrator",
    promptTemplate: prompt(),
    settings: JSON.stringify({
      runInterval: 3,
      customCapabilities: { trigger_image_generation: true },
      promptTemplates: [
        { id: "selfie", name: "Selfie", promptTemplate: prompt() },
        { id: "mine", name: "Mine", promptTemplate: "user prompt without markers" },
      ],
    }),
  };
  const next = applyPoolToAgent(agent, ["cg:x | Mara | face | -"]);
  assert.equal(next.updated, 2);
  assert.equal(next.skipped, 1);
  assert.match(next.promptTemplate, /cg:x \| Mara/);
  assert.match(next.settings.promptTemplates[0].promptTemplate, /cg:x \| Mara/);
  assert.equal(next.settings.promptTemplates[1].promptTemplate, "user prompt without markers");
  assert.equal(next.settings.runInterval, 3);
  assert.deepEqual(next.settings.customCapabilities, { trigger_image_generation: true });
  assert.equal(applyPoolToAgent({ promptTemplate: "x", settings: {} }, []), null);
});

test("warnings name people without a face picture", () => {
  assert.deepEqual(poolWarnings({}), ["The pool is empty: tag at least one face picture."]);
  const tags = normalizeTags({
    "cg:m2": { role: "body", owner: "Mara" },
    "pg:q1": { role: "face", owner: "Quinn" },
    "gg:room": { role: "location", owner: "Harbor" },
  });
  assert.deepEqual(poolWarnings(tags), ["Mara has no face picture."]);
});

test("library helpers read pages, rows and the agent", () => {
  assert.deepEqual(pageItems({ items: [1] }), [1]);
  assert.deepEqual(pageItems([2]), [2]);
  assert.deepEqual(pageItems(null), []);
  assert.equal(characterName({ data: JSON.stringify({ name: "Mara | x" }) }), "Mara x");
  assert.equal(characterName({ name: "Quinn" }), "Quinn");
  assert.equal(findAgent([{ type: "illustrator" }, { type: "gallery-illustrator", id: "g" }]).id, "g");
  assert.equal(findAgent({ items: [] }), null);
});

test("the built script is one body for the Engine's full-page wrapper", () => {
  const script = extensionScript();
  assert.doesNotMatch(script, /^\s*(export|import)\b/m);
  // Same shape as fullPageExtensionSource(): the body runs inside `async (marinara) => { ... }`.
  assert.doesNotThrow(() => new Function(`return async (marinara) => {\n"use strict";\n${script}\n};`));
  assert.match(script, /marinara\.onCleanup\(/);
  assert.match(script, /"x-marinara-csrf": "1"/, "writes carry the Engine's CSRF header");
  assert.doesNotMatch(script, /[^.]\bfetch\(/, "network goes through marinara.fetch");
  const manifest = JSON.parse(extensionFiles()["Gallery-Reference-Pool/manifest.json"]);
  assert.equal(manifest.kind, "marinara.personal-extension");
  assert.deepEqual(manifest.config.capabilities, ["full_page_access"]);
  assert.equal(manifest.config.runtime, "client");
  assert.equal(manifest.config.enabled, false);
});

test("the ZIP is valid, reproducible and mirrors the folder", () => {
  const a = outputFiles()["gallery-reference-pool.personal-extension.zip"];
  const b = outputFiles()["gallery-reference-pool.personal-extension.zip"];
  assert.ok(a.equals(b), "same bytes on every build");
  // Walk the local headers.
  const names = [];
  let offset = 0;
  while (a.readUInt32LE(offset) === 0x04034b50) {
    const method = a.readUInt16LE(offset + 8);
    const size = a.readUInt32LE(offset + 18);
    const nameLength = a.readUInt16LE(offset + 26);
    const name = a.toString("utf8", offset + 30, offset + 30 + nameLength);
    const data = a.subarray(offset + 30 + nameLength, offset + 30 + nameLength + size);
    names.push(name);
    const text = (method === 8 ? inflateRawSync(data) : data).toString("utf8");
    const folderPath = name.replace("Personal Extensions/Gallery Reference Pool/", "Gallery-Reference-Pool/");
    assert.equal(text, extensionFiles()[folderPath], name);
    offset += 30 + nameLength + size;
  }
  assert.deepEqual(names, [
    "Personal Extensions/Gallery Reference Pool/manifest.json",
    "Personal Extensions/Gallery Reference Pool/extension.js",
    "Personal Extensions/Gallery Reference Pool/extension.css",
  ]);
  assert.equal(storedZip([]).length, 22, "empty archive is just the end record");
});
