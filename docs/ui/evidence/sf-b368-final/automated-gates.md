# SF-B368 자동 검증 증거

- 기준선: `origin/main@b3681493970714fa2d1f583a2a16f7c5d4a26582`
- 구현 코드 SHA: `1d0333c9ba957dfced1d4d893ef30e0261b9e39d`
- 브랜치: `codex/small-firm-oss-saas-b3681493`
- 검증일: 2026-07-31 KST

## 루트 및 UI 게이트

| 명령 | 결과 |
|---|---|
| `pnpm lint` | PASS — 6/6 workspace |
| `pnpm typecheck` | PASS — 9/9 task |
| `pnpm test` | PASS — domain 18, desktop 18, shared 213, AI 13, API 1,012, Web 429; 합계 1,703 |
| `pnpm build` | PASS — 6/6 workspace, Next 정적 페이지 31개 |
| `pnpm docs:frozen` | PASS — frozen package 51개 |
| `pnpm backlog:validate` | PASS — TUW registry 174·266 |
| `pnpm check:production-ui-literals` | PASS |
| `pnpm check:ui-pr-checklist` | PASS |
| `pnpm ui:production-smoke` | PASS |
| `git diff --check origin/main...HEAD` | PASS |
| `git diff --check` | PASS |

`pnpm build`와 동시에 처음 실행한 Web typecheck 한 건은 빌드가 `.next/types`를 교체하는 동안 생성 파일을 읽어 `TS6053`이 발생했다. 빌드 종료 후 동일 소스에서 `pnpm typecheck`를 단독 실행해 9/9가 통과했으며 소스 수정, skip, quarantine 또는 검사 완화는 없었다.

## 데이터베이스 왕복 및 통합 회귀

격리 PostgreSQL `amic_vault_sf_1d0333c9`에서 다음 순서가 모두 통과했다.

1. `pnpm db:migrate`
2. `pnpm db:rollback`
3. `pnpm db:migrate`
4. `pnpm db:seed`

- migration: `0000_noop`부터 `0211_create_document_bulk_actions`까지 205개
- seed: `tenants=2`, `users=11`

두 번째 새 데이터베이스 `amic_vault_sf_1d0333c9_v2`와 생성 시점부터 versioning을 활성화한 MinIO bucket `amic-vault-sf-1d0333c9-v2`에서 전체 `pnpm test:integration`을 다시 실행했다.

- 결과: PASS — 131 files / 417 tests, exit 0
- 포함 범위: tenant/RLS, Matter·문서 권한, explicit DENY, Ethical Wall, break-glass, 저장검색, 검색, 감사, immutable original, legal hold, worker, ingestion sandbox
- 최종 저장검색 보완 뒤 focused 보안 회귀: PASS — 4 files / 23 tests

첫 격리 실행의 임시 bucket은 versioning이 꺼져 있어 document-revision fixture가 worker의 object-version fingerprint를 만들지 못했다. bucket versioning을 켠 뒤 해당 테스트가 통과했고, 위의 두 번째 새 DB·bucket 전체 실행으로 환경 설정 원인임을 재확인했다. 진단용 임시 assertion은 전부 되돌렸으며 제품 소스나 테스트 강도를 바꾸지 않았다.

## 범위 경계

- 신규 dependency, migration 또는 브라우저 권위 상태 저장소 없음
- 외부 전자서명, Microsoft 365, 외부 포털, 외부 링크, 외부 AI 연결·호출 없음
- push, PR, merge, staging/production 배포, 패키징, 릴리스는 이 증거의 범위가 아님
