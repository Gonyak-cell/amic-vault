# 소규모 로펌용 OSS SaaS Gap Closure 최종 검증 — `b3681493`

> 판정: **100% LOCAL IMPLEMENTATION VERIFIED**
>
> 검증 소스 SHA: `269877204c75a43c47f193fdb96fa52e1ad6a0b0`
>
> 기준선: `origin/main@b3681493970714fa2d1f583a2a16f7c5d4a26582`
>
> 브랜치: `codex/small-firm-oss-saas-b3681493`
>
> 원 계획:
> `docs/ui/2026-07-30-small-firm-oss-saas-plan-b3681493.md`
>
> Gap 계획:
> `docs/ui/2026-07-31-small-firm-oss-saas-gap-closure-plan-b3681493.md`
>
> 검증일: 2026-07-31 KST

## 1. 최종 판정

외부 연결을 제외한 원 계획 `SF-B368-001~020`, 조건부 `C01~C03`, 재검증에서 추가한
`SF-B368-G01~G35`를 최종 소스 SHA에 다시 대조했다. 미구현 acceptance는 0건이며
로컬 구현과 검증은 100% 완료다.

이 판정은 다음을 뜻한다.

- 10명 안팎의 한국 로펌용 기본 동선을 Home·Matter·고객·문서함·작업함으로 단순화했다.
- 사용자 문구, 상태 의미, 반응형, keyboard/focus/history를 실제 화면과 테스트에서
  확인했다.
- Matter·검색·저장검색·Work의 permission-before-query, DENY/Wall 우선, fail-closed,
  audit 원자성을 유지했다.
- Work 재배정·기한과 알림 mutation의 영속·동시성·rollback 계약을 구현했다.
- 최종 소스 SHA에서 cache 없는 단위 회귀, fresh DB 전체 통합 회귀, production browser
  행렬을 다시 실행했다.

외부 vendor 연결, staging/production 배포, package/notarization, push/PR/merge,
canonical release gate와 운영 데이터 provenance는 이 로컬 구현 판정에 포함하지 않는다.

## 2. 소스 변경 경계

| 커밋           | 범위                                      |
| -------------- | ----------------------------------------- |
| `07a21a3ef4b1` | Gap G01~G30의 제품·테스트 폐쇄            |
| `ae13c17e8f24` | G31 graph 성능 테스트 예산 정합화         |
| `8a161b9b8180` | G32 긴급 접근 알림 한국어 계약            |
| `c0832c963a6a` | G33 로그인 history 재노출 폐쇄            |
| `3762ac4bf5b9` | G34 모바일 Client 검색 control 잘림 폐쇄  |
| `269877204c75` | G35 Client 생성·목록 generation 경합 폐쇄 |

기준선 이후 최종 소스 SHA는 26 commits ahead이며, `docs/package/**`, package manifest,
lockfile, 외부 SDK·API 연결을 변경하지 않았다.

## 3. 원 계획 TUW 재판정

