# PACK-SF20-02 — Parser sandbox and hostile-document containment

Status: canonical post-R14 extension under
`USER-UMBRELLA-AUTONOMY-20260721` and the owner's all-immediate-track execution
direction. This is the canonical form of `PROPOSED-PACK-SF20-02`, based on
merged `origin/main`
`953537d6b34ba5a2a78ec33165b435c330815df3`.

## Objective and authority

Keep the existing Python parser portfolio for the maximum-20-user profile
while bounding hostile-document work inside one non-root, read-only ingestion
container:

```text
validated fixed ingestion envelope
  -> private mTLS gateway and one-use nonce
  -> fixed storage profile and exact object version/hash
  -> central parser resource policy
  -> existing PDF/DOCX/HWPX/HWP/Office/OCR/email/ZIP parser
  -> bounded result or bounded failure reason
  -> no arbitrary egress, persistent scratch, or cross-job contamination
```

The sandbox is not a permission, tenant, audit, immutable-original, storage,
scanner, or promotion authority. It receives only work that has already
passed the existing API and gateway boundaries. It may reduce parser resource
consumption or fail work closed; it may not convert an error, timeout,
unsupported input, partial output, or unavailable scanner into clean/ready.

Existing Python standard-library primitives, Docker/Compose controls,
LibreOffice, Tesseract, ClamAV, current parser libraries, and the already
pinned Gotenberg source/test baseline are reused. No parser candidate is added
to production unless the bounded benchmark finds a named format/quality gap
and a later approval records the exact artifact, adapter, rollback, and
operating cost.

## Pack-wide invariants

1. `docs/package/**`, permission, ethical-wall, audit, storage-key,
   immutable-original, document-state, queue, and database schema files remain
   unchanged.
2. No request body, filename, archive member, document metadata, parser output,
   redirect, DNS answer, or environment value can choose an unapproved network
   destination.
3. Resource limits are defined once by parser profile and cover wall time,
   external subprocess time, input bytes, page count, archive members,
   archive depth, expansion ratio, expanded bytes, output text, output bytes,
   and fallback count.
4. An exceeded or unmeasurable limit returns a closed, enumerable reason code.
   It never becomes empty text, clean scan, ready extraction, or a retry loop
   over every parser.
5. Temporary input, output, LibreOffice profile, OCR raster, archive expansion,
   and cache data live only on bounded `tmpfs` and are removed after success,
   failure, cancellation, and timeout.
6. The production ingestion process runs as fixed UID/GID `10001:10001` with
   a read-only root filesystem, all Linux capabilities dropped,
   `no-new-privileges`, bounded PIDs/CPU/memory, and no host/device/socket
   mount. Only the replay volume and bounded scratch tmpfs are writable.
7. The production worker has no public or default Internet route. It can join
   only closed internal networks declared by the machine-readable egress
   policy. Storage and ClamAV endpoints are fixed startup configuration and
   must resolve entirely inside approved CIDRs.
8. Metadata/link-local, loopback, unspecified, multicast, public, and
   unapproved RFC1918 destinations fail before application traffic. DNS
   answer drift, mixed approved/unapproved answers, redirects, and hostname
   mismatch fail closed.
9. Runtime and tests never log document bytes, extracted text, archive member
   content, credentials, object keys, tenant/document IDs, raw nonces, or
   unbounded exception text. Evidence contains counts, hashes, reason codes,
   image/config hashes, and synthetic labels only.
10. Tests use generated/synthetic files and disposable containers/networks.
    No customer document, credential, production endpoint, or private key is
    committed.
11. Gotenberg, Tika, and OCRmyPDF remain disabled and absent from the
    production Compose graph for the SF20 baseline unless the candidate gate
    records an approved measurable trigger. Source inspection does not
    authorize runtime adoption.
12. No dependency or lockfile change is authorized. A missing capability that
    requires one is a stop and explicit follow-on decision, not an implicit
    package addition.

## Ordered TUWs

