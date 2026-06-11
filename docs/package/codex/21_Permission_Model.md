# 21. Permission Model — 권한 평가 계약

버전: 1.0 | 작성일: 2026-06-11 | 상태: Normative. **R1 종료 시 본 문서 §2·§3·§5·§6은 Freeze 대상**(DEVOPS-FREEZE-PERMMODEL-TUW-001, 보정 C-1)이며 Freeze 후 변경은 Decision Ledger 등재 + 사람 승인 없이는 금지다.

관련 문서: 00_Master_Brief.md(§2 불변 원칙·DEC-15), 20_Data_Model_v1_1.md(permissions·ethical_walls·matter_members 스키마), 원천 08번(role 7종 원형)·09번(표준 error code).

## 1. 전제와 적용 범위

1. **단일 진입점**: 모든 권한 판단은 `apps/api/src/modules/permission`의 PermissionService를 통해서만 수행한다. 이를 우회하는 document/search endpoint는 00번 §2 절대 금지 위반이다.
2. 시행 지점(PEP): (a) HTTP guard(인증·tenant·admin route), (b) 서비스 계층(개별 자원 액션), (c) **검색 쿼리 빌더(§5 — 필터 주입)**, (d) 파일 다운로드/미리보기 경로. R4+에서 email·AI retrieval이 같은 계약을 승계한다.
3. 평가 결과는 `{ decision: 'ALLOW' | 'DENY', reasonCode, appliedRules[] }`. DENY의 reasonCode는 09번 표준 error code(`AUTH_REQUIRED`, `PERMISSION_DENIED`, `ETHICAL_WALL_BLOCKED`, `TENANT_ISOLATION_VIOLATION`, `DOCUMENT_LOCKED`)에 매핑된다.
4. 모든 DENY는 `ACCESS_DENIED` audit event를 남긴다(AUDIT-PERMAUDI-PERMEVEN-TUW-002). audit metadata는 참조 ID 수준만(원칙 7). 사용자에게는 자원 존재를 노출하지 않는 안전한 메시지를 반환한다(SEC-DOCUPERM-ACCECONT-TUW-006: 404/403 구분으로 존재 여부가 새지 않도록 비멤버에게는 동일 응답).

## 2. 평가 순서 (Normative — 8단계)

```
요청 (userId, sessionId, tenantContext, resource, action)
  │
  ▼
[1] Tenant context 검증 ──불일치/부재──▶ DENY: TENANT_ISOLATION_VIOLATION / AUTH_REQUIRED
  │ 통과: app.current_tenant_id 설정(RLS), 이후 모든 조회는 tenant 범위
  ▼
[2] Session 검증 ──만료/철회/MFA 미충족──▶ DENY: AUTH_REQUIRED
  │ sessions: revoked_at IS NULL AND expires_at > now()
  ▼
[3] Role 기본 권한 (§3 매트릭스) ──role이 해당 액션 자체를 보유하지 않음──▶ DENY: PERMISSION_DENIED
  │ external_user는 R11 전 전 액션 무조건 DENY (로그인 단계에서 이미 차단)
  ▼
[4] Ethical Wall 평가 (§6) ──excluded 또는 insider-모드 비insider──▶ DENY: ETHICAL_WALL_BLOCKED
  │ wall DENY는 다른 어떤 ALLOW로도 번복 불가 (최우선 deny-override)
  ▼
[5] Matter membership ──대상 matter의 matter_members 행 없음──▶ DENY: PERMISSION_DENIED
  │ membership은 모든 matter 자원 ALLOW의 "필요조건" (충분조건 아님)
  │ 예외: §3에 'T'로 표기된 tenant 수준 관리 액션(membership 불요)
  ▼
[6] Document confidentiality ──문서 등급이 high/restricted──▶ 잠정 DENY (7단계로)
  │ standard는 통과. high/restricted는 7단계의 명시 ALLOW로만 구제
  │ (confidentiality policy — R2 SEC-DOCUPERM-ACCECONT-TUW-003.
  │  matter_members.access_level(read|edit)은 쓰기 권한(canEditMatter의 입력,
  │  20번 §4.4)이며 본 단계의 입력이 아니다)
  ▼
[7] 명시 permissions 평가 (deny-overrides)
  │ 후보 행: tenant 일치 + 자원 일치 + action 일치 + valid_from/to 창 내 +
  │          subject가 본인(user) / 소속 group / 보유 role 인 행
  │ 우선순위: 명시 DENY > 명시 ALLOW (priority 숫자 낮은 행 우선, 동순위는 DENY 우선)
  │ condition_json 미해석/오류 → 그 행이 ALLOW면 행 무시, DENY면 DENY 적용 (fail-closed)
  │ 6단계 잠정 DENY는 여기의 명시 ALLOW로만 구제 가능 (단 4·5단계 통과 전제)
  ▼
[8] 기본 거부 — 위에서 명시적 ALLOW 결론이 없으면 DENY: PERMISSION_DENIED
```