| ID            | 판정 | 최종 근거                                                      |
| ------------- | ---- | -------------------------------------------------------------- |
| `SF-B368-001` | PASS | 기준 SHA, persona, route 소유권과 실행 단위를 계획에 고정      |
| `SF-B368-002` | PASS | 일반 사용자 5-item nav, 관리자만 단일 관리자 설정 진입         |
| `SF-B368-003` | PASS | shell 검색, Work 알림, Search 저장검색의 단일 소유권           |
| `SF-B368-004` | PASS | loading/empty/unavailable/denied/blocked 분리와 한국어 label   |
| `SF-B368-005` | PASS | 5 viewport의 page overflow·잘린 control 0건                    |
| `SF-B368-006` | PASS | Home 첫 영역의 서버 권위 Work·기한·Matter 흐름과 독립 오류     |
| `SF-B368-007` | PASS | Work 우선 배치, `/audit`·업로드 dead action 제거               |
| `SF-B368-008` | PASS | Matter 식별·상태 중심 목록과 좁은 폭 핵심 열                   |
| `SF-B368-009` | PASS | permission-scoped SQL 안의 `q` 검색과 DENY/Wall negative       |
| `SF-B368-010` | PASS | Matter 5-tab, URL, keyboard, back/forward, route identity      |
| `SF-B368-011` | PASS | 정상 상태 보안 장식 제거, 실제 Wall/hold/deny 의미 보존        |
| `SF-B368-012` | PASS | Client list-first, modal dialog 생성, async/focus 계약         |
| `SF-B368-013` | PASS | `getClient + listMatters(clientId)`의 total/items/partial 의미 |
| `SF-B368-014` | PASS | Files Workbench 중복 helper 제거와 preview/drawer 보존         |
| `SF-B368-015` | PASS | 저장검색 list/open/save/revoke의 현재 Matter·Wall 재검증       |
| `SF-B368-016` | PASS | Work의 `mine`·`notifications` 단일 shell과 URL 상태            |
| `SF-B368-017` | PASS | `mine` 기본값, 서버 영속 assignment/due, 일반 사용자 mutation  |
| `SF-B368-018` | PASS | 기존 7개 role 보존과 일반/관리 화면 행렬                       |
| `SF-B368-019` | PASS | 숨긴 고급 route의 직접 guard, 관리자 허용, 일반 사용자 차단    |
| `SF-B368-020` | PASS | exact-SHA 자동·DB·브라우저·독립 검토 영수증                    |

## 4. Gap TUW 재판정

| ID            | 판정 | 폐쇄 결과                                                      |
| ------------- | ---- | -------------------------------------------------------------- |
| `SF-B368-G01` | PASS | raw role/status/type과 혼합 원인 문구 제거                     |
| `SF-B368-G02` | PASS | Home 업무 우선순위, dead action, 불필요 backend 조회 폐쇄      |
| `SF-B368-G03` | PASS | Matter 실제 Work와 timeline 부분 실패                          |
| `SF-B368-G04` | PASS | Client list-first 생성과 portfolio 독립 상태                   |
| `SF-B368-G05` | PASS | Document Workbench preview·drawer 실제 경로                    |
| `SF-B368-G06` | PASS | 저장검색 URL privacy와 현재 권한 회귀                          |
| `SF-B368-G07` | PASS | Work 단일 노출과 서버 query/URL 단일 권위                      |
| `SF-B368-G08` | PASS | Work row lock, affected-row 확인, audit rollback, due mutation |
| `SF-B368-G09` | PASS | 알림 mutation audit 원자성, 20+1 partial 계약                  |
| `SF-B368-G10` | PASS | allowlisted 로그인 복귀와 legacy query 축소                    |
| `SF-B368-G11` | PASS | 이 exact-SHA 자동·DB·브라우저 최종 영수증                      |
| `SF-B368-G12` | PASS | explicit Matter Work permission/Wall, due 정렬, 삭제 대상 제외 |
| `SF-B368-G13` | PASS | Work view/filter의 URL·reload·history 복원                     |
| `SF-B368-G14` | PASS | Matter 상태 행렬과 tab 실제 상호작용                           |
| `SF-B368-G15` | PASS | 동적 unknown enum의 안전한 한국어 fallback                     |
| `SF-B368-G16` | PASS | 로그인 성공의 history entry 일회성 소비                        |
| `SF-B368-G17` | PASS | Client request generation, dialog close/focus                  |
| `SF-B368-G18` | PASS | Files selection 전 preview 0회와 drawer focus                  |
| `SF-B368-G19` | PASS | item-scoped 일반 사용자 재배정 후보 계약                       |
| `SF-B368-G20` | PASS | production UI smoke를 현재 단일 소유권과 동기화                |
| `SF-B368-G21` | PASS | Files Next Page export 경계                                    |
| `SF-B368-G22` | PASS | Matter Next Page export 경계                                   |
| `SF-B368-G23` | PASS | 후보 조회 한 statement의 권한·TOCTOU 재검증                    |
| `SF-B368-G24` | PASS | drawer open 전이만 initial focus, rerender 안정성              |
| `SF-B368-G25` | PASS | Matter conflict 늦은 응답의 새 route 덮어쓰기 방지             |
| `SF-B368-G26` | PASS | Client 늦은 검색 응답의 최신 결과 덮어쓰기 방지                |
| `SF-B368-G27` | PASS | Matter route ID 변경 즉시 state identity 교체                  |
| `SF-B368-G28` | PASS | source 정규식·double assertion 대신 실제 동작 증거             |
| `SF-B368-G29` | PASS | Matter service fixture의 신규 타입 우회 0건                    |
| `SF-B368-G30` | PASS | Work service fixture의 신규 타입 우회 0건                      |
| `SF-B368-G31` | PASS | `<30초` 제품 assertion 유지, test process 35초 예산            |
| `SF-B368-G32` | PASS | 긴급 접근 알림의 자연스러운 한국어 E2E 계약                    |
| `SF-B368-G33` | PASS | logout/auth-required/login/BFCache history replace 계약        |
| `SF-B368-G34` | PASS | Client 390px control 잘림 제거와 50-combination 재검증         |
| `SF-B368-G35` | PASS | 생성 전 목록 generation 무효화와 늦은 응답 overwrite 차단      |

