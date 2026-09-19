# PostgreSQL executable discovery for automatic CI

Automatic PR CI at companion source `103c6a59a37dbe27073986dda975c1d5be0b28e5`
failed in the new controller suite before its assertions because `initdb` was not
on the runner PATH. Run `35469484245`, job `105967719869`, reported
`spawn initdb ENOENT`. The separate db-integration, Docker build and Python worker
jobs passed. This was not a manual workflow dispatch.

The test now resolves `pg_config --bindir` once and uses the same installation for
`initdb`, `pg_ctl start` and `pg_ctl stop`. Only an absent `pg_config` (`ENOENT`)
falls back to PATH. Other discovery failures and missing server executables still
fail the suite; no test is skipped. No runtime service, schema, workflow or
dependency changed.

The worker ran the focused suite through resource_guard with Node 22, a temporary
PATH and one Vitest worker. The parent reviewed the diff and verified the changed
file SHA-256 `8956c46c8e08545dab626dec21660fe3b08c0d8a5fb5da414200e62b2bce9ec0`.

| Observed local environment | Result |
| --- | --- |
| `pg_config` available; `initdb` and `pg_ctl` absent from PATH | 22/22 passed, 6.59 s |
| `pg_config` absent; `initdb` and `pg_ctl` available on PATH | 22/22 passed, 6.29 s |
| API TypeScript noEmit and changed-file ESLint | exit 0 |

The inner command, from `apps/api`, was:

```sh
node ../../node_modules/vitest/vitest.mjs run \
  src/modules/integrations/amic-os-vault-provider/amic-os-vault-editor.controller.spec.ts \
  --maxWorkers=1 --minWorkers=1
node ../../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node ../../node_modules/eslint/bin/eslint.js \
  src/modules/integrations/amic-os-vault-provider/amic-os-vault-editor.controller.spec.ts
```

Both environments started real disposable PostgreSQL and executed the existing
HTTP/scan/promotion assertions. The external scanner verdict and object storage
remain synthetic. The resource guard reported successful exit and temporary-root
removal. An earlier invocation with only `--maxWorkers=1` failed before tests
because Vitest's default minimum worker count conflicted; the two completed runs
above supplied both worker bounds.

Evidence provenance: these results were observed in worker tool outputs and
reported to the integrator; stdout was not redirected to a durable raw log. This
receipt does not invent a raw-log hash or claim the new Ubuntu CI run passed.
Automatic CI on the resulting commit must be checked separately.
