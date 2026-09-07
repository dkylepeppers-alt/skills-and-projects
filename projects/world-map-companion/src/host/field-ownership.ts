/**
 * Field-ownership arbitration stub (Task 2).
 *
 * Plan §4: one authoritative owner per domain. This stub refuses dual-write of
 * companion vs native domains — it does not yet reconcile live agent output.
 * PROPOSED companion logic; not an Engine API.
 */

export type FieldDomain =
  | "geography"
  | "playerFocalLocation"
  | "storyClock"
  | "npcPlacement"
  | "discovery"
  | "doorAccess"
  | "inventory"
  | "bonds"
  | "quests"
  | "companionAppointments"
  | "prose"
  | "presetChoices";

export type FieldOwner = "companion" | "native" | "world-maps" | "preset" | "legacy-tracker";

/** Static ownership table from plan §4 (authority column). */
export const FIELD_DOMAIN_OWNERS: Readonly<Record<FieldDomain, FieldOwner>> = Object.freeze({
  geography: "world-maps",
  playerFocalLocation: "native",
  storyClock: "companion",
  npcPlacement: "companion",
  discovery: "companion",
  doorAccess: "companion",
  inventory: "legacy-tracker",
  bonds: "legacy-tracker",
  quests: "legacy-tracker",
  companionAppointments: "companion",
  prose: "preset",
  presetChoices: "preset",
});

export type FieldWriteArbitration = {
  allowed: boolean;
  domain: FieldDomain;
  owner: FieldOwner;
  writer: FieldOwner;
  reason?: string;
};

/**
 * Refuse writes when the writer is not the domain owner.
 * Dual-write (companion attempting native domains, or vice versa) is rejected.
 */
export function arbitrateFieldWrite(domain: FieldDomain, writer: FieldOwner): FieldWriteArbitration {
  const owner = FIELD_DOMAIN_OWNERS[domain];
  if (!owner) {
    return {
      allowed: false,
      domain,
      owner: "companion",
      writer,
      reason: `Unknown field domain: ${String(domain)}`,
    };
  }
  if (writer !== owner) {
    return {
      allowed: false,
      domain,
      owner,
      writer,
      reason: `Refusing dual-write: domain "${domain}" is owned by "${owner}", writer "${writer}" is not the authority`,
    };
  }
  return { allowed: true, domain, owner, writer };
}

/** Throw when arbitration refuses the write. */
export function assertFieldWriteAllowed(domain: FieldDomain, writer: FieldOwner): void {
  const result = arbitrateFieldWrite(domain, writer);
  if (!result.allowed) {
    throw new Error(result.reason ?? "field-ownership arbitration refused write");
  }
}

export function getFieldOwner(domain: FieldDomain): FieldOwner {
  return FIELD_DOMAIN_OWNERS[domain];
}
