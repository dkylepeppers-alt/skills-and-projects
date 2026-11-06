#!/usr/bin/env node
/**
 * Static checks for Marinara Personal/External Extension JavaScript, written against
 * Engine v2.5.2 `docs/extending/writing-personal-extensions.md` (Browser API version 6).
 * It is a heuristic text scan, not a parser: it catches the common mistakes (APIs the
 * runtime does not have, sandbox-forbidden globals, capability mismatches, missing
 * cleanup) and never proves code correct. Needs no Engine checkout.
 *
 *   node lint-extension.mjs path/to/manifest.json
 *   node lint-extension.mjs path/to/extension.js [--runtime client|server] [--capabilities a,b]
 *
 * Exit 0 when there are no errors (warnings allowed), 1 on errors, 2 on usage problems.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The documented `marinara` surface per runtime at Engine v2.5.2. */
const COMMON = [
  "runtime", "version", "extensionId", "extensionName", "capabilities",
  "log.debug", "log.info", "log.warn", "log.error",
  "storage.get", "storage.patch", "storage.delete",
  "setTimeout", "setInterval", "clearTimeout", "clearInterval",
  "onCleanup", "estimateTextTokens",
];
const BROWSER = [
  ...COMMON,
  "context.get", "context.subscribe",
  "ui.registerContribution", "ui.showWindow",
  "dice.registerFormat",
];
const FULL_PAGE = [...BROWSER, "fetch"];
const SERVER = COMMON;

/** Globals the sandboxed Browser runtime (Worker in an opaque-origin iframe) does not offer. */
const BROWSER_FORBIDDEN = [
  ["document", "no Marinara DOM in the sandbox; use ui.registerContribution panels"],
  ["window", "no host window in the sandbox"],
  ["localStorage", "browser storage is unavailable; use marinara.storage"],
  ["sessionStorage", "browser storage is unavailable; use marinara.storage"],
  ["indexedDB", "browser storage is unavailable; use marinara.storage"],
  ["fetch", "no network in the sandbox"],
  ["XMLHttpRequest", "no network in the sandbox"],
  ["WebSocket", "no network in the sandbox"],
  ["EventSource", "no network in the sandbox"],
  ["importScripts", "no module loading in the sandbox; bundle dependencies into the file"],
];
const SERVER_FORBIDDEN = [
  ["require", "no module loading in a Server Extension; bundle dependencies"],
  ["process", "no process access in a Server Extension"],
  ["fetch", "no network in a Server Extension"],
  ["Deno", "not a Server Extension API"],
];

/** Blank out comments and string/template contents so text inside them is not linted. */
export function stripCode(source) {
  // A small lexer: blanks comments, string and template text, and regex literal bodies
  // (also inside `${...}` interpolations) while keeping every offset and newline, so
  // findings point at the original source and only executable code is scanned.
  const out = source.split("");
  const n = source.length;
  const blank = (from, to) => { for (let k = from; k < to; k += 1) if (out[k] !== "\n") out[k] = " "; };
  const KEYWORDS_BEFORE_REGEX = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"]);
  let i = 0;
  let last = ""; // last significant token: an identifier/keyword or a punctuator character

  const regexAllowed = () =>
    last === "" || KEYWORDS_BEFORE_REGEX.has(last) || (last.length === 1 && "(,=:[!&|?{};+-*%<>~^".includes(last));

  function skipString(quote) {
    const begin = i;
    i += 1;
    while (i < n && source[i] !== quote && source[i] !== "\n") i += source[i] === "\\" ? 2 : 1;
    blank(begin + 1, Math.min(i, n));
    i += 1;
    last = "a";
  }

  function skipRegex() {
    const begin = i;
    i += 1;
    let inClass = false;
    while (i < n && source[i] !== "\n") {
      const c = source[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "[") inClass = true;
      else if (c === "]") inClass = false;
      else if (c === "/" && !inClass) break;
      i += 1;
    }
    blank(begin + 1, Math.min(i, n));
    i += 1;
    while (i < n && /[a-z]/i.test(source[i])) i += 1;
    last = "a";
  }

  function skipTemplate() {
    i += 1;
    let textStart = i;
    while (i < n) {
      const c = source[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "`") { blank(textStart, i); i += 1; last = "a"; return; }
      if (c === "$" && source[i + 1] === "{") {
        blank(textStart, i);
        i += 2;
        last = "{";
        code(true);
        textStart = i;
        continue;
      }
      i += 1;
    }
    blank(textStart, n);
  }

  /** Scan code; inside an interpolation, stop after its closing brace. */
  function code(interpolation) {
    let depth = 0;
    while (i < n) {
      const c = source[i];
      const next = source[i + 1];
      if (c === "/" && next === "/") {
        const begin = i;
        while (i < n && source[i] !== "\n") i += 1;
        blank(begin, i);
      } else if (c === "/" && next === "*") {
        const begin = i;
        const close = source.indexOf("*/", i + 2);
        i = close < 0 ? n : close + 2;
        blank(begin, i);
      } else if (c === "\"" || c === "'") {
        skipString(c);
      } else if (c === "`") {
        skipTemplate();
      } else if (c === "/" && regexAllowed()) {
        skipRegex();
      } else if (/[A-Za-z_$]/.test(c)) {
        const begin = i;
        while (i < n && /[\w$]/.test(source[i])) i += 1;
        last = source.slice(begin, i);
      } else if (/\d/.test(c)) {
        while (i < n && /[\w.]/.test(source[i])) i += 1;
        last = "0";
      } else if (/\s/.test(c)) {
        i += 1;
      } else {
        if (c === "{") depth += 1;
        if (c === "}") {
          if (interpolation && depth === 0) { i += 1; return; }
          depth -= 1;
        }
        // `)` and `]` end an expression, after which `/` divides.
        last = c === ")" || c === "]" ? "a" : c;
        i += 1;
      }
    }
  }

  code(false);
  return out.join("");
}

