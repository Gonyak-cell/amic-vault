# T6 prerequisite: retained GIF and WebP validation

Base: `ccc1e9d83774fbd61c53c68aa605b767af9c5114`. This receipt covers the
four validator source/test files in the associated commit, not generic copy
storage, publication, provider integration or production acceptance.

The existing extension and MIME validators now admit GIF and WebP by default.
Configured extension allow-lists remain authoritative. GIF signature, dimensions
and header bounds are checked. WebP RIFF size, first image/container header,
chunk bounds and frame signature are checked. Wrong declarations, renamed files,
truncated headers and damaged container fields fail. The existing migration-only
JPEG/PNG mismatch exception does not expand to these new formats. This is MIME
validation, not full image decoding or malware scanning; upload scan policy is
unchanged.

WebP format reference: [Google container specification](https://developers.google.com/speed/webp/docs/riff_container).

All commands ran with Node 22.22.3 and pnpm 9.15.9 through the resource guard,
in `/Users/jws/.codex/worktrees/amic-vault-web-preservation-20260920`, with one
runner and run-owned temporary directories. No credentials or real files were used.

```text
pnpm --filter @amic-vault/api... install --frozen-lockfile
  exit 0; 329 cached packages; 0 downloaded; lockfile unchanged; 1.73 seconds.

pnpm --filter @amic-vault/api exec vitest run \
  src/modules/document/validators/file-extension.validator.spec.ts \
  src/modules/document/validators/mime-type.validator.spec.ts --maxWorkers=1 --minWorkers=1
  exit 0; 2 files passed; 13 tests passed; 0 failed; 0 skipped; 2.37 seconds.

pnpm exec eslint \
  apps/api/src/modules/document/validators/file-extension.validator.ts \
  apps/api/src/modules/document/validators/file-extension.validator.spec.ts \
  apps/api/src/modules/document/validators/mime-type.validator.ts \
  apps/api/src/modules/document/validators/mime-type.validator.spec.ts
  exit 0; 1.57 seconds.
```

Guard postflight: `ok: true`, `active_heavy_processes: []`, no history scan or
resource failures, 246.90 GiB free. Every command removed its owned temporary root.
The runner lease was returned to the OS fixture worker after these checks.

Remaining T6 work includes generic source/snapshot binding, hidden durable drafts,
explicit commit, 13-format HTTP/PostgreSQL/storage evidence and the OS adapter.
