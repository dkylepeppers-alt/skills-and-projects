/**
 * Spatial graph helpers aligned with Marinara Engine spatial-context utils
 * (pinned Engine 9bbee87 — packages/shared/src/utils/spatial-context.ts).
 *
 * Local reimplementation so Nevermore pack tests do not require an Engine
 * import path. Behavior must stay consistent with resolveSpatialRoute /
 * resolveSpatialDestinations (parent enter/leave + available links only).
 */

export type LinkState = "available" | "hidden" | "blocked";

export type SpatialLink = {
  targetId: string;
  label?: string;
  bidirectional: boolean;
  state: LinkState;
};

export type SpatialLocation = {
  id: string;
  parentId: string | null;
  name: string;
  kind: string;
  status: "active" | "archived";
  sortOrder: number;
  links: SpatialLink[];
  description?: string;
  childPresentation?: string;
  lorebookEntryIds?: string[];
  [key: string]: unknown;
};

export type SpatialDefinition = {
  schemaVersion: 1;
  ownerMode: "roleplay" | "game";
  enabled: boolean;
  locations: SpatialLocation[];
  startingLocationId: string | null;
  revision: number;
};

export type DestinationRelation = "enter" | "leave" | "link";

export type SpatialDestination = {
  id: string;
  name: string;
  kind: string;
  relation: DestinationRelation;
  label?: string;
  sortOrder: number;
};

/** Engine SPATIAL_CONTEXT_LIMITS.maxRouteLocations */
export const MAX_ROUTE_LOCATIONS = 64;

export function buildLocationIndex(
  definition: Pick<SpatialDefinition, "locations">,
): Map<string, SpatialLocation> {
  const byId = new Map<string, SpatialLocation>();
  for (const location of definition.locations) {
    if (!byId.has(location.id)) byId.set(location.id, location);
  }
  return byId;
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function compareDestinations(left: SpatialDestination, right: SpatialDestination): number {
  return (
    left.sortOrder - right.sortOrder ||
    compareText(left.name, right.name) ||
    compareText(left.id, right.id) ||
    compareText(left.relation, right.relation)
  );
}

function destinationFromLocation(
  location: SpatialLocation,
  relation: DestinationRelation,
  label?: string,
): SpatialDestination {
  return {
    id: location.id,
    name: location.name,
    kind: location.kind,
    relation,
    ...(label ? { label } : {}),
    sortOrder: location.sortOrder,
  };
}

/**
 * One-hop destinations: parent leave, child enter, available outgoing links,
 * and reverse of available bidirectional links. Hidden/blocked links are excluded.
 */
export function resolveDestinations(
  definition: Pick<SpatialDefinition, "enabled" | "locations">,
  currentLocationId: string | null,
): SpatialDestination[] {
  if (!definition.enabled || currentLocationId === null) return [];
  const byId = buildLocationIndex(definition);
  const current = byId.get(currentLocationId);
  if (!current) return [];

  const destinations = new Map<string, SpatialDestination>();
  const add = (
    location: SpatialLocation | undefined,
    relation: DestinationRelation,
    label?: string,
  ) => {
    if (!location || location.status !== "active" || destinations.has(location.id)) return;
    destinations.set(location.id, destinationFromLocation(location, relation, label));
  };

  if (current.parentId !== null) add(byId.get(current.parentId), "leave");

  for (const location of definition.locations) {
    if (location.parentId === current.id) add(location, "enter");
  }

  for (const link of current.links) {
    if (link.state === "available") add(byId.get(link.targetId), "link", link.label);
  }

  for (const source of definition.locations) {
    if (source.status !== "active") continue;
    for (const link of source.links) {
      if (link.bidirectional && link.state === "available" && link.targetId === current.id) {
        add(source, "link", link.label);
      }
    }
  }

  return Array.from(destinations.values()).sort(compareDestinations);
}

/**
 * Shortest directed route using the same adjacency as one-hop movement.
 * Returned IDs exclude the current location (Engine contract).
 */
export function resolveRoute(
  definition: Pick<SpatialDefinition, "enabled" | "locations">,
  currentLocationId: string | null,
  targetLocationId: string,
): string[] | null {
  if (!definition.enabled || currentLocationId === null || currentLocationId === targetLocationId) {
    return null;
  }
  const byId = buildLocationIndex(definition);
  const current = byId.get(currentLocationId);
  const target = byId.get(targetLocationId);
  if (!current || current.status !== "active" || !target || target.status !== "active") {
    return null;
  }

  const adjacency = new Map<string, Map<string, SpatialDestination>>();
  const addEdge = (
    fromId: string,
    destination: SpatialLocation | undefined,
    relation: DestinationRelation,
    label?: string,
  ) => {
    if (byId.get(fromId)?.status !== "active" || !destination || destination.status !== "active") {
      return;
    }
    const outgoing = adjacency.get(fromId) ?? new Map<string, SpatialDestination>();
    if (!outgoing.has(destination.id)) {
      outgoing.set(destination.id, destinationFromLocation(destination, relation, label));
      adjacency.set(fromId, outgoing);
    }
  };

  for (const location of definition.locations) {
    if (location.status !== "active" || location.parentId === null) continue;
    addEdge(location.id, byId.get(location.parentId), "leave");
    addEdge(location.parentId, location, "enter");
  }
  for (const location of definition.locations) {
    if (location.status !== "active") continue;
    for (const link of location.links) {
      if (link.state === "available") addEdge(location.id, byId.get(link.targetId), "link", link.label);
    }
  }
  for (const location of definition.locations) {
    if (location.status !== "active") continue;
    for (const link of location.links) {
      if (link.bidirectional && link.state === "available") {
        addEdge(link.targetId, location, "link", link.label);
      }
    }
  }

  const outgoingIds = new Map(
    Array.from(adjacency, ([locationId, destinations]) => [
      locationId,
      Array.from(destinations.values())
        .sort(compareDestinations)
        .map((destination) => destination.id),
    ]),
  );

  const queue: Array<{ locationId: string; path: string[] }> = [
    { locationId: currentLocationId, path: [] },
  ];
  const visited = new Set([currentLocationId]);
  while (queue.length > 0) {
    const entry = queue.shift()!;
    for (const destinationId of outgoingIds.get(entry.locationId) ?? []) {
      if (visited.has(destinationId)) continue;
      const path = [...entry.path, destinationId];
      if (destinationId === targetLocationId) return path;
      visited.add(destinationId);
      if (path.length < MAX_ROUTE_LOCATIONS) {
        queue.push({ locationId: destinationId, path });
      }
    }
  }
  return null;
}

export function canReach(
  definition: Pick<SpatialDefinition, "enabled" | "locations">,
  fromId: string,
  toId: string,
): boolean {
  return fromId === toId || resolveRoute(definition, fromId, toId) !== null;
}

export function reachableFrom(
  definition: SpatialDefinition,
  fromId: string | null = definition.startingLocationId,
): string[] {
  if (fromId === null) return [];
  return definition.locations
    .filter((l) => l.status === "active" && canReach(definition, fromId, l.id))
    .map((l) => l.id);
}
