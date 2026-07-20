# LCX Knowledge Vault UI Evidence Matrix

작성일: 2026-07-02

기준 문서:
- `docs/lazycodex/lcx-knowledge-vault-ui-work-breakdown-2026-07-02.md`
- `docs/lazycodex/lcx-kr-saas-ui-traceability-2026-07-02.md`

목적:
- AMIC Vault를 로펌의 고도화된 지식저장소로 운영하기 위해 필요한 UI 목표를 빠짐없이 상태화한다.
- 고객 화면에는 자연스러운 한국어 SaaS 표현만 사용하고, 고유명사 `Matter`와 `Matter code`는 유지한다.
- 아직 열 수 없는 기능은 연결 필요, 승인 필요, 사용 불가, 숨김 중 하나로 보류 근거를 남긴다.

검증 명령:
- `pnpm check:lcx-knowledge-ui-evidence`
- `pnpm check:production-ui-literals`
- `pnpm ui:production-smoke`
- `pnpm check:ui-pr-checklist`
- `pnpm --filter @amic-vault/web test`
- `pnpm --filter @amic-vault/web typecheck`
- `pnpm --filter @amic-vault/web lint`
- `pnpm --filter @amic-vault/web build`

상태 값:
- 구현 가능: 현재 화면에서 실제 동작 또는 안전한 요청 동작으로 제공 가능하다.
- 요청 가능: 현재는 신청, 검토, 재시도, 다운로드 신청처럼 요청 흐름으로만 제공한다.
- 승인 필요: 출시 경계나 운영 승인 전에는 실행 화면으로 열지 않는다.
- 연결 필요: 외부 시스템 또는 운영 연결 상태가 갖춰져야 활성화한다.
- 사용 불가: 현재 출시 범위에서 기능 제공을 금지한다.
- 숨김: 내비게이션이나 일반 사용 경로에서 노출하지 않는다.

