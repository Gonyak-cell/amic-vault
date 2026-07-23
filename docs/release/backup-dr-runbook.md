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

1. Restore the RDS snapshot or point-in-time recovery target into an isolated subnet/security group.
2. Apply the same migration level as primary if the restore target was created from an older recovery point.
3. Block application traffic to the restored database. The restore target is read-only for drill verification.
4. Run the drill tool:

```bash
node tools/release/backup-restore-drill.mjs \
  --primary-database-url "$PRIMARY_DATABASE_URL" \
  --restored-database-url "$RESTORED_DATABASE_URL" \
  --tenant-id "$TENANT_ID" \
  --api-base-url "$API_BASE_URL" \
  --session-cookie "$AMIC_SESSION_COOKIE" \
  --reason-code MONTHLY_DRILL \
  --drill-id "restore-drill-$(date +%F)" \
  --evidence-ref "$EXTERNAL_EVIDENCE_REF"
```

Use `--dry-run` before recording if the restored database is still being checked.

The tool verifies:

- Primary and restored schema hashes match the query set used by `tools/db/schema-hash.mjs`.
- Core tenant row counts match for the enterprise backup snapshot table set.
- The manifest hash and drill fields are recorded in the existing backup snapshot ledger.

## Failure Handling

- Schema hash mismatch: stop the drill, keep the restored database intact, and compare migration state before retrying.
- Row-count mismatch: stop the drill and compare the listed table counts. Do not mark the snapshot verified.
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
