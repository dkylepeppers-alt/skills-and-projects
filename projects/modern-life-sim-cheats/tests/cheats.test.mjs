// Tests for the Cheats module and its patcher. Runs with no upstream files.
// Set MLS_SERVER=/path/to/upstream/server.mjs to also check against a real bundle, read as text only:
// the bundle is never imported or executed here.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { checkBundle, patchServerSource } from "../apply-cheats.mjs";

const projectDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const moduleSource = readFileSync(join(projectDir, "cheats-module.js"), "utf8");
const loadModule = () => vm.runInNewContext(`${moduleSource}\n__mlsCheats`, {});
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const upstream = process.env.MLS_SERVER ? readFileSync(process.env.MLS_SERVER, "utf8") : null;

// Hook names the 0.3.2 bundle accepts (its RX table); a module with any other key is refused at startup.
const HOOKS_032 =
  "state cleanIn set migrate view dayTick tick arrived spans castMeet partyTick partyActs partyActChosen specials sheet setCharacter sceneBlocks content pictureGuidance stayWhy factWeight shutTo keepsOut places farewellAsk goodbye goodbyeWords goodbyeChosen stayHere tonight tonightChosen weddingNight tripNight tripNightChosen extraOf isNpc extraName hasNpcs activities backdrops backdropHere freeActs freeJump freeApply owns sceneReply sceneDecide sceneEnd faintMemory faintKept background cardFields castRead cardReread jobWhy routes guide changelog catalog covered".split(
    " ",
  );
const xpFor = (level) => ((level * (level + 1)) / 2) * 50;
const life = (over = {}) => ({
  wallet: { cash: 40, ledger: [] },
  needs: { energy: 12, hunger: 50 },
  skills: { fitness: 0, charm: 120, knowledge: 0, cooking: 30 },
  ...over,
});

test("module passes the game's registration rules", () => {
  const mod = loadModule();
  assert.match(mod.id, /^[a-z][a-z0-9-]{1,30}$/);
  assert.ok(mod.catalog.name && mod.catalog.about);
  for (const key of Object.keys(mod)) if (key !== "id") assert.ok(HOOKS_032.includes(key), `unknown hook ${key}`);
  const keys = new Set();
  for (const option of mod.catalog.options) {
    assert.ok(!keys.has(option.key), `duplicate option ${option.key}`);
    keys.add(option.key);
    assert.ok(["check", "pick"].includes(option.kind), `client renders only check/pick, not ${option.kind}`);
    assert.equal(option.needsRule, undefined);
    assert.equal(option.needsOption, undefined);
    if (option.kind === "pick") {
      assert.ok(option.choices.some(([value]) => value === option.start), `${option.key} start is a choice`);
      for (const choice of option.choices) assert.equal(choice.length, 3);
    }
  }
});

