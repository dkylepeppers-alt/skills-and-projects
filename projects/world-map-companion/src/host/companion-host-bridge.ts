/**
 * CompanionHostBridge — PROPOSED adapter (Task 2).
 *
 * Not an Engine export. Wires companion turn lifecycle to the same storage/abort
 * owners used by the no-op harness where injected. Observation-only mode makes
 * no campaign document writes. Field ownership, preset mode resolution, prompt
 * contributor registration, and supported-version detection live alongside.
 *
 * See docs/host-contract.md §6 and plan Section 5.
 */

import {
  arbitrateFieldWrite,
  assertFieldWriteAllowed,
  getFieldOwner,
  type FieldDomain,
  type FieldOwner,
  type FieldWriteArbitration,
} from "./field-ownership.ts";
import {
  registerReadOnlyPromptContributor,
  type PromptContributorRegistration,
  type PromptContextRequest,
  type RegisterCapabilityPromptContext,
} from "./prompt-contributor.ts";
import {
  assertSupportedCapabilityApi,
  COMPANION_TESTED_CAPABILITY_API,
  detectSupportedVersion,
  type SupportedVersionResult,
} from "./supported-version.ts";
import type {
  AcceptedResponse,
  CapabilityApiVersion,
  CommitResult,
  CompanionProfile,
  CompanionRuntimeMode,
  HistorySelection,
  ResolvedPresetModeProfile,
  StateCursor,
  TurnInput,
  TurnTicket,
} from "./types.ts";

export type AbortRegistryLike = {
  abort(chatId: string): { aborted: boolean; reason?: string };
  clear?(chatId: string): void;
  isAborted?(chatId: string): boolean;
};

export type LifecycleObserveFn = (
  event: "accept" | "cancel" | "retry" | "edit" | "swipe" | "branch" | "delete",
  detail?: Record<string, unknown>,
) => boolean;

export type CampaignWriteFn = (input: { kind: string; data: unknown }) => unknown;

export type CompanionHostBridgeDeps = {
  /** Host-reported capability API — required; mismatch fails closed. */
  hostCapabilityApi: CapabilityApiVersion | null | undefined;
  observationOnly?: boolean;
  companionMode?: CompanionRuntimeMode;
  companionProfile?: CompanionProfile;
  /** Optional: same abort registry pattern as engine-lifecycle-observation harness. */
  abortRegistry?: AbortRegistryLike | null;
  /** Optional: no-op observer (or future live observer). */
  observe?: LifecycleObserveFn | null;
  /**
   * Campaign/package document write. Must not be invoked on observationOnly
   * success path; if provided and somehow called while observationOnly, bridge throws.
   */
  writeCampaignDocument?: CampaignWriteFn | null;
  /** Inject Engine registerCapabilityPromptContext when available. */
  registerCapabilityPromptContext?: RegisterCapabilityPromptContext | null;
  packageId?: string;
  /** Override id generation (tests). */
  newTicketId?: () => string;
};

export interface CompanionHostBridge {
  prepareTurn(input: TurnInput): Promise<TurnTicket>;
  finalizeTurn(ticket: TurnTicket, result: AcceptedResponse): Promise<CommitResult>;
  cancelTurn(ticketId: string): Promise<void>;
  selectHistory(input: HistorySelection): Promise<StateCursor>;

  /** Expose resolved preset mode/profile without parsing display text. */
  resolvePresetModeProfile(input: {
    chatChoices?: Record<string, string | string[]>;
    presetDefaults?: Record<string, string | string[]>;
  }): ResolvedPresetModeProfile;

  registerPromptContributor(
    getBriefingText: (request: PromptContextRequest) => string | null | undefined,
  ): PromptContributorRegistration;

  getFieldOwner(domain: FieldDomain): FieldOwner;
  arbitrateFieldWrite(domain: FieldDomain, writer: FieldOwner): FieldWriteArbitration;
  assertFieldWriteAllowed(domain: FieldDomain, writer: FieldOwner): void;

  detectSupportedVersion(hostReports?: CapabilityApiVersion | null): SupportedVersionResult;

  /** Open tickets (for tests / diagnostics). */
  getOpenTicket(ticketId: string): TurnTicket | undefined;
  listOpenTicketIds(): string[];

  readonly status: "proposed-adapter";
  readonly observationOnly: boolean;
  readonly testedCapabilityApi: CapabilityApiVersion;
}

