# Character Voice Keeper

A custom Agent for Marinara Engine 2.5.2 or later. It keeps every character sounding like
themselves for the whole roleplay, so a long chat or a big cast does not slowly blur into one
voice.

Before each reply it:

1. **Profiles each voice from evidence.** For every character who speaks, card characters and
   recurring side characters alike, it records register, sentence rhythm, vocabulary (and
   words they would never use), what they call each other, humor, how emotion shows, dialect,
   up to three signature phrases actually used, what they guard, and how they differ from the
   others in the scene. Real dialogue in the chat outranks the card for how a character
   actually talks.
2. **Checks the newest replies for drift.** It looks for five kinds:
   - two characters starting to sound alike
   - generic, assistant-like or out-of-character speech
   - a catchphrase repeated into parody
   - register, address or accent slips
   - one character borrowing another's lines

   It counts each drift until the voice has been right for three replies.
3. **Separates real change from drift.** Growth the story earns (trust, grief, a time skip) is
   recorded as an arc and updates the profile slowly. Temporary states (drunk, terrified,
   lying, in disguise) bend delivery for that moment only.
4. **Gives the writer short notes** for the characters most likely to speak next: voice cues
   for this scene, a fix line when drift was found, and a contrast line in group scenes. It
   describes how they speak and never scripts their lines. It never voices or writes for the
   user's persona.

Profiles persist privately between turns. Only the writer notes reach the main prompt.

## Import

Use either file from `releases/v1.0.0/` (or a fresh `build/`):

- **File:** `character-voice-keeper.marinara-agent.json`
- **Folder:** `Character-Voice-Keeper/`

1. **Settings → Advanced → Danger Zone →** turn on **Allow custom Agent imports**.
2. **Agents → Import agents**, choose the file or folder. The permission review lists
   **no capabilities**. The agent needs none.
3. Open a chat → **Chat Settings → Enable Agents →** add **Character Voice Keeper** from
   **Custom Agents**. Pick a **Prompt Mode** if you want one other than Balanced.

It works in every chat mode, and is most useful in group chats and long roleplays.

## Prompt modes

| Mode | Use |
| --- | --- |
| **Balanced** (default) | Two or three cues per likely speaker; extra words only where drift was found. |
| **Strict** | Checks every spoken line for small slips and always adds a contrast line in group scenes. For long chats and large casts that keep blurring. |
| **Lean** | One voice line per speaker for a cheap or small agent model. Profiles and drift tracking stay the same. |
| **Custom** | Replace the `[YOUR INSTRUCTIONS]` line with your own voice rules. |

All modes share one output contract, so switching modes mid-chat keeps the stored profiles.

## Tuning

These values are written into the prompt text at build time. Change them in
`src/agent.json` → `promptValues` and rebuild, or edit the sentence in the agent's prompt
directly. They are not settings, because the Engine 2.5.2 agent editor drops settings it does
not know when you save.

| Value | Default | Effect |
| --- | --- | --- |
| `maxSpeakers` | `5` | Most characters covered in one turn's notes. |
| `maxDirectiveWords` | `220` | Upper bound for the writer notes. |
| `signatureLimit` | at most once per reply per character, not in every reply | How often signature phrases may appear. |

In the editor: **Context Size** `16` (recent messages read each turn; voices learned earlier
are kept in the stored profiles) and **Max Output Tokens** `2048`.

Context sources: chat history, characters, persona, activated lorebook entries (for setting
dialects or titles), chat summary, and **Previous output**. Previous output must stay on,
because it holds the profiles.

**Cost.** The agent runs before every reply, because drift builds slowly and quiet turns are
where it starts. With no character in the scene it returns `{"text":""}`, which injects nothing
and keeps the profiles. To cut cost, give it a cheaper **Model override** and the **Lean**
mode.

**With other agents.**
- [Intoxication Voice Keeper](../intoxication-voice-keeper/) covers drunk or high states.
  This agent keeps the sober baseline, and treats intoxication as a temporary state. The two
  can run together.
- Prose Guardian and Continuity rewrite after the reply. This agent works before it, so
  they complement each other.

## How it works in Engine 2.5.2

- **Phase** `pre_generation`, **result type** `context_injection`. A configured custom agent
  with this pair is eligible for main-prompt injection in every chat mode
  (`buildRuntimeAgentSectionEligibleTypes` in `runtime-agent-sections.ts`).
- `jsonContextOutput: true` makes the agent return `{"text": "...", "agent-context": {...}}`.
  Only `text` is injected. `agent-context` holds the profiles and comes back next turn as
  **Previous Agent Output**, because the `previousOutput` context source is on. If a reply
  omits `agent-context`, the last stored profiles are kept.
- Imports never transfer tools, connections or capabilities. This agent uses none of them.

Source pins: Engine [`fc0333c`](https://github.com/Pasta-Devs/Marinara-Engine/tree/fc0333c3fe978cda5e0b919bd6faec985901704e)
(`agent-executor.ts`, `runtime-agent-sections.ts`, `client/src/lib/agent-transfer.ts`,
`shared/src/types/agent.ts`).

## Edit and build

Edit `src/`, never the release folder:

- `src/prompt.md` is the shared prompt. `%%STYLE%%` marks where each mode's emphasis line goes.
- `src/styles/*.md` holds the emphasis line for each mode.
- `src/agent.json` holds the name, folder name, phase, result type, settings, mode list and
  `promptValues`.
- `%%name%%` in the prompt is replaced from `promptValues` at build time.

```bash
node build.mjs                      # build/ (ignored)
node --test tests/agent.test.mjs    # offline structural checks
# Engine import path (needs a full Engine checkout plus zod 4.6.x and tsx; see
# skills/marinara-engine-authoring/scripts/README.md):
MARINARA_ENGINE_ROOT=/path/to/Marinara-Engine node --import tsx tests/check-engine.mts
node build.mjs --release 1.0.1      # new archived release with SHA256SUMS; never overwrites
```

## Limits

- In Engine 2.5.2 an agent's character context carries description, personality, backstory,
  appearance and scenario, but not example dialogue (`mes_example`) or the card's greeting
  field. Voices come from those fields and from the characters' own lines in the chat. The
  greeting counts once it is a message in the chat.
- The agent cannot see who the Engine will pick to speak next in a group chat. It covers the
  characters who are present, addressed, or spoke last, up to `maxSpeakers`.
- The notes are guidance for the main model. A model that ignores injected context will still
  ignore them.
