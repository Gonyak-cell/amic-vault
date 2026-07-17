# TUW Internal DMS Uplift H1-H3 (9인 로펌 내부용)

Date: 2026-07-02

Source: 최초 컨셉 문서 2건(옵시디언 LLM Gemma 활용 PDF, Law_Firm_Vault_System 장기개발 사양명세서 DOCX) 대비 구현 갭 분석 130건(적대적 검증 완료) → 완화 정책 반영 → 8개 워크스트림 TUW 설계 → 워크스트림별 검증 + 교차 정합성 비평 반영.

이 문서는 계획(planning ledger)이며 실행 증적 원장이 아니다. 각 유닛은 독립적으로 머지 가능한 1개 PR 단위이고, size는 1인 개발자 + AI 코딩 에이전트 기준 S(1~2일)/M(3~5일)/L(1~2주)다.

## 현재 실행 상태 (2026-07-17)

strict-completion 진행 상태는 `docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.md` / `.json`(생성 시각 `2026-07-17T00:00:00.000Z`)을 기준으로 읽는다. 현재 활성 장부는 117행 중 `COMPLETE_CANDIDATE` 19, `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE` 80, `EXTERNAL_BLOCKED` 11, `UNADJUDICATED` 7이다. 110행 레거시 장부(`docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.md` / `.json`)는 byte-identical historical snapshot으로 보존한다.

이 문서는 계속 계획 원장이다. 여기의 117개 범위 설명을 현재 완료 증거로 읽지 말고, `UNADJUDICATED` 및 manual/staging/external 증거가 남은 행은 완료로 해석하지 않는다.

## 운영 전제 및 완화 정책

단일 로펌 내부용 DMS. 단일 테넌트, 전체 인력 9명. 외부판매 SaaS 아님.

**제외(계획에 없음):** SAML SSO 런타임, BYOK/테넌트별 암호화 키(RDS·S3 기본 at-rest 암호화로 대체), SIEM 커넥터, SOC 2/ISO 자동화, 멀티테넌시 격리 티어 상향, Ethical Wall 고도화(clean team·고객별/상대방별 축 — 기존 matter 단위 wall 유지), 99.99% HA·오토스케일·멀티리전·동시 10,000명 목표·검색 샤딩, 과금/미터링, 외부 개발자용 Public API, VDR 고급(bidder 그룹·외부 2FA·IP 제한·redaction 자동화), 인쇄/복사 뷰어 차단, Gmail add-on, 권한 정기검토 자동화.

**간소화:** 비밀등급 3단계 유지(9종 확장 안 함), 권한 기본값 '펌 전원 접근 + 제한 매터만 명시 제한', DLP는 현행 한국형 검출기 + 대량 다운로드 임계 알림 1건, Analytics 기본 통계, AI Audit는 내부용이므로 원문 저장으로 강화.

**반드시 유지(실 운영기능):** 이해상충 검사, 감사로그, 백업/PITR, MFA(TOTP), 사용자 비활성화, records/보존/legal hold, matter 단위 ethical wall, 무결성/해시 체계.

## Verification Contract

모든 유닛 PR은 유닛별 완료판정(acceptance tests) 외에 표준 게이트를 통과해야 한다:

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm lint
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm typecheck
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm test
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm build
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm docs:frozen
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm check:production-ui-literals
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm ui:production-smoke
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm check:ui-pr-checklist
```

## 총량 및 교차 비평 반영

- Horizon 1: 38개 (36 + B15·B16; 원안 42개에서 교차 비평의 총량 초과 지적을 반영해 F1·F3·F6, B5, H4, E5 이연 및 C7 파일럿 분할·A4 축소로 감축)
- Horizon 2: 61개 (57 + B17·C16·B18·B19), Horizon 3: 18개 (17 + B20 조건부), 총 117개. 활성 원장은 `docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.{json,md}`다.
- 삭제: H10(HWP 파싱 — B9와 완전 중복, B9로 병합). 신설: C15(Outlook 전 인원 링 승격 — C7 분할).
- **[2026-07-17 활성 포인터]** 부록 2(Baseline-8 보완)까지 포함한 활성 총량은 **H1 38 / H2 61 / H3 18(B20 조건부 포함), 총 117개**다. 기존 110행 장부와 정책·원장·오버라이드는 historical snapshot으로 보존하며 활성 완료 증거로 사용하지 않는다.
- 의존성 오기 정정: A13(E→F11), D8(E→C), D10(G→E), H12(G→F), F12(D1→D2), G14(A→A12).

- 교차 비평 원문(총량): H1이 42유닛(A7·B6·C7·D4·E5·F5·G2·H6 / L 10, M 26, S 6 ≈ 50인주+)으로 '3개월 소수 인력+AI 에이전트' 대비 약 1.5~2배 초과. AI 에이전트 가속을 감안해도 검증·리뷰 병목이 사람에 있다. 아래 이연 세트(F1·F3·F6, B5, H4, E5, C7 부분, A4 축소)를 적용해 H1을 약 34~35유닛으로 감축하라. H1 핵심축은 매터 생성 루프(A1~A3, A6~A7), 검색 품질(D1~D4), 이메일 개통(C1~C6), AI 최초 노출(E1~E4), 보안 필수(H1~H3, H6)로 유지한다.

## Horizon 1 — 신뢰 임계 결손 제거 + 봉인 해제 (~3개월)

### A: Matter Core & Intake

#### A1 [M] 이해상충 검사 엔진 (pg_trgm 이름 매칭 + conflict_checks 스키마)

**Goal:** Matter 생성 후 사용자가 이해상충 검사를 실행하면 고객·당사자·과거 매터 관계인 이름과의 유사도 매치 후보 목록을 받고, 검사 상태(not_started/in_review/cleared/blocked)가 Matter에 기록된다.

**Scope:** 만들 것: (1) 신규 마이그레이션 — CREATE EXTENSION pg_trgm, matters.conflicts_status 컬럼(not_started/in_review/cleared/blocked, default not_started), conflict_checks 테이블(matter_id FK, 검사 대상 이름 목록, 매치 결과 JSON, 해소 상태·근거·해소자, tenant RLS FORCE + 컬럼 GRANT — 기존 마이그레이션 CONVENTIONS 준수). (2) ConflictCheckService: clients.name, parties.name(전 매터), matters의 과거 관계인을 pg_trgm similarity + 정규화(공백·법인격 접미사 제거)로 매칭하고 후보를 유사도 순으로 반환. (3) API — POST /matters/:matterId/conflict-checks(실행), GET /matters/:matterId/conflict-checks(이력), PATCH .../:checkId(cleared/blocked + 근거 필수). 모든 변이는 AuditService 트랜잭션 패턴으로 감사 기록. (4) MatterDto에 conflictsStatus 노출. 만들지 않을 것: OpenSearch 기반 매칭, 외부 기업DB 조회, 상대방 로펌 축 — 9인 로펌 규모에서 pg_trgm으로 충분.

**완화 노트:** 완화 정책에 따라 경량 구현: pg_trgm 이름 유사도 매칭만. blocked 시 ethical wall '자동 생성'이 아닌 /walls 링크 제안 수준. 검색 인덱스 연동은 하지 않음.

**Dependencies:** 없음

**Code anchors:**
- `신규: db/migrations/0098_create_conflict_checks.sql`
- `신규: apps/api/src/modules/conflicts/conflict-check.service.ts`
- `신규: apps/api/src/modules/conflicts/conflict-check.controller.ts`
- `신규: apps/api/src/modules/conflicts/conflicts.module.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/modules/matter/matter.service.ts`
- `packages/shared/src/matter/matter.dto.ts`
- `db/migrations/0012_create_clients.sql`
- `db/migrations/0020_create_parties.sql`
- `apps/api/src/modules/audit`

**Acceptance tests (완료판정):**
- 자동: 신규 tests/integration/conflict-check.spec.ts (기존 matter-core.spec.ts 패턴의 실 NestJS+Postgres) — (a) 유사 이름 고객('주식회사 한빛'/'(주)한빛')이 상대방 당사자로 존재하는 매터에서 검사 실행 시 매치 후보 반환, (b) 무관 이름은 후보 0건, (c) cleared 처리 시 근거 없이 PATCH하면 400, 근거 포함 시 matters.conflicts_status='cleared'로 갱신, (d) cross-tenant 매터의 당사자는 매치 소스에서 제외(RLS), (e) 검사 실행·해소 각각 audit_events에 기록됨을 검증
- 자동: pg_trgm 정규화 매칭 단위 테스트 — conflict-check.service.spec.ts에서 법인격 접미사·공백 변형 케이스 6종 이상 매칭 판정 검증
- 수동: 관리자 계정으로 POST /matters/:id/conflict-checks 호출 후 GET 응답에 매치 후보와 유사도 점수가 포함되고, PATCH로 cleared 처리하면 GET /matters/:id 응답의 conflictsStatus가 'cleared'로 바뀌면 통과
- 성능: 시드 데이터(고객 200건, 당사자 1,000건) 기준 검사 실행 API p95 < 2초 — 통합 테스트에서 실행 시간 assert

#### A2 [M] 이해상충 상태기계 게이트 + Matter 상세 Conflicts 패널 UI

**Goal:** 이해상충 검사가 cleared되기 전에는 매터를 proposed→open으로 전이할 수 없고, 담당 변호사는 매터 상세 화면의 Conflicts 패널에서 검사 실행·후보 검토·해소 승인을 완결할 수 있다.

**Scope:** 만들 것: (1) packages/domain matter-transitions에 게이트 컨텍스트 추가 — proposed→open 전이 시 conflicts_status가 cleared가 아니면 reason code CONFLICTS_NOT_CLEARED로 거부(기존 R12_TRANSITION_BLOCKED 패턴 준수), matter.service.updateStatus(254-292행)에서 fail-closed 적용. (2) blocked 상태 매터는 open 전이 영구 차단 + 응답에 /walls 설정 제안 포함. (3) 웹 /matters/[matterId]에 Conflicts 패널: 상태 배지, 검사 실행 버튼, 매치 후보 테이블(유사도·출처 매터/고객), cleared/blocked 처리 폼(근거 입력 필수). api-client.ts에 conflict-check 함수 3종 추가. 만들지 않을 것: 별도 승인 결재선(9인 규모에서 담당 파트너 1인 승인으로 충분), 이메일 알림.

**완화 노트:** 다단계 결재 워크플로 없이 권한 있는 사용자 1인의 해소 처리로 간소화. blocked 시 ethical wall은 자동 생성 대신 제안 링크.

**Dependencies:** A1

**Code anchors:**
- `packages/domain/src/matter/matter-transitions.ts`
- `packages/domain/src/matter/matter-transitions.spec.ts`
- `apps/api/src/modules/matter/matter.service.ts`
- `apps/web/src/app/(app)/matters/[matterId]/page.tsx`
- `apps/web/src/lib/api-client.ts`
- `tests/integration/matter-lifecycle.spec.ts`

**Acceptance tests (완료판정):**
- 자동: packages/domain/src/matter/matter-transitions.spec.ts 확장 — conflicts_status별(not_started/in_review/cleared/blocked) proposed→open 판정 4케이스와 reason code 검증
- 자동: tests/integration/matter-lifecycle.spec.ts 확장 — (a) cleared 전 PATCH /matters/:id/status(open) 요청이 409/422 + CONFLICTS_NOT_CLEARED 코드로 거부, (b) cleared 후 동일 요청 성공, (c) blocked 매터는 open 전이 거부 지속, (d) 거부 이벤트가 audit_events에 기록
- 자동: apps/web matters/[matterId] 컴포넌트 테스트(기존 page.test.tsx 패턴) — Conflicts 패널이 상태 배지·후보 테이블을 렌더링하고 근거 미입력 시 해소 버튼 비활성 검증
- 수동: 웹에서 신규 매터의 Conflicts 패널에서 검사 실행→후보 확인→cleared 처리→상태 open 전이 성공, blocked 처리한 매터는 open 전이 버튼이 에러 안내를 표시하면 통과

#### A3 [M] Matter 생성 웹 UI (기존 POST /matters 운영 경로 노출)

**Goal:** 변호사가 웹에서 고객 선택→매터 유형→담당자 지정 폼으로 매터를 직접 생성할 수 있다(생성 직후 proposed 상태 + Conflicts 패널로 유도). '새 Matter' 버튼이 상태 페이지 대신 실제 생성 폼으로 연결된다.

**Scope:** 만들 것: (1) 신규 /matters/new 페이지 — 고객 셀렉터(GET /clients), matter_type 셀렉트(0013 CHECK의 10종), matter_code/matter_name 입력, lead lawyer 셀렉터, packages/shared createMatterSchema로 클라이언트측 검증 후 POST /matters 호출. (2) api-client.ts에 createMatter/listClients 함수 추가. (3) matters/page.tsx 131-136행의 '새 Matter'→/integrations/matter-app 링크를 /matters/new로 교체. (4) 성공 시 /matters/[matterId]로 리다이렉트하고 conflicts 검사 실행을 유도하는 배너 표시. 만들지 않을 것: LawOS 외부 API 실시간 연동(A14에서 별도), 템플릿 미리보기(A7에서 폼에 추가).

**Dependencies:** 없음

**Code anchors:**
- `신규: apps/web/src/app/(app)/matters/new/page.tsx`
- `apps/web/src/app/(app)/matters/page.tsx`
- `apps/web/src/app/(app)/matters/page.test.tsx`
- `apps/web/src/lib/api-client.ts`
- `packages/shared/src/matter/matter.dto.ts`
- `apps/api/src/modules/matter/matter.controller.ts`

**Acceptance tests (완료판정):**
- 자동: 신규 apps/web/src/app/(app)/matters/new/page.test.tsx — (a) 필수 필드 누락 시 제출 비활성/에러 표시, (b) 유효 입력 제출 시 createMatter가 스키마에 맞는 페이로드로 호출, (c) 성공 응답 시 상세 페이지 경로로 이동 검증(기존 페이지 테스트의 fetch mock 패턴)
- 자동: matters/page.test.tsx 갱신 — '새 Matter' 버튼 href가 /matters/new임을 검증
- 수동: 웹 로그인 후 /matters/new에서 매터 생성 → /matters 목록에 즉시 표시되고 상태가 proposed이며 audit 콘솔에 MATTER_CREATED가 보이면 통과; 매터 생성 권한 없는 역할로 접근 시 폼 제출이 403 에러 안내를 표시하면 통과

#### A4 [M] Client 관리 UI + Matter 화면 고객명 표시

**Goal:** 사용자가 /clients에서 고객 목록·상세·해당 고객의 매터 목록을 관리하고, 매터 목록·상세에서 clientId 대신 고객명을 볼 수 있다.

**Scope:** 만들 것: (1) MatterDto에 clientDisplayName 추가 — matter.service의 목록/단건 쿼리에 clients JOIN(권한 필터 통과 전제, 기존 leadLawyerDisplayName 패턴 재사용). (2) 신규 /clients 목록 페이지와 /clients/[clientId] 상세(고객 정보, confidentiality_level 배지, 해당 고객 매터 목록 — listMatters의 clientId 필터 재사용). (3) api-client.ts에 listClients/getClient/createClient/updateClient 추가(기존 client.controller CRUD 그대로 소비). (4) clients에 alias(구명칭) 필드 마이그레이션 추가하고 A1 conflicts 매칭 소스에 포함. 만들지 않을 것: 고객 포털·CRM 기능.

**교정(검증·비평 반영):** 교차 교정: deps A1 제거(스퓨리어스). H1 범위는 A3 매터 생성에 필요한 최소(고객 목록·생성·매터 화면 고객명 표시)로 축소, 고객 상세 관리 화면은 H2 후속으로.

**Dependencies:** 없음

**Code anchors:**
- `apps/api/src/modules/client/client.controller.ts`
- `apps/api/src/modules/client/client.service.ts`
- `apps/api/src/modules/matter/matter.service.ts`
- `packages/shared/src/matter/matter.dto.ts`
- `신규: apps/web/src/app/(app)/clients/page.tsx`
- `신규: apps/web/src/app/(app)/clients/[clientId]/page.tsx`
- `apps/web/src/lib/api-client.ts`
- `신규: db/migrations/0099_add_client_aliases.sql`
- `tests/integration/client.spec.ts`

**Acceptance tests (완료판정):**
- 자동: tests/integration/client.spec.ts 확장 — alias 필드 CRUD와 sensitive 키 차단, cross-tenant 조회 차단 검증; tests/integration/matter-core.spec.ts 확장 — GET /matters/:id 응답에 clientDisplayName 포함 검증
- 자동: 신규 apps/web/src/app/(app)/clients/page.test.tsx — 목록 렌더링, confidentiality 배지, 상세 이동 링크 검증
- 수동: /clients에서 고객 상세로 진입해 해당 고객의 매터 목록이 표시되고, /matters 목록 각 행에 고객명이 표시되면 통과

**검증 노트(반영 필요 세부):**
- (앵커 부정확) deps A1은 스퓨리어스다 — 고객 CRUD·이름 표시는 이해상충 엔진과 무관하다(클라이언트 데이터는 기존 존재). deps를 '없음'으로 정정하라. 아울러 H1 총량 완화를 위해 A4를 'A3 매터 생성에 필요한 최소(고객 목록·생성·매터 화면 이름 표시)'로 축소하고 고객 상세·매터 목록 관리 화면은 H2로 미루는 것을 권고한다.

#### A5 [S] Party(당사자) 패널을 Matter 상세에 노출

**Goal:** 사용자가 매터 상세 화면에서 당사자(상대방·이해관계자)를 추가·수정·조회하고 restricted 당사자는 최소 노출 배지로 표시된다.

**Scope:** 만들 것: (1) 기존 party API(CRUD, taxonomy 0021, restricted 마커 0022)를 소비하는 당사자 패널 컴포넌트를 /matters/[matterId]에 추가 — 역할·유형·restricted 배지, 종료 매터에서는 추가/수정 비활성(기존 API 차단 규칙 반영). (2) api-client.ts에 party 함수 추가. (3) restricted 당사자는 기존 safeLabel 노출 최소화 규칙 준수. 만들지 않을 것: 백엔드 변경(party 모듈은 이미 실구현·테스트 완료), 당사자 간 관계 그래프(Knowledge Graph 워크스트림).

**Dependencies:** 없음

**Code anchors:**
- `apps/api/src/modules/party/party.controller.ts`
- `apps/api/src/modules/party/party.service.ts`
- `db/migrations/0021_party_taxonomy_check.sql`
- `db/migrations/0022_party_restricted_marker.sql`
- `apps/web/src/app/(app)/matters/[matterId]/page.tsx`
- `apps/web/src/lib/api-client.ts`
- `tests/integration/party.spec.ts`

**Acceptance tests (완료판정):**
- 자동: 신규 matter 상세 당사자 패널 컴포넌트 테스트(기존 (app) 페이지 *.test.tsx 패턴) — (a) 당사자 목록 렌더링과 restricted 배지 표시, (b) closed 매터에서 추가 폼 비활성, (c) 추가 제출 시 API 페이로드 스키마 검증
- 자동: tests/integration/party.spec.ts 기존 통과 유지(회귀 없음)를 CI에서 확인
- 수동: 매터 상세에서 당사자 '상대방' 추가 후 새로고침 시 유지되고, restricted로 표시한 당사자가 목록에서 마스킹 배지로 나타나면 통과

#### A6 [L] 기본개방 권한 모델 (matters.access_scope: firm_open/restricted)

**Goal:** '펌 전원 접근 가능, 제한 매터만 명시적 제한' 모델이 적용된다 — firm_open 매터는 멤버십 없이도 전 직원이 읽을 수 있고, restricted 매터만 기존 멤버십+ethical wall 평가를 요구한다.

**Scope:** 만들 것: (1) 마이그레이션 — matters.access_scope('firm_open'|'restricted', 기존 행은 firm_open으로 백필하되 active ethical wall이 걸린 매터는 restricted로 백필). (2) permission.service의 매터 읽기 평가에 access_scope 분기 추가: firm_open은 활성 사용자면 read 허용(단 ethical wall 평가는 항상 선행 — wall이 있으면 fail-closed 유지), 쓰기/멤버 관리는 종전 멤버십 규칙 유지. (3) permission-query.builder의 목록 필터를 (access_scope='firm_open' OR 멤버십 EXISTS) AND wall 통과로 확장. (4) MatterDto·생성 폼·상세 관리 패널에 access_scope 노출/변경(변경은 owner 권한 + 감사 기록). 만들지 않을 것: 문서 단위 기본값 변경(문서 confidentiality는 기존 체계 유지), 그룹/역할 매트릭스 확장.

**완화 노트:** 9인 로펌 현실에 맞춘 기본 개방 모델. 세분화된 권한 템플릿 매트릭스 대신 이 2값 스코프가 권한 기본값의 전부다.

**Dependencies:** 없음

**Code anchors:**
- `신규: db/migrations/0100_add_matter_access_scope.sql`
- `apps/api/src/modules/permission/permission.service.ts`
- `apps/api/src/modules/permission/permission-query.builder.ts`
- `apps/api/src/modules/permission/permission-query.builder.spec.ts`
- `apps/api/src/modules/matter/matter.service.ts`
- `packages/shared/src/matter/matter.dto.ts`
- `db/migrations/0016_create_ethical_walls.sql`
- `tests/integration/permission`
- `tests/integration/ethical-wall.spec.ts`

**Acceptance tests (완료판정):**
- 자동: permission-query.builder.spec.ts 확장 — access_scope 분기 SQL 생성 검증; 신규 tests/integration/matter-access-scope.spec.ts — (a) 비멤버 활성 사용자가 firm_open 매터 GET /matters/:id 및 문서 목록 read 성공, (b) 동일 사용자가 restricted 매터는 403, (c) wall에 걸린 사용자는 firm_open이어도 ETHICAL_WALL_BLOCKED, (d) 비멤버는 firm_open 매터에도 write 불가, (e) 백필 결과 검증(wall 있는 기존 매터=restricted)
- 자동: tests/integration/ethical-wall.spec.ts·fail-closed.spec.ts 기존 케이스 전부 통과(wall fail-closed 회귀 없음)
- 수동: 멤버가 아닌 계정으로 로그인해 /matters 목록에 firm_open 매터가 보이고 열람 가능하며, restricted 매터는 목록에서 제외되면 통과

#### A7 [M] 생성 파이프라인 완성: 매터 템플릿 2종 + 보존정책 자동 연결

**Goal:** 매터 생성 시 템플릿(기본개방/제한) 선택만으로 access_scope, 초기 멤버, 보존정책, AI 정책이 원자적으로 자동 적용되고 적용 내역이 감사 메타데이터에 남는다.

**Scope:** 만들 것: (1) 마이그레이션 — matter_intake_templates 테이블(template_code: 'default_open'|'restricted', 기본 access_scope, 기본 retention_policy_id FK, 기본 ai_policy_id, 초기 멤버 역할 규칙 JSON) + matters.retention_policy_id FK(0060 retention_policies 참조) + 시드 2행. (2) matter.service.create() 트랜잭션(174-207행) 확장: 템플릿 해석→access_scope/retention_policy_id/ai_policy_id 설정→멤버 벌크 삽입(restricted 템플릿은 lead만, default_open은 lead owner만 — 기본개방이라 멤버 나열 불필요)→MATTER_CREATED 감사 메타데이터에 template_ref 기록. 기존 findDefaultLocalAiPolicyId(450-470행) name-매칭을 템플릿 필드 우선으로 일반화. (3) /matters/new 폼에 템플릿 선택 + 적용값 미리보기. 만들지 않을 것: 템플릿 관리 CRUD UI(시드 2종 고정, DB 수정으로 운영), 사건유형별 문서세트 자동 생성(0088 enterprise_dms_matter_templates는 별개 유지).

**완화 노트:** 완화 정책에 따라 권한 템플릿은 기본개방/제한 2종 시드로 고정. 사건유형별 팀 프리셋·템플릿 관리 화면은 만들지 않는다.

**교정(검증·비평 반영):** 교차 교정: "보존정책 자동 연결"은 바인딩 메커니즘이 생기는 H8 이후 후속으로 이연. H1 완료판정에서 보존정책 적용 항목 제외(템플릿 2종 + AI정책 자동 적용까지).

**Dependencies:** A3, A6

**Code anchors:**
- `신규: db/migrations/0101_create_matter_intake_templates.sql`
- `apps/api/src/modules/matter/matter.service.ts`
- `apps/api/src/modules/matter/matter-member.service.ts`
- `db/migrations/0060_records_governance.sql`
- `db/migrations/0088_create_enterprise_dms_matter_templates.sql`
- `packages/shared/src/matter/matter.dto.ts`
- `apps/web/src/app/(app)/matters/new/page.tsx`
- `tests/integration/matter-core.spec.ts`

**Acceptance tests (완료판정):**
- 자동: tests/integration/matter-core.spec.ts 확장 — (a) default_open 템플릿 생성 시 access_scope='firm_open'+retention_policy_id+ai_policy_id가 설정되고 MATTER_CREATED 감사 메타데이터에 template_ref 존재, (b) restricted 템플릿 생성 시 access_scope='restricted', (c) 템플릿의 retention_policy_id가 유효하지 않으면 트랜잭션 전체 롤백(매터·멤버·감사 모두 미생성)
- 자동: matter.service.spec.ts 보강 — 템플릿 해석 단계 부분 실패 시 롤백 오케스트레이션 단위 검증(다이제스트 low/QUALITY finding 흡수)
- 수동: /matters/new에서 '제한 매터' 템플릿 선택 시 미리보기에 적용될 보존정책·스코프가 표시되고, 생성된 매터가 비멤버에게 보이지 않으면 통과

**검증 노트(반영 필요 세부):**
- (앵커 부정확) anchors의 apps/web/src/app/(app)/matters/new/page.tsx는 현재 실존하지 않음(A3의 신규 산출물) — '신규(A3 산출물):' 표기로 수정할 것. 또한 신규 0101_create_matter_intake_templates.sql은 기존 db/migrations/0088_create_enterprise_dms_matter_templates.sql의 enterprise_dms_matter_templates(matter_type별 템플릿, document_sets_json 보유)와 역할이 중복됨 — 새 테이블 대신 0088 테이블에 access_scope/retention_policy_id/ai_policy_id 컬럼을 추가하는 방향을 우선 검토하고, 별도 테이블이 필요하면 근거를 명시할 것. 부가로 acceptance_tests의 '(다이제스트 low/QUALITY finding 흡수)'는 판정 기준이 아닌 메타 주석이므로 삭제 권장.
- (horizon 부적절) A7(H1)의 완료판정에 '보존정책 자동 연결'이 포함되나, Matter-보존정책 바인딩 메커니즘 자체는 H8(H2)에서 처음 만들어진다. H1 유닛이 H2 메커니즘에 기능적으로 의존하는 역전. 해소안: (a) H8의 '바인딩' 부분만 H1로 분리 승격해 A7의 명시적 dep로 추가하거나, (b) A7 완료판정에서 보존정책 적용을 제외하고 H8 이후 후속 유닛으로 미룬다. H8에는 폐기검토 자동 스케줄만 남긴다.

### B: Document Vault & Editing

#### B1 [L] OCR 레인 실장 — 스캔 PDF·이미지 한국어 OCR로 ocr_pending 봉인 해제

**Goal:** 스캔 PDF와 이미지(jpg/png) 업로드 시 한국어+영어 OCR이 자동 수행되어 본문이 canonical_documents에 저장되고 전문 검색·AI 파이프라인에 편입된다. ocr_pending으로 영구 대기하는 문서가 사라진다.

**Scope:** 만드는 것: (1) ingestion worker에 /ocr 엔드포인트 추가 — Tesseract(kor+eng traineddata) 기반, PDF는 pypdfium2로 페이지 래스터라이즈 후 페이지별 OCR, 이미지 파일은 직접 OCR, 페이지별 confidence 산출. (2) pg-boss 후속 큐 document.ocr 신설(extraction 큐의 재시도·데드레터·singletonKey 패턴 복제) — extraction-dispatcher.storeResult가 status='ocr_pending' 저장 시 OCR 잡을 enqueue. (3) OCR 완료 시 canonical_documents를 extraction_method='ocr', status='ready'로 병합하고 기존 SearchIndexSyncHook을 재사용해 인덱스 재동기화. (4) worker Docker 이미지에 tesseract-ocr+kor 데이터 추가. 만들지 않는 것: 저신뢰 페이지 사람 검수 UI(후속), PaddleOCR GPU 워커(Tesseract 품질 미달 시에만 재평가), 이미지 내 표 구조 복원.

**교정(검증·비평 반영):** 교차 교정: 경계 명확화 — 이 유닛은 OCR 수행 + canonical_documents 저장 + ocr_pending 해제까지. 검색 인덱싱 연결·소급 백필은 D7의 몫(양쪽 완료판정에 명시).

**Dependencies:** 없음

**Code anchors:**
- `workers/ingestion/app/parsers/pdf.py`
- `workers/ingestion/app/parsers/types.py`
- `workers/ingestion/pyproject.toml`
- `workers/ingestion/app/main.py`
- `신규: workers/ingestion/app/ocr_router.py`
- `신규: workers/ingestion/app/parsers/ocr.py`
- `apps/api/src/modules/document/extraction/extraction-dispatcher.ts`
- `apps/api/src/modules/document/extraction/extraction-queue.service.ts`
- `apps/api/src/modules/document/extraction/extraction.types.ts`
- `apps/api/src/modules/search/index/index-sync.hook.ts`
- `신규: apps/api/src/modules/document/extraction/ocr-queue.service.ts`

**Acceptance tests (완료판정):**
- 자동: 신규 tests/integration/document-access/extraction-ocr.spec.ts — 텍스트 레이어 없는 한국어 스캔 PDF fixture 업로드 → canonical_documents가 ocr_pending을 거쳐 status='ready', extraction_method='ocr'로 전이하고 body_text에 fixture의 한국어 문구가 포함됨을 실 DB E2E로 검증(기존 extraction.spec.ts 패턴)
- 자동: 신규 workers/ingestion/tests/test_ocr_router.py — 스캔 PDF/PNG fixture에 대해 /ocr가 페이지별 텍스트와 confidence(0~1)를 반환하고, 텍스트 레이어가 이미 있는 PDF는 skip 코드를 반환
- 자동: apps/api/src/modules/document/extraction/extraction-dispatcher.spec.ts 확장 — ocr_pending 저장 시 document.ocr 큐 enqueue가 1회 발생, ready/failed 저장 시 미발생
- 수동: 스테이징 /files에서 스캔 계약서 PDF 업로드 → 5분 내 /search에서 본문 키워드로 해당 문서가 히트하면 통과
- 성능: 10페이지 300dpi 스캔 PDF의 업로드→OCR 완료(ready 전이)까지 p95 5분 이내 — extraction-ocr.spec.ts에서 타임스탬프 차이로 측정

**검증 노트(반영 필요 세부):**
- (테스트 불가능한 완료판정) 성능 기준 'p95 5분 이내'를 extraction-ocr.spec.ts의 단일 실행 타임스탬프 차이로 측정하겠다고 정의했으나, 표본 1회 실행으로는 p95를 판정할 수 없음. '동일 fixture N회(예: 5회) 반복 실행의 최대 소요시간 5분 이내' 등 표본 수를 명시하거나, spec에서는 '단일 실행 5분 이내 1회 통과'로 재정의하고 p95 측정은 스테이징 스모크 스크립트(tools/release 패턴)로 이관할 것.
- (앵커 부정확) B1 완료판정의 '전문 검색·AI 파이프라인 편입'이 D7(OCR 텍스트 검색 인덱싱 연결+백필)과 경계가 겹친다. B1은 'OCR 수행 + canonical_documents 저장 + ocr_pending 해제'까지로 경계를 명확히 하고, 검색 인덱싱 연결·소급 백필은 D7의 몫임을 양쪽 완료판정에 명시하라(D7 deps B1은 유지).

#### B2 [L] 포맷 커버리지 확대 — 추출(txt/csv/md/html/xlsx/pptx/doc/xls/ppt) + 미리보기 변환 + 비동기 사전 생성

**Goal:** 업로드 허용 19개 확장자 대부분에서 본문 텍스트가 추출되어 검색·AI 대상이 되고, Office 계열 문서(xlsx/pptx/doc/xls/ppt)가 PDF 미리보기로 열람 가능해진다. 미리보기 변환은 업로드 직후 비동기 사전 생성되어 최초 열람 지연이 사라진다.

**Scope:** 만드는 것: (1) extract_router._parse 확장 — txt/md/csv 인라인 추출(chardet 인코딩 감지), html/htm 추출(lxml/bs4, 업로드 밸리데이터에 html 확장자·MIME 추가), xlsx/pptx는 openpyxl/python-pptx, doc/xls/ppt는 LibreOffice headless 변환 경유(기존 docx_to_pdf.py subprocess 인프라 재사용). (2) convert_router에 범용 /convert/office-to-pdf 추가하고 preview.service의 변환 대상을 docx 단독에서 xlsx/pptx/doc/xls/ppt로 확대. (3) 업로드 커밋 시 pg-boss preview 사전 생성 큐(document.preview-convert — preview-convert.job.ts에 이미 큐 이름 존재)로 변환을 비동기화하고 실패 시 document_preview_artifacts.status='failed' 재시도. 만들지 않는 것: ZIP 해제 인제스트(B7), HWP 바이너리(B9), PDF.js 커스텀 뷰어 교체와 인쇄/복사 억제(완화 정책 제외 — 네이티브 iframe 유지), 이메일 계열 eml/msg 파싱·첨부 분리 저장(C 워크스트림 Email Vault 레인).

**완화 노트:** 인쇄/복사 뷰어 차단은 내부용 불필요로 계획 제외 — PDF.js 교체 없이 브라우저 네이티브 iframe 뷰어 유지. eml/msg는 B2 완료판정에서 제외하고 Email Vault(C)로 일원화한다.

**교정(검증·비평 반영):** 교차 교정: 추출 대상에서 eml/msg 제거 — 이메일 계열 파싱은 C 워크스트림(C1/C2/C10/C11)으로 일원화.

**Dependencies:** 없음

**Code anchors:**
- `workers/ingestion/app/extract_router.py`
- `workers/ingestion/app/convert_router.py`
- `workers/ingestion/app/converters/docx_to_pdf.py`
- `workers/ingestion/pyproject.toml`
- `신규: workers/ingestion/app/parsers/office.py`
- `신규: workers/ingestion/app/parsers/plaintext.py`
- `apps/api/src/modules/document/validators/file-extension.validator.ts`
- `apps/api/src/modules/document/validators/mime-type.validator.ts`
- `apps/api/src/modules/document/extraction/extraction-dispatcher.ts`
- `apps/api/src/modules/preview/preview.service.ts`
- `apps/api/src/modules/preview/preview-convert.job.ts`
- `db/migrations/0035_create_document_preview_artifacts.sql`

**Acceptance tests (완료판정):**
- 자동: workers/ingestion/tests/test_extract_router.py 확장 — txt/csv/md/html/xlsx/pptx/doc/xls/ppt 실파일 fixture 각각에 대해 status='ready'와 기대 본문 문자열 포함을 검증, 각 포맷별 extraction_method enum 값 확인; hwp/hwpx OLE payload는 B9 전까지 기존 실패 코드 유지 회귀 검증
- 자동: tests/integration/document-access/extraction.spec.ts 확장 — txt 및 xlsx/pptx/doc/xls/ppt 업로드 → canonical_documents ready 전이 및 검색 인덱스 동기화 E2E
- 자동: tests/integration/document-access/preview.spec.ts 확장 — xlsx/pptx/doc/xls/ppt 업로드 후 미리보기 요청 시 application/pdf 응답, document_preview_artifacts 캐시 적중을 2회차 요청에서 검증
- 자동: 신규 apps/api/src/modules/preview/preview-precreate.spec.ts(unit) — 업로드 커밋 시 preview 사전 생성 잡 enqueue, 실패 시 status='failed' 기록과 재시도
- 수동: 스테이징에서 pptx 업로드 → 문서 상세 열람 시 3초 내 미리보기 표시(사전 생성 완료 상태)면 통과

**검증 노트(반영 필요 세부):**
- (반영됨) legacy doc/xls/ppt 완료판정은 worker fixture, integration extraction/search, preview fixture, 그리고 hwp/hwpx OLE 실패 회귀 검증으로 판정한다.
- (과대·과소 scope) 단일 유닛에 9개 포맷 추출 파서 + xlsx/pptx/doc/xls/ppt 미리보기 변환 + 비동기 미리보기 사전 생성(신규 잡·실패 재시도 포함)까지 3개 축이 묶여 L 초과 의심. 기존 LibreOffice 변환기(converters/docx_to_pdf.py)가 있어 일부 완화되지만, 비동기 사전 생성(preview-precreate) 축 또는 legacy OLE 3종(doc/xls/ppt) 축을 별도 유닛으로 분리 권고.
- (반영됨) B2의 추출 대상에서 eml/msg를 제거하고 이메일 계열 파싱은 C 워크스트림(C1/C2/C10/C11)으로 일원화한다.

#### B3 [M] 외부공유 워터마크 실 렌더링 — watermarkApplied 허위 클레임 제거

**Goal:** 외부 보안 링크로 다운로드되는 PDF에 수신자 이메일·시각·링크ID 워터마크가 실제로 스탬핑되고, API의 watermarkApplied 응답이 실제 렌더링 사실과 일치한다.

**Scope:** 만드는 것: (1) ingestion worker에 /watermark/pdf 엔드포인트 — pypdf 페이지 병합 + reportlab 오버레이(대각선 반투명 텍스트: 수신자 이메일, ISO 시각, linkId)로 전 페이지 스탬핑. reportlab을 test 의존성에서 런타임 의존성으로 승격. (2) 외부 downloadTicket 상환 경로에서 watermark_required=true인 링크는 워터마크 파생 file_object를 생성·캐시(document_preview_artifacts 파생 아티팩트 패턴 재사용, watermarkRef 문자열을 캐시 키로 활용)하고 워터마크본 sha256을 감사 이벤트에 기록. (3) packages/shared external-types의 watermarkApplied z.literal(true) 하드코딩을 실제 적용 여부 값으로 교체 — 비PDF 파일은 watermarkApplied:false로 정직하게 반환. 만들지 않는 것: 내부 다운로드 워터마크 정책(restricted 등급 정책 연동은 후속), 뷰어 화면 동적 오버레이, DOCX 워터마크(PDF만).

**완화 노트:** VDR 고급 기능(bidder 그룹, 외부 2FA, IP 제한)은 계획 제외 — 워터마크 렌더링만 실장. 내부 열람 화면 워터마크 오버레이는 인쇄/복사 차단 제외 정책에 따라 범위 외.

**Dependencies:** 없음

**Code anchors:**
- `apps/api/src/modules/external/external.service.ts`
- `apps/api/src/modules/external/external.controller.ts`
- `packages/shared/src/external/external-types.ts`
- `workers/ingestion/pyproject.toml`
- `신규: workers/ingestion/app/watermark_router.py`
- `신규: apps/api/src/modules/external/watermark-artifact.service.ts`
- `db/migrations/0035_create_document_preview_artifacts.sql`
- `db/migrations/0058_create_external_core.sql`
- `tests/integration/external-core.spec.ts`

**Acceptance tests (완료판정):**
- 자동: 신규 workers/ingestion/tests/test_watermark_router.py — 3페이지 PDF fixture에 /watermark/pdf 호출 → 반환 PDF 전 페이지의 텍스트 추출에 수신자 이메일과 linkId가 포함되고 원본에는 미포함임을 검증
- 자동: tests/integration/external-core.spec.ts 확장 — watermark_required=true 링크의 다운로드 티켓 상환 → 수신 바이트의 sha256이 원본과 다르고, 감사 이벤트에 워터마크본 해시가 기록되며, 동일 링크 재상환 시 캐시 아티팩트가 재사용됨을 검증
- 자동: packages/shared/src/external/external-types.spec.ts 갱신 — watermarkApplied가 boolean이고 비PDF manifest에서 false 직렬화 확인
- 수동: 스테이징 외부 포털에서 PDF 다운로드 → Acrobat으로 열어 전 페이지 대각선 워터마크(이메일·시각) 육안 확인이면 통과

#### B4 [L] 문서 법률 메타데이터 표준 — Source 필드 + 버전 표준 라벨(v0.1/v1.0/Final/Execution Copy, Clean/Markup)

**Goal:** 모든 문서에 법률적 출처(고객제공/상대방제공/내부작성/공개자료)를 기록·수정·검색할 수 있고, 각 버전에 실무 의미 라벨(내부초안/고객송부본/상대방송부본/협상본/최종본/체결본)과 Clean/Markup 구분을 부여해 '어떤 버전이 고객송부본인가'를 버전 레벨에서 식별할 수 있다.

**Scope:** 만드는 것: (1) 마이그레이션 — documents.source 컬럼(client_provided/counterparty_provided/internal_work_product/public, CHECK, 기본 internal_work_product) + document_versions에 version_label(text), version_significance(internal_draft/client_sent/counterparty_sent/negotiation/final/execution_copy CHECK), rendition_type(clean/markup) 및 markup의 base clean 버전 FK. (2) uploadDocumentFieldsSchema·updateDocumentMetadataSchema·addVersion DTO에 필드 추가(.strict() 유지), 기존 문서는 기본값 백필. (3) UI — upload-metadata-profile과 document-action-center 버전 목록·메타데이터 편집에 source/라벨 노출, filename-metadata.parser의 versionLabel 제안을 기본값으로 승격. (4) 감사 — DOCUMENT_METADATA_CHANGED에 before/after, promote 시 라벨 부여를 publish_reason_code와 동일 트랜잭션으로 기록. 만들지 않는 것: source 자동 제안(이메일 발신자 도메인 기반 — C 레인 후속), counterparty_provided 외부공유 자동 차단 정책, Records 체결본 자동 연계(후속), 비밀등급 확장(현행 3단계 유지).

**완화 노트:** 9종 비밀등급 확장은 제외 — 기존 3단계+privilege/legal hold 유지. 본 유닛은 사양 필수 필드인 Source와 버전 라벨 레이어만 추가하며 기존 정수 version_no 체계를 변경하지 않는다.

**Dependencies:** 없음

**Code anchors:**
- `신규: db/migrations/0098_add_document_source_and_version_labels.sql (번호는 머지 시점 최신+1로 조정)`
- `db/migrations/0027_extend_documents_metadata.sql`
- `db/migrations/0029_create_document_versions.sql`
- `db/migrations/0092_create_document_editing_foundation.sql`
- `packages/shared/src/dto/document/upload-document.dto.ts`
- `packages/shared/src/dto/document/update-document-metadata.dto.ts`
- `packages/shared/src/dto/document/add-version.dto.ts`
- `packages/shared/src/dto/document/version-list.dto.ts`
- `apps/api/src/modules/document/document.service.ts`
- `apps/api/src/modules/document/document-version.service.ts`
- `apps/api/src/modules/document/document-editing.service.ts`
- `apps/api/src/modules/document/filename-metadata.parser.ts`
- `apps/web/src/components/document/upload-metadata-profile.tsx`
- `apps/web/src/components/document/document-action-center.tsx`

**Acceptance tests (완료판정):**
- 자동: tests/integration/document-metadata.spec.ts 확장 — source 없이 업로드 시 internal_work_product 기본값, counterparty_provided로 수정 시 감사 이벤트 before/after 기록, 허용 외 값은 400
- 자동: tests/integration/document-access/document-versioning.spec.ts 확장 — 버전 추가 시 version_significance='client_sent' 지정 → 버전 목록 API에 라벨 반환, markup 버전이 base clean 버전 FK를 갖는 것 검증
- 자동: apps/api/src/modules/document/filename-metadata.parser.spec.ts 확장 — '계약서_v2.1_최종.docx' 파일명에서 라벨 제안이 업로드 기본값으로 승격되는 케이스
- 자동: apps/web/src/components/document/document-action-center.test.tsx 확장 — 버전 목록에 라벨 배지(고객송부본/체결본) 렌더링
- 수동: 스테이징에서 문서 업로드 시 Source 선택 → 문서 프로필에 표시, promote 시 '고객송부본(v1.0)' 라벨 부여 후 버전 목록에서 확인되면 통과

#### B6 [M] 편집 라이프사이클 운영성 패키지 — 잠금 만료 스위퍼, 관리자 강제 해제, 잠금 토큰 왕복, 릴리스 스모크 편입

**Goal:** 체크아웃한 사용자가 이탈해도 잠금이 자동 만료·알림되고, matter owner/관리자가 사유와 함께 잠금을 강제 해제할 수 있으며, 편집 루프 전체가 릴리스 스모크로 매 배포마다 검증되어 'candidate' 딱지가 제거된다.

**Scope:** 만드는 것: (1) pg-boss 스위퍼 잡(extraction-queue 패턴 재사용) — 만료된 active edit session을 주기 스캔해 expired 전이 + DOCUMENT_LOCK_EXPIRED 감사 + notifications(0086) 알림 생성. (2) matter owner/tenant admin용 강제 해제 엔드포인트(document-editing.controller) — 사유코드 필수, 소유자에게 알림, 관리자 액션 감사. document-action-center에 해제 버튼 노출. (3) checkout 응답에 잠금 토큰 원문을 1회 반환하고 save/check-in/cancel에서 lock_token_hash 대조 검증(기존 vestigial 컬럼 활성화) — B12 데스크톱 핸드오프와 향후 WOPI의 전제. (4) tools/release/dms-main-loop-smoke.mjs에 DMS-SMOKE 신규 스텝: checkout→edit package→subversion 저장→리뷰어 승인→check-in→promote→promoted_from_subversion_id 확인→감사 이벤트 체인 검증, docs/current-code-state.md의 candidate 표기 갱신. 만들지 않는 것: WOPI Lock API, 만료 예고 이메일(인앱 알림만).

**Dependencies:** 없음

**Code anchors:**
- `apps/api/src/modules/document/document-editing.service.ts`
- `apps/api/src/modules/document/document-editing.controller.ts`
- `packages/shared/src/dto/document/document-editing.dto.ts`
- `db/migrations/0092_create_document_editing_foundation.sql`
- `db/migrations/0086_create_dms_notifications.sql`
- `apps/api/src/modules/document/extraction/extraction-queue.service.ts`
- `신규: apps/api/src/modules/document/edit-session-sweeper.service.ts`
- `apps/web/src/components/document/document-action-center.tsx`
- `apps/web/src/lib/api-client.ts`
- `tools/release/dms-main-loop-smoke.mjs`
- `docs/current-code-state.md`
- `tests/integration/document-access/document-editing-lifecycle.spec.ts`

**Acceptance tests (완료판정):**
- 자동: tests/integration/document-access/document-editing-lifecycle.spec.ts 확장 — (a) TTL 경과 세션이 스위퍼 1회 실행 후 expired로 전이하고 DOCUMENT_LOCK_EXPIRED 감사와 알림 행이 생성됨, (b) matter owner의 강제 해제가 사유코드 없이는 400, 사유코드와 함께 성공 후 원소유자 알림 생성, (c) 일반 사용자의 강제 해제는 403
- 자동: 동일 spec 확장 — checkout 응답의 lockToken으로 save 성공, 위조 토큰으로 save 시 409/403 거부
- 자동: tools/release/dms-main-loop-smoke.mjs 실행 시 신규 편집 스텝이 스테이징 환경에서 전부 PASS(스크립트 exit 0)
- 수동: 스테이징에서 사용자 A 체크아웃 방치 → TTL 경과 후 사용자 B 문서 화면에 '잠금 만료' 상태 표시, 관리자 계정으로 해제 버튼 동작 확인이면 통과

### C: Email Vault

#### C1 [S] RFC2047 인코딩 워드·charset 본문 디코딩 수정

**Goal:** 한국어 제목·표시명·본문이 EML 임포트 시 올바르게 디코딩되어 저장·표시되고, 제목 기반 Matter 추천과 특권 키워드 휴리스틱이 한국어 메일에서 동작한다.

**Scope:** packages/shared eml-parser에 RFC2047 인코딩 워드 디코더 추가(B/Q 인코딩, UTF-8/EUC-KR/CP949 iconv-lite 변환, 연속 인코딩 워드 접합 규칙, 손상 인코딩 fallback). email-metadata의 subject·참여자 표시명에 디코딩 적용. email.service.ts의 body.toString('utf8') 고정을 Content-Type charset 파라미터 기반 디코딩으로 교체하고 quoted-printable 본문 디코딩 추가. 기존 저장 레코드의 소급 재파싱은 하지 않음(C10 재파싱 배치에서 처리). MSG는 범위 외(C11).

**Dependencies:** 없음

**Code anchors:**
- `packages/shared/src/email/eml-parser.ts`
- `packages/shared/src/email/eml-parser.spec.ts`
- `packages/shared/src/email/email-metadata.ts (isOutside/subject 처리 94, 136-156행)`
- `packages/shared/src/email/email-metadata.spec.ts`
- `apps/api/src/modules/email/email.service.ts (parseRawEmail 부근 575-600행, toString('utf8') 588행)`
- `apps/api/src/modules/email/email.service.spec.ts`

**Acceptance tests (완료판정):**
- packages/shared/src/email/eml-parser.spec.ts에 케이스 추가: =?UTF-8?B?...?=, =?EUC-KR?B?...?=, =?UTF-8?Q?...?=, 멀티라인 연속 인코딩 워드, 알 수 없는 charset fallback — 각각 기대 한국어 문자열과 정확 일치 assert
- apps/api/src/modules/email/email.service.spec.ts에 charset=euc-kr 본문·quoted-printable 본문 EML 픽스처가 손상 없이 디코딩되는 단위 테스트 추가
- tests/integration/document-access/email-filing.spec.ts에 EUC-KR 인코딩 한국어 제목 EML을 POST /matters/:id/emails로 업로드 후 email_messages.subject가 디코딩된 한글 원문으로 저장됨을 assert하는 케이스 추가
- 수동: 실제 Outlook에서 저장한 한국어 제목 .eml을 업로드(C3 이전에는 curl/API 직접 호출)하고 Matter 타임라인에 제목이 깨지지 않고 표시되면 통과

#### C2 [M] 재귀 MIME 트리 첨부 파서 — 중첩 multipart·quoted-printable·내장 rfc822 처리

**Goal:** 실무 메일의 흔한 구조(multipart/mixed 안의 multipart/related·alternative, 인라인 이미지+첨부 혼재, QP 인코딩 첨부, 포워드 내장 이메일)에서도 첨부가 누락·손상 없이 분리되어 정식 문서로 저장된다.

**Scope:** email-attachment.parser.ts를 최상위 boundary 단층 분리에서 재귀 MIME 트리 순회로 교체: 중첩 boundary 재귀, base64/quoted-printable/7bit/8bit content-transfer-encoding 디코딩, message/rfc822 내장 이메일을 .eml 첨부 파일로 분리 저장(내장 이메일의 재귀 임포트·쓰레드 연결은 C12 이후 확장 항목으로 제외). 기존 25MB 상한 정책과 email_document_links 연결 로직은 유지. 인라인 이미지는 Content-Disposition inline+cid 기준으로 첨부 제외 규칙 명시.

**Dependencies:** 없음

**Code anchors:**
- `apps/api/src/modules/email/email-attachment.parser.ts (단층 partSections 83-91행, base64 한정 디코딩 75-81행)`
- `apps/api/src/modules/email/email-attachment.parser.spec.ts`
- `apps/api/src/modules/email/email.service.ts (첨부 임포트 1138-1205행)`

**Acceptance tests (완료판정):**
- apps/api/src/modules/email/email-attachment.parser.spec.ts에 케이스 추가: multipart/mixed>multipart/related 중첩 첨부 검출, quoted-printable 첨부 바이트 무손상 디코딩(sha256 비교), 인라인 이미지 제외+첨부 포함 혼재, message/rfc822 내장 이메일의 .eml 분리, 3단 중첩 트리 — 각 케이스 첨부 개수·파일명·바이트 해시 assert
- tests/integration/document-access/email-filing.spec.ts에 중첩 multipart EML 업로드 시 첨부 문서 2건이 생성되고 email_document_links가 각각 연결됨을 assert하는 케이스 추가
- 수동: 인라인 이미지+PDF 첨부가 섞인 실제 포워드 메일 .eml 업로드 후 문서함에 PDF만 첨부 문서로 생성되고 원문 이메일 관계가 표시되면 통과

#### C3 [M] EML/MSG 업로드 웹 UI + 이메일 파일링 플로우

**Goal:** 사용자가 웹에서 .eml/.msg 파일을 드래그앤드롭으로 Matter에 업로드하고, 업로드 직후 Matter 추천을 확인하며 파일링을 완결할 수 있다 — Outlook add-in 봉인과 무관하게 이메일 캡처 수단이 최초로 열린다.

**Scope:** api-client.ts에 uploadRawEmailToMatter/fileEmailToMatter/getEmailMatterSuggestions 함수 추가(기존 4개 서버 라우트 재사용, 서버 신규 개발 없음). Matter 상세 이메일 타임라인 영역과 /files 업로드 패널에 .eml/.msg accept 업로드 카드 추가. 업로드 성공 시 matter-suggestions 결과를 표시하고 파일링 확인/변경 플로우 완성. 중복(EmailDuplicateMessageError→VALIDATION_FAILED) 시 기존 이메일로 안내하는 UX. tenantDomains는 우선 웹 설정 상수로 주입(서버측 이전은 C9). MSG는 업로드·원문보존만 허용하고 'MSG 파싱 대기' 상태 배지 표시(파싱은 C11).

**교정(검증·비평 반영):** 교차 교정: H1 완료판정은 .eml 한정. .msg는 업로드 접수·원본 보관까지만(파싱은 C11에서).

**Dependencies:** 없음

**Code anchors:**
- `apps/web/src/lib/api-client.ts (listMatterEmailTimeline 213-214행에 함수 추가)`
- `apps/web/src/components/matter/matter-email-timeline.tsx`
- `apps/web/src/components/matter/matter-email-timeline.test.tsx`
- `apps/web/src/app/(app)/matters/[matterId]/page.tsx (타임라인 렌더 138행 부근)`
- `apps/web/src/components/document/document-upload-panel.tsx`
- `apps/web/src/app/(app)/files/page.tsx`
- `apps/api/src/modules/email/email.controller.ts (기존 라우트 75-124행 재사용)`
- `신규: apps/web/src/components/matter/email-upload-card.tsx`

**Acceptance tests (완료판정):**
- 신규 apps/web/src/components/matter/email-upload-card.test.tsx: .eml 파일 드롭→uploadRawEmailToMatter 호출→추천 목록 렌더→파일링 버튼 클릭 시 fileEmailToMatter 호출을 mock으로 검증(기존 matter-email-timeline.test.tsx 패턴)
- email-upload-card.test.tsx에 중복 업로드(VALIDATION_FAILED 응답) 시 기존 이메일 안내 문구 렌더 검증 케이스
- apps/web/src/app/(app)/files/page.test.tsx에 이메일 업로드 진입점 노출 검증 케이스 추가
- 수동: 변호사 계정으로 Matter 상세에서 .eml 드롭→추천 목록에서 Matter 선택→파일링→타임라인에 해당 이메일이 즉시 표시되면 통과; .msg 업로드 시 '파싱 대기' 배지 표시 확인

**검증 노트(반영 필요 세부):**
- (테스트 불가능한 완료판정) C3(H1)은 '.eml/.msg 업로드→파일링 완결'을 주장하나 MSG 파싱은 C11(H2, extract-msg)에서야 존재한다. H1 시점에 .msg는 파싱 불가라 완료판정이 테스트 불가능. C3 완료판정을 .eml로 한정하고, .msg는 '업로드 접수 및 원본 보관까지(파싱은 C11)'로 명시하거나 C3의 .msg 부분을 C11로 이관하라.

#### C4 [M] Outlook 신원검증기 실구현 — Entra ID 토큰 JWKS 검증 (봉인 1 해제)

**Goal:** Outlook add-in의 세션 교환이 항상-DENY 스텁 대신 Microsoft identity platform 토큰 실검증을 통과해 성립한다 — add-in 경로 전체의 첫 번째 봉인이 풀린다.

**Scope:** OutlookIdentityVerifier 인터페이스의 실구현 EntraOutlookIdentityVerifier 신규 작성: Microsoft identity platform JWKS 조회+캐싱, 서명·iss·aud(앱 클라이언트ID)·tid(펌 테넌트ID)·exp/nbf 검증, 토큰 클레임과 세션 mailbox 바인딩(mailboxFingerprint 해시) 일치 검증. outlook.module.ts DI를 env(OUTLOOK_IDENTITY_VERIFIER=entra) 조건 바인딩으로 전환하되 기본은 기존 DENY 구현 유지(fail-close). 개발용 Entra 앱 등록 수행 및 설정값(env) 문서화. 운영게이트·감사 설계는 교체하지 않고 그대로 재사용. 사용자 로그인용 SSO는 범위 외.

**완화 노트:** SAML SSO 런타임 제외 정책과 무관 — 이는 add-in 세션용 Entra 토큰 검증이며 사용자 로그인 SSO가 아님. 검증기는 기본 off(fail-close) 유지.

**Dependencies:** 없음

**Code anchors:**
- `apps/api/src/modules/outlook/outlook-identity-verifier.ts (인터페이스 26행, DENY 스텁 31-36행)`
- `apps/api/src/modules/outlook/outlook-auth.service.ts (검증 실패 policy_denied 86-96행)`
- `apps/api/src/modules/outlook/outlook-auth.service.spec.ts`
- `apps/api/src/modules/outlook/outlook.module.ts (DI 바인딩 43, 52-55행)`
- `apps/api/src/modules/outlook/outlook-operational-gate.ts (게이트 재사용, 80-96행)`
- `신규: apps/api/src/modules/outlook/entra-outlook-identity-verifier.ts`
- `신규: apps/api/src/modules/outlook/entra-outlook-identity-verifier.spec.ts`

**Acceptance tests (완료판정):**
- entra-outlook-identity-verifier.spec.ts: 테스트 전용 서명키/JWKS 픽스처로 (1) 유효 토큰 ALLOW, (2) 만료 토큰 DENY, (3) aud 불일치 DENY, (4) tid 불일치 DENY, (5) 서명 위조 DENY, (6) mailbox 바인딩 불일치 DENY, (7) JWKS 조회 실패 시 fail-close DENY — 7케이스 전부 판정코드까지 assert
- outlook-auth.service.spec.ts에 env 미설정 시 기존 DENY 스텁이 유지됨(회귀 방지) 케이스 추가
- 수동: 개발 M365 테넌트에 매니페스트 사이드로드 후 add-in 태스크페인에서 세션 교환 성공(HTTP 200 + 세션 발급)을 확인하면 통과 — 실패 시 감사로그에 policy_denied가 남는지도 확인

#### C5 [M] Microsoft Graph 콘텐츠 트랜스포트 실구현 — 메시지 MIME·첨부 취득 (봉인 2 해제)

**Goal:** 서버가 항상-거부 Disabled 트랜스포트 대신 Microsoft Graph API로 이메일 원문 MIME과 첨부를 실제 취득할 수 있다 — 콘텐츠 전달 경로가 열린다.

**Scope:** GraphOutlookGraphAttachmentTransport 신규 구현: add-in NAA 토큰의 OBO(on-behalf-of) 교환 토큰 브로커, GET /me/messages/{id}/$value(MIME 원문)·GET /me/messages/{id}/attachments/{id} 호출, 429 throttle Retry-After 처리, 오류코드 매핑(404/401/403→reasonCode). 승인 스코프는 기존 outlook-graph-scopes.ts 레지스트리를 유일 소스로 사용. add-in DTO(outlook-item.ts)와 filing request 스키마에 콘텐츠 게이트 플래그 하에서만 전송되는 원시 Graph itemRef 필드 추가(신규 마이그레이션, 번호는 머지 시점 최신+1 — 현재 0098). outlook.module.ts 바인딩을 env 조건(OUTLOOK_GRAPH_TRANSPORT=graph)으로 전환, 기본은 Disabled 유지. 큐 소비·저장 이행은 범위 외(C6).

**Dependencies:** C4

**Code anchors:**
- `apps/api/src/modules/outlook/outlook-graph-attachment-transport.ts (인터페이스 6-36행, Disabled 38-45행)`
- `apps/api/src/modules/outlook/outlook-graph-attachment.service.ts`
- `apps/api/src/modules/outlook/outlook.module.ts (52-55행 바인딩 교체)`
- `packages/shared/src/outlook/outlook-graph-scopes.ts`
- `packages/shared/src/outlook/outlook-types.ts (filing DTO 스키마)`
- `apps/web/src/lib/outlook-addin/outlook-item.ts (해시 전용 DTO 66-142행에 게이트드 itemRef 추가)`
- `db/migrations/0070_create_outlook_filing_requests.sql (참조 스키마)`
- `신규: apps/api/src/modules/outlook/graph-outlook-transport.ts`
- `신규: apps/api/src/modules/outlook/graph-outlook-transport.spec.ts`
- `신규: db/migrations/0098_add_outlook_filing_item_ref.sql`

**Acceptance tests (완료판정):**
- graph-outlook-transport.spec.ts: Graph HTTP를 mock 서버(nock/undici MockAgent)로 대체해 (1) OBO 토큰 교환→$value 취득 성공 시 MIME 바이트 반환, (2) 404 시 reasonCode='message_not_found', (3) 401 시 토큰 재교환 1회 후 실패 시 denied, (4) 429 시 Retry-After 준수 재시도, (5) 미승인 스코프 요청 시 거부 — 5케이스 assert
- packages/shared/src/outlook/outlook-types.spec.ts에 콘텐츠 게이트 off 시 itemRef 필드가 스키마에서 거부(.strict 유지)되고 on 시에만 허용되는 케이스 추가
- 수동: 개발 M365 테넌트에서 add-in 파일링 요청 생성 후 API 로그로 Graph $value 호출이 200으로 성공하고 MIME 바이트 sha256이 기록되는지 확인하면 통과

#### C6 [M] Outlook 파일링 이행 워커 — queued→completed 상태기계와 저장 완결 (봉인 3 해제)

**Goal:** add-in에서 만든 파일링 요청이 백그라운드 워커에 의해 실제 이메일 레코드로 이행되어, Outlook에서 파일링한 이메일이 Matter 타임라인에 나타난다.

**Scope:** 기존 pg-boss 큐 패턴(extraction-queue.service.ts)을 재사용해 outlook_filing_requests 소비 워커 신규 작성: createFilingRequest 시 잡 enqueue, 소비자가 queued→processing 전이 후 C5 트랜스포트로 MIME 취득, 기존 EmailService.importRawEmail에 위임해 email_messages·email_document_links·email_matter_filings 기록, email_record_id 역기입 후 completed 전이. 실패 시 failed+failure_reason_code와 pg-boss 재시도/백오프, 중복(EmailDuplicateMessageError) 시 기존 email_record_id로 completed 처리, 부분 첨부 실패 시 보상 정리(importRawEmail의 기존 스토리지 보상삭제 재사용). 이행 감사이벤트 추가(감사 액션 CHECK 확장 마이그레이션 포함). add-in 태스크페인의 요청 상태 표시를 email_record_id 완료 상태와 연결. send-and-file 이그레스와 autofile 엔진은 범위 외(C14/C13).

**Dependencies:** C5, C1, C2

**Code anchors:**
- `apps/api/src/modules/outlook/outlook.service.ts (createFilingRequest 161-186행)`
- `apps/api/src/modules/outlook/outlook.module.ts`
- `apps/api/src/modules/email/email.service.ts (importRawEmail 389-564행)`
- `apps/api/src/modules/document/extraction/extraction-queue.service.ts (pg-boss 패턴 재사용)`
- `apps/api/src/common/db/pg-boss-runtime-options.ts`
- `db/migrations/0070_create_outlook_filing_requests.sql (상태기계 168행)`
- `apps/web/src/app/outlook-addin/outlook-addin-client.tsx`
- `apps/api/src/modules/outlook/outlook-audit.events.ts`
- `신규: apps/api/src/modules/outlook/outlook-fulfillment.service.ts`
- `신규: apps/api/src/modules/outlook/outlook-fulfillment.service.spec.ts`
- `신규: db/migrations/0099_outlook_filing_fulfillment_audit_actions.sql`

**Acceptance tests (완료판정):**
- 신규 tests/integration/document-access/outlook-filing-fulfillment.spec.ts: 픽스처 MIME을 반환하는 fake 트랜스포트를 주입해 (1) queued 요청이 completed로 전이되고 email_messages 행·email_matter_filings·email_record_id 역기입이 모두 생성됨, (2) 트랜스포트 denied 시 failed+failure_reason_code 기록, (3) 동일 message_id 중복 시 기존 이메일로 completed, (4) cross-tenant 요청이 RLS로 차단됨 — 4케이스 실DB assert
- outlook-fulfillment.service.spec.ts: 재시도 소진 후 failed 전이와 감사이벤트 발행을 단위 검증
- 수동: 개발 테넌트 add-in에서 이메일 1건 파일링→30초 내 태스크페인 상태가 '완료'로 바뀌고 웹 Matter 타임라인에 해당 이메일(제목·첨부)이 표시되면 통과

#### C7 [M] 파일럿 M365 배포·증거 발급·운영게이트 링 승격 (삼중 봉인 해제 완결)

**Goal:** 실제 펌 M365 테넌트에 add-in이 배포되고 blocked 증거(EV-OUTLOOK-002/003)가 해소되어, 준비된 운영게이트를 따라 R0(관리자)부터 전 인원까지 Outlook 파일링이 정식 개통된다.

**Scope:** 기존 운영게이트·런북·검증 도구를 교체 없이 그대로 실행하는 운영 유닛: (1) 펌 테넌트 Entra 앱 등록 정식화 및 매니페스트 사이드로드/Integrated Apps 검증 수행 → EV-OUTLOOK-002 증거 기록(레지스터 규칙대로 참조ID·상태만), (2) admin consent 수행 → EV-OUTLOOK-003 기록, (3) OUTLOOK_ADDIN_ENABLED 등 플래그를 R0_ADMIN_ONLY부터 활성화, 운영게이트 증거참조 검사 통과 확인, (4) 롤백 리허설 1회 수행(런북 절차: add-in 비활성+플래그 off+웹 파일링 폴백) 후 R3까지 링 승격. 9인 펌이므로 링 승격 간격은 각 1주 이내로 단축. 코드 변경은 env/증거 레지스터/런북 갱신에 한정.

**완화 노트:** 단일 로펌 9인 환경이므로 링 승격을 다주 캠페인이 아닌 1주 간격 압축 일정으로 운영. SIEM/SOC2 증거 자동화는 제외 — 기존 evidence-register 수기 참조ID 방식 유지.

**교정(검증·비평 반영):** 교차 교정: H1 범위를 R0(관리자) 파일럿 배포 + EV-OUTLOOK-002/003 증거 해소까지로 한정. 전 인원 링 승격은 C15(H2)로 분리.

**Dependencies:** C4, C6, C3

**Code anchors:**
- `docs/release/evidence-register.md (EV-OUTLOOK-002/003 blocked 40-41행)`
- `apps/api/src/modules/outlook/outlook-operational-gate.ts (플래그·증거 게이트 80-96, 231-257행)`
- `apps/api/src/modules/outlook/outlook-operational-gate.spec.ts`
- `tools/release/check-outlook-operational.ts`
- `tools/release/check-outlook-deployment.mjs`
- `tools/release/check-outlook-verification.mjs`
- `tools/release/render-outlook-manifest.mjs`
- `apps/web/public/outlook-addin/manifest.xml`
- `docs/release/outlook-addin-deployment-runbook.md`
- `docs/release/outlook-addin-graph-scope-matrix.md`

**Acceptance tests (완료판정):**
- pnpm outlook:verification:check와 pnpm outlook:deployment:check가 증거 레지스터 갱신 후 성공(exit 0)해야 함
- outlook-operational-gate.spec.ts에 EV-OUTLOOK-002/003이 recorded 상태일 때 R0 게이트가 열리는 케이스 추가(현행 blocked 시 닫힘 케이스 유지)
- 수동(관리자): 펌 테넌트 Integrated Apps에서 add-in 설치 확인→관리자 계정으로 이메일 1건 파일링 end-to-end 성공→audit 콘솔에서 이행 감사이벤트 확인
- 수동(롤백 리허설): 런북 절차대로 플래그 off 후 add-in이 fail-close로 차단되고 웹 EML 업로드(C3)가 폴백으로 동작함을 확인, 결과를 evidence-register.md에 참조ID로 기록

**검증 노트(반영 필요 세부):**
- (테스트 불가능한 완료판정) apps/api/src/modules/outlook/outlook-operational-gate.ts의 ringAllowedFeatures(120-140행)에서 R0_ADMIN_ONLY는 ADDIN_BOOTSTRAP/AUTH_EXCHANGE/SMART_ALERTS만 허용하고 GRAPH_ATTACHMENT_ACQUISITION은 강제 모드에서 RING_NOT_ALLOWED로 차단된다. 따라서 'EV-OUTLOOK-002/003 recorded 시 R0 게이트가 열리는 케이스'와 수동 판정 '관리자 계정 이메일 1건 파일링 end-to-end 성공'(C5/C6 Graph MIME 취득 필요)은 동시에 성립할 수 없다. 승격 목표 링을 R1_PILOT_PRACTICE로 명시하고 spec 케이스를 'R1 + 증거 recorded 시 GRAPH_ATTACHMENT_ACQUISITION 허용'으로 재기술하거나, R0 허용표에 GRAPH_ATTACHMENT_ACQUISITION 추가를 산출물·테스트에 명시적으로 포함하라.
- (과대·과소 scope) H1 내 C4→C5→C6→C7 직렬 4단계 + '전 인원 정식 개통'까지는 과대. C7을 분할해 H1은 'R0(관리자) 파일럿 배포 + EV-OUTLOOK-002/003 증거 해소'까지로 한정하고, 전 인원 링 승격은 H2 별도 유닛으로 미뤄라. M365 테넌트 실배포는 외부 변수(관리자 승인·매니페스트 심사)로 지연 위험이 커 H1 완료판정을 파일럿 기준으로 잡는 편이 테스트 가능하다.

### D: Search & Retrieval

#### D1 [L] 한국어 n-gram FTS 도입 (pg_bigm 계열, Postgres 내 해결)

**Goal:** 사용자가 조사·어미가 붙은 한국어 질의(예: '손해배상을', '계약의 해지')로 본문을 검색해도 원형/변형 문서를 놓치지 않는다. ADR-006에서 recall 55%로 측정된 한국어 검색 품질을 실무 합격선(recall 90%+)으로 끌어올린다.

**Scope:** (1) 스파이크+ADR: pg_bigm vs PGroonga vs textsearch_ko(mecab) 비교 후 결정 — RDS PostgreSQL 확장 지원(pg_bigm 지원, PGroonga 미지원)과 기존 permission-before-search 구조 유지 비용을 판단 기준으로 명시하고, OpenSearch 도입은 9인 규모 재증명 비용 과다로 부결을 decision.md에 기록. (2) infra/docker-compose.dev.yml의 pgvector/pgvector:pg16 이미지를 선택 확장 포함 이미지로 교체. (3) 신규 마이그레이션: document_search_index의 CHECK (fts_config='simple') 완화, title/content_text에 bigram GIN(또는 선택 확장 인덱스) 추가. (4) search-query.builder.ts의 websearch_to_tsquery('simple') 3개 경로(키워드/브라우즈/벡터 하이브리드)를 신규 매칭 연산으로 교체하되 권한 스코프 필터 구조는 변경하지 않음. (5) tools/search-eval/run-korean-eval.ts를 신규 백엔드로 재실행하도록 확장. OpenSearch 클라이언트·인덱스 동기화는 만들지 않는다.

**완화 노트:** OpenSearch/Elastic 도입 및 인덱스 샤딩은 9인 규모 완화 정책에 따라 제외 — Postgres 확장으로 해결하고 부결 사유를 ADR로 기록

**Dependencies:** 없음

**Code anchors:**
- `db/migrations/0036_create_document_search_index.sql`
- `신규: db/migrations/0098_korean_ngram_search.sql`
- `apps/api/src/modules/search/query/search-query.builder.ts`
- `apps/api/src/modules/search/index/search-index.repository.ts`
- `tools/search-eval/run-korean-eval.ts`
- `tests/fixtures/search/korean-legal-terms.json`
- `infra/docker-compose.dev.yml`
- `docs/ledger/decision.md`

**Acceptance tests (완료판정):**
- tools/search-eval/run-korean-eval.ts를 ADR-006 코퍼스(30 cases/90 snippets)로 실행해 recall >= 0.90, precision >= 0.95 산출값이 리포트에 기록된다 (기존 baseline recall 0.55 대비 자동 비교 출력)
- 신규 통합테스트 tests/integration/search-permission/search-korean-morphology.spec.ts: '손해배상' 질의가 '손해배상액을'/'손해배상의' 포함 본문을 히트하고, 무관 문서는 미히트
- 기존 tests/integration/search-permission/ 17개 스펙 전체 그린 (권한/월/facet 회귀 없음 — ADR-006이 요구하는 재증명 절차)
- 수동: /search에서 '계약 해지' 검색 시 '계약을 해지한다' 문장이 포함된 문서가 스니펫 하이라이트와 함께 표시되면 통과

**검증 노트(반영 필요 세부):**
- (앵커 부정확) acceptance_tests의 '기존 tests/integration/search-permission/ 17개 스펙'은 부정확. 디렉토리 파일 수는 17개지만 그중 2개(search-fixtures.ts, search-http-helpers.ts)는 헬퍼이고 *.spec.ts는 15개다. '15개 스펙(디렉토리 내 *.spec.ts 전체) 그린'으로 수정할 것.

#### D2 [M] 실임베딩 서비스 도입 (bge-m3 로컬 서빙 + 1024차원 스키마 + HNSW)

**Goal:** 신규 인덱싱되는 문서 청크가 16차원 해시 벡터가 아닌 실제 한국어 의미 임베딩(bge-m3, 1024차원)으로 저장되어, 동의어·패러프레이즈·한영 교차 의미 매칭의 기반이 마련된다.

**Scope:** (1) packages/ai/src/index.ts에 embedText()/embedBatch() 추가 — Ollama /api/embed 엔드포인트로 bge-m3 호출(기존 /api/generate 트랜스포트 패턴 재사용, 로컬 서빙이므로 DEC-11 외부모델 차단 정책과 양립, ADR로 기록). (2) packages/shared/src/ai/chunk.ts의 aiEmbeddingDimension을 모델별 차원 맵으로 확장. (3) 신규 마이그레이션: document_chunk_embeddings에 vector(1024) 컬럼(또는 모델별 행 분리) + HNSW 인덱스(m=16, ef_construction=64), model_route CHECK를 'bge_m3' 허용으로 완화. (4) search-index.repository.ts:317의 deterministicEmbeddingVector 호출을 embedText로 교체, 임베딩 서비스 미가용 시 stale 플래그 기록 후 인덱싱은 성공 처리(fail-soft). 기존 문서 백필(D3)과 쿼리 경로 전환(D4)은 제외.

**완화 노트:** 외부 임베딩 API(OpenAI 등)는 사용하지 않음 — 로컬 서빙 유지. tenant별 벡터 인덱스 분리/파티셔닝은 단일 테넌트이므로 제외

**Dependencies:** 없음

**Code anchors:**
- `packages/ai/src/index.ts`
- `packages/shared/src/ai/chunk.ts`
- `apps/api/src/modules/search/semantic/local-embedding.ts`
- `apps/api/src/modules/search/index/search-index.repository.ts`
- `db/migrations/0049_create_document_chunks_and_embeddings.sql`
- `신규: db/migrations/0099_real_embedding_columns_hnsw.sql`
- `docs/ledger/decision.md`

**Acceptance tests (완료판정):**
- packages/ai/src/index.spec.ts에 embedText 계약 테스트 추가: mock transport로 /api/embed 요청 형식·1024차원 응답 파싱·타임아웃/오류 시 명시적 실패 검증
- apps/api/src/modules/search/index/search-index.repository.spec.ts 갱신: upsert 시 model_route='bge_m3' 임베딩 저장, 임베딩 서비스 다운 시 stale 플래그 기록 검증
- tests/integration/search-permission/search-index.spec.ts에 케이스 추가: 문서 인덱싱 후 document_chunk_embeddings에 1024차원 행 존재 + EXPLAIN으로 벡터 조회가 HNSW 인덱스를 사용함을 단언
- 성능(수동 측정): 로컬 Ollama bge-m3로 1,000자 청크 단건 임베딩 p95 < 500ms, 문서 1건(청크 50개) 인덱싱 완료 < 30s — 측정 스크립트 출력 첨부

#### D3 [S] 기존 인덱스 재임베딩 백필 배치

**Goal:** 이미 인덱싱된 전체 문서 청크가 구 16차원 해시 벡터에서 실임베딩으로 소급 교체되어, 의미 검색이 기존 문서 전체를 커버한다.

**Scope:** (1) 기존 pg-boss 큐 인프라(indexing.service.ts의 search.index 큐, dead-letter, singletonKey 패턴)를 재사용해 구모델/stale 임베딩 청크를 스캔·재임베딩하는 백필 잡 추가. (2) reindex.controller.ts/reindex.service.ts에 관리자 백필 트리거 + 진행률(잔여 청크 수, 실패 수) 조회 엔드포인트 추가. (3) 백필 완료 후 구 16차원 임베딩 행 삭제 마이그레이션(정리). 새 큐 시스템 도입이나 임베딩 모델 변경은 하지 않는다.

**Dependencies:** D2

**Code anchors:**
- `apps/api/src/modules/search/index/indexing.service.ts`
- `apps/api/src/modules/search/index/reindex.controller.ts`
- `apps/api/src/modules/search/index/reindex.service.ts`
- `apps/api/src/modules/search/index/search-index.repository.ts`
- `apps/api/src/modules/search/index/index-failure.handler.ts`

**Acceptance tests (완료판정):**
- apps/api/src/modules/search/index/reindex.service.spec.ts 확장: 백필 배치 크기·재시도·dead-letter 이관·진행률 계산 단위 검증
- tests/integration/search-permission/search-index.spec.ts에 케이스 추가: 구모델 임베딩 청크 시드 → 백필 실행 → model_route='bge_m3' 아닌 임베딩 0건 단언
- 수동: 관리자 계정으로 백필 API 호출 → search health 엔드포인트에서 잔여 stale 카운트가 0으로 수렴하는 것을 확인, 실패 건은 dead-letter 큐에서 조회 가능하면 통과

#### D4 [M] semantic/hybrid 검색 실질화 + 웹 UI 모드 노출

**Goal:** 사용자가 /search에서 키워드/의미/하이브리드 모드를 직접 선택해 동의어·패러프레이즈 질의로 문서를 찾을 수 있다. 현재 테스트로만 도달 가능한 semantic 경로가 실사용 기능이 된다.

**Scope:** (1) search-query.builder.ts buildVector/buildVectorChunks의 vectorParam을 질의 시 embedText 1회 호출한 실임베딩으로 교체(코드 구조는 준비되어 있음). (2) search-bar.tsx에 모드 토글(키워드/의미/하이브리드) 추가, search-client.tsx requestForState()에 mode 직렬화, URL 파라미터 및 saved_searches(0081/0083) 저장·복원에 mode 반영. (3) result-card.tsx에 semantic/hybrid 모드 시 유사도 %와 매치 청크 컨텍스트 표시. (4) 검색 감사 메타데이터에 mode·zero-result 여부 기록(향후 품질 튜닝용, 기존 query 해시 프라이버시 정책 유지). 자연어 질의 UI(D10)와 재랭킹 고도화는 제외.

**Dependencies:** D2, D3

**Code anchors:**
- `apps/api/src/modules/search/query/search-query.builder.ts`
- `apps/api/src/modules/search/search.service.ts`
- `apps/web/src/app/(app)/search/search-client.tsx`
- `apps/web/src/app/(app)/search/page.tsx`
- `apps/web/src/components/search/search-bar.tsx`
- `apps/web/src/components/search/result-card.tsx`
- `apps/web/src/components/search/search-save-panel.tsx`
- `packages/shared/src/search/search-query.dto.ts`
- `db/migrations/0081_create_saved_searches.sql`

**Acceptance tests (완료판정):**
- apps/web/src/components/search/search-bar.test.tsx: 모드 토글 렌더·선택 변경 시 콜백 호출 검증, apps/web/src/components/search/result-card.test.tsx: semantic 결과에 유사도 % 렌더 검증(기존 부정 단언 갱신)
- tests/integration/search-permission/search-semantic.spec.ts에 실임베딩 케이스 추가: '계약 해지' 질의가 '계약의 종료' 문구 청크를 hybrid 모드에서 히트하고, 권한 밖 사용자는 동일 질의에서 미히트
- 통합테스트: saved search에 mode='hybrid' 저장 후 재실행 시 동일 모드로 질의됨을 API 레벨에서 단언 (tests/integration/search-permission/search-filter-endpoint.spec.ts 확장)
- 수동: /search에서 의미 모드 선택 → 동의어 질의 → 유사도 배지가 붙은 결과 확인, URL 복사 후 새 탭에서 열면 모드가 유지되면 통과

### E: AI Assistant & Governance

#### E1 [L] Matter 상세 AI 질의 패널 — RAG 파이프라인 최초 사용자 노출

**Goal:** 사용자가 Matter 상세 화면에서 사건에 대해 자연어로 질문하고, 인용이 달린 답변을 받아 인용 클릭으로 원문 문서로 이동하며, 해당 답변의 검색·인용·제외 내역(hiddenSourceCount 포함)을 확인할 수 있다.

**Scope:** 신규 web API 클라이언트(ai-assistant.ts)로 기존 POST /ai/summaries(task=matter_qa|matter_summary), GET /ai/sessions/:id, POST /ai/feedback을 연결한다. Matter 상세에 AI 질의 패널 컴포넌트를 추가: 질문 입력, 응답 DTO의 sections/citations/claims/warnings/citationWarnings/escalationRequired 렌더링, citationRef 클릭 시 /documents/[id]?chunk={ordinal}로 이동, GET /ai/sessions/:id 기반 '검색·인용·제외 내역' 접이식 감사 뷰, 도움됨/오류 피드백 버튼. API 변경 없음. SSE 스트리밍은 만들지 않음(동기 응답+낙관적 로딩) — 후속 과제로 남긴다.

**교정(검증·비평 반영):** 교차 교정: 하드 의존은 아니나 D2/D3(실임베딩+백필) 이후 착수 권장 — 첫 사용자 경험의 의미검색 품질(첫인상 리스크) 관리.

**Dependencies:** 없음

**Code anchors:**
- `신규: apps/web/src/lib/api/ai-assistant.ts (apps/web/src/lib/api/ai-prep.ts 클라이언트 패턴 재사용)`
- `신규: apps/web/src/components/ai/ai-assistant-panel.tsx`
- `apps/web/src/app/(app)/matters/[matterId]/page.tsx`
- `apps/web/src/app/(app)/documents/[id]/page.tsx (chunk 앵커 수신)`
- `apps/web/src/components/ai/ai-prep-matter-dashboard.tsx (패널 배치 패턴 재사용)`
- `apps/api/src/modules/ai/features/ai-summary.controller.ts`
- `apps/api/src/modules/ai/session/ai-session.controller.ts`
- `apps/api/src/modules/ai/feedback/ai-feedback.controller.ts`
- `packages/shared/src/ai/summary.ts (응답 DTO 타입 소스)`

**Acceptance tests (완료판정):**
- 신규 apps/web/src/components/ai/ai-assistant-panel.test.tsx: 모의 응답으로 sections/citations 렌더, citation 클릭 시 /documents/{id}?chunk={ordinal} 링크 생성, escalationRequired=true 시 '변호사 검토 필요' 배지, hiddenSourceCount>0 시 제외 내역 표시를 단언
- 신규 apps/web/src/lib/api/ai-assistant.spec.ts: 요청/응답 zod 파싱과 403 AI_POLICY_BLOCKED → 사용자 오류 메시지 매핑을 단언
- 기존 tests/integration/ai-summaries.spec.ts, ai-session.spec.ts 전체 통과(API 계약 무변경 확인)
- 수동: 변호사 계정으로 Matter 상세 → AI 패널에서 '이 사건의 계약 상대방은?' 질의 → 인용 달린 답변 표시, 인용 클릭 시 해당 문서 상세로 이동, '검색·인용·제외 내역'에 세션 청크 목록이 표시되면 통과

**검증 노트(반영 필요 세부):**
- (앵커 부정확) E1은 기존 retrieval orchestrator 노출이라 deps 없음이 성립하지만, D2/D3 이전에는 16차원 해시 벡터라 첫 사용자 경험의 의미 검색 품질이 낮다. 하드 dep은 아니되 'D2/D3 이후 배치 권장' 소프트 의존을 명시해 H1 내 착수 순서를 고정하라(첫인상 리스크 관리).

#### E2 [M] matter_qa Gemma 생성 활성화 + 게이트의 테넌트 DB 설정 승격

**Goal:** matter_qa 질의가 청크 나열 템플릿이 아닌 실제 Gemma grounded 생성으로 답변되고, 모델 불가 시에만 EVIDENCE_ONLY_DEGRADED 경고와 함께 템플릿으로 폴백한다. 생성 게이트가 환경변수가 아닌 DB 정책으로 관리된다.

**Scope:** ai-summary.service.ts의 gemmaFileOrganizationTask 게이트를 matter_qa 포함으로 확장(grounded JSON 스키마·인용검증 가드는 기존 것 그대로). renderSummary 템플릿 경로는 degraded 폴백 전용으로 강등하고 기존 EVIDENCE_ONLY_DEGRADED 경고 코드를 응답에 첨부. AI_SUMMARY_GEMMA_ENABLED 환경 플래그를 0080_enable_local_ai_file_org_policy.sql 패턴의 ai_policies 행 기반 게이트로 승격하는 마이그레이션 작성, ops metrics의 fallbackRate로 개방 단계 모니터링. clause_analysis/risk_extraction 생성은 E10에서 별도 수행.

**교정(검증·비평 반영):** 교차 교정 연계: E5 이연에 따라 이 유닛에서 세션 원문 보존 플래그를 미리 활성화해 둘 것(소급 불가 방지).

**Dependencies:** 없음

**Code anchors:**
- `apps/api/src/modules/ai/features/ai-summary.service.ts (137-139 폴백, 213-238 tryRenderGemmaSummary, 385-425 prefixForTask·게이트)`
- `apps/api/src/modules/ai/generation/local-gemma-generation.service.ts`
- `apps/api/src/modules/ai/generation/evidence-prompt.compiler.ts`
- `apps/api/src/modules/ai/generation/grounded-output.guard.ts`
- `apps/api/src/modules/ai/ops/ai-ops.service.ts (fallbackRate 지표)`
- `db/migrations/0080_enable_local_ai_file_org_policy.sql (정책 행 패턴 재사용)`
- `신규: db/migrations/0098_enable_matter_qa_generation_policy.sql`
- `tests/integration/ai-summaries.spec.ts`

**Acceptance tests (완료판정):**
- apps/api/src/modules/ai/features/ai-summary.service.spec.ts에 케이스 추가: matter_qa + Gemma 게이트웨이 성공 모의 시 sections가 생성 산출이며 EVIDENCE_ONLY_DEGRADED 미포함, 게이트웨이 실패 모의 시 템플릿 폴백 + 경고 포함을 단언
- tests/integration/ai-summaries.spec.ts 확장: DB 정책 게이트 on/off에 따라 생성/폴백이 분기되고 AI_RESPONSE 감사 이벤트가 기록됨을 단언
- 수동: Ollama 기동 상태에서 POST /ai/summaries(task=matter_qa) 또는 E1 패널 질의 → 응답이 'Evidence-only' 접두어 템플릿이 아닌 인용 포함 자연어 문장이고, Ollama 중지 시 degraded 경고가 반환되면 통과
- 성능: tools/evalset/run-ai-gate-metrics.ts의 latency 집계로 로컬 Gemma matter_qa p95 20초 이내 확인

**검증 노트(반영 필요 세부):**
- (테스트 불가능한 완료판정) 성능 판정 'tools/evalset/run-ai-gate-metrics.ts의 latency 집계로 matter_qa p95 20초 이내 확인'은 현재 실행 불가. run-ai-gate-metrics.ts(35줄)는 citationAccuracy/hallucinationRate/permissionAccuracy/retrievalRecall/auditCoverage만 출력하며 latency 집계가 없음. p95 latency 집계는 tools/evalset/local-ai-eval.ts 411행에 존재하나 ai_prep_artifacts.latency_ms(프렙 파이프라인) 대상이라 matter_qa 요약 세션(ai_sessions.latency_ms)을 측정하지 않음. 판정 기준을 'ai_sessions.latency_ms 대상 p95 집계를 ai-gate-metrics에 추가(유닛 산출물로 명시)하고 그 수치로 20초 이내 확인' 또는 'ai_sessions 테이블에 대한 percentile_disc(0.95) 쿼리로 확인'으로 교체할 것.

#### E3 [M] 답변 구조 스펙 완성 — 결론/불확실부분/추가확인자료/권장조치/권한제외 표시

**Goal:** AI 답변이 사양서 §8.3 구조(결론·근거문서·인용·불확실부분·추가확인자료·권장조치·권한제외자료 표시)로 반환되고, E1 패널에 4개 신규 섹션이 그대로 렌더링된다.

**Scope:** packages/shared/src/ai/summary.ts의 aiSummaryResponseSchema에 conclusion(단일 결론), openQuestions[](불확실·추가확인 — evidence pack 내부 uncertainty 필드를 응답으로 승격), recommendedActions[](존재 시 escalationRequired=true 강제), excludedSourcesNotice{count}를 추가. 기존 grounded claims kind 'question'을 openQuestions에 매핑. ai-summary.service.ts 응답 조립과 E1 패널 렌더러를 갱신. 인용 위치의 페이지/문단 정밀화(page_no/char_offset)는 ingestion chunking 소관(D 워크스트림)으로 제외하고 chunkId·ordinal 수준 유지.

**Dependencies:** E1

**Code anchors:**
- `packages/shared/src/ai/summary.ts (aiSummaryResponseSchema)`
- `packages/shared/src/ai/generation.ts (aiGroundedClaimKindSchema — 'question' 기존재)`
- `apps/api/src/modules/ai/context/evidence-pack.builder.ts (70-76 uncertainty)`
- `apps/api/src/modules/ai/features/ai-summary.service.ts (163-178 응답 조립)`
- `apps/web/src/components/ai/ai-assistant-panel.tsx (E1 산출물)`
- `tests/integration/ai-summaries.spec.ts`

**Acceptance tests (완료판정):**
- packages/shared/src/ai/summary.spec.ts 확장: 신규 4개 필드 스키마 검증 — conclusion 필수, recommendedActions 비어있지 않으면 escalationRequired=true 강제 위반 시 파싱 실패를 단언
- apps/api/src/modules/ai/features/ai-summary.service.spec.ts: evidence pack uncertainty가 openQuestions로 노출되고 omitted 청크 문서 수가 excludedSourcesNotice.count와 일치함을 단언
- tests/integration/ai-summaries.spec.ts 확장: 응답 JSON에 4개 필드가 항상 존재(빈 배열 허용)함을 단언
- 수동: E1 패널에서 질의 → '결론 / 불확실한 부분 / 추가 확인 자료 / 권장 조치' 4개 섹션이 렌더되고 권장 조치에 검토 필요 배지가 동반되면 통과

#### E4 [M] 금지문서 '제외 후 계속' — 전체 거부에서 청크 단위 제외로 전환

**Goal:** ai_allowed=false 문서가 검색 결과에 섞여도 요청 전체가 거부되지 않고, 해당 문서 청크만 제외 표시된 채 허용 자료만으로 답변이 생성되며 제외 사실이 사용자에게 표시된다.

**Scope:** ai-policy.evaluator.ts에 문서 단위 partition 평가(허용 목록/제외 목록+사유)를 추가하고, retrieval-orchestrator.service.ts의 사후 정책검사(207-223행)를 '차단 문서 청크 필터링' 모드로 변경: 거부 청크를 ai_session_chunks에 included=false, reason_code='ai_policy_blocked'로 적재(스키마 기존재)하고 나머지로 계속. 응답 excludedSourcesNotice에 건수 반영, AI_RETRIEVAL_EXCLUDED 감사 기록 유지. 모든 후보가 금지인 경우에만 기존 AI_POLICY_BLOCKED 전량 거부. 신규 민감도 라벨 체계는 만들지 않는다.

**완화 노트:** 사양서 §8.5 6단계의 별도 민감도 라벨 확인 스테이지는 라벨 9종 신설 없이 현행 3단계 비밀등급+privilege 플래그+ai_allowed 이진 플래그 조합으로 대체(간소화 정책).

**Dependencies:** E3

**Code anchors:**
- `apps/api/src/modules/ai-policy/ai-policy.evaluator.ts (104-106 documents.some(!aiAllowed) 전체 DENY)`
- `apps/api/src/modules/ai/retrieval/retrieval-orchestrator.service.ts (207-223 사후 정책검사)`
- `apps/api/src/modules/ai/session/ai-session-log.service.ts (141-160 included/reason_code upsert 경로)`
- `apps/api/src/modules/ai/audit/ai-audit-recorder.service.ts (AI_RETRIEVAL_EXCLUDED)`
- `db/migrations/0050_create_ai_sessions.sql (ai_session_chunks 스키마)`
- `tests/integration/ai-policy.spec.ts`
- `tests/integration/ai-retrieval.spec.ts`

**Acceptance tests (완료판정):**
- apps/api/src/modules/ai-policy/ai-policy.evaluator.spec.ts 확장: 허용+금지 혼합 문서 셋 입력 시 partition 결과(허용/제외+reason) 반환, 전건 금지 시 DENY 판정을 단언
- tests/integration/ai-retrieval.spec.ts 확장: 금지 1건+허용 2건 시나리오에서 200 응답, 제외 청크가 ai_session_chunks에 included=false·reason_code='ai_policy_blocked'로 기록, excludedSourcesNotice.count가 제외 문서 수와 일치, AI_RETRIEVAL_EXCLUDED 감사 이벤트 존재를 단언
- tests/integration/ai-retrieval.spec.ts: 전 문서 금지 시 403 AI_POLICY_BLOCKED 유지(fail-closed 회귀)를 단언
- 수동: ai_allowed=false로 지정한 문서가 포함된 매터에서 E1 패널 질의 → 답변과 함께 '정책상 제외된 자료 N건' 안내가 표시되면 통과

### F: Knowledge Graph & 지식자산

#### F4 [M] Citation Ledger 영속화 — ai_claims/ai_claim_citations 원장 테이블

**Goal:** 대화형 AI(요약 등)가 생성한 모든 claim과 그 근거 citation이 영속 원장으로 저장되어, 사후에 '어떤 세션의 어떤 주장이 어떤 문서 chunk를 근거로 했는지'를 조회·감사·재검증할 수 있다. citation 없는 claim은 DB 수준에서 저장 불가.

**Scope:** 마이그레이션으로 ai_claims(id, tenant_id, ai_session_id FK, claim_hash, claim_text, kind, is_legal_conclusion, verification_status) / ai_claim_citations(claim_id FK, source_ref, chunk_id, version_id, document_id) 테이블 추가 — RLS FORCE·컬럼 GRANT는 0057 패턴, 'claim마다 citation ≥1 + ref는 ^chunk: 형식' 강제는 0068의 IMMUTABLE 함수 CHECK 패턴을 재사용해 트리거/CHECK로 구현. LocalGemmaGenerationService 완료 시점에 grounded output DTO(claims[].source_refs — 이미 스키마 enum 강제됨)를 원장에 영속화하고 citation-mapper의 chunk→document 해석 결과를 citation 행에 기록. GET /ai/sessions/:id/claims 조회 API 추가(권한: 세션 소유자+감사 롤). 내부용이므로 claim 원문 저장(해시 전용 아님 — 완화 정책의 'AI Audit 원문 저장 강화' 방향). AI prep 경로(ai_prep_artifacts+0068)는 이미 영속이므로 건드리지 않는다.

**완화 노트:** 외부 규제 대응용 해시 전용 설계 대신 claim 원문 저장으로 강화(내부용 전제). 재검증 자동화 파이프라인은 제외 — 조회 API까지만.

**Dependencies:** 없음

**Code anchors:**
- `db/migrations/0050_create_ai_sessions.sql`
- `db/migrations/0068_harden_ai_prep_completed_payload.sql`
- `신규: db/migrations/00XX_create_ai_claims_ledger.sql`
- `apps/api/src/modules/ai/generation/local-gemma-generation.service.ts`
- `apps/api/src/modules/ai/generation/grounded-output.guard.ts`
- `apps/api/src/modules/ai/citation/citation-mapper.service.ts`
- `apps/api/src/modules/ai/features/ai-summary.service.ts`
- `tests/integration/ai-citations.spec.ts`
- `신규: tests/integration/ai-claims-ledger.spec.ts`

**Acceptance tests (완료판정):**
- 신규 tests/integration/ai-claims-ledger.spec.ts (ai-citations.spec.ts 패턴): POST /ai/summaries 성공 후 ai_claims 행 수 = 응답 claims 수, 각 claim에 ai_claim_citations ≥1행, chunk_id가 실존 document_chunks를 가리킴 assert
- 동일 spec: citation 0건인 claim 행을 raw INSERT 시도 시 DB CHECK/트리거 위반으로 실패 assert (0068 패턴 검증 방식 재사용)
- 동일 spec: GET /ai/sessions/:id/claims가 세션 비소유 일반 사용자에게 403, 소유자에게 claim+citation 목록 반환 assert
- 수동 검증: 감사 담당자가 AI 요약 실행 후 세션 claim 조회 API로 각 주장의 근거 문서·chunk를 역추적할 수 있는지 확인

#### F5 [S] citation 없는 Fact 금지 — verified 전이 시 근거 강제 (litigation/dd)

**Goal:** litigation_facts가 verified 상태로, dd_issues가 triaged 이상 상태로 전이될 때 citation_refs 최소 1건이 스키마와 서비스 양쪽에서 강제되어, 근거 없는 확정 사실이 원장에 존재할 수 없다.

**Scope:** 마이그레이션으로 litigation_facts에 CHECK(status='verified' → cardinality(citation_refs) ≥ 1), dd_issues에 동등 CHECK(open 이외 상태 → citation ≥1) 추가 — 기존 위반 행 사전 점검 쿼리 포함(스테이징 데이터 기준). packages/shared/src/litigation/litigation-types.ts와 dd/dd-types.ts의 zod 스키마에 조건부 min(1) refinement 추가(현재 .default([])). litigation.service.ts createFact/updateFact와 dd.service.ts 이슈 상태 전이에 서비스 가드 + 명시적 에러코드 추가. draft 상태는 citation 없이 허용(작성 중 흐름 보존).

**Dependencies:** 없음

**Code anchors:**
- `db/migrations/0057_create_litigation_vault.sql`
- `db/migrations/0056_create_dd_vault.sql`
- `신규: db/migrations/00XX_enforce_fact_citations.sql`
- `packages/shared/src/litigation/litigation-types.ts`
- `packages/shared/src/dd/dd-types.ts`
- `apps/api/src/modules/litigation/litigation.service.ts`
- `apps/api/src/modules/dd/dd.service.ts`
- `tests/integration/litigation-vault.spec.ts`
- `tests/integration/dd-vault.spec.ts`

**Acceptance tests (완료판정):**
- tests/integration/litigation-vault.spec.ts 확장: citation_refs 빈 배열로 status='verified' fact 생성/전이 요청 시 400 + 명시 에러코드, citation 1건 포함 시 200 assert; raw UPDATE로 우회 시도 시 DB CHECK 위반 assert
- tests/integration/dd-vault.spec.ts 확장: dd_issues open→triaged 전이에 동일 계약 assert
- packages/shared/src/litigation/litigation-types.spec.ts 확장: verified+빈 citationRefs 입력이 zod safeParse 실패 assert
- 수동 검증: (UI 개방 후) Fact 편집 화면에서 근거 없이 verified 저장 시 오류 메시지 노출 확인 — UI 미개방 시 REST 클라이언트로 대체

### G: Workflows & External Collaboration

#### G1 [M] 휴면 문서 상태머신 활성화 — 계약 라이프사이클 전이 서비스+UI

**Goal:** 사용자가 문서를 draft→client_sent→counterparty_sent→markup_received→negotiation→final→executed로 UI/API에서 전이시킬 수 있고, 모든 전이가 도메인 규칙으로 검증되고 감사 로그에 남는다.

**Scope:** DocumentLifecycleService에 transitionStatus(documentId, toStatus, note)를 추가하고 packages/domain의 canTransitionDocumentStatus/allowedDocumentTransitions로 검증(0028 DB CHECK와 정합 확인). PATCH /documents/:id/status 엔드포인트 신설, DOCUMENT_STATUS_CHANGED 감사 액션을 audit action 허용목록에 추가하는 마이그레이션. legal hold·archived·disposal_locked 문서는 전이 차단. 웹 파일함/문서 상세에 허용 전이만 노출하는 상태 변경 컨트롤(기존 한국어 상태 라벨 재사용). 워크플로 오케스트레이션 엔진(Temporal 등)은 도입하지 않음 — 이 상태머신이 G3 계약 워크플로의 축이 된다.

**Dependencies:** 없음

**Code anchors:**
- `packages/domain/src/document/document-status.ts`
- `packages/domain/src/document/document-status.spec.ts`
- `apps/api/src/modules/document/document-lifecycle.service.ts`
- `apps/api/src/modules/document/document.controller.ts`
- `db/migrations/0028_documents_status_check_and_audit_actions.sql`
- `apps/web/src/app/(app)/files/page.tsx`
- `신규: db/migrations/0098_add_document_status_transition_audit.sql (다음 번호로 조정)`

**Acceptance tests (완료판정):**
- 자동: tests/integration/document-status-transitions.spec.ts 신설 — (1) draft→client_sent→markup_received→negotiation→final→executed 순차 전이 성공 및 각 전이마다 audit_events에 DOCUMENT_STATUS_CHANGED 행 생성 (2) 비허용 전이(draft→executed) 422 (3) legal hold 걸린 문서 전이 409/422 차단 (4) 타 테넌트 문서 전이 404/403
- 자동: packages/domain 기존 document-status.spec.ts 무수정 통과(도메인 규칙 변경 없음 확인)
- 수동: 변호사 계정으로 /files에서 문서 상태를 '고객 발송'으로 변경 → /audit 감사 콘솔에서 해당 문서의 DOCUMENT_STATUS_CHANGED 이벤트와 이전/이후 상태 메타데이터 확인되면 통과

**검증 노트(반영 필요 세부):**
- (테스트 불가능한 완료판정) acceptance test (1)과 (2)가 상호 모순. packages/domain/src/document/document-status.ts의 allowedDocumentTransitions에 draft→client_sent 전이가 없음(draft에서는 internal_review/final/archived/deleted만 허용, client_sent는 internal_review 또는 negotiation에서만 도달 가능). 따라서 'draft→client_sent→…' 순차 전이 성공 테스트는 도메인 규칙 변경 없이는 통과 불가능한데, 테스트 (2)는 document-status.spec.ts 무수정 통과(도메인 규칙 변경 없음)를 동시에 요구함. 전이 시퀀스를 draft→internal_review→client_sent→markup_received→negotiation→final→executed로 수정하라(비허용 전이 예시 draft→executed 422 테스트는 유효하므로 유지).

#### G2 [L] 계약/DD/송무 화면 봉인 해제 — Matter 탭 read-only 뷰

**Goal:** 변호사가 matter 상세의 계약/DD/송무 탭에서 기존 백엔드 데이터(rule findings·clause bank, RFI·traceability, 증거·Fact Ledger·쟁점트리·case map)를 열람할 수 있다. '완전한 백엔드 + 봉인된 프론트' 상태가 해소된다.

**Scope:** features.ts의 /contracts·/dd·/litigation을 hidden→역할 기반 visible로 전환하고, matters/[matterId] 하위에 contracts/dd/litigation 탭 페이지를 신설해 고아 상태인 웹 API 클라이언트(contract-intel.ts, dd.ts, litigation.ts)를 실제 화면에 연결한다. RouteBlockedState 한 줄짜리 기존 3개 page.tsx는 matter 탭으로 리다이렉트 또는 matter 선택 목록으로 대체. hidden-routes.test.tsx는 역할 게이트 테스트로 교체. 이 유닛은 read-only 뷰까지만 — CRUD 폼은 G3/G7에서. A 워크스트림의 matter 허브 구조와 탭 네비게이션을 조율(탭 슬롯만 합의하면 독립 머지 가능).

**Dependencies:** 없음

**Code anchors:**
- `apps/web/src/lib/features.ts`
- `apps/web/src/app/(app)/hidden-routes.test.tsx`
- `apps/web/src/app/(app)/contracts/page.tsx`
- `apps/web/src/app/(app)/dd/page.tsx`
- `apps/web/src/app/(app)/litigation/page.tsx`
- `apps/web/src/app/(app)/matters/[matterId]/page.tsx`
- `apps/web/src/lib/api/contract-intel.ts`
- `apps/web/src/lib/api/dd.ts`
- `apps/web/src/lib/api/litigation.ts`
- `apps/web/src/components/security/route-blocked-state.tsx`
- `신규: apps/web/src/app/(app)/matters/[matterId]/contracts/page.tsx`
- `신규: apps/web/src/app/(app)/matters/[matterId]/dd/page.tsx`
- `신규: apps/web/src/app/(app)/matters/[matterId]/litigation/page.tsx`

**Acceptance tests (완료판정):**
- 자동: 신규 웹 테스트 3건(matters/[matterId]/dd/page.test.tsx, litigation/page.test.tsx, contracts/page.test.tsx) — mock API 응답으로 RFI-001/FACT-001/rule finding이 실제 렌더링되는지 검증(기존 hidden-routes 테스트가 검증하던 '미노출'의 반대 방향)
- 자동: hidden-routes.test.tsx를 대체하는 role-gated-routes.test.tsx — matter 비멤버/무권한 역할이 탭 콘텐츠에 접근 불가함을 검증
- 자동: 기존 tests/integration/{contract-intel,dd-vault,litigation-vault}.spec.ts 무수정 회귀 통과(백엔드 변경 없음 확인)
- 수동: 통합테스트 시드 데이터가 있는 매터에서 세 탭에 진입해 RFI 목록·Fact Ledger 테이블·case map·rule findings가 표시되면 통과

### H: Platform, Security-lite & 국내 연동

#### H1 [M] MFA TOTP 실구현 — 'mfa_not_available' 로그인 차단 스텁 교체

**Goal:** mfa_enabled 사용자가 인증앱(TOTP)으로 등록하고 2단계 로그인을 완료할 수 있다. 현재 MFA 활성화 시 로그인 자체가 거부되는 fail-closed 스텁이 실제 RFC6238 챌린지로 교체된다.

**Scope:** otplib(또는 자체 RFC6238) 기반 TOTP 구현. (1) mfa_secrets 마이그레이션: TOTP 시크릿 암호화 저장 + 복구코드 argon2 해시 + 사용 플래그. (2) 엔드포인트: POST /v1/auth/mfa/enroll(otpauth URI/QR 반환), /activate(코드 검증 후 활성화), /verify. (3) 로그인 2단계 플로: 비밀번호 성공 → mfa_pending 임시 상태 → TOTP 검증 → sessions.mfa_verified=true 세션 발급(휴면 컬럼 실사용). (4) 코드 재시도 5회 제한, ±1 타임스텝 허용, 복구코드 1회성 소진. (5) MFA_ENROLLED/MFA_CHALLENGE_SUCCEEDED/MFA_CHALLENGE_FAILED 감사 액션을 auditActions allowlist에 추가. (6) 로그인 폼에 TOTP 입력 단계 + 계정 설정에 등록 화면. 만들지 않음: WebAuthn/패스키, SMS·이메일 OTP, SAML/SSO, 외부포털 사용자 2FA.

**완화 노트:** 사양 §20.1의 SSO 런타임·WebAuthn·외부사용자 2FA는 완화 정책으로 제외 — TOTP 단일 수단만. Microsoft OIDC 간편 로그인은 H14(선택·저순위)로 분리.

**Dependencies:** 없음

**Code anchors:**
- `apps/api/src/modules/auth/mfa.policy.ts (스텁 본체, :10-16)`
- `apps/api/src/modules/auth/mfa.policy.spec.ts`
- `apps/api/src/modules/auth/auth.service.ts (:105-125 mfaDecision 분기)`
- `apps/api/src/modules/auth/auth.controller.ts`
- `apps/api/src/modules/auth/session.repository.ts (sessions.mfa_verified 재사용)`
- `apps/api/src/modules/auth/session.guard.ts`
- `db/migrations/0008_sessions.sql (mfa_verified 휴면 컬럼)`
- `packages/shared/src/audit/audit-event-types.ts (:193 auditActions)`
- `apps/web/src/app/(auth)/login/login-form.tsx`
- `신규: db/migrations/0098_create_mfa_secrets.sql`
- `신규: apps/api/src/modules/auth/totp.service.ts`
- `신규: tests/integration/auth-mfa.spec.ts`

**Acceptance tests (완료판정):**
- 자동: tests/integration/auth-mfa.spec.ts — enroll→otpauth URI 파싱→시뮬레이션 TOTP 코드로 activate→재로그인 시 mfa_pending 응답→올바른 코드로 세션 발급 및 sessions.mfa_verified=true DB 확인→틀린 코드 5회 연속 시 챌린지 잠금 + MFA_CHALLENGE_FAILED 감사 행 검증.
- 자동: mfa.policy.spec.ts의 'fails closed while TOTP is not implemented' 케이스를 실플로 케이스로 교체하되, mfa_enabled=true인데 미등록인 사용자는 여전히 등록 요구로 로그인 불가(fail-closed 유지) 검증.
- 자동: tests/integration/auth-session.spec.ts 회귀 — mfa_enabled=false 사용자의 기존 단일 단계 로그인 무변경.
- 수동: firm_admin이 Google Authenticator로 QR 등록 후 로그아웃→재로그인에서 6자리 코드 입력으로 대시보드 진입, /audit 콘솔에서 MFA_* 이벤트 3종 확인되면 통과.

#### H2 [M] 사용자 비활성화·전체 세션 강제회수 + 보안 운영 콘솔(break-glass UI 포함)

**Goal:** 관리자가 화면에서 퇴사자를 즉시 비활성화하면 모든 활성 세션과 리셋 토큰이 한 트랜잭션으로 회수되고, 같은 콘솔에서 break-glass 오버라이드 요청·2인 승인·회수를 수행할 수 있다.

**Scope:** (1) UserService에 deactivate/reactivate 추가: users.status 갱신 + session.repository.revokeAllForUser + password reset 토큰 무효화를 단일 트랜잭션으로. (2) POST /v1/users/:id/deactivate·/reactivate (firm_admin 전용, 마지막 활성 firm_admin 비활성화는 409 차단). (3) USER_DEACTIVATED/USER_REACTIVATED 감사 액션. (4) /admin/security에 사용자 목록 + 비활성/재활성 UI. (5) 신규 lib/api/break-glass.ts 클라이언트로 기존 break-glass API 3종(요청/승인/회수)을 /admin/security 패널에 노출(승인 대기열, 만료 표시, 회수 버튼), 승인 필요 요청을 notifications로 관리자에게 통지. 만들지 않음: SCIM/HR 자동 트리거, 오프보딩 work item 자동 생성, 권한 정기검토 캠페인.

**완화 노트:** 권한 정기검토(recertification) 자동화는 완화 정책으로 제외 — 사용자 비활성화 기능이 그 대체재. SCIM 프로비저닝 제외(9인 규모). break-glass 웹 UI 부재(medium finding)를 이 유닛에 흡수.

**Dependencies:** 없음

**Code anchors:**
- `apps/api/src/modules/user/user.service.ts (deactivate 부재 확인됨)`
- `apps/api/src/modules/user/user-role.controller.ts (@Controller('users') 패턴 재사용)`
- `apps/api/src/modules/auth/session.repository.ts (:154 revokeAllForUser)`
- `apps/api/src/modules/auth/password-reset.service.ts (:229 revokeAllForUser 기존 호출부)`
- `apps/api/src/modules/break-glass/break-glass.controller.ts (:43-73 API 3종 완비)`
- `apps/api/src/modules/notifications/notifications.service.ts`
- `packages/shared/src/audit/audit-event-types.ts`
- `apps/web/src/app/(app)/admin/security/page.tsx`
- `신규: apps/web/src/lib/api/break-glass.ts`
- `신규: apps/api/src/modules/user/user-lifecycle.controller.ts`
- `신규: tests/integration/user-offboarding.spec.ts`

**Acceptance tests (완료판정):**
- 자동: tests/integration/user-offboarding.spec.ts — 활성 세션 2개 보유 사용자를 deactivate→두 세션 모두 401, permission 평가가 'actor:inactive_or_missing' 거부, USER_DEACTIVATED 감사 1건, reactivate 후 신규 로그인 성공, 마지막 firm_admin 비활성화 시도 409 검증.
- 자동: 기존 tests/integration/rbac.spec.ts 패턴 확장 — matter_member/knowledge_manager 역할의 deactivate 호출이 403.
- 자동: apps/web/src/app/(app)/admin/security/page.test.tsx 확장 — 비활성화 버튼·break-glass 승인 패널 렌더링과 API 호출 목킹 검증(기존 page.test.tsx 패턴).
- 수동: /admin/security에서 테스트 계정 비활성화→해당 계정 브라우저가 즉시 로그아웃되는지 확인; break-glass 요청 생성→다른 관리자 계정으로 승인→/audit에서 BREAK_GLASS_USED 이벤트 확인되면 통과.

#### H3 [M] 백업·at-rest 암호화 실체화 — RDS PITR/자동 스냅샷 + 월간 복구 리허설 + RPO/RTO 문서 + Noop 훅 정리

**Goal:** RDS 자동 스냅샷+PITR과 S3 버전닝·SSE 암호화가 활성 상태로 검증되고, 월간 복구 리허설이 스크립트로 반복 가능해지며, 리허설 결과가 기존 backup_snapshots 원장에 '검증됨' 증거로 기록된다.

**Scope:** (1) RDS 자동 백업(보존 ≥7일)+PITR 활성 확인·설정, S3 버전닝·기본 SSE 확인(기존 PROD-BACKUP-AWS-001 기록 연계). (2) 신규 docs/release/backup-dr-runbook.md에 RPO(PITR 기준 ≤5분)/RTO(≤4시간) 정의, 복구 절차, 월간 리허설 체크리스트 문서화. (3) 신규 tools/release/backup-restore-drill.mjs: 스냅샷→스테이징 복원 인스턴스→tools/db/schema-hash.mjs 대조+핵심 테이블 row-count 대조→기존 POST /enterprise/backups/snapshots로 drill 결과 매니페스트 기록. (4) NoopEncryptionHook을 'S3 SSE/RDS at-rest 위임' 명시 주석+파일오브젝트 메타 마커로 정리하고 encryption-hook.interface는 유지(장래 확장점) — envelope 암호화는 구현하지 않음. 만들지 않음: BYOK/KMS envelope 암호화, 교차리전 복제, WAL-G/pgBackRest 자체 운영.

**완화 노트:** BYOK/테넌트별 키는 완화 정책으로 제외 — RDS·S3 관리형 at-rest 암호화로 대체하고 Noop 훅은 문서화·정리만. 사양의 RPO 15분/RTO 1시간은 9인 펌 기준 RPO 5분(PITR)/RTO 4시간으로 재정의해 문서에 명시.

**Dependencies:** 없음

**Code anchors:**
- `apps/api/src/modules/enterprise/enterprise.service.ts (:566-625 createBackupSnapshot 재활용)`
- `apps/api/src/modules/enterprise/enterprise.controller.ts (:125 @Post backups/snapshots)`
- `apps/api/src/modules/storage/noop-encryption.hook.ts`
- `apps/api/src/modules/storage/encryption-hook.interface.ts`
- `apps/api/src/modules/storage/s3-storage.adapter.ts`
- `tools/db/schema-hash.mjs`
- `docs/release/production-execution-preflight.md (수동 스냅샷 게이트 기존 문서)`
- `docs/release/launch-blocker-ledger.md`
- `신규: docs/release/backup-dr-runbook.md`
- `신규: tools/release/backup-restore-drill.mjs`

**Acceptance tests (완료판정):**
- 자동: 신규 tools/release/backup-restore-drill.spec.mjs(기존 tools spec.mjs 패턴) — 두 개의 목킹 DB 접속에 대해 schema-hash 불일치 시 exit 1, 일치 시 drill 매니페스트 JSON 산출 검증.
- 자동: tests/integration/enterprise-hardening.spec.ts 확장 — drill 필드가 포함된 스냅샷 매니페스트가 저장·조회되고 감사 이벤트가 남는지 검증.
- 수동(월간 리허설): backup-restore-drill.mjs를 스테이징 복원 인스턴스에 실행해 'schema hash verified' 출력 + enterprise_backup_snapshots 신규 행을 /enterprise 콘솔에서 확인.
- 수동(설정 증거): aws rds describe-db-instances로 BackupRetentionPeriod>=7, aws s3api get-bucket-versioning=Enabled·get-bucket-encryption 출력 캡처를 backup-dr-runbook.md에 첨부하면 통과.

#### H5 [S] 관측성 정리 — in-memory 메트릭 레지스트리 메모리 누수 수정 + 기본 알림

**Goal:** /metrics가 장기 운영에서도 메모리가 유한한 고정 버킷 히스토그램으로 동작하고, 5xx 급증·큐 적체·워커 다운 시 SNS 이메일 알림이 운영자에게 도달한다.

**Scope:** (1) MetricsRegistry의 observations 무한 push 배열(metrics.middleware.ts:37-43)을 고정 버킷 히스토그램+카운터로 교체 — prom-client 도입 또는 자체 고정 버킷 구현, 라벨 카디널리티를 route template 단위로 제한. (2) pg-boss 큐 깊이·DLQ 카운트 게이지를 /metrics에 추가(extraction/indexing/ai-prep 3개 큐). (3) CloudWatch 알람 3종(ALB 5xx 비율, 큐 깊이 임계, ECS 태스크 수 미달)→SNS 이메일 — H4 alarms.tf에 선언하거나 수동 생성+문서화. (4) 알림 대응 절차를 enterprise-dms-monitor-map.md에 추가. 만들지 않음: OTel 분산 트레이싱, Grafana 대시보드, 로그 상관관계 파이프라인.

**완화 노트:** 사양 §11.1의 Prometheus+Grafana+OpenTelemetry 풀스택은 축소 — 메트릭 엔드포인트 건전화 + CloudWatch 기본 알림까지만.

**Dependencies:** 없음

**Code anchors:**
- `apps/api/src/common/metrics/metrics.middleware.ts (:37-43 observations 배열)`
- `apps/api/src/common/metrics/metrics.controller.ts`
- `apps/api/src/common/metrics/metrics.module.ts`
- `apps/api/src/common/metrics/metrics.spec.ts`
- `apps/api/src/modules/document/extraction/extraction-queue.service.ts (큐 깊이 소스)`
- `apps/api/src/modules/search/index/indexing.service.ts`
- `apps/api/src/modules/ai/prep/ai-prep-queue.service.ts`
- `tests/integration/observability.spec.ts`
- `docs/release/enterprise-dms-monitor-map.md`

**Acceptance tests (완료판정):**
- 자동: metrics.spec.ts 확장 — 100,000회 observe 후 레지스트리 내부 상태 크기가 버킷 수×라벨 조합 상한 이하로 불변임을 assert(현행은 배열 길이 100,000), Prometheus text format 출력 유지.
- 자동: tests/integration/observability.spec.ts 확장 — /metrics 응답에 http 요청 히스토그램 버킷과 queue_depth 게이지 3종이 노출.
- 성능: 로컬에서 autocannon 등으로 10분간 부하 후 API 프로세스 RSS 증가가 정상 범위(히스토그램 교체 전 대비 무한 증가 없음)를 측정해 PR 본문에 기록.
- 수동: 스테이징에서 워커 중지 후 잡 5건 적재→15분 내 큐 깊이 알람 SNS 이메일 수신하면 통과.

**검증 노트(반영 필요 세부):**
- (테스트 불가능한 완료판정) 성능 판정 기준 '10분 부하 후 RSS 증가가 정상 범위(무한 증가 없음)'는 수치 임계가 없어 객관 판정 불가. 예: '부하 후반 5분 구간 RSS 순증 < 50MB 또는 히스토그램 교체 전 대비 RSS 기울기 90% 이상 감소'처럼 고정 임계로 명시하고, 게이트는 자동 테스트(레지스트리 상태 크기 상한 assert)로 두고 RSS 측정은 참고 지표임을 표기하라. 추가로 수동 판정의 'SNS 큐 깊이 알람'은 H4 alarms.tf가 같은 H1에서 알람을 코드화하므로 이중 생성/드리프트 위험 — H4와의 알람 소유권 조정(또는 soft-dep 명시)을 유닛 설명에 반영할 것.

#### H6 [M] pg-boss 워커 독립 프로세스화 + 기본 활성화

**Goal:** 추출·인덱싱·AI-prep 잡이 API와 분리된 전용 워커 프로세스에서 기본 활성으로 처리되어, 환경변수 미설정 배포에서 잡이 조용히 적체되는 사고 유형이 제거된다.

**Scope:** (1) 신규 apps/api/src/worker-main.ts — Nest 애플리케이션 컨텍스트로 extraction/indexing/ai-prep 워커만 구동하는 엔트리포인트. (2) 3개 큐 서비스의 개별 *_WORKER_ENABLED 플래그를 PROCESS_ROLE=api|worker 단일 규약으로 통합: worker 역할은 기본 활성, api 역할은 enqueue 전용(기존 플래그는 하위호환 오버라이드로 유지). (3) package.json start:worker 스크립트, Dockerfile 타깃, docker-compose.dev.yml worker 서비스 추가, graceful shutdown(pg-boss stop). (4) H4의 ecs.tf에 worker 서비스 정의 추가 여지를 문서로 남김. 만들지 않음: Kafka/스트림 브로커 전환, 워커 오토스케일, 큐 파티셔닝.

**완화 노트:** 사양 §13의 수천만 건급 스트림 처리·파티셔닝은 제외(9인 펌 볼륨) — 프로세스 분리와 기본 활성화까지만.

**Dependencies:** 없음

**Code anchors:**
- `apps/api/src/modules/document/extraction/extraction-queue.service.ts (:17-21 workerEnabled 기본 false)`
- `apps/api/src/modules/search/index/indexing.service.ts (WORKER_ENABLED 플래그)`
- `apps/api/src/modules/ai/prep/ai-prep-queue.service.ts (WORKER_ENABLED 플래그)`
- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- `apps/api/package.json (start 스크립트)`
- `infra/docker-compose.dev.yml`
- `신규: apps/api/src/worker-main.ts`
- `신규: tests/integration/worker-processing.spec.ts`

**Acceptance tests (완료판정):**
- 자동: extraction-queue.service.spec.ts(+indexing, ai-prep-queue 동일) 갱신 — PROCESS_ROLE=worker면 워커 등록, =api면 enqueue만 수행, 미설정+worker 엔트리포인트면 기본 활성 검증.
- 자동: tests/integration/worker-processing.spec.ts — api 역할 컨텍스트로 문서 업로드 enqueue→별도 worker 컨텍스트 기동→추출·인덱싱 상태가 succeeded로 전이됨을 폴링 검증.
- 자동: 기존 tests/integration/upload.spec.ts 회귀 통과(인프로세스 테스트 경로 유지).
- 수동: docker-compose.dev.yml로 api+worker 기동, 플래그 환경변수 없이 문서 업로드→검색 히트 확인; api 컨테이너만 기동 시 잡이 대기하고 worker 기동 직후 소진되는지 확인.

## Horizon 2 — DMS 완성: 편집·이메일·통제 심화 (3~9개월)

### A: Matter Core & Intake

#### A8 [M] §5.2 필드 보강: 비밀등급·related_matters·lead partner/associate·wall 상태 노출

**Goal:** 매터 객체가 사양서 §5.2 필수 필드를 갖춘다 — 매터 비밀등급, 관련 매터 링크(선행/병행/후속), 리드 파트너/어소 구분, ethical wall 활성 배지를 목록·상세에서 확인할 수 있다.

**Scope:** 만들 것: (1) 마이그레이션 — matters.confidentiality_level(standard/high/restricted, clients 0012와 동일 3단계), lead_partner_id/lead_associate_id(기존 lead_lawyer_id는 lead_partner_id로 백필 후 호환 유지), related_matters 조인 테이블(tenant_id, matter_id, related_matter_id, relation_type: preceding/parallel/subsequent, RLS FORCE). (2) MatterDto/entity/생성·수정 스키마 확장, matter-member 역할 표시에 partner/associate 라벨. (3) 매터 조회 쿼리에 active ethical wall EXISTS 파생 컬럼 → MatterDto.ethicalWallActive(권한 있는 사용자에게만). (4) 상세 화면 관리상태 패널에 비밀등급·wall 배지·관련 매터 링크 목록(추가/제거 UI 포함), 목록에 보안 컬럼. (5) matter confidentiality를 permission-query.builder ABAC 속성으로 연결해 신규 문서 기본 등급 상속. 만들지 않을 것: 비밀등급 9종 확장(3단계 유지), 매터 그래프 시각화(Knowledge Graph 워크스트림).

**완화 노트:** 비밀등급은 완화 정책대로 3단계 유지. Ethical Wall 상태는 별도 컬럼이 아닌 파생 필드(EXISTS)로 노출해 이중 진실원천을 피함(low finding 흡수).

**Dependencies:** A6

**Code anchors:**
- `신규: db/migrations/0102_matter_spec_fields.sql`
- `packages/shared/src/matter/matter.dto.ts`
- `packages/shared/src/matter/matter-member.dto.ts`
- `apps/api/src/modules/matter/matter.entity.ts`
- `apps/api/src/modules/matter/matter.service.ts`
- `apps/api/src/modules/permission/permission-query.builder.ts`
- `db/migrations/0016_create_ethical_walls.sql`
- `apps/web/src/app/(app)/matters/[matterId]/page.tsx`
- `apps/web/src/app/(app)/matters/page.tsx`

**Acceptance tests (완료판정):**
- 자동: tests/integration/matter-core.spec.ts 확장 — (a) confidentiality_level·lead_partner/associate 저장·조회, (b) related_matters 양방향 조회와 cross-tenant related 링크 삽입 거부, (c) wall 생성 후 GET /matters/:id의 ethicalWallActive=true, 해제 후 false, (d) restricted 매터의 related 링크가 열람권 없는 사용자 응답에서 매터명 대신 safeLabel로 마스킹
- 자동: 신규 문서 업로드 통합 케이스 — confidentiality_level='high' 매터에 업로드된 문서의 기본 등급이 high로 상속됨을 tests/integration/document-metadata.spec.ts 확장으로 검증
- 수동: 매터 상세에서 관련 매터를 추가하면 상대 매터 상세에도 역방향으로 표시되고, /matters 목록에 wall 배지·비밀등급 컬럼이 보이면 통과

#### A9 [M] 쟁점·기한 코어 승격 (matter_issues/matter_key_dates + 봉인 데이터 일반화)

**Goal:** 쟁점(이슈·리스크 등급)과 핵심 기한이 litigation/dd 봉인 스키마가 아닌 매터 코어 데이터로 존재하며, 모든 매터 유형에서 매터 상세 탭으로 조회·관리할 수 있다.

**Scope:** 만들 것: (1) 마이그레이션 — matter_issues(제목, 요약, 상태 open/monitoring/resolved, risk_level low/medium/high/critical — 0057 litigation_facts의 materiality 규약 재사용, RLS FORCE)와 matter_key_dates(제목, due_date, 유형 court/contractual/internal, 상태, 담당자 — 0056 dd_rfis.due_date·0057 litigation_pleadings.internal_deadline 스키마 규약 일반화). (2) matter 모듈에 이슈/기한 CRUD API(permission 필터·감사 로그 기존 패턴 재사용, closed 매터 변이 차단). (3) 읽기 브리지: litigation_pleadings.internal_deadline·dd_rfis.due_date를 matter_key_dates 조회에 UNION으로 포함해 봉인 라우트 없이 코어 화면에서 기한이 보이게 함(쓰기는 각 vault 소유 유지). (4) /matters/[matterId]에 쟁점·기한 탭(추가/상태변경/정렬). 만들지 않을 것: /litigation·/dd 라우트 봉인 해제 자체(해당 워크스트림 소관), 기한 알림 발송(notifications 모듈 연동은 A10 이후 별도 판단).

**Dependencies:** 없음

**Code anchors:**
- `신규: db/migrations/0103_create_matter_issues_key_dates.sql`
- `db/migrations/0056_create_dd_vault.sql`
- `db/migrations/0057_create_litigation_vault.sql`
- `apps/api/src/modules/matter/matter.controller.ts`
- `신규: apps/api/src/modules/matter/matter-issue.service.ts`
- `apps/api/src/modules/litigation/litigation.service.ts`
- `apps/api/src/modules/dd/dd.service.ts`
- `apps/web/src/app/(app)/matters/[matterId]/page.tsx`
- `apps/web/src/lib/api-client.ts`

**Acceptance tests (완료판정):**
- 자동: 신규 tests/integration/matter-issues.spec.ts — (a) 이슈/기한 CRUD와 감사 기록, (b) closed 매터 변이 409 차단, (c) cross-tenant 차단(RLS), (d) litigation vault에 internal_deadline 있는 pleading을 시드하면 GET /matters/:id/key-dates 응답에 출처 태그와 함께 포함, (e) wall에 걸린 사용자에게 기한 목록이 fail-closed로 비어있음
- 자동: 웹 쟁점·기한 탭 컴포넌트 테스트 — risk_level 배지 렌더링, due_date 임박(7일 이내) 강조 표시 검증
- 수동: 자문(advisory) 매터에서 쟁점 2건·기한 1건을 등록하고 매터 상세 탭에서 상태 변경이 즉시 반영되며 audit 콘솔에 기록이 보이면 통과

**검증 노트(반영 필요 세부):**
- (과대·과소 scope) M으로는 과소. 신규 테이블 2종(matter_issues/matter_key_dates)+신규 matter-issue.service+컨트롤러 확장+litigation.service·dd.service의 봉인 데이터 일반화+vault 출처 태그 집계 API+웹 쟁점·기한 탭 UI+wall fail-closed까지 포함 — A6(L)·A10(L)과 비교해 실질 L. L로 상향하거나 '이슈·기한 코어 CRUD+UI'(M)와 'vault 봉인 데이터 일반화·key-dates 집계'(S/M)로 분할할 것. 아울러 테스트 (e) 'wall 사용자에게 기한 목록이 fail-closed로 비어있음'은 리포 관례(ETHICAL_WALL_BLOCKED/403 거부)와 상충 가능 — 빈 200인지 403인지 기대 동작을 명시해 판정 모호성을 제거할 것.

#### A10 [L] Matter Dashboard 집계 엔드포인트 + 워크스페이스 패널

**Goal:** 매터 상세가 한 화면 워크스페이스가 된다 — 최근 활동, 핵심 문서, 미해결 쟁점, 리스크, 임박 기한, 외부 공유 활동, 최근 AI 세션을 단일 대시보드에서 본다.

**Scope:** 만들 것: (1) GET /matters/:matterId/dashboard 집계 엔드포인트 — dashboard.service.getOverview(150행~)의 집계 패턴을 per-matter로 적용해 최근활동(기존 감사 타임라인), 핵심문서(official/최신 버전 우선 랭킹), open 쟁점 수·최고 risk_level, 임박 기한 N건, 외부 공유 활동(external_secure_links·external_workspaces 0058 조회), 최근 AI 세션 N건을 permission 필터 재사용으로 병렬 집계. (2) AI 세션 matter별 목록 — ai-session.controller에 GET /ai/sessions?matterId= 추가(0050의 idx_ai_sessions_tenant_matter_created 인덱스 활용), 모델 티어·정책 결정 요약 포함. (3) /matters/[matterId] 상단을 대시보드 패널 그리드로 재구성(기존 감사 타임라인·문서·이메일 타임라인 컴포넌트 재배치+신규 쟁점/기한/외부활동/AI세션 카드). 만들지 않을 것: 펌 전체 dashboard 변경, 실시간 웹소켓 갱신(폴링/refresh로 충분).

**Dependencies:** A9

**Code anchors:**
- `apps/api/src/modules/matter/matter.controller.ts`
- `신규: apps/api/src/modules/matter/matter-dashboard.service.ts`
- `apps/api/src/modules/dashboard/dashboard.service.ts`
- `apps/api/src/modules/ai/session/ai-session.controller.ts`
- `apps/api/src/modules/ai/session/ai-session-log.service.ts`
- `db/migrations/0050_create_ai_sessions.sql`
- `apps/api/src/modules/external/external.service.ts`
- `db/migrations/0058_create_external_core.sql`
- `apps/web/src/app/(app)/matters/[matterId]/page.tsx`
- `apps/web/src/lib/api-client.ts`

**Acceptance tests (완료판정):**
- 자동: 신규 tests/integration/matter-dashboard.spec.ts — (a) 쟁점·기한·외부링크·AI세션을 시드한 매터의 dashboard 응답에 7개 섹션이 모두 채워짐, (b) 열람권 없는 사용자 403, (c) wall 대상 사용자 fail-closed, (d) 다른 매터의 AI 세션·외부링크가 응답에 섞이지 않음(스코프 격리)
- 자동: ai-session 컨트롤러 통합 케이스 — matterId 필터 목록이 생성시각 내림차순·페이지네이션 동작 검증(tests/integration/ai-session.spec.ts 확장)
- 성능: 문서 500건·감사 2,000건 시드 매터에서 dashboard 응답 p95 < 1.5초 — 통합 테스트에서 측정 assert
- 수동: 매터 상세 첫 화면에서 스크롤 없이(1440px 기준) 쟁점·기한·외부활동·AI세션 카드가 보이고 각 카드 클릭 시 해당 탭/콘솔로 이동하면 통과

**검증 노트(반영 필요 세부):**
- (테스트 불가능한 완료판정) 통합 테스트 (a)의 'dashboard 응답에 7개 섹션이 모두 채워짐'은 7개 섹션이 유닛 어디에도 열거되지 않았고 시드 데이터는 4종(쟁점·기한·외부링크·AI세션)뿐이라 객관 판정 불가. 섹션 목록을 명시적으로 열거(예: 쟁점/기한/멤버/최근 문서/최근 감사활동/외부링크/AI세션)하고 각 섹션에 대응하는 시드를 1:1로 정의할 것. p95 < 1.5초 assert도 측정 방식(반복 횟수 N, 워밍업 제외 여부)을 명시해야 재현 가능한 판정이 됨.

#### A11 [M] Matter 종료 체크리스트 + closed 전이 게이트

**Goal:** 매터를 closing으로 전환하면 종료 체크리스트(체결본 지정, 최종 official 버전 존재, 미해결 legal hold, 미처리 외부 공유 링크, 미해결 쟁점)가 자동 생성되고, 전 항목 통과 전에는 closed 전이가 차단된다.

**Scope:** 만들 것: (1) 마이그레이션 — matter_closing_checklists(matter_id, item_code, 상태 pending/passed/waived, waive 근거, RLS FORCE). (2) MatterClosingService — closing 진입 시(updateStatus 훅) 체크리스트 항목 자동 생성·평가: 체결본 지정 여부(document 모듈 official/executed 상태 조회), 활성 legal hold 존재(0060 legal_holds), 활성 external_secure_links(0058), open 쟁점(A9 matter_issues). 재평가 API + waive(권한자 근거 필수). (3) matter-transitions에 closing→closed 게이트 reason code CLOSING_CHECKLIST_INCOMPLETE 추가, updateStatus에서 fail-closed 적용. (4) /matters/[matterId]에 Closing 탭 — 항목별 상태·재평가·waive UI. 만들지 않을 것: Closing Binder 생성(A12), 지식은행 후보(A13), 자동 아카이브 전이.

**교정(검증·비평 반영):** 교차 교정: 체결본 지정의 기계 판정 앵커로 B4(Execution Copy 라벨) 의존 추가, G1 executed 상태는 소프트 의존.

**Dependencies:** A9, B4(버전 표준 라벨 — 체결본 판정 앵커), G1(소프트: 계약 라이프사이클 executed 상태)

**Code anchors:**
- `신규: db/migrations/0104_create_matter_closing_checklists.sql`
- `신규: apps/api/src/modules/matter/matter-closing.service.ts`
- `apps/api/src/modules/matter/matter.service.ts`
- `packages/domain/src/matter/matter-transitions.ts`
- `apps/api/src/modules/records/records.service.ts`
- `db/migrations/0060_records_governance.sql`
- `db/migrations/0058_create_external_core.sql`
- `apps/web/src/app/(app)/matters/[matterId]/page.tsx`
- `tests/integration/matter-lifecycle.spec.ts`

**Acceptance tests (완료판정):**
- 자동: 신규 tests/integration/matter-closing.spec.ts — (a) active→closing 전이 시 체크리스트 자동 생성, (b) 활성 legal hold가 있는 매터의 closed 전이가 CLOSING_CHECKLIST_INCOMPLETE로 거부, (c) hold 해제+재평가 후 전이 성공, (d) waive 시 근거 필수·감사 기록, (e) 활성 외부 공유 링크 존재 시 해당 항목 pending 유지
- 자동: matter-transitions.spec.ts 확장 — 게이트 컨텍스트별 closing→closed 판정 검증
- 수동: 웹 Closing 탭에서 미통과 항목이 사유와 함께 표시되고, 전 항목 통과 후 상태 변경 버튼으로 closed 전이가 성공하며 closed_at이 채워지면 통과

**검증 노트(반영 필요 세부):**
- (앵커 부정확) 종료 체크리스트의 '체결본 지정' 항목을 기계 판정하려면 버전 표준 라벨(B4의 Execution Copy) 또는 계약 라이프사이클 executed 상태(G1)가 필요하다. deps에 B4를 추가하고 G1을 소프트 의존으로 명시하라. 현재 deps(A9)만으로는 '체결본'의 데이터 앵커가 없다.

#### A12 [M] Closing Binder 빌더 (해시 매니페스트 + records_archives 연계)

**Goal:** 종료 확정 시 체결본·최종본·핵심 이메일을 해시 포함 매니페스트로 묶은 Closing Binder가 생성되어 records 아카이브와 연계되고, 사용자는 바인더 목차를 조회·내보내기 할 수 있다.

**Scope:** 만들 것: (1) 마이그레이션 — closing_binders(matter_id, 매니페스트 JSON: 문서 버전 ID·sha256·유형 태그, 생성자, 상태 draft/finalized, RLS FORCE). (2) BinderBuilder — 체크리스트에서 지정된 체결본·official 최종 버전·이메일 타임라인 핵심 항목을 수집해 기존 문서 해시 체계(document-hash 규약)를 재사용한 매니페스트 생성, finalize 시 records.service.archiveDocument(712행) 흐름과 연계해 records_archives에 바인더 참조 기록, 전 과정 감사. (3) GET /matters/:id/closing-binder + 목차 UI(Closing 탭 확장) + JSON/CSV 매니페스트 다운로드. 만들지 않을 것: PDF 병합 패키지 생성(매니페스트+개별 다운로드로 충분), 외부 전달용 포털 공유.

**완화 노트:** 바인더는 해시 매니페스트+아카이브 연계까지. 인쇄용 통합 PDF 조판·외부 배포 자동화는 내부용 범위에서 제외.

**Dependencies:** A11

**Code anchors:**
- `신규: db/migrations/0105_create_closing_binders.sql`
- `신규: apps/api/src/modules/matter/closing-binder.service.ts`
- `apps/api/src/modules/matter/matter-closing.service.ts`
- `apps/api/src/modules/records/records.service.ts`
- `apps/api/src/modules/document`
- `apps/web/src/app/(app)/matters/[matterId]/page.tsx`
- `tests/integration/document-hash.spec.ts`
- `tests/integration/records-governance.spec.ts`

**Acceptance tests (완료판정):**
- 자동: 신규 tests/integration/closing-binder.spec.ts — (a) 체결본 2건+최종본 1건 시드 매터에서 바인더 생성 시 매니페스트 항목별 sha256이 documents 원본 해시와 일치, (b) finalize 후 매니페스트 변이 시도 시 거부(불변성), (c) records_archives에 바인더 참조 행 생성, (d) 열람권 없는 사용자 접근 403, (e) 생성·finalize 감사 이벤트 기록
- 수동: closed 매터의 Closing 탭에서 바인더 목차(문서명·버전·해시)가 표시되고 매니페스트 다운로드 파일의 해시를 로컬 sha256sum으로 대조해 일치하면 통과

#### A14 [S] LawOS canonical 반영 러너 운영화 + matter-app 연동 헬스 승격

**Goal:** LawOS canonical 매터 반영이 개발자 로컬 경로 의존 없이 파라미터화된 아티팩트 계약으로 반복 실행 가능하고, /integrations/matter-app 상태 페이지가 env 라벨 대신 실제 sync 헬스(마지막 반영 시각, drift 카운트)를 표시한다.

**Scope:** 만들 것: (1) tools/migration/lawos-canonical-matter-reflection.mjs의 하드코딩 절대경로(10-16행)·고정 revision 핀을 CLI 인자/env 계약(아티팩트 경로, 기대 revision, dry-run)으로 대체하고 검증 실패 시 명확한 종료 코드. (2) 반영 실행 결과(마지막 실행 시각, 반영 건수, drift 카운트)를 DB 상태 테이블에 기록. (3) matter-app-runtime.service의 status()를 env 라벨 계산에서 해당 상태 테이블 조회 기반 실제 헬스로 승격, /integrations/matter-app 페이지의 NEXT_PUBLIC env 표시를 API 헬스 표시로 교체. 만들지 않을 것: LawOS 외부 HTTP 실시간 API 클라이언트·웹훅 소비자(오프라인 배치 반영 유지 — Matter 생성 웹 UI가 주 생성 경로이므로 실시간 연동 불요), 재시도·서킷브레이커 인프라.

**완화 노트:** 단일 로펌·소수 인원 운영이므로 실시간 양방향 연동 대신 '파라미터화된 배치 반영 + 헬스 가시화'로 축소. 웹훅/이벤트 프로젝션은 채택하지 않음.

**Dependencies:** A3

**Code anchors:**
- `tools/migration/lawos-canonical-matter-reflection.mjs`
- `apps/api/src/modules/integrations/matter-app/matter-app-runtime.service.ts`
- `apps/web/src/app/(app)/integrations/matter-app/page.tsx`
- `apps/web/src/lib/api-client.ts`
- `신규: db/migrations/0107_create_matter_app_sync_state.sql`

**Acceptance tests (완료판정):**
- 자동: 러너 단위 테스트(tools 또는 스크립트 테스트) — (a) 아티팩트 경로 인자 누락 시 비 0 종료코드와 사용법 출력, (b) dry-run이 DB 변이 없이 diff 요약만 출력, (c) revision 불일치 아티팩트 거부
- 자동: 통합 케이스 — 러너 실행 후 sync 상태 테이블에 실행 시각·반영 건수가 기록되고 GET /integrations/matter-app/status 응답에 lastSyncAt·driftCount가 포함됨을 신규 tests/integration/matter-app-sync.spec.ts로 검증
- 수동: 샘플 아티팩트로 러너를 2회 실행(2회차 멱등 확인)하고 /integrations/matter-app 화면에 마지막 반영 시각과 drift 카운트가 표시되면 통과

**검증 노트(반영 필요 세부):**
- (앵커 부정확) 신규 마이그레이션 번호 배정이 horizon 순서와 불일치 — A14는 H2인데 0107을, A13은 H3인데 0106을 배정받아 H2 유닛이 H3 유닛보다 뒤 번호를 가짐. 실행 순서대로면 0107이 0106보다 먼저 적용되어 번호-적용 순서 역전이 생기므로 A14를 0106, A13을 0107로 교환(또는 구현 시점 재채번 원칙 명시)할 것. 나머지 anchors(tools/migration/lawos-canonical-matter-reflection.mjs, matter-app-runtime.service.ts, status.controller의 GET status)는 실존 확인됨.

### B: Document Vault & Editing

#### B5 [L] 대용량 스트리밍 처리 — 미리보기 Range 패스스루, 추출 스트리밍 계약, 업로드 한도 500MB

**Goal:** 500MB급 문서를 업로드·미리보기·추출해도 API 프로세스가 파일 전체를 메모리에 버퍼링하지 않아 OOM 없이 동작하고, 일반 업로드 기본 한도가 500MB로 상향된다.

**Scope:** 만드는 것: (1) StorageAdapter 인터페이스에 Range GET(offset/length)과 사전서명 GET URL 생성을 추가하고 자체 SigV4 s3-storage.adapter에 구현. (2) preview.service의 streamToBuffer 전체 버퍼링 제거 — 브라우저 Range 요청을 스토리지 Range로 패스스루하고 비Range 요청은 스트림 파이프. (3) extraction-dispatcher가 파일 전체를 FormData Blob으로 워커에 밀어넣는 계약을 사전서명 GET URL 전달로 변경, extract_router가 URL에서 직접 스트리밍 다운로드(기존 multipart 경로는 하위호환 유지). (4) DOCUMENT_UPLOAD_MAX_BYTES 기본값 200MB→500MB 상향(.env.example 포함), multer 디스크 경유 확인. (5) S3 put에 SSE(x-amz-server-side-encryption) 헤더 추가. 만들지 않는 것: S3 멀티파트 presigned 업로드(B7 배치 레인에서), 테넌트별 envelope 암호화 KmsEncryptionHook(완화 제외), 1GB 지원.

**완화 노트:** 사양 1GB 요구를 500MB로 완화(9인 로펌 실사용 상한). BYOK/테넌트별 암호화 키는 계획 제외 — NoopEncryptionHook 유지, S3/MinIO 서버측 암호화 헤더(SSE-S3)만 추가해 at-rest 암호화를 스토리지 기본 기능으로 충족.

**교정(검증·비평 반영):** 교차 교정: H2로 이연(하드 소비자 B7이 H2, 9인 규모에서 H1 시급성 낮음). B7 직전 배치.

**Dependencies:** 없음

**Code anchors:**
- `apps/api/src/modules/storage/storage-adapter.interface.ts`
- `apps/api/src/modules/storage/s3-storage.adapter.ts`
- `apps/api/src/modules/storage/storage.service.ts`
- `apps/api/src/modules/preview/preview.service.ts`
- `apps/api/src/modules/document/extraction/extraction-dispatcher.ts`
- `workers/ingestion/app/extract_router.py`
- `apps/api/src/modules/document/validators/file-size.validator.ts`
- `apps/api/src/modules/document/multipart.config.ts`
- `.env.example`
- `tests/integration/document-access/preview.spec.ts`

**Acceptance tests (완료판정):**
- 자동: tests/integration/document-access/preview.spec.ts 확장 — Range: bytes=0-1023 요청에 206과 정확히 1024바이트 응답, 스토리지 어댑터 spy로 전체 객체 GET이 발생하지 않음을 검증
- 자동: apps/api/src/modules/storage/s3-storage.adapter.spec.ts(신규 케이스) — Range GET SigV4 서명, 사전서명 GET URL 만료·서명 검증, put 요청에 SSE 헤더 포함
- 자동: workers/ingestion/tests/test_extract_router.py 확장 — storage_url 모드로 호출 시 워커가 URL에서 파일을 받아 기존과 동일한 추출 결과 반환
- 자동: apps/api/src/modules/document/validators/file-size.validator.spec.ts 갱신 — 기본 한도 500MB, 초과 시 거부
- 성능: 신규 tools/ 스모크 스크립트(tools/release/dms-main-loop-smoke.mjs 패턴)로 400MB 합성 PDF 업로드→미리보기 첫 바이트→추출 완료를 실행하며 API 프로세스 RSS 증가가 150MB 미만임을 process.memoryUsage 로깅으로 측정

**검증 노트(반영 필요 세부):**
- (앵커 부정확) acceptance_tests가 apps/api/src/modules/storage/s3-storage.adapter.spec.ts에 '신규 케이스'를 추가한다고 하나 해당 spec 파일이 리포지토리에 존재하지 않음(storage 모듈에는 storage.service.spec.ts, storage-rollback.spec.ts, storage-path.resolver.spec.ts만 존재). '신규: s3-storage.adapter.spec.ts'로 신규 파일임을 명시하거나 기존 storage.service.spec.ts 확장으로 변경할 것.
- (horizon 부적절) 유일한 하드 소비자 B7이 H2이고, 9인 펌에서 500MB 임계 상향의 H1 시급성이 낮다. H2로 이연해 B7 직전에 배치하라(H1 총량 완화).

#### B7 [L] 배치 업로드 파이프라인 — BulkUploadJob 큐 연결, 배치 세션 모델, ZIP 안전 해제 인제스트

**Goal:** 수백~수천 파일을 배치 세션으로 등록해 서버측 큐가 병렬 처리하며, 실패 항목 재시도·중복 일괄 결정·진행률 조회가 가능하다. ZIP 업로드 시 내부 파일이 개별 문서로 안전하게 등록된다.

**Scope:** 만드는 것: (1) bulk_upload_batches/bulk_upload_batch_items 테이블(RLS FORCE, 항목별 상태머신 pending/uploaded/failed/duplicate/done) + 매니페스트 등록·상태 조회 API. (2) 고아 코드인 BulkUploadJob을 pg-boss 큐(document.bulk-upload — bulkUploadQueueName 상수 기존재)에 실제 등록·발행·소비 연결, 동시성 워커 N개, 실패 재시도·데드레터(extraction 큐 패턴 재사용). (3) bulkUploadJobSchema items max 100 제한을 배치 세션 분할 발행으로 우회(세션당 상한 5,000). (4) 웹 업로드 패널의 클라이언트 순차 루프를 배치 세션 기반 진행률 패널(재시도·중복 일괄 결정)로 교체. (5) ZIP 업로드 허용(밸리데이터 확장자+매직바이트) + ingestion worker 안전 해제(압축비 한도, 경로 traversal 차단, 항목 수 상한)로 내부 파일을 배치 항목으로 등록하고 원본 ZIP과 부모-자식 링크 유지. 만들지 않는 것: tus 재개형 프로토콜, 10,000파일 부하 게이트(1,000파일로 완화), 폴더 트리 UI(B8).

**완화 노트:** 사양의 10,000파일 배치 목표를 9인 로펌 이관 현실에 맞춰 세션당 5,000·검증 게이트 1,000파일로 완화. S3 멀티파트 presigned 직접 업로드는 보류하고 기존 API 경유 업로드(B5 스트리밍화 전제)로 충분.

**Dependencies:** B5

**Code anchors:**
- `apps/api/src/modules/document/bulk-upload.job.ts`
- `apps/api/src/modules/document/bulk-upload.job.spec.ts`
- `apps/api/src/modules/document/document.module.ts`
- `packages/shared/src/dto/document/bulk-upload.dto.ts`
- `apps/api/src/modules/document/extraction/extraction-queue.service.ts`
- `apps/api/src/modules/document/document-upload.service.ts`
- `apps/api/src/modules/document/multipart.config.ts`
- `apps/api/src/modules/document/validators/file-extension.validator.ts`
- `apps/api/src/modules/document/validators/mime-type.validator.ts`
- `신규: db/migrations/0099_create_bulk_upload_batches.sql (번호 조정)`
- `신규: apps/api/src/modules/document/bulk-upload-batch.service.ts`
- `신규: workers/ingestion/app/zip_router.py`
- `apps/web/src/components/document/document-upload-panel.tsx`
- `apps/web/src/lib/api-client.ts`

**Acceptance tests (완료판정):**
- 자동: 신규 tests/integration/document-access/bulk-upload-batch.spec.ts — 50파일 매니페스트 등록→큐 소비→전 항목 done, 중간 1개 손상 파일은 failed로 격리되고 재시도 API로 복구, 중복 해시 항목은 duplicate 상태로 사용자 결정 대기
- 자동: 신규 workers/ingestion/tests/test_zip_router.py — 정상 ZIP은 항목 목록 반환, zip bomb(압축비 초과)과 ../ 경로 항목은 거부 코드 반환
- 자동: apps/api/src/modules/document/bulk-upload.job.spec.ts 갱신 — pg-boss send→work 소비 경로로 process가 호출됨(고아 코드 해소 증명)
- 수동: 스테이징에서 200파일 ZIP 업로드 → 진행률 패널에 항목별 상태 표시, 완료 후 /files에서 개별 문서 확인이면 통과
- 성능: 1,000파일 합성 배치(각 100KB)를 tools/ 스크립트로 등록 → 60분 내 95% 이상 done, 처리율 로그 산출

#### B8 [L] 폴더/태그 혼합 구조 + 폴더 업로드(구조 보존)

**Goal:** 매터 안에서 물리 폴더 트리와 자유 태그로 문서를 함께 조직할 수 있고, 브라우저에서 폴더째 드래그앤드롭 업로드하면 폴더 구조가 그대로 보존된다. 기존 governed folder(저장된 검색 기반)와 공존한다.

**Scope:** 만드는 것: (1) document_folders(매터 스코프 트리, parent FK, RLS FORCE) + documents.folder_id + document_tags(문서-태그 다대다) 마이그레이션. (2) 업로드 DTO에 sourceRelativePath·folderId·tags 추가, 업로드 시 상대경로로 폴더 자동 생성. (3) 웹 — 업로드 패널에 webkitdirectory 폴더 선택과 DataTransferItem.webkitGetAsEntry 드래그앤드롭, /files와 매터 문서 목록에 폴더 트리 네비게이션+태그 필터, 문서 이동/태그 편집 UI. (4) 폴더 이동·이름변경 감사 이벤트. (5) B7 배치 세션과 결합해 폴더 단위 진행률 표시. 만들지 않는 것: 폴더 단위 권한(권한은 기존 매터/문서 단위 모델 유지 — 기본 개방 모델), governed folder(0083)와의 통합 뷰(별개 탭 유지), 태그 자동 제안 AI(E 레인).

**완화 노트:** 폴더별 세분 권한은 도입하지 않음 — '펌 전원 접근, 제한 매터만 명시적 제한' 기본 개방 모델에 따라 폴더는 순수 조직화 수단.

**Dependencies:** B7

**Code anchors:**
- `신규: db/migrations/0100_create_document_folders_and_tags.sql (번호 조정)`
- `db/migrations/0083_extend_saved_searches_for_governed_folders.sql`
- `packages/shared/src/dto/document/upload-document.dto.ts`
- `apps/api/src/modules/document/document-upload.service.ts`
- `apps/api/src/modules/document/document.service.ts`
- `apps/api/src/modules/document/document.controller.ts`
- `신규: apps/api/src/modules/document/document-folder.service.ts`
- `apps/web/src/components/document/document-upload-panel.tsx`
- `apps/web/src/components/document/document-vault-list.tsx`
- `apps/web/src/components/document/matter-document-list.tsx`
- `apps/web/src/app/(app)/files/page.tsx`
- `apps/web/src/lib/api-client.ts`

**Acceptance tests (완료판정):**
- 자동: 신규 tests/integration/document-access/document-folders.spec.ts — sourceRelativePath 'a/b/c.pdf' 업로드 시 폴더 a/b 자동 생성과 문서 배치, 폴더 이동 시 감사 이벤트, 타 테넌트 폴더 접근 RLS 차단
- 자동: 동일 spec — 태그 추가/제거 API와 태그 필터 목록 조회 검증
- 자동: apps/web/src/components/document/document-upload-panel.test.tsx 확장 — 폴더 드래그앤드롭 시 파일별 상대경로가 업로드 요청에 포함
- 자동: apps/web/src/components/document/document-vault-list.test.tsx 확장 — 폴더 트리 렌더·폴더 클릭 시 필터 적용
- 수동: 스테이징에서 3계층 로컬 폴더를 드래그앤드롭 → /files 트리에 동일 구조 표시, 태그 2개 부여 후 태그 필터 검색 확인이면 통과

#### B9 [M] HWP 바이너리 추출 레인 — .hwp 텍스트 추출·검색 편입

**Goal:** 한국 로펌 실무 문서의 핵심인 바이너리 .hwp 파일이 UNSUPPORTED_HWP_BINARY 즉시 실패 대신 텍스트 추출되어 검색·AI·비교 대상이 된다.

**Scope:** 만드는 것: (1) ingestion worker에 pyhwp(hwp5txt) 기반 .hwp 파서 추가 — extract_router의 OLE 매직바이트 즉시 거부를 hwp 파서 라우팅으로 교체, 추출 실패 시 hwp_conversion_pending 상태(ocr_pending 패턴 복제)로 격리해 재시도 큐 처리. (2) extraction_method enum에 hwp5 추가, extraction-dispatcher의 상태 처리 확장. (3) 암호화/DRM hwp는 명시적 실패 코드로 구분. (4) 미리보기 — hwp→hwpx/PDF 변환 필터 가용 시 convert_router에 연결(가용성 조사 포함, 불가 시 '미리보기 불가' 유지). 만들지 않는 것: HWP 네이티브 편집·한컴 SDK 연동(로컬 앱 핸드오프는 B12), hwp 내 표/이미지 구조 보존.

**교정(검증·비평 반영):** 교차 교정: H 워크스트림의 H10(HWP 파싱)과 완전 중복 — H10 삭제, .hwp 파싱 소유권은 이 유닛(B9)으로 일원화(ingestion 워커 파서 구현 세부 흡수).

**Dependencies:** B2

**Code anchors:**
- `workers/ingestion/app/extract_router.py`
- `workers/ingestion/app/parsers/hwpx.py`
- `workers/ingestion/app/parsers/types.py`
- `workers/ingestion/pyproject.toml`
- `신규: workers/ingestion/app/parsers/hwp_binary.py`
- `apps/api/src/modules/document/extraction/extraction-dispatcher.ts`
- `apps/api/src/modules/document/extraction/extraction.types.ts`
- `tests/integration/document-access/extraction.spec.ts`

**Acceptance tests (완료판정):**
- 자동: workers/ingestion/tests/test_extract_router.py 확장 — 실제 .hwp fixture(한국어 본문 포함)에 status='ready', extraction_method='hwp5', 기대 한국어 문구 포함 검증; 손상 hwp는 hwp_conversion_pending 또는 명시 실패 코드
- 자동: tests/integration/document-access/extraction.spec.ts 확장 — .hwp 업로드 → canonical_documents ready 전이 → 검색 인덱스 동기화 E2E
- 수동: 스테이징에서 법원 제출 서면 .hwp 업로드 → /search 본문 키워드 히트 확인이면 통과

#### B10 [L] 실제 DOCX Track Changes(w:ins/w:del) 파싱 + PDF 주석 추출

**Goal:** Word 변경추적(삽입/삭제/이동, 작성자·일시)과 PDF 주석(하이라이트·노트·프리텍스트)이 구조화 추출·저장되어 문서 상세와 검토본 리뷰 화면에서 마크업 히스토리를 볼 수 있다. 합성 마커 regex 의존이 제거된다.

**Scope:** 만드는 것: (1) ingestion worker에 /extract-revisions 엔드포인트 — python-docx 하위 lxml 직접 순회로 w:ins/w:del/w:delText/w:moveFrom/w:moveTo/w:rPrChange를 author/date/변경 전후 텍스트와 함께 구조화 추출(docx.py의 w:t 단독 순회가 삭제 리비전을 무음 소실하는 결함도 함께 수정). (2) pymupdf 기반 /extract-annotations — PDF /Annots 순회로 타입·페이지·좌표·작성자·내용 추출. (3) document_revisions/document_annotations 테이블(RLS FORCE, 기존 마이그레이션 컨벤션) + extraction-dispatcher에 리비전 레인 추가, contract_redline_changes 소비처는 실 리비전 데이터로 전환. (4) binary_roundtrip 검토본(subversion) 저장 시 base version 대비 Track Changes 자동 추출 → 리뷰 게이트 화면에 변경 목록 표시. 만들지 않는 것: 조항 단위 정렬·비교(B11), 법률 의미 요약(B13), 주석 diff 시각화 고도화.

**Dependencies:** B2

**Code anchors:**
- `workers/ingestion/app/parsers/docx.py`
- `workers/ingestion/app/extract_router.py`
- `workers/ingestion/pyproject.toml`
- `신규: workers/ingestion/app/parsers/docx_revisions.py`
- `신규: workers/ingestion/app/parsers/pdf_annotations.py`
- `apps/api/src/modules/contract-intel/contract-parser.ts`
- `db/migrations/0054_create_contract_intelligence.sql`
- `신규: db/migrations/0101_create_document_revisions_annotations.sql (번호 조정)`
- `apps/api/src/modules/document/extraction/extraction-dispatcher.ts`
- `apps/api/src/modules/document/document-editing.service.ts`
- `apps/web/src/components/document/document-action-center.tsx`

**Acceptance tests (완료판정):**
- 자동: 신규 workers/ingestion/tests/test_docx_revisions.py — Word에서 실제 변경추적 저장한 fixture(삽입·삭제·서식변경 각 1건 이상)에서 author/date/change_type/전후 텍스트가 정확히 추출되고, 삭제 리비전 텍스트(w:delText)가 소실되지 않음을 검증
- 자동: 신규 workers/ingestion/tests/test_pdf_annotations.py — 하이라이트·스티키노트·프리텍스트 포함 PDF fixture에서 타입·페이지·작성자·내용 추출
- 자동: 신규 tests/integration/document-access/document-revisions.spec.ts — 변경추적 docx를 subversion으로 저장 → document_revisions 행 생성, 리뷰 조회 API에 변경 목록 포함, 타 테넌트 RLS 차단
- 수동: 스테이징에서 상대방 마크업 docx 검토본 업로드 → 리뷰 화면에 '삽입 3/삭제 2, 작성자 표시' 목록이 보이면 통과

#### B11 [L] 문서 비교 1단계 — 버전 쌍 조항 단위 기계적 diff + 비교 UI

**Goal:** 두 버전(또는 subversion↔공식버전)을 선택하면 조항 단위로 추가·삭제·수정이 정렬된 비교 결과를 화면에서 볼 수 있다. 100페이지 Word 비교가 30초 이내에 완료된다.

**Scope:** 만드는 것: (1) ingestion worker에 DOCX→정규화 조항 트리 추출 엔드포인트(contract-parser의 조항 경계 로직을 워커로 이관·강화, 한국어 조항 번호 체계 '제N조/N./가.' 지원). (2) document_version_comparisons/comparison_clause_changes 테이블 + POST /documents/{id}/comparisons API를 pg-boss 비동기 잡으로 구현 — 조항 정렬은 헤딩 정규화 해시 매칭+텍스트 유사도, 조항 내 LCS diff. (3) 비교 결과 화면 — document-action-center에 비교 탭(버전 쌍 선택, 조항별 side-by-side, B10 리비전 데이터 연계 markup 표시, B4 clean/markup 라벨 연동), 삭제 조항은 base 버전 원문 오프셋 참조로 복원 표시. (4) subversion↔공식버전 비교를 기본 진입점으로 연결. 만들지 않는 것: AI 법률 의미 요약·유불리 분류·이메일 초안(B13), PDF↔DOCX 교차 비교, 임베딩 기반 조항 정렬(D 워크스트림 임베딩 가용 시 개선).

**Dependencies:** B4, B10

**Code anchors:**
- `apps/api/src/modules/contract-intel/contract-parser.ts`
- `apps/api/src/modules/contract-intel/contract-intel.service.ts`
- `workers/ingestion/app/parsers/contract.py`
- `workers/ingestion/app/extract_router.py`
- `신규: workers/ingestion/app/parsers/clause_tree.py`
- `신규: db/migrations/0102_create_document_version_comparisons.sql (번호 조정)`
- `신규: apps/api/src/modules/document/comparison/document-comparison.service.ts`
- `신규: apps/api/src/modules/document/comparison/document-comparison.controller.ts`
- `apps/api/src/modules/document/extraction/extraction-queue.service.ts`
- `apps/web/src/components/document/document-action-center.tsx`
- `apps/web/src/lib/api-client.ts`

**Acceptance tests (완료판정):**
- 자동: 신규 workers/ingestion/tests/test_clause_tree.py — '제1조~제10조' 한국어 계약 fixture에서 조항 트리(번호·제목·본문 경계)가 정확히 추출
- 자동: 신규 tests/integration/document-access/document-comparison.spec.ts — v1/v2 docx 업로드 후 비교 생성 → 수정 1·추가 1·삭제 1 조항이 정확히 분류되고 삭제 조항 원문이 복원 조회됨, 권한 없는 사용자는 403
- 자동: apps/web/src/components/document/document-action-center.test.tsx 확장 — 비교 탭에서 버전 쌍 선택→조항 diff 렌더링
- 성능: 100페이지 Word 합성 계약 두 버전 비교가 30초 이내 완료 — document-comparison.spec.ts에서 생성→completed 폴링 시간 측정
- 수동: 스테이징에서 검토본과 현재 공식버전 비교 실행 → 조항별 변경 목록 화면 확인이면 통과

#### B12 [L] Office/한컴 네이티브 편집 1단계 — 데스크톱 로컬 앱 핸드오프 + WOPI 평가 ADR

**Goal:** 데스크톱(Tauri) 클라이언트에서 '편집' 클릭 한 번으로 문서가 로컬 Word/한컴오피스에서 열리고, 저장하면 자동으로 검토본(subversion)으로 재업로드된다 — 수동 다운로드-업로드 순환이 사라진다. WOPI 도입 여부는 평가 문서로 결정된다.

**Scope:** 만드는 것: (1) apps/desktop(Tauri thin shell)에 편집 브리지 — checkout API 호출(B6 잠금 토큰 사용)→편집 패키지 다운로드→로컬 임시 폴더 저장→기본 연결 앱(Word/한컴) 실행→파일 변경 감시(watcher)→저장 감지 시 saveSubversion 자동 호출(clientSaveId 멱등키 재사용)→종료 시 check-in/cancel 선택. 세션 heartbeat 유지. (2) 웹 문서 상세에 '데스크톱에서 편집' 딥링크(프로토콜 URL) 노출, 데스크톱 미설치 시 기존 binary_roundtrip 안내 유지. (3) ADR-016 개정 — read/download-only 결정을 로컬 핸드오프 승인으로 갱신, WOPI(자체 호스팅 Collabora/OnlyOffice vs M365 CSPP) 평가 결과와 go/no-go 기준을 ADR-017 계열 신규 ADR로 문서화(런타임 구현 없음). 만들지 않는 것: WOPI 호스트 엔드포인트·브라우저 내 편집·co-authoring(평가 결과에 따라 후속), Vault 텍스트 편집기(textarea) 보강 — 리소스를 핸드오프에 집중.

**완화 노트:** co-authoring/실시간 공동편집은 9인 규모에서 체크아웃 잠금 모델로 충분하므로 구현하지 않고 WOPI 평가 ADR의 장기 옵션으로만 기록. check-production-ui-smoke.mjs의 'co-authoring 클레임 금지' 게이트는 유지.

**Dependencies:** B6

**Code anchors:**
- `apps/desktop/src-tauri`
- `apps/desktop/package.json`
- `apps/api/src/modules/document/document-editing.service.ts`
- `apps/api/src/modules/document/document-editing.controller.ts`
- `packages/shared/src/dto/document/document-editing.dto.ts`
- `apps/web/src/components/document/document-action-center.tsx`
- `apps/web/src/lib/api-client.ts`
- `docs/adr/ADR-016-document-editing-and-office-flow.md`
- `docs/adr/ADR-017-office-onedrive-flow.md`
- `tools/release/check-desktop-capabilities.mjs`
- `tools/release/check-production-ui-smoke.mjs`
- `tests/integration/document-access/desktop-document-cache.spec.ts`
- `신규: docs/adr/ADR-018-wopi-evaluation.md`

**Acceptance tests (완료판정):**
- 자동: tests/integration/document-access/document-editing-lifecycle.spec.ts 확장 — 데스크톱 클라이언트 플로우를 API 레벨로 재현: 토큰 포함 checkout→패키지 다운로드→동일 clientSaveId 2회 save(멱등)→check-in이 전 구간 성공하고 감사 이벤트 체인 기록
- 자동: apps/desktop/tests에 브리지 단위 테스트 — 파일 변경 감시가 저장 이벤트를 디바운스해 saveSubversion 1회 호출로 수렴, 네트워크 실패 시 재시도 후 사용자 알림 상태 전이
- 수동: 데스크톱 앱에서 docx '편집' 클릭 → Word 자동 실행 → 본문 수정·저장 → 웹 문서 상세 검토본 목록에 새 subversion 자동 등장 → check-in까지 완료되면 통과 (한컴 hwp 동일 절차 1회)
- 수동: ADR-018이 Collabora/OnlyOffice/CSPP 비교표·비용·go/no-go 기준을 포함하고 리뷰 승인(PR approve)되면 통과

### C: Email Vault

#### C8 [S] 이메일-문서 링크 API 노출 + 원문 .eml 통제 다운로드

**Goal:** 문서 상세에서 원문 이메일로, 이메일에서 분리된 첨부 문서로 양방향 직접 탐색이 가능하고, 원문 .eml을 감사 추적 하에 다운로드할 수 있다.

**Scope:** 이미 완성된 서비스 메서드 2개(listDocumentLinksForEmail/listEmailLinksForDocument)를 GET /emails/:id/document-links, GET /documents/:id/email-links 라우트로 노출. 문서 상세의 '관련 이메일' 섹션을 Matter 전체 타임라인 클라이언트 필터 방식에서 직접 조회로 교체. GET /emails/:id/raw 원문 다운로드 엔드포인트 추가 — 기존 문서 다운로드 패턴(감사이벤트+사유코드) 재사용, 감사 액션 CHECK 확장 마이그레이션 포함. 새 링크 생성/편집 UI는 범위 외.

**Dependencies:** C3

**Code anchors:**
- `apps/api/src/modules/email/email.service.ts (미노출 메서드 939-989행)`
- `apps/api/src/modules/email/email.controller.ts (라우트 4개 26-31, 75-124행)`
- `apps/web/src/components/document/document-action-center.tsx (클라이언트 필터 우회 1799-1801행)`
- `apps/web/src/lib/api-client.ts`
- `tests/integration/document-access/email-filing.spec.ts`
- `신규: db/migrations/01xx_email_raw_download_audit_action.sql`

**Acceptance tests (완료판정):**
- tests/integration/document-access/email-filing.spec.ts 확장: (1) GET /documents/:id/email-links가 링크된 이메일만 반환, (2) 읽기 권한 없는 사용자·cross-tenant 요청 403/차단, (3) GET /emails/:id/raw 다운로드 시 원문 바이트 sha256 일치 + 감사이벤트(액션·사유코드) 기록 assert
- apps/web/src/components/document/document-action-center.test.tsx에 관련 이메일 섹션이 직접 조회 API를 호출하고 타임라인 전체 fetch를 하지 않음을 mock 검증
- 수동: 이메일 첨부로 생성된 문서 상세→관련 이메일 클릭→원문 다운로드 후 Outlook에서 열림 확인, audit 콘솔에서 다운로드 이벤트 확인

#### C9 [M] 참여자 3분류(내부/고객/상대방) + 테넌트 도메인 서버측 설정

**Goal:** 이메일 참여자가 내부자/고객/상대방/기타외부로 자동 분류되어 타임라인에 표시되고, 분류가 추천 신뢰도(C13)와 송신 경고(C14)의 신호로 쓰일 수 있다.

**Scope:** (1) tenantDomains를 업로드 요청 필드 의존에서 서버측 테넌트 이메일 도메인 설정(신규 마이그레이션: tenant_email_domains 테이블, RLS 적용)으로 이전 — 미설정 시 전원 내부자로 오판되는 현행 버그 제거. (2) email_participants에 participant_class 컬럼 추가(CHECK: internal|client|opposing|other_external). (3) 분류기 구현: 테넌트 도메인→internal, 파일링 대상 Matter의 client 도메인/연락처 일치→client, parties 택소노미(0020-0022) 상대방 당사자 주소·도메인 일치→opposing, 그 외→other_external. 임포트 시 1차 분류, 파일링 시(Matter 확정 시점) 재분류. (4) 타임라인 UI에 분류 배지 표시. 신호 소비(추천 가중치·특권 경고)는 C13/C14에서.

**Dependencies:** C3

**Code anchors:**
- `packages/shared/src/email/email-metadata.ts (isOutside 이진 판정 94행)`
- `apps/api/src/modules/email/email.service.ts (fields.tenantDomains ?? [] 413행)`
- `db/migrations/0020_create_parties.sql`
- `db/migrations/0021_party_taxonomy_check.sql`
- `db/migrations/0041_email_metadata_normalization.sql (email_participants 스키마)`
- `apps/api/src/modules/party (party 조회 재사용)`
- `apps/web/src/components/matter/matter-email-timeline.tsx`
- `신규: db/migrations/01xx_participant_class_and_tenant_email_domains.sql`
- `신규: apps/api/src/modules/email/participant-classifier.ts`
- `신규: apps/api/src/modules/email/participant-classifier.spec.ts`

**Acceptance tests (완료판정):**
- participant-classifier.spec.ts: 테넌트 도메인 일치→internal, client 연락처 일치→client, opposing party 도메인 일치→opposing, 무일치→other_external, 도메인 미설정 시에도 internal 오판 없이 other_external 처리 — 5케이스 assert
- tests/integration/document-access/email-filing.spec.ts 확장: parties에 고객·상대방을 시딩한 Matter로 이메일 파일링 시 email_participants.participant_class가 기대값으로 저장되고, tenantDomains 요청 필드 없이도 서버 설정 기반으로 internal 분류됨을 assert
- matter-email-timeline.test.tsx에 분류 배지(고객/상대방/내부) 렌더 검증 추가
- 수동: 관리자 화면 또는 시드 스크립트로 펌 도메인 등록 후 실제 메일 파일링→타임라인에서 상대방 수신자에 '상대방' 배지 표시 확인

#### C10 [M] 인제스천 워커 이메일 파싱 파이프라인 활성화 + 재파싱 배치

**Goal:** 데드코드였던 Python 워커 이메일 파서가 실제 파이프라인에 연결되어, 저장된 원문을 파서 버전 기준으로 일괄 재파싱(C1 이전의 깨진 제목 레코드 복구 포함)할 수 있고 MSG 파싱(C11)의 진입점이 마련된다.

**Scope:** (1) workers/ingestion에 /email/parse 라우터 신설 — 기존 parse_eml_envelope(policy.default 기반, 이미 올바른 디코딩) 활성화, 응답으로 정규화 메타데이터·참여자·첨부 목록 반환. (2) email_messages에 parser_version 컬럼 추가(신규 마이그레이션). (3) API에 pg-boss 기반 재파싱 배치 잡 추가: 대상(구 parser_version 또는 parse_status='pending_unsupported') 레코드의 원문을 스토리지에서 읽어 워커에 위임하고 메타데이터·참여자를 갱신(첨부 재분리는 중복 문서 방지를 위해 미수행 레코드에 한정). 동기 임포트 경로는 유지 — 전면 비동기 전환·PST 벌크 임포터는 범위 외.

**완화 노트:** 사양서 §9의 수천만 건 규모·PST 벌크 마이그레이션은 9인 펌 현실에 맞게 제외. 동기 임포트 유지 + 재파싱 배치만 도입.

**교정(검증·비평 반영):** 교차 교정: 정본 파서 단일 지정(권장: 워커 파서로 일원화, API측은 얇은 위임) + C1/C2 수정사항의 정본 파서 반영을 회귀 테스트로 입증하는 완료판정 추가 — 이중 유지보수 방지.

**Dependencies:** C1

**Code anchors:**
- `workers/ingestion/app/main.py (convert/extract 라우터만 등록 6-11행)`
- `workers/ingestion/app/parsers/email.py (parse_eml_envelope 122-149행)`
- `workers/ingestion/app/convert_router.py (라우터 패턴 재사용)`
- `workers/ingestion/pyproject.toml`
- `apps/api/src/modules/email/email.service.ts`
- `apps/api/src/modules/document/extraction/extraction-queue.service.ts (배치 잡 패턴 재사용)`
- `신규: workers/ingestion/app/email_router.py`
- `신규: workers/ingestion/tests/test_email_router.py`
- `신규: apps/api/src/modules/email/email-reparse.service.ts`
- `신규: db/migrations/01xx_email_parser_version.sql`

**Acceptance tests (완료판정):**
- workers/ingestion/tests/test_email_router.py(pytest): EUC-KR 제목 EML POST 시 디코딩된 메타데이터 JSON 반환, 손상 EML 시 구조화 오류 응답 — 기존 워커 테스트 패턴 준수
- 신규 tests/integration/document-access/email-reparse.spec.ts: 구 버전 parser_version으로 시딩된 깨진 제목 레코드에 재파싱 배치 실행 → subject가 한글 원문으로 갱신되고 parser_version이 승격됨을 실DB assert
- email-reparse.service.spec.ts: 재파싱이 message_id_hash·email_document_links를 변경하지 않음(불변 필드 보호) 단위 검증
- 수동: C1 배포 이전에 업로드된 깨진 제목 이메일 1건을 지정 재파싱 후 타임라인 제목이 복구되면 통과

**검증 노트(반영 필요 세부):**
- (과대·과소 scope) C1/C2(API측 파서 수정)와 Python 워커 파서 활성화가 같은 EML 파싱 능력의 이중 구현이 될 위험. C10 완료판정에 '정본 파서 단일 지정(권장: 워커 파서로 일원화, API측은 얇은 위임)'과 'C1/C2 수정사항이 정본 파서에 반영됨을 회귀 테스트로 입증'을 명시하라. 그렇지 않으면 RFC2047/중첩 MIME 수정을 두 언어 코드베이스에서 이중 유지보수하게 된다.

#### C11 [M] MSG 파싱 — extract-msg 기반 메타데이터·RTF 본문·첨부 추출

**Goal:** 한국 로펌 환경에서 지배적인 Outlook .msg 반출 파일이 EML과 동일하게 메타데이터·참여자·첨부·쓰레드 정보를 갖고 저장되어 검색·추천·타임라인에 편입된다.

**Scope:** workers/ingestion에 extract-msg(+RTF 본문 디코딩용 RTFDE) 의존성 추가, parse_msg_skeleton을 실구현으로 교체: 제목·참여자·날짜·message-id·references 추출, RTF/HTML/plain 본문 디코딩(CP949 포함), 첨부 추출과 내장 .msg 재귀 처리(1단계 재귀는 .msg를 .eml 아닌 원파일 첨부로 분리). API의 .msg 분기를 pending_unsupported 고정에서 워커 /email/parse 위임으로 교체하고, 기존 pending_unsupported 레코드를 C10 재파싱 배치로 소급 처리. C3의 'MSG 파싱 대기' 배지가 정상 파싱 상태로 전환되도록 상태 매핑 갱신.

**Dependencies:** C10, C3

**Code anchors:**
- `workers/ingestion/app/parsers/email.py (parse_msg_skeleton 152-158행 교체)`
- `workers/ingestion/pyproject.toml (dependencies에 extract-msg 추가)`
- `workers/ingestion/app/email_router.py (C10 신설 라우터 확장)`
- `apps/api/src/modules/email/email.service.ts (msg→pending_unsupported 분기 575-585행)`
- `apps/api/src/modules/email/email-reparse.service.ts (C10 산출물 재사용)`
- `packages/shared/src/email/email-types.ts (parse_status 매핑)`
- `신규: workers/ingestion/tests/test_msg_parser.py`

**Acceptance tests (완료판정):**
- workers/ingestion/tests/test_msg_parser.py(pytest): 한국어 제목·CP949 RTF 본문·PDF 첨부·내장 msg를 가진 .msg 픽스처 4종에 대해 제목/본문/첨부 개수/message-id 추출값 assert
- tests/integration/document-access/email-filing.spec.ts 확장: .msg 업로드 시 parse_status='parsed'로 저장되고 참여자·첨부 문서가 EML과 동일 구조로 생성됨을 assert (워커는 테스트 픽스처 응답 mock 또는 실워커 기동 — 기존 extraction 통합테스트 방식 준수)
- tests/integration/document-access/email-reparse.spec.ts 확장: pending_unsupported 시딩 레코드가 재파싱 배치 후 parsed로 전환됨을 assert
- 수동: 실제 Outlook에서 '다른 이름으로 저장'한 한국어 .msg를 웹 업로드→타임라인에 제목·첨부 정상 표시되면 통과

#### C12 [L] 이메일 쓰레드 모델·쓰레드 뷰 UI·쓰레드 단위 파일링

**Goal:** 같은 대화의 이메일이 쓰레드로 묶여 아코디언 타임라인으로 표시되고, 쓰레드 전체를 한 번에 Matter에 파일링할 수 있으며, 쓰레드 연속성 신호가 자동추천(C13)에 공급된다.

**Scope:** (1) 신규 마이그레이션: email_threads 테이블 + email_messages.thread_id — References/In-Reply-To 해시와 Outlook conversationIdHash 기준. (2) 임포트 시 쓰레드 배정: 참조 해시 유니온파인드 병합(브리지 메시지로 두 쓰레드가 합쳐지는 케이스 포함), 기존 레코드 backfill. (3) Matter 타임라인 API를 쓰레드 그루핑 응답으로 확장(기존 thread_related_count 요약 대체). (4) 웹 타임라인을 쓰레드 아코디언으로 재구성. (5) POST /email-threads/:id/file 쓰레드 일괄 파일링 엔드포인트(권한·ethical wall 검사는 기존 filing 경로 재사용). 새 회신의 자동 파일링 실행은 범위 외(C13의 auto_file 밴드에서).

**Dependencies:** C3, C1

**Code anchors:**
- `apps/api/src/modules/email/email.service.ts (threadSummary 281-289행, 필링 목록 쿼리 869-936행)`
- `apps/api/src/modules/email/email.controller.ts`
- `packages/shared/src/email/email-types.ts (쓰레드 DTO 추가)`
- `apps/web/src/components/matter/matter-email-timeline.tsx ('관련 이메일 N건' 27-29행 대체)`
- `apps/web/src/lib/api-client.ts`
- `db/migrations/0040_create_email_messages.sql (참조 스키마)`
- `신규: db/migrations/01xx_create_email_threads.sql`
- `신규: apps/api/src/modules/email/email-thread.service.ts`
- `신규: apps/api/src/modules/email/email-thread.service.spec.ts`

**Acceptance tests (완료판정):**
- email-thread.service.spec.ts: (1) 3통 회신 체인이 동일 thread_id 배정, (2) 브리지 메시지 임포트 시 두 쓰레드 병합, (3) 참조 없는 단독 메일은 단독 쓰레드, (4) conversationIdHash만 있는 Outlook 유래 메일 병합 — 4케이스 assert
- 신규 tests/integration/document-access/email-threads.spec.ts: 회신 체인 EML 3통 순차 업로드 후 타임라인 API가 1개 쓰레드 그룹(3건)을 반환, POST /email-threads/:id/file로 3건 모두 email_matter_filings 생성 + 권한 없는 사용자 403 assert
- matter-email-timeline.test.tsx: 쓰레드 아코디언 렌더(접힘/펼침, 건수 표기)와 쓰레드 일괄 파일링 버튼 호출 mock 검증
- 수동: 실제 회신 3통을 순서 섞어 업로드해도 하나의 쓰레드로 묶여 표시되고 쓰레드 단위 파일링이 타임라인에 반영되면 통과

#### C13 [L] Matter 자동추천 신뢰도 4단계 실스코어링 + 밴드별 UX

**Goal:** 이메일 파일링 추천이 고정 70/30 점수 대신 참여자·도메인·쓰레드·본문 신호 기반 0~100 신뢰도와 4단계 밴드(자동저장/확인/후보/수동)로 산출되어, 95%+ 메일은 자동 파일링(감사+되돌리기 포함)되고 나머지는 밴드별 UX로 처리된다.

**Scope:** (1) 스코어러 구현 — 신호: 같은 쓰레드 기파일링 Matter(C12, 최강), 발신자 주소해시별 과거 파일링 분포, 참여자 participant_class·party 매칭(C9), 도메인 일치, 제목·본문 토큰의 매터코드/명 매칭(C1 디코딩 전제). 가중 합+로지스틱 캘리브레이션으로 0~100 산출. (2) packages/shared email-types에 confidence·confidenceBand('auto_file'|'confirm'|'candidate'|'manual') 추가, suggestMattersForEmail 교체 및 add-in용 search.service suggestMatters에도 해시 제약 내 신호(쓰레드·도메인·발신자 이력)로 밴드 부여. (3) auto_file 밴드: 파일링 자동 생성 + 감사이벤트(액션 CHECK 확장) + notifications 모듈 알림 + 웹 되돌리기(파일링 해제) UI. (4) confirm/candidate/manual 밴드별 웹 업로드 플로우·add-in UX 분기. (5) 사용자 수정(추천 거부/변경)을 피드백 테이블(신규 마이그레이션)에 적재.

**완화 노트:** ML 학습 파이프라인 없이 가중치 상수+로지스틱 캘리브레이션으로 구현하고, 피드백 테이블 기반 재보정은 주기 수동 작업으로 축소. Outlook 폴더매핑 autofile 실행엔진(outlook_autofile_jobs 소비자)은 별도 구축하지 않고 신뢰도 밴드 자동파일링으로 대체 — 기존 recordAutofileJob API는 유지.

**Dependencies:** C9, C12, C3

**Code anchors:**
- `apps/api/src/modules/email/email.service.ts (suggestMattersForEmail 809-848행)`
- `apps/api/src/modules/search/search.service.ts (suggestMatters 344행, buildMatterSuggestionQuery 746-825행)`
- `packages/shared/src/email/email-types.ts`
- `apps/web/src/components/matter/email-upload-card.tsx (C3 산출물)`
- `apps/web/src/app/outlook-addin/outlook-addin-client.tsx`
- `apps/api/src/modules/notifications`
- `신규: apps/api/src/modules/email/matter-suggestion-scorer.ts`
- `신규: apps/api/src/modules/email/matter-suggestion-scorer.spec.ts`
- `신규: db/migrations/01xx_email_suggestion_feedback_and_autofile_audit.sql`

**Acceptance tests (완료판정):**
- matter-suggestion-scorer.spec.ts: 신호 조합별 밴드 판정 표 검증 — 쓰레드 기파일링 단독→auto_file, 발신자 이력+도메인→confirm, 도메인 단독→candidate, 무신호→manual, 상반 신호(상대방 도메인이 다른 Matter 지시) 시 감점 — 최소 8케이스 assert
- 신규 tests/integration/document-access/email-suggestion.spec.ts: 기파일링 쓰레드에 새 회신 업로드 시 auto_file 밴드로 자동 파일링 생성+감사이벤트+알림 레코드 생성, 되돌리기 API 호출 시 파일링 해제·피드백 적재를 실DB assert
- email-upload-card.test.tsx 확장: 밴드별 UI 분기(자동저장 배너+되돌리기 / 확인 버튼 / 후보 리스트 / 수동) 렌더 검증
- 정확도 기준: 시드 평가셋(과거 파일링 이력 기반 라벨 50건 이상, tests/integration/helpers에 픽스처) 대해 auto_file 밴드 오파일링률 0%·confirm 이상 밴드 top-1 적중률 80% 이상을 email-suggestion.spec.ts 내 평가 케이스로 측정

**검증 노트(반영 필요 세부):**
- (과대·과소 scope) M 배정이나 실제 범위는 L 의심: 신규 스코어러+8케이스 단위검증, 자동파일링+감사이벤트+알림+되돌리기 API+피드백 적재(신규 마이그레이션), 웹 email-upload-card와 Outlook add-in 두 클라이언트의 밴드별 UX 분기, 그리고 라벨 50건 이상 평가셋 구축과 정확도 게이트(오파일링률 0%, top-1 80%)까지 포함한다. L로 상향하거나 2분할(스코어링+밴드 UX = M / 자동파일링·되돌리기·알림·평가셋 = M)하라. 또한 평가셋 라벨 출처 '과거 파일링 이력 기반'은 신규 시스템 특성상 존재하지 않을 수 있으므로 tests/integration/helpers의 합성 라벨 픽스처임을 명시해 판정 기준의 데이터 전제를 제거하라.

#### C15 [S] Outlook add-in 전 인원 링 승격 + 운영 게이트 완결

**Goal:** C7 파일럿(R0) 검증 결과를 반영해 전 구성원에게 add-in 배포 링을 승격하고 운영 게이트 증거를 완결한다.

**Scope:** 만들 것: 파일럿 피드백 반영(파일링 UX·오류 메시지), M365 조직 전체 배포(관리자 중앙 배포), 기능 플래그 전면 활성, 운영 증거(EV-OUTLOOK 계열) 갱신 및 운영 게이트 체크 통과. 만들지 않을 것: 신규 기능 — 배포·증거 유닛.

**완화 노트:** C7 분할로 신설(교차 비평 반영). 9명 전원 배포는 파일럿 검증 후에만.

**Dependencies:** C7

**Code anchors:**
- `tools/release/check-outlook-operational.ts`
- `tools/release/check-outlook-deployment.mjs`
- `apps/web/public/outlook-addin/manifest.xml`
- `docs/integrations`

**Acceptance tests (완료판정):**
- 자동: node --experimental-strip-types tools/release/check-outlook-operational.ts 통과(파일럿 한정 예외 제거 상태)
- 수동: 전 구성원 계정 2개 이상에서 Outlook add-in 로드→이메일 파일링→/matters 타임라인 표시 확인
- 수동: 배포 증거 문서에 조직 배포 스크린샷·게이트 결과 링크가 갱신되면 통과

### D: Search & Retrieval

#### D5 [M] 검색결과 표시 필드 보강 (작성자·권한상태·AI가능·버전 내비게이션)

**Goal:** 검색 결과 카드에서 작성자, 권한상태(비밀등급/privilege/legal hold 배지), AI 요약 가능 여부, 이전/다음 버전 이동을 바로 확인·조작할 수 있어 결과 카드만으로 문서 맥락 판단이 가능하다.

**Scope:** (1) search-index.repository.ts upsertVersion에서 created_by(작성자), ai_allowed, 이전/다음 version_id를 비정규화 저장(이미 documents/document_versions 조인하므로 저비용) — 인덱스 컬럼 추가 마이그레이션 포함. (2) SearchResultDto(search-query.dto.ts:163-179) 확장: author, permissionBadges(confidentiality/privilege/legalHold), aiAllowed, prevVersionId/nextVersionId, score 노출. (3) result-card.tsx에 작성자·권한 배지·AI 배지·버전 내비 링크 렌더. 관련 조항/쟁점 표시는 D11 이후로 제외.

**Dependencies:** 없음

**Code anchors:**
- `apps/api/src/modules/search/index/search-index.repository.ts`
- `apps/api/src/modules/search/query/search-query.builder.ts`
- `packages/shared/src/search/search-query.dto.ts`
- `apps/web/src/components/search/result-card.tsx`
- `신규: db/migrations/0100_search_index_display_fields.sql`

**Acceptance tests (완료판정):**
- packages/shared/src/search/search-query.dto.spec.ts: 확장 DTO 스키마 파싱/기본값 검증
- apps/web/src/components/search/result-card.test.tsx: 작성자·privilege 배지·legal hold 배지·AI 가능 배지·버전 링크 렌더 단언
- tests/integration/search-permission/search-core.spec.ts에 케이스 추가: 검색 응답에 author/aiAllowed/prevVersionId가 실제 문서 메타데이터와 일치함을 단언
- 수동: /search 결과 카드에서 '이전 버전' 링크 클릭 → 해당 superseded 버전 문서 상세로 이동하면 통과

#### D6 [M] 인덱스 1MB 절단 해소 — 청크 단위 FTS 전환

**Goal:** 수백 페이지 계약서·실사보고서의 후반부 조항도 전문검색에 히트한다. 1MB 절단으로 조용히 검색에서 누락되던 대형 문서 후반부 문제가 사라진다.

**Scope:** (1) document_chunks에 D1에서 선택한 한국어 매칭 인덱스(bigram GIN 등) 추가 마이그레이션 — 청크는 이미 전문이 저장되므로 크기 제한 없음. (2) 본문 검색 경로를 document_search_index.content_tsv 단독에서 청크 히트 조인으로 전환하고 스니펫을 히트 청크에서 생성(snippet-builder.ts 재사용). (3) 전환 안전망: content_text 절단 발생 시 truncated 플래그 컬럼 기록 + 검색 결과에 '부분 인덱스' 배지. document_search_index 테이블 자체 제거는 하지 않는다(제목/메타 검색 유지).

**Dependencies:** D1

**Code anchors:**
- `apps/api/src/modules/search/index/search-index.repository.ts`
- `apps/api/src/modules/search/query/search-query.builder.ts`
- `apps/api/src/modules/search/query/snippet-builder.ts`
- `db/migrations/0049_create_document_chunks_and_embeddings.sql`
- `신규: db/migrations/0101_chunk_level_fts.sql`
- `apps/api/src/modules/search/semantic/document-chunker.ts`

**Acceptance tests (완료판정):**
- apps/api/src/modules/search/index/search-index.repository.spec.ts: truncateUtf8 발생 시 truncated 플래그 저장 검증
- tests/integration/search-permission/search-body-fixture.spec.ts에 케이스 추가: 2MB 텍스트 문서의 1.5MB 지점 고유 문구 검색이 히트하고 해당 위치 스니펫이 반환됨
- 기존 search-permission 스위트 전체 그린 (청크 경로 전환 후 권한 필터 회귀 없음)
- 수동: 300페이지급 PDF 업로드 → 마지막 장의 고유 키워드로 /search 검색 히트하면 통과

#### D7 [S] OCR 텍스트 검색 인덱싱 연결 + ocr_pending 백필

**Goal:** 스캔 PDF가 OCR 완료 즉시 전문검색 대상이 되고, 그동안 ocr_pending으로 방치된 기존 문서도 소급 인덱싱된다.

**Scope:** (1) B 워크스트림의 OCR 스테이지가 body_text를 반환하면 extraction_status가 ocr_pending → ready로 전이될 때 기존 SearchIndexSyncHook/extraction-dispatcher 경로로 재인덱싱되는 연결을 검증·보강. (2) ocr_pending 잔여 문서를 스캔해 OCR 재큐잉하는 백필 잡(reindex.service의 enqueueTenantOrMatterVersions 패턴 재사용). (3) OCR confidence를 인덱스에 기록하고 저신뢰(ocr_low_confidence) facet을 search-filter.builder에 추가해 검수 대상 필터링 지원. OCR 엔진 자체(PaddleOCR/Tesseract 실행)는 만들지 않는다 — B 소관.

**Dependencies:** B(OCR 엔진 — ingestion 워커의 스캔 PDF OCR 스테이지)

**Code anchors:**
- `apps/api/src/modules/search/index/index-sync.hook.ts`
- `apps/api/src/modules/document/extraction/extraction-dispatcher.ts`
- `apps/api/src/modules/document/extraction/extraction.types.ts`
- `apps/api/src/modules/search/index/reindex.service.ts`
- `apps/api/src/modules/search/query/search-filter.builder.ts`
- `workers/ingestion/app/parsers/pdf.py`

**Acceptance tests (완료판정):**
- tests/integration/search-permission/search-index.spec.ts에 케이스 추가: extraction_status를 ocr_pending → ready(OCR body_text fixture 주입)로 전이시키면 재인덱싱되어 본문 검색 히트
- apps/api/src/modules/search/query/search-filter.builder.spec.ts: ocr_low_confidence facet 필터 SQL 생성 검증
- 수동: 텍스트 레이어 없는 스캔 PDF 업로드 → (B의 OCR 완료 후) /search에서 스캔 본문 키워드 히트, extraction_status facet에서 ocr_pending 카운트 감소 확인이면 통과

**검증 노트(반영 필요 세부):**
- (앵커 부정확) 'ocr_low_confidence' facet 값은 현재 코드베이스 어디에도 존재하지 않으며, extraction status는 apps/api/src/modules/document/extraction/extraction.types.ts와 packages/shared/src/types/document.ts(documentExtractionStatuses: pending/ready/ocr_pending/failed) 두 곳에 정의되어 있다. 후자(packages/shared/src/types/document.ts)와 facet DTO(packages/shared/src/search/search-query.dto.ts)가 anchors에 누락되어 있어 추가 필요. 또한 ocr_low_confidence가 신규 extraction status인지 별도 confidence 플래그/facet인지 유닛 정의에 명시할 것(B 워크스트림 OCR이 confidence 값을 산출해야 성립하는 판정이므로 dep B 범위에 confidence 전달을 포함시킬 것).

#### D8 [M] 이메일 본문 전문검색 (파일링 이메일의 문서 정규화 인덱싱)

**Goal:** matter에 파일링된 이메일의 본문·제목·발신인이 통합검색에서 검색된다. 첨부파일만 검색되고 본문은 어디서도 찾을 수 없던 갭이 사라진다.

**Scope:** (1) 이메일 파일링(emailFileRoute) 시 workers/ingestion의 email.py 파서로 body_text를 추출해 document_type='email' 가상 문서로 canonical_documents/document_versions 경로에 등록 — 기존 pg-boss 인덱싱·권한 필터가 자동 작동(신규 인덱스 테이블 대신 재사용 경로 채택). (2) searchTargets에 'email' 추가, 발신인/수신 도메인 facet을 search-filter.builder에 추가. (3) 0040의 envelope-only 정책('body must not be stored')과 충돌하므로 본문 인덱싱 허용을 tenant 정책 플래그로 게이트하고 ADR로 승격(내부 단일 로펌이므로 기본 on). email_messages 스키마의 본문 컬럼 추가는 하지 않는다 — 본문은 문서 경로에만 저장.

**완화 노트:** 수천만 건 이메일 스케일 대응(전용 인덱스 클러스터)은 제외 — 9인 로펌 볼륨 기준 기존 문서 인덱스 경로 재사용

**교정(검증·비평 반영):** 교차 교정: deps 워크스트림 오기(E→C) 정정. 소프트 의존 단서 유지 — 현행 업로드/파일링 경로만으로 완결 가능.

**Dependencies:** C(Outlook Graph 실연동 — 이메일 소스 자동 유입, 소프트 의존: 현행 업로드/파일링 경로만으로 완결 가능)

**Code anchors:**
- `apps/api/src/modules/email/email.controller.ts`
- `apps/api/src/modules/email/email.service.ts`
- `workers/ingestion/app/parsers/email.py`
- `db/migrations/0040_create_email_messages.sql`
- `db/migrations/0043_create_email_matter_filings.sql`
- `packages/shared/src/search/search-query.dto.ts`
- `apps/api/src/modules/search/query/search-filter.builder.ts`
- `docs/ledger/decision.md`

**Acceptance tests (완료판정):**
- 신규 통합테스트 tests/integration/search-permission/search-email.spec.ts: .eml 업로드→matter 파일링→본문 고유 문구 검색 히트, 해당 matter 권한 없는 사용자는 동일 질의 미히트, 정책 플래그 off 시 본문 미인덱싱
- apps/api/src/modules/email/email.service.spec.ts 확장: 파일링 시 email 문서 생성·본문 추출 실패 시 envelope 파일링은 성공(fail-soft) 검증
- 수동: Outlook에서 내보낸 .eml을 matter에 파일링 → /search에서 target=이메일로 본문 검색 히트 + 발신인 facet 표시되면 통과

**검증 노트(반영 필요 세부):**
- (앵커 부정확) deps의 'E(Outlook Graph 실연동)'는 문자 오기 — Outlook Graph/Email Vault는 C 워크스트림(C5~C7)이다. C로 정정하라(소프트 의존 단서는 유지).

#### D10 [M] 자연어 질의 검색 UI (/search 'AI에게 질문' 탭)

**Goal:** 사용자가 /search에서 자연어로 질문하면 기존 retrieval orchestrator가 권한 내 문서 청크를 근거로 답변과 인용 카드를 반환하고, 인용 클릭으로 원문 위치로 이동할 수 있다. API로만 존재하던 자연어 질의가 사용자 표면을 얻는다.

**Scope:** (1) /search에 'AI에게 질문' 탭 추가: ai/sessions 세션 생성 → 질의 → 답변 + citation 카드(청크 앵커 딥링크로 문서 상세 이동) 렌더하는 신규 ai-answer-panel 컴포넌트. (2) 키워드 검색 결과 상단에 현재 검색어를 시드로 자연어 질의 전환 CTA. (3) 모델 미가용/차단 시 기존 blocked reasonCode 체계를 fail-closed 안내 문구로 매핑. 멀티턴 대화·작업 실행형 풀 어시스턴트와 라우팅 고도화는 G 워크스트림 소관으로 제외 — 여기는 단발 질의+인용 표시만.

**교정(검증·비평 반영):** 교차 교정: deps 워크스트림 오기(G→E: E2/E8) 정정. 소프트 의존 단서 유지.

**Dependencies:** D2, D4, E(E2 Gemma 생성·E8 Strong LLM 라우팅 — 답변 생성 품질, 소프트 의존: 기존 로컬 생성 경로로 선출시 가능)

**Code anchors:**
- `apps/api/src/modules/ai/retrieval/retrieval-orchestrator.service.ts`
- `apps/api/src/modules/ai/session/ai-session.controller.ts`
- `apps/web/src/app/(app)/search/search-client.tsx`
- `apps/web/src/lib/navigation.ts`
- `신규: apps/web/src/components/search/ai-answer-panel.tsx`
- `tests/integration/ai-session.spec.ts`
- `tests/integration/ai-citations.spec.ts`

**Acceptance tests (완료판정):**
- 신규 컴포넌트 테스트 apps/web/src/components/search/ai-answer-panel.test.tsx: 질의→로딩→답변+인용 카드 렌더, blocked reasonCode 수신 시 fail-closed 안내 렌더, 인용 클릭 시 문서 딥링크 URL 생성 단언
- tests/integration/ai-session.spec.ts 확장: 검색어 시드로 세션 생성→질의→citation이 권한 내 문서만 참조함을 단언
- 수동: /search에서 '작년 X사 계약의 해지 조항 요약해줘' 입력 → 답변과 인용 카드 표시 → 인용 클릭 시 해당 문서 상세의 청크 위치로 이동하면 통과, Ollama 중지 상태에서는 차단 안내가 표시되면 통과

**검증 노트(반영 필요 세부):**
- (앵커 부정확) '신규:' 마커가 tests/integration/ai-session.spec.ts와 tests/integration/ai-citations.spec.ts까지 걸쳐 있으나 두 파일 모두 이미 실존한다(acceptance_tests 자체도 'ai-session.spec.ts 확장'이라고 기술해 모순). 신규 표기는 apps/web/src/components/search/ai-answer-panel.tsx(및 그 테스트 ai-answer-panel.test.tsx)에만 적용하고 두 통합테스트는 기존 앵커(확장)로 재분류할 것.
- (앵커 부정확) deps의 'G(로컬 Gemma 생성·Strong LLM 라우팅)'는 문자 오기 — Gemma 생성은 E2, Strong LLM 라우팅은 E8이다. E(E2/E8)로 정정하라(소프트 의존 단서는 유지).

### E: AI Assistant & Governance

#### E5 [M] AI Audit 원문 저장 — 프롬프트/출력 원문 열람 가능한 감사

**Goal:** 감사자(security_admin)가 AI 세션의 프롬프트·응답 원문을 사후 열람할 수 있고, 열람 행위 자체가 감사 이벤트로 기록되며, 세션에 DLP 리스크 플래그가 남는다.

**Scope:** 신규 마이그레이션으로 ai_session_payloads(session_id FK, prompt_text, response_text, RLS FORCE, 역할별 컬럼 GRANT) 테이블과 ai_sessions.risk_flag/dlp_finding_count 컬럼 추가. ai-summary.service.ts→ai-session-log.service.ts 기록 경로에 원문 저장 추가(해시 필드는 무결성 검증용으로 유지). GET /ai/sessions/:id/payload 엔드포인트(security_admin 한정) + AI_PAYLOAD_VIEWED 감사 액션(audit action CHECK 확장 마이그레이션 패턴 재사용). E1 세션 상세 뷰에 원문 열람 버튼.

**완화 노트:** 내부용 단일 로펌 전제에 따라 원문 저장을 오히려 강화(해시 전용→원문). 테넌트 KMS 암호화 봉인·break-glass 승인 절차는 생략하고 RLS+역할 GRANT+열람 감사로 대체. Shared(외부공유) 필드는 답변 반출 기능이 없는 현 단계에서 제외.

**교정(검증·비평 반영):** 교차 교정: H2로 이연(주 소비 시점이 E8). 단, 원문 저장은 소급 불가하므로 세션 원문 보존 플래그만 H1(E2)에서 미리 활성화.

**Dependencies:** 없음

**Code anchors:**
- `db/migrations/0050_create_ai_sessions.sql (원문 배제 COMMENT — 정책 반전 대상)`
- `신규: db/migrations/0099_create_ai_session_payloads.sql`
- `apps/api/src/modules/ai/session/ai-session-log.service.ts (36-53 AiSessionRow)`
- `apps/api/src/modules/ai/session/ai-session.controller.ts`
- `apps/api/src/modules/ai/audit/ai-audit-recorder.service.ts (63-205 액션 패턴)`
- `db/migrations/0091_add_account_ledger_id_audit_action.sql (감사 액션 CHECK 확장 패턴 재사용)`
- `tests/integration/ai-session.spec.ts`

**Acceptance tests (완료판정):**
- tests/integration/ai-session.spec.ts 확장: 요약 생성 후 security_admin이 GET /ai/sessions/:id/payload로 원문(질의·응답) 조회 성공 + audit_events에 AI_PAYLOAD_VIEWED 기록, 일반 변호사 역할은 403, prompt_hash가 저장 원문의 재해시와 일치함을 단언
- tests/integration/rls.spec.ts 패턴으로 ai_session_payloads 교차 테넌트 차단·RLS FORCE 존재를 단언(cross-tenant 헬퍼 재사용)
- apps/api/src/modules/ai/session/ai-session-log.service.spec.ts: DLP 발견 수가 risk_flag/dlp_finding_count로 저장됨을 단언
- 수동: 감사 콘솔→AI 세션 상세에서 원문 열람 → 감사 로그 화면에 열람 이벤트가 나타나면 통과

**검증 노트(반영 필요 세부):**
- (horizon 부적절) 원문 감사 열람의 주 소비 시점은 E8(Strong LLM 외부 전송 감사, H2)이다. 정책상 '해시→원문 강화'는 기한 요건이 없으므로 H2로 이연해 E8 직전 배치를 권고한다(H1 총량 완화). 단, 원문 저장 스키마 자체는 소급 불가하므로 이연 시 세션 원문 보존 플래그만 H1에서 미리 켜둘 것.

#### E6 [M] 골든셋 평가 벤치 — 질문-정답 대조 회귀 게이트

**Goal:** 임베딩·모델·프롬프트 변경 시 '답이 맞는가'를 claim-level recall/precision과 인용 문서 집합 일치율로 자동 판정하는 회귀 게이트가 CI에서 동작한다.

**Scope:** evaluation_cases에 expected_answer_facts jsonb, expected_citation_document_ids uuid[] 라벨 컬럼 마이그레이션 + 변호사 라벨링 절차 문서 갱신(초기 30건, 목표 100건). run-local-ai-eval.ts 확장: 케이스별 POST /ai/summaries 실호출 → claims를 기대 사실과 정규화 매칭(claim recall/precision), 인용 문서 집합 자카드 일치율 산출, 임계 미달 시 exit 1. CI 워크플로에 프롬프트/모델/임베딩 경로 변경 시 필수 잡으로 편입. LLM-judge 자동채점은 H3으로 이연.

**Dependencies:** E2

**Code anchors:**
- `db/migrations/0037_create_evaluation_cases.sql`
- `신규: db/migrations/0100_add_evaluation_case_golden_labels.sql`
- `tools/evalset/run-local-ai-eval.ts`
- `tools/evalset/local-ai-eval.ts (12-26 임계값 프레임 재사용)`
- `tools/evalset/load-evaluation-cases.ts`
- `tools/evalset/run-ai-gate-metrics.ts`
- `docs/evalset/Evaluation_Set_v0_Collection_Procedure.md`
- `tests/integration/evalset.spec.ts`

**Acceptance tests (완료판정):**
- tools/evalset/local-ai-eval.spec.ts 확장: 기대사실 3건 중 2건 매칭 모의 케이스에서 claim recall≈0.67 산출, 인용 집합 자카드 계산, 임계 미달 시 실패 판정을 단언
- tests/integration/evalset.spec.ts 확장: 골든 라벨 컬럼 insert/load 왕복과 스키마 검증을 단언
- 수동: 라벨링 케이스 최소 30건으로 run-local-ai-eval 실행 → 리포트에 claim recall/precision·citation set match 수치가 출력되고 초기 임계(claim recall≥0.7, citation match≥0.6) 미달 시 exit 1이면 통과
- CI: 프롬프트·모델·임베딩 경로를 건드린 테스트 PR에서 게이트 잡이 실행·판정됨을 워크플로 실행 이력으로 확인

**검증 노트(반영 필요 세부):**
- (앵커 부정확) acceptance에 'CI: 프롬프트·모델·임베딩 경로를 건드린 테스트 PR에서 게이트 잡이 실행·판정'이 있으나 anchors에 CI 워크플로 파일이 없음. .github/workflows/ci.yml이 실존하므로 anchors에 추가할 것. 아울러 '라벨링 케이스 최소 30건'은 수동 데이터 구축 선행 작업이므로 라벨 작성 주체·저장 위치(0100 골든 라벨 컬럼 기준)를 acceptance에 한 줄로 명시하면 판정 재현성이 확보됨.

#### E7 [L] Gemma 구조화 확장 — Fact/Issue/Risk/그래프 노드 후보 생성

**Goal:** 문서 인입 시 Gemma가 Fact/Issue/Risk 후보와 그래프 노드·관계 후보를 청크 인용과 함께 자동 생성하고, 후보는 사람 승인 전까지 확정 데이터(knowledge_graph·litigation_facts 등)에 반영되지 않는다.

**Scope:** packages/shared/src/ai/prep.ts의 aiPrepArtifactKindSchema에 fact_candidates/issue_candidates/risk_candidates/graph_candidate_edges 4종 추가(claim kind allowlist는 기존 'key_fact'/'issue'/'risk' 재사용, 인용 강제 유지). 0064 아티팩트 kind CHECK 완화 마이그레이션. ai-prep.processor.ts에 후보 생성 스테이지 추가(기존 8종과 동일한 grounded JSON 파이프라인). 생성된 후보를 dms_work_items 기반 Human Review Queue에 'AI 후보 검토' 항목으로 적재하는 어댑터까지 구현. knowledge_graph의 candidate/confirmed 상태 컬럼과 승인 확정 플로우는 F 워크스트림 소유 — 여기서는 아티팩트 생성+검토 큐 적재까지만.

**Dependencies:** E2, F(그래프 후보 candidate/confirmed 상태 스키마·승인 확정 플로우)

**Code anchors:**
- `packages/shared/src/ai/prep.ts (87-161 kind 스키마·allowlist)`
- `apps/api/src/modules/ai/prep/ai-prep.processor.ts`
- `apps/api/src/modules/ai/prep/ai-prep.types.ts`
- `apps/api/src/modules/ai/prep/ai-prep.repository.ts`
- `db/migrations/0064_create_ai_prep_artifacts.sql (kind CHECK)`
- `신규: db/migrations/0101_add_ai_prep_candidate_artifact_kinds.sql`
- `apps/api/src/modules/work/work.service.ts + db/migrations/0084_create_dms_work_items.sql (검토 큐 패턴 재사용)`
- `tools/evalset/local-ai-eval.ts (17-26 kind 목록 동기화)`

**Acceptance tests (완료판정):**
- packages/shared/src/ai/prep.spec.ts 갱신: 신규 kind 4종 파싱 허용(현행 spec 41행의 'risk_candidates' 거부 단언 반전)과 kind별 claim allowlist 위반 거부(예: fact_candidates에 'risk' claim)를 단언
- apps/api/src/modules/ai/prep/ai-prep.processor.spec.ts 확장: 모의 Gemma 출력으로 후보 아티팩트 저장, 인용 없는 claim 거부, 실패 시 기존 8종 아티팩트에 영향 없음을 단언
- 신규 tests/integration/ai-prep-candidates.spec.ts: 문서 업로드→prep 완료 후 후보 아티팩트 존재 + dms_work_items에 검토 항목 생성 + knowledge_graph 확정 테이블 미변경을 단언
- 수동: 계약서 1건 업로드 후 work 큐에 'AI 후보 검토' 항목이 뜨고 각 후보에 청크 인용이 달려 있으면 통과

#### E8 [L] Strong LLM 라우팅 — privileged는 로컬 전용, 허용문서는 외부 강모델

**Goal:** 비특권·전건 ai_allowed 문서로만 구성된 고난도 질의는 외부 강모델로 라우팅되어 고품질 답변을 받고, privileged/제한 문서가 하나라도 포함되면 구조적으로 로컬 Gemma만 사용된다. 모든 외부 전송이 감사 기록된다.

**Scope:** packages/ai에 ModelGateway 인터페이스를 추출하고 LocalGemmaGateway와 병렬로 StrongLlmGateway(단일 외부 제공자, 서버측 키 보관) 추가. aiModelRouteKeys에 'strong_external' 추가, 0050/0064의 model_route 단일값 CHECK 완화 + ai_model_access_policies에 model_tier='strong' 행 추가 마이그레이션(기본 DENY 유지). model-routing.service.ts에 3중 게이트 — DLP 무발견 + 인용 후보 전 문서 ai_allowed + matter policy의 strong tier 허용 — 통과 시에만 strong 라우트, 전송 페이로드는 redactedText 기반 evidence pack 재검증 후 송신. AI_EXTERNAL_TRANSMISSION 감사 액션 신설. ai-policy.evaluator.ts의 external_model_allowed 골격을 tier별 평가로 확장하고 summary.ts의 modelRoute literal을 enum으로 완화. 외부 게이트웨이 오류 시 로컬 폴백(fail-closed).

**완화 노트:** 외부판매 SaaS 아님 전제로 멀티 프로바이더 게이트웨이·BYOK·테넌트별 키는 제외하고 단일 외부 제공자 + 서버 보관 키로 구현.

**Dependencies:** E4, E5

**Code anchors:**
- `packages/ai/src/index.ts (LocalGemmaGateway — 인터페이스 추출 대상)`
- `packages/shared/src/types/ai-policy.ts:5 (aiModelRouteKeys=['local_gemma'])`
- `packages/shared/src/ai/model-routing.ts`
- `packages/shared/src/ai/summary.ts (modelRoute z.literal 완화)`
- `apps/api/src/modules/ai/routing/model-routing.service.ts (49-88 하드코딩 라우트)`
- `apps/api/src/modules/ai/routing/task-risk.classifier.ts`
- `apps/api/src/modules/ai-policy/ai-policy.evaluator.ts (76-91 external_model_allowed)`
- `db/migrations/0048_create_ai_model_access_policies.sql, 0050_create_ai_sessions.sql, 0064_create_ai_prep_artifacts.sql (CHECK 완화 대상)`
- `신규: db/migrations/0102_add_strong_external_model_route.sql`
- `apps/api/src/modules/ai/audit/ai-audit-recorder.service.ts (AI_EXTERNAL_TRANSMISSION 추가)`
- `tests/integration/ai-model-routing.spec.ts`

**Acceptance tests (완료판정):**
- apps/api/src/modules/ai/routing/model-routing.service.spec.ts 확장: privileged 문서 포함 시 strong 거부·local 유지, DLP 발견 존재 시 local 강제, 3중 게이트 전부 통과 시에만 strong 라우트를 단언
- tests/integration/ai-model-routing.spec.ts 확장: matter policy strong 허용 + 전 문서 ai_allowed 시나리오에서 ai_sessions.model_route='strong_external' 기록 + AI_EXTERNAL_TRANSMISSION 감사 이벤트 존재, privileged 문서 1건 추가 시 local_gemma 강등, 정책 기본값(DENY)에서 strong 미발동을 단언
- tests/integration/fail-closed.spec.ts 패턴 추가: 외부 게이트웨이 오류 모의 시 로컬 폴백 + 오류 감사 기록을 단언
- 수동: strong 허용 정책을 켠 매터에서 E1 패널 질의 → 응답 메타에 strong_external 라우트 표시, 감사 콘솔에서 전송 이벤트와 전송 페이로드가 redactedText임을 확인하면 통과

**검증 노트(반영 필요 세부):**
- (과대·과소 scope) 단일 [L] 유닛에 (1) packages/ai 게이트웨이 인터페이스 추출 + 외부 강모델 클라이언트 신규 구축, (2) 3개 마이그레이션 CHECK 완화(0048/0050/0064) + 신규 0102, (3) shared 타입·스키마 확장(aiModelRouteKeys, modelRoute z.literal, model-routing.ts), (4) 3중 게이트 라우팅 로직, (5) 신규 감사 액션 AI_EXTERNAL_TRANSMISSION + redactedText 전송 검증, (6) fail-closed 폴백, (7) UI 라우트 메타 표시까지 포함 — L 초과 의심. (a) 스키마/정책/라우팅 게이트(마이그레이션+evaluator+model-routing 확장)와 (b) 외부 게이트웨이 클라이언트+전송 감사+폴백+UI 표시의 2개 유닛으로 분할 권고.

#### E9 [M] Matter AI — 사건 타임라인·미해결쟁점·다음액션

**Goal:** Matter 대시보드에서 사건 타임라인(문서 날짜 사실 기반)과 미해결 쟁점·권장 다음 액션을 인용과 함께 볼 수 있다.

**Scope:** ai-prep의 date_facts+graph facts를 소스로 매터 단위 matter_timeline 아티팩트를 집계하는 빌더와 pg-boss 잡 추가(결정적 정렬·중복 병합 + Gemma 요약 라벨). 미해결쟁점·다음액션은 E3의 openQuestions/recommendedActions를 matter_summary 태스크에 활용해 대시보드에 노출. ai-prep-matter-dashboard.tsx에 타임라인 뷰 컴포넌트 연결. 쟁점의 확정·할당 등 워크플로 관리는 만들지 않음(표시·제안까지).

**Dependencies:** E3, E7

**Code anchors:**
- `신규: apps/api/src/modules/ai/prep/matter-timeline.builder.ts`
- `apps/api/src/modules/ai/prep/ai-prep.processor.ts`
- `apps/api/src/modules/ai/prep/ai-prep.repository.ts`
- `packages/shared/src/ai/prep.ts (matter_timeline kind 추가 — E7 마이그레이션 패턴 공유)`
- `apps/api/src/modules/graph/graph-query.service.ts (graph facts 소스)`
- `apps/web/src/components/ai/ai-prep-matter-dashboard.tsx`
- `apps/web/src/app/(app)/matters/[matterId]/page.tsx`

**Acceptance tests (완료판정):**
- 신규 apps/api/src/modules/ai/prep/matter-timeline.builder.spec.ts: date_facts 3건 입력 → 시간순 정렬·동일 사건 중복 병합·인용 보존을 단언
- 신규 tests/integration/ai-matter-timeline.spec.ts: 문서 2건 prep 완료 매터에서 타임라인 아티팩트 생성과 조회 API 200, 권한 없는 사용자 403을 단언
- apps/web/src/components/ai/ai-prep-matter-dashboard.test.tsx 확장: 타임라인 항목 렌더와 인용 클릭 시 문서 링크 생성을 단언
- 수동: 날짜가 다른 문서 3건이 있는 매터 대시보드에서 시간순 타임라인이 표시되고, matter_summary 실행 시 '미해결 쟁점/다음 액션' 카드가 뜨면 통과

**검증 노트(반영 필요 세부):**
- (앵커 부정확) matter_timeline kind 추가 역시 0064의 artifact_kind CHECK 확장 마이그레이션이 필요하나 anchors에는 'E7 마이그레이션 패턴 공유'라는 주석만 있고 신규 마이그레이션 파일이 없음. E7의 0101은 E7의 4종 kind만 추가하므로 matter_timeline은 별도 마이그레이션(예: 신규 db/migrations/010X_add_matter_timeline_artifact_kind.sql)을 anchors에 명시하거나 E7 0101에 포함됨을 명시적으로 기재할 것. tools/evalset/local-ai-eval.ts kind 목록 동기화도 누락.

#### E10 [M] Document AI — 조항 리스크 분석 생성 경로 (rule_findings 컨텍스트)

**Goal:** 문서 상세에서 clause_analysis/risk_extraction 질의가 계약 룰엔진 발견사항을 컨텍스트로 한 실제 Gemma 생성 분석을 반환하고, 사용자가 문서 상세 화면에서 실행·열람할 수 있다.

**Scope:** clause_analysis/risk_extraction을 Gemma 생성 대상에 포함하고, evidence-prompt.compiler.ts에 contract-rule-engine 산출(rule_findings)을 주입하는 전용 compile purpose를 추가해 RULE_FINDINGS_UNAVAILABLE_BEFORE_R8 경고를 해소. document-action-center.tsx에 '조항 리스크 분석' 실행 버튼과 결과 패널(E1 렌더러 재사용) 추가. 유사조항 검색·대체조항/fallback 추천은 제외 — F 워크스트림 조항은행과 D 실임베딩 이후 별도 유닛.

**Dependencies:** E2, E3

**Code anchors:**
- `apps/api/src/modules/ai/features/ai-summary.service.ts (419-425 gemmaFileOrganizationTask 확장)`
- `apps/api/src/modules/ai/generation/evidence-prompt.compiler.ts`
- `apps/api/src/modules/contract-intel/contract-rule-engine.ts`
- `apps/api/src/modules/contract-intel/contract-intel.service.ts`
- `apps/web/src/components/document/document-action-center.tsx`
- `apps/web/src/app/(app)/documents/[id]/page.tsx`
- `tests/integration/ai-summaries.spec.ts`
- `tests/integration/contract-intel.spec.ts`

**Acceptance tests (완료판정):**
- apps/api/src/modules/ai/features/ai-summary.service.spec.ts 확장: clause_analysis 요청 시 rule_findings가 프롬프트 컨텍스트에 포함되고 RULE_FINDINGS_UNAVAILABLE_BEFORE_R8 경고가 제거됨을 단언
- tests/integration/ai-summaries.spec.ts 확장: task=clause_analysis 200 + 응답 claims에 kind='risk' 존재 + 인용검증(citation-verifier) 통과를 단언
- apps/web/src/components/document/document-action-center.test.tsx 확장: 분석 실행 버튼 → 결과 패널 렌더·인용 링크를 단언
- 수동: 금지조항이 포함된 테스트 계약서에서 '조항 리스크 분석' 실행 → 해당 조항 인용과 리스크 설명·권장조치가 표시되면 통과

#### E11 [M] Email AI — 쓰레드 요약·요청사항/기한 추출

**Goal:** 보관된 이메일 쓰레드에 대해 요약과 요청사항·기한 목록을 인용과 함께 받아, 이메일형 문서 상세에서 바로 실행할 수 있다.

**Scope:** email_thread_summary 태스크의 Gemma 생성을 활성화(E2 게이트 확장)하고, 요청사항·기한 추출을 recommendedActions와 key_fact/timeline claims로 구조화하는 이메일 전용 프롬프트 매핑을 추가. 이메일 유형 문서(eml/msg 인입분)의 문서 상세에 '쓰레드 요약' 진입점 분기. 답변 초안 생성은 제외(E13 Drafting). Outlook Graph 실연동 수집은 C 워크스트림 — 여기서는 기존 인입분 대상으로 동작하고 C 완료 시 자동 확대.

**Dependencies:** E2, E3, C(Email Vault Outlook Graph 실연동 — 쓰레드 단위 인입 확대)

**Code anchors:**
- `apps/api/src/modules/ai/features/ai-summary.service.ts`
- `apps/api/src/modules/ai/generation/evidence-prompt.compiler.ts`
- `apps/api/src/modules/email/email.service.ts (eml/msg 인입)`
- `apps/api/src/modules/email/email-attachment.parser.ts`
- `packages/shared/src/ai/summary.ts`
- `apps/web/src/components/document/document-action-center.tsx (이메일 유형 분기)`
- `tests/integration/ai-summaries.spec.ts`

**Acceptance tests (완료판정):**
- tests/integration/ai-summaries.spec.ts 확장: eml 인입 문서가 있는 매터에서 task=email_thread_summary 200 + recommendedActions에 기한 항목 + timeline claim 인용 존재를 단언
- apps/api/src/modules/ai/features/ai-summary.service.spec.ts: 이메일 청크 모의 입력에서 요청사항이 recommendedActions로, 기한 날짜가 timeline claim으로 매핑됨을 단언
- 수동: '금요일까지 계약서 회신 요청'이 담긴 테스트 이메일 업로드 → 요약 패널에 요청사항/기한 목록과 원문 인용이 표시되면 통과

#### E12 [L] DD/Litigation AI — RFI 자동매핑·증거 자동분류 제안

**Goal:** DD에서 업로드 문서가 RFI 항목에 confidence와 함께 자동 매핑 제안되고 미매핑 RFI가 누락자료로 표시되며, 송무에서 증거 자동분류·쟁점-증거 매핑 제안이 사람 승인 대기 상태로 생성된다.

**Scope:** pg-boss 기반 Gemma 분류 잡 2종: (1) DD — ai-prep document_profile 분류 결과를 dd_rfis 카테고리와 매칭해 매핑 제안(confidence 포함)을 제안 테이블에 저장, 승인 시 기존 dd.service.ts createMapping 경로로 확정, 미매핑 RFI 누락 리포트 API. (2) Litigation — 증거 자동분류·쟁점-증거 매핑 제안을 동일 패턴으로 저장, 승인 전 litigation_facts/issues 확정 데이터 미변경. 제안 테이블 마이그레이션 1건. DD/Litigation 화면의 제안 승인 UI는 라우트 봉인 해제(G 워크스트림)와 함께 연결 — 이 유닛은 API·잡·데이터까지.

**Dependencies:** E7, G(contracts/dd/litigation hidden-route 봉인 해제·화면 노출)

**Code anchors:**
- `apps/api/src/modules/dd/dd.service.ts (createMapping 251행 — 확정 경로 재사용)`
- `apps/api/src/modules/litigation/litigation.service.ts`
- `apps/api/src/modules/ai/prep/ai-prep.processor.ts (document_profile 소스)`
- `신규: apps/api/src/modules/dd/dd-ai-mapping.service.ts`
- `신규: apps/api/src/modules/litigation/litigation-ai-classifier.service.ts`
- `신규: db/migrations/0103_create_ai_mapping_suggestions.sql`
- `db/migrations/0057_create_litigation_vault.sql (litigation_facts/issues 스키마 참조)`
- `tests/integration/dd-vault.spec.ts`
- `tests/integration/litigation-vault.spec.ts`

**Acceptance tests (완료판정):**
- 신규 apps/api/src/modules/dd/dd-ai-mapping.service.spec.ts: profile 카테고리→RFI 카테고리 매칭·confidence 산출·임계 미달 제안 제외를 단언
- tests/integration/dd-vault.spec.ts 확장: 문서 업로드→매핑 제안 조회 API가 후보+confidence 반환, 미매핑 RFI 누락 목록 반환, 제안 승인 시 dd_rfi_documents 확정 행 생성 + 감사 이벤트를 단언
- tests/integration/litigation-vault.spec.ts 확장: 증거 분류 제안 생성과 승인 전 litigation_facts 미변경을 단언
- 수동: 테스트 DD 매터에 문서 5건 업로드 → RFI 매핑 제안 목록과 누락 RFI 표시, 제안 1건 승인 시 매핑 확정이 확인되면 통과

**검증 노트(반영 필요 세부):**
- (앵커 부정확) 수동 acceptance('RFI 매핑 제안 목록과 누락 RFI 표시, 제안 1건 승인')가 UI 화면을 요구하는데 anchors에 웹 파일이 하나도 없음 — apps/web/src/app/(app)/dd/와 apps/web/src/lib/api/dd.ts가 실존하므로 이를 anchors에 추가하거나 수동 판정을 API 응답 레벨(제안 조회·승인 엔드포인트)로 교체할 것. 또한 DD 매핑 서비스+송무 증거분류 서비스 2개 신규 서비스와 마이그레이션·승인 플로우를 [L] 하나에 묶어 L 상한 의심 — DD 매핑과 송무 분류를 분리하면 각각 M으로 정리 가능.

### F: Knowledge Graph & 지식자산

#### F1 [L] 그래프 택소노미 Phase 1 확장 — Fact/Evidence/Issue/Risk/RFI/Party 노드 및 EVIDENCED_BY 계열 엣지 투영

**Goal:** 기존 관계테이블(litigation_facts, litigation_evidence_items, litigation_issue_nodes, dd_issues, dd_risks, dd_rfis, parties)이 graph_nodes/graph_edges로 투영되어, 사용자가 GET /graph/facts로 'Fact→Evidence→Document' 관계를 그래프로 조회할 수 있다. 예약만 되어 있던 issue/risk 노드타입이 실사용으로 전환된다.

**Scope:** 마이그레이션(0098+)으로 graph_nodes.node_type CHECK에 fact/evidence/rfi/party 추가, source_table CHECK의 reserved_issue/reserved_risk를 dd_issues/dd_risks/litigation_issue_nodes/litigation_facts/litigation_evidence_items/dd_rfis/parties로 교체·확장, graph_edges.edge_type CHECK에 EVIDENCED_BY/REQUIRES_ACTION/HAS_PARTY/HAS_FACT/HAS_ISSUE(실사용)/HAS_RISK(실사용)/HAS_SUB_ISSUE/SUPERSEDES/AMENDS/CITES/DEFINES/CONTAINS_CLAUSE/ALIGNED_WITH를 한 번에 추가(엣지 파생 로직은 후속 유닛). GraphSyncService.syncMatter에 7개 소스테이블 매퍼 추가: HAS_FACT(matter→fact), EVIDENCED_BY(fact→evidence→document version), HAS_ISSUE/HAS_RISK(matter→dd_issues/dd_risks/litigation_issue_nodes), HAS_SUB_ISSUE(issue 계층 parent_issue_id), REQUIRES_ACTION(issue→dd_rfis), HAS_PARTY(matter→party). 기존 멱등 업서트·stale 마킹·GRAPH_SYNCED 감사·RLS 패턴 그대로 재사용. Authority/WorkProduct/TimelineEvent/Obligation 등 신규 테이블이 필요한 노드는 이 유닛에서 만들지 않는다(택소노미 CHECK에 값만 예약하지 않고 아예 제외 — 예약 슬롯 방치 패턴 재발 방지). Neo4j 미도입 결정(R7) 유지.

**완화 노트:** 컨셉의 21종 노드 중 신규 테이블이 필요한 Authority/WorkProduct/NegotiationPosition/TimelineEvent/Obligation/Approval은 9인 로펌 실수요 검증 전까지 제외. 기존 관계테이블 투영(이원화 해소)에 집중.

**교정(검증·비평 반영):** 교차 교정: H2 초입으로 이연 — 그래프 최초 사용자 노출(F8)이 H2이므로 H1 내 사용자 가치 없음. F4·F5는 AI 인용 신뢰 기반이므로 H1 유지.

**Dependencies:** 없음

**Code anchors:**
- `db/migrations/0053_create_knowledge_graph.sql`
- `신규: db/migrations/0098_expand_graph_taxonomy_phase1.sql`
- `apps/api/src/modules/graph/graph-sync.service.ts`
- `packages/shared/src/graph/graph-types.ts`
- `db/migrations/0057_create_litigation_vault.sql`
- `db/migrations/0056_create_dd_vault.sql`
- `db/migrations/0020_create_parties.sql`
- `tests/integration/graph.spec.ts`

**Acceptance tests (완료판정):**
- tests/integration/graph.spec.ts 확장: litigation fact+evidence+document, dd issue(부모/자식)+rfi, party를 시드한 matter에 POST /graph/sync 실행 후 graph_nodes에 fact/evidence/issue/risk/rfi/party 노드가 소스 행 수만큼 생성되고 EVIDENCED_BY·HAS_SUB_ISSUE·REQUIRES_ACTION 엣지가 정확한 src/dst로 존재함을 assert
- tests/integration/graph.spec.ts: 동일 payload로 sync 2회 실행 시 노드/엣지 행 수 불변(멱등), 소스 행 삭제 후 재sync 시 해당 노드 stale=true 마킹 assert
- tests/integration/cross-tenant.spec.ts 패턴 재사용: 타 테넌트 컨텍스트에서 신규 노드타입 조회 0건(RLS) assert
- 수동 검증: firm_admin이 POST /graph/sync 후 GET /graph/facts 응답에 HAS_FACT/EVIDENCED_BY 엣지가 포함되는지 REST 클라이언트로 확인, 감사콘솔에서 GRAPH_SYNCED 이벤트 확인

**검증 노트(반영 필요 세부):**
- (테스트 불가능한 완료판정 (스키마 불일치)) acceptance test의 'dd issue(부모/자식)+rfi 시드' 시나리오는 실행 불가. dd_issues(db/migrations/0056_create_dd_vault.sql)에는 parent 컬럼이 없고 부모/자식 계층(parent_issue_id)은 litigation_issue_nodes(db/migrations/0057_create_litigation_vault.sql:239)에만 존재함. HAS_SUB_ISSUE 엣지 assert는 litigation issue 트리 기반 시드로 수정하거나(권장: 'litigation issue(부모/자식) + dd issue+rfi 시드'로 문구 변경), dd_issues에 계층 구조를 추가할 것이라면 그 스키마 변경을 scope에 명시해야 함. dd_issues→dd_rfis 연결(rfi_id)은 존재하므로 REQUIRES_ACTION 엣지 시나리오는 유효.
- (horizon 부적절) 그래프의 최초 사용자 노출은 F8(H2)이므로 F1·F3·F6(투영·provenance·자동동기화)은 H1에 있어도 사용자 가치가 없다. H2 초입으로 이연하라(E7이 F3에 의존하나 E7도 H2이므로 순서만 지키면 무해). F4·F5는 E 답변 인용 신뢰의 기반이므로 H1 유지.

#### F2 [M] contract_clauses ↔ 그래프 clause 노드 통합 — 조항 모델 이원화 해소

**Goal:** 그래프의 clause 노드가 범용 텍스트 chunk가 아닌 계약 인텔리전스의 실제 조항(contract_clauses)을 가리키게 되어, '이 계약 버전이 포함한 조항' 관계 질의가 법적 의미를 갖는다.

**Scope:** 마이그레이션으로 graph_nodes.source_table 허용값에 contract_clauses/contract_defined_terms 추가, 기존 document_chunks 기반 clause 노드를 text_chunk 노드타입으로 개명(데이터 백필 UPDATE 포함). GraphSyncService.listClauseChunks를 분리: (1) contract_clauses → clause 노드 + CONTAINS_CLAUSE(version→clause) 엣지, (2) contract_defined_terms → defined_term 노드 + DEFINES(version→defined_term) 엣지, (3) 기존 chunk는 text_chunk 노드로 유지, (4) contract_clause_chunks 브리지 테이블로 ALIGNED_WITH(clause↔text_chunk) 엣지 생성. GraphRAG evidence pack이 조항 컨텍스트와 검색 chunk를 함께 획득. 조항 본문 미저장(canonical_documents 권한검사 후 해석) 설계는 유지.

**Dependencies:** F1

**Code anchors:**
- `apps/api/src/modules/graph/graph-sync.service.ts`
- `db/migrations/0054_create_contract_intelligence.sql`
- `db/migrations/0053_create_knowledge_graph.sql`
- `신규: db/migrations/0099_unify_clause_graph_nodes.sql`
- `packages/shared/src/graph/graph-types.ts`
- `tests/integration/graph.spec.ts`
- `tests/integration/contract-intel.spec.ts`

**Acceptance tests (완료판정):**
- tests/integration/graph.spec.ts 확장: contract-intel POST /process로 조항 파싱된 계약 버전을 시드 후 sync 실행 → clause 노드의 source_table='contract_clauses', CONTAINS_CLAUSE/DEFINES/ALIGNED_WITH 엣지 생성 assert
- 마이그레이션 백필 테스트: 기존 chunk 기반 clause 노드가 마이그레이션 후 node_type='text_chunk'로 전환되고 기존 HAS_CLAUSE 엣지 참조가 깨지지 않음(FK 무결성) assert
- 수동 검증: 제N조 형식 한국어 계약서 업로드→process→sync 후 GET /graph/facts에서 조항 kind(예: indemnity)가 노드 속성으로 노출되는지 확인

**검증 노트(반영 필요 세부):**
- (테스트 불가능한 완료판정 (존재하지 않는 분류체계 의존)) 수동 검증 기준 '조항 kind(예: indemnity)가 노드 속성으로 노출'은 현행 스키마로 판정 불가. contract_clauses.clause_kind(db/migrations/0054_create_contract_intelligence.sql:134)는 구조적 분류('article','section','paragraph','definition')만 허용하며 indemnity 같은 의미적(semantic) 조항 분류는 리포지토리 어디에도 없음(playbook_rules.rule_type도 required_clause/prohibited_term/threshold뿐). 검증 기준을 구조적 kind(article/definition 등) 노출로 바꾸거나, 의미적 조항 분류 도입을 이 유닛(또는 별도 유닛)의 scope로 명시해야 함.

#### F3 [S] graph_nodes provenance/review_status 속성 강제 — AI생성·사람확정 차원 도입

**Goal:** 모든 그래프 노드가 provenance(derived/ai_proposed/human_confirmed)와 review_status(proposed/confirmed)를 갖게 되어, AI가 제안한 지식과 사람이 확정한 지식이 스키마 수준에서 구분되고 GraphRAG 프롬프트에 그 구분이 표기된다.

**Scope:** 마이그레이션으로 graph_nodes에 provenance text NOT NULL DEFAULT 'derived' CHECK(derived/ai_proposed/human_confirmed), review_status text CHECK(proposed/confirmed), created_by_kind text NOT NULL DEFAULT 'system' CHECK(system/ai/human) 컬럼 추가 + 'provenance=ai_proposed이면 review_status NOT NULL' CHECK. GraphSyncService의 결정론적 파생 노드는 전부 derived/system으로 기록. evidence-prompt.compiler를 확장해 graphFacts 주입 시 confirmed와 proposed/unreviewed를 구분 표기(컨셉 799줄 요건). packages/shared graph-types에 필드 추가. ai_proposed 노드의 실제 유입 경로는 F9에서 구현(이 유닛은 스키마+파생 경로+프롬프트 표기까지).

**교정(검증·비평 반영):** 교차 교정: F1과 함께 H2 초입으로 이연(E7이 의존하나 E7도 H2 — 순서만 준수).

**Dependencies:** F1

**Code anchors:**
- `db/migrations/0053_create_knowledge_graph.sql`
- `신규: db/migrations/00XX_add_graph_node_provenance.sql`
- `apps/api/src/modules/graph/graph-sync.service.ts`
- `apps/api/src/modules/ai/generation/evidence-prompt.compiler.ts`
- `apps/api/src/modules/ai/features/ai-summary.service.ts`
- `packages/shared/src/graph/graph-types.ts`
- `tests/integration/graph.spec.ts`

**Acceptance tests (완료판정):**
- tests/integration/graph.spec.ts: sync 후 모든 노드의 provenance='derived', created_by_kind='system' assert; provenance='ai_proposed'이며 review_status NULL인 INSERT가 DB CHECK 위반으로 실패함을 raw query로 assert
- apps/api/src/modules/ai/generation/evidence-prompt.compiler.spec.ts 확장: confirmed 노드와 proposed 노드가 혼재한 graphFacts 입력 시 컴파일된 프롬프트에 구분 라벨(예: [확정]/[미검토])이 각각 포함됨 assert
- 수동 검증: POST /ai/summaries 호출 후 응답 근거 섹션에서 미검토 그래프 사실이 확정 사실과 구분 표기되는지 확인

#### F6 [M] 문서 라이프사이클 이벤트 기반 그래프 자동 증분 동기화

**Goal:** 문서 업로드·버전 추가·삭제·텍스트 추출 완료 시 해당 matter의 그래프가 자동으로 갱신되어, firm_admin의 수동 POST /graph/sync 없이도 그래프가 항상 최신 상태를 유지한다.

**Scope:** document-upload.service.ts / document-version.service.ts / document-lifecycle.service.ts / extraction 완료 경로에 트랜잭션 커밋 후 matter 단위 그래프 동기화 트리거를 추가. 구현은 graph_sync_outbox 테이블(matter_id, 요청 사유, 상태) + 주기 폴링 워커(기존 syncMatter 멱등 로직 그대로 호출, 실패 시 재시도·데드레터 상태) — 9인 규모이므로 별도 메시지 브로커는 도입하지 않는다. 동일 matter 다중 이벤트는 outbox에서 코얼레싱. GRAPH_SYNCED 감사 이벤트·graph_sync_runs 기록 유지. 수동 POST /graph/sync는 관리자 복구 경로로 존치. litigation/dd 서비스의 fact·issue 변경 시에도 동일 outbox enqueue(F1 매퍼 대상).

**완화 노트:** 이벤트 버스/브로커(SQS 등) 미도입 — Postgres outbox + 인프로세스 폴링으로 축소(단일 테넌트·소규모 전제).

**교정(검증·비평 반영):** 교차 교정: F1과 함께 H2 초입으로 이연.

**Dependencies:** 없음

**Code anchors:**
- `apps/api/src/modules/document/document-upload.service.ts`
- `apps/api/src/modules/document/document-version.service.ts`
- `apps/api/src/modules/document/document-lifecycle.service.ts`
- `apps/api/src/modules/graph/graph-sync.service.ts`
- `apps/api/src/modules/graph/graph.controller.ts`
- `신규: db/migrations/00XX_create_graph_sync_outbox.sql`
- `신규: apps/api/src/modules/graph/graph-sync-outbox.worker.ts`
- `tests/integration/graph.spec.ts`
- `tests/integration/upload.spec.ts`

**Acceptance tests (완료판정):**
- tests/integration/graph.spec.ts 확장: 문서 업로드 API 호출 → outbox 행 생성 assert → 워커 1틱 수동 구동(테스트 훅) 후 해당 문서의 graph_nodes 존재 + outbox 상태 completed assert
- 동일 spec: 같은 matter에 문서 3건 연속 업로드 시 워커 1틱에서 syncMatter 1회만 호출됨(코얼레싱, 스파이/카운터) assert
- 동일 spec: syncMatter 강제 실패 주입 시 outbox 상태가 재시도 카운트 증가 후 데드레터로 전이 + 감사 이벤트 기록 assert
- 성능 기준: 로컬 시드(문서 100건 matter)에서 업로드→그래프 노드 조회 가능까지 폴링 주기 포함 30초 이내 — 통합 테스트 폴링 타임아웃으로 측정

#### F7 [M] 다중 홉 그래프 질의 API — 권한 스코프 재귀 CTE

**Goal:** 사용자가 GET /graph/neighborhood로 특정 노드에서 최대 3홉 이웃/경로 서브그래프(예: Matter→Issue→RFI→답변문서)를 조회할 수 있고, GraphRAG evidence pack이 평면 목록 대신 질의 관련 경로 서브그래프를 주입받는다.

**Scope:** graph-query.service.ts에 재귀 CTE 기반 n-hop 탐색 추가: GET /graph/neighborhood?nodeId&depth(≤3)&edgeTypes — 기존 permission-before-graph 계약(canReadMatter → 권한 스코프 SQL 주입)을 매 홉 조인에 적용, stale 노드 제외, 노드/엣지 상한(예: 200)과 커서 페이지네이션. GRAPH_QUERY_EXECUTED 감사 유지. evidence-prompt.compiler/ai-summary.service의 graphFacts 주입을 경로 서브그래프 형태로 확장(질의 분류가 graph 패턴일 때). Apache AGE/Neo4j read-replica 도입은 하지 않는다(질의 수요 검증 후 별도 결정 — R7 어댑터 계약 존중).

**완화 노트:** 그래프 알고리즘(중심성·클러스터링)과 전용 그래프 스토어 도입 제외 — 재귀 CTE 경로 탐색까지만.

**Dependencies:** F1, A6(기본개방 권한 의미론 변경 반영)

**Code anchors:**
- `apps/api/src/modules/graph/graph-query.service.ts`
- `apps/api/src/modules/graph/graph.controller.ts`
- `apps/api/src/modules/search/permission/search-permission-scope.provider.ts`
- `apps/api/src/modules/ai/generation/evidence-prompt.compiler.ts`
- `apps/api/src/modules/ai/features/ai-summary.service.ts`
- `packages/shared/src/graph/graph-types.ts`
- `tests/integration/graph.spec.ts`
- `docs/architecture/R7_knowledge_graph.md`

**Acceptance tests (완료판정):**
- tests/integration/graph.spec.ts 확장: matter→issue→rfi→document 2~3홉 시드 후 neighborhood(depth=3) 응답에 전체 경로 포함, depth=1이면 1홉만 포함 assert
- 동일 spec: ethical wall로 차단된 matter의 노드가 경유 노드로도 결과에 나타나지 않음(권한 스코프 매 홉 적용) assert — tests/integration/ethical-wall.spec.ts 헬퍼 재사용
- 동일 spec: depth=4 요청은 400, 결과 200개 초과 시 커서 페이지네이션 동작 assert
- 성능 기준: 시드 스크립트로 노드 10,000/엣지 30,000 생성 후 depth=3 질의 p95 < 500ms — 통합 테스트 내 반복 10회 측정

#### F8 [L] Matter 지식 탭 UI 개방 — Matter Graph/Issue Map/Citation Panel

**Goal:** 변호사가 /matters/[matterId]의 '지식' 탭에서 매터 그래프(관련 문서·당사자·사실 관계), 이슈 계층 맵, AI 인용 원장(Citation Panel)을 화면으로 확인할 수 있다 — 지식그래프가 처음으로 최종 사용자에게 노출된다.

**Scope:** 신규 웹 API 클라이언트 apps/web/src/lib/api/graph.ts(GET /graph/facts, /graph/neighborhood 소비)와 ai-claims 조회 클라이언트 추가(기존 lib/api/*.ts + *.spec.ts 패턴 준수). /matters/[matterId] 페이지에 지식 탭 3구획: (1) Matter Graph — 이웃 서브그래프 목록/간단 시각화(노드 클릭 시 문서 상세 링크, provenance 뱃지 표기), (2) Issue Map — litigation_issue_nodes/dd_issues 계층 트리, (3) Citation Panel — 이 matter의 AI 세션 claim↔citation 원장 조회. 권한은 서버에서 이미 강제되므로 UI는 응답 렌더만. /contracts·/dd·/litigation 독립 라우트 봉인은 이 유닛에서 해제하지 않는다(hidden-routes.test.tsx 불변 — matter 탭 방식으로 우회 노출). 그래프 시각화는 경량 SVG/리스트 하이브리드로 시작(외부 대형 그래프 라이브러리 도입 판단은 구현 시점에).

**완화 노트:** 전사 그래프 탐색기·검색 화면은 제외 — matter 스코프 탭만. 봉인 라우트 해제는 워크플로 워크스트림의 스모크 게이트에 위임.

**Dependencies:** F1, F4, F7

**Code anchors:**
- `apps/web/src/app/(app)/matters/[matterId]/page.tsx`
- `신규: apps/web/src/lib/api/graph.ts`
- `신규: apps/web/src/lib/api/graph.spec.ts`
- `신규: apps/web/src/components/matter/matter-knowledge-tab.tsx`
- `apps/web/src/lib/api/litigation.ts`
- `apps/web/src/lib/api/dd.ts`
- `apps/web/src/app/(app)/hidden-routes.test.tsx`
- `apps/api/src/modules/graph/graph.controller.ts`

**Acceptance tests (완료판정):**
- 신규 apps/web/src/app/(app)/matters/[matterId]/matter-knowledge-tab.test.tsx (기존 matters/page.test.tsx RTL 패턴): 모킹된 graph facts 응답으로 노드·엣지 목록, provenance 뱃지([확정]/[AI제안]/[파생]), 이슈 트리, citation 목록 렌더 assert; API 오류 시 오류 상태 렌더 assert
- apps/web/src/lib/api/graph.spec.ts: 요청 경로·파라미터 직렬화·응답 파싱 계약 테스트 (기존 lib/api/*.spec.ts 패턴)
- apps/web/src/app/(app)/hidden-routes.test.tsx가 변경 없이 계속 통과(봉인 라우트 불변 회귀 확인)
- 수동 검증: 변호사 계정으로 fact·evidence·issue가 시드된 matter 상세 → 지식 탭에서 Fact→Evidence→Document 체인을 클릭해 문서 상세로 이동 가능하면 통과

#### F9 [M] AI 후보 Fact 유입 + Human Review Queue — proposed→confirmed 승격 순환

**Goal:** AI가 생성한 claim이 ai_proposed Fact 후보 노드로 그래프에 유입되고, 변호사가 기존 /work 큐에서 검토해 confirmed로 승격하거나 거절할 수 있다 — 'AI가 제안하고 변호사가 확정하는' 순환이 완성된다.

**Scope:** (1) F4의 ai_claims를 provenance='ai_proposed', review_status='proposed' fact 노드로 투영하고 CITES 엣지(fact 후보→인용 문서 버전)를 생성하는 매퍼를 GraphSyncService에 추가(ai-prep.repository.ts의 graphFacts:[] 하드코딩 교체 포함). (2) 마이그레이션으로 work_items.kind CHECK에 'graph_fact_review' 추가(0085 확장 패턴 그대로 — 소스 행 실존 요구 코멘트 계약 유지), 후보 노드 생성 시 work item enqueue. (3) 승인 API POST /graph/nodes/:id/review {action: confirm|reject} — confirm 시 human_confirmed 전이 + FACT_CONFIRMED 감사 이벤트(신규 audit action, 0091 패턴), reject 시 노드 stale 처리 + 감사. 승인 권한은 matter 편집 권한자(assertCanEditMatter 재사용). (4) work-queue-client.tsx에 graph_fact_review 항목 렌더·확인/거절 액션 추가. confirmed 승격 시 evidence-prompt.compiler의 [확정] 표기(F3)가 자동 반영.

**교정(검증·비평 반영):** 교차 교정: /work 큐 신규 태스크 kind 추가이므로 G13 의존 추가.

**Dependencies:** F3, F4, G13(work queue kind 확장)

**Code anchors:**
- `apps/api/src/modules/graph/graph-sync.service.ts`
- `apps/api/src/modules/graph/graph.controller.ts`
- `apps/api/src/modules/work/work.service.ts`
- `apps/api/src/modules/work/work.controller.ts`
- `apps/api/src/modules/ai/prep/ai-prep.repository.ts`
- `db/migrations/0085_expand_dms_work_items.sql`
- `db/migrations/0091_add_account_ledger_id_audit_action.sql`
- `신규: db/migrations/00XX_add_graph_fact_review_work_kind.sql`
- `apps/web/src/app/(app)/work/work-queue-client.tsx`
- `apps/web/src/app/(app)/work/work-queue-client.test.tsx`
- `apps/web/src/lib/api/work-ops.ts`
- `tests/integration/graph.spec.ts`

**Acceptance tests (완료판정):**
- tests/integration/graph.spec.ts 확장: AI 요약 실행 → ai_proposed fact 노드 + CITES 엣지 + kind='graph_fact_review' work item 생성 assert; POST /graph/nodes/:id/review confirm 시 provenance='human_confirmed'·work item 완료·FACT_CONFIRMED 감사 행 assert; reject 시 stale=true assert
- 동일 spec: matter 편집 권한 없는 사용자의 review 요청 403 assert
- apps/web/src/app/(app)/work/work-queue-client.test.tsx 확장: graph_fact_review 항목이 claim 요약·인용 문서와 함께 렌더되고 확인/거절 버튼이 API 클라이언트를 올바른 인자로 호출함 assert
- 수동 검증: 변호사가 /work에서 AI 제안 Fact를 확인 처리한 뒤 matter 지식 탭(F8)에서 해당 노드가 [확정] 뱃지로 바뀌는지 확인

**검증 노트(반영 필요 세부):**
- (앵커 부정확) '기존 /work 큐에서 검토'는 신규 태스크 kind 추가를 뜻하므로 G13(work queue kind 네임스페이스·배정 확장)에 의존한다. deps에 G13을 추가하라. G13의 소비자 목록에도 F9(및 A13)를 명시해 공통 기반 설계에 반영할 것.

#### F10 [M] SUPERSEDES 엣지 파생 + Conflict Detector 확장 — 버전충돌·정의어 불일치·근거누락 감지

**Goal:** 시스템이 인프라 드리프트를 넘어 법률적 충돌 3종 — 버전 계보 충돌, matter 내 계약 간 정의어 불일치, 근거 없는 verified Fact — 을 감지해 ID-only 리포트로 반환하고 감사에 기록한다.

**Scope:** (1) GraphSyncService에 document_versions.supersedes_version_id 체인 → SUPERSEDES(신버전→구버전) 엣지 파생 추가(edge_type은 F1 마이그레이션에서 기확장). (2) GraphConsistencyService(현행 4종 드리프트 CTE)에 3종 검사기 추가: 버전충돌 — 동일 문서에서 current 다중/SUPERSEDES 계보 단절 감지, 정의어 불일치 — 동일 matter 내 복수 계약의 contract_defined_terms를 term 정규화 후 definition_hash 교차 비교(기존 conflict_status는 단일 버전 내 중복만 커버), 근거누락 — verified litigation_facts 중 citation_refs 비었거나 EVIDENCED_BY 엣지 없는 fact 노드 목록화. 결과는 기존 drift DTO(ID-only, 민감정보 미포함) 패턴 확장, GRAPH_CONSISTENCY_CHECKED 감사 유지. GET /graph/consistency 응답 스키마 확장. AMENDS 엣지는 근거 관계테이블이 없어 이 유닛에서 파생하지 않는다(수동 연결 기능이 생기면 후속).

**완화 노트:** LLM 기반 문서 내용 의미 불일치 감지는 제외 — 결정론적(해시·계보·엣지 존재) 검사만. AMENDS 파생은 근거 데이터 부재로 보류.

**Dependencies:** F1, F2, F5

**Code anchors:**
- `apps/api/src/modules/graph/graph-consistency.service.ts`
- `apps/api/src/modules/graph/graph-sync.service.ts`
- `apps/api/src/modules/graph/graph.controller.ts`
- `db/migrations/0029_create_document_versions.sql`
- `db/migrations/0054_create_contract_intelligence.sql`
- `db/migrations/0057_create_litigation_vault.sql`
- `packages/shared/src/graph/graph-types.ts`
- `tests/integration/graph.spec.ts`

**Acceptance tests (완료판정):**
- tests/integration/graph.spec.ts 확장: supersedes 체인 3버전 시드 후 sync → SUPERSEDES 엣지 2건 생성 assert; 계보 단절(중간 버전 삭제) 시드 시 consistency 응답에 version_lineage_conflict 항목 포함 assert
- 동일 spec: 동일 matter 두 계약에 같은 정의어·다른 definition_hash 시드 → defined_term_mismatch 항목이 term과 양쪽 version ID만 포함(본문 미노출) assert
- 동일 spec: raw UPDATE로 F5 CHECK 우회 불가하므로 마이그레이션 이전 잔존 데이터 시나리오를 모사한 시드로 evidence_gap 항목 검출 assert; 응답 DTO에 문서 본문·스니펫 필드 부재 assert
- 수동 검증: firm_admin이 GET /graph/consistency 호출 시 신규 3종 카테고리가 카운트와 ID 목록으로 반환되고 감사콘솔에 GRAPH_CONSISTENCY_CHECKED가 남는지 확인

**검증 노트(반영 필요 세부):**
- (테스트 불가능한 완료판정 (FK 제약과 충돌하는 시드 시나리오)) '계보 단절(중간 버전 삭제) 시드' 시나리오는 실행 불가. document_versions.supersedes_version_id FK가 ON DELETE RESTRICT(db/migrations/0029_create_document_versions.sql:30-33)이고 버전 레코드는 불변(immutable)이라 참조되는 중간 버전을 삭제할 수 없음. 계보 단절 시드는 '중간 버전 삭제' 대신 version_no 불연속 + supersedes_version_id NULL(예: v1, v3만 존재하고 v3의 supersedes가 NULL) 형태로 재정의해야 version_lineage_conflict 검출을 판정할 수 있음.

#### F11 [L] 조항은행 2.0 — 전사 큐레이션·재사용 승인 워크플로·/contracts 조항은행 브라우저

**Goal:** 변호사가 matter의 조항을 전사 조항은행에 제안하고, 승인권자가 approved/deprecated로 큐레이션하며, 승인된 조항을 /contracts 화면에서 브라우징·재사용할 수 있다.

**Scope:** (1) 마이그레이션으로 clause_bank_entries 테이블(tenant 전사 범위, source contract_clause/version 참조 FK, status draft/approved/deprecated CHECK, proposed_by/approved_by, tags text[], usage_count, RLS FORCE) 추가 — 조항 본문 미저장·canonical_documents 권한검사 후 해석하는 기존 설계 유지. (2) contract-intel 모듈에 승격 제안 POST /contract-intel/clause-bank/entries, 승인/폐기 PATCH(승인 권한 롤 게이트), 전사 목록 GET(태그·kind 필터) API + CLAUSE_BANK_CHANGED 감사 이벤트 추가 — 기존 listClauseBank(matter 범위)는 존치. (3) /contracts 라우트의 RouteBlockedState를 조항은행 브라우저로 교체: 미사용 상태인 apps/web/src/lib/api/contract-intel.ts 클라이언트를 확장·실사용, hidden-routes.test.tsx에서 /contracts 봉인 테스트를 개방 상태 테스트로 갱신. 유사조항 벡터검색은 F12로 분리.

**완화 노트:** 조항 버전 계보·다단계 승인·외부 공유는 제외. 승인 워크플로는 제안→승인/폐기 단일 단계(9인 규모).

**Dependencies:** F2

**Code anchors:**
- `apps/api/src/modules/contract-intel/contract-intel.service.ts`
- `apps/api/src/modules/contract-intel/contract-intel.controller.ts`
- `db/migrations/0054_create_contract_intelligence.sql`
- `신규: db/migrations/00XX_create_clause_bank_entries.sql`
- `packages/shared/src/contract/contract-types.ts`
- `apps/web/src/lib/api/contract-intel.ts`
- `apps/web/src/app/(app)/contracts/page.tsx`
- `apps/web/src/app/(app)/hidden-routes.test.tsx`
- `tests/integration/contract-intel.spec.ts`

**Acceptance tests (완료판정):**
- tests/integration/contract-intel.spec.ts 확장: 조항 파싱된 matter에서 승격 제안 → draft 엔트리 생성, 승인 권한자 PATCH로 approved 전이 + CLAUSE_BANK_CHANGED 감사 행, 일반 사용자 승인 시도 403 assert
- 동일 spec: 전사 목록 GET이 요청자가 읽을 수 없는 matter 소스 조항의 본문 해석을 거부하되 approved 메타(태그·kind)는 반환하는 권한 계약 assert
- apps/web/src/app/(app)/contracts/ 신규 RTL 테스트: 조항은행 목록·상태 필터·승인 액션 렌더 assert; hidden-routes.test.tsx 갱신 후 /dd·/litigation 등 나머지 봉인은 유지됨 assert
- 수동 검증: 승인권자가 /contracts에서 draft 조항을 승인 후 목록 필터 status=approved로 조회되면 통과

### G: Workflows & External Collaboration

#### G3 [L] 계약검토 워크플로 — 송부/마크업 수령/협상쟁점표

**Goal:** 변호사가 계약 문서를 '고객 송부→상대방 마크업 수령→협상→체결' 단계로 운영하고, 수령한 DOCX의 실제 tracked changes가 자동 redline으로 파싱되며, 조항×redline×playbook finding을 결합한 협상쟁점표를 관리할 수 있다.

**Scope:** (1) ingestion docx 파서에 python-docx/lxml 기반 w:ins/w:del tracked-changes 추출을 추가해 contract_redline_changes를 실제 마크업으로 채움(기존 [[ADD:]]/[[DEL:]] 합성 마커 파서는 fallback 유지). (2) 새 버전 업로드 시 'counterparty markup' 출처 표시 → G1 상태머신의 markup_received 전이와 연결. (3) GET /contract-intel/negotiation-issues — redline change×clause×playbook finding 조인 + 쟁점별 상태(open/agreed/dropped) 컬럼 마이그레이션, matter 계약 탭에 협상쟁점표 뷰·상태 변경. (4) 계약 탭에서 G1 전이 버튼(송부/수령/협상/체결) 호출. 만들지 않는 것: 버전 비교 diff 뷰 자체(B 워크스트림 산출물로 링크만), Closing Binder(G14), 워크플로 엔진.

**완화 노트:** 사양서 §11.1의 Temporal/Camunda 오케스트레이션 엔진 도입을 배제하고 기존 문서 상태머신(packages/domain)+pg-boss 비동기 잡으로 대체. 15단계 전체를 별도 워크플로 테이블로 모델링하지 않고 문서 상태+협상쟁점표로 최소 구현.

**Dependencies:** G1, G2, B(문서 버전 비교 diff API/뷰)

**Code anchors:**
- `workers/ingestion/app/parsers/docx.py`
- `workers/ingestion/tests/test_contract_parser.py`
- `apps/api/src/modules/contract-intel/contract-parser.ts`
- `apps/api/src/modules/contract-intel/contract-intel.service.ts`
- `apps/api/src/modules/contract-intel/contract-intel.controller.ts`
- `db/migrations/0054_create_contract_intelligence.sql`
- `apps/api/src/modules/document/document-editing.service.ts`
- `apps/web/src/lib/api/contract-intel.ts`
- `신규: workers/ingestion/tests/test_docx_tracked_changes.py`
- `신규: db/migrations/00XX_add_negotiation_issue_status.sql`
- `신규: apps/web/src/components/contract/negotiation-issues-table.tsx`

**Acceptance tests (완료판정):**
- 자동: workers/ingestion/tests/test_docx_tracked_changes.py — w:ins/w:del 포함 fixture DOCX에서 삽입/삭제 텍스트·위치가 정확히 추출되고, tracked changes 없는 문서는 기존 경로로 폴백함을 검증
- 자동: tests/integration/contract-intel.spec.ts 확장 — 마크업 버전 처리 후 contract_redline_changes에 실제 변경 행 생성, GET /contract-intel/negotiation-issues가 clause·finding 조인 응답 반환, 쟁점 상태 agreed 전환 시 감사 이벤트 기록
- 수동: 마크업 DOCX를 새 버전으로 업로드 → 계약 탭 협상쟁점표에 변경 조항과 playbook 위반이 행으로 나타나고, 상태를 '합의'로 변경 후 /audit에서 이벤트 확인 → 문서 상태를 '협상'→'체결'로 전이하면 통과

#### G5 [M] DD RFI 템플릿·기한/미매핑 알림

**Goal:** 변호사가 거래유형별 RFI 템플릿으로 자료요청 목록을 일괄 생성하고, 기한 초과·미매핑 RFI를 기존 알림 센터에서 받아 처리할 수 있다.

**Scope:** dd_rfi_templates 테이블(거래유형별 카테고리 트리, seed 2종: M&A 기본/간이 실사)+POST /dd/rfi-templates/:id/instantiate(dd_rfis 일괄 생성). notifications kind에 dd_rfi_overdue·dd_rfi_unmapped 추가 — 0086의 kind DB CHECK 제약 확장 마이그레이션+notifications.service.ts의 라벨/카테고리/href 매핑 확장. pg-boss 스케줄 잡으로 overdue/미매핑 계산→알림 발행(중복 발행 방지 키 포함). 만들지 않는 것: SPA 반영사항 추출, 데이터룸 archive(G14), 자동 매핑(G6).

**Dependencies:** G2

**Code anchors:**
- `apps/api/src/modules/dd/dd.service.ts`
- `apps/api/src/modules/dd/dd.controller.ts`
- `db/migrations/0056_create_dd_vault.sql`
- `apps/api/src/modules/notifications/notifications.service.ts`
- `apps/api/src/modules/notifications/notifications.service.spec.ts`
- `db/migrations/0086_create_dms_notifications.sql`
- `apps/web/src/app/(app)/notifications/notifications-client.tsx`
- `신규: db/migrations/00XX_create_dd_rfi_templates.sql`
- `신규: db/migrations/00XX_add_dd_notification_kinds.sql`

**Acceptance tests (완료판정):**
- 자동: tests/integration/dd-vault.spec.ts 확장 — 템플릿 인스턴스화로 RFI N건 생성(카테고리 트리 보존), due_date가 과거인 RFI에 대해 스케줄 잡 실행 시 dd_rfi_overdue 알림 행 생성, 동일 RFI 재실행 시 중복 알림 미발생
- 자동: apps/api/src/modules/notifications/notifications.service.spec.ts 확장 — 신규 kind 2종의 라벨·카테고리·href 매핑 검증
- 수동: /notifications에서 '기한 초과 RFI' 알림 클릭 → 해당 매터 DD 탭의 RFI 행으로 이동하면 통과

#### G6 [M] 업로드 자동분류→RFI 매핑 추천 확인 큐

**Goal:** DD 매터에 문서가 업로드되면 분류 결과 기반 RFI 매핑 후보가 자동 생성되고, 담당자가 /work 큐에서 확인·승인하면 traceability에 반영된다.

**Scope:** 문서 추출 완료 이벤트(extraction-queue 완료 훅)에서 contract-intel 분류기를 호출해 dd_data_room_mappings 후보를 status=suggested(신규 컬럼)로 생성하고 rfi_id 추천을 붙인다. work_items에 dd_mapping_review kind로 확인 태스크 발행(G13의 kind 확장 사용, openRecordsDisposalWork 패턴의 헬퍼 재사용). 승인 API로 confirmed 전환+감사 이벤트. 만들지 않는 것: LLM 기반 분류 고도화(기존 regex 분류기 r8-local-v1 사용, 분류 품질 개선은 지식그래프/AI 워크스트림), 외부 업로드(G14 아님 — G9/G10과 별개로 고객포털 업로드는 자체 유닛 없이 이 큐를 재사용하는 G10 후속).

**완화 노트:** 자동분류는 기존 regex 분류기(r8-local-v1)를 소비하는 수준으로 시작 — 임베딩/LLM 분류 업그레이드는 타 워크스트림 딜리버리 후 잡 내부 구현만 교체.

**Dependencies:** G5, G13

**Code anchors:**
- `apps/api/src/modules/document/extraction/extraction-queue.service.ts`
- `apps/api/src/modules/contract-intel/contract-classifier.ts`
- `apps/api/src/modules/dd/dd.service.ts`
- `apps/api/src/modules/work/work.service.ts`
- `db/migrations/0056_create_dd_vault.sql`
- `신규: db/migrations/00XX_add_dd_mapping_suggested_status.sql`

**Acceptance tests (완료판정):**
- 자동: tests/integration/dd-vault.spec.ts 확장 — 추출 완료 이벤트 시뮬레이션 → suggested 매핑 행+dd_mapping_review work item 생성, 승인 API 호출 시 confirmed 전환+감사 이벤트, 거절 시 매핑 삭제 및 work item 완료
- 자동: apps/api/src/modules/work/work.service.spec.ts 확장 — dd_mapping_review kind의 발행/완료 헬퍼 검증
- 수동: DD 매터에 계약서 업로드 → /work에 '매핑 확인' 태스크 등장 → 승인 → DD 탭 traceability 화면에 매핑 반영 확인

#### G7 [M] 송무 운영 CRUD·증거번호 자동생성

**Goal:** 변호사가 송무 탭에서 증거·사실(Fact)·쟁점트리를 직접 등록/수정하고, 증거번호('갑 제N호증'/'을 제N호증')가 당사자 방향+순번 규칙으로 자동 제안된다.

**Scope:** G2의 read-only 송무 탭 위에 CRUD 폼 추가: 증거 등록(문서 연결), Fact 등록·draft/verified/disputed/withdrawn 전이, 쟁점트리 노드 편집 — 기존 LitigationController CRUD 엔드포인트를 그대로 소비. GET /litigation/evidence/next-code?matterId&direction 신설 — '갑 제N호증' 규칙 엔진(방향별 최대 순번+1, 가지번호 없이 시작). 만들지 않는 것: 사실관계 자동추출(AI 워크스트림), 판례 리서치 연결(국내 법률데이터 워크스트림), OCR(검색 워크스트림 D).

**완화 노트:** 증거번호는 '갑/을 제N호증' 기본 규칙만 — 가지번호(제N호증의 M)·병합사건 다중 당사자 스킴은 실사용 요구 발생 시 확장.

**Dependencies:** G2

**Code anchors:**
- `apps/api/src/modules/litigation/litigation.service.ts`
- `apps/api/src/modules/litigation/litigation.controller.ts`
- `db/migrations/0057_create_litigation_vault.sql`
- `apps/web/src/lib/api/litigation.ts`
- `apps/web/src/app/(app)/matters/[matterId]/litigation/page.tsx (G2 신설분)`
- `신규: apps/web/src/components/litigation/evidence-form.tsx`
- `신규: apps/web/src/components/litigation/fact-ledger-form.tsx`

**Acceptance tests (완료판정):**
- 자동: tests/integration/litigation-vault.spec.ts 확장 — next-code가 기존 최대 순번+1('갑 제3호증' 형식)을 반환, 방향(갑/을)별 독립 순번, 동시 등록으로 코드 충돌 시 UNIQUE 제약 위반이 사용자 오류로 안전 변환되는지 검증
- 자동: 신규 웹 테스트 evidence-form.test.tsx / fact-ledger-form.test.tsx — 폼 제출→목록 갱신, Fact 상태 전이 버튼이 허용 전이만 노출
- 수동: 송무 탭에서 증거 2건 연속 등록 시 두 번째 증거번호가 자동으로 +1 제안되고, Fact를 verified로 전이하면 /audit에 감사 이벤트가 남으면 통과

**검증 노트(반영 필요 세부):**
- (앵커 부정확 / 테스트 불가능한 완료판정) db/migrations/0057_create_litigation_vault.sql:93의 evidence_code CHECK 제약(^[A-Z0-9][A-Z0-9._-]{1,63}$)은 ASCII 전용이라 '갑 제3호증' 형식을 evidence_code로 저장할 수 없음. 한글은 exhibit_label에만 가능하나 exhibit_label에는 UNIQUE 제약이 없어 '동시 등록 시 UNIQUE 제약 위반' 테스트가 성립하지 않고, '방향(갑/을)별 독립 순번'을 위한 direction 컬럼도 스키마에 없음. 그런데 G7 anchors의 신규 항목은 UI 컴포넌트 2개뿐. 신규 마이그레이션(예: 00XX_add_evidence_direction_and_sequence.sql — direction 컬럼 + (tenant_id, matter_id, direction, seq) UNIQUE, 표시용 라벨은 '갑 제N호증'으로 생성)을 anchors에 추가하고, acceptance test가 어느 컬럼(코드 vs 라벨)의 형식·유일성을 검증하는지 명시하라.

#### G8 [M] 송무 기일 관리 — hearings 테이블+알림+work 태스크

**Goal:** 송무팀이 기일(변론기일·제출마감 등)을 등록하면 D-7/D-1 알림이 알림 센터에 오고 /work에 마감 태스크가 자동 생성된다. 저장소에 전무했던 '기일' 개념이 생긴다.

**Scope:** litigation_hearings 테이블(기일 유형·일시·법정·관련 pleading FK·제출 마감 역산 필드, RLS 포함)+CRUD API+송무 탭 기일 목록 뷰. notifications kind에 litigation_deadline 추가(0086 CHECK 확장), pg-boss 스케줄 잡으로 D-7/D-1 알림 발행(중복 방지 키), work_items에 litigation_deadline kind 태스크 발행(G13 확장 사용). litigation_pleadings.internal_deadline과 연동(마감 역산). 만들지 않는 것: Outlook 캘린더 동기화(이메일 워크스트림 연동 지점만 주석으로 남김), 법원 전자소송 연동.

**Dependencies:** G2, G13

**Code anchors:**
- `apps/api/src/modules/litigation/litigation.service.ts`
- `apps/api/src/modules/litigation/litigation.controller.ts`
- `db/migrations/0057_create_litigation_vault.sql (pleadings internal_deadline 참조)`
- `apps/api/src/modules/notifications/notifications.service.ts`
- `apps/api/src/modules/work/work.service.ts`
- `신규: db/migrations/00XX_create_litigation_hearings.sql`
- `신규: apps/web/src/components/litigation/hearing-list.tsx`

**Acceptance tests (완료판정):**
- 자동: tests/integration/litigation-vault.spec.ts 확장 — 기일 CRUD+타 테넌트 RLS 격리, D-7 이내 기일에 대해 스케줄 잡 실행 시 litigation_deadline 알림+work item 생성, 재실행 시 중복 미발생, 기일 삭제 시 미완료 work item 정리
- 자동: notifications.service.spec.ts 확장 — litigation_deadline kind의 라벨/href(송무 탭 딥링크) 매핑
- 수동: 기일을 6일 뒤 날짜로 등록 후 스케줄 잡 수동 트리거 → /notifications에 기일 알림 표시, 클릭 시 해당 매터 송무 탭 기일 목록으로 이동하면 통과

#### G9 [L] 외부포털 문서 바이트 전달 — 워터마크 뷰어/다운로드

**Goal:** 외부 사용자가 포털에서 공유 문서를 워터마크가 적용된 PDF로 실제 열람·다운로드할 수 있다. '통제는 실동작하지만 문서를 볼 수 없는' 임계 결손이 해소된다.

**Scope:** GET /external/access/:token/content/:linkId 스트리밍 엔드포인트 신설 — preview 모듈의 document_preview_artifacts(PDF 변환본)를 storage에서 읽어 B 워크스트림의 서버사이드 워터마크 렌더러로 외부사용자 표시명·IP·타임스탬프 오버레이 후 스트림 반환(ExternalService에 Storage/Preview 주입). 합성 문자열뿐이던 downloadRef를 external_download_tickets 테이블(단일 사용+TTL)로 영속화해 상환-소진을 감사. 포털 클라이언트에 PDF 뷰어 탑재, watermark_required 링크는 view-only 모드(다운로드 버튼 제거). NDA·만료·회수 게이트는 기존 resolveToken 경로 재사용.

**완화 노트:** 완화 정책에 따라 외부사용자 2FA, IP allow-list, bidder 그룹별 권한, redaction 자동화, 인쇄/복사 뷰어 차단은 만들지 않음. view-only는 다운로드 버튼 제거+티켓 미발급 수준.

**Dependencies:** B(서버사이드 PDF 워터마크 렌더링)

**Code anchors:**
- `apps/api/src/modules/external/external.service.ts`
- `apps/api/src/modules/external/external.controller.ts`
- `db/migrations/0058_create_external_core.sql`
- `db/migrations/0059_external_portal_gate.sql`
- `apps/api/src/modules/preview/preview.service.ts`
- `apps/api/src/modules/preview/preview-convert.job.ts`
- `db/migrations/0035_create_document_preview_artifacts.sql`
- `apps/api/src/modules/storage/storage.service.ts`
- `apps/web/src/app/(external)/external/[token]/external-portal-client.tsx`
- `apps/web/src/lib/api/external-portal.ts`
- `신규: db/migrations/00XX_create_external_download_tickets.sql`

**Acceptance tests (완료판정):**
- 자동: tests/integration/external-portal-gate.spec.ts 확장 — (1) 유효 토큰+티켓으로 200 + application/pdf 바이트 수신 (2) 소진된 티켓 재사용 410 (3) 만료/회수 링크 403 (4) NDA 미동의 상태 403 (5) 콘텐츠 접근마다 EXTERNAL_* 감사 이벤트+access_count 증가
- 자동: 워터마크 오버레이 단위 테스트 — 생성된 PDF 바이트에서 외부사용자 표시명·타임스탬프 텍스트 존재 검증(pdf 텍스트 추출로 assert)
- 수동: 시크릿 창에서 외부 링크 접속 → 브라우저에 PDF가 표시되고 워터마크에 표시명·시각이 보이면 통과, view-only 링크에서 다운로드 버튼 부재 확인
- 성능: 10MB PDF의 first-byte < 2초(로컬 curl 타이밍 스크립트로 3회 측정 중앙값)

#### G10 [L] 외부 공유 관리 UI — 워크스페이스/링크 발급/Q&A 인박스

**Goal:** 변호사가 매터 화면에서 외부 워크스페이스 개설, 외부사용자 초대, 문서 선택→링크 발급/회수, Q&A 답변 작성을 전부 UI로 수행할 수 있다. 'VDR 운영이 API 호출로만 가능' 상태가 해소된다.

**Scope:** matters/[matterId]/sharing 화면 신설 — 기존 내부 관리 API 6종(POST workspaces/users/links, POST links/:id/revoke, GET workspaces/:id/qa, POST qa/:id/answers)에 연결. 링크 발급 시 DLP 경고 수용 모달(기존 공유 전 DLP 스캔+오버라이드 감사 경로 재사용), 문서 선택기는 matter 파일함 컴포넌트 재사용. MatterWorkspaceActions에 '외부 공유' 액션 추가. 백엔드는 목록 조회 GET(workspaces?matterId, workspace별 links/users 목록)만 보강. 외부 사용자용 화면 변경 없음(G9와 독립 머지 가능).

**Dependencies:** 없음

**Code anchors:**
- `apps/api/src/modules/external/external.controller.ts`
- `apps/api/src/modules/external/external.service.ts`
- `apps/web/src/lib/api/external-portal.ts`
- `apps/web/src/components/matter/matter-workspace-actions.tsx`
- `apps/web/src/components/document/matter-file-section.tsx`
- `신규: apps/web/src/app/(app)/matters/[matterId]/sharing/page.tsx`
- `신규: apps/web/src/components/external/link-issuance-dialog.tsx`

**Acceptance tests (완료판정):**
- 자동: 신규 웹 테스트 sharing/page.test.tsx — mock API로 워크스페이스 생성→외부사용자 초대→링크 발급→회수 흐름 렌더링 검증, DLP 위반 응답 시 경고 수용 모달 표시·수용 시에만 발급 진행
- 자동: tests/integration/external-core.spec.ts 확장 — 신규 목록 GET 엔드포인트의 권한 검증(매터 비멤버 403, 타 테넌트 404)
- 수동: UI만으로 워크스페이스+링크를 만들고 시크릿 창에서 외부 포털 접속 성공 → sharing 화면에서 회수 → 재접속 시 403이면 통과; Q&A 인박스에서 외부 질문에 답변 작성 확인

#### G11 [S] 외부 열람 통계 표시

**Goal:** 변호사가 워크스페이스별로 누가 언제 어떤 문서를 열람·다운로드했는지 문서×사용자 집계와 타임라인으로 확인할 수 있다.

**Scope:** GET /external/workspaces/:id/stats — EXTERNAL_LINK_ACCESSED/EXTERNAL_DOWNLOAD_REQUESTED 및 G9의 콘텐츠 접근 감사 이벤트를 문서×외부사용자별 집계(최근 접근 시각·횟수·다운로드 여부). G10 sharing 화면에 집계 테이블+열람 타임라인 섹션 추가. audit_events 원시 조회가 아닌 집계 쿼리로 구현하되 기존 audit 모듈 조회 패턴 재사용.

**완화 노트:** bidder 그룹별 통계·열람통계 export는 완화 정책(VDR 고급 제외)에 따라 제외. closing archive의 통계 manifest는 G14에서 소비.

**Dependencies:** G9, G10

**Code anchors:**
- `apps/api/src/modules/external/external.service.ts`
- `apps/api/src/modules/external/external.controller.ts`
- `apps/api/src/modules/audit (audit_events 조회 패턴 재사용)`
- `apps/web/src/app/(app)/matters/[matterId]/sharing/page.tsx (G10 신설분)`
- `신규: apps/web/src/components/external/workspace-access-stats.tsx`

**Acceptance tests (완료판정):**
- 자동: tests/integration/external-core.spec.ts 확장 — 외부 접근 2회+다운로드 티켓 1회 발생 후 stats 응답의 문서×사용자 카운트·최근 접근 시각 일치, 타 매터 워크스페이스 stats 요청 403
- 자동: workspace-access-stats.test.tsx — 집계 응답 렌더링(0건 빈 상태 포함)
- 수동: 외부 계정으로 문서를 열람한 뒤 sharing 화면 통계에 해당 사용자·문서·시각이 반영되면 통과

#### G12 [S] Q&A 승인흐름·공개범위 (1단계 승인 간소화)

**Goal:** 외부 질문에 대한 내부 답변이 '초안→승인→게시' 1단계 승인(작성자≠승인자)을 거쳐 게시되고, 답변 공개범위(질문자 한정/워크스페이스 전체)를 지정할 수 있다.

**Scope:** external_qa_messages에 status(draft/pending_approval/published/rejected)·visibility_scope(asker_only/workspace) 컬럼 마이그레이션. createAnswer를 초안 저장으로 변경, 승인/거절 API 신설(작성자 본인 승인 차단), 승인 대기를 work_items 'external_qa_approval' kind로 발행(G13 확장 사용). 외부 listQa는 published+visibility 스코프 필터로 제한. G10 Q&A 인박스에 초안/승인 상태 UI 반영. 기존 external_question 방향은 승인 없이 게시 유지(내부 답변만 승인 대상).

**완화 노트:** 사양서의 다단계 승인흐름을 완화 정책에 따라 '답변 승인 1단계'로 간소화. 질문 자체의 사전 검열 큐는 만들지 않음.

**Dependencies:** G10, G13

**Code anchors:**
- `db/migrations/0059_external_portal_gate.sql`
- `apps/api/src/modules/external/external.service.ts`
- `apps/api/src/modules/external/external.controller.ts`
- `apps/api/src/modules/work/work.service.ts`
- `apps/web/src/app/(app)/matters/[matterId]/sharing/page.tsx (G10 Q&A 인박스)`
- `신규: db/migrations/00XX_add_external_qa_approval.sql`

**Acceptance tests (완료판정):**
- 자동: tests/integration/external-portal-gate.spec.ts 확장 — (1) 초안 답변이 외부 listQa에 미노출 (2) 작성자 본인 승인 시도 403 (3) 타 변호사 승인 후 외부 노출+감사 이벤트 (4) asker_only 답변이 같은 워크스페이스의 다른 외부사용자 토큰에 미노출
- 자동: work.service.spec.ts 확장 — external_qa_approval kind 발행/완료
- 수동: sharing Q&A 인박스에서 답변 초안 작성 → 다른 변호사 계정으로 /work의 승인 태스크 처리 → 외부 포털에서 답변 표시되면 통과

#### G13 [M] Work queue 워크플로 태스크 확장 — kind 네임스페이스·배정·페이지네이션

**Goal:** /work 큐가 records/문서 운영 7종을 넘어 계약검토·DD·송무·외부 Q&A 워크플로 태스크를 담당자 지정·재배정과 함께 다룰 수 있다. G6/G8/G12가 소비할 공통 기반이다.

**Scope:** work_items.kind CHECK 제약을 워크플로 네임스페이스(contract_review_stage, dd_rfi_due, dd_mapping_review, external_qa_approval, litigation_deadline)로 확장하는 마이그레이션(0084/0085 패턴). WorkService에 openRecordsDisposalWork 패턴을 일반화한 openWorkflowWork/completeWorkflowWork 헬퍼(도메인 서비스가 호출하는 공용 API). assigned_to 재배정 엔드포인트, 목록 상한 20건 제거→페이지네이션+kind/담당자 필터. /work UI에 필터·페이지네이션·담당자 표시/재배정 추가. 각 kind의 발행 로직 자체는 소비 유닛(G6/G8/G12) 소관.

**Dependencies:** 없음

**Code anchors:**
- `apps/api/src/modules/work/work.service.ts`
- `apps/api/src/modules/work/work.controller.ts`
- `apps/api/src/modules/work/work.service.spec.ts`
- `db/migrations/0084_create_dms_work_items.sql`
- `db/migrations/0085_expand_dms_work_items.sql`
- `apps/web/src/app/(app)/work/work-queue-client.tsx`
- `apps/web/src/app/(app)/work/work-queue-client.test.tsx`
- `신규: db/migrations/00XX_expand_work_item_workflow_kinds.sql`

**Acceptance tests (완료판정):**
- 자동: work.service.spec.ts 확장 — 신규 kind 5종 발행/완료/재배정, 허용 외 kind INSERT가 DB CHECK로 거부, 기존 records/문서 kind 회귀 통과
- 자동: work-queue-client.test.tsx 확장 — kind 필터 선택 시 목록 갱신, 21건 이상에서 페이지네이션 컨트롤 렌더링, 담당자 재배정 액션 호출 검증
- 수동: 시드로 25건 태스크 생성 후 /work에서 페이지 이동·kind 필터·재배정을 수행하고, 재배정된 담당자 계정에서 해당 태스크가 보이면 통과

### H: Platform, Security-lite & 국내 연동

#### H4 [L] IaC-lite — 수동 프로덕션의 Terraform 코드화 (ECS/RDS/ALB/S3 최소 세트)

**Goal:** 콘솔 수동 관리 중인 AWS Seoul 프로덕션(ECS Fargate+RDS+ALB+S3+ECR+Secrets Manager)이 Terraform으로 재현·검증 가능해지고, terraform plan 무변경(no drift)으로 현행 인프라가 코드와 일치함을 입증할 수 있다.

**Scope:** 신규 infra/terraform/에 모듈 구성: vpc·rds(자동백업/암호화 파라미터 포함)·ecs(api/web/ingestion 서비스+태스크 정의)·alb·s3(버전닝·SSE·라이프사이클)·ecr·secrets·cloudwatch alarms(기본 3종). 기존 리소스는 terraform import로 수용해 재생성 없음. state는 S3 backend+lock. staging-deploy.yml의 TBD_APPROVAL_REQUIRED 입력값을 terraform output 참조로 문서화. CI에 terraform fmt/validate 잡 추가. 만들지 않음: EKS/k8s, 멀티AZ 상향, 오토스케일, 멀티리전, prod-gate deploy.enabled 활성화(별도 의사결정), CD 자동 배포.

**완화 노트:** 사양 §11.1의 Kubernetes·§13의 99.99% HA/오토스케일/동시 10,000명은 완화 정책으로 제외 — 현행 단일 구성을 코드화만 한다. Cold storage(medium finding)는 s3.tf의 라이프사이클 규칙 1개로 최소 흡수.

**교정(검증·비평 반영):** 교차 교정: H2로 이연 — 사용자 가치 없음, 운영 리스크 핵심(백업·PITR·암호화)은 H3(유닛)가 H1에서 커버. H3 확정값 승계 deps 유지.

**Dependencies:** H3(백업·암호화 설정 확정값을 tf 파라미터로 승계)

**Code anchors:**
- `infra/ci/staging-deploy.yml (TBD 입력)`
- `infra/ci/prod-gate.yml (deploy.enabled:false 유지)`
- `infra/docker-compose.dev.yml (서비스 구성 참조)`
- `docs/release/launch-blocker-ledger.md (LRB-001~004·008 확정값: ap-northeast-2, ECR, Secrets Manager/KMS, CloudWatch/SNS)`
- `.github/workflows/ci.yml (fmt/validate 잡 추가)`
- `tools/release/staging-smoke.mjs (재현 검증에 재사용)`
- `신규: infra/terraform/{main.tf,vpc.tf,rds.tf,ecs.tf,alb.tf,s3.tf,ecr.tf,secrets.tf,alarms.tf,outputs.tf}`
- `신규: docs/release/infra-terraform-runbook.md`

**Acceptance tests (완료판정):**
- 자동: .github/workflows/ci.yml의 terraform fmt -check && terraform validate 잡이 PR에서 통과.
- 수동(드리프트 증명): 운영 자격증명으로 import 완료 후 terraform plan 출력이 'No changes' — plan 출력 캡처를 infra-terraform-runbook.md에 기록하면 통과.
- 수동(재현성 증명): runbook만 보고 스테이징 환경 1식을 terraform apply로 기동한 뒤 tools/release/staging-smoke.mjs 스모크가 exit 0.
- 수동: RDS 자동백업·S3 버전닝/SSE 설정이 tf 코드에 선언돼 있고 H3 runbook의 실측값과 일치하는지 리뷰 체크리스트로 확인.

**검증 노트(반영 필요 세부):**
- (horizon 부적절) IaC-lite는 사용자 가치가 없고 운영 리스크의 핵심(백업·PITR·암호화)은 H3가 H1에서 커버한다. H2로 이연하라. deps(H3 확정값 승계)는 그대로 유효.

#### H7 [M] 대량 다운로드 임계 알림 — DLP 행위 감지 1건

**Goal:** 단시간 대량 다운로드(기본 1시간 내 50건 또는 500MB 초과)가 발생하면 보안 관리자에게 알림이 도달하고 전용 감사 이벤트가 남는다.

**Scope:** (1) audit_events의 DOCUMENT_DOWNLOADED를 소스로 사용자×1시간 슬라이딩 윈도의 건수/바이트를 집계하는 pg-boss 주기 잡(5분 간격, 신규 bulk-download-monitor.service.ts). (2) 임계 초과 시 신규 dlp_behavior_alerts 테이블 기록 + DLP_BULK_DOWNLOAD_DETECTED 감사 액션 + notifications로 firm_admin/security_admin 통지(동일 윈도 중복 알림 억제). (3) 임계값(건수/바이트/윈도)은 enterprise_dms_configuration 설정으로 노출, 기본값 하드코딩. (4) /admin/security에 알림 목록 패널. 만들지 않음: 자동 다운로드 차단·계정 정지·승인 강제 등 단계적 대응, UEBA 스코어링, SIEM 전송, 퇴사예정자 프로파일링.

**완화 노트:** 완화 정책 'DLP는 현행 한국형 검출기 + 대량 다운로드 임계 알림 1건' — 감지·알림까지만 하고 차단/대응 자동화는 제외.

**Dependencies:** 없음

**Code anchors:**
- `apps/api/src/modules/dlp/dlp.service.ts (모듈 확장 지점)`
- `apps/api/src/modules/document/document-lifecycle.service.ts (:191-222 DOCUMENT_DOWNLOADED 소스)`
- `apps/api/src/modules/audit/audit.service.ts`
- `apps/api/src/modules/notifications/notifications.service.ts`
- `db/migrations/0082_create_enterprise_dms_configuration.sql (임계 설정 저장처)`
- `packages/shared/src/audit/audit-event-types.ts`
- `apps/web/src/app/(app)/admin/security/page.tsx`
- `신규: db/migrations/0099_create_dlp_behavior_alerts.sql`
- `신규: apps/api/src/modules/dlp/bulk-download-monitor.service.ts`
- `신규: tests/integration/dlp-bulk-download.spec.ts`

**Acceptance tests (완료판정):**
- 자동: tests/integration/dlp-bulk-download.spec.ts — 1시간 윈도 내 DOCUMENT_DOWNLOADED 51건 시드 후 모니터 잡 1회 실행→dlp_behavior_alerts 1행 + DLP_BULK_DOWNLOAD_DETECTED 감사 + notifications 항목 생성; 동일 윈도 재실행 시 중복 알림 0(멱등); 49건이면 무알림; 타 테넌트 이벤트 미집계(RLS).
- 자동: bulk-download-monitor.service.spec.ts — enterprise_dms_configuration 임계 오버라이드(건수/바이트) 반영과 바이트 기준 단독 초과 케이스 검증.
- 수동: 스테이징에서 테스트 계정으로 문서 55건 연속 다운로드→/notifications 수신함과 /admin/security 패널에서 알림 1건 확인되면 통과.

#### H8 [M] 보존정책 Matter 바인딩 + 폐기검토 자동 스케줄

**Goal:** Matter에 보존정책이 바인딩되고, 종결 후 보존기간이 만료된 매터의 문서에 대해 폐기검토 요청이 자동 생성되어 기존 직무분리 승인 체인(요청→승인→실행→인증서)으로 흘러간다.

**Scope:** (1) 마이그레이션: matters.retention_policy_id FK + documents 오버라이드 컬럼(기본은 매터 상속). (2) matter 생성/템플릿(enterprise_dms_matter_templates)에 기본 보존정책 지정. (3) 야간 pg-boss 잡(신규 retention-scheduler.service.ts): 종결일+retention_days 만료 매터 스캔→기존 disposal_requests를 pending_review로 자동 생성 + dms_work_items 폐기검토 태스크 배정, Legal Hold 활성 문서는 기존 assertNoActiveHoldsForDocument 재사용으로 자동 제외, RETENTION_REVIEW_SCHEDULED 감사 액션. (4) /records UI에 폐기검토 대기 목록 노출. (5) 보존정책 기준 문서 docs/records-retention-policy.md(정책 카탈로그·기간 근거). 만들지 않음: 승인 없는 자동 실삭제, 문서 단위 정책 편집 UI 세분화, 9종 비밀등급 연동.

**완화 노트:** records/보존/legal hold는 '반드시 유지' 대상이라 축소 없음. 다만 자동화 범위는 '검토 요청 생성'까지로 한정 — 실제 폐기는 기존 2인 직무분리 승인 체인을 그대로 통과해야 한다.

**Dependencies:** 없음

**Code anchors:**
- `db/migrations/0060_records_governance.sql (retention_policies·disposal_requests, :352 'automatic deletion is not implemented' 주석)`
- `apps/api/src/modules/records/records.service.ts (:439-500 정책 CRUD, 폐기 체인 재사용)`
- `apps/api/src/modules/records/records.controller.ts`
- `apps/api/src/modules/matter/matter.service.ts`
- `apps/api/src/modules/work/work.service.ts (dms_work_items)`
- `db/migrations/0088_create_enterprise_dms_matter_templates.sql`
- `apps/web/src/app/(app)/records/records-governance-client.tsx`
- `apps/web/src/lib/api/records.ts`
- `packages/shared/src/audit/audit-event-types.ts`
- `신규: db/migrations/0100_bind_retention_policies.sql`
- `신규: apps/api/src/modules/records/retention-scheduler.service.ts`
- `신규: docs/records-retention-policy.md`

**Acceptance tests (완료판정):**
- 자동: tests/integration/records-governance.spec.ts 확장 — retention_days=1 정책을 바인딩한 매터를 종결일 과거로 시드→스케줄러 1회 실행→disposal_requests pending_review 1건 + dms_work_items 태스크 1건 + RETENTION_REVIEW_SCHEDULED 감사 생성; legal hold 활성 문서는 요청에서 제외; 재실행 시 중복 요청 0(멱등).
- 자동: retention-scheduler.service.spec.ts — 경계 케이스(종결일 없음/정책 미바인딩/retention_days NULL=무기한 보존) 모두 스킵 처리 검증.
- 자동: tests/integration/legal-hold.spec.ts 회귀 통과.
- 수동: /records에서 정책 생성→매터 바인딩→폐기검토 목록에 시드 항목 표시→기존 승인 플로로 처분 인증서 발급까지 완주하면 통과.

#### H9 [S] 감사로그 일일 앵커 해시 — 간소 해시체인

**Goal:** 감사로그가 하루 단위 앵커 해시로 체인 봉인되어 DB 관리자 수준의 사후 변조도 재계산 대조로 탐지할 수 있고, 검증 명령 한 번으로 무결성을 확인할 수 있다.

**Scope:** (1) 일일 pg-boss cron 잡: 전일 audit_events(seq 범위)의 결정적 직렬화 해시 + 전일 앵커를 체인한 audit_daily_anchors 테이블(신규, 0006의 append-only 트리거 패턴 재사용) 기록, AUDIT_ANCHOR_RECORDED 감사 액션. (2) 앵커 해시를 S3 오브젝트로도 기록(기존 스토리지 어댑터 재사용; Object Lock 권장 설정은 문서화). (3) 검증 도구 tools/db/verify-audit-anchors.mjs — 지정 구간 재해시 대조. (4) /audit 콘솔에 최근 앵커 검증 상태 표시(간단 배지). 만들지 않음: 행별 prev_hash 체인(감사 insert 핫패스 무변경), 외부 TSA 타임스탬프, SIEM 전송, WORM 계약.

**완화 노트:** 완화 정책에 따라 행별 해시체인+외부 WORM 대신 '일일 앵커 해시' 간소 방식. SIEM 커넥터 제외 유지.

**Dependencies:** 없음

**Code anchors:**
- `apps/api/src/modules/audit/audit.service.ts (:94-131 insert 경로 — 무변경 유지 확인용)`
- `apps/api/src/modules/audit/audit-query.service.ts`
- `db/migrations/0006_audit_append_only.sql (append-only 트리거 패턴)`
- `packages/shared/src/audit/audit-event-types.ts`
- `apps/api/src/modules/storage/storage.service.ts (S3 앵커 기록 재사용)`
- `tests/integration/audit-immutability.spec.ts`
- `신규: db/migrations/0101_create_audit_daily_anchors.sql`
- `신규: apps/api/src/modules/audit/audit-anchor.service.ts`
- `신규: tools/db/verify-audit-anchors.mjs`

**Acceptance tests (완료판정):**
- 자동: tests/integration/audit-immutability.spec.ts 확장 — 이벤트 N건 시드→앵커 잡 실행→anchors 행이 전일 앵커를 참조해 체인 생성; superuser 커넥션으로 이벤트 1행 변조 후 verify 재계산이 불일치를 검출해 실패 리포트 반환.
- 자동: audit-anchor.service.spec.ts — 결정적 직렬화(동일 입력→동일 해시), 이벤트 0건인 날짜의 앵커 처리, seq 경계(전일 마지막/당일 첫 이벤트) 검증.
- 수동: tools/db/verify-audit-anchors.mjs를 스테이징 DB에 실행해 'all anchors verified' 출력 + S3에 앵커 오브젝트 존재 확인하면 통과.

**검증 노트(반영 필요 세부):**
- (과대·과소 scope) S로는 과소 의심. 구성요소가 신규 마이그레이션(0101) + 결정적 직렬화·체인 해시·S3 앵커 기록을 포함한 anchor 서비스 + 독립 verify CLI(tools/db/verify-audit-anchors.mjs) + superuser 변조 검출 통합테스트 확장 + 서비스 단위 spec으로, 동일 워크스트림의 M 유닛(H7·H8)과 유사한 분량. size를 M으로 상향하거나, S를 유지하려면 verify CLI와 S3 앵커 오브젝트 기록을 후속 유닛으로 분리하라(테이블 체인 + 일일 잡 + 통합테스트만 S 범위).

#### H11 [L] 파일서버/PST 임포트 어댑터 — OneDrive 마이그레이션 도구체인 일반화

**Goal:** 사내 파일서버(SMB 마운트/로컬 디렉토리)와 Outlook PST 아카이브를 기존 dry-run→승인 워크북→쓰기→closeout 파이프라인으로 Vault에 wave 단위 임포트할 수 있다.

**Scope:** (1) 파일서버: 신규 fileserver-profile-manifest.mjs — 디렉토리 트리 크롤→매니페스트(경로/SHA-256/크기/mtime), onedrive-import-target-resolution.mjs의 matter_code blocker 규칙 재사용, 이후 dry-run/승인/write/closeout 스테이지는 기존 onedrive-* 스크립트를 소스 파라미터화해 공유. (2) PST: readpst(libpst)로 PST→EML+첨부 전개 후 기존 email.service 수신 저장 경로를 배치 호출하는 pst-import.mjs, 메시지 해시 기반 중복 스킵. (3) wave 실행 기록을 docs/release 패턴(production import wave)으로 유지, 임포트 runbook 작성. 만들지 않음: SharePoint/iManage/NetDocuments 어댑터, 사양 §14.3 마이그레이션 AI 8종(매핑 제안), 실시간 동기화.

**완화 노트:** 사양 §14.1 소스 중 실제 보유 소스(파일서버·PST)만 구현. AI 매핑 8종은 제외 — 결정론적 규칙+휴먼 승인 워크북 방식 유지.

**교정(검증·비평 반영):** 교차 교정: PST 항목은 이메일이므로 .msg 반출→C10/C11 파싱 경로 유입을 완료판정에 명시(문서 파이프라인 단독 적재 금지 — D8과 데이터 모델 정합).

**Dependencies:** C11(MSG 파싱 — PST 항목 유입 경로)

**Code anchors:**
- `tools/migration/onedrive-profile-manifest.mjs (+spec.mjs 패턴)`
- `tools/migration/onedrive-import-target-resolution.mjs (:93-102 blocker 규칙 재사용)`
- `tools/migration/onedrive-pilot-dryrun.mjs`
- `tools/migration/onedrive-pilot-import.mjs`
- `tools/migration/onedrive-approval-workbook.py`
- `tools/migration/onedrive-pilot-closeout.mjs`
- `apps/api/src/tools/onedrive-customer-wide-import-runner.ts`
- `apps/api/src/modules/email/email.service.ts (이메일 저장 경로 재사용)`
- `신규: tools/migration/fileserver-profile-manifest.mjs (+spec.mjs)`
- `신규: tools/migration/pst-import.mjs (+spec.mjs)`
- `신규: docs/release/fileserver-pst-import-runbook.md`

**Acceptance tests (완료판정):**
- 자동: tools/migration/fileserver-profile-manifest.spec.mjs — 픽스처 디렉토리에 대해 매니페스트 건수·해시·mtime 정확성과 matter_code 형식 불량 blocker 판정 검증; dry-run 모드에서 DB/스토리지 쓰기 0건 보장.
- 자동: tools/migration/pst-import.spec.mjs — 소형 픽스처 PST(메시지 5건+첨부)로 EML 전개 건수, 중복 해시 스킵, 매핑 실패 메시지의 blocker 처리 검증.
- 자동(통합): 스테이징에서 dry-run→승인 워크북→write 실행 후 closeout 스크립트의 매니페스트 대 실적 건수 대조가 exit 0.
- 수동: 실제 파일서버 샘플 폴더 1 wave 임포트→/files·/matters에서 문서 확인, PST 1개 임포트→email vault 스레드 확인, 감사로그에 임포트 액션 기록 확인하면 통과.

**검증 노트(반영 필요 세부):**
- (앵커 부정확) PST 아카이브의 항목은 이메일인데 현재 완료판정은 문서 임포트 파이프라인으로만 적재한다. 이대로면 파일링 이메일 정규화(C 워크스트림)·이메일 본문 검색(D8)과 데이터 모델이 갈라진다. PST 항목을 .msg로 반출해 C10/C11 파싱 경로로 유입시키는 것을 완료판정에 명시하고 deps에 C11을 추가하라.

## Horizon 3 — 지식·AI 계층 (9~18개월)

### A: Matter Core & Intake

#### A13 [M] 종료 매터 지식은행 후보 파이프라인 (/work 검토 큐 연동)

**Goal:** 매터가 closed되면 재사용 가치가 있는 문서(체결본·최종 의견서·조항 후보)가 지식은행 후보 목록으로 자동 추출되어 /work 검토 큐에 나타나고, 검토자가 승인/반려할 수 있다.

**Scope:** 만들 것: (1) 마이그레이션 — knowledge_candidates(matter_id, document_version 참조, 후보 유형 executed/opinion/clause_source, 상태 proposed/approved/rejected, 검토자·근거, RLS FORCE). (2) close 이벤트 구독 잡 — closed 전이 시 Closing Binder 매니페스트와 문서 메타데이터(유형 태그·official 상태)를 규칙 기반으로 스캔해 후보 생성(workers/ingestion에 배치 엔드포인트 또는 API 측 후처리 잡 — 기존 ingestion 라우터 패턴 재사용). (3) work 모듈에 후보 검토 work_item 유형 추가(0084/0085 work_items 스키마 확장)해 /work 큐에 노출, 승인 시 문서에 지식은행 태그 부여. (4) 승인/반려 감사 기록. 만들지 않을 것: 조항 자동 추출·임베딩 분석(Knowledge Graph 워크스트림의 조항은행이 소비할 후보 목록까지만), LLM 기반 요약.

**완화 노트:** 후보 추출은 규칙 기반(문서 유형·official 상태·바인더 포함 여부)으로 한정. 조항 단위 분해와 품질 스코어링은 Knowledge Graph 워크스트림으로 이관.

**교정(검증·비평 반영):** 교차 교정: deps의 워크스트림 오기(E→F11) 정정, /work 신규 태스크 kind 사용으로 G13 의존 추가.

**Dependencies:** A11, A12, F11(조항은행 2.0), G13(work queue kind 확장)

**Code anchors:**
- `신규: db/migrations/0106_create_knowledge_candidates.sql`
- `신규: apps/api/src/modules/matter/knowledge-candidate.service.ts`
- `apps/api/src/modules/matter/closing-binder.service.ts`
- `apps/api/src/modules/work/work.service.ts`
- `db/migrations/0084_create_dms_work_items.sql`
- `db/migrations/0085_expand_dms_work_items.sql`
- `workers/ingestion/app/main.py`
- `apps/web/src/app/(app)/work/work-queue-client.tsx`
- `apps/web/src/app/(app)/work/work-queue-client.test.tsx`

**Acceptance tests (완료판정):**
- 자동: 신규 tests/integration/knowledge-candidates.spec.ts — (a) 바인더 포함 체결본이 있는 매터를 closed 전이하면 후보 행이 proposed로 생성, (b) 동일 매터 재전이 시 중복 후보 미생성(멱등), (c) 승인 시 문서 메타데이터에 지식은행 태그 반영+감사 기록, (d) restricted 매터 후보는 열람권 있는 검토자에게만 큐 노출
- 자동: work-queue-client.test.tsx 확장 — 지식은행 후보 유형 work item 렌더링과 승인/반려 액션 페이로드 검증
- 수동: 테스트 매터를 종료한 뒤 /work 큐에 후보 항목이 나타나고 승인 처리하면 목록에서 제거되며 audit 콘솔에 승인 기록이 보이면 통과

**검증 노트(반영 필요 세부):**
- (horizon 부적절) deps의 'E(Knowledge Graph — 조항은행이 승인 후보를 소비)'는 의존 방향이 반대 — 설명 자체가 E가 A13의 산출물(승인 후보)을 소비한다고 밝히고 있으므로 E는 선행 의존이 아니라 하류 소비자임. A13은 A11·A12+기존 /work 큐만으로 완결 가능하므로 deps에서 E를 제거하고 'E의 조항은행이 본 유닛의 승인 후보를 소비함'을 노트로만 남길 것. 타 워크스트림의 horizon 미상 유닛에 H3 유닛을 결박하면 불필요한 블로킹이 발생함.
- (앵커 부정확) deps의 'E(Knowledge Graph — 조항은행)'는 워크스트림 문자 오기 — Knowledge Graph/조항은행은 F(F11)다. F11로 정정하라. 또한 /work 검토 큐에 신규 태스크 종류를 추가하므로 G13(work queue kind 네임스페이스 확장)을 deps에 추가해야 한다.

### B: Document Vault & Editing

#### B13 [L] 문서 비교 2단계 — AI 법률 의미 요약, 상대방 유리 변경 탐지, 변경요약 이메일 초안

**Goal:** 조항 diff 결과 위에 변경별 법률적 의미 요약, 당사자 역할 기반 유불리 분류, 협상 포지션 태깅이 생성되고, 고객에게 보낼 변경요약 이메일 초안이 한 번의 액션으로 만들어진다.

**Scope:** 만드는 것: (1) B11의 comparison_clause_changes를 입력으로 AI 요약 파이프라인 — 기존 ai-policy 게이트(Permission-before-AI, ai_allowed 플래그)를 통과한 문서만 처리, Gemma 구조화+Strong LLM 라우팅(E 워크스트림 기반) 사용, 결과를 comparison_clause_changes 확장 컬럼(summary, favorability: ours/theirs/neutral, position_tag)에 저장하고 AI_RESPONSE 감사에 프롬프트/출력 원문 기록. (2) 유불리 판정에 matter party 데이터(당사자 역할)를 컨텍스트로 주입. (3) 변경요약 이메일 초안 생성기 — 비교 결과 화면에서 '고객 변경요약 초안' 버튼 → 수신자·문안 편집 후 Outlook 송부 연결(C 워크스트림 send 경로). (4) 비교 탭에 유불리 배지·요약 표시. 만들지 않는 것: 자동 송부(초안 생성까지만), 판례/법령 근거 인용(F 레인), 협상 전략 추천.

**완화 노트:** AI 감사 로그는 내부용이므로 해시 전용이 아닌 프롬프트/출력 원문 저장으로 강화(운영 전제 반영).

**Dependencies:** B11, E(Gemma 구조화+Strong LLM 라우팅), C(Outlook Graph 송부 연동)

**Code anchors:**
- `신규: apps/api/src/modules/document/comparison/comparison-ai.service.ts`
- `apps/api/src/modules/ai-policy`
- `packages/ai/src/index.ts`
- `apps/api/src/modules/party`
- `apps/api/src/modules/outlook/outlook-document-insertion.service.ts`
- `apps/web/src/components/document/document-action-center.tsx`
- `신규: db/migrations/0103_extend_comparison_ai_columns.sql (번호 조정)`
- `tests/integration/ai-policy.spec.ts`

**Acceptance tests (완료판정):**
- 자동: 신규 tests/integration/document-access/comparison-ai.spec.ts — ai_allowed=false 문서의 비교 AI 요청이 fail-closed 거부되고, 허용 문서는 조항 변경별 summary/favorability가 저장되며 AI_RESPONSE 감사에 프롬프트·출력 원문이 기록됨(LLM은 테스트 스텁 라우트)
- 자동: 동일 spec — 당사자 역할 반전 시(우리가 매도인↔매수인) 동일 변경의 favorability가 반전되는 컨텍스트 주입 검증
- 자동: apps/web/src/components/document/document-action-center.test.tsx 확장 — 유불리 배지 렌더와 이메일 초안 모달 열림
- 수동: 파일럿 변호사가 실제 협상 문서 2버전 비교 → 요약·유불리 10건 표본 중 8건 이상 타당 판정(체크리스트 기록) + 이메일 초안이 Outlook 초안함에 생성되면 통과

#### B14 [L] Word Add-in — 조항은행 검색·삽입

**Goal:** 변호사가 Word에서 문서를 작성하다가 작업창(taskpane)에서 조항은행을 검색해 표준 조항을 커서 위치에 바로 삽입할 수 있다.

**Scope:** 만드는 것: (1) Office.js Word add-in — 기존 Outlook add-in 구조(apps/web/src/app/outlook-addin/, SSO·권한·감사 패턴)를 복제한 apps/web/src/app/word-addin/ 라우트와 taskpane UI. (2) 조항은행 검색 API(F 워크스트림 조항은행) 호출 → 조항 미리보기 → Word JS API(body.insertOoxml/insertText)로 커서 위치 삽입, 삽입 이벤트 감사 기록(문서 컨텍스트·조항 ID). (3) manifest 렌더링 도구(render-outlook-manifest.mjs 패턴)로 word-addin manifest 생성과 배포 체크 스크립트. 만들지 않는 것: Vault 문서를 Word에서 직접 여는 WOPI 경로(B12/ADR-018 결정 사항), 조항 자동 추천(F 후속), Excel/PowerPoint add-in.

**Dependencies:** F(조항은행 검색 API)

**Code anchors:**
- `apps/web/src/app/outlook-addin/outlook-addin-client.tsx`
- `apps/web/src/app/outlook-addin/outlook-manifest.spec.ts`
- `tools/release/render-outlook-manifest.mjs`
- `tools/release/check-outlook-deployment.mjs`
- `신규: apps/web/src/app/word-addin/page.tsx`
- `신규: apps/web/src/app/word-addin/word-addin-client.tsx`
- `신규: tools/release/render-word-manifest.mjs`
- `apps/api/src/modules/graph/graph-sync.service.ts`
- `apps/web/src/lib/api-client.ts`

**Acceptance tests (완료판정):**
- 자동: 신규 apps/web/src/app/word-addin/word-addin-client.test.tsx — 검색 입력→조항 목록 렌더→삽입 버튼이 Office.js 목(insertOoxml)을 조항 본문으로 호출, 미인증 시 로그인 유도(outlook-addin-client.test.tsx 패턴)
- 자동: 신규 apps/web/src/app/word-addin/word-manifest.spec.ts — 렌더된 manifest가 Word 호스트·taskpane URL·권한 스코프 스키마 검증 통과
- 자동: 조항 삽입 감사 이벤트가 기록되는 API 통합 테스트(tests/integration/graph.spec.ts 확장 또는 신규 clause-insertion.spec.ts)
- 수동: 데스크톱 Word에 사이드로드 → '해지 조항' 검색 → 삽입 → 문서 커서 위치에 조항 본문 삽입 확인, 감사 콘솔에 이벤트 표시면 통과

### C: Email Vault

#### C14 [M] 송부 전 DLP 콘텐츠 검사 — Smart Alerts 클라이언트 스캔 + 이그레스 서버 스캔

**Goal:** 외부 수신자에게 이메일을 보내기 전 주민번호·계좌 등 민감정보가 본문·첨부에서 검출되면 Smart Alert로 경고·차단되고, send-and-file 이행 시 서버가 원문을 재검사해 이그레스 판정을 감사에 남긴다.

**Scope:** (1) SensitiveDataDetector의 한국형 검출 규칙(주민번호·외국인등록번호·계좌·여권·카드Luhn 등)을 packages/shared로 이동하고 apps/api detector는 shared 규칙을 소비하도록 리팩터(동작 동일성 유지). (2) smart-alerts.js OnMessageSend 핸들러에서 item.body.getAsync 본문+접근 가능한 첨부를 로컬 스캔, 판정코드·매칭 항목 해시만 서버 보고(제로 콘텐츠 원칙 유지), evaluateSendPolicy에 dlp_finding 경고코드 추가 — restricted급 검출+외부수신자 조합은 승인 불가 차단. (3) 현행 오류 시 completeAllow fail-open(smart-alerts.js 228-230행)을 'DLP 스캔 실패 시 경고 후 허용, 정책 차단 판정 시 fail-close'로 명시화. (4) 서버측: C6 이행 워커가 send_and_file 원문 취득 시 DlpService.scanAndRecord 실행 — dlp_findings에 source_type='email_egress' 추가 마이그레이션(0044 패턴 준용), block 판정 시 파일링 실패 처리+감사. 대량 다운로드 임계 알림 등 다른 DLP 확장은 범위 외.

**완화 노트:** 내부 9인 펌 전제로 CASB급 이그레스 통제·첨부 전수 심층 스캔은 제외. 클라이언트측 스캔은 텍스트 본문+텍스트성 첨부 중심, 검사 결과는 해시·판정코드만 서버 전송(제로 콘텐츠 원칙 유지).

**교정(검증·비평 반영):** 교차 교정: 완화정책 초과로 H3 강등. scope를 "현행 검출기를 재사용하는 송부 전 검사 1종(클라이언트 또는 서버 중 하나)"으로 축소. C7 의존 추가.

**Dependencies:** C6, C7(add-in 파일럿 배포 전제)

**Code anchors:**
- `apps/api/src/modules/dlp/sensitive-data.detector.ts (규칙 43-94행 shared로 이동)`
- `apps/api/src/modules/dlp/dlp.service.ts (scanAndRecord, model_egress 패턴 72-102행)`
- `apps/api/src/modules/outlook/outlook-send-file.service.ts (evaluatePolicyInternal 328-363행)`
- `apps/api/src/modules/outlook/outlook-send-file.service.spec.ts`
- `apps/web/public/outlook-addin/smart-alerts.js (fail-open 228-230행)`
- `packages/shared/src/outlook/outlook-types.ts (send policy 스키마 122-185행)`
- `db/migrations/0044_r5_dlp_egress_and_detector_constraints.sql (패턴 참조)`
- `신규: packages/shared/src/dlp/sensitive-data-rules.ts`
- `신규: packages/shared/src/dlp/sensitive-data-rules.spec.ts`
- `신규: db/migrations/01xx_dlp_email_egress_source.sql`

**Acceptance tests (완료판정):**
- packages/shared/src/dlp/sensitive-data-rules.spec.ts: 기존 apps/api/src/modules/dlp/sensitive-data.detector.spec.ts의 전 케이스를 shared로 이식해 동작 동일성 회귀 검증(주민번호·계좌·카드Luhn 등 검출/비검출 케이스 전부 통과)
- outlook-send-file.service.spec.ts 확장: dlp_finding 경고코드 보고 시 (1) 일반 검출+외부수신자→경고+승인 요구, (2) restricted급 검출→승인 불가 차단, (3) 스캔 실패 보고→경고 후 허용 — 3케이스 판정 assert
- 신규 tests/integration/document-access/email-egress-dlp.spec.ts: 주민번호 포함 픽스처 MIME으로 send_and_file 이행 시 dlp_findings(source_type='email_egress') 기록+block 판정 시 파일링 failed+감사이벤트 assert
- 수동: 개발 테넌트에서 주민번호를 본문에 넣고 외부 주소로 발송 시도→Smart Alert 차단 프롬프트 표시, 제거 후 발송 성공하면 통과

**검증 노트(반영 필요 세부):**
- (완화정책 위반) 완화정책 '유지하되 간소화'는 DLP를 '현행 한국형 검출기 유지 + 간단한 대량 다운로드 임계 알림 1건'으로 한정하는데, C14는 송부 전 콘텐츠 검사라는 새 DLP 표면(클라이언트 Smart Alerts 스캔, 서버 이그레스 MIME 스캔, restricted급 차단 정책, 신규 source_type 마이그레이션, 검출 규칙 shared 패키지 이관)을 추가해 이 한정을 초과한다. 유닛을 제거하거나 정책 예외로 명시 승인을 받아라. 유지가 필요하면 최소 범위로 축소: 기존 apps/api/src/modules/dlp/sensitive-data.detector.ts를 그대로 재사용해 send_and_file 이행 시 서버측 경고(감사이벤트 기록) 전용으로 한정하고, 차단 판정·클라이언트 스캔·규칙 이관은 제외하라.
- (완화정책 위반) 완화 정책은 DLP를 '현행 한국형 검출기 유지 + 대량 다운로드 임계 알림 1건(H7)'으로 한정했다. C14의 Smart Alerts 클라이언트 스캔 + 이그레스 서버 재검사 이중 체계는 이를 초과한다. H3로 강등하고 scope를 '현행 검출기를 재사용하는 송부 전 검사 1종(클라이언트 또는 서버 중 하나)'으로 축소하라. 또한 Smart Alerts는 add-in 배포가 전제이므로 deps에 C7을 추가해야 한다.

### D: Search & Retrieval

#### D9 [L] 검색 성능 개선 — 권한 스코프 물질화 + 카운트/facet 최적화 (수십만 문서 기준)

**Goal:** 문서가 수십만 건으로 늘어도 키워드 검색 p95 3초, 의미 검색 p95 5초를 지킨다. 행별 3중 상관 서브쿼리 권한 평가가 집합 기반 조인으로 바뀌어 스케일 여유가 생긴다.

**Scope:** (1) 검색 트랜잭션 초두에 사용자 허용 matter_id 집합과 wall 배제 집합을 1회 계산(배열 파라미터)해 document-scope/wall-scope의 행별 EXISTS 상관 서브쿼리를 인덱스 조인으로 전환 — 권한 시맨틱(fail-closed, explicit DENY, break-glass 2인 승인)은 완전 보존. (2) count(*) OVER() 제거: 상한 카운트(pageSize×10+1 스캔, '1,000+' 표기)로 전환하고 DTO/UI 표기 반영. (3) facet 쿼리를 필터된 집합 1회 스캔으로 통합. (4) 합성 20만 문서 시드 스크립트 + p95 측정 러너를 tools/bench 패턴으로 신설하고 결과를 기존 scale_performance_runs 원장에 자동 기록(수기 등록 대체).

**완화 노트:** 인덱스 샤딩·tenant 해시 파티셔닝·Redis facet 캐시·10,000 동시사용자 부하목표는 완화 정책으로 제외 — 단일 테넌트 수십만 문서·9인 동시사용 기준으로 축소

**교정(검증·비평 반영):** 교차 교정: H3 조건부 유닛으로 강등(성능 임계 관측 시 착수). 상관 서브쿼리 해소 자체는 유지. A6 의존 추가(권한 의미론 변경).

**Dependencies:** D1, D2, D4, A6(기본개방 권한 의미론 변경 반영)

**Code anchors:**
- `apps/api/src/modules/search/permission/document-scope.filter.ts`
- `apps/api/src/modules/search/permission/wall-scope.filter.ts`
- `apps/api/src/modules/search/permission/matter-scope.filter.ts`
- `apps/api/src/modules/search/permission/search-permission-scope.provider.ts`
- `apps/api/src/modules/search/query/search-query.builder.ts`
- `apps/api/src/modules/scale/scale.service.ts`
- `신규: tools/bench/search-load-bench.ts`
- `tests/integration/search-permission/search-permission-sla.spec.ts`

**Acceptance tests (완료판정):**
- 기존 tests/integration/search-permission/ 17개 스펙 + search-permission-regression.spec.ts 전체 그린 — 권한 판정 결과가 물질화 전후 동일함이 스위트로 증명
- 신규 단위테스트: document-scope.filter.spec.ts/wall-scope.filter.spec.ts에 물질화 집합 기반 SQL 생성 검증 케이스 추가 (DENY 우선·break-glass 승인 수 조건 유지 단언)
- tools/bench/search-load-bench.ts 실행: 합성 20만 문서·9 동시사용자에서 키워드 p95 < 3s, hybrid p95 < 5s, 결과가 scale_performance_runs에 자동 insert됨을 확인
- 수동: /search에서 대량 결과 질의 시 총 건수가 '1,000+' 상한 표기로 나오고 페이지네이션이 정상 동작하면 통과

**검증 노트(반영 필요 세부):**
- (앵커 부정확) (1) '신규:'로 표기된 tests/integration/search-permission/search-permission-sla.spec.ts는 이미 실존하는 파일이므로 '기존 확장'으로 정정. (2) 수동 판정 '총 건수 1,000+ 상한 표기 및 페이지네이션'은 웹 변경을 요구하나 anchors에 apps/web 파일이 전무하다(현재 search-client.tsx는 총 건수 렌더링 자체가 없음) — apps/web/src/app/(app)/search/search-client.tsx 등 웹 앵커 추가 필요. (3) '17개 스펙'은 실제 15개 spec(+헬퍼 2)이며 search-permission-regression.spec.ts는 그 15개에 이미 포함되어 있어 '+' 표기는 중복 계산 — '15개 스펙 전체'로 수정.
- (과대·과소 scope) L 초과 의심. 권한 스코프 물질화(3개 필터 재작성 + 권한/월 변경 시 물질화 집합 무효화·동기화 로직, DENY 우선·break-glass 조건 보존) + 카운트/facet 최적화 + 신규 부하 벤치 도구(합성 20만 문서 생성 포함) + 웹 카운트 상한 UI가 한 유닛에 묶여 있다. 분할 권고: (a) 물질화+회귀 증명을 본 유닛(L 유지), (b) tools/bench/search-load-bench.ts + SLA 스펙 확장을 별도 S 유닛, (c) '1,000+' 상한 표기 UI는 D5로 이관 또는 별도 XS.
- (과대·과소 scope) '수십만 문서 p95' 목표는 9인 펌 + 배제된 성능목표(동시 10,000명·샤딩 배제) 취지 대비 과대. '성능 임계 관측 시 착수'하는 조건부 유닛으로 H3 강등을 권고한다. 단, 행별 3중 상관 서브쿼리 해소 자체는 유지하되, A6(firm_open/restricted)이 권한 평가 의미론을 바꾸므로 D9의 권한 스코프 물질화(그리고 F7의 권한 스코프 CTE)에 A6를 deps로 명시하라.

#### D11 [M] 조항 검색 통합검색 노출 (SearchTarget 'clause')

**Goal:** 사용자가 /search에서 '조항' 타깃을 선택해 계약 조항 텍스트를 직접 검색하고(예: '손해배상 한도'), 조항 유형·소속 문서·matter가 표시된 조항 카드에서 원문으로 이동할 수 있다.

**Scope:** (1) contract_clauses/contract_clause_chunks(0054)에 D1과 동일한 한국어 매칭 인덱스 추가 마이그레이션. (2) searchTargets에 'clause' 추가하고 search-query.builder에 조항 검색 경로 신설 — 기존 matter/document/wall 권한 스코프 필터를 조항의 소속 문서 기준으로 재사용. (3) result-card에 조항 변형 카드(조항 유형·소속 문서·matter 라벨) 추가. 유사조항(임베딩) 검색·대체조항 추천은 F 워크스트림의 조항은행 고도화로 제외, /contracts 봉인 해제도 별도 게이트로 제외 — /search 노출 경로만 개방.

**Dependencies:** D1, F(조항은행 — contract-intel 조항 파싱 데이터 적재 확대)

**Code anchors:**
- `db/migrations/0054_create_contract_intelligence.sql`
- `신규: db/migrations/0102_clause_search_index.sql`
- `apps/api/src/modules/contract-intel/contract-intel.service.ts`
- `packages/shared/src/search/search-query.dto.ts`
- `apps/api/src/modules/search/query/search-query.builder.ts`
- `apps/web/src/components/search/result-card.tsx`
- `apps/web/src/components/search/search-advanced-controls.tsx`

**Acceptance tests (완료판정):**
- 신규 통합테스트 tests/integration/search-permission/search-clause.spec.ts: 조항 텍스트 질의가 해당 조항 스니펫을 반환하고, 소속 문서 권한이 없는 사용자와 wall 배제 사용자는 미히트
- apps/web/src/components/search/result-card.test.tsx: 조항 카드 변형(조항 유형·소속 문서 링크) 렌더 단언
- 수동: 계약서가 파싱된 matter에서 /search target=조항으로 '손해배상' 검색 → 조항 카드 표시 → 클릭 시 소속 문서 상세로 이동하면 통과

#### D12 [M] 판례·법령 검색 탭 (external authority 캐시 인덱스)

**Goal:** 사용자가 /search에서 '판례·법령' 탭으로 국가법령정보센터 법령·판례를 내부 문서 결과와 병렬로 검색할 수 있다 (예: '상법 제398조' 검색 시 조문과 관련 내부 실사보고서가 함께 표시).

**Scope:** (1) H 워크스트림이 구축하는 legal-data 커넥터(국가법령정보센터 Open API 등)의 응답을 external_authorities 캐시 테이블 + 한국어 FTS 인덱스로 적재하는 마이그레이션·리포지토리. (2) /search에 target='authority' 탭 신설 — 외부 공개 데이터이므로 권한 필터 불필요 분리 경로로 구현(기존 permission 스코프 미적용을 명시적 화이트리스트로 처리). (3) 내부 문서 결과와 병렬 표시 UI. 법령 조문-내부 문서 그래프 링크('상법 제398조 이슈가 있던 보고서' 관계 질의)는 G/F의 knowledge graph 소관으로 제외.

**Dependencies:** H(국내 법률데이터 연동 — 국가법령정보센터/판례 API 커넥터), D1

**Code anchors:**
- `신규: db/migrations/0103_create_external_authorities.sql`
- `신규: apps/api/src/modules/integrations/legal-data/`
- `apps/api/src/modules/integrations/matter-app (모듈 구조 참조 패턴)`
- `apps/api/src/modules/search/query/search-query.builder.ts`
- `packages/shared/src/search/search-query.dto.ts`
- `apps/web/src/app/(app)/search/search-client.tsx`
- `apps/web/src/components/search/result-card.tsx`

**Acceptance tests (완료판정):**
- 신규 통합테스트 tests/integration/search-authority.spec.ts: 커넥터 mock fixture로 법령 조문 적재 → target=authority 검색 히트, 내부 문서 권한 필터가 authority 결과에 오적용되지 않고 내부 문서 타깃에는 여전히 적용됨을 단언
- 신규 단위테스트 apps/api/src/modules/integrations/legal-data/ 적재 리포지토리 spec: API 응답 정규화·중복 적재 방지 검증
- 수동: /search에서 '상법 제398조' 검색 → 판례·법령 탭에 조문 카드, 전체 탭에 내부 문서 결과와 병렬 표시되면 통과

### E: AI Assistant & Governance

#### E13 [L] Drafting 보조 — 의견서·서면 구조화 초안

**Goal:** 변호사가 매터 증거를 근거로 의견서·준비서면의 구조화 초안을 생성하고, 초안은 항상 사람 검토 필수 상태로 문서 편집 플로우에 신규 초안 버전으로 전달된다.

**Scope:** aiSummaryTaskSchema에 opinion_draft/brief_draft 태스크 추가 + 초안 전용 grounded 스키마(문서 골격 섹션 구조, 섹션별 인용 강제, legalConclusionAutoApproval=false·HUMAN_REVIEW_REQUIRED 상시 유지). 라우팅은 E8 정책 준수(strong 허용 시 외부 강모델, privileged 포함 시 로컬 강제). 생성 초안을 docx로 직렬화해 문서 편집 기반(0092)의 draft 버전으로 저장. 매터 상세에 'AI 초안' 패널 추가. 자동 제출·자동 반출은 만들지 않음.

**Dependencies:** E8, E10, B(문서 편집·버전 관리 기반)

**Code anchors:**
- `packages/shared/src/ai/summary.ts (task enum 확장)`
- `신규: apps/api/src/modules/ai/features/ai-drafting.service.ts`
- `apps/api/src/modules/ai/features/ai-summary.service.ts (파이프라인 재사용)`
- `apps/api/src/modules/ai/generation/evidence-prompt.compiler.ts`
- `apps/api/src/modules/ai/routing/model-routing.service.ts, task-risk.classifier.ts (초안 태스크 위험 분류)`
- `db/migrations/0092_create_document_editing_foundation.sql (draft 버전 저장 기반)`
- `신규: apps/web/src/components/ai/ai-drafting-panel.tsx`
- `apps/web/src/app/(app)/matters/[matterId]/page.tsx`

**Acceptance tests (완료판정):**
- 신규 apps/api/src/modules/ai/features/ai-drafting.service.spec.ts: 초안 응답이 섹션별 인용 강제·escalationRequired=true 고정·legalConclusionAutoApproval=false임을 단언
- 신규 tests/integration/ai-drafting.spec.ts: 초안 생성→문서 draft 버전 저장→감사 이벤트 기록, privileged 문서 포함 매터에서 로컬 라우트 강제를 단언
- 수동: 테스트 매터에서 의견서 초안 생성 → 편집 화면에서 초안이 열리고 '검토 필수' 배지가 유지되며, 인용 각주가 원문 문서로 연결되면 통과

#### E14 [M] 회의록 정합성 QC

**Goal:** 회의록 문서를 업로드하면 매터의 확정 사실·타임라인과 대조한 불일치(날짜·당사자·금액·결정사항) 리포트가 인용과 함께 생성되어 검토 큐에 올라간다.

**Scope:** 신규 prep 아티팩트 kind minutes_qc: document_profile이 회의록으로 분류된 문서에 대해 Gemma 추출 date_facts/people_organizations/key_fields를 매터의 확정 graph facts와 matter_timeline(E9)에 결정적으로 대조하고, 불일치 항목을 양측 인용과 함께 리포트로 저장. dms_work_items에 QC 검토 항목 적재(E7 어댑터 재사용). 자동 수정·자동 반영은 없음.

**Dependencies:** E7, E9, F(확정 graph facts — candidate→confirmed 승인 플로우)

**Code anchors:**
- `신규: apps/api/src/modules/ai/prep/minutes-qc.builder.ts`
- `apps/api/src/modules/ai/prep/ai-prep.processor.ts`
- `packages/shared/src/ai/prep.ts (minutes_qc kind 추가)`
- `apps/api/src/modules/graph/graph-query.service.ts (확정 facts 소스)`
- `apps/api/src/modules/work/work.service.ts (검토 큐 적재)`
- `apps/web/src/app/(app)/work/work-queue-client.tsx (QC 항목 표시)`

**Acceptance tests (완료판정):**
- 신규 apps/api/src/modules/ai/prep/minutes-qc.builder.spec.ts: 회의록 날짜가 확정 타임라인과 다른 모의 케이스에서 불일치 항목(양측 인용 포함) 산출, 완전 일치 시 빈 리포트를 단언
- 신규 tests/integration/ai-minutes-qc.spec.ts: 회의록 업로드→QC 아티팩트 생성→dms_work_items 적재→확정 데이터 미변경을 단언
- 수동: 날짜를 고의로 틀린 회의록 업로드 → work 큐에 불일치 리포트가 뜨고 인용 클릭으로 회의록 원문과 근거 문서 양쪽을 확인할 수 있으면 통과

**검증 노트(반영 필요 세부):**
- (앵커 부정확) packages/shared/src/ai/prep.ts에 minutes_qc kind를 추가하면 db/migrations/0064_create_ai_prep_artifacts.sql의 artifact_kind CHECK 제약(37-48행)이 insert를 거부하므로 CHECK 확장 마이그레이션이 필수인데 anchors에 신규 마이그레이션이 전무함 — 통합 테스트 'QC 아티팩트 생성'이 CHECK 위반으로 통과 불가. 신규 db/migrations/010X_add_minutes_qc_artifact_kind.sql을 anchors에 추가하고, tools/evalset/local-ai-eval.ts의 하드코딩 kind 목록(17-26행) 동기화도 함께 명시할 것 (E7이 자체 4종만 0101에 담는 패턴과 동일).

### F: Knowledge Graph & 지식자산

#### F12 [M] 유사조항 검색 — 조항 단위 임베딩 + clause-bank 검색 API/패널

**Goal:** 변호사가 '매도인측 SPA 책임한도 조항'류 질의로 전사 조항은행과 과거 계약에서 유사 조항을 의미 기반으로 검색할 수 있다.

**Scope:** D 워크스트림이 도입한 실제 임베딩 라우트(로컬 Ollama 서빙)를 재사용해 contract_clauses/contract_clause_chunks 단위 임베딩 컬럼·인덱스 추가(마이그레이션), ingestion 시 조항 임베딩 생성, POST /contract-intel/clause-search(질의 텍스트→임베딩→pgvector 코사인, SearchPermissionScopeProvider로 권한 스코프 주입, approved 조항은행 엔트리 부스팅) 엔드포인트 추가. /contracts 조항은행 브라우저에 '유사 조항' 검색 패널 추가. 기존 16차원 해시 벡터 경로는 건드리지 않는다(D 소관).

**완화 노트:** 외부 임베딩 API는 DEC-11에 따라 계속 차단 — 로컬 모델 전제. 조항 클러스터링·추천은 제외, 질의 기반 검색만.

**교정(검증·비평 반영):** 교차 교정: deps 오기(D1→D2) 정정 — 조항 임베딩은 실임베딩 서비스(D2)에 의존.

**Dependencies:** F11, D2(실임베딩 서비스 bge-m3)

**Code anchors:**
- `apps/api/src/modules/contract-intel/contract-intel.service.ts`
- `apps/api/src/modules/contract-intel/contract-intel.controller.ts`
- `apps/api/src/modules/search/permission/search-permission-scope.provider.ts`
- `apps/api/src/modules/search/query/search-query.builder.ts`
- `db/migrations/0049_create_document_chunks_and_embeddings.sql`
- `신규: db/migrations/00XX_add_clause_embeddings.sql`
- `apps/web/src/lib/api/contract-intel.ts`
- `tests/integration/contract-intel.spec.ts`

**Acceptance tests (완료판정):**
- tests/integration/contract-intel.spec.ts 확장: 의미상 유사/무관 조항 시드 후 clause-search 상위 결과에 유사 조항이 무관 조항보다 먼저 랭크됨 assert (임베딩 모델 고정 시드 사용)
- 동일 spec: ethical wall 차단 matter의 조항이 결과에서 제외됨 assert (search-permission 헬퍼 재사용)
- 성능 기준: 조항 5,000건 시드에서 clause-search p95 < 800ms — 통합 테스트 반복 측정
- 수동 검증: /contracts 유사 조항 패널에서 한국어 질의('손해배상 책임 상한')로 관련 조항이 상위에 노출되면 통과

**검증 노트(반영 필요 세부):**
- (앵커 부정확) deps의 'D1(실제 임베딩 모델 도입)'은 오기 — D1은 n-gram FTS이고 실임베딩은 D2(bge-m3)다. 조항 단위 임베딩은 D2에 의존하므로 D2로 정정하라.

#### F13 [M] 고객 Playbook 확장 — client 스코프 룰 + negotiation_positions + 상대방 요구 이력 집계

**Goal:** 고객(client)별 Playbook 룰이 적용되고, 협상 회차별 당사자 포지션이 기록되어 '이 상대방이 과거 요구한 조항' 질의에 단순 집계로 답할 수 있다.

**Scope:** (1) 마이그레이션으로 playbook_rules에 client_id 스코프 컬럼(FK, matter_id와 택일 CHECK) 추가, contract-rule-engine/서비스가 matter의 client를 따라 client 스코프 룰을 함께 평가하도록 확장(기존 required_clause/prohibited_term/threshold 3종 룰 유지). (2) negotiation_positions 테이블(tenant, matter_id, party_id FK parties, issue 라벨, position_summary, source document_version/contract_clause 참조, round 번호, RLS) + CRUD API·감사 이벤트. (3) 상대방(party)별 조항 kind 요구 빈도 집계 GET /contract-intel/counterparty-patterns?partyId — negotiation_positions와 contract_clauses 조인의 단순 GROUP BY. (4) F1의 HAS_PARTY 그래프 노드에 negotiation_position 노드 투영 추가.

**완화 노트:** 상대방 로펌 엔터티 신설·임베딩 클러스터링 기반 패턴 분석은 제외 — parties 재사용 + 결정론적 집계 질의로 축소(9인 로펌 실수요 수준).

**Dependencies:** F1, F2, F11

**Code anchors:**
- `db/migrations/0054_create_contract_intelligence.sql`
- `db/migrations/0020_create_parties.sql`
- `신규: db/migrations/00XX_playbook_client_scope_and_negotiation_positions.sql`
- `apps/api/src/modules/contract-intel/contract-rule-engine.ts`
- `apps/api/src/modules/contract-intel/contract-intel.service.ts`
- `apps/api/src/modules/graph/graph-sync.service.ts`
- `packages/shared/src/contract/contract-types.ts`
- `tests/integration/contract-intel.spec.ts`
- `tests/integration/party.spec.ts`

**Acceptance tests (완료판정):**
- apps/api/src/modules/contract-intel/contract-rule-engine.spec.ts 확장: client 스코프 룰이 해당 client의 모든 matter 평가에 포함되고 타 client matter에는 미적용 assert
- tests/integration/contract-intel.spec.ts 확장: negotiation position 생성(round 1→2) 후 counterparty-patterns 응답에 조항 kind별 빈도 집계 반환 assert; 권한 없는 matter의 position 생성 403 assert
- tests/integration/graph.spec.ts 확장: sync 후 negotiation_position 노드와 party 연결 엣지 생성 assert
- 수동 검증: 동일 상대방 party가 2개 matter에서 indemnity 조항 포지션을 기록한 뒤 집계 API가 빈도 2로 반환하면 통과

**검증 노트(반영 필요 세부):**
- (테스트 불가능한 완료판정 (집계 축이 되는 조항 kind 미정의)) 'counterparty-patterns 응답에 조항 kind별 빈도 집계'와 수동 검증의 'indemnity 조항 포지션'은 F2와 동일하게 의미적 조항 kind 분류체계가 현행 스키마에 없어 판정 축이 불명확함. 신규 마이그레이션(00XX_playbook_client_scope_and_negotiation_positions.sql)에서 negotiation_positions에 의미적 clause kind enum 컬럼을 정의한다는 것을 anchors/scope에 명시하고, acceptance test는 그 신규 enum 값 기준 집계로 문구를 고정해야 함(contract_clauses.clause_kind는 구조적 분류라 사용 불가).

#### F14 [L] LLM Wiki 재생성 + Obsidian export — matter_wiki_pages와 마크다운 vault 내보내기

**Goal:** 그래프·확정 Fact·citation 원장을 입력으로 matter별 위키 페이지(개요/이슈/당사자/타임라인)가 AI로 재생성되고, 변호사 확정 후 /matters 위키 탭에서 열람하며 Obsidian 호환 마크다운 vault(zip)로 내보낼 수 있다.

**Scope:** (1) 마이그레이션으로 matter_wiki_pages 테이블(matter_id, page_kind overview/issue/party/timeline CHECK, markdown_body, source_refs jsonb — 0068 패턴 CHECK로 citation 없는 서술 금지, provenance/review_status — F3와 동일 어휘, RLS). (2) 생성 잡: 그래프 facts(confirmed 우선)+litigation_facts+ai_claims를 evidence pack으로 LocalGemmaGenerationService 재사용, 산출물 ai_proposed 저장, F9의 work 큐 검토 메커니즘 재사용(kind 'wiki_page_review')으로 confirmed 전이. (3) /matters/[matterId] 지식 탭에 위키 서브탭 — [[링크]]는 graph_nodes 참조로 해석해 노드/문서로 라우팅. (4) GET /matters/:id/wiki-export — confirmed 페이지들을 [[위키링크]]·citation 각주 포함 Obsidian 호환 .md 파일 zip으로 내보내기 + WIKI_EXPORTED 감사 이벤트, 다운로드 권한은 matter 읽기 권한자.

**완화 노트:** Obsidian 실시간 동기화 플러그인·양방향 편집은 제외 — 단방향 export만. 자동 재생성 스케줄은 수동 트리거+문서 변경 시 재생성 제안 배지로 축소.

**Dependencies:** F1, F3, F4, F8, F9

**Code anchors:**
- `신규: db/migrations/00XX_create_matter_wiki_pages.sql`
- `db/migrations/0068_harden_ai_prep_completed_payload.sql`
- `apps/api/src/modules/ai/generation/local-gemma-generation.service.ts`
- `apps/api/src/modules/ai/generation/evidence-prompt.compiler.ts`
- `apps/api/src/modules/graph/graph-query.service.ts`
- `apps/api/src/modules/work/work.service.ts`
- `신규: apps/api/src/modules/matter/matter-wiki.service.ts`
- `apps/web/src/app/(app)/matters/[matterId]/page.tsx`
- `신규: tests/integration/matter-wiki.spec.ts`

**Acceptance tests (완료판정):**
- 신규 tests/integration/matter-wiki.spec.ts: confirmed fact+citation이 시드된 matter에서 위키 생성 트리거 → matter_wiki_pages에 ai_proposed 행 + 모든 서술 단락에 source_refs ≥1(DB CHECK 위반 시도 실패 포함) assert; work 큐 확인 후 review_status='confirmed' 전이 assert
- 동일 spec: wiki-export 응답 zip에 page_kind별 .md 파일이 존재하고 [[링크]] 대상이 실존 graph_nodes ID로 해석되며 citation 각주가 문서 참조를 포함함을 압축 해제 후 파싱 assert; matter 읽기 권한 없는 사용자 403 assert
- matter-knowledge-tab RTL 테스트 확장: 위키 서브탭에서 confirmed 페이지 렌더·[[링크]] 클릭 시 노드 라우팅 assert
- 수동 검증: export된 zip을 실제 Obsidian vault로 열어 백링크 그래프가 렌더되면 통과

### G: Workflows & External Collaboration

#### G4 [M] AI 1차 검토 연결 — clause_analysis/risk_extraction 소비

**Goal:** 계약 process 완료 시 AI 1차 검토(조항 분석·리스크 추출)가 자동 실행되어 룰엔진 finding과 함께 통합 패널에 표시되고, 변호사 승인이 감사 이벤트로 고정된다. '능력은 있으나 소비처 없음' 상태가 해소된다.

**Scope:** contract-intel processDocument 완료 시 pg-boss 잡(extraction-queue.service.ts의 잡 패턴 재사용)으로 ai-summary의 clause_analysis/risk_extraction 태스크를 실행하고, 결과를 룰 finding과 동일 스키마의 ai_source 구분으로 저장(마이그레이션). 계약 탭에 '룰 위반+AI 소견+인용' 통합 패널 추가. 변호사 승인 액션 → CONTRACT_AI_REVIEW_ACCEPTED 감사 이벤트(15단계의 'AI 1차 검토→변호사 검토' 전이를 데이터로 고정). 기존 로컬 Gemma 생성+인용 검증 경로를 그대로 사용 — Strong LLM 라우팅 고도화는 AI 워크스트림 담당.

**Dependencies:** G3

**Code anchors:**
- `apps/api/src/modules/ai/features/ai-summary.service.ts`
- `packages/shared/src/ai/summary.ts`
- `apps/api/src/modules/contract-intel/contract-intel.service.ts`
- `apps/api/src/modules/contract-intel/contract-rule-engine.ts`
- `apps/api/src/modules/document/extraction/extraction-queue.service.ts`
- `apps/api/src/common/db/pg-boss-runtime-options.ts`
- `신규: db/migrations/00XX_add_contract_ai_review_findings.sql`

**Acceptance tests (완료판정):**
- 자동: tests/integration/contract-intel.spec.ts 확장 — process 실행 후(AI 생성 스텁 주입) ai_source finding 행 생성, 인용 없는 AI 결과는 저장 거부, 승인 API 호출 시 CONTRACT_AI_REVIEW_ACCEPTED 감사 이벤트 기록
- 수동: 계약 문서 process 실행 → 계약 탭 통합 패널에 룰 위반과 AI 소견 카드(인용 포함)가 함께 표시되고 '검토 완료' 클릭 시 /audit에 승인 이벤트가 남으면 통과
- 성능: 로컬 Gemma 경로에서 문서 1건의 AI 검토 잡이 5분 내 완료(pg-boss 잡 시작/완료 타임스탬프 로그로 측정, 초과 시 잡 재시도 정책 확인)

#### G14 [L] 산출물 export — DD 보고서 초안·협상쟁점표·Closing Binder/Archive

**Goal:** 버튼 한 번으로 DD 보고서 초안(docx), 협상쟁점표 export, Closing Binder(문서 목록+해시 manifest+ZIP)를 생성해 문서 파이프라인으로 재유입시키고, 매터/워크스페이스 종료 시 closing archive가 남는다.

**Scope:** workers에 문서 합성 워커(python-docx 템플릿 엔진) 신설 — 기존 docx_to_pdf 컨버터를 후단 재사용. (1) DD 보고서 초안: report_inclusion=true 이슈+리스크+traceability 인용을 템플릿 합성(선택: ai-summary matter_summary 경로로 서술 초안 첨부). (2) 협상쟁점표 export(G3의 조인 데이터→docx/표). (3) Closing Binder: A 워크스트림의 매터 종료 이벤트에 연계해 문서 스냅샷 목록+document_versions sha256 manifest+ZIP export, records 보존 정책으로 freeze. (4) 외부 워크스페이스 closing archive: 문서 인덱스·Q&A·열람통계 manifest 포함, workspace frozen 전환. 생성물은 documents 업로드 파이프라인 재유입으로 버전·해시·감사를 자동 획득.

**완화 노트:** 사내 스킬(ldd-report-generator류) 수준의 정교한 템플릿 체계 이식은 장기 과제로 미룸 — 필수 섹션이 채워지는 초안 품질로 시작. SPA 반영사항 추출은 제외.

**교정(검증·비평 반영):** 교차 교정: Closing Binder 생성 로직 제거(A12와 중복) — A12 산출물을 소비해 export 포맷 추가·재유입만 담당. deps를 A12로 명시.

**Dependencies:** G3, G5, A12(Closing Binder 빌더 — 산출물 소비)

**Code anchors:**
- `workers/ingestion/app/converters/docx_to_pdf.py`
- `workers/ingestion/tests/test_docx_to_pdf.py`
- `apps/api/src/modules/dd/dd.service.ts`
- `apps/api/src/modules/records/records.service.ts`
- `apps/api/src/modules/external/external.service.ts`
- `apps/api/src/modules/document/document-upload.service.ts`
- `apps/api/src/modules/document/extraction/extraction-queue.service.ts (pg-boss 잡 패턴)`
- `신규: workers/ingestion/app/synthesis/ (보고서/바인더 합성 모듈)`
- `신규: db/migrations/00XX_add_export_audit_actions.sql`

**Acceptance tests (완료판정):**
- 자동: workers/ingestion/tests/test_report_synthesis.py — 이슈/리스크 fixture로 DD 보고서 docx 생성, 필수 섹션(이슈 요약·리스크 등급표·인용 목록) 존재를 python-docx로 assert
- 자동: tests/integration/dd-vault.spec.ts 확장 — export 요청→pg-boss 잡 완료 후 documents 파이프라인에 신규 문서 행+감사 이벤트 생성; binder manifest의 각 항목 해시가 원본 document_versions.sha256과 전건 일치
- 자동: tests/integration/external-core.spec.ts 확장 — workspace archive 후 frozen 상태에서 신규 링크 발급 거부
- 수동: DD 탭에서 '보고서 초안 생성' 클릭 → 파일함에 docx가 나타나고 Word에서 정상 열람; 매터 종료 흐름에서 binder ZIP을 내려받아 manifest와 파일 수 일치 확인

**검증 노트(반영 필요 세부):**
- (과대·과소 scope) size L인데 DD 보고서 docx 합성(신규 Python synthesis 모듈), 협상쟁점표 export, Closing Binder ZIP(manifest 해시 전건 대조), workspace archive freeze의 4개 산출물이 workers/ingestion·dd·records·external 4개 모듈에 걸쳐 있어 L 초과 의심. 예: G14a(DD 보고서 초안 + 협상쟁점표 export)와 G14b(Closing Binder/Archive + workspace freeze)로 분리 권고. 부수 문제: 제목에 '협상쟁점표' export가 있으나 acceptance tests에 협상쟁점표 export 검증이 전무함(테스트는 DD 보고서·binder·archive만 커버) — 분리하지 않는다면 협상쟁점표 export 테스트를 추가하거나 제목에서 제거하라.
- (과대·과소 scope) G14의 'Closing Binder(문서 목록+해시 manifest+ZIP)'가 A12(Closing Binder 빌더)와 중복. G14에서 바인더 생성 로직을 제거하고 A12 산출물을 소비(export 포맷 추가·재유입)하는 것으로 축소하라. deps를 'A(매터 종료 자동화 이벤트)'가 아닌 A12로 명시.

### H: Platform, Security-lite & 국내 연동

#### H12 [L] 국내 법률데이터 연동 — 법제처 국가법령정보 API→Authority 노드 + DART 공시 조회

**Goal:** 변호사가 법령명/조문으로 국가법령정보를 검색해 결과가 지식그래프 authority 노드로 적재·인용 가능해지고, DART에서 거래 상대방 기업의 최근 공시를 조회할 수 있다.

**Scope:** (1) integrations 모듈에 경량 커넥터 계층: API 키 관리(Secrets/env), 레이트리밋·재시도, 응답 정규화. (2) 국가법령정보센터 공동활용 OpenAPI(law.go.kr) 클라이언트: 법령/조문 메타 검색→graph_nodes에 authority 타입 노드 upsert(신규 마이그레이션으로 node type 확장), GET /v1/integrations/law/search 엔드포인트, 참조된 법령의 개정 여부 증분 갱신 pg-boss 주기 잡. (3) DART OpenAPI: 회사 검색+최근 공시 목록 READ 전용 프록시(GET /v1/integrations/dart/filings, 조회 캐시만 저장). (4) API 키 미설정 시 'not_configured' 명시 응답(fail-closed). 만들지 않음: 대법원 종합법률정보(공식 API 부재)·KRX, 판례 본문 대량 수집, Citation Ledger/조항은행 연결(knowledge-graph 워크스트림), 공시 원문 저장.

**완화 노트:** 사양 §12.3의 대법원·KRX 연동은 공식 API 접근성 문제로 제외 — 법제처+DART 우선. horizon 3 배치는 완화 정책 지시 그대로.

**교정(검증·비평 반영):** 교차 교정: deps 워크스트림 오기(G→F: F1/F4) 정정.

**Dependencies:** F(F1 Authority 노드 타입·F4 Citation Ledger 연결 규약 협의 — 차단 아님)

**Code anchors:**
- `apps/api/src/modules/integrations/ (matter-app 하위모듈 패턴 재사용)`
- `apps/api/src/modules/graph/graph-sync.service.ts`
- `apps/api/src/modules/graph/graph-query.service.ts`
- `db/migrations/0053_create_knowledge_graph.sql (:115 graph_nodes)`
- `apps/api/src/app.module.ts (모듈 등록)`
- `신규: apps/api/src/modules/integrations/law-data/law-api.client.ts`
- `신규: apps/api/src/modules/integrations/law-data/dart-api.client.ts`
- `신규: apps/api/src/modules/integrations/law-data/law-data.controller.ts`
- `신규: apps/api/src/modules/integrations/law-data/law-data.service.ts`
- `신규: db/migrations/0102_add_authority_graph_nodes.sql`
- `신규: tests/integration/law-data.spec.ts`

**Acceptance tests (완료판정):**
- 자동: tests/integration/law-data.spec.ts — HTTP 픽스처 목킹으로 법령 검색→graph_nodes에 authority 노드 upsert(동일 법령 재호출 시 중복 0, 멱등)·테넌트 RLS 준수; DART 회사 검색 프록시 응답 스키마 검증; API 키 미설정 시 not_configured 응답.
- 자동: law-api.client.spec.ts / dart-api.client.spec.ts — XML/JSON 응답 파싱 정규화, 레이트리밋 초과 시 backoff 재시도, 4xx fail-closed.
- 자동: tests/integration/graph.spec.ts 회귀 통과(노드 타입 확장이 기존 그래프 일관성 검사를 깨지 않음).
- 수동: 실 API 키로 '개인정보 보호법' 검색→조문 authority 노드 생성 확인, DART에서 상장사 1곳 최근 공시 10건 조회 응답 확인하면 통과.

**검증 노트(반영 필요 세부):**
- (앵커 부정확) deps의 'G(knowledge-graph 워크스트림)'는 문자 오기 — 지식그래프는 F다. authority 노드 타입은 F1, Citation Ledger 연결 규약은 F4와 협의하는 것으로 정정하라.

#### H13 [M] Analytics-lite — 사용 통계 대시보드

**Goal:** 관리자가 기간별 사용 통계(활성 사용자, 업로드/다운로드/검색 건수, 매터별 활동 상위, 스토리지 사용량)를 대시보드에서 보고 CSV로 내려받을 수 있다.

**Scope:** (1) dashboard 모듈 확장: GET /v1/dashboard/usage-stats(기간 파라미터, firm_admin/security_admin 전용) — audit_events·documents·file_objects 온디맨드 집계(9인 규모라 materialized 테이블 불필요, 필요 인덱스만 확인·추가). (2) /dashboard에 사용 통계 섹션(기존 vault-activity-client 패턴으로 카드+표). (3) CSV export(기존 audit export 패턴 재사용, export 행위 자체 감사). 만들지 않음: BI 도구 연동, 예측/이상 분석, 과금·미터링, 사용자별 생산성 평가 지표.

**완화 노트:** 완화 정책 'Analytics는 기본 사용 통계 수준' — 집계 대시보드 1면과 CSV export까지만.

**Dependencies:** 없음

**Code anchors:**
- `apps/api/src/modules/dashboard/dashboard.service.ts`
- `apps/api/src/modules/dashboard/dashboard.controller.ts`
- `apps/api/src/modules/dashboard/dashboard.service.spec.ts`
- `apps/api/src/modules/audit/audit-query.service.ts (집계·CSV export 패턴 재사용)`
- `apps/web/src/app/(app)/dashboard/vault-activity-client.tsx`
- `apps/web/src/lib/api/dashboard.ts`
- `신규: tests/integration/usage-stats.spec.ts`

**Acceptance tests (완료판정):**
- 자동: tests/integration/usage-stats.spec.ts — 감사 이벤트·문서·파일 시드 후 기간별 집계 수치 일치(업로드 3/다운로드 2/검색 5 등 기대값 assert), 타 테넌트 데이터 미포함(RLS), 비관리자 역할 403, CSV export 시 감사 이벤트 기록.
- 자동: dashboard.service.spec.ts 확장 — 기간 경계(월초/월말/빈 기간 0 반환)와 스토리지 합계 계산 검증.
- 성능: 감사 이벤트 10만 건 시드 기준 usage-stats 응답 p95 < 2초(통합 테스트 내 타이머 측정으로 기록).
- 수동: /dashboard에서 지난 30일 통계 카드 표시, 수치가 /audit 콘솔 동일 기간 필터 건수와 일치, CSV 다운로드 열림 확인하면 통과.

**검증 노트(반영 필요 세부):**
- (테스트 불가능한 완료판정) 성능 기준 'p95 < 2초(통합 테스트 내 타이머 측정으로 기록)'은 (1) 표본 수가 정의되지 않아 p95 산출 절차가 모호하고 (2) '기록'만 하고 assert 여부가 불명확해 통과/실패 판정이 불가. 예: '감사 이벤트 10만 건 시드 후 usage-stats 엔드포인트를 연속 20회 호출한 응답시간의 p95 < 2초를 테스트에서 assert'처럼 표본 수와 판정 방식을 확정하라.

#### H14 [M] Microsoft OIDC 간편 로그인 (선택·저순위)

**Goal:** 사용자가 로그인 화면의 'Microsoft로 로그인' 버튼으로 로펌 M365 계정 인증만으로 로그인할 수 있다(기존 비밀번호+TOTP 로그인은 그대로 유지).

**Scope:** (1) openid-client 기반 Entra ID OIDC authorization code flow(PKCE): GET /v1/auth/oidc/microsoft/start, /callback — state/nonce, ID 토큰 issuer/audience/서명 검증. (2) 사용자 매핑은 기존 user_login_identities(0090) 재사용: 사전 등록된 identity만 허용, 미매핑 sub는 거부(JIT 생성 없음). (3) 성공 시 기존 세션 발급 경로 재사용, 비활성 사용자는 기존 fail-closed 검사로 거부. (4) OIDC 경로의 MFA는 Entra 정책에 위임하고 sessions.mfa_verified 처리 근거를 문서화. (5) LOGIN_SUCCESS 감사 metadata에 method=oidc. (6) 로그인 폼에 버튼 추가. 만들지 않음: SAML, SCIM 프로비저닝, JIT 사용자 생성, 비밀번호 로그인 비활성화 강제(enforcement_mode), Google OIDC.

**완화 노트:** SAML SSO 런타임은 완화 정책으로 제외 — 선택 항목인 Microsoft OIDC만, horizon 3 저순위. 기존 enterprise_sso_providers 해시 등록부는 건드리지 않음(감사 원장으로 유지).

**Dependencies:** H1(로그인 플로 리팩터링 선행 — mfa_pending 상태머신과의 충돌 방지), H2(비활성 사용자 거부 경로 재사용)

**Code anchors:**
- `apps/api/src/modules/auth/auth.controller.ts`
- `apps/api/src/modules/auth/auth.service.ts (세션 발급 경로 재사용)`
- `apps/api/src/modules/auth/session.repository.ts`
- `apps/api/src/modules/user/user-login-identity.service.ts`
- `apps/api/src/modules/user/user-login-identity.controller.ts`
- `db/migrations/0090_create_user_login_identities.sql`
- `apps/web/src/app/(auth)/login/login-form.tsx`
- `packages/shared/src/audit/audit-event-types.ts`
- `신규: apps/api/src/modules/auth/oidc-microsoft.service.ts`
- `신규: tests/integration/auth-oidc.spec.ts`

**Acceptance tests (완료판정):**
- 자동: tests/integration/auth-oidc.spec.ts — 로컬 JWKS로 목킹한 IdP 토큰으로 callback 검증: 유효 ID 토큰+매핑된 identity→세션 발급, 미매핑 sub→403+LOGIN_FAILURE 감사, state/nonce 불일치→거부, 비활성 사용자→거부.
- 자동: oidc-microsoft.service.spec.ts — 서명 불일치/만료/audience 불일치 토큰 전부 fail-closed 거부 검증.
- 자동: tests/integration/auth-session.spec.ts·auth-mfa.spec.ts 회귀 — 비밀번호+TOTP 경로 무변경.
- 수동: Entra 테스트 테넌트로 로그인 버튼→M365 계정 인증→대시보드 진입, /audit에서 method=oidc LOGIN_SUCCESS 확인, 비활성화 계정은 OIDC로도 차단되면 통과.

## 부록: 실행 순서 가이드 (Horizon 1 critical path)

1. 병렬 트랙 4개로 착수 가능: (a) 매터 생성 루프 A1→A2, A3, A6→A7 (b) 검색 품질 D1, D2→D3→D4 (c) Outlook 봉인 해제 C1·C2·C3 병렬 → C4→C5→C6→C7(파일럿 — C3도 선행 필요) (d) 플랫폼 안전망 H1·H2·H3·H5·H6.
2. AI 노출은 검색 품질 이후: E2 → E1(D2/D3 이후 착수 권장) → E3 → E4. F4·F5는 E3와 병렬 가능.
3. 문서 계열 B1~B4·B6은 상호 독립 — 인력 여유 시 언제든 삽입. G1·G2는 B4(버전 라벨)와 독립적으로 착수 가능.

## 부록 2: 기본 요구 8종(Baseline-8) 커버리지 보완 유닛 (2026-07-03 추가)

기본 요구 8종(R1 문서저장·목록·열기/편집, R2 메타데이터·편집순 정렬, R3 버전/서브버전, R4 copy/reference 이원 모델, R5 Word 직접 편집·버전 선택, R6 통합 검색, R7 Outlook 발송 시 e-filing, R8 음절단위 redline PDF)을 본 계획과 대조한 결과 R3·R6은 커버, R1·R2·R5·R7은 부분 커버, R4·R8은 미커버로 판정되어 아래 유닛을 추가한다. R8은 Contract Desk 앱(v0.14.24, Electron)의 검증된 diff 엔진을 이식한다.

### B15 [H1/M] /files 고객 축 + 최종 편집자 노출 (R1·R2 보완)

**Goal:** 사용자가 /files에서 고객 기준으로 문서 목록을 필터링하고, 목록에서 고객명·최종 편집자를 바로 확인할 수 있다.

**Scope:** (1) `documents.updated_by` 컬럼 신설 + 편집 라이프사이클(체크인/승격/메타변경/버전추가)의 `updated_at=now()` 갱신 지점에 updated_by 동시 기록. (2) `listDocumentsQuerySchema`에 clientId 추가(.strict() 유지), 서버 쿼리에 matters JOIN 경유 client 필터. (3) /files 필터 바에 고객 셀렉터, 목록 컬럼에 고객명·최종 편집자 추가. (4) /clients/[clientId] 상세에 '문서' 탭(동일 목록 컴포넌트 재사용, clientId 고정). 만들지 않을 것: 고객 포털 노출, 검색 인덱스 스키마 변경(검색의 clientId facet은 기존 구현).

**Dependencies:** 없음 (A4 구현분 재사용)

**Code anchors:** `db/migrations/(신규)_add_documents_updated_by.sql`, `packages/shared/src/types/document.ts:99-116`, `apps/api/src/modules/document/document.service.ts:227-241`, `apps/api/src/modules/document/document-editing.service.ts:570,631,1199`, `apps/web/src/components/document/document-vault-list.tsx`, `apps/web/src/app/(app)/clients/[clientId]/page.tsx`

**Acceptance tests:** 자동 — tests/integration/document-access 계열에 (a) clientId 필터 목록이 해당 고객 매터의 문서만 반환, (b) cross-tenant clientId는 빈 결과, (c) 체크인 수행 후 updated_by가 편집자로 갱신됨을 검증. 수동 — /files에서 고객 선택 시 목록이 즉시 필터되고 각 행에 고객명·최종 편집자가 표시되면 통과.

### B16 [H1/S] 잠금 충돌 시 작업사본(copy) 분기 UX (R4 보완)

**Goal:** 문서가 다른 사용자에게 체크아웃되어 있을 때, 두 번째 사용자가 "현재 ○○님이 편집 중입니다. 작업사본(copy)으로 여시겠습니까?" 프롬프트를 받고 승인 시 사본으로 작업을 계속할 수 있다.

**Scope:** (1) 잠금 정보 노출: 에러 페이로드 확장이 아니라 **기존 GET /documents/:id/edit-sessions/active 조회로 확정** — 응답 DTO에 lockOwnerDisplayName(users JOIN)·checkedOutAt·expiresAt 추가. 웹은 DOCUMENT_LOCKED(400, {code, reason, requestId} 계약 불변) 수신 시 이 API를 호출해 프롬프트를 구성한다. (2) 액션센터의 정적 에러 배너를 대화형 프롬프트로 교체 — 선택지: [작업사본 다운로드] / [잠금 해제 요청] / [취소]. 작업사본 다운로드는 기존 감사 다운로드 엔드포인트에 `purpose=working_copy` 파라미터를 추가해 **서버가 Content-Disposition으로 `{원제}_copy_{사용자}_{일시}` 파일명을 결정**하고 DOCUMENT_COPY_DOWNLOADED 감사 이벤트를 기록한다(신규 action은 packages/shared audit-query action enum + documentTimelineAuditActions + document-events.ts 3곳 등록 — 문서 감사 타임라인에 노출 필수). 잠금 해제 요청은 1단계 축소 구현: POST .../edit-sessions/:sessionId/release-requests → 잠금 소유자에게 인앱 알림(0086 notifications kind 추가, matter owner CC) + DOCUMENT_LOCK_RELEASE_REQUESTED 감사 + 동일 세션당 1회 억제. 강제 해제 자체는 B6의 관리자 권한. (3) 사본 재업로드 안내: 업로드 패널에서 '기존 문서의 새 버전으로 업로드' 경로 안내 배너(자동 병합은 하지 않음 — 수동 검토 전제 명시). (4) **잠금 활성 중 버전 정책 확정**: 타인 잠금이 활성인 동안 해당 문서의 새 공식 버전 업로드는 409(DOCUMENT_LOCKED_FOR_VERSIONING)로 차단한다 — copy 작업자는 소유자의 체크인/잠금 해제 후 새 버전으로 업로드한다(버전 체인 인터리빙 금지). 만들지 않을 것: 자동 병합, 브랜치·포크 버전 트리(단일 버전 체인 유지), 동시 편집, 에러 페이로드 스키마 변경.

**Dependencies:** B6(잠금 운영성 — 해제 요청 연계)

**Code anchors:** `apps/api/src/modules/document/document-editing.service.ts:515-527(잠금 분기),242-244(documentLocked 헬퍼)`, `apps/web/src/components/document/document-action-center.tsx:344-345`, `apps/web/src/lib/api-client.ts:68-82(에러 파싱 계약 — 변경 금지)`, `packages/shared/src/dto/audit(action enum·documentTimelineAuditActions)`, `apps/api/src/modules/audit/events/document-events.ts`, `db/migrations/0086(notifications kind)`, `apps/api/src/modules/document/document-version.service.ts(잠금 중 버전 차단)`

**Acceptance tests:** 자동(통합테스트) — (a) 타인 잠금 상태에서 GET edit-sessions/active 응답에 lockOwnerDisplayName·expiresAt 포함, (b) purpose=working_copy 다운로드 시 Content-Disposition 사본 파일명 + DOCUMENT_COPY_DOWNLOADED 감사 행 + 문서 감사 타임라인 노출, (c) 잠금 활성 중 타인의 새 버전 업로드가 409 DOCUMENT_LOCKED_FOR_VERSIONING으로 거부되고 체크인 후 성공하는 인터리빙 테스트, (d) 해제 요청 시 소유자 알림 생성 + 동일 세션 중복 요청 억제. 수동 — 계정 2개로 동시 편집 시도: 두 번째 계정에 프롬프트가 뜨고 [작업사본 다운로드]→로컬 수정→(소유자 체크인 후) 새 버전 업로드 흐름이 완결되면 통과.

### B17 [H2/S] 체크인 시 공식 버전 발행 선택 — 버전업/서브버전업 다이얼로그 (R5 보완)

**Goal:** 편집을 마치고 저장(체크인)할 때 사용자가 '검토본(서브버전)으로 유지'와 '공식 버전으로 즉시 발행(버전업)'을 다이얼로그에서 선택할 수 있다.

**Scope:** (1) check-in API에 `promoteImmediately` 옵션 추가 — 리뷰어가 지정되지 않은 문서는 체크인+promote를 단일 트랜잭션으로 수행(9인 내부용 완화: self-promote 허용을 테넌트 정책 플래그로), 리뷰어 지정 문서는 기존 리뷰 게이트 유지. (2) 웹 체크인 다이얼로그: [검토본으로 저장 vN.M] / [공식 버전으로 발행 vN+1 — B4 버전 라벨(고객송부/최종본/체결본 등) 선택 포함]. (3) B12 데스크톱 브리지의 편집 종료 흐름에도 동일 다이얼로그 노출. 만들지 않을 것: 리뷰 게이트 폐지(정책 플래그 기본값은 게이트 유지), 저장(save)마다 선택(저장은 서브버전 자동 유지 — 선택은 체크인 시점에만).

**Dependencies:** B12(데스크톱 브리지 다이얼로그 연계 — 소프트), B4(버전 라벨 — 구현 완료)

**Code anchors:** `apps/api/src/modules/document/document-editing.controller.ts:324,365`, `apps/api/src/modules/document/document-editing.service.ts (promote 게이트 assertReviewGateSatisfied)`, `apps/web/src/components/document/document-action-center.tsx:1334-1345`

**Acceptance tests:** 자동 — (a) 리뷰어 미지정 문서에서 promoteImmediately 체크인 시 새 공식 버전 생성+검토본 promoted 전이+감사 2건, (b) 리뷰어 지정 문서에서 동일 요청이 review_required로 거부, (c) 정책 플래그 off 테넌트에서 promoteImmediately 거부 검증(통합테스트). 수동 — 편집→체크인 다이얼로그에서 '공식 버전으로 발행+체결본 라벨' 선택 시 버전 목록에 vN+1·체결본 배지가 표시되면 통과.

### C16 [H2/M] 발신 메일 send_and_file 이행 완결 + 매터 자유검색 picker (R7 보완)

**Goal:** Outlook에서 '전송+보관'을 선택한 발신 메일이 실제로 Vault에 저장되어 매터 타임라인에 나타나고, 추천이 없을 때도 매터코드 자유검색으로 파일링 대상 매터를 지정할 수 있다.

**Scope:** (1) `outlook_filing_requests(request_kind='send_and_file')` 소비 이행 경로 신설(기존 outlook-fulfillment 상태기계 재사용). **인증 모델 확정: 위임(OBO) 방식** — send-file 요청 생성 시 add-in이 단기 OBO assertion을 동반 전달(수신 파일링 DTO 패턴 재사용)하도록 createOutlookSendFileRequestSchema에 graphOboAssertion 필드를 확장하고, 서버는 요청 생성 트랜잭션 내에서 이행 잡을 enqueue한다(애플리케이션 권한 Mail.Read 방식은 채택하지 않음 — 채택 변경은 핸드오프 패키지 07 문서에 신규 결정으로 등록해 발주자 승인 필요). **이행 트리거·재시도**: 초기 지연 20초 후 첫 시도, Sent Items 미반영 시 백오프 15s→30s→60s(이후 60s 고정)로 최대 10분 재시도, 최종 미발견 시 failed(사유코드 sent_item_not_found)로 종결하고 태스크페인·/notifications에 노출. **매칭 규칙**: Graph 질의 창은 발송 요청 시각 ±10분·최대 50건, 매칭 키 우선순위 ① internetMessageId 해시 ② conversationId 해시 + 정규화 메시지(canonical) 해시 병합 — 해시는 smart-alerts.js의 namespacedHash 규약을 서버와 공유 모듈로 통일. 다중 매치 시 최신 1건 + 감사 경고, 무매치 시 재시도. (2) Smart Alerts warn 프롬프트에서 compose 태스크페인 오픈 연계(contextData/commandId)로 '발송 시 e-filing→매터 선택' UX 완결. (3) 태스크페인 Matter 카드에 자유검색 입력 추가(기존 matter-lookup/suggestions API 확장) — 추천 없음 케이스 해소. (4) 운영 게이트: **R0(관리자) 링 기준으로 구현·검증하고**, D-04(허용 링) 확정 시 outlook-operational-gate 설정 변경만으로 확대되도록 디커플링. C14(발송 전 DLP 검사)의 '이행 시 원문 재검사' 전제를 이 유닛이 해소함을 명시. 만들지 않을 것: 자동 파일링(발송 메일 전건 저장 — 사용자 선택 유지), Gmail, 애플리케이션 권한 기반 메일박스 상시 접근.

**Dependencies:** C5, C6, C7(파일럿 배포), C13(추천 밴드 — 소프트)

**Code anchors:** `apps/api/src/modules/outlook/outlook-send-file.service.ts:214-322,467-487`, `apps/api/src/modules/outlook/outlook-fulfillment.service.ts`, `apps/web/public/outlook-addin/smart-alerts.js:9-28,215-231`, `apps/web/src/app/outlook-addin/outlook-addin-client.tsx:254-270,544-642`, `tools/release/check-outlook-operational.ts`

**Acceptance tests:** 자동 — tests/integration에 (a) send_and_file 요청 생성→이행 잡 실행→email_messages 행+매터 파일링+completed 전이, (b) Sent Items 미반영 시뮬레이션에서 백오프 재시도 후 성공, 10분 초과 시 sent_item_not_found로 failed 전이, (c) 매칭 키 우선순위(internetMessageId→conversationId+canonical) 및 다중 매치 처리 검증, (d) 권한 없는 매터 지정 시 거부. 수동 — 파일럿(R0) 계정에서 외부 수신자 메일 발송 시 SoftBlock 프롬프트→태스크페인→매터 자유검색 선택→발송 후 표시(정상 경로 1분 내, Sent Items 지연 시 최대 10분 + 상태 노출)되면 통과.

### B18 [H2/L] packages/redline — Contract Desk diff 엔진 이식 (R8)

**Goal:** Contract Desk의 검증된 음절(문자)단위 Myers diff 엔진이 서버에서 실행 가능한 워크스페이스 패키지로 이식되어 vault의 어떤 서비스든 버전쌍 diff를 호출할 수 있다.

**Scope:** (1) `packages/redline` 신설 — Contract Desk(원본 git 최신본 기준 확인 후)에서 diff-engine.ts(Myers 3단계: 블록 LCS→문단쌍 문자 diff, 이동 감지, 표 셀 diff), text-normalizer.ts(법률기호 보존 정규화+offsetMap), docx-block-extractor.ts, comparison-file-extractor.ts, pdf-visual-document.ts, pdf-ocr.ts와 대응 vitest 테스트를 이식. (2) Electron 결합 제거: electron-log→로거 주입, diff-cache(better-sqlite3)→캐시 인터페이스화(초기 구현: Postgres `redline_cache` 테이블, SHA-256 쌍 키), BrowserWindow 의존 파일은 제외. (3) 소스 인코딩 깨짐(mojibake) 정리, NFC 정규화 전처리 추가(조합형 자모 스팬 품질). (4) 공개 API: `extractBlocks(buffer, mime)` → `computeBlockDiff(a, b)` → DiffResultV2. 만들지 않을 것: Word COM 경로(word-redline-export — Windows 전용이라 서버 제외), XLSX/PPTX redline(2단계).

**Dependencies:** 없음 (독립 패키지)

**Code anchors:** `신규: packages/redline/**`, 원본: Contract Desk `src/main/services/{diff-engine,text-normalizer,docx-block-extractor,comparison-file-extractor,pdf-visual-document,pdf-ocr}.ts`, `src/main/__tests__/diff-engine.test.ts` 외

**Acceptance tests:** 자동 — (a) 이식된 diff-engine 테스트 전체가 pnpm test로 통과, (b) 한글 계약서 DOCX 버전쌍 픽스처에서 삽입/삭제/이동/표 셀 변경이 문자 단위 스팬으로 검출되는 회귀 테스트 — **픽스처는 익명화 합성 문서로 제작**(실계약서 리포 반입 금지; 조항 번호 문단·표·정의어 목록을 포함한 20p/100p 2종, 발주자 제공 샘플 참조 후 합성), (c) 5,000자 초과 문단의 단어 폴백 경계 테스트, (d) NFC 미정규화 입력 처리 테스트. 성능 — 100페이지급 합성 픽스처 쌍 diff가 워커 스레드에서 **p95 210초(3.5분) 내** 완료 assert(B19 e2e 5분 예산과 정합). 캐시: 초기 구현은 **캐시 생략을 기본**으로 하고, 도입 시 redline_cache(tenant_id 포함, RLS FORCE, 롤백 스크립트 — 리포 마이그레이션 규약 준수)로 추가한다.

### B19 [H2/L] Redline PDF 생성 서비스 + 버전쌍 비교 UI (R8)

**Goal:** 사용자가 문서 상세의 버전 타임라인에서 두 버전(공식 버전 또는 검토본)을 선택해 '음절단위 redline PDF 생성'을 누르면, 요약 페이지+본문 redline(추가=파랑, 삭제=빨강 취소선, 이동=초록)+변경노트로 구성된 PDF가 생성되어 권한·감사 통제 하에 열람·다운로드된다.

**Scope:** (1) apps/api ComparisonModule — 입력 (documentId, versionA, versionB) 쌍: 양 버전 canRead 권한·윤리장벽 검사(fail-closed)→S3 임시 다운로드→packages/redline 호출. 소형 문서는 동기, 그 외 pg-boss `redline.generate` 잡(Contract Desk comparison_export_jobs 패턴: PENDING→COMPLETED/FAILED, 재시도·타임아웃 정책). (2) PDF 렌더: redline HTML 조립 후 Playwright chromium printToPDF(한글 폰트 컨테이너 포함) — Electron printToPDF 대체. (3) 산출물을 rendition으로 S3 저장+documents 파생물 행 기록(원본과 동일 confidentiality 상속, REDLINE_GENERATED 감사 이벤트, 외부공유 시 B3 워터마크 경로 통과). (4) UI: 문서 상세 버전 목록에 비교 대상 선택 체크박스+'Redline PDF' 버튼, 생성 상태 표시(진행/완료/실패), 완료 시 미리보기·다운로드. B11(조항 단위 비교 탭)은 본 패키지의 diff 결과를 재사용하도록 scope 조정 — B11 deps에 B18 추가. 만들지 않을 것: PDF↔DOCX 교차 비교, 서식보존 DOCX redline(B20).

**Dependencies:** B18, B3(워터마크 — 외부공유 경로), H6(워커 — 소프트)

**Code anchors:** `신규: apps/api/src/modules/comparison/**`, `db/migrations/(신규)_create_redline_jobs.sql`, `apps/api/src/modules/document/document-version.service.ts`, `apps/web/src/components/document/document-action-center.tsx (버전 목록)`, `apps/api/src/modules/storage`

**Acceptance tests:** 자동 — tests/integration/redline.spec.ts (a) 버전쌍 생성 요청→잡 완료→rendition 행+S3 객체+REDLINE_GENERATED 감사, (b) 한쪽 버전에 읽기 권한 없는 사용자 요청 403, (c) 윤리장벽 차단 매터 문서 거부, (d) 생성 PDF에서 pdftotext로 요약 페이지 통계·삽입/삭제 텍스트 추출 검증. 수동 — 실계약서 v1/v2 업로드→redline PDF 생성→삽입 파랑/삭제 빨강취소선/변경노트 페이지 확인되면 통과. 성능 — 100페이지 DOCX 쌍 요청→PDF 완료 e2e p95 5분 내(예산 분해: diff ≤3.5분[B18], 다운로드+렌더+업로드 ≤1.5분). 실행 형상: H6(워커 분리) 완료 전에는 API 프로세스 내 pg-boss 소비로 가동하고 H6 완료 시 워커로 이전한다.

### B20 [H3/L·선택] 서식보존 redline — OOXML 트랙체인지 DOCX + PDF 변환 (R8 고도화)

**Goal:** 번호·서식·각주가 보존된 Word 트랙체인지 형식의 redline DOCX(및 그 PDF)를 서버에서 생성한다 — Word COM 없이.

**Scope:** B18 diff 결과를 원본 DOCX OOXML에 `w:ins`/`w:del` 요소로 패치(Contract Desk redline-presentation-exporter의 OOXML 패치 패턴 참조)→redline DOCX 생성→LibreOffice headless로 PDF 변환. B19의 텍스트 redline PDF가 운영에서 서식 요구에 부딪힐 때만 착수하는 조건부 유닛. 만들지 않을 것: Word COM/Windows 워커 VM.

**Dependencies:** B18, B19(운영 피드백)

**Acceptance tests:** 자동 — 생성 DOCX를 Word/LibreOffice로 열어 트랙체인지 목록이 diff 스팬과 일치하는 검증 스크립트, 각주·번호 문단 보존 픽스처 테스트. 수동 — 변호사 1인이 실계약서 redline DOCX의 변경추적 표시를 Word에서 검토·승인하면 통과.

### 기존 유닛 보강 지시 (Baseline-8 연계)

- **B11**: deps에 B18 추가, 조항 내부 diff를 packages/redline 문자 diff로 대체(이중 엔진 금지). '만들지 않는 것'의 PDF 배제는 B19가 담당함을 명시.
- **C13**: scope에 add-in 매터 자유검색 picker가 C16에서 선행 구현됨을 반영(중복 방지).
- **C14**: scope (4)의 send_and_file 원문 재검사 전제가 C16으로 해소됨을 명시.
- **B12**: 편집 종료 다이얼로그에 B17 버전 선택 통합.
