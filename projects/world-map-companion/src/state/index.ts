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
