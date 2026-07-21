# 상당히 개발된 제품에 오픈소스 코드를 반영하는 Source-First 방법론

**상태:** Proposed — 아키텍처·보안·법률·운영 승인 전 실행 기준이 아님

**작성일:** 2026-07-21

**적용 기준선:** AMIC Vault `origin/main` @ `91ac55a59b538cb57ecacecea4e69c92dc7c4cfd`

**대상 독자:** Product Owner, Architecture, Security, Legal/Records, Platform/Operations, 구현자, 독립 검토자

**연결 계획:** [AMIC Vault 엔터프라이즈 DMS OSS 활용 상세 계획](./enterprise-dms-oss-uplift-plan-main-2026-07-21.md)

**문서 성격:** 이미 상당한 코드·데이터·권한 모델·운영 계약을 가진 제품에 공개 OSS 저장소를 로컬 복제하고, 그 코드·테스트·fixture를 안전하고 경제적으로 반영하는 방법론이다. 특정 OSS 채택 승인서, 법률 의견서, 구현 완료 증명은 아니다.

## 0. 결론

모든 후보 OSS는 **exact commit으로 로컬 복제하여 먼저 읽고, 빌드하고, 테스트하고, 비교한다.** 신규 구현은 다음 순서가 모두 부적합하다는 근거가 있을 때만 허용한다.

1. 현재 제품 안의 검증된 코드 재사용
2. upstream 공식 package/image/binary를 수정 없이 사용
3. 얇은 adapter로 공식 artifact를 제품 계약에 연결
4. 라이선스가 허용하는 작은 코드·fixture를 provenance와 함께 vendoring
5. 명시적 owner와 patch budget을 둔 최소 fork
6. 코드가 아니라 동작·상태·테스트만 추출한 독립 구현

목표는 복제하거나 복사한 LOC를 늘리는 것이 아니다. 목표는 **upstream이 이미 해결하고 검증한 문제를 다시 만들지 않으면서, 제품 고유의 authority와 장기 유지가능성을 보존하는 것**이다.

```text
순 재사용 가치
= 회피한 설계·구현·테스트·운영비
+ upstream의 성숙도·장애학습·보안패치 가치
- 제품 계약 적응비
- 라이선스·배포 준수비
- fork/patch 동기화비
- 데이터 이행·rollback·exit 비용
```

AMIC Vault에서는 Matter 권한, ethical wall, tenant RLS, audit 원자성, immutable version, legal hold/disposal authority는 제품 고유 영역이다. 반면 parser, OCR, 변환, malware scan, resumable upload, identity protocol, telemetry, SBOM, IaC는 OSS 재사용 우선 영역이다.

## 1. 문제와 제약

### 1.1 신규 제품과 성숙 제품의 차이

신규 제품은 upstream의 데이터 모델과 상태머신을 그대로 채택할 수 있다. 상당히 개발된 제품은 이미 다음 자산과 부채를 함께 가진다.

- 운영 중이거나 마이그레이션된 데이터
- 외부에 노출된 API와 UI 계약
- 권한·감사·보존과 같은 규범적 상태
- 기존 test fixture와 장애 복구 절차
- 배포·관측·백업·지원 계약
- 고객별 설정과 하위호환성

따라서 기능 수가 많은 OSS가 항상 더 좋은 기반은 아니다. 통합 후 두 개의 권한 모델, 두 개의 document identity, 두 개의 검색 결과 authority가 생기면 신규 구현보다 비싸질 수 있다.

### 1.2 본 방법론의 목표

- 공개된 upstream 코드를 실제 구현 입력으로 사용한다.
- 새 코드를 만들기 전에 재사용 가능성을 증명한다.
- package/image 사용뿐 아니라 source·test·fixture·failure mode를 활용한다.
- 제품 고유 authority와 fail-closed 원칙을 보존한다.
- 모든 코드 유입을 exact source와 license로 추적한다.
- upstream 업데이트와 철수까지 포함한 총소유비용을 계산한다.
- source 구현, local 검증, CI, staging, production, go-live 주장을 분리한다.

### 1.3 비목표

- 공개 저장소를 무조건 제품 저장소 안에 복사하지 않는다.
- 기능 수만 보고 기존 제품 core를 교체하지 않는다.
- 컨테이너나 HTTP 경계를 라이선스 면책으로 간주하지 않는다.
- 테스트가 많다는 이유로 upstream의 보안·권한 모델을 신뢰하지 않는다.
- clone 성공을 제품 통합 또는 배포 성공으로 주장하지 않는다.

## 2. 용어와 책임 경계