| Order | ID | Risk / size | Depends on | Result |
| ----: | -- | ----------- | ---------- | ------ |
| 1 | `DEVOPS-SF20-SBX-TUW-001` | C / L | `DEVOPS-SF20-GW-TUW-005` | central resource policy and bounded parser outcomes |
| 2 | `DEVOPS-SF20-SBX-TUW-002` | C / L | SBX-001 | fixed non-root/read-only/resource-limited container |
| 3 | `DEVOPS-SF20-SBX-TUW-003` | C / L | SBX-002 | closed egress policy and DNS/destination enforcement |
| 4 | `DEVOPS-SF20-SBX-TUW-004` | H / M | SBX-001 through SBX-003 | measured candidate adopt/reject decision |
| 5 | `DEVOPS-SF20-SBX-TUW-005` | C / L | SBX-001 through SBX-004 | real hostile-document runtime gate |

## `DEVOPS-SF20-SBX-TUW-001`

**Title:** Central parser resource policy and bounded outcomes  
**Release/module:** R14 / DEVOPS-SF20-SBX  
**Risk/size:** C / L  
**Objective:** Every ingestion parser profile enforces one closed resource
matrix and turns hostile, partial, oversized, or timed-out work into a bounded
failure without contaminating the next job.

### Files

- **Create:** `workers/ingestion/app/resource_policy.py`,
  `workers/ingestion/tests/test_resource_policy.py`.
- **Modify:** extraction, OCR, conversion, email, ZIP routers and the parser or
  converter helpers that currently own duplicate constants/timeouts; their
  focused tests.
- **May create:** a synthetic hostile-corpus manifest under
  `tests/fixtures/ingestion-sandbox/` containing hashes and generator
  parameters only.
- **NOT modify:** API permission/audit/storage authority; ingestion envelope
  endpoint fields; dependency/lock files; document state schema; raw fixture
  copied from upstream; result promotion semantics.

### Implementation

- Define immutable profiles for `extract`, `ocr`, `convert`, `email`, and
  `zip`. Reject an unknown profile or invalid override at startup.
- Keep limits deterministic and small-firm specific. Environment overrides, if
  retained, may only reduce a compiled maximum and must be positive bounded
  integers. They may not increase the security ceiling.
- Centralize subprocess invocation for LibreOffice, Tesseract, and HWP5 so
  timeout, output capture, environment, working directory, process-group
  cleanup, and reason mapping are consistent. Do not expose stderr/stdout in
  API responses or logs.
- Validate archive metadata before reading members. Count members, normalized
  depth, declared/uncompressed bytes, cumulative expansion, compression
  ratio, duplicate/colliding paths, encrypted entries, and traversal. Stop
  before extracting the member that crosses a limit.
- Bound PDF/OCR page iteration before rendering all pages and bound per-page
  plus total OCR output. Bound Office and parser-produced file/text output
  before returning it to the route.
- Track at most the closed fallback count. Unsupported input does not walk an
  open-ended parser chain.
- Use a monotonic wall clock and a stable `ParserLimitExceeded`/bounded failure
  mapping. Timeouts or cancellations must clean scratch/process state before a
  response is returned.

### Verification (AND)

- Exact-boundary and one-over cases for every numeric limit.
- Slow subprocess, subprocess that forks a child, large stdout/stderr,
  malformed/partial output, and cancellation terminate with bounded reason
  codes and no surviving child.
- ZIP bomb, deep nesting, duplicate/traversal names, encrypted member,
  misleading declared sizes, and malformed archive fail before uncontrolled
  expansion.
- PDF/OCR page overflow, raster/output overflow, Office output overflow,
  extracted-text overflow, and fallback overflow do not return ready/clean.
- Temporary directories and process groups are absent after success, failure,
  timeout, and cancellation; a clean job immediately after each case passes.
- Full Python 3.12 worker regression stays green and a canary document body is
  absent from captured logs/errors.

### Done / stop

Done when all parser routes use the same policy and no existing duplicate
timeout/limit can silently weaken it. Stop if enforcement requires logging
content, changing document authority, weakening an existing limit, adding a
dependency, or treating thread cancellation alone as proof that an external
subprocess was killed.

## `DEVOPS-SF20-SBX-TUW-002`

**Title:** Fixed non-root, read-only, resource-limited ingestion container  
**Release/module:** R14 / DEVOPS-SF20-SBX  
**Risk/size:** C / L  
**Objective:** Production runtime inspection proves that parser compromise
cannot gain root, mutate the image filesystem, mount the host, create
unbounded processes, or consume resources outside the SF20 envelope.

