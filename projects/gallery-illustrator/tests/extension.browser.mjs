// End-to-end check of the built extension in Chromium against a mock Engine API.
//
//   node tests/extension.browser.mjs [--screenshot out.png]
//
// Needs Playwright with a Chromium build (not part of validate.py). The extension body runs inside the
// same wrapper the Engine serves for full-page extensions (fullPageExtensionSource), with a host shim that
// mirrors createFullPageExtensionApi: fetch, storage, managed timers, log and onCleanup.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { assemble, extensionFiles, importConfig } from "../build.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const screenshotAt = process.argv.indexOf("--screenshot");
const screenshotPath = screenshotAt >= 0 ? process.argv[screenshotAt + 1] : null;

const files = extensionFiles();
const script = files["Gallery-Reference-Pool/extension.js"];
const css = files["Gallery-Reference-Pool/extension.css"];
// As the real Engine stores it: every import gets a fresh `custom-import-<type>-<uuid>` type.
const agent = {
  id: "agent-1",
  ...importConfig(assemble()),
  type: "custom-import-gallery-illustrator-3a5911d3-66bd-4ff8-b938-658b5c7f78c8",
  settings: JSON.stringify(importConfig(assemble()).settings),
};
const png = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a8f20000000049454e44ae426082",
  "hex",
);

