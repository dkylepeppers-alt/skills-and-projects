# Modern Life Sim: local Android authentication repair

Modern Life Sim 0.3.2 is active but its internal Engine requests return `401:
Android local authentication required` on the APK-managed Termux installation.
Its bridge supplies only `X-Admin-Secret`, so personas, cards and connections fail.

The original authored source lives outside the public Agents repository. This
local build transform targets the exact released server bundle SHA-256, changes
only its shared Engine-request header helper and two call sites, and regenerates
the manifest's server hash and byte count. It refuses any other bundle. It does
not change the upstream catalog, package version, UI, saves, or Engine source.

The Android secret is sent only to HTTP(S) loopback URLs on the configured Engine
port, without URL credentials. Both fetch call sites reject redirects. Remote
and other-port targets receive no Android secret. Existing admin headers remain
supported. Android authentication stays enabled for ordinary clients.

## Rebuild and check

Use Node.js 22 or newer. `PACKAGE` is the original 0.3.2 package directory (or
the rollback copy after installation).

```bash
node source/android-auth.regression.mjs --baseline # expected 401 !== 200 failure
LIFE_SIM_BUNDLE="$PACKAGE/server.mjs" node --experimental-vm-modules source/android-auth.regression.mjs
node source/build-patch.mjs "$PACKAGE" build/android-auth
node --check build/android-auth/server.mjs
```

Installation must stop Marinara first, preserve the original package and its
registry entry, install the generated server and manifest, and copy the generated
manifest into **only** the `modern-life-sim` entry in `installed.json`. Restart and
verify `/api/modern-life-sim/resources` with authenticated requests. Hash checking
remains enabled. Do not edit runtime snapshots or reinstall the catalog's broken
0.3.2 over this repair. A future official update may replace the local patch.

Rollback: with Marinara stopped, restore the original server, manifest, and
the saved Life Sim registry entry, preserving other installed packages; restart.
Keep rollback files outside Git because they include runtime metadata.

Provenance: original package from `Pasta-Devs/Marinara-Agents`, staging package
0.3.2; original server SHA-256
`d5672272a8267f205537f524a3ab2d52cc0531f4567ea624c06de1e67f95c890`.
The upstream builder documents that its committed Life Sim bundles are supplied
prebuilt from an external source tree. No upstream bundles are committed here.

## Verified installation, 2026-11-07 UTC

- Original bridge regression failed with `401 !== 200`; rebuilt bridge passed.
- Destination restrictions, invalid secrets, legacy headers, and redirect rejection passed.
- Rebuilt bundle parsed successfully; the private repository validator passed
  all 14 existing regressions and release-integrity checks (with its existing
  Nevermore authoring warnings).
- After restart, authenticated Life Sim `/health` and `/resources` returned 200.
  Resources contained 28 personas, 83 cards, 16 connections, five image connections,
  ten style profiles, and zero problems. Before the repair, personas, cards, and
  connections were empty and three problems were reported.
- An unauthenticated Engine personas request still returned 401.
- Patched server SHA-256:
  `4cfbe2e9f0f78a6cfef3129a1260761b278c95d3880ff9583dafbe7ddea377e0`.
- Rollback directory on the device:
  `/data/data/com.termux/files/home/backups/modern-life-sim-android-auth-20261107-012638`.

This verifies the live resource-loading boundary, not browser rendering or a
complete model-generated gameplay session. No gameplay or save format changed.
