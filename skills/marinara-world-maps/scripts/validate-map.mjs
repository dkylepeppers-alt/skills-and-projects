#!/usr/bin/env node
/**
 * validate-map.mjs — validate a Marinara World Maps file without an Engine checkout.
 *
 * Two layers:
 *   ERRORS check a source-pinned subset of the definition and portable lore contracts.
 *   WARNINGS identify portability risks and optional authoring decisions.
 * This is structural preflight, NOT proof of an in-app import or runtime behavior.
 *
 * Usage:
 *   node validate-map.mjs <file.world-map.json> [--quiet] [--no-lint] [--json]
 *
 * Exit codes: 0 clean (warnings allowed), 1 errors found, 2 could not read/parse.
 */

import { readFileSync } from "node:fs";
import { portableLoreIsValid } from "./portable-lore.mjs";

const LIMITS = {
  // Engine v2.5.2 SPATIAL_CONTEXT_LIMITS.maxLocations and World Maps 1.8.0
  // SPATIAL_MAP_LOCATION_LIMIT. World Maps 1.5.0 retired the 500-location cap.
  maxLocations: 5_000,
  maxDepth: 20,
  maxLinksPerLocation: 50,
  maxNameLength: 200,
  maxDescriptionLength: 4_000,
  maxAwarenessSummaryLength: 1_000,
  maxModelMemoryLength: 8_000,
  maxIdLength: 128,
  maxLinkLabelLength: 200,
  maxLorebookEntryIdsPerLocation: 50,
  maxPromptDestinations: 50,
};
// Runtime prompt caps (World Maps runtime-prompt.ts) — lint thresholds, not schema limits.
const PROMPT_KNOWN_LOCATIONS = 50;
const PROMPT_BREADCRUMB_NODES = 20;

const KINDS = ["region", "settlement", "place", "building", "floor", "room"];
const PRESENTATIONS = ["map", "layers", "list"];
const STATUSES = ["active", "archived"];
const LINK_STATES = ["available", "hidden", "blocked"];
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;

const errors = [];
const warnings = [];
const err = (code, message, where) => errors.push({ code, message, where });
const warn = (code, message, where) => warnings.push({ code, message, where });

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const quiet = args.includes("--quiet");
const lint = !args.includes("--no-lint");
const asJson = args.includes("--json");

if (!file) {
  console.error(
    "Usage: node validate-map.mjs <file.world-map.json> [--quiet] [--no-lint] [--json]",
  );
  process.exit(2);
}

let raw;
try {
  raw = JSON.parse(readFileSync(file === "-" ? 0 : file, "utf8"));
} catch (error) {
  console.error(`Could not read or parse ${file}: ${error.message}`);
  process.exit(2);
}

/* ---------------------------------------------------------------- envelope */

const isRecord = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const record = isRecord(raw) ? raw : null;
const data = isRecord(record?.data) ? record.data : record;
const definition = data && "definition" in data ? data.definition : raw;

if (
  record &&
  !("definition" in (record ?? {})) &&
  isRecord(record?.data) &&
  "definition" in record.data
) {
  warn(
    "envelope_data_wrapper",
    "The definition is nested under `data`. The map library import unwraps that; the in-chat map editor import does NOT and will reject this file. Put `definition` at the top level.",
    "$",
  );
}
if (
  record &&
  record.format !== undefined &&
  record.format !== "marinara-hierarchical-map"
) {
  warn(
    "envelope_format",
    `Unexpected format "${record.format}"; native exports use "marinara-hierarchical-map".`,
    "$.format",
  );
}
if (record?.portableLore != null && !portableLoreIsValid(record.portableLore)) {
  err(
    "portable_lore_invalid",
    "Portable lore fails the pinned bundle parser checks. Omit absent lore; do not use an empty object.",
    "$.portableLore",
  );
}
if (record && record.artwork !== undefined) {
  if (!Array.isArray(record.artwork)) {
    warn(
      "artwork_not_array",
      "`artwork` should be an array; a non-array is ignored and every bundled image is lost.",
      "$.artwork",
    );
  } else {
    const dataUrl = /^data:image\/(?:jpeg|png|gif|webp|avif);base64,/iu;
    record.artwork.forEach((entry, i) => {
      const ok =
        isRecord(entry) &&
        typeof entry.sourceImageId === "string" &&
        entry.sourceImageId.trim() &&
        typeof entry.filename === "string" &&
        entry.filename.trim() &&
        typeof entry.data === "string" &&
        dataUrl.test(entry.data);
      if (!ok)
        warn(
          "artwork_entry_dropped",
          "Entry is missing sourceImageId, filename, or a base64 data URL of a supported type (jpeg/png/gif/webp/avif). Import skips it silently.",
          `$.artwork[${i}]`,
        );
    });
  }
}

if (!isRecord(definition)) {
  err(
    "definition_missing",
    "No definition object found (looked at $.definition, $.data.definition, then the root).",
    "$",
  );
  report();
}

/* -------------------------------------------------------- definition shape */

const d = definition;
if (d.schemaVersion !== 1)
  err(
    "schema_version",
    "`schemaVersion` must be the literal 1.",
    "$.schemaVersion",
  );
