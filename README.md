# Skills and projects

A personal workspace for reusable AI skills and the projects built with them.
Intended GitHub home: `dkylepeppers-alt/skills-and-projects` (private).

| Directory | Purpose |
| --- | --- |
| `skills/marinara-engine-authoring/` | Complete Marinara Engine authoring skill, references, scripts, and templates |
| `skills/marinara-world-maps/` | Complete hierarchical world map skill, tools, templates, and regression tests |
| `projects/nevermore/source/` | Original map and lorebook, authored lore, location index, art prompts, and change manifest |
| `projects/nevermore/art/` | New reference artwork and the Jericho Woods background |
| `projects/nevermore/releases/v2/` | Latest importable Nevermore map, handoff, checksums, and original verification reports |
| `projects/nevermore/toolkit/` | Frozen map assembly tools for this release |
| `projects/intoxication-voice-keeper/` | Custom Agent that tracks intoxication and keeps each character's voice while drunk or high |
| `projects/character-voice-keeper/` | Custom Agent that profiles each character's voice, catches drift and keeps every character sounding like themselves |
| `projects/modern-life-sim-cheats/` | Personal Cheats module and patch script for an installed Modern Life Sim |
| `scripts/` | Repository validation and initial GitHub publishing |
| `docs/` | Provenance and repository decisions |

Start with the [Nevermore project guide](projects/nevermore/README.md) or either
skill's `SKILL.md`. Keep future projects under `projects/<short-name>/`; keep
reusable skills under `skills/<skill-name>/`. Add directories when they have content.

## Get started

Use Git, Git LFS, Python 3.10+, and Node.js 24. For an existing remote:

```bash
git lfs install
git clone https://github.com/dkylepeppers-alt/skills-and-projects.git
cd skills-and-projects
git lfs pull
python3 scripts/validate.py
```

The URL becomes available after initial publication. If using the prepared ZIP,
extract it, enter `skills-and-projects`, authenticate GitHub CLI with `gh auth login`,
and run `bash scripts/publish-github.sh`. The script creates a **private** repository
and pushes the initial commit and LFS objects. See [publishing](docs/publishing.md).

## Working conventions

- Use `main` for reviewed work and short branches such as `nevermore/woodland-paths`.
- Edit project source, rebuild into the ignored `build/` folder, and validate before releasing.
- Treat published version folders as snapshots; put a later release in a new version folder.
- Preserve skill directories as self-contained packages, including their references and assets.
- Keep large maps and artwork in Git LFS. Keep ordinary JSON, scripts, and Markdown in Git for useful diffs.
- Keep credentials and runtime caches out of commits. No deployment or public publishing runs automatically.

CI runs existing map-tool regressions, JSON parsing, release integrity, and map
structural checks. It does not prove a live Marinara import. Full source-contract
checks require the external Engine and Agents checkouts documented in the project.

This private collection does not grant a new license to upstream code, supplied
lore, franchise material, or artwork. Preserve their provenance and existing notices.

## Why this structure

Source, reusable tools, and versioned outputs have separate roles. Large assets
use [Git LFS](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage),
so ordinary Git history stores pointers rather than successive image-heavy blobs.
Workflow actions use immutable commit pins, as recommended in
[GitHub's workflow security guidance](https://docs.github.com/en/actions/reference/security/secure-use).
Dependabot checks action updates weekly.
