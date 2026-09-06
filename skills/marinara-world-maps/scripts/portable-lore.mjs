// Source-derived preflight and serialization subset. Pin and evidence: references/source-truth.md.
// Parser checks deliberately do not claim to validate destination lore API payloads.
export const isRecord = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const BOOK_KEYS = [
  "description",
  "category",
  "scanDepth",
  "tokenBudget",
  "entryLimit",
  "recursiveScanning",
  "maxRecursionDepth",
  "excludeFromVectorization",
  "vectorQueryDepth",
  "vectorScoreThreshold",
  "vectorMaxResults",
  "enabled",
  "tags",
  "generatedBy",
  "sourceAgentId",
];
export const ENTRY_KEYS = [
  "content",
  "description",
  "keys",
  "secondaryKeys",
  "enabled",
  "constant",
  "selective",
  "selectiveLogic",
  "probability",
  "scanDepth",
  "matchWholeWords",
  "caseSensitive",
  "useRegex",
  "characterFilterMode",
  "characterFilterIds",
  "characterTagFilterMode",
  "characterTagFilters",
  "generationTriggerFilterMode",
  "generationTriggerFilters",
  "additionalMatchingSources",
  "position",
  "outletName",
  "depth",
  "order",
  "role",
  "sticky",
  "cooldown",
  "delay",
  "ephemeral",
  "group",
  "groupWeight",
  "preventRecursion",
  "excludeRecursion",
  "delayUntilRecursion",
  "locked",
  "tag",
  "relationships",
  "dynamicState",
  "activationConditions",
  "schedule",
  "excludeFromVectorization",
];
export const pick = (v, keys) =>
  Object.fromEntries(
    keys.filter((k) => v[k] !== undefined).map((k) => [k, v[k]]),
  );
const stable = (v) =>
  Array.isArray(v)
    ? v.map(stable)
    : isRecord(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, stable(v[k])]),
        )
      : v;
export function fingerprint(data) {
  const value = JSON.stringify(stable(data));
  let left = 2166136261,
    right = 2246822519;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    left = Math.imul(left ^ c, 16777619);
    right = Math.imul(right ^ c, 3266489917);
  }
  return (
    "entry-v1:" +
    (left >>> 0).toString(16).padStart(8, "0") +
    (right >>> 0).toString(16).padStart(8, "0")
  );
}
const strings = (v, keys) => keys.every((k) => typeof v[k] === "string");
const nullableString = (v) => v === null || typeof v === "string";
export function portableLoreIsValid(value) {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !["map-only", "linked-entries", "complete-lorebooks"].includes(value.mode)
  )
    return false;
  if (
    !Array.isArray(value.books) ||
    !Array.isArray(value.references) ||
    value.books.length > 100 ||
    value.references.length > 10000 ||
    (value.mode === "map-only" && value.books.length)
  )
    return false;
  const bookKeys = new Set(),
    bookIds = new Set(),
    entryKeys = new Set(),
    entryIds = new Set();
  for (const b of value.books) {
    if (
      !isRecord(b) ||
      !strings(b, ["key", "originalId", "name"]) ||
      !b.key ||
      !b.originalId ||
      !b.name.trim() ||
      !isRecord(b.settings) ||
      !Array.isArray(b.folders) ||
      !Array.isArray(b.entries)
    )
      return false;
    if (
      bookKeys.has(b.key) ||
      bookIds.has(b.originalId) ||
      b.entries.length > 20000 ||
      b.folders.length > 5000
    )
      return false;
    bookKeys.add(b.key);
    bookIds.add(b.originalId);
    const folders = new Set();
    for (const f of b.folders) {
      if (
        !isRecord(f) ||
        !strings(f, ["key", "originalId"]) ||
        !nullableString(f.parentKey) ||
        !isRecord(f.data) ||
        !strings(f.data, ["name"]) ||
        typeof f.data.enabled !== "boolean" ||
        typeof f.data.order !== "number" ||
        !f.key ||
        folders.has(f.key)
      )
        return false;
      folders.add(f.key);
    }
    if (b.folders.some((f) => f.parentKey && !folders.has(f.parentKey)))
      return false;
    for (const e of b.entries) {
      if (
        !isRecord(e) ||
        !strings(e, ["key", "originalId", "name", "fingerprint"]) ||
        !nullableString(e.folderKey) ||
        !isRecord(e.data) ||
        entryKeys.has(e.key) ||
        entryIds.has(e.originalId) ||
        (e.folderKey !== null && !folders.has(e.folderKey))
      )
        return false;
      entryKeys.add(e.key);
      entryIds.add(e.originalId);
    }
  }
  return value.references.every(
    (r) =>
      isRecord(r) &&
      strings(r, [
        "locationId",
        "locationName",
        "originalEntryId",
        "originalEntryName",
        "originalLorebookName",
      ]) &&
      nullableString(r.originalLorebookId) &&
      nullableString(r.entryKey) &&
      (r.entryKey === null || entryKeys.has(r.entryKey)),
  );
}