### Files

- **Modify:** `workers/ingestion/Dockerfile`,
  `infra/production/compose.yml`.
- **Create:** `infra/policies/ingestion-container-policy.yml`,
  `tools/security/check-ingestion-container.mjs`,
  `tools/security/check-ingestion-container.spec.mjs`.
- **Modify tests:** production Compose/runtime security integration only.
- **NOT modify:** development Compose behavior; base-image dependency set;
  Docker daemon/socket; privileged/device/host mounts; host kernel settings;
  replay durability contract.

### Implementation

- Create fixed UID/GID `10001:10001` in the final image, own only the
  application and replay seed directories needed at runtime, and switch to it
  with `USER`.
- Put Python/LibreOffice/Tesseract/HWP cache, profile, and temp locations under
  bounded `/tmp` or `/var/tmp` tmpfs. Do not make the image root writable.
- Production Compose must declare `user`, `read_only`, `cap_drop: [ALL]`,
  `no-new-privileges`, finite `pids_limit`, CPU and memory limits, bounded
  tmpfs size/options, and the replay volume only.
- Keep the replay volume writable and persistent across worker restart while
  proving that unrelated filesystem paths are read-only.
- The checker parses the effective Compose model and a closed policy. It must
  reject root/unspecified user, added capability, writable rootfs, unbounded
  PID/CPU/memory, oversized/unbounded tmpfs, host mode, host path, device,
  socket, privileged, or extra writable mount.

### Verification (AND)

- Image build and `docker inspect` show UID/GID `10001:10001`, no capabilities,
  read-only rootfs, no-new-privileges, finite PIDs/CPU/memory, and only the
  declared writable mounts.
- Writes to `/worker`, `/etc`, `/usr`, `/root`, and an arbitrary root path fail.
  Writes to approved tmpfs and replay paths succeed within their bounds.
- A fork/process pressure probe is bounded without harming another service.
  An allocation pressure probe terminates only the worker and the service can
  restart into a clean job.
- LibreOffice, Tesseract Korean/English, HWP5, font/cache initialization,
  healthcheck, and durable replay restart regressions pass as the fixed user.
- Each policy mutation listed above fails the static checker.

### Done / stop

Done when the effective running container—not only the Dockerfile—matches the
closed policy and current parser/replay functions work as non-root. Stop if a
parser requires root, a host mount/socket/device, a new capability, a writable
rootfs, or loss of replay durability.

## `DEVOPS-SF20-SBX-TUW-003`

**Title:** Closed ingestion egress and endpoint/DNS enforcement  
**Release/module:** R14 / DEVOPS-SF20-SBX  
**Risk/size:** C / L  
**Objective:** The production worker can address only the fixed storage and
ClamAV authorities on approved private destinations and has no metadata,
arbitrary-private, or public Internet egress.

### Files

- **Create:** `workers/ingestion/app/egress_policy.py`,
  `workers/ingestion/tests/test_egress_policy.py`,
  `infra/policies/ingestion-egress-policy.yml`,
  `tools/security/check-ingestion-egress.mjs`,
  `tools/security/check-ingestion-egress.spec.mjs`.
- **Modify:** fixed storage profile, ClamAV client construction, worker startup,
  production Compose/network declarations, and bounded runtime probes.
- **May create:** local-only synthetic storage/ClamAV/DNS probe fixtures under
  `tests/fixtures/ingestion-sandbox/`.
- **NOT modify:** allow endpoint/URL/host in the ingestion envelope; public
  egress; wildcard CIDR/hostname; cloud firewall or production endpoint;
  redirect following to a new authority; application permission/audit code.

### Implementation

- Require private-profile startup configuration to name exactly one storage
  authority and one ClamAV authority plus an explicit bounded CIDR set. Reject
  missing, wildcard, loopback, link-local, multicast, unspecified, public, and
  syntactically ambiguous values.
- Storage URL scheme/host/port must match the approved storage authority
  exactly. ClamAV host/port must match its approved authority exactly.
- Resolve the fixed host before use. Every returned address must belong to an
  approved CIDR, and the set must remain approved on re-resolution. Mixed or
  changed-to-unapproved answers fail closed. Never include the answer or input
  in a returned/logged error.