| 용어 | 의미 | 제품 코드 포함 여부 | 유지보수 책임 |
|---|---|---:|---|
| Mirror | upstream refs를 보존하는 읽기 전용 복제본 | 아니오 | upstream 추적 자동화만 |
| Clone | 특정 SHA를 분석·빌드하기 위한 로컬 checkout | 아니오 | 조사 기간 동안만 |
| Consume | 공식 package/image/binary를 version/digest로 사용 | lock/manifest만 | upstream + 제품 adapter |
| Adapter | 제품 계약과 upstream API 사이의 얇은 변환층 | 예 | 제품 팀 |
| Vendor | upstream 파일 일부를 제품 저장소에 복사 | 예 | 제품 팀이 해당 snapshot 소유 |
| Patch queue | upstream 원본 위에 재현 가능한 patch를 유지 | patch만 | 제품 팀 + upstream sync |
| Fork | 독립 remote/branch에서 수정본을 장기 유지 | 별도 저장소 | 제품 팀이 사실상 maintainer |
| Behavioral transplant | 코드 복사 없이 동작·상태·테스트 계약을 독립 구현 | 새 제품 코드 | 제품 팀 |
| Core replacement | upstream이 제품의 규범적 authority를 소유 | 대규모 | migration과 운영 전체 |

`clone`, `vendor`, `fork`는 같은 행위가 아니다. 모든 후보를 clone할 수 있지만, 그중 극히 일부만 vendor하거나 fork해야 한다.

## 3. 아키텍처 결정

### 3.1 채택: Source-first selective adoption

모든 후보를 로컬 source lab에 clone한다. upstream 그대로의 build/test 결과와 제품 fit-gap을 먼저 기록한다. 이후 L0~L4 중 하나를 선택한다.

| 차원 | 평가 |
|---|---|
| 초기 분석비 | 중간 |
| 중복 구현 방지 | 매우 높음 |
| 제품 authority 보존 | 높음 |
| 라이선스 추적성 | 높음 |
| 장기 유지비 | 채택 모드에 따라 통제 가능 |
| 결정 | **채택** |

### 3.2 기각: clone한 코드를 우선 복사

| 차원 | 평가 |
|---|---|
| 초기 demo 속도 | 높음 |
| hidden dependency·global state 유입 | 높음 |
| provenance·license 누락 위험 | 높음 |
| upstream merge 비용 | 높음 |
| 결정 | 기각 |

### 3.3 기각: source를 보지 않고 API만 연동

| 차원 | 평가 |
|---|---|
| 초기 설정 | 쉬움 |
| 실제 failure mode 이해 | 낮음 |
| security boundary 검증 | 낮음 |
| upstream test 활용 | 없음 |
| 결정 | 기각 |

### 3.4 조건부: 전체 core fork

다음이 모두 증명될 때만 별도 ADR로 검토한다.

- 제품 authority와 upstream authority가 실질적으로 동일함
- 데이터·권한·audit migration parity가 자동 검증됨
- 3년 patch/upgrade owner와 예산이 있음
- 원본 제품으로 rollback 또는 export할 수 있음
- 라이선스와 SaaS/on-prem 배포 의무가 승인됨

AMIC Vault의 현재 DMS core에는 해당하지 않는다.

## 4. 불변 원칙

### 4.1 Clone-all, import-selectively

- shortlist에 오른 저장소는 모두 exact SHA로 clone한다.
- 제품 repository에는 upstream `.git`이나 전체 source tree를 넣지 않는다.
- 코드·fixture를 제품에 넣는 행위는 별도 승인과 provenance가 필요하다.
- clone 경로는 제품 build context와 secret search path에서 분리한다.

### 4.2 Upstream-first

- upstream public API와 extension point를 먼저 사용한다.
- 수정이 필요하면 upstream 기여 가능성을 먼저 평가한다.
- private fork는 마지막 수단이다.
- upstream과 호환되는 patch queue가 source copy보다 우선한다.

### 4.3 Test-before-code

- 기능 코드를 가져오기 전에 upstream test와 fixture를 분류한다.
- 제품의 failure contract로 이식할 테스트를 먼저 작성한다.
- test가 설명하지 않는 upstream behavior는 제품 계약으로 승격하지 않는다.

### 4.4 Authority-before-convenience

- OSS가 편리하더라도 제품 고유 권한·감사·보존 authority를 우회할 수 없다.
- 판단 불가와 upstream 오류는 제품의 fail-closed 계약으로 정규화한다.
- upstream ID, ACL, audit는 제품의 규범적 ID, PermissionService, AuditService를 대체하지 않는다.

### 4.5 Provenance-by-default

한 줄의 코드, fixture 하나, 설정 예제 하나라도 가져오면 다음을 기록한다.

- upstream URL과 exact commit
- 원본 path와 선택한 범위
- SPDX license와 license file hash
- 저작권·NOTICE 요구사항
- 수정 내용과 수정자
- 제품 target path
- update/rollback owner

### 4.6 Exit-before-entry

채택 전에 제거·대체·rollback 방법을 정한다. DB schema, object format, protocol, user identity를 upstream 전용 형식에 잠그는 변경은 export와 dual-read 계획 없이는 시작하지 않는다.

## 5. 제품 authority map

OSS 조사 전에 현재 제품의 기능을 세 가지로 분류한다.

