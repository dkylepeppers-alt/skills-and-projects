#!/usr/bin/env node
// Assemble Gallery Illustrator from src/ into build/.
//
//   node build.mjs                    -> build/ (ignored by Git)
//   node build.mjs --release 1.0.0    -> also copies the outputs to releases/v1.0.0/ with SHA256SUMS
//
// Outputs:
//   gallery-illustrator.marinara-agent.json        custom Agent, single file (Agents -> Import agents -> file)
//   Gallery-Illustrator/                            custom Agent, folder (Import agents -> folder)
//   Gallery-Reference-Pool/                         External Extension folder (Settings -> Extensions -> import folder)
//   gallery-reference-pool.personal-extension.zip   the same extension as a ZIP (easier on a phone)
//   engine-patch/                                   local Engine patches (PATCH10, plus the PATCH8 fix)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32 } from "node:zlib";

const ROOT = dirname(fileURLToPath(import.meta.url));
const AGENT_SRC = join(ROOT, "src", "agent");
const EXT_SRC = join(ROOT, "src", "extension");
const PATCH_SRC = join(ROOT, "engine-patch");
const STYLE_SLOT = "%%STYLE%%";

// ── custom Agent ──

export function assemble() {
  const source = JSON.parse(readFileSync(join(AGENT_SRC, "agent.json"), "utf8"));
  const body = readFileSync(join(AGENT_SRC, "prompt.md"), "utf8");
  if (body.split(STYLE_SLOT).length !== 2) throw new Error(`src/agent/prompt.md must contain ${STYLE_SLOT} exactly once`);
  // Tunable values are written into the prompt at build time: the agent editor rebuilds `settings`
  // on save and drops keys it does not know, so settings-backed {{placeholders}} would go blank.
  const fill = (text) =>
    text.replace(/%%([A-Za-z]+)%%/g, (match, key) => {
      if (key === "STYLE") return match;
      if (!Object.hasOwn(source.promptValues, key)) throw new Error(`src/agent/prompt.md uses unknown %%${key}%%`);
      return String(source.promptValues[key]);
    });
  const render = (stylePath) =>
    fill(body).replace(STYLE_SLOT, readFileSync(join(AGENT_SRC, stylePath), "utf8").trimEnd());

  const defaultPreset = source.presets.find((preset) => preset.id === source.defaultStyle);
  if (!defaultPreset) throw new Error(`defaultStyle ${source.defaultStyle} is not a preset`);
  const settings = {
    ...source.settings,
    defaultPromptTemplateName: defaultPreset.name,
    defaultPromptTemplateDescription: defaultPreset.description,
    promptTemplates: source.presets
      .filter((preset) => preset.id !== source.defaultStyle)
      .map(({ id, name, description, style }) => ({ id, name, description, promptTemplate: render(style) })),
  };
  return {
    folderName: source.folderName,
    type: source.type,
    name: source.name,
    description: source.description,
    phase: source.phase,
    enabled: true,
    connectionId: null,
    imagePath: null,
    promptTemplate: render(defaultPreset.style),
    settings,
    resultType: source.resultType,
  };
}