- Keep ingestion on closed internal Compose networks with no published port,
  host mode, `extra_hosts`, link, default public route, or API peer. A
  test-only topology may attach generated local storage/ClamAV fixtures and
  must not change the production file's closed graph.
- No parser or request field may create a socket. Network access stays inside
  the fixed storage and ClamAV clients.

### Verification (AND)

- Approved synthetic storage and ClamAV endpoints succeed.
- `169.254.169.254`, loopback, unspecified, multicast, public IPv4/IPv6,
  unapproved RFC1918, embedded credentials, alternate ports, URL path/query,
  decimal/octal/IPv6-mapped IPs, and hostname suffix tricks fail before I/O.
- DNS rebinding, mixed answers, answer drift, CNAME/redirect to an unapproved
  destination, and redirect loops fail closed.
- Runtime probes from the real worker cannot reach metadata, public HTTP/HTTPS,
  an unapproved private fixture, or the API; approved fixture probes work.
- Envelope/object/archive/HTML/email canaries containing URLs never alter the
  destination set. No raw destination or customer identifier appears in
  worker logs/evidence.

### Done / stop

Done when both application endpoint validation and runtime topology enforce
the same closed policy. Actual provider CIDRs/endpoints are deployment inputs,
not invented source defaults. Stop with
`EXTERNAL_BLOCKED_NETWORK_PROFILE_REQUIRED` if a production deployment claim
is requested without those inputs; this does not block synthetic technical
verification or code merge.

## `DEVOPS-SF20-SBX-TUW-004`

**Title:** Minimal parser candidate measurement and adopt/reject decision  
**Release/module:** R14 / DEVOPS-SF20-SBX  
**Risk/size:** H / M  
**Objective:** A deterministic synthetic corpus and pinned upstream evidence
decide whether Gotenberg, Apache Tika, or OCRmyPDF solves a measured SF20 gap
without adding all three services by default.

### Files

- **Create:** `tests/fixtures/ingestion-sandbox/parser-candidate-corpus.json`,
  `tools/oss/evaluate-parser-candidates.mjs`, its spec, and
  `docs/architecture/oss-adoption-decisions/sf20-parser-candidates.md`.
- **Modify only if harvested:** source-map/decision entries for exact
  source/license/test pins. Clone content remains in the detached ignored
  source lab and never in the product tree.
- **NOT modify:** product dependency/lock files; production Compose with a
  candidate service; parser adapter/runtime code for a rejected candidate;
  customer fixtures; copied upstream source/test.

### Implementation

- Reuse the current parser and synthetic corpus first. Measure format coverage,
  Korean text fidelity where a deterministic expected string exists, timeout,
  peak memory category, output bounds, failure mode, and operational service
  count.
- Inspect locally cloned exact upstream source/license/security/test material.
  Gotenberg uses the existing pin. Tika/OCRmyPDF remain blocked if an exact
  pin and license/security evidence cannot be harvested reproducibly.
- Candidate status is one of `ADOPT_TRIGGER_MET`,
  `REJECT_FOR_SF20_BASELINE`, or `BLOCKED_SOURCE_EVIDENCE`. `ADOPT_TRIGGER_MET`
  still does not authorize runtime adoption; it records the exact missing
  capability and a later PACK requirement.
- Reject a candidate when the current parser meets the corpus, the candidate
  adds no named format/quality improvement, requires a weaker boundary, lacks
  a source/artifact pin, or its service/maintenance cost exceeds the SF20
  benefit.
- The production graph and lockfiles must remain byte-identical for all three
  reject/blocked outcomes.

### Verification (AND)

- Repeated corpus generation and evaluation yield the same hash and decision.
- A synthetic measurable-gap mutation changes only the intended candidate to
  `ADOPT_TRIGGER_MET`; missing source/license/security evidence cannot become
  adopted.
- Candidate image/service/adapter/lockfile canaries fail the SF20 expansion
  gate without an exact trigger receipt and approval reference.
- The report includes coverage, latency class, memory class, failure behavior,
  license, source/test pin, operating cost, decision, and rollback implication
  for all three candidates.

### Done / stop