| 분류 | 질문 | 기본 채택 모드 |
|---|---|---|
| Normative authority | 이 코드의 결과가 법적·권한·금전·데이터 생존 상태를 결정하는가? | L0 또는 L4 |
| Integration boundary | 외부 protocol·format·service를 제품 계약으로 제한하는가? | L1~L3 + adapter |
| Commodity capability | 여러 제품에서 동일하고 OSS 성숙도가 높은가? | L1 우선 |

AMIC Vault의 예시는 다음과 같다.

| 영역 | 분류 | 이유 |
|---|---|---|
| PermissionService·ethical wall | Normative authority | 문서 존재와 접근 가능성을 결정 |
| Audit transaction | Normative authority | 행위 완료 여부와 증거를 결정 |
| legal hold·disposal | Normative authority | 비가역적 삭제와 법률상 보존을 결정 |
| ClamAV/Tika/Gotenberg | Integration boundary | hostile file 처리이므로 격리·정규화 필요 |
| tusd/Keycloak | Integration boundary | protocol은 재사용하되 Vault authority는 유지 |
| OTel/Syft/Trivy/OpenTofu | Commodity capability | 제품 도메인과 독립적이고 표준화됨 |

## 6. Source adoption lifecycle

각 단계는 입력, 행위, 완료조건, 중단조건, 증적을 가진다. 앞 단계가 완료되지 않으면 다음 단계로 넘어가지 않는다.

| 단계 | 입력 | 핵심 행위 | 완료조건 | 중단조건 | 산출물 |
|---|---|---|---|---|---|
| S0 Baseline | exact product SHA | 기존 구현·test·authority·SLO inventory | 교체하지 않을 계약과 gap이 구분됨 | dirty/다른 branch 사실 혼입 | `product-baseline.json` |
| S1 Acquire | 후보 URL/tag | mirror/clone, detached SHA, license hash, signature 확인 | 재현 가능한 source snapshot | ref 이동·license 불명확 | `upstream-lock.yml` |
| S2 Reproduce | upstream source | upstream 지침 그대로 build/test | 원본 baseline 결과 보존 | secret/실데이터 요구, 비재현 | `upstream-baseline.json` |
| S3 Map | product·upstream source | entry point, state, DB, API, error, test path 매핑 | file/test 단위 source map | black box, 핵심 경로 미식별 | `oss-source-map.yml` |
| S4 Decide | source map·license | L0~L4, TCO, security, license 결정 | 승인자와 owner 지정 | 배포 profile·의무 불명확 | adoption ADR |
| S5 Contract | 선택 모드 | bounded schema, adapter, fixtures, negative tests | product authority와 failure contract 고정 | upstream ID/ACL 직접 신뢰 | contract/tests |
| S6 Spike | contract | 최소 integration, shadow/diff, fault injection | exit/rollback 포함 적합성 증명 | product core 대규모 변경 필요 | spike receipt |
| S7 Integrate | 승인된 spike | 최소 delta 구현, provenance, SBOM | product + upstream parity tests green | 범위·patch 폭증 | PR evidence |
| S8 Operate | pinned artifact | CVE/update/license drift, SLO, patch sync | owner·cadence·runbook 작동 | upstream EOL/maintainer 공백 | operations receipt |
| S9 Exit/Upgrade | 새 version/철수 결정 | replay tests, migration, rollback rehearsal | 새 version 또는 대체재로 가역 전환 | data/export 불가 | upgrade/exit report |

### 6.1 S0 — 제품 기준선

다음 질문을 코드와 테스트로 답한다.

- 이미 존재하는 기능은 무엇인가?
- 제품 고유의 permission/audit/data contract는 무엇인가?
- 실제 gap은 기능 부재인가, 운영·복구·증적 부재인가?
- upstream 도입으로 삭제할 수 있는 제품 코드는 무엇인가?
- upstream을 넣으면 두 개가 되는 authority는 무엇인가?

산출물은 `KEEP`, `REPLACE_CANDIDATE`, `AUGMENT`, `GAP`, `UNKNOWN`으로 분류한다.

### 6.2 S1 — 재현 가능한 로컬 clone

제품 repository 밖의 전용 source lab을 사용한다. 예시 환경변수는 시스템 예약 이름을 사용하지 않는다.

```bash
export OSS_RESEARCH_ROOT="/approved/path/amic-vault-oss-lab"
git clone --filter=blob:none <upstream-url> "$OSS_RESEARCH_ROOT/<component>"
git -C "$OSS_RESEARCH_ROOT/<component>" fetch --tags --force
git -C "$OSS_RESEARCH_ROOT/<component>" fetch origin <full-commit-sha>
git -C "$OSS_RESEARCH_ROOT/<component>" checkout --detach <full-commit-sha>
git -C "$OSS_RESEARCH_ROOT/<component>" status --short
git -C "$OSS_RESEARCH_ROOT/<component>" rev-parse 'HEAD^{tree}'
```

필수 통제:

