/**
 * Task 2: in-process no-op companion lifecycle observation against pinned Engine.
 *
 * Drives the same chats.storage / abort-registry code paths that HTTP routes use
 * (createMessage, addSwipe, updateMessageContent, setActiveSwipe, branch copy,
 * removeMessage, AbortController abort). Not a full HTTP generate server + LLM.
 * Writes compatibility/lifecycle-observation.json only; never mutates source/presets.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createNoopLifecycleObserver,
  LIFECYCLE_EVENTS,
  type LifecycleEvent,
} from "../compatibility/noop-lifecycle-observer.ts";

const here = dirname(fileURLToPath(import.meta.url));
const companionRoot = resolve(here, "..");
const engineRoot = resolve(companionRoot, "../../../Marinara-Engine");
const observationPath = join(companionRoot, "compatibility/lifecycle-observation.json");
const installedRuntimePath = join(companionRoot, "compatibility/installed-runtime.json");

const ENGINE_REV = "9bbee87d1a44c33f704977bd8c25aafbec9b85aa";
const AGENTS_REV = "ee1a4a01d1091a9f5e4086c58f608e401aa1d879";
const PACKAGE_ID = "world-map-companion";

/** Mirrors generate.routes activeGenerations abort ownership (in-process, no HTTP). */
function createAbortRegistry() {
  const active = new Map<string, { abortController: AbortController }>();
  return {
    register(chatId: string) {
      const abortController = new AbortController();
      active.set(chatId, { abortController });
      return abortController;
    },
    abort(chatId: string): { aborted: boolean; reason?: string } {
      const entry = active.get(chatId);
      if (!entry) return { aborted: false, reason: "No active generation for this chat" };
      entry.abortController.abort();
      // Keep registered until caller clears (mirrors identity-checked finally).
      return { aborted: true };
    },
    clear(chatId: string) {
      active.delete(chatId);
    },
    isAborted(chatId: string): boolean {
      return active.get(chatId)?.abortController.signal.aborted === true;
    },
  };
}

