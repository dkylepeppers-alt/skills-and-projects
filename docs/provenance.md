# Imported material and repository changes

The two installed skills were copied in full with their original content. Their
initial per-file SHA-256 values are recorded in `initial-skill-checksums.json`.
This inventory is a provenance baseline, not a restriction on future skill edits.

Nevermore v2 and its recorded reports were copied from the completed project.
The archived map is byte-for-byte unchanged. Its original uploaded map and source
lorebook are preserved under `projects/nevermore/source/`.

Repository-specific additions are the root conventions, Git LFS configuration,
validation workflow, publishing helper, project build wrapper, and documentation.
The project rebuild script now reports a missing source lorebook instead of using
an obsolete external workspace fallback. The source check accepts an explicit
checkout directory instead of a session-specific absolute path.

The four files in `projects/nevermore/toolkit/` are the frozen tools used by this
release. Keep them with the project to support future reproduction even when the
shared world map skill evolves. The Engine and Agents reference repositories and
installed dependencies remain external.

Original release reports and handoff preserve their historical paths. Those paths
identify the original verification run and are not instructions to recreate that
workspace. Use the project README for current build paths. The archive hash proves
release integrity; it does not prove a live Marinara app import.
