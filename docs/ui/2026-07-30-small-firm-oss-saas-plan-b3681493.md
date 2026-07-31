# 소규모 로펌용 OSS SaaS UI 실행 계획 — `b3681493`

> 상태: **VERIFIED — LOCAL IMPLEMENTATION COMPLETE; NOT RELEASED**
>
> 기준선: `origin/main@b3681493970714fa2d1f583a2a16f7c5d4a26582`
>
> 작업 브랜치: `codex/small-firm-oss-saas-b3681493`
>
> 작성일: 2026-07-30
>
> 대상: 10명 안팎의 한국 로펌이 매일 사용하는 Matter·문서·검색·마감·인계 화면

> 2026-07-31 재검증에서 확인한 acceptance와 증거 공백은
> `docs/ui/2026-07-31-small-firm-oss-saas-gap-closure-plan-b3681493.md`의
> G01~G35로 폐쇄했다. 최종 판정과 exact-SHA 증거는
> `docs/ui/2026-07-31-small-firm-oss-saas-gap-closure-verification-b3681493.md`를
> 따른다.

## 0. 이 문서의 효력과 실행 전제

이 문서는 현재 제품을 “최근 작업으로 빠르게 돌아가고, 오늘 할 일을 놓치지 않는” 소규모 로펌용 OSS SaaS 흐름으로 정리하기 위한 실행 계획이다. 화면을 새로 꾸미는 계획이 아니라, 이미 구현된 권한·검색·문서 Workbench를 재사용하면서 일반 사용자 화면에서 관리 복잡도와 중복 동선을 걷어내는 계획이다.

- 기준선은 위 커밋의 **커밋된 상태**다. 이 문서 작성 시 작업 트리에 존재하는 동시 편집은 기준선이나 완료 증빙이 아니다.
- 현재 운영자 요청은 아래 Risk M/H의 **UI-only 작업을 이 브랜치에서 실행하도록 승인**한다. `SF-B368-*`는 이 실행을 추적하는 작업 단위다.
- schema, permission semantics, 역할 모델, audit 계약을 바꾸는 작업과 Risk=C 작업만 canonical PACK/TUW 매핑, release gate, `needs-human-review`, 독립 검토가 선행되어야 한다. 이 조건은 일반 UI 작업을 차단하지 않는다.
- 이 문서는 `docs/package/**`를 변경하지 않는다. 규범 충돌 시 `docs/package/codex/00_Master_Brief.md`와 해당 release의 TUW/PACK 정의가 우선한다.
- 한 실행 단위는 최대 2일이다. 범위를 넘기거나 아래 `Files` 밖 변경이 필요하면 해당 단위를 중단하고 분할·승인한다.
- 이 계획만으로 머지·배포·실데이터·로그인된 패키지 검증이 완료되었다고 간주하지 않는다.
- Risk=C 코드 변경은 `needs-human-review`와 독립 검토 AI의 체크리스트/ledger 기록 없이는 머지하지 않는다. Codex는 스스로 머지하지 않는다.

## 1. 입력 근거와 채택 결정

### 1.1 규범 및 기존 계획

