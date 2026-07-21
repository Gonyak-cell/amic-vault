# Runtime DB and queue construction inventory

Source: `DEVOPS-OSS01-DBA-TUW-001`, scanned from `apps/api/src` and
`tools/db` at the committed source-map baseline.

## Locked baseline

| Constructor | Total | Runtime | CLI only | Unclassified runtime |
|---|---:|---:|---:|---:|
| `Pool` | 44 | 40 | 4 | 0 |
| `PgBoss` | 19 | 19 | 0 | 0 |

The original proposed count (`Pool=43`, `PgBoss=19`) is superseded by the
TypeScript-AST result: the implemented scanner resolves aliases, namespace
imports and locally-bound dynamic `pg-boss` imports while excluding comments,
strings and type-only imports. Its immutable inventory digest is
`sha256:473f6f27c1b72ad0bc28c402d4b22917a561391f8c071de9fec9a44fd89a09eb`.

## Frozen migration batches

| Batch | Sites | Scope |
|---|---:|---|
| `DBA` | 1 | existing common guard/db authority candidate |
| `DBM` | 27 | audit, tenant, permission, auth, matter, document, storage and search authority |
| `DBR` | 13 | remaining records, DLP, enterprise, scale, AI and scheduler services |
| `QUE` | 18 | runtime `PgBoss` queue constructors |
| `CLI_EXCEPTION` | 4 | app/tools and `tools/db` constructors; never silently treated as runtime |

Every record carries its path, line, constructor, process role, owner,
connection-environment reference, tenant-GUC/audit/lifecycle classification and
one migration batch. The exact safe reports are generated only from the
committed source by:

```bash
node tools/quality/check-database-authority.mjs \
  --out artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS01-01/DEVOPS-OSS01-DBA-TUW-001
```

The checker compares all constructor counts and the full ordered inventory hash
to `security/oss-source-map.yml`; a new direct constructor, path/line drift or
an unclassified runtime site fails. This is an L0 authority inventory—not an
authorization to retain a direct pool forever, adopt upstream code, change a
database role, or bypass tenant/audit controls.
