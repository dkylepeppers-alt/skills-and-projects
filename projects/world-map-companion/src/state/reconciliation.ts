/** Turn-barrier reconciliation and one coherent, idempotent history commit. */
import { createHash } from "node:crypto";

import {
  CONTRACT_SCHEMA_VERSION,
  PROCESSING_VERSION,
  type CompanionEvent,
  type EventPayload,
  type StateCursor,
  type TurnAnchor,
  type TurnDedupKey,
} from "../contracts.ts";
import type { ExtractionResult } from "../agents/extractor.ts";
import type { FieldDomain, FieldOwner } from "../host/field-ownership.ts";
import { getFieldOwner } from "../host/field-ownership.ts";
import type { EffectiveMap } from "../world/effective-map.ts";
import { HistoryStore, formatDedupKey } from "./history.ts";
import {
  type ProposalValidationIssue,
  validateExtractedProposals,
} from "./validator.ts";

export const RECONCILIATION_HONESTY = Object.freeze({
  status: "PROPOSED" as const,
  liveEngineBarrierInstrumentation: false,
  canonicalTranscriptChannel: "persisted-accepted-assistant-content" as const,
});

export type NativeAgentResult = {
  resultId: string;
  domain: FieldDomain;
  owner: FieldOwner;
  baseCampaignRevision: number;
  status: "completed" | "pending" | "failed";
};

export type ReconciliationIssue = {
  code:
    | "EXTRACTION_FAILED"
    | "STALE_NATIVE_TRACKER"
    | "NATIVE_RESULT_PENDING"
    | "NATIVE_OWNERSHIP_CONFLICT"
    | "NO_COMMITTABLE_EVENTS"
    | "REVISION_CONFLICT"
    | ProposalValidationIssue["code"];
  message: string;
  repairable: true;
  proposalId?: string;
  resultId?: string;
};

export type ReconciliationInput = {
  history: HistoryStore;
  campaignId: string;
  branchId: string;
  chatId: string;
  baseRevision: number;
  extraction: ExtractionResult;
  validation: {
    effectiveMap: EffectiveMap;
    entityAliases: Record<string, string[]>;
    placeAliases: Record<string, string[]>;
    acceptedActionIds: string[];
    nativeSpatial?: {
      revision: number;
      playerLocationId: string | null;
      completedActionIds: string[];
    };
  };
  nativeResults?: NativeAgentResult[];
};

export type ReconciliationResult = {
  status: "committed" | "pending" | "ignored";
  reused: boolean;
  cursor: StateCursor;
  issues: ReconciliationIssue[];
  nativeAcceptedIds: string[];
  revisionRetries: number;
  rebasedFromRevision?: number;
  pendingJobId?: string;
};

function dedupKey(input: ReconciliationInput): TurnDedupKey {
  return {
    campaignId: input.campaignId,
    branchId: input.branchId,
    messageId: input.extraction.anchor.messageId,
    swipeIndex: input.extraction.anchor.swipeIndex,
    contentHash: input.extraction.anchor.contentHash,
    processingVersion: PROCESSING_VERSION,
  };
}

function eventId(key: TurnDedupKey, proposalId: string): string {
  const digest = createHash("sha256")
    .update(`${formatDedupKey(key)}|${proposalId}`)
    .digest("hex")
    .slice(0, 24);
  return `evt:reconciled-${digest}`;
}

function isEventPayload(value: EventPayload | { type: "player.moved" }): value is EventPayload {
  return value.type !== "player.moved";
}

function parentAnchor(history: HistoryStore, campaignId: string): TurnAnchor | null {
  const selection = history.getSelection(campaignId);
  if (!selection) return null;
  for (let index = selection.messageOrder.length - 1; index >= 0; index -= 1) {
    const messageId = selection.messageOrder[index]!;
    if (messageId === "__bootstrap__") continue;
    const selected = selection.selectedByMessage[messageId];
    if (!selected) continue;
    return {
      chatId: selection.chatId,
      messageId,
      swipeIndex: selected.swipeIndex,
      contentHash: selected.contentHash,
    };
  }
  return null;
}

function cursorFromOpen(input: ReconciliationInput): StateCursor {
  const opened = input.history.repo.open(input.campaignId);
  if (!opened) {
    throw new Error(`campaign ${input.campaignId} does not exist`);
  }
  return {
    campaignId: input.campaignId,
    branchId: input.branchId,
    headEventId: opened.projection.headEventId,
    revision: opened.projection.revision,
  };
}

function retainPendingIssue(
  input: ReconciliationInput,
  key: TurnDedupKey,
  issues: ReconciliationIssue[],
  events: CompanionEvent[] = [],
  revisionRetries = 0,
): ReconciliationResult {
  const jobId = `job:reconcile-${key.messageId}-${key.swipeIndex}`;
  const job = input.history.enqueuePendingJob({
    jobId,
    dedupKey: key,
    proposedEvents: events,
  });
  job.status = "failed";
  job.updatedAt = new Date().toISOString();
  job.lastError = issues.map((issue) => `${issue.code}: ${issue.message}`).join("; ");
  input.history.savePendingJob(job);
  return {
    status: "pending",
    reused: false,
    cursor: cursorFromOpen(input),
    issues,
    nativeAcceptedIds: [],
    revisionRetries,
    pendingJobId: job.jobId,
  };
}

