/**
 * Post-persistence state extraction (Task 10).
 *
 * Companion-side / PROPOSED until the Engine chat-storage owners call it.
 * The only canonical input is accepted assistant content after persistence.
 */
import { createHash } from "node:crypto";

import {
  CONTRACT_SCHEMA_VERSION,
  type EventPayload,
  type EventVisibility,
  type TurnAnchor,
} from "../contracts.ts";
import type { FieldDomain, FieldOwner } from "../host/field-ownership.ts";
import { validateCompanionEvent } from "../schema.ts";

export const EXTRACTION_HONESTY = Object.freeze({
  status: "PROPOSED" as const,
  canonicalTranscriptChannel: "persisted-accepted-assistant-content" as const,
  liveEngineInstrumentation: false,
});

export type AcceptedPersistenceOperation =
  | "chats.createMessage"
  | "chats.addSwipe"
  | "chats.updateMessageContent";

export type AcceptedTranscript = TurnAnchor & {
  persistenceOperation: AcceptedPersistenceOperation;
  accepted: boolean;
  generationState: "completed" | "streaming" | "cancelled";
  content: string;
};

export type ProposalCertainty = "observed" | "reported" | "inferred" | "speculative";
export type ProposalCompletion = "completed" | "planned" | "interrupted";

export type SourceSpan = {
  start: number;
  end: number;
  quote: string;
};

export type ExtractedProposal = {
  proposalId: string;
  domain: FieldDomain;
  writer: FieldOwner;
  payload: EventPayload | { type: "player.moved"; actorId: string; fromLocationId: string; toLocationId: string };
  sourceSpan: SourceSpan;
  certainty: ProposalCertainty;
  completion: ProposalCompletion;
  visibility: EventVisibility[];
  subjectAlias?: string;
  placeAlias?: string;
  actionId?: string;
};

export type ExtractorInvocation = {
  anchor: TurnAnchor;
  narrative: string;
};

export type ExtractionResult = {
  status: "ready" | "ignored" | "failed";
  channel: typeof EXTRACTION_HONESTY.canonicalTranscriptChannel;
  anchor: TurnAnchor;
  narrative: string;
  proposals: ExtractedProposal[];
  issues: ExtractionIssue[];
};

export type ExtractionIssue = {
  code:
    | "NOT_ACCEPTED"
    | "NON_CANONICAL_CHANNEL"
    | "INTERRUPTED_STREAM"
    | "CANCELLED_GENERATION"
    | "CONTENT_HASH_MISMATCH"
    | "MALFORMED_OUTPUT";
  message: string;
  repairable: true;
};

export function hashAcceptedContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function stripExcludedChannels(content: string): string {
  return content
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(reasoning|analysis|thinking|internal|state-report|state_report|report|control|context)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/```(?:json|state|report|control|reasoning|analysis)\b[^\n]*\n[\s\S]*?```/gi, "")
    .replace(/^\s*>.*$/gm, "")
    .replace(/^\s*\[(?:display[_ -]?only|state[_ -]?report|control)\][\s\S]*?^\s*\[\/(?:display[_ -]?only|state[_ -]?report|control)\]\s*$/gim, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .join("\n")
    .trim();
}

function anchorOf(input: AcceptedTranscript): TurnAnchor {
  return {
    chatId: input.chatId,
    messageId: input.messageId,
    swipeIndex: input.swipeIndex,
    contentHash: input.contentHash,
  };
}

function malformedProposalReason(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "proposal is not an object";
  }
  const proposal = value as Record<string, unknown>;
  const id = typeof proposal.proposalId === "string" ? proposal.proposalId : "<unknown>";
  const payload = proposal.payload;
  const span = proposal.sourceSpan;
  const valid =
    typeof proposal.proposalId === "string" &&
    proposal.proposalId.length > 0 &&
    typeof proposal.domain === "string" &&
    typeof proposal.writer === "string" &&
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as Record<string, unknown>).type === "string" &&
    typeof span === "object" &&
    span !== null &&
    Number.isInteger((span as Record<string, unknown>).start) &&
    Number.isInteger((span as Record<string, unknown>).end) &&
    typeof (span as Record<string, unknown>).quote === "string" &&
    ["observed", "reported", "inferred", "speculative"].includes(String(proposal.certainty)) &&
    ["completed", "planned", "interrupted"].includes(String(proposal.completion)) &&
    Array.isArray(proposal.visibility) &&
    proposal.visibility.every((entry) =>
      ["player", "author", "system", "npc"].includes(String(entry)),
    );
  if (!valid) return `proposal ${id} is missing or has invalid required fields`;
  const typedPayload = payload as Record<string, unknown>;
  if (typedPayload.type === "player.moved") {
    return ["actorId", "fromLocationId", "toLocationId"].every(
      (field) => typeof typedPayload[field] === "string" && String(typedPayload[field]).length > 0,
    )
      ? null
      : `proposal ${id} has invalid player movement fields`;
  }
  const eventIssues = validateCompanionEvent({
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    eventId: "evt:extractor-shape-check",
    campaignId: "campaign:extractor-shape-check",
    branchId: "branch:extractor-shape-check",
    parentEventId: null,
    anchor: null,
    expectedRevision: 0,
    payload,
    visibility: proposal.visibility,
    createdAt: "shape-check",
  });
  return eventIssues.length === 0
    ? null
    : `proposal ${id} has invalid payload: ${eventIssues
        .map((issue) => `${issue.path} ${issue.message}`)
        .join("; ")}`;
}

