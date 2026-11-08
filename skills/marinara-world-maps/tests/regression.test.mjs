import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scripts = fileURLToPath(new URL("../scripts/", import.meta.url));
const minimal = () => ({
  schemaVersion: 1,
  ownerMode: "roleplay",
  enabled: false,
  revision: 0,
  startingLocationId: "root",
  locations: [
    {
      id: "root",
      parentId: null,
      name: "Root",
      kind: "region",
      description: "A coastal region.",
    },
  ],
});
const envelope = () => ({
  format: "marinara-hierarchical-map",
  formatVersion: 4,
  name: "Root",
  definition: minimal(),
});
const book = () => ({
  data: {
    lorebook: {
      id: "b1",
      name: "Book",
      category: "world",
      entryLimit: 9,
      maxRecursionDepth: 7,
      vectorMaxResults: 4,
      generatedBy: "user",
      sourceAgentId: "hierarchical-maps",
    },
    folders: [],
    entries: [
      {
        id: "entry a",
        name: "A",
        content: "A fact.",
        excludeFromVectorization: true,
      },
      { id: "entry-a", name: "B", content: "B fact." },
    ],
  },
});
const fixture = () => mkdtempSync(join(tmpdir(), "world-maps-test-"));
const write = (dir, name, data) => {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(data));
  return path;
};
const run = (name, args) =>
  spawnSync(process.execPath, [join(scripts, name), ...args], {
    encoding: "utf8",
  });
function validate(value) {
  const dir = fixture();
  const r = run("validate-map.mjs", [write(dir, "map.json", value), "--json"]);
  assert.notEqual(r.status, 2, r.stderr);
  return { ...r, report: JSON.parse(r.stdout) };
}

