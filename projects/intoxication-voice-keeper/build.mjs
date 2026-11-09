#!/usr/bin/env node
// Assemble the Intoxication Voice Keeper custom Agent from src/ into build/.
//
//   node build.mjs                    -> build/ (ignored by Git)
//   node build.mjs --release 1.0.0    -> also copies the outputs to releases/v1.0.0/ with SHA256SUMS
//
// Outputs both Engine v2.5.2 custom-Agent import shapes:
//   intoxication-voice-keeper.marinara-agent.json  single file  (Agents panel -> Import agents -> file)
//   Intoxication-Voice-Keeper/                      folder       (Import agents -> folder), same layout as an Engine export
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, "src");
const STYLE_SLOT = "%%STYLE%%";

export function assemble() {
  const source = JSON.parse(readFileSync(join(SRC, "agent.json"), "utf8"));
  const body = readFileSync(join(SRC, "prompt.md"), "utf8");
  if (body.split(STYLE_SLOT).length !== 2) throw new Error(`src/prompt.md must contain ${STYLE_SLOT} exactly once`);
  const render = (stylePath) => body.replace(STYLE_SLOT, readFileSync(join(SRC, stylePath), "utf8").trimEnd());

  const defaultPreset = source.presets.find((preset) => preset.id === source.defaultStyle);
  if (!defaultPreset) throw new Error(`defaultStyle ${source.defaultStyle} is not a preset`);
  const settings = {
    ...source.settings,
    defaultPromptTemplateName: defaultPreset.name,
    defaultPromptTemplateDescription: defaultPreset.description,
    // The built-in default is the agent's promptTemplate; the others are named prompt options.
    promptTemplates: source.presets
      .filter((preset) => preset.id !== source.defaultStyle)
      .map(({ id, name, description, style }) => ({ id, name, description, promptTemplate: render(style) })),
  };
  return {
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

export function outputFiles(config) {
  const segment = config.type;
  const folder = "Intoxication-Voice-Keeper";
  const folderConfig = { ...config, promptTemplatePath: "prompt.md", settingsPath: "settings.json" };
  const manifest = { kind: "marinara.agent", version: 1, config: folderConfig };
  const envelope = {
    kind: "marinara.agent-folder",
    version: 1,
    folderName: "Agents",
    agents: [{ path: `Agents/${segment}/manifest.json`, manifest }],
  };
  const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
  return {
    [`${config.type}.marinara-agent.json`]: json({ kind: "marinara.agent", version: 1, config }),
    [`${folder}/marinara-agents.json`]: json(envelope),
    [`${folder}/Agents/${segment}/manifest.json`]: json(manifest),
    [`${folder}/Agents/${segment}/prompt.md`]: config.promptTemplate,
    [`${folder}/Agents/${segment}/settings.json`]: json(config.settings),
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

  const files = outputFiles(assemble());
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
