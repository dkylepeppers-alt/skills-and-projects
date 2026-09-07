/**
 * Lifecycle helpers for history-authoritative turns (Task 4).
 *
 * Uses PROPOSED CompanionHostBridge types from contracts/host — does not claim
 * Engine exports. Wires swipe/edit/delete/branch/retry/restart onto HistoryStore.
 */

import {
  PROCESSING_VERSION,
  type AcceptedResponse,
  type CommitResult,
  type CompanionEvent,
  type HistorySelection,
  type RandomResult,
  type StateCursor,
  type TurnAnchor,
  type TurnDedupKey,
  type TurnInput,
  type TurnTicket,
} from "../contracts.ts";
import {
  HistoryStore,
  applyHistorySelection,
  formatDedupKey,
  turnDedupKeyFromAnchor,
  type CommittedTurn,
  type PendingJob,
} from "../state/history.ts";
import { CheckpointStore } from "../state/checkpoints.ts";
import type { CompanionHostBridge, LifecycleObserveFn } from "./companion-host-bridge.ts";

export type LifecycleContext = {
  history: HistoryStore;
  checkpoints: CheckpointStore;
  /** Default package document id prefix for branched campaigns. */
  packageDocumentIdFor?: (campaignId: string) => string;
  observe?: LifecycleObserveFn | null;
};

export type PreparedLifecycleTurn = {
  ticket: TurnTicket;
  dedupKey: TurnDedupKey;
  pendingJob: PendingJob | null;
  /** True when an identical turn was already committed (idempotent short-circuit). */
  alreadyCommitted: boolean;
  committed?: CommittedTurn;
};

function dedupKeyHashShort(key: TurnDedupKey): string {
  return `${key.messageId.slice(0, 8)}-${key.swipeIndex}-${key.contentHash.slice(0, 8)}`;
}

/**
 * Bind prepareTurn input to a dedup key and ensure a durable pending job exists
 * when events are proposed. Does not commit.
 */
export function prepareHistoryTurn(
  ctx: LifecycleContext,
  input: TurnInput & {
    proposedEvents?: CompanionEvent[];
    recordedRandom?: RandomResult[];
    ticketId?: string;
  },
): PreparedLifecycleTurn {
  const chatId = input.chatId;
  const campaignId = input.campaignId ?? `campaign:${chatId}`;
  const branchId = input.branchId ?? `branch:${chatId}`;
  const anchor: TurnAnchor = {
    chatId,
    messageId: input.messageId ?? "",
    swipeIndex: input.swipeIndex ?? 0,
    contentHash: input.contentHash ?? "",
  };
  const dedupKey = turnDedupKeyFromAnchor(campaignId, branchId, anchor, PROCESSING_VERSION);

  const ticket: TurnTicket = {
    id: input.ticketId ?? `ticket:${dedupKeyHashShort(dedupKey)}`,
    base: {
      campaignId,
      branchId,
      headEventId: input.headEventId ?? null,
      revision: input.baseRevision ?? 0,
    },
    anchor,
    acceptedActionIds: [...(input.acceptedActionIds ?? [])],
    observationOnly: input.observationOnly ?? false,
  };

  const existing = ctx.history.getCommittedTurn(campaignId, dedupKey);
  if (existing && !existing.invalidated) {
    ctx.observe?.("retry", {
      chatId,
      dedupKey: formatDedupKey(dedupKey),
      alreadyCommitted: true,
    });
    return {
      ticket,
      dedupKey,
      pendingJob: null,
      alreadyCommitted: true,
      committed: existing,
    };
  }

  let pendingJob: PendingJob | null = null;
  if (input.proposedEvents && input.proposedEvents.length > 0 && !ticket.observationOnly) {
    pendingJob = ctx.history.enqueuePendingJob({
      jobId: `job:${ticket.id}`,
      dedupKey,
      proposedEvents: input.proposedEvents,
      recordedRandom: input.recordedRandom,
      ticketId: ticket.id,
    });
  }

  return { ticket, dedupKey, pendingJob, alreadyCommitted: false };
}