Done when every candidate has a measured, reviewable outcome and the default
production graph contains none of them. Stop if the only adoption reason is
that source is public, if source/test must be copied into the product, or if
the benchmark requires customer documents.

## `DEVOPS-SF20-SBX-TUW-005`

**Title:** Real hostile-document and sandbox-containment runtime gate  
**Release/module:** R14 / DEVOPS-SF20-SBX  
**Risk/size:** C / L  
**Objective:** The real gateway, non-root worker, fixed storage/scanner
fixtures, and closed networks prove that attacks fail without content leakage,
tenant crossing, replay acceptance, or damage to a subsequent clean job.

### Files

- **Create:** `tests/integration/document-access/ingestion-sandbox.spec.ts`,
  `tests/integration/storage-isolation/ingestion-object-scope.spec.ts` if that
  canonical suite path is not already sufficient, and a disposable runtime
  harness under `infra/production/`.
- **Modify:** CI invocation only when required to run the existing canonical
  integration suite; bounded evidence collector/checker paths.
- **NOT modify:** committed keys/customer data; public ports in production;
  skipped/quarantined tests; cloud/staging/deployment; `docs/package/**`.

### Implementation

- Generate certificates, identities, object bytes, hashes, storage versions,
  scanner replies, DNS answers, and hostile documents in a disposable
  directory at runtime.
- Launch the effective production image/security/network profile with
  test-only loopback exposure for the gateway and local fixed storage/ClamAV
  fixtures. Test-only ports/networks must be absent from the production file.
- Exercise the gateway and storage path rather than directly calling parser
  helpers for the final gate.
- Capture bounded exit/result categories and inspect runtime state. Never print
  raw container logs when they might include request material; run a separate
  canary assertion over captured logs.
- Tear down project-scoped containers, networks, volumes, certificates, and
  temporary data on both pass and fail.

### Verification (AND)

- Valid clean document completes through mTLS, fixed storage version/hash, and
  the intended parser.
- ZIP bomb/deep archive, malformed parser input, wall/subprocess timeout,
  oversized output, SSRF URL canary, metadata/public/unapproved-private probe,
  tenant/key/version/hash mismatch, identity spoof, and replay all fail closed.
- Runtime inspect proves non-root/read-only/capability/PID/CPU/memory/tmpfs and
  closed-egress policies on the same container that handled the attack.
- No raw content canary, key, credential, tenant/document ID, or nonce appears
  in logs/evidence. No other tenant fixture is read or changed.
- Worker restart preserves replay denial and scratch cleanup. A subsequent
  clean request succeeds and no disposable resource remains.
- Focused integration, full Python 3.12 worker suite, root lint/typecheck/test/
  build, migration round trip when applicable, and full integration regression
  are green.

### Done / stop

Done when static policy, application tests, and the real disposable topology
prove the same boundary. Stop on mock-only proof, public production listener,
content-bearing evidence, test skip, leftover resource, or a need to mutate a
real external system.

## Verification and evidence contract

The PACK is complete only when all five TUWs pass their AND clauses and an
exact implementation commit is sealed under:

```text
artifacts/enterprise-dms-oss/<implementation-sha>/PACK-SF20-02/
  DEVOPS-SF20-SBX-TUW-001/resource-policy.json
  DEVOPS-SF20-SBX-TUW-002/container-runtime.json
  DEVOPS-SF20-SBX-TUW-003/egress-policy.json
  DEVOPS-SF20-SBX-TUW-004/parser-candidates.json
  DEVOPS-SF20-SBX-TUW-005/hostile-runtime-gate.json
```

Each manifest records schema version, PACK/TUW ID, main base SHA,
implementation SHA/tree, runtime/image/config/source hashes, bounded test
counts, candidate decisions where applicable, and explicit non-claims for
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
node --test tools/security/check-ingestion-container.spec.mjs
node --test tools/security/check-ingestion-egress.spec.mjs
uv run --python 3.12 --directory workers/ingestion --extra test pytest
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:integration
```

The runtime hostile-document gate and effective Compose/image inspection are
mandatory in addition to these commands. If this PACK adds no migration, the
database `up -> down -> up` gate remains a regression check and must not claim
a PACK-specific schema change.

