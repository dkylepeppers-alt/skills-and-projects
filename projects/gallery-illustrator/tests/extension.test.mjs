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
  findAgents,
  isGalleryIllustrator,
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
  // Avatars: the id is the owner's own id.
  assert.equal(poolId("ca", "char1"), "ca:char1");
  assert.equal(poolId("pa", "p1"), "pa:p1");
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
  // The Engine renames every imported Agent's type; the real install has this shape, not the bare type.
  const imported = { type: "custom-import-gallery-illustrator-3a5911d3-66bd-4ff8-b938-658b5c7f78c8", id: "i" };
  assert.equal(findAgent([{ type: "illustrator" }, imported]).id, "i");
  assert.deepEqual(
    findAgents([imported, { type: "custom-import-other-agent-1", id: "x" }, { type: "gallery-illustrator", id: "g" }]).map(
      (agent) => agent.id,
    ),
    ["i", "g"],
  );
  assert.equal(isGalleryIllustrator({ type: "custom-import-gallery-illustrator-extra-1" }), true);
  assert.equal(isGalleryIllustrator({ type: "my-gallery-illustrator" }), false);
  // A UI import renames twice (client, then server), and every export + re-import adds another prefix.
  assert.equal(
    isGalleryIllustrator({ type: "custom-import-custom-import-gallery-illustrator-3a5911d3-66bd-4ff8-b938-658b5c7f78c8-0b1d" }),
    true,
  );
  assert.equal(isGalleryIllustrator({ type: "custom-import-custom-import-custom-import-gallery-illustrator-a-b-c" }), true);
  assert.equal(isGalleryIllustrator({ type: "custom-import-gallery-illustrator2-1" }), false);
  assert.equal(isGalleryIllustrator({ type: "custom-import-my-gallery-illustrator-1" }), false);
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

test("sync retains late cast faces and recovers legacy gallery owners from saved URLs", () => {
  const tags = Object.fromEntries(Array.from({ length: 121 }, (_, i) => [
    "gg:style" + i, { role: "style", owner: "A" }
  ]));
  Object.assign(tags, {
    "cg:f": { role: "face", owner: "Zoe", url: "/api/characters/zz/gallery/file/f.png" },
    "pg:p": { role: "face", owner: "Quinn", url: "/api/characters/personas/pp/gallery/file/f.png" },
    "ch:c": { role: "location", url: "/api/gallery/file/chat77/harbor.png" },
  });
  const lines = buildPoolLines(normalizeTags(tags));
  assert.equal(lines.length, 124);
  assert.ok(lines.includes("cg:f | Zoe | face | - | zz"));
  assert.ok(lines.includes("pg:p | Quinn | face | - | pp"));
  assert.ok(lines.includes("ch:c | - | location | - | chat77"));
});

test("avatars are tagged by owner id and carry that id as their source", () => {
  const lines = buildPoolLines(
    normalizeTags({
      "ca:char1": { role: "face", owner: "Mara", url: "/api/avatars/file/character-char1.png" },
      "pa:p1": { role: "face", owner: "Quinn", url: "/api/avatars/file/persona-p1.png" },
    }),
  );
  assert.deepEqual(lines, ["ca:char1 | Mara | face | - | char1", "pa:p1 | Quinn | face | - | p1"]);
});
