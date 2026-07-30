# 소규모 로펌용 OSS SaaS UI 검증 기록 — `b3681493`

> **재검증 주의:** 이 기록은 2026-07-31 gap audit에서 100% 완료 증거로 사용할 수
> 없는 것으로 판정되었다. integration inventory 수치, Home dead target, Work 동시성,
> deep-link 복원 등 확인된 차이는
> `docs/ui/2026-07-31-small-firm-oss-saas-gap-closure-plan-b3681493.md`에서 폐쇄 중이다.
> 최종 gap-closure receipt가 작성되기 전에는 아래 완료 문구를 현재 판정으로 인용하지
> 않는다.

> 구현 코드 SHA: `1d0333c9ba957dfced1d4d893ef30e0261b9e39d`
>
> 기준선: `origin/main@b3681493970714fa2d1f583a2a16f7c5d4a26582`
>
> 브랜치: `codex/small-firm-oss-saas-b3681493`
>
> 계획: `docs/ui/2026-07-30-small-firm-oss-saas-plan-b3681493.md`
>
> 검증일: 2026-07-31 KST

## 1. 판정

`SF-B368-001~020`과 조건부 `SF-B368-C01~C03`의 로컬 구현·검증을 완료했다. 이 기록은 위 구현 코드 SHA에 대한 증빙이며 배포, 외부 연결, push, PR, merge, 패키징 또는 릴리스 완료를 뜻하지 않는다.

- 외부 전자서명, Microsoft 365, 외부 포털, 외부 링크, 외부 AI 연결은 추가하거나 호출하지 않았다.
- 신규 dependency, migration, 상태 저장소를 추가하지 않았다.
- `/walls`는 기본 메뉴와 관리자 허브에 없으며 직접 경로의 정책·role guard·enforcement는 유지한다.
- 일반 사용자 기본 메뉴는 홈·Matter·고객·문서함·작업함 다섯 개다.
- 검색·저장검색·Matter 목록은 쿼리 단계의 현재 tenant, membership, explicit DENY, Ethical Wall 조건을 유지한다.

## 2. 자동 검증

### 2.1 루트 및 UI 게이트