판정 규칙 요약(우선순위 사다리): **wall DENY > 명시 DENY > 명시 ALLOW > role 기본 ALLOW(매트릭스) > confidentiality 기본 거부 > default deny.** 단계 1~5는 단락 평가(short-circuit)로 즉시 종료하고, 6~7은 결합 평가한다. role 기본 ALLOW(§3 매트릭스의 ✓/M/O/E)는 4·5·6단계를 통과해야 실효된다.

부가 규칙:

- **R-1 (membership 필요조건)**: 명시 `permissions.effect='ALLOW'` 행이 있어도 matter 멤버가 아니면 ALLOW는 발효되지 않는다(5단계 선행). 멤버십 없는 접근 허용이 필요하면 멤버 추가가 유일한 경로다.
- **R-2 (상태 가드와의 결합)**: 권한 평가 ALLOW 후에도 도메인 상태 가드(20번 §7 — closed matter mutation 차단, archived 문서, legal_hold 등)가 별도로 적용된다. 순서: 권한 평가 → 상태 가드. legal_hold 차단은 `DOCUMENT_LOCKED`로 구분 응답.
- **R-3 (download 사유)**: `download` 액션은 ALLOW여도 reason 입력이 필수이며(SEC-DOCUPERM-ACCECONT-TUW-004) `DOCUMENT_DOWNLOADED` audit에 reason 참조를 기록한다.
- **R-4 (share_external)**: R11 전에는 평가기 차원에서 무조건 DENY(원칙 6). 매트릭스 값과 무관.
- **R-5 (캐시 금지)**: 평가 결과의 영속 캐시 금지. 단일 요청 scope 내 메모이제이션만 허용(권한 변경의 즉시 반영 보장).

## 3. Role 7종 × 리소스 × 액션 권한 매트릭스 (DEC-15 — Freeze 대상)

표기: **✓** = role 기본 허용(이후 단계 통과 전제) / **T** = tenant 수준 액션, matter membership 불요 / **M** = 해당 matter의 멤버(`matter_members` 행)일 때만 / **O** = 해당 matter의 `matter_role='owner'`일 때만 / **E** = 해당 matter의 멤버이면서 `matter_role='owner'` 또는 `matter_members.access_level='edit'`일 때만(canEditMatter — 41번 SEC-MATTPERM-ACCECONT-TUW-002, 20번 §4.4. limited_reviewer는 항상 거부) / **✗** = 거부(명시 permissions로도 R1~R3 범위에서 구제 불가) / **–** = R11 전 비활성(무조건 거부).

Role 약칭: FA=Firm Admin, SA=Security Admin, MO=Matter Owner, MM=Matter Member, LR=Limited Reviewer, KM=Knowledge Manager, EX=External User.

