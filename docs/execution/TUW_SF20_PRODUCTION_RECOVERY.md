# PACK-SF20-03 — Single-node production profile and recovery

Status: canonical post-R14 extension under
`USER-UMBRELLA-AUTONOMY-20260721` and the owner's all-immediate-track execution
direction. This is the canonical form of `PROPOSED-PACK-SF20-03`, based on
merged `origin/main`
`321ef450f0540fcda89cd0314676c35ce08ef51b`.

## Objective and authority

Give a maximum-20-user law firm a reproducible, recoverable production
baseline without introducing a high-availability cluster or pretending that
provider resources already exist:

```text
approved domestic-region profile and operator-owned secret files
  -> one hardened application node
  -> immutable-digest web/API/API-worker/gateway/ingestion/ClamAV graph
  -> private managed PostgreSQL 16 and versioned S3-compatible storage
  -> provider PITR receipt + portable database backup + object-version inventory
  -> signed backup-set manifest
  -> isolated database/object readback
  -> residency, RPO/RTO, and rollback readiness verdict
```

The repository owns the provider-neutral contract, deterministic host
configuration, fail-closed runtime secret loading, backup-set schema,
verification tools, tests, and synthetic evidence. It does not create a
cloud account, region, managed database, bucket, key, certificate, DNS record,
private endpoint, firewall rule, backup, or staging environment. Those
deployment inputs remain explicit `EXTERNAL_BLOCKED_*` receipts and do not
block implementation, local verification, review, or merge.

Existing Docker Compose, Node and Python standard libraries, PostgreSQL 16
native backup/restore tooling, the current backup drill, and the pinned
Ansible source are reused. The SF20 baseline deliberately rejects a
self-hosted database and pgBackRest runtime: managed PITR plus a portable
`pg_dump`/`pg_restore` artifact is enough for this scale. The pgBackRest pin
remains a no-copy conditional reference for a later self-managed-database or
measured-native-tooling trigger.

## Pack-wide invariants

1. `docs/package/**`, PermissionService, ethical-wall policy, audit authority,
   immutable-original semantics, document state, database schema, and storage
   key authority remain unchanged.
2. The target is one approved domestic-region application node, managed
   PostgreSQL 16, and managed S3-compatible object storage. Kubernetes,
   service mesh, self-hosted database clusters, public database/object
   endpoints, and fake provider IaC are absent.
3. Region, private endpoint, encryption, versioning/Object Lock, PITR,
   certificate ownership, secret ownership, backup freshness, and RPO/RTO are
   required operator inputs. Source defaults never invent a provider, account,
   hostname, CIDR, key, bucket, certificate, or secret value.
4. Production runtime secrets enter a process only through an absolute
   file/provider-mounted path under the approved secret root. Secret values
   are absent from Compose environment values, command arguments, image
   metadata/history, logs, evidence, and source-controlled files.
5. A missing, empty, oversized, symlinked, non-regular, group/world-readable,
   wrong-owner, dev-default, or direct-environment production secret fails
   startup before a network connection or business action.
6. Public certificates and CA bundles are references, not secrets; private
   keys, database URLs, storage credentials, MFA encryption keys, and session
   secrets retain the stricter file-only contract. Rotation may mount current
   and next material concurrently for an explicit bounded overlap, but may
   not silently fall back to old or development material.
7. The host deployment uses the existing production Compose topology plus an
   immutable-image overlay. Build definitions remain useful for disposable
   local tests, but an approved host may start only the effective image-only,
   digest-pinned model.
8. Ansible is used only as an independently authored declarative host
   orchestrator. No GPL upstream task, role, source, fixture, or test is
   copied into the product tree. The playbook pins the supported Ansible
   release and uses built-in modules only.
9. The application node has no Docker socket mount in an application
   container, no privileged service, host network/PID/IPC mode, host device,
   unbounded writable filesystem, floating image tag, or public worker port.
10. Monitoring runtime services are not activated in this PACK. The host and
    Compose contract reserves the closed extension point implemented by
    `PACK-SF20-04`; this PACK must not pre-claim its metrics or alert Gate.
