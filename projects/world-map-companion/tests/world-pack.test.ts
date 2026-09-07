/**
 * Task 5 — Nevermore companion world pack coverage and ID joins.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const WMC_ROOT = join(HERE, "..");
const REPO_ROOT = join(WMC_ROOT, "..", "..");
const PACK_DIR = join(REPO_ROOT, "projects/nevermore/companion");
const MAP_PATH = join(
  REPO_ROOT,
  "projects/nevermore/releases/v2/Nevermore-Woodlands-Crypts-v2.world-map.json",
);
const VALIDATOR = join(WMC_ROOT, "scripts/validate-world-pack.py");

const EXPECTED_LOCATIONS = 79;
const EXPECTED_ASSETS = 82;
const EXPECTED_MAP_SHA =
  "d10bef3e1d39945224d3981767fdb4c6a7a018b0710efb7322dd790be0dfd2fa";
const PROFILE_KINDS = new Set([
  "playable-scene",
  "circulation",
  "boundary-gate",
  "regional-container",
]);
const EXPECTED_PROFILES = new Set([
  "freeform",
  "social-schedule",
  "exploration-mystery",
  "tactical-travel",
]);

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

test("companion pack files exist", () => {
  for (const name of [
    "manifest.json",
    "locations.json",
    "npcs.json",
    "aliases.json",
    "schedules.json",
    "services.json",
    "events.json",
    "profiles.json",
  ]) {
    assert.ok(existsSync(join(PACK_DIR, name)), `missing ${name}`);
  }
});

test("locations cover all 79 map IDs with functional profiles", () => {
  const map = readJson<{ definition: { locations: { id: string }[] } }>(MAP_PATH);
  const pack = readJson<{
    sourceMapContentHash: string;
    locations: { locationId: string; kind: string; affordances: string[] }[];
    edges: unknown[];
    assets: { assetId: string; locationId: string; role: string }[];
  }>(join(PACK_DIR, "locations.json"));

  assert.equal(pack.sourceMapContentHash, EXPECTED_MAP_SHA);
  assert.equal(pack.locations.length, EXPECTED_LOCATIONS);
  assert.equal(map.definition.locations.length, EXPECTED_LOCATIONS);

  const mapIds = new Set(map.definition.locations.map((l) => l.id));
  const packIds = new Set(pack.locations.map((l) => l.locationId));
  assert.deepEqual([...packIds].sort(), [...mapIds].sort());

  for (const loc of pack.locations) {
    assert.ok(PROFILE_KINDS.has(loc.kind), `${loc.locationId} kind ${loc.kind}`);
    assert.ok(Array.isArray(loc.affordances), `${loc.locationId} affordances`);
  }
});

test("assets preserve 82 IDs joined by locationId", () => {
  const map = readJson<{
    artwork: { sourceImageId: string }[];
    definition: {
      locations: {
        id: string;
        referenceImageId?: string;
        mapBackgroundImageId?: string;
      }[];
    };
  }>(MAP_PATH);
  const pack = readJson<{
    assets: { assetId: string; locationId: string; role: string }[];
  }>(join(PACK_DIR, "locations.json"));

  assert.equal(map.artwork.length, EXPECTED_ASSETS);
  assert.equal(pack.assets.length, EXPECTED_ASSETS);

  const mapArt = new Set(map.artwork.map((a) => a.sourceImageId));
  const packArt = new Set(pack.assets.map((a) => a.assetId));
  assert.deepEqual([...packArt].sort(), [...mapArt].sort());

  const mapIds = new Set(map.definition.locations.map((l) => l.id));
  for (const asset of pack.assets) {
    assert.ok(mapIds.has(asset.locationId), `dangling asset location ${asset.locationId}`);
    assert.ok(asset.role === "reference" || asset.role === "background");
  }
});

test("edges match map link records exactly", () => {
  const map = readJson<{
    definition: {
      locations: {
        id: string;
        links?: {
          targetId: string;
          bidirectional?: boolean;
          state?: string;
          label?: string;
        }[];
      }[];
    };
  }>(MAP_PATH);
  const pack = readJson<{
    edges: {
      fromId: string;
      toId: string;
      bidirectional: boolean;
      state: string;
    }[];
  }>(join(PACK_DIR, "locations.json"));

  const mapKeys = map.definition.locations
    .flatMap((loc) =>
      (loc.links ?? []).map(
        (link) =>
          `${loc.id}->${link.targetId}:${link.state ?? "available"}:${Boolean(link.bidirectional)}`,
      ),
    )
    .sort();
  const packKeys = pack.edges
    .map((e) => `${e.fromId}->${e.toId}:${e.state}:${Boolean(e.bidirectional)}`)
    .sort();
  assert.deepEqual(packKeys, mapKeys);
});

test("NPC census has unique IDs and no dangling location refs", () => {
  const map = readJson<{ definition: { locations: { id: string }[] } }>(MAP_PATH);
  const mapIds = new Set(map.definition.locations.map((l) => l.id));
  const npcs = readJson<{
    npcs: {
      npcId: string;
      displayName: string;
      homeLocationIds?: string[];
      workLocationIds?: string[];
      scheduleIds?: string[];
      initialPlacement?: { locationId?: string };
    }[];
  }>(join(PACK_DIR, "npcs.json"));
  const schedules = readJson<{ schedules: { scheduleId: string; npcId: string }[] }>(
    join(PACK_DIR, "schedules.json"),
  );

  const ids = npcs.npcs.map((n) => n.npcId);
  assert.equal(ids.length, new Set(ids).size);
  assert.ok(ids.length >= 12, "expected full recurring census from revised lore");

  const scheduleIds = new Set(schedules.schedules.map((s) => s.scheduleId));
  for (const npc of npcs.npcs) {
    for (const lid of [...(npc.homeLocationIds ?? []), ...(npc.workLocationIds ?? [])]) {
      assert.ok(mapIds.has(lid), `${npc.npcId} dangling ${lid}`);
    }
    const pl = npc.initialPlacement?.locationId;
    if (pl) assert.ok(mapIds.has(pl), `${npc.npcId} placement dangling ${pl}`);
    for (const sid of npc.scheduleIds ?? []) {
      assert.ok(scheduleIds.has(sid), `${npc.npcId} missing schedule ${sid}`);
    }
  }
});

test("gate catalog matches HANDOFF controlled entrances and progression doors", () => {
  const events = readJson<{
    controlledEntrances: { fromId: string; toId: string }[];
    progressionGates: { fromId: string; toId: string }[];
    intentionalTopology: { roots: string[] };
  }>(join(PACK_DIR, "events.json"));

  assert.deepEqual(
    events.controlledEntrances.map((e) => [e.fromId, e.toId]).sort(),
    [
      ["dorms-common", "crypts-crawlspace"],
      ["nevermore-poe-statue", "crypts-stair-mouth"],
      ["ravencroft-iron-maiden", "crypts-tunnel-mouth"],
    ].sort(),
  );
  assert.deepEqual(
    events.progressionGates.map((e) => [e.fromId, e.toId]).sort(),
    [
      ["crypts-door-1", "crypts-breath"],
      ["crypts-door-2", "crypts-chamber-3"],
      ["crypts-door-3", "crypts-approach"],
    ].sort(),
  );
  assert.deepEqual(
    [...events.intentionalTopology.roots].sort(),
    [
      "crypts-covenant",
      "crypts-labyrinth",
      "crypts-second-rite",
      "crypts-union",
      "jericho-woods",
    ].sort(),
  );
});

test("four companion profiles are present", () => {
  const profiles = readJson<{ profiles: { id: string }[] }>(join(PACK_DIR, "profiles.json"));
  assert.deepEqual(
    new Set(profiles.profiles.map((p) => p.id)),
    EXPECTED_PROFILES,
  );
});

test("validate-world-pack.py passes", () => {
  const result = spawnSync("python3", [VALIDATOR, "--repo-root", REPO_ROOT, "--json"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout) as {
    ok: boolean;
    counts: { locations: number; assets: number; edges: number; npcs: number };
  };
  assert.equal(report.ok, true);
  assert.equal(report.counts.locations, EXPECTED_LOCATIONS);
  assert.equal(report.counts.assets, EXPECTED_ASSETS);
  assert.equal(report.counts.edges, 79);
  assert.ok(report.counts.npcs >= 12);
});
