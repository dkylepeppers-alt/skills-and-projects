/**
 * Hand-rolled schema validators for companion contracts (Task 3).
 * No zod dependency — consistent with package.json (no schema lib).
 */

import {
  CONTRACT_SCHEMA_VERSION,
  isNonEmptyStableId,
  type CampaignProjection,
  type CampaignRecord,
  type CompanionEvent,
  type EventPayload,
  type LocationState,
  type NarrowCampaignRef,
  type NpcPlacement,
  type NpcState,
  type StateCursor,
  type TurnAnchor,
  type TurnTicket,
  type WorldPack,
} from "./contracts.ts";

export type ValidationIssue = { path: string; message: string };

export class SchemaValidationError extends Error {
  readonly code = "SCHEMA_VALIDATION" as const;
  readonly issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super(
      issues.length === 1
        ? `Schema validation failed: ${issues[0].path}: ${issues[0].message}`
        : `Schema validation failed (${issues.length} issues): ${issues
            .slice(0, 3)
            .map((i) => `${i.path}: ${i.message}`)
            .join("; ")}`,
    );
    this.name = "SchemaValidationError";
    this.issues = issues;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectString(issues: ValidationIssue[], path: string, value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) {
    issues.push({ path, message: "expected non-empty string" });
    return false;
  }
  return true;
}

function expectStableId(issues: ValidationIssue[], path: string, value: unknown): boolean {
  if (!isNonEmptyStableId(value)) {
    issues.push({ path, message: "expected stable non-empty ID string" });
    return false;
  }
  return true;
}

function expectInt(issues: ValidationIssue[], path: string, value: unknown, min = 0): boolean {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    issues.push({ path, message: `expected integer >= ${min}` });
    return false;
  }
  return true;
}

function expectSchemaVersion(issues: ValidationIssue[], path: string, value: unknown): boolean {
  if (value !== CONTRACT_SCHEMA_VERSION) {
    issues.push({
      path,
      message: `unsupported schemaVersion ${String(value)}; expected ${CONTRACT_SCHEMA_VERSION}`,
    });
    return false;
  }
  return true;
}

export function validateTurnAnchor(value: unknown, path = "TurnAnchor"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isObject(value)) {
    return [{ path, message: "expected object" }];
  }
  expectString(issues, `${path}.chatId`, value.chatId);
  expectString(issues, `${path}.messageId`, value.messageId);
  expectInt(issues, `${path}.swipeIndex`, value.swipeIndex, 0);
  expectString(issues, `${path}.contentHash`, value.contentHash);
  return issues;
}

export function validateStateCursor(value: unknown, path = "StateCursor"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isObject(value)) {
    return [{ path, message: "expected object" }];
  }
  expectStableId(issues, `${path}.campaignId`, value.campaignId);
  expectStableId(issues, `${path}.branchId`, value.branchId);
  if (value.headEventId !== null && !isNonEmptyStableId(value.headEventId)) {
    issues.push({ path: `${path}.headEventId`, message: "expected string or null" });
  }
  expectInt(issues, `${path}.revision`, value.revision, 0);
  return issues;
}

export function validateTurnTicket(value: unknown, path = "TurnTicket"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isObject(value)) {
    return [{ path, message: "expected object" }];
  }
  expectStableId(issues, `${path}.id`, value.id);
  issues.push(...validateStateCursor(value.base, `${path}.base`));
  issues.push(...validateTurnAnchor(value.anchor, `${path}.anchor`));
  if (!Array.isArray(value.acceptedActionIds) || !value.acceptedActionIds.every((x) => typeof x === "string")) {
    issues.push({ path: `${path}.acceptedActionIds`, message: "expected string[]" });
  }
  if (typeof value.observationOnly !== "boolean") {
    issues.push({ path: `${path}.observationOnly`, message: "expected boolean" });
  }
  return issues;
}

function validateNpcPlacement(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isObject(value)) {
    issues.push({ path, message: "expected placement object" });
    return;
  }
  const kind = value.kind;
  if (kind === "at") {
    expectStableId(issues, `${path}.locationId`, value.locationId);
  } else if (kind === "traveling") {
    expectStableId(issues, `${path}.fromLocationId`, value.fromLocationId);
    expectStableId(issues, `${path}.toLocationId`, value.toLocationId);
  } else if (kind === "unknown") {
    // notes optional
  } else {
    issues.push({ path: `${path}.kind`, message: "expected at|traveling|unknown" });
  }
}

export function validateNpcState(value: unknown, path = "NpcState"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isObject(value)) {
    return [{ path, message: "expected object" }];
  }
  expectStableId(issues, `${path}.npcId`, value.npcId);
  validateNpcPlacement(value.placement, `${path}.placement`, issues);
  return issues;
}

