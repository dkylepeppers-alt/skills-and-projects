// Gallery Reference Pool — built from src/extension by build.mjs. Edit the sources, not this file.
// Gallery Reference Pool: pure logic, shared by the extension and its tests.
// build.mjs strips the `export` keywords when it inlines this file into extension.js.

const AGENT_TYPE = "gallery-illustrator";
const POOL_START = "<!-- reference-pool:start -->";
const POOL_END = "<!-- reference-pool:end -->";
const ROLES = ["face", "expression", "body", "outfit", "location", "prop", "style"];
const PERSON_ROLES = new Set(["face", "expression", "body", "outfit"]);
const MAX_CAPTION = 80;
const MAX_OWNER = 60;
const EMPTY_POOL_TEXT =
  "(The pool is empty. Open the Gallery Reference Pool extension, tag some pictures and press Sync.)";

const POOL_ID = /^(cg|pg|gg|ch|ca|pa):[A-Za-z0-9_-]{1,64}$/;
const SOURCE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** One line of text, no pipes or control characters (the pool line format is `a | b | c | d`). */
function cleanText(value, max) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f|]+/g, " ")
    .replace(/<!--|-->/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * The prefixed pool id the agent copies: cg (character gallery), pg (persona gallery), gg (Global Gallery), ch (chat),
 * ca (a character's avatar, by character id), pa (a persona's avatar, by persona id).
 */
function poolId(kind, imageId) {
  const id = `${kind}:${imageId}`;
  return POOL_ID.test(id) ? id : null;
}

/** A stored tag, or null when it should be removed (no role). */
function normalizeTag(id, tag) {
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
function normalizeTags(raw) {
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
function buildPoolLines(tags) {
  return Object.entries(tags)
    .filter(([, tag]) => tag.enabled)
    .sort(
      ([idA, a], [idB, b]) =>
        (a.owner || "~").localeCompare(b.owner || "~") ||
        ROLE_ORDER.get(a.role) - ROLE_ORDER.get(b.role) ||
        idA.localeCompare(idB),
    )
    .map(([id, tag]) => {
      // An avatar's id is its owner's id. v1 gallery tags retain their URL: recover the owning card/persona/chat.
      const avatarOwner = /^(ca|pa):/.test(id) ? id.slice(3) : null;
      const pattern = id.startsWith("cg:") ? /^\/api\/characters\/([^/]+)\/gallery\// :
        id.startsWith("pg:") ? /^\/api\/characters\/personas\/([^/]+)\/gallery\// :
        id.startsWith("ch:") ? /^\/api\/gallery\/file\/([^/]+)\// : null;
      // The source lands in the agent prompt: only an id-shaped value (no markers, pipes or line breaks) is kept.
      const candidate = avatarOwner ?? pattern?.exec(tag.url)?.[1];
      const source = candidate && SOURCE_ID.test(candidate) ? candidate : null;
      const row = `${id} | ${tag.owner || "-"} | ${tag.role} | ${tag.caption || "-"}`;
      return source ? `${row} | ${source}` : row;
    });
}

/** The text between the markers. */
function poolBlockBody(lines) {
  return lines.length ? lines.join("\n") : EMPTY_POOL_TEXT;
}

/**
 * Replace only what sits between the pool markers, keeping everything else the user wrote.
 * Returns null when the prompt has no marker pair (or a broken one), so nothing is changed.
 */
function replacePoolBlock(prompt, lines) {
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
function applyPoolToAgent(agent, lines) {
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

function parseSettings(value) {
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
function poolWarnings(tags) {
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
  return warnings;
}

/** A character's display name from a library row (`data` may be a JSON string). */
function characterName(row) {
  const data = parseSettings(row?.data);
  const name = typeof data.name === "string" ? data.name : typeof row?.name === "string" ? row.name : "";
  return cleanText(name, MAX_OWNER) || "Unnamed";
}

/** Items from either a bare array or a `{ items }` page. */
function pageItems(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.items)) return value.items;
  return [];
}

// The Engine renames an imported Agent's type to `custom-import-<type>-<uuid>`, and an import through the UI does it
// twice (the client, then the server route): `custom-import-custom-import-gallery-illustrator-<uuid>-<uuid>`. Each
// export and re-import adds another prefix, so allow any number of them.
const IMPORTED_TYPE = new RegExp(`^(?:custom-import-)*${AGENT_TYPE}(?:-|$)`);

/** Is this agent config a Gallery Illustrator (as authored, or as the Engine renamed it on import)? */
function isGalleryIllustrator(agent) {
  return typeof agent?.type === "string" && IMPORTED_TYPE.test(agent.type);
}

/** Every Gallery Illustrator among the agent configs (importing twice makes two). */
function findAgents(agents) {
  return pageItems(agents).filter(isGalleryIllustrator);
}

/** The first Gallery Illustrator, or null. */
function findAgent(agents) {
  return findAgents(agents)[0] ?? null;
}

// Gallery Reference Pool: the page panel. Runs as the body of the Engine's full-page extension
// wrapper, `async (marinara) => { ... }`; pool-core.js is inlined above this file by build.mjs.

const CSRF = { "x-marinara-csrf": "1" };
const ROOT_CLASS = "grp-root";
const STATE = { tags: {}, syncTimer: null, view: "tagged", search: "", loaded: false, loading: false, disposed: false };

const api = async (path, init = {}) => {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = { ...(method === "GET" ? {} : CSRF), ...(init.body ? { "Content-Type": "application/json" } : {}) };
  const response = await marinara.fetch(path, { ...init, method, headers: { ...headers, ...(init.headers ?? {}) } });
  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.json())?.error ?? "";
    } catch {
      // not JSON
    }
    throw new Error(`${method} ${path} failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  return response.status === 204 ? null : response.json();
};

const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (value !== undefined && value !== null && value !== false) node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat()) if (child) node.append(child);
  return node;
};

// ── storage ──
let pendingSave = Promise.resolve();
let savedTags = null;

const saveTags = async () => {
  const snapshot = STATE.tags;
  if (snapshot === savedTags) return;
  pendingSave = pendingSave.catch(() => {}).then(() => marinara.storage.patch({ version: 1, tags: snapshot }));
  await pendingSave;
  savedTags = snapshot;
};

// ── sync to the agent prompt ──
const setStatus = (text, kind = "") => {
  const status = root.querySelector(".grp-status");
  if (status) {
    status.textContent = text;
    status.dataset.kind = kind;
  }
};

const syncSavedTags = async () => {
  try {
    setStatus("Syncing…");
    const agents = findAgents(await api("/api/agents"));
    if (agents.length === 0) {
      setStatus("Import the Gallery Illustrator agent first, then press Sync.", "error");
      return;
    }
    const lines = buildPoolLines(savedTags);
    let prompts = 0;
    let skipped = 0;
    let unmarked = 0;
    for (const agent of agents) {
      const next = applyPoolToAgent(agent, lines);
      if (!next) {
        unmarked++;
        continue;
      }
      await api(`/api/agents/${encodeURIComponent(agent.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ promptTemplate: next.promptTemplate, settings: next.settings }),
      });
      prompts += next.updated;
      skipped += next.skipped;
    }
    if (prompts === 0) {
      setStatus("The agent's prompts have no reference-pool markers. Re-import the agent or restore the markers.", "error");
      return;
    }
    const synced = agents.length - unmarked;
    setStatus(
      `Synced ${lines.length} picture${lines.length === 1 ? "" : "s"} to ${prompts} prompt${prompts === 1 ? "" : "s"}` +
        (synced > 1 ? ` in ${synced} Gallery Illustrator agents` : "") +
        (skipped ? ` (${skipped} without markers left alone)` : "") +
        (unmarked ? `; ${unmarked} agent${unmarked === 1 ? " has" : "s have"} no markers` : "") +
        ".",
      "ok",
    );
  } catch (error) {
    marinara.log.error(error);
    setStatus(error instanceof Error ? error.message : String(error), "error");
  }
};

