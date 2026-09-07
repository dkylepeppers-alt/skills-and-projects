/**
 * Schema version migrations for companion package state (Task 3 stub).
 *
 * Full migration/rollback tooling is Task 12. This module defines the version
 * table and a no-op migrate path so repository loads can reject unsupported
 * on-disk schema versions with actionable errors.
 */

import { CONTRACT_SCHEMA_VERSION } from "../contracts.ts";

export const CAMPAIGN_STATE_SCHEMA_VERSION = CONTRACT_SCHEMA_VERSION;

/** On-disk package document envelope version (independent of event payloads). */
export const PACKAGE_DOCUMENT_FORMAT_VERSION = 1 as const;

export type MigrationStep = {
  from: number;
  to: number;
  description: string;
  /** Task 12 will implement transforms; Task 3 only records the ladder. */
  transform?: (data: unknown) => unknown;
};

/** Ordered migration ladder. Empty beyond identity — no transforms yet. */
export const MIGRATION_STEPS: readonly MigrationStep[] = [
  // Future: { from: 1, to: 2, description: "...", transform: ... }
];

export class UnsupportedSchemaVersionError extends Error {
  readonly code = "UNSUPPORTED_SCHEMA_VERSION" as const;
  readonly found: number;
  readonly supported: number;
  readonly documentKind: string;
  constructor(found: number, supported: number, documentKind: string) {
    super(
      `Unsupported ${documentKind} schemaVersion ${found}; this build supports ${supported}. ` +
        `Export/backup the campaign and run a compatible companion build, or wait for Task 12 migration.`,
    );
    this.name = "UnsupportedSchemaVersionError";
    this.found = found;
    this.supported = supported;
    this.documentKind = documentKind;
  }
}

/**
 * Ensure an on-disk schemaVersion is readable by this build.
 * Identity-migrate when already current; throw for unknown future/past versions
 * that lack a registered step.
 */
export function ensureMigrated<T extends { schemaVersion: number }>(
  data: T,
  documentKind: string,
): T {
  const version = data.schemaVersion;
  if (version === CAMPAIGN_STATE_SCHEMA_VERSION) {
    return data;
  }
  let current: unknown = data;
  let from = version;
  while (from < CAMPAIGN_STATE_SCHEMA_VERSION) {
    const step = MIGRATION_STEPS.find((s) => s.from === from);
    if (!step || typeof step.transform !== "function") {
      throw new UnsupportedSchemaVersionError(version, CAMPAIGN_STATE_SCHEMA_VERSION, documentKind);
    }
    current = step.transform(current);
    from = step.to;
  }
  if (from !== CAMPAIGN_STATE_SCHEMA_VERSION) {
    throw new UnsupportedSchemaVersionError(version, CAMPAIGN_STATE_SCHEMA_VERSION, documentKind);
  }
  return current as T;
}

export function assertPackageDocumentFormat(version: unknown): asserts version is typeof PACKAGE_DOCUMENT_FORMAT_VERSION {
  if (version !== PACKAGE_DOCUMENT_FORMAT_VERSION) {
    throw new UnsupportedSchemaVersionError(
      typeof version === "number" ? version : -1,
      PACKAGE_DOCUMENT_FORMAT_VERSION,
      "package-document-format",
    );
  }
}