- branch name이 아니라 full SHA를 권위로 사용한다.
- submodule, Git LFS, generated source, vendored dependency를 inventory한다.
- upstream checkout은 read-only 기준본으로 유지한다.
- 실험 수정은 별도 branch/worktree 또는 patch directory에서 한다.
- upstream clone은 제품 container build context에 포함하지 않는다.
- clone 내부의 예제 `.env`, key, fixture를 신뢰하거나 제품에 복사하지 않는다.

### 6.3 S2 — upstream 원본 baseline

수정하기 전에 upstream 자체의 build/test를 실행한다. 실패도 결과다.

기록할 항목:

- OS/CPU/runtime/compiler/package manager
- 설치와 build/test command
- pass/fail/skip 수와 duration
- network·service·secret 의존성
- flaky/비결정적 테스트
- 공개 security policy와 지원 release
- 생성된 artifact hash

upstream baseline 실패를 제품 수정으로 숨기지 않는다. `UPSTREAM_BASELINE_FAILED`, `ENVIRONMENT_BLOCKED`, `SOURCE_REPRODUCED`를 구분한다.

### 6.4 S3 — source map

최소 다음 경로를 찾는다.

- public API/CLI/worker entry point
- domain state와 persistence model
- transaction/queue/retry/idempotency 처리
- permission/authentication boundary
- audit/logging와 sensitive data 처리
- parser/network/filesystem boundary
- error taxonomy와 operator remediation
- unit/integration/negative/fault test
- fixture·sample data의 provenance

검색 결과는 repository root URL이 아니라 exact `blob/<sha>/<path>` 또는 GitLab equivalent로 기록한다.

### 6.5 S4 — 선택과 승인

다음 점수를 기록하되, 보안·법률 stop condition을 점수로 상쇄하지 않는다.

| 평가축 | 질문 | 점수 |
|---|---|---:|
| 기능 적합성 | 필요한 contract를 실제로 제공하는가? | 0~5 |
| architecture fit | 언어·runtime·data·deployment가 맞는가? | 0~5 |
| authority fit | 제품 권한·감사·tenant 모델을 보존하는가? | 0~5 |
| test maturity | negative/fault/upgrade test가 있는가? | 0~5 |
| security health | security policy·CVE 대응·release가 건강한가? | 0~5 |
| license fit | SaaS/on-prem/수정/배포 형태가 승인 가능한가? | 0~5 |
| maintainability | update cadence·owner·exit이 현실적인가? | 0~5 |
| code deletion | 기존·신규 제품 코드를 얼마나 제거하는가? | 0~5 |

권장 해석:

- 32~40: L1/L2 우선 검토
- 24~31: L2/L3 pilot
- 16~23: L4 reference 또는 제한 spike
- 0~15: reject

Permission, tenant isolation, audit, legal hold, immutable original 중 하나라도 훼손하면 총점과 무관하게 reject다.

## 7. L0~L4 제품 반영 모델

모든 L1~L4 후보는 먼저 S1 clone과 S2/S3 조사를 거친다. 이 레벨은 “clone 여부”가 아니라 **제품이 upstream을 어떻게 소유하고 실행하는가**를 뜻한다.

| 수준 | 제품 반영 방식 | 예시 | 필수 계약 | 기본 판단 |
|---|---|---|---|---|
| L0 Existing local reuse | 이미 main에 있는 검증된 코드를 재사용·일원화 | PermissionService, AuditService, RLS/FTS, S3 adapter, `pg-boss`, Zod | 기존 regression과 authority 유지 | 항상 첫 선택 |
| L1 Official artifact consumption | 공식 package/image/binary를 수정 없이 pin | ClamAV, Tika, Gotenberg, OCRmyPDF, tusd, Keycloak, OTel, Syft/Trivy/Cosign | version/digest, SBOM, NOTICE, bounded adapter, rollback | commodity 기본값 |
| L2 Selective source adoption | clone한 permissive/승인 source·fixture의 작은 범위를 vendor하거나 patch queue로 사용 | protocol client helper, parser adapter, official schema/fixture | file-level provenance, license header, local delta, upstream parity test | 작고 안정적일 때 |
| L3 Maintained fork or isolated modified service | 수정이 필요한 upstream을 별도 fork/service로 유지 | 기능상 patch가 필요한 converter/broker | fork remote, patch SLA, merge cadence, source offer/NOTICE, HA/backup, exit plan | owner·예산 있을 때만 |
| L4 Behavioral/test transplant | 코드 복사 없이 상태·실패모드·테스트·fixture 계약을 독립 구현 | Alfresco/Mayan/Paperless/Docspell/Teedy의 DMS 패턴 | exact source map, copied-code=0 증명 또는 승인된 fixture provenance, parity/negative tests | core authority 기본값 |

`Core replacement`는 L4가 아니다. 별도 `X-Core` 결정이며 현재 AMIC Vault에서는 기각한다.

### 7.1 선택 우선순위