| 리소스.액션 | FA | SA | MO | MM | LR | KM | EX |
|---|---|---|---|---|---|---|---|
| tenant.settings_read | T | T | ✗ | ✗ | ✗ | ✗ | – |
| tenant.settings_update | T | ✗ | ✗ | ✗ | ✗ | ✗ | – |
| user.create_invite | T | ✗ | ✗ | ✗ | ✗ | ✗ | – |
| user.role_assign | T | T | ✗ | ✗ | ✗ | ✗ | – |
| group.manage | T | T | ✗ | ✗ | ✗ | ✗ | – |
| client.create / update | T | ✗ | ✓ | ✗ | ✗ | ✗ | – |
| client.read | T | T | ✓ | ✓ | ✗ | ✓ | – |
| matter.create | T | ✗ | ✓ | ✗ | ✗ | ✗ | – |
| matter.read (메타데이터) | M | M | M | M | M | M | – |
| matter.update / status_change | ✗ | ✗ | E | E | ✗ | ✗ | – |
| matter.close / archive | ✗ | ✗ | O | ✗ | ✗ | ✗ | – |
| matter.reopen (closed→active) | T | ✗ | ✗ | ✗ | ✗ | ✗ | – |
| matter.member_add / remove | ✗ | ✗ | O | ✗ | ✗ | ✗ | – |
| party.manage | ✗ | ✗ | O | M | ✗ | ✗ | – |
| permission.grant / revoke (matter·document 범위) | ✗ | T | O | ✗ | ✗ | ✗ | – |
| wall.create / manage / release | ✗ | T | ✗ | ✗ | ✗ | ✗ | – |
| document.upload / new_version | ✗ | ✗ | M | M | ✗ | ✗ | – |
| document.read (본문·미리보기) | M | M | M | M | M¹ | M | – |
| document.metadata_edit | ✗ | ✗ | E | E | ✗ | ✗ | – |
| document.download | ✗ | ✗ | M² | M² | M¹² | ✗ | – |
| document.soft_delete | ✗ | ✗ | O | ✗ | ✗ | ✗ | – |
| document.restore | ✗ | ✗ | O | ✗ | ✗ | ✗ | – |
| document.status_change | ✗ | ✗ | M | M | ✗ | ✗ | – |
| search.execute (결과는 §5 필터 적용) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| audit.read (tenant 전체) | T | T | ✗ | ✗ | ✗ | ✗ | – |
| audit.read (자기 matter 범위) | T | T | O | ✗ | ✗ | ✗ | – |
| ai_policy.manage (R6 활성, R2는 스키마만 — endpoint·can* 부재) | ✗ | T | ✗ | ✗ | ✗ | ✗ | – |
| document.ai_allowed_set / matter.ai_policy_assign (R6 활성, R2는 스키마만 — 단 document.ai_allowed 값 설정은 R2에서 metadata editor(document.metadata_edit) 경유로만) | ✗ | T | O | ✗ | ✗ | ✗ | – |
| legal_hold.flag_set / unset (R2 인터페이스) | T | T | ✗ | ✗ | ✗ | ✗ | – |
| evaluation_cases.manage (R3) | ✗ | ✗ | ✗ | ✗ | ✗ | T | – |
| share_external (전 자원) | – | – | – | – | – | – | – |

각주:
- **¹ LR(Limited Reviewer)**: M이더라도 명시 `permissions` ALLOW(resource_type='document')가 부여된 문서 집합으로 한정된다. 즉 LR의 document.read는 "membership AND 명시 ALLOW"가 모두 필요하다(7단계에서 role 기본 ALLOW가 없으므로 명시 ALLOW 없이는 8단계 default deny).
- **² download**: reason 필수(R-3).
- **FA/SA의 M 표기**: 관리자라도 matter 메타데이터·문서 본문 접근은 멤버십이 필요하다. 관리자 특권은 tenant 수준 관리(T)와 audit 조회에 한정 — wall·기밀의 관리자 우회를 차단하기 위함(원천 08번 §5의 취지). FA/SA가 내용 접근이 필요하면 정식으로 멤버 추가(audit 동반)한다.
- **KM(Knowledge Manager)**: R3까지는 evaluation_cases 관리와 멤버 자격 범위의 읽기만 가지며, 조항은행·플레이북 권한은 R8에서 확장한다.
- **EX(External User)**: R11 전에는 세션 발급 자체가 차단된다(2단계 이전). 열 전체가 `–`인 것은 매트릭스가 R11에서 별도 정의됨을 뜻한다.
- 매트릭스에 없는 (리소스, 액션) 조합은 **전 role 거부**가 기본값이다. 새 액션 추가는 본 표 개정(Freeze 절차)을 선행해야 한다.

기계가독 사본: 본 표는 `tests/fixtures/permission-matrix.json`으로 1:1 변환되어 하네스(§7)와 구현(SEC-RBAC-ROLEMATR-TUW-002)의 공통 단일 원천이 된다. 표와 JSON의 불일치는 CI 실패다.

## 4. Fail-closed 규칙 (00번 §2 원칙 4, CORE-SECFOUND-FAILCLOSE-TUW-*)

**모든 판단 불가 상황 = 거부.** 허용 방향의 폴백은 어떤 경우에도 금지한다.

