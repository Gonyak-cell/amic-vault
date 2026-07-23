# PACK-SF20-01 — Private gateway mTLS and durable replay boundary

Status: canonical post-R14 extension under
`USER-UMBRELLA-AUTONOMY-20260721` and the owner's all-immediate-track execution
direction. This is the canonical form of `PROPOSED-PACK-SF20-01`, based on
merged `origin/main`
`bf3c7cb72c715d0246f3b0b4c305d5499827c4ae`.

## Objective and authority

Turn the already selected `private-gateway-mtls` profile into an enforceable
runtime boundary for a single-node, maximum-20-user deployment:

```text
API and API-worker
  -> standard Node TLS client with short-lived request binding
  -> digest-pinned NGINX with client-certificate verification
  -> fixed gateway subject/audience headers
  -> private worker-only network
  -> ingestion middleware
  -> durable one-use nonce hash
  -> existing bounded route/storage/parser behavior
```

The gateway authenticates workload transport only. It does not decide Matter
permission, ethical-wall access, tenant scope, document state, audit outcome,
storage authority, parser result, or promotion. Existing constitutional
authority remains unchanged.

Only NGINX's approved L1 image/configuration surface is reused. Pinned NGINX
and nginx-tests source is L0 no-copy reference material in the detached source
lab. The Node transport, request binding, replay store, network checker,
fixtures, and integration gate are independently written Vault code.

## Pack-wide invariants

1. Production cannot construct a loopback, plaintext HTTP, caller-selected, or
   direct-worker ingestion route.
2. Every API-side ingestion caller uses the same fixed-path transport:
   extraction/OCR/supplemental extraction, file-security scan, preview
   conversion, and email parsing.
3. Client CA/certificate/key values are file paths only. No PEM, key, password,
   certificate body, file path, request body, tenant/document/object ID, or raw
   nonce may appear in logs, errors, audit, or evidence.
4. The client validates the gateway server certificate and hostname, requires
   TLS 1.2 or 1.3, presents the exact API client certificate, and rereads
   credential files per request so mounted rotation takes effect without a
   process restart.
5. NGINX verifies the approved CA and exact subject `CN=amic-vault-api`, clears
   the development marker, and overwrites—not appends or trusts—verified,
   subject, and audience headers.
6. Only NGINX and ingestion share the worker network. API/API-worker share only
   the gateway client network. Neither gateway nor worker publishes a
   production host port.
7. The private worker profile requires an absolute durable nonce-store path.
   SQLite contains only a SHA-256 nonce digest and integer expiry, has a fixed
   row cap, consumes atomically, prunes expired rows, and never falls back to
   memory on error.
8. Development compose remains development-only and retains its explicit
   loopback profile. Production rejects that profile before serving work.
9. Tests generate CA/certificates/private keys in a disposable directory at
   runtime. No key fixture or customer data is committed.
10. No dependency/lockfile, database schema, queue, permission, audit,
    immutable-original, storage-key, external-share, cloud, release, or
    `docs/package/**` change is allowed.

## Ordered TUWs

| Order | ID                       | Risk / size | Depends on | Result |
| ----: | ------------------------ | ----------- | ---------- | ------ |
| 1 | `DEVOPS-SF20-GW-TUW-001` | C / L | `DEVOPS-SF20-GATE-TUW-004` | shared real Node mTLS transport |
| 2 | `DEVOPS-SF20-GW-TUW-002` | C / L | GW-001 | NGINX certificate and header boundary |
| 3 | `DEVOPS-SF20-GW-TUW-003` | C / M | GW-002 | gateway-only worker network |
| 4 | `DEVOPS-SF20-GW-TUW-004` | H / M | GW-003 | durable bounded nonce store |
| 5 | `DEVOPS-SF20-GW-TUW-005` | C / L | GW-001 through GW-004 | real topology gate |

## `DEVOPS-SF20-GW-TUW-001`

**Title:** Shared API private gateway mTLS transport
**Release/module:** R14 / DEVOPS-SF20-GW
**Risk/size:** C / L
**Objective:** Every fixed API/API-worker ingestion call presents a valid
client certificate to the configured private gateway through one
standard-library Node HTTPS transport.

### Files

- **Create:**
  `apps/api/src/modules/document/extraction/private-gateway.transport.ts`,
  its colocated spec.