```text
L0로 해결되는가?
  yes -> L0
  no  -> upstream 공식 artifact가 bounded contract를 제공하는가?
          yes -> L1
          no  -> 작은 source/fixture를 license-approved 방식으로 분리 가능한가?
                  yes -> L2
                  no  -> fork/service를 3년 유지할 owner와 exit이 있는가?
                          yes -> L3
                          no  -> 동작·테스트가 제품 고유 구현에 가치가 있는가?
                                  yes -> L4
                                  no  -> reject
```

### 7.2 레벨 상승 규칙

- L1에서 product-specific patch가 생기면 L2 또는 L3 재심사를 한다.
- vendored delta가 upstream 원본의 20%를 넘거나 3개 release 연속 충돌하면 L2를 중단하고 L1 adapter 또는 L3 fork를 재평가한다.
- fork가 2개 minor release 이상 뒤처지거나 Critical CVE SLA를 지키지 못하면 신규 기능을 중단하고 upgrade/exit만 수행한다.
- L4 구현이 upstream code와 실질적으로 유사해지면 독립 검토자가 provenance와 license를 재판정한다.

## 8. 코드 재사용 규칙

### 8.1 그대로 복사하지 말아야 할 신호

- framework lifecycle과 global container에 강하게 결합됨
- upstream 내부 DB schema와 ID가 함수 signature에 누출됨
- ACL·tenant·audit이 제품 계약과 다름
- hidden network/filesystem access가 있음
- process-global mutable state 또는 singleton을 전제함
- test가 unit happy path뿐임
- generated source인지 사람이 수정할 source인지 불명확함
- license header 또는 contributor provenance가 불명확함

### 8.2 직접 재사용하기 좋은 신호

- 작은 순수 함수 또는 독립 parser
- stable public interface와 semantic versioning
- negative/fuzz/fault tests가 존재
- permissive 또는 승인된 file-level license
- 제품 data model과 무관한 protocol/schema
- upstream release에서 계속 유지되는 path
- local patch 없이 사용할 수 있음

### 8.3 vendoring 최소 계약

vendored 파일마다 source header 또는 인접 manifest에 다음을 둔다.

```yaml
source_url: https://example.org/project/blob/<sha>/path/to/file
upstream_commit: <full-sha>
upstream_path: path/to/file
license_spdx: Apache-2.0
license_sha256: <hex>
copyright: <upstream-notice>
local_target: path/in/product
modifications:
  - <bounded change>
update_owner: <team-or-role>
```

fork의 파일을 복사한 뒤 원 출처를 fork URL로만 기록하지 않는다. 최초 upstream과 fork commit을 모두 기록한다.

### 8.4 adapter 규칙

adapter는 다음만 담당한다.

- bounded request/response schema
- timeout, retry, circuit/health mapping
- upstream error를 제품 error taxonomy로 변환
- product identity와 opaque upstream reference 매핑
- content/log redaction
- metrics와 correlation

adapter가 PermissionService, AuditService, RLS, legal hold 판단을 재구현하면 중단한다.

## 9. 테스트와 fixture 재사용

공개 source의 가장 큰 자산은 구현보다 테스트일 수 있다. 다음 우선순위를 적용한다.

1. upstream test를 변경 없이 실행하여 기준 동작을 확인
2. 라이선스가 허용하는 fixture를 provenance와 함께 재사용
3. 동일 언어·계약이면 test code를 승인 후 port
4. 언어·license가 다르면 Given/When/Then behavior로 변환
5. upstream이 빠뜨린 Vault negative case를 추가

### 9.1 필수 test harvesting 분류

| 분류 | 예시 | Vault 반영 |
|---|---|---|
| Happy path | 정상 ingest/convert/upload | 최소 parity |
| Boundary | 0 byte, max size, page limit | product limit 적용 |
| Duplicate/idempotency | 재실행·중복 hook | queue/outbox 계약 |
| Integrity | checksum mismatch, missing object | immutable/version 계약 |
| Fault | timeout, crash, partial write | recovery·dead-letter |
| Security | path traversal, SSRF, forged identity | fail-closed negative |
| Permission | unauthorized access | Vault 자체 matrix로 재작성 |
| Upgrade | migration/config compatibility | version 승격 gate |

### 9.2 provenance 표기

코드를 복사하지 않고 동작만 참고한 테스트도 source map에 남긴다.

```text
Behavioral reference: <repo>@<sha>:<test-path>#<test-name>
Reused: scenario and expected state only
Copied source: no
Vault deviations: permission-before-search, audit failure aborts action
```

### 9.3 fixture 안전성

- 실사용자·고객·비밀정보 fixture는 가져오지 않는다.
- malware, malformed file, identity token fixture는 격리한다.
- fixture license가 source license와 다른지 확인한다.
- large binary는 hash, generator, 최소 reproduction을 우선한다.
- fixture 삭제·변형 이력도 manifest에 기록한다.

## 10. 라이선스와 배포 profile

이 표는 triage 기준이며 법률 의견을 대체하지 않는다.