11. A complete backup set contains a fresh provider PITR receipt, a portable
    PostgreSQL 16 backup with exact byte hash, and a bounded version inventory
    for every selected object. All three share one set ID, capture boundary,
    approved region, and signed canonical manifest.
12. A manifest is complete only after Ed25519 verification with a
    separately supplied signing key reference. Missing, stale, unencrypted,
    mutable, cross-region, hash-mismatched, unsigned, or unsealed input fails
    closed.
13. Restore proof uses a disposable isolated database and exact selected
    object versions. It directly verifies schema hash, RLS and FORCE RLS,
    audit immutability, tenant row counts, cross-tenant denial, object bytes,
    object SHA-256, and subsequent clean behavior. API health alone is not
    proof.
14. The SF20 readiness ceiling is RPO <= 60 minutes and RTO <= 240 minutes.
    A provider operating target may be tighter, but missing or exceeded
    measured values fail readiness rather than being rounded or inferred.
15. Rollback proof returns to an exact previous image digest and the matching
    data authority after bad migration, bad image, unavailable key, restore
    timeout, or object mismatch, then reruns permission, audit, and
    immutable-original regressions.
16. Tests and evidence use generated identifiers, keys, certificates,
    database rows, and object bytes only. Customer data, production
    credentials, endpoints, account identifiers, and content are prohibited.
17. No dependency or lockfile change is authorized. Any missing capability
    that requires one is a stop and follow-on decision.

## Ordered TUWs

| Order | ID | Risk / size | Depends on | Result |
| ----: | -- | ----------- | ---------- | ------ |
| 1 | `DEVOPS-SF20-IAC-TUW-001` | H / M | `DEVOPS-SF20-SBX-TUW-005` | provider-neutral domestic single-node profile |
| 2 | `DEVOPS-SF20-IAC-TUW-002` | H / L | IAC-001 | deterministic image-only Compose and pinned Ansible host |
| 3 | `DEVOPS-SF20-IAC-TUW-003` | C / M | IAC-001, IAC-002 | file-only runtime secret and certificate contract |
| 4 | `DEVOPS-SF20-DR-TUW-001` | C / L | IAC-001, IAC-003 | signed cross-store backup-set manifest |
| 5 | `DEVOPS-SF20-DR-TUW-002` | C / L | DR-001 | isolated database and exact-object restore readback |
| 6 | `DEVOPS-SF20-DR-TUW-003` | C / L | IAC-002, IAC-003, DR-001, DR-002 | residency, measured RPO/RTO, and rollback Gate |

## `DEVOPS-SF20-IAC-TUW-001`

**Title:** Provider-neutral single-node production profile
**Release/module:** R14 / DEVOPS-SF20-IAC
**Risk/size:** H / M
**Objective:** Freeze one machine-readable contract for a domestic-region
application node and private managed PostgreSQL 16/object storage without
encoding a vendor or pretending that external resources exist.

### Files

- **Create:** `infra/production/profile.yml`,
  `tools/security/check-production-profile.mjs`,
  `tools/security/check-production-profile.spec.mjs`,
  `docs/architecture/oss-adoption-decisions/small-firm-production-profile.md`.
- **Modify:** `security/oss-adoption-decisions.yml` only for the explicit
  Ansible/pgBackRest SF20 decisions; the local reuse-first eligibility list
  when required for new Vault-owned paths.
- **NOT modify:** provider account/resource files, Terraform/Pulumi/CDK,
  cloud credentials, database schema, development Compose semantics,
  dependency/lock files, `docs/package/**`.

### Implementation

- Use JSON-compatible YAML with a versioned closed schema so the current
  standard-library tooling can parse it without a YAML dependency.
- Declare capacity `20` users, one app node, PostgreSQL major `16`, managed
  state services, approved-country `KR`, RPO `60`, RTO `240`, encryption,
  PITR, versioning, Object Lock/immutability, TLS, private connectivity, and
  explicit secret/certificate/backup owners.
- Represent the concrete provider, account, region, endpoints, CIDRs, keys,
  bucket, and certificate references as required deployment receipt fields,
  not source defaults.
