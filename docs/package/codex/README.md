# README — AMIC Vault 실행 패키지 (codex_dev_package)

버전: 1.0 | 작성일: 2026-06-11 | 상태: 인수인계 문서 (규범 문서는 `00_Master_Brief.md`)

---

## 1. 이 패키지는 무엇인가

본 패키지는 **Codex 개발팀(코딩 에이전트)이 AMIC Vault를 구현하는 데 필요한 실행 서류 일체**다.

- 구현 주체는 Codex이며, 모든 작업 단위(TUW)는 **대화 컨텍스트 없이 이 패키지만 읽고 실행**할 수 있도록 자기완결적으로 기술되어 있다.
- 본 패키지는 원천 사양(`../vault_dev_package/` 21개 문서 + `../Law_Firm_Vault_System_장기개발_사양명세서.docx`)의 **검증·보정·실행 변환본**이다. 적대적 검증을 거친 보정사항 10건(C-1~C-10)은 Brief §3에 근거와 함께 기록되어 있다.
- 코드 저장소는 **신규 생성**한다(저장소명 `amic-vault`). 이 폴더(`AMIC Vault/`)는 사양 보관소이며 **코드를 두지 않는다**.

### 규범 위계 (충돌 시 우선순위)

1. `00_Master_Brief.md` — **Normative(규범)**. 패키지 내 모든 문서와 충돌 시 Brief가 우선한다.
2. 본 패키지의 나머지 문서(01~90, data/) — Brief를 1:1 확장한 상세 명세.
3. `../vault_dev_package/docs/` (00~20번) — **참조용 원천 사양**. 본 패키지와 충돌하면 본 패키지가 우선한다.

Brief **§1 확정 결정(DEC-01~18)** 은 더 이상 논의 대상이 아니며, **§2 불변 원칙 7개와 절대 금지 목록**은 모든 문서·모든 TUW에서 일관되게 집행된다. 어떤 산출물도 이와 충돌할 수 없다.

---

## 2. 문서 맵 (Brief §10 기준)

| 파일 | 내용 | 독자 |
|---|---|---|
| `README.md` | (본 문서) 사용 순서·인수인계 | PM·Codex |
| `00_Master_Brief.md` | **Normative.** 확정 결정·불변 원칙·보정사항·TUW 인벤토리·규약 | 전체 |
| `01_Adopted_Decisions_ADR.md` | ADR-001~012 확정 전문 (DEC-01~18의 ADR 형식 변환) | 전체 |
| `10_Architecture_Tech_Stack.md` | 스택·컴포넌트·배포 상세 | Codex |
| `11_Repository_Structure.md` | repo 구조·명명·모듈 경계 상세 | Codex |
| `20_Data_Model_v1_1.md` | 보정 스키마 DDL 수준 (원천 07번의 v1.1 보강판) | Codex |
| `21_Permission_Model.md` | 권한 평가 계약·role 매트릭스 | Codex·보안 |
| `30_Release_Roadmap.md` | R0~R14 보정판·Gate 체크포인트 | PM |
| `31_AI_Readiness_Checklist.md` | R6(AI Knowledge Layer) 진입 체크리스트 | PM·AI |
| `40_TUW_Backlog_R0.md` ~ `43_TUW_Backlog_R3.md` | R0~R3 TUW 전체 상세 명세 (Brief §7 표의 1:1 확장) | Codex |
| `44_Outline_R4_R6.md` | R4~R6 개요·선행조건 (상세화는 R3 Gate 후) | PM |
| `50_Verification_Security_Gates.md` | 검증 의미론(AND)·Gate 체크리스트·회귀맵 | Codex·QA |
| `60_Execution_Packs.md` | PACK 순서·Codex 투입 프롬프트 | Codex |
| `70_Risk_Register.md` | 리스크·대응 | PM |
| `80_Open_Items.md` | 잔여 미결·확장 후보 | PO |
| `85_Human_Operations_Playbook.md` | **사람이 할 일 전체 목록** — 착수 전 결정, PACK 리뷰, Gate 승인, 변호사 입력, 시간 예산 | PO·검토 변호사 |
| `90_AGENTS_TEMPLATE.md` | 신규 repo에 `AGENTS.md`로 복사할 Codex 운영 규칙 | Codex |
| `data/backlog_r0_r3.csv` · `data/backlog_r0_r3.json` | 기계가독 백로그 — **생성 완료** (174 TUW, DAG 무순환 검증). 검증 스크립트(`tools/backlog/validate.mjs`) 입력 | 도구 |

---

## 3. 사용 순서

### 3.1 PM (사람 — 계획·게이트 관리)

```
README.md → 00_Master_Brief.md → 30_Release_Roadmap.md → 60_Execution_Packs.md
```

1. **README.md** — 패키지 구조와 운영 모델 파악.
2. **00_Master_Brief.md** — 확정 결정(§1)·불변 원칙(§2)·보정사항(§3)·실행 모델(§9) 숙지.
3. **30_Release_Roadmap.md** — release 순서와 Gate 기준 확인. Gate는 release 단위 체크리스트(50번)이며 **통과 전 다음 release PACK 착수 금지**.
4. **60_Execution_Packs.md** — PACK 순서대로 Codex에 투입. Risk=C 포함 PACK의 PR은 사람 리뷰 필수.

### 3.2 Codex (코딩 에이전트 — 구현)

```
AGENTS.md(repo) → 00_Master_Brief.md → 60번의 배정 PACK → 해당 TUW 상세 문서(40~43번)
```

