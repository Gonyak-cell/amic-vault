# 50. Verification & Security Gates — 검증 의미론·Gate 체크리스트·회귀맵

버전: 1.0 | 작성일: 2026-06-11 | 상태: Normative (00_Master_Brief.md 하위 — 충돌 시 Brief 우선)

- 승계 원천: `../vault_dev_package/docs/15_Verification_Contracts_Test_Plan.md` (보정 내역은 §7)
- 함께 읽기: `00_Master_Brief.md` §2(불변 원칙)·§6.3(Verification 의미론)·§7(Gate), `20_Data_Model_v1_1.md`(DDL), `21_Permission_Model.md`(권한 평가 계약·매트릭스), `40~43_TUW_Backlog_R0~R3.md`(TUW별 Verification), `60_Execution_Packs.md`(PACK 실행)
- 독자: Codex(구현·검증 실행), QA, 보안 리뷰어, Gate 승인자(사람)

---

## 0. 문서 위상과 사용법

1. 이 문서는 **(a) 모든 TUW에 공통 적용되는 검증 의미론**, **(b) release 단위 Gate 체크리스트 전문**, **(c) 회귀맵과 PACK 단위 회귀 실행 규칙**, **(d) 보안 핵심 검증(권한 정확도·audit 불변성)의 측정 가능한 정의**, **(e) 테스트 데이터 전략**을 규정한다.
2. Gate는 PACK이 아니라 **release 단위 체크리스트**다(Brief §9.4). 해당 release의 Gate를 통과하기 전에는 다음 release의 어떤 PACK도 착수할 수 없다.
3. 개별 TUW의 Verification 필드(40~43번 문서)가 이 문서와 충돌하면 **더 엄격한 쪽**을 적용하고, 충돌 사실을 `docs/ledger/execution.md`에 기록한다.
4. 표준 검증 명령 세트(패키지 전체에서 동일 표기):

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:rollback
pnpm db:migrate      # rollback 후 재적용 — 왕복 가역성 확인
pnpm db:seed
pnpm test:integration
```

5. 통합 테스트 부분 실행 규약: `pnpm test:integration -- tests/integration/<suite-dir>` 로 suite 디렉터리 단위 실행이 가능해야 한다(러너별 정확한 플래그는 PACK-R0-01에서 스크립트로 고정하되, 이 호출 형태를 보존한다). 본 문서의 suite 디렉터리는 다음과 같다.

| Suite 디렉터리 | 검증 대상 | 도입 release |
|---|---|---|
| `tests/integration/cross-tenant/` | tenant 격리(API·DB RLS·storage) | R0 |
| `tests/integration/audit-immutability/` | audit_events append-only | R0 |
| `tests/integration/fail-closed/` | 오류 주입 시 무조건 차단 | R0 |
| `tests/integration/permission-matrix/` | 권한 매트릭스 하네스(§3) | R1 |
| `tests/integration/audit-coverage/` | 필수 audit event 누락 0 | R1 |
| `tests/integration/document-access/` | 문서 업로드·다운로드·미리보기 권한 | R2 |
| `tests/integration/storage-isolation/` | object storage tenant prefix·서명 URL | R2 |
| `tests/integration/legal-hold/` | hold flag 삭제 차단 | R2 |
| `tests/integration/search-permission/` | 검색 권한 필터 주입·wall 격리 | R3 |
| `tests/integration/metadata-leakage/` | 검색 메타데이터 누설(§2.4) | R3 |

**매핑 규칙 (canonical suite 레지스트리)**: 위 10개 디렉터리가 `tests/integration/` 하위 suite 디렉터리의 **폐쇄 목록**이다(디렉터리 신설은 본 표 개정 + 사람 승인 필요). `60_Execution_Packs.md`의 PACK 검증 시퀀스와 40~43번 TUW Verification에 등장하는 suite 키워드(예: `storage-tenant`, `search-index`, `search-core`, `search-filter`, `evalset`)는 **별도 디렉터리가 아니라 위 10개 디렉터리 중 해당 영역 디렉터리 하위의 spec 파일명**으로 해석한다. 즉 `pnpm test:integration -- <키워드>`는 러너의 경로/파일명 필터로 동작한다 — 예: `storage-tenant` → `tests/integration/storage-isolation/storage-tenant.int.spec.ts`, `search-index` → `tests/integration/search-permission/search-index.int.spec.ts`. 키워드가 어느 디렉터리에도 자연 귀속되지 않으면 추측하지 말고 escalation한다.

6. 데모 tenant 시드(§6)는 `pnpm test:integration`의 global setup에서 **멱등(idempotent)** 으로 적재된다. 수동 진입점은 `pnpm db:seed`다(표준 세트 §0-4에 포함 — PACK-R0-01에서 확정, CORE-DATACORE-MIGR-TUW-003 산출물).

---

## 1. Verification 의미론 (Brief §6.3 C-8 — AND 규칙)

### 1.1 AND 규칙

원천 백로그의 OR boilerplate를 폐기한다(보정 C-8). 모든 TUW의 Verification은 **해당하는 영역 전부를 AND로 충족**해야 완료다. 하나라도 red면 그 TUW는 미완료이며, PACK PR을 올릴 수 없다.

| TUW 유형 | 필수 검증 (AND) |
|---|---|
| 모든 TUW | 기능검증 **AND** 회귀검증 |
| 권한·보안 영향 TUW | 위 **AND** 권한검증(negative test 포함, §1.3) |
| 행위 기록 대상 TUW | 위 **AND** 감사검증 |
| Risk=C TUW | 위 **AND** 사람(또는 상위 검토 에이전트) 리뷰 게이트. **Codex 단독 머지 금지** |

적용례 — `DOC-DOCUUPLO-UPLOAPI-TUW-006`(upload permission check, Risk H): 기능검증(권한 있는 업로드 성공) AND 권한검증(비멤버 업로드가 `PERMISSION_DENIED`로 차단되는 negative test) AND 감사검증(차단 시 `ACCESS_DENIED` audit 발생) AND 회귀검증(기존 suite green). 네 가지 중 어느 하나의 생략도 허용되지 않는다.

### 1.2 영역별 정의

| 영역 | 정의 | 통과 기준 | 표준 명령 |
|---|---|---|---|
| **기능검증** | TUW Objective가 기술한 동작이 unit/integration 테스트로 재현·증명됨 | 신규 테스트 green + Objective의 검증 가능 문장이 테스트 이름/assert에 1:1 대응 | `pnpm test`, `pnpm test:integration -- <suite>` |
| **권한검증** | 인가된 주체는 허용되고 **비인가 주체의 시도는 차단**됨. 차단은 fail-closed(Brief §2-4) | positive + negative 테스트 모두 green. negative는 §1.3 규칙 충족 | `pnpm test:integration -- tests/integration/permission-matrix` 외 해당 suite |
| **감사검증** | 행위 1건당 정의된 audit event가 정확히 발생하고 필수 metadata 필드가 채워짐. audit insert 실패 시 본 행위도 실패(같은 트랜잭션) — Audit-by-default(Brief §2-3) | 이벤트 존재 + 필드 충족 + metadata 화이트리스트 준수(본문·기밀 원문 부재, Brief §2-7) assert green | `pnpm test:integration -- tests/integration/audit-coverage` |
| **회귀검증** | 기존 전체 suite가 green이고, 변경 영역이 회귀맵(§4) trigger면 지정 회귀 suite도 green | `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 전부 성공 + §4.2 규칙의 추가 suite 성공 | 표준 세트 전체 |
| **성능검증** | R0~R3에서는 **측정·기록** 중심: API p95, 검색 p95, 인덱스 반영 지연을 측정해 수치를 남김. R3 Gate에서 인덱스 반영 SLA를 정의·측정(§2.4-⑤) | 측정치가 Gate report에 기록됨. SLA가 정의된 항목은 SLA 이내 | `pnpm test:integration` 내 측정 케이스 + metrics endpoint |