- Encode prohibited topology explicitly: Kubernetes, service mesh,
  self-hosted database, public database/storage, multi-node failover claim,
  provider resource creation, and unapproved region.
- Record source reuse decisions: Ansible is approved L1 orchestration syntax
  with no copied upstream code; pgBackRest is rejected for the SF20 baseline
  in favor of managed PITR plus PostgreSQL 16 native portable backup.
- Make the checker validate the profile itself and cross-check later
  Compose/secret/Ansible artifacts when present. Unknown fields, versions,
  modes, owners, or readiness claims fail.

### Verification (AND)

- The canonical profile passes and each missing region receipt, private
  endpoint, encryption, PITR, versioning, immutability, owner, RPO/RTO, or
  PostgreSQL-major mutation fails with a bounded code.
- Public endpoint, non-KR country, self-hosted database, Kubernetes, HA claim,
  wildcard host/CIDR, embedded credential, and provider-specific fake resource
  mutation fail.
- Ansible/pgBackRest decisions include exact source pins and no-copy
  boundaries; a runtime pgBackRest service/package or copied GPL source/test
  canary fails.
- `security/small-firm-20-profile.yml` remains 19 outcomes, seven PACKs, and
  33 TUWs, and the SF20 expansion gate remains green.

### Done / stop

Done when one profile expresses every runtime/deployment input without a
vendor dependency and cannot claim external readiness without receipts. Stop
if a provider/account/region must be guessed, a public state endpoint is
required, or a self-hosted database/cluster is introduced.

## `DEVOPS-SF20-IAC-TUW-002`

**Title:** Deterministic Compose and pinned Ansible host deployment
**Release/module:** R14 / DEVOPS-SF20-IAC
**Risk/size:** H / L
**Objective:** An empty approved host can render the same immutable images and
configuration hash for the SF20 application graph, while disposable tests may
continue to build locally from the same base Compose file.

### Files

- **Create:** `infra/production/compose.images.yml`,
  `infra/ansible/playbooks/vault-host.yml`,
  `infra/ansible/roles/vault-host/tasks/main.yml`,
  `tools/security/check-production-host.mjs`,
  `tools/security/check-production-host.spec.mjs`.
- **Modify:** `infra/production/compose.yml` for the bounded web/API/API-worker/
  gateway/ingestion/ClamAV host graph and security/health ordering only;
  `apps/api/src/common/queue/queue.registry.ts` and its colocated spec only
  for deterministic dead-letter-before-main provisioning on a fresh database.
- **May create:** a generated-hash-free fixture describing expected service,
  image, network, volume, secret, and port names.
- **NOT modify:** development Compose behavior, application dependencies,
  provider resources, real host, Docker daemon settings, real secret values,
  monitoring implementation owned by SF20-04, `docs/package/**`.

### Implementation

- Preserve existing gateway/sandbox build definitions and topology for local
  integration. Add only services required for the production application
  node and the fixed ClamAV dependency.
- Put every production-startable image in the overlay as an operator-supplied
  immutable `name@sha256:<64 hex>` reference. Reject `latest`, tags without a
  digest, mutable local names, missing architectures, and a build-only
  effective host model.
- Keep public exposure bounded to an operator-selected host-loopback/reverse
  proxy entry for web/API. Gateway and worker ports remain unpublished;
  database/object storage remain outside the node over approved private
  endpoints.
- Require restart policies, healthchecks, dependency health order, read-only
  filesystems where supported, capabilities dropped, no-new-privileges,
  finite resources, closed networks, and only named volumes/secrets.
- The independently authored Ansible role uses built-in modules to validate
  the approved-host marker, Ansible version, source checksums, directory/file
  modes, effective `docker compose config`, image digests, and canonical
  configuration hash before a start would be allowed.
- Queue creation follows its registered dead-letter dependency before the
  main queue regardless of provider/module initialization order. Missing or
  cyclic queue dependencies fail closed instead of making a fresh host depend
  on pre-existing queue rows.
- Ansible accepts only explicit bounded variables and secret file references.
  It does not create cloud resources, generate secrets/certificates, install
  unpinned packages, copy upstream code, or print Compose environment.
