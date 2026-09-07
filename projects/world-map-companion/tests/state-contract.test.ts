/**
 * Task 3 — contracts, schema, repository atomicity, deterministic replay.
 */
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  CONTRACT_SCHEMA_VERSION,
  type CompanionEvent,
  type CampaignRecord,
  type LocationState,
  type NpcState,
} from "../src/contracts.ts";
import {
  SchemaValidationError,
  parseCompanionEvent,
  parseNarrowCampaignRef,
  parseWorldPack,
  validateCompanionEvent,
} from "../src/schema.ts";
import {
  CampaignRepository,
  ReduceError,
  RevisionConflictError,
  applyEvent,
  emptyProjection,
  hashProjection,
  replayEvents,
} from "../src/state/index.ts";

const NOW = "2026-09-07T16:20:00.000Z";

function baseCampaign(campaignId = "campaign:test"): CampaignRecord {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    campaignId,
    displayName: "Test Campaign",
    activeBranchId: "branch:main",
    sourceWorldId: "world:nevermore",
    sourceWorldVersion: "v2-test",
    settings: { companionProfile: "freeform" },
    observerIds: ["obs:player"],
    ownership: {
      packageId: "pkg:world-map-companion",
      documentKind: "world-map-companion-campaign",
    },
    checkpointIds: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function npc(id: string, locationId: string): NpcState {
  return {
    npcId: id,
    placement: { kind: "at", locationId },
    aliases: [],
  };
}

function location(id: string): LocationState {
  return {
    locationId: id,
    access: {
      physicallyOpen: true,
      entranceKnownBy: [],
      permissionGrantedTo: [],
    },
    discoveryByObserver: {},
  };
}

function event(
  partial: Omit<CompanionEvent, "schemaVersion" | "visibility" | "createdAt" | "anchor"> &
    Partial<Pick<CompanionEvent, "visibility" | "createdAt" | "anchor">>,
): CompanionEvent {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    visibility: ["system"],
    createdAt: NOW,
    anchor: null,
    ...partial,
  };
}

function createRootEvent(campaignId = "campaign:test"): CompanionEvent {
  return event({
    eventId: "evt:root",
    campaignId,
    branchId: "branch:main",
    parentEventId: null,
    expectedRevision: 0,
    payload: {
      type: "campaign.created",
      campaign: baseCampaign(campaignId),
      initialNpcs: [npc("npc:raven", "nevermore-town-square")],
      initialLocations: [location("nevermore-town-square"), location("crypts-stair-mouth")],
    },
  });
}

test("schema rejects malformed events and unsupported schemaVersion", () => {
  const issues = validateCompanionEvent({
    schemaVersion: 99,
    eventId: "evt:x",
    campaignId: "campaign:a",
    branchId: "branch:main",
    parentEventId: null,
    anchor: null,
    expectedRevision: 0,
    payload: { type: "time.advanced", storyTime: "day-1" },
    visibility: ["system"],
    createdAt: NOW,
  });
  assert.ok(issues.some((i) => i.path.includes("schemaVersion")));
  assert.throws(() => parseCompanionEvent({ not: "an event" }), SchemaValidationError);
});

test("world pack and narrow campaign ref require schemaVersion", () => {
  const pack = parseWorldPack({
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    worldId: "world:nevermore",
    displayName: "Nevermore",
    sourceMap: { mapId: "nevermore-v2", revision: "test", contentHash: "abc" },
    locationProfiles: [],
    npcDefinitions: [],
  });
  assert.equal(pack.worldId, "world:nevermore");

  const ref = parseNarrowCampaignRef({
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    campaignId: "campaign:test",
    branchId: "branch:main",
    packageDocumentId: "doc-1",
    headEventId: null,
    revision: 0,
  });
  assert.equal(ref.revision, 0);
});

