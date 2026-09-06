#!/usr/bin/env node
// Differential proof against actual checkouts, not a second copy of the local checks.
// Node 24+: --engine PATH --agents PATH [--zod PATH/TO/zod/index.js] [--fixture MAP.json]
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { spawnSync } from "node:child_process";
import { portableLoreIsValid, fingerprint } from "../scripts/portable-lore.mjs";

const args = process.argv.slice(2),
  flag = (k) => args[args.indexOf("--" + k) + 1];
if (!args.includes("--engine") || !args.includes("--agents"))
  throw new Error("Pass real --engine and --agents source checkout paths.");
const engine = resolve(flag("engine")),
  agents = resolve(flag("agents"));
const overlay = agents + "/packages/hierarchical-maps/src/engine/packages/";
const zod = args.includes("--zod")
  ? pathToFileURL(resolve(flag("zod"))).href
  : null;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "zod" && zod) return next(zod, context);
    if (specifier === "@marinara-engine/shared")
      return next(
        pathToFileURL(engine + "/packages/shared/src/utils/spatial-context.ts")
          .href,
        context,
      );
    if (
      specifier.startsWith(".") &&
      specifier.endsWith(".js") &&
      context.parentURL
    ) {
      const candidate = new URL(
        specifier.replace(/\.js$/u, ".ts"),
        context.parentURL,
      );
      if (existsSync(candidate)) return next(candidate.href, context);
    }
    return next(specifier, context);
  },
});
const schema = (
  await import(
    pathToFileURL(
      engine + "/packages/shared/src/schemas/spatial-context.schema.ts",
    ).href
  )
).spatialContextDefinitionSchema;
const spatial = await import(
  pathToFileURL(engine + "/packages/shared/src/utils/spatial-context.ts").href
);
const lore = await import(
  pathToFileURL(
    overlay + "client/src/features/spatial-context/portable-lore.ts",
  ).href
);
const profiles = await import(
  pathToFileURL(overlay + "maps-shared/src/maps-model.ts").href
);
const runtime = await import(
  pathToFileURL(overlay + "maps-shared/src/runtime-prompt.ts").href
);
const loreSchemas = await import(
  pathToFileURL(engine + "/packages/shared/src/schemas/lorebook.schema.ts").href
);
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
      description: "Coast.",
    },
  ],
});
const serialize = (v) => JSON.parse(JSON.stringify(v));
let definitionCases = 0,
  loreCases = 0;
function compare(d, label) {
  d = serialize(d);
  const actual = schema.safeParse(d).success;
  const r = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("../scripts/validate-map.mjs", import.meta.url)),
      "-",
      "--json",
      "--no-lint",
    ],
    { input: JSON.stringify(d), encoding: "utf8" },
  );
  assert.notEqual(r.status, 2, r.stderr);
  assert.equal(JSON.parse(r.stdout).ok, actual, label);
  definitionCases++;
}
compare(minimal(), "minimal");
for (const key of [
  "schemaVersion",
  "ownerMode",
  "enabled",
  "revision",
  "startingLocationId",
  "locations",
])
  for (const value of [null, [], {}, true, 0, "", undefined]) {
    const d = minimal();
    d[key] = value;
    compare(d, `${key}: ${JSON.stringify(value)}`);
  }
for (const key of [
  "id",
  "parentId",
  "name",
  "kind",
  "description",
  "modelMemory",
  "awarenessSummary",
  "icon",
  "referenceImageId",
  "useReferenceImage",
  "mapBackgroundImageId",
  "mapBackgroundPosition",
  "lorebookEntryIds",
  "childPresentation",
  "placement",
  "layerOrder",
  "links",
  "status",
  "sortOrder",
])
  for (const value of [null, [], {}, true, 0, "", undefined]) {
    const d = minimal();
    d.locations[0][key] = value;
    compare(d, `${key}: ${JSON.stringify(value)}`);
  }
