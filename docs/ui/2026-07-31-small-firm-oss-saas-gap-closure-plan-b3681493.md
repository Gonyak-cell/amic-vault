# 소규모 로펌용 OSS SaaS UI Gap Closure 계획 — `b3681493`

> 상태: **IMPLEMENTATION IN PROGRESS**
>
> 원 계획: `docs/ui/2026-07-30-small-firm-oss-saas-plan-b3681493.md`
>
> 기존 검증 기록: `docs/ui/2026-07-31-small-firm-oss-saas-verification-b3681493.md`
>
> 기준선: `origin/main@b3681493970714fa2d1f583a2a16f7c5d4a26582`
>
> 재검증 시작 HEAD: `8cf5bfd3ca5a89deb7101f92924e83d96d56229e`
>
> 작업 브랜치: `codex/small-firm-oss-saas-b3681493`
>
> 작성일: 2026-07-31

## 1. 목적과 판정

기존 계획의 `SF-B368-001~020`과 `SF-B368-C01~C03`를 현재 코드, 테스트,
브라우저 증거에 다시 대조한 결과 **100% 완료로 판정할 수 없다**. lint, typecheck,
unit, build, migration 왕복과 전체 integration이 통과하더라도 아래 acceptance는
구현 또는 재현 가능한 증거가 부족하다.

- Home에서 실제 업무보다 빠른 작업이 먼저 나오며 문서 업로드 링크가 dead target이다.
- 사용자 문구 일부에 raw role/status/type 값과 번역투가 남아 있다.
- Matter 상세은 보조 timeline 실패가 전체 Matter를 지우며 업무 탭이 실제 work item을
  표시하지 않는다.
- Client 생성은 목록 안의 긴 `<details>`이고, Matter portfolio 오류가 Client 상세 전체를
  지운다.
- Work item이 여러 패널에 중복 노출되고 필터가 URL에 보존되지 않는다.
- Work 재배정은 경쟁 상태에서 update 0건이어도 audit/성공이 남을 수 있고 기한 변경
  계약이 없다.
- 미로그인 deep link의 `next`가 로그인 뒤 소비되지 않으며 legacy search query가 로그인
  URL에 과도하게 보존된다.
- 저장검색 기본 URL에 문서 제목 성격의 필터가 남을 수 있고, 핵심 권한 변경 시나리오의
  증거가 부족하다.
- 기존 closeout의 integration 수치와 현재 실제 inventory가 다르고, 브라우저 기록이
  상호작용을 독립 재현할 원시 증거로 충분하지 않다.

이 문서는 위 차이를 외부 연결 없이 닫는 추가 testable unit of work를 정의한다. 원 계획의
완료 표시는 이 문서의 최종 검증이 끝날 때까지 잠정 판정이다.

## 2. 공통 불변식과 제외 범위

모든 Gap TUW는 다음을 동시에 지킨다.

1. Matter, 문서, 검색, Work 조회는 query 단계에서 tenant, membership, explicit DENY,
   Ethical Wall을 적용한다. 클라이언트 사후 권한 필터링은 금지한다.
2. 권한 판단 오류와 미해석 상태는 fail-closed한다. 권한 없음, 정책 차단, 연결 오류,
   empty를 같은 상태로 합치지 않는다.
3. Work mutation은 같은 transaction의 audit와 함께 성공하거나 함께 실패한다.
4. 문서 원본을 덮어쓰지 않고 민감 제목·본문·tenant/user ID를 URL, log, audit metadata에
   추가하지 않는다.
5. 외부 공유, 외부 사용자, Microsoft 365, Outlook, OneDrive, 외부 알림, 외부 AI,
   vector/graph 기능은 추가하거나 호출하지 않는다.
6. 신규 dependency와 상태 관리 라이브러리를 추가하지 않는다. 기존 component, DTO,
   API client와 플랫폼 기능을 재사용한다.
7. `docs/package/**`는 수정하지 않는다.

## 3. Gap TUW

### `SF-B368-G01` — 사용자 문구와 상태 의미 폐쇄

- Risk / Size: H / M
- 소유 파일:
  - `apps/web/src/components/ui/empty-state.tsx`
  - `apps/web/src/lib/api/error-messages.ts`
  - `apps/web/src/lib/i18n.tsx`
  - raw role/status/type을 렌더하는 기존 Web component와 관련 tests
- 목표: 권한, 정책 차단, 연결 실패, empty를 분리하고 raw enum/API 값을 자연스러운
  한국어 업무 용어로 표시한다.
- Acceptance:
  - `firm_admin`, Matter type, 문서 status/privilege/extraction 값이 일반 표시문에 그대로
    나오지 않는다.
  - `권한 또는 연결 상태`처럼 서로 다른 원인을 합친 문구가 없다.
  - normal state에 장식형 보안 문구를 되살리지 않는다.
  - 긴 한국어와 중복 이름에서도 식별 가능한 accessible name을 제공한다.
- Verification: focused Web tests, production literal gate, sloplint, 네 viewport spot check.

### `SF-B368-G02` — Home 업무 우선순위와 dead action 제거

- Risk / Size: M / S
- 소유 파일:
  - `apps/web/src/app/(app)/dashboard/vault-activity-client.tsx`
  - `apps/web/src/app/(app)/dashboard/vault-activity-client.test.tsx`
  - 필요 시 기존 Files 업로드 trigger의 식별자와 test
- 목표: Home 첫 업무 영역을 서버 권위 Work queue로 고정하고 모든 빠른 작업을 실제
  동작하는 기존 소유 route/action에 연결한다.
