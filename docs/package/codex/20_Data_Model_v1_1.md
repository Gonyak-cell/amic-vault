# 20. Data Model v1.1 — DDL 수준 명세

버전: 1.1 | 작성일: 2026-06-11 | 상태: Normative (00_Master_Brief.md §5를 상세화. 충돌 시 00번이 우선)

## 0. 문서 지위와 범위

1. 원천 `../vault_dev_package/docs/07_Data_Model_and_Schema_Draft.md`의 **33개 테이블을 전부 승계**하되, 00번 §3 보정 C-7(스키마 보강 8종)을 반영한 v1.1이다. 원천 07번과 충돌하면 본 문서가 우선한다.
2. §3~§6은 **R0~R3에서 실제 마이그레이션으로 생성하는 테이블**의 DDL 수준 명세다. §8은 **R4 이후 예약 스키마**로, 설계만 기록하며 **R0~R3에서 테이블 생성 금지**다(생성 시 00번 §2 절대 금지 위반).
3. DDL은 PostgreSQL 16 기준. 마이그레이션 도구(raw SQL vs TypeORM/Prisma)는 PACK-R0-01(`CORE-DATACORE-MIGR-TUW-001`)에서 확정하되, **본 문서의 컬럼명·타입·제약·인덱스·RLS 정책은 도구와 무관하게 동일하게 산출되어야 한다.**
4. 검증 명령(모든 스키마 TUW 공통): `pnpm db:migrate` → `pnpm test:integration` → `pnpm db:rollback` → `pnpm db:migrate` 재실행이 모두 green이어야 한다.

## 1. 공통 규약 (모든 테이블에 적용)

### 1.1 명명·타입

- 테이블명 snake_case 복수형, 컬럼명 snake_case. PK는 `{단수형}_id`.
- PK 타입: `uuid DEFAULT gen_random_uuid()` (PG16 내장). 예외: `audit_events.seq`(순서 보장용 identity).
- 시각은 전부 `timestamptz`. `created_at timestamptz NOT NULL DEFAULT now()`.
- 열거값은 PostgreSQL native ENUM 대신 **`text` + `CHECK` 제약**을 사용한다(마이그레이션 시 값 추가 용이). 도메인 의미는 `packages/shared`의 zod 스키마와 1:1로 일치시킨다.
- JSON 컬럼은 `jsonb NOT NULL DEFAULT '{}'::jsonb` (NULL 허용 시 명시).

### 1.2 tenant_id + RLS 표준 (DEC-02, 00번 §4 명명규약)

모든 row-level 테이블은 다음을 따른다. **예외는 §9 총괄표에 명시된 테이블뿐이며, 예외 테이블의 마이그레이션 파일에는 사유 주석이 필수다.**

```sql
-- (1) 컬럼: 모든 row-level 테이블
tenant_id uuid NOT NULL REFERENCES tenants(tenant_id)

-- (2) 표준 RLS 정책 (마이그레이션 템플릿 — CORE-DATACORE-MIGR-TUW-005)
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
CREATE POLICY {table}_tenant_isolation ON {table}
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

- 애플리케이션은 트랜잭션마다 `SET LOCAL app.current_tenant_id = '<uuid>'`를 실행한다(tenant context middleware, `CORE-TENACORE-TENACONT-TUW-002`).
- `current_setting(..., true)`는 미설정 시 NULL을 반환 → 정책 비교가 false → **0행(fail-closed)**. 오류로 위장한 우회가 아니라 "조용한 거부"가 기본이며, 서비스 계층은 context 부재를 사전에 `TENANT_ISOLATION_VIOLATION`으로 차단한다.
- DB role 분리: `vault_app`(서비스 접속용, **BYPASSRLS 금지, 테이블 owner 금지**), `vault_migrator`(마이그레이션·owner). `FORCE ROW LEVEL SECURITY`로 owner 경유 우회도 차단한다. seed loader는 tenant별로 `app.current_tenant_id`를 설정하고 적재한다.

### 1.3 Cross-tenant FK 차단 (composite FK 규약)

자식 테이블의 FK가 다른 tenant의 부모 행을 가리키는 것을 **DB 계층에서** 차단하기 위해:

- 모든 row-level 부모 테이블에 `UNIQUE (tenant_id, {pk})` 보조 제약을 둔다.
- 자식 테이블의 부모 참조는 단일 FK 대신 **composite FK** `FOREIGN KEY (tenant_id, {parent}_id) REFERENCES {parents}(tenant_id, {parent}_id)`를 사용한다.
- 이하 DDL에서 `-- CFK` 주석이 붙은 FK는 모두 이 규약을 따른다. `ON DELETE CASCADE`는 전면 금지(hard delete 금지 원칙). 기본은 `ON DELETE RESTRICT`(명시 생략 시 NO ACTION).

### 1.4 감사·삭제 규약

- hard delete(`DELETE` 문) 허용 테이블: `sessions`(만료 세션 정리), `group_members`, `matter_members`, `ethical_wall_memberships`, `permissions`(회수) — 단 **삭제 전 반드시 대응 audit event 기록**(00번 §2 원칙 3). 그 외 도메인 테이블은 soft delete(`deleted_at`) 또는 상태 전이만 허용.
- 본문·기밀 원문은 `audit_events`와 로그에 기록 금지(원칙 7). audit metadata는 참조 ID/hash만.

## 2. 원천 33개 테이블 승계 맵

| 원천 07번 테이블 | v1.1 처분 | 생성 release | 비고 |
|---|---|---|---|
| tenants, users, audit_events | 승계+보강 | **R0** | §3 |
| clients, matters, matter_members, parties, permissions, ethical_walls | 승계+보강 | **R1** | §4. permissions에 평가 계약 컬럼 추가 |
| documents, document_versions, file_objects, canonical_documents | 승계+보강 | **R2** | §5. tenant_id 누락 보강 |
| evaluation_cases | 승계+보강 | **R3** | §6. tenant_id 보강 (DEC-16) |
| emails, email_participants, attachments | 예약 | R4 | §8.1 |
| clauses, clause_chunks, defined_terms, rights, obligations, conditions | 예약 | R6~R8 | §8.6. 전부 tenant_id 보강 대상 |
| risks, issues | 예약 | R8~R10 | §8.6 |
| authorities | 예약 | R8 | §8.6. **scope(global\|tenant) 글로벌 예외** |
| ai_sessions, ai_retrieval_logs, feedback_items | 예약 | R6 | §8.6 |
| playbook_rules, drafting_patterns | 예약 | R8 | §8.6. tenant_id 보강 |
| retention_policies, legal_holds | 예약 | R12 | §8.5. R2는 hold **flag 인터페이스만**(C-3) |

**v1.1 신설 (보정 C-7 + 00번 §5)**: `sessions`·`workspaces`·`password_reset_tokens`(R0), `groups`·`group_members`(R1), `ethical_wall_memberships`(R1), `ai_policies`(R2), `document_search_index`(R3 — §5.5, 43번 INDE-TUW-001), 예약: `break_glass_requests`(R5), `external_*` 5종(R11), `chunks`·`embeddings`(R6), `disposal_requests`·`disposal_certificates`(R12).

## 3. R0 테이블 (CORE-DATACORE-MIGR-TUW-002, AUDIT-AUDIEVENCO-AUDILOGG-TUW-001/004)

### 3.1 tenants — RLS 미적용 (글로벌 예외)

```sql
CREATE TABLE tenants (
  tenant_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  slug           text NOT NULL UNIQUE
                 CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),  -- URL·표시용 식별자.
                 -- storage object key에는 사용 금지(§5.4 — key는 tenant_id prefix)
  region         text NOT NULL DEFAULT 'kr',
  data_residency text NOT NULL DEFAULT 'kr-domestic',
  status         text NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','suspended','offboarding')),
  settings_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
