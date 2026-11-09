# Intoxication Voice Keeper

A custom Agent for Marinara Engine 2.5.2 or later. It keeps drunk (or high) characters
believable and **in character** for as long as the drinking lasts.

Before each reply it:

1. **Tracks exposure from what the story shows.** It counts drinks that are actually
   consumed, not offered, ordered or mentioned. It reads each character's tolerance from their
   card and lore, then keeps a 0–5 level and a phase (rising, peak, comedown, hungover) for
   every character, the user's persona included.
2. **Sobers characters up in story time**, not message count. Long dialogue is minutes, a
   scene cut can be hours. No sudden sobriety without a cause, and a hangover the next morning.
3. **Anchors each voice before bending it.** The first time a character drinks, it records
   their sober voice: register, rhythm, signature phrases, accent, humor, what they guard. It
   also notes their *drunk type*, meaning what alcohol amplifies in this person (the stoic leaks one
   truth, the charmer gets grandiose). The anchor is stored and reused, so the character stays
   the same across a long night.
4. **Gives the writer short, character-specific notes** for this turn only: how *their*
   voice bends at this level, likely behavior, and one thing that must stay true. Spelled
   slurring is rationed (from level 3, one or two readable words per line), and it never
   writes the user's actions.

State persists privately between turns. Only the writer notes reach the main prompt.

## Import

Use either file from `releases/v1.0.1/` (or a fresh `build/`):

- **File:** `intoxication-voice-keeper.marinara-agent.json`
- **Folder:** `Intoxication-Voice-Keeper/`

1. **Settings → Advanced → Danger Zone →** turn on **Allow custom Agent imports**.
2. **Agents → Import agents**, choose the file or folder. The permission review lists
   **no capabilities**. The agent needs none.
3. Open a chat → **Chat Settings → Enable Agents →** add **Intoxication Voice Keeper** from
   **Custom Agents**. Pick a **Prompt Mode** if you want one other than Grounded.

It works in every chat mode. Turning on **Enable Agents** for one chat does not affect others.

## Prompt modes

| Mode | Use |
| --- | --- |
| **Grounded** (default) | Realistic intoxication with consequences. |
| **Heightened Comedy** | Comic timing and escalating bits, still built from each character's own voice. |
| **Lean** | Shorter notes for a cheap or small agent model. Tracking stays the same. |
| **Custom** | Replace the `[YOUR INSTRUCTIONS]` line with your own tone rules. |

All modes share one output contract, so switching modes mid-chat keeps the stored state.

## Tuning

These values are written into the prompt text at build time. Change them in
`src/agent.json` → `promptValues` and rebuild, or edit the sentence in the agent's prompt
directly. They are not settings, because the Engine 2.5.2 agent editor drops settings it does
not know when you save.

| Value | Default | Effect |
| --- | --- | --- |
| `soberingRate` | about one level per story hour after the peak | How fast levels fall. |
| `slurFromLevel` | `3` | First level at which spelled slurring may appear. |
| `maxDirectiveWords` | `220` | Upper bound for the writer notes. |

In the editor: **Context Size** `12` (recent messages read each turn; older drinks are kept in
the private state) and **Max Output Tokens** `2048`.

Context sources: chat history, characters, persona, activated lorebook entries (for potions or
species tolerance), chat summary, trackers (for the story clock), and **Previous output**.
Previous output must stay on, because it holds the private state.

**Cost.** The agent runs before every reply, because characters have to keep sobering up after
the drinks scroll out of view. On quiet, sober turns it returns `{"text":""}`, which injects
nothing and keeps the state. To cut cost, give it a cheaper **Model override** and the
**Lean** mode. Avoid activation keywords: once the drink words leave the scan window, the
agent would stop running and the character would stay frozen at their last level.

## How it works in Engine 2.5.2

- **Phase** `pre_generation`, **result type** `context_injection`. The Engine places a
  pre-generation context injection from a custom agent into the main prompt for that reply.
- `jsonContextOutput: true` makes the agent return
  `{"text": "...", "agent-context": {...}}`. Only `text` is injected. `agent-context` is stored
  with the turn and comes back next turn as **Previous Agent Output**, because the
  `previousOutput` context source is on. If a reply omits `agent-context`, the last stored
  state is kept. A regeneration reads the state from before the replaced turn, and an inactive
  swipe never supplies state.
- Imports never transfer tools, connections or capabilities. This agent uses none of them.

Source pins: Engine [`fc0333c`](https://github.com/Pasta-Devs/Marinara-Engine/tree/fc0333c3fe978cda5e0b919bd6faec985901704e)
(`agent-executor.ts`, `agent-output.ts`, `agents.storage.ts`, `runtime-agent-sections.ts`,
`client/src/lib/agent-transfer.ts`, `docs/agents/custom-agents.md`, `docs/CONFIGURATION.md`).

## Edit and build

Edit `src/`, never the release folder:

- `src/prompt.md` is the shared prompt. `%%STYLE%%` marks where each mode's tone line goes.
- `src/styles/*.md` holds the tone line for each mode.
- `src/agent.json` holds the name, phase, result type, settings, mode list and `promptValues`.
- `%%name%%` in the prompt is replaced from `promptValues` at build time.

```bash
node build.mjs                      # build/ (ignored)
node --test tests/agent.test.mjs    # offline structural checks
# Engine import path (needs a full Engine checkout plus zod 4.6.x and tsx; see
# skills/marinara-engine-authoring/scripts/README.md):
MARINARA_ENGINE_ROOT=/path/to/Marinara-Engine node --import tsx tests/check-engine.mts
node build.mjs --release 1.0.2      # new archived release with SHA256SUMS; never overwrites
```

## Limits

- The agent can only see the most recent messages and its own stored state. Drinks before
  it was enabled are rebuilt from the visible history, if they are still in view.
- Character example dialogue (`mes_example`) is not part of an agent's character context in
  2.5.2. The voice anchor comes from description, personality, backstory and the character's
  sober lines in chat.
- The notes are guidance for the main model. A model that ignores injected context will still
  ignore them.
- The agent covers voice and behavior only. It does not give real-world dosing information.
