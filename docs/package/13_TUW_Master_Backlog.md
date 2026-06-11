# 13. TUW Master Backlog

## 1. 목적

이 문서는 Vault 개발팀이 실제 티켓으로 변환할 수 있는 Testable Unit of Work 목록입니다. 각 TUW는 독립 구현·검증 가능한 최소 실행 단위를 목표로 합니다. 실제 repository 파일경로는 R0에서 repo 구조가 확정된 후 Agent Work Contract에 보정해야 합니다.

## 2. TUW 표준 필드

| 필드 | 설명 |
|---|---|
| Work ID | 고유 작업번호 |
| Pillar / Domain / Module | 상위 구조 |
| Objective | 작업 목적 |
| Outputs | 산출물 |
| Dependencies | 선행 작업 |
| Risk | Low / Medium / High / Critical |
| Model Routing | Risk-based 모델 배정 |
| Verification | Verification Contract 요약 |
| Escalation | 중단·상위검토 조건 |

## 3. 전체 TUW 목록

## P0. Development Operating System

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| DEVOPS-DEVECONS-CONSMANA-TUW-001 | Development Constitution | Constitution Manager | Product Constitution 초안 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-DEVECONS-CONSMANA-TUW-002 | Development Constitution | Constitution Manager | Data Constitution 초안 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-DEVECONS-CONSMANA-TUW-003 | Development Constitution | Constitution Manager | Security Constitution 초안 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-DEVECONS-CONSMANA-TUW-004 | Development Constitution | Constitution Manager | AI Constitution 초안 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-DEVECONS-CONSMANA-TUW-005 | Development Constitution | Constitution Manager | Verification Constitution 초안 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-DEVECONS-CONSMANA-TUW-006 | Development Constitution | Constitution Manager | Release Constitution 초안 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-DEVECONS-CONSMANA-TUW-007 | Development Constitution | Constitution Manager | Ledger Constitution 초안 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-WORKCONT-AGENWORKCO-TUW-001 | Work Contracting | Agent Work Contract Builder | Agent Work Contract 표준 필드 정의 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-WORKCONT-AGENWORKCO-TUW-002 | Work Contracting | Agent Work Contract Builder | Readiness Gate checklist 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-WORKCONT-AGENWORKCO-TUW-003 | Work Contracting | Agent Work Contract Builder | Completion Gate checklist 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-WORKCONT-AGENWORKCO-TUW-004 | Work Contracting | Agent Work Contract Builder | TUW risk level classifier 정의 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-WORKCONT-AGENWORKCO-TUW-005 | Work Contracting | Agent Work Contract Builder | Work Contract validation rule 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-WORKCONT-AGENWORKCO-TUW-006 | Work Contracting | Agent Work Contract Builder | Work Contract sample 10건 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-LEDG-LEDGSYST-TUW-001 | Ledger | Ledger System | Decision Ledger schema 작성 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-LEDG-LEDGSYST-TUW-002 | Ledger | Ledger System | Execution Ledger schema 작성 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-LEDG-LEDGSYST-TUW-003 | Ledger | Ledger System | Learning Ledger schema 작성 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-LEDG-LEDGSYST-TUW-004 | Ledger | Ledger System | Ledger record search 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-LEDG-LEDGSYST-TUW-005 | Ledger | Ledger System | Ledger update workflow 정의 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P1. Foundation & SaaS Core

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CORE-REPOBUIL-CICD-TUW-001 | Repository & Build | CI/CD | monorepo skeleton 구성 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-REPOBUIL-CICD-TUW-002 | Repository & Build | CI/CD | backend/frontend/shared package 분리 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-REPOBUIL-CICD-TUW-003 | Repository & Build | CI/CD | lint/test/build CI 구성 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-REPOBUIL-CICD-TUW-004 | Repository & Build | CI/CD | staging deployment pipeline 구성 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-REPOBUIL-CICD-TUW-005 | Repository & Build | CI/CD | production deployment gate skeleton 구성 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-DATACORE-MIGR-TUW-001 | Database Core | Migration | PostgreSQL migration tool 설정 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-DATACORE-MIGR-TUW-002 | Database Core | Migration | initial schema migration 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-DATACORE-MIGR-TUW-003 | Database Core | Migration | seed data loader 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-DATACORE-MIGR-TUW-004 | Database Core | Migration | migration rollback 절차 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-DATACORE-MIGR-TUW-005 | Database Core | Migration | tenant_id 포함 migration convention 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-AUTHCORE-USERSESS-TUW-001 | Auth Core | User Session | User schema 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-AUTHCORE-USERSESS-TUW-002 | Auth Core | User Session | login API skeleton 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-AUTHCORE-USERSESS-TUW-003 | Auth Core | User Session | session middleware 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-AUTHCORE-USERSESS-TUW-004 | Auth Core | User Session | MFA flag field 추가 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-AUTHCORE-USERSESS-TUW-005 | Auth Core | User Session | password reset flow skeleton 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-TENACORE-TENACONT-TUW-001 | Tenant Core | Tenant Context | Tenant schema 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-TENACORE-TENACONT-TUW-002 | Tenant Core | Tenant Context | tenant context middleware 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-TENACORE-TENACONT-TUW-003 | Tenant Core | Tenant Context | workspace model 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-TENACORE-TENACONT-TUW-004 | Tenant Core | Tenant Context | cross-tenant access test 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-TENACORE-TENACONT-TUW-005 | Tenant Core | Tenant Context | tenant settings API 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-OBSE-LOGGMETR-TUW-001 | Observability | Logging Metrics | structured logger 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-OBSE-LOGGMETR-TUW-002 | Observability | Logging Metrics | request correlation id 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-OBSE-LOGGMETR-TUW-003 | Observability | Logging Metrics | health check endpoint 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-OBSE-LOGGMETR-TUW-004 | Observability | Logging Metrics | metrics endpoint 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-OBSE-LOGGMETR-TUW-005 | Observability | Logging Metrics | error tracking hook 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P2. Matter-Centric Core

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| MATTER-CLIEMANA-CLIEREGI-TUW-001 | Client Management | Client Registry | Client schema 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-CLIEMANA-CLIEREGI-TUW-002 | Client Management | Client Registry | client create API 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-CLIEMANA-CLIEREGI-TUW-003 | Client Management | Client Registry | client detail API 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-CLIEMANA-CLIEREGI-TUW-004 | Client Management | Client Registry | client list filtering 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-CLIEMANA-CLIEREGI-TUW-005 | Client Management | Client Registry | client metadata editor 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTMANA-MATTREGI-TUW-001 | Matter Management | Matter Registry | Matter schema 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTMANA-MATTREGI-TUW-002 | Matter Management | Matter Registry | Matter create API 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTMANA-MATTREGI-TUW-003 | Matter Management | Matter Registry | Matter type taxonomy enum 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTMANA-MATTREGI-TUW-004 | Matter Management | Matter Registry | Matter metadata validation 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTMANA-MATTREGI-TUW-005 | Matter Management | Matter Registry | Matter detail API 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTMANA-MATTREGI-TUW-006 | Matter Management | Matter Registry | Matter list pagination 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTMANA-MATTREGI-TUW-007 | Matter Management | Matter Registry | Matter status badge UI 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTTEAM-MEMBMANA-TUW-001 | Matter Team | Member Manager | Matter member schema 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTTEAM-MEMBMANA-TUW-002 | Matter Team | Member Manager | member add API 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTTEAM-MEMBMANA-TUW-003 | Matter Team | Member Manager | member remove API 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTTEAM-MEMBMANA-TUW-004 | Matter Team | Member Manager | matter role assignment 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTTEAM-MEMBMANA-TUW-005 | Matter Team | Member Manager | matter team UI 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTTEAM-MEMBMANA-TUW-006 | Matter Team | Member Manager | member change audit hook 연결 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTLIFE-STATENGI-TUW-001 | Matter Lifecycle | State Engine | Matter state enum 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTLIFE-STATENGI-TUW-002 | Matter Lifecycle | State Engine | state transition validation 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTLIFE-STATENGI-TUW-003 | Matter Lifecycle | State Engine | closing state action 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTLIFE-STATENGI-TUW-004 | Matter Lifecycle | State Engine | archive state action 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTLIFE-STATENGI-TUW-005 | Matter Lifecycle | State Engine | closed matter mutation 제한 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-PARTMANA-PARTREGI-TUW-001 | Party Management | Party Registry | Party schema 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-PARTMANA-PARTREGI-TUW-002 | Party Management | Party Registry | party role taxonomy 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-PARTMANA-PARTREGI-TUW-003 | Party Management | Party Registry | party create API 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-PARTMANA-PARTREGI-TUW-004 | Party Management | Party Registry | party-to-matter link 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-PARTMANA-PARTREGI-TUW-005 | Party Management | Party Registry | restricted party marker 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P3. Document Vault

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| DOC-DOCUUPLO-UPLOAPI-TUW-001 | Document Upload | Upload API | document upload API 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUUPLO-UPLOAPI-TUW-002 | Document Upload | Upload API | multipart parser 설정 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUUPLO-UPLOAPI-TUW-003 | Document Upload | Upload API | file extension validation 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUUPLO-UPLOAPI-TUW-004 | Document Upload | Upload API | MIME type validation 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUUPLO-UPLOAPI-TUW-005 | Document Upload | Upload API | file size validation 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUUPLO-UPLOAPI-TUW-006 | Document Upload | Upload API | upload permission check 연결 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUUPLO-UPLOAPI-TUW-007 | Document Upload | Upload API | upload error response 표준화 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUUPLO-UPLOAPI-TUW-008 | Document Upload | Upload API | bulk upload job skeleton 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUSTOR-OBJESTORAD-TUW-001 | Document Storage | Object Storage Adapter | object storage adapter 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUSTOR-OBJESTORAD-TUW-002 | Document Storage | Object Storage Adapter | storage path resolver 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUSTOR-OBJESTORAD-TUW-003 | Document Storage | Object Storage Adapter | file object record 생성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUSTOR-OBJESTORAD-TUW-004 | Document Storage | Object Storage Adapter | storage failure rollback 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUSTOR-OBJESTORAD-TUW-005 | Document Storage | Object Storage Adapter | encrypted storage hook interface 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUINTE-HASHDUPL-TUW-001 | Document Integrity | Hash Duplicate | SHA-256 hash 생성 함수 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUINTE-HASHDUPL-TUW-002 | Document Integrity | Hash Duplicate | DocumentVersion.hash 저장 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUINTE-HASHDUPL-TUW-003 | Document Integrity | Hash Duplicate | 동일 hash 중복 후보 탐지 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUINTE-HASHDUPL-TUW-004 | Document Integrity | Hash Duplicate | immutable original policy 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUINTE-HASHDUPL-TUW-005 | Document Integrity | Hash Duplicate | hash mismatch alert 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUMETA-METAEXTR-TUW-001 | Document Metadata | Metadata Extractor | Document metadata schema 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUMETA-METAEXTR-TUW-002 | Document Metadata | Metadata Extractor | document type enum 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUMETA-METAEXTR-TUW-003 | Document Metadata | Metadata Extractor | filename metadata parser 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUMETA-METAEXTR-TUW-004 | Document Metadata | Metadata Extractor | manual metadata editor API 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUMETA-METAEXTR-TUW-005 | Document Metadata | Metadata Extractor | metadata change audit 연결 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUMETA-METAEXTR-TUW-006 | Document Metadata | Metadata Extractor | document status enum 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUVERS-VERSRESO-TUW-001 | Document Versioning | Version Resolver | DocumentVersion schema 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUVERS-VERSRESO-TUW-002 | Document Versioning | Version Resolver | document_family_id 생성 규칙 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUVERS-VERSRESO-TUW-003 | Document Versioning | Version Resolver | version_no 계산 함수 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUVERS-VERSRESO-TUW-004 | Document Versioning | Version Resolver | new version upload API 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUVERS-VERSRESO-TUW-005 | Document Versioning | Version Resolver | version list API 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUVERS-VERSRESO-TUW-006 | Document Versioning | Version Resolver | superseded version 표시 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUVERS-VERSRESO-TUW-007 | Document Versioning | Version Resolver | version status filter 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-OCRTEXTEXT-EXTRWORK-TUW-001 | OCR Text Extraction | Extraction Worker | extraction job queue 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-OCRTEXTEXT-EXTRWORK-TUW-002 | OCR Text Extraction | Extraction Worker | PDF text extractor adapter 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-OCRTEXTEXT-EXTRWORK-TUW-003 | OCR Text Extraction | Extraction Worker | DOCX text extractor adapter 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-OCRTEXTEXT-EXTRWORK-TUW-004 | OCR Text Extraction | Extraction Worker | OCR pending status 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-OCRTEXTEXT-EXTRWORK-TUW-005 | OCR Text Extraction | Extraction Worker | extraction confidence 저장 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-OCRTEXTEXT-EXTRWORK-TUW-006 | OCR Text Extraction | Extraction Worker | extraction failure retry 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCULIFE-LIFEMANA-TUW-001 | Document Lifecycle | Lifecycle Manager | soft delete 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCULIFE-LIFEMANA-TUW-002 | Document Lifecycle | Lifecycle Manager | restore 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCULIFE-LIFEMANA-TUW-003 | Document Lifecycle | Lifecycle Manager | legal hold delete block hook 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCULIFE-LIFEMANA-TUW-004 | Document Lifecycle | Lifecycle Manager | archived document mutation 제한 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCULIFE-LIFEMANA-TUW-005 | Document Lifecycle | Lifecycle Manager | download audit 연결 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCULIFE-LIFEMANA-TUW-006 | Document Lifecycle | Lifecycle Manager | view audit 연결 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P4. Permission & Security Governance

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| SEC-RBAC-ROLEMATR-TUW-001 | RBAC | Role Matrix | role enum 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-RBAC-ROLEMATR-TUW-002 | RBAC | Role Matrix | role permission matrix 작성 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-RBAC-ROLEMATR-TUW-003 | RBAC | Role Matrix | role assignment API 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-RBAC-ROLEMATR-TUW-004 | RBAC | Role Matrix | role change audit 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-RBAC-ROLEMATR-TUW-005 | RBAC | Role Matrix | admin-only route guard 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-MATTPERM-ACCECONT-TUW-001 | Matter Permission | Access Control | canReadMatter 함수 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-MATTPERM-ACCECONT-TUW-002 | Matter Permission | Access Control | canEditMatter 함수 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-MATTPERM-ACCECONT-TUW-003 | Matter Permission | Access Control | canUploadToMatter 함수 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-MATTPERM-ACCECONT-TUW-004 | Matter Permission | Access Control | Matter member 아닌 사용자 접근 차단 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-MATTPERM-ACCECONT-TUW-005 | Matter Permission | Access Control | Matter search permission filter 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-MATTPERM-ACCECONT-TUW-006 | Matter Permission | Access Control | fail closed permission wrapper 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-DOCUPERM-ACCECONT-TUW-001 | Document Permission | Access Control | canReadDocument 함수 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-DOCUPERM-ACCECONT-TUW-002 | Document Permission | Access Control | canDownloadDocument 함수 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-DOCUPERM-ACCECONT-TUW-003 | Document Permission | Access Control | document confidentiality policy 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-DOCUPERM-ACCECONT-TUW-004 | Document Permission | Access Control | download reason requirement 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-DOCUPERM-ACCECONT-TUW-005 | Document Permission | Access Control | document permission UI 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-DOCUPERM-ACCECONT-TUW-006 | Document Permission | Access Control | permission denied safe message 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-ETHIWALL-WALLENFO-TUW-001 | Ethical Wall | Wall Enforcement | EthicalWall schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-ETHIWALL-WALLENFO-TUW-002 | Ethical Wall | Wall Enforcement | wall membership schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-ETHIWALL-WALLENFO-TUW-003 | Ethical Wall | Wall Enforcement | wall create API 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-ETHIWALL-WALLENFO-TUW-004 | Ethical Wall | Wall Enforcement | wall enforcement in document access | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-ETHIWALL-WALLENFO-TUW-005 | Ethical Wall | Wall Enforcement | wall enforcement in search | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-ETHIWALL-WALLENFO-TUW-006 | Ethical Wall | Wall Enforcement | wall enforcement in AI retrieval | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-ETHIWALL-WALLENFO-TUW-007 | Ethical Wall | Wall Enforcement | wall bypass break-glass workflow skeleton 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-DLP-SENSDATADE-TUW-001 | DLP | Sensitive Data Detector | 주민등록번호 탐지 rule 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-DLP-SENSDATADE-TUW-002 | DLP | Sensitive Data Detector | 계좌번호 탐지 rule 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-DLP-SENSDATADE-TUW-003 | DLP | Sensitive Data Detector | 이메일/전화번호 탐지 rule 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-DLP-SENSDATADE-TUW-004 | DLP | Sensitive Data Detector | DLP finding schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-DLP-SENSDATADE-TUW-005 | DLP | Sensitive Data Detector | external sharing DLP warning 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-DLP-SENSDATADE-TUW-006 | DLP | Sensitive Data Detector | AI external model DLP block hook 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P5. Audit & Compliance Ledger

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| AUDIT-AUDIEVENCO-AUDILOGG-TUW-001 | Audit Event Core | Audit Logger | AuditEvent schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AUDIEVENCO-AUDILOGG-TUW-002 | Audit Event Core | Audit Logger | audit logger service 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AUDIEVENCO-AUDILOGG-TUW-003 | Audit Event Core | Audit Logger | audit metadata normalizer 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AUDIEVENCO-AUDILOGG-TUW-004 | Audit Event Core | Audit Logger | append-only constraint 설계 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AUDIEVENCO-AUDILOGG-TUW-005 | Audit Event Core | Audit Logger | audit event retention label 연결 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-DOCUAUDI-DOCUEVEN-TUW-001 | Document Audit | Document Events | DOCUMENT_UPLOADED audit 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-DOCUAUDI-DOCUEVEN-TUW-002 | Document Audit | Document Events | DOCUMENT_VIEWED audit 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-DOCUAUDI-DOCUEVEN-TUW-003 | Document Audit | Document Events | DOCUMENT_DOWNLOADED audit 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-DOCUAUDI-DOCUEVEN-TUW-004 | Document Audit | Document Events | DOCUMENT_DELETED audit 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-DOCUAUDI-DOCUEVEN-TUW-005 | Document Audit | Document Events | document audit query API 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AIAUDI-AIEVEN-TUW-001 | AI Audit | AI Events | AI_QUERY_SUBMITTED audit 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AIAUDI-AIEVEN-TUW-002 | AI Audit | AI Events | AI_RETRIEVAL audit 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AIAUDI-AIEVEN-TUW-003 | AI Audit | AI Events | AI_RESPONSE audit 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AIAUDI-AIEVEN-TUW-004 | AI Audit | AI Events | cited document log 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AIAUDI-AIEVEN-TUW-005 | AI Audit | AI Events | excluded retrieval count metadata 저장 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AUDICONS-CONS-TUW-001 | Audit Console | Console | audit search API 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AUDICONS-CONS-TUW-002 | Audit Console | Console | actor/action/date filter 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AUDICONS-CONS-TUW-003 | Audit Console | Console | target resource filter 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AUDICONS-CONS-TUW-004 | Audit Console | Console | audit export CSV 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AUDICONS-CONS-TUW-005 | Audit Console | Console | audit console UI 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P6. Search & Retrieval

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| SEARCH-SEARINDE-INDE-TUW-001 | Search Indexing | Indexer | search index schema 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-SEARINDE-INDE-TUW-002 | Search Indexing | Indexer | document indexing job enqueue | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-SEARINDE-INDE-TUW-003 | Search Indexing | Indexer | index update on metadata change | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-SEARINDE-INDE-TUW-004 | Search Indexing | Indexer | reindex manager skeleton | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-SEARINDE-INDE-TUW-005 | Search Indexing | Indexer | index failure retry 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-METASEAR-FILT-TUW-001 | Metadata Search | Filters | matterId filter 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-METASEAR-FILT-TUW-002 | Metadata Search | Filters | clientId filter 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-METASEAR-FILT-TUW-003 | Metadata Search | Filters | documentType filter 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-METASEAR-FILT-TUW-004 | Metadata Search | Filters | date range filter 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-METASEAR-FILT-TUW-005 | Metadata Search | Filters | version status filter 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-FULLSEAR-TEXTQUER-TUW-001 | Full-text Search | Text Query | full-text query API 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-FULLSEAR-TEXTQUER-TUW-002 | Full-text Search | Text Query | snippet generator 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-FULLSEAR-TEXTQUER-TUW-003 | Full-text Search | Text Query | highlighting 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-FULLSEAR-TEXTQUER-TUW-004 | Full-text Search | Text Query | deleted document exclusion 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-FULLSEAR-TEXTQUER-TUW-005 | Full-text Search | Text Query | search audit event 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-PERMSEAR-PERMFILT-TUW-001 | Permission-bound Search | Permission Filter | search query에 matter permission filter 주입 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-PERMSEAR-PERMFILT-TUW-002 | Permission-bound Search | Permission Filter | document permission filter 주입 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-PERMSEAR-PERMFILT-TUW-003 | Permission-bound Search | Permission Filter | ethical wall filter 주입 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-PERMSEAR-PERMFILT-TUW-004 | Permission-bound Search | Permission Filter | permission filter regression test 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-PERMSEAR-PERMFILT-TUW-005 | Permission-bound Search | Permission Filter | metadata leakage test 작성 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-SEMASEAR-VECT-TUW-001 | Semantic Search | Vector | embedding job skeleton 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-SEMASEAR-VECT-TUW-002 | Semantic Search | Vector | vector index table/collection 설계 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-SEMASEAR-VECT-TUW-003 | Semantic Search | Vector | similarity search API 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-SEMASEAR-VECT-TUW-004 | Semantic Search | Vector | hybrid score combiner 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-SEMASEAR-VECT-TUW-005 | Semantic Search | Vector | semantic result permission filter 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P7. Email Vault

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| EMAIL-EMAIINGE-PARS-TUW-001 | Email Ingestion | Parser | EmailMessage schema 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAIINGE-PARS-TUW-002 | Email Ingestion | Parser | EML parser adapter 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAIINGE-PARS-TUW-003 | Email Ingestion | Parser | MSG parser adapter skeleton 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAIINGE-PARS-TUW-004 | Email Ingestion | Parser | raw email file storage 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAIINGE-PARS-TUW-005 | Email Ingestion | Parser | messageId duplicate block 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAIMETA-NORM-TUW-001 | Email Metadata | Normalizer | header extractor 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAIMETA-NORM-TUW-002 | Email Metadata | Normalizer | participant normalize 함수 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAIMETA-NORM-TUW-003 | Email Metadata | Normalizer | sent/received date normalize 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAIMETA-NORM-TUW-004 | Email Metadata | Normalizer | external participant flag 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAIMETA-NORM-TUW-005 | Email Metadata | Normalizer | email metadata audit 연결 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-ATTAHAND-ATTALINK-TUW-001 | Attachment Handling | Attachment Linker | attachment metadata extractor 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-ATTAHAND-ATTALINK-TUW-002 | Attachment Handling | Attachment Linker | attachment file object 생성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-ATTAHAND-ATTALINK-TUW-003 | Attachment Handling | Attachment Linker | attachment를 Document로 저장 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-ATTAHAND-ATTALINK-TUW-004 | Attachment Handling | Attachment Linker | email attachment-document link 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-ATTAHAND-ATTALINK-TUW-005 | Attachment Handling | Attachment Linker | attachment duplicate hash 처리 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-MATTFILI-FILIENGI-TUW-001 | Matter Filing | Filing Engine | manual filing API 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-MATTFILI-FILIENGI-TUW-002 | Matter Filing | Filing Engine | matter recommendation by subject 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-MATTFILI-FILIENGI-TUW-003 | Matter Filing | Filing Engine | matter recommendation by participant domain 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-MATTFILI-FILIENGI-TUW-004 | Matter Filing | Filing Engine | email filing audit 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-MATTFILI-FILIENGI-TUW-005 | Matter Filing | Filing Engine | email timeline item 생성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAISECU-EMAIDLP-TUW-001 | Email Security | Email DLP | external recipient warning 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAISECU-EMAIDLP-TUW-002 | Email Security | Email DLP | attachment DLP scan hook 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAISECU-EMAIDLP-TUW-003 | Email Security | Email DLP | privilege tag suggestion 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAISECU-EMAIDLP-TUW-004 | Email Security | Email DLP | wrong matter filing warning skeleton 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P8. AI Knowledge Layer

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| AI-AIPOLI-POLIEVAL-TUW-001 | AI Policy | Policy Evaluator | Matter.aiPolicy enum 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIPOLI-POLIEVAL-TUW-002 | AI Policy | Policy Evaluator | Document.aiAllowed field 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIPOLI-POLIEVAL-TUW-003 | AI Policy | Policy Evaluator | AI policy evaluator 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIPOLI-POLIEVAL-TUW-004 | AI Policy | Policy Evaluator | AI blocked response 표준화 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIPOLI-POLIEVAL-TUW-005 | AI Policy | Policy Evaluator | model access policy table 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIRETR-RETRORCH-TUW-001 | AI Retrieval | Retrieval Orchestrator | question type classifier 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIRETR-RETRORCH-TUW-002 | AI Retrieval | Retrieval Orchestrator | metadata filter builder 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIRETR-RETRORCH-TUW-003 | AI Retrieval | Retrieval Orchestrator | hybrid retrieval orchestrator skeleton | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIRETR-RETRORCH-TUW-004 | AI Retrieval | Retrieval Orchestrator | permission-bound retrieval filter 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIRETR-RETRORCH-TUW-005 | AI Retrieval | Retrieval Orchestrator | redaction preprocessor hook 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIRETR-RETRORCH-TUW-006 | AI Retrieval | Retrieval Orchestrator | retrieval reranker interface 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AICONT-CHUNEVID-TUW-001 | AI Context | Chunk Evidence | parent-child chunk builder 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AICONT-CHUNEVID-TUW-002 | AI Context | Chunk Evidence | chunk provenance schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AICONT-CHUNEVID-TUW-003 | AI Context | Chunk Evidence | context ranker 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AICONT-CHUNEVID-TUW-004 | AI Context | Chunk Evidence | context window manager 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AICONT-CHUNEVID-TUW-005 | AI Context | Chunk Evidence | Evidence Pack schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AICONT-CHUNEVID-TUW-006 | AI Context | Chunk Evidence | Evidence Pack builder 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AISESS-SESSLOGG-TUW-001 | AI Session | Session Logger | AISession schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AISESS-SESSLOGG-TUW-002 | AI Session | Session Logger | prompt hash 저장 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AISESS-SESSLOGG-TUW-003 | AI Session | Session Logger | response hash 저장 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AISESS-SESSLOGG-TUW-004 | AI Session | Session Logger | retrieved chunk log 저장 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AISESS-SESSLOGG-TUW-005 | AI Session | Session Logger | AI session detail API 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-CITA-CITAMAPP-TUW-001 | Citation | Citation Mapper | citation object schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-CITA-CITAMAPP-TUW-002 | Citation | Citation Mapper | chunk-to-source mapper 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-CITA-CITAMAPP-TUW-003 | Citation | Citation Mapper | citedDocumentIds 저장 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-CITA-CITAMAPP-TUW-004 | Citation | Citation Mapper | source panel API 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-CITA-CITAMAPP-TUW-005 | Citation | Citation Mapper | citation verification warning 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIFEAT-SUMM-TUW-001 | AI Features | Summaries | document summary prompt template 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIFEAT-SUMM-TUW-002 | AI Features | Summaries | matter summary prompt template 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIFEAT-SUMM-TUW-003 | AI Features | Summaries | email thread summary template 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIFEAT-SUMM-TUW-004 | AI Features | Summaries | clause analysis template 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIFEAT-SUMM-TUW-005 | AI Features | Summaries | risk extraction template 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-MODEROUT-RISKROUT-TUW-001 | Model Routing | Risk Router | model tier enum 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-MODEROUT-RISKROUT-TUW-002 | Model Routing | Risk Router | task risk classifier 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-MODEROUT-RISKROUT-TUW-003 | Model Routing | Risk Router | local Gemma route 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-MODEROUT-RISKROUT-TUW-004 | Model Routing | Risk Router | external model approval hook 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-MODEROUT-RISKROUT-TUW-005 | Model Routing | Risk Router | escalation flag 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P9. Legal Knowledge Graph

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| GRAPH-GRAPSCHE-NODEEDGETA-TUW-001 | Graph Schema | Node Edge Taxonomy | graph node taxonomy 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-GRAPSCHE-NODEEDGETA-TUW-002 | Graph Schema | Node Edge Taxonomy | graph edge taxonomy 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-GRAPSCHE-NODEEDGETA-TUW-003 | Graph Schema | Node Edge Taxonomy | graph permission model 설계 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-GRAPSCHE-NODEEDGETA-TUW-004 | Graph Schema | Node Edge Taxonomy | graph schema migration 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-NODEMAPP-NODEMAPP-TUW-001 | Node Mapping | Node Mapper | Client node mapper 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-NODEMAPP-NODEMAPP-TUW-002 | Node Mapping | Node Mapper | Matter node mapper 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-NODEMAPP-NODEMAPP-TUW-003 | Node Mapping | Node Mapper | Document node mapper 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-NODEMAPP-NODEMAPP-TUW-004 | Node Mapping | Node Mapper | Clause node mapper 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-NODEMAPP-NODEMAPP-TUW-005 | Node Mapping | Node Mapper | Issue node mapper 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-EDGEBUIL-EDGEBUIL-TUW-001 | Edge Building | Edge Builder | Client-HAS_MATTER edge 생성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-EDGEBUIL-EDGEBUIL-TUW-002 | Edge Building | Edge Builder | Matter-CONTAINS_DOCUMENT edge 생성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-EDGEBUIL-EDGEBUIL-TUW-003 | Edge Building | Edge Builder | Document-HAS_CLAUSE edge 생성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-EDGEBUIL-EDGEBUIL-TUW-004 | Edge Building | Edge Builder | Clause-RELATES_TO-Issue edge 생성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-EDGEBUIL-EDGEBUIL-TUW-005 | Edge Building | Edge Builder | Clause-REFERENCES-Clause edge 생성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-GRAPSYNC-SYNCWORK-TUW-001 | Graph Sync | Sync Worker | event-based graph sync 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-GRAPSYNC-SYNCWORK-TUW-002 | Graph Sync | Sync Worker | graph sync retry queue 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-GRAPSYNC-SYNCWORK-TUW-003 | Graph Sync | Sync Worker | graph consistency checker 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-GRAPSYNC-SYNCWORK-TUW-004 | Graph Sync | Sync Worker | deleted document graph filter 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-GRAPSYNC-SYNCWORK-TUW-005 | Graph Sync | Sync Worker | graph sync audit event 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P10. Contract Intelligence

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CONTRACT-CONTCLAS-CLAS-TUW-001 | Contract Classification | Classifier | contract type enum 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CONTCLAS-CLAS-TUW-002 | Contract Classification | Classifier | language detector 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CONTCLAS-CLAS-TUW-003 | Contract Classification | Classifier | contract type classifier v1 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CONTCLAS-CLAS-TUW-004 | Contract Classification | Classifier | document subtype metadata update 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CONTCLAS-CLAS-TUW-005 | Contract Classification | Classifier | classification confidence 저장 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CONTSTRU-PARS-TUW-001 | Contract Structure | Parser | section heading parser 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CONTSTRU-PARS-TUW-002 | Contract Structure | Parser | clause number regex 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CONTSTRU-PARS-TUW-003 | Contract Structure | Parser | defined term extractor 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CONTSTRU-PARS-TUW-004 | Contract Structure | Parser | cross-reference extractor 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CONTSTRU-PARS-TUW-005 | Contract Structure | Parser | signature block detector 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CLAUEXTR-SEGM-TUW-001 | Clause Extraction | Segmenter | clause segmenter 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CLAUEXTR-SEGM-TUW-002 | Clause Extraction | Segmenter | clause type classifier v1 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CLAUEXTR-SEGM-TUW-003 | Clause Extraction | Segmenter | clause metadata extractor 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CLAUEXTR-SEGM-TUW-004 | Clause Extraction | Segmenter | Clause record create worker 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CLAUEXTR-SEGM-TUW-005 | Clause Extraction | Segmenter | clause extraction verification fixtures 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-REDLANAL-DOCXPARS-TUW-001 | Redline Analysis | DOCX Parser | DOCX w:ins 추출 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-REDLANAL-DOCXPARS-TUW-002 | Redline Analysis | DOCX Parser | DOCX w:del 추출 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-REDLANAL-DOCXPARS-TUW-003 | Redline Analysis | DOCX Parser | DOCX comment 추출 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-REDLANAL-DOCXPARS-TUW-004 | Redline Analysis | DOCX Parser | Change object mapper 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-REDLANAL-DOCXPARS-TUW-005 | Redline Analysis | DOCX Parser | markup summary generator 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-RISKSCOR-RULEENGI-TUW-001 | Risk Scoring | Rule Engine | SPA indemnity rule v1 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-RISKSCOR-RULEENGI-TUW-002 | Risk Scoring | Rule Engine | SHA governance rule v1 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-RISKSCOR-RULEENGI-TUW-003 | Risk Scoring | Rule Engine | investment MFN rule v1 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-RISKSCOR-RULEENGI-TUW-004 | Risk Scoring | Rule Engine | supply IP rule v1 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-RISKSCOR-RULEENGI-TUW-005 | Risk Scoring | Rule Engine | missing clause detector 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CLAUBANK-REPO-TUW-001 | Clause Bank | Repository | clause bank schema 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CLAUBANK-REPO-TUW-002 | Clause Bank | Repository | reusable approval workflow 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CLAUBANK-REPO-TUW-003 | Clause Bank | Repository | fallback clause link 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CLAUBANK-REPO-TUW-004 | Clause Bank | Repository | source matter permission check 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CLAUBANK-REPO-TUW-005 | Clause Bank | Repository | clause bank search UI 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P11. Due Diligence Vault

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| DD-RFIMANA-RFICORE-TUW-001 | RFI Management | RFI Core | RFI schema 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-RFIMANA-RFICORE-TUW-002 | RFI Management | RFI Core | RFI category enum 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-RFIMANA-RFICORE-TUW-003 | RFI Management | RFI Core | RFI status enum 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-RFIMANA-RFICORE-TUW-004 | RFI Management | RFI Core | RFI template import 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-RFIMANA-RFICORE-TUW-005 | RFI Management | RFI Core | RFI list UI 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-DATAROOMMA-RFIDOCULIN-TUW-001 | Data Room Mapping | RFI Document Linker | RFI-document link 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-DATAROOMMA-RFIDOCULIN-TUW-002 | Data Room Mapping | RFI Document Linker | missing document detector 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-DATAROOMMA-RFIDOCULIN-TUW-003 | Data Room Mapping | RFI Document Linker | supplement request status 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-DATAROOMMA-RFIDOCULIN-TUW-004 | Data Room Mapping | RFI Document Linker | RFI overdue flag 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-DATAROOMMA-RFIDOCULIN-TUW-005 | Data Room Mapping | RFI Document Linker | RFI audit event 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-ISSUMANA-DDISSU-TUW-001 | Issue Management | DD Issue | DD issue schema 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-ISSUMANA-DDISSU-TUW-002 | Issue Management | DD Issue | risk level enum 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-ISSUMANA-DDISSU-TUW-003 | Issue Management | DD Issue | source document citation link 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-ISSUMANA-DDISSU-TUW-004 | Issue Management | DD Issue | report inclusion flag 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-ISSUMANA-DDISSU-TUW-005 | Issue Management | DD Issue | DD issue table UI 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P12. Litigation Vault

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| LIT-EVIDMANA-EVIDCORE-TUW-001 | Evidence Management | Evidence Core | Evidence schema 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-EVIDMANA-EVIDCORE-TUW-002 | Evidence Management | Evidence Core | evidence number format 설정 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-EVIDMANA-EVIDCORE-TUW-003 | Evidence Management | Evidence Core | evidence number duplicate validation | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-EVIDMANA-EVIDCORE-TUW-004 | Evidence Management | Evidence Core | evidence metadata editor 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-EVIDMANA-EVIDCORE-TUW-005 | Evidence Management | Evidence Core | evidence audit event 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-FACTLEDG-FACTSOUR-TUW-001 | Fact Ledger | Fact Source | FactLedgerItem schema 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-FACTLEDG-FACTSOUR-TUW-002 | Fact Ledger | Fact Source | fact-evidence link 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-FACTLEDG-FACTSOUR-TUW-003 | Fact Ledger | Fact Source | disputed flag 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-FACTLEDG-FACTSOUR-TUW-004 | Fact Ledger | Fact Source | fact timeline sort API 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-FACTLEDG-FACTSOUR-TUW-005 | Fact Ledger | Fact Source | fact ledger UI table 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-ISSUTREE-ISSUEVID-TUW-001 | Issue Tree | Issue Evidence | IssueTree node schema 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-ISSUTREE-ISSUEVID-TUW-002 | Issue Tree | Issue Evidence | issue hierarchy API 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-ISSUTREE-ISSUEVID-TUW-003 | Issue Tree | Issue Evidence | issue-evidence link 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-ISSUTREE-ISSUEVID-TUW-004 | Issue Tree | Issue Evidence | issue tree UI 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-ISSUTREE-ISSUEVID-TUW-005 | Issue Tree | Issue Evidence | authority support link 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P13. External Portal / VDR

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| VDR-EXTEWORK-WORK-TUW-001 | External Workspace | Workspace | ExternalWorkspace schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-EXTEWORK-WORK-TUW-002 | External Workspace | Workspace | external workspace create API 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-EXTEWORK-WORK-TUW-003 | External Workspace | Workspace | workspace permission model 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-EXTEWORK-WORK-TUW-004 | External Workspace | Workspace | workspace expiration 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-EXTEWORK-WORK-TUW-005 | External Workspace | Workspace | workspace audit event 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-EXTEUSER-INVI-TUW-001 | External User | Invitation | ExternalUser schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-EXTEUSER-INVI-TUW-002 | External User | Invitation | external invitation token 생성 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-EXTEUSER-INVI-TUW-003 | External User | Invitation | external MFA requirement flag 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-EXTEUSER-INVI-TUW-004 | External User | Invitation | external user access status 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-EXTEUSER-INVI-TUW-005 | External User | Invitation | invitation audit event 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-SECULINK-LINKSECU-TUW-001 | Secure Link | Link Security | secure link schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-SECULINK-LINKSECU-TUW-002 | Secure Link | Link Security | expiresAt validation 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-SECULINK-LINKSECU-TUW-003 | Secure Link | Link Security | revocation 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-SECULINK-LINKSECU-TUW-004 | Secure Link | Link Security | expired link access block 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-SECULINK-LINKSECU-TUW-005 | Secure Link | Link Security | secure link audit event 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-WATE-VIEWWATE-TUW-001 | Watermark | Viewer Watermark | PDF watermark overlay 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-WATE-VIEWWATE-TUW-002 | Watermark | Viewer Watermark | viewer watermark 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-WATE-VIEWWATE-TUW-003 | Watermark | Viewer Watermark | download-disabled viewer mode 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-WATE-VIEWWATE-TUW-004 | Watermark | Viewer Watermark | watermark audit metadata 저장 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-QA-QAWORK-TUW-001 | Q&A | Q&A Workflow | Q&A thread schema 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-QA-QAWORK-TUW-002 | Q&A | Q&A Workflow | question create API 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-QA-QAWORK-TUW-003 | Q&A | Q&A Workflow | answer workflow 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-QA-QAWORK-TUW-004 | Q&A | Q&A Workflow | Q&A export 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-QA-QAWORK-TUW-005 | Q&A | Q&A Workflow | external Q&A audit 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P14. Records Management

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| RECORD-RETEPOLI-POLIENGI-TUW-001 | Retention Policy | Policy Engine | RetentionPolicy schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-RETEPOLI-POLIENGI-TUW-002 | Retention Policy | Policy Engine | policy assignment to Matter 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-RETEPOLI-POLIENGI-TUW-003 | Retention Policy | Policy Engine | retention calculator 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-RETEPOLI-POLIENGI-TUW-004 | Retention Policy | Policy Engine | expired candidate query 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-RETEPOLI-POLIENGI-TUW-005 | Retention Policy | Policy Engine | retention report API 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-LEGAHOLD-HOLDENFO-TUW-001 | Legal Hold | Hold Enforcement | LegalHold schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-LEGAHOLD-HOLDENFO-TUW-002 | Legal Hold | Hold Enforcement | legal hold apply API 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-LEGAHOLD-HOLDENFO-TUW-003 | Legal Hold | Hold Enforcement | legal hold delete block 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-LEGAHOLD-HOLDENFO-TUW-004 | Legal Hold | Hold Enforcement | hold release workflow 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-LEGAHOLD-HOLDENFO-TUW-005 | Legal Hold | Hold Enforcement | legal hold audit event 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-DISPWORK-DISPAPPR-TUW-001 | Disposal Workflow | Disposal Approval | DisposalRequest schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-DISPWORK-DISPAPPR-TUW-002 | Disposal Workflow | Disposal Approval | disposal approval status 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-DISPWORK-DISPAPPR-TUW-003 | Disposal Workflow | Disposal Approval | hard delete precondition check 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-DISPWORK-DISPAPPR-TUW-004 | Disposal Workflow | Disposal Approval | destruction certificate generator 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-DISPWORK-DISPAPPR-TUW-005 | Disposal Workflow | Disposal Approval | disposal audit event 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P15. Integration Layer

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| INT-MICR365-OUTLWORD-TUW-001 | Microsoft 365 | Outlook Word | Outlook add-in filing API contract 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| INT-MICR365-OUTLWORD-TUW-002 | Microsoft 365 | Outlook Word | Word add-in save version API contract 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| INT-MICR365-OUTLWORD-TUW-003 | Microsoft 365 | Outlook Word | SharePoint import connector skeleton | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| INT-MICR365-OUTLWORD-TUW-004 | Microsoft 365 | Outlook Word | Teams meeting transcript import skeleton | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| INT-MIGR-IMPO-TUW-001 | Migration | Import | file server import manifest schema 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| INT-MIGR-IMPO-TUW-002 | Migration | Import | DMS import mapping table 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| INT-MIGR-IMPO-TUW-003 | Migration | Import | PST import pipeline skeleton | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| INT-MIGR-IMPO-TUW-004 | Migration | Import | migration validation report generator | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| INT-MIGR-IMPO-TUW-005 | Migration | Import | permission mapping verification 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P16. Admin, Analytics & Enterprise Operations

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| ADMIN-TENAADMI-ADMICONS-TUW-001 | Tenant Admin | Admin Console | tenant settings UI 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-TENAADMI-ADMICONS-TUW-002 | Tenant Admin | Admin Console | user management UI 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-TENAADMI-ADMICONS-TUW-003 | Tenant Admin | Admin Console | group management UI 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-TENAADMI-ADMICONS-TUW-004 | Tenant Admin | Admin Console | policy admin route guard 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-TENAADMI-ADMICONS-TUW-005 | Tenant Admin | Admin Console | tenant audit report 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-ENTESECU-ENTECONT-TUW-001 | Enterprise Security | Enterprise Controls | SSO/SAML config schema 작성 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-ENTESECU-ENTECONT-TUW-002 | Enterprise Security | Enterprise Controls | BYOK key metadata schema 작성 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-ENTESECU-ENTECONT-TUW-003 | Enterprise Security | Enterprise Controls | data residency setting 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-ENTESECU-ENTECONT-TUW-004 | Enterprise Security | Enterprise Controls | SIEM export interface 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-ENTESECU-ENTECONT-TUW-005 | Enterprise Security | Enterprise Controls | access review workflow 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-MONI-OPS-TUW-001 | Monitoring | Ops | system metrics dashboard 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-MONI-OPS-TUW-002 | Monitoring | Ops | error tracking dashboard 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-MONI-OPS-TUW-003 | Monitoring | Ops | alert rule config 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-MONI-OPS-TUW-004 | Monitoring | Ops | backup status monitor 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-MONI-OPS-TUW-005 | Monitoring | Ops | DR drill checklist 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |


## 4. CSV 버전

동일 목록은 data/tuw_master_backlog.csv에도 포함되어 있습니다.