| LCX ID | Surface | Status | Evidence | Safe hold / next proof |
|---|---|---|---|---|
| LCX-KSUI-000 | 전역 내비게이션과 AppShell | 구현 가능 | `apps/web/src/app/(app)/app-shell.test.tsx`와 숨김 경로 테스트가 역할별 메뉴와 닫힌 상태를 확인한다. | 사용자 역할 확인 전에는 메뉴 확장을 멈추고 접근 불가 화면으로 처리한다. |
| LCX-KSUI-001 | 홈 | 구현 가능 | `apps/web/src/app/(app)/dashboard/vault-activity-client.test.tsx`가 최근 활동, 작업함, 연동 상태를 확인한다. | 숫자와 목록은 서비스 응답 기준으로만 표시하고 가짜 카운트는 금지한다. |
| LCX-KSUI-002 | 작업함 | 구현 가능 | `apps/web/src/app/(app)/work/work-queue-client.test.tsx`가 상태 필터, 대상 링크, 다시 시도 흐름을 확인한다. | 실행 근거가 없는 항목은 확인 또는 요청 화면으로만 연결한다. |
| LCX-KSUI-003 | 알림 | 구현 가능 | `apps/web/src/app/(app)/notifications/notifications-client.test.tsx`가 미확인, 확인됨, 관련 화면 링크를 확인한다. | 이벤트 근거가 없는 안내 문구와 임의 알림은 추가하지 않는다. |
| LCX-KSUI-004 | Matter 목록 | 구현 가능 | `apps/web/src/app/(app)/matters/page.test.tsx`가 Matter, Matter code, 고객, 담당팀, 파일함 진입을 확인한다. | Matter 관리 시스템 상태가 불확실하면 연결 필요로 보여 준다. |
| LCX-KSUI-005 | Matter 상세 | 구현 가능 | `apps/web/src/app/(app)/matters/[matterId]/page.tsx`와 관련 컴포넌트 테스트가 문서, 이메일, 접근 상태를 연결한다. | 권한 거부나 만료 상태에서는 이전 행을 남기지 않는다. |
| LCX-KSUI-006 | Matter 팀 | 구현 가능 | `apps/web/src/components/matter/team-member-list.test.tsx`와 `add-member-dialog.test.tsx`가 구성원, 역할, 추가와 해제를 확인한다. | 원시 참조값은 고급 운영 모드 밖의 일반 화면에 표시하지 않는다. |
| LCX-KSUI-007 | Matter code 선택 | 구현 가능 | `apps/web/src/components/matter/matter-code-picker.test.tsx`와 `apps/web/src/lib/matter-app.spec.ts`가 검색, 연결 필요, 업로드 가능 여부를 확인한다. | 기준 정보가 최신이고 업로드 기준 시스템으로 확인되기 전에는 업로드를 막는다. |
| LCX-KSUI-008 | 문서함 | 구현 가능 | `apps/web/src/app/(app)/files/page.test.tsx`와 출시 점검이 Matter code 선택, 문서 목록, 업로드 상태를 확인한다. | Matter code가 없거나 권한이 없으면 새 업로드를 열지 않는다. |
| LCX-KSUI-009 | Matter 문서함 | 구현 가능 | `apps/web/src/components/document/matter-document-list.test.tsx`가 Matter 범위 문서, 필터, 빈 상태를 확인한다. | 읽기 권한이 없는 문서는 목록과 집계에 포함하지 않는다. |
| LCX-KSUI-010 | 문서 업로드 | 구현 가능 | `apps/web/src/components/document/document-upload-panel.test.tsx`가 파일 선택, 중복 확인, 새 문서, 새 버전, 취소를 확인한다. | 사전 확인, 권한, 파일 검증 전에는 실제 업로드를 시작하지 않는다. |
| LCX-KSUI-011 | 문서 프로필 | 구현 가능 | `apps/web/src/components/document/document-action-center.test.tsx`가 문서 프로필, 미리보기, 다운로드, 버전, 활동 내역을 확인한다. | 읽기 권한 실패 시 상세 행과 미리보기 상태를 초기화한다. |
| LCX-KSUI-012 | 버전 관리 | 구현 가능 | `document-action-center.test.tsx`가 검토본, 체크인, 공식 발행, 버전 이력을 확인한다. | 복원은 원본 덮어쓰기가 아니라 새 공식 버전 생성이 확인될 때만 실행한다. |
| LCX-KSUI-013 | 문서 활동 내역 | 구현 가능 | `apps/web/src/components/document/document-audit-timeline.test.tsx`가 문서 감사 로그와 수행자, 결과, 일시를 확인한다. | 감사 정보는 참조값과 허용된 표시명만 사용하고 본문은 표시하지 않는다. |
| LCX-KSUI-014 | 외부 공유 상태 | 승인 필요 | 문구 가드와 출시 점검이 외부 공유를 승인 필요 상태로 묶는다. | R11 승인 전에는 수신자, 보안 링크, 외부 공유 실행 흐름을 열지 않는다. |
| LCX-KSUI-015 | 편집 잠금과 Office 열기 저장 | 승인 필요 | 연동 화면과 문서 편집 화면이 편집 잠금은 표시하되 Office 연결은 승인 필요로 다룬다. | Office 열기 저장과 공동 편집은 연결 증빙과 되돌림 증빙 전까지 실행하지 않는다. |
| LCX-KSUI-016 | 문서 검색 | 구현 가능 | `apps/web/src/components/search/search-advanced-controls.test.tsx`와 검색 화면 테스트가 검색 범위와 조건을 확인한다. | 권한 필터는 검색 요청 전에 적용되어야 하며 화면에서 사후 제거로 대체하지 않는다. |
| LCX-KSUI-017 | 고급 검색 조건 | 구현 가능 | 검색 조건 테스트가 파일 유형, 상태, 버전, 기밀도, 특권 상태, 추출 상태를 확인한다. | 지원되지 않는 조건은 칩과 선택지에 추가하지 않는다. |
| LCX-KSUI-018 | 검색 결과 | 구현 가능 | 결과 카드와 문서 프로필 링크 테스트가 관련 Matter, 문서 열기, 문서함에서 보기를 확인한다. | 미리보기 조각은 권한 확인 뒤 허용 범위 안에서만 보여 준다. |
| LCX-KSUI-019 | 검색 폴더 | 구현 가능 | `apps/web/src/app/(app)/search/folders/search-folders-client.test.tsx`가 저장된 검색 조건, 열기, 이름 변경, 삭제를 확인한다. | 비공개 검색에서는 원문 조건과 원시 저장값을 주소나 라벨에 노출하지 않는다. |
| LCX-KSUI-020 | 기록 보존 | 구현 가능 | `apps/web/src/app/(app)/records/records-governance-client.test.tsx`가 보존 조치, 보관 처리, 폐기 요청을 확인한다. | 하드 삭제는 표시하지 않고 폐기는 검토 요청과 증명서 흐름으로만 남긴다. |
| LCX-KSUI-021 | 기록 대상 선택 | 구현 가능 | 기록 보존 테스트가 선택된 Matter, 선택된 문서, 접근 권한 상태를 확인한다. | 대상 선택은 권한 확인을 통과한 Matter code와 문서 목록으로 제한한다. |
| LCX-KSUI-022 | 접근 기록과 감사 검색 | 요청 가능 | `apps/web/src/app/(app)/audit/audit-console-client.test.tsx`가 감사 로그, 검색, 상세 확인, 다운로드 흐름을 확인한다. | 민감한 내보내기는 다운로드 사유와 참조형 기록 증빙을 추가 확인해야 한다. |
| LCX-KSUI-023 | 감사 상세 정보 | 구현 가능 | `apps/web/src/components/audit/audit-event-inspector.test.tsx`와 secure ref 테스트가 수행자, 작업, 결과, 대상을 확인한다. | 토큰, 쿠키, 문서 본문, 프롬프트, 모델 응답은 표시 금지다. |
| LCX-KSUI-024 | 정보 차단 | 구현 가능 | `apps/web/src/app/(app)/walls/wall-admin-client.test.tsx`와 정책 검사 테스트가 적용 범위, 예외 대상, 구성원을 확인한다. | 정책 변경은 관리자 권한과 감사 기록이 확인될 때만 실행한다. |
| LCX-KSUI-025 | 업무 맥락 관리 정보 | 구현 가능 | `apps/web/src/components/governance/governance-context-panel.test.tsx`가 접근 상태, Matter 참여 여부, 보존 조치를 확인한다. | 패널은 권한 안전한 맥락만 읽고 원시 내부값을 일반 문구로 노출하지 않는다. |
| LCX-KSUI-026 | 연동 관리 | 구현 가능 | `apps/web/src/app/(app)/integrations/page.tsx`와 출시 점검이 연결 상태, 운영 조건, 확인 정보를 확인한다. | 연결되지 않은 시스템은 연결 필요 또는 승인 필요로만 표시한다. |
| LCX-KSUI-027 | Matter 관리 시스템 연동 | 연결 필요 | `apps/web/src/app/(app)/integrations/matter-app/page.tsx`와 `matter-app.spec.ts`가 기준 정보와 업로드 가능 여부를 확인한다. | 런타임 연결과 최신성 검사가 통과하기 전에는 업로드 기준 시스템으로 사용하지 않는다. |
| LCX-KSUI-028 | Outlook 운영 상태 | 구현 가능 | `apps/web/src/app/(app)/integrations/outlook/page.test.tsx`가 기능별 운영 상태와 확인 상태를 확인한다. | 관리자 설정이 실패하거나 범위가 비어 있으면 연결 필요로 표시한다. |
| LCX-KSUI-029 | Outlook 보관 창 | 구현 가능 | `apps/web/src/app/outlook-addin/outlook-addin-client.test.tsx`와 단축키 테스트가 Matter 선택, 첨부, 전송 및 보관을 확인한다. | 내부 콘솔 세션이나 원시 식별값에 의존하지 않고 별도 보관 창으로 유지한다. |
| LCX-KSUI-030 | OneDrive와 Office 카드 | 연결 필요 | 연동 화면과 출시 가드가 저장소 동기화, 열기 저장, 공동 편집을 연결 필요로 묶는다. | 운영 계약, 잠금, 되돌림, 연결 상태 증빙 전에는 연결됨으로 표시하지 않는다. |
| LCX-KSUI-031 | 관리자 설정 | 구현 가능 | 관리자 화면 테스트가 계정 보안, 보안 정책, 백업, 컴플라이언스를 확인한다. | 관리자 역할이 확인되지 않으면 설정값을 표시하지 않는다. |
| LCX-KSUI-032 | 보안 설정 | 구현 가능 | route guard와 관리자 보안 테스트가 접속 제한, 기기 접근, 로그 보관을 확인한다. | 직접 경로 접근도 관리자 권한 확인 전에는 닫힌 상태로 처리한다. |
| LCX-KSUI-033 | 계정 원장 | 구현 가능 | 계정 원장 테스트가 상태와 확인 흐름을 확인한다. | 일반 화면에서는 원장 내부값을 고객용 표시명으로 바꾸지 않는다. |
| LCX-KSUI-034 | 기업 관리 호환 경로 | 숨김 | 숨김 경로 테스트가 별도 내비게이션 노출 없이 관리자 화면과 호환되는지 확인한다. | 승인 전에는 일반 메뉴에서 `/enterprise`를 노출하지 않는다. |
| LCX-KSUI-035 | 문서 정리 준비 | 구현 가능 | `apps/web/src/components/ai/ai-prep-status-panel.test.tsx`와 Matter 대시보드 테스트가 파일 정리 상태와 다시 시도를 확인한다. | 법률 분석, 요약, 외부 모델, 프롬프트, 모델 응답은 표시하지 않는다. |
| LCX-KSUI-036 | 외부 포털 | 승인 필요 | `apps/web/src/app/(external)/external/[token]/external-portal-client.test.tsx`가 격리된 토큰 화면을 확인한다. | R11 승인 전에는 내부 내비게이션이나 일반 업무 흐름에서 열지 않는다. |
| LCX-KSUI-037 | 로그인과 재설정 | 구현 가능 | 인증 폼 테스트가 로그인, 계정 활성화, 비밀번호, 재설정 링크를 확인한다. | 자격 증명과 재설정 토큰은 로그나 화면 상세 정보에 남기지 않는다. |
| LCX-KSUI-038 | 숨김 업무 경로 | 숨김 | `apps/web/src/app/(app)/hidden-routes.test.tsx`가 launch, scale, contracts, dd, litigation, showcase 차단을 확인한다. | 승인 전에는 표시할 수 없는 화면으로 처리하거나 찾을 수 없는 경로로 둔다. |
| LCX-KSUI-039 | 공통 UI 상태 | 구현 가능 | empty state, secure ref, page header, i18n 테스트가 빈 상태, 오류, 로딩, 보안 참조를 확인한다. | 공통 컴포넌트에는 금지 문구와 가짜 데이터를 넣지 않는다. |
| LCX-KSUI-040 | 고객 화면 문구 가드 | 구현 가능 | `tools/quality/check-production-ui-literals.mjs`와 출시 점검이 한국어 표현과 금지 주장을 검사한다. | 새 화면이 추가될 때 문구 가드와 출시 점검 목록을 함께 늘린다. |
| LCX-KSUI-041 | 수동 QA 묶음 | 요청 가능 | 작업 분해 문서가 Matter, 문서함, 문서 프로필, 검색 폴더, 감사와 기록 보존 경로를 지정한다. | 브라우저 수동 QA 영수증은 안전 세션으로 추가 수집해야 한다. |
| LCX-KSUI-042 | 로펌 지식저장소 계층 | 구현 가능 | Matter, 문서 프로필, 검색 폴더, 기록 보존, 감사 컴포넌트 테스트가 관련 Matter와 활동 내역 연결을 확인한다. | 의미 검색, 법률 분석, 모델 응답은 승인 전까지 열지 않는다. |
| LCX-KSUI-043 | Matter 지식 현황 | 구현 가능 | Matter 상세와 홈 테스트가 관련 문서, 관련 이메일, 최근 활동, 접근 상태, 보존 조치를 확인한다. | 카운트와 링크는 서비스 응답 기반으로만 표시한다. |
| LCX-KSUI-044 | 문서 지식 프로필 | 구현 가능 | 문서 프로필 테스트가 현재 버전, 버전 이력, 검색 가능 상태, 파일 정리 상태, 관련 Matter, 활동 내역을 확인한다. | 문서 본문, 프롬프트, 모델 응답, 원시 내부값은 노출하지 않는다. |
| LCX-KSUI-045 | 분류 우선 보관 | 구현 가능 | 업로드와 검색 조건 테스트가 문서 분류, 세부 유형, 기밀도, 특권 상태, 보존 기간, 중복 확인을 확인한다. | 지원되지 않는 필드는 숨기거나 사용할 수 없는 상태로 표시한다. |
| LCX-KSUI-046 | 검색 폴더 지식 화면 | 구현 가능 | 검색 폴더 테스트가 다시 열기, 검색 조건, 관련 Matter, 문서함에서 보기 흐름을 확인한다. | 비공개 검색 주소에는 원시 조건과 저장값을 노출하지 않는다. |
| LCX-KSUI-047 | 맥락형 관리 패널 | 구현 가능 | 관리 정보 패널과 기록 보존 테스트가 접근 상태, 정보 차단, 보존 조치, 보관 처리, 폐기 요청, 감사 로그를 확인한다. | 변경 동작은 실행 가능, 요청 가능, 승인 필요 상태를 서비스 지원 범위에 맞춰 나눈다. |
| LCX-KSUI-048 | 지식 수집 채널 | 연결 필요 | Matter 관리 시스템과 Outlook 테스트가 같은 Matter, 문서, 검색, 감사 모델로 들어오는 상태를 확인한다. | 연결 증빙 전에는 별도 저장소처럼 보이거나 연결됨으로 표시하지 않는다. |
| LCX-KSUI-049 | 지식 운영 관리 | 구현 가능 | 관리자 화면과 출시 점검이 문서 분류, Matter 템플릿, 검색 항목, 보존 기간, 검색 보안, 색인 상태를 확인한다. | 편집 가능한 항목은 관리자 권한과 서비스 성공 응답 후에만 저장한다. |
| LCX-KSUI-050 | 특화 저장소 게이트 | 숨김 | 숨김 경로 테스트와 출시 경계 가드가 DD, 소송, 계약, 외부 포털, VDR 화면 노출을 막는다. | 승인된 출시 경계 전에는 메뉴, 바로가기, 실행 주장 모두 금지한다. |