| 명령                                | 결과                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm lint`                         | 6/6 workspace 통과                                                             |
| `pnpm typecheck`                    | 9/9 task 통과                                                                  |
| `pnpm test`                         | domain 18, desktop 18, shared 213, AI 13, API 1,012, Web 429 — 합계 1,703 통과 |
| `pnpm build`                        | 6/6 workspace 통과, Next 정적 생성 31개 통과                                   |
| `pnpm docs:frozen`                  | frozen package 51개 불변 통과                                                  |
| `pnpm backlog:validate`             | 174·266 TUW registry 통과                                                      |
| `pnpm check:production-ui-literals` | 통과                                                                           |
| `pnpm check:ui-pr-checklist`        | 통과                                                                           |
| `pnpm ui:production-smoke`          | 통과                                                                           |
| `git diff --check`                  | 통과                                                                           |

`pnpm typecheck`를 `pnpm build`와 동시에 처음 실행했을 때 Next 빌드가 `.next/types`를 교체하는 동안 Web typecheck가 생성 파일을 읽어 `TS6053`이 발생했다. 빌드 완료 뒤 동일 소스에서 `pnpm typecheck`를 단독 재실행해 9/9가 통과했다. 소스 오류로 분류하거나 테스트를 완화하지 않았다.

### 2.2 데이터베이스 왕복과 전체 통합 회귀

격리 PostgreSQL `amic_vault_sf_1d0333c9`에서 migration 왕복을 수행했다.

1. `pnpm db:migrate` — 통과
2. `pnpm db:rollback` — 전체 rollback 통과
3. `pnpm db:migrate` — 재적용, `0000`부터 `0211`까지 205개 통과
4. `pnpm db:seed` — `tenants=2`, `users=11`
5. 새 데이터베이스 `amic_vault_sf_1d0333c9_v2`와 생성 시점부터 versioning을 활성화한 bucket `amic-vault-sf-1d0333c9-v2`에서 `pnpm test:integration` — 131 files / 417 tests 통과, exit 0

통합 회귀에는 tenant/RLS, Matter·문서 권한, explicit DENY, Ethical Wall, break-glass, 저장검색, 검색, 감사, immutable original, legal hold, worker, ingestion sandbox가 포함됐다. skip, quarantine 또는 timeout 완화는 사용하지 않았다.

첫 격리 실행의 임시 bucket은 versioning이 꺼져 있어 document-revision fixture가 worker의 object-version fingerprint를 만들지 못했다. bucket versioning을 켠 뒤 해당 테스트가 통과했고, 위의 두 번째 새 DB·bucket 전체 실행으로 환경 설정 원인임을 재확인했다. 진단용 임시 assertion은 전부 되돌렸다.

최종 저장검색 보완 뒤 다음 focused integration도 4 files / 23 tests로 통과했다.

- `saved-search-authorization.spec.ts`
- `matter-permission.spec.ts`
- `matter-app-sync.spec.ts`
- `search-break-glass.spec.ts`

## 3. 권한·감사 회귀

### 3.1 Matter 목록과 검색

- Matter 목록 query는 membership을 ALLOW의 필요조건으로 유지한다.
- user/group/role explicit DENY, 미해석 `condition_json`, excluded Wall, insider-required Wall을 쿼리 단계에서 제외한다.
- `q` 검색은 같은 permission-scoped SQL 안에서 Matter code/name과 허가된 Client 표시 이름에만 적용한다.
- batch Matter 목록은 감사 없는 break-glass 우회를 허용하지 않는다.

### 3.2 저장검색

- matter-team, personal, admin-shared의 list, save, open, revoke가 모두 저장된 top-level/query Matter 참조와 현재 Matter·Wall 범위를 같은 statement에서 다시 적용한다.
- 소유자/admin mutation 권한만으로 현재 Matter 접근 철회를 우회할 수 없다.
- top-level/query Matter 불일치와 malformed legacy UUID는 fail-closed한다. Matter에 묶이지 않은 personal/admin-shared 검색은 기존처럼 사용할 수 있다.
- explicit DENY, excluded Wall, insider-required Wall에서 목록 비노출, open/revoke/save 거부를 통합 테스트로 확인했다.

### 3.3 break-glass

- 검색 scope가 실제로 사용한 Wall override만 식별한다.
- 검색 결과를 반환하기 전에 canonical reader를 통해 `BREAK_GLASS_USED` audit를 기록한다.
- malformed/expired override와 감사 기록 실패는 허용으로 바꾸지 않는다.
- 통합 테스트에서 actor, Matter, target이 일치하는 audit row를 확인했다.

### 3.4 직접 경로

- `/records`, `/audit`, `/walls`, `/integrations`, `/integrations/outlook`, `/integrations/matter-app`은 메뉴 비노출과 별개로 직접 경로 guard를 유지한다.
- `firm_admin` 실화면에서는 관리자 허용 경로가 열렸다.
- `matter_member` 실화면에서는 `/admin`, `/integrations/matter-app`, `/walls`가 URL을 홈으로 바꾸지 않고 “관리자 계정에서만 사용할 수 있는 화면”으로 fail-closed했다.
- route resolver의 admin 허용, member 차단, 사용자 조회 오류 차단을 순수 동작 테스트로 검증했다.

## 4. 실제 브라우저 검증

구현 코드 SHA의 production build를 로컬 API `:3001`, Web `:3000`에서 실행하고 관리자·일반 사용자 seed 계정으로 확인했다. 원시 행렬과 상호작용 기록은 [`docs/ui/evidence/sf-b368-final/`](./evidence/sf-b368-final/)에 보존했다.

### 4.1 화면·viewport 행렬

다음 9개 surface를 `1440x900`, `1024x768`, `768x1024`, `390x844`에서 확인해 총 36개 조합을 검증했다.

- `/dashboard`
- `/matters`
- `/matters/:matterId`
- `/clients`
- `/files`
- `/search`
- `/work`
- `/admin`
- `/integrations/matter-app`

모든 조합에서 document/body `scrollWidth`가 viewport width와 일치했다. `/files`와 Matter 문서 표의 넓은 콘텐츠는 페이지를 넓히지 않고 경계 안의 명시적 가로 스크롤 영역에 머물렀다. visible form control의 이름 누락은 0건이었고 일반 화면에서 `권한으로 보호됨` 문구는 0건이었다.

원시 값: [`browser-matrix.json`](./evidence/sf-b368-final/browser-matrix.json)

### 4.2 200% 등가 리플로우

브라우저 zoom API 대신 `1440px`의 200% 등가 CSS viewport인 `720x450`에서 Home, Matter 상세, Work를 확인했다. 세 화면 모두 body `scrollWidth=720`이며 페이지 수준 가로 넘침이 없었다.

### 4.3 키보드·포커스·history

- Matter 탭에서 `개요`에 `ArrowRight`를 입력하면 focus와 선택이 `문서`로 함께 이동했다.
- URL은 `?tab=documents#matter-files`로 갱신됐다.
- browser back은 `개요`, forward와 reload는 `문서` 선택을 복원했다.
- 모바일 메뉴를 열면 dialog가 생성되고 focus가 `메뉴 닫기`로 이동하며 body scroll이 잠겼다.
- `Escape`로 dialog가 닫히고 body scroll이 복원되며 focus가 `메뉴 열기` trigger로 돌아왔다.

