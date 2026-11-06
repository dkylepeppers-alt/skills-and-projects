/**
 * An offline stand-in for the `marinara` global that Personal/External Extensions receive,
 * modelled on Engine v2.5.2 `docs/extending/writing-personal-extensions.md` (Browser API
 * version 6) and the Server Extension quickstart. Use it to unit-test extension logic in
 * Node without importing and approving the code in Marinara. Needs no Engine checkout.
 *
 *   import { createMarinaraStub, runExtension } from "./marinara-extension-stub.mjs";
 *   const stub = createMarinaraStub({ capabilities: ["read_active_characters"] });
 *   await runExtension(readFileSync("extension.js", "utf8"), stub);
 *   await stub.activate("my-panel");                     // open a panel / press a button
 *   await stub.event("my-panel", { elementId: "save", values: { note: "hi" } });
 *   stub.setContext({ chatId: "c1", characterIds: ["a"], characters: [{ id: "a", name: "Ada" }] });
 *   stub.advanceTimers(60_000);
 *   await stub.stop();                                   // runs onCleanup callbacks
 *
 * It enforces the documented contract where it can (contribution ids and kinds, command
 * rules, per-kind update fields, capability-filtered context, the 1,000,000-byte storage
 * cap, dice-format limits) and throws on anything else, so a passing test means the code
 * only used documented behavior. It is NOT the real sandbox: rendering, theming, the
 * approval flow and host timing are not simulated. Confirm in the app before shipping.
 */
import vm from "node:vm";

const API_VERSION = 6;
const STORAGE_LIMIT = 1_000_000;
const ID = /^[A-Za-z0-9._-]+$/;
const KINDS = new Set(["button", "menu-item", "panel", "command"]);
const SURFACES = new Set(["top-bar", "chats", "bots", "characters", "personas", "lorebooks", "presets", "connections", "agents", "settings"]);
const POSITIONS = new Set(["header", "before-content", "after-content"]);
const ELEMENT_KINDS = new Set(["heading", "text", "pre", "button", "input", "select", "toggle", "slider", "color", "spacer"]);
/** PERSONAL_EXTENSION_UI_LIMITS in Engine v2.5.2 `packages/shared/src/types/personal-extension.ts`. */
const LIMITS = {
  contributionsPerExtension: 24,
  panelElements: 60,
  idLength: 64,
  iconLength: 64,
  labelLength: 80,
  descriptionLength: 240,
  textLength: 8_000,
  totalPanelTextLength: 32_000,
  selectOptions: 100,
};
const UPDATE_FIELDS = {
  button: ["label", "description", "icon", "surface", "position"],
  "menu-item": ["label", "description", "icon"],
  panel: ["label", "description", "icon", "elements"],
  command: [],
};
const CHARACTER_FIELDS = ["id", "name", "description", "personality", "scenario", "firstMessage", "exampleDialogue", "creator",
  "characterVersion", "tags", "backstory", "appearance", "aboutMe", "conversationDisplayName"];
const PERSONA_FIELDS = ["id", "name", "description", "personality", "scenario", "backstory", "appearance", "tags", "aboutMe",
  "conversationDisplayName"];

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const pick = (value, fields) => Object.fromEntries(fields.filter((key) => key in value).map((key) => [key, clone(value[key])]));

