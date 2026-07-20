# LCX 지식저장소 UI 작업분해 계획

작성일: 2026-07-02
상태: 구현 작업분해 계획
상위 계획:

- `docs/lazycodex/lcx-kr-saas-ui-implementation-plan-2026-07-02.md`
- `docs/lazycodex/lcx-kr-saas-ui-traceability-2026-07-02.md`

## 목표

기존 AMIC Vault UI 디자인 시스템과 컴포넌트 패턴을 유지하면서, 현재 구현 가능한 모든 Vault 화면을 `Matter` 중심 법률 지식저장소 UI로 완성한다.

완료 상태는 다음을 모두 만족해야 한다.

1. `LCX-KSUI-000~050` 전체가 구현 가능, 요청 가능, 승인 필요, 연결 필요, 사용 불가, 숨김 중 하나로 정리된다.
2. 고객 화면에는 자연스러운 한국 SaaS 표현만 사용한다.
3. `Matter`와 `Matter code`는 고유명사로 유지한다.
4. 내부 개발자용 표현과 가짜 동작을 고객 화면에서 제거한다.
5. 문서 프로필, 검색 폴더, Matter 지식 현황, 보존 조치, 접근 상태, 감사 로그, 연동 상태가 실제 데이터 또는 안전한 게이트 상태로 표시된다.
6. `/matters -> /files -> /documents/[id] -> /search/folders -> /audit 또는 /records` 흐름이 수동 QA로 확인된다.

## 범위

주요 구현 범위:

- `apps/web/src/app`
- `apps/web/src/components`
- `apps/web/src/lib`
- 같은 영역의 웹 화면 및 컴포넌트 테스트

계획 및 증빙 범위:

- `docs/lazycodex`
- `docs/ui`
- 출시 증빙이 필요한 경우에 한해 `docs/release`

수정 금지:

- `docs/package`
- 승인된 기준 패키지 문서
- 선택한 작업 단위 밖의 관련 없는 변경 파일

## 기존 디자인 시스템 유지 원칙

구현은 현재 UI 시스템을 유지해야 한다. 제품 셸을 새로 디자인하지 않는다.

다음 기존 패턴을 우선 재사용한다.

- `PageShell`, `PageHeader`, `SectionCard`, `DataTable`, `FilterBar`, `DetailInspector`, `StatusBadge`, `EmptyState`
- 기존 표 밀도, 입력 영역 간격, 상태 배지 톤, 접근 제한 화면, AppShell 내비게이션 동작
- 기존 문서, 검색, 감사, 기록, Matter, 연동, 관리자 컴포넌트 묶음

허용되는 UI 변경:

- 빠진 패널, 탭, 행, 필터, 이동 링크, 빈 상태, 상태 라벨 추가
- Matter 중심 지식 흐름을 분명히 하기 위한 기존 화면 구조 안의 정보 재배치
- 둘 이상의 화면에서 같은 동작이 필요할 때만 작은 공통 헬퍼 추가
- 새로 보이는 상태와 제한된 동작에 대한 테스트 추가

허용하지 않는 변경:

- 현재 디자인 시스템 교체
- 제품 화면을 마케팅 페이지처럼 바꾸는 작업
- 법률 업무와 무관한 장식 중심 시각 요소 추가
- 승인되지 않은 AI 법률 분석, 요약, 의미 검색, 외부 공유, VDR, Office 실시간 편집, 연결 완료 상태 노출
- 내부 식별자나 설정값을 일반 고객 화면 라벨처럼 표시

## 고객 화면 문구 기준

고객 화면에는 상황에 맞게 다음 표현을 사용한다.

- `Matter`
- `Matter code`
- `고객`
- `문서함`
- `문서 프로필`
- `문서 분류`
- `관련 Matter`
- `관련 문서`
- `관련 이메일`
- `검색 폴더`
- `검색 조건`
- `접근 상태`
- `보존 조치`
- `정보 차단`
- `감사 로그`
- `연동 상태`
- `운영 조건`
- `연결 필요`
- `승인 필요`
- `파일 정리 상태`
- `근거 자료 준비 상태`

다음 표현은 일반 고객 화면에 노출하지 않는다.

- API
- endpoint
- metadata
- source-of-truth
- projection
- UUID
- token
- cookie
- raw
- queue
- tenant
- workspace
- document ID
- matter ID
- version ID
- prompt
- model response

## 구현 묶음

작업은 아래 묶음 단위로 나누어 진행한다. 한 PR에서 모든 단위를 한꺼번에 처리하지 않는다.