async function main() {
  const storageDir = mkdtempSync(join(tmpdir(), "wmc-lifecycle-"));
  process.env.FILE_STORAGE_DIR = storageDir;

  const { createFileNativeDB } = await import(
    resolve(engineRoot, "packages/server/src/db/file-backed-store.ts")
  );
  const { createChatsStorage } = await import(
    resolve(engineRoot, "packages/server/src/services/storage/chats.storage.ts")
  );
  const { createCapabilityPersistenceHost } = await import(
    resolve(engineRoot, "packages/server/src/services/capability-packages/capability-persistence.service.ts")
  );
  const { newId } = await import(resolve(engineRoot, "packages/server/src/utils/id-generator.ts"));

  const db = await createFileNativeDB();
  const chats = createChatsStorage(db);
  const persistence = createCapabilityPersistenceHost(db);
  const abortRegistry = createAbortRegistry();
  const observer = createNoopLifecycleObserver();

  let documentCreateAttempts = 0;
  const originalCreate = persistence.documents.create.bind(persistence.documents);
  persistence.documents.create = async (input: Parameters<typeof originalCreate>[0]) => {
    documentCreateAttempts += 1;
    // Count as companion state write if our package id is targeted.
    if (input.packageId === PACKAGE_ID) {
      try {
        observer.writeCampaignDocument({ kind: String(input.kind), data: input.data });
      } catch {
        // expected throw from no-op observer; still block the real write
        throw new Error("blocked companion campaign document write in no-op harness");
      }
    }
    return originalCreate(input);
  };

  const owners: Record<LifecycleEvent, string> = {
    accept: "chats.storage.createMessage (generate.routes persist path)",
    cancel: "AbortController.abort via in-process registry mirroring POST /api/generate/abort",
    retry: "chats.storage.addSwipe (regenerateMessageId / retry persist path)",
    edit: "chats.storage.updateMessageContent (PATCH .../messages/:id)",
    swipe: "chats.storage.setActiveSwipe (PUT .../active-swipe)",
    branch: "chats.storage.create + createMessagesBatch + patchMetadata (POST .../branch)",
    delete: "chats.storage.removeMessage (DELETE .../messages/:id)",
  };

  observer.enable();

  // --- Roleplay-like chat lifecycle (exactly once each) ---
  const chat = await chats.create({
    name: "WMC Task2 lifecycle chat",
    mode: "roleplay",
    characterIds: ["char-wmc-1"],
    promptPresetId: null,
    connectionId: null,
  });
  if (!chat) throw new Error("failed to create chat");

  await chats.createMessage({
    chatId: chat.id,
    role: "user",
    characterId: null,
    content: "We walk into Nevermore square.",
  });

  // 1. accept — assistant turn persisted (same storage as generate route)
  const assistant = await chats.createMessage({
    chatId: chat.id,
    role: "assistant",
    characterId: "char-wmc-1",
    content: "The square bustles under autumn light.",
  });
  if (!assistant) throw new Error("failed to create assistant message");
  observer.observe("accept", {
    chatId: chat.id,
    messageId: assistant.id,
    owner: owners.accept,
  });

  // 2. cancel — register a synthetic in-flight generation, then abort
  abortRegistry.register(chat.id);
  const abortResult = abortRegistry.abort(chat.id);
  if (!abortResult.aborted || !abortRegistry.isAborted(chat.id)) {
    throw new Error("abort registry failed to abort");
  }
  observer.observe("cancel", {
    chatId: chat.id,
    aborted: true,
    owner: owners.cancel,
    note: "In-process AbortController path; not full HTTP generate + LLM stream",
  });
  abortRegistry.clear(chat.id);

  // 3. retry — regenerate as new swipe (addSwipe)
  const swipeAdd = await chats.addSwipe(assistant.id, "The square is quieter on a second take.");
  observer.observe("retry", {
    chatId: chat.id,
    messageId: assistant.id,
    swipeIndex: swipeAdd.index,
    owner: owners.retry,
  });

  // 4. edit — patch message content
  await chats.updateMessageContent(assistant.id, "The square bustles — edited narration.");
  observer.observe("edit", {
    chatId: chat.id,
    messageId: assistant.id,
    owner: owners.edit,
  });

  // 5. swipe — select prior swipe (active-swipe)
  await chats.setActiveSwipe(assistant.id, 0);
  observer.observe("swipe", {
    chatId: chat.id,
    messageId: assistant.id,
    activeSwipeIndex: 0,
    owner: owners.swipe,
  });

  // 6. branch — minimal copy of chats.routes POST /:id/branch using same storage APIs
  let groupId = chat.groupId as string | null;
  if (!groupId) {
    groupId = newId();
    await chats.update(chat.id, { groupId });
  }
  const sourceMessages = await chats.listMessages(chat.id);
  const branchChat = await chats.create({
    name: chat.name,
    mode: "roleplay",
    characterIds: ["char-wmc-1"],
    groupId,
    promptPresetId: null,
    connectionId: null,
  });
  if (!branchChat) throw new Error("failed to create branch chat");
  const copiedInputs = [];
  for (const msg of sourceMessages) {
    const swipes = await chats.getSwipes(msg.id);
    copiedInputs.push({
      role: msg.role as "user" | "assistant" | "system",
      characterId: msg.characterId,
      content: msg.content,
      createdAt: msg.createdAt,
      activeSwipeIndex: msg.activeSwipeIndex ?? 0,
      extra: typeof msg.extra === "string" ? JSON.parse(msg.extra) : msg.extra,
      swipes: swipes.map((s: { index: number; content: string; extra?: unknown; createdAt?: string | null }) => ({
        index: s.index,
        content: s.content,
        extra: typeof s.extra === "string" ? JSON.parse(s.extra as string) : s.extra,
        createdAt: s.createdAt ?? null,
      })),
    });
  }
  await chats.createMessagesBatch(branchChat.id, copiedInputs);
  await chats.patchMetadata(branchChat.id, {
    branchName: "Task2 observation branch",
    branchParentChatId: chat.id,
    branchParentMessageId: assistant.id,
    branchMessageId: null,
  });
  observer.observe("branch", {
    chatId: chat.id,
    branchChatId: branchChat.id,
    groupId,
    owner: owners.branch,
  });

  // 7. delete — remove a user message from the source chat
  const toDelete = sourceMessages.find((m: { role: string }) => m.role === "user");
  if (!toDelete) throw new Error("no user message to delete");
  await chats.removeMessage(toDelete.id);
  observer.observe("delete", {
    chatId: chat.id,
    messageId: toDelete.id,
    owner: owners.delete,
  });

  observer.assertExactlyOnceEach();
  observer.assertZeroStateWrites();

  // Capability documents for our package must remain empty (zero companion state writes)
  const campaignDocs = await persistence.documents.list(PACKAGE_ID, "campaign");
  if (campaignDocs.length !== 0) {
    throw new Error(`expected zero package documents, got ${campaignDocs.length}`);
  }
  if (documentCreateAttempts !== 0) {
    throw new Error(`unexpected document create attempts: ${documentCreateAttempts}`);
  }

  // --- Disable / re-enable survival ---
  const countsBeforeDisable = observer.getSnapshot().counts;
  observer.disable();
  if (observer.hasPromptContribution() || observer.isEnabled()) {
    throw new Error("disable did not clear prompt contribution / enabled flag");
  }
  // Events while disabled must not mutate counts
  const ignored = observer.observe("accept", { note: "should be ignored while disabled" });
  if (ignored !== false) throw new Error("disabled observer accepted an event");
  const mid = observer.getSnapshot();
  for (const event of LIFECYCLE_EVENTS) {
    if (mid.counts[event] !== countsBeforeDisable[event]) {
      throw new Error(`count for ${event} changed while disabled`);
    }
  }

  observer.enable();
  if (!observer.isEnabled() || !observer.hasPromptContribution()) {
    throw new Error("re-enable failed to restore listening / prompt contribution flag");
  }
  // Counts remain exactly once each after re-enable (no leftover duplicate listeners)
  observer.assertExactlyOnceEach();
  observer.assertZeroStateWrites();
  const afterReenable = observer.getSnapshot();
  if (afterReenable.ignoredWhileDisabled < 1) {
    throw new Error("expected at least one ignored observation while disabled");
  }

  const snapshot = observer.getSnapshot();
  const observation = {
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    mode: "in-process-engine-lifecycle",
    status: "recorded",
    honesty: {
      kind: "in-process-engine-checkout-exercise",
      fullHttpServer: false,
      fullLlmGenerate: false,
      notUserDesktopInstall: true,
      notPackageActivation: true,
      path:
        "Exercised pinned Engine createChatsStorage + AbortController abort registry via createFileNativeDB. Same storage/abort owners as HTTP routes; not a live Fastify generate SSE + model call.",
      nodeVersion: process.version,
      runner: typeof Bun !== "undefined" ? `bun ${Bun.version}` : `node ${process.version}`,
    },
    pins: {
      engine: ENGINE_REV,
      agents: AGENTS_REV,
    },
    owners,
    events: Object.fromEntries(
      LIFECYCLE_EVENTS.map((event) => [
        event,
        {
          count: snapshot.counts[event],
          owner: owners[event],
        },
      ]),
    ),
    counts: snapshot.counts,
    companionStateWrites: snapshot.companionStateWrites,
    documentCreateAttempts,
    packageDocumentsListed: campaignDocs.length,
    disableReenable: {
      disabledClearedPromptContribution: true,
      ignoredWhileDisabled: snapshot.ignoredWhileDisabled,
      countsUnchangedWhileDisabled: true,
      reenabledListening: true,
      countsStillExactlyOnceAfterReenable: true,
    },
    log: snapshot.log,
    blockers: [
      "No package-facing lifecycle registration on activate(context); observation is harness-wired at verified storage/abort owners (PROPOSED CompanionHostBridge still absent).",
      "Cancel observed via in-process AbortController registry mirroring POST /api/generate/abort — not a live HTTP generate stream + provider abort.",
      "Not a private capability-package install/activate on a user desktop; deactivatePackage/activatePackage cleanup is simulated by observer.disable/enable.",
      "User-desktop Engine version / hierarchical-maps install fields remain UNKNOWN.",
    ],
  };

  writeFileSync(observationPath, JSON.stringify(observation, null, 2) + "\n");

  // Fold into installed-runtime evidence (keep PARTIAL for remaining UNKNOWN desktop fields)
  const { readFileSync } = await import("node:fs");
  const runtime = JSON.parse(readFileSync(installedRuntimePath, "utf8"));
  runtime.updatedAt = new Date().toISOString();
  runtime.evidence = {
    ...runtime.evidence,
    task2LifecycleObservation: "recorded",
    notes:
      "Task 1 live in-process round-trip recorded. Task 2 no-op lifecycle observation recorded in-process (seven events ×1, zero companion document writes, disable/re-enable cleanup). Hierarchical-maps / companion package install fields remain UNKNOWN until a real host installer reports them.",
  };
  runtime.lifecycleObservation = {
    status: "recorded",
    mode: "in-process-engine-lifecycle",
    path: "compatibility/lifecycle-observation.json",
    counts: snapshot.counts,
    companionStateWrites: snapshot.companionStateWrites,
    disableReenable: observation.disableReenable,
    pins: { engine: ENGINE_REV, agents: AGENTS_REV },
    note: "In-process harness at Engine storage/abort owners — not full HTTP generate or package activation.",
  };
  writeFileSync(installedRuntimePath, JSON.stringify(runtime, null, 2) + "\n");

  rmSync(storageDir, { recursive: true, force: true });

  console.log(
    JSON.stringify(
      {
        ok: true,
        observationPath,
        counts: snapshot.counts,
        companionStateWrites: snapshot.companionStateWrites,
        disableReenable: observation.disableReenable,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