function checkElements(elements, where) {
  if (!Array.isArray(elements)) throw new TypeError(`${where}: elements must be an array`);
  if (elements.length > LIMITS.panelElements) throw new RangeError(`${where}: at most ${LIMITS.panelElements} elements`);
  let text = 0;
  for (const element of elements) {
    if (!element || typeof element !== "object") throw new TypeError(`${where}: each element must be an object`);
    if (!ELEMENT_KINDS.has(element.kind)) throw new TypeError(`${where}: element kind "${element.kind}" is not one of ${[...ELEMENT_KINDS].join(", ")}`);
    if (element.id !== undefined && (typeof element.id !== "string" || element.id.length > LIMITS.idLength))
      throw new RangeError(`${where}: element id must be a string of at most ${LIMITS.idLength} characters`);
    if (typeof element.text === "string") {
      if (element.text.length > LIMITS.textLength) throw new RangeError(`${where}: element text is over ${LIMITS.textLength} characters`);
      text += element.text.length;
    }
    if (typeof element.label === "string" && element.label.length > LIMITS.labelLength)
      throw new RangeError(`${where}: element label is over ${LIMITS.labelLength} characters`);
    if (element.kind === "select" && (!Array.isArray(element.options) || element.options.length > LIMITS.selectOptions))
      throw new RangeError(`${where}: a select needs options (at most ${LIMITS.selectOptions})`);
    if (element.kind === "slider" && !(Number.isFinite(element.min) && Number.isFinite(element.max)))
      throw new TypeError(`${where}: a slider needs numeric min and max`);
  }
  if (text > LIMITS.totalPanelTextLength) throw new RangeError(`${where}: panel text totals over ${LIMITS.totalPanelTextLength} characters`);
}

function checkDescriptor(spec) {
  if (typeof spec.id !== "string" || !ID.test(spec.id) || spec.id.length > LIMITS.idLength)
    throw new TypeError(`contribution id "${spec.id}" must be 1-${LIMITS.idLength} letters, numbers, ".", "_" or "-"`);
  if (typeof spec.label !== "string" || !spec.label || spec.label.length > LIMITS.labelLength)
    throw new TypeError(`contribution "${spec.id}" needs a label of at most ${LIMITS.labelLength} characters`);
  if (spec.description !== undefined && String(spec.description).length > LIMITS.descriptionLength)
    throw new RangeError(`contribution "${spec.id}" description is over ${LIMITS.descriptionLength} characters`);
  if (spec.icon !== undefined && (typeof spec.icon !== "string" || spec.icon.length > LIMITS.iconLength || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(spec.icon)))
    throw new TypeError(`contribution "${spec.id}" icon must be a kebab-case Lucide name`);
}

/**
 * @param {{
 *   runtime?: "client" | "server",
 *   capabilities?: string[],
 *   extensionId?: string,
 *   extensionName?: string,
 *   storage?: Record<string, unknown>,
 *   context?: object,
 * }} [options]
 */