- Acceptance:
  - Work queue가 빠른 작업보다 먼저 렌더된다.
  - 일반 사용자에게 `/audit` action을 노출하지 않는다.
  - 문서 업로드 action은 실제 Files 업로드 control로 이동하거나 해당 action을 제거한다.
  - `0/1/5/>5`, 느린 응답, 섹션별 partial error, 긴 제목을 테스트한다.
- Verification: behavioral component tests, dead-link inventory, dashboard render.

### `SF-B368-G03` — Matter 목록·상세의 실제 업무와 부분 실패

- Risk / Size: H / L
- 소유 파일:
  - `apps/web/src/app/(app)/matters/[matterId]/**`
  - `apps/web/src/components/matter/**`
  - Work query DTO/client의 `matterId` read filter
  - 관련 API/Web/unit/integration tests
- 목표: Matter 업무 탭이 현재 권한 범위의 실제 `work_items`를 표시하고 보조 timeline
  실패가 Matter 상세 전체를 지우지 않게 한다.
- Acceptance:
  - `GET /work/items`의 permission-scoped SQL에서 optional `matterId`를 적용한다.
  - Work 항목이 없는 Matter는 명시적 empty, 조회 실패는 error, 권한/Wall 차단은 별도
    fail-closed 상태다.
  - Matter 본문과 email timeline은 독립적으로 로드된다.
  - 동일 이름 Matter의 action accessible name에 Matter code가 포함된다.
  - 기존 5-tab URL, keyboard, history 계약을 보존한다.
- Verification: API query/negative integration, Web partial-failure and duplicate-name tests,
  keyboard/history regression.

### `SF-B368-G04` — Client list-first 생성과 portfolio 부분 실패

- Risk / Size: M / M
- 소유 파일:
  - `apps/web/src/app/(app)/clients/**`
  - 기존 dialog primitive와 관련 tests
- 목표: Client 목록을 계속 기본 surface로 유지하면서 생성은 keyboard-safe dialog로
  분리하고 Matter portfolio 오류가 Client 본문을 지우지 않게 한다.
- Acceptance:
  - 생성 form은 목록 안의 펼침 영역이 아니라 기존 Dialog에서 열리고 Escape,
    focus trap, focus return을 지킨다.
  - Client 상세 성공과 Matter portfolio 성공/empty/error/denied를 독립 표현한다.
  - fake aggregate를 만들지 않고 API의 `total/items/partial` 의미를 그대로 사용한다.
  - duplicate name과 긴 한국어에서 목록 action이 구분된다.
- Verification: rendered component tests, focus behavior, partial-error tests, responsive render.

### `SF-B368-G05` — Document Workbench 상호작용 증거

- Risk / Size: M / S
- 소유 파일:
  - `apps/web/src/app/(app)/files/**` 및 관련 Workbench tests
- 목표: 기존 3-pane/drawer 구조를 바꾸지 않고 선택 전 preview 요청 금지와 mobile
  drawer focus 계약을 자동 검증한다.
- Acceptance:
  - 문서 선택 전 preview session/API를 만들지 않는다.
  - drawer는 Escape로 닫히고 focus가 trigger로 돌아온다.
  - wide content는 component 내부 scroll에 머물고 page overflow를 만들지 않는다.
- Verification: behavioral Web tests와 desktop/mobile spot check.

### `SF-B368-G06` — Saved-search URL·현재 권한 회귀

- Risk / Size: C / M
- 소유 파일:
  - `apps/web/src/app/(app)/search/**`
  - `apps/api/src/modules/search/**`
  - `packages/shared/src/search/**`
  - `tests/integration/search-permission/saved-search-authorization.spec.ts`
- 목표: shell의 명시적 `q` 호환은 유지하되 URL allowlist에서 제목 성격의 필드와
  tenant/user 식별자를 제외하고 모든 saved-search lifecycle에 현재 Matter/Wall 범위를
  재적용한다.
- Acceptance:
  - default URL builder는 허가된 display-safe filter만 보존하며 document title과
    tenant/user ID를 받거나 직렬화하지 않는다.
  - membership 제거 직후 personal/admin-shared/matter-team list/open/revoke가 fail-closed한다.
  - Matter에 묶이지 않은 personal/admin-shared의 정상 흐름은 유지한다.
  - malformed/mismatched legacy Matter 참조는 계속 fail-closed한다.
- Verification: URL policy unit tests, positive/negative integration, audit and tenant
  non-disclosure regression.

### `SF-B368-G07` — Work 단일 노출·URL 상태·일반 사용자 조작

- Risk / Size: H / L
- 소유 파일:
  - `apps/web/src/app/(app)/work/**`
  - `apps/web/src/lib/api/work-ops.ts`
  - 관련 Web tests
- 목표: Work item을 한 번만 노출하고 서버 query와 URL을 Work 상태의 단일 권위로 사용한다.
- Acceptance:
  - 한 itemKey가 기본 목록, 검토, 재배정 패널에 동시에 반복되지 않는다.
  - `view`, `assignee`, `kind`, pagination이 URL에 보존되고 reload/back/forward에서
    같은 서버 query를 복원한다.
  - 재배정 picker는 일반 사용자에게 권한 없는 admin directory 호출을 하지 않는다.
    서버 권한상 admin 전용이면 action도 admin에만 보인다.
  - mutation 실패와 partial/truncated 목록을 empty로 바꾸지 않는다.
- Verification: URL/history behavioral tests, duplicate-key assertion, forbidden picker test.

### `SF-B368-G08` — Work 재배정·기한 변경 원자성과 동시성