if (d.ownerMode !== "roleplay" && d.ownerMode !== "game")
  err("owner_mode", '`ownerMode` must be "roleplay" or "game".', "$.ownerMode");
if (typeof d.enabled !== "boolean")
  err("enabled", "`enabled` must be a boolean.", "$.enabled");
if (!Number.isSafeInteger(d.revision) || d.revision < 0)
  err(
    "revision",
    "`revision` must be a non-negative integer (0 for a fresh authored map).",
    "$.revision",
  );
if (!("startingLocationId" in d))
  err(
    "starting_location_required",
    "`startingLocationId` is required (may be null).",
    "$.startingLocationId",
  );
if (
  d.startingLocationId !== null &&
  (typeof d.startingLocationId !== "string" ||
    !ID_PATTERN.test(d.startingLocationId.trim()) ||
    d.startingLocationId.trim().length > 128)
)
  err(
    "starting_id_shape",
    "Starting ID must be null or a valid ID of at most 128 characters.",
    "$.startingLocationId",
  );
if (!Array.isArray(d.locations)) {
  err("locations_type", "`locations` must be an array.", "$.locations");
  report();
}

const KNOWN_DEFINITION_KEYS = new Set([
  "schemaVersion",
  "ownerMode",
  "enabled",
  "locations",
  "startingLocationId",
  "revision",
]);
for (const key of Object.keys(d)) {
  if (!KNOWN_DEFINITION_KEYS.has(key))
    err(
      "unknown_definition_key",
      `Unknown key "${key}". The definition schema is strict — one stray key fails the entire import.`,
      `$.${key}`,
    );
}

if (d.locations.length > LIMITS.maxLocations)
  err(
    "too_many_locations",
    `A spatial map can contain at most ${LIMITS.maxLocations} locations.`,
    "$.locations",
  );
else if (d.locations.length > 500)
  warn(
    "legacy_location_cap",
    `${d.locations.length} locations needs Marinara Engine v2.5.0 or newer and World Maps 1.5.0 or newer. Older Engines cap a map at 500 and skip a larger map when a game starts.`,
    "$.locations",
  );

/* ---------------------------------------------------------- location shape */

const KNOWN_LOCATION_KEYS = new Set([
  "id",
  "parentId",
  "name",
  "kind",
  "description",
  "modelMemory",
  "awarenessSummary",
  "icon",
  "referenceImageId",
  "useReferenceImage",
  "mapBackgroundImageId",
  "mapBackgroundPosition",
  "lorebookEntryIds",
  "childPresentation",
  "placement",
  "layerOrder",
  "links",
  "status",
  "sortOrder",
]);
const KNOWN_LINK_KEYS = new Set([
  "targetId",
  "label",
  "bidirectional",
  "state",
]);

const byId = new Map();
const firstIndexById = new Map();

// Mirror Zod trimming on an in-memory copy only, before structural comparisons.
if (typeof d.startingLocationId === "string")
  d.startingLocationId = d.startingLocationId.trim();
for (const loc of d.locations) {
  if (!isRecord(loc)) continue;
  for (const key of [
    "id",
    "parentId",
    "name",
    "icon",
    "referenceImageId",
    "mapBackgroundImageId",
  ])
    if (typeof loc[key] === "string") loc[key] = loc[key].trim();
  if (Array.isArray(loc.lorebookEntryIds))
    loc.lorebookEntryIds = loc.lorebookEntryIds.map((v) =>
      typeof v === "string" ? v.trim() : v,
    );
  if (Array.isArray(loc.links))
    for (const link of loc.links)
      if (isRecord(link))
        for (const key of ["targetId", "label"])
          if (typeof link[key] === "string") link[key] = link[key].trim();
}