| 계열 | source 조사 | 내부 사용 | SaaS 수정 서비스 | on-prem 배포 | 기본 정책 |
|---|---|---|---|---|---|
| MIT/BSD/ISC | 허용 | 낮은 부담 | notice 유지 | notice/license 유지 | L1/L2 우선 |
| Apache-2.0 | 허용 | 낮은 부담 | license/NOTICE·patent 조건 확인 | license/NOTICE 포함 | L1/L2 우선 |
| MPL-2.0 | 허용 | 사용 가능 | 수정 파일과 배포 형태 검토 | covered file source 의무 검토 | L1, 제한 L2/L3 |
| LGPL | 허용 | 사용 가능 | linking/수정/배포 방식 검토 | library source·relink 조건 검토 | service/library 경계 심사 |
| GPL | 허용 | 사용 가능 | 결합·배포 여부 심사 | 배포 시 corresponding source 위험 높음 | L4 기본, L1/L3 Legal 승인 |
| AGPL | 허용 | 사용 가능 | 수정 network service의 source offer 등 심사 | GPL 의무도 함께 고려 | L4 기본, L3 예외 승인 |

필수 질문:

- 고객이 binary/container/on-prem package를 받는가?
- upstream program을 수정했는가?
- 제품과 linked/combined work인가, 독립 process인가?
- 사용자가 AGPL 프로그램과 network로 상호작용하는가?
- source offer, NOTICE, attribution을 실제 delivery pipeline이 제공하는가?
- dual/commercial license가 있는가?

컨테이너·sidecar·HTTP 경계는 보안상 유용하지만 라이선스 판단을 자동 해결하지 않는다.

## 11. 보안·공급망 계약

각 adoption은 다음을 만족해야 한다.

- exact source SHA와 source tree hash
- release tag와 artifact/image digest의 대응 증명
- signature/attestation이 있으면 검증
- source·binary·container SBOM
- transitive dependency와 embedded binary inventory
- security policy, advisory feed, maintainer activity
- Critical/High CVE SLA와 exception expiry
- build network access와 fetched artifact hash
- default credential, telemetry, update checker, external call 점검
- product secret/data 없이 upstream test 실행

source가 공개되어 있어도 공급된 binary가 그 source에서 만들어졌다는 보장은 없다. source와 artifact identity를 별도로 결합한다.

## 12. Fork와 patch queue 운영

### 12.1 fork 승인 조건

- L1/L2로 해결할 수 없음
- patch가 제품 경쟁력 또는 필수 보안 계약에 직접 필요
- upstream contribution 시도 또는 불가 사유 존재
- maintainer, backup maintainer, security owner 지정
- 월별 merge/rebase rehearsal 가능
- source distribution/NOTICE pipeline 승인
- upstream 종료 시 대체 또는 회귀 가능한 exit plan 존재

### 12.2 patch budget

다음을 매 release 측정한다.

- patch 파일 수와 변경 LOC
- upstream touched file 수
- 충돌 수와 해결 시간
- upstream 대비 version lag
- local-only test 수
- CVE patch latency
- upstream에 제출/수용된 patch 비율

budget을 넘으면 신규 기능 patch를 중단하고 upstream 기여, adapter 축소, 대체재, L4 재구현 중 하나를 결정한다.

### 12.3 fork 금지 상태

- owner가 한 명뿐임
- upstream release를 재현할 수 없음
- source offer 또는 license 의무를 자동 이행할 수 없음
- 고객 data migration/export가 없음
- 제품 CI가 fork baseline을 실행하지 않음
- Critical CVE를 합의 SLA 안에 backport할 수 없음

## 13. 운영·업그레이드·철수

### 13.1 업데이트 cadence

| 주기 | 점검 |
|---|---|
| 매일/자동 | advisory, image/package update, signature drift |
| 매주 | upstream default/release branch diff, open security issue |
| 매월 | license/maintainer/release health, patch budget |
| 분기 | 최신 supported release upgrade rehearsal, rollback |
| major release | source map 재생성, 전체 parity/fault/security suite |

### 13.2 upgrade gate

- old/new upstream baseline 모두 재현
- API/schema/config diff 분류
- vendored/fork patch replay 성공
- Vault permission/audit/tenant negative suite green
- data/object migration roundtrip 또는 forward recovery
- canary와 rollback 수치 정의
- SBOM/NOTICE/source offer 갱신

### 13.3 exit gate

- upstream 전용 identifier를 product identifier로 역매핑 가능
- DB/object/config export 가능
- 대체 adapter가 shadow parity를 통과
- historical audit와 document hash가 유지
- source/NOTICE 제공 의무가 종료 후에도 충족
- fork/mirror archive와 마지막 supported version이 보존

## 14. 기계가독 산출물

### 14.1 `security/oss-source-map.yml`