- Risk / Size: C / L
- 소유 파일:
  - `packages/shared/src/dashboard/dashboard-types.ts`
  - `apps/api/src/modules/work/work.controller.ts`
  - `apps/api/src/modules/work/work.service.ts`
  - 관련 unit/integration tests
- 목표: 기존 Work row와 audit 계약을 재사용해 재배정과 기한 변경을 경쟁 상태에서도
  원자적으로 영속한다.
- Acceptance:
  - mutation 대상 row를 같은 transaction에서 lock하고 update row count를 확인한다.
  - 완료/비가시/삭제/경합 대상은 audit 없이 fail-closed한다.
  - 기한은 ISO timestamp 또는 명시적 null 계약으로 변경하며 기존 표준 audit action을
    재사용하거나 canonical audit enum에 명시적으로 추가한다.
  - 재배정과 기한 변경은 reload/new session 뒤 DB 값이 유지된다.
  - invalid assignee, lost update, audit failure rollback을 검증한다.
- Verification: shared schema, API unit, DB integration concurrency/rollback/permission negative.

### `SF-B368-G09` — 알림 mutation 상태·audit·pagination

- Risk / Size: C / M
- 소유 파일:
  - `apps/api/src/modules/notifications/**`
  - `apps/web/src/app/(app)/work/**`
  - shared notification contract와 관련 tests
- 목표: UI에 노출된 읽음/숨김 mutation을 audited transaction으로 만들고 20건 초과를
  완전한 목록으로 오해하지 않게 한다.
- Acceptance:
  - mutation 성공과 audit가 같은 transaction에서 완료되며 audit 실패 시 rollback한다.
  - 다음 page 또는 `partial/hasMore` 계약을 제공한다.
  - UI는 mutation error와 목록 partial을 독립 표시한다.
  - raw notification reason/status를 사용자 설명문에 직접 노출하지 않는다.
- Verification: API unit/integration audit rollback, pagination contract, Web partial/error tests.

### `SF-B368-G10` — 로그인 복귀와 legacy URL privacy

- Risk / Size: H / M
- 소유 파일:
  - `apps/web/src/middleware.ts`
  - `apps/web/src/app/(auth)/login/login-form.tsx`
  - `apps/web/src/app/(app)/search/folders/**`
  - 관련 tests
- 목표: 허가된 내부 deep link는 로그인 뒤 한 번만 복원하고, 외부/순환/민감 legacy
  URL은 로그인 경계에서 제거한다.
- Acceptance:
  - same-origin relative `next`만 소비하고 absolute/protocol-relative/`/login` loop는
    `/dashboard`로 안전하게 귀결한다.
  - `/search/folders`는 미로그인 상태에서도 유효한 opaque UUID `searchRef`만 보존한다.
  - malformed query와 unauthorized direct route는 홈으로 조용히 우회하지 않고 기존
    fail-closed 화면을 유지한다.
- Verification: middleware/login pure-policy tests, open redirect/loop/malformed matrix,
  logged-out deep-link browser check.

### `SF-B368-G11` — Exact-SHA 재검증과 추적 가능한 증거

- Risk / Size: H / L
- 소유 파일:
  - 원 계획
  - 기존 검증 기록
  - `docs/ui/evidence/sf-b368-gap-closure/`
- 목표: 최종 코드 SHA에서 자동·DB·브라우저 증거를 다시 만들고 각 original/gap TUW를
  PASS/PARTIAL/FAIL로 정직하게 닫는다.
- Acceptance:
  - 실제 Vitest inventory의 files/tests 수와 문서 수치가 일치한다.
  - lint, typecheck, test, build, docs frozen, backlog, UI gates, migration 왕복, seed,
    전체 integration을 최종 SHA에서 실행한다.
  - role × success/empty/error/denied/blocked, 네 viewport, keyboard/focus/history,
    200% reflow, 긴 한국어, console/network, dead action을 재현 가능한 artifact로 남긴다.
  - external connection, deployment, package, merge, release를 로컬 구현 완료와 분리한다.
  - 남은 미구현이 하나라도 있으면 100%라고 기록하지 않는다.
- Verification: 모든 앞선 TUW 결과 + independent code review + manual browser evidence.

### `SF-B368-G12` — Matter-scoped Work 권한·정렬·삭제 대상 폐쇄

- Risk / Size: C / M
- 소유 파일:
  - `apps/api/src/modules/work/**`
  - Work shared contract의 관련 tests
  - `tests/integration/audit-coverage/work-mutations.spec.ts`
- 발견 근거: 첫 gap 구현 재감사에서 explicit `matterId`의 non-member/Wall 요청이
  `200 + empty`로 축약되어 Matter UI의 denied/blocked 상태가 실제 서버 응답으로는
  도달하지 않는 것을 확인했다. 기본 정렬과 soft-deleted document mutation도 원 계획의
  임박 순·비가시 대상 fail-closed 계약을 완전히 증명하지 못했다.
- Acceptance:
  - explicit `matterId` 조회는 query 실행 전에 같은 canonical Matter permission/Wall
    판정을 거치고, non-member/explicit DENY/Wall은 표준 safe error로 실패 폐쇄한다.
  - allowed Matter의 실제 0건은 empty, 실제 항목은 success로 구분한다.
  - tenant, Matter, document 식별자와 정책 원문을 오류 응답에 넣지 않는다.
  - 미완료 Work의 기본 정렬은 `due_at ASC`가 우선이며 안정적인 tie-breaker를 사용한다.
  - soft-deleted document가 대상인 Work는 목록·재배정·기한 변경과 audit에서 모두
    제외한다.