- **Modify:** worker identity adapter/spec, extraction dispatcher/spec,
  ingestion request factory only if required for shared header construction,
  file-security service/spec, preview conversion job/spec, email worker parser
  client/spec, `.env.example`, the L0 path declaration in
  `security/oss-adoption-decisions.yml`.
- **NOT modify:** endpoint paths from request input; ingestion envelope
  storage fields; PermissionService; AuditService; storage adapter; parser;
  dependency manifests/locks; custom signature/encryption code.

### Implementation

- Keep the route set closed and compiled into source. Accept no absolute URL,
  host, scheme, query, or path from a job/request payload.
- Reuse `createWorkerIdentityAdapter`. Complete or reuse one helper that
  creates UUID request/nonce and five-minute expiry headers. The private client
  must never fabricate gateway-verified subject/audience headers.
- In `loopback-dev`, retain native `fetch` and the explicit development marker.
  The existing production rejection remains authoritative.
- In `private-gateway-mtls`, reject before I/O unless the base URL is
  non-loopback HTTPS and all CA/client certificate/client key/server-name
  file settings are present and bounded.
- Use `node:https`, `node:tls`, `node:fs`, and Web `Request`/`Response` only.
  Require server verification and TLS 1.2 minimum. Read mounted PEM files on
  each call. Convert transport/configuration failures to bounded stable errors
  without including causes or paths.
- Preserve AbortSignal behavior, multipart boundaries, JSON headers, response
  status/headers/body streaming, and each caller's existing timeout/result
  semantics.

### Verification (AND)

- Valid CA/server/client material reaches a real local TLS server and preserves
  JSON plus multipart bodies.
- HTTP, all IPv4/IPv6 loopback forms, missing files, oversized files, malformed
  PEM, wrong-subject client certificate, expired client certificate,
  certificate/key mismatch, untrusted server, and hostname mismatch fail
  closed.
- An aborted request terminates promptly with no retry or plaintext fallback.
- Replacing mounted client cert/key files makes the next request use the new
  pair without recreating the transport/process.
- Extraction, scan, preview, and email tests prove no private-profile caller
  invokes global plain `fetch`.
- Canary secret/path/body values are absent from thrown messages and captured
  logs.

### Done / stop

Done when all fixed callers share the transport and production cannot create a
plain route. Stop if a dependency, custom crypto, inline secret, client-selected
URL, unbounded buffering regression, or private-profile global fetch is needed.

## `DEVOPS-SF20-GW-TUW-002`

**Title:** NGINX mTLS subject and identity header sanitation
**Release/module:** R14 / DEVOPS-SF20-GW
**Risk/size:** C / L
**Objective:** The digest-pinned NGINX gateway accepts only the approved API
client identity and is the sole producer of worker workload identity headers.

### Files

- **Create:** `infra/ingestion-gateway/nginx.conf` and a bounded synthetic
  identity-policy fixture under `tests/fixtures/ingestion-gateway/`.
- **Modify:** `infra/production/compose.yml` and direct gateway/network tests.
- **NOT modify:** upstream source/test; committed certificate/key; wildcard
  subject map; public listener; application permission/audit logic.

### Implementation

- Use exactly the NGINX artifact pinned in `security/oss-source-map.yml`.
- Mount server certificate/key and approved client CA as runtime secret files.
- Enable `ssl_verify_client on`, bounded verify depth, TLS 1.2/1.3 only, and
  exact string equality for `CN=amic-vault-api`.
- Forward only to the fixed `ingestion:8000` upstream.
- Clear `X-Amic-Dev-Loopback-Identity`; overwrite
  `X-Amic-Gateway-Mtls-Verified=true`,
  `X-Amic-Gateway-Workload-Subject=amic-vault-api`, and
  `X-Amic-Gateway-Audience=amic-vault-ingestion`.
- Keep access logging off for request metadata and use bounded error logging.

### Verification (AND)

- `nginx -t` passes in the pinned image.
- Approved CA/exact client subject reaches the worker.
- No certificate, another CA, expired certificate, and approved-CA but wrong
  subject cannot reach the worker route.
- Caller-supplied verified/subject/audience/development headers are replaced or
  cleared; duplicate headers do not survive.
- TLS 1.0/1.1 fail while TLS 1.2/1.3 are the only configured versions.

### Done / stop

Done when worker-visible gateway identity is derived only from the verified
client certificate path. Stop on wildcard subject, caller-header trust,
upstream copy, unpinned image, public port, or private key fixture.

