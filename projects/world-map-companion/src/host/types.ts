/**
 * Minimal turn-protocol types for CompanionHostBridge (Task 2).
 *
 * Full domain DTOs (TurnInput, AcceptedResponse, CommitResult, HistorySelection)
 * expand in Task 3 contracts.ts. These stubs are only what the proposed bridge
 * needs for TurnTicket lifecycle — not a claim of Engine exports.
 */

export type TurnAnchor = {
  chatId: string;
  messageId: string;
  swipeIndex: number;
  contentHash: string;
};

export type StateCursor = {
  campaignId: string;
  branchId: string;
  headEventId: string | null;
  revision: number;
};

export type TurnTicket = {
  id: string;
  base: StateCursor;
  anchor: TurnAnchor;
  acceptedActionIds: string[];
  observationOnly: boolean;
};

/** Prepare-turn input (Task 2 subset). */
export type TurnInput = {
  chatId: string;
  /** Optional anchor when regenerating / continuing an existing message. */
  messageId?: string | null;
  swipeIndex?: number;
  contentHash?: string;
  campaignId?: string;
  branchId?: string;
  baseRevision?: number;
  headEventId?: string | null;
  acceptedActionIds?: string[];
  /** When true (default for Task 2 no-op), bridge must not write campaign state. */
  observationOnly?: boolean;
};

/** Accepted assistant response (Task 2 subset). */
export type AcceptedResponse = {
  chatId: string;
  messageId: string;
  swipeIndex: number;
  contentHash: string;
  content?: string;
};

export type CommitResult = {
  committed: boolean;
  cursor: StateCursor;
  ticketId: string;
  /** True when observationOnly skipped campaign writes. */
  observationOnly: boolean;
  reason?: string;
};

export type HistorySelectionKind = "swipe" | "branch" | "edit" | "delete" | "retry";

export type HistorySelection = {
  kind: HistorySelectionKind;
  chatId: string;
  campaignId?: string;
  branchId?: string;
  messageId?: string;
  swipeIndex?: number;
  contentHash?: string;
  /** Branch target chat id when kind === "branch". */
  branchChatId?: string;
};

export type CapabilityApiVersion = {
  major: number;
  minor: number;
};

/** Preset state_mode values from FF5.4 choice variable (not display labels). */
export type PresetStateMode = "AGENTS" | "INTERNAL" | "NONE" | string;

/** Companion-owned profiles from plan §6 (not preset choice text). */
export type CompanionProfile =
  | "freeform"
  | "social-schedule"
  | "exploration-mystery"
  | "tactical-travel";

export type CompanionRuntimeMode = "live" | "observe" | "disabled";

export type ResolvedPresetModeProfile = {
  /** From chatChoices / preset defaults for variableName "state_mode" — never parsed from display labels. */
  stateMode: PresetStateMode;
  /** Companion settings (PROPOSED); independent of FF5.4 choices. */
  companionMode: CompanionRuntimeMode;
  companionProfile: CompanionProfile;
  source: {
    stateMode: "chatChoices" | "presetDefaults" | "fallback";
    companion: "settings";
  };
};
