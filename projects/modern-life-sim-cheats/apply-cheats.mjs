#!/usr/bin/env node
// Adds the Cheats module (cheats-module.js) to an installed Modern Life Sim, or takes it out again.
//
//   node apply-cheats.mjs --data-dir <Engine data folder>            patch the installed package
//   node apply-cheats.mjs --data-dir <Engine data folder> --revert   put the original back
//   node apply-cheats.mjs --server-file <in.mjs> --out <out.mjs>     patch a loose copy (for testing)
//
// Options: --dry-run (check everything, write nothing), --force (patch even when a compatibility check
// fails; the injection point must still match exactly once).
//
// Any Modern Life Sim version is accepted when the game still works the way cheats-module.js assumes.
// Those assumptions are checked in the bundle's text (see checkBundle), so an update that leaves them
// alone needs no change here, and one that breaks them is refused with the assumption it broke.
//
// Stop Marinara Engine first. Engine checks every installed file against the hashes in
// capability-packages/installed.json, so this script updates server.mjs's entry there too.
// Backups go to <data dir>/modern-life-sim-cheats-backup/<version>/.
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ID = "modern-life-sim";
const SERVER_FILE = "server.mjs";
const MARKER = "/* modern-life-sim-cheats module v1:";
const MODULE_VAR = "__mlsCheats";
// Upstream server.mjs bundles this module has been checked against by hand. Informational only:
// checkBundle decides whether a bundle can be patched.
const KNOWN_UPSTREAM = new Map([
  ["d5672272a8267f205537f524a3ab2d52cc0531f4567ea624c06de1e67f95c890", "0.3.2"],
]);
// The bundle's built-in module list and its registration loop, by shape rather than by minified names:
//   var DQ=[q3];for(let e of DQ)ur().some(t=>t.id===e.id)||fY(e);
const REGISTRATION =
  /var ([\w$]+)=\[([\w$]+(?:,[\w$]+)*)\];for\(let ([\w$]+) of \1\)([\w$]+)\(\)\.some\(([\w$]+)=>\5\.id===\3\.id\)\|\|([\w$]+)\(\3\);/g;

const here = dirname(fileURLToPath(import.meta.url));
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