- Verification: 실제 HTTP/PostgreSQL allowed-empty/items, non-member, explicit DENY,
  excluded/insider Wall, due ordering, deleted target, no-audit/no-leak integration.

### `SF-B368-G13` — Work 보기 전환의 URL·history 보존

- Risk / Size: H / S
- 소유 파일:
  - `apps/web/src/components/work/work-inbox-tabs.tsx`
  - `apps/web/src/app/(app)/work/**`
  - `apps/web/src/app/(app)/notifications/**`
  - `apps/web/src/lib/api/work-ops.ts`
  - `apps/web/src/lib/auth-guard.ts`
- 발견 근거: Work/알림 tab href가 고정 문자열이라 `assignee`, `kind`, `limit`,
  `offset`이 보기 전환에서 유실되며, 기존 테스트는 reload/back-forward 계약을
  재현하지 못했다.
- Acceptance:
  - `mine ↔ notifications` 전환이 allowlisted Work query state를 보존한다.
  - malformed, repeated, unknown query는 보존하지 않는다.
  - 같은 URL은 같은 server query를 만들고 reload/back-forward에서 결정적으로
    복원된다.
  - login `next`도 같은 Work allowlist와 enum 범위를 사용한다.
  - 일반 사용자에게 권한 없는 `user-admin` directory를 호출하지 않는다.
- Verification: URL round-trip/pure history contract, rendered tab href, malformed matrix,
  최종 브라우저 back-forward.

### `SF-B368-G14` — Matter 상태 행렬·tab 상호작용 증거

- Risk / Size: H / M
- 소유 파일:
  - `apps/web/src/app/(app)/matters/**`
  - `apps/web/src/components/matter/**`
- 발견 근거: 최초 보완 뒤에도 conflicts loading이 transport failure variant와 섞였고,
  Matter list resolve/reject, timeline rejection, 5-tab history의 실제 상호작용 증거가
  부족했다.
- Acceptance:
  - loading, empty, api-unavailable, permission denied, Wall/policy blocked, conflict,
    legal hold를 서로 다른 상태로 표현한다.
  - email timeline 실패가 Matter 본문과 5-tab navigation을 지우지 않는다.
  - 동일 이름 Matter action은 code가 포함된 accessible name으로 keyboard 접근 가능하다.
  - tab URL은 reload/back-forward에서 같은 view를 복원한다.
- Verification: 상태 행렬 render tests, async resolve/reject orchestration, tab URL contract,
  최종 브라우저 keyboard/history.

### `SF-B368-G15` — 동적 raw enum과 혼합 정책 문구 최종 제거

- Risk / Size: H / M
- 소유 파일:
  - `apps/web/src/lib/i18n.tsx`
  - Client, Search, Governance, Dashboard의 관련 render components와 tests
- 발견 근거: 정적 literal gate 통과 뒤에도 wire value fallback과 동적 interpolation으로
  Client/Search/Governance 화면에 raw enum이 나올 수 있고, 정책 문구 일부가 두 원인을
  한 문장으로 합쳤다.
- Acceptance:
  - Client type/status/confidentiality, Matter status, document type, version status가
    known·unknown wire value 모두 raw 문자열을 표시하지 않는다.
  - `정보 차단 또는 권한 정책` 같은 원인 혼합 문구가 없다.
  - unknown 값은 의미를 추정하지 않는 안전한 한국어 fallback을 사용한다.
- Verification: 실제 wire/unknown render tests, production literal gate, sloplint,
  네 viewport text inspection.

### `SF-B368-G16` — 로그인 복귀 entry의 일회성 소비

- Risk / Size: H / S
- 소유 파일:
  - `apps/web/src/app/(auth)/login/login-form.tsx`
  - `apps/web/src/lib/auth-guard.ts`
  - middleware/auth tests
- 발견 근거: 안전한 `next`를 계산해도 `location.assign`이 login entry를 history에 남겨
  뒤로가기로 같은 복귀 값을 재실행할 수 있었다.
- Acceptance:
  - 로그인 성공은 `location.replace` 의미로 현재 login history entry를 소비한다.
  - 실패·미로그인 상태에서는 `next`를 실행하지 않는다.
  - absolute/protocol-relative/loop/malformed/repeated 값은 계속 `/dashboard` 또는
    allowlisted route로 실패 폐쇄한다.
- Verification: navigation contract unit, logged-out deep-link login, browser Back으로
  login replay가 없는지 확인.

### `SF-B368-G17` — Client async·dialog 실제 경로 폐쇄

- Risk / Size: H / M
- 소유 파일:
  - `apps/web/src/app/(app)/clients/**`
- 발견 근거: Client loading이 연결 실패 variant로 표시되고 제출 중 close 거부에도
  focus return이 먼저 실행될 수 있었으며, portfolio reject/race·동명·orphan fixture
  증거가 부족했다.
- Acceptance:
  - loading과 transport failure를 분리하고 Client 본문과 portfolio의 상태를 독립 유지한다.
  - submitting 중 Escape/backdrop close가 거부되면 dialog와 focus가 내부에 유지된다.
  - 실제 close 뒤에만 trigger로 focus가 돌아간다.
  - 동명 다른 ID, Client 없는 Matter, mixed-status portfolio, Client 성공 +
    portfolio reject/race를 결정적으로 처리한다.
- Verification: orchestration/render tests, 최종 브라우저 Tab/Escape/focus return,
  responsive/long Korean.

### `SF-B368-G18` — Files preview·drawer 실제 경로 폐쇄

