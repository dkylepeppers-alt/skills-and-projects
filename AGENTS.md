# Repository instructions

- Read the relevant project README and skill SKILL.md before changing their files.
- Store reusable skills in `skills/` and project-specific work in `projects/`.
- Preserve source IDs, lore bindings, artwork, and authored content unless the requested change requires an edit.
- Never silently regenerate art, alter crypt progression, or replace source lore during repository maintenance.
- `projects/nevermore/toolkit/` is a release-specific snapshot, not the active shared skill. Upgrading it is an explicit project change.
- Build into ignored `build/` folders. Do not overwrite an archived release; create a new version and record checksums.
- Run `python3 scripts/validate.py` for relevant changes. Source-contract checks require external checkouts; report that limitation honestly when unavailable.
- Validation reports in release folders describe the recorded release. Do not rewrite them to imply new verification.
- Use Git LFS for the paths in `.gitattributes`; do not commit literal large image/map blobs to ordinary Git history.
- Do not include credentials, installed dependencies, temporary logs, or copied upstream repositories.
- Do not introduce a blanket license for third-party materials.
- Never force-push, delete remote work, make the repository public, or merge a pull request without the user's authorization.