let pendingSync = Promise.resolve();
const syncNow = () => {
  marinara.clearTimeout(STATE.syncTimer);
  STATE.syncTimer = null;
  pendingSync = pendingSync.then(syncSavedTags);
  return pendingSync;
};

const scheduleSync = () => {
  marinara.clearTimeout(STATE.syncTimer);
  STATE.syncTimer = marinara.setTimeout(() => void syncNow(), 1500);
};

const updateTag = async (id, patch) => {
  const merged = normalizeTag(id, { ...(STATE.tags[id] ?? {}), ...patch });
  STATE.tags = { ...STATE.tags };
  if (merged) STATE.tags[id] = merged;
  else delete STATE.tags[id];
  renderWarnings();
  try {
    await saveTags();
    scheduleSync();
  } catch (error) {
    setStatus(`Could not save tags: ${error.message}. Press Sync to retry.`, "error");
  }
};

// ── sources ──
const sources = { characters: [], personas: [], chats: [] };

const loadSources = async () => {
  const [characters, personas, chats] = await Promise.all([
    api(`/api/characters?limit=100&search=${encodeURIComponent(STATE.search)}`).catch(() => []),
    api("/api/characters/personas/list?limit=100").catch(() => []),
    api("/api/chats?limit=30").catch(() => []),
  ]);
  const avatarOf = (row) => (typeof row.avatarPath === "string" && row.avatarPath.startsWith("/api/") ? row.avatarPath : "");
  sources.characters = pageItems(characters).map((row) => ({ id: row.id, name: characterName(row), avatar: avatarOf(row) }));
  sources.personas = pageItems(personas).map((row) => ({ id: row.id, name: characterName(row), avatar: avatarOf(row) }));
  sources.chats = pageItems(chats).map((row) => ({ id: row.id, name: cleanText(row.name, 60) || "Untitled chat" }));
};

