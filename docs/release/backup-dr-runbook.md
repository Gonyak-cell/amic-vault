# Backup And Restore Drill Runbook

## Objective

Verify AMIC Vault backup recoverability for the provider-neutral SF20 production profile.

- SF20 readiness RPO ceiling: 60 minutes, derived from timestamps rather than a declared number.
- Provider operating target: 5 minutes where purchased; this tighter target does not replace the 60-minute readiness Gate.
- RTO: 4 hours or less, measured from restore start to schema and row-count verification.
- Scope: managed PostgreSQL 16 PITR, a PostgreSQL 16 `pg_dump` custom-format backup, exact S3-compatible object versions, and the backup snapshot ledger.
- Evidence boundary: this runbook stores bounded references and SHA-256 hashes only. Do not paste provider ARNs, endpoints, credentials, object keys, document names, or database URLs into audit metadata.

## Monthly Checklist

1. Confirm managed PostgreSQL PITR is enabled and record its trusted restore-point timestamp.
2. Confirm the document object bucket has versioning enabled.
3. Confirm the document object bucket uses managed server-side encryption.
4. Produce a PostgreSQL 16 custom-format portable backup and hash its bytes directly.
5. Capture a bounded inventory of immutable exact object versions.
6. Build and offline-verify one Ed25519-signed `COMPLETE` backup-set manifest.
7. Restore to an isolated drill database and read back every selected exact object version.
8. Record the verified drill manifest through `/v1/enterprise/backups/snapshots`.
9. Store raw provider receipts outside the repository and retain only opaque references and fingerprints.

## Provider Evidence Example

The following is an AWS-shaped example only. Equivalent managed-provider receipts are acceptable when they satisfy the same bounded contract. Run with read-only credentials and keep raw output outside the repository.

```bash
aws rds describe-db-instances \
  --db-instance-identifier "$RDS_INSTANCE_ID" \
  --query 'DBInstances[0].{backupRetentionPeriod:BackupRetentionPeriod,latestRestorableTime:LatestRestorableTime,storageEncrypted:StorageEncrypted}'

aws s3api get-bucket-versioning \
  --bucket "$DOCUMENT_BUCKET"

aws s3api get-bucket-encryption \
  --bucket "$DOCUMENT_BUCKET"
```

Pass criteria:

- `backupRetentionPeriod` is at least 7.
- `latestRestorableTime` is no older than 5 minutes at the time of evidence capture.
- `storageEncrypted` is `true`.
- S3 versioning status is `Enabled`.
- S3 default encryption is configured with SSE-S3 or SSE-KMS.

## Signed Backup-set Procedure

The input to `build-backup-set-manifest.mjs` is a closed JSON document. It contains only:

- one opaque backup-set ID, country/region, capture start/end, and the exact production-profile fingerprint;
- database and object-store target fingerprints;
- a bounded PITR receipt with an opaque reference and restore-point timestamp;
- PostgreSQL major `16`, custom-format portable-backup hash and byte count;
- one or more immutable, encrypted, exact-version object entries with opaque reference, version fingerprint, hash, byte count, and capture time.

It must not contain a receipt body, URL, provider account, endpoint, tenant/document identifier, object key, credential, or content. The signing key is an owner-only Ed25519 private-key file; the independently supplied public key is the offline trust anchor.

```bash
node tools/release/build-backup-set-manifest.mjs \
  --input "$BOUNDED_BACKUP_SET_INPUT" \
  --portable-backup "$PORTABLE_PG_DUMP" \
  --signing-key "$BACKUP_SIGNING_PRIVATE_KEY_FILE" \
  --verification-key "$BACKUP_SIGNING_PUBLIC_KEY_FILE" \
  --approved-region "$APPROVED_REGION_CODE" \
  --profile-fingerprint "$PRODUCTION_PROFILE_SHA256" \
  --output "$COMPLETE_BACKUP_SET_MANIFEST"
```

The tool hashes the portable backup through a bounded stream, canonicalizes the unsigned payload, signs with Ed25519, verifies with the expected public key, and only then creates the output. An existing output is never overwritten. Database-only, object-only, unsigned, stale, cross-region, mutable/latest-object, or revoked-key inputs fail without a partial-success status.

Local tests prove the contract using synthetic metadata. Until an approved region, provider receipts, actual portable backup, exact-version inventory, and signing custody are supplied, the operational state remains `EXTERNAL_BLOCKED_BACKUP_SET_INPUT_REQUIRED`.

## Restore Drill Procedure

