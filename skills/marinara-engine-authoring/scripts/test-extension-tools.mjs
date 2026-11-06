/** Tests for lint-extension.mjs and marinara-extension-stub.mjs. Needs only Node: `node test-extension-tools.mjs`. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lintExtensionSource } from "./lint-extension.mjs";
import { createMarinaraStub, runExtension } from "./marinara-extension-stub.mjs";

const scripts = dirname(fileURLToPath(import.meta.url));
const template = (path) => readFileSync(resolve(scripts, "../templates", path), "utf8");
let count = 0;
let failures = 0;
async function check(name, test) {
  count += 1;
  try { await test(); console.log(`ok - ${name}`); }
  catch (error) { failures += 1; console.error(`FAIL - ${name}: ${error.message}`); }
}
const errors = (source, options) => lintExtensionSource(source, options).filter((f) => f.level === "error").map((f) => f.message);
const warnings = (source, options) => lintExtensionSource(source, options).filter((f) => f.level === "warning").map((f) => f.message);

// ── lint ──
await check("lint: both extension templates are clean", () => {
  assert.deepEqual(lintExtensionSource(template("extension-browser/extension.js"), { runtime: "client" }), []);
  assert.deepEqual(lintExtensionSource(template("extension-server/server-extension.js"), { runtime: "server" }), []);
});
await check("lint: sandbox-forbidden globals are errors in browser code", () => {
  const found = errors("document.title = 'x';\nconst r = await fetch('/api');\nlocalStorage.setItem('a', 1);");
  assert.equal(found.length, 3, found.join("\n"));
});
await check("lint: text inside strings and comments is ignored", () => {
  assert.deepEqual(errors("// document.write\nmarinara.log.info('fetch the document from window');\nconst s = `window ${1}`;"), []);
});
await check("lint: undocumented marinara APIs are errors", () => {
  const found = errors("marinara.chat.send('hi'); marinara.storage.set({});");
  assert.ok(found.some((m) => /marinara\.chat/.test(m)) && found.some((m) => /marinara\.storage\.set/.test(m)), found.join("\n"));
});
await check("lint: server code cannot use browser APIs, require or process", () => {
  const found = errors("const fs = require('fs'); marinara.ui.showWindow({}); process.exit(0);", { runtime: "server" });
  assert.equal(found.length, 3, found.join("\n"));
});
await check("lint: full_page_access allows page globals but prefers marinara.fetch", () => {
  const options = { capabilities: ["full_page_access"] };
  assert.deepEqual(errors("document.body.dataset.x = '1'; fetch('/api/x');", options), []);
  assert.ok(warnings("fetch('/api/x');", options).some((m) => /marinara\.fetch/.test(m)));
});
await check("lint: capability mismatches warn both ways", () => {
  const reads = "marinara.context.subscribe(({ characters }) => marinara.log.info(characters)); marinara.onCleanup(() => {});";
  assert.ok(warnings(reads).some((m) => /read_active_characters capability/.test(m)));
  assert.ok(warnings("marinara.log.info(1);", { capabilities: ["read_active_persona"] }).some((m) => /never reads/.test(m)));
});
await check("lint: registrations without onCleanup and bare timers warn", () => {
  const found = warnings("marinara.ui.registerContribution({ id: 'a', kind: 'button', label: 'A' }); setTimeout(() => {}, 5);");
  assert.ok(found.some((m) => /onCleanup/.test(m)) && found.some((m) => /marinara\.setTimeout/.test(m)), found.join("\n"));
});
await check("lint: contribution ids, kinds and command rules", () => {
  const found = errors([
    "marinara.ui.registerContribution({ id: 'has space', kind: 'button', label: 'x' });",
    "marinara.ui.registerContribution({ id: 'w', kind: 'widget', label: 'x' });",
    "marinara.ui.registerContribution({ id: 'c', kind: 'command', label: 'x', targetContributionId: 'p', onActivate: () => {} });",
    "marinara.ui.registerContribution({ id: 'd', kind: 'command', label: 'x' });",
    "marinara.ui.registerContribution({ id: 'p', kind: 'panel', label: 'x', elements: [{ kind: 'text', id: 'free text ok', text: 'x' }] });",
  ].join("\n"));
  assert.equal(found.length, 4, found.join("\n"));
});
await check("lint: more than four dice formats is an error", () => {
  const one = "marinara.dice.registerFormat({ id: 'f', parse: () => null, read: () => ({ total: 0 }) });";
  assert.ok(errors(Array(5).fill(one).join("\n")).some((m) => /at most 4/.test(m)));
});

// ── stub ──
await check("stub: browser template keeps a note per chat and cleans up", async () => {
  const stub = createMarinaraStub();
  await runExtension(template("extension-browser/extension.js"), stub);
  assert.deepEqual([...stub.contributions.keys()].sort(), ["open-scene-notes", "scene-notes"]);
  stub.setContext({ chatId: "chat-1", characterIds: ["char-a"] });
  await new Promise((done) => setImmediate(done));
  await stub.event("scene-notes", { elementId: "save", values: { note: "Ada owes the ferryman" } });
  assert.equal(stub.storage.notesByChat["chat-1"], "Ada owes the ferryman");
  assert.ok(stub.contribution("scene-notes").elements.some((e) => e.text === "Saved."));
  stub.setContext({ chatId: "chat-2" });
  await new Promise((done) => setImmediate(done));
  await stub.activate("open-scene-notes"); // command → panel onActivate
  assert.equal(stub.contribution("scene-notes").elements.find((e) => e.id === "note").value, "");
  await stub.stop();
  assert.equal(stub.contributions.size, 0);
});
await check("stub: server template counts starts and logs on its managed timer", async () => {
  const stub = createMarinaraStub({ runtime: "server", storage: { starts: 2 } });
  await runExtension(template("extension-server/server-extension.js"), stub);
  assert.equal(stub.storage.starts, 3);
  stub.advanceTimers(2 * 60 * 60 * 1000);
  assert.equal(stub.logs.filter((l) => /up \d+ hour/.test(String(l.args[0]))).length, 2);
  await stub.stop();
  assert.equal(stub.pendingTimers, 0);
});
await check("stub: context is filtered by approved capabilities", () => {
  const context = { chatId: "c", characters: [{ id: "a", name: "Ada", creatorNotes: "secret" }], persona: { id: "p", name: "Me" } };
  const none = createMarinaraStub({ context }).marinara.context.get();
  assert.deepEqual([none.characters, none.persona, none.personaId, none.characterId], [[], null, null, "a"]);
  const both = createMarinaraStub({ context, capabilities: ["read_active_characters", "read_active_persona"] }).marinara.context.get();
  assert.deepEqual(both.characters, [{ id: "a", name: "Ada" }]);
  assert.equal(both.persona.name, "Me");
});
await check("stub: the sandbox has no DOM or network globals", async () => {
  const stub = createMarinaraStub();
  await assert.rejects(runExtension("document.title = 'x';", stub), /document is not defined/);
  await assert.rejects(runExtension("await fetch('/');", stub), /fetch is not defined/);
});
await check("stub: invalid contributions, updates and storage are rejected", async () => {
  const { marinara } = createMarinaraStub();
  assert.throws(() => marinara.ui.registerContribution({ id: "bad id", kind: "button", label: "x" }), /letters, numbers/);
  assert.throws(() => marinara.ui.registerContribution({ id: "c", kind: "command", label: "x", targetContributionId: "p", onEvent() {} }), /command/);
  assert.throws(() => marinara.ui.registerContribution({ id: "p", kind: "panel", label: "x", elements: [{ kind: "html" }] }), /element kind/);
  const handle = marinara.ui.registerContribution({ id: "m", kind: "menu-item", label: "x" });
  assert.throws(() => handle.update({ surface: "chats" }), /cannot update "surface"/);
  for (let i = 0; i < 23; i += 1) marinara.ui.registerContribution({ id: `b${i}`, kind: "button", label: "x" });
  assert.throws(() => marinara.ui.registerContribution({ id: "one-too-many", kind: "button", label: "x" }), /at most 24/);
  await assert.rejects(marinara.storage.patch({ big: "x".repeat(1_000_001) }), /limit/);
});
await check("stub: dice formats roll through parse and read with documented bounds", async () => {
  const stub = createMarinaraStub();
  stub.marinara.dice.registerFormat({
    id: "fudge", label: "Fudge",
    parse: (notation) => (/^(\d+)dF$/.test(notation) ? { dice: Array(Number(notation.slice(0, -2))).fill(3) } : null),
    read: ({ rolls }) => ({ total: rolls.reduce((sum, face) => sum + face - 2, 0), text: "fudge" }),
  });
  const result = await stub.roll("4dF", [1, 2, 3, 3]);
  assert.equal(result.total, 1);
  assert.equal(await stub.roll("2d6"), null);
});

console.log(`${count - failures}/${count} checks passed.`);
process.exitCode = failures ? 1 : 0;