d.locations.forEach((loc, i) => {
  const at = `locations[${i}]`;
  if (!isRecord(loc)) {
    err("location_type", "Each location must be an object.", at);
    return;
  }
  for (const key of Object.keys(loc)) {
    if (!KNOWN_LOCATION_KEYS.has(key))
      err(
        "unknown_location_key",
        `Unknown key "${key}" — the location schema is strict.`,
        `${at}.${key}`,
      );
  }

  const id = loc.id;
  if (typeof id !== "string" || !id.trim())
    err("id_required", "`id` is required.", `${at}.id`);
  else {
    if (id.length > LIMITS.maxIdLength)
      err(
        "id_length",
        `\`id\` exceeds ${LIMITS.maxIdLength} characters.`,
        `${at}.id`,
      );
    if (!ID_PATTERN.test(id.trim()))
      err(
        "id_pattern",
        "IDs must start alphanumeric and use only letters, numbers, dots, underscores, colons, or hyphens.",
        `${at}.id`,
      );
    if (firstIndexById.has(id)) {
      err(
        "duplicate_location_id",
        `Location ID "${id}" is already used by another location.`,
        `${at}.id`,
      );
      return;
    }
    firstIndexById.set(id, i);
    byId.set(id, loc);
  }

  if (!("parentId" in loc))
    err(
      "parent_required",
      "`parentId` is required (use null for a root).",
      `${at}.parentId`,
    );
  else if (
    loc.parentId !== null &&
    (typeof loc.parentId !== "string" ||
      !ID_PATTERN.test(loc.parentId.trim()) ||
      loc.parentId.length > 128)
  )
    err(
      "parent_pattern",
      "`parentId` must be null or a valid location ID.",
      `${at}.parentId`,
    );

  if (typeof loc.name !== "string" || !loc.name.trim())
    err("name_required", "`name` is required.", `${at}.name`);
  else if (loc.name.length > LIMITS.maxNameLength)
    err(
      "name_length",
      `\`name\` exceeds ${LIMITS.maxNameLength} characters.`,
      `${at}.name`,
    );

  if (!KINDS.includes(loc.kind))
    err(
      "kind_enum",
      `\`kind\` must be one of ${KINDS.join(", ")}.`,
      `${at}.kind`,
    );

  if (typeof loc.description !== "string")
    err(
      "description_required",
      "`description` is required (empty string is allowed).",
      `${at}.description`,
    );
  else if (loc.description.length > LIMITS.maxDescriptionLength)
    err(
      "description_length",
      `\`description\` exceeds ${LIMITS.maxDescriptionLength} characters.`,
      `${at}.description`,
    );

  if (loc.modelMemory !== undefined) {
    if (typeof loc.modelMemory !== "string")
      err(
        "model_memory_type",
        "`modelMemory` must be a string.",
        `${at}.modelMemory`,
      );
    else if (loc.modelMemory.length > LIMITS.maxModelMemoryLength)
      err(
        "model_memory_length",
        `\`modelMemory\` exceeds ${LIMITS.maxModelMemoryLength} characters.`,
        `${at}.modelMemory`,
      );
  }
  if (loc.awarenessSummary !== undefined) {
    if (typeof loc.awarenessSummary !== "string")
      err(
        "awareness_type",
        "`awarenessSummary` must be a string.",
        `${at}.awarenessSummary`,
      );
    else if (loc.awarenessSummary.length > LIMITS.maxAwarenessSummaryLength)
      err(
        "awareness_length",
        `\`awarenessSummary\` exceeds ${LIMITS.maxAwarenessSummaryLength} characters.`,
        `${at}.awarenessSummary`,
      );
  }
  if (
    loc.icon !== undefined &&
    (typeof loc.icon !== "string" || !loc.icon.trim() || loc.icon.length > 64)
  )
    err(
      "icon_shape",
      "`icon`, when present, must be a non-empty string of 64 characters or fewer.",
      `${at}.icon`,
    );
  for (const field of ["referenceImageId", "mapBackgroundImageId"])
    if (
      loc[field] !== undefined &&
      (typeof loc[field] !== "string" || !loc[field] || loc[field].length > 200)
    )
      err(
        "image_id_shape",
        "Image ID must be a nonempty string of at most 200 characters.",
        `${at}.${field}`,
      );
  if (
    loc.useReferenceImage !== undefined &&
    typeof loc.useReferenceImage !== "boolean"
  )
    err(
      "reference_toggle_type",
      "useReferenceImage must be boolean.",
      `${at}.useReferenceImage`,
    );

  if (
    loc.childPresentation !== undefined &&
    !PRESENTATIONS.includes(loc.childPresentation)
  )
    err(
      "presentation_enum",
      `\`childPresentation\` must be one of ${PRESENTATIONS.join(", ")}.`,
      `${at}.childPresentation`,
    );
  if (loc.status !== undefined && !STATUSES.includes(loc.status))
    err(
      "status_enum",
      `\`status\` must be one of ${STATUSES.join(", ")}.`,
      `${at}.status`,
    );
  if (loc.sortOrder !== undefined && !Number.isSafeInteger(loc.sortOrder))
    err(
      "sort_order_type",
      "`sortOrder` must be an integer.",
      `${at}.sortOrder`,
    );
  if (loc.layerOrder !== undefined && !Number.isSafeInteger(loc.layerOrder))
    err(
      "layer_order_type",
      "`layerOrder` must be an integer.",
      `${at}.layerOrder`,
    );

  for (const [field, value] of [
    ["placement", loc.placement],
    ["mapBackgroundPosition", loc.mapBackgroundPosition],
  ]) {
    if (value === undefined) continue;
    if (
      !isRecord(value) ||
      Object.keys(value).some((k) => k !== "x" && k !== "y")
    ) {
      err(
        "placement_shape",
        `\`${field}\` must be an object with exactly x and y.`,
        `${at}.${field}`,
      );
      continue;
    }
    for (const axis of ["x", "y"]) {
      const n = value[axis];
      if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 100)
        err(
          "placement_range",
          `\`${field}.${axis}\` must be a finite number from 0 to 100.`,
          `${at}.${field}.${axis}`,
        );
    }
  }

  if (loc.lorebookEntryIds !== undefined) {
    if (!Array.isArray(loc.lorebookEntryIds))
      err(
        "lore_ids_type",
        "`lorebookEntryIds` must be an array.",
        `${at}.lorebookEntryIds`,
      );
    else {
      if (loc.lorebookEntryIds.length > LIMITS.maxLorebookEntryIdsPerLocation)
        err(
          "too_many_lore_ids",
          `At most ${LIMITS.maxLorebookEntryIdsPerLocation} lorebook entry IDs per location.`,
          `${at}.lorebookEntryIds`,
        );
      const seen = new Set();
      loc.lorebookEntryIds.forEach((entryId, j) => {
        if (typeof entryId !== "string" || !entryId.trim())
          err(
            "lore_id_type",
            "Each lorebook entry ID must be a non-empty string.",
            `${at}.lorebookEntryIds[${j}]`,
          );
        if (seen.has(entryId))
          err(
            "duplicate_lorebook_entry_id",
            "A lorebook entry can be attached to a location only once.",
            `${at}.lorebookEntryIds[${j}]`,
          );
        seen.add(entryId);
      });
    }
  }

  if (loc.links !== undefined) {
    if (!Array.isArray(loc.links))
      err("links_type", "`links` must be an array.", `${at}.links`);
    else {
      if (loc.links.length > LIMITS.maxLinksPerLocation)
        err(
          "too_many_links",
          `A location can contain at most ${LIMITS.maxLinksPerLocation} links.`,
          `${at}.links`,
        );
      loc.links.forEach((link, j) => {
        const lat = `${at}.links[${j}]`;
        if (!isRecord(link)) {
          err("link_type", "Each link must be an object.", lat);
          return;
        }
        for (const key of Object.keys(link))
          if (!KNOWN_LINK_KEYS.has(key))
            err(
              "unknown_link_key",
              `Unknown link key "${key}" — the link schema is strict.`,
              `${lat}.${key}`,
            );
        if (
          typeof link.targetId !== "string" ||
          !ID_PATTERN.test((link.targetId ?? "").trim()) ||
          link.targetId.length > 128
        )
          err(
            "link_target_shape",
            "`targetId` must be a valid location ID.",
            `${lat}.targetId`,
          );
        if (
          link.label !== undefined &&
          (typeof link.label !== "string" ||
            !link.label.trim() ||
            link.label.length > LIMITS.maxLinkLabelLength)
        )
          err(
            "link_label_shape",
            `\`label\`, when present, must be a non-empty string of ${LIMITS.maxLinkLabelLength} characters or fewer.`,
            `${lat}.label`,
          );
        if (
          link.bidirectional !== undefined &&
          typeof link.bidirectional !== "boolean"
        )
          err(
            "link_bidirectional_type",
            "`bidirectional` must be a boolean.",
            `${lat}.bidirectional`,
          );
        if (link.state !== undefined && !LINK_STATES.includes(link.state))
          err(
            "link_state_enum",
            `\`state\` must be one of ${LINK_STATES.join(", ")}.`,
            `${lat}.state`,
          );
      });
    }
  }
});