```yaml
schema_version: 1
product_source_sha: <full-sha>
components:
  - id: paperless-ngx
    upstream_repo: https://github.com/paperless-ngx/paperless-ngx
    upstream_commit: <full-sha>
    upstream_tree: <tree-sha>
    release_tag: <tag-or-null>
    license_spdx: GPL-3.0-only
    license_sha256: <hex>
    source_paths:
      - <path>
    upstream_tests:
      - <path>#<test-name>
    adoption_mode: L4
    vault_packs:
      - PROPOSED-OSS-04
    vault_targets:
      - <path-or-contract>
    copied_source: false
    reused_behaviors:
      - <behavior>
    security_deviations:
      - <vault-hardening>
    update_owner: <role>
    refresh_cadence: monthly
    exit_plan: <reference>
```

### 14.2 `security/oss-adoption-decisions.yml`

각 후보의 score, L0~L4 결정, 승인자, review date, SaaS/on-prem 판정을 기록한다.

### 14.3 `third_party/NOTICE.md`

제품에 실제 포함·배포하는 code, binary, image, fixture만 기록한다. 단순 조사 clone은 source map에 남기되 제품 NOTICE에 포함할지는 Legal 판정에 따른다.

### 14.4 patch directory

```text
third_party/
  patches/
    <component>/
      README.md
      0001-<bounded-change>.patch
      series
```

README에는 base SHA, apply/test command, upstream issue/PR, owner, expiry/exit을 둔다.

## 15. AMIC Vault upstream source harvest 기준선

아래 SHA는 2026-07-21 조사 기준이다. 실행 직전 OSS-00A에서 다시 fetch하고 license hash와 release 상태를 확정한다.

| upstream | 조사 SHA | 우선 조사 source/test | Vault 활용 | 기본 모드 |
|---|---|---|---|---|
| Paperless-ngx | `80210bd3bf545bc68824e7f8960528df3cd326be` | `src/documents/consumer.py`, `sanity_checker.py`, `tests/test_consumer.py`, `tests/test_sanity_check.py` | parser registry, original/archive, checksum, orphan·integrity tests | L4; 허용 fixture만 제한 L2 |
| Mayan EDMS | `e9a42b3fba8db186eefb65a128484713648ee9ae` | `mayan/apps/file_metadata_clamav/drivers.py`, source/workflow/document-version tests | scan result/error, source→version workflow, remediation | L4 |
| Alfresco Community | `ab79d6f77fbb7d8a50629d4a3236c70dbba7071f` | records destruction/hold/version actions and tests | disposal inventory, capability, tombstone/metadata 보존 | L4; LGPL 직접 사용은 별도 승인 |
| Docspell | `47f378d8ac53ddfa2515e1044058c296ff04c1fd` | `FileIntegrityCheckTask.scala`, process/housekeeping/job tests | checksum 상태, idempotent job, cancellation | L4 |
| Teedy | `17cf68f95a12792031266988f03f9cd861e4aa7a` | `AuditLogDao.java`, `FileSizeService.java`, deletion listener, workflow tests | audit completeness, quota, async deletion failure 비교 | L4 negative reference |
| tusd | `ad7fb31344e0629cb8a5af67bb1e630f90507890` | `pkg/hooks/**`, handler hook tests, S3 store tests | pre-create/post-finish schema, retry/idempotency | L1; hook fixture L2 가능 |
| Gotenberg | `0c8d681c354cefa9c4833edffc16a69ba98d98ba` | `pkg/modules/api/**`, LibreOffice/PDF engine tests, `.bruno` | conversion API contract와 timeout/error parity | L1 |
| ClamAV | `a93732350bb6be75821f67c6d4423fcf723232de` | clamd protocol/client/config/tests | INSTREAM, result taxonomy, signature freshness | L1 |

### 15.1 PACK 연결

| PACK | 필수 upstream input | 최소 재사용 결과 |
|---|---|---|
| OSS-03 | Alfresco + Docspell + Teedy negative case | disposal/hold/integrity fault scenarios |
| OSS-04 | ClamAV + Mayan + Paperless | scan error taxonomy, quarantine tests, checksum promotion |
| OSS-05 | Paperless + Mayan + Gotenberg/Tika/OCRmyPDF | parser registry, archive sanity, converter conformance |
| OSS-06 | tusd + Paperless orphan patterns | hook schema, duplicate finish, abandoned object tests |
| OSS-07 | openid-client/Keycloak exact source | issuer/nonce/PKCE/broker negative conformance |
| OSS-08 | Presidio + Gotenberg + Teedy metadata patterns | recognizer evaluation, derivative integrity |
| OSS-09 | OTel Collector + Docspell/Teedy | queue/job/audit observability and sensitive-data tests |
| OSS-10 | OpenTofu + CloudNativePG/pgBackRest/OpenBao | official examples/tests adapted to restore/DR gate |
| OSS-11 | OpenSearch + selected co-editor | permission parity, callback/lock/version conformance |

## 16. PR 및 PACK 계약

OSS가 관련된 모든 PR/PACK은 다음 질문에 답한다.