- Risk / Size: H / M
- 소유 파일:
  - `apps/web/src/app/(app)/files/**`
  - `apps/web/src/components/document/document-workbench-shell.tsx`
  - 관련 Workbench tests
- 발견 근거: 기존 보완 테스트가 helper와 production source 문자열을 직접 검사해
  실제 preview 호출 순서와 drawer event path의 회귀를 충분히 막지 못했다.
- Acceptance:
  - selection 전 preview session/API 호출은 0회이고 selection 후 선택 항목에만 호출한다.
  - drawer initial focus, Tab containment, Escape close, trigger focus return을 실제 event
    경로가 보장한다.
  - component 내부 wide-content scroll이 page overflow로 전파되지 않는다.
  - double type assertion과 production source 정규식 검사를 새 증거로 사용하지 않는다.
- Verification: orchestration/component tests, desktop/mobile actual browser interaction,
  overflow and focus artifact.

### `SF-B368-G19` — 일반 사용자 Work 재배정 후보 계약

- Risk / Size: C / M
- 소유 파일:
  - `packages/shared/src/dashboard/dashboard-types.ts`
  - `apps/api/src/modules/work/**`
  - `apps/web/src/app/(app)/work/**`
  - `apps/web/src/lib/api/work-ops.ts`
  - 관련 unit/integration tests
- 발견 근거: Work mutation은 현재 배정된 일반 Matter 구성원의 재배정을 허용하지만
  화면은 관리자 전용 `user-admin` 조직 디렉터리만 사용할 수 있어 같은 기능을
  관리자에게만 노출했다. UI에서 일반 사용자에게 관리자 디렉터리를 호출하지 않는
  안전 조건은 지켰지만, 서버 capability와 사용자 조작 계약은 일치하지 않았다.
- 목표: 관리자 디렉터리를 넓히거나 Matter ID를 브라우저에 추가 노출하지 않고,
  사용자가 현재 조작할 수 있는 Work item 안에서만 재배정 후보를 찾는다.
- Acceptance:
  - 후보 조회는 opaque `itemKey`와 검색어만 받고, 현재 actor에게 재배정 가능한
    미완료 Work인지 query 단계에서 다시 확인한다.
  - 후보는 같은 tenant의 active·non-external·non-`limited_reviewer` 현재 Matter
    member 사용자로 제한하며 다른 Matter/tenant 사용자, 그룹, 비활성·외부·검토
    전용 사용자를 반환하지 않는다.
  - non-member, explicit DENY, Wall, 다른 사용자의 항목, 완료·삭제된 대상은 safe
    `PERMISSION_DENIED` 또는 canonical Wall error로 실패 폐쇄하고 식별자를 노출하지 않는다.
  - 일반 사용자의 화면은 이 Work 전용 후보 API만 호출하고 `user-admin` directory를
    호출하지 않으며, 관리자와 변경 권한이 있는 일반 사용자 모두 실제 재배정·reload를
    완료할 수 있다. `limited_reviewer`에는 재배정·기한 변경 control을 노출하지 않는다.
  - 검색 loading, empty, error와 mutation error를 서로 구분하고 keyboard 선택과 긴
    한국어·동명 사용자를 안전하게 표시한다.
- Verification: shared/API/Web unit, 실제 HTTP/PostgreSQL positive/negative, 후보
  non-disclosure, 일반 사용자 browser 재배정·reload.

### `SF-B368-G20` — Production UI smoke 계약 동기화

- Risk / Size: M / S
- 소유 파일:
  - `tools/release/check-production-ui-smoke.mjs`
  - guard에서 검출된 최소 production UI 표현
- 발견 근거: G01~G19 구현 후 smoke guard가 계획에서 의도적으로 제거한 Home 업로드
  dead action, Work·알림의 dashboard fallback, 중복 source/status/attention filter와
  하드코딩 route를 여전히 필수로 요구했다. 실제 제품 단일 소유권은 맞지만 stale
  verification contract 때문에 최종 gate가 실패했다.
- 목표: smoke guard를 현재 서버 권위·단일 소유권 계약과 맞추되 보안·데이터·route
  검증 범위를 약화하지 않는다.
- Acceptance:
  - Home은 Work가 바로가기보다 먼저이며 search/Work의 실제 route만 요구한다.
  - Work는 dedicated API, URL-owned kind/assignee/tabs, item capability, item-scoped
    후보 API와 서버 제공 action href를 요구한다.
  - 알림은 dedicated persisted API, source/status/attention filter와 partial 상태를
    요구하고 제거된 dashboard fallback을 요구하지 않는다.
  - fake count용 `?? 0`, raw UUID, dead action, hidden route, production literal 등 기존
    공통 금지 guard는 유지한다.
- Verification: `pnpm ui:production-smoke`, guard negative spot check, `git diff --check`.

### `SF-B368-G21` — Files page export 경계 폐쇄

- Risk / Size: M / S
- 소유 파일:
  - `apps/web/src/app/(app)/files/page.tsx`
  - Files Workbench의 순수 state helper와 tests
- 발견 근거: G18 focused test는 통과했지만 `next build`가 테스트용 named helper export를
  Next.js Page의 허용되지 않은 export로 판정해 production build가 실패했다.
- 목표: 실제 Page는 default component만 export하고, 테스트 가능한 순수 선택/preview
  계산은 같은 route의 일반 module에서 page와 test가 함께 사용한다.
- Acceptance:
  - `page.tsx`에는 Next.js가 허용하는 Page export만 남는다.
  - Matter reference, upload revision, explicit preview-selection 계산은 production page와
    test가 같은 helper implementation을 사용한다.
  - 선택 전 preview 0회와 선택 후 정확한 document ID 전달 계약이 유지된다.
