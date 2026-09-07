/**
 * Authoritative history selection (Task 4).
 *
 * Events are bound to message, swipe, content hash, branch lineage, and
 * processing version. Tentative jobs are separate from committed results.
 * Selected-swipe projection never uses "latest timestamp" as a substitute.
 *
 * Uses the companion file-backed CampaignRepository from Task 3 — not Engine
 * CapabilityDocumentStore.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import {
  CONTRACT_SCHEMA_VERSION,
  PROCESSING_VERSION,
  type CampaignProjection,
  type CompanionEvent,
  type HistorySelection,
  type RandomResult,
  type StateCursor,
  type TurnAnchor,
  type TurnDedupKey,
} from "../contracts.ts";
import { hashProjection, replayEvents } from "./reducer.ts";
import {
  CampaignRepository,
  RepositoryError,
  type CommitBatchResult,
} from "./repository.ts";

export { PROCESSING_VERSION };

export type HistoryErrorCode =
  | "UNKNOWN_TURN"
  | "INVALID_SELECTION"
  | "CROSS_CHAT"
  | "PENDING_CONFLICT"
  | "MISSING_LINEAGE"
  | "ARCHIVE_CORRUPT";

export class HistoryError extends Error {
  readonly code: HistoryErrorCode;
  readonly details: Record<string, unknown>;
  constructor(code: HistoryErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(`${code}: ${message}`);
    this.name = "HistoryError";
    this.code = code;
    this.details = details;
  }
}

/** Durable tentative job — not yet in the committed lineage. */
export type PendingJobStatus = "pending" | "processing" | "failed" | "cancelled";

export type PendingJob = {
  schemaVersion: typeof CONTRACT_SCHEMA_VERSION | number;
  jobId: string;
  dedupKey: TurnDedupKey;
  status: PendingJobStatus;
  /** Proposed events (not committed). */
  proposedEvents: CompanionEvent[];
  /** Randomness recorded at job creation — stable across retry/restart. */
  recordedRandom: RandomResult[];
  ticketId?: string;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
};

/** Committed turn segment bound to a specific swipe/content hash. */
export type CommittedTurn = {
  schemaVersion: typeof CONTRACT_SCHEMA_VERSION | number;
  dedupKey: TurnDedupKey;
  /** Events committed for this turn (ordered). */
  events: CompanionEvent[];
  /** Prior message anchor this turn extends (null = root/campaign bootstrap). */
  parentAnchor: TurnAnchor | null;
  revisionAfter: number;
  headEventId: string;
  stateHashAfter: string;
  recordedRandom: RandomResult[];
  committedAt: string;
  /** Soft-invalidated by edit/delete; retained for archive but excluded from projection. */
  invalidated: boolean;
  invalidateReason?: string;
};

export type ChatSelectionState = {
  schemaVersion: typeof CONTRACT_SCHEMA_VERSION | number;
  chatId: string;
  campaignId: string;
  branchId: string;
  /** Selected swipe per messageId (authoritative). */
  selectedByMessage: Record<
    string,
    { swipeIndex: number; contentHash: string; processingVersion: number }
  >;
  /** Ordered message ids that participate in the active lineage (chat order). */
  messageOrder: string[];
  updatedAt: string;
};