1. 어떤 upstream 저장소와 SHA를 clone했는가?
2. upstream 원본 build/test 결과는 무엇인가?
3. 어떤 source/test/fixture를 조사했는가?
4. L0~L4 중 어떤 모드를 왜 선택했는가?
5. 새로 만든 파일마다 L0~L3가 부적합한 이유가 있는가?
6. 가져온 코드·fixture의 license/provenance는 무엇인가?
7. Vault 계약이 upstream보다 강화된 부분은 무엇인가?
8. upgrade와 rollback을 누가 수행하는가?
9. upstream이 사라지면 어떻게 철수하는가?
10. source/local/CI/staging/external/release 상태는 각각 무엇인가?

### 16.1 필수 evidence

```text
artifacts/enterprise-dms-oss/<product-sha>/<pack>/
  upstream-lock.json
  upstream-baseline.json
  source-map-report.json
  adoption-decision.json
  upstream-test-reuse.json
  provenance-validation.json
  product-parity-results.json
  rollback-or-exit-drill.json
```

### 16.2 신규 코드 생성 gate

새 제품 파일에는 다음 중 하나가 있어야 한다.

- `implements_upstream_contract`: upstream 공식 contract를 adapter로 구현
- `ports_approved_source`: 승인된 source를 provenance와 함께 port
- `implements_behavioral_spec`: L4 behavior/test를 독립 구현
- `vault_specific_authority`: OSS로 이전하면 안 되는 제품 고유 authority
- `no_upstream_candidate`: 조사 결과 적합한 후보 없음

설명 없는 `create_from_scratch`는 허용하지 않는다.

## 17. 성공 지표

LOC 재사용률 하나로 평가하지 않는다.

| 지표 | 의미 | 바람직한 방향 |
|---|---|---|
| Avoided implementation estimate | upstream으로 생략한 설계·구현·테스트 | 증가 |
| Upstream scenarios reused | 이식한 test/failure scenario 수 | 증가 |
| Product delta LOC | adapter/vendor/fork의 제품 고유 변경 | 감소 |
| Patch carry | release마다 유지하는 local patch | 감소 |
| Upgrade lag | supported upstream 대비 지연 | 감소 |
| CVE remediation latency | advisory→patched artifact | 감소 |
| Authority violations | permission/audit/tenant 우회 | 항상 0 |
| Rollback success | 이전 pin 또는 대체재 복귀 | 100% |
| Provenance coverage | included code/fixture의 source 추적 | 100% |
| Code deletion | OSS 채택으로 제거한 중복 제품 코드 | 증가 |

## 18. 공통 중단 조건

- upstream URL, full SHA, license hash를 확정할 수 없음
- upstream 원본 build/test 실패 원인을 분류할 수 없음
- 제품 고유 PermissionService, audit, RLS, legal hold를 우회해야 함
- copied source 또는 fixture의 provenance가 끊김
- sidecar/API 분리를 라이선스 면책으로 주장해야만 채택 가능
- fork owner, security SLA, merge cadence, exit plan이 없음
- upstream ID/ACL/audit를 제품 authority로 신뢰해야 함
- customer data 또는 secret 없이는 upstream test를 재현할 수 없음
- rollback/export 없이 upstream 전용 schema에 데이터를 잠가야 함
- 동일 실패를 3회 반복하거나 test를 skip해야만 green이 됨

## 19. 실행 착수 체크리스트

- [ ] exact product SHA/tree와 clean baseline 확정
- [ ] 제품 authority map 승인
- [ ] OSS source lab 경로와 접근·보존 정책 승인
- [ ] upstream URL/tag/SHA/tree/license hash 고정
- [ ] upstream 원본 build/test receipt 생성
- [ ] source/test/fixture path를 exact blob URL로 기록
- [ ] L0~L4 adoption decision과 TCO 점수 승인
- [ ] SaaS/on-prem 라이선스 profile 판정
- [ ] source map, NOTICE, patch owner 준비
- [ ] upstream test harvesting과 Vault negative test 매핑
- [ ] 신규 파일별 reuse-first 근거 작성
- [ ] upgrade/rollback/exit owner와 cadence 승인
- [ ] source/local/CI/staging/external/release/go-live 상태 분리

## 20. 공식 근거

- Open Source Definition: <https://opensource.org/osd>
- GNU Affero GPL: <https://www.gnu.org/licenses/agpl.html>
- GNU license FAQ: <https://www.gnu.org/licenses/gpl-faq.en.html>
- Apache License 2.0 적용·NOTICE 안내: <https://www.apache.org/legal/apply-license>
- Mozilla Public License 2.0 FAQ: <https://www.mozilla.org/en-US/MPL/2.0/FAQ/>
- AMIC Vault source-first upstream seed와 component 공식 저장소: [연결 계획 §14](./enterprise-dms-oss-uplift-plan-main-2026-07-21.md)

---

이 방법론의 성공은 많은 upstream 코드를 제품 저장소에 복사하는 것이 아니다. **모든 유력 source를 실제로 조사하고, upstream이 이미 유지보수하는 구현은 그대로 소비하며, 불가피한 제품 고유 코드만 최소한으로 소유하는 상태**가 성공이다.