function simpleId(): string {
  return `wmc-ticket-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function contentHashOf(text: string): string {
  // Lightweight non-crypto hash for Task 2 anchors (Task 3 may replace).
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  }
  return `c${(h >>> 0).toString(16)}`;
}

function asScalarChoice(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

/**
 * Create the PROPOSED CompanionHostBridge adapter.
 * Throws immediately if host capability API fails supported-version detection.
 */
export function createProposedCompanionHostBridge(
  deps: CompanionHostBridgeDeps,
): CompanionHostBridge {
  const hostApi = assertSupportedCapabilityApi(deps.hostCapabilityApi);
  const observationOnly = deps.observationOnly !== false;
  const companionMode: CompanionRuntimeMode = deps.companionMode ?? "observe";
  const companionProfile: CompanionProfile = deps.companionProfile ?? "freeform";
  const packageId = deps.packageId ?? "world-map-companion";
  const openTickets = new Map<string, TurnTicket>();
  let promptRegistration: PromptContributorRegistration | null = null;

  const bridge: CompanionHostBridge = {
    status: "proposed-adapter",
    observationOnly,
    testedCapabilityApi: COMPANION_TESTED_CAPABILITY_API,

    async prepareTurn(input: TurnInput): Promise<TurnTicket> {
      // Re-check on each prepare (host report may change across restarts).
      assertSupportedCapabilityApi(deps.hostCapabilityApi);

      const ticketObservationOnly = input.observationOnly ?? observationOnly;
      const anchorChatId = input.chatId;
      if (!anchorChatId) {
        throw new Error("prepareTurn requires chatId");
      }

      const ticket: TurnTicket = {
        id: (deps.newTicketId ?? simpleId)(),
        base: {
          campaignId: input.campaignId ?? `campaign:${anchorChatId}`,
          branchId: input.branchId ?? `branch:${anchorChatId}`,
          headEventId: input.headEventId ?? null,
          revision: input.baseRevision ?? 0,
        },
        anchor: {
          chatId: anchorChatId,
          messageId: input.messageId ?? "",
          swipeIndex: input.swipeIndex ?? 0,
          contentHash: input.contentHash ?? "",
        },
        acceptedActionIds: [...(input.acceptedActionIds ?? [])],
        observationOnly: ticketObservationOnly,
      };

      openTickets.set(ticket.id, ticket);
      return ticket;
    },

    async finalizeTurn(ticket: TurnTicket, result: AcceptedResponse): Promise<CommitResult> {
      const open = openTickets.get(ticket.id);
      if (!open) {
        throw new Error(`finalizeTurn: unknown or already closed ticket ${ticket.id}`);
      }
      if (open.observationOnly) {
        // No-op path: observe accept if wired; never write campaign docs.
        deps.observe?.("accept", {
          ticketId: ticket.id,
          chatId: result.chatId,
          messageId: result.messageId,
          swipeIndex: result.swipeIndex,
          contentHash: result.contentHash,
          observationOnly: true,
        });
        openTickets.delete(ticket.id);
        return {
          committed: false,
          cursor: { ...open.base },
          ticketId: ticket.id,
          observationOnly: true,
          reason: "observationOnly — no campaign state writes",
        };
      }

      // Live path (still PROPOSED): refuse dual-write of native domains; allow companion domains only via explicit arbitration.
      assertFieldWriteAllowed("npcPlacement", "companion");
      if (typeof deps.writeCampaignDocument !== "function") {
        openTickets.delete(ticket.id);
        throw new Error("finalizeTurn live path requires writeCampaignDocument (Task 3+)");
      }
      deps.writeCampaignDocument({
        kind: "campaign-turn",
        data: { ticketId: ticket.id, result },
      });
      deps.observe?.("accept", {
        ticketId: ticket.id,
        chatId: result.chatId,
        messageId: result.messageId,
        observationOnly: false,
      });
      const cursor: StateCursor = {
        ...open.base,
        revision: open.base.revision + 1,
        headEventId: `event:${ticket.id}`,
      };
      openTickets.delete(ticket.id);
      return {
        committed: true,
        cursor,
        ticketId: ticket.id,
        observationOnly: false,
      };
    },

    async cancelTurn(ticketId: string): Promise<void> {
      const open = openTickets.get(ticketId);
      const chatId = open?.anchor.chatId;
      openTickets.delete(ticketId);

      if (chatId && deps.abortRegistry) {
        deps.abortRegistry.abort(chatId);
        deps.abortRegistry.clear?.(chatId);
      }

      deps.observe?.("cancel", {
        ticketId,
        chatId: chatId ?? null,
        cleared: true,
      });
    },

    async selectHistory(input: HistorySelection): Promise<StateCursor> {
      const cursor: StateCursor = {
        campaignId: input.campaignId ?? `campaign:${input.chatId}`,
        branchId:
          input.kind === "branch" && input.branchChatId
            ? `branch:${input.branchChatId}`
            : (input.branchId ?? `branch:${input.chatId}`),
        headEventId: null,
        revision: 0,
      };

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

      deps.observe?.(event, {
        chatId: input.chatId,
        messageId: input.messageId,
        swipeIndex: input.swipeIndex,
        contentHash: input.contentHash,
        branchChatId: input.branchChatId,
        observationOnly,
      });

      // History selection updates projection cursor only; no campaign writes in observation mode.
      return cursor;
    },

    resolvePresetModeProfile(input): ResolvedPresetModeProfile {
      const fromChat = asScalarChoice(input.chatChoices?.state_mode);
      const fromDefaults = asScalarChoice(input.presetDefaults?.state_mode);
      let stateMode: string;
      let source: ResolvedPresetModeProfile["source"]["stateMode"];
      if (fromChat !== undefined) {
        stateMode = fromChat;
        source = "chatChoices";
      } else if (fromDefaults !== undefined) {
        stateMode = fromDefaults;
        source = "presetDefaults";
      } else {
        stateMode = "AGENTS";
        source = "fallback";
      }
      return {
        stateMode,
        companionMode,
        companionProfile,
        source: { stateMode: source, companion: "settings" },
      };
    },

    registerPromptContributor(getBriefingText): PromptContributorRegistration {
      if (promptRegistration) {
        promptRegistration.unregister();
        promptRegistration = null;
      }
      promptRegistration = registerReadOnlyPromptContributor({
        packageId,
        getBriefingText,
        registerCapabilityPromptContext: deps.registerCapabilityPromptContext,
      });
      return promptRegistration;
    },

    getFieldOwner,
    arbitrateFieldWrite,
    assertFieldWriteAllowed,

    detectSupportedVersion(hostReports) {
      return detectSupportedVersion(hostReports === undefined ? deps.hostCapabilityApi : hostReports);
    },

    getOpenTicket(ticketId) {
      return openTickets.get(ticketId);
    },

    listOpenTicketIds() {
      return [...openTickets.keys()];
    },
  };

  return bridge;
}

export { contentHashOf };
