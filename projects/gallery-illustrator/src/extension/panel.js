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