- Verification: Files focused tests, Web typecheck/lint, `pnpm build`, `git diff --check`.

### `SF-B368-G22` — Matter page export 경계 폐쇄

- Risk / Size: M / S
- 소유 파일:
  - `apps/web/src/app/(app)/matters/page.tsx`
  - `apps/web/src/app/(app)/matters/[matterId]/page.tsx`
  - 같은 route의 load/state helpers와 tests
- 발견 근거: G21을 반영한 다음 `next build`가 Matter 목록·상세 Page의 테스트용 named
  helper export를 동일한 허용되지 않은 Page export로 판정했다.
- 목표: Next.js Page는 default component만 export하고, 목록 load state·이메일 timeline
  partial failure·한국어 label·Matter context는 일반 module로 분리해 production과 test가
  같은 구현을 사용한다.
- Acceptance:
  - 두 `page.tsx`에는 Next.js가 허용하는 Page export만 남는다.
  - 목록 ready/empty/error와 상세 이메일 partial failure를 실제 async helper로 검증한다.
  - Matter 유형·상태·위험·보안/보존 표현을 helper/component 결과로 검증하며 새
    production source 문자열 검사를 증거로 사용하지 않는다.
  - 기존 다섯 탭, Matter Work, 관련 Matter와 dashboard surface는 유지된다.
- Verification: Matter focused tests, Web typecheck/lint, `pnpm build`, `git diff --check`.

### `SF-B368-G23` — Work 재배정 후보 조회 TOCTOU 폐쇄

- Risk / Size: C / M
- 소유 파일:
  - `apps/api/src/modules/work/work.service.ts`
  - Work unit·HTTP/PostgreSQL integration tests
- 발견 근거: G19의 후보 조회가 Work target 권한 확인과 후보 목록 조회를 별도 SQL로
  수행해, 두 statement 사이 완료 처리·actor membership/DENY/Wall 변경이 일어나도
  이전 Matter 기준 후보가 반환될 수 있었다.
- 목표: 후보를 반환하는 query/transaction snapshot 안에서 현재 Work 미완료 상태,
  actor의 mutation capability, Matter membership·DENY·Wall과 후보 membership을 함께
  재확인한다.
- Acceptance:
  - 완료·삭제·권한 취소·Wall 활성·limited reviewer 전환과 경합하면 후보를 반환하지
    않고 safe canonical denial로 실패 폐쇄한다.
  - 다른 Matter/tenant의 사용자나 Matter 식별자는 응답에 노출하지 않는다.
  - 정상 actor에게는 같은 Matter의 active internal 후보만 bounded response로 반환한다.
- Verification: focused unit, 실제 HTTP/PostgreSQL race/negative, audit 0,
  API lint/typecheck, full integration.

### `SF-B368-G24` — Document drawer 포커스 안정성

- Risk / Size: H / S
- 소유 파일:
  - Document Workbench drawer shell
  - Files/Search drawer caller와 mounted interaction tests
- 발견 근거: 열린 drawer의 parent rerender마다 inline `onClose` identity가 바뀌면서
  controller/effect가 재생성되어 close button이 포커스를 반복 탈취할 수 있었다.
- 목표: 최초 open 시에만 initial focus를 이동하고 열린 상태의 일반 rerender는 현재
  사용자 포커스를 보존한다.
- Acceptance:
  - open 후 field/control로 이동한 포커스는 parent rerender에도 유지된다.
  - Tab containment, Escape/close, trigger focus return은 실제 mounted event path에서
    계속 동작한다.
  - Files와 Search caller 모두 같은 안정된 drawer 계약을 사용한다.
- Verification: mounted rerender/keyboard/focus tests, desktop/mobile browser,
  Web lint/typecheck/full tests.

### `SF-B368-G25` — Matter conflict 비동기 응답 경합 폐쇄

- Risk / Size: H / S
- 소유 파일:
  - `apps/web/src/components/matter/matter-conflicts-panel.tsx`
  - component async behavior tests
- 발견 근거: `matterId` 변경 후 이전 `listMatterConflictChecks` promise가 늦게
  resolve/reject하면 새 Matter의 후보·상태를 덮을 수 있었다.
- 목표: request generation 또는 취소 guard로 현재 Matter 요청만 state를 갱신한다.
- Acceptance:
  - `matterId`가 바뀐 직후 effect 전 render도 이전 후보를 숨기고 loading/empty state만
    표시한다.
  - 이전 Matter의 늦은 success/error는 새 Matter 화면에 반영되지 않는다.
  - 새 Matter의 loading, empty, ready, error 의미는 유지된다.
  - 실제 async component path로 old/new response 순서를 검증한다.
- Verification: focused mounted async tests, Web full tests/lint/typecheck.

### `SF-B368-G26` — Client 목록 비동기 응답 경합 폐쇄

- Risk / Size: H / S
- 소유 파일:
  - `apps/web/src/app/(app)/clients/page.tsx`
  - 같은 route의 list load helper와 tests
- 발견 근거: 검색 또는 새로고침 중 이전 `listClients` 응답이 늦게 완료되면 최신 검색
  결과·오류 상태를 덮을 수 있었다.
- 목표: query/refresh generation 기준 최신 요청만 Client list state에 반영한다.
- Acceptance:
  - 검색 제출 시 effect 전부터 이전 rows를 지우고 현재 요청을 무효화한다.
  - 이전 query의 늦은 success/error는 최신 query 결과를 바꾸지 않는다.
  - 검색, 생성 후 refresh, loading/empty/error 상태가 동일 generation 계약을 따른다.
  - 동명 고객과 partial portfolio 계약은 유지된다.