1. Restore the selected recovery point into a disposable database in an isolated subnet/security group.
2. Restore the PostgreSQL 16 custom-format backup and confirm its migration level without changing the primary database.
3. Create a separate connection as the application runtime role. The runtime role must not be an owner, superuser, or `BYPASSRLS` role.
4. Block all application traffic to the restored database. Do not set the whole database to read-only: the drill must prove that the audit table itself rejects `UPDATE` and `DELETE` with SQLSTATE `42501`. Both attempts run inside savepoints and the enclosing transaction is rolled back.
5. Supply an operator-owned exact-version adapter. It must expose only an `exact-version` read operation bound to the signed manifest reference and version fingerprint; a current/latest read is not accepted.
6. Supply teardown and cleanup-verification callbacks for the disposable database and object fixture. The snapshot ledger is not called until cleanup is verified.
7. Invoke the tool through that adapter:

```bash
node tools/release/backup-restore-drill.mjs \
  --primary-database-url "$PRIMARY_DATABASE_URL" \
  --restored-database-url "$RESTORED_DATABASE_URL" \
  --restored-runtime-database-url "$RESTORED_RUNTIME_DATABASE_URL" \
  --tenant-id "$TENANT_ID" \
  --other-tenant-id "$SYNTHETIC_OTHER_TENANT_ID" \
  --backup-set-manifest "$COMPLETE_BACKUP_SET_MANIFEST" \
  --verification-key "$BACKUP_SIGNING_PUBLIC_KEY_FILE" \
  --approved-region "$APPROVED_REGION_CODE" \
  --profile-fingerprint "$PRODUCTION_PROFILE_SHA256" \
  --api-base-url "$API_BASE_URL" \
  --session-cookie "$AMIC_SESSION_COOKIE" \
  --reason-code MONTHLY_DRILL \
  --drill-id "restore-drill-$(date +%F)" \
  --evidence-ref "$EXTERNAL_EVIDENCE_REF"
```

The command-line module deliberately does not load a provider SDK or infer object paths. An operator wrapper imports `main`, injects the exact-version reader and teardown callbacks, and forwards the arguments above. Calling the CLI without that adapter fails with `external_restore_adapter_required`. Use `--dry-run` to perform every direct proof and cleanup without recording the snapshot ledger.

The tool verifies:

- The Ed25519 signature, trust-anchor fingerprint, region, and production-profile fingerprint of the sealed backup set.
- Primary and restored schema hashes and all core tenant row counts.
- Every required tenant table exists and has RLS, FORCE RLS, and at least one policy.
- The non-owner runtime role cannot update or delete audit rows and changes zero rows.
- A synthetic tenant context sees zero rows for a different synthetic tenant, or receives the closed `42501` denial.
- Every selected object is read by exact version, streamed under a cap, and matches the sealed version fingerprint, SHA-256, and byte count.
- Disposable database/object resources are torn down and cleanup is verified before the manifest can be marked `verified` or posted.

The bounded result includes table names, counts, hashes, and verdicts. It omits database URLs, session cookies, raw tenant IDs, object references/keys, provider details, and object content.

## Failure Handling

- Schema hash mismatch: stop the drill, retain only bounded external diagnostics, tear down the disposable target, and compare migration state before a clean retry.
- Row-count mismatch: stop the drill and compare the listed table counts. Do not mark the snapshot verified.
- RLS, FORCE RLS, policy, runtime-role, audit, tenant-context, or cross-tenant failure: reject the restore and investigate the restored role/catalog; never rerun as owner or disable a policy/trigger.
- Object version/hash/size/missing/truncated/oversized failure: reject the entire backup set. Do not substitute latest/current object bytes.
- Cleanup failure: treat the drill as failed and remove the isolated resources before any retry.
- API ledger failure: keep the printed manifest, fix the admin session or API availability issue, then rerun with the same `--drill-id`.
- RPO or RTO miss: record an incident ticket and do not mark the monthly drill as passing until the cause is remediated.

## Ledger Fields

The snapshot ledger stores these drill fields:

| Field                   | Meaning                                                |
| ----------------------- | ------------------------------------------------------ |
| `status`                | `verified` only after schema and row-count checks pass |
| `drill_id`              | Bounded monthly drill reference                        |
| `drill_evidence_ref`    | Bounded external evidence-vault reference              |
| `drill_manifest_hash`   | SHA-256 hash of the verification manifest              |
| `schema_hash`           | Primary schema hash                                    |
| `restored_schema_hash`  | Restored schema hash                                   |
| `row_counts_drift_hash` | SHA-256 hash of the table drift vector                 |

`NoopEncryptionHook` intentionally leaves `encryption_key_id` null. For this internal profile, the marker means managed at-rest encryption is delegated to S3 SSE and RDS storage encryption rather than per-object envelope encryption.