| # | 상황 | 판정 | reasonCode | 부수효과 |
|---|---|---|---|---|
| F-1 | 평가 중 예외(코드 버그, DB 오류, FK 불일치) | DENY | PERMISSION_DENIED | error log(스택) + ACCESS_DENIED audit(result='error') |
| F-2 | `condition_json` 스키마 불일치·미해석·미지원 연산자 | 해당 행이 ALLOW면 행 무시, DENY면 DENY 확정 | PERMISSION_DENIED | 동일 + 해석 실패 행 ID 기록 |
| F-3 | 평가 타임아웃 — 단일 액션 평가 상한 **2초**(설정값 `PERMISSION_EVAL_TIMEOUT_MS`, 기본 2000) | DENY | PERMISSION_DENIED | 타임아웃 메트릭 증가(CORE-OBSE) |
| F-4 | tenant context 부재/불일치 | DENY | TENANT_ISOLATION_VIOLATION | 보안 이벤트 로그 (잠재 침해 시그널) |
| F-5 | 세션 조회 실패(스토어 장애 포함) | DENY | AUTH_REQUIRED | |
| F-6 | role 값이 DEC-15 7종 외 / 매트릭스에 없는 액션 | DENY | PERMISSION_DENIED | |
| F-7 | wall 평가에 필요한 membership 조회 실패 | DENY | ETHICAL_WALL_BLOCKED | wall 판단 불가 = 차단 |
| F-8 | 검색 필터 빌더 오류(§5) | 검색 요청 전체 DENY (빈 결과로 위장 금지) | PERMISSION_DENIED | |
| F-9 | 권한 스냅샷·정책 행 간 충돌로 해석 불능 | DENY | PERMISSION_DENIED | escalation 후보로 ledger 기록 |

검증(FAILCLOSE-TUW-002): 강제 오류 주입 테스트 — evaluator 내부에 의도적 예외/타임아웃/미해석 condition을 주입해 위 표의 판정·audit·로그가 전부 발생함을 통합 테스트로 증명한다. 이 테스트는 R0 Gate부터 회귀 suite에 상주한다.

## 5. 검색 쿼리 필터 주입 명세 (원칙 1: Permission-before-search — Freeze 대상)

### 5.1 계약

검색·목록 API는 **결과 산출 전에** 권한 조건을 쿼리에 주입해야 한다. DB가 반환한 행을 코드에서 걸러내는 **사후 필터링은 R3 Gate 불통과 사유**다. snippet·highlight·facet·count·pagination 전부가 필터 적용 후 데이터에서만 계산되어야 한다(metadata leakage 차단 — SEARCH-PERMSEAR-PERMFILT-TUW-005).

### 5.2 쿼리 빌더 인터페이스 (packages/shared 타입 — Freeze 대상 시그니처)

```ts
// apps/api/src/modules/permission/permission-filter.builder.ts
export interface PermissionQueryContext {
  tenantId: string;
  userId: string;
  role: Role;                  // DEC-15 7종
  sessionId: string;
}

export interface PermissionFilter {
  /** WHERE 절에 AND로 결합 가능한 SQL 조각. 파라미터는 placeholder만 사용 */
  sql: string;
  params: Record<string, string | string[]>;
  /** 적용된 규칙 식별자 + 규칙 버전 hash — 검색 audit에 기록 */
  appliedRules: string[];
}

export interface PermissionFilterBuilder {
  /** 5단계: matter 멤버십 필터 (PERMFILT-TUW-001) */
  buildMatterFilter(ctx: PermissionQueryContext): Promise<PermissionFilter>;
  /** 6·7단계: 문서 confidentiality + 명시 permissions 반영 (PERMFILT-TUW-002) */
  buildDocumentFilter(ctx: PermissionQueryContext): Promise<PermissionFilter>;
  /** 4단계: ethical wall 배제 필터 (PERMFILT-TUW-003, WALLENFO-TUW-005) */
  buildWallExclusionFilter(ctx: PermissionQueryContext): Promise<PermissionFilter>;
}
```

규칙:
- 세 필터는 **항상 전부** AND 결합으로 주입된다. SearchService가 일부만 적용하는 경로는 금지(컴파일 타임에 강제: 세 필터를 묶은 `buildSearchScope(ctx)` 단일 메서드만 SearchService에 노출).
- 빌더는 §2 평가 순서와 **동일한 규칙 데이터**(matter_members, ethical_wall_memberships, permissions, matrix JSON)에서 SQL을 생성한다. 단건 평가와 필터의 의미 불일치는 회귀 테스트(PERMFILT-TUW-004)로 검출한다: 무작위 (user, document) 표본에 대해 `evaluate() 결과 == 검색 포함 여부`.
- 빌더 실패 시 F-8(전체 거부). 부분 필터로 진행 금지.