- A check-mode or fixture renderer must produce the same config hash twice
  from the same inputs and a different hash for a security-relevant mutation.

### Verification (AND)

- Base plus image overlay renders successfully and contains the exact approved
  service/network/volume/secret graph with no floating image or application
  build in the effective host model.
- Missing digest, extra service/network/port, public gateway/worker port,
  public state endpoint, privileged/host/socket/device mount, writable
  sensitive root, absent health/restart/resource control, and dependency-order
  mutations fail.
- Static Ansible tests reject a wrong version, absent approved-host marker,
  unpinned package, shell/curl bootstrap, embedded secret, unknown variable,
  source drift, weak file mode, and non-matching config hash.
- Repeated fixture/check-mode renders produce an identical image set and
  configuration hash without contacting or mutating a real host.
- A fresh migrated database provisions registered main/dead-letter pairs in
  dependency order; missing and cyclic definitions fail with bounded codes.
- The existing mTLS gateway 8-case and hostile sandbox 8-case runtime Gates
  remain green against the base production topology.

### Done / stop

Done when source, checker, and check-mode evidence converge on one image-only
effective host model. Actual host convergence remains
`EXTERNAL_BLOCKED_APPROVED_HOST_AND_IMAGE_RECEIPT_REQUIRED`. Stop if proof
requires a real host mutation, floating artifact, copied Ansible code, or
weaker gateway/sandbox boundary.

## `DEVOPS-SF20-IAC-TUW-003`

**Title:** File-only production secret, certificate, and runtime identity contract
**Release/module:** R14 / DEVOPS-SF20-IAC
**Risk/size:** C / M
**Objective:** Database, object-storage, MFA/session, and private identity
material is resolved from bounded files/provider mounts and never survives in
production environment values, command arguments, images, logs, or evidence.

### Files

- **Create:** `infra/production/secret-manifest.yml`,
  `apps/api/src/common/config/runtime-secret.ts`,
  `apps/api/src/common/config/runtime-secret.spec.ts`,
  `workers/ingestion/app/runtime_secret.py`,
  `workers/ingestion/tests/test_runtime_secret.py`,
  `tools/security/check-production-secrets.mjs`,
  `tools/security/check-production-secrets.spec.mjs`.
- **Modify:** production Compose/overlay; API database, queue, health, storage,
  MFA, and private-gateway bootstrap consumers; worker storage credentials;
  focused tests and `.env.example` documentation.
- **NOT modify:** actual secret/certificate files or values, development
  defaults outside production behavior, business/audit/permission semantics,
  dependency/lock files, production provider, `docs/package/**`.

### Implementation

- Provide one small standard-library reader per runtime language. In
  production it accepts only an absolute allowlisted file path, opens a
  regular non-symlink file, checks ownership and mode, bounds bytes, trims one
  terminal newline, rejects NUL/empty/dev placeholder, and returns only to the
  direct consumer.
- Do not copy a resolved secret into `process.env`, a global configuration
  object, an exception, a diagnostic structure, or a child-process argument.
  Non-production direct environment behavior may remain only where current
  tests/development require it and must be explicitly rejected by the
  production profile.
- Convert production DB URL, S3 access/secret keys, MFA encryption key, and
  any session key to `*_FILE` references. Keep existing certificate file
  consumers and bring their mode/root/rotation validation under the common
  manifest/checker.
- The manifest records logical ID, owner, consumers, mount path, provider
  reference class, confidentiality, minimum mode, maximum bytes, rotation
  interval, overlap interval, and revocation action—never a value or raw
  provider reference.
- Rotation accepts explicitly named current/next material for a bounded
  overlap and proves both before cutover. An absent current key, expired
  overlap, or unapproved old-key fallback fails.
- The static checker inspects Compose models, Dockerfiles, Ansible, runtime
  readers, environment keys, command arrays, and evidence schemas. It
  allowlists references and public certificate paths, not secret values.

### Verification (AND)

- Each required secret boots from a synthetic `0600` file owned by the
  expected test UID and reaches only its intended consumer.
- Missing, empty, oversized, symlink, directory, FIFO, weak mode, wrong owner,
  path traversal, outside-root, embedded NUL, dev default, and direct
  production environment value fail before network I/O.