| 묶음 | 목적 | 연계 LCX 단위 |
| --- | --- | --- |
| B0 보호장치 | 디자인 시스템, 화면 목록, 문구 기준, 숨김 화면 동작을 고정한다. | LCX-KSUI-000, 038, 039, 040, 041, 050 |
| B1 Matter 축 | 홈, Matter 목록, Matter 상세, Matter 팀에서 Matter를 지식저장소의 중심축으로 보이게 한다. | LCX-KSUI-001, 004, 005, 006, 007, 025, 043 |
| B2 문서 프로필 | 문서 화면을 단순 파일 조작이 아니라 지식 프로필 화면으로 보완한다. | LCX-KSUI-008, 009, 010, 011, 012, 013, 014, 015, 044, 045 |
| B3 검색 폴더 | 검색을 권한 범위 안에서 재사용 가능한 Matter 중심 조회 화면으로 만든다. | LCX-KSUI-016, 017, 018, 019, 046 |
| B4 업무 맥락의 관리 정보 | 접근, 보존, 기록, 정보 차단, 감사 정보를 사용자가 일하는 화면 안에 배치한다. | LCX-KSUI-020, 021, 022, 023, 024, 047 |
| B5 수집 채널 | Matter app과 Outlook을 별도 공간이 아니라 지식저장소로 들어오는 수집 경로로 정리한다. | LCX-KSUI-026, 027, 028, 029, 030, 048 |
| B6 운영 관리 | 관리자 설정을 지식 운영, 보안 운영, 분류 관리 관점으로 정리한다. | LCX-KSUI-031, 032, 033, 034, 049 |
| B7 계정 및 출시 점검 | 로그인/재설정, 수동 QA, 출시 점검, 가짜 동작 제거를 확인한다. | LCX-KSUI-037, 041 |

## 세부 작업 단위

### LCX-KVUI-001 디자인 시스템 고정

연계 단위: LCX-KSUI-000, 039, 040

대상 파일:

- `apps/web/src/components/ui/*`
- `apps/web/src/app/(app)/app-shell.tsx`
- `apps/web/src/lib/navigation.ts`
- `apps/web/src/lib/features.ts`

작업:

- 현재 사용 중인 레이아웃과 UI 기본 요소를 목록화한다.
- 신규 작업이 기존 페이지 셸, 표, 필터, 배지, 카드, 빈 상태, 접근 제한 컴포넌트를 사용하는지 확인한다.
- 구현 PR 템플릿이나 UI 체크리스트에 디자인 시스템 유지 항목이 없다면 짧게 추가한다.
- 내비게이션 라벨은 업무 표현을 사용하고 `Matter`는 그대로 유지한다.

완료 기준:

- 별도의 경쟁 디자인 시스템 레이어가 생기지 않는다.
- 기존 기본 요소로 표현 가능한 상태에 일회성 스타일을 추가하지 않는다.
- 역할과 사용 가능 상태를 불러오는 동안 내비게이션은 안전하게 제한된다.

검증 방법:

- `pnpm check:production-ui-literals`
- `pnpm --filter @amic-vault/web test -- app-shell`
- `pnpm --filter @amic-vault/web test -- navigation`

### LCX-KVUI-002 운영 문구 가드

연계 단위: LCX-KSUI-040

대상 파일:

- 운영 문구 점검 스크립트와 테스트
- `apps/web/src/app`, `apps/web/src/components`의 한국어 문구

작업:

- 기존 문구 가드가 일반 고객 화면의 내부 용어를 거부하도록 확장한다.
- 의도적으로 제한된 내부 참조를 보여야 하는 관리자/보안 상세 화면에만 예외를 둔다.
- 지식저장소 레이어 필수 표현으로 `문서 프로필`, `검색 폴더`, `접근 상태`, `보존 조치`, `감사 로그`를 추가한다.

완료 기준:

- 일반 화면 출력에 내부 용어가 보이지 않는다.
- 오류 출력에는 문제가 된 표시 문구와 파일이 함께 나온다.

검증 방법:

- `pnpm check:production-ui-literals`

### LCX-KVUI-003 숨김 화면과 미래 기능 게이트

연계 단위: LCX-KSUI-038, 050

대상 파일:

- `apps/web/src/app/(app)/dd/page.tsx`
- `apps/web/src/app/(app)/litigation/page.tsx`
- `apps/web/src/app/(app)/contracts/page.tsx`
- `apps/web/src/app/(app)/launch/page.tsx`
- `apps/web/src/app/(app)/scale/page.tsx`
- `apps/web/src/app/showcase/page.tsx`
- `apps/web/src/app/(app)/hidden-routes.test.tsx`

작업:

- DD, 소송, 계약 인텔리전스, 출시, 확장, 쇼케이스 화면은 승인된 출시 경계가 열릴 때까지 숨기거나 제한한다.
- 제한 상태를 표시해야 한다면 `사용할 수 없는 화면`, `승인 필요`, `운영 조건 미충족`을 사용한다.
- 승인 전에는 내비게이션에 실제 이동 링크를 추가하지 않는다.