export async function extractAcceptedNarrative(
  input: AcceptedTranscript,
  invokeExtractor: (input: ExtractorInvocation) => Promise<unknown>,
): Promise<ExtractionResult> {
  const anchor = anchorOf(input);
  const narrative = stripExcludedChannels(input.content);
  const base = {
    channel: EXTRACTION_HONESTY.canonicalTranscriptChannel,
    anchor,
    narrative,
  };

  if (
    input.persistenceOperation !== "chats.createMessage" &&
    input.persistenceOperation !== "chats.addSwipe" &&
    input.persistenceOperation !== "chats.updateMessageContent"
  ) {
    return {
      ...base,
      status: "failed",
      proposals: [],
      issues: [{
        code: "NON_CANONICAL_CHANNEL",
        message: `unsupported transcript channel ${String(input.persistenceOperation)}`,
        repairable: true,
      }],
    };
  }

  if (input.generationState !== "completed" || !input.accepted) {
    const code =
      input.generationState === "streaming"
        ? "INTERRUPTED_STREAM"
        : input.generationState === "cancelled"
          ? "CANCELLED_GENERATION"
          : "NOT_ACCEPTED";
    return {
      ...base,
      status: "ignored",
      proposals: [],
      issues: [{ code, message: "response is not accepted and complete", repairable: true }],
    };
  }
  if (hashAcceptedContent(input.content) !== input.contentHash) {
    return {
      ...base,
      status: "failed",
      proposals: [],
      issues: [{ code: "CONTENT_HASH_MISMATCH", message: "accepted content hash mismatch", repairable: true }],
    };
  }
  try {
    const raw = await invokeExtractor({ anchor, narrative });
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as { proposals?: unknown }).proposals)) {
      return {
        ...base,
        status: "failed",
        proposals: [],
        issues: [{
          code: "MALFORMED_OUTPUT",
          message: "malformed extractor output: expected proposals array",
          repairable: true,
        }],
      };
    }
    const malformed = (parsed as { proposals: unknown[] }).proposals
      .map(malformedProposalReason)
      .find((reason): reason is string => reason !== null);
    if (malformed) {
      return {
        ...base,
        status: "failed",
        proposals: [],
        issues: [{
          code: "MALFORMED_OUTPUT",
          message: `malformed extractor output: ${malformed}`,
          repairable: true,
        }],
      };
    }
    return {
      ...base,
      status: "ready",
      proposals: (parsed as { proposals: ExtractedProposal[] }).proposals,
      issues: [],
    };
  } catch (error) {
    return {
      ...base,
      status: "failed",
      proposals: [],
      issues: [{
        code: "MALFORMED_OUTPUT",
        message: `malformed extractor output: ${error instanceof Error ? error.message : String(error)}`,
        repairable: true,
      }],
    };
  }
}

export type AcceptedExtractionCoordinator = {
  extract(
    input: AcceptedTranscript,
    invokeExtractor: (input: ExtractorInvocation) => Promise<unknown>,
  ): Promise<ExtractionResult>;
};

/** Coalesce duplicate post-persistence callbacks for one exact accepted anchor. */
export function createAcceptedExtractionCoordinator(): AcceptedExtractionCoordinator {
  const results = new Map<string, Promise<ExtractionResult>>();
  return {
    extract(input, invokeExtractor) {
      const key = [input.chatId, input.messageId, input.swipeIndex, input.contentHash].join("|");
      const existing = results.get(key);
      if (existing) return existing;
      const pending = extractAcceptedNarrative(input, invokeExtractor);
      results.set(key, pending);
      return pending;
    },
  };
}