export function reconcileAcceptedTurn(input: ReconciliationInput): ReconciliationResult {
  const key = dedupKey(input);
  const prior = input.history.getCommittedTurn(input.campaignId, key);
  if (prior && !prior.invalidated) {
    return {
      status: "committed",
      reused: true,
      cursor: {
        campaignId: input.campaignId,
        branchId: input.branchId,
        headEventId: prior.headEventId,
        revision: prior.revisionAfter,
      },
      issues: [],
      nativeAcceptedIds: (input.nativeResults ?? []).map((result) => result.resultId),
      revisionRetries: 0,
    };
  }

  if (input.extraction.status === "ignored") {
    return {
      status: "ignored",
      reused: false,
      cursor: cursorFromOpen(input),
      issues: [],
      nativeAcceptedIds: [],
      revisionRetries: 0,
    };
  }

  if (input.extraction.status !== "ready") {
    return retainPendingIssue(input, key, [
      {
        code: "EXTRACTION_FAILED",
        message:
          input.extraction.issues.map((issue) => issue.message).join("; ") ||
          "accepted narrative extraction did not complete",
        repairable: true,
      },
    ]);
  }

  const opened = input.history.repo.open(input.campaignId);
  if (!opened) throw new Error(`campaign ${input.campaignId} does not exist`);
  const nativeAcceptedIds: string[] = [];
  const nativeIssues: ReconciliationIssue[] = [];
  for (const native of input.nativeResults ?? []) {
    if (native.status !== "completed") {
      nativeIssues.push({
        code: "NATIVE_RESULT_PENDING",
        message: `native result ${native.resultId} is ${native.status}`,
        repairable: true,
        resultId: native.resultId,
      });
      continue;
    }
    if (native.baseCampaignRevision !== opened.projection.revision) {
      nativeIssues.push({
        code: "STALE_NATIVE_TRACKER",
        message: `native result ${native.resultId} used campaign revision ${native.baseCampaignRevision}; fresh revision is ${opened.projection.revision}`,
        repairable: true,
        resultId: native.resultId,
      });
      continue;
    }
    if (native.owner !== getFieldOwner(native.domain)) {
      nativeIssues.push({
        code: "NATIVE_OWNERSHIP_CONFLICT",
        message: `native result ${native.resultId} writer ${native.owner} does not own ${native.domain}`,
        repairable: true,
        resultId: native.resultId,
      });
      continue;
    }
    nativeAcceptedIds.push(native.resultId);
  }
  if (nativeIssues.length > 0) {
    return retainPendingIssue(
      input,
      key,
      nativeIssues,
      [],
      input.baseRevision === opened.projection.revision ? 0 : 1,
    );
  }

  const validation = validateExtractedProposals({
    narrative: input.extraction.narrative,
    proposals: input.extraction.proposals,
    projection: opened.projection,
    effectiveMap: input.validation.effectiveMap,
    entityAliases: input.validation.entityAliases,
    placeAliases: input.validation.placeAliases,
    acceptedActionIds: input.validation.acceptedActionIds,
    nativeSpatial: input.validation.nativeSpatial,
  });
  if (validation.issues.length > 0) {
    return retainPendingIssue(
      input,
      key,
      validation.issues.map((issue) => ({
        code: issue.code,
        message: issue.message,
        repairable: true,
        proposalId: issue.proposalId,
      })),
      [],
      input.baseRevision === opened.projection.revision ? 0 : 1,
    );
  }
  const keyAnchor = input.extraction.anchor;
  let revision = opened.projection.revision;
  let parentEventId = opened.projection.headEventId;
  const events: CompanionEvent[] = [];
  for (const proposal of validation.accepted) {
    if (!isEventPayload(proposal.payload)) continue;
    const next: CompanionEvent = {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      eventId: eventId(key, proposal.proposalId),
      campaignId: input.campaignId,
      branchId: input.branchId,
      parentEventId,
      anchor: { ...keyAnchor },
      expectedRevision: revision,
      payload: structuredClone(proposal.payload),
      evidence: [{ quote: proposal.sourceSpan.quote }],
      visibility: [...proposal.visibility],
      createdAt: new Date().toISOString(),
    };
    events.push(next);
    parentEventId = next.eventId;
    revision += 1;
  }

  const commit = input.history.commitTurnIdempotent({
    dedupKey: key,
    events,
    parentAnchor: parentAnchor(input.history, input.campaignId),
    chatId: input.chatId,
  });
  return {
    status: "committed",
    reused: commit.reused,
    cursor: commit.published?.cursor ?? cursorFromOpen(input),
    issues: [],
    nativeAcceptedIds,
    revisionRetries: input.baseRevision === opened.projection.revision ? 0 : 1,
    ...(input.baseRevision === opened.projection.revision
      ? {}
      : { rebasedFromRevision: input.baseRevision }),
  };
}