for (const key of ["targetId", "label", "bidirectional", "state"])
  for (const value of [null, [], {}, true, 0, "", undefined]) {
    const d = minimal();
    d.locations.push({ ...d.locations[0], id: "child", parentId: "root" });
    d.locations[0].links = [{ targetId: "child", [key]: value }];
    compare(d, `link.${key}: ${JSON.stringify(value)}`);
  }
for (const [key, value] of [
  ["id", " root "],
  ["name", " " + "x".repeat(200) + " "],
  ["icon", " " + "x".repeat(64) + " "],
  ["referenceImageId", "x".repeat(201)],
  ["lorebookEntryIds", ["e", " e "]],
  ["layerOrder", 9007199254740992],
]) {
  const d = minimal();
  d.locations[0][key] = value;
  compare(d, key + " boundary");
}
for (const n of [20, 21, 500, 501]) {
  const d = minimal();
  d.locations = Array.from({ length: n }, (_, i) => ({
    ...d.locations[0],
    id: i ? "n" + i : "root",
    parentId: i && n < 30 ? (i === 1 ? "root" : "n" + (i - 1)) : null,
  }));
  compare(d, "count/depth " + n);
}
for (const filename of ["definition.minimal.json", "world-map.export.json"]) {
  const e = JSON.parse(
    readFileSync(new URL("../templates/" + filename, import.meta.url)),
  );
  compare(e.definition ?? e, filename);
  if (e.hierarchyProfile) {
    assert(
      profiles.spatialHierarchyProfileSchema.safeParse(e.hierarchyProfile)
        .success,
      filename + " profile",
    );
  }
}

const bundle = {
  schemaVersion: 1,
  mode: "linked-entries",
  books: [
    {
      key: "b",
      originalId: "b1",
      name: "Book",
      settings: { entryLimit: 9 },
      folders: [
        {
          key: "f",
          originalId: "f1",
          parentKey: null,
          data: { name: "Places", enabled: true, order: 0 },
        },
      ],
      entries: [
        {
          key: "e",
          originalId: "e1",
          name: "Fact",
          folderKey: "f",
          fingerprint: "test",
          data: { name: "Fact", content: "Salt." },
        },
      ],
    },
  ],
  references: [
    {
      locationId: "root",
      locationName: "Root",
      entryKey: "e",
      originalLorebookId: "b1",
      originalLorebookName: "Book",
      originalEntryId: "e1",
      originalEntryName: "Fact",
    },
  ],
};
function compareLore(v, label) {
  v = serialize(v);
  assert.equal(
    portableLoreIsValid(v),
    lore.parsePortableLoreBundle(v) !== null,
    label,
  );
  loreCases++;
}
compareLore(bundle, "valid");
compareLore({}, "empty");
compareLore(null, "null");
for (const key of ["schemaVersion", "mode", "books", "references"])
  for (const v of [null, [], {}, "", 1, undefined]) {
    const b = structuredClone(bundle);
    b[key] = v;
    compareLore(b, key);
  }
for (const collection of ["books", "folders", "entries", "references"])
  for (const value of [null, {}, 1, "", []]) {
    const b = structuredClone(bundle);
    const list =
      collection === "books"
        ? b.books
        : collection === "references"
          ? b.references
          : b.books[0][collection];
    list[0] = value;
    compareLore(b, collection);
  }