function atomicWriteJson(path: string, data: unknown): void {
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  renameSync(tmp, path);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function formatDedupKey(key: TurnDedupKey): string {
  return [
    key.campaignId,
    key.branchId,
    key.messageId,
    String(key.swipeIndex),
    key.contentHash,
    String(key.processingVersion),
  ].join("|");
}

export function dedupKeyHash(key: TurnDedupKey): string {
  return createHash("sha256").update(formatDedupKey(key)).digest("hex").slice(0, 32);
}

export function turnDedupKeyFromAnchor(
  campaignId: string,
  branchId: string,
  anchor: TurnAnchor,
  processingVersion: number = PROCESSING_VERSION,
): TurnDedupKey {
  return {
    campaignId,
    branchId,
    messageId: anchor.messageId,
    swipeIndex: anchor.swipeIndex,
    contentHash: anchor.contentHash,
    processingVersion,
  };
}

export function eventMatchesBinding(
  event: CompanionEvent,
  binding: {
    messageId?: string;
    swipeIndex?: number;
    contentHash?: string;
    branchId?: string;
    chatId?: string;
  },
): boolean {
  if (!event.anchor) return binding.messageId === undefined && binding.swipeIndex === undefined;
  if (binding.chatId !== undefined && event.anchor.chatId !== binding.chatId) return false;
  if (binding.messageId !== undefined && event.anchor.messageId !== binding.messageId) return false;
  if (binding.swipeIndex !== undefined && event.anchor.swipeIndex !== binding.swipeIndex) return false;
  if (binding.contentHash !== undefined && event.anchor.contentHash !== binding.contentHash) {
    return false;
  }
  if (binding.branchId !== undefined && event.branchId !== binding.branchId) return false;
  return true;
}

/**
 * File-backed history index sitting beside CampaignRepository.
 * Archives all swipe lineages; publishes only the selected lineage live.
 */
export class HistoryStore {
  readonly repo: CampaignRepository;
  readonly rootDir: string;

  constructor(repo: CampaignRepository) {
    this.repo = repo;
    this.rootDir = repo.rootDir;
  }

  private historyDir(campaignId: string): string {
    const safe = campaignId.replace(/[^a-zA-Z0-9._:-]/g, "_");
    return join(this.rootDir, "campaigns", safe, "history");
  }

  private paths(campaignId: string) {
    const dir = this.historyDir(campaignId);
    return {
      dir,
      turns: join(dir, "turns"),
      pending: join(dir, "pending"),
      selection: join(dir, "selection.json"),
      archive: join(dir, "event-archive"),
    };
  }

  ensureLayout(campaignId: string): void {
    const p = this.paths(campaignId);
    mkdirSync(p.turns, { recursive: true });
    mkdirSync(p.pending, { recursive: true });
    mkdirSync(p.archive, { recursive: true });
  }

  getSelection(campaignId: string): ChatSelectionState | null {
    const p = this.paths(campaignId);
    if (!existsSync(p.selection)) return null;
    return readJson(p.selection) as ChatSelectionState;
  }

  saveSelection(state: ChatSelectionState): void {
    this.ensureLayout(state.campaignId);
    atomicWriteJson(this.paths(state.campaignId).selection, state);
  }

  initSelection(input: {
    chatId: string;
    campaignId: string;
    branchId: string;
  }): ChatSelectionState {
    const state: ChatSelectionState = {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      chatId: input.chatId,
      campaignId: input.campaignId,
      branchId: input.branchId,
      selectedByMessage: {},
      messageOrder: [],
      updatedAt: new Date().toISOString(),
    };
    this.saveSelection(state);
    return state;
  }

  listCommittedTurns(campaignId: string): CommittedTurn[] {
    const p = this.paths(campaignId);
    if (!existsSync(p.turns)) return [];
    return readdirSync(p.turns)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => readJson(join(p.turns, f)) as CommittedTurn);
  }

  getCommittedTurn(campaignId: string, key: TurnDedupKey): CommittedTurn | null {
    const path = join(this.paths(campaignId).turns, `${dedupKeyHash(key)}.json`);
    if (!existsSync(path)) return null;
    return readJson(path) as CommittedTurn;
  }

  private writeCommittedTurn(turn: CommittedTurn): void {
    this.ensureLayout(turn.dedupKey.campaignId);
    const path = join(
      this.paths(turn.dedupKey.campaignId).turns,
      `${dedupKeyHash(turn.dedupKey)}.json`,
    );
    atomicWriteJson(path, turn);
    for (const ev of turn.events) {
      atomicWriteJson(
        join(this.paths(turn.dedupKey.campaignId).archive, `${ev.eventId}.json`),
        ev,
      );
    }
  }

  listPendingJobs(campaignId: string): PendingJob[] {
    const p = this.paths(campaignId);
    if (!existsSync(p.pending)) return [];
    return readdirSync(p.pending)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => readJson(join(p.pending, f)) as PendingJob);
  }

  getPendingJob(campaignId: string, jobId: string): PendingJob | null {
    const path = join(this.paths(campaignId).pending, `${jobId}.json`);
    if (!existsSync(path)) return null;
    return readJson(path) as PendingJob;
  }

  findPendingByDedup(campaignId: string, key: TurnDedupKey): PendingJob | null {
    const want = formatDedupKey(key);
    for (const job of this.listPendingJobs(campaignId)) {
      if (formatDedupKey(job.dedupKey) === want && job.status !== "cancelled") {
        return job;
      }
    }
    return null;
  }

  savePendingJob(job: PendingJob): void {
    this.ensureLayout(job.dedupKey.campaignId);
    atomicWriteJson(join(this.paths(job.dedupKey.campaignId).pending, `${job.jobId}.json`), job);
  }

  removePendingJob(campaignId: string, jobId: string): void {
    const path = join(this.paths(campaignId).pending, `${jobId}.json`);
    if (existsSync(path)) rmSync(path);
  }

  /**
   * Create or return existing tentative job. Recorded randomness is fixed at
   * first creation so retry/restart cannot reroll.
   */
  enqueuePendingJob(input: {
    jobId: string;
    dedupKey: TurnDedupKey;
    proposedEvents: CompanionEvent[];
    recordedRandom?: RandomResult[];
    ticketId?: string;
  }): PendingJob {
    const existingCommitted = this.getCommittedTurn(input.dedupKey.campaignId, input.dedupKey);
    if (existingCommitted && !existingCommitted.invalidated) {
      throw new HistoryError(
        "PENDING_CONFLICT",
        `turn already committed for dedup ${formatDedupKey(input.dedupKey)}`,
        { dedupKey: input.dedupKey },
      );
    }
    const existing = this.findPendingByDedup(input.dedupKey.campaignId, input.dedupKey);
    if (existing) {
      return existing;
    }
    const now = new Date().toISOString();
    const job: PendingJob = {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      jobId: input.jobId,
      dedupKey: input.dedupKey,
      status: "pending",
      proposedEvents: structuredClone(input.proposedEvents),
      recordedRandom: structuredClone(input.recordedRandom ?? []),
      ticketId: input.ticketId,
      createdAt: now,
      updatedAt: now,
    };
    this.savePendingJob(job);
    return job;
  }

  /**
   * Idempotent commit of a turn. Same dedup key returns prior result without
   * re-applying effects (no double-advance / double NPC move).
   */
  commitTurnIdempotent(input: {
    dedupKey: TurnDedupKey;
    events: CompanionEvent[];
    parentAnchor: TurnAnchor | null;
    recordedRandom?: RandomResult[];
    chatId: string;
    /** When true, also rebuild live campaign projection for current selection. */
    publishSelection?: boolean;
  }): { turn: CommittedTurn; reused: boolean; published?: CommitBatchResult } {
    const campaignId = input.dedupKey.campaignId;
    const prior = this.getCommittedTurn(campaignId, input.dedupKey);
    if (prior && !prior.invalidated) {
      return { turn: prior, reused: true };
    }

    // Bind processing version onto events via archive metadata (anchor already set by caller).
    for (const ev of input.events) {
      if (ev.campaignId !== campaignId) {
        throw new HistoryError("CROSS_CHAT", `event ${ev.eventId} campaign mismatch`, {
          eventId: ev.eventId,
        });
      }
      if (ev.branchId !== input.dedupKey.branchId) {
        throw new HistoryError("CROSS_CHAT", `event ${ev.eventId} branch mismatch`, {
          eventId: ev.eventId,
        });
      }
      if (ev.anchor) {
        if (ev.anchor.messageId !== input.dedupKey.messageId) {
          throw new HistoryError("INVALID_SELECTION", `event anchor message mismatch`, {
            eventId: ev.eventId,
          });
        }
        if (ev.anchor.swipeIndex !== input.dedupKey.swipeIndex) {
          throw new HistoryError("INVALID_SELECTION", `event anchor swipe mismatch`, {
            eventId: ev.eventId,
          });
        }
        if (ev.anchor.contentHash !== input.dedupKey.contentHash) {
          throw new HistoryError("INVALID_SELECTION", `event anchor contentHash mismatch`, {
            eventId: ev.eventId,
          });
        }
      }
    }

    // Validate events reduce cleanly when appended to parent lineage.
    // Parent null → bootstrap only (exclude other chat messages).
    const lineageEvents =
      input.parentAnchor === null
        ? this.collectSelectedLineageEvents(campaignId).filter((e) => e.anchor === null)
        : this.collectSelectedLineageEvents(campaignId, {
            upToMessageId: input.parentAnchor.messageId,
          });
    const { projection, stateHash } = replayEvents([...lineageEvents, ...input.events]);

    const turn: CommittedTurn = {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      dedupKey: input.dedupKey,
      events: structuredClone(input.events),
      parentAnchor: input.parentAnchor ? structuredClone(input.parentAnchor) : null,
      revisionAfter: projection.revision,
      headEventId: projection.headEventId ?? input.events[input.events.length - 1]!.eventId,
      stateHashAfter: stateHash,
      recordedRandom: structuredClone(input.recordedRandom ?? []),
      committedAt: new Date().toISOString(),
      invalidated: false,
    };
    this.writeCommittedTurn(turn);

    // Drop matching pending job
    const pending = this.findPendingByDedup(campaignId, input.dedupKey);
    if (pending) this.removePendingJob(campaignId, pending.jobId);

    // Update selection to this swipe
    let selection = this.getSelection(campaignId);
    if (!selection) {
      selection = this.initSelection({
        chatId: input.chatId,
        campaignId,
        branchId: input.dedupKey.branchId,
      });
    }
    if (selection.chatId !== input.chatId) {
      throw new HistoryError("CROSS_CHAT", `selection chat ${selection.chatId} != ${input.chatId}`, {
        campaignId,
      });
    }
    const msgId = input.dedupKey.messageId;
    if (!selection.messageOrder.includes(msgId)) {
      selection.messageOrder = [...selection.messageOrder, msgId];
    }
    selection.selectedByMessage[msgId] = {
      swipeIndex: input.dedupKey.swipeIndex,
      contentHash: input.dedupKey.contentHash,
      processingVersion: input.dedupKey.processingVersion,
    };
    selection.updatedAt = new Date().toISOString();
    this.saveSelection(selection);

    let published: CommitBatchResult | undefined;
    if (input.publishSelection !== false) {
      published = this.publishSelectedProjection(campaignId);
    }
    return { turn, reused: false, published };
  }

  /**
   * Collect committed (non-invalidated) events for the current selection,
   * optionally stopping after an inclusive message id.
   * Bootstrap turns (null-anchor / __bootstrap__ message) always prepend.
   */
  collectSelectedLineageEvents(
    campaignId: string,
    opts: {
      /** Inclusive: include this message then stop. null/undefined = full selection. */
      upToMessageId?: string | null;
      selection?: ChatSelectionState | null;
    } = {},
  ): CompanionEvent[] {
    const selection = opts.selection ?? this.getSelection(campaignId);
    const turns = this.listCommittedTurns(campaignId).filter((t) => !t.invalidated);

    const events: CompanionEvent[] = [];

    // Bootstrap: turns whose events have no message anchor (campaign.created etc.)
    const bootstrap = turns
      .filter(
        (t) =>
          t.dedupKey.messageId === "__bootstrap__" ||
          t.events.every((e) => e.anchor === null),
      )
      .sort((a, b) => a.revisionAfter - b.revisionAfter);
    const bootstrapIds = new Set(bootstrap.map((t) => formatDedupKey(t.dedupKey)));
    for (const t of bootstrap) {
      events.push(...t.events);
    }

    if (!selection) return events;

    const byMessageSwipe = new Map<string, CommittedTurn>();
    for (const t of turns) {
      if (bootstrapIds.has(formatDedupKey(t.dedupKey))) continue;
      const k = `${t.dedupKey.messageId}::${t.dedupKey.swipeIndex}::${t.dedupKey.contentHash}::${t.dedupKey.processingVersion}`;
      byMessageSwipe.set(k, t);
    }

    for (const messageId of selection.messageOrder) {
      if (messageId === "__bootstrap__") continue;
      const sel = selection.selectedByMessage[messageId];
      if (!sel) continue;
      const key = `${messageId}::${sel.swipeIndex}::${sel.contentHash}::${sel.processingVersion}`;
      const turn = byMessageSwipe.get(key);
      if (!turn) {
        // Selected swipe has no committed turn yet — skip (tentative only).
        continue;
      }
      if (
        turn.dedupKey.campaignId !== campaignId ||
        turn.dedupKey.branchId !== selection.branchId
      ) {
        throw new HistoryError("CROSS_CHAT", "turn identity mismatch during lineage collect", {
          messageId,
        });
      }
      events.push(...turn.events);
      if (opts.upToMessageId && messageId === opts.upToMessageId) {
        break;
      }
    }
    return events;
  }

  /** Rebuild live campaign projection from authoritative selection. */
  publishSelectedProjection(campaignId: string): CommitBatchResult {
    const opened = this.repo.open(campaignId);
    if (!opened) {
      throw new RepositoryError("NOT_FOUND", `campaign ${campaignId} does not exist`);
    }
    const events = this.collectSelectedLineageEvents(campaignId);
    return this.repo.rebuildActiveLineage(campaignId, events);
  }

  /**
   * Select a swipe for a message and republish projection.
   * Switching away removes dependent effects; selecting again restores them.
   */
  selectSwipe(input: {
    campaignId: string;
    chatId: string;
    messageId: string;
    swipeIndex: number;
    contentHash: string;
    processingVersion?: number;
  }): { cursor: StateCursor; projection: CampaignProjection; stateHash: string } {
    const selection = this.getSelection(input.campaignId);
    if (!selection) {
      throw new HistoryError("INVALID_SELECTION", `no selection state for ${input.campaignId}`);
    }
    if (selection.chatId !== input.chatId) {
      throw new HistoryError("CROSS_CHAT", `chat mismatch`, {
        expected: selection.chatId,
        got: input.chatId,
      });
    }
    const pv = input.processingVersion ?? PROCESSING_VERSION;
    selection.selectedByMessage[input.messageId] = {
      swipeIndex: input.swipeIndex,
      contentHash: input.contentHash,
      processingVersion: pv,
    };
    if (!selection.messageOrder.includes(input.messageId)) {
      selection.messageOrder = [...selection.messageOrder, input.messageId];
    }
    // Truncate dependent messages after this one? Swipe change invalidates
    // later messages' applicability — keep them in order but their content
    // hashes may no longer match; mark later turns invalidated only when edit.
    // For swipe: later turns that parented on the old swipe stay archived but
    // drop from lineage because parent chain breaks. We truncate messageOrder
    // after the selected message so dependents are not projected.
    const idx = selection.messageOrder.indexOf(input.messageId);
    if (idx >= 0) {
      selection.messageOrder = selection.messageOrder.slice(0, idx + 1);
    }
    selection.updatedAt = new Date().toISOString();
    this.saveSelection(selection);

    const published = this.publishSelectedProjection(input.campaignId);
    return {
      cursor: published.cursor,
      projection: published.projection,
      stateHash: published.stateHash,
    };
  }

  /**
   * Edit changes content hash → invalidate the old turn and all dependent
   * later turns in this chat.
   */
  invalidateEditedMessage(input: {
    campaignId: string;
    chatId: string;
    messageId: string;
    previousContentHash: string;
    newContentHash: string;
    swipeIndex?: number;
  }): { invalidated: string[]; cursor: StateCursor } {
    const selection = this.getSelection(input.campaignId);
    if (!selection || selection.chatId !== input.chatId) {
      throw new HistoryError("CROSS_CHAT", `edit chat mismatch`, { chatId: input.chatId });
    }
    const msgIdx = selection.messageOrder.indexOf(input.messageId);
    if (msgIdx < 0) {
      throw new HistoryError("UNKNOWN_TURN", `message ${input.messageId} not in order`);
    }
    const dependentIds = selection.messageOrder.slice(msgIdx);
    const invalidated: string[] = [];
    for (const turn of this.listCommittedTurns(input.campaignId)) {
      if (turn.invalidated) continue;
      if (dependentIds.includes(turn.dedupKey.messageId)) {
        if (
          turn.dedupKey.messageId === input.messageId &&
          turn.dedupKey.contentHash !== input.previousContentHash
        ) {
          continue;
        }
        turn.invalidated = true;
        turn.invalidateReason = `edit:${input.messageId}:${input.previousContentHash}->${input.newContentHash}`;
        this.writeCommittedTurn(turn);
        invalidated.push(formatDedupKey(turn.dedupKey));
      }
    }
    // Truncate selection from edited message inclusive
    selection.messageOrder = selection.messageOrder.slice(0, msgIdx);
    delete selection.selectedByMessage[input.messageId];
    for (const id of dependentIds) {
      if (id !== input.messageId) delete selection.selectedByMessage[id];
    }
    selection.updatedAt = new Date().toISOString();
    this.saveSelection(selection);

    const published = this.publishSelectedProjection(input.campaignId);
    return { invalidated, cursor: published.cursor };
  }

  /**
   * Message deletion truncates lineage at/after the deleted message.
   */
  deleteMessage(input: {
    campaignId: string;
    chatId: string;
    messageId: string;
  }): { cursor: StateCursor; invalidated: string[] } {
    const selection = this.getSelection(input.campaignId);
    if (!selection || selection.chatId !== input.chatId) {
      throw new HistoryError("CROSS_CHAT", `delete chat mismatch`, { chatId: input.chatId });
    }
    const msgIdx = selection.messageOrder.indexOf(input.messageId);
    if (msgIdx < 0) {
      // Already absent — still republish for safety
      const published = this.publishSelectedProjection(input.campaignId);
      return { cursor: published.cursor, invalidated: [] };
    }
    const removed = selection.messageOrder.slice(msgIdx);
    const invalidated: string[] = [];
    for (const turn of this.listCommittedTurns(input.campaignId)) {
      if (turn.invalidated) continue;
      if (removed.includes(turn.dedupKey.messageId)) {
        turn.invalidated = true;
        turn.invalidateReason = `delete:${input.messageId}`;
        this.writeCommittedTurn(turn);
        invalidated.push(formatDedupKey(turn.dedupKey));
      }
    }
    selection.messageOrder = selection.messageOrder.slice(0, msgIdx);
    for (const id of removed) delete selection.selectedByMessage[id];
    selection.updatedAt = new Date().toISOString();
    this.saveSelection(selection);
    const published = this.publishSelectedProjection(input.campaignId);
    return { cursor: published.cursor, invalidated };
  }

  /**
   * Branch inheritance: copy selected lineage turns into a new campaign/branch
   * for the child chat. Does not mutate the source chat.
   */
  inheritBranch(input: {
    sourceCampaignId: string;
    sourceChatId: string;
    targetCampaignId: string;
    targetChatId: string;
    targetBranchId: string;
    packageDocumentId: string;
    upToMessageId?: string;
  }): { cursor: StateCursor; stateHash: string } {
    const sourceSel = this.getSelection(input.sourceCampaignId);
    if (!sourceSel || sourceSel.chatId !== input.sourceChatId) {
      throw new HistoryError("CROSS_CHAT", `branch source chat mismatch`);
    }

    // Ensure target campaign exists empty
    if (!this.repo.open(input.targetCampaignId)) {
      this.repo.createCampaign({
        campaignId: input.targetCampaignId,
        branchId: input.targetBranchId,
        packageDocumentId: input.packageDocumentId,
      });
    }
    this.ensureLayout(input.targetCampaignId);

    let order = [...sourceSel.messageOrder];
    if (input.upToMessageId) {
      const i = order.indexOf(input.upToMessageId);
      if (i >= 0) order = order.slice(0, i + 1);
    }

    const targetSel = this.initSelection({
      chatId: input.targetChatId,
      campaignId: input.targetCampaignId,
      branchId: input.targetBranchId,
    });
    targetSel.messageOrder = [];
    targetSel.selectedByMessage = {};

    for (const messageId of order) {
      const sel = sourceSel.selectedByMessage[messageId];
      if (!sel) continue;
      const sourceKey: TurnDedupKey = {
        campaignId: input.sourceCampaignId,
        branchId: sourceSel.branchId,
        messageId,
        swipeIndex: sel.swipeIndex,
        contentHash: sel.contentHash,
        processingVersion: sel.processingVersion,
      };
      const sourceTurn = this.getCommittedTurn(input.sourceCampaignId, sourceKey);
      if (!sourceTurn || sourceTurn.invalidated) continue;

      const targetKey: TurnDedupKey = {
        ...sourceKey,
        campaignId: input.targetCampaignId,
        branchId: input.targetBranchId,
      };
      const remappedEvents = sourceTurn.events.map((ev) => {
        const copy = structuredClone(ev);
        copy.campaignId = input.targetCampaignId;
        copy.branchId = input.targetBranchId;
        copy.anchor = ev.anchor ? { ...ev.anchor, chatId: input.targetChatId } : null;
        if (copy.payload.type === "campaign.created") {
          copy.payload = {
            ...copy.payload,
            campaign: {
              ...copy.payload.campaign,
              campaignId: input.targetCampaignId,
              activeBranchId: input.targetBranchId,
            },
          };
        }
        return copy;
      });

      // Direct archive write without validating against source parent (fresh target)
      const { projection, stateHash } = replayEvents([
        ...this.collectSelectedLineageEvents(input.targetCampaignId),
        ...remappedEvents,
      ]);
      const turn: CommittedTurn = {
        schemaVersion: CONTRACT_SCHEMA_VERSION,
        dedupKey: targetKey,
        events: remappedEvents,
        parentAnchor: sourceTurn.parentAnchor
          ? { ...sourceTurn.parentAnchor, chatId: input.targetChatId }
          : null,
        revisionAfter: projection.revision,
        headEventId: projection.headEventId ?? remappedEvents[remappedEvents.length - 1]!.eventId,
        stateHashAfter: stateHash,
        recordedRandom: structuredClone(sourceTurn.recordedRandom),
        committedAt: new Date().toISOString(),
        invalidated: false,
      };
      this.writeCommittedTurn(turn);
      targetSel.messageOrder.push(messageId);
      targetSel.selectedByMessage[messageId] = { ...sel };
    }
    targetSel.updatedAt = new Date().toISOString();
    this.saveSelection(targetSel);

    const published = this.publishSelectedProjection(input.targetCampaignId);
    return { cursor: published.cursor, stateHash: published.stateHash };
  }

  /**
   * Durable pending-job recovery after restart: rehydrate pending/processing
   * jobs and optionally commit them idempotently.
   */
  recoverPendingJobs(
    campaignId: string,
    opts: { commitReady?: boolean; chatId?: string } = {},
  ): {
    recovered: PendingJob[];
    committed: CommittedTurn[];
  } {
    const recovered: PendingJob[] = [];
    const committed: CommittedTurn[] = [];
    for (const job of this.listPendingJobs(campaignId)) {
      if (job.status === "cancelled") continue;
      if (job.status === "failed" || job.status === "pending" || job.status === "processing") {
        // Mark processing after restart so callers see durable recovery
        job.status = job.status === "failed" ? "failed" : "pending";
        job.updatedAt = new Date().toISOString();
        this.savePendingJob(job);
        recovered.push(job);

        if (opts.commitReady && job.status === "pending" && opts.chatId) {
          const existing = this.getCommittedTurn(campaignId, job.dedupKey);
          if (existing && !existing.invalidated) {
            this.removePendingJob(campaignId, job.jobId);
            committed.push(existing);
            continue;
          }
          // Apply recorded random onto events if present
          const events = job.proposedEvents.map((ev, i) => {
            const copy = structuredClone(ev);
            if (!copy.random && job.recordedRandom[i]) {
              copy.random = structuredClone(job.recordedRandom[i]);
            }
            return copy;
          });
          const parentAnchor =
            events[0]?.anchor && selectionParentAnchor(this, campaignId, job.dedupKey.messageId);
          const result = this.commitTurnIdempotent({
            dedupKey: job.dedupKey,
            events,
            parentAnchor,
            recordedRandom: job.recordedRandom,
            chatId: opts.chatId,
          });
          committed.push(result.turn);
        }
      }
    }
    return { recovered, committed };
  }

  /** Retry a pending/failed job idempotently; randomness stays stable. */
  retryPendingJob(input: {
    campaignId: string;
    jobId: string;
    chatId: string;
  }): { turn: CommittedTurn; reused: boolean; recordedRandom: RandomResult[] } {
    const job = this.getPendingJob(input.campaignId, input.jobId);
    if (!job) {
      // Maybe already committed
      throw new HistoryError("UNKNOWN_TURN", `pending job ${input.jobId} not found`);
    }
    const existing = this.getCommittedTurn(input.campaignId, job.dedupKey);
    if (existing && !existing.invalidated) {
      this.removePendingJob(input.campaignId, job.jobId);
      return { turn: existing, reused: true, recordedRandom: existing.recordedRandom };
    }
    job.status = "processing";
    job.updatedAt = new Date().toISOString();
    this.savePendingJob(job);

    const events = job.proposedEvents.map((ev, i) => {
      const copy = structuredClone(ev);
      if (!copy.random && job.recordedRandom[i]) {
        copy.random = structuredClone(job.recordedRandom[i]);
      }
      return copy;
    });
    const parentAnchor = selectionParentAnchor(this, input.campaignId, job.dedupKey.messageId);
    try {
      const result = this.commitTurnIdempotent({
        dedupKey: job.dedupKey,
        events,
        parentAnchor,
        recordedRandom: job.recordedRandom,
        chatId: input.chatId,
      });
      return {
        turn: result.turn,
        reused: result.reused,
        recordedRandom: result.turn.recordedRandom,
      };
    } catch (err) {
      job.status = "failed";
      job.lastError = err instanceof Error ? err.message : String(err);
      job.updatedAt = new Date().toISOString();
      this.savePendingJob(job);
      throw err;
    }
  }
}

