import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clearLocalProposedPromptContributors,
  collectLocalProposedPromptContext,
  createProposedCompanionHostBridge,
  detectSupportedVersion,
  FIELD_DOMAIN_OWNERS,
  registerReadOnlyPromptContributor,
  type AbortRegistryLike,
} from "../src/host/index.ts";
import { createNoopLifecycleObserver } from "../compatibility/noop-lifecycle-observer.ts";

const PINNED_API = { major: 1, minor: 15 } as const;

function createAbortRegistry(): AbortRegistryLike & {
  register(chatId: string): AbortController;
  isAborted(chatId: string): boolean;
  clear(chatId: string): void;
} {
  const active = new Map<string, { abortController: AbortController }>();
  return {
    register(chatId: string) {
      const abortController = new AbortController();
      active.set(chatId, { abortController });
      return abortController;
    },
    abort(chatId: string) {
      const entry = active.get(chatId);
      if (!entry) return { aborted: false, reason: "No active generation for this chat" };
      entry.abortController.abort();
      return { aborted: true };
    },
    clear(chatId: string) {
      active.delete(chatId);
    },
    isAborted(chatId: string) {
      return active.get(chatId)?.abortController.signal.aborted === true;
    },
  };
}

test("supported-version detection fails closed on missing or mismatched host API", () => {
  assert.equal(detectSupportedVersion(null).ok, false);
  assert.equal(detectSupportedVersion(undefined).ok, false);
  assert.equal(detectSupportedVersion({ major: 2, minor: 0 }).ok, false);
  assert.equal(detectSupportedVersion({ major: 1, minor: 14 }).ok, false);
  const ok = detectSupportedVersion(PINNED_API);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.host.minor, 15);
  }
  assert.throws(
    () =>
      createProposedCompanionHostBridge({
        hostCapabilityApi: { major: 1, minor: 10 },
      }),
    /supported-version/,
  );
});

test("no-op prepare/finalize path writes no campaign state and leaves ticket closed", async () => {
  const observer = createNoopLifecycleObserver();
  observer.enable();
  let writeCalls = 0;
  const bridge = createProposedCompanionHostBridge({
    hostCapabilityApi: PINNED_API,
    observationOnly: true,
    observe: (event, detail) => observer.observe(event, detail),
    writeCampaignDocument: () => {
      writeCalls += 1;
      throw new Error("must not write");
    },
    newTicketId: () => "ticket-noop-1",
  });

  const ticket = await bridge.prepareTurn({
    chatId: "chat-1",
    messageId: "msg-1",
    contentHash: "cabc",
  });
  assert.equal(ticket.id, "ticket-noop-1");
  assert.equal(ticket.observationOnly, true);
  assert.equal(bridge.getOpenTicket("ticket-noop-1")?.id, "ticket-noop-1");

  const result = await bridge.finalizeTurn(ticket, {
    chatId: "chat-1",
    messageId: "msg-1",
    swipeIndex: 0,
    contentHash: "cabc",
  });
  assert.equal(result.committed, false);
  assert.equal(result.observationOnly, true);
  assert.equal(writeCalls, 0);
  assert.equal(bridge.getOpenTicket("ticket-noop-1"), undefined);
  assert.equal(observer.getSnapshot().counts.accept, 1);
  assert.equal(observer.getSnapshot().companionStateWrites, 0);
});

test("cancelTurn clears ticket and aborts via injected abort registry", async () => {
  const abortRegistry = createAbortRegistry();
  const observer = createNoopLifecycleObserver();
  observer.enable();
  let abortCalls = 0;
  let clearCalls = 0;
  const tracked = {
    abort(chatId: string) {
      abortCalls += 1;
      return abortRegistry.abort(chatId);
    },
    clear(chatId: string) {
      clearCalls += 1;
      abortRegistry.clear(chatId);
    },
  };
  const bridge = createProposedCompanionHostBridge({
    hostCapabilityApi: PINNED_API,
    observationOnly: true,
    abortRegistry: tracked,
    observe: (event, detail) => observer.observe(event, detail),
    newTicketId: () => "ticket-cancel-1",
  });

  const ticket = await bridge.prepareTurn({ chatId: "chat-abort" });
  const controller = abortRegistry.register("chat-abort");
  assert.equal(controller.signal.aborted, false);

  await bridge.cancelTurn(ticket.id);
  assert.equal(bridge.getOpenTicket("ticket-cancel-1"), undefined);
  assert.equal(abortCalls, 1);
  assert.equal(clearCalls, 1);
  assert.equal(controller.signal.aborted, true);
  // Entry removed after clear — subsequent abort finds nothing
  assert.equal(abortRegistry.abort("chat-abort").aborted, false);
  assert.equal(observer.getSnapshot().counts.cancel, 1);
});