test("hook list matches the real bundle", { skip: !upstream && "set MLS_SERVER to check" }, () => {
  const start = upstream.indexOf("RX={");
  const end = upstream.indexOf(",LX=/^[a-z]", start);
  assert.ok(start > 0 && end > start, "found the hook table");
  const keys = [...upstream.slice(start, end).matchAll(/[{,]([a-zA-Z]+):[`"']/g)].map((m) => m[1]);
  assert.deepEqual(keys, HOOKS_032);
  // The curves cheats-module.js mirrors.
  assert.ok(upstream.includes("return t*(t+1)/2*50}"), "skill XP curve unchanged");
  assert.ok(upstream.includes('Ar=["fitness","charm","knowledge","cooking"]'), "skill list unchanged");
  assert.ok(/va=100,.*?hr=\(e=0\)=>va\+Math\.max\(0,Math\.trunc\(e\)\)\*3/.test(upstream), "energy max unchanged");
  assert.ok(upstream.includes("ye=e=>vp(e.skills)"), "energy max reads skill levels only");
});

test("switching on through set() applies cheats immediately", () => {
  const mod = loadModule();
  const state = { ...mod.state(), on: false };
  const save = life();
  assert.equal(mod.set(save, state, { on: true }).ok, true);
  assert.equal(state.on, true);
  assert.equal(save.wallet.cash, 40, "wallet off by default");
  assert.equal(save.needs.energy, 12, "energy off by default");
  assert.equal(save.skills.charm, 120, "skills as earned by default");

  assert.equal(mod.set(save, state, { wallet: true }).ok, true);
  assert.equal(save.wallet.cash, 10000);
  mod.set(save, state, { floor: "1000000" });
  assert.equal(save.wallet.cash, 1000000);
  mod.set(save, state, { energy: true });
  assert.equal(save.needs.energy, 100);
  mod.set(save, state, { fitness: "10", cooking: "4" });
  assert.equal(save.skills.fitness, xpFor(10));
  assert.equal(save.skills.cooking, xpFor(4));
  assert.equal(save.skills.charm, 120);
  mod.tick(save, state);
  assert.equal(save.needs.energy, 130, "fitness 10 raises the cap to 130");
});

test("tick holds locks, never lowers money or energy", () => {
  const mod = loadModule();
  const state = { ...mod.state(), on: true, wallet: true, floor: "1000", energy: true, charm: "3" };
  const save = life({ wallet: { cash: 5000, ledger: [] }, needs: { energy: 100, hunger: 5 } });
  mod.tick(save, state);
  assert.equal(save.wallet.cash, 5000, "above the floor stays");
  assert.equal(save.skills.charm, xpFor(3), "charm 120 XP lowered to its locked level 3");
  save.wallet.cash = 3;
  save.needs.energy = 1;
  save.skills.charm += 400;
  mod.tick(save, state);
  assert.equal(save.wallet.cash, 1000);
  assert.equal(save.needs.energy, 100);
  assert.equal(save.skills.charm, xpFor(3));
  assert.equal(save.needs.hunger, 5, "hunger is left to the game's own rule");
  mod.set(save, state, { charm: "earned" });
  save.skills.charm = 777;
  mod.tick(save, state);
  assert.equal(save.skills.charm, 777, "as earned releases the lock");
});

test("does nothing while off, and ignores junk", () => {
  const mod = loadModule();
  const state = { ...mod.state(), on: false, wallet: true, energy: true, fitness: "10" };
  const save = life();
  const before = JSON.stringify(save);
  mod.tick(save, state);
  assert.equal(JSON.stringify(save), before);
  const on = { ...mod.state(), on: true };
  assert.equal(mod.set(save, on, { floor: "5", fitness: "11", charm: 3, junk: true }).ok, false);
  assert.deepEqual({ ...on }, { ...mod.state(), on: true });
  mod.tick(null, on);
  mod.tick({}, { ...on, wallet: true, energy: true, fitness: "2" });
});

test("cleanIn builds state for a new life", () => {
  const mod = loadModule();
  assert.equal(mod.cleanIn(null), null);
  assert.equal(mod.cleanIn({ on: false }), null);
  const state = mod.cleanIn({ on: true, confirmed: true, wallet: true, knowledge: "7", bogus: 1 });
  assert.deepEqual({ ...state }, { ...mod.state(), on: true, wallet: true, knowledge: "7" });
});

test("cleanIn applies the cheats to the new life at once, before any time passes", () => {
  const mod = loadModule();
  const fresh = life();
  mod.cleanIn({ on: true, wallet: true, floor: "100000", energy: true, fitness: "10", cooking: "3" }, fresh);
  assert.equal(fresh.wallet.cash, 100000);
  assert.equal(fresh.skills.fitness, xpFor(10));
  assert.equal(fresh.skills.cooking, xpFor(3));
  assert.equal(fresh.skills.charm, 120);
  assert.equal(fresh.needs.energy, 130);
  // Without a life (or a half-built one) it still returns the state and writes nothing.
  assert.equal(mod.cleanIn({ on: true, wallet: true }).wallet, true);
  assert.doesNotThrow(() => mod.cleanIn({ on: true, wallet: true, energy: true }, {}));
});

const fakeBundle = 'var q3={id:"adult"};var DQ=[q3];for(let e of DQ)ur().some(t=>t.id===e.id)||fY(e);export{};\n';

test("patcher injects once and refuses unknown or patched bundles", () => {
  assert.throws(() => patchServerSource(fakeBundle, moduleSource), /no longer works the way/);
  const { patched } = patchServerSource(fakeBundle, moduleSource, { force: true });
  assert.ok(patched.includes("var DQ=[q3,__mlsCheats];for(let e of DQ)"));
  assert.throws(() => patchServerSource(patched, moduleSource, { force: true }), /already has/);
  assert.throws(() => patchServerSource(fakeBundle + fakeBundle, moduleSource, { force: true }), /found it 2 times/);
  assert.throws(() => patchServerSource("export{};", moduleSource, { force: true }), /found it 0 times/);
  execFileSync(process.execPath, ["--check", "--input-type=module"], { input: patched });
});

test("patcher accepts the real bundle", { skip: !upstream && "set MLS_SERVER to check" }, () => {
  const { patched, known } = patchServerSource(upstream, moduleSource);
  assert.equal(known, "0.3.2");
  assert.ok(patched.includes("var DQ=[q3,__mlsCheats];for(let e of DQ)"));
  execFileSync(process.execPath, ["--check", "--input-type=module"], { input: patched, maxBuffer: 1 << 26 });
});

test("data-dir patch and revert keep Engine's hashes consistent", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "mls-cheats-"));
  const version = "0.3.2";
  const versionDir = join(dataDir, "capability-packages", "versions", "modern-life-sim", version);
  mkdirSync(versionDir, { recursive: true });
  const bundle = Buffer.from(fakeBundle);
  const files = [{ path: "server.mjs", sha256: sha256(bundle), bytes: bundle.byteLength }];
  writeFileSync(join(versionDir, "server.mjs"), bundle);
  writeFileSync(join(versionDir, "manifest.json"), JSON.stringify({ id: "modern-life-sim", files }));
  const registryPath = join(dataDir, "capability-packages", "installed.json");
  writeFileSync(
    registryPath,
    JSON.stringify({ schemaVersion: 1, packages: [{ id: "modern-life-sim", version, status: "active", manifest: { files } }] }),
  );
  const run = (...args) =>
    execFileSync(process.execPath, [join(projectDir, "apply-cheats.mjs"), "--data-dir", dataDir, ...args], {
      encoding: "utf8",
    });
  const declared = (path) => JSON.parse(readFileSync(path, "utf8"));
  const check = () => {
    const onDisk = readFileSync(join(versionDir, "server.mjs"));
    for (const manifest of [declared(registryPath).packages[0].manifest, declared(join(versionDir, "manifest.json"))]) {
      assert.equal(manifest.files[0].sha256, sha256(onDisk));
      assert.equal(manifest.files[0].bytes, onDisk.byteLength);
    }
    return onDisk.toString("utf8");
  };

  assert.throws(() => run(), /no longer works the way/, "unknown bundle needs --force");
  run("--force", "--dry-run");
  assert.equal(check(), fakeBundle, "dry run writes nothing");
  run("--force");
  assert.ok(check().includes("__mlsCheats"));
  assert.ok(existsSync(join(dataDir, "modern-life-sim-cheats-backup", version, "server.mjs")));
  assert.throws(() => run("--force"), /already has/);
  run("--revert");
  assert.equal(check(), fakeBundle);
  assert.match(run("--revert"), /Nothing to revert/);
});

function fixture({ manifestFiles } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), "mls-cheats-"));
  const versionDir = join(dataDir, "capability-packages", "versions", "modern-life-sim", "0.3.2");
  mkdirSync(versionDir, { recursive: true });
  const bundle = Buffer.from(fakeBundle);
  const files = [{ path: "server.mjs", sha256: sha256(bundle), bytes: bundle.byteLength }];
  writeFileSync(join(versionDir, "server.mjs"), bundle);
  writeFileSync(join(versionDir, "manifest.json"), JSON.stringify({ id: "modern-life-sim", files: manifestFiles ?? files }));
  const registryPath = join(dataDir, "capability-packages", "installed.json");
  writeFileSync(
    registryPath,
    JSON.stringify({ schemaVersion: 1, packages: [{ id: "modern-life-sim", version: "0.3.2", status: "active", manifest: { files } }] }),
  );
  const run = (...args) =>
    execFileSync(process.execPath, [join(projectDir, "apply-cheats.mjs"), "--data-dir", dataDir, ...args], {
      encoding: "utf8",
      stdio: "pipe",
    });
  return { dataDir, versionDir, registryPath, run };
}

test("a manifest problem found mid-patch leaves every file untouched", () => {
  const { versionDir, registryPath, run } = fixture({ manifestFiles: [] });
  const before = [join(versionDir, "server.mjs"), registryPath, join(versionDir, "manifest.json")].map((p) => readFileSync(p));
  assert.throws(() => run("--force"), /does not declare server\.mjs/);
  const after = [join(versionDir, "server.mjs"), registryPath, join(versionDir, "manifest.json")].map((p) => readFileSync(p));
  assert.deepEqual(after, before);
});

test("revert repairs hashes left behind by an interrupted run", () => {
  const { versionDir, registryPath, run } = fixture();
  run("--force");
  // Simulate an earlier revert that restored the bundle and then died before updating the hashes.
  writeFileSync(join(versionDir, "server.mjs"), fakeBundle);
  assert.match(run("--revert"), /hashes now match/);
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  assert.equal(registry.packages[0].manifest.files[0].sha256, sha256(Buffer.from(fakeBundle)));
  assert.match(run("--revert"), /Nothing to revert/);
});

// A made-up later release: different minified names, unknown hash, but every shape the module relies on.
const compatibleBundle = [
  'var Hk={catalog:"how it shows",state:"its state",cleanIn:"a new life",set:"a change",tick:"time passes"},Zq=/^[a-z]/;',
  "function Mz(e){for(let o of Object.keys(e))if(o!==\"id\"&&!Hk[o])throw new Error(`The module ${e.id} has \\xAB${o}\\xBB, which is no hook.`)}",
  "function Qa(n,e,i,a,o,r){n.set?n.set(e,i,a):0;o.cleanIn?o.cleanIn(r,e):0;Wv(e,\"tick\",{from:1,to:2});return e?.modules?.[a]}",
  'function Pb(e){e.wallet.cash+=1;e.needs.energy-=1}var Kc=["fitness","charm","knowledge","cooking","singing"];',
  "function Rn(e){let t=Math.min(10,Math.max(0,Math.trunc(e)));return t*(t+1)/2*50}",
  "function Jv(e){let t={};for(let o of Kc)t[o]=Lm(e[o]??0).level;return t}",
  "var Xa=100,Yb=4,Gw=(e=0)=>Xa+Math.max(0,Math.trunc(e))*3,Tf=e=>Jv(e.skills);",
  "function Sd(e,t){return{energyMax:Gw(t),fitness:Tf(e).fitness}}",
  'var Bb={id:"adult"};var Cc=[Bb];for(let e of Cc)Ee().some(t=>t.id===e.id)||Mz(e);export{};',
].join("\n");
const compatibleClient = 'x.kind==="check";y.kind==="pick";`<input data-set-module="1">`';

test("a later release that keeps the module's assumptions patches without --force", () => {
  assert.deepEqual(checkBundle(compatibleBundle, compatibleClient).filter((c) => !c.ok), []);
  const { patched, known, forced } = patchServerSource(compatibleBundle, moduleSource, { clientSource: compatibleClient });
  assert.equal(known, null);
  assert.equal(forced, false);
  assert.ok(patched.includes("var Cc=[Bb,__mlsCheats];for(let e of Cc)"));
  execFileSync(process.execPath, ["--check", "--input-type=module"], { input: patched });
});

test("a broken assumption is refused by name, and --force goes past it", () => {
  const broken = {
    "a skill reaches level L at 25·L·(L+1) XP, up to level 10": compatibleBundle.replace("/2*50}", "/2*60}"),
    "maximum energy is 100 + 3 per Fitness level": compatibleBundle.replace("*3,", "*4,"),
    "skills include fitness, charm, knowledge and cooking": compatibleBundle.replace(',"cooking"', ""),
    "money is life.wallet.cash": compatibleBundle.replace("e.wallet.cash", "e.purse.cash"),
    'the game accepts a module "tick" hook': compatibleBundle.replace('tick:"time passes"', 'tock:"time passes"'),
    "maximum energy reads the Fitness level, not raw XP": compatibleBundle.replace("e[o]??0).level", "e[o]??0).xp"),
  };
  for (const [name, source] of Object.entries(broken)) {
    const failed = checkBundle(source).filter((c) => !c.ok).map((c) => c.name);
    assert.deepEqual(failed, [name]);
    assert.throws(() => patchServerSource(source, moduleSource), (error) => error.message.includes(name));
    const warnings = [];
    const result = patchServerSource(source, moduleSource, { force: true, warn: (m) => warnings.push(m) });
    assert.equal(result.forced, true);
    assert.ok(warnings[0].includes(name));
  }
  const clientFailures = checkBundle(compatibleBundle, "nothing here").filter((c) => !c.ok);
  assert.equal(clientFailures.length, 3);
});

test("the real bundle passes every check", { skip: !upstream && "set MLS_SERVER to check" }, () => {
  assert.deepEqual(checkBundle(upstream).filter((c) => !c.ok), []);
  assert.equal(patchServerSource(upstream, moduleSource).forced, false);
});
