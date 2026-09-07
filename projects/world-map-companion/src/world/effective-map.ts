/**
 * Effective map resolver (Task 6).
 *
 * Combines an immutable World Maps definition (v2 / companion edges) with
 * branch-specific discovery and access overlays. Every travel consumer —
 * native route validation, prompt destinations, map rendering, NPC routing,
 * and fast travel — must read this same effective result.
 *
 * Overlay application never mutates the immutable base definition.
 */

import type { StableId } from "../contracts.ts";
import {
  type LinkState,
  type SpatialDefinition,
  type SpatialLink,
  type SpatialLocation,
  buildLocationIndex,
  canReach,
  reachableFrom,
  resolveDestinations,
  resolveRoute,
} from "./spatial-graph.ts";

export type EdgeKey = `${string}->${string}`;

export function edgeKey(fromId: string, toId: string): EdgeKey {
  return `${fromId}->${toId}`;
}

/** Branch-specific override of a single authored link's travel state. */
export type EdgeStateOverlay = {
  fromId: StableId;
  toId: StableId;
  state: LinkState;
  /** Campaign/branch event that established this override, when known. */
  sourceEventId?: StableId;
  notes?: string;
};

/**
 * Observer discovery is separate from physical link state.
 * Knowing an entrance exists does not open a hidden link; opening a link
 * does not automatically grant knowledge to every observer.
 */
export type DiscoveryOverlay = {
  observerId: StableId;
  knownLocationIds: StableId[];
  /** Entrances / links this observer has discovered (may still be hidden to others). */
  knownEdgeKeys?: EdgeKey[];
};

/** Social permission is separate from physical access and discovery. */
export type SocialPermissionOverlay = {
  locationId: StableId;
  actorId: StableId;
  permitted: boolean;
  reason?: string;
};

/** Closed / unavailable services — does not change topology. */
export type ServiceOverlay = {
  serviceId: StableId;
  locationId: StableId;
  open: boolean;
  reason?: string;
};

export type MapOverlay = {
  /** Link state overrides keyed by fromId->toId (source location owns the link). */
  edgeStates?: Record<string, EdgeStateOverlay>;
  discoveries?: DiscoveryOverlay[];
  socialPermissions?: SocialPermissionOverlay[];
  services?: ServiceOverlay[];
  /**
   * When set, bumps the effective definition.revision so spatial owner
   * expectedDefinitionRevision checks stay coherent with overlay commits.
   */
  overlayRevisionBump?: number;
};

export type EffectiveMap = {
  /** Immutable authored base (do not mutate). */
  base: SpatialDefinition;
  overlay: MapOverlay;
  /** Overlay-applied definition for routing / destinations. */
  definition: SpatialDefinition;
  /** Honesty: this object is a companion projection, not a native Engine document. */
  honesty: {
    kind: "companion-effective-map";
    mutatesBase: false;
    nativeOwner: "hierarchical-maps-spatial-definition";
  };
};

function cloneLocation(location: SpatialLocation): SpatialLocation {
  return {
    ...location,
    links: location.links.map((link) => ({ ...link })),
    lorebookEntryIds: location.lorebookEntryIds ? [...location.lorebookEntryIds] : undefined,
  };
}

function applyEdgeOverlays(
  locations: SpatialLocation[],
  edgeStates: Record<string, EdgeStateOverlay> | undefined,
): SpatialLocation[] {
  if (!edgeStates || Object.keys(edgeStates).length === 0) {
    return locations.map(cloneLocation);
  }
  const byKey = new Map<string, EdgeStateOverlay>();
  for (const overlay of Object.values(edgeStates)) {
    byKey.set(edgeKey(overlay.fromId, overlay.toId), overlay);
  }
  return locations.map((location) => {
    const next = cloneLocation(location);
    next.links = next.links.map((link: SpatialLink) => {
      const overlay = byKey.get(edgeKey(location.id, link.targetId));
      if (!overlay) return link;
      return { ...link, state: overlay.state };
    });
    return next;
  });
}

/**
 * Build an effective definition. Parent navigation edges are structural
 * (parentId); sealed boundaries remain cut because crypt components are
 * separate roots — parent nav cannot bridge components.
 */
export function resolveEffectiveMap(
  base: SpatialDefinition,
  overlay: MapOverlay = {},
): EffectiveMap {
  const locations = applyEdgeOverlays(base.locations, overlay.edgeStates);
  const bump = overlay.overlayRevisionBump ?? Object.keys(overlay.edgeStates ?? {}).length;
  const definition: SpatialDefinition = {
    ...base,
    locations,
    revision: base.revision + bump,
  };
  return {
    base,
    overlay,
    definition,
    honesty: {
      kind: "companion-effective-map",
      mutatesBase: false,
      nativeOwner: "hierarchical-maps-spatial-definition",
    },
  };
}