- Verification: focused mounted async race tests, Web full tests/lint/typecheck,
  actual browser rapid-search/refresh.

### `SF-B368-G27` — Matter 상세 route identity 경계

- Risk / Size: C / S
- 소유 파일:
  - `apps/web/src/app/(app)/matters/[matterId]/page.tsx`
  - 같은 route의 stateful content/helper와 tests
- 발견 근거: client Page가 같은 component identity로 새 `params.matterId`를 받으면
  effect가 실행되기 전 기존 Matter·email·dashboard·related state가 한 render 유지될 수
  있어 새 URL 아래 이전 Matter 내용을 노출할 가능성이 있었다.
- 목표: route Matter ID가 바뀌는 즉시 stateful 상세 surface의 identity를 교체하고 모든
  Matter-scoped state를 loading/empty 초기값에서 다시 시작한다.
- Acceptance:
  - dynamic Matter 전환의 effect 전 render에 이전 Matter 이름·후보·email·dashboard가
    나타나지 않는다.
  - Page의 default export 경계는 G22를 계속 충족하며 허용되지 않은 named export를
    다시 도입하지 않는다.
  - direct load, client navigation, back/forward 모두 현재 URL의 Matter만 표시한다.
- Verification: focused route identity contract, `pnpm build`, actual browser two-Matter
  navigation/back-forward, Web full tests/lint/typecheck.

### `SF-B368-G28` — 신규 회귀 증거의 구현 독립성

- Risk / Size: M / S
- 소유 파일:
  - Search flow tests
  - Work controller·middleware fixture tests
- 발견 근거: 신규 검증 일부가 production source 문자열 또는 double type assertion에
  의존해, 실제 동작이 깨져도 구현 모양만 유지되면 통과할 수 있었다.
- 목표: 새 회귀 증거를 실제 함수·request/response·렌더링·브라우저 동작으로 구성하고
  타입 우회 fixture를 제거한다.
- Acceptance:
  - 신규 Search 검증은 source file 문자열을 읽지 않는다.
  - Work controller와 middleware fixture는 double assertion/`as never` 없이 실제
    parsing·redirect 계약을 실행한다.
  - dummy child 문자열을 되돌려 받는 것만으로 production wiring을 주장하지 않는다.
- Verification: focused unit, lint/typecheck, `git diff --check`, final browser flow.

### `SF-B368-G29` — 신규 Matter service fixture 타입 우회 제거

- Risk / Size: M / XS
- 소유 파일:
  - `apps/api/src/modules/matter/matter.service.spec.ts`
- 발견 근거: 최종 독립 코드 검토에서 기준선 이후 추가된 Matter service fixture가
  `as never` 9건으로 constructor 의존성 타입을 우회해, 잘못된 mock 계약도
  compile-time 검증을 통과할 수 있음이 확인됐다.
- 목표: 운영 코드를 바꾸지 않고 실제 constructor 계약에 맞는 typed fixture와
  transaction/query mock을 사용한다.
- Acceptance:
  - 해당 spec의 신규 `as never`가 0건이다.
  - 기존 Matter service 행위 검증 4건을 유지하며 source 문자열이나 dummy wiring
    assertion으로 대체하지 않는다.
  - production source와 dependency를 변경하지 않는다.
- Verification: focused Matter service spec, API lint/typecheck, Prettier,
  `git diff --check`, independent read-only code review.

### `SF-B368-G30` — 신규 Work service fixture 타입 우회 제거

- Risk / Size: M / XS
- 소유 파일:
  - `apps/api/src/modules/work/work.service.spec.ts`
- 발견 근거: G23 복원 후 최종 독립 코드 검토가 Work service constructor fixture에 남은
  `as never` 1건을 `WATCH`로 분류했다. 실제 PostgreSQL 통합 테스트가 독립 증거를
  제공하더라도 unit fixture의 잘못된 의존성 계약을 compile-time에 숨길 수 있다.
- 목표: Work service의 실제 constructor 의존성에 맞는 typed mock을 사용하고
  행위 검증은 그대로 유지한다.
- Acceptance:
  - 해당 신규 Work fixture의 `as never`와 double assertion이 0건이다.
  - production source, 통합 시나리오, dependency를 변경하지 않는다.
  - Work service 전체 단위 테스트와 G23 PostgreSQL 경쟁 테스트가 계속 통과한다.
- Verification: full Work service spec, API lint/typecheck, Prettier,
  `git diff --check`, independent read-only code review.

### `SF-B368-G31` — Graph 성능 검증의 실행 예산 정합화

- Risk / Size: M / XS
- 소유 파일:
  - `tests/integration/graph.spec.ts`
- 발견 근거: final fresh-DB 통합 회귀에서 100문서 graph sync 시나리오가 제품
  acceptance인 30초보다 훨씬 짧은 Vitest 기본 5초 제한에 먼저 종료됐다. 집중 실행
  4회의 실제 처리 시간은 2.96~3.48초였으며 제품 성능 assertion은 통과했다.
- 목표: 제품 예산 `<30초`는 유지하고 test process 예산만 그 assertion을 끝까지
  관찰할 수 있도록 명시한다.
- Acceptance:
  - 100문서 시나리오의 제품 assertion `elapsed < 30_000`을 유지한다.
  - 해당 test process timeout은 35초로 제한하며 skip, quarantine, retry,
    production source 변경을 도입하지 않는다.
  - exact 8-spec batch와 141-spec 전체 통합 회귀가 fresh DB에서 통과한다.