## 5. 조건부 TUW 최종 판정

| ID            | 판정                      | 근거와 한계                                                                                                                                                                                                                            |
| ------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SF-B368-C01` | PASS, 코드 불필요         | `matter_members`를 ALLOW의 필요조건으로 유지하고 non-member, explicit DENY, Wall 회귀가 통과했다. “적격 내부 사용자” 자동등록 trigger는 canonical fixture에서 재현되지 않아 권한 의미를 넓히지 않았다.                                 |
| `SF-B368-C02` | PASS, 기존 read 계약 충족 | Client/Matter/Home은 기존 permission-scoped read API와 명시적 total/items/partial만 사용하며 production UI에 hardcoded fake KPI·count·deadline이 없다. 브라우저는 로컬 seed이므로 운영 데이터 provenance를 증명한다고 주장하지 않는다. |
| `SF-B368-C03` | PASS, 추가 구현 완료      | G08/G12/G19/G23에서 due mutation, row lock, lost-update 방지, invalid candidate, audit rollback, item-scoped 후보와 reload/new-session 영속을 구현·검증했다.                                                                           |

## 6. Exact-SHA 자동 검증

### 6.1 단위·정적·빌드

| 검증                                          | 결과                                |
| --------------------------------------------- | ----------------------------------- |
| frozen install                                | PASS                                |
| lint                                          | 6/6, cache 0                        |
| unit                                          | 411 files / 1,804 tests             |
| build                                         | 6/6, cache 0, Next 정적 페이지 31개 |
| typecheck                                     | 9/9, cache 0                        |
| docs frozen                                   | 51 files                            |
| backlog                                       | 174·266 TUWs                        |
| production literals / UI smoke / UI checklist | 모두 PASS                           |
| AI slop deterministic scan                    | 신호 0                              |
| `docs/package` diff                           | 0                                   |

단위 테스트 구성은 domain 18, desktop 18, shared 216, AI 13, Web 511,
API 1,028로 합계 1,804이다. G35 회귀는 실제 `ClientsPage`의 초기 목록 effect와
생성 submit handler를 실행해, 생성 뒤 늦게 완료된 기존 목록 응답이 새 고객을
덮어쓰지 못함을 검증한다.

### 6.2 Fresh DB 전체 통합

- 최종 SHA 신규 DB: `migrate → rollback(0 rows) → migrate → seed` 통과
- 최종 SHA 신규 private/versioned bucket: 141 files / 458 tests 통과
- integration batch: 19/19
- migration: 206, last `0212_add_work_notification_audit_actions`
- skip/quarantine: 0

이전 SHA의 첫 전체 실행에서 과거 ingestion container가 당시 `/security/scan`을 갖지
않아 upload-permission 한 시나리오가 실패했던 환경 드리프트와 그 복구 로그도
진단 이력으로 보존했다. 최종 `26987720`에서는 별도의 완전 신규 DB·bucket에서
왕복과 458/458을 다시 통과했으며 이전 환경 실패를 최종 PASS에 포함하지 않았다.

자동 검증 상세:
[`automated-gates.md`](./evidence/sf-b368-gap-closure/automated-gates.md)

원시 로그:

- [`automated-gates-26987720.log`](./evidence/sf-b368-gap-closure/automated-gates-26987720.log)
- [`final-fresh-db-integration-26987720.log.gz`](./evidence/sf-b368-gap-closure/final-fresh-db-integration-26987720.log.gz)
- [`db-manual-qa-26987720.md`](./evidence/sf-b368-gap-closure/db-manual-qa-26987720.md)

## 7. Exact-SHA 브라우저 검증

최종 소스의 production Next.js standalone build에서 10 route × 5 viewport = 50개
조합을 확인했다. `720×450`은 브라우저 zoom API가 아닌 1440×900 화면의
**200% 등가 CSS viewport reflow**이며 실제 native zoom을 사용했다고 주장하지 않는다.

- horizontal overflow: 0
- 가로 방향 viewport 밖 visible interactive: 0
- 삭제 대상 helper/보안 장식 문구: 0
- raw error code: 0
- 완료 후 loading/error: 0
- 예상 밖 redirect: 0
- 상호작용 종료 후 console entry: 0

Matter two-route back/forward, Files drawer Tab/Escape/focus return, Client rapid-search race,
일반 사용자 Work 재배정의 별도 로그인 세션 영속과 audited 원상복구,
로그아웃→deep-link→로그인→Back, 일반 사용자 admin 차단과 관리자 성공을 확인했다.

브라우저 제어 표면에는 응답 지연 interception이 없어 G35의 늦은 목록 응답을 브라우저
시나리오로 주입하지 못했고 이를 `NOT_APPLICABLE`로 기록했다. 최종 SHA의 실제
`ClientsPage` effect와 submit handler를 실행하는 deferred-response 테스트가 이
경쟁 조건을 검증한다.

브라우저 상세:
[`browser-interactions.md`](./evidence/sf-b368-gap-closure/browser-interactions.md)

Machine-readable 증거:
[`browser-matrix.json`](./evidence/sf-b368-gap-closure/browser-matrix.json),
[`browser-interactions.json`](./evidence/sf-b368-gap-closure/browser-interactions.json),
[`browser-console.json`](./evidence/sf-b368-gap-closure/browser-console.json)

## 8. 독립 검토와 잔여 WATCH

- G01~G30 독립 read-only code review: `CLEAR / APPROVE`, blocker 0
- G32: `CLEAR / APPROVE`, blocker 0
- G33: `CLEAR / APPROVE`, blocker 0
- G34: `WATCH / APPROVE`, blocker 0
- G35 및 최종 소스: `WATCH / APPROVE`, blocker 0
- 최종 증거 게이트 독립 재현: `APPROVE`, blocker 0

G34의 WATCH는 responsive test 일부가 Tailwind token을 검사한다는 테스트 유지보수 의견이다.
제품 correctness는 production build의 390×844, 720×450, 1440×900 측정과 최종 50개
행렬로 독립 확인했다. 미구현 acceptance나 사용자 화면 결함으로 분류하지 않는다.

최종 소스 검토:
[`source-code-review-26987720.md`](./evidence/sf-b368-gap-closure/source-code-review-26987720.md)

AI slop review: pass.

## 9. 완료 경계

이 영수증으로 외부 연결 제외 로컬 구현을 완료 처리한다. 다음은 실행하지 않았거나 별도
권한·환경이 필요한 다음 단계다.

- Microsoft 365/Outlook/OneDrive, 외부 포털·공유·알림, 외부 AI 연결
- staging/production 배포와 운영 데이터 검증
- desktop package·공증
- push·PR·merge
- canonical release gate와 release/GA 선언

따라서 “계획·goal 기준 100% 로컬 구현”은 맞지만 “main 병합·배포·릴리스 100%”를
뜻하지 않는다.