function flatMap(count) {
  const d = minimal();
  d.locations = Array.from({ length: count }, (_, i) => ({
    ...d.locations[0],
    id: i ? "n" + i : "root",
    parentId: null,
    name: "Node " + i,
  }));
  return d;
}
test("storage cap is the released 5,000 locations, not the retired 500", () => {
  const atOldCap = validate(flatMap(500));
  assert.equal(atOldCap.status, 0);
  assert.ok(!atOldCap.report.warnings.some((w) => w.code === "legacy_location_cap"));
  const pastOldCap = validate(flatMap(501));
  assert.equal(pastOldCap.status, 0);
  assert.ok(pastOldCap.report.warnings.some((w) => w.code === "legacy_location_cap"));
  assert.equal(validate(flatMap(5000)).status, 0);
  const over = validate(flatMap(5001));
  assert.equal(over.status, 1);
  assert.ok(over.report.errors.some((error) => error.code === "too_many_locations"));
});
test("minimal and shipped templates pass structural preflight", () => {
  assert.equal(validate(minimal()).status, 0);
  for (const name of ["definition.minimal.json", "world-map.export.json"])
    assert.equal(
      validate(
        JSON.parse(
          readFileSync(new URL("../templates/" + name, import.meta.url)),
        ),
      ).status,
      0,
      name,
    );
});
test("null portable lore is absent but empty object is invalid", () => {
  assert.equal(validate({ ...envelope(), portableLore: null }).status, 0);
  assert.equal(validate({ ...envelope(), portableLore: {} }).status, 1);
});
test("image IDs and toggle have real schema types", () => {
  for (const [key, value] of [
    ["referenceImageId", 9],
    ["mapBackgroundImageId", ""],
    ["useReferenceImage", "true"],
  ]) {
    const d = minimal();
    d.locations[0][key] = value;
    assert.equal(validate(d).status, 1, key);
  }
});
test("safe integers, trimmed IDs and duplicate lore IDs", () => {
  for (const key of ["sortOrder", "layerOrder"]) {
    const d = minimal();
    d.locations[0][key] = Number.MAX_SAFE_INTEGER + 1;
    assert.equal(validate(d).status, 1);
  }
  const d = minimal();
  d.locations.push({ ...d.locations[0], id: " root " });
  assert.equal(validate(d).status, 1);
  const e = minimal();
  e.locations[0].lorebookEntryIds = ["e", " e "];
  assert.equal(validate(e).status, 1);
  const f = minimal();
  f.locations[0].id = " root ";
  assert.equal(validate(f).status, 0);
});
test("malformed nested values report errors without crashing", () => {
  for (const value of [null, 3, {}, "bad"]) {
    const d = minimal();
    d.locations[0].links = value;
    assert.equal(validate(d).status, 1);
  }
});
test("reverse available bidirectional link bypasses a blocked edge", () => {
  const d = minimal();
  d.locations[0].links = [{ targetId: "sealed", state: "blocked" }];
  d.locations.push({
    id: "sealed",
    parentId: null,
    name: "Sealed",
    kind: "room",
    description: "A chamber.",
    links: [{ targetId: "root", state: "available", bidirectional: true }],
  });
  const r = validate(d);
  assert.equal(r.status, 0);
  assert(r.report.warnings.some((w) => w.code === "reverse_link_bypass"));
});
test("inventory includes floors, rooms and expected background roles", () => {
  const dir = fixture(),
    e = envelope();
  e.definition.locations[0].childPresentation = "layers";
  e.definition.locations.push(
    {
      id: "floor",
      parentId: "root",
      name: "Floor",
      kind: "floor",
      layerOrder: 0,
      description: "Landing.",
      childPresentation: "map",
    },
    {
      id: "room",
      parentId: "floor",
      name: "Room",
      kind: "room",
      description: "Room.",
    },
  );
  const r = run("art-inventory.mjs", [write(dir, "map.json", e), "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const p = JSON.parse(r.stdout);
  assert.equal(p.byKind.floor.locations, 1);
  assert.equal(p.byKind.room.locations, 1);
  assert.deepEqual(p.missingMapBackgrounds, ["floor"]);
  assert.equal(p.missingReferences.length, 3);
});
test("builder preserves existing artwork, lore and profile", () => {
  const dir = fixture(),
    e = envelope();
  e.artwork = [];
  e.portableLore = {
    schemaVersion: 1,
    mode: "map-only",
    books: [],
    references: [],
  };
  e.hierarchyProfile = {
    version: 1,
    mode: "auto",
    name: "Native",
    types: [{ id: "region", label: "Region", baseKind: "region" }],
  };
  const out = join(dir, "out.json"),
    r = run("build-pack.mjs", [
      "--definition",
      write(dir, "in.json", e),
      "--out",
      out,
    ]);
  assert.equal(r.status, 0, r.stderr);
  const got = JSON.parse(readFileSync(out));
  assert.deepEqual(got.portableLore, e.portableLore);
  assert.deepEqual(got.artwork, e.artwork);
  assert.deepEqual(got.hierarchyProfile, e.hierarchyProfile);
});
test("builder retains native settings and uses collision-free entry keys", () => {
  const dir = fixture(),
    out = join(dir, "out.json"),
    r = run("build-pack.mjs", [
      "--definition",
      write(dir, "map.json", envelope()),
      "--lorebook",
      write(dir, "book.json", book()),
      "--links",
      write(dir, "links.json", { root: ["A", "B"] }),
      "--out",
      out,
    ]);
  assert.equal(r.status, 0, r.stderr);
  const got = JSON.parse(readFileSync(out));
  assert.equal(got.portableLore.books[0].settings.entryLimit, 9);
  assert.equal(
    got.portableLore.books[0].entries[0].data.excludeFromVectorization,
    true,
  );
  assert.equal(
    new Set(got.portableLore.books[0].entries.map((e) => e.key)).size,
    2,
  );
  assert.equal(validate(got).status, 0);
});
test("builder rejects ambiguous entry names and malformed links", () => {
  for (const links of [{ root: "A" }, { root: ["A"] }]) {
    const dir = fixture(),
      b = book();
    b.data.entries[1].name = "a";
    const r = run("build-pack.mjs", [
      "--definition",
      write(dir, "map.json", envelope()),
      "--lorebook",
      write(dir, "book.json", b),
      "--links",
      write(dir, "links.json", links),
      "--out",
      join(dir, "out.json"),
    ]);
    assert.equal(r.status, 2);
  }
});
test("builder supports exact ID selectors and complete lorebooks", () => {
  const dir = fixture(),
    out = join(dir, "out.json"),
    r = run("build-pack.mjs", [
      "--definition",
      write(dir, "map.json", envelope()),
      "--lorebook",
      write(dir, "book.json", book()),
      "--links",
      write(dir, "links.json", { root: [{ id: "entry a" }] }),
      "--lore-mode",
      "complete-lorebooks",
      "--out",
      out,
    ]);
  assert.equal(r.status, 0, r.stderr);
  const p = JSON.parse(readFileSync(out));
  assert.equal(p.portableLore.books[0].entries.length, 2);
  assert.equal(p.portableLore.references.length, 1);
});
test("builder refuses to overwrite its input", () => {
  const dir = fixture(),
    input = write(dir, "map.json", envelope()),
    before = readFileSync(input);
  const r = run("build-pack.mjs", ["--definition", input, "--out", input]);
  assert.equal(r.status, 2);
  assert.deepEqual(readFileSync(input), before);
});
test("builder refuses an unknown newer envelope version", () => {
  const dir = fixture(), e = envelope(); e.formatVersion = 5;
  const r = run('build-pack.mjs', ['--definition', write(dir, 'newer.json', e), '--out', join(dir, 'out.json')]);
  assert.equal(r.status, 2); assert.match(r.stderr, /version/);
});
test("builder binds a real PNG and rejects duplicate art roles", () => {
  const dir = fixture(),
    art = join(dir, "art");
  mkdirSync(art);
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  );
  writeFileSync(join(art, "root.png"), bytes);
  const input = write(dir, "map.json", envelope()),
    out = join(dir, "out.json"),
    r = run("build-pack.mjs", [
      "--definition",
      input,
      "--images",
      art,
      "--out",
      out,
    ]);
  assert.equal(r.status, 0, r.stderr);
  const e = JSON.parse(readFileSync(out));
  assert.equal(
    e.definition.locations[0].referenceImageId,
    e.artwork[0].sourceImageId,
  );
  assert.equal(validate(e).status, 0);
  mkdirSync(join(art, "reference"));
  writeFileSync(join(art, "reference", "root.png"), bytes);
  assert.equal(
    run("build-pack.mjs", [
      "--definition",
      input,
      "--images",
      art,
      "--out",
      join(dir, "duplicate.json"),
    ]).status,
    2,
  );
});