/** Pictures for the selected view, each as { id, url, owner, ownerFixed }. */
const loadPictures = async (view) => {
  if (view === "tagged") {
    return Object.entries(STATE.tags).map(([id, tag]) => ({ id, url: tag.url, owner: tag.owner, ownerFixed: /^(cg|pg|ca|pa):/.test(id) }));
  }
  const [kind, ownerId] = view.split(":");
  const imageRows = (rows, prefix, owner, ownerFixed) =>
    pageItems(rows).flatMap((row) => {
      const id = poolId(prefix, String(row.id ?? ""));
      return id && typeof row.url === "string" ? [{ id, url: row.url, owner, ownerFixed }] : [];
    });
  // The avatar comes first, then the gallery. Its pool id is the owner's own id (ca:/pa:).
  const avatarTile = (prefix, source) => {
    const id = source?.avatar ? poolId(prefix, source.id) : null;
    return id ? [{ id, url: source.avatar, owner: source.name, ownerFixed: true, avatar: true }] : [];
  };
  if (kind === "character") {
    const source = sources.characters.find((c) => c.id === ownerId);
    const gallery = imageRows(await api(`/api/characters/${encodeURIComponent(ownerId)}/gallery`), "cg", source?.name ?? "", true);
    return [...avatarTile("ca", source), ...gallery];
  }
  if (kind === "persona") {
    const source = sources.personas.find((p) => p.id === ownerId);
    const gallery = imageRows(await api(`/api/characters/personas/${encodeURIComponent(ownerId)}/gallery`), "pg", source?.name ?? "", true);
    return [...avatarTile("pa", source), ...gallery];
  }
  if (kind === "global") return imageRows(await api("/api/global-gallery"), "gg", "", false);
  if (kind === "chat") return imageRows(await api(`/api/gallery/${encodeURIComponent(ownerId)}`), "ch", "", false);
  return [];
};

// ── rendering ──
const root = el("div", { class: ROOT_CLASS, hidden: true, role: "dialog", "aria-label": "Gallery reference pool" });
const launcher = el("button", {
  class: "grp-launcher",
  type: "button",
  title: "Gallery reference pool",
  "aria-label": "Open the gallery reference pool",
  text: "Pool",
  onclick: () => void openPanel(),
});

const thumbUrl = (url) =>
  /^\/api\/(gallery|global-gallery|avatars)\//.test(url) ? `${url}${url.includes("?") ? "&" : "?"}w=320` : url;

const tile = (picture) => {
  const tag = STATE.tags[picture.id];
  const roleSelect = el(
    "select",
    {
      "aria-label": "Role",
      onchange: (event) =>
        void updateTag(picture.id, {
          role: event.target.value,
          owner: ownerInput.value || picture.owner,
          caption: captionInput.value,
          url: picture.url,
        }).then(() => card.classList.toggle("grp-tagged", Boolean(STATE.tags[picture.id]))),
    },
    el("option", { value: "", text: "Not in pool" }),
    ROLES.map((role) => el("option", { value: role, text: role, selected: tag?.role === role })),
  );
  const ownerInput = el("input", {
    type: "text",
    maxlength: MAX_OWNER,
    placeholder: picture.ownerFixed ? "" : "Who or what (for people: their name)",
    value: tag?.owner ?? picture.owner ?? "",
    readonly: picture.ownerFixed,
    "aria-label": "Owner",
    onchange: () => STATE.tags[picture.id] && void updateTag(picture.id, { owner: ownerInput.value }),
  });
  const captionInput = el("input", {
    type: "text",
    maxlength: MAX_CAPTION,
    placeholder: "Caption: outfit, angle, place…",
    value: tag?.caption ?? "",
    "aria-label": "Caption",
    onchange: () => STATE.tags[picture.id] && void updateTag(picture.id, { caption: captionInput.value }),
  });
  const enabled = el("input", {
    type: "checkbox",
    checked: tag ? tag.enabled : true,
    "aria-label": "Send to the agent",
    onchange: () => STATE.tags[picture.id] && void updateTag(picture.id, { enabled: enabled.checked }),
  });
  const card = el(
    "div",
    { class: `grp-tile${tag ? " grp-tagged" : ""}` },
    picture.url
      ? el("img", { src: thumbUrl(picture.url), alt: picture.id, loading: "lazy", decoding: "async" })
      : el("div", { class: "grp-missing", text: "No preview" }),
    el("div", { class: "grp-fields" }, roleSelect, ownerInput, captionInput, el("label", { class: "grp-check" }, enabled, " Use")),
    el("code", { class: "grp-id", text: picture.avatar || /^(ca|pa):/.test(picture.id) ? `${picture.id} (avatar)` : picture.id }),
  );
  return card;
};

