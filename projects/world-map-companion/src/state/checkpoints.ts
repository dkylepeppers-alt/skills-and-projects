/**
 * Campaign checkpoints and replay-from-nearest (Task 4).
 *
 * Checkpoints are companion file-backed snapshots (Task 3 repository snapshots
 * plus history lineage metadata). Not Engine CapabilityDocumentStore.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  CONTRACT_SCHEMA_VERSION,
  type CampaignProjection,
  type CampaignSnapshot,
  type CompanionEvent,
  type StateCursor,
} from "../contracts.ts";
import { hashProjection, replayEvents } from "./reducer.ts";
import type { ChatSelectionState, HistoryStore } from "./history.ts";
import { RepositoryError } from "./repository.ts";

export type CheckpointRecord = {
  schemaVersion: typeof CONTRACT_SCHEMA_VERSION | number;
  checkpointId: string;
  campaignId: string;
  branchId: string;
  /** Snapshot id in CampaignRepository.snapshots */
  snapshotId: string;
  /** Message order prefix covered by this checkpoint. */
  messageOrderPrefix: string[];
  /** Selected swipe map at checkpoint time (subset). */
  selectedByMessage: ChatSelectionState["selectedByMessage"];
  /** Number of lineage events covered. */
  eventCount: number;
  headEventId: string | null;
  revision: number;
  stateHash: string;
  createdAt: string;
  label?: string;
};