/* --------------------------------------------- structural rules (blocking) */

// Do not feed invalid shapes into graph code; return structured diagnostics.
if (errors.length) report();

const locations = d.locations.filter(isRecord);
const indexOfLocation = new Map(d.locations.map((loc, i) => [loc, i]));
const at = (loc) =>
  `locations[${indexOfLocation.get(loc) ?? firstIndexById.get(loc?.id) ?? "?"}] "${loc?.id}"`;

if (d.startingLocationId !== null && d.startingLocationId !== undefined) {
  const start = byId.get(d.startingLocationId);
  if (!start)
    err(
      "starting_location_missing",
      "The starting location does not exist.",
      "$.startingLocationId",
    );
  else if ((start.status ?? "active") !== "active")
    err(
      "starting_location_archived",
      "The starting location must be active.",
      "$.startingLocationId",
    );
}

for (const loc of locations) {
  if (loc.parentId === loc.id)
    err("self_parent", "A location cannot be its own parent.", at(loc));
  else if (
    loc.parentId !== null &&
    loc.parentId !== undefined &&
    !byId.has(loc.parentId)
  )
    err(
      "parent_missing",
      `The parent "${loc.parentId}" does not exist.`,
      at(loc),
    );

  const seenTargets = new Set();
  for (const link of loc.links ?? []) {
    if (!isRecord(link)) continue;
    if (link.targetId === loc.id)
      err("self_link", "A location cannot link to itself.", at(loc));
    else if (!byId.has(link.targetId))
      err(
        "link_target_missing",
        `Link target "${link.targetId}" does not exist.`,
        at(loc),
      );
    if (seenTargets.has(link.targetId))
      err(
        "duplicate_link_target",
        `Duplicate link to "${link.targetId}".`,
        at(loc),
      );
    seenTargets.add(link.targetId);
  }
}

for (const loc of locations) {
  const seen = new Set();
  let current = loc;
  let depth = 0;
  let cycle = false;
  while (current) {
    if (seen.has(current.id)) {
      cycle = true;
      break;
    }
    seen.add(current.id);
    depth += 1;
    if (current.parentId === null || current.parentId === undefined) break;
    current = byId.get(current.parentId);
  }
  if (cycle)
    err("parent_cycle", "Location parents must not form a cycle.", at(loc));
  else if (depth > LIMITS.maxDepth)
    err(
      "maximum_depth_exceeded",
      `Nesting cannot exceed ${LIMITS.maxDepth} levels.`,
      at(loc),
    );
}