주: 원천 15번 §1의 13개 영역(Contract/UX/Observability/Documentation 등)은 위 5개 영역으로 흡수한다 — Contract 검증은 기능검증의 일부(요청·응답 zod 스키마 assert), Observability·Documentation은 해당 TUW(CORE-OBSE-*, DEVOPS-*)의 기능검증으로 취급한다. AI Verification은 R6 전 적용 대상이 없다(절대 금지 목록).

### 1.3 Negative test 작성 규칙 (권한·보안 영향 TUW 필수)

**N-1. 최소 1개의 비인가 시도 차단 테스트.** 권한·보안 영향 TUW는 "비인가 주체가 시도했을 때 차단된다"를 검증하는 테스트 없이는 완료될 수 없다. 허용 케이스만 검증하는 권한 테스트는 무효다.

**N-2. 차단의 4요소를 모두 assert.**
1. HTTP/서비스 응답이 차단임 (표준 error code: `PERMISSION_DENIED`, `ETHICAL_WALL_BLOCKED`, `DOCUMENT_LOCKED`, `TENANT_ISOLATION_VIOLATION` 등 — 09번 §4의 9종, R0 `CORE-SECFOUND-FAILCLOSE-TUW-001`에서 코드화)
2. 응답 본문·헤더에 자원의 존재·제목·소유 tenant를 추론할 단서가 없음(safe denied message — 구체 응답 형태는 21번 문서의 계약을 따름)
3. `ACCESS_DENIED` audit event가 기록됨 (R1 `AUDIT-PERMAUDI-PERMEVEN-TUW-002` 이후)
4. 대상 자원의 상태가 변하지 않음 (DB row·storage object 불변 확인)

**N-3. 우회 경로 포함.** 정문(정상 API 호출) 차단만으로는 부족하다. 해당 TUW에 적용 가능한 우회 경로를 최소 1개 이상 추가한다:
- 자원 ID 직접 지정(타 tenant·비인가 matter의 UUID를 추측 입력)
- 목록 API의 필터 파라미터 변조(matterId 치환, tenant 필터 제거 시도)
- 서명 URL·다운로드 토큰 재사용/타 사용자 세션에서 사용 (R2+)
- 검색 쿼리를 통한 간접 노출 (R3+)

**N-4. Fail-closed 오류 주입.** 권한 판단 경로에 오류를 주입(PermissionService 예외 throw, `condition_json` 해석 불가 값, DB timeout mock)했을 때 결과가 **무조건 `PERMISSION_DENIED`** 임을 검증한다. "오류 시 허용"이나 "오류 시 빈 결과가 아닌 전체 결과"가 관찰되면 즉시 작업 중단 + escalation(Brief §6.4).

**N-5. 양방향 검증 (wall·격리 계열).** ethical wall, tenant 격리처럼 대칭 구조인 경우 한쪽 방향만 검증하지 않는다. A→B 차단과 B→A 차단을 각각 별도 케이스로 작성한다.

**N-6. 경계 주체 사용.** negative test의 주체는 "아무 권한 없는 사용자"만으로 충분하지 않다. **가장 가까운 비인가자**를 사용한다 — 예: 같은 tenant의 다른 matter member, wall-excluded인 Firm Admin, closed matter의 전 member, `valid_to`가 지난 permission 보유자.

**N-7. 시드 fixture만 사용.** negative test는 §6의 결정적(deterministic) fixture(고정 UUID·고정 자격증명)를 사용한다. 테스트 내 임의 생성 데이터로 권한 경계를 만들면 회귀 시 재현성이 깨진다.

---

## 2. R0~R3 Gate 체크리스트 전문 (Brief §7의 1:1 확장)

### 2.0 Gate 운영 규칙

1. **단위·차단 효과**: Gate는 release 단위다. Gate 미통과 상태에서 다음 release PACK 착수는 절대 금지(Brief §9.4). R1 Gate에는 Permission Model Freeze가 포함되며 **Freeze 전 R2·R3 착수 금지**(보정 C-1).
2. **증빙**: 각 Gate 항목은 (검증 방법, 통과 기준, 증빙)을 갖는다. 증빙은 `docs/ledger/gates/R{N}_gate.md`에 Gate report로 작성한다 — CI run 식별자, 명령 출력(요약 + 원본 링크), SQL 실행 결과, 미해결 항목 0건 확인, 승인자 서명 라인. `docs/ledger/execution.md`에는 1줄 요약(Gate ID, 일자, 결과)을 추가한다.
3. **승인자**: 모든 Gate는 사람 승인 서명이 필요하다. Risk=C 항목이 포함된 Gate(전부 해당)는 Codex 자체 판정으로 통과 처리할 수 없다.
4. **부분 통과 금지**: 체크리스트 중 1개라도 미충족이면 Gate 불통과다. "조건부 통과"는 없다. 미충족 항목은 TUW로 환원해 해소 후 재시도한다.
5. **재검증**: Gate 통과 후 해당 release 범위 코드에 변경이 발생하면(핫픽스 등) 영향 항목을 재실행하고 Gate report에 추기한다.

### 2.1 R0 Gate — Foundation Completion