test("field-ownership arbitration refuses companion dual-write of native domains", () => {
  const bridge = createProposedCompanionHostBridge({ hostCapabilityApi: PINNED_API });
  assert.equal(bridge.getFieldOwner("playerFocalLocation"), "native");
  assert.equal(bridge.getFieldOwner("npcPlacement"), "companion");
  assert.equal(FIELD_DOMAIN_OWNERS.geography, "world-maps");

  const refused = bridge.arbitrateFieldWrite("playerFocalLocation", "companion");
  assert.equal(refused.allowed, false);
  assert.match(refused.reason ?? "", /dual-write/);
  assert.throws(() => bridge.assertFieldWriteAllowed("inventory", "companion"), /dual-write|owned by/);

  const allowed = bridge.arbitrateFieldWrite("npcPlacement", "companion");
  assert.equal(allowed.allowed, true);
});

test("resolvePresetModeProfile uses choice variable values, not display text", () => {
  const bridge = createProposedCompanionHostBridge({
    hostCapabilityApi: PINNED_API,
    companionMode: "observe",
    companionProfile: "exploration-mystery",
  });

  const fromChat = bridge.resolvePresetModeProfile({
    chatChoices: { state_mode: "INTERNAL" },
    presetDefaults: { state_mode: "AGENTS" },
  });
  assert.equal(fromChat.stateMode, "INTERNAL");
  assert.equal(fromChat.source.stateMode, "chatChoices");
  assert.equal(fromChat.companionProfile, "exploration-mystery");

  const fromDefaults = bridge.resolvePresetModeProfile({
    presetDefaults: { state_mode: "NONE" },
  });
  assert.equal(fromDefaults.stateMode, "NONE");
  assert.equal(fromDefaults.source.stateMode, "presetDefaults");

  // Must not invent from display labels — unknown key ignored
  const fallback = bridge.resolvePresetModeProfile({
    chatChoices: { "State Mode": "Agents (full)" },
  });
  assert.equal(fallback.stateMode, "AGENTS");
  assert.equal(fallback.source.stateMode, "fallback");
});

test("read-only prompt contributor uses PROPOSED local adapter when Engine API absent", async () => {
  clearLocalProposedPromptContributors();
  const bridge = createProposedCompanionHostBridge({
    hostCapabilityApi: PINNED_API,
    observationOnly: true,
  });

  const reg = bridge.registerPromptContributor(() => "  scene briefing  ");
  assert.equal(reg.status, "proposed-adapter");

  const blocks = await collectLocalProposedPromptContext({
    chatId: "c1",
    chatMeta: {},
    mode: "roleplay",
  });
  assert.deepEqual(blocks, ["scene briefing"]);
  reg.unregister();
  const after = await collectLocalProposedPromptContext({
    chatId: "c1",
    chatMeta: {},
    mode: "roleplay",
  });
  assert.deepEqual(after, []);
});

test("prompt contributor wires through injected Engine registerCapabilityPromptContext", () => {
  clearLocalProposedPromptContributors();
  const registered = new Map<string, unknown>();
  const bridge = createProposedCompanionHostBridge({
    hostCapabilityApi: PINNED_API,
    registerCapabilityPromptContext: (packageId, contributor) => {
      registered.set(packageId, contributor);
      return () => registered.delete(packageId);
    },
  });
  const reg = bridge.registerPromptContributor(() => "brief");
  assert.equal(reg.status, "wired");
  assert.equal(registered.has("world-map-companion"), true);
  reg.unregister();
  assert.equal(registered.has("world-map-companion"), false);
});

test("selectHistory observes swipe/branch without campaign writes", async () => {
  const observer = createNoopLifecycleObserver();
  observer.enable();
  let writes = 0;
  const bridge = createProposedCompanionHostBridge({
    hostCapabilityApi: PINNED_API,
    observationOnly: true,
    observe: (e, d) => observer.observe(e, d),
    writeCampaignDocument: () => {
      writes += 1;
      return null;
    },
  });
  const cursor = await bridge.selectHistory({
    kind: "swipe",
    chatId: "chat-1",
    messageId: "msg-1",
    swipeIndex: 1,
  });
  assert.equal(cursor.campaignId, "campaign:chat-1");
  assert.equal(observer.getSnapshot().counts.swipe, 1);
  assert.equal(writes, 0);

  await bridge.selectHistory({
    kind: "branch",
    chatId: "chat-1",
    branchChatId: "chat-2",
  });
  assert.equal(observer.getSnapshot().counts.branch, 1);
  assert.equal(writes, 0);
});

test("direct registerReadOnlyPromptContributor stays proposed without Engine inject", () => {
  clearLocalProposedPromptContributors();
  const reg = registerReadOnlyPromptContributor({
    packageId: "world-map-companion",
    getBriefingText: () => null,
  });
  assert.equal(reg.status, "proposed-adapter");
  reg.unregister();
});