## `DEVOPS-SF20-GW-TUW-003`

**Title:** Gateway-only worker network topology
**Release/module:** R14 / DEVOPS-SF20-GW
**Risk/size:** C / M
**Objective:** The ingestion worker is reachable only from NGINX on an
internal worker network and has no host/public/API direct route.

### Files

- **Create:** `infra/policies/ingestion-network-policy.yml`,
  `tools/security/check-ingestion-network.mjs`, and its direct spec.
- **Modify:** `infra/production/compose.yml`,
  `security/oss-adoption-decisions.yml` L0 path declarations.
- **NOT modify:** development compose semantics; Kubernetes manifests;
  firewall/cloud resources; worker health/auth behavior.

### Implementation

- Make the production compose file machine-parseable and declare a client
  network plus `internal: true` worker network.
- API and API-worker join the client network, NGINX joins both, and ingestion
  joins only the worker network.
- Do not use host networking, extra hosts, links, worker `ports`, or a public
  gateway `ports` entry. A test-only override may expose gateway TLS on
  loopback and must never be part of the production file.
- Cross-check the production manifest against a closed machine-readable policy.

### Verification (AND)

- Static checker passes the exact production graph.
- Canary mutations for worker port, gateway port, API worker-network
  membership, worker client-network membership, non-internal worker network,
  host mode, extra host, and link each fail.
- Runtime: gateway reaches worker; an API-network probe cannot resolve/connect
  to worker; `docker compose port ingestion 8000` and gateway port lookup expose
  nothing; health is therefore not host/public reachable.
- Development compose remains explicit `loopback-dev` with loopback-only port.

### Done / stop

Done when application header spoofing cannot create a network path to the
worker. Stop if the only proof is a header test, if production publishes a
port, or if an unapproved orchestrator/firewall is required.

## `DEVOPS-SF20-GW-TUW-004`

**Title:** Bounded durable single-node nonce replay store
**Release/module:** R14 / DEVOPS-SF20-GW
**Risk/size:** H / M
**Objective:** The one-worker profile rejects a duplicate nonce across process
restart while retaining only a bounded digest and expiry.

### Files

- **Create:** `workers/ingestion/app/replay_store.py` and direct tests.
- **Modify:** `workers/ingestion/app/service_identity.py`,
  `workers/ingestion/app/main.py`, `workers/ingestion/app/extract_router.py`,
  gateway-enforcement/service-identity tests, production compose, L0 path
  declaration.
- **NOT modify:** worker route result contracts; Redis/package dependencies;
  database schema; nonce raw logging/evidence; memory fallback in private mode.

### Implementation

- Use Python `sqlite3`, `hashlib`, `pathlib`, and locking primitives only.
- The private profile requires an absolute
  `INGESTION_NONCE_STORE_PATH`; development uses the existing process-local
  memory store.
- Initialize and probe the database before private work is accepted. Store one
  table with `nonce_hash` primary key and integer `expires_at`; use no
  tenant/document/object/request columns.
- For each consume: `BEGIN IMMEDIATE`, prune expired rows, enforce a fixed
  maximum live-row count, `INSERT OR IGNORE`, commit only on first use. Lock,
  I/O, schema, corruption, permission, or capacity errors propagate and the
  identity verifier maps them to the same safe denial.
- Use a dedicated persistent compose volume and a non-secret path.
- The extraction route may only reuse middleware-verified identity; it may not
  create a second independent replay store.

### Verification (AND)

- First consume true, duplicate false, restart/new instance duplicate false.
- Concurrent consumers produce exactly one true result.
- Expired rows are pruned and a bounded table never exceeds its cap.
- Locked, corrupt, unwritable, invalid-relative-path, missing-parent, and wrong
  schema cases fail closed.
- SQLite inspection proves persisted application columns contain exactly
  64-character hashes and integer expiry; raw nonce and domain IDs are absent.
- Private startup without a usable path fails; production loopback fails;
  development retains the in-memory test path.

### Done / stop

Done when the total success count for one nonce remains one before and after
worker restart. Stop on fail-open fallback, raw nonce/domain persistence,
Redis/new dependency, or a multi-replica claim. Two ingestion replicas are an
explicit future shared-authority trigger.

## `DEVOPS-SF20-GW-TUW-005`