### 5.3 표준 SQL 형상 (R3 PG FTS 기준 — OpenSearch 전환 시에도 동일 의미 보존)

```sql
SELECT d.document_id, d.title, ts_headline(...) AS snippet
FROM documents d
JOIN document_search_index si                       -- 20번 §5.5 (43번 INDE-TUW-001이 권위)
  ON si.tenant_id = d.tenant_id AND si.version_id = d.current_version_id
WHERE d.tenant_id = :tenantId                      -- RLS와 이중 방어
  AND d.deleted_at IS NULL
  AND d.status NOT IN ('deleted')                   -- superseded 버전은 join 단계에서 배제
  -- [matter filter] 멤버십 필요조건
  AND EXISTS (SELECT 1 FROM matter_members mm
              WHERE mm.matter_id = d.matter_id AND mm.user_id = :userId)
  -- [document filter] confidentiality 게이트(§2 6단계: high/restricted는 명시 ALLOW 필요)
  --                   + (LR이면 명시 ALLOW 교집합 — §3 각주 ¹)
  AND (d.confidentiality_level = 'standard'
       OR EXISTS (SELECT 1 FROM permissions p
                  WHERE p.effect='ALLOW' AND p.resource_type='document'
                    AND p.resource_id = d.document_id AND p.action='read'
                    AND (p.valid_from IS NULL OR p.valid_from <= now())
                    AND (p.valid_to   IS NULL OR p.valid_to   >  now())
                    AND subject_matches(p, :userId)))
  -- [document filter] 명시 DENY 제외 (deny-overrides)
  AND NOT EXISTS (SELECT 1 FROM permissions p
                  WHERE p.effect='DENY' AND p.resource_type='document'
                    AND p.resource_id = d.document_id AND p.action='read'
                    AND (p.valid_from IS NULL OR p.valid_from <= now())
                    AND (p.valid_to   IS NULL OR p.valid_to   >  now())
                    AND subject_matches(p, :userId))
  -- [wall filter] §6 의미론
  AND NOT EXISTS (배제 wall 매칭)
  AND (인사이더 모드 wall 부재 OR 사용자가 insider)
  AND si.content_tsv @@ plainto_tsquery('simple', :q);
```

(`subject_matches`는 SQL 함수 또는 빌더가 전개하는 인라인 조각으로 구현 — 확정 형상은 Permission Model Freeze 산출물 `docs/adr/ADR-013-permission-model-freeze.md`(41번 DEVOPS-FREEZE-PERMMODEL-TUW-001)에 기록하며, 의미는 본 절이 기준. 규칙: user 직접 매칭 + `group_members` 전개 + 보유 role 매칭, 그룹 중첩 없음 — §2 7단계와 동일.)

### 5.4 인덱스 반영 SLA

권한 변경(멤버 제거, wall 적용, confidentiality 상향, 문서 삭제)은 다음 검색부터 **즉시** 반영되어야 한다 — 본 설계는 검색 시점 join이므로 자연 충족. R3 Gate에서 "권한 변경 → 인덱스/검색 반영 SLA"를 측정·기록한다(비정규화 캐시를 도입하는 순간 이 SLA가 계약이 된다. R6 embeddings의 stale 처리도 동일 계약 — 20번 §8.4).

## 6. Ethical Wall 평가 의미론 (insider/excluded — Freeze 대상)

데이터: `ethical_walls`(matter 단위, status='active'만 유효) + `ethical_wall_memberships`(subject_type user|group, membership_type insider|excluded). 20번 §4.7~4.8.

### 6.1 해석 규칙