/** The import config: everything assemble() returns except the build-only folder name. */
export function importConfig(assembled) {
  const { folderName, ...config } = assembled;
  return config;
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function agentFiles(assembled) {
  const folder = assembled.folderName;
  if (!/^[A-Za-z0-9-]+$/.test(folder ?? "")) throw new Error("src/agent/agent.json needs a plain folderName");
  const config = importConfig(assembled);
  const segment = config.type;
  const folderConfig = { ...config, promptTemplatePath: "prompt.md", settingsPath: "settings.json" };
  const manifest = { kind: "marinara.agent", version: 1, config: folderConfig };
  const envelope = {
    kind: "marinara.agent-folder",
    version: 1,
    folderName: "Agents",
    // Folder import keeps the chosen folder's name in every path, and the Engine resolves
    // promptTemplatePath/settingsPath beside this entry path, so it carries the prefix.
    agents: [{ path: `${folder}/Agents/${segment}/manifest.json`, manifest }],
  };
  return {
    [`${config.type}.marinara-agent.json`]: json({ kind: "marinara.agent", version: 1, config }),
    [`${folder}/marinara-agents.json`]: json(envelope),
    [`${folder}/Agents/${segment}/manifest.json`]: json(manifest),
    [`${folder}/Agents/${segment}/prompt.md`]: config.promptTemplate,
    [`${folder}/Agents/${segment}/settings.json`]: json(config.settings),
  };
}

// ── External Extension ──

export const EXTENSION_FOLDER = "Gallery-Reference-Pool";

/** pool-core.js with its `export` keywords removed, then panel.js: one script body for the page wrapper. */
export function extensionScript() {
  const core = readFileSync(join(EXT_SRC, "pool-core.js"), "utf8").replace(/^export (?=(const|function|async function) )/gm, "");
  if (/^\s*(export|import)\b/m.test(core)) throw new Error("pool-core.js may only use `export const|function` declarations");
  const panel = readFileSync(join(EXT_SRC, "panel.js"), "utf8");
  if (/^\s*(export|import)\b/m.test(panel)) throw new Error("panel.js runs inside the extension wrapper; no import/export");
  return `// Gallery Reference Pool — built from src/extension by build.mjs. Edit the sources, not this file.\n${core}\n${panel}`;
}

export function extensionFiles() {
  const manifest = readFileSync(join(EXT_SRC, "manifest.json"), "utf8");
  return {
    [`${EXTENSION_FOLDER}/manifest.json`]: manifest,
    [`${EXTENSION_FOLDER}/extension.js`]: extensionScript(),
    [`${EXTENSION_FOLDER}/extension.css`]: readFileSync(join(EXT_SRC, "extension.css"), "utf8"),
  };
}

/** A stored (uncompressed) ZIP with fixed timestamps, so the bytes and checksum are reproducible. */
export function storedZip(entries) {
  const DOS_TIME = 0; // 00:00:00
  const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // 2026-01-01
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const data = Buffer.from(content, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

// ── everything ──

export function outputFiles() {
  const extension = extensionFiles();
  const zipEntries = Object.entries(extension).map(([path, content]) => [
    // The Engine's own export layout: Personal Extensions/<name>/...
    path.replace(`${EXTENSION_FOLDER}/`, "Personal Extensions/Gallery Reference Pool/"),
    content,
  ]);
  const patches = Object.fromEntries(
    readdirSync(PATCH_SRC)
      .filter((name) => name.endsWith(".patch"))
      .sort()
      .map((name) => [`engine-patch/${name}`, readFileSync(join(PATCH_SRC, name), "utf8")]),
  );
  return {
    ...agentFiles(assemble()),
    ...extension,
    "gallery-reference-pool.personal-extension.zip": storedZip(zipEntries),
    ...patches,
  };
}

function write(dir, files) {
  for (const [path, content] of Object.entries(files)) {
    const target = join(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

function main() {
  const args = process.argv.slice(2);
  const releaseAt = args.indexOf("--release");
  const version = releaseAt >= 0 ? args[releaseAt + 1] : null;
  if (releaseAt >= 0 && !/^\d+\.\d+\.\d+$/.test(version ?? "")) throw new Error("--release needs a semver version");

  const files = outputFiles();
  const build = join(ROOT, "build");
  rmSync(build, { recursive: true, force: true });
  write(build, files);
  console.log(`Built ${Object.keys(files).length} files into ${relative(process.cwd(), build) || "."}/`);

  if (version) {
    const release = join(ROOT, "releases", `v${version}`);
    if (existsSync(release)) throw new Error(`releases/v${version} exists; archived releases are never overwritten`);
    write(release, files);
    const sums = Object.entries(files)
      .map(([path, content]) => `${createHash("sha256").update(content).digest("hex")}  ${path}`)
      .sort((a, b) => a.slice(66).localeCompare(b.slice(66)))
      .join("\n");
    writeFileSync(join(release, "SHA256SUMS"), `${sums}\n`);
    console.log(`Released to releases/v${version}/ with SHA256SUMS`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