- Image config/history, effective Compose environment, process arguments,
  captured stdout/stderr/logs, exception serialization, and synthetic evidence
  contain no secret canary.
- Current/next certificate and key overlap succeeds inside the declared
  window; unknown, expired, revoked, missing, or old-only material fails.
- Database, queue, health, storage, MFA, gateway, and ingestion regression
  tests pass without placing a resolved secret back in an environment map.

### Done / stop

Done when all production secret consumers use the same bounded semantics and
the static/runtime scans report zero values. Stop if an SDK forces a secret
into a command argument/environment, a value must be committed, or development
fallback remains reachable in production.

## `DEVOPS-SF20-DR-TUW-001`

**Title:** Signed cross-store backup-set manifest
**Release/module:** R14 / DEVOPS-SF20-DR
**Risk/size:** C / L
**Objective:** Bind provider PITR, a portable PostgreSQL backup, and the
selected object-version inventory into one fresh, region-consistent,
cryptographically sealed backup-set verdict.

### Files

- **Create:** `tools/release/build-backup-set-manifest.mjs`,
  `tools/release/build-backup-set-manifest.spec.mjs`.
- **Modify:** `docs/release/backup-dr-runbook.md`,
  `security/oss-adoption-decisions.yml` for the native-tooling decision.
- **May create:** synthetic metadata fixtures with hashes and opaque references
  only.
- **NOT modify:** database schema, object storage adapter authority, live
  backup schedules, provider account, real backup/object bytes, dependency/
  lock files, `docs/package/**`.

### Implementation

- Define a closed versioned input for provider PITR receipt, portable
  PostgreSQL 16 backup, and bounded object-version inventory. Reject unknown
  fields and unbounded arrays/strings.
- Validate one opaque backup-set ID, approved region, capture start/end, source
  profile hash, database target fingerprint, object-store target fingerprint,
  encryption/immutability flags, and freshness against a supplied clock.
- Hash the portable backup bytes directly. For each selected object require an
  opaque reference, opaque version fingerprint, SHA-256, bytes, capture time,
  encryption, and immutability/versioning proof. Never accept a mutable
  latest-object reference.
- Canonicalize the unsigned payload deterministically, sign with an Ed25519
  private-key file supplied at execution, attach a key fingerprint, and verify
  before writing a complete manifest. The key and provider receipt body are
  not copied to output.
- Permit only `COMPLETE` or a bounded failure; there is no database-only,
  object-only, unsigned, stale, or cross-region success.
- The runbook distinguishes provider operating target (which may be tighter)
  from the SF20 readiness maximum of RPO 60 minutes.

### Verification (AND)

- Identical synthetic inputs produce identical unsigned/canonical hashes and a
  verifiable signature; tampering any covered field or byte fails.
- Missing PITR/portable/object component, empty inventory, wrong PostgreSQL
  major, backup-byte mismatch, object hash/size mismatch, mutable/latest
  object, unencrypted/unsealed input, stale capture, excessive window,
  cross-region/profile mismatch, unknown field, unsigned output, and wrong/
  revoked verification key fail.
- Output contains only opaque references, hashes, sizes, times, bounded
  categories, profile fingerprint, and signing-key fingerprint—no URL,
  account, endpoint, credential, tenant/document ID, object key, or content.
- PostgreSQL native-tooling and pgBackRest reject/conditional decisions match
  the source map and no pgBackRest runtime/package appears.

### Done / stop

Done when no partial backup can be called complete and the manifest verifies
offline with the expected public key. Actual provider/backup receipt remains
`EXTERNAL_BLOCKED_BACKUP_SET_INPUT_REQUIRED`. Stop if signing material or
customer identifiers must enter source/evidence.

## `DEVOPS-SF20-DR-TUW-002`

**Title:** Isolated database and exact-object restore readback
**Release/module:** R14 / DEVOPS-SF20-DR
**Risk/size:** C / L
**Objective:** Extend the existing backup drill so a disposable restored
database and selected exact object versions prove recoverability directly,
including the DMS trust invariants.

### Files