완료 기준:

- 직접 접근 시 안전한 제한 화면 또는 찾을 수 없음 상태가 표시된다.
- 숨김 화면이 실제 지식저장소 기능처럼 보이지 않는다.

검증 방법:

- 숨김 화면 스모크 테스트
- 출시 경계 문구 점검

### LCX-KVUI-004 Matter 목록 지식 축

연계 단위: LCX-KSUI-004, 007, 043

대상 파일:

- `apps/web/src/app/(app)/matters/page.tsx`
- `apps/web/src/components/matter/matter-list-table.tsx`
- `apps/web/src/components/matter/matter-code-picker.tsx`
- `apps/web/src/lib/matter-app.ts`

작업:

- Matter 목록에 `Matter`, `Matter code`, 고객, 상태, 담당 팀, 접근 상태, 문서/검색 주요 동작을 표시한다.
- Matter app 데이터가 준비되지 않았으면 연결 필요 또는 최신 상태 아님을 표시한다.
- 일반 Matter code 선택 흐름에서 UUID처럼 보이는 입력을 거부한다.
- 지원되는 경우 Matter 문서 목록, Matter 검색, Matter 활동으로 바로 이동하는 링크를 추가한다.

완료 기준:

- Matter 목록은 단순 등록 목록이 아니라 지식저장소 진입점으로 작동한다.
- Matter 기준 정보가 준비되고 권한 범위가 확인되기 전에는 업로드/검색 바로가기 동작이 비활성화된다.

검증 방법:

- Matter 화면 테스트
- Matter code 선택 테스트
- 렌더링 결과에서 `Matter`와 `Matter code` 표시 확인

### LCX-KVUI-005 Matter 상세 지식 현황

연계 단위: LCX-KSUI-005, 025, 043

대상 파일:

- `apps/web/src/app/(app)/matters/[matterId]/page.tsx`
- `apps/web/src/components/matter/matter-email-timeline.tsx`
- `apps/web/src/components/matter/matter-audit-timeline.tsx`
- `apps/web/src/components/document/matter-file-section.tsx`
- `apps/web/src/components/governance/governance-context-panel.tsx`

작업:

- 기존 패널을 사용해 Matter 지식 현황을 추가한다.
- 지원되는 경우 관련 문서, 관련 이메일, 최근 활동, 접근 상태, 보존 상태, 파일 정리 준비 상태, 감사/기록 링크를 표시한다.
- 빈 상태와 사용 불가 상태를 분리한다.
- 모든 건수는 권한 범위 안에서만 표시한다.

완료 기준:

- 사용자는 한 화면에서 Matter의 지식 상태를 파악할 수 있다.
- 접근 거부 또는 최신 상태 아님일 때 이전 행과 건수가 남지 않는다.

검증 방법:

- Matter 상세 컴포넌트 테스트
- 관리 정보 패널 테스트
- 수동 경로 점검: Matter -> 문서 -> 감사/기록

### LCX-KVUI-006 Matter 팀 접근 관리

연계 단위: LCX-KSUI-006

대상 파일:

- `apps/web/src/app/(app)/matters/[matterId]/team/page.tsx`
- `apps/web/src/components/matter/team-member-list.tsx`
- `apps/web/src/components/matter/add-member-dialog.tsx`
- `apps/web/src/components/access/org-subject-picker.tsx`

작업:

- `Matter 팀`, `구성원`, `역할`, `추가`, `해제`를 사용한다.
- 내부 참조값 직접 입력은 일반 사용자에게 숨긴다.
- 가능한 경우 승인된 조직 선택기를 사용한다.
- 접근 변경의 영향을 업무 표현으로 보여준다.

완료 기준:

- 일반 사용자는 내부 식별자를 보지 않는다.
- 팀 변경은 접근 관리 작업으로 분명하게 보인다.

검증 방법:

- 팀 구성원 테스트
- 내부 참조값 가드 테스트

### LCX-KVUI-007 문서함 화면의 원본 보관 역할

연계 단위: LCX-KSUI-008, 009, 045

대상 파일:

- `apps/web/src/app/(app)/files/page.tsx`
- `apps/web/src/components/document/document-vault-list.tsx`
- `apps/web/src/components/document/matter-document-list.tsx`
- `apps/web/src/components/document/matter-file-section.tsx`

작업:

- `/files`를 원본 문서함 진입점으로 유지한다.
- 지원되는 경우 Matter code, 문서 유형, 상태, 버전 상태, 기밀도, 특권 상태, 추출/OCR, 보존 조건 필터를 추가하거나 확인한다.
- 가능한 경우 `검색 가능 상태`와 `파일 정리 상태`를 표시한다.
- 업로드와 목록 조회는 Matter code 기준 정보가 확인된 뒤 진행되도록 유지한다.