const childrenByParent = new Map();
for (const loc of locations) {
  if (loc.parentId === null || loc.parentId === undefined) continue;
  const list = childrenByParent.get(loc.parentId) ?? [];
  list.push(loc);
  childrenByParent.set(loc.parentId, list);
}

for (const [parentId, children] of childrenByParent) {
  const parent = byId.get(parentId);
  if (!parent || (parent.childPresentation ?? "list") !== "layers") continue;
  const used = new Map();
  for (const child of children) {
    if (child.layerOrder === undefined) {
      err(
        "layer_order_missing",
        "Every child of a layer location needs a layerOrder.",
        at(child),
      );
      continue;
    }
    const owner = used.get(child.layerOrder);
    if (owner !== undefined)
      err(
        "duplicate_layer_order",
        `Layer order ${child.layerOrder} is already used by "${owner}".`,
        at(child),
      );
    else used.set(child.layerOrder, child.id);
  }
}

/* ----------------------------------------------------- authoring lints */

if (lint && errors.length === 0) {
  const active = locations.filter((l) => (l.status ?? "active") === "active");
  const depthOf = (loc) => {
    let depth = 1;
    let cur = loc;
    const seen = new Set();
    while (cur?.parentId != null && !seen.has(cur.parentId)) {
      seen.add(cur.parentId);
      cur = byId.get(cur.parentId);
      if (!cur) break;
      depth += 1;
    }
    return depth;
  };

  const roots = locations.filter(
    (l) => l.parentId === null || l.parentId === undefined,
  );
  if (roots.length > 1)
    warn(
      "multiple_roots",
      `${roots.length} root locations. A single root keeps breadcrumbs readable and travel connected; use one root unless the worlds are genuinely unlinked.`,
      "$.locations",
    );
  if (d.startingLocationId === null || d.startingLocationId === undefined)
    warn(
      "no_starting_location",
      "`startingLocationId` is null. Choose an active start before applying/enabling for play; this is separate from definition schema validity.",
      "$.startingLocationId",
    );

  const withLoreIds = active.filter(
    (l) => (l.lorebookEntryIds ?? []).length > 0,
  );
  if (withLoreIds.length && !isRecord(record?.portableLore))
    warn(
      "lore_ids_without_bundle",
      `${withLoreIds.length} location(s) carry lore IDs without a portable bundle. They resolve only where matching entries already exist. Bundle the intended entries for portability.`,
      "$.locations",
    );

  if (active.length > PROMPT_KNOWN_LOCATIONS)
    warn(
      "known_index_truncated",
      `${active.length} active locations; the first ${PROMPT_KNOWN_LOCATIONS} in definition order enter the known-name index. This is not a storage, destination, or server lookup limit, and does not adapt to proximity.`,
      "$.locations",
    );

  for (const loc of active) {
    const label = at(loc);
    const desc = (loc.description ?? "").trim();
    const mem = (loc.modelMemory ?? "").trim();

    if (!desc && !mem)
      warn(
        "empty_context",
        'No description and no modelMemory. The current-location public block uses its empty-description placeholder; other prompt/lore sources remain separate.',
        label,
      );
    else if (!desc && mem)
      warn(
        "description_empty",
        "Empty description with modelMemory set. The public block the model reads first will say no description is set.",
        label,
      );
    if (desc.length > 1200)
      warn(
        "description_heavy",
        `Description is ${desc.length} chars. It is re-sent in full on every turn spent here; 250–800 is the usual working range.`,
        label,
      );
    if (mem.length > 2500)
      warn(
        "model_memory_heavy",
        `modelMemory is ${mem.length} chars and is also re-sent every turn at this location.`,
        label,
      );
    if ((loc.awarenessSummary ?? "").trim() && !desc)
      warn(
        "awareness_only",
        "awarenessSummary does not enter the audited owner spatial prompt. Do not use it instead of description.",
        label,
      );

    if (loc.icon !== undefined) {
      const icon = loc.icon.trim();
      const looksLikeWord = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/i.test(icon);
      if (looksLikeWord)
        warn(
          "icon_not_emoji",
          `icon "${icon}" looks like a Lucide/shortcode name. World Maps renders literal text; consider a compact emoji or symbol.`,
          label,
        );
      else if (icon.length > 16)
        warn(
          "icon_length",
          `icon exceeds the editor's 16-character limit (${icon.length}); the schema accepts it but the inspector will flag it.`,
          label,
        );
      else if (
        [
          ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
            icon,
          ),
        ].length > 1
      )
        warn(
          "icon_long",
          "Consider one compact emoji or symbol; this is an authoring preference, not a schema rule.",
          label,
        );
    }

    const hasReference =
      typeof loc.referenceImageId === "string" &&
      loc.referenceImageId.trim() !== "";
    if (hasReference && !loc.referenceImageId.startsWith("global-gallery:"))
      warn(
        "chat_scoped_artwork",
        "Bare referenceImageId is chat-scoped. Template normalization retains global IDs only; promotion or bundled restoration can remap it. A different chat's bare Gallery ID cannot resolve directly.",
        label,
      );
    if (hasReference && loc.useReferenceImage !== true)
      warn(
        "reference_image_without_toggle",
        "referenceImageId is assigned but useReferenceImage is not true. The eligible generation path will not attach it; editor display still requires a resolvable image.",
        label,
      );
    if (loc.useReferenceImage === true && !hasReference)
      warn(
        "reference_toggle_without_image",
        "`useReferenceImage` is true with no referenceImageId. The toggle does nothing.",
        label,
      );
    const hasBackground =
      typeof loc.mapBackgroundImageId === "string" &&
      loc.mapBackgroundImageId.trim() !== "";
    if (hasBackground && (loc.childPresentation ?? "list") !== "map")
      warn(
        "background_on_non_map",
        "mapBackgroundImageId is set but childPresentation is not `map`. A child-map background is only ever displayed under `map` children.",
        label,
      );
    if (
      hasBackground &&
      !loc.mapBackgroundImageId.startsWith("global-gallery:")
    )
      warn(
        "chat_scoped_background",
        "Bare mapBackgroundImageId needs promotion or bundled restoration for portability; template normalization retains global IDs only.",
        label,
      );
    if (loc.mapBackgroundPosition !== undefined && !hasBackground)
      warn(
        "background_position_without_image",
        "mapBackgroundPosition is set with no mapBackgroundImageId.",
        label,
      );

    const depth = depthOf(loc);
    if (depth > 7)
      warn(
        "deep_nesting",
        `Depth ${depth}. Review breadcrumbs and route length; travel_now may traverse a validated route in one committed turn.`,
        label,
      );
  }

  for (const [parentId, children] of childrenByParent) {
    const parent = byId.get(parentId);
    if (!parent) continue;
    const presentation = parent.childPresentation ?? "list";
    const activeChildren = children.filter(
      (c) => (c.status ?? "active") === "active",
    );

    if (presentation === "map") {
      const missing = activeChildren.filter((c) => !isRecord(c.placement));
      if (missing.length)
        warn(
          "placement_missing",
          `${missing.length} of ${activeChildren.length} children have no placement. Map presentation draws children on a canvas; unplaced children stack.`,
          at(parent),
        );
      const placed = activeChildren.filter((c) => isRecord(c.placement));
      for (let i = 0; i < placed.length; i += 1) {
        for (let j = i + 1; j < placed.length; j += 1) {
          const a = placed[i].placement,
            b = placed[j].placement;
          if (Math.hypot(a.x - b.x, a.y - b.y) < 4)
            warn(
              "placement_collision",
              `"${placed[i].id}" and "${placed[j].id}" sit within 4 units of each other; inspect for marker/label overlap at the target display size.`,
              at(parent),
            );
        }
      }
    }
    if (presentation === "layers") {
      const orders = activeChildren
        .map((c) => c.layerOrder)
        .filter((n) => Number.isInteger(n))
        .sort((a, b) => a - b);
      if (
        orders.length > 1 &&
        orders[orders.length - 1] - orders[0] !== orders.length - 1
      )
        warn(
          "layer_gaps",
          `Layer orders ${orders.join(", ")} are not contiguous. Gaps are legal but read as missing decks/floors.`,
          at(parent),
        );
    }
    if (
      activeChildren.length === 1 &&
      (byId.get(activeChildren[0].id)?.links ?? []).length === 0 &&
      depthOf(parent) > 1
    )
      warn(
        "single_child_chain",
        `"${parent.id}" has one child. Keep it if it has a distinct scene, artwork or organizational purpose; otherwise consider merging.`,
        at(parent),
      );

    // Sibling travel graph. Connectivity counts anywhere in a sibling's subtree:
    // a foyer linking to the floor above connects those two floors just as well
    // as a link between the floors themselves, and reads better in play.
    if (activeChildren.length >= 2) {
      const subtreeOf = (rootId) => {
        const members = new Set([rootId]);
        const stack = [rootId];
        while (stack.length) {
          for (const child of childrenByParent.get(stack.pop()) ?? []) {
            if (
              (child.status ?? "active") !== "active" ||
              members.has(child.id)
            )
              continue;
            members.add(child.id);
            stack.push(child.id);
          }
        }
        return members;
      };
      const branchOf = new Map();
      for (const child of activeChildren)
        for (const id of subtreeOf(child.id)) branchOf.set(id, child.id);
      const linkedAcross = [...branchOf.keys()].some((sourceId) =>
        (byId.get(sourceId)?.links ?? []).some(
          (l) =>
            isRecord(l) &&
            (l.state ?? "available") === "available" &&
            branchOf.has(l.targetId) &&
            branchOf.get(l.targetId) !== branchOf.get(sourceId),
        ),
      );
      if (!linkedAcross)
        warn(
          "siblings_unlinked",
          `No available cross-links among the ${activeChildren.length} branches under "${parent.id}". Containment still connects active parents and children. Add physical routes if useful; graph hops are not universally user turns.`,
          at(parent),
        );
    }
  }

  // reachability from the starting location, using the same edges the app walks
  const start = byId.get(d.startingLocationId);
  if (start && (start.status ?? "active") === "active") {
    const adjacency = new Map();
    const addEdge = (from, to) => {
      if (!from || !to) return;
      if ((byId.get(from)?.status ?? "active") !== "active") return;
      if ((byId.get(to)?.status ?? "active") !== "active") return;
      const set = adjacency.get(from) ?? new Set();
      set.add(to);
      adjacency.set(from, set);
    };
    for (const loc of active) {
      if (loc.parentId != null) {
        addEdge(loc.id, loc.parentId);
        addEdge(loc.parentId, loc.id);
      }
      for (const link of loc.links ?? []) {
        if (!isRecord(link) || (link.state ?? "available") !== "available")
          continue;
        addEdge(loc.id, link.targetId);
        if (link.bidirectional) addEdge(link.targetId, loc.id);
      }
    }
    const seen = new Set([start.id]);
    const queue = [start.id];
    while (queue.length) {
      for (const next of adjacency.get(queue.shift()) ?? [])
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
    }
    const stranded = active.filter((l) => !seen.has(l.id));
    if (stranded.length)
      warn(
        "unreachable_locations",
        `${stranded.length} active location(s) cannot be reached from the starting location by parent/child steps or available links: ${stranded
          .slice(0, 8)
          .map((l) => l.id)
          .join(
            ", ",
          )}${stranded.length > 8 ? " …" : ""}. Route planning will refuse them.`,
        "$.locations",
      );
  }

  // A hidden link only hides anything if the destination is not already reachable
  // some other way. Parent/child steps are ALWAYS traversable, so a "secret" place
  // hanging off a public parent is open to anyone standing there.
  {
    const start = byId.get(d.startingLocationId);
    if (start && (start.status ?? "active") === "active") {
      const open = new Map();
      const addOpen = (from, to) => {
        if ((byId.get(from)?.status ?? "active") !== "active") return;
        if ((byId.get(to)?.status ?? "active") !== "active") return;
        const set = open.get(from) ?? new Set();
        set.add(to);
        open.set(from, set);
      };
      for (const loc of active) {
        if (loc.parentId != null) {
          addOpen(loc.id, loc.parentId);
          addOpen(loc.parentId, loc.id);
        }
        for (const link of loc.links ?? []) {
          if (!isRecord(link) || (link.state ?? "available") !== "available")
            continue;
          addOpen(loc.id, link.targetId);
          if (link.bidirectional) addOpen(link.targetId, loc.id);
        }
      }
      const openly = new Set([start.id]);
      const queue = [start.id];
      while (queue.length) {
        for (const next of open.get(queue.shift()) ?? [])
          if (!openly.has(next)) {
            openly.add(next);
            queue.push(next);
          }
      }
      const hiddenTargets = new Set(
        active.flatMap((l) =>
          (l.links ?? [])
            .filter(
              (k) =>
                isRecord(k) && (k.state === "hidden" || k.state === "blocked"),
            )
            .map((k) => k.targetId),
        ),
      );
      const leaked = [...hiddenTargets].filter((id) => openly.has(id));
      if (leaked.length)
        warn(
          "secret_reachable_anyway",
          `${leaked.length} hidden/blocked-link targets have another active route from the start: ${leaked.join(", ")}. The link state restricts that edge, not the destination. Reparenting under a reachable gate room alone does not lock its children. Review whether the alternate route is intentional.`,
          "$.locations",
        );
    }
  }

  for (const loc of active) {
    const secret = (loc.links ?? []).filter(
      (l) => isRecord(l) && (l.state === "hidden" || l.state === "blocked"),
    );
    for (const link of secret) {
      const target = byId.get(link.targetId);
      if (
        target &&
        (target.status ?? "active") === "active" &&
        (target.links ?? []).some(
          (reverse) =>
            reverse.targetId === loc.id &&
            reverse.bidirectional &&
            (reverse.state ?? "available") === "available",
        )
      )
        warn(
          "reverse_link_bypass",
          `${loc.id} → ${link.targetId} is ${link.state}, but an available bidirectional reverse edge makes that destination one hop away. Decide whether the asymmetry is intentional.`,
          at(loc),
        );
    }
    if (secret.length && !(loc.modelMemory ?? "").trim())
      warn(
        "secret_without_direction",
        `${secret.length} hidden/blocked links and no local modelMemory. Decide how the near-side clue is conveyed; prose does not automatically change stored link state.`,
        at(loc),
      );
  }

  const destinationCount = (loc) => {
    const ids = new Set();
    const add = (id) => {
      if (byId.get(id) && (byId.get(id).status ?? "active") === "active")
        ids.add(id);
    };
    add(loc.parentId);
    for (const child of childrenByParent.get(loc.id) ?? []) add(child.id);
    for (const l of loc.links ?? [])
      if ((l.state ?? "available") === "available") add(l.targetId);
    for (const src of active)
      for (const l of src.links ?? [])
        if (
          l.bidirectional &&
          (l.state ?? "available") === "available" &&
          l.targetId === loc.id
        )
          add(src.id);
    return ids.size;
  };
  for (const loc of active) {
    const n = destinationCount(loc);
    if (n > LIMITS.maxPromptDestinations)
      warn(
        "destinations_truncated",
        `${n} one-move destinations; only ${LIMITS.maxPromptDestinations} reach the prompt.`,
        at(loc),
      );
    else if (n > 12)
      warn(
        "destination_sprawl",
        `${n} one-move destinations. Long destination lists dilute the model's choice-making and eat prompt space.`,
        at(loc),
      );
  }

  // ---- offline pack integrity: artwork bundle vs references ----
  const referencedImageIds = new Set(
    locations
      .flatMap((l) => [l.referenceImageId, l.mapBackgroundImageId])
      .filter((v) => typeof v === "string" && v.trim()),
  );
  if (Array.isArray(record?.artwork)) {
    const bundled = new Set(
      record.artwork
        .filter(isRecord)
        .map((a) => a.sourceImageId)
        .filter(Boolean),
    );
    const missing = [...referencedImageIds].filter((id) => !bundled.has(id));
    const unused = [...bundled].filter((id) => !referencedImageIds.has(id));
    if (missing.length)
      warn(
        "artwork_reference_unbundled",
        `${missing.length} image reference(s) have no bundled artwork: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? " …" : ""}. They will dangle for anyone who does not already have those images.`,
        "$.artwork",
      );
    if (unused.length)
      warn(
        "artwork_bundle_unused",
        `${unused.length} bundled image(s) are referenced by no location: ${unused.slice(0, 5).join(", ")}${unused.length > 5 ? " …" : ""}.`,
        "$.artwork",
      );
  } else if (
    referencedImageIds.size > 0 &&
    record?.format === "marinara-hierarchical-map"
  ) {
    warn(
      "artwork_not_bundled",
      `${referencedImageIds.size} image reference(s) with no \`artwork\` bundle. Fine for your own install; the references dangle for anyone else.`,
      "$.artwork",
    );
  }

  // ---- offline pack integrity: portable lore wiring ----
  const bundle = record?.portableLore;
  if (isRecord(bundle)) {
    const refs = Array.isArray(bundle.references)
      ? bundle.references.filter(isRecord)
      : [];
    const books = Array.isArray(bundle.books)
      ? bundle.books.filter(isRecord)
      : [];
    const entryKeys = new Set(
      books.flatMap((b) =>
        Array.isArray(b.entries)
          ? b.entries.filter(isRecord).map((e) => e.key)
          : [],
      ),
    );
    if (bundle.mode !== "map-only" && books.length === 0)
      warn(
        "portable_lore_no_books",
        `mode is "${bundle.mode}" but books is empty, so no lore travels with this map. Use "map-only" or include the books.`,
        "$.portableLore.mode",
      );
    for (const [i, ref] of refs.entries()) {
      if (!byId.has(ref.locationId))
        warn(
          "lore_reference_unknown_location",
          `references[${i}] names location "${ref.locationId}", which is not in this map.`,
          "$.portableLore.references",
        );
      if (ref.entryKey && !entryKeys.has(ref.entryKey))
        warn(
          "lore_reference_dead_entry_key",
          `references[${i}] entryKey "${ref.entryKey}" names no bundled entry; that location's lore ID will not be remapped.`,
          "$.portableLore.references",
        );
    }
    const refByLocation = new Map();
    for (const ref of refs) {
      const list = refByLocation.get(ref.locationId) ?? [];
      list.push(ref);
      refByLocation.set(ref.locationId, list);
    }
    for (const loc of locations) {
      for (const entryId of loc.lorebookEntryIds ?? []) {
        const matched = (refByLocation.get(loc.id) ?? []).some(
          (r) => r.originalEntryId === entryId,
        );
        if (!matched)
          warn(
            "lore_id_unremappable",
            `lorebookEntryId "${entryId}" has no portable reference at this location; it remains an external dependency on an existing matching entry ID.`,
            at(loc),
          );
      }
    }
  }

  const maxDepthSeen = Math.max(0, ...active.map(depthOf));
  if (maxDepthSeen > PROMPT_BREADCRUMB_NODES)
    warn(
      "breadcrumb_truncated",
      `Deepest branch is ${maxDepthSeen} levels; the prompt breadcrumb keeps only the last ${PROMPT_BREADCRUMB_NODES}.`,
      "$.locations",
    );
}

