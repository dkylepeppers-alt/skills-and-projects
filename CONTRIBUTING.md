# Making changes

1. Create a short branch from `main` for one task.
2. Edit the relevant skill or project source. Describe any change to stable IDs, lore bindings, route gates, or art.
3. Run `python3 scripts/validate.py`. For Nevermore source changes, follow the project build instructions and review the rebuilt map.
4. Commit related source, documentation, and deliberately selected release outputs together. Inspect `git diff --cached` and `git lfs ls-files` first.
5. Open a pull request explaining the problem, resulting behavior, and verification. Merge after reviewing the change and its checks.

For a new release, add `projects/<project>/releases/<version>/`, a handoff, and
checksums. Preserve earlier release folders. Update the project guide's latest
release pointer and version-specific validation expectations deliberately.

When introducing an installable dependency, record its version in the project's
dependency file and use the appropriate lockfile if its ecosystem supports one.
Do not add root dependencies for a project that can manage its own.