test("reducer rejects unknown NPC, cross-campaign, duplicate, and stale revision", () => {
  const root = createRootEvent();
  let state = emptyProjection("campaign:test", "branch:main");
  const seen = new Set<string>();
  state = applyEvent(state, root, seen);
  seen.add(root.eventId);

  assert.throws(
    () =>
      applyEvent(
        state,
        event({
          eventId: "evt:bad-npc",
          campaignId: "campaign:test",
          branchId: "branch:main",
          parentEventId: "evt:root",
          expectedRevision: 1,
          payload: {
            type: "npc.moved",
            npcId: "npc:unknown",
            placement: { kind: "at", locationId: "nevermore-town-square" },
          },
        }),
        seen,
      ),
    (err: unknown) => err instanceof ReduceError && err.code === "UNKNOWN_NPC",
  );

  assert.throws(
    () =>
      applyEvent(
        state,
        event({
          eventId: "evt:cross",
          campaignId: "campaign:other",
          branchId: "branch:main",
          parentEventId: "evt:root",
          expectedRevision: 1,
          payload: { type: "time.advanced", storyTime: "day-2" },
        }),
        seen,
      ),
    (err: unknown) => err instanceof ReduceError && err.code === "CROSS_CAMPAIGN",
  );

  assert.throws(
    () => applyEvent(state, root, seen),
    (err: unknown) => err instanceof ReduceError && err.code === "DUPLICATE_EVENT",
  );

  assert.throws(
    () =>
      applyEvent(
        state,
        event({
          eventId: "evt:stale",
          campaignId: "campaign:test",
          branchId: "branch:main",
          parentEventId: "evt:root",
          expectedRevision: 0,
          payload: { type: "time.advanced", storyTime: "day-2" },
        }),
        seen,
      ),
    (err: unknown) => err instanceof ReduceError && err.code === "STALE_REVISION",
  );
});

test("revision conflict on concurrent commit", () => {
  const dir = mkdtempSync(join(tmpdir(), "wmc-state-"));
  const repo = new CampaignRepository(dir);
  repo.createCampaign({
    campaignId: "campaign:test",
    branchId: "branch:main",
    packageDocumentId: "doc-1",
  });
  const root = createRootEvent();
  repo.commitEvents("campaign:test", 0, [root]);

  const move = event({
    eventId: "evt:move-1",
    campaignId: "campaign:test",
    branchId: "branch:main",
    parentEventId: "evt:root",
    expectedRevision: 1,
    payload: {
      type: "npc.moved",
      npcId: "npc:raven",
      placement: { kind: "at", locationId: "crypts-stair-mouth" },
    },
  });
  repo.commitEvents("campaign:test", 1, [move]);

  const stale = event({
    eventId: "evt:stale-write",
    campaignId: "campaign:test",
    branchId: "branch:main",
    parentEventId: "evt:root",
    expectedRevision: 1,
    payload: {
      type: "npc.moved",
      npcId: "npc:raven",
      placement: { kind: "at", locationId: "nevermore-town-square" },
    },
  });
  assert.throws(
    () => repo.commitEvents("campaign:test", 1, [stale]),
    RevisionConflictError,
  );

  const opened = repo.open("campaign:test");
  assert.ok(opened);
  assert.equal(opened.projection.revision, 2);
  assert.equal(opened.projection.npcs["npc:raven"]?.placement.kind, "at");
  if (opened.projection.npcs["npc:raven"]?.placement.kind === "at") {
    assert.equal(opened.projection.npcs["npc:raven"].placement.locationId, "crypts-stair-mouth");
  }
});

test("failure between event persistence and projection leaves no half-applied campaign", () => {
  const dir = mkdtempSync(join(tmpdir(), "wmc-state-"));
  const repo = new CampaignRepository(dir);
  repo.createCampaign({
    campaignId: "campaign:test",
    branchId: "branch:main",
    packageDocumentId: "doc-1",
  });
  repo.commitEvents("campaign:test", 0, [createRootEvent()]);

  repo.setHooks({
    afterEventPersistBeforeProjection: () => {
      throw new Error("injected failure after event stage");
    },
  });

  const move = event({
    eventId: "evt:move-fail",
    campaignId: "campaign:test",
    branchId: "branch:main",
    parentEventId: "evt:root",
    expectedRevision: 1,
    payload: {
      type: "npc.moved",
      npcId: "npc:raven",
      placement: { kind: "traveling", fromLocationId: "nevermore-town-square", toLocationId: "crypts-stair-mouth" },
    },
  });

  assert.throws(() => repo.commitEvents("campaign:test", 1, [move]), /injected failure/);

  // Live state unchanged
  const opened = repo.open("campaign:test");
  assert.ok(opened);
  assert.equal(opened.meta.revision, 1);
  assert.equal(opened.projection.revision, 1);
  assert.equal(opened.projection.npcs["npc:raven"]?.placement.kind, "at");

  // No published event file for the failed batch
  const eventFiles = readdirSync(join(dir, "campaigns", "campaign:test", "events"));
  assert.equal(eventFiles.some((f) => f.includes("evt:move-fail")), false);

  // Incomplete txn discarded on open
  assert.equal(existsSync(join(dir, "campaigns", "campaign:test", "_txn")), false);

  // Retry without hook succeeds
  repo.setHooks({});
  const result = repo.commitEvents("campaign:test", 1, [move]);
  assert.equal(result.cursor.revision, 2);
  assert.equal(result.projection.npcs["npc:raven"]?.placement.kind, "traveling");
});