- **Modify:** `tools/release/backup-restore-drill.mjs`,
  `tools/release/backup-restore-drill.spec.mjs`,
  `docs/release/backup-dr-runbook.md`.
- **May create:** a disposable isolated restore harness or synthetic
  exact-object reader under `tools/release/` and canonical integration tests
  under existing `tests/integration/cross-tenant`,
  `tests/integration/audit-coverage`, or
  `tests/integration/storage-isolation` directories.
- **NOT modify:** application PermissionService/audit/storage implementation,
  database migrations, object keys/version authority, production state,
  customer data, dependency/lock files, `docs/package/**`.

### Implementation

- Reuse the existing schema-hash and core row-count comparison. Add direct
  catalog checks that every required tenant table has RLS enabled and FORCE
  RLS plus a policy; record only table names and bounded verdicts.
- In an explicit transaction against the restored database, attempt audit row
  `UPDATE` and `DELETE` through the runtime role and require both to fail with
  no changed rows. Do not weaken or temporarily disable the immutability
  trigger for the drill.
- Set a synthetic tenant context and query a different synthetic tenant
  through the runtime role; require zero visible rows or a closed permission
  error. Owner/superuser success is not a tenant-isolation proof.
- Read each selected version through an injected exact-version reader bound to
  the sealed manifest, stream and hash bytes with a cap, then compare version
  fingerprint, SHA-256, and bytes. Never fall back to current/latest.
- Build the final verified manifest only after schema, RLS/FORCE, audit,
  counts, cross-tenant, and every object readback pass. Keep API snapshot
  recording after direct proof and preserve fail-closed behavior if it fails.
- Always tear down the disposable database/object fixture and prove a clean
  repeat run.

### Verification (AND)

- Matching isolated database/object fixtures pass every direct check and
  generate one bounded verified manifest.
- Schema, policy, row count, RLS, FORCE RLS, missing tenant table, audit
  update/delete, runtime-role, tenant context, cross-tenant visibility, object
  version/hash/size/missing/truncated/oversized mutations each fail.
- An exact-version readback cannot be replaced by latest-object behavior; an
  object changed after manifest capture is detected.
- Failure output/database URLs/logs/evidence omit connection strings, session
  cookies, tenant IDs, object keys, content, and provider details.
- The database migration `up -> down -> up`, full integration regression, and
  a second clean drill pass after every negative remain green.

### Done / stop

Done when direct database/object proof—not API health—covers every invariant
and leaves no disposable resource. Stop if the drill requires owner bypass,
disabling RLS/audit protection, mutable object reads, or a real production
restore.

## `DEVOPS-SF20-DR-TUW-003`

**Title:** Residency, measured RPO/RTO, and rollback readiness Gate
**Release/module:** R14 / DEVOPS-SF20-DR
**Risk/size:** C / L
**Objective:** Produce a fail-closed readiness verdict only when every state
and evidence surface remains in the approved domestic region and bounded
rollback returns the application and data authority to a known compatible
pair.

### Files

- **Create:** `tools/release/check-sf20-residency.mjs`,
  `tools/release/check-sf20-residency.spec.mjs`,
  `tools/release/small-firm-rollback-drill.mjs`,
  `tools/release/small-firm-rollback-drill.spec.mjs`.
- **Modify:** `docs/release/backup-dr-runbook.md` and bounded evidence
  collection/checker configuration only.
- **May create:** synthetic receipt fixtures containing region codes, hashes,
  durations, and outcome categories only.
- **NOT modify:** real staging/cloud/production state, application business
  behavior, database schema, release/go-live authority, dependency/lock files,
  `docs/package/**`.

### Implementation

- Accept only versioned, signed or hashed bounded receipts for app, database,
  object storage, backup, secret/key service, and later SF20-04 telemetry.
  Every present state-bearing surface must match the profile country/region;
  missing mandatory receipt fails rather than being treated as same-region.
- Derive RPO from the trusted restore point versus incident/cutoff time and RTO
  from drill start versus verified-ready time. Do not accept declared numbers
  without timestamps and monotonic-duration consistency.
- Require RPO <= 60 minutes and RTO <= 240 minutes. Record actual whole-second
  measurements and the configured ceiling; a tighter provider target is
  informational only.