-- RLS 예외 사유(마이그레이션 주석 필수): tenant 격리의 기준 테이블 자체이므로
-- tenant_id 컬럼이 없다. vault_app에는 SELECT만 GRANT하고 INSERT/UPDATE는
-- TenantService 전용 admin 경로(vault_admin role 또는 별도 커넥션)로 한정한다.
```

### 3.2 users — RLS 적용

```sql
CREATE TABLE users (
  user_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(tenant_id),
  email          text NOT NULL,
  name           text NOT NULL,
  role           text NOT NULL CHECK (role IN (
                   'firm_admin','security_admin','matter_owner','matter_member',
                   'limited_reviewer','knowledge_manager','external_user')),  -- DEC-15 7종
                 -- 주의: 이 CHECK는 R0 마이그레이션에 포함하지 않는다(R0은 자유 문자열, 40번이 권위).
                 -- R1 마이그레이션(user_role_enum, SEC-RBAC-ROLEMATR-TUW-001)에서 CHECK 추가
  practice_group text NULL,                       -- DEC-15: 속성 1개 (ABAC 일반화는 R5)
  status         text NOT NULL DEFAULT 'invited'
                 CHECK (status IN ('invited','active','locked','deactivated')),
  password_hash  text NOT NULL,                   -- argon2id. 평문·복호화 가능 형태 금지
  mfa_enabled    boolean NOT NULL DEFAULT false,  -- DEC-09. TOTP secret은 R1에서 컬럼 추가
  last_login_at  timestamptz NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)                     -- §1.3 composite FK 보조 제약
);
CREATE UNIQUE INDEX uq_users_tenant_email ON users (tenant_id, lower(email));
CREATE INDEX idx_users_tenant_role ON users (tenant_id, role);
-- 표준 RLS 4종 적용 (§1.2 템플릿)
```

해석 규칙: `users.role`은 **tenant 수준 기본 role**이다. `matter_owner`/`matter_member`/`limited_reviewer`의 실효 권한은 R1의 `matter_members` 행과 결합해야 발생한다(21번 §2 5단계). `external_user`는 **R11 전 로그인 자체가 차단**되는 예약 값이다(21번 §3).

R1에서 추가되는 컬럼(ALTER): `mfa_totp_secret_enc bytea NULL` — DEC-13 컬럼 수준 암호화(encryption hook 경유), 로그 기록 금지.

### 3.3 sessions — RLS 적용 (v1.1 신설, DEC-09 자체 세션)

```sql
CREATE TABLE sessions (
  session_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(tenant_id),
  user_id      uuid NOT NULL,
  token_hash   text NOT NULL UNIQUE,   -- 세션 토큰은 SHA-256 hash만 저장(원문 저장 금지, 원칙 7)
  mfa_verified boolean NOT NULL DEFAULT false,
  ip_address   inet NULL,
  user_agent   text NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz NULL,
  FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, user_id)  -- CFK
);
CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);
-- 표준 RLS 적용. 유효 세션 판정: revoked_at IS NULL AND expires_at > now()
-- (판정은 session middleware 단일 함수로 — 21번 §2 2단계의 유일 구현 지점)
```

### 3.4 audit_events — RLS 적용(INSERT/SELECT만) + **append-only 메커니즘**

```sql
CREATE TABLE audit_events (
  event_id       uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seq            bigint GENERATED ALWAYS AS IDENTITY UNIQUE,  -- 전역 순서 보장
  tenant_id      uuid NOT NULL REFERENCES tenants(tenant_id),
  actor_type     text NOT NULL DEFAULT 'user'
                 CHECK (actor_type IN ('user','system','job')),
  actor_id       uuid NULL,              -- system/job 이벤트는 NULL 허용
  session_id     uuid NULL,
  action         text NOT NULL CHECK (action ~ '^[A-Z][A-Z0-9_]{2,63}$'),
                 -- 액션 카탈로그는 packages/shared/audit-actions.ts 가 단일 원천
  target_type    text NOT NULL,          -- 'matter','document','user','permission','wall',...
  target_id      text NULL,              -- 참조 ID(uuid 문자열) 또는 hash. 본문 금지
  matter_id      uuid NULL,
  result         text NOT NULL DEFAULT 'success'
                 CHECK (result IN ('success','denied','error')),
  metadata_json  jsonb NOT NULL DEFAULT '{}'::jsonb
                 CHECK (NOT (metadata_json ?| array
                   ['body','content','text','snippet','raw','password','token'])),
                 -- 1차 방어. 화이트리스트 키 검증의 본체는 metadata normalizer
                 -- (AUDIT-AUDIEVENCO-AUDILOGG-TUW-003)이며 값은 참조 ID/hash 수준만 허용
  ip_address     inet NULL,
  correlation_id text NULL,              -- CORE-OBSE-LOGGMETR-TUW-002와 연결
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_tenant_created ON audit_events (tenant_id, created_at DESC);
CREATE INDEX idx_audit_tenant_action  ON audit_events (tenant_id, action, created_at DESC);
CREATE INDEX idx_audit_target ON audit_events (tenant_id, target_type, target_id);
CREATE INDEX idx_audit_matter ON audit_events (tenant_id, matter_id)
  WHERE matter_id IS NOT NULL;
```

**append-only 메커니즘 (AUDIT-AUDIEVENCO-AUDILOGG-TUW-004, Risk=C)** — 다음 4중 장치를 전부 적용하며, 어느 하나라도 제거하는 마이그레이션은 00번 §2 절대 금지("audit_events에 UPDATE/DELETE 가능한 경로") 위반이다:

```sql
-- (1) 권한 회수: 어떤 앱 role도 변경 불가
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM vault_app;
GRANT INSERT, SELECT ON audit_events TO vault_app;

-- (2) 트리거 차단: owner·superuser 경유 우회까지 오류로 차단
CREATE FUNCTION audit_events_block_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_APPEND_ONLY_VIOLATION: audit_events is append-only';
END $$;
CREATE TRIGGER trg_audit_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_block_mutation();
CREATE TRIGGER trg_audit_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_block_mutation();

-- (3) RLS: INSERT(WITH CHECK)·SELECT(USING)만 정의. UPDATE/DELETE 정책 자체를 만들지 않음
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_tenant_select ON audit_events FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY audit_tenant_insert ON audit_events FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

(4) 회귀 테스트(tests/integration/audit-immutability): `vault_app`으로 UPDATE/DELETE/TRUNCATE 시도가 **DB 오류로 실패**함을 매 CI에서 증명. retention label 연결(AUDILOGG-005)은 별도 매핑으로 처리하며 audit row 변경을 요구하지 않는다.

## 4. R1 테이블 (Matter Core + Permission)

### 4.1 clients — RLS 적용 (MATTER-CLIEMANA-CLIEREGI-TUW-001)

```sql
CREATE TABLE clients (
  client_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(tenant_id),
  name                  text NOT NULL,
  client_type           text NOT NULL DEFAULT 'corporation' CHECK (client_type IN
                          ('corporation','individual','government','fund','npo','other')),
  confidentiality_level text NOT NULL DEFAULT 'standard'
                        CHECK (confidentiality_level IN ('standard','high','restricted')),
  status                text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','dormant','closed')),
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_id),                                          -- §1.3
  FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, user_id) -- CFK
);
CREATE INDEX idx_clients_tenant_name ON clients (tenant_id, name);
-- 표준 RLS 적용
```

### 4.2 groups / group_members — RLS 적용 (v1.1 신설, 00번 §5-4)

```sql
CREATE TABLE groups (
  group_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(tenant_id),
  name       text NOT NULL,
  group_type text NOT NULL DEFAULT 'team'
             CHECK (group_type IN ('practice_group','team','custom')),
  description text NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, group_id),
  UNIQUE (tenant_id, name),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, user_id)
);

CREATE TABLE group_members (
  group_id  uuid NOT NULL,
  user_id   uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id),
  added_by  uuid NOT NULL,
  added_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id),
  FOREIGN KEY (tenant_id, group_id) REFERENCES groups (tenant_id, group_id), -- CFK
  FOREIGN KEY (tenant_id, user_id)  REFERENCES users  (tenant_id, user_id),  -- CFK
  FOREIGN KEY (tenant_id, added_by) REFERENCES users  (tenant_id, user_id)
);
CREATE INDEX idx_group_members_user ON group_members (tenant_id, user_id);
-- 두 테이블 모두 표준 RLS 적용. 행 추가/삭제 시 audit event 필수(§1.4)
```

용도: `permissions.subject_type='group'`과 `ethical_wall_memberships.subject_type='group'`의 대상. 그룹 중첩(그룹의 그룹)은 v1에서 금지(평가 단순성·fail-closed 보장).

### 4.3 matters — RLS 적용 (MATTER-MATTMANA-MATTREGI-TUW-001)

```sql
CREATE TABLE matters (
  matter_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(tenant_id),
  client_id      uuid NOT NULL,
  matter_code    text NOT NULL,            -- 사건번호 표기. tenant 내 유일
  matter_name    text NOT NULL,
  matter_type    text NOT NULL CHECK (matter_type IN (
                   'advisory','contract','ma','litigation','arbitration',
                   'investigation','compliance','ip','finance','other')),
                 -- 1차 taxonomy (MATTREGI-003). 값 추가는 CHECK 교체 마이그레이션으로
  status         text NOT NULL DEFAULT 'proposed' CHECK (status IN (
                   'proposed','open','active','closing','closed',
                   'archived','disposal_review','disposed')),   -- §7.1의 8상태
  opened_at      timestamptz NULL,
  closed_at      timestamptz NULL,
  lead_lawyer_id uuid NULL,
  practice_group text NULL,
  metadata_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by     uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, matter_id),
  UNIQUE (tenant_id, matter_code),
  FOREIGN KEY (tenant_id, client_id)      REFERENCES clients (tenant_id, client_id), -- CFK
  FOREIGN KEY (tenant_id, lead_lawyer_id) REFERENCES users (tenant_id, user_id),
  FOREIGN KEY (tenant_id, created_by)     REFERENCES users (tenant_id, user_id)
);
CREATE INDEX idx_matters_tenant_client ON matters (tenant_id, client_id);
CREATE INDEX idx_matters_tenant_status ON matters (tenant_id, status);
CREATE INDEX idx_matters_tenant_lead   ON matters (tenant_id, lead_lawyer_id);
-- 표준 RLS 적용
```

R2에서 추가되는 컬럼(ALTER, 별도 마이그레이션):

```sql
ALTER TABLE matters ADD COLUMN ai_policy_id uuid NULL;   -- AI-AIPOLI-SCHEMAONLY-TUW-001
ALTER TABLE matters ADD CONSTRAINT fk_matters_ai_policy
  FOREIGN KEY (tenant_id, ai_policy_id) REFERENCES ai_policies (tenant_id, policy_id);
ALTER TABLE matters ADD COLUMN legal_hold boolean NOT NULL DEFAULT false;
  -- RECORD-HOLDIF-INTERFACE-TUW-001 (보정 C-3). flag + 삭제 precondition check만.
  -- 전체 LegalHold 테이블은 R12 (§8.5)
```

상태 전이 검증은 DB가 아니라 `packages/domain`의 순수 함수(§7)와 서비스 계층에서 수행한다. 단 `closed` 이후 상태에서의 mutation 차단(MATTER-MATTLIFE-STATENGI-TUW-005)은 서비스 계층 가드 + 통합 테스트로 보증한다.

### 4.4 matter_members — RLS 적용 (MATTER-MATTTEAM-MEMBMANA-TUW-001)

```sql
CREATE TABLE matter_members (
  matter_id    uuid NOT NULL,
  user_id      uuid NOT NULL,
  tenant_id    uuid NOT NULL REFERENCES tenants(tenant_id),  -- 원천 누락 보강(C-7)
  matter_role  text NOT NULL DEFAULT 'member'
               CHECK (matter_role IN ('owner','member','limited_reviewer')),
  access_level text NOT NULL DEFAULT 'read'
               CHECK (access_level IN ('read','edit')),
               -- 의미: 이 멤버의 쓰기 권한 수준(41번 MEMBMANA-TUW-001이 권위).
               -- canEditMatter = matter_role='owner' 또는 access_level='edit'
               -- (canReadMatter 통과 전제 — 41번 SEC-MATTPERM-ACCECONT-TUW-002, 21번 §2·§3).
               -- limited_reviewer는 'edit' 부여 금지(읽기 전용 역할 — 서비스 계층 검증).
               -- 문서 기밀등급(confidentiality) 평가의 입력이 아니다(21번 §2 6단계 참조)
  added_by     uuid NOT NULL,
  added_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (matter_id, user_id),
  FOREIGN KEY (tenant_id, matter_id) REFERENCES matters (tenant_id, matter_id), -- CFK
  FOREIGN KEY (tenant_id, user_id)   REFERENCES users (tenant_id, user_id),     -- CFK
  FOREIGN KEY (tenant_id, added_by)  REFERENCES users (tenant_id, user_id)
);
CREATE INDEX idx_matter_members_user ON matter_members (tenant_id, user_id);
-- 표준 RLS 적용. 추가/제거/role 변경은 audit 필수 (MEMBMANA-TUW-006, Risk=H)
```

`matter_members` 행의 존재는 **모든 matter 자원 ALLOW의 필요조건**이다(00번 §5-4, 21번 §2). 제거는 행 DELETE + `MATTER_MEMBER_REMOVED` audit.

### 4.5 parties — RLS 적용 (MATTER-PARTMANA-PARTREGI-TUW-001)

```sql
CREATE TABLE parties (
  party_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(tenant_id),
  matter_id         uuid NOT NULL,
  name              text NOT NULL,
  party_type        text NOT NULL DEFAULT 'corporation'
                    CHECK (party_type IN ('individual','corporation','government','other')),
  party_role        text NOT NULL CHECK (party_role IN (
                      'client','counterparty','co_counsel','opposing_counsel','target',
                      'investor','lender','borrower','guarantor','witness','other')),
  related_client_id uuid NULL,
  is_restricted     boolean NOT NULL DEFAULT false,  -- restricted party marker (PARTREGI-005)
  created_by        uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, party_id),
  FOREIGN KEY (tenant_id, matter_id)         REFERENCES matters (tenant_id, matter_id),
  FOREIGN KEY (tenant_id, related_client_id) REFERENCES clients (tenant_id, client_id),
  FOREIGN KEY (tenant_id, created_by)        REFERENCES users (tenant_id, user_id)
);
CREATE INDEX idx_parties_matter ON parties (tenant_id, matter_id);
-- 표준 RLS 적용
```

### 4.6 permissions — RLS 적용 (평가 계약 컬럼 포함, 00번 §5-4)

```sql
CREATE TABLE permissions (
  permission_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(tenant_id),  -- 원천 누락 보강(C-7)
  subject_type  text NOT NULL CHECK (subject_type IN ('user','group','role')),
  subject_id    text NOT NULL,
                -- subject_type='user'|'group' → uuid 문자열, ='role' → DEC-15 role명.
                -- 서비스 계층에서 존재·tenant 일치 검증 (다형 참조라 DB FK 불가)
  resource_type text NOT NULL CHECK (resource_type IN ('matter','document','client')),
  resource_id   uuid NOT NULL,
  action        text NOT NULL CHECK (action IN (
                  'read','edit','upload','download','delete','restore',
                  'manage_members','manage_permissions','share_external')),
                -- share_external은 R11 전 평가 시 무조건 DENY (21번 §3)
  effect        text NOT NULL CHECK (effect IN ('ALLOW','DENY')),
  condition_json jsonb NULL,    -- 해석 불가 시 해당 행 전체를 DENY로 간주 (fail-closed)
  priority      integer NOT NULL DEFAULT 100,   -- 낮을수록 우선. 동순위는 DENY 우선
  valid_from    timestamptz NULL,               -- NULL = 즉시 유효
  valid_to      timestamptz NULL,               -- NULL = 무기한
  created_by    uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from < valid_to),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, user_id)
);
CREATE INDEX idx_permissions_resource ON permissions (tenant_id, resource_type, resource_id);
CREATE INDEX idx_permissions_subject  ON permissions (tenant_id, subject_type, subject_id);
-- 표준 RLS 적용. 생성·회수는 PERMISSION_CHANGED audit 필수
```

**평가 계약(요약 — 전문은 21번 문서, Freeze 대상)**: default-deny / deny-overrides(wall DENY > 명시 DENY > 명시 ALLOW) / `matter_members`는 ALLOW의 필요조건 / `condition_json` 해석 불가 시 거부 / `valid_from`~`valid_to` 창 밖의 행은 평가에서 제외.

### 4.7 ethical_walls — RLS 적용 (SEC-ETHIWALL-WALLENFO-TUW-001, 보정 C-2로 R1 배치)

```sql
CREATE TABLE ethical_walls (
  wall_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(tenant_id),
  matter_id   uuid NOT NULL,
  wall_name   text NOT NULL,
  reason      text NOT NULL,           -- 사유 필수. 기밀 원문이 아닌 관리 사유만 기재
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','released')),
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  released_by uuid NULL,
  released_at timestamptz NULL,
  CHECK ((status = 'released') = (released_at IS NOT NULL)),
  UNIQUE (tenant_id, wall_id),
  FOREIGN KEY (tenant_id, matter_id)   REFERENCES matters (tenant_id, matter_id),
  FOREIGN KEY (tenant_id, created_by)  REFERENCES users (tenant_id, user_id),
  FOREIGN KEY (tenant_id, released_by) REFERENCES users (tenant_id, user_id)
);
CREATE INDEX idx_walls_matter ON ethical_walls (tenant_id, matter_id)
  WHERE status = 'active';
-- 표준 RLS 적용. 생성·해제는 ETHICAL_WALL_APPLIED / ETHICAL_WALL_RELEASED audit 필수
```

### 4.8 ethical_wall_memberships — RLS 적용 (v1.1 신설, 00번 §5-2, SEC-ETHIWALL-WALLENFO-TUW-002)

```sql
CREATE TABLE ethical_wall_memberships (
  wall_id         uuid NOT NULL,
  tenant_id       uuid NOT NULL REFERENCES tenants(tenant_id),
  subject_type    text NOT NULL CHECK (subject_type IN ('user','group')),
  subject_id      uuid NOT NULL,   -- user_id 또는 group_id. 서비스 계층에서 존재 검증
  membership_type text NOT NULL CHECK (membership_type IN ('insider','excluded')),
  added_by        uuid NOT NULL,
  added_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wall_id, subject_type, subject_id),
  FOREIGN KEY (tenant_id, wall_id)  REFERENCES ethical_walls (tenant_id, wall_id), -- CFK
  FOREIGN KEY (tenant_id, added_by) REFERENCES users (tenant_id, user_id)
);
CREATE INDEX idx_wall_memberships_subject
  ON ethical_wall_memberships (tenant_id, subject_type, subject_id);
-- 표준 RLS 적용. 변경은 audit 필수
```

의미론(insider/excluded — 전문은 21번 §6): `excluded`는 wall 대상 matter 자원 전면 차단. wall에 `insider` 행이 1건 이상 존재하면 **inclusion 모드**가 되어 insider 외 전원 차단. 동일 사용자가 양쪽에 모두 해석되면 `excluded` 우선(deny-overrides).

## 5. R2 테이블 (Document Vault Core)

### 5.1 ai_policies — RLS 적용 (**R2 스키마만**, AI-AIPOLI-SCHEMAONLY-TUW-001)

```sql
CREATE TABLE ai_policies (
  policy_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(tenant_id),
  name                   text NOT NULL,
  allowed_model_tiers    text[] NOT NULL DEFAULT '{}',
                         -- R2: 빈 배열 고정. R6에서 'local_gemma' 등 값 정의 (DEC-11)
  external_model_allowed boolean NOT NULL DEFAULT false,
  default_effect         text NOT NULL DEFAULT 'DENY' CHECK (default_effect = 'DENY'),
                         -- R6 전에는 'DENY'만 유효. 완화는 R6 Gate 통과 후 별도 마이그레이션
  created_by             uuid NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, policy_id),
  UNIQUE (tenant_id, name),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, user_id)
);
-- 표준 RLS 적용
```

**경계(절대 금지 연동)**: 이 테이블과 `matters.ai_policy_id`, `documents.ai_allowed`는 R2에서 **스키마 컬럼만** 존재한다. 평가 로직·AI 기능 연결은 R6 전 구현 금지(00번 §2). 기본값은 전부 거부 방향(`false`/`'DENY'`/`'{}'`).

### 5.2 documents — RLS 적용 (DOC-DOCUMETA-METAEXTR-TUW-001 외)

```sql
CREATE TABLE documents (
  document_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(tenant_id),
  matter_id             uuid NOT NULL,
  document_family_id    uuid NOT NULL,
                        -- 규칙(DOC-DOCUVERS-VERSRESO-TUW-002): 최초 업로드 시 document_id와
                        -- 동일하게 설정. 파생·연관 문서 연결 시 동일 family_id 공유
  title                 text NOT NULL,
  document_type         text NOT NULL DEFAULT 'other' CHECK (document_type IN (
                          'contract','memo','opinion','court_filing','evidence',
                          'correspondence','corporate_record','financial','other')),
  subtype               text NULL,
  status                text NOT NULL DEFAULT 'draft' CHECK (status IN (
                          'draft','internal_review','client_sent','counterparty_sent',
                          'markup_received','negotiation','final','executed',
                          'archived','disposal_locked','deleted')),   -- §7.2의 11상태
  confidentiality_level text NOT NULL DEFAULT 'standard'
                        CHECK (confidentiality_level IN ('standard','high','restricted')),
  privilege_status      text NOT NULL DEFAULT 'none' CHECK (privilege_status IN
                          ('none','privileged','work_product','joint_privilege')),
  ai_allowed            boolean NOT NULL DEFAULT false,  -- R2 스키마만. 기본 거부 (00번 §5-1)
  legal_hold            boolean NOT NULL DEFAULT false,  -- C-3 인터페이스. true면 삭제 차단
  current_version_id    uuid NULL,   -- FK는 document_versions 생성 후 ALTER로 추가(순환 참조)
  deleted_at            timestamptz NULL,   -- soft delete. hard delete 금지(00번 §2)
  deleted_by            uuid NULL,
  created_by            uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'deleted') = (deleted_at IS NOT NULL)),
  UNIQUE (tenant_id, document_id),
  FOREIGN KEY (tenant_id, matter_id)  REFERENCES matters (tenant_id, matter_id), -- CFK
  FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, user_id),
  FOREIGN KEY (tenant_id, deleted_by) REFERENCES users (tenant_id, user_id)
);
CREATE INDEX idx_documents_matter ON documents (tenant_id, matter_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_family ON documents (tenant_id, document_family_id);
CREATE INDEX idx_documents_status ON documents (tenant_id, status);
-- 표준 RLS 적용
```

삭제 precondition(RECORD-HOLDIF-INTERFACE-TUW-001, DOC-DOCULIFE-LIFEMANA-TUW-003): soft delete 경로는 실행 전 `documents.legal_hold = false AND (소속 matter의 legal_hold = false)`를 검사하고, 위반 시 `DOCUMENT_LOCKED` 오류 + audit. 이 검사는 단일 함수(`assertNotHeld(documentId)`)로 구현해 모든 삭제 경로가 공유한다.

### 5.3 document_versions — RLS 적용 (DOC-DOCUVERS-VERSRESO-TUW-001)

```sql
CREATE TABLE document_versions (
  version_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(tenant_id), -- 원천 누락 보강(C-7)
  document_id           uuid NOT NULL,
  version_no            integer NOT NULL CHECK (version_no >= 1),
  version_status        text NOT NULL DEFAULT 'current'
                        CHECK (version_status IN ('current','superseded')),
  file_object_id        uuid NOT NULL,
  file_hash             char(64) NOT NULL CHECK (file_hash ~ '^[0-9a-f]{64}$'), -- SHA-256
  supersedes_version_id uuid NULL REFERENCES document_versions(version_id),
  created_by            uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, version_id),
  UNIQUE (document_id, version_no),       -- version_no 계산은 서비스에서 직렬화(advisory lock)
  UNIQUE (file_object_id),                -- 버전:파일 1:1 — 원본 재사용·덮어쓰기 차단
  FOREIGN KEY (tenant_id, document_id)    REFERENCES documents (tenant_id, document_id),
  FOREIGN KEY (tenant_id, file_object_id) REFERENCES file_objects (tenant_id, file_object_id),
  FOREIGN KEY (tenant_id, created_by)     REFERENCES users (tenant_id, user_id)
);
CREATE INDEX idx_versions_document ON document_versions (tenant_id, document_id);
CREATE INDEX idx_versions_hash ON document_versions (tenant_id, file_hash); -- 중복 후보 탐지
-- 표준 RLS 적용

-- documents.current_version_id FK (순환 참조 해소용 후행 ALTER)
ALTER TABLE documents ADD CONSTRAINT fk_documents_current_version
  FOREIGN KEY (tenant_id, current_version_id)
  REFERENCES document_versions (tenant_id, version_id);
```

**Immutable original(원칙 5, DOC-DOCUINTE-HASHDUPL-TUW-004, Risk=C)**: 신규 버전 = 신규 `file_objects` 행 + 신규 `document_versions` 행 + 직전 current 행의 `version_status='superseded'` 갱신. `file_hash`·`file_object_id`·`version_no`는 생성 후 변경 금지(아래 5.4 트리거와 동일 패턴으로 UPDATE 차단 트리거 적용).

### 5.4 file_objects — RLS 적용 (DOC-DOCUSTOR-OBJESTORAD-TUW-003)

```sql
CREATE TABLE file_objects (
  file_object_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(tenant_id), -- 원천 누락 보강(C-7: 격리 위협)
  storage_uri         text NOT NULL UNIQUE,
                      -- path resolver(OBJESTORAD-TUW-002) 산출:
                      -- s3://{bucket}/tenants/{tenant_id}/matters/{matter_id}/documents/{document_id}/{file_object_id}
                      -- tenant prefix 필수(DEC-07). object key에 tenant_slug 사용 금지
                      -- (42번 OBJESTORAD-TUW-002와 동일 형식). 정합성은 통합 테스트로 보증
  original_filename   text NOT NULL,
  normalized_filename text NOT NULL,
  mime_type           text NOT NULL,
  size_bytes          bigint NOT NULL CHECK (size_bytes >= 0),
  sha256              char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  encryption_key_id   text NULL,          -- R2 encryption hook interface (구현체는 후속)
  source_system       text NOT NULL DEFAULT 'upload'
                      CHECK (source_system IN ('upload','email_ingest','migration')),
  created_by          uuid NULL,          -- ingestion job은 NULL 허용
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, file_object_id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, user_id)
);
CREATE INDEX idx_file_objects_sha ON file_objects (tenant_id, sha256);
-- 표준 RLS 적용

-- 원본 불변 트리거: 내용 식별 컬럼의 UPDATE를 DB 계층에서 차단
CREATE FUNCTION file_objects_block_content_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.storage_uri IS DISTINCT FROM OLD.storage_uri
     OR NEW.sha256 IS DISTINCT FROM OLD.sha256
     OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'IMMUTABLE_ORIGINAL_VIOLATION: file_objects content columns are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_file_objects_immutable
  BEFORE UPDATE ON file_objects
  FOR EACH ROW EXECUTE FUNCTION file_objects_block_content_update();
```

업로드 실패 rollback(OBJESTORAD-TUW-004): storage 업로드 성공 → DB 트랜잭션 실패 시 업로드 객체를 보상 삭제(orphan sweep job). DB 먼저 커밋 금지.

### 5.5 canonical_documents — RLS 적용 (DOC-OCRTEXTEXT-EXTRWORK-TUW-*)

```sql
CREATE TABLE canonical_documents (
  canonical_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(tenant_id), -- 원천 누락 보강(C-7)
  version_id        uuid NOT NULL,
  body_text         text NULL,            -- 추출 본문. 로그·audit에 절대 기록 금지(원칙 7)
  extraction_status text NOT NULL DEFAULT 'pending' CHECK (extraction_status IN
                      ('pending','ocr_pending','extracted','failed')),
  extraction_method text NULL CHECK (extraction_method IN
                      ('pdf_text','docx','hwpx','ocr')),         -- DEC-06, DEC-10
  confidence        numeric(4,3) NULL CHECK (confidence >= 0 AND confidence <= 1),
  error_code        text NULL,            -- 실패 시 코드만. 본문 조각 포함 금지
  extracted_at      timestamptz NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, canonical_id),
  UNIQUE (version_id),                    -- 버전:정규화 1:1
  FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)         -- CFK
);
-- 표준 RLS 적용 (body_text 노출은 RLS + 21번 문서의 문서 권한 평가를 모두 통과해야 함)
```

R3에서 추가되는 검색 인덱스는 **별도 테이블 `document_search_index`**다(43번 SEARCH-SEARINDE-INDE-TUW-001이 권위, `db/migrations/0301_create_document_search_index.sql`). canonical_documents·documents에는 검색용 컬럼을 추가하지 않는다.

```sql
CREATE TABLE document_search_index (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(tenant_id),
  document_id      uuid NOT NULL,
  version_id       uuid NOT NULL,
  matter_id        uuid NOT NULL,
  client_id        uuid NOT NULL,
  document_type    text NOT NULL,
  document_status  text NOT NULL,
  version_status   text NOT NULL,
  title            text NOT NULL,
  content_text     text NULL,           -- 인덱싱 목적 저장(1MB 한도 truncation).
                                        -- 로그·audit로 복사 금지(원칙 7, 43번 §0.2-4)
  title_tsv        tsvector NULL,
  content_tsv      tsvector NULL,       -- 빈 추출 텍스트(0바이트)는 빈 값 허용
  fts_config       text NOT NULL DEFAULT 'simple',  -- config 변경은 reindex를 요구
  source_text_hash char(64) NOT NULL,   -- truncation과 무관하게 원문 기준 hash 보존
  indexed_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, version_id),       -- 동일 version 재인덱스는 upsert(중복 row 0건)
  FOREIGN KEY (tenant_id, document_id) REFERENCES documents (tenant_id, document_id),         -- CFK
  FOREIGN KEY (tenant_id, version_id)  REFERENCES document_versions (tenant_id, version_id)   -- CFK
);
CREATE INDEX idx_dsi_title_tsv   ON document_search_index USING gin (title_tsv);
CREATE INDEX idx_dsi_content_tsv ON document_search_index USING gin (content_tsv);
-- 표준 RLS 적용 (cross-tenant 차단 negative test — 43번 R3 Gate G-4)
```

- 컬럼 구성·제약(UNIQUE(tenant_id, version_id)·1MB truncation·source_text_hash)은 43번 INDE-TUW-001 구현 메모가 단일 원천이며, 본 절은 이를 DDL 형상으로 옮긴 것이다. 충돌 시 43번이 우선.
- DEC-05: R3는 PG FTS. `'simple'` 구성의 한국어 한계는 SEARCH-KOREAN-EVAL-TUW-001에서 측정하고 OpenSearch 전환은 R3 Gate에서 판단(ADR-006). 전환하더라도 **권한 필터 주입 계약(21번 §5)은 동일하게 유지**되어야 한다.

## 6. R3 테이블

### 6.1 evaluation_cases — RLS 적용 (DEVOPS-EVALSET-V0-TUW-002, DEC-16)

```sql
CREATE TABLE evaluation_cases (
  eval_case_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(tenant_id), -- 원천 누락 보강(C-7)
  task_type        text NOT NULL,        -- 'clause_extraction','summary','qa' 등 (R6 평가용 예약)
  input_ref        text NOT NULL,        -- 비식별 fixture 참조 경로/ID. 원문 본문 저장 금지
  expected_output  text NOT NULL,
  success_criteria text NOT NULL,
  risk_level       text NOT NULL DEFAULT 'medium'
                   CHECK (risk_level IN ('low','medium','high')),
  source_matter_ref text NULL,           -- 비식별 참조 토큰(실제 matter_id 직접 저장 금지)
  anonymization_confirmed boolean NOT NULL DEFAULT false,
                   -- 적재 스크립트는 true가 아니면 INSERT 거부 (비식별화 규칙 문서 준수)
  created_by       uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, user_id)
);
-- 표준 RLS 적용
```

**경계**: 이 테이블은 AI 기능이 아니라 **데이터 준비**다(00번 §7 R3). R6 전에 이 데이터를 읽는 추론·검색 코드 작성 금지. 적재는 `tools/`의 전용 스크립트로만 수행하며 종결 Matter 비식별화 계약서 20~50건이 v0 목표다.

## 7. 상태머신 (원천 07번 §4 승계 — 00번 §5-8)

구현 위치: `packages/domain` (순수 TS, IO 없음). 전이 맵은 `as const` 테이블로 정의하고 `canTransition(entityType, from, to): boolean` + `assertTransition(...)`(실패 시 도메인 오류)를 노출한다. 전이표에 없는 모든 (from, to) 조합은 **거부**가 기본값이다(fail-closed). 모든 상태 변경은 audit event를 동반한다.

### 7.1 Matter 상태머신 (8상태, MATTER-MATTLIFE-STATENGI-TUW-*)

상태: `proposed → open → active → closing → closed → archived → disposal_review → disposed`

| # | From | To | Guard (전이 조건) | 필수 부수효과 / Audit |
|---|---|---|---|---|
| M1 | proposed | open | Matter Owner 이상. client 연결·matter_code 확정 | `opened_at` 설정. `MATTER_STATUS_CHANGED` |
| M2 | proposed | closed | 수임 불발 종결. Owner 이상 | `MATTER_STATUS_CHANGED` |
| M3 | open | active | 멤버 1인 이상 존재 | `MATTER_STATUS_CHANGED` |
| M4 | active | closing | Owner 이상 | `MATTER_STATUS_CHANGED` |
| M5 | closing | active | 재개. Owner 이상 | `MATTER_STATUS_CHANGED` |
| M6 | closing | closed | closing action(STATENGI-TUW-003): 미결 체크 통과 | `closed_at` 설정. `MATTER_CLOSED` |
| M7 | closed | active | 재개(예외 경로). **Firm Admin만** | `closed_at` 해제. `MATTER_REOPENED` |
| M8 | closed | archived | archive action(STATENGI-TUW-004). Owner 이상 | `MATTER_ARCHIVED` |
| M9 | archived | disposal_review | **R12 전 전이 금지**(DEC-12: 자동삭제 없음·무기한 보존). 전이 함수는 정의하되 서비스 노출 금지 | (R12에서 정의) |
| M10 | disposal_review | archived | 폐기 반려 (R12) | (R12에서 정의) |
| M11 | disposal_review | disposed | **R12 전 전이 금지.** precondition: `legal_hold=false` AND disposal 승인 완료 | (R12에서 정의) |

상태별 mutation 규칙:
- `closed` 이후(closed/archived/disposal_review/disposed): 문서 업로드·멤버 변경·메타데이터 수정 **차단**(STATENGI-TUW-005, Risk=C). 읽기·audit 조회는 권한 내 허용.
- `archived`: 위에 더해 상태 전이도 M9 외 금지.
- `legal_hold=true`인 matter는 M9~M11 진입 불가.

### 7.2 Document 상태머신 (11상태, DOC-DOCUMETA-METAEXTR-TUW-006)

상태: `draft → internal_review → client_sent → counterparty_sent → markup_received → negotiation → final → executed → archived → disposal_locked → deleted`

| # | From | To | Guard | 필수 부수효과 / Audit |
|---|---|---|---|---|
| D1 | draft | internal_review | edit 권한 | `DOCUMENT_STATUS_CHANGED` |
| D2 | internal_review | draft | 반려 | 〃 |
| D3 | internal_review | client_sent | edit 권한 | 〃 |
| D4 | internal_review | counterparty_sent | edit 권한 | 〃 |
| D5 | client_sent | counterparty_sent | 〃 | 〃 |
| D6 | client_sent / counterparty_sent | markup_received | 상대방 markup 수령(신규 버전 업로드 동반 가능) | 〃 |
| D7 | markup_received | negotiation | 〃 | 〃 |
| D8 | negotiation | client_sent / counterparty_sent | 수정본 재발송(신규 버전) | 〃 |
| D9 | negotiation | final | edit 권한 | 〃 |
| D10 | draft / internal_review | final | 협상 없는 단순 문서의 단축 경로 | 〃 |
| D11 | final | executed | 체결 확인. Owner 이상 | `DOCUMENT_EXECUTED` |
| D12 | final | negotiation | 재협상 | `DOCUMENT_STATUS_CHANGED` |
| D13 | executed | archived | Owner 이상 또는 matter archive 연동 | `DOCUMENT_ARCHIVED` |
| D14 | draft~negotiation 각 상태 | archived | 진행 중단 보관. Owner 이상 | 〃 |
| D15 | archived | disposal_locked | **R12 전 전이 금지** (disposal 계열 미구현) | (R12에서 정의) |
| D16 | (deleted, disposal_locked 제외 전 상태) | deleted | **soft delete만**(`deleted_at` 설정). precondition: `legal_hold=false`(문서·matter 모두), matter가 closed 이후 상태가 아님, delete 권한 | `DOCUMENT_DELETED` |
| D17 | deleted | (삭제 직전 상태로 복원) | restore(DOC-DOCULIFE-LIFEMANA-TUW-002, Risk=C). 직전 상태는 audit/이력에서 복원. Owner 이상 | `DOCUMENT_RESTORED` |
| D18 | disposal_locked | deleted | **R12 전 전이 금지.** disposal 승인 절차 전용 | (R12에서 정의) |

상태별 mutation 규칙:
- `executed` 이후: 메타데이터 수정은 제한 목록만, 신규 버전 업로드 금지(부속 합의는 신규 문서).
- `archived`: 모든 mutation 차단(LIFEMANA-TUW-004, Risk=C). D15 전이만 예외(R12).
- `deleted`: 검색·목록·미리보기에서 제외(R3 Gate 항목). hard delete 경로는 존재하지 않는다.
- 어떤 상태에서도 원본 `file_objects` 변경은 불가(§5.4 트리거).

## 8. R4 이후 예약 스키마 (설계만 — **R0~R3에서 테이블 생성 금지**)

본 절의 모든 테이블은 생성 시점에 §1 공통 규약(tenant_id NOT NULL + 표준 RLS + composite FK)을 동일하게 적용한다. 아래는 R0~R3 설계가 미래와 충돌하지 않도록 고정하는 **계약 수준의 컬럼 초안**이며, 확정 DDL은 해당 release의 TUW 문서에서 작성한다.

### 8.1 emails 계열 (R4 — Email Vault v1. 진입조건: 핵심 DLP rule 선행, 보정 C-4)

- `emails`: email_id PK, tenant_id, matter_id(CFK, filing 후 NOT NULL), message_id(RFC 5322, tenant 내 unique), thread_id, subject, sender, sent_at, received_at, raw_file_id → **file_objects 재사용**(CFK, source_system='email_ingest'), filing_status(unfiled|suggested|filed), filed_by/at.
- `email_participants`: email_id(CFK), tenant_id, role(from|to|cc|bcc), email_address, display_name, party_id(CFK parties, NULL).
- `attachments`: attachment_id PK, tenant_id, email_id(CFK), document_id(CFK documents, NULL — 첨부 분리→Document 연결), filename, mime_type, size_bytes. 첨부는 분리 시 표준 문서 파이프라인(§5)을 그대로 통과한다.
- 설계 고정점: 이메일 검색·열람도 21번 권한 평가와 wall 필터를 그대로 통과해야 하며, 별도 검색 경로 신설 금지.

### 8.2 break_glass_requests (R5 — wall 우회 dual approval. 원천 08번 §5)

- `break_glass_requests`: request_id PK, tenant_id, wall_id(CFK ethical_walls), requester_id(CFK users), target_resource_type/target_resource_id, reason NOT NULL, status(requested|first_approved|approved|rejected|expired|revoked), first_approver_id, second_approver_id, approved_until timestamptz, created_at.
- 제약 고정점: `CHECK (first_approver_id <> second_approver_id)` AND 두 승인자 모두 requester와 상이. 승인 유효기간 필수(`approved_until`). 모든 상태 변화에 audit. **R5 전에는 wall 우회 경로가 코드에 존재해서는 안 된다** — R1~R3의 wall 평가는 우회 분기 없이 무조건 DENY.

### 8.3 external_* 계열 (R11 — P13. 보정 C-6: R9에서는 내부 전용 data room mapping만, external_* 생성 금지)

- `external_workspaces`: workspace_id PK, tenant_id, matter_id(CFK), name, status(draft|pending_approval|active|expired|revoked|archived — 원천 07번 External Sharing State 6종), expires_at, nda_required boolean, created_by, approved_by.
- `external_users`: external_user_id PK, tenant_id, workspace_id(CFK), email, name, organization, mfa_enabled, status. `users` 테이블과 분리(내부 인증 경로와 격리).
- `secure_links`: link_id PK, tenant_id, workspace_id(CFK), document_id(CFK), token_hash(원문 저장 금지), expires_at NOT NULL, revoked_at, download_allowed boolean, watermark_policy.
- `vdr_folders`: folder_id PK, tenant_id, workspace_id(CFK), parent_folder_id, name, permission_json.
- `external_access_logs`: 외부 열람 전수 기록(audit_events와 별도 상세 로그, 동일 append-only 메커니즘).
- 설계 고정점: 원칙 6(No silent external sharing) — R11 전에는 이 계열을 참조하는 어떤 코드·컬럼·API도 금지. `permissions.action='share_external'`은 스키마에 존재하지만 평가 시 무조건 DENY(21번 §3).

### 8.4 chunks / embeddings (R6 — pgvector, DEC-05. 보정 C-5로 semantic search는 R6)

- `chunks`: chunk_id PK, tenant_id, version_id(CFK canonical_documents.version_id 경유), parent_chunk_id(자기참조 — 조항·항·호 parent-child), chunk_type, text, page_number, paragraph_number, char_start, char_end, extraction_method, confidence.
- `embeddings`: embedding_id PK, tenant_id, chunk_id(CFK), model_id, vector vector(dim), created_at + **권한 메타 스냅샷 컬럼**: matter_id, document_id, confidentiality_level, ai_allowed, privilege_status, snapshot_at, `stale boolean NOT NULL DEFAULT false`.
- 설계 고정점(C-5의 이유): 벡터 인덱스는 원본 권한 변경(멤버십·wall·confidentiality·ai_allowed)이 발생하면 해당 행 `stale=true` 처리 후 재동기화하는 계약이 선행되어야 한다. 검색 시 `stale=true` 행은 **무조건 제외**(fail-closed). R6 전 벡터/의미검색 일체 금지(00번 §2).

### 8.5 disposal 계열 (R12 — Records. DEC-12: 법률검토 전 자동삭제 없음)

- `retention_policies`: policy_id PK, tenant_id, name, retention_period, trigger_event, disposition_action. (R2에서는 documents에 retention 관련 컬럼 추가 없이 **flag 인터페이스만** 존재 — §4.3/§5.2의 legal_hold.)
- `legal_holds`: hold_id PK, tenant_id, matter_id(CFK NULL), document_id(CFK NULL), reason NOT NULL, status(active|released), created_by, released_at. `CHECK (matter_id IS NOT NULL OR document_id IS NOT NULL)`. 생성/해제 시 §4.3·§5.2의 boolean flag를 동기화(flag가 R2~R11 기간의 단일 진실).
- `disposal_requests`: request_id PK, tenant_id, target 참조, 승인 체인(이중 승인), status.
- `disposal_certificates`: certificate_id PK, tenant_id, request_id(CFK), executed_at, approver_id, evidence_hash. `DISPOSAL_EXECUTED` audit 필수.
- 설계 고정점: hard delete는 이 계열 + legal hold 검사를 모두 통과한 disposal 경로에서만 등장한다(00번 §2).

### 8.6 기타 후속 release 예약 (원천 07번 승계분)

| 테이블 | release | 보강 사항(생성 시 적용) |
|---|---|---|
| clauses, clause_chunks, defined_terms, rights, obligations, conditions | R8 (Contract Intelligence) | 전부 `tenant_id NOT NULL`+RLS (원천 누락 보강). version_id·clause_id는 CFK |
| risks, issues | R8~R10 | tenant_id+RLS |
| authorities | R8 | **글로벌 예외**: `scope text NOT NULL CHECK (scope IN ('global','tenant'))`, `tenant_id uuid NULL` + `CHECK ((scope='global') = (tenant_id IS NULL))`. RLS 정책: `scope='global' OR tenant_id=current_setting(...)`. 판례·법령 등 공용 참조 데이터이기 때문이며, **쓰기**는 Knowledge Manager/관리 경로로 한정 |
| ai_sessions, ai_retrieval_logs | R6 | tenant_id+RLS. prompt/response는 hash만(원칙 7) |
| feedback_items | R6 | tenant_id+RLS (원천 누락 보강) |
| playbook_rules, drafting_patterns | R8 | tenant_id+RLS (원천 누락 보강) |

## 9. RLS 적용 총괄표 (R0~R3 생성 테이블)

| 테이블 | release | tenant_id | RLS | 비고 |
|---|---|---|---|---|
| tenants | R0 | — | **미적용 (글로벌 예외)** | 격리 기준 테이블. vault_app은 SELECT만. 마이그레이션에 예외 사유 주석 필수 |
| users | R0 | NOT NULL | 적용 | |
| workspaces | R0 | NOT NULL | 적용 | DDL 상세는 40번 CORE-TENACORE-TENACONT-TUW-003(0002_workspaces.sql)이 규범 |
| sessions | R0 | NOT NULL | 적용 | 토큰은 hash만 저장 |
| password_reset_tokens | R0 | NOT NULL | 적용 | 토큰은 hash만 저장. DDL 상세는 40번 CORE-AUTHCORE-USERSESS-TUW-005(0004_password_reset_tokens.sql)이 규범 |
| audit_events | R0 | NOT NULL | 적용 (INSERT/SELECT 정책만) | append-only 4중 장치(§3.4). UPDATE/DELETE 정책 부존재 |
| clients | R1 | NOT NULL | 적용 | |
| groups / group_members | R1 | NOT NULL | 적용 | v1.1 신설 |
| matters | R1 | NOT NULL | 적용 | R2에 ai_policy_id·legal_hold 컬럼 추가 |
| matter_members | R1 | NOT NULL | 적용 | tenant_id는 원천 누락 보강 |
| parties | R1 | NOT NULL | 적용 | |
| permissions | R1 | NOT NULL | 적용 | 평가 계약 컬럼 포함(§4.6) |
| ethical_walls | R1 | NOT NULL | 적용 | C-2로 R1 배치 |
| ethical_wall_memberships | R1 | NOT NULL | 적용 | v1.1 신설 |
| ai_policies | R2 | NOT NULL | 적용 | 스키마만. default_effect='DENY' 고정 |
| documents | R2 | NOT NULL | 적용 | legal_hold·ai_allowed 포함 |
| document_versions | R2 | NOT NULL | 적용 | tenant_id 보강 |
| file_objects | R2 | NOT NULL | 적용 | tenant_id 보강 + 불변 트리거 |
| canonical_documents | R2 | NOT NULL | 적용 | tenant_id 보강 |
| document_search_index | R3 | NOT NULL | 적용 | v1.1 신설(§5.5 — 43번 INDE-TUW-001이 권위). UNIQUE(tenant_id, version_id) |
| evaluation_cases | R3 | NOT NULL | 적용 | tenant_id 보강 |

글로벌 예외는 **`tenants`(R0~R3 유일)** 와 R8의 **`authorities` scope(global|tenant)** 뿐이다. 그 외 어떤 테이블도 RLS 없이 생성할 수 없다.

주의: **RLS는 tenant 격리 계층일 뿐, 권한 평가가 아니다.** matter 멤버십·wall·문서 기밀등급·명시 permissions 평가는 전부 서비스 계층 PermissionService(21번 문서)에서 수행한다. RLS 통과가 접근 허용을 의미하지 않는다.

## 10. 마이그레이션·검증 절차

1. 마이그레이션 파일: `db/migrations/NNNN_name.sql` (도구 확정 시 동등 산출물). 모든 신규 row-level 테이블 마이그레이션은 §1.2 RLS 템플릿 적용 여부를 CI 스크립트(DEVOPS-BACKLOG-VALIDATE 계열)로 정적 검사한다 — `CREATE TABLE`이 있는데 `ENABLE ROW LEVEL SECURITY`가 없으면(예외 주석 부재 시) CI 실패.
2. 표준 검증 시퀀스: `docker compose -f infra/docker-compose.dev.yml up -d` → `pnpm install` → `pnpm db:migrate` → `pnpm test:integration` → `pnpm db:rollback` → `pnpm db:migrate`.
3. 필수 통합 테스트(tests/integration):
   - cross-tenant: tenant A context로 tenant B의 모든 row-level 테이블 SELECT/INSERT/UPDATE 시도 → 0행/오류 (R0 Gate).
   - audit-immutability: UPDATE/DELETE/TRUNCATE 시도 → DB 오류 (R0 Gate).
   - immutable-original: file_objects 내용 컬럼 UPDATE → 오류, 동일 파일 재업로드 → 동일 sha256, 1바이트 상이 → 상이 hash (R2 Gate).
   - hold-block: legal_hold=true 문서/matter의 soft delete 시도 → `DOCUMENT_LOCKED` (R2 Gate).
   - state-machine: §7 전이표의 허용 전이 전수 통과 + 미정의 전이 임의 표본 거부 (`packages/domain` unit + 서비스 integration).
4. seed(데모 tenant 2개, CORE-DATACORE-MIGR-TUW-003)는 cross-tenant·권한 매트릭스 테스트(21번 §7)의 fixture를 겸한다.