const renderWarnings = () => {
  const box = root.querySelector(".grp-warnings");
  if (!box) return;
  box.replaceChildren(...poolWarnings(STATE.tags).map((text) => el("li", { text })));
};

const renderGrid = async () => {
  const grid = root.querySelector(".grp-grid");
  grid.replaceChildren(el("p", { class: "grp-empty", text: "Loading…" }));
  try {
    const pictures = await loadPictures(STATE.view);
    grid.replaceChildren(
      ...(pictures.length
        ? pictures.map(tile)
        : [el("p", { class: "grp-empty", text: STATE.view === "tagged" ? "Nothing tagged yet. Pick a character above." : "No pictures here." })]),
    );
  } catch (error) {
    grid.replaceChildren(el("p", { class: "grp-empty", text: error instanceof Error ? error.message : String(error) }));
  }
};

const renderSourceSelect = () => {
  const select = root.querySelector(".grp-source");
  const group = (label, items, prefix) =>
    items.length ? el("optgroup", { label }, items.map((item) => el("option", { value: `${prefix}:${item.id}`, text: item.name }))) : null;
  select.replaceChildren(
    el("option", { value: "tagged", text: "Tagged pictures" }),
    group("Characters", sources.characters, "character"),
    group("Personas", sources.personas, "persona"),
    el("option", { value: "global:all", text: "Global Gallery" }),
    group("Chat galleries", sources.chats, "chat"),
  );
  select.value = STATE.view;
  if (select.value !== STATE.view) STATE.view = select.value = "tagged";
};

const buildPanel = () => {
  const search = el("input", {
    class: "grp-search",
    type: "search",
    placeholder: "Find a character…",
    "aria-label": "Find a character",
    onchange: async () => {
      STATE.search = search.value.trim();
      await loadSources();
      renderSourceSelect();
    },
  });
  root.append(
    el(
      "div",
      { class: "grp-panel" },
      el(
        "header",
        { class: "grp-header" },
        el("strong", { text: "Reference pool" }),
        el("button", { type: "button", class: "grp-primary", text: "Sync", onclick: async () => {
          try { await saveTags(); await syncNow(); }
          catch (error) { setStatus(`Could not save tags: ${error.message}`, "error"); }
        } }),
        el("button", { type: "button", text: "Close", onclick: () => (root.hidden = true) }),
      ),
      el("p", { class: "grp-status", role: "status" }),
      el(
        "div",
        { class: "grp-controls" },
        el("select", {
          class: "grp-source",
          "aria-label": "Show pictures of",
          onchange: (event) => {
            STATE.view = event.target.value;
            void renderGrid();
          },
        }),
        search,
      ),
      el("ul", { class: "grp-warnings" }),
      el("div", { class: "grp-grid" }),
    ),
  );
};

const openPanel = async () => {
  root.hidden = false;
  if (!STATE.loaded) {
    if (STATE.loading) return;
    STATE.loading = true;
    try {
      const saved = await marinara.storage.get();
      STATE.tags = normalizeTags(saved?.tags);
      savedTags = STATE.tags;
      STATE.loaded = true;
      root.replaceChildren();
      buildPanel();
    } catch (error) {
      root.replaceChildren(el("div", { class: "grp-panel" },
        el("p", { role: "status", text: `Could not load saved tags: ${error.message}` }),
        el("button", { type: "button", text: "Retry", onclick: () => void openPanel() }),
        el("button", { type: "button", text: "Close", onclick: () => (root.hidden = true) })));
      return;
    } finally {
      STATE.loading = false;
    }
  }
  setStatus("Tag pictures with a role. Changes sync to the Gallery Illustrator automatically.");
  await loadSources();
  renderSourceSelect();
  renderWarnings();
  await renderGrid();
};

document.body.append(launcher, root);

marinara.onCleanup(() => {
  STATE.disposed = true;
  marinara.clearTimeout(STATE.syncTimer);
  launcher.remove();
  root.remove();
});
