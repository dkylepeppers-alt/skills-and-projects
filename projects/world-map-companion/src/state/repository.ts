/**
 * File-backed companion campaign repository (Task 3).
 *
 * Honest in-repo file DB aligned with Engine capability-document patterns:
 * revision checks, append-only events, snapshots, narrow campaign refs, and
 * transactional projection updates. Not a claim of Engine CapabilityDocumentStore.
 *
 * Atomicity protocol (publish-marker):
 * 1. Stage events + next projection under `_txn/`
 * 2. Write `_txn/ready.json` only after both are durable
 * 3. Publish to live paths; write `meta.json` last
 * 4. Remove `_txn/`
 *
 * If failure occurs after staging events but before `ready.json`, open() discards
 * the incomplete `_txn` — live campaign is unchanged (no half-applied state).
 * If `ready.json` exists on open, publish is completed (recovery).
 */

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
  type CampaignProjection,
  type CampaignSnapshot,
  type CompanionEvent,
  type NarrowCampaignRef,
  type StateCursor,
} from "../contracts.ts";
import { parseCompanionEvent, parseCampaignProjection, parseNarrowCampaignRef } from "../schema.ts";
import {
  PACKAGE_DOCUMENT_FORMAT_VERSION,
  assertPackageDocumentFormat,
  ensureMigrated,
} from "./migrations.ts";
import {
  ReduceError,
  applyEvent,
  emptyProjection,
  hashProjection,
  replayEvents,
} from "./reducer.ts";

export type CampaignMeta = {
  formatVersion: typeof PACKAGE_DOCUMENT_FORMAT_VERSION;
  schemaVersion: number;
  campaignId: string;
  branchId: string;
  packageDocumentId: string;
  revision: number;
  headEventId: string | null;
  updatedAt: string;
};

export type CommitBatchResult = {
  cursor: StateCursor;
  projection: CampaignProjection;
  stateHash: string;
  narrowRef: NarrowCampaignRef;
};

export type RepositoryHooks = {
  /** Test hook: runs after staged event files are written, before ready marker / projection publish. */
  afterEventPersistBeforeProjection?: (ctx: {
    campaignId: string;
    stagedEventIds: string[];
    expectedRevision: number;
  }) => void;
};

export class RevisionConflictError extends Error {
  readonly code = "REVISION_CONFLICT" as const;
  readonly campaignId: string;
  readonly expected: number;
  readonly actual: number;
  constructor(campaignId: string, expected: number, actual: number) {
    super(
      `REVISION_CONFLICT: campaign ${campaignId} expected revision ${expected}, found ${actual}. ` +
        `Reload the cursor and retry against fresh state.`,
    );
    this.name = "RevisionConflictError";
    this.campaignId = campaignId;
    this.expected = expected;
    this.actual = actual;
  }
}

export class RepositoryError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "RepositoryError";
    this.code = code;
  }
}