- `docs/package/codex/00_Master_Brief.md`
- `docs/ui/enterprise-dms-ux-tuw-plan.md`
- `docs/ui/dms-oss-workbench-tuw-plan-2026-07-28.md`
- Lazyweb 보고서: [Simplify law firm DMS dashboard](https://www.lazyweb.com/report/lazyweb/2ae0b434-517b-4995-88b8-261ce4855f82/?source=create)

Lazyweb 보고서의 핵심 진단은 최근 Matter/문서로 돌아가는 경로와 마감·인계 큐가 약하고, 일반 사용자 홈에 관리/운영 정보가 과도하다는 것이다. 아래처럼 선별해 적용한다.

| 보고서 제안                    | 결정                  | AMIC Vault 적용 방식                                                                                                                            |
| ------------------------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Search Workbench + saved views | 채택, 중복 구현 금지  | 이미 완성된 전역 검색과 `/search` Workbench를 단일 소유자로 유지한다. 홈에 검색 상태나 결과 표를 복제하지 않는다.                               |
| Last Matter Launch             | 이번 tranche에서 보류 | 자동 이동은 하지 않는다. 기존 API로 정확한 최근 접근을 입증할 수 없으면 `C02`의 read-model 조건으로 분리하며 localStorage를 권위로 쓰지 않는다. |
| Work Queue Home                | 채택                  | 기존 `GET /work/items`와 `dueAt`·`assignedToLabel`을 사용해 오늘의 작업과 임박 마감을 홈 첫 화면에 둔다.                                        |
| Recent Matter/Document Strip   | 채택                  | 권한 범위 내 최대 5개씩 제공한다. 현재 API 정렬 의미와 라벨을 일치시키고, 부족한 집계/최근성은 `C02`의 조건부 read model로 분리한다.            |
| Matter Inbox                   | 보류                  | 새 메시지/인박스 도메인과 가짜 카운트를 만들지 않는다.                                                                                          |
| Work/Admin 탭                  | 미채택                | 새 탭 체계를 만들지 않고 기존 `/admin`과 역할 가드를 재사용한다.                                                                                |
| Security in Context            | 원칙 채택             | 평상시 배너/배지는 줄이되 거부·Ethical Wall·legal hold·권한 오류는 강하게 유지한다. 정책 자체는 변경하지 않는다.                                |
| Empty Panel Fold               | 부분 채택             | 빈 패널을 장식으로 채우지 않는다. 명확한 빈 상태 또는 해당 섹션 자체를 생략한다.                                                                |

참조 제품의 픽셀·문구·스크린샷을 복제하지 않는다. Docsum의 검색 가능한 표, Notion의 작업/마감/최근 항목 같은 정보 구조만 AMIC Vault의 권한·감사 계약 안에서 번역한다.

### 1.2 UI persona와 route 소유권

persona는 새 backend role이 아니라 기존 role을 같은 정보 구조로 검증하기 위한 UI 관점이다.

| UI persona         | 포함될 수 있는 기존 role                                                 | 주 업무                                | 기본 route                                              |
| ------------------ | ------------------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------- |
| 담당 실무자        | `matter_owner`, `matter_member`, `limited_reviewer`, `knowledge_manager` | 오늘 할 일, Matter, Client, 문서, 검색 | `/dashboard`, `/matters`, `/clients`, `/files`, `/work` |
| 업무 지원자        | 허가된 `matter_member` 또는 `limited_reviewer`                           | 접수·정리·마감·인계·알림               | 같은 5-item nav; 권한 없는 데이터는 fail-closed         |
| 소규모 로펌 관리자 | `firm_admin`, `security_admin`                                           | 일반 업무 + 사용자/조직/보안 운영      | 같은 5-item nav + 단일 `/admin` 허브                    |

전역 검색은 shell, 알림은 Work Inbox, saved search는 `/search`가 소유한다. `/walls`는 어떤 persona의 메뉴나 admin 허브에도 넣지 않지만 직접 URL·role guard·정책·enforcement는 보존한다. `/enterprise` 기능이 admin 허브에서 필요할 때 사용자 표시명은 “조직 설정”처럼 업무 언어를 사용하고 “Enterprise/엔터프라이즈” 개발자 표현을 노출하지 않는다.

### 1.3 Ponytail 적용

구현 전 다음 순서로 멈출 지점을 찾는다.

1. 이미 있는 `/search`, `DocumentWorkbenchShell`, `DashboardWorkQueueSection`, `listMatters`, `/admin`, UI primitives를 재사용한다.
2. 기존 DTO로 표현할 수 없는 경우에만 계약 단위를 먼저 승인한다.
3. 새 상태 저장소, 라우트, 추상화, 패키지, 마이그레이션을 기본 해법으로 삼지 않는다.
4. 한 화면의 공통 문제는 한 소유자에서 고치되, 명시된 보안·검증을 줄이지 않는다.

## 2. 기준선에서 이미 끝난 것 — 재구현 금지

아래 항목은 `origin/main@b3681493`에서 완료된 기반이다. 이번 계획의 완료 건수에 다시 포함하지 않는다.

| 완료 기반                                                     | 기준선 증빙/소유자                                                                                                | 이번 계획의 경계                                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `PageHeader` 설명 문장과 중복 2줄 helper copy 제거            | PR #411, `e1e50ac3`; `apps/web/src/components/ui/page-header.tsx` 및 각 route                                     | 설명 문장을 되살리거나 새 범용 부제목을 붙이지 않는다.                                  |
| `/walls` 일반 내비게이션 숨김                                 | `apps/web/src/lib/features.ts`, `apps/web/src/lib/navigation.ts`; 직접 경로·역할 가드·정책은 유지                 | 숨김을 정책 제거로 해석하지 않는다. 일반 사용자 메뉴에 다시 노출하지 않는다.            |
| 반응형 App Shell과 전역 검색                                  | `apps/web/src/app/(app)/app-shell.tsx`, 관련 테스트                                                               | 전역 검색은 `/search?q=…`로 이동하는 유일한 빠른 검색이다. 홈 검색창을 추가하지 않는다. |
| `/files` Document Workbench                                   | `apps/web/src/app/(app)/files/**`, `apps/web/src/components/document/document-workbench-shell.tsx`                | 3-pane Workbench, 명시적 preview, 모바일 drawer를 재구현하지 않는다.                    |
| `/search` Search Workbench·필터·saved search·recent file 기반 | `apps/web/src/app/(app)/search/**`, `apps/web/src/components/search/**`                                           | 검색 쿼리/필터/facet/saved search의 소유권을 홈으로 옮기지 않는다.                      |
| 문서 작업 기반                                                | folders/tags, bulk upload, org picker, saved searches, editing, work/notifications, records 관련 기존 route와 API | 이 계획은 기반 기능을 새로 만들지 않고 내비게이션·홈·목록 노출만 단순화한다.            |

## 3. 현재 동시 구현 관찰과 진행 현황

아래 상태는 최초 작업 트리 관찰을 2026-07-31 exact-SHA 최종 검증 결과로 갱신한 것이다.

| ID                | 상태       | 현재 관찰                                                                                       | 최종 증빙                                                                                                        |
| ----------------- | ---------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `SF-B368-001`     | 완료(계획) | exact-main, 세 UI persona, route 소유권, 완료 기반을 이 문서에 고정                             | 코드 완료가 아니라 계획 증빙                                                                                     |
| `SF-B368-002`     | 구현 완료  | 일반 사용자 rail을 홈·Matter·고객·문서함·작업함 5개로 고정하고 관리자만 관리자 설정을 추가      | 역할별 route·모바일·키보드 검증 완료                                                                             |
| `SF-B368-003`     | 구현 완료  | 전역 검색, Work 알림, Search saved-search로 진입점 소유권 통합                                  | deep-link 회귀 완료                                                                                              |
| `SF-B368-004`     | 구현 완료  | 공통 loading/error/forbidden/blocked 상태와 자연스러운 한국어 접근 범위 문구 적용               | 공통 상태·seed 회귀 완료                                                                                         |
| `SF-B368-005`     | 구현 완료  | 고정 최소 폭을 제거하고 좁은 화면에서 핵심 열을 우선 노출                                       | 네 viewport와 primitive 검증 완료                                                                                |
| `SF-B368-006`     | 구현 완료  | 홈을 내 작업·마감·Matter·문서 복귀 경로로 단순화                                                | 부분 실패·빈 상태 의미 테스트 완료                                                                               |
| `SF-B368-007`     | 구현 완료  | 빠른 작업을 업로드·검색·작업함으로 한정하고 관리/연동 홍보 패널 제거                            | dead action 회귀 완료                                                                                            |
| `SF-B368-008`     | 구현 완료  | Matter 표를 업무 식별·상태 중심으로 정리                                                        | 접근성·좁은 폭 회귀 완료                                                                                         |
| `SF-B368-009`     | 구현 완료  | 권한 쿼리와 같은 WHERE에 code/name/client 이름의 최소 `q` 검색 추가                             | explicit DENY·조건부 권한·insider-required Wall negative test 및 전체 통합 회귀 통과                             |
| `SF-B368-010`     | 구현 완료  | Matter 상세를 개요·문서·업무·팀·활동 5탭으로 통합                                               | 탭 keyboard·URL·history·legacy anchor 회귀 완료                                                                  |
| `SF-B368-011`     | 구현 완료  | 정상 Matter의 상시 보안 장식은 제거하고 실제 제한·Wall·hold 의미는 보존                         | 차단 상태 회귀 완료                                                                                              |
| `SF-B368-012`     | 구현 완료  | 고객 화면을 검색 가능한 목록 우선 흐름과 접을 수 있는 생성 폼으로 정리                          | 목록·생성·상세 회귀 완료                                                                                         |
| `SF-B368-013`     | 구현 완료  | `getClient + listMatters(clientId)`의 정확한 total/items/partial 의미만 노출                    | fake aggregate 없음 검증 완료                                                                                    |
| `SF-B368-014`     | 구현 완료  | 문서 Workbench 중복 helper를 줄이고 기존 기능 보존                                              | 렌더·기능 회귀 완료                                                                                              |
| `SF-B368-015`     | 구현 완료  | saved search 소유권을 `/search`로 통일하고 `/search/folders` 호환 redirect 유지                 | matter-team·personal·admin-shared list/open/save/revoke와 legacy Matter 참조의 현재 권한·Wall negative test 통과 |
| `SF-B368-016`     | 구현 완료  | Work의 `mine`·`notifications` 단일 Inbox shell 제공                                             | 기존 route와 URL 상태 호환 완료                                                                                  |
| `SF-B368-017`     | 구현 완료  | 소규모 기본값을 `mine`으로 유지하고 서버 영속 assignment/due 계약 사용                          | G08/G19/G23의 mutation·동시성·새 세션 회귀 완료                                                                  |
| `SF-B368-018`     | 구현 완료  | 기존 7개 backend role을 바꾸지 않고 일반/관리 UI 행렬 고정                                      | persona·role 회귀 완료                                                                                           |
| `SF-B368-019`     | 구현 완료  | 숨긴 고급 route의 직접 접근 guard와 기존 deep link 보존                                         | 관리자 허용·일반 사용자 차단·조회 오류 fail-closed 동작 테스트와 실화면 통과                                     |
| `SF-B368-020`     | 구현 완료  | 자동·보안·렌더·접근성·AI slop closeout 수행                                                     | exact 코드 SHA 검증 기록 연결                                                                                    |
| `SF-B368-C01~C03` | 최종 종결  | C01은 canonical membership 유지, C02는 기존 read 계약, C03은 G08/G12/G19/G23 추가 구현으로 폐쇄 | 최종 gap-closure 영수증에서 3/3 PASS                                                                             |

## 4. 불변 보안·데이터 규칙

모든 단위는 아래 규칙을 AND 조건으로 통과해야 한다.

1. **Permission-before-search**: Matter·문서·검색 결과는 쿼리 단계에서 권한 범위를 적용한다. 클라이언트 사후 필터링 금지.
2. **Permission-before-AI**: 이번 계획은 AI 기능을 만들지 않는다. 홈에서 AI 준비/홍보 패널을 없애도 AI 정책을 완화하지 않는다.
3. **Audit-by-default**: 새 mutation은 만들지 않는 것이 기본이다. 부득이한 행위가 생기면 audit와 같은 트랜잭션으로 실패 원자성을 보장한다.
4. **Fail-closed**: 권한 판단 실패, 미해석 조건, API 오류는 허용이나 빈 목록으로 바꾸지 않는다. 존재 여부를 누설하지 않는 `PERMISSION_DENIED`를 사용한다.
5. **Immutable original**: 최근/작업/미리보기 UI는 원본을 수정하거나 덮어쓰지 않는다.
6. **No silent external sharing**: 외부 공유·secure link·포털·외부 사용자는 이 계획 범위 밖이다.
7. **Sensitive data is not logged**: 문서 제목·본문·client/matter 원문을 URL, telemetry, log, audit metadata에 새로 넣지 않는다. 참조 ID/hash만 허용한다.
8. 일반 화면에서 보안 장식을 줄이는 것은 정책·가드·직접 route·Ethical Wall·legal hold를 제거하는 일이 아니다.
9. raw UUID는 사용자에게 뜻 있는 식별자가 아니다. 목록/배지/오류에 노출하지 않되 내부 React key·허가된 path segment 사용까지 금지하는 것은 아니다.
10. 기존 표준 error code만 사용한다. 새로운 사용자 친화적 문구가 원래 거부 이유나 객체 존재를 누설하면 안 된다.

## 5. 명시적 제외 범위

- Microsoft 365, Outlook, OneDrive, Office/WOPI 연결·쓰기·인증 흐름
- 외부 공유, VDR, client portal, secure link, 외부 사용자·외부 알림
- 외부 AI/LLM, 벡터 검색, embedding, Neo4j, 신규 외부 API
- 외부 tenant/vendor credential, staging/production 배포, 외부 런타임 authenticated smoke
- 실사용자 소유자 승인, 패키징/공증/릴리스/GA 선언
- 새 상태 관리 라이브러리, 디자인 시스템 교체, 신규 dependency
- 스키마/마이그레이션은 기본 제외다. `C01` 또는 `C03`가 실제 schema/permission semantics 변경을 요구하면 canonical PACK과 release gate로 분리한다.
- `/files`·`/search` Workbench 자체 재설계, Matter 권한 모델 변경, Ethical Wall 정책 변경
- fake KPI, fake deadline, fake recent, demo-only count, 로컬 저장소를 권위 데이터로 사용하는 최근 목록

## 6. 공통 상태·검증 규약

### 6.1 상태 의미

- `대기`: 코드 착수 전.
- `진행 중/부분`: 파일 편집이 관찰되었으나 acceptance와 전체 verification 미충족.
- `차단`: 계약·권한·fixture·정규 PACK 매핑이 없어 안전하게 진행할 수 없음.
- `구현 완료`: 해당 단위의 테스트와 정적 검증 통과. 머지·배포 완료와 다르다.
- `릴리스 완료`: 별도 release gate와 외부 runtime 증빙까지 통과한 경우에만 사용한다.

### 6.2 검증 프로필

각 TUW의 `V-*` 표기는 아래 명령 묶음을 뜻한다.

**V-WEB — 기본 Web 회귀**

```bash
pnpm --filter @amic-vault/web lint
pnpm --filter @amic-vault/web typecheck
pnpm --filter @amic-vault/web test
pnpm --filter @amic-vault/web build
git diff --check
```

**V-UI — 제품 UI 규칙**

```bash
pnpm check:production-ui-literals
pnpm check:ui-pr-checklist
pnpm ui:production-smoke
python3 /Users/jws/Applications/ai-slop-taxonomy/scripts/sloplint.py --repo "$PWD" --changed
```

렌더링은 실제 로컬 앱에서 `1440x900`, `1024x768`, `768x1024`, `390x844`를 확인한다. 키보드 이동, focus visible, Escape, focus return, 200% 확대, 긴 한국어, 빈/오류/권한 없음 상태를 포함한다. lint는 시각 검증을 대체하지 않는다.

**V-ROOT — 전체 회귀**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm docs:frozen
pnpm backlog:validate
```

**V-SEC — API/권한 영향**

```bash
pnpm test:integration
```

API·스키마를 바꾸는 승인된 단위는 AGENTS §5의 install, compose, migrate → rollback → migrate, seed까지 전부 실행한다. 이 계획은 기본적으로 스키마 변경을 허용하지 않는다.

아래 모든 `SF-B368-*` 단위는 §4의 보안·데이터 불변식과 §5의 외부 통합 제외를 개별 Acceptance로 상속한다. 각 단위의 `Security/External` 표기는 이를 반복 확인하는 것으로, 생략하거나 완화할 수 없다.

## 7. 실행 그룹과 상세 TUW

### Group A — 기준선·5-item shell·공통 표현

#### `SF-B368-001` — 기준선·persona·route 근거 잠금

- 상태 / Risk / 크기: **완료(계획)** / M / S(0.5일)
- 의존성: 없음
- Files: `docs/ui/2026-07-30-small-firm-oss-saas-plan-b3681493.md`
- 목표: exact-main, 세 UI persona, route 소유권, 완료 기반과 동시 편집 상태를 고정한다.
- Acceptance:
  - 커밋 SHA, branch, Lazyweb URL, 세 persona와 각 기본 route가 명시된다.
  - PageHeader/helper copy, `/walls` nav 숨김, responsive shell/global search, Workbench/search 기반을 재구현 대상에서 제외한다.
  - `SF-B368-001~020`, `SF-B368-C01~C03`가 각각 최대 2일 단위로 존재한다.
  - 코드 완료·배포 완료를 주장하지 않는다.
- Verification: `git diff --check -- docs/ui/2026-07-30-small-firm-oss-saas-plan-b3681493.md`; 모든 ID가 1개 상세 절을 갖는지 확인.
- Edge/stop: 기준 SHA나 route 실재가 불일치하면 계획의 완료 표시를 제거하고 재조사한다.
- Security/External: §4 전부, §5 전부.

#### `SF-B368-002` — 일반 사용자 5-item 내비게이션

- 상태 / Risk / 크기: **구현 완료** / H / M(1일)
- 의존성: `001`
- Files: `apps/web/src/lib/features.ts`, `apps/web/src/lib/features.test.ts`, `apps/web/src/lib/navigation.ts`, `apps/web/src/lib/navigation.test.ts`, `apps/web/src/app/(app)/app-shell.test.tsx`
- 목표: 일반 사용자 rail을 **홈·Matter·Client·문서·업무** 다섯 항목으로 고정한다.
- Acceptance:
  - desktop/mobile에서 `/dashboard`, `/matters`, `/clients`, `/files`, `/work` 순서와 명칭이 같다.
  - admin persona만 같은 5개에 `/admin` 한 항목을 추가로 본다.
  - `/walls`, `/enterprise`, `/search`, `/search/folders`, `/notifications`는 기본 메뉴에 나타나지 않는다.
  - 숨김은 route·role guard·정책을 삭제하지 않는다.
- Verification: V-WEB, V-UI; navigation/app-shell focused tests.
- Edge/stop: 다섯 항목 밖의 유일한 필수 경로가 발견되면 여섯 번째 메뉴를 임의 추가하지 말고 `003`, `016`, `019`의 소유권으로 연결한다.
- Security/External: §4 전부, §5 전부.

#### `SF-B368-003` — 검색·알림·saved-search 중복 진입점 통합

- 상태 / Risk / 크기: **구현 완료** / H / M(1일)
- 의존성: `001`, `002`
- Files: `apps/web/src/app/(app)/app-shell.tsx`, `apps/web/src/app/(app)/app-shell.test.tsx`, `apps/web/src/lib/navigation.ts`, `apps/web/src/lib/navigation.test.ts`, `apps/web/src/components/search/search-workbench-rail.tsx`, `apps/web/src/components/search/search-workbench-rail.test.tsx`
- 목표: 전역 검색은 shell, saved search는 `/search`, 알림은 `/work` Inbox가 각각 한 번만 소유하게 한다.
- Acceptance:
  - shell search가 `/search?q=…`의 유일한 빠른 검색 입력이다.
  - saved-search 생성/목록/실행은 Search Workbench에만 있고 홈·rail에 결과 상태를 복제하지 않는다.
  - bell/알림 action은 `/work?view=notifications`로 연결하며 별도 nav item을 만들지 않는다.
  - 중복 제거 뒤에도 keyboard focus/Escape/focus-return 계약이 유지된다.
- Verification: V-WEB, V-UI; global-search, saved-search, notification-entry ownership tests.
- Edge/stop: 기능을 숨긴 뒤 유일 경로가 사라지면 새 카드보다 기존 소유자에 링크를 복구한다.
- Security/External: 검색 query 단계 권한 적용과 민감 query 금지 포함 §4 전부, §5 전부.

#### `SF-B368-004` — 사용자 copy와 data-state 중앙화

- 상태 / Risk / 크기: **구현 완료** / H / M(1일)
- 의존성: `001`
- Files: `apps/web/src/lib/data-state.ts`, `apps/web/src/lib/api/error-messages.ts`, `apps/web/src/lib/api/error-messages.spec.ts`, `apps/web/src/components/ui/empty-state.tsx`, `apps/web/src/components/ui/empty-state.test.tsx`, `apps/web/src/lib/i18n.tsx`, `apps/web/src/lib/i18n.test.tsx`
- 목표: loading, empty, error, denied의 의미와 안전한 한국어 copy를 공통 소유자에서 재사용한다.
- Acceptance:
  - `불러오는 중`, empty, transport error, `권한 없음`을 서로 바꾸어 쓰지 않는다.
  - raw UUID, 내부 enum/API 이름, reason 원문, 번역투 capability 문구를 사용자 copy로 노출하지 않는다.
  - 공통 `DataState`/error mapping을 소비하고 route별 임의 catch-all 문구를 늘리지 않는다.
  - 기존 표준 error code와 객체 존재 비누설을 유지한다.
- Verification: V-WEB; error-code/data-state/i18n focused tests, sloplint.
- Edge/stop: 공통화가 route 고유 복구 행동을 없애면 상태 모델은 공유하고 action copy는 소비자에 남긴다.
- Security/External: §4 전부, §5 전부.

### Group B — 밀도·홈·Matter

#### `SF-B368-005` — 정보 밀도와 design-system 보정

- 상태 / Risk / 크기: **구현 완료** / M / M(1일)
- 의존성: `001`, `004`
- Files: `apps/web/src/styles/globals.css`, `apps/web/src/components/ui/page-shell.tsx`, `apps/web/src/components/ui/section-card.tsx`, `apps/web/src/components/ui/filter-bar.tsx`, `apps/web/src/components/ui/filter-bar.test.tsx`, `apps/web/src/components/ui/data-table.tsx`, `apps/web/src/components/ui/data-table.test.tsx`, `apps/web/src/components/ui/layout-primitives.test.tsx`
- 목표: 기존 token/primitives로 10명 로펌의 촘촘한 표·필터·섹션 리듬을 맞추고 새 디자인 시스템을 만들지 않는다.
- Acceptance:
  - `PageShell`, `SectionCard`, `FilterBar`, `DataTable`의 기존 spacing/type/color token만 재사용한다.
  - 거대한 카드·과도한 rounded panel·장식 gradient·모든 문구 pill 처리를 추가하지 않는다.
  - 1440px에서 표가 업무 열을 충분히 보이고 390px에서 가로 넘침이 통제된다.
  - 공통 primitive 변경은 기존 소비자 snapshot/semantic test를 깨지 않는다.
- Verification: V-WEB, V-UI; 네 viewport 실제 렌더와 primitive tests.
- Edge/stop: 전역 primitive 변경이 unrelated surface를 흔들면 consumer-local class로 축소한다.
- Security/External: §4 전부, §5 전부.

#### `SF-B368-006` — daily-work Home

- 상태 / Risk / 크기: **구현 완료** / H / M(1일)
- 의존성: `004`; `005`와 병렬 가능
- Files: `apps/web/src/app/(app)/dashboard/vault-activity-client.tsx`, `apps/web/src/app/(app)/dashboard/vault-activity-client.test.tsx`, `apps/web/src/components/dashboard/dashboard-work-queue.tsx`, `apps/web/src/lib/api/work-ops.ts`, `apps/web/src/lib/api/work-ops.spec.ts`, `apps/web/src/lib/api/dashboard.ts`, `apps/web/src/lib/api/dashboard.spec.ts`
- 목표: 홈을 내 작업·임박 마감·Matter/문서 복귀 순서의 하루 업무 화면으로 만든다.
- Acceptance:
  - 기존 `GET /work/items?assignee=mine`의 최대 5개를 첫 영역에 표시하고 `/work` 전체 보기로 연결한다.
  - `dueAt`, Matter/문서 항목은 실제 DTO 값일 때만 표시하며 fake recent/deadline/count를 만들지 않는다.
  - 섹션별 loading/empty/error/denied를 분리하고 한 API 실패가 다른 성공 섹션을 지우지 않는다.
  - 일반 홈에서 usage/AI 준비/integration/connection 관리 패널과 그 불필요한 API 호출을 제거한다.
  - 현재 `listMatters` 정렬이 최근 접근이 아니면 “최근” 라벨을 쓰지 않고, 부족한 read model은 `C02`로 보낸다.
- Verification: V-WEB, V-UI; 0/1/5/>5, partial failure, delayed response, denied, long Korean title tests.
- Edge/stop: 데이터 의미를 기존 계약으로 설명할 수 없으면 클라이언트에서 추정하지 말고 `C02` trigger를 기록한다.
- Security/External: permission-scoped 결과와 민감 URL 금지 포함 §4 전부, §5 전부.

#### `SF-B368-007` — Home quick action과 capability gate

- 상태 / Risk / 크기: **구현 완료** / H / M(1일)
- 의존성: `002`, `006`
- Files: `apps/web/src/app/(app)/dashboard/vault-activity-client.tsx`, `apps/web/src/app/(app)/dashboard/vault-activity-client.test.tsx`, `apps/web/src/lib/features.ts`, `apps/web/src/lib/features.test.ts`
- 목표: 홈 quick action을 Matter 생성·문서 업로드 등 실제 가능한 소수 행동으로 줄이고 기존 route/capability gate를 적용한다.
- Acceptance:
  - 홈에 검색 input이나 전체 제품 카탈로그를 만들지 않는다.
  - role/route policy상 보이지 않는 행동은 렌더하지 않으며, 보이는 행동은 dead link가 아니다.
  - disabled 버튼으로 미구현 capability를 광고하지 않는다.
  - quick action이 작업 큐보다 시각적으로 우선하지 않는다.
- Verification: V-WEB, V-UI; role matrix와 every-action-target test.
- Edge/stop: UI role만으로 mutation 권한을 확정할 수 없으면 route 진입까지만 허용하고 server guard를 우회하지 않는다.
- Security/External: §4 전부, §5 전부.

#### `SF-B368-008` — Matter 목록 UI

- 상태 / Risk / 크기: **구현 완료** / H / L(2일)
- 의존성: `004`; filter data는 `009`, 공통 밀도 보정은 `005`와 병렬 가능
- Files: `apps/web/src/app/(app)/matters/page.tsx`, `apps/web/src/app/(app)/matters/page.test.tsx`, `apps/web/src/components/matter/matter-list-table.tsx`
- 목표: Matter code/이름, Client, 담당자, 상태, 다음 기한/최근 변경과 간결한 행 action을 중심으로 목록을 정리한다.
- Acceptance:
  - 정상 상태의 상시 보안 배너/“보호됨” 배지는 제거하되 restricted 상태는 `011`이 소유한다.
  - raw UUID·내부 source 명칭을 표시하지 않고 Matter code/이름을 주 식별자로 쓴다.
  - Matter detail 링크와 파일함/검색 action의 hit target·focus·accessible name이 겹치지 않고 overflow menu를 만들지 않는다.
  - 390px에서는 우선 열과 action이 남고 낮은 우선순위 열은 접근 가능한 방식으로 축약된다.
- Verification: V-WEB, V-UI; normal/empty/error/denied, duplicate name, keyboard menu, narrow-table tests.
- Edge/stop: 담당/기한 데이터가 DTO에 없으면 placeholder를 만들지 말고 `009` 또는 `C02`로 보낸다.
- Security/External: §4 전부, §5 전부.

#### `SF-B368-009` — Matter 목록 query/read API

- 상태 / Risk / 크기: **구현 완료** / C / L(2일)
- 의존성: `008`; read model 부족 시 `C02`
- Files: `packages/shared/src/matter/matter.dto.ts`, `packages/shared/src/matter/matter-validation.spec.ts`, `apps/api/src/modules/matter/dto/list-matters.query.ts`, `apps/api/src/modules/matter/matter.controller.ts`, `apps/api/src/modules/matter/matter.service.ts`, `apps/api/src/modules/matter/matter.service.spec.ts`, `apps/web/src/lib/api-client.ts`, `apps/web/src/lib/api-client.spec.ts`, `apps/web/src/app/(app)/matters/matter-list-query.ts`, `apps/web/src/app/(app)/matters/page.test.tsx`
- 목표: 기존 `status/matterType/clientId/page/pageSize`를 우선 재사용하고, UI에 꼭 필요한 `q/status/owner/due/cursor` 중 최소 계약만 permission-scoped read API에 추가한다.
- Acceptance:
  - `q`는 Matter code/name과 허가된 Client display 범위만 검색하고 permission SQL 뒤 사후 필터링하지 않는다.
  - owner/due/cursor를 추가하면 allowlist, 안정 정렬, cursor 변조/tenant mismatch 거부가 명세된다.
  - 지원하지 않는 filter는 조용히 무시하지 않고 `VALIDATION_FAILED`다.
  - query 값에 문서 본문·민감 메타데이터가 없고 server log에 원문을 남기지 않는다.
  - 기존 page 방식과의 compatibility를 유지하거나 `019`에서 명시적 변환한다.
- Verification: V-WEB, V-ROOT, V-SEC; cross-tenant, non-member, Wall DENY, invalid cursor, q/status/owner/due tests. Risk=C gate.
- Edge/stop: 2일 안에 5개 filter 전부가 필요하지 않으면 가장 작은 실제 UI 계약만 구현한다. schema/permission semantics 변경이면 canonical 매핑 전 중단한다.
- Security/External: permission-before-search와 fail-closed 포함 §4 전부, §5 전부.

#### `SF-B368-010` — Matter detail 5-tab IA

- 상태 / Risk / 크기: **구현 완료** / H / L(2일)
- 의존성: `004`, `008`
- Files: `apps/web/src/app/(app)/matters/[matterId]/page.tsx`, `apps/web/src/app/(app)/matters/[matterId]/page.test.tsx`, `apps/web/src/components/matter/matter-detail-tabs.tsx`(신규), `apps/web/src/components/matter/matter-detail-tabs.test.tsx`(신규), `apps/web/src/components/matter/matter-workstream-tabs.tsx`
- 목표: Matter detail을 **개요·문서·업무·팀·활동** 다섯 기본 탭으로 정리하고 전문 workstream은 2차 링크로 유지한다.
- Acceptance:
  - tab은 URL hash/query로 deep-link 가능하고 browser back/forward와 focus가 작동한다.
  - 문서는 기존 Matter file section, 업무는 기존 work item, 팀은 기존 member/team, 활동은 audit timeline을 재사용한다.
  - contracts/DD/litigation/knowledge route는 삭제하지 않고 전문 워크스트림 2차 진입으로 보존한다.
  - 권한 없는 탭 내용은 client에서 숨기는 것으로 허용을 대체하지 않는다.
- Verification: V-WEB, V-UI; five-tab keyboard/ARIA, deep-link, back-forward, restricted-content tests.
- Edge/stop: 한 탭이 새 backend aggregate를 요구하면 UI에 fake summary를 만들지 말고 `C02`로 분리한다.
- Security/External: §4 전부, §5 전부.

#### `SF-B368-011` — normal/restricted Matter와 conflict 표현

- 상태 / Risk / 크기: **구현 완료** / C / L(2일)
- 의존성: `004`, `008`, `010`
- Files: `apps/web/src/app/(app)/matters/page.tsx`, `apps/web/src/app/(app)/matters/page.test.tsx`, `apps/web/src/app/(app)/matters/[matterId]/page.tsx`, `apps/web/src/app/(app)/matters/[matterId]/page.test.tsx`, `apps/web/src/components/matter/matter-list-table.tsx`, `apps/web/src/components/matter/matter-conflicts-panel.tsx`, `apps/web/src/components/matter/matter-conflicts-panel.test.tsx`(신규), `apps/web/src/components/matter/matter-status-badge.tsx`, `apps/web/src/components/matter/matter-status-badge.test.tsx`
- 목표: 정상 Matter에서는 보안 장식을 최소화하고 restricted/conflict/Wall/hold 상태는 강하고 안전하게 구분한다.
- Acceptance:
  - 정상 Matter에 “권한으로 보호됨” 배너/상시 shield badge를 되살리지 않는다.
  - `PERMISSION_DENIED`, `ETHICAL_WALL_BLOCKED`, conflict pending/failed, legal hold/locked를 서로 섞지 않는다.
  - 정책 reason·객체 존재·raw ID를 메시지에 노출하지 않는다.
  - `/walls` 메뉴/관리 허브 비노출과 직접 route·policy·enforcement 보존을 동시에 검증한다.
- Verification: V-WEB, V-ROOT, V-SEC, V-UI; normal/denied/wall/conflict/hold matrix. Risk=C 독립 검토.
- Edge/stop: copy 변경이 정책 판단이나 response code 변경을 요구하면 UI-only 범위를 중단한다.
- Security/External: deny-overrides/fail-closed 포함 §4 전부, §5 전부.

### Group C — Client·Document·Search·Inbox

#### `SF-B368-012` — Client list/detail workflow

- 상태 / Risk / 크기: **구현 완료** / H / L(2일)
- 의존성: `004`, `005`
- Files: `apps/web/src/app/(app)/clients/page.tsx`, `apps/web/src/app/(app)/clients/page.test.tsx`, `apps/web/src/app/(app)/clients/client-list-table.tsx`, `apps/web/src/app/(app)/clients/client-create-contract.ts`, `apps/web/src/app/(app)/clients/[clientId]/page.tsx`, `apps/web/src/app/(app)/clients/[clientId]/page.test.tsx`, `apps/web/src/app/(app)/clients/[clientId]/client-detail-view.tsx`
- 목표: Client는 목록 우선으로 열고 생성은 명시적 dialog/route action, 상세는 portfolio와 Matter 복귀에 집중한다.
- Acceptance:
  - `/clients` 첫 화면의 주 콘텐츠는 검색 가능한 목록이며 생성 form이 목록을 밀어내지 않는다.
  - “Client 등록”은 기존 create contract를 재사용하는 접근 가능한 dialog 또는 전용 route action이다.
  - 목록/상세에서 raw client UUID를 표시하지 않되 내부 key와 encoded route는 유지한다.
  - 동일 이름·빈 optional metadata·Client 없는 Matter/Matters 없는 Client 상태가 안전하다.
- Verification: V-WEB, V-UI; list-first, dialog/route keyboard, duplicate name, no-raw-ID, empty portfolio tests.
- Edge/stop: 업무 식별용 code가 필요하면 UUID를 가공하지 말고 별도 승인된 client code 계약으로 분리한다.
- Security/External: §4 전부, §5 전부.

#### `SF-B368-013` — Client portfolio aggregation read model

- 상태 / Risk / 크기: **구현 완료** / H / M(1일)
- 의존성: `012`; API 부족 시 `C02`
- Files: `apps/web/src/app/(app)/clients/[clientId]/page.tsx`, `apps/web/src/app/(app)/clients/[clientId]/page.test.tsx`, `apps/web/src/app/(app)/clients/[clientId]/client-detail-view.tsx`, `apps/web/src/lib/api-client.ts`, `apps/web/src/lib/api-client.spec.ts`
- 목표: 기존 `getClient + listMatters({ clientId })`로 정확히 표현 가능한 Client별 Matter 구성과 상태 요약을 만든다.
- Acceptance:
  - total count와 표시 항목의 pagination 한계를 숨기지 않고 정확한 값만 요약한다.
  - 상태별 합계·담당·기한이 기존 API로 정확하지 않으면 계산하거나 여러 호출로 근사하지 않는다.
  - 각 Matter는 permission-scoped list 결과만 사용하고 denied 항목을 사후 필터링하지 않는다.
  - 부족한 정확도는 `C02` trigger로 기록하고 UI에는 검증된 최소 portfolio만 표시한다.
- Verification: V-WEB, V-SEC; 0/1/>pageSize Matter, mixed status, denied Client/Matter tests.
- Edge/stop: 전체 데이터를 client에 100건씩 받아 집계해야만 정확하면 구현을 중단하고 `C02`를 사용한다.
- Security/External: §4 전부, §5 전부.

#### `SF-B368-014` — 기존 Document Workbench trim

- 상태 / Risk / 크기: **구현 완료** / H / L(2일)
- 의존성: `004`, `005`, `012`
- Files: `apps/web/src/app/(app)/files/page.tsx`, `apps/web/src/app/(app)/files/page.test.tsx`, `apps/web/src/components/document/document-workbench-shell.tsx`, `apps/web/src/components/document/document-workbench-rail.tsx`, `apps/web/src/components/document/document-vault-list.tsx`, `apps/web/src/components/document/document-vault-list.test.tsx`, `apps/web/src/components/document/document-workbench.test.tsx`
- 목표: 완성된 3-pane Workbench를 재구축하지 않고, 중복 helper·빈 장식 패널·과도한 control만 줄인다.
- Acceptance:
  - Matter code-first rail, document table, explicit inspector/preview, mobile drawer를 보존한다.
  - preview session은 사용자 선택 전 자동 생성하지 않는다.
  - bulk upload, folders/tags, saved state, permissions action의 기존 계약을 삭제하지 않는다.
  - 빈 inspector는 짧고 행동 가능한 empty state이며 fake 문서 미리보기를 만들지 않는다.
- Verification: V-WEB, V-UI; existing document-workbench tests + 1440/1024/768/390 render.
- Edge/stop: trim이 API/preview/security contract 변경을 요구하면 이 단위에서 구현하지 않는다.
- Security/External: immutable original, preview permission 재평가 포함 §4 전부, M365/Office/WOPI 포함 §5 전부.

#### `SF-B368-015` — saved-search 단일 소유권과 `/search/folders` 호환

- 상태 / Risk / 크기: **구현 완료** / H / L(2일)
- 의존성: `003`, `004`
- Files: `apps/web/src/app/(app)/search/search-client.tsx`, `apps/web/src/app/(app)/search/search-client.flow.test.ts`, `apps/web/src/components/search/search-workbench-rail.tsx`, `apps/web/src/components/search/search-workbench-rail.test.tsx`, `apps/web/src/app/(app)/search/folders/page.tsx`, `apps/web/src/app/(app)/search/folders/search-folders-client.tsx`, `apps/web/src/app/(app)/search/folders/search-folders-client.test.tsx`, `packages/shared/src/search/search-query.dto.ts`, `packages/shared/src/search/search-validation.spec.ts`, `apps/api/src/modules/search/search.service.ts`, `apps/api/src/modules/search/search.service.spec.ts`, `tests/integration/search-permission/saved-search-authorization.spec.ts`
- 목표: saved search 생성·정렬·실행은 `/search` Workbench가 단독 소유하고 `/search/folders` old link는 안전하게 호환한다.
- Acceptance:
  - 홈/rail/별도 folder screen에 saved-search 상태를 복제하지 않는다.
  - `/search/folders`는 기존 bookmark를 깨지 않고 `/search`의 동일 권한 결과/선택으로 연결한다.
  - allowlist filter만 URL에 담고 문서 제목/본문·tenant/user raw ID를 넣지 않는다.
  - 권한 철회된 saved search는 존재를 누설하지 않는 안전한 상태가 된다.
  - matter-team뿐 아니라 Matter에 묶인 personal/admin-shared 검색도 list/open/save/revoke 시 현재 membership, explicit DENY, excluded/insider-required Wall을 다시 평가한다.
  - top-level/query Matter 참조 불일치와 malformed legacy UUID는 fail-closed하고, Matter에 묶이지 않은 personal/admin-shared 검색은 기존 동작을 유지한다.
- Verification: V-WEB, V-SEC, V-UI; create/run/reorder, empty/denied, old folder deep-link, URL privacy tests.
- Edge/stop: compatibility가 server contract 변경을 요구하면 silent fallback 대신 `019`에 명시한다.
- Security/External: permission-before-search 포함 §4 전부, §5 전부.

#### `SF-B368-016` — Work·Notifications 통합 Inbox shell

- 상태 / Risk / 크기: **구현 완료** / H / L(2일)
- 의존성: `003`, `004`, `017`
- Files: `apps/web/src/app/(app)/work/page.tsx`, `apps/web/src/app/(app)/work/work-queue-client.tsx`, `apps/web/src/app/(app)/work/work-queue-client.test.tsx`, `apps/web/src/app/(app)/notifications/page.tsx`, `apps/web/src/app/(app)/notifications/notifications-client.tsx`, `apps/web/src/app/(app)/notifications/notifications-client.test.tsx`, `apps/web/src/lib/api/work-ops.ts`, `apps/web/src/lib/api/work-ops.spec.ts`
- 목표: `/work` 안에서 **내 업무 / 알림** 두 보기를 제공하고, 같은 항목을 여러 카드·rail·페이지에서 반복하지 않는다.
- Acceptance:
  - 기본 view는 `내 업무`이며 URL `?view=mine|notifications`로 새로고침·뒤로가기를 복원한다.
  - 업무는 기존 work API, 알림은 기존 notification API의 상태와 mutation을 그대로 사용한다.
  - 읽음·dismiss·재배정은 기존 capability와 audit 계약이 있는 경우에만 보이고, UI-only 우회 mutation을 만들지 않는다.
  - `/notifications`는 `019`의 호환 정책에 따라 동일 데이터와 권한 상태로 연결되고 별도 primary nav는 없다.
  - loading/empty/error/forbidden/blocked와 부분 성공을 서로 구분한다.
- Verification: V-WEB, V-UI; view URL, keyboard tabs, mutation refresh, denied/blocked, 0/1/>pageSize tests.
- Edge/stop: 두 API의 pagination·mutation 의미가 달라 한 상태로 합칠 수 없으면 data layer를 억지 통합하지 않고 shell만 공유한다.
- Security/External: §4 전부, §5 전부.

#### `SF-B368-017` — 소규모 업무 기본값과 필요한 경우에만 persistence

- 상태 / Risk / 크기: **구현 완료** / H / M(1일)
- 의존성: `004`; persistence 부족 시 `C03`
- Files: `apps/web/src/app/(app)/work/work-queue-client.tsx`, `apps/web/src/app/(app)/work/work-queue-client.test.tsx`, `apps/web/src/lib/api/work-ops.ts`, `apps/web/src/lib/api/work-ops.spec.ts`, `apps/api/src/modules/work/work.service.ts`, `apps/api/src/modules/work/work.service.spec.ts`
- 목표: 기본 필터를 **내 미완료 업무·임박 순**으로 맞추고 기존 `work_items.assigned_to_user_id`와 `due_at`가 충분하면 새 저장 계약을 만들지 않는다.
- Acceptance:
  - 첫 진입은 `assignee=mine`; 사용자 변경은 URL 또는 기존 server query로 재현된다.
  - 완료 업무는 기본 임박/지연 강조에서 빠지고 unknown kind/status raw enum은 노출하지 않는다.
  - `assignedToLabel`, `dueAt`, `status`, 대상 링크는 실제 DTO 값만 사용한다.
  - reload 후 배정·기한이 유지되고 기존 audit/권한 테스트가 통과하면 `C03`은 **불필요(기존 계약 충족)**로 닫는다.
  - 영속화가 실제로 부족할 때만 `C03`을 먼저 수행한다.
- Verification: V-WEB, V-ROOT; mine/all/unassigned, due ordering, completed exclusion, reload, denied reassignment tests.
- Edge/stop: UI local state나 localStorage로 배정·기한을 영속화하지 않는다. mutation 계약이 없으면 display-only로 유지한다.
- Security/External: §4 전부, §5 전부.

### Group D — persona·호환·closeout

#### `SF-B368-018` — 세 UI persona와 단일 관리자 허브

- 상태 / Risk / 크기: **구현 완료** / H / M(1일)
- 의존성: `002`, `003`, `004`
- Files: `apps/web/src/app/(app)/admin/admin-route-hub.tsx`, `apps/web/src/app/(app)/admin/page.tsx`, `apps/web/src/app/(app)/admin/page.test.tsx`, `apps/web/src/lib/features.ts`, `apps/web/src/lib/features.test.ts`, `apps/web/src/lib/navigation.ts`, `apps/web/src/lib/navigation.test.ts`, `apps/web/src/app/(app)/app-shell.test.tsx`
- 목표: 기존 backend role은 그대로 두고 담당 실무자·업무 지원자·관리자 세 UI persona에 맞는 한 개의 shell과 한 개의 `/admin` 진입점을 제공한다.
- Acceptance:
  - 일반 persona는 다섯 업무 메뉴만, `firm_admin`/`security_admin`은 여기에 `관리자 설정` 하나만 추가로 본다.
  - `/admin`은 기록·감사·보안·허용된 연동·조직 설정의 기존 guarded route 링크만 제공한다.
  - `/walls`는 메뉴와 admin 허브에 없지만 route·role guard·policy·audit·enforcement는 보존한다.
  - `/records`, `/audit`, `/integrations/outlook`, `/enterprise`는 primary nav에서 숨겨도 허가된 direct route로 동작한다.
  - 7개 backend role enum, permission matrix, RLS, capability는 변경하지 않는다.
- Verification: V-WEB, V-UI; all-role navigation matrix, admin loading fail-closed, every hub link target tests.
- Edge/stop: persona를 backend role로 새로 만들거나 child route 권한을 admin hub 가시성으로 대체하지 않는다.
- Security/External: §4 전부, §5 전부. Outlook/Matter-app은 기존 관리자 링크만 보존하며 새 외부 연결은 만들지 않는다.

#### `SF-B368-019` — 기존 route·deep-link 호환

- 상태 / Risk / 크기: **구현 완료** / H / L(2일)
- 의존성: `002`, `003`, `010`, `015`, `016`, `018`
- Files: `apps/web/src/lib/features.ts`, `apps/web/src/lib/features.test.ts`, `apps/web/src/app/(app)/app-shell.test.tsx`, `apps/web/src/app/(app)/search/folders/page.tsx`, `apps/web/src/app/(app)/search/folders/search-folders-client.test.tsx`, `apps/web/src/app/(app)/notifications/page.tsx`, `apps/web/src/app/(app)/notifications/notifications-client.test.tsx`, `apps/web/src/app/(app)/matters/[matterId]/page.test.tsx`
- 목표: 메뉴 통합 뒤에도 기존 bookmark, 브라우저 history, 공유된 내부 direct URL과 권한 결과를 깨지 않는다.
- Acceptance:
  - `/search`, `/search/folders`, `/notifications`, `/records`, `/audit`, `/walls`, `/enterprise`, 전문 Matter route는 삭제하지 않는다.
  - 통합 view로 이동시키는 경우 allowlist query/hash만 보존하고 한 번의 결정적 redirect만 사용한다.
  - 허가된 direct route는 열리고, 미허가 route는 기존 fail-closed 상태를 유지하며 홈으로 조용히 우회하지 않는다.
  - 메뉴 비노출과 route 미존재/권한 없음의 의미를 섞지 않는다.
  - 뒤로가기·새로고침·오래된 URL·잘못된 query가 무한 redirect나 민감정보 노출을 만들지 않는다.
- Verification: V-WEB, V-ROOT, V-UI; authorized/unauthorized deep-link matrix, redirect loop, back-forward, malformed query tests.
- Edge/stop: 호환 redirect가 기존 saved-search나 notification mutation 상태를 잃으면 old page를 유지하고 링크만 새 소유자로 바꾼다.
- Security/External: §4 전부, §5 전부.

#### `SF-B368-020` — 자동·렌더·보안·AI slop closeout

- 상태 / Risk / 크기: **구현 완료** / H / L(2일)
- 의존성: `002~019`, 실행된 조건부 `C01~C03`
- Files: `docs/ui/2026-07-30-small-firm-oss-saas-plan-b3681493.md`, `docs/ui/2026-07-31-small-firm-oss-saas-verification-b3681493.md`, `docs/ui/evidence/sf-b368-final/**`, 관련 기존 test/QA receipt 경로만 사용
- 목표: 모든 TUW의 자동 테스트, 실제 렌더, 보안 negative test, 접근성, AI slop 검증을 한 exact SHA에 묶고 구현 완료와 배포 완료를 구분한다.
- Acceptance:
  - V-WEB, V-UI, V-ROOT와 API 영향이 있는 경우 V-SEC가 green이다.
  - `1440x900`, `1024x768`, `768x1024`, `390x844`, 키보드, focus, Escape, 200% 확대, 긴 한국어를 자동화 가능한 실제 브라우저 시나리오로 검증한다.
  - member/admin × success/empty/error/forbidden/blocked와 tenant/member/Wall DENY negative fixture를 커버한다.
  - 중복 navigation, raw UUID, normal-state 보안 배너, dead action, fake count/recent/deadline이 다시 생기면 실패한다.
  - sloplint strong/no-verify가 없고, 남은 weak flag는 제품 근거와 자동 렌더 증빙을 기록한다.
  - 외부 연결·패키지·배포를 실행하지 않았으면 “릴리스 완료/GA”로 표시하지 않는다.
- Verification: 모든 공통 프로필, `git diff --check`, exact-SHA receipt. Risk=C 변경이 포함되면 해당 canonical review gate도 별도로 통과한다.
- Edge/stop: flaky 테스트를 skip/quarantine하지 않는다. 동일 실패 3회면 원인과 재현 증빙을 남기고 해당 canonical 절차를 따른다.
- Security/External: §4 전부, §5 전부.

### Group E — 조건부 계약 결정

#### `SF-B368-C01` — `firm_open` 적격 내부 구성원 자동 등록 계약

- 상태 / Risk / 크기: **종결(코드 불필요)** / C / L(2일)
- 결정: Trigger를 결함으로 채택하지 않는다. `docs/package/codex/00_Master_Brief.md` §5.4와 `docs/ledger/execution.md`의 `NONIDENTITY-AGGREGATE-RECOVERY`는 모든 ALLOW에 `matter_members`를 필요조건으로 확정한다. 자동 등록은 구성원 provenance·퇴사/role 변경·철회·감사 계약 없이 권한을 넓히므로 이번 UI tranche에서 구현하지 않는다.
- Trigger: 소규모 로펌의 `firm_open` Matter가 현재도 `matter_members` 누락 때문에 적격 내부 사용자에게 보이지 않는다는 통합 fixture가 재현될 때만 착수한다.
- 의존성: `001`, `011`; canonical Matter/Permission PACK 매핑
- Files: `packages/shared/src/matter/**`, `apps/api/src/modules/matter/**`, `apps/api/src/modules/permission/**`, `tests/integration/permission/**`, `tests/integration/search-permission/**`, 필요 시 `db/migrations/**`(별도 canonical 승인 후)
- 목표: 권한 엔진을 완화하지 않고, `firm_open` 생성/전환 시 같은 tenant의 **적격 활성 내부 사용자**를 `matter_members`에 idempotent하게 등록하는 계약을 확정·구현한다.
- Acceptance:
  - 적격 대상은 승인된 내부 role·active 상태·tenant 일치로 한정하며 `external_user`, 비활성 사용자, 타 tenant는 제외한다.
  - explicit DENY와 Ethical Wall DENY는 자동 등록보다 우선하고 검색·문서 접근도 기존 permission query를 통과해야 한다.
  - 생성/상태 전환/사용자 입사·퇴사·role 변경 시 동기화 주체와 재시도 의미가 결정적이다.
  - membership grant/revoke는 같은 트랜잭션의 참조 ID 기반 audit를 남기며 실패 시 행위 전체가 실패한다.
  - 중복 실행은 중복 member/audit 부작용을 만들지 않는다.
  - 기존 `restricted` Matter와 limited reviewer의 read-only 계약은 변하지 않는다.
- Verification: V-ROOT, V-SEC, migrate→rollback→migrate(마이그레이션이 있을 때); cross-tenant, external, disabled, explicit DENY, Wall DENY, idempotency, audit rollback tests. Risk=C gate.
- Edge/stop: `firm_open`의 제품 의미나 적격 role이 canonical 문서에 없으면 추정하지 않는다. 단순히 `matter_members` 조건을 제거하는 구현은 금지한다.
- Security/External: §4 전부, §5 전부.

#### `SF-B368-C02` — Dashboard·Matter·Client portfolio read model

- 상태 / Risk / 크기: **종결(코드 불필요)** / C / L(2일)
- 결정: 기존 `getWorkQueue`, `listMatters`, dashboard overview, `getClient + listMatters(clientId)`로 검증 가능한 최소 view를 구성했다. 출처가 확인되지 않은 recent·aggregate·KPI는 만들지 않았고, Client는 동일 필터의 `total/items/partial` 의미만 표시한다.
- Trigger: `006`, `008~010`, `013`이 기존 `getWorkQueue`, `listMatters`, dashboard overview, `getClient + listMatters(clientId)`로 정확한 라벨·집계를 만들 수 없다는 테스트가 있을 때만 착수한다.
- 의존성: 해당 소비 TUW; canonical API/Permission PACK 매핑
- Files: `packages/shared/src/dashboard/**`, `packages/shared/src/matter/**`, `packages/shared/src/client/**`, `apps/api/src/modules/dashboard/**`, `apps/api/src/modules/matter/**`, `apps/api/src/modules/client/**`, `apps/web/src/lib/api/**`, 관련 service/API/integration tests
- 목표: 한 번에 **하나의 확인된 소비자**만 대상으로 최소 permission-scoped read model을 추가한다. 세 surface가 모두 필요하면 `C02-Dashboard`, `C02-Matter`, `C02-Client`로 각각 2일 이하 canonical TUW로 분할한다.
- Acceptance:
  - 필드별 source, 정렬, timezone, freshness, pagination/partial 의미와 사용자 라벨을 DTO에 명시한다.
  - aggregate SQL 자체에 tenant/member/Wall scope를 주입하고 전체 결과를 가져와 client/server 사후 필터링하지 않는다.
  - count와 항목은 같은 권한·필터 기준을 사용하며 페이지 일부를 전체 합계처럼 표시하지 않는다.
  - API 실패는 empty로 바꾸지 않고 stale/partial을 성공처럼 표시하지 않는다.
  - 민감 원문·정책 reason·본문을 response/log/audit metadata에 추가하지 않는다.
  - 새 테이블·cache·dependency 없이 기존 query/service 패턴을 먼저 사용한다.
- Verification: V-WEB, V-ROOT, V-SEC; 0/1/>limit, partial, revoked, cross-tenant, non-member, Wall DENY, stable sort/cursor tests. Risk=C gate.
- Edge/stop: 한 단위가 두 개 이상의 aggregate endpoint나 스키마 변경을 요구하면 구현하지 않고 surface별 TUW로 분할한다.
- Security/External: §4 전부, §5 전부.

#### `SF-B368-C03` — assignment·due 영속성 보강

- 상태 / Risk / 크기: **구현 완료(`G08`, `G12`에서 보강)** / C / L(2일)
- 결정: 2026-07-31 재감사에서 기존 reassignment가 경쟁 상태의 update 0건을
  확인하지 않고 due 변경 endpoint·audit rollback·동시성 증거도 없다는 Trigger가
  재현됐다. `work_items`를 그대로 사용하되 row lock, update row-count 확인, audited
  due mutation, persistence/concurrency/rollback negative test를 `G08`과 `G12`에서
  추가했다. localStorage나 브라우저 권위 상태는 만들지 않았다.
- Trigger: `work_items.assigned_to_user_id`, `due_at`, 기존 reassignment mutation/audit가 `017`의 reload·권한·기한 테스트를 충족하지 못할 때만 착수한다.
- 의존성: `017`; canonical Work/Audit PACK 매핑
- Files: `packages/shared/src/work/**`, `apps/api/src/modules/work/**`, `apps/web/src/lib/api/work-ops.ts`, `apps/web/src/lib/api/work-ops.spec.ts`, `db/migrations/**`(정말 필요한 경우 별도 승인), `tests/integration/**`
- 목표: 기존 `work_items`를 우선 사용해 배정·기한을 내구성 있게 저장하고, 충분하면 코드 추가 없이 **불필요(기존 계약 충족)** 증빙으로 닫는다.
- Acceptance:
  - 재배정과 due 변경은 capability 확인 후 같은 트랜잭션으로 저장·audit되며 실패 시 rollback된다.
  - cross-tenant assignee, 비활성 사용자, 권한 없는 actor, 존재하지 않는 target은 fail-closed다.
  - reload·새 세션·동시 갱신 뒤에도 값이 일관되고 lost update를 조용히 덮지 않는다.
  - due timezone/nullable/완료 상태 의미가 shared DTO와 DB에서 일치한다.
  - localStorage, 브라우저 전용 상태, fake deadline으로 영속화를 대체하지 않는다.
  - 현재 계약이 충분하면 신규 migration/API/dependency는 만들지 않는다.
- Verification: V-ROOT, V-SEC, migrate→rollback→migrate(마이그레이션이 있을 때); persistence, concurrent update, invalid assignee, audit rollback, permission negative tests. Risk=C gate.
- Edge/stop: 기존 work mutation의 소유권이나 audit event가 canonical 문서에 없으면 새 endpoint를 추정하지 않는다.
- Security/External: §4 전부, §5 전부.

## 8. 실행 순서와 병렬화

```text
001
 ├─ 002 ─ 003 ───────────────┐
 └─ 004 ─┬─ 005              │
          ├─ 006 ─ 007        │
          ├─ 008 ─ 009 ─ 010 ─ 011
          ├─ 012 ─ 013        │
          ├─ 014              ├─ 018 ─ 019 ─ 020
          ├─ 015 ─────────────┤
          └─ 017 ─ 016 ───────┘

조건부: 011 재현 → C01 / 006·009·010·013의 데이터 부족 → C02 / 017 영속성 부족 → C03
```

- `002~004`, `005~008`, `012`, `014`, `015`, `017`, `018`은 파일 소유권이 겹치지 않는 범위에서 병렬 가능하다.
- 같은 파일을 쓰는 `006/007`, `008/011`, `012/013`, `016/017`, `002/003/018/019`는 순차 처리하거나 작은 커밋 경계를 공유한다.
- `009`, `011`, `C01~C03`는 Risk=C이므로 canonical mapping과 negative fixture를 먼저 고정한다. 이 gate는 다른 UI-only 단위를 차단하지 않는다.
- 조건부 단위는 Trigger가 재현되지 않으면 새 코드를 만들지 않고 **기존 계약 충족** 증빙으로 닫는다.
- `019`는 old route compatibility를 모은 뒤 실행하고, `020`은 모든 비조건부 TUW와 조건부 판단 결과가 끝난 exact SHA에서만 시작한다.

## 9. 제품 완료 기준

이 계획의 구현 완료는 다음을 동시에 만족할 때다.

1. 일반 사용자가 홈 첫 화면에서 내 작업·임박 마감·권한 범위 Matter/문서 복귀 경로를 찾는다.
2. 전역 검색과 `/search`, `/files`, `/matters`, `/admin`의 소유권이 중복되지 않는다.
3. 일반 화면의 관리/보안 장식은 줄었지만 실제 거부·Wall·hold·admin guard는 그대로 강하다.
4. fake recent/deadline/count 없이 서버 권위 데이터만 사용한다.
5. raw UUID와 민감 제목/본문이 화면·URL·log에 새로 노출되지 않는다.
6. 다섯 viewport와 200% 등가 reflow, keyboard, denied/empty/error, 전체 회귀와 독립 Codex 품질 검토가 green이다.
7. exact 구현 코드 SHA와 추적 가능한 검증 문서가 이 계획에 연결된다. ledger/PR 연결은 push·PR을 요청받는 시점의 별도 머지 단계다.

그 뒤에도 external authenticated smoke, 배포 artifact, 로그인된 실제 앱, 운영자 승인, 릴리스/GA는 별도 gate다.

## 10. 구현 closeout 증빙

### 10.1 기준선·브랜치·구현 범위

- 유일한 기준선: `origin/main@b3681493970714fa2d1f583a2a16f7c5d4a26582`
- 구현 브랜치: `codex/small-firm-oss-saas-b3681493`
- 구현 코드 SHA: `269877204c75a43c47f193fdb96fa52e1ad6a0b0`
- 최종 검증 기록: `docs/ui/2026-07-31-small-firm-oss-saas-gap-closure-verification-b3681493.md`
- 세부 증거: `docs/ui/evidence/sf-b368-gap-closure/`
- `SF-B368-001~020`, `C01~C03`, 추가 `G01~G35`는 이 문서와 브랜치의
  코드·테스트로 종결했다. 기존 helper와 route를 우선 재사용했고 신규 dependency,
  상태 저장소, 외부 연결은 추가하지 않았다. C03의 감사 action 제약을 위한 migration
  `0212_add_work_notification_audit_actions`는 G08 범위에서 추가하고 왕복 검증했다.
- shell/Home: `apps/web/src/lib/features.ts`, `apps/web/src/lib/navigation.ts`, `apps/web/src/app/(app)/app-shell.tsx`, `apps/web/src/app/(app)/dashboard/vault-activity-client.tsx`
- 공통 상태/표현: `apps/web/src/lib/i18n.tsx`, `apps/web/src/components/ui/empty-state.tsx`, `apps/web/src/components/ui/page-header.tsx`, Matter/Client 목록 컴포넌트와 seed fixture
- Matter: shared query schema, permission-scoped API query/service, Matter 목록·5-tab 상세·workspace action과 관련 unit/integration tests
- Client/문서/검색/업무: list-first Client, Workbench helper trim, `/search` saved-search 단일 소유권, `/search/folders` opaque-reference compatibility redirect, `/work?view=mine|notifications`
- route 보존: 숨긴 전문 route의 정책·role guard·직접 접근을 유지했다. `/clients`, `/work`, `/notifications`도 middleware session guard와 회귀 테스트에 포함했다.

### 10.2 자동 검증

아래는 외부 계정·배포 없이 이 브랜치에서 실행한 로컬 기술 증빙이다.

| Gate                                | 결과                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`    | 통과; dependency 변경 없음                                                       |
| `pnpm lint`                         | 6/6 workspace 통과                                                               |
| `pnpm typecheck`                    | 9/9 task 통과                                                                    |
| `pnpm test`                         | domain 18, desktop 18, shared 216, AI 13, API 1,028, Web 511 — 합계 1,804 통과   |
| `pnpm build`                        | 6/6 workspace 통과; Next 31개 static page 생성 포함                              |
| `pnpm docs:frozen`                  | frozen package 51개 불변 통과                                                    |
| `pnpm backlog:validate`             | 174·266 TUW registry 통과                                                        |
| `pnpm check:production-ui-literals` | 통과                                                                             |
| `pnpm check:ui-pr-checklist`        | 통과                                                                             |
| `pnpm ui:production-smoke`          | 5-item navigation·단일 소유권 inventory로 갱신 후 통과                           |
| `git diff --check`                  | 통과                                                                             |
| migration                           | 격리 PostgreSQL에서 `migrate → rollback → migrate` 왕복 후 `0212`까지 206개 통과 |
| seed                                | `tenants=2`, `users=11` 통과                                                     |
| `pnpm test:integration`             | versioning이 활성화된 새 MinIO bucket과 새 DB에서 141 files / 458 tests 통과     |

과거 격리 실행의 임시 bucket은 versioning이 꺼져 있어 document-revision fixture가
worker의 object-version fingerprint를 만들지 못했다. 이 환경 진단과 복구 이력을
보존하되, 최종 `26987720`은 생성 시점부터 private/versioned인 별도 bucket과 새 DB에서
왕복·전체 suite를 다시 통과했다. 진단용 임시 assertion은 전부 되돌렸고 테스트
skip·quarantine은 사용하지 않았다. G31의 35초 test process 예산은 제품의 30초
성능 assertion을 관찰하기 위한 명시적 timeout이며 skip이나 acceptance 완화가 아니다.

### 10.3 조건부 계약 판정

| ID            | 판정           | 근거                                                                                                                                                        |
| ------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SF-B368-C01` | 코드 불필요    | Master Brief의 `matter_members` 필요조건과 `NONIDENTITY-AGGREGATE-RECOVERY` 결정을 유지한다. `firm_open` non-member ALLOW나 자동 권한 확대를 만들지 않는다. |
| `SF-B368-C02` | 코드 불필요    | 기존 권한 범위 read API로 확인 가능한 최소 정보만 표시하고 출처 없는 recent·aggregate·KPI를 생략했다.                                                       |
| `SF-B368-C03` | 추가 구현 완료 | G08/G12/G19/G23에서 row lock, affected-row 확인, audited due mutation, 후보 권한 재검증, 새 세션 영속과 concurrency/rollback negative를 추가했다.           |

### 10.4 실제 화면·접근성 검증

- `/dashboard`, `/matters`, Matter 상세 2개, `/clients`, Client 상세, `/files`,
  `/work` 기본·알림, `/search`의 10개 surface를 `1440x900`, `1024x768`,
  `768x1024`, `390x844`, `720x450`의 50개 route/viewport 조합에서 확인했다.
  document/body 폭은 모두 viewport 폭과 같고 페이지 수준 unsafe horizontal
  overflow와 viewport 밖 interactive control은 0이었다. 원시 값은
  `docs/ui/evidence/sf-b368-gap-closure/browser-matrix.json`에 보존했다.
- `720x450`은 browser zoom API가 아닌 `1440x900`의 **200% 등가 CSS viewport
  reflow**다. native zoom을 실행했다고 주장하지 않으며 같은 production build의
  responsive layout 계약을 검증했다.
- 모바일 메뉴의 focus trap·Escape·trigger focus return, Matter 탭 ArrowRight·뒤로/앞으로·reload URL 보존, 긴 한국어와 모든 visible form control의 accessible name을 확인했다.
- 브라우저 console error/warning은 0이었다. `권한으로 보호됨`, 중복 연동 설명, raw UUID, normal-state 보안 배너는 검사한 일반 화면에서 나타나지 않았다.
- 최종 `sloplint.py --changed`는 finding 0으로 통과했다. 전체 기준선 코드 diff 검사에서만 통합 테스트의 표준 바이너리 업로드 생성자 이름을 배경 장식으로 오인한 비제품 weak false positive 1건이 있었다. App Shell의 반투명 white/glass signal은 불투명 brand token 표면으로 제거했고 `768x1024`와 `390x844` 실제 화면에서 대비·계층을 재확인했다.
- 키보드·역할·직접 경로·API 장애/복구 기록과 대표 캡처는
  `docs/ui/evidence/sf-b368-gap-closure/browser-interactions.md`와 같은 디렉터리에
  보존했다.

### 10.5 완료와 비완료의 경계

이 closeout은 **로컬 구현 완료**다. 외부 전자서명·Microsoft 365·외부 포털·외부 링크·외부 AI는 연결하거나 호출하지 않았다. production/staging 배포, 패키지, push/PR, merge, 운영 로그인 smoke, 릴리스/GA는 수행하지 않았으며 별도 gate다. 사용자의 명시적 지시에 따라 독립 Claude/인간 검토는 구현 차단 조건으로 실행하지 않았지만 Risk=C 변경의 머지 전 canonical review 요건과 Codex 자체 머지 금지는 그대로 남는다.