완료 기준:

- 사용자는 검색어를 추측하지 않아도 문서를 탐색할 수 있다.
- 목록은 권한 범위 안에서만 표시되며 자리표시자 문서를 보여주지 않는다.

검증 방법:

- 문서함 화면 테스트
- 문서 목록 테스트
- `/files` 운영 스모크 점검

### LCX-KVUI-008 Matter code 우선 업로드

연계 단위: LCX-KSUI-010, 045

대상 파일:

- `apps/web/src/components/document/document-upload-panel.tsx`
- `apps/web/src/components/document/upload-metadata-profile.tsx`
- `apps/web/src/components/document/duplicate-decision-dialog.tsx`
- `apps/web/src/components/matter/matter-code-picker.tsx`

작업:

- 업로드 전에 Matter code를 필수로 요구한다.
- 지원되는 정리 항목으로 `문서 분류`, `세부 유형`, `기밀도`, `특권 상태`, `보존 기간`을 표시한다.
- 중복 판단은 `중복 확인`, `새 문서`, `새 버전`으로 보여준다.
- 일부 실패와 차단 상태를 분명하게 표시한다.

완료 기준:

- Matter 기준 정보, 권한, 유효한 파일이 없으면 업로드가 시작되지 않는다.
- 지원되지 않는 항목은 숨기거나 사용 불가로 표시하며 가짜로 보여주지 않는다.

검증 방법:

- 업로드 패널 테스트
- 중복 확인 대화상자 테스트
- 접근 거부/미설정 경로 테스트

### LCX-KVUI-009 문서 지식 프로필

연계 단위: LCX-KSUI-011, 012, 013, 044

대상 파일:

- `apps/web/src/app/(app)/documents/[id]/page.tsx`
- `apps/web/src/components/document/document-action-center.tsx`
- `apps/web/src/components/document/document-audit-timeline.tsx`
- `apps/web/src/components/governance/governance-context-panel.tsx`
- `apps/web/src/components/ai/ai-prep-status-panel.tsx`

작업:

- 문서 상세 화면을 `문서 프로필` 관점으로 재구성한다.
- 현재 버전, 버전 이력, 미리보기/다운로드 상태, 관련 Matter, 관련 이메일, 관련 문서, 검색 가능 여부, 파일 정리 준비 상태, 보존 상태, 접근 상태, 활동 이력을 표시한다.
- 복원, 열기/저장, 공유, 삭제 동작은 실제 지원 범위에 맞게 제한한다.
- 접근 거부나 오류가 다시 발생하면 이전 행을 지운다.

완료 기준:

- 문서 상세는 미리보기/다운로드만 있는 화면이 아니다.
- 사용자는 문서가 검색 가능, 재사용 가능, 보존 중, 보관 완료, 차단됨, 준비 중 중 어디에 해당하는지 알 수 있다.

검증 방법:

- 문서 동작 영역 테스트
- 문서 감사 이력 테스트
- AI 준비 상태 테스트
- 문서 상세 수동 QA

### LCX-KVUI-010 문서 관계 정보

연계 단위: LCX-KSUI-011, 018, 042, 044

대상 파일:

- `apps/web/src/components/document/document-action-center.tsx`
- `apps/web/src/components/search/result-card.tsx`
- `apps/web/src/components/search/search-results.tsx`

작업:

- 실제로 연결된 관련 Matter, 관련 문서, 관련 이메일을 표시한다.
- 그래프 기반 관계가 아직 승인되지 않은 경우 `관계 정보 준비 중` 또는 `연결 필요`를 사용한다.
- 승인된 그래프 또는 AI 범위 전에는 의미 기반 관계처럼 보이는 문구를 표시하지 않는다.

완료 기준:

- 현재 확인 가능한 관계 정보가 바로 활용 가능하다.
- 향후 그래프 기반 관계가 실제 기능처럼 보이지 않는다.

검증 방법:

- 검색 결과 카드 테스트
- 문서 동작 영역 테스트
- 금지 AI/내부 용어 가드

### LCX-KVUI-011 권한 범위 검색

연계 단위: LCX-KSUI-016, 017, 018

대상 파일:

- `apps/web/src/app/(app)/search/page.tsx`
- `apps/web/src/app/(app)/search/search-client.tsx`
- `apps/web/src/components/search/search-bar.tsx`
- `apps/web/src/components/search/search-advanced-controls.tsx`
- `apps/web/src/components/search/search-results.tsx`
- `apps/web/src/components/search/result-card.tsx`

작업:

- 제목/본문/전체 검색 범위를 지원한다.
- 지원되는 경우 Matter code, 고객, 문서 유형, 기밀도, 특권 상태, 추출/OCR, 보존 조건, 버전, 날짜, 상태 필터를 유지한다.
- 검색 결과에는 Matter, 고객, 문서 유형, 버전 상태, 접근 상태, 문서 동작이 이어지는 맥락을 보여준다.
- 미리보기는 권한 확인 뒤 안전한 범위 안에서만 제공한다.

완료 기준:

- 접근할 수 없는 제목, 건수, 라벨, 미리보기가 새지 않는다.
- 검색 결과가 단순 파일 검색 결과가 아니라 재사용 가능한 법률 지식으로 읽힌다.

검증 방법:

- 검색창 테스트
- 고급 검색 조건 테스트
- 검색 결과 카드 테스트
- 검색 결과 목록 테스트

### LCX-KVUI-012 검색 폴더

연계 단위: LCX-KSUI-019, 046

대상 파일:

- `apps/web/src/app/(app)/search/folders/page.tsx`
- `apps/web/src/app/(app)/search/folders/search-folders-client.tsx`
- `apps/web/src/components/search/search-save-panel.tsx`
- `apps/web/src/lib/api/search.ts`

작업:

- 저장된 검색을 `검색 폴더`로 표시한다.
- 지원되는 경우 목록, 열기, 이름 변경, 삭제를 제공한다.
- 개인정보와 기밀 검색어가 드러나지 않는 재사용 링크를 추가한다.
- 저장된 검색 내부 참조값을 라벨처럼 표시하지 않는다.
- 지원되는 경우 검색 폴더 행에 Matter/문서 맥락을 표시한다.

완료 기준:

- 검색 폴더는 재사용 가능한 지식 조회 화면처럼 동작한다.
- 기밀 검색 모드에서는 재사용 URL에 검색어 원문이 노출되지 않는다.

검증 방법:

- 검색 폴더 테스트
- 검색 저장 패널 테스트
- 비공개 URL 모드 테스트
- 내부 참조값 노출 점검

### LCX-KVUI-013 업무 맥락 관리 패널

연계 단위: LCX-KSUI-020, 021, 024, 025, 047

대상 파일:

- `apps/web/src/components/governance/governance-context-panel.tsx`
- `apps/web/src/app/(app)/records/records-governance-client.tsx`
- `apps/web/src/app/(app)/walls/wall-admin-client.tsx`
- `apps/web/src/components/ethical-wall/wall-list.tsx`
- `apps/web/src/components/ethical-wall/wall-policy-inspector.tsx`

작업:

- `접근 상태`, `정보 차단`, `보존 조치`, `보관 처리`, `폐기 요청`, `감사 로그` 맥락 패널을 추가하거나 완성한다.
- 지원되는 경우 Matter, 문서, 검색 결과 화면에서 기록, 정보 차단, 감사 화면으로 연결한다.
- 변경 동작은 실행 가능, 요청 가능, 승인 필요, 사용 불가 중 하나로 분명하게 표시한다.

완료 기준:

- 관리 정보가 관리자 화면에만 있지 않고 사용자가 일하는 위치에 함께 보인다.
- 접근 거부나 오류 상태에서는 이전 내용이 남지 않는다.

검증 방법:

- 관리 정보 패널 테스트
- 기록 관리 테스트
- 정보 차단 관리 테스트

### LCX-KVUI-014 감사 콘솔과 감사 항목 상세

연계 단위: LCX-KSUI-022, 023

대상 파일:

- `apps/web/src/app/(app)/audit/audit-console-client.tsx`
- `apps/web/src/components/audit/audit-event-table.tsx`
- `apps/web/src/components/audit/audit-event-inspector.tsx`
- `apps/web/src/lib/api/audit.ts`

작업:

- 행위자, 작업, 결과, 대상, 시간을 안전한 한국어 라벨로 표시한다.
- 지원되는 경우 조건 검색과 사유가 포함된 내보내기 요청을 추가한다.
- 문서 본문, prompt, model response, token, cookie, 원본 요청/응답 내용은 노출하지 않는다.
- 접근 거부나 오류가 다시 발생하면 이전 행을 지운다.

완료 기준:

- 민감한 내용을 노출하지 않으면서 지식 활용 책임을 확인할 수 있다.

검증 방법:

- 감사 콘솔 테스트
- 감사 항목 표와 상세 패널 테스트
- 내보내기 본문 노출 점검

### LCX-KVUI-015 작업함과 알림

연계 단위: LCX-KSUI-001, 002, 003

대상 파일:

- `apps/web/src/app/(app)/dashboard/vault-activity-client.tsx`
- `apps/web/src/components/dashboard/dashboard-work-queue.tsx`
- `apps/web/src/components/dashboard/dashboard-notifications.tsx`
- `apps/web/src/app/(app)/work/work-queue-client.tsx`
- `apps/web/src/app/(app)/notifications/notifications-client.tsx`
- `apps/web/src/lib/api/dashboard.ts`
- `apps/web/src/lib/api/work-ops.ts`

작업:

- 추출/OCR 실패, 파일 정리 준비 완료, 연동 차단, 보존/보류 확인 필요, 필수 분류 누락처럼 조치 가능한 지식 상태 작업을 표시한다.
- 작업과 알림은 승인된 Matter, 문서, 검색, 기록 화면으로 연결한다.
- 저장되지 않은 작업이나 가짜 건수를 만들지 않는다.

완료 기준:

- 일상 운영 화면에서 지식저장소 상태를 바로 정리할 수 있다.
- 모든 동작 링크는 실제 화면 또는 안전하게 제한된 화면을 가리킨다.

검증 방법:

- 대시보드 테스트
- 작업함 테스트
- 알림 테스트
- 이동 링크 점검

### LCX-KVUI-016 Matter app 수집 채널

연계 단위: LCX-KSUI-026, 027, 048

대상 파일:

- `apps/web/src/app/(app)/integrations/page.tsx`
- `apps/web/src/app/(app)/integrations/matter-app/page.tsx`
- `apps/web/src/lib/matter-app.ts`
- `apps/web/src/components/matter/matter-code-picker.tsx`

작업:

- Matter app을 기준 정보와 문서 정리 수집 채널로 표시한다.
- `Matter 관리 시스템`, `Matter code 기준 정보`, `업로드 가능 여부`, `연동 상태`, `운영 조건`을 표시한다.
- 설정값과 내부 식별자는 숨긴다.
- 실행 상태가 최신이고 승인된 경우가 아니면 업로드 기준 정보라고 단정하지 않는다.

완료 기준:

- Matter app이 별도 공간처럼 보이지 않는다.
- 비개발 운영자도 Matter code 선택과 업로드 가능 여부를 이해할 수 있다.

검증 방법:

- Matter app 연동 테스트
- 선택기 테스트
- 연동 상태 스모크 점검

### LCX-KVUI-017 Outlook 보관 수집 채널

연계 단위: LCX-KSUI-028, 029, 048

대상 파일:

- `apps/web/src/app/(app)/integrations/outlook/page.tsx`
- `apps/web/src/app/(app)/integrations/outlook/outlook-integration-status-client.tsx`
- `apps/web/src/app/outlook-addin/outlook-addin-client.tsx`
- `apps/web/src/lib/api/outlook-addin.ts`

작업:

- Outlook 보관을 같은 Matter/문서/검색/감사 모델로 들어오는 또 다른 경로로 표시한다.
- 작업 창은 내부 관리자 콘솔과 분리한다.
- `Outlook 보관`, `전송 및 보관`, `첨부`, `선택됨`, `없음`을 사용한다.
- 안전하지 않은 첨부 내용이나 내부 식별자를 보여주지 않는다.

완료 기준:

- 이메일 보관과 브라우저 업로드가 하나의 Vault 업무 흐름처럼 이어진다.
- Office 작업 창이 일반 웹 내비게이션처럼 변하지 않는다.

검증 방법:

- Outlook 연동 테스트
- Outlook 추가 기능 테스트
- manifest 테스트

### LCX-KVUI-018 OneDrive와 Office 게이트

연계 단위: LCX-KSUI-030

대상 파일:

- `apps/web/src/app/(app)/integrations/page.tsx`
- OneDrive/Office 상태 카드 컴포넌트

작업:

- 실행 계약과 되돌림 증빙이 승인될 때까지 `연결 필요`, `승인 필요`, `운영 조건 미충족`만 표시한다.
- Office 열기/저장, 공동 편집, 실시간 편집, 잠금, 동기화, 연결 완료 상태를 단정하지 않는다.

완료 기준:

- 사용자가 향후 Office/OneDrive 경로를 현재 사용 가능한 기능으로 오해하지 않는다.

검증 방법:

- 연동 게이트 테스트
- 연결 완료 상태 단정 문구 점검

### LCX-KVUI-019 지식 운영 관리자

연계 단위: LCX-KSUI-031, 032, 033, 034, 049

대상 파일:

- `apps/web/src/app/(app)/admin/page.tsx`
- `apps/web/src/app/(app)/admin/security/page.tsx`
- `apps/web/src/app/(app)/enterprise/page.tsx`
- `apps/web/src/app/(app)/admin/account-ledger-admin-client.tsx`
- `apps/web/src/lib/search-refiners.ts`
- `apps/web/src/lib/dms-taxonomy.ts`

작업:

- 관리자 설정을 지식 운영과 보안 운영으로 묶어 보여준다.
- 지원되는 경우 문서 분류, Matter 템플릿, 검색 정제 조건, 기본 보존 조건, 검색 공개 범위, 색인/추출 상태, 계정 보안, 접근 제한, 로그 보관, 백업, 준수 상태를 표시한다.
- 편집 가능한 설정은 실제 저장/조회 경로가 확인된 항목만 허용하고, 그렇지 않으면 읽기 전용 또는 사용 불가로 표시한다.
- 구현 설정처럼 보이는 표현은 피한다.

완료 기준:

- 관리자 화면은 흩어진 패널 모음이 아니라 운영 목적별로 읽힌다.
- 관리자 전용 화면은 권한 확인 전 안전하게 제한된다.

검증 방법:

- 관리자 화면 테스트
- 보안 화면 테스트
- 엔터프라이즈 화면 테스트
- 분류/검색 정제 조건 테스트

### LCX-KVUI-020 AI 준비 상태 경계

연계 단위: LCX-KSUI-035, 042, 044

대상 파일:

- `apps/web/src/components/ai/ai-prep-status-panel.tsx`
- `apps/web/src/components/ai/ai-prep-status-loader.tsx`
- `apps/web/src/components/ai/ai-prep-matter-dashboard.tsx`
- `apps/web/src/lib/api/ai-prep.ts`

작업:

- `문서 정리 준비`, `파일 정리 상태`, `근거 자료 준비 상태`만 사용한다.
- 법률 분석, 요약, 의미 검색, prompt, model response, 외부 모델 사용 단정은 UI에서 제외한다.
- 최신 상태 아님, 거절됨, 차단됨, 대체 상태는 업무상 안전한 표현으로 표시한다.

완료 기준:

- AI 준비 상태는 실제 법률 AI 기능처럼 보이지 않으면서 지식저장소 준비 상태를 돕는다.

검증 방법:

- AI 준비 상태 컴포넌트 테스트
- AI 범위 가드
- 운영 문구 점검

### LCX-KVUI-021 로그인과 계정 진입

연계 단위: LCX-KSUI-037

대상 파일:

- `apps/web/src/app/(auth)/login/page.tsx`
- `apps/web/src/app/(auth)/login/login-form.tsx`
- `apps/web/src/app/(auth)/password-reset/confirm/page.tsx`
- `apps/web/src/app/(auth)/password-reset/confirm/password-reset-confirm-form.tsx`

작업:

- 로그인과 재설정 UI를 현재 디자인 시스템과 일관되게 유지한다.
- `로그인`, `계정 활성화`, `비밀번호`, `재설정 링크`를 사용한다.
- 오류 상태는 안전하고 명확하게 표시한다.

완료 기준:

- 로그인/계정 화면은 인증 정보, token, 혼란스러운 내부 라벨을 노출하지 않는다.

검증 방법:

- 로그인 폼 테스트
- 비밀번호 재설정 테스트

### LCX-KVUI-022 수동 QA 묶음

연계 단위: LCX-KSUI-041

대상 파일:

- `docs/lazycodex`
- 필요한 경우 출시 증빙 파일

작업:

- 수동 QA 경로 목록과 기대 표시 상태를 정의한다.
- 안전한 세션 또는 테스트 fixture를 사용한다.
- 경로, 상태, 표시된 한국어 라벨, 차단 사유를 기록한다.
- 비밀값, 문서 원문, prompt, model response, token, cookie는 기록하지 않는다.

필수 수동 점검 흐름:

1. `/matters`
2. Matter 상세
3. Matter 문서 목록
4. `/files`
5. 접근 가능한 문서의 상세 화면
6. `/search`
7. `/search/folders`
8. `/audit` 또는 `/records`
9. `/integrations`
10. 숨김 화면 직접 접근

완료 기준:

- 제품이 Matter 중심 지식저장소로 관찰된다.
- 모든 차단 상태는 의도된 상태이며 안전한 문구로 표시된다.

검증 방법:

- `pnpm ui:production-smoke`
- 브라우저/수동 QA 기록

### LCX-KVUI-023 출시 검증

연계 단위: LCX-KSUI-041

대상 파일:

- 테스트 출력과 출시 증빙 기록

필수 점검:

```bash
pnpm check:production-ui-literals
pnpm ui:production-smoke
pnpm check:ui-pr-checklist
pnpm --filter @amic-vault/web test
pnpm --filter @amic-vault/web typecheck
pnpm --filter @amic-vault/web lint
pnpm --filter @amic-vault/web build
python3 /Users/jws/Applications/ai-slop-taxonomy/scripts/sloplint.py --repo "$PWD" --changed
```

완료 기준:

- 필수 점검이 모두 통과하거나, 실패가 기존 문제 또는 차단 상태로 명확히 기록된다.
- `docs/package` 변경이 포함되지 않는다.

## 실행 순서

### 1단계: 보호장치와 내비게이션

구현:

- LCX-KVUI-001 디자인 시스템 고정
- LCX-KVUI-002 운영 문구 가드
- LCX-KVUI-003 숨김 화면과 미래 기능 게이트

중단 조건:

- 구현에 `docs/package` 변경이 필요하다.
- 화면 노출 제어를 안전하게 제한할 수 없다.
- 문구 가드가 일반 사용자 화면과 관리자/보안 상세 화면을 구분할 수 없다.

### 2단계: Matter 축

구현:

- LCX-KVUI-004 Matter 목록 지식 축
- LCX-KVUI-005 Matter 상세 지식 현황
- LCX-KVUI-006 Matter 팀 접근 관리

중단 조건:

- Matter app 기준 정보를 확인할 수 없고 `연결 필요`로도 안전하게 표시할 수 없다.
- Matter 또는 문서 건수를 실제값 없이 표시해야 한다.
- 내부 식별자만 라벨로 사용할 수 있다.

### 3단계: 원본 문서함과 문서 프로필

구현:

- LCX-KVUI-007 문서함 화면의 원본 보관 역할
- LCX-KVUI-008 Matter code 우선 업로드
- LCX-KVUI-009 문서 지식 프로필
- LCX-KVUI-010 문서 관계 정보

중단 조건:

- Matter code와 권한 없이 업로드가 진행될 수 있다.
- 문서 상세가 지원되지 않는 복원/공유/삭제/열기-저장 동작을 암시한다.
- AI 준비 상태 문구가 법률 분석이나 요약 기능처럼 보인다.

### 4단계: 검색과 재사용

구현:

- LCX-KVUI-011 권한 범위 검색
- LCX-KVUI-012 검색 폴더

중단 조건:

- 검색 필터링이 화면 표시 후 사후 필터링에 의존한다.
- 비공개 모드의 저장 검색 링크가 기밀 검색어 원문을 노출한다.
- 접근할 수 없는 검색 결과 라벨, 건수, 미리보기가 보인다.

### 5단계: 업무 맥락의 관리 정보

구현:

- LCX-KVUI-013 업무 맥락 관리 패널
- LCX-KVUI-014 감사 콘솔과 감사 항목 상세
- LCX-KVUI-015 작업함과 알림

중단 조건:

- 감사 또는 기록 화면에 민감한 원문이 필요하다.
- 승인된 폐기 흐름 밖에서 완전 삭제가 보인다.
- 작업함 항목이 실제 상태에서 나온 것이 아니라 임의로 만들어진다.

### 6단계: 수집 채널과 운영 관리

구현:

- LCX-KVUI-016 Matter app 수집 채널
- LCX-KVUI-017 Outlook 보관 수집 채널
- LCX-KVUI-018 OneDrive와 Office 게이트
- LCX-KVUI-019 지식 운영 관리자
- LCX-KVUI-020 AI 준비 상태 경계

중단 조건:

- 연동 화면이 승인된 상태 없이 연결 완료/실시간 상태를 단정한다.
- 관리자 설정이 설정 비밀값이나 내부 식별자 노출을 요구한다.
- AI 준비 상태가 prompt 또는 model response 표시를 요구한다.

### 7단계: 계정, QA, 출시

구현:

- LCX-KVUI-021 로그인과 계정 진입
- LCX-KVUI-022 수동 QA 묶음
- LCX-KVUI-023 출시 검증

중단 조건:

- 수동 QA에 사용할 수 없는 실제 인증 정보가 필요하다.
- 숨김 화면 스모크 점검에서 범위 밖 실제 기능이 노출된다.
- 출시 증빙에 비밀값이나 기밀 문서 내용이 필요하다.

## 완료 정의

다음 조건을 모두 만족할 때 완료로 본다.

1. 기존 UI 디자인 시스템과 컴포넌트 패턴이 유지된다.
2. `LCX-KSUI-000~050` 전체에 구현 증빙 또는 안전한 보류 근거가 있다.
3. 고객 화면의 한국어 문구가 자연스럽고 내부 용어를 노출하지 않는다.
4. `Matter`와 `Matter code`가 고유명사로 정확히 표시된다.
5. 구현되거나 승인되지 않은 동작을 실제 사용 가능한 기능처럼 보이게 하지 않는다.
6. Matter, 문서, 검색 폴더, 기록, 감사, 연동, 관리자 흐름이 하나의 로펌 지식저장소로 이어진다.
7. 필요한 자동 점검과 수동 QA 기록이 남는다.
8. `docs/package`는 변경하지 않는다.