test("deterministic replay produces the same state hash", () => {
  const dir = mkdtempSync(join(tmpdir(), "wmc-state-"));
  const repo = new CampaignRepository(dir);
  repo.createCampaign({
    campaignId: "campaign:test",
    branchId: "branch:main",
    packageDocumentId: "doc-1",
  });

  const events: CompanionEvent[] = [
    createRootEvent(),
    event({
      eventId: "evt:discover",
      campaignId: "campaign:test",
      branchId: "branch:main",
      parentEventId: "evt:root",
      expectedRevision: 1,
      payload: {
        type: "location.discovered",
        locationId: "crypts-stair-mouth",
        observerId: "obs:player",
      },
    }),
    event({
      eventId: "evt:move",
      campaignId: "campaign:test",
      branchId: "branch:main",
      parentEventId: "evt:discover",
      expectedRevision: 2,
      payload: {
        type: "npc.moved",
        npcId: "npc:raven",
        placement: { kind: "at", locationId: "crypts-stair-mouth" },
      },
    }),
    event({
      eventId: "evt:time",
      campaignId: "campaign:test",
      branchId: "branch:main",
      parentEventId: "evt:move",
      expectedRevision: 3,
      payload: { type: "time.advanced", storyTime: "2026-09-07T18:00:00Z" },
    }),
  ];

  // Commit one-by-one to exercise revision chain
  for (let i = 0; i < events.length; i++) {
    repo.commitEvents("campaign:test", i, [events[i]!]);
  }

  const verify = repo.replayAndVerify("campaign:test");
  assert.equal(verify.matchesStore, true);
  assert.equal(verify.projection.revision, 4);
  assert.equal(typeof verify.stateHash, "string");
  assert.equal(verify.stateHash.length, 64);

  // Independent replay
  const again = replayEvents(events);
  assert.equal(again.stateHash, verify.stateHash);
  assert.equal(hashProjection(again.projection), verify.stateHash);

  // Snapshot stores the hash
  const snap = repo.writeSnapshot({
    campaignId: "campaign:test",
    snapshotId: "snap:1",
    label: "after-time",
  });
  assert.equal(snap.stateHash, verify.stateHash);
  const snapPath = join(dir, "campaigns", "campaign:test", "snapshots", "snap:1.json");
  assert.equal(existsSync(snapPath), true);
  const loaded = JSON.parse(readFileSync(snapPath, "utf8"));
  assert.equal(loaded.stateHash, verify.stateHash);
});

test("cross-campaign write into repository is rejected", () => {
  const dir = mkdtempSync(join(tmpdir(), "wmc-state-"));
  const repo = new CampaignRepository(dir);
  repo.createCampaign({
    campaignId: "campaign:test",
    branchId: "branch:main",
    packageDocumentId: "doc-1",
  });
  repo.commitEvents("campaign:test", 0, [createRootEvent()]);

  assert.throws(
    () =>
      repo.commitEvents("campaign:test", 1, [
        event({
          eventId: "evt:xcamp",
          campaignId: "campaign:other",
          branchId: "branch:main",
          parentEventId: "evt:root",
          expectedRevision: 1,
          payload: { type: "time.advanced", storyTime: "x" },
        }),
      ]),
    (err: unknown) => err instanceof ReduceError && err.code === "CROSS_CAMPAIGN",
  );
});

test("invalid chronology (non-head parent) is rejected", () => {
  const root = createRootEvent();
  const e1 = event({
    eventId: "evt:a",
    campaignId: "campaign:test",
    branchId: "branch:main",
    parentEventId: "evt:root",
    expectedRevision: 1,
    payload: { type: "time.advanced", storyTime: "t1" },
  });
  const { projection } = replayEvents([root, e1]);
  const seen = new Set(["evt:root", "evt:a"]);
  assert.throws(
    () =>
      applyEvent(
        projection,
        event({
          eventId: "evt:b",
          campaignId: "campaign:test",
          branchId: "branch:main",
          parentEventId: "evt:root", // not current head
          expectedRevision: 2,
          payload: { type: "time.advanced", storyTime: "t2" },
        }),
        seen,
      ),
    (err: unknown) => err instanceof ReduceError && err.code === "INVALID_CHRONOLOGY",
  );
});