report();

/* ------------------------------------------------------------------ output */

function report() {
  if (asJson) {
    console.log(
      JSON.stringify(
        {
          file,
          ok: errors.length === 0,
          evidence: "Structural preflight only; source-pinned checked subset.",
          unchecked: [
            "hierarchy profile normalization",
            "destination lore API payloads and existing IDs",
            "full image decoding",
            "app import/save and live state",
          ],
          errors,
          warnings: lint ? warnings : [],
        },
        null,
        2,
      ),
    );
    process.exit(errors.length ? 1 : 0);
  }
  const count = Array.isArray(definition?.locations)
    ? definition.locations.length
    : 0;
  if (errors.length) {
    console.log(`✗ ${file} — ${errors.length} structural preflight error(s).`);
    for (const e of errors)
      console.log(`  ✗ [${e.code}] ${e.where}: ${e.message}`);
  } else if (!quiet) {
    console.log(
      `✓ ${file} — structural preflight passed (${count} locations); not runtime-imported.`,
    );
  }
  if (lint && warnings.length && !quiet) {
    console.log(`\n  ${warnings.length} authoring warning(s):`);
    for (const w of warnings)
      console.log(`  ⚠ [${w.code}] ${w.where}: ${w.message}`);
  }
  process.exit(errors.length ? 1 : 0);
}