- Model a transactional rollback state machine with immutable current and
  previous image digests, migration/data authority fingerprints, backup-set
  reference, secret generation, and object inventory hash.
- Inject bad migration, bad image/health, missing key, restore timeout, object
  mismatch, and rollback interruption. Each must fail forward readiness,
  select only the exact previous compatible image/data pair, and never claim
  success when compensation is partial.
- After rollback run bounded probes for permission denial, ethical-wall denial,
  audit insert plus immutable audit, immutable-original hash/version, gateway
  direct-port/replay denial, and a clean document operation.
- Synthetic local proof is `TECHNICAL_PASS`; an actual approved-host/staging
  receipt is required for `DEPLOYMENT_READY`. The tool must emit
  `EXTERNAL_BLOCKED_APPROVED_STAGING_ROLLBACK_RECEIPT_REQUIRED`, never a false
  deployment claim.

### Verification (AND)

- Canonical synthetic domestic receipts with RPO/RTO inside bounds and every
  post-rollback invariant pass yield `TECHNICAL_PASS`.
- Wrong/mixed/missing region, profile hash drift, stale/unsigned receipt,
  clock inversion, declared-only duration, RPO 60m+1s, RTO 240m+1s, missing
  state surface, and future telemetry outside the region fail.
- Every failure injection above proves the exact previous digest/data
  selection; incompatible schema/data, old key fallback, latest image,
  partial restore, object mismatch, exceeded timeout, and failed compensation
  cannot become ready.
- Permission, wall, audit, original, gateway, and clean-operation probes are
  mandatory after rollback; omitting or flipping any probe fails.
- Repeated runs are deterministic, contain no secret/customer/provider
  detail, and do not mutate an external system.

### Done / stop

Done when synthetic technical readiness is complete and external deployment
readiness remains honestly blocked on an approved receipt. Stop if a real
staging/cloud mutation, rollback approval, external secret, or production
endpoint is required for local completion.

## Verification and evidence contract

The PACK is complete only when all six TUWs pass their AND clauses and an
exact implementation commit is sealed under:

```text
artifacts/enterprise-dms-oss/<implementation-sha>/PACK-SF20-03/
  DEVOPS-SF20-IAC-TUW-001/production-profile.json
  DEVOPS-SF20-IAC-TUW-002/production-host.json
  DEVOPS-SF20-IAC-TUW-003/production-secrets.json
  DEVOPS-SF20-DR-TUW-001/backup-set.json
  DEVOPS-SF20-DR-TUW-002/isolated-restore.json
  DEVOPS-SF20-DR-TUW-003/residency-rollback.json
```

Each manifest records schema version, PACK/TUW ID, main base SHA,
implementation SHA/tree, exact profile/config/image/source hashes, bounded
test counts and negative categories, actual synthetic RPO/RTO where relevant,
and explicit non-claims for provider resources, approved host, staging,
deployment, release, and go-live. Evidence is synthetic and ignored from the
product commit.

Required exact-head gates:

```bash
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
pnpm backlog:validate
pnpm docs:frozen
node tools/quality/check-small-firm-profile.mjs --static
node tools/oss/check-reuse-first.mjs \
  --base "$(git merge-base origin/main HEAD)" \
  --decisions security/oss-adoption-decisions.yml
node --test tools/security/check-production-profile.spec.mjs
node --test tools/security/check-production-host.spec.mjs
node --test tools/security/check-production-secrets.spec.mjs
node --test tools/release/build-backup-set-manifest.spec.mjs
node --test tools/release/backup-restore-drill.spec.mjs
node --test tools/release/check-sf20-residency.spec.mjs
node --test tools/release/small-firm-rollback-drill.spec.mjs
uv run --python 3.12 --directory workers/ingestion --extra test pytest
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:integration
```

The effective base-plus-image-overlay Compose inspection, existing gateway
runtime Gate, existing hostile-sandbox runtime Gate, database
`up -> down -> up`, sealed backup-set verification, isolated restore, and
residency/rollback drills are mandatory in addition to these commands. This
PACK adds no database migration and must not claim a schema change.