상호작용 세부 기록: [`browser-interactions.md`](./evidence/sf-b368-final/browser-interactions.md)

### 4.4 success·empty·error·forbidden·blocked

- 관리자 화면에서 성공 데이터와 서버 권위 empty 상태를 확인했다.
- 일반 사용자 rail은 다섯 메뉴만 표시했고 관리자 메뉴·정보 차단 메뉴를 표시하지 않았다.
- 교차 tenant Matter와 같은 tenant의 non-member Matter 직접 URL은 동일한 안전한 비노출 상태를 표시했고 tenant 이름이나 대상 Matter 정보를 본문에 노출하지 않았다.
- excluded/insider-required Wall은 exact-SHA 통합 negative test로 확인했다.
- 로컬 API를 일시 중단했을 때 Home의 각 섹션은 연결 오류를 empty로 바꾸지 않았다.
- 같은 SHA의 API를 재기동한 뒤 Home 데이터가 복구됐다.
- 장애 주입 전 최종 성공 화면의 browser console warn/error는 0건이었다.

## 5. 조건부 TUW 판정

| ID            | 판정           | 검증 근거                                                                                                                                                  |
| ------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SF-B368-C01` | 코드 불필요    | `matter_members` 필요조건을 제거하지 않았고 non-member, explicit DENY, Wall negative 통합 테스트가 통과했다. 자동 구성원 확대로 권한 의미를 바꾸지 않았다. |
| `SF-B368-C02` | 코드 불필요    | 기존 permission-scoped work/dashboard/Matter/Client read 계약으로 확인 가능한 최소 정보만 표시했다. 출처 없는 recent·KPI·aggregate를 추가하지 않았다.      |
| `SF-B368-C03` | 기존 계약 충족 | 기존 `work_items.assigned_to_user_id`, `due_at`, audited reassignment를 사용했다. migration, 신규 endpoint, localStorage 권위 상태를 만들지 않았다.        |

## 6. AI slop 검토

AI slop review: pass.

- strong/no-verify finding: 0
- 제품 UI intentional finding: 0
- 최종 `sloplint.py --changed` finding: 0
- 전체 기준선 코드 diff를 별도로 검사했을 때의 weak finding: 1
- 위치·판정: `tests/integration/document-hash.spec.ts`의 표준 브라우저 파일 객체 생성자 이름을 배경 장식 신호로 오인한 비제품 lexical false positive

대표 desktop/mobile 화면에서 gradient mesh, glass surface, 과도한 pill, 영웅형 capability 문구, 정상 상태 보안 배너를 사용하지 않았음을 확인했다.

## 7. 증거 인덱스

- 자동 게이트·migration·통합 회귀: [`automated-gates.md`](./evidence/sf-b368-final/automated-gates.md)
- 36개 route/viewport 원시 행렬: [`browser-matrix.json`](./evidence/sf-b368-final/browser-matrix.json)
- 키보드·역할·차단·장애 복구: [`browser-interactions.md`](./evidence/sf-b368-final/browser-interactions.md)
- desktop 대표 화면: [`dashboard-1440x900.jpg`](./evidence/sf-b368-final/dashboard-1440x900.jpg)
- mobile 대표 화면: [`matter-mobile-390x844.jpg`](./evidence/sf-b368-final/matter-mobile-390x844.jpg)

## 8. 완료 경계

이 기록으로 로컬 구현을 완료 처리한다. 다음 항목은 수행하지 않았으며 별도 단계다.

- 외부 계정·vendor 연결
- staging/production 배포
- desktop package·공증
- push·PR·merge
- canonical release gate
- 운영 로그인 smoke
- 릴리스·GA 선언

독립 Claude/인간 검토는 사용자의 명시적 지시에 따라 구현 진행 차단 조건으로 실행하지 않았다. 이는 저장소의 머지 권한이나 canonical release gate를 해제하지 않는다.