function atomicWriteJson(path: string, data: unknown): void {
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  renameSync(tmp, path);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export class CampaignRepository {
  readonly rootDir: string;
  private hooks: RepositoryHooks;

  constructor(rootDir: string, hooks: RepositoryHooks = {}) {
    this.rootDir = rootDir;
    this.hooks = hooks;
    mkdirSync(rootDir, { recursive: true });
  }

  /** Inject hooks (tests). */
  setHooks(hooks: RepositoryHooks): void {
    this.hooks = hooks;
  }

  private campaignDir(campaignId: string): string {
    // Encode path-unsafe characters
    const safe = campaignId.replace(/[^a-zA-Z0-9._:-]/g, "_");
    return join(this.rootDir, "campaigns", safe);
  }

  private paths(campaignId: string) {
    const dir = this.campaignDir(campaignId);
    return {
      dir,
      meta: join(dir, "meta.json"),
      projection: join(dir, "projection.json"),
      events: join(dir, "events"),
      snapshots: join(dir, "snapshots"),
      txn: join(dir, "_txn"),
    };
  }

  listCampaignIds(): string[] {
    const base = join(this.rootDir, "campaigns");
    if (!existsSync(base)) return [];
    return readdirSync(base, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  }

  open(campaignId: string): { meta: CampaignMeta; projection: CampaignProjection } | null {
    const p = this.paths(campaignId);
    if (!existsSync(p.meta)) return null;
    this.recoverIfNeeded(campaignId);
    const meta = ensureMigrated(readJson(p.meta) as CampaignMeta & { schemaVersion: number }, "campaign-meta");
    assertPackageDocumentFormat(meta.formatVersion);
    const projection = parseCampaignProjection(
      ensureMigrated(readJson(p.projection) as CampaignProjection, "campaign-projection"),
    );
    if (projection.campaignId !== meta.campaignId) {
      throw new RepositoryError(
        "CORRUPT_STATE",
        `projection campaignId ${projection.campaignId} != meta ${meta.campaignId}`,
      );
    }
    return { meta, projection };
  }

  /**
   * Create an empty campaign document at revision 0 (no events yet).
   * First real state comes from committing a campaign.created event at expectedRevision 0.
   */
  createCampaign(input: {
    campaignId: string;
    branchId: string;
    packageDocumentId: string;
  }): { meta: CampaignMeta; projection: CampaignProjection; narrowRef: NarrowCampaignRef } {
    const p = this.paths(input.campaignId);
    if (existsSync(p.meta)) {
      throw new RepositoryError("ALREADY_EXISTS", `campaign ${input.campaignId} already exists`);
    }
    mkdirSync(p.events, { recursive: true });
    mkdirSync(p.snapshots, { recursive: true });
    const projection = emptyProjection(input.campaignId, input.branchId);
    const now = new Date().toISOString();
    const meta: CampaignMeta = {
      formatVersion: PACKAGE_DOCUMENT_FORMAT_VERSION,
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      campaignId: input.campaignId,
      branchId: input.branchId,
      packageDocumentId: input.packageDocumentId,
      revision: 0,
      headEventId: null,
      updatedAt: now,
    };
    atomicWriteJson(p.projection, projection);
    atomicWriteJson(p.meta, meta);
    return { meta, projection, narrowRef: this.toNarrowRef(meta) };
  }

  toNarrowRef(meta: CampaignMeta): NarrowCampaignRef {
    return parseNarrowCampaignRef({
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      campaignId: meta.campaignId,
      branchId: meta.branchId,
      packageDocumentId: meta.packageDocumentId,
      headEventId: meta.headEventId,
      revision: meta.revision,
    });
  }

  listEvents(campaignId: string): CompanionEvent[] {
    const p = this.paths(campaignId);
    if (!existsSync(p.events)) return [];
    const files = readdirSync(p.events)
      .filter((f) => f.endsWith(".json"))
      .sort();
    const events: CompanionEvent[] = [];
    for (const file of files) {
      events.push(parseCompanionEvent(readJson(join(p.events, file))));
    }
    // Order by revision expectation / created chain: sort by expectedRevision then createdAt
    events.sort((a, b) => a.expectedRevision - b.expectedRevision || a.createdAt.localeCompare(b.createdAt));
    return events;
  }

  /**
   * Append events and publish projection transactionally.
   * All events in the batch must share campaign/branch and form a linear chain
   * with expectedRevision = base, base+1, ...
   */
  commitEvents(
    campaignId: string,
    expectedRevision: number,
    events: CompanionEvent[],
  ): CommitBatchResult {
    if (events.length === 0) {
      throw new RepositoryError("EMPTY_BATCH", "commitEvents requires at least one event");
    }

    this.recoverIfNeeded(campaignId);
    const opened = this.open(campaignId);
    if (!opened) {
      throw new RepositoryError("NOT_FOUND", `campaign ${campaignId} does not exist`);
    }
    const { meta, projection } = opened;

    if (meta.revision !== expectedRevision) {
      throw new RevisionConflictError(campaignId, expectedRevision, meta.revision);
    }
    if (projection.revision !== expectedRevision) {
      throw new RevisionConflictError(campaignId, expectedRevision, projection.revision);
    }

    for (const ev of events) {
      if (ev.campaignId !== campaignId) {
        throw new ReduceError("CROSS_CAMPAIGN", `batch event ${ev.eventId} campaign mismatch`, {
          eventId: ev.eventId,
          eventCampaignId: ev.campaignId,
          repositoryCampaignId: campaignId,
        });
      }
      if (ev.branchId !== meta.branchId) {
        throw new ReduceError("CROSS_BRANCH", `batch event ${ev.eventId} branch mismatch`, {
          eventId: ev.eventId,
          eventBranchId: ev.branchId,
          repositoryBranchId: meta.branchId,
        });
      }
    }

    const existing = this.listEvents(campaignId);
    const seen = new Set(existing.map((e) => e.eventId));
    let next = projection;
    for (const ev of events) {
      next = applyEvent(next, ev, seen);
      seen.add(ev.eventId);
    }

    const p = this.paths(campaignId);
    // Clean any incomplete txn
    if (existsSync(p.txn)) {
      rmSync(p.txn, { recursive: true, force: true });
    }
    mkdirSync(join(p.txn, "events"), { recursive: true });

    // Stage events (durable but unpublished until ready marker)
    const stagedEventIds: string[] = [];
    for (const ev of events) {
      const name = `${String(ev.expectedRevision).padStart(8, "0")}_${ev.eventId}.json`;
      atomicWriteJson(join(p.txn, "events", name), ev);
      stagedEventIds.push(ev.eventId);
    }

    // Failure injection point: events staged, projection not yet marked ready
    if (this.hooks.afterEventPersistBeforeProjection) {
      this.hooks.afterEventPersistBeforeProjection({
        campaignId,
        stagedEventIds,
        expectedRevision,
      });
    }

    atomicWriteJson(join(p.txn, "projection.json"), next);
    const stateHash = hashProjection(next);
    const now = new Date().toISOString();
    const nextMeta: CampaignMeta = {
      ...meta,
      revision: next.revision,
      headEventId: next.headEventId,
      updatedAt: now,
    };
    atomicWriteJson(join(p.txn, "meta.json"), nextMeta);
    atomicWriteJson(join(p.txn, "ready.json"), {
      formatVersion: PACKAGE_DOCUMENT_FORMAT_VERSION,
      stagedEventIds,
      stateHash,
      at: now,
    });

    this.publishTxn(campaignId);

    return {
      cursor: {
        campaignId,
        branchId: next.branchId,
        headEventId: next.headEventId,
        revision: next.revision,
      },
      projection: next,
      stateHash,
      narrowRef: this.toNarrowRef(nextMeta),
    };
  }

  private publishTxn(campaignId: string): void {
    const p = this.paths(campaignId);
    const readyPath = join(p.txn, "ready.json");
    if (!existsSync(readyPath)) {
      // Incomplete txn — discard
      if (existsSync(p.txn)) {
        rmSync(p.txn, { recursive: true, force: true });
      }
      return;
    }
    const stagedEventsDir = join(p.txn, "events");
    mkdirSync(p.events, { recursive: true });
    for (const file of readdirSync(stagedEventsDir)) {
      const from = join(stagedEventsDir, file);
      const to = join(p.events, file);
      if (!existsSync(to)) {
        renameSync(from, to);
      }
    }
    // Projection then meta (meta last = published cursor)
    renameSync(join(p.txn, "projection.json"), p.projection);
    // meta may still be in txn
    const txnMeta = join(p.txn, "meta.json");
    if (existsSync(txnMeta)) {
      renameSync(txnMeta, p.meta);
    }
    rmSync(p.txn, { recursive: true, force: true });
  }

  private recoverIfNeeded(campaignId: string): void {
    const p = this.paths(campaignId);
    if (!existsSync(p.txn)) return;
    const readyPath = join(p.txn, "ready.json");
    if (existsSync(readyPath)) {
      this.publishTxn(campaignId);
    } else {
      // Incomplete — events may be staged but projection never marked ready: discard
      rmSync(p.txn, { recursive: true, force: true });
    }
  }

  writeSnapshot(input: {
    campaignId: string;
    snapshotId: string;
    label?: string;
  }): CampaignSnapshot {
    const opened = this.open(input.campaignId);
    if (!opened) {
      throw new RepositoryError("NOT_FOUND", `campaign ${input.campaignId} does not exist`);
    }
    const { projection } = opened;
    const snapshot: CampaignSnapshot = {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      snapshotId: input.snapshotId,
      campaignId: projection.campaignId,
      branchId: projection.branchId,
      revision: projection.revision,
      headEventId: projection.headEventId,
      projection,
      stateHash: hashProjection(projection),
      createdAt: new Date().toISOString(),
      label: input.label,
    };
    const p = this.paths(input.campaignId);
    mkdirSync(p.snapshots, { recursive: true });
    atomicWriteJson(join(p.snapshots, `${input.snapshotId}.json`), snapshot);
    return snapshot;
  }

  /** Full replay from append-only events; must match stored projection hash. */
  replayAndVerify(campaignId: string): { projection: CampaignProjection; stateHash: string; matchesStore: boolean } {
    const opened = this.open(campaignId);
    if (!opened) {
      throw new RepositoryError("NOT_FOUND", `campaign ${campaignId} does not exist`);
    }
    const events = this.listEvents(campaignId);
    const { projection, stateHash } = replayEvents(events);
    const storedHash = hashProjection(opened.projection);
    return {
      projection,
      stateHash,
      matchesStore: stateHash === storedHash && projection.revision === opened.projection.revision,
    };
  }
}
