/* modern-life-sim-cheats module v1: injected into Modern Life Sim's server.mjs by apply-cheats.mjs. */
// This file is spliced into the game's server bundle verbatim, just before the bundle registers its
// built-in modules. It must stay a single self-contained `var` declaration: no imports, and no
// references to the bundle's minified internals, whose names change from one release to the next.
// The game registers it through its own module contract (the same one the Adult module uses), so
// the switches appear in the game's Modules list with no change to client.js.
var __mlsCheats = (() => {
  const SKILLS = ["fitness", "charm", "knowledge", "cooking"];
  const SKILL_NAMES = { fitness: "Fitness", charm: "Charm", knowledge: "Knowledge", cooking: "Cooking" };
  const MAX_LEVEL = 10;
  const LEVELS = Array.from({ length: MAX_LEVEL + 1 }, (_, level) => String(level));
  const EARNED = "earned";
  const FLOORS = [
    ["1000", "$1,000", "Enough for everyday life."],
    ["10000", "$10,000", "Shopping sprees and rent without a thought."],
    ["100000", "$100,000", "Furniture, cars and homes."],
    ["1000000", "$1,000,000", "Anything at all."],
  ];
  const FLOOR_VALUES = FLOORS.map(([value]) => value);
  const DEFAULT_FLOOR = "10000";

  // These mirror Modern Life Sim 0.3.2's own curves (checked against its server bundle):
  // a skill reaches level L at 25·L·(L+1) XP, capped at level 10, and maximum energy is
  // 100 plus 3 for each Fitness level. apply-cheats.mjs checks the installed game for these
  // curves (checkBundle) and refuses to patch a release that changed them.
  const xpFor = (level) => ((level * (level + 1)) / 2) * 50;
  const levelOf = (xp) => {
    let level = 0;
    while (level < MAX_LEVEL && xp >= xpFor(level + 1)) level++;
    return level;
  };
  const energyMax = (life) => 100 + 3 * levelOf(Math.max(0, Number(life?.skills?.fitness) || 0));

  const defaults = () => ({
    wallet: false,
    floor: DEFAULT_FLOOR,
    energy: false,
    ...Object.fromEntries(SKILLS.map((skill) => [skill, EARNED])),
  });

  // Copies only known keys with valid values, so nothing a request sends can put junk in a save.
  function assign(state, changes) {
    if (!changes || typeof changes !== "object") return false;
    let changed = false;
    for (const key of ["on", "wallet", "energy"]) {
      if (typeof changes[key] === "boolean") {
        state[key] = changes[key];
        changed = true;
      }
    }
    if (FLOOR_VALUES.includes(changes.floor)) {
      state.floor = changes.floor;
      changed = true;
    }
    for (const skill of SKILLS) {
      if (changes[skill] === EARNED || LEVELS.includes(changes[skill])) {
        state[skill] = changes[skill];
        changed = true;
      }
    }
    return changed;
  }

  // Never lowers money or energy. A locked skill is held at exactly its level's threshold:
  // practice can still add XP between ticks, and the next tick puts it back.
  function apply(life, state) {
    if (!life || !state?.on) return;
    if (life.skills && typeof life.skills === "object") {
      for (const skill of SKILLS) {
        if (LEVELS.includes(state[skill])) life.skills[skill] = xpFor(Number(state[skill]));
      }
    }
    if (state.wallet && life.wallet && Number.isFinite(life.wallet.cash)) {
      const floor = Number(FLOOR_VALUES.includes(state.floor) ? state.floor : DEFAULT_FLOOR);
      if (life.wallet.cash < floor) life.wallet.cash = floor;
    }
    if (state.energy && life.needs && Number.isFinite(life.needs.energy)) {
      const max = energyMax(life);
      if (life.needs.energy < max) life.needs.energy = max;
    }
  }

  const skillOption = (skill) => ({
    group: "Skills",
    key: skill,
    kind: "pick",
    title: SKILL_NAMES[skill],
    start: EARNED,
    choices: [
      [EARNED, "As earned", "Your own progress, untouched."],
      ...LEVELS.map((level) => [
        level,
        `Level ${level}`,
        level === "0" ? "None at all." : level === String(MAX_LEVEL) ? "The very top." : "Held here.",
      ]),
    ],
  });

  return {
    id: "cheats",
    catalog: {
      name: "Cheats",
      about: "Set your skills, never run out of money, never get tired. Each cheat is its own switch.",
      options: [
        {
          group: "Money",
          key: "wallet",
          kind: "check",
          title: "Bottomless wallet",
          why: "Your cash never drops below the amount you pick.",
        },
        { group: "Money", key: "floor", kind: "pick", title: "Never below", start: DEFAULT_FLOOR, choices: FLOORS },
        {
          group: "Energy",
          key: "energy",
          kind: "check",
          title: "Never tired",
          why: "Your energy is topped up to full whenever time passes.",
        },
        ...SKILLS.map(skillOption),
      ],
    },
    state: () => defaults(),
    // A new life with Cheats switched on from the creation screen. The game passes the freshly built
    // life as the second argument, so the cheats apply at once instead of waiting for time to pass
    // (otherwise the life starts with its normal cash and skills, and a first purchase spends real money).
    cleanIn: (draft, life) => {
      if (!draft || typeof draft !== "object" || draft.on === false) return null;
      const state = defaults();
      assign(state, draft);
      state.on = true;
      apply(life, state);
      return state;
    },
    // Switching it on, and every change in SETTINGS. Applied at once, so the change shows straight away.
    set(life, state, changes = {}) {
      if (!assign(state, changes)) return { ok: false, reason: "Nothing to change." };
      apply(life, state);
      return { ok: true };
    },
    tick: (life, state) => apply(life, state),
  };
})();