/**
 * Finalize an accepted response: commit proposed events idempotently.
 * Retry of the same accepted response does not repeat effects.
 */
export function finalizeHistoryTurn(
  ctx: LifecycleContext,
  prepared: PreparedLifecycleTurn,
  result: AcceptedResponse,
  opts: {
    events?: CompanionEvent[];
    recordedRandom?: RandomResult[];
    parentAnchor?: TurnAnchor | null;
  } = {},
): CommitResult {
  if (prepared.ticket.observationOnly) {
    ctx.observe?.("accept", {
      ticketId: prepared.ticket.id,
      chatId: result.chatId,
      observationOnly: true,
    });
    return {
      committed: false,
      cursor: { ...prepared.ticket.base },
      ticketId: prepared.ticket.id,
      observationOnly: true,
      reason: "observationOnly — no campaign state writes",
    };
  }

  if (prepared.alreadyCommitted && prepared.committed) {
    ctx.observe?.("accept", {
      ticketId: prepared.ticket.id,
      chatId: result.chatId,
      idempotentReuse: true,
      dedupKey: formatDedupKey(prepared.dedupKey),
    });
    return {
      committed: true,
      cursor: {
        campaignId: prepared.dedupKey.campaignId,
        branchId: prepared.dedupKey.branchId,
        headEventId: prepared.committed.headEventId,
        revision: prepared.committed.revisionAfter,
      },
      ticketId: prepared.ticket.id,
      observationOnly: false,
      reason: "idempotent reuse — effects not re-applied",
    };
  }

  const pending =
    prepared.pendingJob ??
    ctx.history.findPendingByDedup(prepared.dedupKey.campaignId, prepared.dedupKey);

  let events = opts.events;
  let recordedRandom = opts.recordedRandom;
  if (pending) {
    events = events ?? pending.proposedEvents;
    recordedRandom = recordedRandom ?? pending.recordedRandom;
  }
  if (!events || events.length === 0) {
    return {
      committed: false,
      cursor: { ...prepared.ticket.base },
      ticketId: prepared.ticket.id,
      observationOnly: false,
      reason: "no events to commit",
    };
  }

  events = events.map((ev) => {
    const copy = structuredClone(ev);
    if (copy.anchor) {
      copy.anchor = {
        chatId: result.chatId,
        messageId: result.messageId,
        swipeIndex: result.swipeIndex,
        contentHash: result.contentHash,
      };
    }
    return copy;
  });

  const dedupKey: TurnDedupKey = {
    ...prepared.dedupKey,
    messageId: result.messageId,
    swipeIndex: result.swipeIndex,
    contentHash: result.contentHash,
  };

  const parentAnchor =
    opts.parentAnchor !== undefined
      ? opts.parentAnchor
      : parentAnchorFromSelection(ctx, dedupKey.campaignId, result.messageId);

  const commit = ctx.history.commitTurnIdempotent({
    dedupKey,
    events,
    parentAnchor,
    recordedRandom,
    chatId: result.chatId,
  });

  ctx.observe?.("accept", {
    ticketId: prepared.ticket.id,
    chatId: result.chatId,
    messageId: result.messageId,
    swipeIndex: result.swipeIndex,
    contentHash: result.contentHash,
    reused: commit.reused,
  });

  return {
    committed: true,
    cursor: commit.published?.cursor ?? {
      campaignId: dedupKey.campaignId,
      branchId: dedupKey.branchId,
      headEventId: commit.turn.headEventId,
      revision: commit.turn.revisionAfter,
    },
    ticketId: prepared.ticket.id,
    observationOnly: false,
    reason: commit.reused ? "idempotent reuse — effects not re-applied" : undefined,
  };
}