/** Spans of each `ui.registerContribution({...})` options object in stripped code. */
function contributionCalls(code) {
  const spans = [];
  for (const match of code.matchAll(/ui\s*\.\s*registerContribution\s*\(\s*\{/g)) {
    const start = match.index + match[0].length - 1;
    let depth = 0;
    for (let i = start; i < code.length; i += 1) {
      if (code[i] === "{") depth += 1;
      else if (code[i] === "}" && --depth === 0) { spans.push({ start, end: i + 1 }); break; }
    }
  }
  return spans;
}

/** The original text of an object literal with nested braces/brackets blanked, so only its own keys remain. */
function topLevelText(stripped, original) {
  let depth = 0;
  let out = "";
  for (let i = 0; i < stripped.length; i += 1) {
    const c = stripped[i];
    if (c === "{" || c === "[" || c === "(") depth += 1;
    out += depth <= 1 ? original[i] : " ";
    if (c === "}" || c === "]" || c === ")") depth -= 1;
  }
  return out;
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

/**
 * @param {string} source extension JavaScript
 * @param {{ runtime?: "client" | "server", capabilities?: string[] }} options
 * @returns {{ level: "error" | "warning", message: string, line?: number }[]}
 */
export function lintExtensionSource(source, { runtime = "client", capabilities = [] } = {}) {
  const findings = [];
  const add = (level, message, index) =>
    findings.push({ level, message: index === undefined ? message : `line ${lineOf(code, index)}: ${message}`, line: index === undefined ? undefined : lineOf(code, index) });
  const code = stripCode(source);
  const fullPage = capabilities.includes("full_page_access");
  const allowed = new Set(runtime === "server" ? SERVER : fullPage ? FULL_PAGE : BROWSER);

  // 1. Every marinara.<member> must exist in this runtime.
  const seen = new Set();
  for (const match of code.matchAll(/\bmarinara\s*(?:\?\.|\.)\s*([A-Za-z_$][\w$]*)(?:\s*(?:\?\.|\.)\s*([A-Za-z_$][\w$]*))?/g)) {
    const [, first, second] = match;
    const nested = ["log", "storage", "context", "ui", "dice"].includes(first);
    const name = nested && second ? `${first}.${second}` : first;
    if (nested && !second) continue; // e.g. `const { storage } = marinara` style access is checked by usage
    if (allowed.has(name) || seen.has(name)) continue;
    seen.add(name);
    const where = runtime === "server" ? "Server Extensions" : fullPage ? "full-page extensions" : "sandboxed Browser Extensions";
    add("error", `marinara.${name} is not a documented API for ${where} at Engine 2.5.2`, match.index);
  }

  // 2. Runtime boundary: globals that do not exist (or are untrusted) there.
  if (!fullPage) {
    const forbidden = runtime === "server" ? SERVER_FORBIDDEN : BROWSER_FORBIDDEN;
    for (const [global, why] of forbidden) {
      const pattern = new RegExp(`(?<![\\w$.])${global}\\b(?!\\s*:)`, "g");
      const match = pattern.exec(code);
      if (match) add("error", `\`${global}\`: ${why}`, match.index);
    }
    const imp = /(?:^|[;\n])\s*import\s*(?:[\w{*]|\(|["'`])/.exec(code);
    if (imp) add("error", "import statements are not supported; Marinara runs plain JavaScript, so bundle dependencies first", imp.index);
  } else if (/(?<![\w$.])fetch\s*\(/.test(code)) {
    add("warning", "use marinara.fetch(...) instead of window fetch so the extension's traffic is attributed in Settings");
  }

  // 3. Timers: unmanaged timers are not cleared when the extension stops.
  const bareTimer = /(?<![\w$.])(setTimeout|setInterval)\s*\(/.exec(code);
  if (bareTimer) add("warning", `use marinara.${bareTimer[1]} so the timer is removed when the extension stops`, bareTimer.index);

  // 4. Capabilities: requested vs used.
  if (runtime === "client" && !fullPage) {
    const usesContext = /marinara\s*\.\s*context\s*\.\s*(get|subscribe)/.test(code);
    const readsCharacters = usesContext && /\bcharacters\b/.test(code);
    const readsPersona = usesContext && /\b(persona|personaId)\b/.test(code);
    if (readsCharacters && !capabilities.includes("read_active_characters"))
      add("warning", "context `characters` stays [] without the read_active_characters capability");
    if (readsPersona && !capabilities.includes("read_active_persona"))
      add("warning", "context `persona`/`personaId` stay null without the read_active_persona capability");
    if (capabilities.includes("read_active_characters") && !readsCharacters)
      add("warning", "read_active_characters is requested but the code never reads context characters; drop it");
    if (capabilities.includes("read_active_persona") && !readsPersona)
      add("warning", "read_active_persona is requested but the code never reads the context persona; drop it");
  }
  if (runtime === "server" && capabilities.length) add("error", "Server Extensions must declare an empty capabilities list");

  // 5. Cleanup for things that register.
  const registers = /marinara\s*\.\s*(ui\s*\.\s*registerContribution|context\s*\.\s*subscribe|dice\s*\.\s*registerFormat)/.test(code);
  if (registers && !/marinara\s*\.\s*onCleanup\s*\(/.test(code))
    add("warning", "register cleanup with marinara.onCleanup (remove contributions, unsubscribe, remove dice formats)");

  // 6. Documented limits that can be seen statically.
  const diceFormats = [...code.matchAll(/marinara\s*\.\s*dice\s*\.\s*registerFormat\s*\(/g)].length;
  if (diceFormats > 4) add("error", `${diceFormats} dice formats registered; each extension can register at most 4`);
  for (const call of contributionCalls(code)) {
    // The stripper keeps offsets, so the original text at the same span still holds the literals.
    const text = source.slice(call.start, call.end);
    const top = topLevelText(code.slice(call.start, call.end), text);
    const id = /\bid\s*:\s*(["'`])([^"'`]*)\1/.exec(top);
    const target = /\btargetContributionId\s*:\s*(["'`])([^"'`]*)\1/.exec(top);
    for (const found of [id, target]) {
      // An interpolated template literal's value is unknown statically; only plain literals are checked.
      const interpolated = found?.[1] === "`" && found[2].includes("$");
      if (found && !interpolated && !/^[A-Za-z0-9._-]+$/.test(found[2]))
        add("error", `contribution id "${found[2]}" may contain only letters, numbers, ".", "_" and "-"`, call.start);
    }
    const kind = /\bkind\s*:\s*["']([\w-]+)["']/.exec(top)?.[1];
    if (kind && !["button", "menu-item", "panel", "command"].includes(kind))
      add("error", `contribution kind "${kind}" is not one of button, menu-item, panel, command`, call.start);
    if (kind === "command" && /\b(onActivate|onEvent)\b/.test(top))
      add("error", "a command contribution cannot use onActivate or onEvent; it activates its targetContributionId", call.start);
    if (kind === "command" && !/\btargetContributionId\s*:/.test(top))
      add("error", "a command contribution needs targetContributionId", call.start);
  }
  return findings;
}

function readManifestSource(manifestPath) {
  const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  const config = raw?.config ?? raw;
  const dir = dirname(manifestPath);
  const server = config.runtime === "server" || /server-extension$/.test(raw?.kind ?? "");
  const paths = server
    ? config.serverJsPath ?? config.serverJsPaths ?? config.jsPath ?? config.jsPaths
    : config.jsPath ?? config.jsPaths;
  const list = (Array.isArray(paths) ? paths : paths ? [paths] : []).map((path) => resolve(dir, path));
  for (const path of list) if (!existsSync(path)) throw new Error(`manifest names ${path}, which does not exist`);
  const source = list.length
    ? list.map((path) => readFileSync(path, "utf8")).join("\n\n")
    : (server ? config.serverJs ?? config.js : config.js) ?? "";
  return { source, runtime: server ? "server" : "client", capabilities: Array.isArray(config.capabilities) ? config.capabilities : [] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const target = args.find((arg) => !arg.startsWith("--"));
  if (!target) {
    console.error("Usage: lint-extension.mjs manifest.json | extension.js [--runtime client|server] [--capabilities a,b]");
    process.exit(2);
  }
  const option = (name) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };
  let input;
  try {
    input = target.endsWith(".json")
      ? readManifestSource(target)
      : { source: readFileSync(target, "utf8"), runtime: option("runtime") ?? (/\.server\.[mc]?js$/.test(target) ? "server" : "client"),
          capabilities: (option("capabilities") ?? "").split(",").filter(Boolean) };
  } catch (error) {
    console.error(`FAIL  ${error.message}`);
    process.exit(2);
  }
  if (!input.source.trim()) {
    console.error("FAIL  no JavaScript to lint");
    process.exit(1);
  }
  const findings = lintExtensionSource(input.source, input);
  for (const finding of findings) console.log(`${finding.level === "error" ? "FAIL" : "warn"}  ${finding.message}`);
  const errors = findings.filter((finding) => finding.level === "error").length;
  console.log(errors ? `\n${errors} error(s).` : `\nNo errors${findings.length ? ` (${findings.length} warning(s))` : ""}.`);
  process.exit(errors ? 1 : 0);
}
