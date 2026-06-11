# AMIC Vault Package Transfer

Transfer date: 2026-06-11

This directory is the normative package copy for AMIC Vault implementation work. The package is read-only after PACK-R0-01. If files under this directory need to change later, record the decision in `docs/ledger/decision.md` and update the frozen-package manifest through an approved process.

## Priority

1. `docs/package/codex/00_Master_Brief.md`
2. Other files under `docs/package/codex/`
3. Source package files under `docs/package/*.md`

If package files conflict with code, generated docs, or local notes, the package files above control. If package files conflict with each other, `00_Master_Brief.md` controls.

## Scope

- Source vault package: 21 Markdown files copied to `docs/package/*.md`
- Codex package: Markdown files, `data/`, and `diagrams/` copied to `docs/package/codex/`
- DOCX originals are not copied into this repository.
- Repository agent instructions are copied from `docs/package/codex/90_AGENTS_TEMPLATE.md` to root `AGENTS.md`.

## Frozen Check

Checksums are stored in `docs/package/.frozen-manifest.json`.

Run:

```bash
node infra/ci/scripts/check-docs-package-frozen.mjs
```

To regenerate the manifest, use only the approved PACK-R0-01 or later human-approved package update path:

```bash
node infra/ci/scripts/check-docs-package-frozen.mjs --write
```