| # | 규칙 |
|---|---|
| W-1 | 사용자의 wall 소속 집합 = 본인 user 행 ∪ 소속 group의 행(group_members 전개, 중첩 그룹 없음) |
| W-2 | **excluded 우선**: 사용자가 동일 wall에서 insider와 excluded로 동시에 해석되면 excluded로 판정 (deny-overrides) |
| W-3 | **exclusion 의미론**: 사용자가 excluded이면 해당 wall의 matter에 속한 모든 자원·모든 액션 DENY (`ETHICAL_WALL_BLOCKED`) |
| W-4 | **inclusion(insider) 의미론**: wall에 insider 행이 1건 이상 존재하면 그 wall은 insider 모드 — insider 집합에 들지 않은 **모든** 사용자가 W-3과 동일하게 DENY. (insider 행이 0건이면 순수 exclusion wall) |
| W-5 | 하나의 matter에 active wall이 복수면 **모든 wall을 각각 통과**해야 한다 (하나라도 DENY면 DENY) |
| W-6 | `status='released'` wall은 평가에서 제외. 해제는 Security Admin 전용 + audit |
| W-7 | wall DENY는 명시 permissions ALLOW·role·membership 어떤 것으로도 번복 불가. **break-glass는 R5 전 코드 경로 자체가 없다**(20번 §8.2) |
| W-8 | wall 차단은 검색에서 title·snippet·metadata·count까지 포함해 완전 비노출 (§5와 결합, R3 Gate "wall 양측 상호 격리") |
| W-9 | wall 평가 불능(조회 실패 등) = DENY (F-7) |

### 6.2 정규형 (pseudo-code)

```
function wallDecision(user, matter):
  walls = activeWallsOf(matter)            // W-6
  for wall in walls:                       // W-5
    subj = membershipsOf(wall, user)       // W-1: user + groups
    if 'excluded' in subj: return DENY     // W-2, W-3
    if wallHasAnyInsider(wall) and 'insider' not in subj:
        return DENY                        // W-4
  return PASS                              // wall 없음 또는 전부 통과
```

## 7. 권한 매트릭스 테스트 하네스 명세 (SEC-PERMHARN-MATRIX-TUW-001의 입력)

위치: `tests/integration/permission-matrix/`. 하네스는 R1 Gate의 핵심 산출물이며 이후 모든 release의 회귀 suite에 상주한다(CI gate 연결은 TUW-002). 실행: `pnpm test:integration`.

### 7.1 입력 차원

| 차원 | 값 |
|---|---|
| role | DEC-15 7종 전부 (external_user 포함 — 전부 거부 검증용) |
| (리소스, 액션) | §3 매트릭스의 전 행 |
| membership | 비멤버 / member / owner / limited_reviewer(member이면서 role=LR) |
| access_level | read / edit (20번 §4.4 — E 셀 판정 입력) |
| wall 상태 | wall 없음 / excluded / insider-모드인데 비insider / insider / released wall |
| 문서 confidentiality | standard / high / restricted |
| 명시 permissions | 없음 / ALLOW / DENY / ALLOW+DENY 동시(priority 상이) / 기간 만료(valid_to 과거) / condition_json 미해석 |
| tenant | 동일 tenant / cross-tenant |
| 상태 가드 | 정상 / matter closed / document archived / legal_hold=true (R2부터) |

### 7.2 시나리오 생성 규칙 (조합 폭발 통제)

1. **핵심 격자(전수)**: role(7) × §3 매트릭스 행 × membership(4) × wall(5) — 표의 모든 셀이 최소 1회는 양/음 양방향으로 실행되도록 전수 생성한다.
2. **세부 차원(pairwise)**: confidentiality × access_level × 명시 permissions × 상태 가드는 핵심 격자 위에 pairwise(2-way) 조합으로 축약 — 단 다음은 **전수 강제**: (a) 명시 DENY가 모든 ALLOW 경로를 이기는 케이스, (b) 명시 ALLOW가 membership 없이는 무효인 케이스(R-1), (c) confidentiality 잠정 거부를 명시 ALLOW가 구제하는 케이스, (d) 만료 permissions 무효 케이스.
3. **cross-tenant(전수)**: 모든 role × 모든 액션에 대해 타 tenant 자원 접근 → 전건 DENY(`TENANT_ISOLATION_VIOLATION` 또는 0행). 예외 0건.
4. **fail-closed 주입(액션당 1건 이상)**: condition_json 미해석(F-2), evaluator 예외(F-1), 타임아웃(F-3), 필터 빌더 오류(F-8 — 검색 액션에 한함).
5. **검색 동치성 표본**: 무작위 200 표본의 (user, document)에 대해 단건 `evaluate('read')` 결과와 검색 결과 포함 여부의 일치 검증(§5.2).
6. 시나리오 ID는 결정적(`{role}-{resource_action}-{membership}-{wall}-{seq}`)으로 생성해 실패 재현이 가능해야 한다.

