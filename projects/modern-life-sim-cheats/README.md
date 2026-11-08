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
   It finds the spot by shape, refuses unless it matches exactly once, and by default only
   patches upstream bundles it knows by hash (currently **0.3.2**).
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
disappear. If the new version is one this project knows, rerun the script. Otherwise it refuses;
`--force` tries anyway (the injection point still has to match exactly once), but the module's
copies of the game's skill and energy curves may then be wrong, so test before trusting it.

## Behaviour details

- A locked skill is set to exactly its level's XP threshold on every tick. Practice can add XP
  between ticks and the game may announce a level-up that the next tick takes back.
- *Never tired* refills after each step of time, after the game's collapse check. A single
  step would have to drain a full bar to make you collapse, which normal play does not do.
- Maximum energy is 100 + 3 per Fitness level, so Fitness 10 gives 130.
- Wallet top-ups do not add ledger lines.

## Verification

`node --test tests/cheats.test.mjs` checks the module's behaviour, its fit with the game's
module registration rules, and patch/revert on a fixture Engine data folder. With
`MLS_SERVER=/path/to/upstream/server.mjs` it also checks the hook table, skill/energy curves and
injection point against a real bundle, read as text.

Verified against upstream 0.3.2 (`server.mjs` sha256 `d5672272…c890`, Agents commit `ffde8ea`):
the patch applies once and the result passes `node --check`. **Not yet verified in a running
Engine** — the bundle was never executed here. Report the first in-game run's result here.

## Licensing

Modern Life Sim belongs to Pasta Devs and is distributed in an AGPL-3.0 repository. This project
holds only the add-on module and patch script, for personal use; it adds no license to their work.