/** Merge overlays immutably (later edgeStates win on the same key). */
export function mergeOverlays(...parts: MapOverlay[]): MapOverlay {
  const edgeStates: Record<string, EdgeStateOverlay> = {};
  const discoveries: DiscoveryOverlay[] = [];
  const socialPermissions: SocialPermissionOverlay[] = [];
  const services: ServiceOverlay[] = [];
  let bump = 0;
  for (const part of parts) {
    if (part.edgeStates) Object.assign(edgeStates, part.edgeStates);
    if (part.discoveries) discoveries.push(...part.discoveries);
    if (part.socialPermissions) socialPermissions.push(...part.socialPermissions);
    if (part.services) services.push(...part.services);
    if (typeof part.overlayRevisionBump === "number") bump += part.overlayRevisionBump;
  }
  return {
    ...(Object.keys(edgeStates).length ? { edgeStates } : {}),
    ...(discoveries.length ? { discoveries } : {}),
    ...(socialPermissions.length ? { socialPermissions } : {}),
    ...(services.length ? { services } : {}),
    ...(bump ? { overlayRevisionBump: bump } : {}),
  };
}

export function setEdgeState(
  overlay: MapOverlay,
  fromId: string,
  toId: string,
  state: LinkState,
  extra: Partial<EdgeStateOverlay> = {},
): MapOverlay {
  const key = edgeKey(fromId, toId);
  return mergeOverlays(overlay, {
    edgeStates: {
      [key]: { fromId, toId, state, ...extra },
    },
    overlayRevisionBump: 1,
  });
}

export function observerKnowsLocation(
  overlay: MapOverlay,
  observerId: string,
  locationId: string,
): boolean {
  const discovery = overlay.discoveries?.find((d) => d.observerId === observerId);
  return Boolean(discovery?.knownLocationIds.includes(locationId));
}

export function actorHasSocialPermission(
  overlay: MapOverlay,
  actorId: string,
  locationId: string,
): boolean | null {
  const hits = overlay.socialPermissions?.filter(
    (p) => p.actorId === actorId && p.locationId === locationId,
  );
  if (!hits || hits.length === 0) return null;
  return hits[hits.length - 1]!.permitted;
}

export function isServiceOpen(overlay: MapOverlay, serviceId: string): boolean | null {
  const hits = overlay.services?.filter((s) => s.serviceId === serviceId);
  if (!hits || hits.length === 0) return null;
  return hits[hits.length - 1]!.open;
}

/**
 * Physical travel feasibility uses the effective definition only.
 * Social permission and discovery are filtered separately for prompts / UI.
 */
export function physicalRoute(
  effective: EffectiveMap,
  fromId: string | null,
  toId: string,
): string[] | null {
  return resolveRoute(effective.definition, fromId, toId);
}

export function physicalDestinations(effective: EffectiveMap, fromId: string | null) {
  return resolveDestinations(effective.definition, fromId);
}

export function physicalCanReach(
  effective: EffectiveMap,
  fromId: string,
  toId: string,
): boolean {
  return canReach(effective.definition, fromId, toId);
}

export function physicalReachable(effective: EffectiveMap, fromId?: string | null): string[] {
  return reachableFrom(effective.definition, fromId ?? effective.definition.startingLocationId);
}

/**
 * Player-view destinations: physical neighbors minus links/locations the
 * observer has not discovered when the authored link is still hidden in base.
 * Available physical links remain visible once effective state opens them.
 */
export function observerVisibleDestinations(
  effective: EffectiveMap,
  currentLocationId: string | null,
  observerId: string,
) {
  const physical = physicalDestinations(effective, currentLocationId);
  const discovery = effective.overlay.discoveries?.find((d) => d.observerId === observerId);
  if (!discovery) {
    // Without an observer record, expose only non-secret physical neighbors
    // (effective available). Hidden base links that became available via overlay
    // still require discovery to appear in player briefing.
    return physical.filter((dest) => {
      if (dest.relation !== "link") return true;
      return !isSecretEntranceReveal(effective, currentLocationId, dest.id);
    });
  }
  return physical.filter((dest) => {
    if (dest.relation !== "link") return true;
    if (!isSecretEntranceReveal(effective, currentLocationId, dest.id)) return true;
    const key = currentLocationId ? edgeKey(currentLocationId, dest.id) : null;
    return (
      discovery.knownLocationIds.includes(dest.id) ||
      (key !== null && (discovery.knownEdgeKeys ?? []).includes(key))
    );
  });
}

function isSecretEntranceReveal(
  effective: EffectiveMap,
  fromId: string | null,
  toId: string,
): boolean {
  if (!fromId) return false;
  const baseLoc = buildLocationIndex(effective.base).get(fromId);
  const baseLink = baseLoc?.links.find((l) => l.targetId === toId);
  if (!baseLink) return false;
  return baseLink.state === "hidden";
}

/** Deep-clone a definition so callers cannot mutate a shared base. */
export function freezeDefinition(definition: SpatialDefinition): SpatialDefinition {
  return {
    ...definition,
    locations: definition.locations.map(cloneLocation),
  };
}

export {
  buildLocationIndex,
  canReach,
  reachableFrom,
  resolveDestinations,
  resolveRoute,
};