### 7.3 expected 산출 방식 (구현과 독립적인 기준 구축)

expected는 구현 코드를 호출해 만들지 않는다. **본 문서 §2~§6을 그대로 옮긴 참조 평가기(reference evaluator)** 를 하네스 내부에 별도 구현(순수 함수, `tests/integration/permission-matrix/reference-evaluator.ts`)하고, 입력은 다음 기계가독 fixture만 사용한다:

- `tests/fixtures/permission-matrix.json` — §3 표의 1:1 변환본
- 시나리오가 선언한 membership/wall/permissions/상태 fixture

참조 평가기 알고리즘(§2의 직역):

```
expected(scenario):
  if scenario.crossTenant            → DENY(TENANT_ISOLATION_VIOLATION)
  if session invalid                 → DENY(AUTH_REQUIRED)
  if role == external_user           → DENY(AUTH_REQUIRED)          # R11 전
  if matrix[role][resource.action] == '✗' or 미정의 → DENY(PERMISSION_DENIED)
  if wallDecision(...) == DENY       → DENY(ETHICAL_WALL_BLOCKED)   # §6.2
  if needsMembership and not member  → DENY(PERMISSION_DENIED)
  if matrix cell in ('O') and not owner → DENY(PERMISSION_DENIED)
  if matrix cell in ('E') and not (owner or access_level == 'edit') → DENY(PERMISSION_DENIED)
  base = (confidentiality == 'standard') ? matrixAllow : provisionalDeny   # §2 6단계
  explicit = resolvePermissions(rows)      # §2 7단계: 유효창/priority/deny-overrides/F-2
  if explicit == DENY                → DENY(PERMISSION_DENIED)
  if base == provisionalDeny and explicit != ALLOW → DENY(PERMISSION_DENIED)
  if 상태 가드 위반(hold/closed/archived) → DENY(DOCUMENT_LOCKED | PERMISSION_DENIED)
  → ALLOW
```

expected 형식: `{ decision, reasonCode, auditExpected: boolean }`. **모든 DENY 시나리오는 `ACCESS_DENIED` audit 발생까지 assert**(C-8 AND 의미론: 권한검증 AND 감사검증). 모든 ALLOW 시나리오는 해당 도메인 audit(있는 경우)을 assert.

### 7.4 fixture·실행·합격 기준

- seed: 데모 tenant 2개(R0 seed 재사용), tenant당 role별 사용자 각 1 + group 2, matter 4종(wall 없음 / exclusion wall / insider wall / closed), 문서 confidentiality 3종 × 상태 대표값. fixture는 `tests/fixtures/`에 결정적 UUID로 고정.
- 실행 형태: 시나리오 테이블 → 실제 API/서비스 호출(HTTP 또는 서비스 계층) → 실측 vs expected 비교. 참조 평가기와 구현이 불일치하면 **구현이 아니라 결과가 틀린 것으로 간주하고 중단·escalation**(어느 쪽 수정인지는 사람이 판정 — Risk=C).
- 합격 기준(R1 Gate): 시나리오 100% 일치, cross-tenant 예외 0건, fail-closed 주입 전건 DENY, audit assert 누락 0건. R2·R3에서 문서·검색 차원이 추가될 때 하네스를 확장하며(상태 가드·§5 동치성), 기존 시나리오의 expected 변경은 Freeze 개정 절차를 요구한다.

## 8. Freeze와 변경 통제 (보정 C-1)

R1 종료 시 다음이 동결된다: §2 평가 순서, §3 매트릭스(+JSON), §5.2 빌더 시그니처와 주입 지점, §6 wall 의미론, `canReadMatter`/`canEditMatter`/`canUploadToMatter`/`canReadDocument`/`canDownloadDocument` 시그니처(SEC-MATTPERM·DOCUPERM 계열). Freeze 문서(`docs/adr/ADR-013-permission-model-freeze.md` — DEVOPS-FREEZE-PERMMODEL-TUW-001)가 Decision Ledger에 등재·승인되기 전 **R2·R3 PACK 착수 금지**. 동결 후 변경은 ledger 항목 + 하네스 expected 갱신 + 사람 리뷰를 모두 요구한다.

