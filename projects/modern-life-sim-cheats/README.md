# Modern Life Sim — Cheats

A personal add-on for [Modern Life Sim](https://github.com/Pasta-Devs/Marinara-Agents/tree/ffde8ea4035868c064eb3b2ffd675f1f807c57ed/packages/modern-life-sim)
(Pasta Devs, Marinara Agents). It adds a **Cheats** module to the game's own Modules list:

| Group | Switch | What it does |
| --- | --- | --- |
| Money | **Bottomless wallet** + **Never below** | Cash never drops below $1,000 / $10,000 / $100,000 / $1,000,000. |
| Energy | **Never tired** | Energy is topped up to full whenever time passes. |
| Skills | **Fitness**, **Charm**, **Knowledge**, **Cooking** | *As earned* (default) or held at any level 0–10. |

Never hungry is not here: the game already has it as a rule (`rules.hunger`).

## How it works

Modern Life Sim has a module system; its Adult module is the only built-in one. Modules are
registered from a fixed list inside the package's minified `server.mjs`, and the original
source tree is not published in either Pasta-Devs repository. So this project does not fork
the package. It **patches your installed copy**:

1. `cheats-module.js` is a self-contained module written to the game's module contract
   (`catalog`, `state`, `cleanIn`, `set`, `tick`). It touches only `life.wallet.cash`,
   `life.needs.energy` and `life.skills`, and never lowers money or energy.
2. `apply-cheats.mjs` inserts it before the built-in module list and adds it to that list.
   It finds the spot by shape and refuses unless it matches exactly once. It works with **any
   version** of the game that still does what the module relies on (see *Compatibility checks*).
3. Engine verifies installed files against hashes in `capability-packages/installed.json`,
   so the script updates `server.mjs`'s hash there and in the installed `manifest.json`.

The package id stays `modern-life-sim`. Your existing lives, routes and pictures are unchanged.
No upstream files are stored in this repository.

## Use

Requires Node.js 18+ and Modern Life Sim installed from **Agents → Download Agents**.

1. **Stop Marinara Engine.**
2. Find Engine's data folder: `DATA_DIR` if you set one, otherwise
   `<Engine checkout>/packages/server/data` (it contains `capability-packages/`).
3. Check, then patch:

   ```bash
   node apply-cheats.mjs --data-dir /path/to/data --dry-run
   node apply-cheats.mjs --data-dir /path/to/data
   ```

4. Start Engine, open **Home → Life Sim**, load a life, go to **SETTINGS**, and switch on
   **Cheats** in the Modules group (or tick it when creating a new life). Then pick your switches.

The game's rules for modules apply: once Cheats is on in a life it stays on (each cheat is
still its own switch), and you can't switch it on mid-scene.

**Undo:** stop Engine, then `node apply-cheats.mjs --data-dir /path/to/data --revert`.
The original is restored from `<data dir>/modern-life-sim-cheats-backup/<version>/`.
Lives keep their Cheats settings in the save; the unpatched game ignores them.

**Updates:** updating Modern Life Sim from the catalog installs a clean copy, so the cheats
disappear. Stop Engine and rerun the script. It patches the new version as long as the
compatibility checks still pass.

## Compatibility checks

Instead of a list of approved versions, the script reads the installed game's code (as text,
never running it) and checks each assumption the module makes:

- the game still accepts the `catalog`, `state`, `cleanIn`, `set` and `tick` module hooks,
  and still uses `set()` for option changes, `cleanIn()` (given the new life) for new lives, and `tick` after time passes;
- module settings live in `life.modules[id]`; money is `life.wallet.cash`; energy is `life.needs.energy`;
- skills include fitness, charm, knowledge and cooking, and level L still takes 25·L·(L+1) XP, up to 10;
- maximum energy is still 100 + 3 per Fitness level, read from the level rather than raw XP;
- the phone app still draws switch and choice options and saves module settings.

If one fails, nothing is written and the message names it, e.g. *"a skill reaches level L at
25·L·(L+1) XP, up to level 10"*. That is the part of `cheats-module.js` to update.
`--force` patches anyway, with a warning, but then a skill lock or the energy refill may write
wrong values into your saves, so test on a throwaway life first. The script's output also says
whether a version is one checked by hand (currently 0.3.2) or only passed the automatic checks.

## Behaviour details

- Cheats apply the moment they are switched on: when a life is created with Cheats ticked, and when
  a switch changes in SETTINGS. After that they are reapplied each time time passes. Spending that
  takes no time (e.g., an online order) can dip below the wallet floor until the clock next moves.
- A locked skill is set to exactly its level's XP threshold on every tick. Practice can add XP
  between ticks and the game may announce a level-up that the next tick takes back.
- *Never tired* refills after each step of time, after the game's collapse check. A single
  step would have to drain a full bar to make you collapse, which normal play does not do.
- Maximum energy is 100 + 3 per Fitness level, so Fitness 10 gives 130.
- Wallet top-ups do not add ledger lines.

## Verification

`node --test tests/cheats.test.mjs` checks the module's behaviour, its fit with the game's
module registration rules, patch/revert on a fixture Engine data folder, that a made-up later
release with the same shapes patches without `--force`, and that each broken assumption is
refused by name. With `MLS_SERVER=/path/to/upstream/server.mjs` it also runs the compatibility
checks and the injection against a real bundle, read as text.

Verified against upstream 0.3.2 (`server.mjs` sha256 `d5672272…c890`, Agents commit `ffde8ea`):
the patch applies once and the result passes `node --check`. **Not yet verified in a running
Engine** — the bundle was never executed here. Report the first in-game run's result here.

## Licensing

Modern Life Sim belongs to Pasta Devs and is distributed in an AGPL-3.0 repository. This project
holds only the add-on module and patch script, for personal use; it adds no license to their work.