1. **`amic-vault` repo의 `AGENTS.md`** — 운영 규칙(브랜치·검증·중단 조건). 90번 템플릿의 복사본이다.
2. **00_Master_Brief.md** — 특히 §2 불변 원칙·절대 금지, §4 저장소 구조, §6 TUW 표준.
3. **60_Execution_Packs.md** — 배정된 PACK의 프롬프트·TUW 목록·순서.
4. **40~43번 중 해당 release 문서** — 배정 PACK에 포함된 각 TUW의 상세 명세(Files / Verification / Edge cases / Stop condition).

Codex는 명세에 없는 판단을 임의로 내리지 않는다. 불명확하면 Brief §6.4 Stop condition에 따라 **중단 후 escalation 기록**(`docs/ledger/execution.md`)한다.

---

## 4. 첫 착수 절차

0. **선행 결정 2건 — 확정 완료(2026-06-11, `80_Open_Items.md` §1):** **OPEN-05** = GitHub private repo + 로컬 작업, 승인 강제(branch protection) 미적용(1인 개발) — 대체 통제는 `85_Human_Operations_Playbook.md` §2-A 셀프 리뷰 체크리스트. **OPEN-06** = **Codex 데스크톱 앱(로컬 Mac)** — 사전 설치: Docker Desktop, Node 20 LTS+pnpm, Python 3.12, git.
1. **신규 repo `amic-vault` 생성.** 구조는 Brief §4(상세는 11번 문서)를 따른다. 이 사양 폴더에 코드를 두지 않는다.
2. **`90_AGENTS_TEMPLATE.md`를 repo 루트에 `AGENTS.md`로 복사**한다. Codex는 매 작업 시작 시 이 파일을 먼저 읽는다.
3. **60번 문서의 `PACK-R0-01`부터 순서대로 착수**한다. 시작점은 `CORE-REPOBUIL-CICD-TUW-001`(monorepo skeleton)이다.
4. R0 진행 중 `DEVOPS-DOCSPKG-TRANSFER-TUW-001~002`로 **원천 사양(`vault_dev_package/` 21개 md)을 repo `docs/package/`에, 본 패키지(`codex_dev_package/` 전체 — `data/`의 기계가독 백로그 포함)를 `docs/package/codex/`에 이관**(normative 선언 포함)하고, **본 패키지의 ADR-001~012를 `docs/adr/`에 등재**한다. 백로그 검증 명령(`node tools/backlog/validate.mjs docs/package/codex/data/backlog_r0_r3.csv`)은 이 이관본을 입력으로 한다.
5. PACK마다: 브랜치 생성 → TUW 순서대로 구현 → 아래 표준 검증 명령 전체 green → PR. 완료 시 `docs/ledger/execution.md`에 1줄 기록(PACK ID, 결과, 특이사항).
6. **R0 Gate**(신규 클론 재현 / cross-tenant 차단 / audit UPDATE·DELETE DB 실패 / fail-closed 증명 / ADR 승인) 통과 후에만 R1 PACK 착수.

### 표준 검증 명령 세트 (전 문서 공통)

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

---

## 5. 원천 사양과의 관계

- `../vault_dev_package/`(21개 문서)와 DOCX 원본은 **참조용이며 불변 보존**한다. 어떤 경우에도 수정하지 않는다.
- 본 패키지는 원천의 적대적 검증 결과를 반영한 **보정·실행 변환본**이다. 원천과 본 패키지가 다르게 읽히는 지점은 오류가 아니라 **의도된 보정**일 수 있다 — Brief §3(C-1~C-10)에서 근거를 먼저 확인하라.
- 대표 보정 예: EthicalWall schema의 R1 이동(C-2), legal hold 인터페이스의 R2 신설(C-3), semantic search의 R6 이동(C-5), TUW verification의 AND 의미론(C-8), 원천 14번 샘플 Work ID의 canonical ID 대체(C-10).
- 원천에만 있고 본 패키지에 없는 내용은 **구현 근거가 되지 못한다.** 필요하다고 판단되면 구현하지 말고 escalation한다.

---

## 6. 변경 관리 규칙

1. **`00_Master_Brief.md` 개정은 사람(Human Owner) 승인 필수.** Codex는 Brief를 직접 수정할 수 없으며, 개정 필요를 발견하면 escalation 기록으로 제안만 한다.
2. **DEC-01~18과 ADR-001~012는 확정 사항**이다. 변경은 해당 ADR의 "재검토 트리거" 충족 + 사람 승인 + Decision Ledger(`docs/ledger/decision.md`) 등재를 통해서만 가능하다. 승인 전까지 기존 결정이 유효하다.
3. 패키지 내 하위 문서(10~90번)와 Brief가 충돌하면 **Brief가 우선**하며, 하위 문서 수정은 사람 승인 후 진행한다.
4. **Permission Model Freeze(R1 Gate 산출물) 이후** role matrix·canRead* 시그니처·wall schema·filter 주입 지점의 변경은 동결 해제 절차(사람 승인 + 권한 매트릭스 하네스 전체 재실행) 없이는 금지된다.
5. 원천 사양(`vault_dev_package/`, DOCX)은 어떤 변경 관리 절차로도 수정 대상이 아니다.

---

## 7. 위반 시 즉시 중단 (요약 — 전문은 Brief §2)

불변 원칙 7개: Permission-before-search / Permission-before-AI / Audit-by-default / Fail-closed / Immutable original / No silent external sharing / Sensitive data is not logged.

절대 금지(발견 즉시 작업 중단): R6 전 AI 기능 구현, R11 전 외부 공유 일체, R12 전 hard delete, R6 전 벡터·의미검색, R7 전 Neo4j, PermissionService 우회 endpoint, `audit_events` UPDATE/DELETE 가능 경로, 사양에 없는 외부 API/모델 호출.
