---
name: updating-installed-office
description: Use when completing changes to Oficina nter source code, assets, build scripts, or dependencies, or when its installed Windows application is older than the verified source.
---

# Updating installed office

The deliverable is the installed application, not just `dist` or a development window.

## Recipe

1. Finish the requested changes and exercise the changed behavior visually or through a real smoke command. Fix failures before deployment.
2. From the repository root, run:
   ```powershell
   & '.\.superpowers\tools\bun-windows-x64\bun.exe' run update:installed
   ```
   This command runs tests, type checking, compilation and packaging before closing only this project's office windows. It updates the existing user installation and reopens it. It does not restart omp sessions or remove preferences/history.
3. Observe the reopened installed office. Report the exercised behavior and any verification limit. Completion requires the updater's successful installed SHA256 check and confirmed published launcher path/PID.

## Quick reference

- `update:installed -- --dry-run`: resolve the destination without changing it.
- Validation failure: fix it, then rerun the command; the previous installation remains untouched before deployment.
- Installer/reopening failure: report the exact failure and recover the office before declaring completion.

## Common mistakes

A passing build or a reopened `electron .` is not an updated installation. Restart once per verified change set, not on every saved file. Keep the existing installation location; preserve all agent sessions and user data.