- Verification: focused performance scenario 반복, exact 8-spec batch, full
  `pnpm test:integration`, `git diff --check`.

### `SF-B368-G32` — 긴급 접근 알림의 한국어 계약 동기화

- Risk / Size: M / XS
- 소유 파일:
  - `tests/integration/permission/break-glass.spec.ts`
- 발견 근거: final fresh-DB 통합 회귀에서 운영 코드와 단위 테스트는 자연스러운
  `긴급 접근 승인 요청`을 사용했지만, 기존 통합 테스트만 과거
  `Break-glass 승인 요청` 문구를 요구해 현재 사용자 문구 계약을 거부했다.
- 목표: production copy를 되돌리지 않고 end-to-end 알림 계약을 현재 한국어 표현과
  맞춘다.
- Acceptance:
  - 관리자 알림의 제목은 `긴급 접근 승인 요청`이다.
  - 응답에 과거 `Break-glass 승인 요청`, raw reason code, request ID가 나오지 않는다.
  - production source, 권한·감사 행위, break-glass 상태 전이를 변경하지 않는다.
  - focused break-glass spec과 141-spec 전체 통합 회귀가 fresh DB에서 통과한다.
- Verification: focused integration, full `pnpm test:integration`, `git diff --check`,
  independent read-only code review.

### `SF-B368-G33` — 인증 history의 로그인 화면 재노출 폐쇄

- Risk / Size: H / S
- 소유 파일:
  - `apps/web/src/app/(auth)/login/login-form.tsx`
  - `apps/web/src/app/(app)/logout-button.tsx`
  - `apps/web/src/lib/auth.ts`
  - `apps/web/src/lib/api-client.ts`
  - 관련 Web tests
- 발견 근거: 최종 운영 모드 브라우저 검증에서 로그아웃 뒤 보호 경로를 직접 열고
  로그인하면 올바른 `next`로 복귀했지만, 브라우저 Back이 history에 남은 이전
  `/login`을 다시 표시했다. 또한 명시적 로그아웃과 세션 만료 이동이
  `location.assign`으로 로그인 entry를 추가하고 있었다.
- 목표: 로그인 성공 시 현재 entry 소비뿐 아니라, 활성 세션으로 과거 로그인 entry를
  다시 방문한 경우에도 서버로 확인한 세션만 원래 목적지 또는 Home으로 복귀시키고
  명시적 로그아웃·세션 만료 이동은 replace 의미를 사용한다.
- Acceptance:
  - 명시적 로그아웃과 `AUTH_REQUIRED` 전역 이동은 `/login`을 새 history entry로
    추가하지 않는다.
  - 로그인 화면은 `/auth/me`가 실제로 성공한 경우에만 allowlisted `next` 또는
    `/dashboard`로 replace하며, stale/없는 세션·연결 실패에서는 로그인 폼을 유지한다.
  - 초기 진입과 BFCache `pageshow` 복원 모두 같은 세션 확인 계약을 사용한다.
  - 로그아웃 → 보호 deep link → 로그인 → Back 시 `/login`이 다시 표시되지 않는다.
  - 기존 absolute/protocol-relative/loop/malformed/repeated `next` fail-closed 계약을
    유지하고 신규 dependency를 추가하지 않는다.
- Verification: focused navigation/session tests, Web full tests/lint/typecheck/build,
  운영 모드 브라우저 deep-link/login/Back 재현, independent read-only code review.

## 4. 실행 순서

```text
G01 ─┬─ G02
     ├─ G03
     ├─ G04
     ├─ G05
     ├─ G06
     └─ G10

G03 ─ G12 ─ G14 ───────────────┐
G07 ─ G08 ─ G09 ─ G13 ─────────┤
G01 ─ G15 ──────────────────────┤
G10 ─ G16 ──────────────────────┤
G04 ─ G17 ──────────────────────┤
G05 ─ G18 ──────────────────────┤
G07 ─ G08 ─ G19 ────────────────┤
G01~G19 전체 ─ G20 ─────────────┤
G05 ─ G18 ─ G21 ────────────────┤
G03 ─ G14 ─ G22 ────────────────┤
G19 ─ G23 ───────────────────────┤
G18 ─ G24 ───────────────────────┤
G14 ─ G25 ───────────────────────┤
G17 ─ G26 ───────────────────────┤
G22 ─ G27 ───────────────────────┤
G06/G12/G16 ─ G28 ───────────────┤
G28 ─ G29 ────────────────────────┤
G29 ─ G30 ────────────────────────┤
G30 ─ G31 ────────────────────────┤
G31 ─ G32 ────────────────────────┤
G16 ─ G33 ────────────────────────┤
G01~G33 전체 ───────────────────┴─ G11
```

- 파일 소유권이 겹치지 않는 G01~G06, G10은 병렬 실행할 수 있다.
- G03의 Matter Work UI는 G08의 shared/API read contract와 맞춰 통합한다.
- G07과 G09는 Work UI 파일이 겹치므로 순차 또는 명시적 파일 분할로 실행한다.
- Risk=C 변경은 구현·negative test·독립 코드 리뷰까지 수행하되, 이 문서는 merge/release
  권한을 확장하지 않는다.

## 5. 완료 기준

`SF-B368-G01~G33`의 acceptance와 전체 회귀가 모두 통과하고, 원 계획의
`SF-B368-001~020`, `C01~C03`를 최종 코드 SHA에서 다시 판정했을 때만
“계획과 goal대로 100% 로컬 구현”이라고 기록한다. 그렇지 않으면 통과 범위와 남은
경계를 수치로 보고한다.