**Title:** Private gateway rotation, replay, and direct-access runtime gate
**Release/module:** R14 / DEVOPS-SF20-GW
**Risk/size:** C / L
**Objective:** A real API-image client, pinned NGINX, worker, TLS handshake,
network graph, and durable store jointly prove the private gateway contract.

### Files

- **Create:** `tests/integration/document-access/ingestion-gateway.spec.ts`;
  a reusable probe helper under `tools/security/` only if needed.
- **Modify:** CI only if the existing full integration job does not already
  execute the new canonical suite.
- **NOT modify:** committed keys/certs; production port mapping; skip/quarantine
  configuration; cloud/staging resources; application permission/audit paths.

### Implementation

- Generate a disposable CA, server certificate with the service DNS SAN, old
  and new valid exact-subject client certificates, wrong-subject certificate,
  untrusted certificate, and expired certificate at runtime using the host
  OpenSSL tool.
- Launch the production compose gateway/worker graph under a unique project
  name plus a test-only API-network probe container. Never publish the worker
  or edit the production topology for the test.
- Use the built API transport from the probe container for valid and rotation
  cases. Use bounded raw TLS probes only for negative handshake cases that the
  client preflight intentionally rejects.
- Treat worker route validation failure after middleware as an identity success
  control. Reuse the exact binding for replay proof, restart the worker, and
  prove the same binding remains denied.
- Always remove the project containers/network/anonymous test resources and
  disposable certificate directory.

### Verification (AND)

1. Valid old client binding reaches route validation.
2. Missing, untrusted, expired, and wrong-subject client identities do not
   reach route validation.
3. Spoofed verified/subject/audience headers are overwritten; the valid binding
   reaches route validation with fixed gateway identity.
4. Wrong subject/audience sent from the actual gateway network is denied by
   worker identity verification.
5. Exact replay is denied before and after worker restart; a fresh binding
   immediately succeeds.
6. Old/new exact-subject certificates both work during the synthetic overlap;
   unit proof confirms mounted file reload in one client process.
7. API-network direct worker access and host port discovery fail; gateway
   reaches worker.
8. Production loopback profile fails its startup assertion.
9. Full API, worker, security checker, integration, profile, source-map,
   reuse-first, backlog, frozen-doc, lint, typecheck, test, and build regressions
   remain green.

### Done / stop

Done only with real TLS and runtime network evidence. Unit mocks alone, a
published worker, a persisted key fixture, a skipped negative, or cleanup that
leaves project resources is a Gate failure.

## PACK verification

At minimum:

```bash
pnpm install --frozen-lockfile
pnpm exec vitest run \
  apps/api/src/modules/document/extraction/private-gateway.transport.spec.ts \
  apps/api/src/modules/document/extraction/worker-identity.adapters.spec.ts \
  apps/api/src/modules/document/extraction/extraction-dispatcher.spec.ts \
  apps/api/src/modules/file-security/file-security.service.spec.ts \
  apps/api/src/modules/preview/preview-convert.job.spec.ts \
  apps/api/src/modules/email/email-worker-parser.client.spec.ts
uv run --project workers/ingestion --extra test pytest \
  workers/ingestion/tests/test_replay_store.py \
  workers/ingestion/tests/test_service_identity.py \
  workers/ingestion/tests/test_gateway_enforcement.py
node --test tools/security/check-ingestion-network.spec.mjs
node tools/security/check-ingestion-network.mjs
docker compose -f infra/production/compose.yml config
pnpm test:integration -- document-access/ingestion-gateway.spec.ts
node tools/quality/check-small-firm-profile.mjs --static
node tools/oss/check-reuse-first.mjs --base origin/main --head HEAD
pnpm backlog:validate
pnpm docs:frozen
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The complete standard database round trip and full integration suite remain
required before PR merge because this Risk=C PACK participates in the existing
application build even though it adds no database migration.

## Evidence

Each TUW writes one bounded synthetic JSON manifest under
`artifacts/enterprise-dms-oss/<implementation-sha>/PACK-SF20-01/<tuw>/`.
Permitted fields are exact source/tree/image identity, source and implementation
SHA, file lists, bounded case counts/statuses, topology service/network names,
and sanitized deterministic hashes. Certificates, keys, raw nonce, paths to
secret files, request bodies, tenant/document/object identifiers, host
addresses, and customer data are forbidden.

Local evidence does not claim CI, merge, deployment, release, or go-live.
