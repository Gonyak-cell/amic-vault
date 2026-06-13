# Local Synthetic UAT Walkthrough

Status: READY - LOCAL SYNTHETIC DATA ONLY

This walkthrough is for local verification with seeded development data. It is
not customer UAT acceptance and must not be used as production approval.

## Local Services

| Service | URL |
|---|---|
| Web | `http://localhost:3000` |
| API | `http://localhost:3001/v1` |
| API live health | `http://localhost:3001/v1/health/live` |
| API ready health | `http://localhost:3001/v1/health/ready` |
| Ingestion worker | `http://localhost:8000` |
| MinIO API | `http://localhost:9000` |
| MinIO console | `http://localhost:9001` |

For local UI access, prefer:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/v1 pnpm --filter @amic-vault/web exec next start -H 0.0.0.0 -p 3000
```

Do not run `node apps/web/.next/standalone/apps/web/server.js` directly unless
`.next/static` and `public` have been copied into the standalone tree. The web
Dockerfile performs that copy for container builds.

## Seed Users

Use only the development fixture credentials in
`tests/fixtures/seed/users.json`.

Primary local smoke user:

- Tenant ID: `11111111-1111-4111-8111-111111111111`
- Email: `alpha-firm-admin@test.local`
- Password: fixture development password from `tests/fixtures/seed/users.json`

Negative-role local smoke user:

- Tenant ID: `22222222-2222-4222-8222-222222222222`
- Email: `beta-member@test.local`
- Password: fixture development password from `tests/fixtures/seed/users.json`

## Walkthrough

| Step | Route or Command | Expected |
|---|---|---|
| 1 | `pnpm launch:readiness` | Launch readiness artifacts verified. |
| 2 | `pnpm launch:execution` | Launch execution artifacts verified. |
| 3 | `pnpm release:smoke -- --dry-run` | SMOKE-001 through SMOKE-011 are planned without touching a network target. |
| 4 | `pnpm release:smoke -- --local` | Local Web/API smoke checks pass with synthetic seed users. |
| 5 | Open `/login` | AMIC Vault login renders with Korean default and English toggle. |
| 6 | Login as the primary local smoke user | Browser reaches `/dashboard`. |
| 7 | Open `/dashboard`, `/search`, `/scale`, `/launch` | Protected app shell renders. |
| 8 | Call `/v1/tenant/settings` with the session cookie | Tenant-scoped response for Tenant Alpha. |
| 9 | Call `/v1/tenant/settings` as the negative-role user | Safe denial with `PERMISSION_DENIED` or `AUTH_REQUIRED`. |
| 10 | Call `/v1/audit-events?limit=1` as firm admin | Audit list returns reference-only event metadata. |

## Evidence Rules

- Local screenshots may be used for development confidence only.
- Do not commit session cookies, private endpoints, real customer data, or raw
  document text.
- Local smoke pass does not resolve LRB-001 through LRB-014.
