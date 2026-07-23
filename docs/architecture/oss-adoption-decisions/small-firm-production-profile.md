# SF20 production profile and recovery-tool decision

Decision date: 2026-07-23

Status: approved technical baseline for `PACK-SF20-03`; deployment readiness
remains blocked on operator-owned external receipts.

## Decision

The maximum-20-user baseline uses one domestic-region Linux application node
with Docker Compose v2, a private managed PostgreSQL 16 service, and private
managed S3-compatible object storage. It is intentionally
`single-node-recoverable`, not a multi-node availability claim.

The repository owns a provider-neutral input contract. The concrete provider,
account, region, endpoints, CIDRs, encryption keys, certificates, secrets,
bucket, managed database, host, and staging environment are not guessed or
created here. They remain explicit `EXTERNAL_BLOCKED_*` receipts before
deployment readiness can be claimed.

## OSS reuse outcome

### Ansible v2.21.2 — adopt at L1, no source copy

Use the exact pinned Ansible release as an external configuration runner for
two independently authored Vault files:

- `infra/ansible/playbooks/vault-host.yml`
- `infra/ansible/roles/vault-host/tasks/main.yml`

The playbook may validate an approved host, materialize reviewed configuration,
verify immutable image/config hashes, and invoke Docker Compose. It may not
copy GPL source/tests, create provider resources, generate or print secrets,
bootstrap an unpinned package, or relax the gateway/sandbox topology.

This is configuration-language reuse, not an Ansible fork or code port.
Executing against a real host remains blocked until the operator supplies the
approved-host and image receipts.

### pgBackRest 2.59.0 — reject for the SF20 baseline

The source, license, and upstream backup behavior stay pinned for L0 research,
but no pgBackRest package, service, configuration, source, or test is added.
For this scale the selected recovery set is:

1. managed-provider PostgreSQL PITR receipt;
2. PostgreSQL 16 native `pg_dump` custom-format portable backup;
3. native `pg_restore` into an isolated PostgreSQL 16 target;
4. exact object-version inventory and readback;
5. one Ed25519-sealed cross-store manifest.

This deletes a continuously operated backup component while retaining an
independent portable database artifact. Backup success is not accepted as
restore proof.

pgBackRest may be reconsidered only if a later approved topology uses a
self-managed PostgreSQL service, or measured native-tooling evidence violates
the SF20 RPO/RTO/size envelope. That later decision must pin the runtime
artifact, configuration, owner, secret boundary, rollback, residency, and
isolated restore proof.

## Mandatory invariants

- maximum 20 named users and exactly one application node;
- all state and evidence surfaces remain in one approved KR domestic region;
- database/object endpoints are private, encrypted, and TLS-only;
- PostgreSQL 16 PITR, object versioning, exact-version reads, and Object Lock
  are mandatory;
- production secrets are file/provider-mounted-file only;
- RPO is at most 60 minutes and RTO is at most 240 minutes;
- database schema/RLS/FORCE RLS/audit immutability/cross-tenant denial and
  exact object bytes are directly verified after isolated restore;
- Kubernetes, service mesh, self-hosted database, public state endpoints,
  floating images, and provider-resource creation are prohibited.

## Non-claims

This decision does not prove that a region, host, database, bucket, backup,
key, certificate, secret, private endpoint, or staging environment exists. It
does not authorize deployment, release, go-live, cross-region replication, or
production rollback. Synthetic technical evidence and source merge remain
separate from those external claims.
