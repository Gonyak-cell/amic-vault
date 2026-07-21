# Backup And Restore Drill Runbook

## Objective

Verify AMIC Vault backup recoverability for internal operations.

- RPO: 5 minutes or less, measured by RDS latest restorable time.
- RTO: 4 hours or less, measured from restore start to schema and row-count verification.
- Scope: PostgreSQL RDS, S3-compatible object storage, and the tenant backup snapshot ledger.
- Evidence boundary: this runbook stores bounded references and SHA-256 hashes only. Do not paste provider ARNs, endpoints, credentials, object keys, document names, or database URLs into audit metadata.

## Monthly Checklist

1. Confirm RDS automated backups are enabled and the latest restorable time is within 5 minutes.
2. Confirm the document object bucket has versioning enabled.
3. Confirm the document object bucket uses managed server-side encryption.
4. Restore RDS to an isolated drill database.
5. Point the drill tool at the primary and restored databases.
6. Record the verified manifest through `/v1/enterprise/backups/snapshots`.
7. Store the provider screenshots or CLI output in the external evidence vault and record only its bounded evidence reference.

## AWS Evidence Commands

Run these from an operator shell with read-only AWS credentials for the target account. Replace placeholders locally and keep raw output outside the repo.

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