function selectionParentAnchor(
  store: HistoryStore,
  campaignId: string,
  messageId: string,
): TurnAnchor | null {
  const selection = store.getSelection(campaignId);
  if (!selection) return null;
  const idx = selection.messageOrder.indexOf(messageId);
  const parentIdx = idx < 0 ? selection.messageOrder.length - 1 : idx - 1;
  if (parentIdx < 0) return null;
  const parentMsg = selection.messageOrder[parentIdx]!;
  const sel = selection.selectedByMessage[parentMsg];
  if (!sel) return null;
  return {
    chatId: selection.chatId,
    messageId: parentMsg,
    swipeIndex: sel.swipeIndex,
    contentHash: sel.contentHash,
  };
}

/** Apply a HistorySelection (PROPOSED bridge input) onto the store. */
export function applyHistorySelection(
  store: HistoryStore,
  selection: HistorySelection,
  opts: {
    campaignId: string;
    branchId?: string;
    packageDocumentId?: string;
  },
): StateCursor {
  const campaignId = selection.campaignId ?? opts.campaignId;
  switch (selection.kind) {
    case "swipe": {
      if (!selection.messageId || selection.swipeIndex === undefined || !selection.contentHash) {
        throw new HistoryError("INVALID_SELECTION", "swipe requires messageId, swipeIndex, contentHash");
      }
      const result = store.selectSwipe({
        campaignId,
        chatId: selection.chatId,
        messageId: selection.messageId,
        swipeIndex: selection.swipeIndex,
        contentHash: selection.contentHash,
      });
      return result.cursor;
    }
    case "edit": {
      if (!selection.messageId || !selection.contentHash) {
        throw new HistoryError("INVALID_SELECTION", "edit requires messageId and new contentHash");
      }
      const sel = store.getSelection(campaignId);
      const prev = sel?.selectedByMessage[selection.messageId];
      if (!prev) {
        throw new HistoryError("UNKNOWN_TURN", `no prior selection for ${selection.messageId}`);
      }
      const result = store.invalidateEditedMessage({
        campaignId,
        chatId: selection.chatId,
        messageId: selection.messageId,
        previousContentHash: prev.contentHash,
        newContentHash: selection.contentHash,
        swipeIndex: selection.swipeIndex ?? prev.swipeIndex,
      });
      return result.cursor;
    }
    case "delete": {
      if (!selection.messageId) {
        throw new HistoryError("INVALID_SELECTION", "delete requires messageId");
      }
      return store.deleteMessage({
        campaignId,
        chatId: selection.chatId,
        messageId: selection.messageId,
      }).cursor;
    }
    case "branch": {
      if (!selection.branchChatId) {
        throw new HistoryError("INVALID_SELECTION", "branch requires branchChatId");
      }
      const targetCampaignId =
        selection.campaignId ?? `campaign:${selection.branchChatId}`;
      const targetBranchId = selection.branchId ?? `branch:${selection.branchChatId}`;
      const result = store.inheritBranch({
        sourceCampaignId: campaignId,
        sourceChatId: selection.chatId,
        targetCampaignId,
        targetChatId: selection.branchChatId,
        targetBranchId,
        packageDocumentId: opts.packageDocumentId ?? `doc:${targetCampaignId}`,
        upToMessageId: selection.messageId,
      });
      return result.cursor;
    }
    case "retry": {
      // Retry does not change selection cursor; pending recovery is separate.
      const opened = store.repo.open(campaignId);
      if (!opened) {
        throw new RepositoryError("NOT_FOUND", `campaign ${campaignId}`);
      }
      return {
        campaignId,
        branchId: opened.meta.branchId,
        headEventId: opened.meta.headEventId,
        revision: opened.meta.revision,
      };
    }
    default: {
      const _e: never = selection.kind;
      throw new HistoryError("INVALID_SELECTION", `unknown kind ${_e}`);
    }
  }
}
