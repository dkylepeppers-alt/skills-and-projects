# Initial GitHub publication

Target: **dkylepeppers-alt/skills-and-projects**, private, default branch `main`.

The ChatGPT GitHub connection available during preparation could identify the
account and read repositories, but exposed no repository-creation action. No
remote repository or remote commit was created during preparation.

The prepared ZIP includes the complete working files, including actual LFS
assets. It excludes `.git`, dependencies, and temporary build outputs. To create
and upload the repository from an authenticated local shell:

```bash
gh auth login
bash scripts/publish-github.sh
```

Run the script from the extracted repository, with Git, Git LFS, GitHub CLI,
Node.js 24, and Python 3.10+ installed. If Git asks for author information, set
your chosen `git config user.name` and `git config user.email` locally before
running it again. Authentication stays with GitHub CLI; do not put a token in a file.

The script validates, initializes `main` if needed, installs the local LFS hook,
commits the files, creates the private remote, and pushes. It will stop if an
unrelated remote already exists. It does not force-push or overwrite a remote.
If the target repository already exists, it verifies the identity and privacy
before adding that remote. An existing nonempty remote may reject the push;
inspect and reconcile its history before retrying.

After successful publication, use normal `git pull`, branches, commits, and
`git push` for further work. GitHub Actions will run the repository validator.
Consider a rule requiring the `validate` check on pull requests; no server-side
rules, billing changes, or visibility changes were applied during preparation.

Git LFS uploads assets separately from Git commits. Wait for the push to finish;
do not publish only the pointer files. Future map versions and artwork use your
account's LFS storage and bandwidth allocation.