선행: R0 35 TUW 전체 완료, `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green.

#### R0-G1. 신규 클론 재현

| 항목 | 내용 |
|---|---|
| 검증 방법 | 깨끗한 환경(신규 클론, 캐시 없음)에서 순서대로 실행: `pnpm install` → `docker compose -f infra/docker-compose.dev.yml up -d` → `pnpm db:migrate` → `pnpm build` → `pnpm test` → `pnpm test:integration`. 추가로 `pnpm db:rollback` 후 `pnpm db:migrate` 재적용이 성공해야 한다 |
| 통과 기준 | 위 명령 전부 exit 0, 수동 개입(환경변수 비밀값 외 임의 수정) 0회. README/문서에 없는 절차가 필요했다면 불통과 |
| 증빙 | 전체 명령 로그(원본 링크), 소요 시간, 사용한 OS/런타임 버전 |

#### R0-G2. Cross-tenant 전 endpoint 차단

| 항목 | 내용 |
|---|---|
| 검증 방법 | `pnpm test:integration -- tests/integration/cross-tenant`. suite는 **R0 시점에 존재하는 모든 인증 필요 endpoint**를 열거하고(라우트 테이블에서 자동 수집 — 수동 목록 금지), tenant-beta 사용자 세션으로 tenant-alpha 자원 ID를 직접 지정해 호출한다 |
| 시나리오(최소) | XT-01: GET 계열 — 타 tenant 자원 ID 직접 조회 → 차단, 존재 단서 없음(N-2) · XT-02: 목록 API — 응답에 타 tenant row 0건 · XT-03: 변경 계열(PUT/POST/DELETE) — 차단 + 대상 row 불변 · XT-04: tenant context 누락 요청 → 차단(fail-closed) · XT-05: DB 계층 RLS — 아래 SQL |
| RLS SQL | 앱 role 세션에서: `SET app.current_tenant_id = '<tenant-beta-uuid>'; SELECT count(*) FROM matters WHERE tenant_id = '<tenant-alpha-uuid>';` → **0**. 그리고 RLS 정책 부재 테이블 검출: `SELECT t.tablename FROM pg_tables t WHERE t.schemaname='public' AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename=t.tablename) AND t.tablename NOT IN ('tenants' /* + 명시 주석된 글로벌 참조 테이블 */);` → **0행**. `FORCE ROW LEVEL SECURITY` 적용 여부도 `pg_class.relforcerowsecurity`로 확인 |
| 통과 기준 | endpoint 누락 0(자동 수집 목록 대비), 전 케이스 green, RLS 부재 테이블 0 |
| 증빙 | suite 결과, 자동 수집된 endpoint 목록, SQL 출력 |

#### R0-G3. Audit UPDATE·DELETE DB 실패

| 항목 | 내용 |
|---|---|
| 검증 방법 | `pnpm test:integration -- tests/integration/audit-immutability` (§5의 AUD-IMM-01~09 전체) + §5.2의 검증 SQL을 Gate report에 직접 실행·첨부 |
| 통과 기준 | 앱 role과 테이블 owner 모두에서 UPDATE/DELETE/TRUNCATE 시도가 **DB 계층에서** 실패. 애플리케이션 코드 가드만으로 막는 것은 불통과(절대 금지: "`audit_events`에 UPDATE/DELETE 가능한 경로") |
| 증빙 | suite 결과 + SQL 출력(에러 메시지 원문 포함) |

#### R0-G4. Fail-closed 동작 증명

| 항목 | 내용 |
|---|---|
| 검증 방법 | `pnpm test:integration -- tests/integration/fail-closed` (CORE-SECFOUND-FAILCLOSE-TUW-002의 강제 오류 주입 테스트). 케이스: FC-01 guard 내부 예외 throw → `PERMISSION_DENIED` · FC-02 tenant context resolve 실패 → 차단 · FC-03 DB 연결 오류 mock → 차단(빈 허용 아님) · FC-04 미정의 정책/해석 불가 입력 → 차단 · FC-05 차단 응답에 stack trace·내부 정보 미노출 |
| 통과 기준 | 전 케이스에서 응답이 표준 error code이고, 어떤 주입 케이스에서도 자원 접근·변경이 발생하지 않음 |
| 증빙 | suite 결과, 표준 error code 9종 구현 목록(09번 §4 대비 diff 0) |

#### R0-G5. ADR 승인

| 항목 | 내용 |
|---|---|
| 검증 방법 | `docs/adr/ADR-001~012` 존재·상태 필드 확인(DEVOPS-DOCSPKG-TRANSFER-TUW-002). `01_Adopted_Decisions_ADR.md`와 본문 일치 검토 |
| 통과 기준 | 12건 전부 상태 `Accepted`, 승인자 기재. `tools/backlog` 검증 스크립트(DEVOPS-BACKLOG-VALIDATE-TUW-001)가 CI에서 green(DAG 순환 0, release 규칙 위반 0 — AI<R6 금지 등) |
| 증빙 | ADR 목록·상태 표, backlog 검증 CI run |

### 2.2 R1 Gate — Matter Core

선행: R1 52 TUW 완료, R0 Gate 항목 전체 재실행 green(회귀).

#### R1-G1. 권한 매트릭스 하네스 100%

| 항목 | 내용 |
|---|---|
| 검증 방법 | `pnpm test:integration -- tests/integration/permission-matrix` (SEC-PERMHARN-MATRIX-TUW-001~002). 매트릭스 정의·측정 방식은 §3 |
| 통과 기준 | **Permission Accuracy = 100%** (§3.1). 셀 1개 실패도 불통과. expected가 미정의된 (role × action × 상태) 조합 0건 |
| 증빙 | 매트릭스 전 셀 결과표(CSV), CI run, false-allow 발생 이력 0 확인 |

#### R1-G2. Cross-tenant (R1 확장)

| 항목 | 내용 |
|---|---|
| 검증 방법 | R0-G2와 동일 suite를 R1에서 추가된 endpoint(client/matter/member/party/role/wall/audit query) 포함해 재실행. endpoint 자동 수집이므로 누락 불가 구조여야 함 |
| 통과 기준 | R0-G2와 동일 + 신규 테이블(clients, matters, matter_members, parties, permissions, groups, group_members, ethical_walls, ethical_wall_memberships)의 RLS 정책 존재 |
| 증빙 | suite 결과, RLS 부재 테이블 검출 SQL 0행 |

#### R1-G3. Audit coverage 100% (matter·member·permission 행위)

| 항목 | 내용 |
|---|---|
| 검증 방법 | `pnpm test:integration -- tests/integration/audit-coverage`. **필수 이벤트 목록**(분모): MATTER_CREATED, MATTER_UPDATED, MATTER_STATUS_CHANGED, MATTER_MEMBER_ADDED, MATTER_MEMBER_REMOVED, ROLE_ASSIGNED, ROLE_CHANGED, PERMISSION_CHANGED, ETHICAL_WALL_CREATED, ETHICAL_WALL_MEMBERSHIP_CHANGED, ACCESS_DENIED, LOGIN_SUCCESS, LOGIN_FAILURE. suite가 각 행위를 1회 이상 실행하고 대응 이벤트의 존재·필수 metadata(08번 §6 승계: actor_id, 대상 참조 ID, before/after는 **참조 ID/diff 요약 수준**)를 assert |
| 통과 기준 | coverage = 발생 확인 이벤트 종류 / 필수 이벤트 종류 = **100%**. 추가로: metadata_json 키가 화이트리스트 밖인 row 0건(`AUDIT-AUDIEVENCO-AUDILOGG-TUW-003` normalizer), audit insert 실패 주입 시 본 행위 트랜잭션 롤백 확인(Audit-by-default) |
| 증빙 | 이벤트별 샘플 row(민감값 마스킹), coverage 표 |

#### R1-G4. Fail-closed 오류 주입 통과 (권한 평가 경로)

| 항목 | 내용 |
|---|---|
| 검증 방법 | R0-G4 suite 확장: canReadMatter/canEditMatter/canUploadToMatter 각각에 대해 — FC-11 평가 중 예외 → DENY · FC-12 `condition_json` 해석 불가 → DENY(20번 문서 §permissions 계약) · FC-13 wall membership 조회 실패 → DENY · FC-14 deny-overrides 확인(wall DENY > 명시 DENY > 명시 ALLOW) · FC-15 matter_members 부재 시 명시 ALLOW가 있어도 DENY(membership은 ALLOW의 필요조건) |
| 통과 기준 | 전 케이스 DENY + `ACCESS_DENIED` audit 기록 |
| 증빙 | suite 결과 |

#### R1-G5. Permission Model Freeze 문서 승인 (보정 C-1)

| 항목 | 내용 |
|---|---|
| 검증 방법 | DEVOPS-FREEZE-PERMMODEL-TUW-001 산출물 검토: role matrix(7종 × action), canRead*/canEdit*/canUpload* 시그니처, wall schema, 검색 filter 주입 지점이 동결 명세에 포함되는지. Decision Ledger(`docs/ledger/decision.md`) 등재 확인 |
| 통과 기준 | Freeze 문서가 21번 문서·구현 코드와 3자 일치(diff 0), 사람 승인 서명. **이 항목 통과 전 R2·R3 PACK 착수 금지** |
| 증빙 | Freeze 문서 링크, Decision Ledger 항목, 승인 서명 |

### 2.3 R2 Gate — Document Vault

선행: R2 59 TUW 완료, R0·R1 Gate 항목 재실행 green.

#### R2-G1. 동일파일 동일 hash · 1바이트 상이 hash

| 항목 | 내용 |
|---|---|
| 검증 방법 | `tests/fixtures/documents/`의 hash 쌍 fixture(§6.4) 사용. HASH-01: 동일 바이트 파일 2회 업로드 → SHA-256 동일 + 중복 후보 탐지 동작 · HASH-02: 1바이트 상이 쌍 업로드 → hash 상이 · HASH-03: 저장 후 재계산 hash가 version.hash와 일치(무결성) · HASH-04: hash mismatch 주입 → alert 발생(DOC-DOCUINTE-HASHDUPL-TUW-005) |
| 통과 기준 | 전 케이스 green, hash는 fixture manifest의 사전 계산값과 일치(§6.6) |
| 증빙 | suite 결과 |

#### R2-G2. 원본 덮어쓰기 불가 (Immutable original)

| 항목 | 내용 |
|---|---|
| 검증 방법 | IMM-01: 동일 document에 신규 버전 업로드 → 기존 FileObject의 storage key·바이트·hash 불변, 신규 FileObject 생성 확인 · IMM-02: storage adapter에 동일 key PUT 시도 → 어댑터 계층에서 거부(키 재사용 금지 정책) · IMM-03: API 표면에 원본 교체 기능이 존재하지 않음을 라우트 테이블 검사로 확인 |
| 통과 기준 | 전 케이스 green. "버전은 항상 신규 FileObject"(Brief §2-5) 위반 경로 0 |
| 증빙 | suite 결과, 라우트 검사 출력 |

#### R2-G3. 권한 없는 업로드·다운로드·미리보기 차단

| 항목 | 내용 |
|---|---|
| 검증 방법 | `pnpm test:integration -- tests/integration/document-access`. 주체는 N-6의 경계 주체(같은 tenant 비멤버, Limited Reviewer 범위 밖 문서, closed matter 전 member). DOC-NEG-01 업로드 차단 · DOC-NEG-02 다운로드 차단 · DOC-NEG-03 미리보기(preview endpoint) 차단 · DOC-NEG-04 버전 목록·메타데이터 조회 차단 · DOC-NEG-05 차단 응답이 safe denied message(N-2-2) · DOC-NEG-06 download reason 미입력 시 정책상 요구되는 경우 거부(SEC-DOCUPERM-ACCECONT-TUW-004) |
| 통과 기준 | 전 케이스에서 차단 4요소(N-2) 충족. preview가 PermissionService를 우회하는 별도 경로를 갖지 않음(절대 금지 항목) — preview controller가 동일 canReadDocument를 호출함을 unit assert |
| 증빙 | suite 결과 |

#### R2-G4. Hold flag 삭제 차단 (legal hold 인터페이스, 보정 C-3)

| 항목 | 내용 |
|---|---|
| 검증 방법 | `pnpm test:integration -- tests/integration/legal-hold`. HOLD-01: `documents.legal_hold=true` 문서 soft delete 시도 → `DOCUMENT_LOCKED` 차단 · HOLD-02: `matters.legal_hold=true`인 matter 하위 문서 삭제 시도 → 차단 · HOLD-03: 차단 후 문서 상태·row 불변 · HOLD-04: hold 해제 후 soft delete 성공(인터페이스 동작 확인) · HOLD-05: hard delete 경로가 코드베이스에 존재하지 않음(절대 금지 — DELETE FROM documents 계열 호출 정적 검사) |
| 통과 기준 | 전 케이스 green. delete precondition check가 service layer 공통 경로에 있어 우회 endpoint가 없음 |
| 증빙 | suite 결과, 정적 검사 출력 |

#### R2-G5. DOCUMENT_* audit 5종 누락 0

| 항목 | 내용 |
|---|---|
| 검증 방법 | audit-coverage suite 확장. **5종**: DOCUMENT_UPLOADED, DOCUMENT_VIEWED, DOCUMENT_DOWNLOADED, DOCUMENT_DELETED, DOCUMENT_METADATA_CHANGED. 각 행위 실행 → 이벤트 존재 + 필수 metadata(08번 §6: document_id, version_id, hash, matter_id / reason, ip 등) assert. DOCUMENT_RESTORED는 DOC-DOCULIFE-LIFEMANA-TUW-002(Risk C)의 감사검증 항목으로 함께 확인한다 |
| 통과 기준 | 5종 + RESTORED 누락 0. 신규 버전 업로드·preview 조회도 각각 UPLOADED·VIEWED를 발생시킴 |
| 증빙 | 이벤트별 샘플 row, coverage 표 |

#### R2-G6. Storage cross-tenant 차단 (서명 URL 포함)

| 항목 | 내용 |
|---|---|
| 검증 방법 | `pnpm test:integration -- tests/integration/storage-isolation`. STOR-01: storage key가 항상 tenant prefix로 시작(`<tenant_id>/...`) — path resolver unit + 실제 적재 key 검사 · STOR-02: tenant-beta 사용자가 tenant-alpha 문서의 서명 URL 발급 시도 → 차단 · STOR-03: tenant-alpha 사용자에게 발급된 서명 URL을 tenant-beta 세션·비로그인으로 사용 → 만료/스코프 정책에 따른 차단(발급 시 단기 만료 필수) · STOR-04: 서명 URL이 prefix 밖 key를 가리키도록 변조 → 거부 · STOR-05: MinIO 버킷 직접 나열 시 앱 자격증명이 타 tenant prefix 객체에 접근 가능한 경로가 API 표면에 없음 |
| 통과 기준 | 전 케이스 green |
| 증빙 | suite 결과, 샘플 storage key 목록 |

#### R2-G7. 파일 본문 로그 미기록 (Sensitive data is not logged)

| 항목 | 내용 |
|---|---|
| 검증 방법 | **마커 기법**(§6.4): 모든 문서 fixture는 충돌 불가능한 고유 마커 문자열(예: `FIXMARK-DOC-8f2a91`)을 본문에 포함한다. R2 전체 integration suite 실행 후 — LOG-01: 애플리케이션 로그 전체에서 마커 검색 → 0건 · LOG-02: `SELECT count(*) FROM audit_events WHERE metadata_json::text LIKE '%FIXMARK%';` → 0 · LOG-03: 오류 로그(추출 실패·업로드 실패 케이스 포함)에도 본문·파일 내용 미기록, 참조 ID/hash만 존재 |
| 통과 기준 | 마커 검출 0건. metadata_json 화이트리스트 검사(R1-G3) 재실행 green |
| 증빙 | 검색 명령·출력, SQL 결과 |

### 2.4 R3 Gate — Permission-bound Search

선행: R3 28 TUW 완료, R0·R1·R2 Gate 항목 재실행 green. **사후 필터링 우회가 1건이라도 발견되면 다른 항목과 무관하게 Gate 불통과.**

#### R3-G1. 권한 없는 문서가 title/snippet/metadata 어디에도 미노출

| 항목 | 내용 |
|---|---|
| 검증 방법 | `pnpm test:integration -- tests/integration/metadata-leakage`. 모든 케이스는 "권한 있는 사용자에게는 보인다"를 먼저 확인한 뒤(대조군) 비인가 사용자로 반복한다. 누설 채널별 시나리오: |
| 시나리오 | LEAK-01 **title**: 비인가 문서 제목의 고유 토큰 검색 → 0건 · LEAK-02 **snippet**: 본문 고유 마커 검색 → snippet/highlight에 미노출 · LEAK-03 **highlight**: 부분 일치 키워드에서도 비인가 문서 조각 미포함 · LEAK-04 **total count**: 동일 쿼리에 대해 비인가 사용자의 total이 인가 사용자보다 작아야 하며, 비인가 문서 수가 total에 합산되지 않음 · LEAK-05 **facet 집계**: documentType/clientId/date facet count에 비인가 문서 미포함 · LEAK-06 **pagination**: 페이지 수·커서로 존재 추론 불가(셀 수 일치) · LEAK-07 **응답 메시지**: "권한으로 N건 제외" 류 문구 금지 · LEAK-08 **오류 경로**: 검색 오류 응답에 인덱스 내용 미포함 |
| 통과 기준 | 전 채널 0누설. 결과 카드 UI(SEARCH-UI-PAGE-TUW-003)에 AI 관련 표시 없음(절대 금지: R6 전 AI 기능) |
| 증빙 | suite 결과, 대조군/실험군 응답 샘플 |

#### R3-G2. Wall 양측 상호 격리

| 항목 | 내용 |
|---|---|
| 검증 방법 | §6.3의 wall fixture 사용. WALL-01: excluded 사용자가 wall 대상 matter 문서의 고유 마커 검색 → 0건 · WALL-02: **역방향**(N-5) — 반대측 excluded도 동일 검증 · WALL-03: insider는 정상 노출(대조군) · WALL-04: excluded가 Firm Admin role이어도 차단(wall DENY > role ALLOW — deny-overrides) · WALL-05: wall membership 추가/제거 직후 다음 쿼리부터 즉시 반영 · WALL-06: 직접 문서 API 접근도 차단(검색 외 경로 — SEC-ETHIWALL-WALLENFO-TUW-005와 PERMFILT-003 통합 검증) |
| 통과 기준 | 전 케이스 green, ETHICAL_WALL_BLOCKED 또는 동등 차단 + audit 기록 |
| 증빙 | suite 결과 |

#### R3-G3. deleted·superseded 제외

| 항목 | 내용 |
|---|---|
| 검증 방법 | SRCH-EX-01: soft delete된 문서가 검색 미노출(인가 사용자에게도) · SRCH-EX-02: superseded 버전 미노출, 최신 버전만 노출 · SRCH-EX-03: restore 후 재노출 · SRCH-EX-04: status filter(SEARCH-METASEAR-FILT-TUW-005)로 명시 조회 시에도 권한 필터는 유지 |
| 통과 기준 | 전 케이스 green |
| 증빙 | suite 결과 |

#### R3-G4. 인덱스 cross-tenant 차단

| 항목 | 내용 |
|---|---|
| 검증 방법 | XT-IDX-01: 검색 API에서 tenant-beta 사용자가 tenant-alpha 문서 마커 검색 → 0건 · XT-IDX-02: 인덱스 테이블(tsvector) 자체에 RLS 존재 — R0-G2의 RLS 부재 검출 SQL에 search index 테이블 포함 확인 · XT-IDX-03: 인덱싱 job이 tenant context 없이 실행될 수 없음(fail-closed) |
| 통과 기준 | 전 케이스 green |
| 증빙 | suite 결과, SQL 출력 |

#### R3-G5. 권한 변경→인덱스 반영 SLA 정의·측정

| 항목 | 내용 |
|---|---|
| 검증 방법 | 두 층위를 구분해 검증한다. **(a) 권한 변경의 검색 반영 = 즉시(0)**: 권한 필터는 쿼리 시점 주입이므로(Permission-before-search) 권한 회수·wall 변경은 인덱스 갱신과 무관하게 **다음 쿼리부터** 미노출이어야 한다(SLA-01: member 제거 직후 검색 → 0건) · **(b) 인덱스 비정규화 속성의 반영 SLA**: 문서 metadata·상태 변경이 인덱스에 반영되는 지연을 측정(SEARCH-SEARINDE-INDE-TUW-003). SLA-02: 변경→갱신 job 완료 p95 측정, 목표값을 Gate에서 확정·기록 |
| 통과 기준 | (a)는 즉시성 테스트 green — 지연 허용 없음. (b)는 SLA 수치가 정의되고 측정치가 SLA 이내이며 측정 방법이 재현 가능 |
| 증빙 | SLA 정의문(Decision Ledger 등재), 측정 스크립트·p95 수치 |

#### R3-G6. 검색 audit 100%

| 항목 | 내용 |
|---|---|
| 검증 방법 | 모든 검색 실행(`POST /v1/search`)에 SEARCH_EXECUTED audit(본 패키지 canonical 이벤트명) 발생: actor_id, tenant_id, 쿼리 hash(원문 아님 — 쿼리 문자열에 기밀이 포함될 수 있음), 필터 요약, 결과 건수. SAUD-01: 정상 검색 → 이벤트 존재 · SAUD-02: 0건 검색도 기록 · SAUD-03: 차단·오류 검색도 기록 · SAUD-04: metadata에 검색 결과 내용(제목·snippet) 미포함 |
| 통과 기준 | coverage 100%, 쿼리 원문·결과 본문 미기록 |
| 증빙 | coverage 표, 샘플 row |

#### R3-G7. 사후 필터링 우회 부재 (발견 시 즉시 불통과)

| 항목 | 내용 |
|---|---|
| 검증 방법 | 3중 검사. **(a) 구조적 fail-closed**: 권한 필터 객체 없이 검색 query builder를 호출하면 실행 전에 예외가 발생함을 unit test로 증명(필터 주입이 선택이 아니라 타입/런타임 강제) · **(b) 정적 검사**: search 결과 컬렉션에 대해 `canRead*` 류를 호출하는 post-filter 패턴 금지 — lint rule 또는 grep 기반 CI 검사(`apps/api/src/modules/search/` 내 결과 배열 필터링 + permission 호출 조합 검출) · **(c) 사람 리뷰**: 검색 경로 코드 워크스루를 Gate 승인자가 수행, 쿼리 생성 지점에서 matter filter·document filter·wall filter 3종 주입(SEARCH-PERMSEAR-PERMFILT-TUW-001~003)을 직접 확인 |
| 통과 기준 | (a)(b)(c) 전부 충족. 사후 필터링이 1곳이라도 발견되면 **R3 Gate 전체 불통과** + Learning Ledger 기록 |
| 증빙 | unit test, CI 검사 규칙·출력, 리뷰 기록 |

---

## 3. Permission Accuracy 측정 정의

### 3.1 정의

```
Permission Accuracy = (expected와 actual 판정이 일치한 셀 수) / (시나리오 매트릭스 전체 셀 수)
```

- **분모(시나리오 매트릭스)**: (subject, action, resource-state)의 유효 조합 전체. 각 셀은 expected ∈ {ALLOW, DENY}가 **사전에** 정의되어 있어야 한다. expected 미정의 셀이 존재하면 매트릭스 자체가 불완전한 것이며, accuracy 계산 이전에 R1-G1 불통과다.
- **분자**: 하네스 실행 시 actual 판정(허용/차단)이 expected와 일치한 셀 수.
- **목표: 100%.** 99.9%는 통과가 아니다. 셀 1개 실패 = CI red = merge 차단.

실패의 두 방향은 accuracy 계산상 동일하게 1셀 실패지만, 처리 절차가 다르다:

| 유형 | 의미 | 처리 |
|---|---|---|
| **false-allow** (expected DENY, actual ALLOW) | 보안 결함 | **즉시 작업 중단 + escalation**(Brief §6.4). 원인 수정 전 해당 PACK·release 진행 금지. Learning Ledger에 패턴 기록 |
| **false-deny** (expected ALLOW, actual DENY) | 기능 결함 | 일반 버그로 수정. 단, "DENY로 고쳐서 통과"는 expected 변경이므로 21번 문서 개정 + Decision Ledger 없이 금지 |

### 3.2 시나리오 매트릭스 차원 (R1 기준)

expected의 canonical 원천은 `21_Permission_Model.md`의 권한 매트릭스다. 하네스 fixture(`tests/fixtures/permission-matrix.json` — 21번 §3 표의 1:1 변환본, **action 식별자도 21번 표기가 권위**)는 21번 문서에서 생성하며, 임의 수기 작성을 금지한다.

| 차원 | 값 |
|---|---|
| **role** (7종, DEC-15) | Firm Admin, Security Admin, Matter Owner, Matter Member, Limited Reviewer, Knowledge Manager, External User(R11 전에는 모든 action expected=DENY) |
| **action** (R1 시점 — 식별자는 21번 §3 표기 그대로) | tenant.settings_read, tenant.settings_update, user.create_invite, user.role_assign, group.manage, client.create/update, client.read, matter.create, matter.read, matter.update/status_change, matter.close/archive, matter.reopen, matter.member_add/remove, party.manage, permission.grant/revoke, wall.create/manage/release, audit.read(tenant 전체/자기 matter 범위) — R2에서 document.upload/new_version, document.read, document.metadata_edit, document.download, document.soft_delete, document.restore, document.status_change, legal_hold.flag_set/unset 추가, R3에서 search.execute, evaluation_cases.manage 추가. 단 `ai_policy.manage`·`document.ai_allowed_set`·`matter.ai_policy_assign`은 **R6 활성**(R2는 스키마 + metadata editor 경유 `document.ai_allowed` 설정만)이므로 R6 전에는 action 차원·§3.3 diff 대상에 포함하지 않는다 |
| **membership 상태** | 해당 matter의 member / 비member / 전 member(closed 후) |
| **wall 상태** | 없음 / insider / excluded |
| **matter 상태** | active / closed / archived (closed·archived는 mutation 계열 expected=DENY) |
| **tenant** | same / cross (cross는 전 action expected=DENY) |
| **permission 유효기간** | 유효 / `valid_to` 경과(expected=DENY) |

전 차원의 곱이 아니라 **유효 조합**만 셀로 채택한다(예: 비member에 wall insider 조합은 없음). 조합 축소 근거는 `permission-matrix.json` 생성 스크립트에 주석으로 남긴다. R1 매트릭스의 최소 규모 기대치는 수백 셀 수준이며, 정확한 수는 21번 문서가 확정한다.

매트릭스 케이스 형식(JSON — `tests/fixtures/permission-matrix.json`):

```jsonc
[
  { "case_id": "PM-0001", "role": "matter_member", "action": "matter.read", "membership": "member",     "wall_state": "none",     "matter_state": "active", "tenant": "same", "perm_validity": "valid", "expected": "ALLOW" },
  { "case_id": "PM-0002", "role": "matter_member", "action": "matter.read", "membership": "non_member", "wall_state": "none",     "matter_state": "active", "tenant": "same", "perm_validity": "valid", "expected": "DENY"  },
  { "case_id": "PM-0003", "role": "firm_admin",    "action": "matter.read", "membership": "non_member", "wall_state": "excluded", "matter_state": "active", "tenant": "same", "perm_validity": "valid", "expected": "DENY"  }
]
```

### 3.3 매트릭스 확장 규칙 (drift 방지)

1. **새 action·새 canX 메서드를 추가하는 TUW는 매트릭스 행 추가 없이 merge 금지.** CI에 PermissionService의 export된 `can*` 메서드 목록과 `tests/fixtures/permission-matrix.json`의 action 목록을 diff하는 검사 스크립트를 둔다(`tools/backlog/` 검증 스크립트와 동일한 방식, SEC-PERMHARN-MATRIX-TUW-002에 포함). 불일치 발견 시 CI red. 단 §3.2에 명시된 R6 활성 AI 정책 액션(`ai_policy.manage`·`document.ai_allowed_set`·`matter.ai_policy_assign`)은 해당 release 도달 전 diff 대상에서 제외한다.
2. R2·R3에서 action 차원이 늘어날 때마다 매트릭스를 확장하고, 해당 release Gate에서 100%를 재달성해야 한다.
3. expected 변경(정책 변경)은 Permission Model Freeze 이후에는 21번 문서 개정 + Decision Ledger 등재 + 사람 승인 없이 불가하다.

### 3.4 CI 연결

| 시점 | 실행 범위 |
|---|---|
| 모든 PACK PR | 권한·보안 영향 PACK(§4.2 분류) → permission-matrix suite **필수**. 그 외 PACK → unit 내 권한 테스트만 |
| main merge (R1 Gate 이후 상시) | permission-matrix suite 전체 |
| nightly | 전체 integration suite(매트릭스 포함) + 측정치 기록 |
| Gate | 전체 + Gate report에 셀 단위 결과표 첨부 |

CI 출력에는 (전체 셀 수, 일치 수, accuracy, 실패 셀의 case_id 목록)이 표시되어야 하며, 실패 셀이 false-allow인 경우 CI 로그에 `SECURITY: false-allow` 마커를 남겨 escalation 트리거로 사용한다.

---

## 4. 회귀맵과 PACK 단위 회귀 실행 규칙

### 4.1 회귀맵 (원천 15번 §4 승계 + release 보정)

원천의 회귀 위험 연결을 그대로 승계하되, R6/R7/R11/R12 전에는 존재하지 않는 영역을 "예약"으로 표기한다(절대 금지 목록과 일관 — 예약 영역의 회귀 suite를 미리 만들지 않는다).

| 변경 trigger 영역 | 회귀 위험 영역 (원천) | R0~R3에서 실행할 회귀 suite | 예약 (해당 release 도달 시 suite 추가) |
|---|---|---|---|
| **PermissionService** (canX, filter builder, role matrix) | Document access, Search, AI, VDR, Graph query | `permission-matrix` + `cross-tenant` + `document-access`(R2+) + `search-permission`·`metadata-leakage`(R3+) | AI retrieval(R6), VDR(R11), Graph query(R7) |
| **EthicalWall** (schema, membership, enforcement) | Search, document access, permission matrix | `permission-matrix`(wall 차원) + `search-permission`(R3+) | AI retrieval(R6), graph(R7), break-glass(R5) |
| **TenantContext / RLS 정책** | 전 모듈 | `cross-tenant` 전체 + `storage-isolation`(R2+) | — |
| **DocumentVersion** (family, version_no, hash) | Search index, clause extraction, redline, citation | `document-access` + 인덱스 갱신 케이스(`search-permission` 내, R3+) | clause extraction·redline(R8), citation(R6) |
| **AI Policy** (R2는 스키마만) | RAG, summary, model routing, external model approval | 스키마 회귀만: `ai_allowed` 기본값 false·`ai_policies.default_effect='DENY'` 유지 assert, 평가 로직 부재 확인(정적 검사) | R6 전체 |
| **AuditEvent schema / logger** | Document, Email, AI, External, Records reports | `audit-immutability` + `audit-coverage` 전체 | Email(R4), AI(R6), External(R11), Records(R12) |
| **Retention/LegalHold 인터페이스** | Delete, archive, external share, migration | `legal-hold` + lifecycle 케이스(`document-access` 내) | disposal·retention 전체(R12), external share(R11) |
| **Search indexing / query builder** | 권한 누설, tenant 누설, 상태 필터 | `search-permission` + `metadata-leakage` + `cross-tenant`(인덱스 케이스) | OpenSearch 전환 시 전체 재실행(R3 Gate 판단, ADR-006) |
| **Auth/Session** | 전 endpoint 접근 통제 | `cross-tenant` + `fail-closed` | SSO(R13), MFA TOTP 확장 |
| **DB migration (스키마 변경 일반)** | RLS 누락, audit 제약 소실, FK cascade | `pnpm db:rollback` → `pnpm db:migrate` 재적용 + RLS 부재 검출 SQL + `audit-immutability` | — |

### 4.2 PACK 단위 회귀 실행 규칙

PACK(Brief §9: TUW 3~8개, 브랜치→구현→verification green→PR) 마다 다음을 적용한다.

1. **기본 세트(모든 PACK, 예외 없음)**: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 전부 green.
2. **DB 변경 포함 PACK**: `docker compose -f infra/docker-compose.dev.yml up -d` 환경에서 `pnpm db:migrate` 성공 → `pnpm db:rollback` → `pnpm db:migrate` 재적용 성공 → `pnpm test:integration` green. 신규 테이블이 있으면 RLS 부재 검출 SQL(R0-G2) 0행 확인.
3. **회귀맵 trigger PACK**: PACK에 포함된 TUW의 Files(create·modify)가 §4.1의 trigger 영역에 해당하면, 표의 "R0~R3에서 실행할 회귀 suite"를 **전부** 실행한다. trigger 해당 여부 판단이 모호하면 해당하는 것으로 간주한다(fail-closed의 프로세스 적용).
4. **Risk=C 포함 PACK**: 위 전부 + `pnpm test:integration` **전체** + 사람 리뷰(머지 전). 
5. **red 상태 PR 금지·flaky 격리 금지**: 회귀 suite가 red인 채로 PR을 올릴 수 없다. flaky 테스트의 skip/quarantine 처리 금지 — 원인을 수정하거나, 동일 실패 3회 반복 시 작업 중단 + escalation(Brief §6.4).
6. **기록**: PACK 완료 시 `docs/ledger/execution.md` 1줄 기록에 실행한 회귀 suite 목록을 포함한다. 예: `PACK-R1-03 | done | suites: base, permission-matrix, cross-tenant, audit-coverage | 특이사항 없음`.
7. **Gate 재실행과의 관계**: Gate는 PACK 회귀의 합집합이 아니다. Gate 시점에 §2의 체크리스트를 처음부터 전부 재실행한다(PACK에서 green이었다는 이유로 생략 불가).

---

## 5. Audit 불변성 검증 명세 (Brief §5-5, 절대 금지 "`audit_events`에 UPDATE/DELETE 가능한 경로")

### 5.1 DB 계층 구성 (AUDIT-AUDIEVENCO-AUDILOGG-TUW-004의 구현 계약)

방어는 2중이다 — **권한(REVOKE)** 과 **trigger**. 어느 한쪽만으로는 R0-G3을 통과할 수 없다. 정확한 DDL은 `20_Data_Model_v1_1.md`가 canonical이며, 아래는 검증 대상 구조의 기준형이다.

```sql
-- (1) 권한 계층: 앱 role에는 INSERT/SELECT만
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM amic_app;
GRANT INSERT, SELECT ON audit_events TO amic_app;