const patches = [];
const routes = {
  "GET /api/agents": () => [agent],
  "GET /api/characters": () => ({
    items: [{ id: "char1", data: JSON.stringify({ name: "Mara" }), avatarPath: "/api/avatars/file/character-char1.png" }],
    hasMore: false,
  }),
  "GET /api/characters/personas/list": () => ({
    items: [{ id: "p1", name: "Quinn", avatarPath: "/api/avatars/file/persona-p1.png" }],
    hasMore: false,
  }),
  "GET /api/chats": () => [{ id: "chat1", name: "Harbor night" }],
  "GET /api/characters/char1/gallery": () => [
    { id: "img1", url: "/api/characters/char1/gallery/file/face.png" },
    { id: "img2", url: "/api/characters/char1/gallery/file/body.png" },
  ],
  "GET /api/characters/personas/p1/gallery": () => [],
  "GET /api/global-gallery": () => [{ id: "g1", url: "/api/global-gallery/file/harbor.png" }],
  "GET /api/gallery/chat1": () => [],
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/") {
    res.setHeader("Content-Type", "text/html");
    res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>:root{--background:#101018;--foreground:#eee;--card:#1b1b24;--border:#3a3a48;--primary:#7c6cff}
body{margin:0;background:var(--background);color:var(--foreground);font-family:system-ui}</style>
<style>${css}</style></head><body><main style="padding:16px">Mock Marinara chat</main></body></html>`);
    return;
  }
  if (/\.png$/.test(url.pathname)) {
    res.setHeader("Content-Type", "image/png");
    res.end(png);
    return;
  }
  let body = "";
  for await (const chunk of req) body += chunk;
  if (req.method === "PATCH" && url.pathname === "/api/agents/agent-1") {
    patches.push({ csrf: req.headers["x-marinara-csrf"], type: req.headers["content-type"], body: JSON.parse(body) });
    res.setHeader("Content-Type", "application/json");
    res.end("{}");
    return;
  }
  const handler = routes[`${req.method} ${url.pathname}`];
  if (!handler) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: `no mock for ${req.method} ${url.pathname}` }));
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(handler(url)));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
await page.goto(origin);

// Host shim + the Engine's wrapper (fullPageExtensionSource) around the built body.
await page.evaluate(() => {
  window.__storage = { tags: { "gg:kept": { role: "prop", owner: "Keys", enabled: false } } };
  window.__readAttempts = 0;
  window.__cleanups = [];
  window.__marinaraRunFullPageExtension = (identity, main) => {
    const timeouts = new Set();
    const api = Object.freeze({
      version: 1,
      extension: identity,
      log: { debug() {}, info() {}, warn: console.warn, error: console.error },
      storage: {
        get: async () => {
          if (++window.__readAttempts === 1) throw new Error("temporary storage failure");
          return structuredClone(window.__storage);
        },
        patch: async (value) => (window.__storage = { ...window.__storage, ...structuredClone(value) }),
        clear: async () => (window.__storage = {}),
      },
      fetch: (input, init) => window.fetch(input, init),
      setTimeout: (callback, delay) => {
        const id = window.setTimeout(() => {
          timeouts.delete(id);
          callback();
        }, delay);
        timeouts.add(id);
        return id;
      },
      clearTimeout: (id) => {
        timeouts.delete(id);
        window.clearTimeout(id);
      },
      setInterval: window.setInterval.bind(window),
      clearInterval: window.clearInterval.bind(window),
      onCleanup: (fn) => window.__cleanups.push(fn),
    });
    window.__ready = Promise.resolve().then(() => main(api));
  };
});
await page.addScriptTag({
  content: `(() => {
  "use strict";
  const extension = {"id":"ext-1","name":"Gallery Reference Pool","contentHash":"sha256:test"};
  const run = window.__marinaraRunFullPageExtension;
  run(extension, async (marinara) => {
    "use strict";
${script}
  });
})();`,
});
await page.evaluate(() => window.__ready);

// Open the panel, pick Mara, tag her face.
await page.getByRole("button", { name: "Open the gallery reference pool" }).click();
await page.getByRole("dialog", { name: "Gallery reference pool" }).waitFor();
await page.getByRole("button", { name: "Retry" }).waitFor();
assert.equal(await page.locator(".grp-source, .grp-tile").count(), 0);
assert.equal(patches.length, 0);
await page.getByRole("button", { name: "Retry" }).click();
await page.locator(".grp-source").selectOption("character:char1");
await page.locator(".grp-tile").first().waitFor();
// The avatar is listed first (ca:<character id>), then the gallery.
assert.equal(await page.locator(".grp-tile").count(), 3);
assert.match(await page.locator(".grp-tile").first().textContent(), /ca:char1 \(avatar\)/);
assert.match(await page.locator(".grp-tile").first().locator("img").getAttribute("src"), /character-char1\.png\?w=320$/);
const faceTile = page.locator(".grp-tile", { hasText: "cg:img1" });
await faceTile.getByLabel("Caption").fill("close-up, soft light");
await faceTile.getByLabel("Role").selectOption("face");
assert.equal(await faceTile.getByLabel("Owner").inputValue(), "Mara");
assert.ok(await faceTile.getByLabel("Owner").getAttribute("readonly") !== null, "a character's owner is fixed");

// Tag a body picture too, then the harbor from the Global Gallery with a typed owner.
await page.locator(".grp-tile", { hasText: "cg:img2" }).getByLabel("Role").selectOption("body");
await page.locator(".grp-source").selectOption("global:all");
const harbor = page.locator(".grp-tile", { hasText: "gg:g1" });
await harbor.waitFor();
await harbor.getByLabel("Owner").fill("Harbor");
await harbor.getByLabel("Role").selectOption("location");

// A persona's avatar is taggable too (pa:<persona id>), with its owner fixed.
await page.locator(".grp-source").selectOption("persona:p1");
const personaAvatar = page.locator(".grp-tile", { hasText: "pa:p1" });
await personaAvatar.waitFor();
assert.equal(await personaAvatar.getByLabel("Owner").inputValue(), "Quinn");
await personaAvatar.getByLabel("Role").selectOption("face");

// Auto-sync fires 1.5 s after the last change.
await page.waitForFunction(() => document.querySelector(".grp-status")?.dataset.kind === "ok", null, { timeout: 8000 });
assert.ok(patches.length >= 1, "synced to the agent");
const last = patches.at(-1);
assert.equal(last.csrf, "1", "PATCH carries the CSRF header");
assert.match(last.type, /application\/json/);
const expected = [
  "gg:g1 | Harbor | location | -",
  "cg:img1 | Mara | face | close-up, soft light | char1",
  "cg:img2 | Mara | body | - | char1",
  "pa:p1 | Quinn | face | - | p1",
].join("\n");
assert.ok(last.body.promptTemplate.includes(`<!-- reference-pool:start -->\n${expected}\n<!-- reference-pool:end -->`), last.body.promptTemplate);
assert.equal(last.body.settings.promptTemplates.length, 4);
for (const option of last.body.settings.promptTemplates) assert.ok(option.promptTemplate.includes(expected), option.id);
assert.deepEqual(last.body.settings.customCapabilities, { trigger_image_generation: true }, "settings kept");
assert.match(await page.locator(".grp-status").textContent(), /Synced 4 pictures to 5 prompts/);

// Stored tags survive, and the Tagged view lists them.
const stored = await page.evaluate(() => window.__storage);
assert.deepEqual(Object.keys(stored.tags).sort(), ["cg:img1", "cg:img2", "gg:g1", "gg:kept", "pa:p1"]);
await page.locator(".grp-source").selectOption("tagged");
await page.locator(".grp-tile", { hasText: "gg:g1" }).waitFor();
assert.equal(await page.locator(".grp-tile").count(), 5);
assert.ok((await page.locator(".grp-tile", { hasText: "pa:p1" }).getByLabel("Owner").getAttribute("readonly")) !== null);
assert.ok((await page.locator(".grp-tile", { hasText: "cg:img1" }).getByLabel("Owner").getAttribute("readonly")) !== null);
assert.equal(await page.locator(".grp-tile", { hasText: "gg:g1" }).getByLabel("Owner").getAttribute("readonly"), null);

// Removing Mara's face warns that she has none.
await page.locator(".grp-tile", { hasText: "cg:img1" }).getByLabel("Role").selectOption("");
await page.locator(".grp-warnings li", { hasText: "Mara has no face picture." }).waitFor();
await page.locator(".grp-tile", { hasText: "cg:img1" }).getByLabel("Role").selectOption("face");
await page.getByRole("button", { name: "Sync" }).click();
await page.waitForFunction(() => /Synced 4 pictures/.test(document.querySelector(".grp-status")?.textContent ?? ""));

if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: false });

// Cleanup removes everything the extension added.
await page.evaluate(async () => {
  for (const fn of window.__cleanups) await fn();
});
assert.equal(await page.locator(".grp-launcher, .grp-root").count(), 0);
assert.deepEqual(errors, [], `page errors: ${errors.join("; ")}`);

await browser.close();
server.close();
console.log(`extension browser check passed (${patches.length} sync request(s))`);
