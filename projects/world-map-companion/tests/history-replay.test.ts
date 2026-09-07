/**
 * Task 4 — authoritative history selection, swipe projection, checkpoints,
 * pending-job recovery, no double-advance / no cross-chat leak.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  CONTRACT_SCHEMA_VERSION,
  PROCESSING_VERSION,
  type CompanionEvent,
  type CampaignRecord,
  type LocationState,
  type NpcState,
  type RandomResult,
  type TurnAnchor,
  type TurnDedupKey,
} from "../src/contracts.ts";
import {
  CampaignRepository,
  CheckpointStore,
  HistoryStore,
  formatDedupKey,
  hashProjection,
} from "../src/state/index.ts";
import {
  createLifecycleHelpers,
  createProposedCompanionHostBridge,
} from "../src/host/index.ts";

const NOW = "2026-09-07T16:40:00.000Z";

function baseCampaign(campaignId: string, branchId = "branch:main"): CampaignRecord {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    campaignId,
    displayName: "History Test",
    activeBranchId: branchId,
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
  return { npcId: id, placement: { kind: "at", locationId }, aliases: [] };
}

function location(id: string, open = true): LocationState {
  return {
    locationId: id,
    access: {
      physicallyOpen: open,
      entranceKnownBy: [],
      permissionGrantedTo: [],
    },
    discoveryByObserver: {},
  };
}

function ev(
  partial: Omit<CompanionEvent, "schemaVersion" | "visibility" | "createdAt"> &
    Partial<Pick<CompanionEvent, "visibility" | "createdAt">>,
): CompanionEvent {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    visibility: ["system"],
    createdAt: NOW,
    ...partial,
  };
}

function setupCampaign(chatId: string, campaignId: string, branchId = `branch:${chatId}`) {
  const dir = mkdtempSync(join(tmpdir(), "wmc-hist-"));
  const repo = new CampaignRepository(dir);
  repo.createCampaign({
    campaignId,
    branchId,
    packageDocumentId: `doc:${campaignId}`,
  });
  const history = new HistoryStore(repo);
  history.initSelection({ chatId, campaignId, branchId });
  const checkpoints = new CheckpointStore(history);
  return { dir, repo, history, checkpoints, chatId, campaignId, branchId };
}

function bootstrapTurn(
  history: HistoryStore,
  input: {
    chatId: string;
    campaignId: string;
    branchId: string;
    initialNpcs?: NpcState[];
    initialLocations?: LocationState[];
  },
) {
  const root = ev({
    eventId: "evt:root",
    campaignId: input.campaignId,
    branchId: input.branchId,
    parentEventId: null,
    expectedRevision: 0,
    anchor: null,
    payload: {
      type: "campaign.created",
      campaign: baseCampaign(input.campaignId, input.branchId),
      initialNpcs: input.initialNpcs ?? [npc("npc:raven", "nevermore-town-square")],
      initialLocations: input.initialLocations ?? [
        location("nevermore-town-square"),
        location("crypts-stair-mouth", false),
        location("crypts-door-1", false),
      ],
    },
  });
  const key: TurnDedupKey = {
    campaignId: input.campaignId,
    branchId: input.branchId,
    messageId: "__bootstrap__",
    swipeIndex: 0,
    contentHash: "bootstrap",
    processingVersion: PROCESSING_VERSION,
  };
  return history.commitTurnIdempotent({
    dedupKey: key,
    events: [root],
    parentAnchor: null,
    chatId: input.chatId,
  });
}

function anchor(
  chatId: string,
  messageId: string,
  swipeIndex: number,
  contentHash: string,
): TurnAnchor {
  return { chatId, messageId, swipeIndex, contentHash };
}

function dedup(
  campaignId: string,
  branchId: string,
  a: TurnAnchor,
): TurnDedupKey {
  return {
    campaignId,
    branchId,
    messageId: a.messageId,
    swipeIndex: a.swipeIndex,
    contentHash: a.contentHash,
    processingVersion: PROCESSING_VERSION,
  };
}

test("selected-swipe projection: unlock swipe effects remove and restore; other chat unchanged", () => {
  const a = setupCampaign("chat-a", "campaign:chat-a");
  const b = setupCampaign("chat-b", "campaign:chat-b");
  // Separate roots on same repo root would isolate — use distinct dirs (setup does).
  bootstrapTurn(a.history, a);
  bootstrapTurn(b.history, b);

  // Chat B places raven elsewhere and advances time — must stay isolated.
  const bMsg = anchor(b.chatId, "msg-b1", 0, "hash-b1");
  b.history.commitTurnIdempotent({
    dedupKey: dedup(b.campaignId, b.branchId, bMsg),
    parentAnchor: null,
    chatId: b.chatId,
    events: [
      ev({
        eventId: "evt:b-move",
        campaignId: b.campaignId,
        branchId: b.branchId,
        parentEventId: "evt:root",
        expectedRevision: 1,
        anchor: bMsg,
        payload: {
          type: "npc.moved",
          npcId: "npc:raven",
          placement: { kind: "at", locationId: "nevermore-town-square" },
        },
      }),
      ev({
        eventId: "evt:b-time",
        campaignId: b.campaignId,
        branchId: b.branchId,
        parentEventId: "evt:b-move",
        expectedRevision: 2,
        anchor: bMsg,
        payload: { type: "time.advanced", storyTime: "day-b-only" },
        random: { seed: "b-seed", outcome: "b-only" },
      }),
    ],
  });

  const unlockHash = "hash-unlock";
  const altHash = "hash-alt";
  const msgArrive = "msg-arrive";
  const arrive0 = anchor(a.chatId, msgArrive, 0, unlockHash);
  const arrive1 = anchor(a.chatId, msgArrive, 1, altHash);

  // Swipe 0: arrival + unlock crypt door
  a.history.commitTurnIdempotent({
    dedupKey: dedup(a.campaignId, a.branchId, arrive0),
    parentAnchor: null,
    chatId: a.chatId,
    events: [
      ev({
        eventId: "evt:arrive",
        campaignId: a.campaignId,
        branchId: a.branchId,
        parentEventId: "evt:root",
        expectedRevision: 1,
        anchor: arrive0,
        payload: {
          type: "npc.moved",
          npcId: "npc:raven",
          placement: { kind: "at", locationId: "crypts-stair-mouth" },
        },
      }),
      ev({
        eventId: "evt:unlock",
        campaignId: a.campaignId,
        branchId: a.branchId,
        parentEventId: "evt:arrive",
        expectedRevision: 2,
        anchor: arrive0,
        payload: {
          type: "location.access_changed",
          locationId: "crypts-door-1",
          access: { physicallyOpen: true },
        },
      }),
      ev({
        eventId: "evt:time-unlock",
        campaignId: a.campaignId,
        branchId: a.branchId,
        parentEventId: "evt:unlock",
        expectedRevision: 3,
        anchor: arrive0,
        payload: { type: "time.advanced", storyTime: "after-unlock" },
      }),
    ],
  });

  // Swipe 1: alternate — no unlock, raven stays in town, different time
  a.history.commitTurnIdempotent({
    dedupKey: dedup(a.campaignId, a.branchId, arrive1),
    parentAnchor: null,
    chatId: a.chatId,
    publishSelection: false,
    events: [
      ev({
        eventId: "evt:alt-stay",
        campaignId: a.campaignId,
        branchId: a.branchId,
        parentEventId: "evt:root",
        expectedRevision: 1,
        anchor: arrive1,
        payload: {
          type: "npc.moved",
          npcId: "npc:raven",
          placement: { kind: "at", locationId: "nevermore-town-square" },
        },
      }),
      ev({
        eventId: "evt:alt-time",
        campaignId: a.campaignId,
        branchId: a.branchId,
        parentEventId: "evt:alt-stay",
        expectedRevision: 2,
        anchor: arrive1,
        payload: { type: "time.advanced", storyTime: "alt-afternoon" },
      }),
    ],
  });

  // Currently selecting swipe 0 (last commit published it)
  let opened = a.repo.open(a.campaignId)!;
  assert.equal(opened.projection.locations["crypts-door-1"]?.access.physicallyOpen, true);
  assert.equal(opened.projection.storyTime, "after-unlock");
  assert.equal(
    opened.projection.npcs["npc:raven"]?.placement.kind === "at" &&
      opened.projection.npcs["npc:raven"].placement.locationId,
    "crypts-stair-mouth",
  );
  const unlockHashState = hashProjection(opened.projection);

  // Switch away from unlock swipe → dependent unlock/move/time removed
  a.history.selectSwipe({
    campaignId: a.campaignId,
    chatId: a.chatId,
    messageId: msgArrive,
    swipeIndex: 1,
    contentHash: altHash,
  });
  opened = a.repo.open(a.campaignId)!;
  assert.equal(opened.projection.locations["crypts-door-1"]?.access.physicallyOpen, false);
  assert.equal(opened.projection.storyTime, "alt-afternoon");
  assert.equal(
    opened.projection.npcs["npc:raven"]?.placement.kind === "at" &&
      opened.projection.npcs["npc:raven"].placement.locationId,
    "nevermore-town-square",
  );

  // Select unlock again → restores
  a.history.selectSwipe({
    campaignId: a.campaignId,
    chatId: a.chatId,
    messageId: msgArrive,
    swipeIndex: 0,
    contentHash: unlockHash,
  });
  opened = a.repo.open(a.campaignId)!;
  assert.equal(opened.projection.locations["crypts-door-1"]?.access.physicallyOpen, true);
  assert.equal(opened.projection.storyTime, "after-unlock");
  assert.equal(hashProjection(opened.projection), unlockHashState);

  // Other chat unchanged
  const other = b.repo.open(b.campaignId)!;
  assert.equal(other.projection.storyTime, "day-b-only");
  assert.equal(other.projection.locations["crypts-door-1"]?.access.physicallyOpen, false);
  assert.notEqual(other.projection.campaignId, a.campaignId);
});

test("idempotent retry does not double-advance time or move NPC twice", () => {
  const s = setupCampaign("chat-retry", "campaign:retry");
  bootstrapTurn(s.history, s);
  const a = anchor(s.chatId, "msg-1", 0, "h1");
  const events: CompanionEvent[] = [
    ev({
      eventId: "evt:move-once",
      campaignId: s.campaignId,
      branchId: s.branchId,
      parentEventId: "evt:root",
      expectedRevision: 1,
      anchor: a,
      payload: {
        type: "npc.moved",
        npcId: "npc:raven",
        placement: { kind: "at", locationId: "crypts-stair-mouth" },
      },
    }),
    ev({
      eventId: "evt:time-once",
      campaignId: s.campaignId,
      branchId: s.branchId,
      parentEventId: "evt:move-once",
      expectedRevision: 2,
      anchor: a,
      payload: { type: "time.advanced", storyTime: "t1" },
      random: { seed: "stable", outcome: 42 },
    }),
  ];

  const first = s.history.commitTurnIdempotent({
    dedupKey: dedup(s.campaignId, s.branchId, a),
    events,
    parentAnchor: null,
    chatId: s.chatId,
    recordedRandom: [{ seed: "stable", outcome: 42 }],
  });
  assert.equal(first.reused, false);

  const second = s.history.commitTurnIdempotent({
    dedupKey: dedup(s.campaignId, s.branchId, a),
    events,
    parentAnchor: null,
    chatId: s.chatId,
    recordedRandom: [{ seed: "reroll-attempt", outcome: 99 }],
  });
  assert.equal(second.reused, true);
  assert.equal(second.turn.recordedRandom[0]?.outcome, 42);
  assert.equal(second.turn.revisionAfter, first.turn.revisionAfter);

  const opened = s.repo.open(s.campaignId)!;
  assert.equal(opened.projection.revision, 3); // root + 2
  assert.equal(opened.projection.storyTime, "t1");
  // Exactly one move effect
  assert.equal(
    opened.projection.npcs["npc:raven"]?.placement.kind === "at" &&
      opened.projection.npcs["npc:raven"].placement.locationId,
    "crypts-stair-mouth",
  );
});

test("edited-message invalidation drops dependent effects", () => {
  const s = setupCampaign("chat-edit", "campaign:edit");
  bootstrapTurn(s.history, s);
  const m1 = anchor(s.chatId, "msg-1", 0, "old-hash");
  s.history.commitTurnIdempotent({
    dedupKey: dedup(s.campaignId, s.branchId, m1),
    parentAnchor: null,
    chatId: s.chatId,
    events: [
      ev({
        eventId: "evt:e1",
        campaignId: s.campaignId,
        branchId: s.branchId,
        parentEventId: "evt:root",
        expectedRevision: 1,
        anchor: m1,
        payload: { type: "time.advanced", storyTime: "before-edit" },
      }),
    ],
  });
  const m2 = anchor(s.chatId, "msg-2", 0, "dep-hash");
  s.history.commitTurnIdempotent({
    dedupKey: dedup(s.campaignId, s.branchId, m2),
    parentAnchor: m1,
    chatId: s.chatId,
    events: [
      ev({
        eventId: "evt:e2",
        campaignId: s.campaignId,
        branchId: s.branchId,
        parentEventId: "evt:e1",
        expectedRevision: 2,
        anchor: m2,
        payload: {
          type: "location.access_changed",
          locationId: "crypts-door-1",
          access: { physicallyOpen: true },
        },
      }),
    ],
  });

  assert.equal(s.repo.open(s.campaignId)!.projection.locations["crypts-door-1"]?.access.physicallyOpen, true);

  const result = s.history.invalidateEditedMessage({
    campaignId: s.campaignId,
    chatId: s.chatId,
    messageId: "msg-1",
    previousContentHash: "old-hash",
    newContentHash: "new-hash",
  });
  assert.ok(result.invalidated.length >= 1);
  const opened = s.repo.open(s.campaignId)!;
  assert.equal(opened.projection.storyTime, null);
  assert.equal(opened.projection.locations["crypts-door-1"]?.access.physicallyOpen, false);
  assert.equal(opened.projection.revision, 1); // bootstrap only
});

test("message deletion truncates lineage", () => {
  const s = setupCampaign("chat-del", "campaign:del");
  bootstrapTurn(s.history, s);
  const m1 = anchor(s.chatId, "msg-1", 0, "h1");
  s.history.commitTurnIdempotent({
    dedupKey: dedup(s.campaignId, s.branchId, m1),
    parentAnchor: null,
    chatId: s.chatId,
    events: [
      ev({
        eventId: "evt:d1",
        campaignId: s.campaignId,
        branchId: s.branchId,
        parentEventId: "evt:root",
        expectedRevision: 1,
        anchor: m1,
        payload: { type: "time.advanced", storyTime: "keep-or-drop" },
      }),
    ],
  });
  s.history.deleteMessage({
    campaignId: s.campaignId,
    chatId: s.chatId,
    messageId: "msg-1",
  });
  const opened = s.repo.open(s.campaignId)!;
  assert.equal(opened.projection.storyTime, null);
  assert.equal(opened.projection.revision, 1);
});

test("branch inheritance copies selected lineage without mutating source", () => {
  const s = setupCampaign("chat-src", "campaign:src");
  bootstrapTurn(s.history, s);
  const m1 = anchor(s.chatId, "msg-1", 0, "h1");
  s.history.commitTurnIdempotent({
    dedupKey: dedup(s.campaignId, s.branchId, m1),
    parentAnchor: null,
    chatId: s.chatId,
    events: [
      ev({
        eventId: "evt:br1",
        campaignId: s.campaignId,
        branchId: s.branchId,
        parentEventId: "evt:root",
        expectedRevision: 1,
        anchor: m1,
        payload: {
          type: "location.access_changed",
          locationId: "crypts-door-1",
          access: { physicallyOpen: true },
        },
      }),
    ],
  });
  const sourceHash = hashProjection(s.repo.open(s.campaignId)!.projection);

  const branched = s.history.inheritBranch({
    sourceCampaignId: s.campaignId,
    sourceChatId: s.chatId,
    targetCampaignId: "campaign:branch-child",
    targetChatId: "chat-child",
    targetBranchId: "branch:chat-child",
    packageDocumentId: "doc:branch-child",
  });
  assert.ok(branched.cursor.revision >= 1);

  const child = s.repo.open("campaign:branch-child")!;
  assert.equal(child.projection.locations["crypts-door-1"]?.access.physicallyOpen, true);
  assert.equal(child.projection.campaignId, "campaign:branch-child");

  // Source unchanged
  const src = s.repo.open(s.campaignId)!;
  assert.equal(hashProjection(src.projection), sourceHash);
  assert.equal(src.projection.campaignId, "campaign:src");
});

test("checkpoint restore and replay from nearest valid checkpoint", () => {
  const s = setupCampaign("chat-cp", "campaign:cp");
  bootstrapTurn(s.history, s);
  const m1 = anchor(s.chatId, "msg-1", 0, "h1");
  s.history.commitTurnIdempotent({
    dedupKey: dedup(s.campaignId, s.branchId, m1),
    parentAnchor: null,
    chatId: s.chatId,
    events: [
      ev({
        eventId: "evt:cp1",
        campaignId: s.campaignId,
        branchId: s.branchId,
        parentEventId: "evt:root",
        expectedRevision: 1,
        anchor: m1,
        payload: { type: "time.advanced", storyTime: "checkpointed" },
      }),
    ],
  });
  const cp = s.checkpoints.create({
    campaignId: s.campaignId,
    checkpointId: "cp:mid",
    label: "mid",
  });
  assert.equal(cp.eventCount, 2);

  const m2 = anchor(s.chatId, "msg-2", 0, "h2");
  s.history.commitTurnIdempotent({
    dedupKey: dedup(s.campaignId, s.branchId, m2),
    parentAnchor: m1,
    chatId: s.chatId,
    events: [
      ev({
        eventId: "evt:cp2",
        campaignId: s.campaignId,
        branchId: s.branchId,
        parentEventId: "evt:cp1",
        expectedRevision: 2,
        anchor: m2,
        payload: {
          type: "npc.moved",
          npcId: "npc:raven",
          placement: { kind: "at", locationId: "crypts-stair-mouth" },
        },
      }),
    ],
  });

  // Restore checkpoint only (no forward replay) — raven back, time checkpointed
  const restored = s.checkpoints.restore(s.campaignId, "cp:mid", { replayToSelection: false });
  assert.equal(restored.projection.storyTime, "checkpointed");
  // After restore without replay, selection truncated to checkpoint prefix — msg-2 gone
  assert.equal(restored.cursor.revision, 2);

  // Re-commit msg-2 path by selecting full lineage again via commits already archived:
  // re-add msg-2 to selection and replay from nearest
  const sel = s.history.getSelection(s.campaignId)!;
  // msg-2 turn still in archive; restore selection and replay
  sel.messageOrder = ["msg-1", "msg-2"];
  sel.selectedByMessage["msg-1"] = {
    swipeIndex: 0,
    contentHash: "h1",
    processingVersion: PROCESSING_VERSION,
  };
  sel.selectedByMessage["msg-2"] = {
    swipeIndex: 0,
    contentHash: "h2",
    processingVersion: PROCESSING_VERSION,
  };
  s.history.saveSelection(sel);

  const nearest = s.checkpoints.findNearestValid(s.campaignId);
  assert.ok(nearest);
  assert.equal(nearest!.checkpointId, "cp:mid");

  const replayed = s.checkpoints.replayFromNearest(s.campaignId);
  assert.equal(replayed.projection.storyTime, "checkpointed");
  assert.equal(
    replayed.projection.npcs["npc:raven"]?.placement.kind === "at" &&
      replayed.projection.npcs["npc:raven"].placement.locationId,
    "crypts-stair-mouth",
  );
  assert.ok(replayed.replayedEventCount >= 1 || replayed.projection.revision === 3);
});

test("durable pending-job recovery keeps recorded randomness stable across restart", () => {
  const s = setupCampaign("chat-pend", "campaign:pend");
  bootstrapTurn(s.history, s);
  const a = anchor(s.chatId, "msg-p", 0, "hp");
  const recorded: RandomResult[] = [{ seed: "job-seed", table: "encounter", outcome: "quiet" }];
  const proposed: CompanionEvent[] = [
    ev({
      eventId: "evt:pend-time",
      campaignId: s.campaignId,
      branchId: s.branchId,
      parentEventId: "evt:root",
      expectedRevision: 1,
      anchor: a,
      payload: { type: "time.advanced", storyTime: "from-pending" },
    }),
  ];
  const job = s.history.enqueuePendingJob({
    jobId: "job:1",
    dedupKey: dedup(s.campaignId, s.branchId, a),
    proposedEvents: proposed,
    recordedRandom: recorded,
  });
  assert.equal(job.recordedRandom[0]?.outcome, "quiet");

  // Simulate restart: new HistoryStore on same dir
  const history2 = new HistoryStore(s.repo);
  const checkpoints2 = new CheckpointStore(history2);
  const helpers = createLifecycleHelpers({
    history: history2,
    checkpoints: checkpoints2,
  });

  const recovered = helpers.recoverAfterRestart({
    campaignId: s.campaignId,
    chatId: s.chatId,
    commitReady: false,
  });
  assert.equal(recovered.recovered.length, 1);
  assert.equal(recovered.recovered[0]!.recordedRandom[0]?.outcome, "quiet");

  // Idempotent retry commits once with stable random
  const retry1 = history2.retryPendingJob({
    campaignId: s.campaignId,
    jobId: "job:1",
    chatId: s.chatId,
  });
  assert.equal(retry1.recordedRandom[0]?.outcome, "quiet");
  assert.equal(retry1.reused, false);

  // Second enqueue of same dedup should see committed turn
  const opened = s.repo.open(s.campaignId)!;
  assert.equal(opened.projection.storyTime, "from-pending");
  assert.equal(opened.projection.revision, 2);

  // Retry again via finalize path — no double advance
  const prep = helpers.prepare({
    chatId: s.chatId,
    campaignId: s.campaignId,
    branchId: s.branchId,
    messageId: a.messageId,
    swipeIndex: a.swipeIndex,
    contentHash: a.contentHash,
    proposedEvents: proposed,
    recordedRandom: [{ seed: "job-seed", table: "encounter", outcome: "SHOULD-NOT-APPLY" }],
  });
  assert.equal(prep.alreadyCommitted, true);
  const fin = helpers.finalize(prep, {
    chatId: s.chatId,
    messageId: a.messageId,
    swipeIndex: a.swipeIndex,
    contentHash: a.contentHash,
  });
  assert.equal(fin.committed, true);
  assert.match(fin.reason ?? "", /idempotent/);
  assert.equal(s.repo.open(s.campaignId)!.projection.revision, 2);
  assert.equal(s.repo.open(s.campaignId)!.projection.storyTime, "from-pending");
});

test("lifecycle selectHistory wires PROPOSED bridge without claiming Engine exports", async () => {
  const s = setupCampaign("chat-life", "campaign:life");
  bootstrapTurn(s.history, s);
  const m1 = anchor(s.chatId, "msg-1", 0, "ha");
  const m1b = anchor(s.chatId, "msg-1", 1, "hb");
  s.history.commitTurnIdempotent({
    dedupKey: dedup(s.campaignId, s.branchId, m1),
    parentAnchor: null,
    chatId: s.chatId,
    events: [
      ev({
        eventId: "evt:l1",
        campaignId: s.campaignId,
        branchId: s.branchId,
        parentEventId: "evt:root",
        expectedRevision: 1,
        anchor: m1,
        payload: { type: "time.advanced", storyTime: "swipe-a" },
      }),
    ],
  });
  s.history.commitTurnIdempotent({
    dedupKey: dedup(s.campaignId, s.branchId, m1b),
    parentAnchor: null,
    chatId: s.chatId,
    publishSelection: false,
    events: [
      ev({
        eventId: "evt:l1b",
        campaignId: s.campaignId,
        branchId: s.branchId,
        parentEventId: "evt:root",
        expectedRevision: 1,
        anchor: m1b,
        payload: { type: "time.advanced", storyTime: "swipe-b" },
      }),
    ],
  });

  const observed: string[] = [];
  const bridge = createProposedCompanionHostBridge({
    hostCapabilityApi: { major: 1, minor: 15 },
    observationOnly: true,
    observe: (e) => {
      observed.push(e);
      return true;
    },
  });
  assert.equal(bridge.status, "proposed-adapter");

  const helpers = createLifecycleHelpers({
    history: s.history,
    checkpoints: s.checkpoints,
    observe: (e) => {
      observed.push(`life:${e}`);
      return true;
    },
  });
  const bound = helpers.bindBridgeSelectHistory(bridge);
  const cursor = await bound.selectHistory({
    kind: "swipe",
    chatId: s.chatId,
    campaignId: s.campaignId,
    messageId: "msg-1",
    swipeIndex: 1,
    contentHash: "hb",
  });
  assert.equal(s.repo.open(s.campaignId)!.projection.storyTime, "swipe-b");
  assert.equal(cursor.campaignId, s.campaignId);
  assert.ok(observed.includes("life:swipe"));
});

test("events bind message/swipe/contentHash/branch/processingVersion in dedup key", () => {
  const key: TurnDedupKey = {
    campaignId: "campaign:x",
    branchId: "branch:x",
    messageId: "m",
    swipeIndex: 2,
    contentHash: "abc",
    processingVersion: PROCESSING_VERSION,
  };
  const formatted = formatDedupKey(key);
  assert.ok(formatted.includes("campaign:x"));
  assert.ok(formatted.includes("branch:x"));
  assert.ok(formatted.includes("|2|"));
  assert.ok(formatted.includes("abc"));
  assert.ok(formatted.includes(String(PROCESSING_VERSION)));
});