for (const mutate of [
  (b) => b.books.push(structuredClone(b.books[0])),
  (b) => b.books[0].entries.push(structuredClone(b.books[0].entries[0])),
  (b) => (b.books[0].folders[0].parentKey = "missing"),
  (b) => (b.references[0].entryKey = "missing"),
  (b) => (b.books[0].entries[0].folderKey = "missing"),
  (b) => (b.mode = "map-only"),
]) {
  const b = structuredClone(bundle);
  mutate(b);
  compareLore(b, "cross-reference");
}
const fp = {
  name: "Fact",
  content: "Salt.",
  excludeFromVectorization: true,
  keys: ["salt"],
};
assert.equal(fingerprint(fp), lore.portableEntryFingerprint(fp));
const d = schema.parse(minimal());
d.enabled = true;
d.locations = Array.from({ length: 73 }, (_, i) => ({
  ...d.locations[0],
  id: i ? "n" + i : "root",
  parentId: i ? "root" : null,
  name: "Node " + i,
  description: "Context " + i,
  sortOrder: i,
}));
const p = runtime.buildOwnerSpatialProjection("fixture", d, "n72");
assert.equal(p.description, "Context 72");
assert.equal(p.knownLocations.length, 50);
assert.equal(p.knownLocations[49].id, "n49");
assert.equal(p.omittedKnownLocationCount, 23);
assert.equal(
  runtime.buildOwnerSpatialProjection("fixture", d, "root").destinations.length,
  50,
);
assert.deepEqual(spatial.resolveSpatialRoute(d, "n71", "n72"), ["root", "n72"]);
const brokenProfile = {
  version: 1,
  mode: "custom",
  name: "Test",
  types: [{ id: "place", label: "Place", baseKind: "place" }],
  locationTypeIds: { root: "missing" },
};
assert.equal(
  profiles.spatialHierarchyProfileSchema.safeParse(brokenProfile).success,
  false,
);
assert.equal(
  profiles.normalizeHierarchyProfile(brokenProfile, d).locationTypeIds.root,
  "place",
);

// Execute the real portable-lore importer with an in-memory API validating
// actual destination schemas. No database, network writes or app import occurs.
const sample = JSON.parse(readFileSync(new URL('../templates/world-map.export.json', import.meta.url)));
const sampleBundle = lore.parsePortableLoreBundle(sample.portableLore);
assert(sampleBundle, 'sample portable lore');
const plan = lore.planPortableLoreImport(sampleBundle, [], [], sample.name);
let created = 0;
const imported = await lore.importPortableLoreBundle({
  bundle: sampleBundle, plan, strategy: 'separate', api: {
    async post(path, body) {
      if (path === '/lorebooks') { loreSchemas.createLorebookSchema.parse(body); return {id: 'destination-book'}; }
      if (path.endsWith('/folders')) { loreSchemas.createLorebookFolderSchema.parse(body); return {id:'destination-folder'}; }
      if (path.endsWith('/entries/bulk')) return body.entries.map(entry => {
        loreSchemas.createLorebookEntrySchema.parse({...entry,lorebookId:'destination-book'});
        return {id:'destination-entry-'+(++created)};
      });
      throw new Error('Unexpected source API call: '+path);
    },
    async patch(path, body) { loreSchemas.updateLorebookEntrySchema.parse(body); return {}; },
    async delete() { return {}; }
  }
});
const remapped = lore.remapPortableLoreReferences(schema.parse(sample.definition), sampleBundle, imported.entryIdMap);
assert.equal(imported.importedEntries, 1);
assert.deepEqual(remapped.locations.find(l=>l.id==='salt-house.kitchen').lorebookEntryIds,['destination-entry-1']);

if (args.includes("--fixture")) {
  const f = JSON.parse(readFileSync(flag("fixture"), "utf8"));
  compare(f.definition ?? f, "user fixture");
  if (f.portableLore != null) compareLore(f.portableLore, "fixture lore");
  if (f.hierarchyProfile)
    assert(
      profiles.spatialHierarchyProfileSchema.safeParse(f.hierarchyProfile)
        .success,
      "fixture profile",
    );
}
console.log(
  JSON.stringify(
    {
      definitionCases,
      loreCases,
      fingerprintParity: true,
      realProjectionAndRouteChecks: true,
      profileNormalizationCheck: true,
      sampleLoreImporterAndApiSchemas: true,
      evidence: "Actual source modules executed; no app import.",
    },
    null,
    2,
  ),
);
