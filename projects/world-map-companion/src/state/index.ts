/** Campaign state package (Task 3). */
export {
  CAMPAIGN_STATE_SCHEMA_VERSION,
  MIGRATION_STEPS,
  PACKAGE_DOCUMENT_FORMAT_VERSION,
  UnsupportedSchemaVersionError,
  assertPackageDocumentFormat,
  ensureMigrated,
} from "./migrations.ts";

export {
  ReduceError,
  applyEvent,
  canonicalJson,
  emptyProjection,
  hashProjection,
  replayEvents,
  type ReduceErrorCode,
} from "./reducer.ts";

export {
  CampaignRepository,
  RepositoryError,
  RevisionConflictError,
  type CampaignMeta,
  type CommitBatchResult,
  type RepositoryHooks,
} from "./repository.ts";

export {
  HistoryStore,
  HistoryError,
  PROCESSING_VERSION,
  applyHistorySelection,
  dedupKeyHash,
  eventMatchesBinding,
  formatDedupKey,
  turnDedupKeyFromAnchor,
  type ChatSelectionState,
  type CommittedTurn,
  type HistoryErrorCode,
  type PendingJob,
  type PendingJobStatus,
} from "./history.ts";

export {
  CheckpointStore,
  checkpointIdFor,
  replayFromCheckpoint,
  type CheckpointRecord,
} from "./checkpoints.ts";

export {
  validateExtractedProposals,
  type ProposalValidationInput,
  type ProposalValidationIssue,
  type ProposalValidationResult,
  type ValidatedProposal,
} from "./validator.ts";

export {
  RECONCILIATION_HONESTY,
  reconcileAcceptedTurn,
  type NativeAgentResult,
  type ReconciliationInput,
  type ReconciliationIssue,
  type ReconciliationResult,
} from "./reconciliation.ts";