function parseArgs(argv) {
  const args = { dryRun: false, force: false, revert: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--revert") args.revert = true;
    else if (arg === "--data-dir") args.dataDir = argv[++i];
    else if (arg === "--server-file") args.serverFile = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

const escapeName = (name) => name.replace(/\$/g, "\\$");
const has = (source, pattern) => pattern.test(source);

/**
 * Checks, in the bundle's text, every assumption cheats-module.js makes about the game. Minified names
 * change from build to build, so each check matches code by its shape. Returns [{ name, ok }].
 * `clientSource` (client.js) is optional; without it the client checks are skipped.
 */
export function checkBundle(source, clientSource = null) {
  const checks = [];
  const check = (name, ok) => checks.push({ name, ok: !!ok });

  // The game refuses a module with a key it does not know; the keys live in a table it validates against.
  const validator = /!([\w$]+)\[[\w$]+\]\)throw new Error\(`The module \$\{[\w$]+\.id\} has [^`]*which is no hook\.`\)/.exec(source);
  const tableStart = validator && new RegExp(`[,;\\s]${escapeName(validator[1])}=\\{`).exec(source);
  const table = tableStart && tableStart.index < validator.index ? source.slice(tableStart.index, validator.index) : "";
  for (const hook of ["catalog", "state", "cleanIn", "set", "tick"]) {
    check(`the game accepts a module "${hook}" hook`, table && new RegExp(`[{,]${hook}:["'\`]`).test(table));
  }
  check("option changes go through a module's set()", has(source, /([\w$]+)\.set\?\1\.set\(/));
  check(
    "a new life's module settings go through cleanIn(), which gets the new life",
    has(source, /([\w$]+)\.cleanIn\?\1\.cleanIn\([\w$]+,[\w$]+\)/),
  );
  check('"tick" runs with the life after time passes', has(source, /\([\w$]+,"tick",\{from:/));
  check("module settings are kept in life.modules[id]", has(source, /\?\.modules\?\.\[/));
  check("money is life.wallet.cash", has(source, /\.wallet\.cash\b/));
  check("energy is life.needs.energy", has(source, /\.needs\.energy\b/));
  check(
    "skills include fitness, charm, knowledge and cooking",
    [...source.matchAll(/=\[((?:"[a-z]+",)*"[a-z]+")\]/g)].some(([, list]) =>
      ["fitness", "charm", "knowledge", "cooking"].every((skill) => list.split(",").includes(`"${skill}"`)),
    ),
  );
  check(
    "a skill reaches level L at 25·L·(L+1) XP, up to level 10",
    has(source, /function ([\w$]+)\(([\w$]+)\)\{let ([\w$]+)=Math\.min\(10,Math\.max\(0,Math\.trunc\(\2\)\)\);return \3\*\(\3\+1\)\/2\*50\}/),
  );
  const energy = /([\w$]+)=100,[^;]{0,200}?([\w$]+)=\(([\w$]+)=0\)=>\1\+Math\.max\(0,Math\.trunc\(\3\)\)\*3/.exec(source);
  check(
    "maximum energy is 100 + 3 per Fitness level",
    energy && new RegExp(`energyMax:${escapeName(energy[2])}\\(`).test(source),
  );
  const levels = /[,;\s]([\w$]+)=([\w$]+)=>([\w$]+)\(\2\.skills\)/.exec(source);
  check(
    "maximum energy reads the Fitness level, not raw XP",
    levels &&
      new RegExp(`fitness:${escapeName(levels[1])}\\([\\w$]+\\)\\.fitness`).test(source) &&
      new RegExp(
        `function ${escapeName(levels[3])}\\(([\\w$]+)\\)\\{let ([\\w$]+)=\\{\\};for\\(let ([\\w$]+) of [\\w$]+\\)\\2\\[\\3\\]=[\\w$]+\\(\\1\\[\\3\\]\\?\\?0\\)\\.level;return \\2\\}`,
      ).test(source),
  );
  if (clientSource !== null) {
    check('the client draws "check" options', clientSource.includes('kind==="check"'));
    check('the client draws "pick" options', clientSource.includes('kind==="pick"'));
    check("the client saves module options", clientSource.includes("data-set-module"));
  }
  return checks;
}

/** Returns the patched bundle text. Throws unless the injection point matches exactly once. */
export function patchServerSource(source, moduleSource, { force = false, clientSource = null, warn = () => {} } = {}) {
  if (source.includes(MARKER)) throw new Error("This server.mjs already has the Cheats module.");
  if (source.includes(MODULE_VAR)) throw new Error(`This server.mjs already uses the name ${MODULE_VAR}.`);
  const known = KNOWN_UPSTREAM.get(sha256(Buffer.from(source))) ?? null;
  const failed = checkBundle(source, clientSource).filter((item) => !item.ok);
  if (failed.length) {
    const list = failed.map((item) => `  - ${item.name}`).join("\n");
    if (!force) {
      throw new Error(
        `This Modern Life Sim no longer works the way the Cheats module expects:\n${list}\n` +
          "Update cheats-module.js for this version, or rerun with --force to patch anyway (then test it).",
      );
    }
    warn(`--force: patching although these checks failed:\n${list}`);
  }
  const matches = [...source.matchAll(REGISTRATION)];
  if (matches.length !== 1) {
    throw new Error(`Expected the built-in module registration exactly once, found it ${matches.length} times.`);
  }
  const [match] = matches;
  const [whole, listName, entries] = match;
  const replacement = `${moduleSource.trim()}\nvar ${listName}=[${entries},${MODULE_VAR}];${whole.slice(
    `var ${listName}=[${entries}];`.length,
  )}`;
  return {
    patched: source.slice(0, match.index) + replacement + source.slice(match.index + whole.length),
    known,
    forced: failed.length > 0,
  };
}

async function writeAtomic(path, data, mode) {
  const temporary = `${path}.cheats-tmp`;
  await writeFile(temporary, data, { mode });
  await rename(temporary, path);
}

async function loadRegistry(dataDir) {
  const registryPath = join(dataDir, "capability-packages", "installed.json");
  if (!existsSync(registryPath)) {
    throw new Error(`No ${registryPath}. Point --data-dir at Marinara Engine's data folder (default: <Engine>/packages/server/data).`);
  }
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  const entry = registry.packages?.find((item) => item.id === PACKAGE_ID);
  if (!entry) throw new Error(`Modern Life Sim is not installed in ${dataDir}. Install it from the Agents catalog first.`);
  if (entry.status === "restart-required") {
    throw new Error("Modern Life Sim is waiting for an Engine restart. Start Engine once, stop it, then run this again.");
  }
  const versionDir = join(dataDir, "capability-packages", "versions", PACKAGE_ID, entry.version);
  return { registryPath, registry, entry, versionDir, serverPath: join(versionDir, SERVER_FILE) };
}

function setFileHash(manifest, buffer) {
  const declared = manifest?.files?.find((file) => file.path === SERVER_FILE);
  if (!declared) throw new Error(`The manifest does not declare ${SERVER_FILE}.`);
  declared.sha256 = sha256(buffer);
  declared.bytes = buffer.byteLength;
}

/**
 * Replaces server.mjs and records its hash in installed.json and the installed manifest.json as one step.
 * Everything is read and validated before the first write; if any write fails, all three files are put
 * back as they were, so Engine never sees a bundle whose hash its registry does not record.
 */
async function commitBundle({ registryPath, registry, entry, versionDir, serverPath }, serverBuffer, { dryRun = false } = {}) {
  const manifestPath = join(versionDir, "manifest.json");
  const targets = [
    { path: serverPath, data: serverBuffer },
    { path: registryPath, json: registry, manifest: entry.manifest },
  ];
  if (existsSync(manifestPath)) {
    const manifestOnDisk = JSON.parse(await readFile(manifestPath, "utf8"));
    targets.push({ path: manifestPath, json: manifestOnDisk, manifest: manifestOnDisk });
  }
  for (const target of targets) {
    if (target.manifest) setFileHash(target.manifest, serverBuffer);
    if (target.json) target.data = Buffer.from(`${JSON.stringify(target.json, null, 2)}\n`);
    target.before = await readFile(target.path);
    target.mode = (await stat(target.path)).mode;
  }
  if (dryRun) return;
  const written = [];
  try {
    for (const target of targets) {
      await writeAtomic(target.path, target.data, target.mode);
      written.push(target);
    }
  } catch (error) {
    const failed = [];
    for (const target of written.reverse()) {
      await writeAtomic(target.path, target.before, target.mode).catch(() => failed.push(target.path));
    }
    const restored = failed.length ? ` Could not restore: ${failed.join(", ")}.` : " All files were put back.";
    throw new Error(`${error.message}.${restored}`);
  }
}

const describe = ({ known, forced }) =>
  forced
    ? "FORCED past failed compatibility checks; test before trusting it"
    : known
      ? `the ${known} release, checked by hand`
      : "a version not checked by hand; its compatibility checks passed";
const declaredHash = (entry) => entry.manifest.files.find((file) => file.path === SERVER_FILE)?.sha256;

async function patchInstalled(args, moduleSource) {
  const installed = await loadRegistry(args.dataDir);
  const original = await readFile(installed.serverPath);
  if (declaredHash(installed.entry) !== sha256(original)) {
    throw new Error("The installed server.mjs does not match Engine's registry. Reinstall Modern Life Sim, then try again.");
  }
  const clientPath = join(installed.versionDir, "client.js");
  const clientSource = existsSync(clientPath) ? await readFile(clientPath, "utf8") : null;
  const result = patchServerSource(original.toString("utf8"), moduleSource, {
    ...args,
    clientSource,
    warn: (message) => console.warn(message),
  });
  const patchedBuffer = Buffer.from(result.patched);
  const backupDir = join(args.dataDir, "modern-life-sim-cheats-backup", installed.entry.version);
  console.log(`Modern Life Sim ${installed.entry.version}: ${describe(result)}`);
  if (args.dryRun) {
    await commitBundle(installed, patchedBuffer, { dryRun: true });
    console.log("Dry run: the patch applies cleanly. Nothing was written.");
    return;
  }
  await mkdir(backupDir, { recursive: true });
  await copyFile(installed.serverPath, join(backupDir, SERVER_FILE));
  await copyFile(installed.registryPath, join(backupDir, "installed.json"));
  await commitBundle(installed, patchedBuffer);
  console.log(`Patched ${installed.serverPath}`);
  console.log(`Backup in ${backupDir}`);
  console.log("Start Marinara Engine, open Life Sim → SETTINGS, and switch on Cheats in the Modules group.");
}

async function revertInstalled(args) {
  const installed = await loadRegistry(args.dataDir);
  const currentBuffer = await readFile(installed.serverPath);
  if (!currentBuffer.toString("utf8").includes(MARKER)) {
    if (declaredHash(installed.entry) === sha256(currentBuffer)) {
      console.log("The installed server.mjs has no Cheats module. Nothing to revert.");
      return;
    }
    // An interrupted earlier run left the original bundle with the patched hashes: record the real ones.
    if (args.dryRun) {
      console.log("Dry run: would record the unpatched server.mjs's hash in Engine's registry.");
      return;
    }
    await commitBundle(installed, currentBuffer);
    console.log("The original server.mjs was already back; Engine's recorded hashes now match it. Restart Marinara Engine.");
    return;
  }
  const backupPath = join(args.dataDir, "modern-life-sim-cheats-backup", installed.entry.version, SERVER_FILE);
  if (!existsSync(backupPath)) {
    throw new Error(`No backup at ${backupPath}. Reinstall Modern Life Sim from the catalog to get the original back.`);
  }
  const original = await readFile(backupPath);
  if (original.toString("utf8").includes(MARKER)) throw new Error(`The backup at ${backupPath} is itself patched.`);
  if (args.dryRun) {
    console.log(`Dry run: would restore ${installed.serverPath} from ${backupPath}.`);
    return;
  }
  await commitBundle(installed, original);
  console.log(`Restored the original ${installed.serverPath}. Restart Marinara Engine.`);
  console.log("Lives keep their Cheats settings in their save; the game ignores them without the module.");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.dataDir && !args.serverFile)) {
    console.log("Usage: node apply-cheats.mjs --data-dir <Engine data folder> [--revert] [--dry-run] [--force]");
    console.log("       node apply-cheats.mjs --server-file <server.mjs> --out <patched.mjs> [--force]");
    process.exit(args.help ? 0 : 1);
  }
  const moduleSource = await readFile(join(here, "cheats-module.js"), "utf8");
  if (args.serverFile) {
    if (args.revert) throw new Error("--revert works with --data-dir only.");
    if (!args.out && !args.dryRun) throw new Error("--server-file needs --out <path> (or --dry-run).");
    const result = patchServerSource(await readFile(args.serverFile, "utf8"), moduleSource, {
      ...args,
      warn: (message) => console.warn(message),
    });
    if (!args.dryRun) await writeFile(resolve(args.out), result.patched);
    console.log(`${args.dryRun ? "Dry run: patch applies" : `Wrote ${args.out}`} (${describe(result)})`);
    return;
  }
  args.dataDir = resolve(args.dataDir);
  if (args.revert) await revertInstalled(args);
  else await patchInstalled(args, moduleSource);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`FAIL: ${error.message}`);
    process.exit(1);
  });
}
