# Production Execution Preflight

Status: BLOCKED - PRODUCTION INFRASTRUCTURE NOT PROVISIONED
Date: 2026-06-14
Evidence Ref: PROD-REL-PREFLIGHT-AWS-2026-06-14-001
Machine Status: blocked-prod-infra

This preflight records the first post-approval production release execution
check after PR #81 merged. It does not deploy production, create production
resources, expose endpoints, or commit provider-console evidence.

## Release State Checked

| Item | Result |
|---|---|
| Current `main` merge SHA | `bb1973d99f0ce09954ef6bdb3a45170a144eaafb` |
| Launch blocker approvals | LRB-005 through LRB-014 approved |
| Main CI after PR #81 merge | green |
| AWS CLI access | available outside the repository through SSO profile |
| AWS region checked | `ap-northeast-2` |
| Customer data scope | synthetic-data-only |

## Non-Secret AWS Discovery Summary

The AWS account currently contains the previously prepared staging environment
classes: staging ECS, staging ECR repositories, staging RDS, staging Secrets
Manager refs, staging ALB, staging object storage, and staging logs.

The production execution preflight did not find production-specific resources
under the expected AMIC Vault production boundary:

| Required Production Class | Preflight Result |
|---|---|
| Production ECS cluster and services | missing |
| Production ECR repositories or approved production image namespace | missing |
| Production PostgreSQL/RDS instance or cluster | missing |
| Production Secrets Manager runtime refs | missing |
| Production object storage bucket | missing |
| Production load balancer, target groups, and listener rules | missing |
| Production log groups, alarms, and notification routing | missing |
| Production migration runner or deployment workflow | missing |

Concrete account IDs, ARNs, private endpoints, secret names beyond already
approved public-safe refs, screenshots, cookies, tokens, and provider-console
metadata are intentionally not recorded in this repository.

## Decision

`REL-PROD-REL-TUW-010` cannot execute yet. Production release approval exists,
but production infrastructure does not.

Do not reuse the AWS staging target as production. That would collapse the
staging/production boundary and would make the production release evidence
ambiguous.

## Required Next Evidence

Before production release execution can resume, record non-secret evidence refs
for:

- production environment boundary and naming policy,
- production ECR/image namespace or digest promotion policy,
- production database and pre-release backup snapshot,
- production runtime secret refs,
- production object storage,
- production load balancer target ref,
- production monitoring and rollback evidence,
- production migration runner or explicit deployment workflow.

Suggested refs:

- `PROD-INFRA-AWS-001`
- `PROD-REGISTRY-AWS-001`
- `PROD-SECRETS-AWS-001`
- `PROD-BACKUP-AWS-001`
- `PROD-DEPLOY-WORKFLOW-AWS-001`
- `PROD-MONITOR-AWS-001`

## Stop Conditions

- A production step would require committing or printing a secret, token,
  private endpoint, account ID, provider-console screenshot, or customer data.
- Production would reuse the staging database, staging secrets, staging object
  storage, or staging load balancer as if they were production.
- Permission, tenant isolation, audit, DLP, records, external portal, or AI
  policy smoke checks cannot be run after deployment.
- A production resource would be created without a non-secret evidence ref and
  rollback path.
