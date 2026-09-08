/**
 * Task 10 — accepted-transcript extraction, proposal validation, and one-barrier commits.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  CONTRACT_SCHEMA_VERSION,
  type CampaignProjection,
  type CompanionEvent,
  type TurnAnchor,
} from "../src/contracts.ts";
import {
  createAcceptedExtractionCoordinator,
  extractAcceptedNarrative,
  hashAcceptedContent,
  type ExtractedProposal,
} from "../src/agents/extractor.ts";
import { validateExtractedProposals } from "../src/state/validator.ts";
import {
  CampaignRepository,
  HistoryStore,
  PROCESSING_VERSION,
} from "../src/state/index.ts";
import { reconcileAcceptedTurn } from "../src/state/reconciliation.ts";
import { resolveEffectiveMap, type SpatialDefinition } from "../src/world/index.ts";

const MAP: SpatialDefinition = {
  schemaVersion: 1,
  ownerMode: "roleplay",
  enabled: true,
  revision: 4,
  startingLocationId: "loc:quad",
  locations: [
    {
      id: "loc:quad",
      parentId: null,
      name: "Quad",
      kind: "place",
      status: "active",
      sortOrder: 0,
      links: [{ targetId: "loc:library", bidirectional: true, state: "available" }],
    },
    {
      id: "loc:library",
      parentId: null,
      name: "Library",
      kind: "place",
      status: "active",
      sortOrder: 1,
      links: [],
    },
    {
      id: "loc:crypt",
      parentId: null,
      name: "Crypt",
      kind: "place",
      status: "active",
      sortOrder: 2,
      links: [],
    },
  ],
};

function projection(revision = 1): CampaignProjection {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    campaignId: "campaign:test",
    branchId: "branch:main",
    revision,
    headEventId: "evt:root",
    storyTime: null,
    npcs: {
      "npc:wednesday": {
        npcId: "npc:wednesday",
        aliases: ["Wednesday"],
        placement: { kind: "at", locationId: "loc:quad" },
      },
    },
    locations: {},
    observers: {},
    supersededEventIds: [],
    checkpointIds: [],
  };
}

const ROOT_ANCHOR: TurnAnchor | null = null;

function setupHistory() {
  const repo = new CampaignRepository(mkdtempSync(join(tmpdir(), "wmc-task10-")));
  const campaignId = "campaign:test";
  const branchId = "branch:main";
  const chatId = "chat-task10";
  repo.createCampaign({
    campaignId,
    branchId,
    packageDocumentId: "doc:task10",
  });
  const history = new HistoryStore(repo);
  history.initSelection({ chatId, campaignId, branchId });
  const root: CompanionEvent = {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    eventId: "evt:root",
    campaignId,
    branchId,
    parentEventId: null,
    anchor: ROOT_ANCHOR,
    expectedRevision: 0,
    payload: {
      type: "campaign.created",
      campaign: {
        schemaVersion: CONTRACT_SCHEMA_VERSION,
        campaignId,
        displayName: "Task 10",
        activeBranchId: branchId,
        sourceWorldId: "world:test",
        sourceWorldVersion: "1",
        settings: {},
        observerIds: ["obs:player"],
        ownership: {
          packageId: "pkg:world-map-companion",
          documentKind: "world-map-companion-campaign",
        },
        checkpointIds: [],
        createdAt: "2026-09-08T00:00:00.000Z",
        updatedAt: "2026-09-08T00:00:00.000Z",
      },
      initialNpcs: [
        {
          npcId: "npc:wednesday",
          aliases: ["Wednesday"],
          placement: { kind: "at", locationId: "loc:quad" },
        },
      ],
    },
    visibility: ["system"],
    createdAt: "2026-09-08T00:00:00.000Z",
  };
  history.commitTurnIdempotent({
    dedupKey: {
      campaignId,
      branchId,
      messageId: "__bootstrap__",
      swipeIndex: 0,
      contentHash: "bootstrap",
      processingVersion: PROCESSING_VERSION,
    },
    events: [root],
    parentAnchor: null,
    chatId,
  });
  return { repo, history, campaignId, branchId, chatId };
}

test("extracts once from persisted accepted narrative while excluding non-narrative channels", async () => {
  const content = [
    "Wednesday crossed from the quad into the library.",
    "> Plan: Wednesday will later enter the crypt.",
    "<reasoning>Hidden chain of thought.</reasoning>",
    "<state-report>{\"npc\":\"Wednesday\",\"at\":\"crypt\"}</state-report>",
    "<!-- display-only: Wednesday is shown at the crypt -->",
  ].join("\n");
  const calls: string[] = [];

  const result = await extractAcceptedNarrative(
    {
      persistenceOperation: "chats.createMessage",
      accepted: true,
      generationState: "completed",
      chatId: "chat-1",
      messageId: "msg-7",
      swipeIndex: 0,
      contentHash: hashAcceptedContent(content),
      content,
    },
    async ({ narrative }) => {
      calls.push(narrative);
      return JSON.stringify({ proposals: [] });
    },
  );

  assert.equal(result.status, "ready");
  assert.deepEqual(calls, ["Wednesday crossed from the quad into the library."]);
  assert.deepEqual(result.anchor, {
    chatId: "chat-1",
    messageId: "msg-7",
    swipeIndex: 0,
    contentHash: hashAcceptedContent(content),
  });
  assert.equal(result.channel, "persisted-accepted-assistant-content");
});

test("malformed extractor output returns a repairable failure instead of proposals", async () => {
  const content = "Wednesday entered the library.";
  const result = await extractAcceptedNarrative(
    {
      persistenceOperation: "chats.addSwipe",
      accepted: true,
      generationState: "completed",
      chatId: "chat-1",
      messageId: "msg-7",
      swipeIndex: 1,
      contentHash: hashAcceptedContent(content),
      content,
    },
    async () => "{not-json",
  );

  assert.equal(result.status, "failed");
  assert.deepEqual(result.proposals, []);
  assert.equal(result.issues[0]?.code, "MALFORMED_OUTPUT");
  assert.match(result.issues[0]?.message ?? "", /JSON/);
  assert.equal(result.issues[0]?.repairable, true);
});

test("structurally malformed proposal objects fail extraction before validation", async () => {
  const content = "Wednesday entered the library.";
  const result = await extractAcceptedNarrative(
    {
      persistenceOperation: "chats.createMessage",
      accepted: true,
      generationState: "completed",
      chatId: "chat-1",
      messageId: "msg-bad-shape",
      swipeIndex: 0,
      contentHash: hashAcceptedContent(content),
      content,
    },
    async () => ({ proposals: [{ proposalId: "proposal:missing-fields" }] }),
  );

  assert.equal(result.status, "failed");
  assert.deepEqual(result.proposals, []);
  assert.equal(result.issues[0]?.code, "MALFORMED_OUTPUT");
  assert.match(result.issues[0]?.message ?? "", /proposal:missing-fields/);
});

test("malformed nested event payloads fail extraction before they can reach the reducer", async () => {
  const content = "Wednesday entered the library.";
  const result = await extractAcceptedNarrative(
    {
      persistenceOperation: "chats.createMessage",
      accepted: true,
      generationState: "completed",
      chatId: "chat-1",
      messageId: "msg-bad-payload",
      swipeIndex: 0,
      contentHash: hashAcceptedContent(content),
      content,
    },
    async () => ({
      proposals: [
        {
          proposalId: "proposal:bad-payload",
          domain: "npcPlacement",
          writer: "companion",
          payload: { type: "npc.moved" },
          sourceSpan: { start: 0, end: 30, quote: content },
          certainty: "observed",
          completion: "completed",
          visibility: ["player"],
        },
      ],
    }),
  );

  assert.equal(result.status, "failed");
  assert.equal(result.issues[0]?.code, "MALFORMED_OUTPUT");
  assert.match(result.issues[0]?.message ?? "", /placement|npcId/);
});

test("streaming and canceled generations never invoke extraction", async () => {
  for (const [generationState, wantCode] of [
    ["streaming", "INTERRUPTED_STREAM"],
    ["cancelled", "CANCELLED_GENERATION"],
  ] as const) {
    let calls = 0;
    const content = "Partial assistant content";
    const result = await extractAcceptedNarrative(
      {
        persistenceOperation: "chats.updateMessageContent",
        accepted: false,
        generationState,
        chatId: "chat-cancel",
        messageId: "msg-partial",
        swipeIndex: 0,
        contentHash: hashAcceptedContent(content),
        content,
      },
      async () => {
        calls += 1;
        return { proposals: [] };
      },
    );

    assert.equal(result.status, "ignored");
    assert.equal(result.issues[0]?.code, wantCode);
    assert.equal(calls, 0);
  }
});

test("display/SSE callbacks are not accepted as a canonical transcript channel", async () => {
  const content = "Wednesday entered the library.";
  let calls = 0;
  const result = await extractAcceptedNarrative(
    {
      persistenceOperation: "assistant_message_ready" as never,
      accepted: true,
      generationState: "completed",
      chatId: "chat-display",
      messageId: "msg-display",
      swipeIndex: 0,
      contentHash: hashAcceptedContent(content),
      content,
    },
    async () => {
      calls += 1;
      return { proposals: [] };
    },
  );

  assert.equal(result.status, "failed");
  assert.equal(result.issues[0]?.code, "NON_CANONICAL_CHANNEL");
  assert.equal(calls, 0);
});

test("duplicate accepted callbacks share one extraction by anchored content identity", async () => {
  const coordinator = createAcceptedExtractionCoordinator();
  const content = "Wednesday entered the library.";
  const accepted = {
    persistenceOperation: "chats.createMessage" as const,
    accepted: true,
    generationState: "completed" as const,
    chatId: "chat-dup",
    messageId: "msg-dup",
    swipeIndex: 0,
    contentHash: hashAcceptedContent(content),
    content,
  };
  let calls = 0;
  const invoke = async () => {
    calls += 1;
    await Promise.resolve();
    return { proposals: [] };
  };

  const [first, duplicate] = await Promise.all([
    coordinator.extract(accepted, invoke),
    coordinator.extract(accepted, invoke),
  ]);

  assert.equal(calls, 1);
  assert.strictEqual(first, duplicate);
});

test("validates exact evidence, aliases, place IDs, and feasible completed NPC movement", () => {
  const narrative = "Wednesday crossed from the quad into the library.";
  const proposal: ExtractedProposal = {
    proposalId: "proposal:move-wednesday",
    domain: "npcPlacement",
    writer: "companion",
    payload: {
      type: "npc.moved",
      npcId: "npc:wednesday",
      placement: { kind: "at", locationId: "loc:library" },
    },
    sourceSpan: { start: 0, end: 49, quote: narrative },
    certainty: "observed",
    completion: "completed",
    visibility: ["player"],
    subjectAlias: "Wednesday",
    placeAlias: "library",
  };

  const result = validateExtractedProposals({
    narrative,
    proposals: [proposal],
    projection: projection(),
    effectiveMap: resolveEffectiveMap(MAP),
    entityAliases: { Wednesday: ["npc:wednesday"] },
    placeAliases: { library: ["loc:library"] },
    acceptedActionIds: [],
  });

  assert.deepEqual(result.issues, []);
  assert.equal(result.accepted[0]?.resolvedSubjectId, "npc:wednesday");
  assert.equal(result.accepted[0]?.resolvedPlaceId, "loc:library");
});

test("a source span must exactly match accepted narrative coordinates", () => {
  const narrative = "Wednesday crossed from the quad into the library.";
  const proposal: ExtractedProposal = {
    proposalId: "proposal:invented-quote",
    domain: "npcPlacement",
    writer: "companion",
    payload: {
      type: "npc.moved",
      npcId: "npc:wednesday",
      placement: { kind: "at", locationId: "loc:library" },
    },
    sourceSpan: { start: 0, end: 49, quote: "Wednesday teleported directly into the library." },
    certainty: "observed",
    completion: "completed",
    visibility: ["player"],
  };
  const result = validateExtractedProposals({
    narrative,
    proposals: [proposal],
    projection: projection(),
    effectiveMap: resolveEffectiveMap(MAP),
    entityAliases: {},
    placeAliases: {},
    acceptedActionIds: [],
  });

  assert.deepEqual(result.accepted, []);
  assert.equal(result.issues[0]?.code, "INVALID_SOURCE_SPAN");
  assert.match(result.issues[0]?.message ?? "", /0:49/);
});

test("completed movement across a disconnected route is rejected against the effective map", () => {
  const narrative = "Wednesday crossed from the quad into the crypt.";
  const proposal: ExtractedProposal = {
    proposalId: "proposal:impossible-route",
    domain: "npcPlacement",
    writer: "companion",
    payload: {
      type: "npc.moved",
      npcId: "npc:wednesday",
      placement: { kind: "at", locationId: "loc:crypt" },
    },
    sourceSpan: { start: 0, end: 47, quote: narrative },
    certainty: "observed",
    completion: "completed",
    visibility: ["player"],
    subjectAlias: "Wednesday",
    placeAlias: "crypt",
  };
  const result = validateExtractedProposals({
    narrative,
    proposals: [proposal],
    projection: projection(),
    effectiveMap: resolveEffectiveMap(MAP),
    entityAliases: { Wednesday: ["npc:wednesday"] },
    placeAliases: { crypt: ["loc:crypt"] },
    acceptedActionIds: [],
  });

  assert.deepEqual(result.accepted, []);
  assert.equal(result.issues[0]?.code, "IMPOSSIBLE_ROUTE");
  assert.match(result.issues[0]?.message ?? "", /revision 4/);
});

test("ambiguous names are rejected with candidate IDs for repair", () => {
  const narrative = "Raven entered the library.";
  const proposal: ExtractedProposal = {
    proposalId: "proposal:ambiguous-raven",
    domain: "npcPlacement",
    writer: "companion",
    payload: {
      type: "npc.moved",
      npcId: "npc:raven-student",
      placement: { kind: "at", locationId: "loc:library" },
    },
    sourceSpan: { start: 0, end: 26, quote: narrative },
    certainty: "observed",
    completion: "completed",
    visibility: ["player"],
    subjectAlias: "Raven",
    placeAlias: "library",
  };
  const state = projection();
  state.npcs["npc:raven-student"] = {
    npcId: "npc:raven-student",
    placement: { kind: "at", locationId: "loc:quad" },
  };
  state.npcs["npc:raven-bird"] = {
    npcId: "npc:raven-bird",
    placement: { kind: "at", locationId: "loc:quad" },
  };

  const result = validateExtractedProposals({
    narrative,
    proposals: [proposal],
    projection: state,
    effectiveMap: resolveEffectiveMap(MAP),
    entityAliases: { Raven: ["npc:raven-student", "npc:raven-bird"] },
    placeAliases: { library: ["loc:library"] },
    acceptedActionIds: [],
  });

  assert.deepEqual(result.accepted, []);
  assert.equal(result.issues[0]?.code, "AMBIGUOUS_ALIAS");
  assert.match(result.issues[0]?.message ?? "", /npc:raven-student/);
  assert.match(result.issues[0]?.message ?? "", /npc:raven-bird/);
});

test("resolved aliases cannot be attached to a different entity or place ID", () => {
  const narrative = "Wednesday entered the library.";
  const state = projection();
  state.npcs["npc:enid"] = {
    npcId: "npc:enid",
    placement: { kind: "at", locationId: "loc:quad" },
  };
  const proposal: ExtractedProposal = {
    proposalId: "proposal:alias-mismatch",
    domain: "npcPlacement",
    writer: "companion",
    payload: {
      type: "npc.moved",
      npcId: "npc:enid",
      placement: { kind: "at", locationId: "loc:quad" },
    },
    sourceSpan: { start: 0, end: 30, quote: narrative },
    certainty: "observed",
    completion: "completed",
    visibility: ["player"],
    subjectAlias: "Wednesday",
    placeAlias: "library",
  };
  const result = validateExtractedProposals({
    narrative,
    proposals: [proposal],
    projection: state,
    effectiveMap: resolveEffectiveMap(MAP),
    entityAliases: { Wednesday: ["npc:wednesday"] },
    placeAliases: { library: ["loc:library"] },
    acceptedActionIds: [],
  });

  assert.deepEqual(result.accepted, []);
  assert.equal(result.issues[0]?.code, "ALIAS_ID_MISMATCH");
});

test("planned or interrupted movement is not treated as actual completion", () => {
  const narrative = "Wednesday planned to enter the library.";
  const proposal: ExtractedProposal = {
    proposalId: "proposal:planned",
    domain: "npcPlacement",
    writer: "companion",
    payload: {
      type: "npc.moved",
      npcId: "npc:wednesday",
      placement: { kind: "at", locationId: "loc:library" },
    },
    sourceSpan: { start: 0, end: 39, quote: narrative },
    certainty: "observed",
    completion: "planned",
    visibility: ["player"],
    subjectAlias: "Wednesday",
    placeAlias: "library",
  };
  const result = validateExtractedProposals({
    narrative,
    proposals: [proposal],
    projection: projection(),
    effectiveMap: resolveEffectiveMap(MAP),
    entityAliases: { Wednesday: ["npc:wednesday"] },
    placeAliases: { library: ["loc:library"] },
    acceptedActionIds: [],
  });

  assert.deepEqual(result.accepted, []);
  assert.equal(result.issues[0]?.code, "INCOMPLETE_CHANGE");
});

test("reported, inferred, or speculative claims cannot become certain actual state", () => {
  const narrative = "Enid guessed that Wednesday was already in the library.";
  const proposal: ExtractedProposal = {
    proposalId: "proposal:guess",
    domain: "npcPlacement",
    writer: "companion",
    payload: {
      type: "npc.moved",
      npcId: "npc:wednesday",
      placement: { kind: "at", locationId: "loc:library" },
    },
    sourceSpan: { start: 0, end: 55, quote: narrative },
    certainty: "inferred",
    completion: "completed",
    visibility: ["player"],
    subjectAlias: "Wednesday",
    placeAlias: "library",
  };
  const result = validateExtractedProposals({
    narrative,
    proposals: [proposal],
    projection: projection(),
    effectiveMap: resolveEffectiveMap(MAP),
    entityAliases: { Wednesday: ["npc:wednesday"] },
    placeAliases: { library: ["loc:library"] },
    acceptedActionIds: [],
  });

  assert.deepEqual(result.accepted, []);
  assert.equal(result.issues[0]?.code, "UNSUPPORTED_CERTAINTY");
});

test("player discovery requires player-visible earned evidence", () => {
  const narrative = "The player found the library.";
  const proposal: ExtractedProposal = {
    proposalId: "proposal:secret-leak",
    domain: "discovery",
    writer: "companion",
    payload: {
      type: "location.discovered",
      locationId: "loc:library",
      observerId: "obs:player",
    },
    sourceSpan: { start: 0, end: 29, quote: narrative },
    certainty: "observed",
    completion: "completed",
    visibility: ["author"],
    placeAlias: "library",
  };
  const result = validateExtractedProposals({
    narrative,
    proposals: [proposal],
    projection: projection(),
    effectiveMap: resolveEffectiveMap(MAP),
    entityAliases: {},
    placeAliases: { library: ["loc:library"] },
    acceptedActionIds: [],
  });

  assert.deepEqual(result.accepted, []);
  assert.equal(result.issues[0]?.code, "INVALID_VISIBILITY");
});

test("companion extraction cannot write a native or legacy-owned field", () => {
  const narrative = "Wednesday picked up the key.";
  const proposal: ExtractedProposal = {
    proposalId: "proposal:inventory-dual-write",
    domain: "inventory",
    writer: "companion",
    payload: {
      type: "npc.updated",
      npcId: "npc:wednesday",
      patch: { activity: "holding the key" },
    },
    sourceSpan: { start: 0, end: 28, quote: narrative },
    certainty: "observed",
    completion: "completed",
    visibility: ["player"],
    subjectAlias: "Wednesday",
  };
  const result = validateExtractedProposals({
    narrative,
    proposals: [proposal],
    projection: projection(),
    effectiveMap: resolveEffectiveMap(MAP),
    entityAliases: { Wednesday: ["npc:wednesday"] },
    placeAliases: {},
    acceptedActionIds: [],
  });

  assert.deepEqual(result.accepted, []);
  assert.equal(result.issues[0]?.code, "OWNERSHIP_CONFLICT");
  assert.match(result.issues[0]?.message ?? "", /legacy-tracker/);
});

test("assistant narration cannot invent an unaccepted player action", () => {
  const narrative = "You walk into the library.";
  const proposal: ExtractedProposal = {
    proposalId: "proposal:forced-player-move",
    domain: "playerFocalLocation",
    writer: "companion",
    payload: {
      type: "player.moved",
      actorId: "obs:player",
      fromLocationId: "loc:quad",
      toLocationId: "loc:library",
    },
    sourceSpan: { start: 0, end: 26, quote: narrative },
    certainty: "observed",
    completion: "completed",
    visibility: ["player"],
    placeAlias: "library",
    actionId: "action:walk-library",
  };
  const result = validateExtractedProposals({
    narrative,
    proposals: [proposal],
    projection: projection(),
    effectiveMap: resolveEffectiveMap(MAP),
    entityAliases: {},
    placeAliases: { library: ["loc:library"] },
    acceptedActionIds: [],
    nativeSpatial: {
      revision: 1,
      playerLocationId: "loc:library",
      completedActionIds: ["action:walk-library"],
    },
  });

  assert.deepEqual(result.accepted, []);
  assert.equal(result.issues[0]?.code, "PLAYER_AGENCY");
});

test("extracted player movement contradicting native spatial state is rejected", () => {
  const narrative = "You arrive in the library.";
  const proposal: ExtractedProposal = {
    proposalId: "proposal:spatial-conflict",
    domain: "playerFocalLocation",
    writer: "companion",
    payload: {
      type: "player.moved",
      actorId: "obs:player",
      fromLocationId: "loc:quad",
      toLocationId: "loc:library",
    },
    sourceSpan: { start: 0, end: 26, quote: narrative },
    certainty: "observed",
    completion: "completed",
    visibility: ["player"],
    placeAlias: "library",
    actionId: "action:walk-library",
  };
  const result = validateExtractedProposals({
    narrative,
    proposals: [proposal],
    projection: projection(),
    effectiveMap: resolveEffectiveMap(MAP),
    entityAliases: {},
    placeAliases: { library: ["loc:library"] },
    acceptedActionIds: ["action:walk-library"],
    nativeSpatial: {
      revision: 1,
      playerLocationId: "loc:crypt",
      completedActionIds: ["action:walk-library"],
    },
  });

  assert.deepEqual(result.accepted, []);
  assert.equal(result.issues[0]?.code, "NATIVE_SPATIAL_CONTRADICTION");
  assert.match(result.issues[0]?.message ?? "", /loc:crypt/);
});

test("turn barrier merges fresh native results and commits accepted evidence durably once", () => {
  const s = setupHistory();
  const narrative = "Wednesday crossed from the quad into the library.";
  const anchor = {
    chatId: s.chatId,
    messageId: "msg-move",
    swipeIndex: 0,
    contentHash: hashAcceptedContent(narrative),
  };
  const proposal: ExtractedProposal = {
    proposalId: "proposal:move-wednesday",
    domain: "npcPlacement",
    writer: "companion",
    payload: {
      type: "npc.moved",
      npcId: "npc:wednesday",
      placement: { kind: "at", locationId: "loc:library" },
    },
    sourceSpan: { start: 0, end: 49, quote: narrative },
    certainty: "observed",
    completion: "completed",
    visibility: ["player"],
    subjectAlias: "Wednesday",
    placeAlias: "library",
  };
  const input = {
    history: s.history,
    campaignId: s.campaignId,
    branchId: s.branchId,
    chatId: s.chatId,
    baseRevision: 1,
    extraction: {
      status: "ready" as const,
      channel: "persisted-accepted-assistant-content" as const,
      anchor,
      narrative,
      proposals: [proposal],
      issues: [],
    },
    validation: {
      effectiveMap: resolveEffectiveMap(MAP),
      entityAliases: { Wednesday: ["npc:wednesday"] },
      placeAliases: { library: ["loc:library"] },
      acceptedActionIds: [] as string[],
    },
    nativeResults: [
      {
        resultId: "native:quest-snapshot",
        domain: "quests" as const,
        owner: "legacy-tracker" as const,
        baseCampaignRevision: 1,
        status: "completed" as const,
      },
    ],
  };

  const first = reconcileAcceptedTurn(input);
  const duplicate = reconcileAcceptedTurn(input);

  assert.equal(first.status, "committed");
  assert.equal(first.reused, false);
  assert.deepEqual(first.nativeAcceptedIds, ["native:quest-snapshot"]);
  assert.equal(duplicate.status, "committed");
  assert.equal(duplicate.reused, true);
  const opened = s.repo.open(s.campaignId)!;
  assert.equal(opened.projection.revision, 2);
  assert.deepEqual(opened.projection.npcs["npc:wednesday"]?.placement, {
    kind: "at",
    locationId: "loc:library",
  });
  assert.equal(s.history.listCommittedTurns(s.campaignId).length, 2);
});

test("malformed extraction leaves a visible repairable pending issue without campaign mutation", () => {
  const s = setupHistory();
  const content = "Wednesday entered the library.";
  const result = reconcileAcceptedTurn({
    history: s.history,
    campaignId: s.campaignId,
    branchId: s.branchId,
    chatId: s.chatId,
    baseRevision: 1,
    extraction: {
      status: "failed",
      channel: "persisted-accepted-assistant-content",
      anchor: {
        chatId: s.chatId,
        messageId: "msg-malformed",
        swipeIndex: 0,
        contentHash: hashAcceptedContent(content),
      },
      narrative: content,
      proposals: [],
      issues: [
        {
          code: "MALFORMED_OUTPUT",
          message: "malformed extractor output: unexpected token",
          repairable: true,
        },
      ],
    },
    validation: {
      effectiveMap: resolveEffectiveMap(MAP),
      entityAliases: {},
      placeAliases: {},
      acceptedActionIds: [],
    },
  });

  assert.equal(result.status, "pending");
  assert.equal(result.issues[0]?.code, "EXTRACTION_FAILED");
  assert.equal(result.pendingJobId, "job:reconcile-msg-malformed-0");
  const pending = s.history.listPendingJobs(s.campaignId);
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.status, "failed");
  assert.match(pending[0]?.lastError ?? "", /unexpected token/);
  assert.equal(s.repo.open(s.campaignId)?.projection.revision, 1);
  assert.equal(s.history.listCommittedTurns(s.campaignId).length, 1);
});

test("canceled generation discards assistant-dependent work instead of creating a pending job", () => {
  const s = setupHistory();
  const content = "Partial assistant content";
  const result = reconcileAcceptedTurn({
    history: s.history,
    campaignId: s.campaignId,
    branchId: s.branchId,
    chatId: s.chatId,
    baseRevision: 1,
    extraction: {
      status: "ignored",
      channel: "persisted-accepted-assistant-content",
      anchor: {
        chatId: s.chatId,
        messageId: "msg-cancelled",
        swipeIndex: 0,
        contentHash: hashAcceptedContent(content),
      },
      narrative: content,
      proposals: [],
      issues: [
        {
          code: "CANCELLED_GENERATION",
          message: "response is not accepted and complete",
          repairable: true,
        },
      ],
    },
    validation: {
      effectiveMap: resolveEffectiveMap(MAP),
      entityAliases: {},
      placeAliases: {},
      acceptedActionIds: [],
    },
  });

  assert.equal(result.status, "ignored");
  assert.equal(s.history.listPendingJobs(s.campaignId).length, 0);
  assert.equal(s.repo.open(s.campaignId)?.projection.revision, 1);
});

test("stale native tracker results block the coherent batch and remain repairable", () => {
  const s = setupHistory();
  const narrative = "Wednesday crossed from the quad into the library.";
  const proposal: ExtractedProposal = {
    proposalId: "proposal:move-with-stale-tracker",
    domain: "npcPlacement",
    writer: "companion",
    payload: {
      type: "npc.moved",
      npcId: "npc:wednesday",
      placement: { kind: "at", locationId: "loc:library" },
    },
    sourceSpan: { start: 0, end: 49, quote: narrative },
    certainty: "observed",
    completion: "completed",
    visibility: ["player"],
    subjectAlias: "Wednesday",
    placeAlias: "library",
  };
  const result = reconcileAcceptedTurn({
    history: s.history,
    campaignId: s.campaignId,
    branchId: s.branchId,
    chatId: s.chatId,
    baseRevision: 1,
    extraction: {
      status: "ready",
      channel: "persisted-accepted-assistant-content",
      anchor: {
        chatId: s.chatId,
        messageId: "msg-stale-native",
        swipeIndex: 0,
        contentHash: hashAcceptedContent(narrative),
      },
      narrative,
      proposals: [proposal],
      issues: [],
    },
    validation: {
      effectiveMap: resolveEffectiveMap(MAP),
      entityAliases: { Wednesday: ["npc:wednesday"] },
      placeAliases: { library: ["loc:library"] },
      acceptedActionIds: [],
    },
    nativeResults: [
      {
        resultId: "native:stale-quest",
        domain: "quests",
        owner: "legacy-tracker",
        baseCampaignRevision: 0,
        status: "completed",
      },
    ],
  });

  assert.equal(result.status, "pending");
  assert.equal(result.issues[0]?.code, "STALE_NATIVE_TRACKER");
  assert.equal(result.issues[0]?.resultId, "native:stale-quest");
  assert.equal(s.repo.open(s.campaignId)?.projection.revision, 1);
  assert.deepEqual(s.repo.open(s.campaignId)?.projection.npcs["npc:wednesday"]?.placement, {
    kind: "at",
    locationId: "loc:quad",
  });
  assert.equal(s.history.listPendingJobs(s.campaignId)[0]?.status, "failed");
});

test("native spatial contradiction is retained at the barrier with no partial commit", () => {
  const s = setupHistory();
  const narrative = "You arrive in the library.";
  const proposal: ExtractedProposal = {
    proposalId: "proposal:barrier-spatial-conflict",
    domain: "playerFocalLocation",
    writer: "companion",
    payload: {
      type: "player.moved",
      actorId: "obs:player",
      fromLocationId: "loc:quad",
      toLocationId: "loc:library",
    },
    sourceSpan: { start: 0, end: 26, quote: narrative },
    certainty: "observed",
    completion: "completed",
    visibility: ["player"],
    placeAlias: "library",
    actionId: "action:walk-library",
  };
  const result = reconcileAcceptedTurn({
    history: s.history,
    campaignId: s.campaignId,
    branchId: s.branchId,
    chatId: s.chatId,
    baseRevision: 1,
    extraction: {
      status: "ready",
      channel: "persisted-accepted-assistant-content",
      anchor: {
        chatId: s.chatId,
        messageId: "msg-spatial-conflict",
        swipeIndex: 0,
        contentHash: hashAcceptedContent(narrative),
      },
      narrative,
      proposals: [proposal],
      issues: [],
    },
    validation: {
      effectiveMap: resolveEffectiveMap(MAP),
      entityAliases: {},
      placeAliases: { library: ["loc:library"] },
      acceptedActionIds: ["action:walk-library"],
      nativeSpatial: {
        revision: 1,
        playerLocationId: "loc:crypt",
        completedActionIds: ["action:walk-library"],
      },
    },
  });

  assert.equal(result.status, "pending");
  assert.equal(result.issues[0]?.code, "NATIVE_SPATIAL_CONTRADICTION");
  assert.equal(s.repo.open(s.campaignId)?.projection.revision, 1);
  assert.equal(s.history.listCommittedTurns(s.campaignId).length, 1);
  assert.equal(s.history.listPendingJobs(s.campaignId)[0]?.status, "failed");
});

test("revision conflict rebases against fresh selected state without overwriting it", () => {
  const s = setupHistory();
  const concurrentAnchor = {
    chatId: s.chatId,
    messageId: "msg-concurrent",
    swipeIndex: 0,
    contentHash: "hash-concurrent",
  };
  s.history.commitTurnIdempotent({
    dedupKey: {
      campaignId: s.campaignId,
      branchId: s.branchId,
      messageId: concurrentAnchor.messageId,
      swipeIndex: 0,
      contentHash: concurrentAnchor.contentHash,
      processingVersion: PROCESSING_VERSION,
    },
    events: [
      {
        schemaVersion: CONTRACT_SCHEMA_VERSION,
        eventId: "evt:concurrent-time",
        campaignId: s.campaignId,
        branchId: s.branchId,
        parentEventId: "evt:root",
        anchor: concurrentAnchor,
        expectedRevision: 1,
        payload: { type: "time.advanced", storyTime: "noon" },
        visibility: ["system"],
        createdAt: "2026-09-08T00:01:00.000Z",
      },
    ],
    parentAnchor: null,
    chatId: s.chatId,
  });

  const narrative = "Wednesday crossed from the quad into the library.";
  const result = reconcileAcceptedTurn({
    history: s.history,
    campaignId: s.campaignId,
    branchId: s.branchId,
    chatId: s.chatId,
    baseRevision: 1,
    extraction: {
      status: "ready",
      channel: "persisted-accepted-assistant-content",
      anchor: {
        chatId: s.chatId,
        messageId: "msg-after-conflict",
        swipeIndex: 0,
        contentHash: hashAcceptedContent(narrative),
      },
      narrative,
      proposals: [
        {
          proposalId: "proposal:rebase-move",
          domain: "npcPlacement",
          writer: "companion",
          payload: {
            type: "npc.moved",
            npcId: "npc:wednesday",
            placement: { kind: "at", locationId: "loc:library" },
          },
          sourceSpan: { start: 0, end: 49, quote: narrative },
          certainty: "observed",
          completion: "completed",
          visibility: ["player"],
          subjectAlias: "Wednesday",
          placeAlias: "library",
        },
      ],
      issues: [],
    },
    validation: {
      effectiveMap: resolveEffectiveMap(MAP),
      entityAliases: { Wednesday: ["npc:wednesday"] },
      placeAliases: { library: ["loc:library"] },
      acceptedActionIds: [],
    },
  });

  assert.equal(result.status, "committed");
  assert.equal(result.revisionRetries, 1);
  assert.equal(result.rebasedFromRevision, 1);
  const opened = s.repo.open(s.campaignId)!;
  assert.equal(opened.projection.revision, 3);
  assert.equal(opened.projection.storyTime, "noon");
  assert.deepEqual(opened.projection.npcs["npc:wednesday"]?.placement, {
    kind: "at",
    locationId: "loc:library",
  });
});