export function validateLocationState(value: unknown, path = "LocationState"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isObject(value)) {
    return [{ path, message: "expected object" }];
  }
  expectStableId(issues, `${path}.locationId`, value.locationId);
  if (!isObject(value.access)) {
    issues.push({ path: `${path}.access`, message: "expected object" });
  } else {
    if (typeof value.access.physicallyOpen !== "boolean") {
      issues.push({ path: `${path}.access.physicallyOpen`, message: "expected boolean" });
    }
    if (!Array.isArray(value.access.entranceKnownBy)) {
      issues.push({ path: `${path}.access.entranceKnownBy`, message: "expected string[]" });
    }
    if (!Array.isArray(value.access.permissionGrantedTo)) {
      issues.push({ path: `${path}.access.permissionGrantedTo`, message: "expected string[]" });
    }
  }
  if (!isObject(value.discoveryByObserver)) {
    issues.push({ path: `${path}.discoveryByObserver`, message: "expected object map" });
  }
  return issues;
}

export function validateCampaignRecord(value: unknown, path = "CampaignRecord"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isObject(value)) {
    return [{ path, message: "expected object" }];
  }
  expectSchemaVersion(issues, `${path}.schemaVersion`, value.schemaVersion);
  expectStableId(issues, `${path}.campaignId`, value.campaignId);
  expectString(issues, `${path}.displayName`, value.displayName);
  expectStableId(issues, `${path}.activeBranchId`, value.activeBranchId);
  expectStableId(issues, `${path}.sourceWorldId`, value.sourceWorldId);
  expectString(issues, `${path}.sourceWorldVersion`, value.sourceWorldVersion);
  if (!isObject(value.settings)) {
    issues.push({ path: `${path}.settings`, message: "expected object" });
  }
  if (!Array.isArray(value.observerIds)) {
    issues.push({ path: `${path}.observerIds`, message: "expected string[]" });
  }
  if (!isObject(value.ownership) || value.ownership.documentKind !== "world-map-companion-campaign") {
    issues.push({
      path: `${path}.ownership.documentKind`,
      message: 'expected "world-map-companion-campaign"',
    });
  }
  return issues;
}

export function validateNarrowCampaignRef(value: unknown, path = "NarrowCampaignRef"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isObject(value)) {
    return [{ path, message: "expected object" }];
  }
  expectSchemaVersion(issues, `${path}.schemaVersion`, value.schemaVersion);
  expectStableId(issues, `${path}.campaignId`, value.campaignId);
  expectStableId(issues, `${path}.branchId`, value.branchId);
  expectString(issues, `${path}.packageDocumentId`, value.packageDocumentId);
  if (value.headEventId !== null && !isNonEmptyStableId(value.headEventId)) {
    issues.push({ path: `${path}.headEventId`, message: "expected string or null" });
  }
  expectInt(issues, `${path}.revision`, value.revision, 0);
  return issues;
}

export function validateWorldPack(value: unknown, path = "WorldPack"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isObject(value)) {
    return [{ path, message: "expected object" }];
  }
  expectSchemaVersion(issues, `${path}.schemaVersion`, value.schemaVersion);
  expectStableId(issues, `${path}.worldId`, value.worldId);
  expectString(issues, `${path}.displayName`, value.displayName);
  if (!isObject(value.sourceMap)) {
    issues.push({ path: `${path}.sourceMap`, message: "expected object" });
  } else {
    expectString(issues, `${path}.sourceMap.mapId`, value.sourceMap.mapId);
    expectString(issues, `${path}.sourceMap.revision`, value.sourceMap.revision);
    expectString(issues, `${path}.sourceMap.contentHash`, value.sourceMap.contentHash);
  }
  if (!Array.isArray(value.locationProfiles)) {
    issues.push({ path: `${path}.locationProfiles`, message: "expected array" });
  }
  if (!Array.isArray(value.npcDefinitions)) {
    issues.push({ path: `${path}.npcDefinitions`, message: "expected array" });
  }
  return issues;
}

const EVENT_TYPES = new Set([
  "campaign.created",
  "npc.placed",
  "npc.moved",
  "npc.updated",
  "location.access_changed",
  "location.discovered",
  "location.updated",
  "observer.registered",
  "correction.supersede",
  "time.advanced",
  "checkpoint.created",
]);

