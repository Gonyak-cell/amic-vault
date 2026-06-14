# Staging Deployment Plan

Status: AWS STAGING DECISIONS APPROVED - DEPLOYMENT NOT EXECUTED

## Purpose

Staging proves that AMIC Vault can be deployed, migrated, smoke-tested, and used
with approved non-production data before any production release attempt.

## Required Decisions

| Decision | Blocker |
|---|---|
| AWS Seoul `ap-northeast-2`; separate staging/prod network boundaries | LRB-001 / STAGE-CLOUD-AWS-001 |
| No custom staging domain; use AWS-managed temporary service or load-balancer target ref | LRB-002 / STAGE-TEMP-TARGET-AWS-001 |
| Amazon ECR with frozen-SHA tags and digest pinning | LRB-003 / STAGE-REGISTRY-ECR-001 |
| AWS Secrets Manager plus KMS with runtime secret names only | LRB-004 / STAGE-SECRETS-AWS-001 |
| CloudWatch Logs, CloudWatch Alarms, and SNS/email alert routing | LRB-008 / STAGE-MONITOR-AWS-001 |

## Approved AWS Target Shape

| Runtime Need | Approved AWS Service |
|---|---|
| API, Web, ingestion worker containers | ECS Fargate or equivalent AWS managed container runtime |
| PostgreSQL database | RDS for PostgreSQL |
| Document/object storage | S3 |
| Container image registry | ECR |
| Runtime secrets and encryption references | Secrets Manager plus KMS |
| Logs, alarms, and incident alerts | CloudWatch plus SNS/email |
| Staging target | AWS-managed temporary service/load-balancer target ref, recorded outside repo |

No AWS account identifiers, private endpoints, secret values, provider-console
screenshots, custom domain values, or real customer data may be committed to
this repository. Production custom domain and TLS ownership remain deferred to
the production gate.

## Preflight

- Main CI green.
- `pnpm launch:readiness` green.
- `pnpm docs:frozen` green.
- Database migration roundtrip green.
- Release-boundary scans green.
- No real data or secret committed.
- Staging target values recorded outside the repository through approved secret
  management.
- AWS resource refs, image digests, and temporary smoke target refs recorded
  only as non-secret evidence refs after provisioning.

## Deployment Flow

1. Build api, web, and ingestion images from the same Git SHA.
   - The web image must include `.next/standalone`, `.next/static`, and
     `public`; `apps/web/Dockerfile` copies all three.
2. Push images to the approved registry.
3. Take a pre-migration staging database snapshot.
4. Acquire the migration lock.
5. Run `pnpm db:migrate`.
6. Deploy the api service.
7. Deploy the web service.
8. Deploy the ingestion worker.
9. Run `pnpm release:smoke` against the approved staging target, including
   static asset, unauthenticated redirect, authenticated dashboard/search,
   protected API, negative role, and audit checks.
10. Run the UAT checklist in `docs/release/uat-checklist.md`.

## Exit Criteria

- All smoke checks pass.
- UAT evidence is recorded.
- Permission, tenant isolation, audit, DLP, external portal, records disposal,
  and AI evidence checks have no critical failures.
- Any failed item is either fixed or recorded as a launch blocker.
