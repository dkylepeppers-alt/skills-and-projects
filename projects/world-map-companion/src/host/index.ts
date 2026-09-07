/**
 * World Map Companion — host integration (PROPOSED CompanionHostBridge).
 * Not Engine package-facing lifecycle APIs.
 */

export {
  createProposedCompanionHostBridge,
  contentHashOf,
  type AbortRegistryLike,
  type CampaignWriteFn,
  type CompanionHostBridge,
  type CompanionHostBridgeDeps,
  type LifecycleObserveFn,
} from "./companion-host-bridge.ts";

export {
  arbitrateFieldWrite,
  assertFieldWriteAllowed,
  FIELD_DOMAIN_OWNERS,
  getFieldOwner,
  type FieldDomain,
  type FieldOwner,
  type FieldWriteArbitration,
} from "./field-ownership.ts";

export {
  clearLocalProposedPromptContributors,
  collectLocalProposedPromptContext,
  registerReadOnlyPromptContributor,
  type PromptContextContributor,
  type PromptContextRequest,
  type PromptContributorRegistration,
  type RegisterCapabilityPromptContext,
} from "./prompt-contributor.ts";

export {
  assertSupportedCapabilityApi,
  COMPANION_REQUIRED_CAPABILITY_API,
  COMPANION_TESTED_CAPABILITY_API,
  detectSupportedVersion,
  type SupportedVersionResult,
} from "./supported-version.ts";

export type {
  AcceptedResponse,
  CapabilityApiVersion,
  CommitResult,
  CompanionProfile,
  CompanionRuntimeMode,
  HistorySelection,
  HistorySelectionKind,
  PresetStateMode,
  ResolvedPresetModeProfile,
  StateCursor,
  TurnAnchor,
  TurnInput,
  TurnTicket,
} from "./types.ts";

export {
  createLifecycleHelpers,
  finalizeHistoryTurn,
  prepareHistoryTurn,
  recoverAfterRestart,
  selectHistoryAuthoritative,
  type LifecycleContext,
  type PreparedLifecycleTurn,
} from "./lifecycle.ts";