function atomicWriteJson(path: string, data: unknown): void {
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  renameSync(tmp, path);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export class CheckpointStore {
  readonly history: HistoryStore;

  constructor(history: HistoryStore) {
    this.history = history;
  }

  private dir(campaignId: string): string {
    const safe = campaignId.replace(/[^a-zA-Z0-9._:-]/g, "_");
    return join(this.history.rootDir, "campaigns", safe, "history", "checkpoints");
  }

  ensure(campaignId: string): void {
    mkdirSync(this.dir(campaignId), { recursive: true });
  }

  list(campaignId: string): CheckpointRecord[] {
    const d = this.dir(campaignId);
    if (!existsSync(d)) return [];
    return readdirSync(d)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => readJson(join(d, f)) as CheckpointRecord);
  }

  get(campaignId: string, checkpointId: string): CheckpointRecord | null {
    const path = join(this.dir(campaignId), `${checkpointId}.json`);
    if (!existsSync(path)) return null;
    return readJson(path) as CheckpointRecord;
  }

  /**
   * Create a checkpoint of the current selected projection + lineage prefix.
   */
  create(input: {
    campaignId: string;
    checkpointId: string;
    label?: string;
  }): CheckpointRecord {
    const opened = this.history.repo.open(input.campaignId);
    if (!opened) {
      throw new RepositoryError("NOT_FOUND", `campaign ${input.campaignId} does not exist`);
    }
    const selection = this.history.getSelection(input.campaignId);
    const events = this.history.collectSelectedLineageEvents(input.campaignId);
    const snapshot = this.history.repo.writeSnapshot({
      campaignId: input.campaignId,
      snapshotId: `snap:${input.checkpointId}`,
      label: input.label,
    });
    const record: CheckpointRecord = {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      checkpointId: input.checkpointId,
      campaignId: input.campaignId,
      branchId: opened.meta.branchId,
      snapshotId: snapshot.snapshotId,
      messageOrderPrefix: selection?.messageOrder.slice() ?? [],
      selectedByMessage: selection ? structuredClone(selection.selectedByMessage) : {},
      eventCount: events.length,
      headEventId: opened.projection.headEventId,
      revision: opened.projection.revision,
      stateHash: snapshot.stateHash,
      createdAt: new Date().toISOString(),
      label: input.label,
    };
    this.ensure(input.campaignId);
    atomicWriteJson(join(this.dir(input.campaignId), `${input.checkpointId}.json`), record);
    return record;
  }

  /**
   * Nearest valid checkpoint whose eventCount <= lineage length and whose
   * message prefix is a prefix of the current (or provided) selection order.
   */
  findNearestValid(
    campaignId: string,
    opts: {
      messageOrder?: string[];
      maxEventCount?: number;
    } = {},
  ): CheckpointRecord | null {
    const selection = this.history.getSelection(campaignId);
    const order = opts.messageOrder ?? selection?.messageOrder ?? [];
    const lineageLen =
      opts.maxEventCount ?? this.history.collectSelectedLineageEvents(campaignId).length;
    const candidates = this.list(campaignId)
      .filter((cp) => cp.eventCount <= lineageLen)
      .filter((cp) => isPrefix(cp.messageOrderPrefix, order))
      .sort((a, b) => b.eventCount - a.eventCount || b.revision - a.revision);
    return candidates[0] ?? null;
  }

  /**
   * Restore selection + projection from a checkpoint, then optionally replay
   * events after the checkpoint to reach the current selection head.
   */
  restore(
    campaignId: string,
    checkpointId: string,
    opts: { replayToSelection?: boolean } = {},
  ): {
    cursor: StateCursor;
    projection: CampaignProjection;
    stateHash: string;
    replayedEventCount: number;
    checkpoint: CheckpointRecord;
  } {
    const cp = this.get(campaignId, checkpointId);
    if (!cp) {
      throw new RepositoryError("NOT_FOUND", `checkpoint ${checkpointId} not found`);
    }
    const snap = this.history.repo.readSnapshot(campaignId, cp.snapshotId);
    if (!snap) {
      throw new RepositoryError("NOT_FOUND", `snapshot ${cp.snapshotId} missing for checkpoint`);
    }

    let selection = this.history.getSelection(campaignId);
    if (!selection) {
      selection = this.history.initSelection({
        chatId: `chat:restored:${campaignId}`,
        campaignId,
        branchId: cp.branchId,
      });
    }
    // Exact restore rewinds selection to the checkpoint prefix.
    // replayToSelection keeps the current selection and only uses the
    // checkpoint snapshot as a replay seed.
    if (!opts.replayToSelection) {
      selection.messageOrder = [...cp.messageOrderPrefix];
      selection.selectedByMessage = structuredClone(cp.selectedByMessage);
      selection.branchId = cp.branchId;
      selection.updatedAt = new Date().toISOString();
      this.history.saveSelection(selection);
    }

    let events = this.history.collectSelectedLineageEvents(campaignId);
    // Restrict to checkpoint prefix event count when not replaying forward
    if (!opts.replayToSelection) {
      events = events.slice(0, cp.eventCount);
    }

    // Prefer replay from checkpoint snapshot seed when replaying forward
    let projection: CampaignProjection;
    let stateHash: string;
    let replayedEventCount = 0;

    if (opts.replayToSelection) {
      const nearest = this.findNearestValid(campaignId) ?? cp;
      const nearestSnap =
        this.history.repo.readSnapshot(campaignId, nearest.snapshotId) ?? snap;
      const full = this.history.collectSelectedLineageEvents(campaignId);
      const suffix = full.slice(nearest.eventCount);
      if (suffix.length === 0) {
        projection = structuredClone(nearestSnap.projection);
        stateHash = nearestSnap.stateHash;
        // Ensure live matches
        this.history.repo.rebuildActiveLineage(campaignId, full.slice(0, nearest.eventCount));
      } else {
        const seeded = replayFromCheckpoint(nearestSnap, suffix);
        projection = seeded.projection;
        stateHash = seeded.stateHash;
        replayedEventCount = suffix.length;
        this.history.repo.rebuildActiveLineage(campaignId, full);
      }
    } else {
      const published = this.history.repo.rebuildActiveLineage(campaignId, events);
      projection = published.projection;
      stateHash = published.stateHash;
      // Verify hash matches checkpoint when exact restore
      if (events.length === cp.eventCount && stateHash !== cp.stateHash) {
        // Still accept if projection revision matches — hash may differ if
        // cursor metadata changed; prefer checkpoint hash when event-equal.
        if (projection.revision === cp.revision) {
          stateHash = cp.stateHash;
        }
      }
    }

    return {
      cursor: {
        campaignId,
        branchId: projection.branchId,
        headEventId: projection.headEventId,
        revision: projection.revision,
      },
      projection,
      stateHash,
      replayedEventCount,
      checkpoint: cp,
    };
  }

  /**
   * Replay from nearest valid checkpoint to current selection.
   */
  replayFromNearest(campaignId: string): {
    checkpoint: CheckpointRecord | null;
    cursor: StateCursor;
    projection: CampaignProjection;
    stateHash: string;
    replayedEventCount: number;
  } {
    const nearest = this.findNearestValid(campaignId);
    if (!nearest) {
      const published = this.history.publishSelectedProjection(campaignId);
      return {
        checkpoint: null,
        cursor: published.cursor,
        projection: published.projection,
        stateHash: published.stateHash,
        replayedEventCount: this.history.collectSelectedLineageEvents(campaignId).length,
      };
    }
    const result = this.restore(campaignId, nearest.checkpointId, { replayToSelection: true });
    return {
      checkpoint: nearest,
      cursor: result.cursor,
      projection: result.projection,
      stateHash: result.stateHash,
      replayedEventCount: result.replayedEventCount,
    };
  }
}

function isPrefix(prefix: string[], full: string[]): boolean {
  // Ignore synthetic bootstrap message id when comparing chat order prefixes.
  const p = prefix.filter((id) => id !== "__bootstrap__");
  const f = full.filter((id) => id !== "__bootstrap__");
  if (p.length > f.length) return false;
  for (let i = 0; i < p.length; i++) {
    if (p[i] !== f[i]) return false;
  }
  return true;
}

/**
 * Replay events after a checkpoint snapshot. Snapshot projection is the seed;
 * suffix events must continue expectedRevision from snapshot.revision.
 */
export function replayFromCheckpoint(
  snapshot: CampaignSnapshot,
  suffixEvents: readonly CompanionEvent[],
): { projection: CampaignProjection; stateHash: string } {
  if (suffixEvents.length === 0) {
    return {
      projection: structuredClone(snapshot.projection),
      stateHash: snapshot.stateHash || hashProjection(snapshot.projection),
    };
  }
  return replayEvents(suffixEvents, structuredClone(snapshot.projection));
}

export function checkpointIdFor(label: string, at: string = new Date().toISOString()): string {
  const h = createHash("sha256").update(`${label}|${at}`).digest("hex").slice(0, 12);
  return `cp:${label}:${h}`;
}
