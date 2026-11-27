// Gallery Reference Pool: pure logic, shared by the extension and its tests.
// build.mjs strips the `export` keywords when it inlines this file into extension.js.

export const AGENT_TYPE = "gallery-illustrator";
export const POOL_START = "<!-- reference-pool:start -->";
export const POOL_END = "<!-- reference-pool:end -->";
export const ROLES = ["face", "expression", "body", "outfit", "location", "prop", "style"];
export const PERSON_ROLES = new Set(["face", "expression", "body", "outfit"]);
export const MAX_CAPTION = 80;
export const MAX_OWNER = 60;
export const MAX_POOL_LINES = 120;
export const EMPTY_POOL_TEXT =
  "(The pool is empty. Open the Gallery Reference Pool extension, tag some pictures and press Sync.)";

const POOL_ID = /^(cg|pg|gg|ch):[A-Za-z0-9_-]{1,64}$/;

/** One line of text, no pipes or control characters (the pool line format is `a | b | c | d`). */
export function cleanText(value, max) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f|]+/g, " ")
    .replace(/<!--|-->/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** The prefixed pool id the agent copies: cg (character), pg (persona), gg (Global Gallery), ch (chat). */
export function poolId(kind, imageId) {
  const id = `${kind}:${imageId}`;
  return POOL_ID.test(id) ? id : null;
}

/** A stored tag, or null when it should be removed (no role). */
export function normalizeTag(id, tag) {
  if (!POOL_ID.test(id) || !tag || typeof tag !== "object") return null;
  const role = ROLES.includes(tag.role) ? tag.role : null;
  if (!role) return null;
  return {
    role,
    owner: cleanText(tag.owner, MAX_OWNER),
    caption: cleanText(tag.caption, MAX_CAPTION),
    url: typeof tag.url === "string" && tag.url.startsWith("/api/") ? tag.url : "",
    enabled: tag.enabled !== false,
  };
}

/** Normalize the whole stored tag map, dropping anything malformed. */
export function normalizeTags(raw) {
  const tags = {};
  if (!raw || typeof raw !== "object") return tags;
  for (const [id, tag] of Object.entries(raw)) {
    const normalized = normalizeTag(id, tag);
    if (normalized) tags[id] = normalized;
  }
  return tags;
}

const ROLE_ORDER = new Map(ROLES.map((role, index) => [role, index]));

/** Pool lines for the agent prompt, grouped by owner, faces first. Disabled tags are left out. */
export function buildPoolLines(tags) {
  return Object.entries(tags)
    .filter(([, tag]) => tag.enabled)
    .sort(
      ([idA, a], [idB, b]) =>
        (a.owner || "~").localeCompare(b.owner || "~") ||
        ROLE_ORDER.get(a.role) - ROLE_ORDER.get(b.role) ||
        idA.localeCompare(idB),
    )
    .slice(0, MAX_POOL_LINES)
    .map(([id, tag]) => `${id} | ${tag.owner || "-"} | ${tag.role} | ${tag.caption || "-"}`);
}

/** The text between the markers. */
export function poolBlockBody(lines) {
  return lines.length ? lines.join("\n") : EMPTY_POOL_TEXT;
}

/**
 * Replace only what sits between the pool markers, keeping everything else the user wrote.
 * Returns null when the prompt has no marker pair (or a broken one), so nothing is changed.
 */
export function replacePoolBlock(prompt, lines) {
  if (typeof prompt !== "string") return null;
  const start = prompt.indexOf(POOL_START);
  const end = prompt.indexOf(POOL_END);
  if (start < 0 || end < 0 || end < start) return null;
  if (prompt.indexOf(POOL_START, start + 1) >= 0 || prompt.indexOf(POOL_END, end + 1) >= 0) return null;
  return `${prompt.slice(0, start + POOL_START.length)}\n${poolBlockBody(lines)}\n${prompt.slice(end)}`;
}

/**
 * Apply the pool to an agent config: its default prompt and every named prompt option.
 * Returns { promptTemplate, settings, updated, skipped } or null when nothing has markers.
 */
export function applyPoolToAgent(agent, lines) {
  const settings = parseSettings(agent?.settings);
  let updated = 0;
  let skipped = 0;
  const promptTemplate = replacePoolBlock(agent?.promptTemplate, lines);
  if (promptTemplate === null) skipped++;
  else updated++;
  const options = Array.isArray(settings.promptTemplates) ? settings.promptTemplates : [];
  const promptTemplates = options.map((option) => {
    const next = replacePoolBlock(option?.promptTemplate, lines);
    if (next === null) {
      skipped++;
      return option;
    }
    updated++;
    return { ...option, promptTemplate: next };
  });
  if (updated === 0) return null;
  return {
    promptTemplate: promptTemplate ?? agent.promptTemplate,
    settings: options.length ? { ...settings, promptTemplates } : settings,
    updated,
    skipped,
  };
}

export function parseSettings(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Problems worth showing: a person with pictures but no face, too many lines, an empty pool. */
export function poolWarnings(tags) {
  const warnings = [];
  const enabled = Object.entries(tags).filter(([, tag]) => tag.enabled);
  if (enabled.length === 0) warnings.push("The pool is empty: tag at least one face picture.");
  const owners = new Map();
  for (const [, tag] of enabled) {
    if (!PERSON_ROLES.has(tag.role)) continue;
    const key = tag.owner || "-";
    const entry = owners.get(key) ?? { face: false, any: false };
    entry.any = true;
    if (tag.role === "face") entry.face = true;
    owners.set(key, entry);
  }
  for (const [owner, entry] of owners) {
    if (entry.any && !entry.face) warnings.push(`${owner === "-" ? "Unnamed person" : owner} has no face picture.`);
  }
  if (enabled.length > MAX_POOL_LINES) {
    warnings.push(`Only the first ${MAX_POOL_LINES} tagged pictures go to the agent; untick some.`);
  }
  return warnings;
}

/** A character's display name from a library row (`data` may be a JSON string). */
export function characterName(row) {
  const data = parseSettings(row?.data);
  const name = typeof data.name === "string" ? data.name : typeof row?.name === "string" ? row.name : "";
  return cleanText(name, MAX_OWNER) || "Unnamed";
}

/** Items from either a bare array or a `{ items }` page. */
export function pageItems(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.items)) return value.items;
  return [];
}

// The Engine gives every imported Agent a fresh type: `custom-import-gallery-illustrator-<uuid>`.
const IMPORTED_TYPE = new RegExp(`^custom-import-${AGENT_TYPE}-`);

/** Is this agent config a Gallery Illustrator (as authored, or as the Engine renamed it on import)? */
export function isGalleryIllustrator(agent) {
  return typeof agent?.type === "string" && (agent.type === AGENT_TYPE || IMPORTED_TYPE.test(agent.type));
}

/** Every Gallery Illustrator among the agent configs (importing twice makes two). */
export function findAgents(agents) {
  return pageItems(agents).filter(isGalleryIllustrator);
}

/** The first Gallery Illustrator, or null. */
export function findAgent(agents) {
  return findAgents(agents)[0] ?? null;
}