export function createMarinaraStub(options = {}) {
  const runtime = options.runtime ?? "client";
  const capabilities = [...(options.capabilities ?? [])];
  if (runtime === "server" && capabilities.length) throw new Error("Server Extensions must declare no capabilities");
  const logs = [];
  const contributions = new Map();
  const windows = [];
  const diceFormats = new Map();
  const cleanups = [];
  const subscribers = new Set();
  const timers = new Map();
  let now = 0;
  let nextTimer = 1;
  let stopped = false;
  let storage = clone(options.storage ?? {});
  let rawContext = { chatId: null, characterIds: [], characters: [], persona: null, personaId: null, ...(options.context ?? {}) };

  const snapshot = () => {
    const fromCards = (rawContext.characters ?? []).map((character) => character.id);
    const characterIds = [...(rawContext.characterIds?.length ? rawContext.characterIds : fromCards)];
    return {
      chatId: rawContext.chatId ?? null,
      characterIds,
      characterId: characterIds.length === 1 ? characterIds[0] : null,
      personaId: capabilities.includes("read_active_persona") ? rawContext.personaId ?? rawContext.persona?.id ?? null : null,
      characters: capabilities.includes("read_active_characters")
        ? (rawContext.characters ?? []).map((character) => pick(character, CHARACTER_FIELDS))
        : [],
      persona: capabilities.includes("read_active_persona") && rawContext.persona ? pick(rawContext.persona, PERSONA_FIELDS) : null,
    };
  };

  const alive = (what) => {
    if (stopped) throw new Error(`${what} called after the extension stopped`);
  };

  const addTimer = (callback, ms, repeat) => {
    alive(repeat ? "setInterval" : "setTimeout");
    if (typeof callback !== "function") throw new TypeError("timer callback must be a function");
    const id = nextTimer++;
    timers.set(id, { callback, at: now + Math.max(0, Number(ms) || 0), every: repeat ? Math.max(1, Number(ms) || 0) : 0 });
    return id;
  };

  const log = Object.fromEntries(["debug", "info", "warn", "error"].map((level) => [level, (...args) => logs.push({ level, args })]));

  const marinara = {
    runtime,
    version: API_VERSION,
    extensionId: options.extensionId ?? "stub-extension",
    extensionName: options.extensionName ?? "Stub Extension",
    capabilities: Object.freeze([...capabilities]),
    log: Object.freeze(log),
    storage: Object.freeze({
      async get() { return clone(storage); },
      async patch(value) {
        alive("storage.patch");
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("storage.patch takes an object");
        const merged = { ...storage, ...clone(value) };
        const bytes = Buffer.byteLength(JSON.stringify(merged));
        if (bytes > STORAGE_LIMIT) throw new RangeError(`storage would be ${bytes} bytes; the limit is ${STORAGE_LIMIT}`);
        storage = merged;
        return clone(storage);
      },
      async delete() { storage = {}; },
    }),
    setTimeout: (callback, ms) => addTimer(callback, ms, false),
    setInterval: (callback, ms) => addTimer(callback, ms, true),
    clearTimeout: (id) => void timers.delete(id),
    clearInterval: (id) => void timers.delete(id),
    onCleanup(callback) {
      if (typeof callback !== "function") throw new TypeError("onCleanup takes a function");
      cleanups.push(callback);
    },
    estimateTextTokens(text) {
      // Placeholder heuristic (about 4 characters a token); the Engine's estimator differs.
      return Math.ceil(String(text ?? "").length / 4);
    },
  };

  if (runtime === "client") {
    marinara.context = Object.freeze({
      get: () => snapshot(),
      subscribe(listener) {
        alive("context.subscribe");
        if (typeof listener !== "function") throw new TypeError("context.subscribe takes a function");
        subscribers.add(listener);
        Promise.resolve().then(() => subscribers.has(listener) && listener(snapshot()));
        return () => subscribers.delete(listener);
      },
    });
    marinara.ui = Object.freeze({
      registerContribution(spec) {
        alive("ui.registerContribution");
        if (!spec || typeof spec !== "object") throw new TypeError("registerContribution takes an options object");
        checkDescriptor(spec);
        if (!KINDS.has(spec.kind)) throw new TypeError(`contribution kind "${spec.kind}" is not button, menu-item, panel or command`);
        if (contributions.has(spec.id)) throw new Error(`contribution id "${spec.id}" is already registered`);
        if (contributions.size >= LIMITS.contributionsPerExtension)
          throw new RangeError(`at most ${LIMITS.contributionsPerExtension} contributions per extension`);
        if (spec.kind === "command") {
          if (spec.onActivate || spec.onEvent) throw new TypeError("a command cannot use onActivate or onEvent");
          if (typeof spec.targetContributionId !== "string") throw new TypeError("a command needs targetContributionId");
        }
        if (spec.kind === "button") {
          if (spec.surface !== undefined && !SURFACES.has(spec.surface)) throw new TypeError(`unknown surface "${spec.surface}"`);
          if (spec.position !== undefined && !POSITIONS.has(spec.position)) throw new TypeError(`unknown position "${spec.position}"`);
        }
        if (spec.kind === "panel") checkElements(spec.elements ?? [], `panel "${spec.id}"`);
        const state = { ...spec, surface: spec.kind === "button" ? spec.surface ?? "top-bar" : spec.surface };
        contributions.set(spec.id, state);
        return Object.freeze({
          update(patch) {
            alive("update");
            if (!contributions.has(spec.id)) throw new Error(`contribution "${spec.id}" was removed`);
            for (const key of Object.keys(patch ?? {})) {
              if (!UPDATE_FIELDS[spec.kind].includes(key)) throw new TypeError(`a ${spec.kind} handle cannot update "${key}"`);
            }
            if (patch.elements) checkElements(patch.elements, `panel "${spec.id}"`);
            checkDescriptor({ ...state, ...patch });
            Object.assign(state, clone(patch));
          },
          remove() { contributions.delete(spec.id); },
        });
      },
      showWindow(spec) {
        alive("ui.showWindow");
        checkElements(spec?.elements ?? [], "window");
        const state = { ...spec, open: true };
        windows.push(state);
        return Object.freeze({
          update(patch) { Object.assign(state, clone(patch)); },
          close() { state.open = false; state.onClose?.(); },
        });
      },
    });
    marinara.dice = Object.freeze({
      registerFormat(spec) {
        alive("dice.registerFormat");
        if (diceFormats.size >= 4) throw new Error("each extension can register at most 4 dice formats");
        if (typeof spec?.id !== "string" || typeof spec.parse !== "function" || typeof spec.read !== "function")
          throw new TypeError("a dice format needs id, parse and read");
        diceFormats.set(spec.id, spec);
        return Object.freeze({ remove() { diceFormats.delete(spec.id); } });
      },
    });
  }
  Object.freeze(marinara);

  const findContribution = (id) => {
    const found = contributions.get(id);
    if (!found) throw new Error(`no contribution "${id}" is registered`);
    return found;
  };
  const panelValues = (panel) =>
    Object.fromEntries((panel.elements ?? []).filter((e) => e.id && "value" in e || e.id && "checked" in e)
      .map((e) => [e.id, "checked" in e ? e.checked : e.value]));

  return {
    marinara,
    logs,
    windows,
    get storage() { return clone(storage); },
    get contributions() { return new Map([...contributions].map(([id, value]) => [id, clone(value)])); },
    get diceFormats() { return [...diceFormats.keys()]; },
    get pendingTimers() { return timers.size; },
    contribution: (id) => clone(findContribution(id)),
    /** Press a button/menu item, open a panel, or run a command's target. */
    async activate(id) {
      let found = findContribution(id);
      if (found.kind === "command") found = findContribution(found.targetContributionId);
      return found.onActivate?.();
    },
    /** Fire a panel/window control event; values default to the panel's current control values. */
    async event(id, { elementId, values } = {}) {
      const found = findContribution(id);
      if (typeof found.onEvent !== "function") throw new Error(`contribution "${id}" has no onEvent`);
      return found.onEvent({ elementId, values: values ?? panelValues(found) });
    },
    setContext(next) {
      rawContext = { ...rawContext, ...next };
      for (const listener of subscribers) listener(snapshot());
    },
    advanceTimers(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, timer] = due;
        now = timer.at;
        if (timer.every) timer.at += timer.every;
        else timers.delete(id);
        timer.callback();
      }
      now = until;
    },
    /** Run `/roll` notation through the registered formats with the given faces (or random ones). */
    async roll(notation, faces) {
      if (typeof notation !== "string" || notation.length > 100) throw new Error("notation must be a string of at most 100 characters");
      for (const format of diceFormats.values()) {
        const plan = await format.parse(notation);
        if (!plan) continue;
        const dice = plan.dice;
        if (!Array.isArray(dice) || dice.length < 1 || dice.length > 100 || dice.some((s) => !Number.isInteger(s) || s < 2 || s > 1000))
          throw new RangeError("parse must return 1-100 dice of 2-1000 sides");
        const rolls = faces ?? dice.map((sides) => 1 + Math.floor(Math.random() * sides));
        const result = await format.read({ notation, dice, rolls, plan });
        if (!result || !Number.isFinite(result.total)) throw new TypeError("read must return a finite total");
        if (result.text !== undefined && (typeof result.text !== "string" || result.text.length > 200))
          throw new RangeError("read text must be at most 200 characters");
        return { format: format.id, dice, rolls, ...result };
      }
      return null;
    },
    async stop() {
      stopped = true;
      timers.clear();
      subscribers.clear();
      for (const callback of cleanups.splice(0).reverse()) await callback();
    },
  };
}

/**
 * Run extension source with only `marinara` (and standard JS built-ins) in scope, like the
 * sandbox: no document, window, fetch or storage globals. Top-level await is supported.
 */
export async function runExtension(source, stub, { filename = "extension.js" } = {}) {
  const context = vm.createContext({ marinara: stub.marinara, console });
  const wrapped = `(async () => {\n${source}\n})()`;
  return new vm.Script(wrapped, { filename }).runInContext(context);
}