function validatePayload(payload: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isObject(payload) || typeof payload.type !== "string" || !EVENT_TYPES.has(payload.type)) {
    issues.push({ path: `${path}.type`, message: "unknown or missing event payload type" });
    return;
  }
  switch (payload.type) {
    case "campaign.created":
      issues.push(...validateCampaignRecord(payload.campaign, `${path}.campaign`));
      break;
    case "npc.placed":
      issues.push(...validateNpcState(payload.npc, `${path}.npc`));
      break;
    case "npc.moved":
      expectStableId(issues, `${path}.npcId`, payload.npcId);
      validateNpcPlacement(payload.placement, `${path}.placement`, issues);
      break;
    case "npc.updated":
      expectStableId(issues, `${path}.npcId`, payload.npcId);
      if (!isObject(payload.patch)) {
        issues.push({ path: `${path}.patch`, message: "expected object" });
      }
      break;
    case "location.access_changed":
      expectStableId(issues, `${path}.locationId`, payload.locationId);
      if (!isObject(payload.access)) {
        issues.push({ path: `${path}.access`, message: "expected object" });
      }
      break;
    case "location.discovered":
      expectStableId(issues, `${path}.locationId`, payload.locationId);
      expectStableId(issues, `${path}.observerId`, payload.observerId);
      break;
    case "location.updated":
      expectStableId(issues, `${path}.locationId`, payload.locationId);
      if (!isObject(payload.patch)) {
        issues.push({ path: `${path}.patch`, message: "expected object" });
      }
      break;
    case "observer.registered":
      expectStableId(issues, `${path}.observerId`, payload.observerId);
      break;
    case "correction.supersede":
      expectStableId(issues, `${path}.supersedesEventId`, payload.supersedesEventId);
      expectString(issues, `${path}.reason`, payload.reason);
      break;
    case "time.advanced":
      expectString(issues, `${path}.storyTime`, payload.storyTime);
      break;
    case "checkpoint.created":
      expectStableId(issues, `${path}.checkpointId`, payload.checkpointId);
      break;
  }
}

export function validateCompanionEvent(value: unknown, path = "CompanionEvent"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isObject(value)) {
    return [{ path, message: "expected object" }];
  }
  expectSchemaVersion(issues, `${path}.schemaVersion`, value.schemaVersion);
  expectStableId(issues, `${path}.eventId`, value.eventId);
  expectStableId(issues, `${path}.campaignId`, value.campaignId);
  expectStableId(issues, `${path}.branchId`, value.branchId);
  if (value.parentEventId !== null && !isNonEmptyStableId(value.parentEventId)) {
    issues.push({ path: `${path}.parentEventId`, message: "expected string or null" });
  }
  if (value.anchor !== null) {
    issues.push(...validateTurnAnchor(value.anchor, `${path}.anchor`));
  }
  expectInt(issues, `${path}.expectedRevision`, value.expectedRevision, 0);
  validatePayload(value.payload, `${path}.payload`, issues);
  if (!Array.isArray(value.visibility)) {
    issues.push({ path: `${path}.visibility`, message: "expected EventVisibility[]" });
  }
  expectString(issues, `${path}.createdAt`, value.createdAt);
  return issues;
}

export function validateCampaignProjection(value: unknown, path = "CampaignProjection"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isObject(value)) {
    return [{ path, message: "expected object" }];
  }
  expectSchemaVersion(issues, `${path}.schemaVersion`, value.schemaVersion);
  expectStableId(issues, `${path}.campaignId`, value.campaignId);
  expectStableId(issues, `${path}.branchId`, value.branchId);
  expectInt(issues, `${path}.revision`, value.revision, 0);
  if (value.headEventId !== null && !isNonEmptyStableId(value.headEventId)) {
    issues.push({ path: `${path}.headEventId`, message: "expected string or null" });
  }
  if (!isObject(value.npcs) || !isObject(value.locations) || !isObject(value.observers)) {
    issues.push({ path, message: "npcs/locations/observers must be objects" });
  }
  if (!Array.isArray(value.supersededEventIds) || !Array.isArray(value.checkpointIds)) {
    issues.push({ path, message: "supersededEventIds/checkpointIds must be arrays" });
  }
  return issues;
}

export function assertValid<T>(issues: ValidationIssue[], value: T): T {
  if (issues.length > 0) throw new SchemaValidationError(issues);
  return value;
}

export function parseCompanionEvent(value: unknown): CompanionEvent {
  return assertValid(validateCompanionEvent(value), value as CompanionEvent);
}

export function parseCampaignProjection(value: unknown): CampaignProjection {
  return assertValid(validateCampaignProjection(value), value as CampaignProjection);
}

export function parseNarrowCampaignRef(value: unknown): NarrowCampaignRef {
  return assertValid(validateNarrowCampaignRef(value), value as NarrowCampaignRef);
}

export function parseWorldPack(value: unknown): WorldPack {
  return assertValid(validateWorldPack(value), value as WorldPack);
}

export function parseTurnTicket(value: unknown): TurnTicket {
  return assertValid(validateTurnTicket(value), value as TurnTicket);
}

export function parseStateCursor(value: unknown): StateCursor {
  return assertValid(validateStateCursor(value), value as StateCursor);
}

export function parseTurnAnchor(value: unknown): TurnAnchor {
  return assertValid(validateTurnAnchor(value), value as TurnAnchor);
}

export type { EventPayload, NpcPlacement, NpcState, LocationState };