-- (2) trigger 계층: owner·superuser 경로도 차단
CREATE OR REPLACE FUNCTION audit_events_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: % blocked', TG_OP;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_events_no_mutation
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_block_mutation();

CREATE TRIGGER trg_audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_block_mutation();
```

추가 스키마 제약: `audit_events`를 참조하는 어떤 FK도 `ON DELETE CASCADE`/`ON UPDATE CASCADE`로 audit row에 영향을 줄 수 없어야 하며, `audit_events` 자신이 갖는 FK는 참조 무결성으로 인해 원본 삭제가 막히지 않도록 참조 ID를 FK 없이 보관한다(상세는 20번 문서).

### 5.2 검증 테스트 명세 — `tests/integration/audit-immutability/`

각 케이스는 (시도 → DB 오류 발생 → row 수·내용 불변)을 assert한다. "오류 발생"은 애플리케이션 예외가 아니라 **PostgreSQL 오류**여야 한다.

| Case ID | 시나리오 | 기대 결과 |
|---|---|---|
| AUD-IMM-01 | 앱 role(`amic_app`)로 `UPDATE audit_events SET event_type='TAMPERED' WHERE id=(SELECT id FROM audit_events LIMIT 1);` | `permission denied for table audit_events` |
| AUD-IMM-02 | 앱 role로 `DELETE FROM audit_events WHERE id=(...);` | `permission denied` |
| AUD-IMM-03 | 앱 role로 `TRUNCATE audit_events;` | `permission denied` |
| AUD-IMM-04 | **테이블 owner**(마이그레이션 role)로 UPDATE 시도 | trigger 예외: `audit_events is append-only: UPDATE blocked` |
| AUD-IMM-05 | owner로 DELETE 시도 | trigger 예외 |
| AUD-IMM-06 | owner로 TRUNCATE 시도 | trigger 예외 |
| AUD-IMM-07 | 정상 INSERT (append 경로) | 성공 — 불변성이 기록 자체를 막지 않음을 확인 |
| AUD-IMM-08 | 모든 시도 전후 `count(*)`와 전 row의 `md5(CAST(t.* AS text))` 집계 비교 | 완전 일치 (시도 케이스에 한함, AUD-IMM-07 제외) |
| AUD-IMM-09 | `pnpm db:rollback` → `pnpm db:migrate` 재적용 후 AUD-IMM-01~06 재실행 | 전부 동일 결과 — 마이그레이션 재적용이 REVOKE/trigger를 소실시키지 않음 |
| AUD-IMM-10 | 스키마 검사: `SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name='audit_events' AND privilege_type IN ('UPDATE','DELETE','TRUNCATE');` | superuser 외 0행 |
| AUD-IMM-11 | trigger 존재 검사: `SELECT tgname FROM pg_trigger WHERE tgrelid='audit_events'::regclass AND NOT tgisinternal;` | 차단 trigger 2종 존재 |
| AUD-IMM-12 | ORM/리포지토리 계층 정적 검사: audit repository에 update/delete/save(기존 entity) 메서드 부재, raw query 내 `UPDATE audit_events`/`DELETE FROM audit_events` 문자열 0건 | 검출 0 |

### 5.3 잔여 위협과 보완 (Gate report에 확인 항목으로 포함)

| 위협 | DB 계층 차단 불가 사유 | 보완 통제 |
|---|---|---|
| `DROP TABLE` / `ALTER TABLE` / `DROP TRIGGER` (owner·superuser) | DDL은 row trigger로 차단 불가 | 마이그레이션 파일 리뷰 필수(audit_events 대상 DDL은 Risk=C 취급 + 사람 리뷰), AUD-IMM-09·11이 매 통합 테스트마다 제약 존재를 재확인 |
| superuser 직접 조작 | DB 관리 권한 자체 | 운영 환경 superuser 접근 통제·접속 감사(인프라 영역, 70번 Risk Register 연계). 앱 런타임 자격증명은 절대 superuser 금지 — compose·배포 설정 검사 |
| 백업/복원을 통한 변조 | DB 외부 경로 | 백업 무결성은 R5 Security & Governance 범위로 예약. R0~R3에서는 dev/staging 한정 |

---

## 6. 테스트 데이터 전략

### 6.1 데모 tenant 2개 (CORE-DATACORE-MIGR-TUW-003 seed loader)

격리 검증은 항상 **실험군 tenant + 대조군 tenant** 쌍을 요구하므로, 시드는 처음부터 2개 tenant를 만든다. 모든 ID는 **고정 UUID**(시드 파일에 하드코딩)로 결정적이어야 한다 — negative test의 "타 tenant 자원 ID 직접 지정"(N-3)이 고정 ID에 의존한다.

| 항목 | tenant-alpha | tenant-beta |
|---|---|---|
| 용도 | 주 시나리오(기능·권한·wall) | 격리 대조군(cross-tenant 공격 주체·피해 대상) |
| slug | `tenant-alpha` | `tenant-beta` |
| 사용자 | role 7종 각 1명 + 비활성 사용자 1명 + wall 시나리오 사용자(§6.3) | role 7종 각 1명 |
| Client/Matter | client 2, matter 4 (`M-ALPHA-001` active / `M-ALPHA-002` closed / `M-ALPHA-WALL-A`·`M-ALPHA-WALL-B` wall 시나리오) | client 1, matter 1 (`M-BETA-001` active) |

규칙:
- 사용자 자격증명은 테스트 전용 고정값(예: `alpha-matter-owner@test.local`). 실제 사용자·실제 도메인 금지.
- 시드는 멱등: 재실행 시 중복 생성 없이 동일 상태 수렴. `pnpm test:integration` global setup에서 자동 실행(§0-6).
- 시드 데이터는 R1~R3에서 테이블이 늘 때마다 같은 파일 체계에서 확장한다(release별 시드 디렉터리: `db/seeds/r0/`, `db/seeds/r1/`...). 시드 변경은 회귀 suite 전체 재실행을 trigger한다(§4.1 DB migration 행 준용).

### 6.2 권한 시나리오 사용자 fixture

§3.2 매트릭스의 membership·유효기간 차원을 위해 tenant-alpha에 다음 경계 주체를 시드한다:

| 사용자 | 상태 |
|---|---|
| `alpha-member-active` | `M-ALPHA-001` member (Matter Member) |
| `alpha-nonmember` | 같은 tenant, 어느 matter에도 비소속 |
| `alpha-ex-member` | `M-ALPHA-002`(closed)의 전 member |
| `alpha-expired-perm` | `M-ALPHA-001`에 `valid_to` 경과 permission 보유 |
| `alpha-limited-reviewer` | `M-ALPHA-001`의 특정 문서 1건만 검토 가능 |

### 6.3 Wall 시나리오 fixture

윤리장벽 검증(R1 schema, R3 enforcement)을 위한 고정 시나리오:

- **Wall `W-ALPHA-001`**: `M-ALPHA-WALL-A`(매수측 자문)와 `M-ALPHA-WALL-B`(매도측 자문)의 이해충돌 상황을 모사.
- membership: `alpha-wall-insider-a`(A의 insider), `alpha-wall-insider-b`(B의 insider), `alpha-wall-excluded`(양측에서 excluded), `alpha-admin-excluded`(**Firm Admin role이면서 excluded** — deny-overrides 검증용, WALL-04).
- 문서(R2+): 각 matter에 본문 고유 마커를 가진 문서 1건 이상 — `WALLMARK-A-<hex>`, `WALLMARK-B-<hex>`. R3 누설 테스트(LEAK/WALL 계열)는 이 마커 검색으로 노출 여부를 판정한다.
- 양방향 검증(N-5)을 위해 A→B, B→A 각각의 (insider, excluded) 조합을 모두 시드한다.

### 6.4 비식별 문서 fixture — `tests/fixtures/documents/`

**실제 고객·사건 데이터의 fixture 사용을 절대 금지한다.** 모든 fixture는 합성 텍스트(한국어 법률 문서 형태의 작문)이며, 각 파일 본문에 충돌 불가능한 고유 마커(`FIXMARK-DOC-<hex>`)를 포함한다 — 로그 누설 검증(R2-G7)·검색 누설 검증(R3-G1)의 판정 기준.

| 분류 | 구성 | 용도 |
|---|---|---|
| 정상 PDF | 3종(텍스트 PDF 2, 스캔 이미지형 1) | 업로드·추출·OCR pending·preview |
| 정상 DOCX | 3종 | 추출·DOCX→PDF 변환 |
| 정상 HWPX | **5종** (DEC-10, DOC-HWPX-EXTRACT-TUW-002의 fixture 수와 일치) | HWPX XML 추출 |
| hash 쌍 | 동일 바이트 2벌 1쌍 + **1바이트 상이 1쌍** | R2-G1 |
| 경계·오류 | 손상 PDF 1, 빈 파일 1, size 한계 초과 1, 금지 확장자(`.exe` 등) 1, MIME 위장(확장자 pdf·내용 다른 형식) 1 | validation·실패 경로·retry |
| 한국어 검색 | 법률용어 fixture 30건(텍스트 스니펫 모음) | SEARCH-KOREAN-EVAL-TUW-001 (PG FTS 한계 측정) |
| DLP 준비(R4 예약) | `tests/fixtures/dlp/` — 형식상 유효하나 **실존 불가능한** 가짜 주민등록번호·계좌번호·이메일 패턴 문서 | R4 진입조건(보정 C-4) 검증. R3까지 업로드 시나리오에 사용 금지 |
| 이메일(R4 예약) | `tests/fixtures/emails/` — EML/MSG 합성본 | R4에서 작성 |

### 6.5 평가셋 v0와의 구분 (DEC-16)

- 평가셋 v0(종결 Matter 비식별화 계약서 20~50건, R3 `DEVOPS-EVALSET-V0-TUW-001~002`)는 **테스트 fixture가 아니다**. 실데이터에서 파생되므로 **repo 커밋 금지**, 별도 보안 저장 위치 + `evaluation_cases` 테이블 적재 스크립트로만 다룬다. 비식별화 규칙·수집 절차는 해당 TUW 산출 문서가 정의한다.
- 원천 15번 §5의 대규모 평가셋 수치(정의어 추출 500건, 조항분류 1,000건 등)는 **R6+ AI 평가용 목표로 승계**하되, DEC-16에 따라 v0는 20~50건으로 시작하고 R6 Gate 서브셋은 ~1,000건으로 확장한다. R0~R3에서 이 평가셋으로 AI 기능을 구동하는 것은 절대 금지(데이터 준비만 해당).

### 6.6 Fixture 관리 규칙

1. **Manifest**: `tests/fixtures/manifest.json`에 전 파일의 SHA-256·용도·마커를 등재한다. 통합 테스트 setup이 manifest 대비 hash를 검증하고, 불일치 시 즉시 실패한다(누군가 fixture를 변조하면 회귀 결과가 무의미해지므로).
2. **변경 절차**: fixture 추가·변경은 manifest 갱신 + PR 리뷰를 요구한다. hash 쌍 fixture는 R2-G1의 기대값과 결합되어 있으므로 변경 시 해당 테스트 기대값을 함께 갱신한다.
3. **PII 스캔 CI**: 커밋된 fixture 전체에 대해 실 PII 패턴(주민등록번호 형식 등) 검출 스크립트를 CI에서 실행한다. `tests/fixtures/dlp/`의 화이트리스트(가짜 패턴 명시 등재) 외 검출 1건이라도 있으면 CI red — 실데이터 유입 사고 방지.
4. **마커 유일성**: 마커는 `FIXMARK-`/`WALLMARK-` prefix + 무작위 hex로 생성하고 manifest에 등재한다. 마커가 코드·로그 포맷 문자열에 등장해서는 안 된다(검출 기법의 자기 오염 방지).

---

## 7. 원천 15번 대비 승계·보정 요약 (Traceability)

| 원천 15번 | 본 문서 처리 |
|---|---|
| §1 Verification Contract 13개 영역 | §1.2에서 5개 영역(기능/권한/감사/회귀/성능)으로 통합·재정의. AND 의미론(보정 C-8) 적용. AI/External 영역은 해당 release 전 예약 |
| §2 대표 Verification Case | 검증 가능한 시나리오 ID 체계(XT/FC/PM/AUD-IMM/HASH/IMM/DOC-NEG/HOLD/STOR/LOG/LEAK/WALL/SRCH-EX/SLA/SAUD)로 구체화하여 §2의 Gate 체크리스트에 배치. 외부공유·AI·조항추출 케이스는 R6/R8/R11 예약 |
| §3 Critical Requirements | Permission Accuracy 100% → §3에서 분자/분모·CI 연결로 측정 가능하게 정의. fail-closed → §1.3 N-4·§2 각 Gate. "AI context 누설 금지" → R3에서는 검색 누설(§2.4)로 선행 집행, AI 적용은 R6. 외부공유 링크 검증 → R11 예약. legal hold 차단 → §2.3 R2-G4(soft delete 차단 — hard delete는 경로 자체 금지). AI 근거 추적 → R6 예약 |
| §4 Regression Map | §4.1에서 전 행 승계 + trigger 영역 3종(EthicalWall, TenantContext/RLS, Search indexing) 신설 + 미도래 release 영역 "예약" 표기 + §4.2 PACK 실행 규칙 신설 |
| §5 Evaluation Dataset | §6.5 — DEC-16에 따라 v0는 20~50건으로 보정, 원천 수치는 R6+ 목표로 승계 |
| (원천에 없음) | §2 Gate 체크리스트 전문(검증 명령·SQL·증빙), §5 audit 불변성 DDL·테스트 명세, §6 테스트 데이터 전략은 본 패키지 신설 |

---

*끝. 이 문서의 Gate 체크리스트는 Brief §7의 Gate 정의를 1:1 확장한 것이며, Brief와 불일치가 발견되면 Brief를 따르고 본 문서를 개정한다.*
