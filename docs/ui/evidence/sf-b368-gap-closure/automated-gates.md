# SF-B368 Gap Closure 자동 검증 영수증

- 검증 소스 SHA: `269877204c75a43c47f193fdb96fa52e1ad6a0b0`
- 기준선: `origin/main@b3681493970714fa2d1f583a2a16f7c5d4a26582`
- 실행일: 2026-07-31 KST
- 실행 원칙: Turbo cache를 강제로 사용하지 않고 최종 소스 SHA에서 다시 실행

## 루트 게이트

| 검증                                | 결과                                      |
| ----------------------------------- | ----------------------------------------- |
| `pnpm install --frozen-lockfile`    | PASS                                      |
| `TURBO_FORCE=true pnpm lint`        | PASS, 6/6, cache 0                        |
| `TURBO_FORCE=true pnpm test`        | PASS, 411 files / 1,804 tests             |
| `TURBO_FORCE=true pnpm build`       | PASS, 6/6, cache 0, Next 정적 페이지 31개 |
| `TURBO_FORCE=true pnpm typecheck`   | PASS, 9/9, cache 0                        |
| `pnpm docs:frozen`                  | PASS, 51 files                            |
| `pnpm backlog:validate`             | PASS, 174·266 TUWs                        |
| `pnpm check:production-ui-literals` | PASS                                      |
| `pnpm ui:production-smoke`          | PASS                                      |
| `pnpm check:ui-pr-checklist`        | PASS                                      |
| `sloplint.py --changed`             | PASS, 자동 검출 신호 0                    |
| `git diff --check`                  | PASS                                      |
| `docs/package` 기준선 diff          | 0 files                                   |

단위 테스트의 패키지별 실제 수치는 다음과 같다.

| 패키지  | 파일 | 테스트 |
| ------- | ---: | -----: |
| domain  |    7 |     18 |
| desktop |    8 |     18 |
| shared  |   46 |    216 |
| AI      |    1 |     13 |
| Web     |  137 |    511 |
| API     |  212 |  1,028 |
| 합계    |  411 |  1,804 |

원시 로그: [`automated-gates-26987720.log`](./automated-gates-26987720.log)

## 데이터베이스·스토리지·전체 통합 회귀

동일 소스 SHA에서 첫 격리 DB로 `migrate → rollback → migrate → seed`를 수행했다.
최종 스키마는 206개 migration과
`0212_add_work_notification_audit_actions`까지 재적용됐다.

최종 전체 회귀는 별도의 신규 DB
`amic_vault_sf_b368_26987720_final`와 생성 시점부터 versioning을 켠 private bucket
`amic-vault-sf-b368-26987720-final`에서 다시 실행했다.

| 검증                        | 결과                                                 |
| --------------------------- | ---------------------------------------------------- |
| fresh DB migration          | PASS, 206 migrations                                 |
| seed                        | PASS, 시작 시 tenants 2 / users 11                   |
| `pnpm test:integration`     | PASS, 141 files / 458 tests, 19 batches              |
| integration 종료 후 schema  | 206, last `0212_add_work_notification_audit_actions` |
| integration 종료 후 fixture | tenants 2 / users 25                                 |
| MinIO versioning            | enabled                                              |
| MinIO access                | private                                              |
| skip/quarantine             | 0                                                    |

원시 로그:

- 최종 SHA:
  [`final-fresh-db-integration-26987720.log.gz`](./final-fresh-db-integration-26987720.log.gz)
- 이전 SHA의 환경 드리프트 진단:
  [`db-roundtrip-with-stale-worker-diagnostic-3762ac4b.log.gz`](./db-roundtrip-with-stale-worker-diagnostic-3762ac4b.log.gz),
  [`upload-permission-current-worker-3762ac4b.log`](./upload-permission-current-worker-3762ac4b.log),
  [`final-fresh-db-integration-3762ac4b.log.gz`](./final-fresh-db-integration-3762ac4b.log.gz)

이전 SHA 첫 전체 통합 시도의 단일 실패는 실행 중이던 과거 ingestion 이미지가 당시 소스의
`POST /security/scan`을 갖지 않아 `404`를 반환한 환경 드리프트였다. 현재 소스로
ingestion 이미지를 재빌드한 뒤 직접 호출은 인증 경계의 `403`으로 바뀌었고, focused
upload-permission은 5/5, 두 번째 신규 DB 전체 통합은 458/458로 통과했다. 최종
`26987720`에서는 다시 만든 DB·bucket으로 migration 왕복과 458/458을 별도로
통과했으며, 이전 환경 실패를 최종 PASS에 포함하거나 숨기지 않는다.