function parentAnchorFromSelection(
  ctx: LifecycleContext,
  campaignId: string,
  messageId: string,
): TurnAnchor | null {
  const sel = ctx.history.getSelection(campaignId);
  if (!sel) return null;
  const idx = sel.messageOrder.indexOf(messageId);
  const parentIdx = idx < 0 ? sel.messageOrder.length - 1 : idx - 1;
  if (parentIdx < 0) return null;
  const parentMsg = sel.messageOrder[parentIdx]!;
  if (parentMsg === "__bootstrap__") return null;
  const s = sel.selectedByMessage[parentMsg];
  if (!s) return null;
  return {
    chatId: sel.chatId,
    messageId: parentMsg,
    swipeIndex: s.swipeIndex,
    contentHash: s.contentHash,
  };
}

/**
 * Drive selectHistory for the PROPOSED bridge using authoritative HistoryStore.
 */
export async function selectHistoryAuthoritative(
  ctx: LifecycleContext,
  input: HistorySelection,
  opts: { campaignId?: string; packageDocumentId?: string } = {},
): Promise<StateCursor> {
  const campaignId = input.campaignId ?? opts.campaignId ?? `campaign:${input.chatId}`;
  const cursor = applyHistorySelection(ctx.history, input, {
    campaignId,
    packageDocumentId:
      opts.packageDocumentId ??
      ctx.packageDocumentIdFor?.(campaignId) ??
      `doc:${campaignId}`,
  });

  const event =
    input.kind === "swipe"
      ? "swipe"
      : input.kind === "branch"
        ? "branch"
        : input.kind === "edit"
          ? "edit"
          : input.kind === "delete"
            ? "delete"
            : "retry";
  ctx.observe?.(event, {
    chatId: input.chatId,
    messageId: input.messageId,
    swipeIndex: input.swipeIndex,
    contentHash: input.contentHash,
    branchChatId: input.branchChatId,
    cursor,
  });
  return cursor;
}

/**
 * After process restart: recover durable pending jobs; optionally commit.
 * Idempotent — will not double-apply already committed dedup keys.
 */
export function recoverAfterRestart(
  ctx: LifecycleContext,
  input: { campaignId: string; chatId: string; commitReady?: boolean },
): {
  recovered: PendingJob[];
  committed: CommittedTurn[];
  cursor: StateCursor;
} {
  const { recovered, committed } = ctx.history.recoverPendingJobs(input.campaignId, {
    commitReady: input.commitReady,
    chatId: input.chatId,
  });
  const replay = ctx.checkpoints.replayFromNearest(input.campaignId);
  return { recovered, committed, cursor: replay.cursor };
}

/**
 * Factory for lifecycle helpers closed over a HistoryStore + CheckpointStore.
 */
export function createLifecycleHelpers(ctx: LifecycleContext) {
  return {
    prepare: (input: Parameters<typeof prepareHistoryTurn>[1]) => prepareHistoryTurn(ctx, input),
    finalize: (
      prepared: PreparedLifecycleTurn,
      result: AcceptedResponse,
      opts?: Parameters<typeof finalizeHistoryTurn>[3],
    ) => finalizeHistoryTurn(ctx, prepared, result, opts),
    selectHistory: (
      input: HistorySelection,
      opts?: { campaignId?: string; packageDocumentId?: string },
    ) => selectHistoryAuthoritative(ctx, input, opts),
    recoverAfterRestart: (input: {
      campaignId: string;
      chatId: string;
      commitReady?: boolean;
    }) => recoverAfterRestart(ctx, input),
    bindBridgeSelectHistory(bridge: CompanionHostBridge): CompanionHostBridge {
      return {
        ...bridge,
        async selectHistory(input: HistorySelection): Promise<StateCursor> {
          return selectHistoryAuthoritative(ctx, input);
        },
      };
    },
    ctx,
  };
}

export { HistoryStore, CheckpointStore, applyHistorySelection };
