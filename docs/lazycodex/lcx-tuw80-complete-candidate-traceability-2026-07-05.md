Warning: truncated output (original token count: 146496)
Total output lines: 6884

# LCX-TUW80 Complete Candidate Traceability

Date: 2026-07-05
Status: row-level LazyCodex traceability for the 80 local-evidence rows
Source ledger generated at: `2026-07-05T07:12:51.511Z`
Parent plan: `docs/lazycodex/lcx-tuw80-complete-candidate-execution-plan-2026-07-05.md`

## Coverage

Rows covered: 80

| ID | Title | Owner | Tags | Evidence/Gaps | Codex plan | Operator action |
| --- | --- | --- | --- | ---: | --- | --- |
| B1 | OCR 레인 실장 — 스캔 PDF·이미지 한국어 OCR로 ocr_pending 봉인 해제 | Codex + operator | `manual-qa` `m365-office` `real-fixture` `benchmark` `external-ops` | 42/2 | run or repair the benchmark/performance harness and store the receipt | provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens; provide real sanitized fixture or staging sample receipt for the named artifact; provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| B2 | 포맷 커버리지 확대 — 추출(txt/csv/md/html/xlsx/pptx/doc/xls/ppt) + 미리보기 변환 + 비동기 사전 생성 | operator | `manual-qa` | 157/1 | after operator receipt arrives, rerun focused checks and ledger promotion gate | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| B4 | 문서 법률 메타데이터 표준 — Source 필드 + 버전 표준 라벨(v0.1/v1.0/Final/Execution Copy, Clean/Markup) | operator | `manual-qa` | 62/1 | after operator receipt arrives, rerun focused checks and ledger promotion gate | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| B6 | 편집 라이프사이클 운영성 패키지 — 잠금 만료 스위퍼, 관리자 강제 해제, 잠금 토큰 왕복, 릴리스 스모크 편입 | Codex + operator | `manual-qa` `lsp` | 96/2 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| C1 | RFC2047 인코딩 워드·charset 본문 디코딩 수정 | operator | `manual-qa` `m365-office` `real-fixture` `external-ops` | 47/1 | after operator receipt arrives, rerun focused checks and ledger promotion gate | provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens; provide real sanitized fixture or staging sample receipt for the named artifact; provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| C2 | 재귀 MIME 트리 첨부 파서 — 중첩 multipart·quoted-printable·내장 rfc822 처리 | operator | `manual-qa` `real-fixture` | 32/1 | after operator receipt arrives, rerun focused checks and ledger promotion gate | provide real sanitized fixture or staging sample receipt for the named artifact; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| C4 | Outlook 신원검증기 실구현 — Entra ID 토큰 JWKS 검증 (봉인 1 해제) | operator | `manual-qa` `m365-office` `external-ops` | 50/3 | after operator receipt arrives, rerun focused checks and ledger promotion gate | provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens; provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| C5 | Microsoft Graph 콘텐츠 트랜스포트 실구현 — 메시지 MIME·첨부 취득 (봉인 2 해제) | Codex + operator | `manual-qa` `m365-office` `external-ops` `dependency-gated` | 81/3 | promote or explicitly block prerequisite TUWs before this row can move | provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens; provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| C6 | Outlook 파일링 이행 워커 — queued→completed 상태기계와 저장 완결 (봉인 3 해제) | operator | `manual-qa` `m365-office` `real-fixture` `external-ops` | 81/3 | after operator receipt arrives, rerun focused checks and ledger promotion gate | provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens; provide real sanitized fixture or staging sample receipt for the named artifact; provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| D4 | semantic/hybrid 검색 실질화 + 웹 UI 모드 노출 | Codex + operator | `manual-qa` `lsp` `m365-office` | 63/2 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| E1 | Matter 상세 AI 질의 패널 — RAG 파이프라인 최초 사용자 노출 | Codex + operator | `manual-qa` `lsp` | 28/2 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| E3 | 답변 구조 스펙 완성 — 결론/불확실부분/추가확인자료/권장조치/권한제외 표시 | Codex + operator | `manual-qa` `lsp` | 33/2 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| E4 | 금지문서 '제외 후 계속' — 전체 거부에서 청크 단위 제외로 전환 | Codex + operator | `manual-qa` `lsp` | 31/2 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| F4 | Citation Ledger 영속화 — ai_claims/ai_claim_citations 원장 테이블 | Codex + operator | `manual-qa` `lsp` | 30/2 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| G1 | 휴면 문서 상태머신 활성화 — 계약 라이프사이클 전이 서비스+UI | Codex + operator | `manual-qa` `lsp` | 41/2 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| H1 | MFA TOTP 실구현 — 'mfa_not_available' 로그인 차단 스텁 교체 | Codex + operator | `manual-qa` `lsp` `real-fixture` | 63/2 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | provide real sanitized fixture or staging sample receipt for the named artifact; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| H2 | 사용자 비활성화·전체 세션 강제회수 + 보안 운영 콘솔(break-glass UI 포함) | Codex + operator | `manual-qa` `lsp` `m365-office` | 34/2 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| H5 | 관측성 정리 — in-memory 메트릭 레지스트리 메모리 누수 수정 + 기본 알림 | Codex + operator | `manual-qa` `benchmark` `external-ops` | 28/2 | run or repair the benchmark/performance harness and store the receipt | provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| H6 | pg-boss 워커 독립 프로세스화 + 기본 활성화 | Codex + operator | `manual-qa` `lsp` | 29/3 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| A8 | §5.2 필드 보강: 비밀등급·related_matters·lead partner/associate·wall 상태 노출 | Codex + operator | `manual-qa` `lsp` | 52/2 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| A9 | 쟁점·기한 코어 승격 (matter_issues/matter_key_dates + 봉인 데이터 일반화) | Codex + operator | `manual-qa` `lsp` | 51/2 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| A11 | Matter 종료 체크리스트 + closed 전이 게이트 | operator | `manual-qa` | 30/1 | after operator receipt arrives, rerun focused checks and ledger promotion gate | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| A12 | Closing Binder 빌더 (해시 매니페스트 + records_archives 연계) | Codex + operator | `manual-qa` `dependency-gated` | 50/3 | promote or explicitly block prerequisite TUWs before this row can move | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| B7 | 배치 업로드 파이프라인 — BulkUploadJob 큐 연결, 배치 세션 모델, ZIP 안전 해제 인제스트 | Codex + operator | `manual-qa` `lsp` `benchmark` | 49/3 | run or repair the benchmark/performance harness and store the receipt; retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| B8 | 폴더/태그 혼합 구조 + 폴더 업로드(구조 보존) | Codex + operator | `manual-qa` `lsp` | 56/2 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| B9 | HWP 바이너리 추출 레인 — .hwp 텍스트 추출·검색 편입 | operator | `manual-qa` `m365-office` `real-fixture` | 31/2 | after operator receipt arrives, rerun focused checks and ledger promotion gate | provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens; provide real sanitized fixture or staging sample receipt for the named artifact; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| B10 | 실제 DOCX Track Changes(w:ins/w:del) 파싱 + PDF 주석 추출 | Codex + operator | `manual-qa` `lsp` `m365-office` `real-fixture` `external-ops` | 107/3 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens; provide real sanitized fixture or staging sample receipt for the named artifact; provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| B11 | 문서 비교 1단계 — 버전 쌍 조항 단위 기계적 diff + 비교 UI | Codex + operator | `manual-qa` `lsp` `m365-office` `real-fixture` `dependency-gated` | 37/4 | promote or explicitly block prerequisite TUWs before this row can move; retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens; provide real sanitized fixture or staging sample receipt for the named artifact; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| C8 | 이메일-문서 링크 API 노출 + 원문 .eml 통제 다운로드 | operator | `manual-qa` `m365-office` `real-fixture` | 53/1 | after operator receipt arrives, rerun focused checks and ledger promotion gate | provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens; provide real sanitized fixture or staging sample receipt for the named artifact; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| C9 | 참여자 3분류(내부/고객/상대방) + 테넌트 도메인 서버측 설정 | operator | `manual-qa` | 42/1 | after operator receipt arrives, rerun focused checks and ledger promotion gate | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| C10 | 인제스천 워커 이메일 파싱 파이프라인 활성화 + 재파싱 배치 | Codex + operator | `manual-qa` `lsp` `preexisting-blocker` | 33/3 | clear or explicitly disposition unrelated broad-check blockers before promotion; retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| C11 | MSG 파싱 — extract-msg 기반 메타데이터·RTF 본문·첨부 추출 | Codex + operator | `manual-qa` `lsp` `m365-office` `real-fixture` `dependency-gated` | 29/4 | promote or explicitly block prerequisite TUWs before this row can move; retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens; provide real sanitized fixture or staging sample receipt for the named artifact; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| C12 | 이메일 쓰레드 모델·쓰레드 뷰 UI·쓰레드 단위 파일링 | Codex + operator | `manual-qa` `lsp` `m365-office` `real-fixture` `dependency-gated` `preexisting-blocker` | 71/4 | clear or explicitly disposition unrelated broad-check blockers before promotion; promote or explicitly block prerequisite TUWs before this row can move; retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens; provide real sanitized fixture or staging sample receipt for the named artifact; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| C13 | Matter 자동추천 신뢰도 4단계 실스코어링 + 밴드별 UX | Codex + operator | `manual-qa` `lsp` `m365-office` `dependency-gated` `preexisting-blocker` | 60/4 | clear or explicitly disposition unrelated broad-check blockers before promotion; promote or explicitly block prerequisite TUWs before this row can move; retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| D6 | 인덱스 1MB 절단 해소 — 청크 단위 FTS 전환 | operator | `manual-qa` `m365-office` `real-fixture` | 43/1 | after operator receipt arrives, rerun focused checks and ledger promotion gate | provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens; provide real sanitized fixture or staging sample receipt for the named artifact; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| D7 | OCR 텍스트 검색 인덱싱 연결 + ocr_pending 백필 | operator | `manual-qa` `m365-office` | 47/1 | after operator receipt arrives, rerun focused checks and ledger promotion gate | provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| D8 | 이메일 본문 전문검색 (파일링 이메일의 문서 정규화 인덱싱) | Codex + operator | `manual-qa` `lsp` `m365-office` `real-fixture` | 21/2 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens; provide real sanitized fixture or staging sample receipt for the named artifact; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| D10 | 자연어 질의 검색 UI (/search 'AI에게 질문' 탭) | Codex + operator | `manual-qa` `lsp` | 25/3 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| E5 | AI Audit 원문 저장 — 프롬프트/출력 원문 열람 가능한 감사 | Codex + operator | `manual-qa` `lsp` | 30/2 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| E6 | 골든셋 평가 벤치 — 질문-정답 대조 회귀 게이트 | Codex + operator | `manual-qa` `lsp` | 27/3 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| E7 | Gemma 구조화 확장 — Fact/Issue/Risk/그래프 노드 후보 생성 | Codex + operator | `manual-qa` `lsp` | 19/3 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| E9 | Matter AI — 사건 타임라인·미해결쟁점·다음액션 | Codex + operator | `manual-qa` `lsp` | 23/4 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| E10 | Document AI — 조항 리스크 분석 생성 경로 (rule_findings 컨텍스트) | Codex + operator | `manual-qa` `lsp` `dependency-gated` | 34/4 | promote or explicitly block prerequisite TUWs before this row can move; retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| E11 | Email AI — 쓰레드 요약·요청사항/기한 추출 | Codex + operator | `manual-qa` `lsp` | 30/3 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| E12 | DD/Litigation AI — RFI 자동매핑·증거 자동분류 제안 | Codex + operator | `manual-qa` `lsp` `external-ops` `preexisting-blocker` | 47/3 | clear or explicitly disposition unrelated broad-check blockers before promotion; retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| F1 | 그래프 택소노미 Phase 1 확장 — Fact/Evidence/Issue/Risk/RFI/Party 노드 및 EVIDENCED_BY 계열 엣지 투영 | Codex + operator | `manual-qa` `lsp` | 32/4 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| F2 | contract_clauses ↔ 그래프 clause 노드 통합 — 조항 모델 이원화 해소 | Codex + operator | `manual-qa` `lsp` | 29/4 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| F3 | graph_nodes provenance/review_status 속성 강제 — AI생성·사람확정 차원 도입 | Codex + operator | `manual-qa` `lsp` `m365-office` | 29/3 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| F6 | 문서 라이프사이클 이벤트 기반 그래프 자동 증분 동기화 | Codex + operator | `manual-qa` `lsp` | 39/2 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| F7 | 다중 홉 그래프 질의 API — 권한 스코프 재귀 CTE | Codex + operator | `manual-qa` `lsp` `benchmark` `external-ops` | 34/5 | run or repair the benchmark/performance harness and store the receipt; retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| F8 | Matter 지식 탭 UI 개방 — Matter Graph/Issue Map/Citation Panel | Codex + operator | `manual-qa` `lsp` | 16/4 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| F9 | AI 후보 Fact 유입 + Human Review Queue — proposed→confirmed 승격 순환 | Codex + operator | `manual-qa` `lsp` | 30/2 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| F10 | SUPERSEDES 엣지 파생 + Conflict Detector 확장 — 버전충돌·정의어 불일치·근거누락 감지 | Codex + operator | `manual-qa` `lsp` `external-ops` | 34/3 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| F11 | 조항은행 2.0 — 전사 큐레이션·재사용 승인 워크플로·/contracts 조항은행 브라우저 | Codex + operator | `manual-qa` `lsp` | 33/2 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| G3 | 계약검토 워크플로 — 송부/마크업 수령/협상쟁점표 | Codex + operator | `manual-qa` `lsp` | 75/2 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| G5 | DD RFI 템플릿·기한/미매핑 알림 | Codex + operator | `manual-qa` `lsp` `preexisting-blocker` | 41/2 | clear or explicitly disposition unrelated broad-check blockers before promotion; retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| G6 | 업로드 자동분류→RFI 매핑 추천 확인 큐 | Codex + operator | `manual-qa` `lsp` | 42/2 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| G7 | 송무 운영 CRUD·증거번호 자동생성 | Codex + operator | `manual-qa` `lsp` | 42/2 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| G8 | 송무 기일 관리 — hearings 테이블+알림+work 태스크 | Codex + operator | `manual-qa` `lsp` | 33/2 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| G10 | 외부 공유 관리 UI — 워크스페이스/링크 발급/Q&A 인박스 | Codex + operator | `manual-qa` `lsp` `external-ops` | 28/5 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| G12 | Q&A 승인흐름·공개범위 (1단계 승인 간소화) | Codex + operator | `manual-qa` `lsp` `external-ops` | 17/4 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| G13 | Work queue 워크플로 태스크 확장 — kind 네임스페이스·배정·페이지네이션 | Codex + operator | `manual-qa` `lsp` | 36/3 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| H7 | 대량 다운로드 임계 알림 — DLP 행위 감지 1건 | Codex + operator | `manual-qa` `lsp` `benchmark` | 38/2 | run or repair the benchmark/performance harness and store the receipt; retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| H9 | 감사로그 일일 앵커 해시 — 간소 해시체인 | operator | `manual-qa` `external-ops` | 47/2 | after operator receipt arrives, rerun focused checks and ledger promotion gate | provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| H11 | 파일서버/PST 임포트 어댑터 — OneDrive 마이그레이션 도구체인 일반화 | Codex + operator | `manual-qa` `lsp` `real-fixture` `dependency-gated` | 11/5 | promote or explicitly block prerequisite TUWs before this row can move; retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | provide real sanitized fixture or staging sample receipt for the named artifact; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| A13 | 종료 매터 지식은행 후보 파이프라인 (/work 검토 큐 연동) | Codex + operator | `manual-qa` `lsp` `dependency-gated` | 49/3 | promote or explicitly block prerequisite TUWs before this row can move; retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| B14 | Word Add-in — 조항은행 검색·삽입 | Codex + operator | `manual-qa` `lsp` `m365-office` `external-ops` `preexisting-blocker` | 31/5 | clear or explicitly disposition unrelated broad-check blockers before promotion; retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens; provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| C14 | 송부 전 DLP 콘텐츠 검사 — Smart Alerts 클라이언트 스캔 + 이그레스 서버 스캔 | Codex + operator | `manual-qa` `lsp` `m365-office` `repo-implementation` `external-ops` `dependency-gated` | 18/6 | close the named repo implementation/test gap before promotion; promote or explicitly block prerequisite TUWs before this row can move; retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens; provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| D9 | 검색 성능 개선 — 권한 스코프 물질화 + 카운트/facet 최적화 (수십만 문서 기준) | Codex + operator | `manual-qa` `lsp` `m365-office` `benchmark` | 43/5 | run or repair the benchmark/performance harness and store the receipt; retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| D11 | 조항 검색 통합검색 노출 (SearchTarget 'clause') | Codex + operator | `manual-qa` `lsp` | 42/2 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| D12 | 판례·법령 검색 탭 (external authority 캐시 인덱스) | Codex + operator | `manual-qa` `lsp` `m365-office` `real-fixture` `external-ops` | 36/5 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens; provide real sanitized fixture or staging sample receipt for the named artifact; provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| E14 | 회의록 정합성 QC | Codex + operator | `manual-qa` `lsp` `dependency-gated` | 23/4 | promote or explicitly block prerequisite TUWs before this row can move; retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| F12 | 유사조항 검색 — 조항 단위 임베딩 + clause-bank 검색 API/패널 | Codex + operator | `manual-qa` `lsp` `benchmark` `dependency-gated` `preexisting-blocker` | 37/2 | run or repair the benchmark/performance harness and store the receipt; clear or explicitly disposition unrelated broad-check blockers before promotion; promote or explicitly block prerequisite TUWs before this row can move; retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| F13 | 고객 Playbook 확장 — client 스코프 룰 + negotiation_positions + 상대방 요구 이력 집계 | Codex + operator | `manual-qa` `lsp` | 34/2 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| F14 | LLM Wiki 재생성 + Obsidian export — matter_wiki_pages와 마크다운 vault 내보내기 | Codex + operator | `manual-qa` `lsp` `repo-implementation` | 20/5 | close the named repo implementation/test gap before promotion; retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| G4 | AI 1차 검토 연결 — clause_analysis/risk_extraction 소비 | Codex + operator | `manual-qa` `lsp` `benchmark` `preexisting-blocker` | 62/4 | run or repair the benchmark/performance harness and store the receipt; clear or explicitly disposition unrelated broad-check blockers before promotion; retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| G14 | 산출물 export — DD 보고서 초안·협상쟁점표·Closing Binder/Archive | Codex + operator | `manual-qa` `lsp` `m365-office` `repo-implementation` `external-ops` | 8/8 | close the named repo implementation/test gap before promotion; retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens; provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| H12 | 국내 법률데이터 연동 — 법제처 국가법령정보 API→Authority 노드 + DART 공시 조회 | Codex + operator | `manual-qa` `lsp` `real-fixture` `repo-implementation` `external-ops` | 21/10 | close the named repo implementation/test gap before promotion; retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | provide real sanitized fixture or staging sample receipt for the named artifact; provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| H13 | Analytics-lite — 사용 통계 대시보드 | Codex + operator | `manual-qa` `lsp` `benchmark` | 40/2 | run or repair the benchmark/performance harness and store the receipt; retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |
| H14 | Microsoft OIDC 간편 로그인 (선택·저순위) | Codex + operator | `manual-qa` `lsp` `m365-office` `external-ops` | 18/4 | retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy | provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens; provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence; perform the exact staging/browser manual QA path in the row and capture a sanitized receipt |

## Row Execution Cards

### LCX-TUW80-B1 OCR 레인 실장 — 스캔 PDF·이미지 한국어 OCR로 ocr_pending 봉인 해제

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: Codex + operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:231`
Tags: `manual-qa`, `m365-office`, `real-fixture`, `benchmark`, `external-ops`
Evidence refs currently recorded: 42

Dependencies:

- none

Primary code anchors:

- workers/ingestion/app/parsers/pdf.py
- workers/ingestion/app/parsers/types.py
- workers/ingestion/pyproject.toml
- workers/ingestion/app/main.py
- 신규: workers/ingestion/app/ocr_router.py
- 신규: workers/ingestion/app/parsers/ocr.py
- apps/api/src/modules/document/extraction/extraction-dispatcher.ts
- apps/api/src/modules/document/extraction/extraction-queue.service.ts
- apps/api/src/modules/document/extraction/extraction.types.ts
- apps/api/src/modules/search/index/index-sync.hook.ts
- 신규: apps/api/src/modules/document/extraction/ocr-queue.service.ts

Acceptance tests:

- 자동: 신규 tests/integration/document-access/extraction-ocr.spec.ts — 텍스트 레이어 없는 한국어 스캔 PDF fixture 업로드 → canonical_documents가 ocr_pending을 거쳐 status='ready', extraction_method='ocr'로 전이하고 body_text에 fixture의 한국어 문구가 포함됨을 실 DB E2E로 검증(기존 extraction.spec.ts 패턴)
- 자동: 신규 workers/ingestion/tests/test_ocr_router.py — 스캔 PDF/PNG fixture에 대해 /ocr가 페이지별 텍스트와 confidence(0~1)를 반환하고, 텍스트 레이어가 이미 있는 PDF는 skip 코드를 반환
- 자동: apps/api/src/modules/document/extraction/extraction-dispatcher.spec.ts 확장 — ocr_pending 저장 시 document.ocr 큐 enqueue가 1회 발생, ready/failed 저장 시 미발생
- 수동: 스테이징 /files에서 스캔 계약서 PDF 업로드 → 5분 내 /search에서 본문 키워드로 해당 문서가 히트하면 통과
- 성능: 10페이지 300dpi 스캔 PDF의 업로드→OCR 완료(ready 전이)까지 p95 5분 이내 — extraction-ocr.spec.ts에서 타임스탬프 차이로 측정

Manual QA requirement:

- 수동: 스테이징 /files에서 스캔 계약서 PDF 업로드 → 5분 내 /search에서 본문 키워드로 해당 문서가 히트하면 통과

Migration requirements:

- none

Audit/security invariants:

- **Goal:** 스캔 PDF와 이미지(jpg/png) 업로드 시 한국어+영어 OCR이 자동 수행되어 본문이 canonical_documents에 저장되고 전문 검색·AI 파이프라인에 편입된다. ocr_pending으로 영구 대기하는 문서가 사라진다.
- **Scope:** 만드는 것: (1) ingestion worker에 /ocr 엔드포인트 추가 — Tesseract(kor+eng traineddata) 기반, PDF는 pypdfium2로 페이지 래스터라이즈 후 페이지별 OCR, 이미지 파일은 직접 OCR, 페이지별 confidence 산출. (2) pg-boss 후속 큐 document.ocr 신설(extraction 큐의 재시도·데드레터·singletonKey 패턴 복제) — extraction-dispatcher.storeResult가 status='ocr_pending' 저장 시 OCR 잡을 enqueue. (3) OCR 완료 시 canonical_documents를 extraction_method='ocr', status='ready'로 병합하고 기존 SearchIndexSyncHook을 재사용해 인덱스 재동기화. (4) worker Docker 이미지에 tesseract-ocr+kor 데이터 추가. 만들지 않는 것: 저신뢰 페이지 사람 검수 UI(후속), PaddleOCR GPU 워커(Tesseract 품질 미달 시에만 재평가), 이미지 내 표 구조 복원.
- - `workers/ingestion/app/main.py`
- - 자동: apps/api/src/modules/document/extraction/extraction-dispatcher.spec.ts 확장 — ocr_pending 저장 시 document.ocr 큐 enqueue가 1회 발생, ready/failed 저장 시 미발생
- - 수동: 스테이징 /files에서 스캔 계약서 PDF 업로드 → 5분 내 /search에서 본문 키워드로 해당 문서가 히트하면 통과
- - (앵커 부정확) B1 완료판정의 '전문 검색·AI 파이프라인 편입'이 D7(OCR 텍스트 검색 인덱싱 연결+백필)과 경계가 겹친다. B1은 'OCR 수행 + canonical_documents 저장 + ocr_pending 해제'까지로 경계를 명확히 하고, 검색 인덱싱 연결·소급 백필은 D7의 몫임을 양쪽 완료판정에 명시하라(D7 deps B1은 유지).

External evidence needs:

- [object Object]

Codex implementation/evidence tasks:

- run or repair the benchmark/performance harness and store the receipt

User/operator actions:

- provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens
- provide real sanitized fixture or staging sample receipt for the named artifact
- provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence
- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- External staging manual evidence is still missing: the authoritative B1 manual QA says staging /files upload of a scanned Korean contract PDF must become discoverable by body keyword in /search within 5 minutes. Local API/worker/integration evidence now passes, but it is not a staging receipt.
- Current environment has no staging API/web target variables recorded in tmp/b1-evidence/staging-target-check-current.json. Provide a staging target/cookie or a non-repo operational receipt before promotion.

Promotion gate:

- close gap: External staging manual evidence is still missing: the authoritative B1 manual QA says staging /files upload of a scanned Korean contract PDF must become discoverable by body keyword in /search within 5 minutes. Local API/worker/integration evidence now passes, but it is not a staging receipt.
- close gap: Current environment has no staging API/web target variables recorded in tmp/b1-evidence/staging-target-check-current.json. Provide a staging target/cookie or a non-repo operational receipt before promotion.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage
### LCX-TUW80-B2 포맷 커버리지 확대 — 추출(txt/csv/md/html/xlsx/pptx/doc/xls/ppt) + 미리보기 변환 + 비동기 사전 생성

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:265`
Tags: `manual-qa`
Evidence refs currently recorded: 157

Dependencies:

- none

Primary code anchors:

- workers/ingestion/app/extract_router.py
- workers/ingestion/app/convert_router.py
- workers/ingestion/app/converters/docx_to_pdf.py
- workers/ingestion/pyproject.toml
- 신규: workers/ingestion/app/parsers/office.py
- 신규: workers/ingestion/app/parsers/plaintext.py
- apps/api/src/modules/document/validators/file-extension.validator.ts
- apps/api/src/modules/document/validators/mime-type.validator.ts
- apps/api/src/modules/document/extraction/extraction-dispatcher.ts
- apps/api/src/modules/preview/preview.service.ts
- apps/api/src/modules/preview/preview-convert.job.ts
- db/migrations/0035_create_document_preview_artifacts.sql

Acceptance tests:

- 자동: workers/ingestion/tests/test_extract_router.py 확장 — txt/csv/md/html/xlsx/pptx/doc/xls/ppt 실파일 fixture 각각에 대해 status='ready'와 기대 본문 문자열 포함을 검증, 각 포맷별 extraction_method enum 값 확인; hwp/hwpx OLE payload는 B9 전까지 기존 실패 코드 유지 회귀 검증
- 자동: tests/integration/document-access/extraction.spec.ts 확장 — txt 및 xlsx/pptx/doc/xls/ppt 업로드 → canonical_documents ready 전이 및 검색 인덱스 동기화 E2E
- 자동: tests/integration/document-access/preview.spec.ts 확장 — xlsx/pptx/doc/xls/ppt 업로드 후 미리보기 요청 시 application/pdf 응답, document_preview_artifacts 캐시 적중을 2회차 요청에서 검증
- 자동: 신규 apps/api/src/modules/preview/preview-precreate.spec.ts(unit) — 업로드 커밋 시 preview 사전 생성 잡 enqueue, 실패 시 status='failed' 기록과 재시도
- 수동: 스테이징에서 pptx 업로드 → 문서 상세 열람 시 3초 내 미리보기 표시(사전 생성 완료 상태)면 통과

Manual QA requirement:

- 수동: 스테이징에서 pptx 업로드 → 문서 상세 열람 시 3초 내 미리보기 표시(사전 생성 완료 상태)면 통과

Migration requirements:

- db/migrations/0035_create_document_preview_artifacts.sql
- - `db/migrations/0035_create_document_preview_artifacts.sql`

Audit/security invariants:

- **Goal:** 업로드 허용 19개 확장자 대부분에서 본문 텍스트가 추출되어 검색·AI 대상이 되고, Office 계열 문서(xlsx/pptx/doc/xls/ppt)가 PDF 미리보기로 열람 가능해진다. 미리보기 변환은 업로드 직후 비동기 사전 생성되어 최초 열람 지연이 사라진다.
- **Scope:** 만드는 것: (1) extract_router._parse 확장 — txt/md/csv 인라인 추출(chardet 인코딩 감지), html/htm 추출(lxml/bs4, 업로드 밸리데이터에 html 확장자·MIME 추가), xlsx/pptx는 openpyxl/python-pptx, doc/xls/ppt는 LibreOffice headless 변환 경유(기존 docx_to_pdf.py subprocess 인프라 재사용). (2) convert_router에 범용 /convert/office-to-pdf 추가하고 preview.service의 변환 대상을 docx 단독에서 xlsx/pptx/doc/xls/ppt로 확대. (3) 업로드 커밋 시 pg-boss preview 사전 생성 큐(document.preview-convert — preview-convert.job.ts에 이미 큐 이름 존재)로 변환을 비동기화하고 실패 시 document_preview_artifacts.status='failed' 재시도. 만들지 않는 것: ZIP 해제 인제스트(B7), HWP 바이너리(B9), PDF.js 커스텀 뷰어 교체와 인쇄/복사 억제(완화 정책 제외 — 네이티브 iframe 유지), 이메일 계열 eml/msg 파싱·첨부 분리 저장(C 워크스트림 Email Vault 레인).
- **완화 노트:** 인쇄/복사 뷰어 차단은 내부용 불필요로 계획 제외 — PDF.js 교체 없이 브라우저 네이티브 iframe 뷰어 유지. eml/msg는 B2 완료판정에서 제외하고 Email Vault(C)로 일원화한다.
- - `신규: workers/ingestion/app/parsers/plaintext.py`
- - 자동: workers/ingestion/tests/test_extract_router.py 확장 — txt/csv/md/html/xlsx/pptx/doc/xls/ppt 실파일 fixture 각각에 대해 status='ready'와 기대 본문 문자열 포함을 검증, 각 포맷별 extraction_method enum 값 확인; hwp/hwpx OLE payload는 B9 전까지 기존 실패 코드 유지 회귀 검증
- - 자동: 신규 apps/api/src/modules/preview/preview-precreate.spec.ts(unit) — 업로드 커밋 시 preview 사전 생성 잡 enqueue, 실패 시 status='failed' 기록과 재시도

External evidence needs:

- Staging manual QA receipt: authenticated staging /files pptx upload, document-detail preview visible within 3 seconds, and precreated preview state confirmed with timestamp, staging target ref, safe document/matter refs, and screenshot or operator receipt.

Codex implementation/evidence tasks:

- after operator receipt arrives, rerun focused checks and ledger promotion gate

User/operator actions:

- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- Manual staging evidence is missing: staging pptx upload must show document-detail preview within 3 seconds with precreated preview state.

Promotion gate:

- close gap: Manual staging evidence is missing: staging pptx upload must show document-detail preview within 3 seconds with precreated preview state.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage

### LCX-TUW80-B4 문서 법률 메타데이터 표준 — Source 필드 + 버전 표준 라벨(v0.1/v1.0/Final/Execution Copy, Clean/Markup)

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:330`
Tags: `manual-qa`
Evidence refs currently recorded: 62

Dependencies:

- none

Primary code anchors:

- 신규: db/migrations/0098_add_document_source_and_version_labels.sql (번호는 머지 시점 최신+1로 조정) (missing)
- db/migrations/0027_extend_documents_metadata.sql
- db/migrations/0029_create_document_versions.sql
- db/migrations/0092_create_document_editing_foundation.sql
- packages/shared/src/dto/document/upload-document.dto.ts
- packages/shared/src/dto/document/update-document-metadata.dto.ts
- packages/shared/src/dto/document/add-version.dto.ts
- packages/shared/src/dto/document/version-list.dto.ts
- apps/api/src/modules/document/document.service.ts
- apps/api/src/modules/document/document-version.service.ts
- apps/api/src/modules/document/document-editing.service.ts
- apps/api/src/modules/document/filename-metadata.parser.ts

Acceptance tests:

- 자동: tests/integration/document-metadata.spec.ts 확장 — source 없이 업로드 시 internal_work_product 기본값, counterparty_provided로 수정 시 감사 이벤트 before/after 기록, 허용 외 값은 400
- 자동: tests/integration/document-access/document-versioning.spec.ts 확장 — 버전 추가 시 version_significance='client_sent' 지정 → 버전 목록 API에 라벨 반환, markup 버전이 base clean 버전 FK를 갖는 것 검증
- 자동: apps/api/src/modules/document/filename-metadata.parser.spec.ts 확장 — '계약서_v2.1_최종.docx' 파일명에서 라벨 제안이 업로드 기본값으로 승격되는 케이스
- 자동: apps/web/src/components/document/document-action-center.test.tsx 확장 — 버전 목록에 라벨 배지(고객송부본/체결본) 렌더링
- 수동: 스테이징에서 문서 업로드 시 Source 선택 → 문서 프로필에 표시, promote 시 '고객송부본(v1.0)' 라벨 부여 후 버전 목록에서 확인되면 통과

Manual QA requirement:

- 수동: 스테이징에서 문서 업로드 시 Source 선택 → 문서 프로필에 표시, promote 시 '고객송부본(v1.0)' 라벨 부여 후 버전 목록에서 확인되면 통과

Migration requirements:

- 신규: db/migrations/0098_add_document_source_and_version_labels.sql (번호는 머지 시점 최신+1로 조정)
- db/migrations/0027_extend_documents_metadata.sql
- db/migrations/0029_create_document_versions.sql
- db/migrations/0092_create_document_editing_foundation.sql
- **Scope:** 만드는 것: (1) 마이그레이션 — documents.source 컬럼(client_provided/counterparty_provided/internal_work_product/public, CHECK, 기본 internal_work_product) + document_versions에 version_label(text), version_significance(internal_draft/client_sent/counterparty_sent/negotiation/final/execution_copy CHECK), rendition_type(clean/markup) 및 markup의 base clean 버전 FK. (2) uploadDocumentFieldsSchema·updateDocumentMetadataSchema·addVersion DTO에 필드 추가(.strict() 유지), 기존 문서는 기본값 백필. (3) UI — upload-metadata-profile과 document-action-center 버전 목록·메타데이터 편집에 source/라벨 노출, filename-metadata.parser의 versionLabel 제안을 기본값으로 승격. (4) 감사 — DOCUMENT_METADATA_CHANGED에 before/after, promote 시 라벨 부여를 publish_reason_code와 동일 트랜잭션으로 기록. 만들지 않는 것: source 자동 제안(이메일 발신자 도메인 기반 — C 레인 후속), counterparty_provided 외부공유 자동 차단 정책, Records 체결본 자동 연계(후속), 비밀등급 확장(현행 3단계 유지).
- - `신규: db/migrations/0098_add_document_source_and_version_labels.sql (번호는 머지 시점 최신+1로 조정)`
- - `db/migrations/0027_extend_documents_metadata.sql`
- - `db/migrations/0029_create_document_versions.sql`
- - `db/migrations/0092_create_document_editing_foundation.sql`

Audit/security invariants:

- **Scope:** 만드는 것: (1) 마이그레이션 — documents.source 컬럼(client_provided/counterparty_provided/internal_work_product/public, CHECK, 기본 internal_work_product) + document_versions에 version_label(text), version_significance(internal_draft/client_sent/counterparty_sent/negotiation/final/execution_copy CHECK), rendition_type(clean/markup) 및 markup의 base clean 버전 FK. (2) uploadDocumentFieldsSchema·updateDocumentMetadataSchema·addVersion DTO에 필드 추가(.strict() 유지), 기존 문서는 기본값 백필. (3) UI — upload-metadata-profile과 document-action-center 버전 목록·메타데이터 편집에 source/라벨 노출, filename-metadata.parser의 versionLabel 제안을 기본값으로 승격. (4) 감사 — DOCUMENT_METADATA_CHANGED에 before/after, promote 시 라벨 부여를 publish_reason_code와 동일 트랜잭션으로 기록. 만들지 않는 것: source 자동 제안(이메일 발신자 도메인 기반 — C 레인 후속), counterparty_provided 외부공유 자동 차단 정책, Records 체결본 자동 연계(후속), 비밀등급 확장(현행 3단계 유지).
- **완화 노트:** 9종 비밀등급 확장은 제외 — 기존 3단계+privilege/legal hold 유지. 본 유닛은 사양 필수 필드인 Source와 버전 라벨 레이어만 추가하며 기존 정수 version_no 체계를 변경하지 않는다.
- - 자동: tests/integration/document-metadata.spec.ts 확장 — source 없이 업로드 시 internal_work_product 기본값, counterparty_provided로 수정 시 감사 이벤트 before/after 기록, 허용 외 값은 400

External evidence needs:

- Staging manual QA receipt: authenticated staging /files upload with Source selected, document profile showing Source, promote to customer-sent v1.0 label, and version list displaying 고객송부본(v1.0), with timestamp, staging target ref, safe document/matter refs, and screenshot or operator receipt.

Codex implementation/evidence tasks:

- after operator receipt arrives, rerun focused checks and ledger promotion gate

User/operator actions:

- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- Manual staging evidence is missing: upload a document with Source selected, confirm Source appears in the document profile, promote with a customer-sent v1.0 label, and confirm the version list displays that label.

Promotion gate:

- close gap: Manual staging evidence is missing: upload a document with Source selected, confirm Source appears in the document profile, promote with a customer-sent v1.0 label, and confirm the version list displays that label.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage

### LCX-TUW80-B6 편집 라이프사이클 운영성 패키지 — 잠금 만료 스위퍼, 관리자 강제 해제, 잠금 토큰 왕복, 릴리스 스모크 편입

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: Codex + operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:363`
Tags: `manual-qa`, `lsp`
Evidence refs currently recorded: 96

Dependencies:

- none

Primary code anchors:

- apps/api/src/modules/document/document-editing.service.ts
- apps/api/src/modules/document/document-editing.controller.ts
- packages/shared/src/dto/document/document-editing.dto.ts
- db/migrations/0092_create_document_editing_foundation.sql
- db/migrations/0086_create_dms_notifications.sql
- apps/api/src/modules/document/extraction/extraction-queue.service.ts
- 신규: apps/api/src/modules/document/edit-session-sweeper.service.ts
- apps/web/src/components/document/document-action-center.tsx
- apps/web/src/lib/api-client.ts
- tools/release/dms-main-loop-smoke.mjs
- docs/current-code-state.md
- tests/integration/document-access/document-editing-lifecycle.spec.ts

Acceptance tests:

- 자동: tests/integration/document-access/document-editing-lifecycle.spec.ts 확장 — (a) TTL 경과 세션이 스위퍼 1회 실행 후 expired로 전이하고 DOCUMENT_LOCK_EXPIRED 감사와 알림 행이 생성됨, (b) matter owner의 강제 해제가 사유코드 없이는 400, 사유코드와 함께 성공 후 원소유자 알림 생성, (c) 일반 사용자의 강제 해제는 403
- 자동: 동일 spec 확장 — checkout 응답의 lockToken으로 save 성공, 위조 토큰으로 save 시 409/403 거부
- 자동: tools/release/dms-main-loop-smoke.mjs 실행 시 신규 편집 스텝이 스테이징 환경에서 전부 PASS(스크립트 exit 0)
- 수동: 스테이징에서 사용자 A 체크아웃 방치 → TTL 경과 후 사용자 B 문서 화면에 '잠금 만료' 상태 표시, 관리자 계정으로 해제 버튼 동작 확인이면 통과

Manual QA requirement:

- 수동: 스테이징에서 사용자 A 체크아웃 방치 → TTL 경과 후 사용자 B 문서 화면에 '잠금 만료' 상태 표시, 관리자 계정으로 해제 버튼 동작 확인이면 통과

Migration requirements:

- db/migrations/0092_create_document_editing_foundation.sql
- db/migrations/0086_create_dms_notifications.sql
- - `db/migrations/0092_create_document_editing_foundation.sql`
- - `db/migrations/0086_create_dms_notifications.sql`

Audit/security invariants:

- **Scope:** 만드는 것: (1) pg-boss 스위퍼 잡(extraction-queue 패턴 재사용) — 만료된 active edit session을 주기 스캔해 expired 전이 + DOCUMENT_LOCK_EXPIRED 감사 + notifications(0086) 알림 생성. (2) matter owner/tenant admin용 강제 해제 엔드포인트(document-editing.controller) — 사유코드 필수, 소유자에게 알림, 관리자 액션 감사. document-action-center에 해제 버튼 노출. (3) checkout 응답에 잠금 토큰 원문을 1회 반환하고 save/check-in/cancel에서 lock_token_hash 대조 검증(기존 vestigial 컬럼 활성화) — B12 데스크톱 핸드오프와 향후 WOPI의 전제. (4) tools/release/dms-main-loop-smoke.mjs에 DMS-SMOKE 신규 스텝: checkout→edit package→subversion 저장→리뷰어 승인→check-in→promote→promoted_from_subversion_id 확인→감사 이벤트 체인 검증, docs/current-code-state.md의 candidate 표기 갱신. 만들지 않는 것: WOPI Lock API, 만료 예고 이메일(인앱 알림만).
- - `tools/release/dms-main-loop-smoke.mjs`
- - 자동: tests/integration/document-access/document-editing-lifecycle.spec.ts 확장 — (a) TTL 경과 세션이 스위퍼 1회 실행 후 expired로 전이하고 DOCUMENT_LOCK_EXPIRED 감사와 알림 행이 생성됨, (b) matter owner의 강제 해제가 사유코드 없이는 400, 사유코드와 함께 성공 후 원소유자 알림 생성, (c) 일반 사용자의 강제 해제는 403
- - 자동: 동일 spec 확장 — checkout 응답의 lockToken으로 save 성공, 위조 토큰으로 save 시 409/403 거부
- - 자동: tools/release/dms-main-loop-smoke.mjs 실행 시 신규 편집 스텝이 스테이징 환경에서 전부 PASS(스크립트 exit 0)
- ### C: Email Vault

External evidence needs:

- [object Object]
- [object Object]

Codex implementation/evidence tasks:

- retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy

User/operator actions:

- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- Approved staging DMS main-loop smoke receipt is missing. Current local artifacts cover script syntax, dry-run planning, check-env, unit/integration behavior, LSP, and migration evidence only; the 2026-07-04 full local smoke attempt is excluded because the local api service was not running.
- Required staging manual QA is missing: user A checkout left idle until TTL expiry, user B sees the expired-lock state, and an administrator successfully uses the force-release button with a bounded reason code.

Promotion gate:

- close gap: Approved staging DMS main-loop smoke receipt is missing. Current local artifacts cover script syntax, dry-run planning, check-env, unit/integration behavior, LSP, and migration evidence only; the 2026-07-04 full local smoke attempt is excluded because the local api service was not running.
- close gap: Required staging manual QA is missing: user A checkout left idle until TTL expiry, user B sees the expired-lock state, and an administrator successfully uses the force-release button with a bounded reason code.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage

### LCX-TUW80-C1 RFC2047 인코딩 워드·charset 본문 디코딩 수정

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:393`
Tags: `manual-qa`, `m365-office`, `real-fixture`, `external-ops`
Evidence refs currently recorded: 47

Dependencies:

- none

Primary code anchors:

- packages/shared/src/email/eml-parser.ts
- packages/shared/src/email/eml-parser.spec.ts
- packages/shared/src/email/email-metadata.ts (isOutside/subject 처리 94, 136-156행)
- packages/shared/src/email/email-metadata.spec.ts
- apps/api/src/modules/email/email.service.ts (parseRawEmail 부근 575-600행, toString('utf8') 588행)
- apps/api/src/modules/email/email.service.spec.ts

Acceptance tests:

- packages/shared/src/email/eml-parser.spec.ts에 케이스 추가: =?UTF-8?B?...?=, =?EUC-KR?B?...?=, =?UTF-8?Q?...?=, 멀티라인 연속 인코딩 워드, 알 수 없는 charset fallback — 각각 기대 한국어 문자열과 정확 일치 assert
- apps/api/src/modules/email/email.service.spec.ts에 charset=euc-kr 본문·quoted-printable 본문 EML 픽스처가 손상 없이 디코딩되는 단위 테스트 추가
- tests/integration/document-access/email-filing.spec.ts에 EUC-KR 인코딩 한국어 제목 EML을 POST /matters/:id/emails로 업로드 후 email_messages.subject가 디코딩된 한글 원문으로 저장됨을 assert하는 케이스 추가
- 수동: 실제 Outlook에서 저장한 한국어 제목 .eml을 업로드(C3 이전에는 curl/API 직접 호출)하고 Matter 타임라인에 제목이 깨지지 않고 표시되면 통과

Manual QA requirement:

- 수동: 실제 Outlook에서 저장한 한국어 제목 .eml을 업로드(C3 이전에는 curl/API 직접 호출)하고 Matter 타임라인에 제목이 깨지지 않고 표시되면 통과

Migration requirements:

- none

Audit/security invariants:

- #### C1 [S] RFC2047 인코딩 워드·charset 본문 디코딩 수정
- **Goal:** 한국어 제목·표시명·본문이 EML 임포트 시 올바르게 디코딩되어 저장·표시되고, 제목 기반 Matter 추천과 특권 키워드 휴리스틱이 한국어 메일에서 동작한다.
- **Scope:** packages/shared eml-parser에 RFC2047 인코딩 워드 디코더 추가(B/Q 인코딩, UTF-8/EUC-KR/CP949 iconv-lite 변환, 연속 인코딩 워드 접합 규칙, 손상 인코딩 fallback). email-metadata의 subject·참여자 표시명에 디코딩 적용. email.service.ts의 body.toString('utf8') 고정을 Content-Type charset 파라미터 기반 디코딩으로 교체하고 quoted-printable 본문 디코딩 추가. 기존 저장 레코드의 소급 재파싱은 하지 않음(C10 재파싱 배치에서 처리). MSG는 범위 외(C11).
- - `packages/shared/src/email/eml-parser.ts`
- - `packages/shared/src/email/eml-parser.spec.ts`
- - `packages/shared/src/email/email-metadata.ts (isOutside/subject 처리 94, 136-156행)`
- - `packages/shared/src/email/email-metadata.spec.ts`
- - `apps/api/src/modules/email/email.service.ts (parseRawEmail 부근 575-600행, toString('utf8') 588행)`
- - `apps/api/src/modules/email/email.service.spec.ts`
- - packages/shared/src/email/eml-parser.spec.ts에 케이스 추가: =?UTF-8?B?...?=, =?EUC-KR?B?...?=, =?UTF-8?Q?...?=, 멀티라인 연속 인코딩 워드, 알 수 없는 charset fallback — 각각 기대 한국어 문자열과 정확 일치 assert
- - apps/api/src/modules/email/email.service.spec.ts에 charset=euc-kr 본문·quoted-printable 본문 EML 픽스처가 손상 없이 디코딩되는 단위 테스트 추가
- - tests/integration/document-access/email-filing.spec.ts에 EUC-KR 인코딩 한국어 제목 EML을 POST /matters/:id/emails로 업로드 후 email_messages.subject가 디코딩된 한글 원문으로 저장됨을 assert하는 케이스 추가

External evidence needs:

- [object Object]

Codex implementation/evidence tasks:

- after operator receipt arrives, rerun focused checks and ledger promotion gate

User/operator actions:

- provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens
- provide real sanitized fixture or staging sample receipt for the named artifact
- provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence
- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- Actual Outlook-exported Korean subject .eml evidence is still missing. C1 cannot be promoted to COMPLETE_CANDIDATE until a real Outlook-saved message is uploaded through the API/curl path and the Matter timeline visual check is recorded, or an operator provides non-repo evidence documenting that this manual artifact is externally blocked.

Promotion gate:

- close gap: Actual Outlook-exported Korean subject .eml evidence is still missing. C1 cannot be promoted to COMPLETE_CANDIDATE until a real Outlook-saved message is uploaded through the API/curl path and the Matter timeline visual check is recorded, or an operator provides non-repo evidence documenting that this manual artifact is externally blocked.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage

### LCX-TUW80-C2 재귀 MIME 트리 첨부 파서 — 중첩 multipart·quoted-printable·내장 rfc822 처리

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:415`
Tags: `manual-qa`, `real-fixture`
Evidence refs currently recorded: 32

Dependencies:

- none

Primary code anchors:

- apps/api/src/modules/email/email-attachment.parser.ts (단층 partSections 83-91행, base64 한정 디코딩 75-81행)
- apps/api/src/modules/email/email-attachment.parser.spec.ts
- apps/api/src/modules/email/email.service.ts (첨부 임포트 1138-1205행)

Acceptance tests:

- apps/api/src/modules/email/email-attachment.parser.spec.ts에 케이스 추가: multipart/mixed>multipart/related 중첩 첨부 검출, quoted-printable 첨부 바이트 무손상 디코딩(sha256 비교), 인라인 이미지 제외+첨부 포함 혼재, message/rfc822 내장 이메일의 .eml 분리, 3단 중첩 트리 — 각 케이스 첨부 개수·파일명·바이트 해시 assert
- tests/integration/document-access/email-filing.spec.ts에 중첩 multipart EML 업로드 시 첨부 문서 2건이 생성되고 email_document_links가 각각 연결됨을 assert하는 케이스 추가
- 수동: 인라인 이미지+PDF 첨부가 섞인 실제 포워드 메일 .eml 업로드 후 문서함에 PDF만 첨부 문서로 생성되고 원문 이메일 관계가 표시되면 통과

Manual QA requirement:

- 수동: 인라인 이미지+PDF 첨부가 섞인 실제 포워드 메일 .eml 업로드 후 문서함에 PDF만 첨부 문서로 생성되고 원문 이메일 관계가 표시되면 통과

Migration requirements:

- none

Audit/security invariants:

- **Scope:** email-attachment.parser.ts를 최상위 boundary 단층 분리에서 재귀 MIME 트리 순회로 교체: 중첩 boundary 재귀, base64/quoted-printable/7bit/8bit content-transfer-encoding 디코딩, message/rfc822 내장 이메일을 .eml 첨부 파일로 분리 저장(내장 이메일의 재귀 임포트·쓰레드 연결은 C12 이후 확장 항목으로 제외). 기존 25MB 상한 정책과 email_document_links 연결 로직은 유지. 인라인 이미지는 Content-Disposition inline+cid 기준으로 첨부 제외 규칙 명시.
- - `apps/api/src/modules/email/email-attachment.parser.ts (단층 partSections 83-91행, base64 한정 디코딩 75-81행)`
- - `apps/api/src/modules/email/email-attachment.parser.spec.ts`
- - `apps/api/src/modules/email/email.service.ts (첨부 임포트 1138-1205행)`
- - apps/api/src/modules/email/email-attachment.parser.spec.ts에 케이스 추가: multipart/mixed>multipart/related 중첩 첨부 검출, quoted-printable 첨부 바이트 무손상 디코딩(sha256 비교), 인라인 이미지 제외+첨부 포함 혼재, message/rfc822 내장 이메일의 .eml 분리, 3단 중첩 트리 — 각 케이스 첨부 개수·파일명·바이트 해시 assert
- - tests/integration/document-access/email-filing.spec.ts에 중첩 multipart EML 업로드 시 첨부 문서 2건이 생성되고 email_document_links가 각각 연결됨을 assert하는 케이스 추가
- - 수동: 인라인 이미지+PDF 첨부가 섞인 실제 포워드 메일 .eml 업로드 후 문서함에 PDF만 첨부 문서로 생성되고 원문 이메일 관계가 표시되면 통과

External evidence needs:

- [object Object]

Codex implementation/evidence tasks:

- after operator receipt arrives, rerun focused checks and ledger promotion gate

User/operator actions:

- provide real sanitized fixture or staging sample receipt for the named artifact
- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- Manual QA is missing: sanitized staging evidence for a real forwarded .eml with inline image plus PDF attachment, proving document library PDF-only attachment creation, inline cid image exclusion, and original email relationship display/API evidence.

Promotion gate:

- close gap: Manual QA is missing: sanitized staging evidence for a real forwarded .eml with inline image plus PDF attachment, proving document library PDF-only attachment creation, inline cid image exclusion, and original email relationship display/API evidence.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage

### LCX-TUW80-C4 Outlook 신원검증기 실구현 — Entra ID 토큰 JWKS 검증 (봉인 1 해제)

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:462`
Tags: `manual-qa`, `m365-office`, `external-ops`
Evidence refs currently recorded: 50

Dependencies:

- none

Primary code anchors:

- apps/api/src/modules/outlook/outlook-identity-verifier.ts (인터페이스 26행, DENY 스텁 31-36행)
- apps/api/src/modules/outlook/outlook-auth.service.ts (검증 실패 policy_denied 86-96행)
- apps/api/src/modules/outlook/outlook-auth.service.spec.ts
- apps/api/src/modules/outlook/outlook.module.ts (DI 바인딩 43, 52-55행)
- apps/api/src/modules/outlook/outlook-operational-gate.ts (게이트 재사용, 80-96행)
- 신규: apps/api/src/modules/outlook/entra-outlook-identity-verifier.ts
- 신규: apps/api/src/modules/outlook/entra-outlook-identity-verifier.spec.ts

Acceptance tests:

- entra-outlook-identity-verifier.spec.ts: 테스트 전용 서명키/JWKS 픽스처로 (1) 유효 토큰 ALLOW, (2) 만료 토큰 DENY, (3) aud 불일치 DENY, (4) tid 불일치 DENY, (5) 서명 위조 DENY, (6) mailbox 바인딩 불일치 DENY, (7) JWKS 조회 실패 시 fail-close DENY — 7케이스 전부 판정코드까지 assert
- outlook-auth.service.spec.ts에 env 미설정 시 기존 DENY 스텁이 유지됨(회귀 방지) 케이스 추가
- 수동: 개발 M365 테넌트에 매니페스트 사이드로드 후 add-in 태스크페인에서 세션 교환 성공(HTTP 200 + 세션 발급)을 확인하면 통과 — 실패 시 감사로그에 policy_denied가 남는지도 확인

Manual QA requirement:

- 수동: 개발 M365 테넌트에 매니페스트 사이드로드 후 add-in 태스크페인에서 세션 교환 성공(HTTP 200 + 세션 발급)을 확인하면 통과 — 실패 시 감사로그에 policy_denied가 남는지도 확인

Migration requirements:

- none

Audit/security invariants:

- **Scope:** OutlookIdentityVerifier 인터페이스의 실구현 EntraOutlookIdentityVerifier 신규 작성: Microsoft identity platform JWKS 조회+캐싱, 서명·iss·aud(앱 클라이언트ID)·tid(펌 테넌트ID)·exp/nbf 검증, 토큰 클레임과 세션 mailbox 바인딩(mailboxFingerprint 해시) 일치 검증. outlook.module.ts DI를 env(OUTLOOK_IDENTITY_VERIFIER=entra) 조건 바인딩으로 전환하되 기본은 기존 DENY 구현 유지(fail-close). 개발용 Entra 앱 등록 수행 및 설정값(env) 문서화. 운영게이트·감사 설계는 교체하지 않고 그대로 재사용. 사용자 로그인용 SSO는 범위 외.
- **완화 노트:** SAML SSO 런타임 제외 정책과 무관 — 이는 add-in 세션용 Entra 토큰 검증이며 사용자 로그인 SSO가 아님. 검증기는 기본 off(fail-close) 유지.
- - entra-outlook-identity-verifier.spec.ts: 테스트 전용 서명키/JWKS 픽스처로 (1) 유효 토큰 ALLOW, (2) 만료 토큰 DENY, (3) aud 불일치 DENY, (4) tid 불일치 DENY, (5) 서명 위조 DENY, (6) mailbox 바인딩 불일치 DENY, (7) JWKS 조회 실패 시 fail-close DENY — 7케이스 전부 판정코드까지 assert
- - 수동: 개발 M365 테넌트에 매니페스트 사이드로드 후 add-in 태스크페인에서 세션 교환 성공(HTTP 200 + 세션 발급)을 확인하면 통과 — 실패 시 감사로그에 policy_denied가 남는지도 확인

External evidence needs:

- [object Object]
- [object Object]
- [object Object]

Codex implementation/evidence tasks:

- after operator receipt arrives, rerun focused checks and ledger promotion gate

User/operator actions:

- provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens
- provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence
- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- Manual M365 evidence is missing: sideload the add-in manifest in a development M365 tenant with OUTLOOK_IDENTITY_VERIFIER=entra and required Entra env configured, then capture HTTP 200 add-in session exchange and issued add-in session receipt without secrets, tenant account ids, tokens, or mailbox addresses.
- Manual negative evidence is missing: capture a failed add-in session exchange that records OUTLOOK_ADDIN_SESSION_DENIED with policy_denied in the audit log, again without exposing identity assertions, tokens, or mailbox addresses.
- Development Entra app registration/admin setup is not evidenced by repo-local checks; only env placeholders are documented in .env.example.

Promotion gate:

- close gap: Manual M365 evidence is missing: sideload the add-in manifest in a development M365 tenant with OUTLOOK_IDENTITY_VERIFIER=entra and required Entra env configured, then capture HTTP 200 add-in session exchange and issued add-in session receipt without secrets, tenant account ids, tokens, or mailbox addresses.
- close gap: Manual negative evidence is missing: capture a failed add-in session exchange that records OUTLOOK_ADDIN_SESSION_DENIED with policy_denied in the audit log, again without exposing identity assertions, tokens, or mailbox addresses.
- close gap: Development Entra app registration/admin setup is not evidenced by repo-local checks; only env placeholders are documented in .env.example.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage

### LCX-TUW80-C5 Microsoft Graph 콘텐츠 트랜스포트 실구현 — 메시지 MIME·첨부 취득 (봉인 2 해제)

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: Codex + operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:486`
Tags: `manual-qa`, `m365-office`, `external-ops`, `dependency-gated`
Evidence refs currently recorded: 81

Dependencies:

- C4

Primary code anchors:

- apps/api/src/modules/outlook/outlook-graph-attachment-transport.ts (인터페이스 6-36행, Disabled 38-45행)
- apps/api/src/modules/outlook/outlook-graph-attachment.service.ts
- apps/api/src/modules/outlook/outlook.module.ts (52-55행 바인딩 교체)
- packages/shared/src/outlook/outlook-graph-scopes.ts
- packages/shared/src/outlook/outlook-types.ts (filing DTO 스키마)
- apps/web/src/lib/outlook-addin/outlook-item.ts (해시 전용 DTO 66-142행에 게이트드 itemRef 추가)
- db/migrations/0070_create_outlook_filing_requests.sql (참조 스키마)
- 신규: apps/api/src/modules/outlook/graph-outlook-transport.ts
- 신규: apps/api/src/modules/outlook/graph-outlook-transport.spec.ts
- 신규: db/migrations/0098_add_outlook_filing_item_ref.sql (missing)

Acceptance tests:

- graph-outlook-transport.spec.ts: Graph HTTP를 mock 서버(nock/undici MockAgent)로 대체해 (1) OBO 토큰 교환→$value 취득 성공 시 MIME 바이트 반환, (2) 404 시 reasonCode='message_not_found', (3) 401 시 토큰 재교환 1회 후 실패 시 denied, (4) 429 시 Retry-After 준수 재시도, (5) 미승인 스코프 요청 시 거부 — 5케이스 assert
- packages/shared/src/outlook/outlook-types.spec.ts에 콘텐츠 게이트 off 시 itemRef 필드가 스키마에서 거부(.strict 유지)되고 on 시에만 허용되는 케이스 추가
- 수동: 개발 M365 테넌트에서 add-in 파일링 요청 생성 후 API 로그로 Graph $value 호출이 200으로 성공하고 MIME 바이트 sha256이 기록되는지 확인하면 통과

Manual QA requirement:

- 수동: 개발 M365 테넌트에서 add-in 파일링 요청 생성 후 API 로그로 Graph $value 호출이 200으로 성공하고 MIME 바이트 sha256이 기록되는지 확인하면 통과

Migration requirements:

- db/migrations/0070_create_outlook_filing_requests.sql (참조 스키마)
- 신규: db/migrations/0098_add_outlook_filing_item_ref.sql
- **Scope:** GraphOutlookGraphAttachmentTransport 신규 구현: add-in NAA 토큰의 OBO(on-behalf-of) 교환 토큰 브로커, GET /me/messages/{id}/$value(MIME 원문)·GET /me/messages/{id}/attachments/{id} 호출, 429 throttle Retry-After 처리, 오류코드 매핑(404/401/403→reasonCode). 승인 스코프는 기존 outlook-graph-scopes.ts 레지스트리를 유일 소스로 사용. add-in DTO(outlook-item.ts)와 filing request 스키마에 콘텐츠 게이트 플래그 하에서만 전송되는 원시 Graph itemRef 필드 추가(신규 마이그레이션, 번호는 머지 시점 최신+1 — 현재 0098). outlook.module.ts 바인딩을 env 조건(OUTLOOK_GRAPH_TRANSPORT=graph)으로 전환, 기본은 Disabled 유지. 큐 소비·저장 이행은 범위 외(C6).
- - `db/migrations/0070_create_outlook_filing_requests.sql (참조 스키마)`
- - `신규: db/migrations/0098_add_outlook_filing_item_ref.sql`

Audit/security invariants:

- **Goal:** 서버가 항상-거부 Disabled 트랜스포트 대신 Microsoft Graph API로 이메일 원문 MIME과 첨부를 실제 취득할 수 있다 — 콘텐츠 전달 경로가 열린다.
- **Scope:** GraphOutlookGraphAttachmentTransport 신규 구현: add-in NAA 토큰의 OBO(on-behalf-of) 교환 토큰 브로커, GET /me/messages/{id}/$value(MIME 원문)·GET /me/messages/{id}/attachments/{id} 호출, 429 throttle Retry-After 처리, 오류코드 매핑(404/401/403→reasonCode). 승인 스코프는 기존 outlook-graph-scopes.ts 레지스트리를 유일 소스로 사용. add-in DTO(outlook-item.ts)와 filing request 스키마에 콘텐츠 게이트 플래그 하에서만 전송되는 원시 Graph itemRef 필드 추가(신규 마이그레이션, 번호는 머지 시점 최신+1 — 현재 0098). outlook.module.ts 바인딩을 env 조건(OUTLOOK_GRAPH_TRANSPORT=graph)으로 전환, 기본은 Disabled 유지. 큐 소비·저장 이행은 범위 외(C6).
- - `apps/web/src/lib/outlook-addin/outlook-item.ts (해시 전용 DTO 66-142행에 게이트드 itemRef 추가)`
- - 수동: 개발 M365 테넌트에서 add-in 파일링 요청 생성 후 API 로그로 Graph $value 호출이 200으로 성공하고 MIME 바이트 sha256이 기록되는지 확인하면 통과

External evidence needs:

- [object Object]
- [object Object]
- [object Object]

Codex implementation/evidence tasks:

- promote or explicitly block prerequisite TUWs before this row can move

User/operator actions:

- provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens
- provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence
- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- Required C5 manual M365 evidence is missing: with OUTLOOK_GRAPH_TRANSPORT=graph and approved Graph/Entra env configured, create a filing request from a development M365 add-in and capture a sanitized API/runtime receipt showing Graph /me/messages/{id}/$value returned 200 and MIME content_sha256 was recorded.
- C4 external prerequisite remains missing: development M365 add-in sideload identity success receipt and policy_denied negative audit receipt are not yet collected, so the real C5 Graph flow cannot be COMPLETE_CANDIDATE.
- Operational Graph app/admin consent evidence is external and not currently recorded; collect sanitized app-registration/admin-consent evidence without tenant ids, account ids, tokens, mailbox addresses, or secrets.

Promotion gate:

- close gap: Required C5 manual M365 evidence is missing: with OUTLOOK_GRAPH_TRANSPORT=graph and approved Graph/Entra env configured, create a filing request from a development M365 add-in and capture a sanitized API/runtime receipt showing Graph /me/messages/{id}/$value returned 200 and MIME content_sha256 was recorded.
- close gap: C4 external prerequisite remains missing: development M365 add-in sideload identity success receipt and policy_denied negative audit receipt are not yet collected, so the real C5 Graph flow cannot be COMPLETE_CANDIDATE.
- close gap: Operational Graph app/admin consent evidence is external and not currently recorded; collect sanitized app-registration/admin-consent evidence without tenant ids, account ids, tokens, mailbox addresses, or secrets.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage

### LCX-TUW80-C6 Outlook 파일링 이행 워커 — queued→completed 상태기계와 저장 완결 (봉인 3 해제)

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:511`
Tags: `manual-qa`, `m365-office`, `real-fixture`, `external-ops`
Evidence refs currently recorded: 81

Dependencies:

- C5
- C1
- C2

Primary code anchors:

- apps/api/src/modules/outlook/outlook.service.ts (createFilingRequest 161-186행)
- apps/api/src/modules/outlook/outlook.module.ts
- apps/api/src/modules/email/email.service.ts (importRawEmail 389-564행)
- apps/api/src/modules/document/extraction/extraction-queue.service.ts (pg-boss 패턴 재사용)
- apps/api/src/common/db/pg-boss-runtime-options.ts
- db/migrations/0070_create_outlook_filing_requests.sql (상태기계 168행)
- apps/web/src/app/outlook-addin/outlook-addin-client.tsx
- apps/api/src/modules/outlook/outlook-audit.events.ts
- 신규: apps/api/src/modules/outlook/outlook-fulfillment.service.ts
- 신규: apps/api/src/modules/outlook/outlook-fulfillment.service.spec.ts
- 신규: db/migrations/0099_outlook_filing_fulfillment_audit_actions.sql (missing)

Acceptance tests:

- 신규 tests/integration/document-access/outlook-filing-fulfillment.spec.ts: 픽스처 MIME을 반환하는 fake 트랜스포트를 주입해 (1) queued 요청이 completed로 전이되고 email_messages 행·email_matter_filings·email_record_id 역기입이 모두 생성됨, (2) 트랜스포트 denied 시 failed+failure_reason_code 기록, (3) 동일 message_id 중복 시 기존 이메일로 completed, (4) cross-tenant 요청이 RLS로 차단됨 — 4케이스 실DB assert
- outlook-fulfillment.service.spec.ts: 재시도 소진 후 failed 전이와 감사이벤트 발행을 단위 검증
- 수동: 개발 테넌트 add-in에서 이메일 1건 파일링→30초 내 태스크페인 상태가 '완료'로 바뀌고 웹 Matter 타임라인에 해당 이메일(제목·첨부)이 표시되면 통과

Manual QA requirement:

- 수동: 개발 테넌트 add-in에서 이메일 1건 파일링→30초 내 태스크페인 상태가 '완료'로 바뀌고 웹 Matter 타임라인에 해당 이메일(제목·첨부)이 표시되면 통과

Migration requirements:

- db/migrations/0070_create_outlook_filing_requests.sql (상태기계 168행)
- 신규: db/migrations/0099_outlook_filing_fulfillment_audit_actions.sql
- **Scope:** 기존 pg-boss 큐 패턴(extraction-queue.service.ts)을 재사용해 outlook_filing_requests 소비 워커 신규 작성: createFilingRequest 시 잡 enqueue, 소비자가 queued→processing 전이 후 C5 트랜스포트로 MIME 취득, 기존 EmailService.importRawEmail에 위임해 email_messages·email_document_links·email_matter_filings 기록, email_record_id 역기입 후 completed 전이. 실패 시 failed+failure_reason_code와 pg-boss 재시도/백오프, 중복(EmailDuplicateMessageError) 시 기존 email_record_id로 completed 처리, 부분 첨부 실패 시 보상 정리(importRawEmail의 기존 스토리지 보상삭제 재사용). 이행 감사이벤트 추가(감사 액션 CHECK 확장 마이그레이션 포함). add-in 태스크페인의 요청 상태 표시를 email_record_id 완료 상태와 연결. send-and-file 이그레스와 autofile 엔진은 범위 외(C14/C13).
- - `db/migrations/0070_create_outlook_filing_requests.sql (상태기계 168행)`
- - `신규: db/migrations/0099_outlook_filing_fulfillment_audit_actions.sql`

Audit/security invariants:

- **Scope:** 기존 pg-boss 큐 패턴(extraction-queue.service.ts)을 재사용해 outlook_filing_requests 소비 워커 신규 작성: createFilingRequest 시 잡 enqueue, 소비자가 queued→processing 전이 후 C5 트랜스포트로 MIME 취득, 기존 EmailService.importRawEmail에 위임해 email_messages·email_document_links·email_matter_filings 기록, email_record_id 역기입 후 completed 전이. 실패 시 failed+failure_reason_code와 pg-boss 재시도/백오프, 중복(EmailDuplicateMessageError) 시 기존 email_record_id로 completed 처리, 부분 첨부 실패 시 보상 정리(importRawEmail의 기존 스토리지 보상삭제 재사용). 이행 감사이벤트 추가(감사 액션 CHECK 확장 마이그레이션 포함). add-in 태스크페인의 요청 상태 표시를 email_record_id 완료 상태와 연결. send-and-file 이그레스와 autofile 엔진은 범위 외(C14/C13).
- - `apps/api/src/modules/email/email.service.ts (importRawEmail 389-564행)`
- - `apps/api/src/modules/outlook/outlook-audit.events.ts`
- - `신규: db/migrations/0099_outlook_filing_fulfillment_audit_actions.sql`
- - 신규 tests/integration/document-access/outlook-filing-fulfillment.spec.ts: 픽스처 MIME을 반환하는 fake 트랜스포트를 주입해 (1) queued 요청이 completed로 전이되고 email_messages 행·email_matter_filings·email_record_id 역기입이 모두 생성됨, (2) 트랜스포트 denied 시 failed+failure_reason_code 기록, (3) 동일 message_id 중복 시 기존 이메일로 completed, (4) cross-tenant 요청이 RLS로 차단됨 — 4케이스 실DB assert
- - outlook-fulfillment.service.spec.ts: 재시도 소진 후 failed 전이와 감사이벤트 발행을 단위 검증
- - 수동: 개발 테넌트 add-in에서 이메일 1건 파일링→30초 내 태스크페인 상태가 '완료'로 바뀌고 웹 Matter 타임라인에 해당 이메일(제목·첨부)이 표시되면 통과

External evidence needs:

- [object Object]
- [object Object]
- [object Object]

Codex implementation/evidence tasks:

- after operator receipt arrives, rerun focused checks and ledger promotion gate

User/operator actions:

- provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens
- provide real sanitized fixture or staging sample receipt for the named artifact
- provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence
- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- Required C6 development M365 manual receipt is missing: file one real email from the add-in and capture that the task pane status changes to completed within 30 seconds and the web Matter timeline shows the filed email subject and attachment.
- Required real worker-path receipt is missing: createFilingRequest -> pg-boss queued job -> OutlookFulfillmentQueueService worker consumption -> completed status has not been observed against a running local/staging worker process with sanitized logs/audit IDs.
- Required upstream Outlook evidence remains missing: C1 actual Outlook-exported .eml, C2 real forwarded .eml parsing, C4 development M365 identity receipts, and C5 real Graph $value/MIME sha256/admin-consent receipts must be present or referenced before C6 promotion.

Promotion gate:

- close gap: Required C6 development M365 manual receipt is missing: file one real email from the add-in and capture that the task pane status changes to completed within 30 seconds and the web Matter timeline shows the filed email subject and attachment.
- close gap: Required real worker-path receipt is missing: createFilingRequest -> pg-boss queued job -> OutlookFulfillmentQueueService worker consumption -> completed status has not been observed against a running local/staging worker process with sanitized logs/audit IDs.
- close gap: Required upstream Outlook evidence remains missing: C1 actual Outlook-exported .eml, C2 real forwarded .eml parsing, C4 development M365 identity receipts, and C5 real Graph $value/MIME sha256/admin-consent receipts must be present or referenced before C6 promotion.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage

### LCX-TUW80-D4 semantic/hybrid 검색 실질화 + 웹 UI 모드 노출

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: Codex + operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:647`
Tags: `manual-qa`, `lsp`, `m365-office`
Evidence refs currently recorded: 63

Dependencies:

- D2
- D3

Primary code anchors:

- apps/api/src/modules/search/query/search-query.builder.ts
- apps/api/src/modules/search/search.service.ts
- apps/web/src/app/(app)/search/search-client.tsx
- apps/web/src/app/(app)/search/page.tsx
- apps/web/src/components/search/search-bar.tsx
- apps/web/src/components/search/result-card.tsx
- apps/web/src/components/search/search-save-panel.tsx
- packages/shared/src/search/search-query.dto.ts
- db/migrations/0081_create_saved_searches.sql

Acceptance tests:

- apps/web/src/components/search/search-bar.test.tsx: 모드 토글 렌더·선택 변경 시 콜백 호출 검증, apps/web/src/components/search/result-card.test.tsx: semantic 결과에 유사도 % 렌더 검증(기존 부정 단언 갱신)
- tests/integration/search-permission/search-semantic.spec.ts에 실임베딩 케이스 추가: '계약 해지' 질의가 '계약의 종료' 문구 청크를 hybrid 모드에서 히트하고, 권한 밖 사용자는 동일 질의에서 미히트
- 통합테스트: saved search에 mode='hybrid' 저장 후 재실행 시 동일 모드로 질의됨을 API 레벨에서 단언 (tests/integration/search-permission/search-filter-endpoint.spec.ts 확장)
- 수동: /search에서 의미 모드 선택 → 동의어 질의 → 유사도 배지가 붙은 결과 확인, URL 복사 후 새 탭에서 열면 모드가 유지되면 통과

Manual QA requirement:

- 수동: /search에서 의미 모드 선택 → 동의어 질의 → 유사도 배지가 붙은 결과 확인, URL 복사 후 새 탭에서 열면 모드가 유지되면 통과

Migration requirements:

- db/migrations/0081_create_saved_searches.sql
- - `db/migrations/0081_create_saved_searches.sql`

Audit/security invariants:

- **Scope:** (1) search-query.builder.ts buildVector/buildVectorChunks의 vectorParam을 질의 시 embedText 1회 호출한 실임베딩으로 교체(코드 구조는 준비되어 있음). (2) search-bar.tsx에 모드 토글(키워드/의미/하이브리드) 추가, search-client.tsx requestForState()에 mode 직렬화, URL 파라미터 및 saved_searches(0081/0083) 저장·복원에 mode 반영. (3) result-card.tsx에 semantic/hybrid 모드 시 유사도 %와 매치 청크 컨텍스트 표시. (4) 검색 감사 메타데이터에 mode·zero-result 여부 기록(향후 품질 튜닝용, 기존 query 해시 프라이버시 정책 유지). 자연어 질의 UI(D10)와 재랭킹 고도화는 제외.
- - tests/integration/search-permission/search-semantic.spec.ts에 실임베딩 케이스 추가: '계약 해지' 질의가 '계약의 종료' 문구 청크를 hybrid 모드에서 히트하고, 권한 밖 사용자는 동일 질의에서 미히트
- - 통합테스트: saved search에 mode='hybrid' 저장 후 재실행 시 동일 모드로 질의됨을 API 레벨에서 단언 (tests/integration/search-permission/search-filter-endpoint.spec.ts 확장)
- ### E: AI Assistant & Governance

External evidence needs:

- [object Object]
- [object Object]

Codex implementation/evidence tasks:

- retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy

User/operator actions:

- provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens
- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- Collect the staging/manual /search semantic synonym-result receipt: mode selected in the UI, synonym/paraphrase result with similarity badge and matched context, and copied/new-tab URL preserving query plus mode. Local browser evidence still does not substitute for staging/manual evidence.
- After the staging/manual receipt is collected, rerun focused D4 tests, search-semantic/search-filter-endpoint integration, affected package checks, changed-file LSP diagnostics, ledger regeneration, and diff hygiene before considering COMPLETE_CANDIDATE promotion.

Promotion gate:

- close gap: Collect the staging/manual /search semantic synonym-result receipt: mode selected in the UI, synonym/paraphrase result with similarity badge and matched context, and copied/new-tab URL preserving query plus mode. Local browser evidence still does not substitute for staging/manual evidence.
- close gap: After the staging/manual receipt is collected, rerun focused D4 tests, search-semantic/search-filter-endpoint integration, affected package checks, changed-file LSP diagnostics, ledger regeneration, and diff hygiene before considering COMPLETE_CANDIDATE promotion.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage

### LCX-TUW80-E1 Matter 상세 AI 질의 패널 — RAG 파이프라인 최초 사용자 노출

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: Codex + operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:674`
Tags: `manual-qa`, `lsp`
Evidence refs currently recorded: 28

Dependencies:

- none

Primary code anchors:

- 신규: apps/web/src/lib/api/ai-assistant.ts (apps/web/src/lib/api/ai-prep.ts 클라이언트 패턴 재사용)
- 신규: apps/web/src/components/ai/ai-assistant-panel.tsx
- apps/web/src/app/(app)/matters/[matterId]/page.tsx
- apps/web/src/app/(app)/documents/[id]/page.tsx (chunk 앵커 수신)
- apps/web/src/components/ai/ai-prep-matter-dashboard.tsx (패널 배치 패턴 재사용)
- apps/api/src/modules/ai/features/ai-summary.controller.ts
- apps/api/src/modules/ai/session/ai-session.controller.ts
- apps/api/src/modules/ai/feedback/ai-feedback.controller.ts
- packages/shared/src/ai/summary.ts (응답 DTO 타입 소스)

Acceptance tests:

- 신규 apps/web/src/components/ai/ai-assistant-panel.test.tsx: 모의 응답으로 sections/citations 렌더, citation 클릭 시 /documents/{id}?chunk={ordinal} 링크 생성, escalationRequired=true 시 '변호사 검토 필요' 배지, hiddenSourceCount>0 시 제외 내역 표시를 단언
- 신규 apps/web/src/lib/api/ai-assistant.spec.ts: 요청/응답 zod 파싱과 403 AI_POLICY_BLOCKED → 사용자 오류 메시지 매핑을 단언
- 기존 tests/integration/ai-summaries.spec.ts, ai-session.spec.ts 전체 통과(API 계약 무변경 확인)
- 수동: 변호사 계정으로 Matter 상세 → AI 패널에서 '이 사건의 계약 상대방은?' 질의 → 인용 달린 답변 표시, 인용 클릭 시 해당 문서 상세로 이동, '검색·인용·제외 내역'에 세션 청크 목록이 표시되면 통과

Manual QA requirement:

- 수동: 변호사 계정으로 Matter 상세 → AI 패널에서 '이 사건의 계약 상대방은?' 질의 → 인용 달린 답변 표시, 인용 클릭 시 해당 문서 상세로 이동, '검색·인용·제외 내역'에 세션 청크 목록이 표시되면 통과

Migration requirements:

- none

Audit/security invariants:

- #### E1 [L] Matter 상세 AI 질의 패널 — RAG 파이프라인 최초 사용자 노출
- **Goal:** 사용자가 Matter 상세 화면에서 사건에 대해 자연어로 질문하고, 인용이 달린 답변을 받아 인용 클릭으로 원문 문서로 이동하며, 해당 답변의 검색·인용·제외 내역(hiddenSourceCount 포함)을 확인할 수 있다.
- **Scope:** 신규 web API 클라이언트(ai-assistant.ts)로 기존 POST /ai/summaries(task=matter_qa|matter_summary), GET /ai/sessions/:id, POST /ai/feedback을 연결한다. Matter 상세에 AI 질의 패널 컴포넌트를 추가: 질문 입력, 응답 DTO의 sections/citations/claims/warnings/citationWarnings/escalationRequired 렌더링, citationRef 클릭 시 /documents/[id]?chunk={ordinal}로 이동, GET /ai/sessions/:id 기반 '검색·인용·제외 내역' 접이식 감사 뷰, 도움됨/오류 피드백 버튼. API 변경 없음. SSE 스트리밍은 만들지 않음(동기 응답+낙관적 로딩) — 후속 과제로 남긴다.
- - `신규: apps/web/src/lib/api/ai-assistant.ts (apps/web/src/lib/api/ai-prep.ts 클라이언트 패턴 재사용)`
- - `신규: apps/web/src/components/ai/ai-assistant-panel.tsx`
- - `apps/web/src/components/ai/ai-prep-matter-dashboard.tsx (패널 배치 패턴 재사용)`
- - `apps/api/src/modules/ai/features/ai-summary.controller.ts`
- - `apps/api/src/modules/ai/session/ai-session.controller.ts`
- - `apps/api/src/modules/ai/feedback/ai-feedback.controller.ts`
- - `packages/shared/src/ai/summary.ts (응답 DTO 타입 소스)`
- - 신규 apps/web/src/components/ai/ai-assistant-panel.test.tsx: 모의 응답으로 sections/citations 렌더, citation 클릭 시 /documents/{id}?chunk={ordinal} 링크 생성, escalationRequired=true 시 '변호사 검토 필요' 배지, hiddenSourceCount>0 시 제외 내역 표시를 단언
- - 신규 apps/web/src/lib/api/ai-assistant.spec.ts: 요청/응답 zod 파싱과 403 AI_POLICY_BLOCKED → 사용자 오류 메시지 매핑을 단언
- - 기존 tests/integration/ai-summaries.spec.ts, ai-session.spec.ts 전체 통과(API 계약 무변경 확인)
- - 수동: 변호사 계정으로 Matter 상세 → AI 패널에서 '이 사건의 계약 상대방은?' 질의 → 인용 달린 답변 표시, 인용 클릭 시 해당 문서 상세로 이동, '검색·인용·제외 내역'에 세션 청크 목록이 표시되면 통과
- - (앵커 부정확) E1은 기존 retrieval orchestrator 노출이라 deps 없음이 성립하지만, D2/D3 이전에는 16차원 해시 벡터라 첫 사용자 경험의 의미 검색 품질이 낮다. 하드 dep은 아니되 'D2/D3 이후 배치 권장' 소프트 의존을 명시해 H1 내 착수 순서를 고정하라(첫인상 리스크 관리).

External evidence needs:

- none

Codex implementation/evidence tasks:

- retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy

User/operator actions:

- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- Collect the authoritative staging/manual QA receipt: lawyer account Matter detail -> ask '이 사건의 계약 상대방은?' -> cited answer displayed -> citation click navigates to document detail -> '검색·인용·제외 내역' lists session chunks including hiddenSourceCount/exclusions.
- After the staging/manual receipt is collected, rerun focused E1 web tests, ai-summaries/ai-session integration suites, web lint/typecheck/build, LSP diagnostics, sloplint/diff hygiene, ledger regeneration, and git diff check before considering COMPLETE_CANDIDATE promotion.

Promotion gate:

- close gap: Collect the authoritative staging/manual QA receipt: lawyer account Matter detail -> ask '이 사건의 계약 상대방은?' -> cited answer displayed -> citation click navigates to document detail -> '검색·인용·제외 내역' lists session chunks including hiddenSourceCount/exclusions.
- close gap: After the staging/manual receipt is collected, rerun focused E1 web tests, ai-summaries/ai-session integration suites, web lint/typecheck/build, LSP diagnostics, sloplint/diff hygiene, ledger regeneration, and git diff check before considering COMPLETE_CANDIDATE promotion.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage

### LCX-TUW80-E3 답변 구조 스펙 완성 — 결론/불확실부분/추가확인자료/권장조치/권한제외 표시

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: Codex + operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:733`
Tags: `manual-qa`, `lsp`
Evidence refs currently recorded: 33

Dependencies:

- E1

Primary code anchors:

- packages/shared/src/ai/summary.ts (aiSummaryResponseSchema)
- packages/shared/src/ai/generation.ts (aiGroundedClaimKindSchema — 'question' 기존재)
- apps/api/src/modules/ai/context/evidence-pack.builder.ts (70-76 uncertainty)
- apps/api/src/modules/ai/features/ai-summary.service.ts (163-178 응답 조립)
- apps/web/src/components/ai/ai-assistant-panel.tsx (E1 산출물)
- tests/integration/ai-summaries.spec.ts

Acceptance tests:

- packages/shared/src/ai/summary.spec.ts 확장: 신규 4개 필드 스키마 검증 — conclusion 필수, recommendedActions 비어있지 않으면 escalationRequired=true 강제 위반 시 파싱 실패를 단언
- apps/api/src/modules/ai/features/ai-summary.service.spec.ts: evidence pack uncertainty가 openQuestions로 노출되고 omitted 청크 문서 수가 excludedSourcesNotice.count와 일치함을 단언
- tests/integration/ai-summaries.spec.ts 확장: 응답 JSON에 4개 필드가 항상 존재(빈 배열 허용)함을 단언
- 수동: E1 패널에서 질의 → '결론 / 불확실한 부분 / 추가 확인 자료 / 권장 조치' 4개 섹션이 렌더되고 권장 조치에 검토 필요 배지가 동반되면 통과

Manual QA requirement:

- 수동: E1 패널에서 질의 → '결론 / 불확실한 부분 / 추가 확인 자료 / 권장 조치' 4개 섹션이 렌더되고 권장 조치에 검토 필요 배지가 동반되면 통과

Migration requirements:

- none

Audit/security invariants:

- #### E3 [M] 답변 구조 스펙 완성 — 결론/불확실부분/추가확인자료/권장조치/권한제외 표시
- **Goal:** AI 답변이 사양서 §8.3 구조(결론·근거문서·인용·불확실부분·추가확인자료·권장조치·권한제외자료 표시)로 반환되고, E1 패널에 4개 신규 섹션이 그대로 렌더링된다.
- **Scope:** packages/shared/src/ai/summary.ts의 aiSummaryResponseSchema에 conclusion(단일 결론), openQuestions[](불확실·추가확인 — evidence pack 내부 uncertainty 필드를 응답으로 승격), recommendedActions[](존재 시 escalationRequired=true 강제), excludedSourcesNotice{count}를 추가. 기존 grounded claims kind 'question'을 openQuestions에 매핑. ai-summary.service.ts 응답 조립과 E1 패널 렌더러를 갱신. 인용 위치의 페이지/문단 정밀화(page_no/char_offset)는 ingestion chunking 소관(D 워크스트림)으로 제외하고 chunkId·ordinal 수준 유지.
- - `packages/shared/src/ai/summary.ts (aiSummaryResponseSchema)`
- - `packages/shared/src/ai/generation.ts (aiGroundedClaimKindSchema — 'question' 기존재)`
- - `apps/api/src/modules/ai/context/evidence-pack.builder.ts (70-76 uncertainty)`
- - `apps/api/src/modules/ai/features/ai-summary.service.ts (163-178 응답 조립)`
- - `apps/web/src/components/ai/ai-assistant-panel.tsx (E1 산출물)`
- - `tests/integration/ai-summaries.spec.ts`
- - packages/shared/src/ai/summary.spec.ts 확장: 신규 4개 필드 스키마 검증 — conclusion 필수, recommendedActions 비어있지 않으면 escalationRequired=true 강제 위반 시 파싱 실패를 단언
- - apps/api/src/modules/ai/features/ai-summary.service.spec.ts: evidence pack uncertainty가 openQuestions로 노출되고 omitted 청크 문서 수가 excludedSourcesNotice.count와 일치함을 단언
- - tests/integration/ai-summaries.spec.ts 확장: 응답 JSON에 4개 필드가 항상 존재(빈 배열 허용)함을 단언

External evidence needs:

- none

Codex implementation/evidence tasks:

- retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy

User/operator actions:

- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- Collect the authoritative manual QA receipt through the real E1 panel with a lawyer account: ask a Matter AI question and capture that 결론 / 불확실한 부분 / 추가 확인 자료 / 권장 조치 render in the live UI with the review badge when recommendedActions are present.
- After the real E1 panel manual receipt is collected, rerun the focused E3 shared/API/web/integration checks, LSP diagnostics or documented LSP limitation, ledger rebuild, and diff hygiene before considering COMPLETE_CANDIDATE promotion.

Promotion gate:

- close gap: Collect the authoritative manual QA receipt through the real E1 panel with a lawyer account: ask a Matter AI question and capture that 결론 / 불확실한 부분 / 추가 확인 자료 / 권장 조치 render in the live UI with the review badge when recommendedActions are present.
- close gap: After the real E1 panel manual receipt is collected, rerun the focused E3 shared/API/web/integration checks, LSP diagnostics or documented LSP limitation, ledger rebuild, and diff hygiene before considering COMPLETE_CANDIDATE promotion.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage

### LCX-TUW80-E4 금지문서 '제외 후 계속' — 전체 거부에서 청크 단위 제외로 전환

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: Codex + operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:755`
Tags: `manual-qa`, `lsp`
Evidence refs currently recorded: 31

Dependencies:

- E3

Primary code anchors:

- apps/api/src/modules/ai-policy/ai-policy.evaluator.ts (104-106 documents.some(!aiAllowed) 전체 DENY)
- apps/api/src/modules/ai/retrieval/retrieval-orchestrator.service.ts (207-223 사후 정책검사)
- apps/api/src/modules/ai/session/ai-session-log.service.ts (141-160 included/reason_code upsert 경로)
- apps/api/src/modules/ai/audit/ai-audit-recorder.service.ts (AI_RETRIEVAL_EXCLUDED)
- db/migrations/0050_create_ai_sessions.sql (ai_session_chunks 스키마)
- tests/integration/ai-policy.spec.ts
- tests/integration/ai-retrieval.spec.ts

Acceptance tests:

- apps/api/src/modules/ai-policy/ai-policy.evaluator.spec.ts 확장: 허용+금지 혼합 문서 셋 입력 시 partition 결과(허용/제외+reason) 반환, 전건 금지 시 DENY 판정을 단언
- tests/integration/ai-retrieval.spec.ts 확장: 금지 1건+허용 2건 시나리오에서 200 응답, 제외 청크가 ai_session_chunks에 included=false·reason_code='ai_policy_blocked'로 기록, excludedSourcesNotice.count가 제외 문서 수와 일치, AI_RETRIEVAL_EXCLUDED 감사 이벤트 존재를 단언
- tests/integration/ai-retrieval.spec.ts: 전 문서 금지 시 403 AI_POLICY_BLOCKED 유지(fail-closed 회귀)를 단언
- 수동: ai_allowed=false로 지정한 문서가 포함된 매터에서 E1 패널 질의 → 답변과 함께 '정책상 제외된 자료 N건' 안내가 표시되면 통과

Manual QA requirement:

- 수동: ai_allowed=false로 지정한 문서가 포함된 매터에서 E1 패널 질의 → 답변과 함께 '정책상 제외된 자료 N건' 안내가 표시되면 통과

Migration requirements:

- db/migrations/0050_create_ai_sessions.sql (ai_session_chunks 스키마)
- - `db/migrations/0050_create_ai_sessions.sql (ai_session_chunks 스키마)`

Audit/security invariants:

- **Goal:** ai_allowed=false 문서가 검색 결과에 섞여도 요청 전체가 거부되지 않고, 해당 문서 청크만 제외 표시된 채 허용 자료만으로 답변이 생성되며 제외 사실이 사용자에게 표시된다.
- **Scope:** ai-policy.evaluator.ts에 문서 단위 partition 평가(허용 목록/제외 목록+사유)를 추가하고, retrieval-orchestrator.service.ts의 사후 정책검사(207-223행)를 '차단 문서 청크 필터링' 모드로 변경: 거부 청크를 ai_session_chunks에 included=false, reason_code='ai_policy_blocked'로 적재(스키마 기존재)하고 나머지로 계속. 응답 excludedSourcesNotice에 건수 반영, AI_RETRIEVAL_EXCLUDED 감사 기록 유지. 모든 후보가 금지인 경우에만 기존 AI_POLICY_BLOCKED 전량 거부. 신규 민감도 라벨 체계는 만들지 않는다.
- **완화 노트:** 사양서 §8.5 6단계의 별도 민감도 라벨 확인 스테이지는 라벨 9종 신설 없이 현행 3단계 비밀등급+privilege 플래그+ai_allowed 이진 플래그 조합으로 대체(간소화 정책).
- - `apps/api/src/modules/ai-policy/ai-policy.evaluator.ts (104-106 documents.some(!aiAllowed) 전체 DENY)`
- - `apps/api/src/modules/ai/retrieval/retrieval-orchestrator.service.ts (207-223 사후 정책검사)`
- - `apps/api/src/modules/ai/session/ai-session-log.service.ts (141-160 included/reason_code upsert 경로)`
- - `apps/api/src/modules/ai/audit/ai-audit-recorder.service.ts (AI_RETRIEVAL_EXCLUDED)`
- - `db/migrations/0050_create_ai_sessions.sql (ai_session_chunks 스키마)`
- - `tests/integration/ai-policy.spec.ts`
- - `tests/integration/ai-retrieval.spec.ts`
- - apps/api/src/modules/ai-policy/ai-policy.evaluator.spec.ts 확장: 허용+금지 혼합 문서 셋 입력 시 partition 결과(허용/제외+reason) 반환, 전건 금지 시 DENY 판정을 단언
- - tests/integration/ai-retrieval.spec.ts 확장: 금지 1건+허용 2건 시나리오에서 200 응답, 제외 청크가 ai_session_chunks에 included=false·reason_code='ai_policy_blocked'로 기록, excludedSourcesNotice.count가 제외 문서 수와 일치, AI_RETRIEVAL_EXCLUDED 감사 이벤트 존재를 단언
- - tests/integration/ai-retrieval.spec.ts: 전 문서 금지 시 403 AI_POLICY_BLOCKED 유지(fail-closed 회귀)를 단언
- - 수동: ai_allowed=false로 지정한 문서가 포함된 매터에서 E1 패널 질의 → 답변과 함께 '정책상 제외된 자료 N건' 안내가 표시되면 통과

External evidence needs:

- none

Codex implementation/evidence tasks:

- retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy

User/operator actions:

- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- Manual QA receipt missing: E1 panel question on a matter containing ai_allowed=false material must show the answer and a policy-excluded 자료 N건 notice.
- After the manual receipt is collected, rerun focused E4 unit/integration/typecheck/lint/build/LSP/diff hygiene before any COMPLETE_CANDIDATE promotion.

Promotion gate:

- close gap: Manual QA receipt missing: E1 panel question on a matter containing ai_allowed=false material must show the answer and a policy-excluded 자료 N건 notice.
- close gap: After the manual receipt is collected, rerun focused E4 unit/integration/typecheck/lint/build/LSP/diff hygiene before any COMPLETE_CANDIDATE promotion.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage

### LCX-TUW80-F4 Citation Ledger 영속화 — ai_claims/ai_claim_citations 원장 테이블

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: Codex + operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:782`
Tags: `manual-qa`, `lsp`
Evidence refs currently recorded: 30

Dependencies:

- none

Primary code anchors:

- db/migrations/0050_create_ai_sessions.sql
- db/migrations/0068_harden_ai_prep_completed_payload.sql
- 신규: db/migrations/00XX_create_ai_claims_ledger.sql (missing)
- apps/api/src/modules/ai/generation/local-gemma-generation.service.ts
- apps/api/src/modules/ai/generation/grounded-output.guard.ts
- apps/api/src/modules/ai/citation/citation-mapper.service.ts
- apps/api/src/modules/ai/features/ai-summary.service.ts
- tests/integration/ai-citations.spec.ts
- 신규: tests/integration/ai-claims-ledger.spec.ts

Acceptance tests:

- 신규 tests/integration/ai-claims-ledger.spec.ts (ai-citations.spec.ts 패턴): POST /ai/summaries 성공 후 ai_claims 행 수 = 응답 claims 수, 각 claim에 ai_claim_citations ≥1행, chunk_id가 실존 document_chunks를 가리킴 assert
- 동일 spec: citation 0건인 claim 행을 raw INSERT 시…86496 tokens truncated…ifest.mjs
- apps/api/src/modules/graph/graph-sync.service.ts
- apps/web/src/lib/api-client.ts

Acceptance tests:

- 자동: 신규 apps/web/src/app/word-addin/word-addin-client.test.tsx — 검색 입력→조항 목록 렌더→삽입 버튼이 Office.js 목(insertOoxml)을 조항 본문으로 호출, 미인증 시 로그인 유도(outlook-addin-client.test.tsx 패턴)
- 자동: 신규 apps/web/src/app/word-addin/word-manifest.spec.ts — 렌더된 manifest가 Word 호스트·taskpane URL·권한 스코프 스키마 검증 통과
- 자동: 조항 삽입 감사 이벤트가 기록되는 API 통합 테스트(tests/integration/graph.spec.ts 확장 또는 신규 clause-insertion.spec.ts)
- 수동: 데스크톱 Word에 사이드로드 → '해지 조항' 검색 → 삽입 → 문서 커서 위치에 조항 본문 삽입 확인, 감사 콘솔에 이벤트 표시면 통과

Manual QA requirement:

- 수동: 데스크톱 Word에 사이드로드 → '해지 조항' 검색 → 삽입 → 문서 커서 위치에 조항 본문 삽입 확인, 감사 콘솔에 이벤트 표시면 통과

Migration requirements:

- none

Audit/security invariants:

- **Scope:** 만드는 것: (1) Office.js Word add-in — 기존 Outlook add-in 구조(apps/web/src/app/outlook-addin/, SSO·권한·감사 패턴)를 복제한 apps/web/src/app/word-addin/ 라우트와 taskpane UI. (2) 조항은행 검색 API(F 워크스트림 조항은행) 호출 → 조항 미리보기 → Word JS API(body.insertOoxml/insertText)로 커서 위치 삽입, 삽입 이벤트 감사 기록(문서 컨텍스트·조항 ID). (3) manifest 렌더링 도구(render-outlook-manifest.mjs 패턴)로 word-addin manifest 생성과 배포 체크 스크립트. 만들지 않는 것: Vault 문서를 Word에서 직접 여는 WOPI 경로(B12/ADR-018 결정 사항), 조항 자동 추천(F 후속), Excel/PowerPoint add-in.
- - 자동: 신규 apps/web/src/app/word-addin/word-addin-client.test.tsx — 검색 입력→조항 목록 렌더→삽입 버튼이 Office.js 목(insertOoxml)을 조항 본문으로 호출, 미인증 시 로그인 유도(outlook-addin-client.test.tsx 패턴)
- - 자동: 신규 apps/web/src/app/word-addin/word-manifest.spec.ts — 렌더된 manifest가 Word 호스트·taskpane URL·권한 스코프 스키마 검증 통과
- - 자동: 조항 삽입 감사 이벤트가 기록되는 API 통합 테스트(tests/integration/graph.spec.ts 확장 또는 신규 clause-insertion.spec.ts)
- - 수동: 데스크톱 Word에 사이드로드 → '해지 조항' 검색 → 삽입 → 문서 커서 위치에 조항 본문 삽입 확인, 감사 콘솔에 이벤트 표시면 통과
- ### C: Email Vault

External evidence needs:

- [object Object]

Codex implementation/evidence tasks:

- clear or explicitly disposition unrelated broad-check blockers before promotion
- retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy

User/operator actions:

- provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens
- provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence
- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- Desktop Word sideload manual QA is missing: search for 해지 조항, insert at cursor, and observe the clause body in the document.
- Audit-console manual receipt for the Word insertion event is missing, even though the focused DB integration proves sanitized audit metadata.
- Changed-file LSP diagnostics are unavailable because the LSP transport returned Transport closed.
- Full contract-intel integration file has a pre-existing unrelated similar-clause ranking assertion failure; the focused B14 integration test passes.
- Production Microsoft 365/Word deployment or sideload evidence is not present.

Promotion gate:

- close gap: Desktop Word sideload manual QA is missing: search for 해지 조항, insert at cursor, and observe the clause body in the document.
- close gap: Audit-console manual receipt for the Word insertion event is missing, even though the focused DB integration proves sanitized audit metadata.
- close gap: Changed-file LSP diagnostics are unavailable because the LSP transport returned Transport closed.
- close gap: Full contract-intel integration file has a pre-existing unrelated similar-clause ranking assertion failure; the focused B14 integration test passes.
- close gap: Production Microsoft 365/Word deployment or sideload evidence is not present.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage

### LCX-TUW80-C14 송부 전 DLP 콘텐츠 검사 — Smart Alerts 클라이언트 스캔 + 이그레스 서버 스캔

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: Codex + operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:2677`
Tags: `manual-qa`, `lsp`, `m365-office`, `repo-implementation`, `external-ops`, `dependency-gated`
Evidence refs currently recorded: 18

Dependencies:

- C6
- C7(add-in 파일럿 배포 전제)

Primary code anchors:

- apps/api/src/modules/dlp/sensitive-data.detector.ts (규칙 43-94행 shared로 이동)
- apps/api/src/modules/dlp/dlp.service.ts (scanAndRecord, model_egress 패턴 72-102행)
- apps/api/src/modules/outlook/outlook-send-file.service.ts (evaluatePolicyInternal 328-363행)
- apps/api/src/modules/outlook/outlook-send-file.service.spec.ts
- apps/web/public/outlook-addin/smart-alerts.js (fail-open 228-230행)
- packages/shared/src/outlook/outlook-types.ts (send policy 스키마 122-185행)
- db/migrations/0044_r5_dlp_egress_and_detector_constraints.sql (패턴 참조)
- 신규: packages/shared/src/dlp/sensitive-data-rules.ts (missing)
- 신규: packages/shared/src/dlp/sensitive-data-rules.spec.ts (missing)
- 신규: db/migrations/01xx_dlp_email_egress_source.sql (missing)

Acceptance tests:

- packages/shared/src/dlp/sensitive-data-rules.spec.ts: 기존 apps/api/src/modules/dlp/sensitive-data.detector.spec.ts의 전 케이스를 shared로 이식해 동작 동일성 회귀 검증(주민번호·계좌·카드Luhn 등 검출/비검출 케이스 전부 통과)
- outlook-send-file.service.spec.ts 확장: dlp_finding 경고코드 보고 시 (1) 일반 검출+외부수신자→경고+승인 요구, (2) restricted급 검출→승인 불가 차단, (3) 스캔 실패 보고→경고 후 허용 — 3케이스 판정 assert
- 신규 tests/integration/document-access/email-egress-dlp.spec.ts: 주민번호 포함 픽스처 MIME으로 send_and_file 이행 시 dlp_findings(source_type='email_egress') 기록+block 판정 시 파일링 failed+감사이벤트 assert
- 수동: 개발 테넌트에서 주민번호를 본문에 넣고 외부 주소로 발송 시도→Smart Alert 차단 프롬프트 표시, 제거 후 발송 성공하면 통과

Manual QA requirement:

- 수동: 개발 테넌트에서 주민번호를 본문에 넣고 외부 주소로 발송 시도→Smart Alert 차단 프롬프트 표시, 제거 후 발송 성공하면 통과

Migration requirements:

- db/migrations/0044_r5_dlp_egress_and_detector_constraints.sql (패턴 참조)
- 신규: db/migrations/01xx_dlp_email_egress_source.sql
- **Scope:** (1) SensitiveDataDetector의 한국형 검출 규칙(주민번호·외국인등록번호·계좌·여권·카드Luhn 등)을 packages/shared로 이동하고 apps/api detector는 shared 규칙을 소비하도록 리팩터(동작 동일성 유지). (2) smart-alerts.js OnMessageSend 핸들러에서 item.body.getAsync 본문+접근 가능한 첨부를 로컬 스캔, 판정코드·매칭 항목 해시만 서버 보고(제로 콘텐츠 원칙 유지), evaluateSendPolicy에 dlp_finding 경고코드 추가 — restricted급 검출+외부수신자 조합은 승인 불가 차단. (3) 현행 오류 시 completeAllow fail-open(smart-alerts.js 228-230행)을 'DLP 스캔 실패 시 경고 후 허용, 정책 차단 판정 시 fail-close'로 명시화. (4) 서버측: C6 이행 워커가 send_and_file 원문 취득 시 DlpService.scanAndRecord 실행 — dlp_findings에 source_type='email_egress' 추가 마이그레이션(0044 패턴 준용), block 판정 시 파일링 실패 처리+감사. 대량 다운로드 임계 알림 등 다른 DLP 확장은 범위 외.
- - `db/migrations/0044_r5_dlp_egress_and_detector_constraints.sql (패턴 참조)`
- - `신규: db/migrations/01xx_dlp_email_egress_source.sql`
- - (완화정책 위반) 완화정책 '유지하되 간소화'는 DLP를 '현행 한국형 검출기 유지 + 간단한 대량 다운로드 임계 알림 1건'으로 한정하는데, C14는 송부 전 콘텐츠 검사라는 새 DLP 표면(클라이언트 Smart Alerts 스캔, 서버 이그레스 MIME 스캔, restricted급 차단 정책, 신규 source_type 마이그레이션, 검출 규칙 shared 패키지 이관)을 추가해 이 한정을 초과한다. 유닛을 제거하거나 정책 예외로 명시 승인을 받아라. 유지가 필요하면 최소 범위로 축소: 기존 apps/api/src/modules/dlp/sensitive-data.detector.ts를 그대로 재사용해 send_and_file 이행 시 서버측 경고(감사이벤트 기록) 전용으로 한정하고, 차단 판정·클라이언트 스캔·규칙 이관은 제외하라.

Audit/security invariants:

- #### C14 [M] 송부 전 DLP 콘텐츠 검사 — Smart Alerts 클라이언트 스캔 + 이그레스 서버 스캔
- **Goal:** 외부 수신자에게 이메일을 보내기 전 주민번호·계좌 등 민감정보가 본문·첨부에서 검출되면 Smart Alert로 경고·차단되고, send-and-file 이행 시 서버가 원문을 재검사해 이그레스 판정을 감사에 남긴다.
- **Scope:** (1) SensitiveDataDetector의 한국형 검출 규칙(주민번호·외국인등록번호·계좌·여권·카드Luhn 등)을 packages/shared로 이동하고 apps/api detector는 shared 규칙을 소비하도록 리팩터(동작 동일성 유지). (2) smart-alerts.js OnMessageSend 핸들러에서 item.body.getAsync 본문+접근 가능한 첨부를 로컬 스캔, 판정코드·매칭 항목 해시만 서버 보고(제로 콘텐츠 원칙 유지), evaluateSendPolicy에 dlp_finding 경고코드 추가 — restricted급 검출+외부수신자 조합은 승인 불가 차단. (3) 현행 오류 시 completeAllow fail-open(smart-alerts.js 228-230행)을 'DLP 스캔 실패 시 경고 후 허용, 정책 차단 판정 시 fail-close'로 명시화. (4) 서버측: C6 이행 워커가 send_and_file 원문 취득 시 DlpService.scanAndRecord 실행 — dlp_findings에 source_type='email_egress' 추가 마이그레이션(0044 패턴 준용), block 판정 시 파일링 실패 처리+감사. 대량 다운로드 임계 알림 등 다른 DLP 확장은 범위 외.
- **완화 노트:** 내부 9인 펌 전제로 CASB급 이그레스 통제·첨부 전수 심층 스캔은 제외. 클라이언트측 스캔은 텍스트 본문+텍스트성 첨부 중심, 검사 결과는 해시·판정코드만 서버 전송(제로 콘텐츠 원칙 유지).
- - `apps/api/src/modules/dlp/sensitive-data.detector.ts (규칙 43-94행 shared로 이동)`
- - `apps/api/src/modules/dlp/dlp.service.ts (scanAndRecord, model_egress 패턴 72-102행)`
- - `apps/web/public/outlook-addin/smart-alerts.js (fail-open 228-230행)`
- - `db/migrations/0044_r5_dlp_egress_and_detector_constraints.sql (패턴 참조)`
- - `신규: packages/shared/src/dlp/sensitive-data-rules.ts`
- - `신규: packages/shared/src/dlp/sensitive-data-rules.spec.ts`
- - `신규: db/migrations/01xx_dlp_email_egress_source.sql`
- - packages/shared/src/dlp/sensitive-data-rules.spec.ts: 기존 apps/api/src/modules/dlp/sensitive-data.detector.spec.ts의 전 케이스를 shared로 이식해 동작 동일성 회귀 검증(주민번호·계좌·카드Luhn 등 검출/비검출 케이스 전부 통과)
- - outlook-send-file.service.spec.ts 확장: dlp_finding 경고코드 보고 시 (1) 일반 검출+외부수신자→경고+승인 요구, (2) restricted급 검출→승인 불가 차단, (3) 스캔 실패 보고→경고 후 허용 — 3케이스 판정 assert
- - 신규 tests/integration/document-access/email-egress-dlp.spec.ts: 주민번호 포함 픽스처 MIME으로 send_and_file 이행 시 dlp_findings(source_type='email_egress') 기록+block 판정 시 파일링 failed+감사이벤트 assert
- - 수동: 개발 테넌트에서 주민번호를 본문에 넣고 외부 주소로 발송 시도→Smart Alert 차단 프롬프트 표시, 제거 후 발송 성공하면 통과
- - (완화정책 위반) 완화정책 '유지하되 간소화'는 DLP를 '현행 한국형 검출기 유지 + 간단한 대량 다운로드 임계 알림 1건'으로 한정하는데, C14는 송부 전 콘텐츠 검사라는 새 DLP 표면(클라이언트 Smart Alerts 스캔, 서버 이그레스 MIME 스캔, restricted급 차단 정책, 신규 source_type 마이그레이션, 검출 규칙 shared 패키지 이관)을 추가해 이 한정을 초과한다. 유닛을 제거하거나 정책 예외로 명시 승인을 받아라. 유지가 필요하면 최소 범위로 축소: 기존 apps/api/src/modules/dlp/sensitive-data.detector.ts를 그대로 재사용해 send_and_file 이행 시 서버측 경고(감사이벤트 기록) 전용으로 한정하고, 차단 판정·클라이언트 스캔·규칙 이관은 제외하라.
- - (완화정책 위반) 완화 정책은 DLP를 '현행 한국형 검출기 유지 + 대량 다운로드 임계 알림 1건(H7)'으로 한정했다. C14의 Smart Alerts 클라이언트 스캔 + 이그레스 서버 재검사 이중 체계는 이를 초과한다. H3로 강등하고 scope를 '현행 검출기를 재사용하는 송부 전 검사 1종(클라이언트 또는 서버 중 하나)'으로 축소하라. 또한 Smart Alerts는 add-in 배포가 전제이므로 deps에 C7을 추가해야 한다.

External evidence needs:

- **Goal:** 외부 수신자에게 이메일을 보내기 전 주민번호·계좌 등 민감정보가 본문·첨부에서 검출되면 Smart Alert로 경고·차단되고, send-and-file 이행 시 서버가 원문을 재검사해 이그레스 판정을 감사에 남긴다.
- **Scope:** (1) SensitiveDataDetector의 한국형 검출 규칙(주민번호·외국인등록번호·계좌·여권·카드Luhn 등)을 packages/shared로 이동하고 apps/api detector는 shared 규칙을 소비하도록 리팩터(동작 동일성 유지). (2) smart-alerts.js OnMessageSend 핸들러에서 item.body.getAsync 본문+접근 가능한 첨부를 로컬 스캔, 판정코드·매칭 항목 해시만 서버 보고(제로 콘텐츠 원칙 유지), evaluateSendPolicy에 dlp_finding 경고코드 추가 — restricted급 검출+외부수신자 조합은 승인 불가 차단. (3) 현행 오류 시 completeAllow fail-open(smart-alerts.js 228-230행)을 'DLP 스캔 실패 시 경고 후 허용, 정책 차단 판정 시 fail-close'로 명시화. (4) 서버측: C6 이행 워커가 send_and_file 원문 취득 시 DlpService.scanAndRecord 실행 — dlp_findings에 source_type='email_egress' 추가 마이그레이션(0044 패턴 준용), block 판정 시 파일링 실패 처리+감사. 대량 다운로드 임계 알림 등 다른 DLP 확장은 범위 외.
- - outlook-send-file.service.spec.ts 확장: dlp_finding 경고코드 보고 시 (1) 일반 검출+외부수신자→경고+승인 요구, (2) restricted급 검출→승인 불가 차단, (3) 스캔 실패 보고→경고 후 허용 — 3케이스 판정 assert
- - 수동: 개발 테넌트에서 주민번호를 본문에 넣고 외부 주소로 발송 시도→Smart Alert 차단 프롬프트 표시, 제거 후 발송 성공하면 통과

Codex implementation/evidence tasks:

- close the named repo implementation/test gap before promotion
- promote or explicitly block prerequisite TUWs before this row can move
- retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy

User/operator actions:

- provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens
- provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence
- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- Manual/staging QA receipt missing: in a development/staging tenant, send an Outlook message containing a Korean resident-registration-number-like value to an external recipient, verify Smart Alert warning/blocking, remove the value, and verify send succeeds.
- C7 add-in pilot deployment dependency remains EXTERNAL_BLOCKED; C14 Smart Alerts evidence cannot be complete until add-in deployment/operator receipts exist.
- Client-side Smart Alerts scan/report evidence is not implemented or verified in this server-side repo-local slice; if the full original C14 scope is enforced, implement and test body/accessible attachment scanning plus zero-content result reporting.
- Shared-rule extraction to packages/shared/src/dlp/sensitive-data-rules.ts is not implemented in this reduced slice; keep as a gap if strict reviewers require the original unrelaxed acceptance surface rather than the correction note.
- Changed-file LSP diagnostics unavailable: mcp__lsp.status and mcp__lsp.diagnostics returned Transport closed on 2026-07-05T11:19+09:00.
- No real M365/Outlook manual receipt proves Smart Alert behavior with an actual external recipient; do not promote C14 to COMPLETE_CANDIDATE until that receipt or a documented external blocker exists.

Promotion gate:

- close gap: Manual/staging QA receipt missing: in a development/staging tenant, send an Outlook message containing a Korean resident-registration-number-like value to an external recipient, verify Smart Alert warning/blocking, remove the value, and verify send succeeds.
- close gap: C7 add-in pilot deployment dependency remains EXTERNAL_BLOCKED; C14 Smart Alerts evidence cannot be complete until add-in deployment/operator receipts exist.
- close gap: Client-side Smart Alerts scan/report evidence is not implemented or verified in this server-side repo-local slice; if the full original C14 scope is enforced, implement and test body/accessible attachment scanning plus zero-content result reporting.
- close gap: Shared-rule extraction to packages/shared/src/dlp/sensitive-data-rules.ts is not implemented in this reduced slice; keep as a gap if strict reviewers require the original unrelaxed acceptance surface rather than the correction note.
- close gap: Changed-file LSP diagnostics unavailable: mcp__lsp.status and mcp__lsp.diagnostics returned Transport closed on 2026-07-05T11:19+09:00.
- close gap: No real M365/Outlook manual receipt proves Smart Alert behavior with an actual external recipient; do not promote C14 to COMPLETE_CANDIDATE until that receipt or a documented external blocker exists.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage

### LCX-TUW80-D9 검색 성능 개선 — 권한 스코프 물질화 + 카운트/facet 최적화 (수십만 문서 기준)

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: Codex + operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:2713`
Tags: `manual-qa`, `lsp`, `m365-office`, `benchmark`
Evidence refs currently recorded: 43

Dependencies:

- D1
- D2
- D4
- A6(기본개방 권한 의미론 변경 반영)

Primary code anchors:

- apps/api/src/modules/search/permission/document-scope.filter.ts
- apps/api/src/modules/search/permission/wall-scope.filter.ts
- apps/api/src/modules/search/permission/matter-scope.filter.ts
- apps/api/src/modules/search/permission/search-permission-scope.provider.ts
- apps/api/src/modules/search/query/search-query.builder.ts
- apps/api/src/modules/scale/scale.service.ts
- 신규: tools/bench/search-load-bench.ts
- tests/integration/search-permission/search-permission-sla.spec.ts

Acceptance tests:

- 기존 tests/integration/search-permission/ 17개 스펙 + search-permission-regression.spec.ts 전체 그린 — 권한 판정 결과가 물질화 전후 동일함이 스위트로 증명
- 신규 단위테스트: document-scope.filter.spec.ts/wall-scope.filter.spec.ts에 물질화 집합 기반 SQL 생성 검증 케이스 추가 (DENY 우선·break-glass 승인 수 조건 유지 단언)
- tools/bench/search-load-bench.ts 실행: 합성 20만 문서·9 동시사용자에서 키워드 p95 < 3s, hybrid p95 < 5s, 결과가 scale_performance_runs에 자동 insert됨을 확인
- 수동: /search에서 대량 결과 질의 시 총 건수가 '1,000+' 상한 표기로 나오고 페이지네이션이 정상 동작하면 통과

Manual QA requirement:

- 수동: /search에서 대량 결과 질의 시 총 건수가 '1,000+' 상한 표기로 나오고 페이지네이션이 정상 동작하면 통과

Migration requirements:

- none

Audit/security invariants:

- #### D9 [L] 검색 성능 개선 — 권한 스코프 물질화 + 카운트/facet 최적화 (수십만 문서 기준)
- **Goal:** 문서가 수십만 건으로 늘어도 키워드 검색 p95 3초, 의미 검색 p95 5초를 지킨다. 행별 3중 상관 서브쿼리 권한 평가가 집합 기반 조인으로 바뀌어 스케일 여유가 생긴다.
- **Scope:** (1) 검색 트랜잭션 초두에 사용자 허용 matter_id 집합과 wall 배제 집합을 1회 계산(배열 파라미터)해 document-scope/wall-scope의 행별 EXISTS 상관 서브쿼리를 인덱스 조인으로 전환 — 권한 시맨틱(fail-closed, explicit DENY, break-glass 2인 승인)은 완전 보존. (2) count(*) OVER() 제거: 상한 카운트(pageSize×10+1 스캔, '1,000+' 표기)로 전환하고 DTO/UI 표기 반영. (3) facet 쿼리를 필터된 집합 1회 스캔으로 통합. (4) 합성 20만 문서 시드 스크립트 + p95 측정 러너를 tools/bench 패턴으로 신설하고 결과를 기존 scale_performance_runs 원장에 자동 기록(수기 등록 대체).
- **완화 노트:** 인덱스 샤딩·tenant 해시 파티셔닝·Redis facet 캐시·10,000 동시사용자 부하목표는 완화 정책으로 제외 — 단일 테넌트 수십만 문서·9인 동시사용 기준으로 축소
- **교정(검증·비평 반영):** 교차 교정: H3 조건부 유닛으로 강등(성능 임계 관측 시 착수). 상관 서브쿼리 해소 자체는 유지. A6 의존 추가(권한 의미론 변경).
- **Dependencies:** D1, D2, D4, A6(기본개방 권한 의미론 변경 반영)
- - `apps/api/src/modules/search/permission/document-scope.filter.ts`
- - `apps/api/src/modules/search/permission/wall-scope.filter.ts`
- - `apps/api/src/modules/search/permission/matter-scope.filter.ts`
- - `apps/api/src/modules/search/permission/search-permission-scope.provider.ts`
- - `tests/integration/search-permission/search-permission-sla.spec.ts`
- - 기존 tests/integration/search-permission/ 17개 스펙 + search-permission-regression.spec.ts 전체 그린 — 권한 판정 결과가 물질화 전후 동일함이 스위트로 증명
- - 신규 단위테스트: document-scope.filter.spec.ts/wall-scope.filter.spec.ts에 물질화 집합 기반 SQL 생성 검증 케이스 추가 (DENY 우선·break-glass 승인 수 조건 유지 단언)
- - (앵커 부정확) (1) '신규:'로 표기된 tests/integration/search-permission/search-permission-sla.spec.ts는 이미 실존하는 파일이므로 '기존 확장'으로 정정. (2) 수동 판정 '총 건수 1,000+ 상한 표기 및 페이지네이션'은 웹 변경을 요구하나 anchors에 apps/web 파일이 전무하다(현재 search-client.tsx는 총 건수 렌더링 자체가 없음) — apps/web/src/app/(app)/search/search-client.tsx 등 웹 앵커 추가 필요. (3) '17개 스펙'은 실제 15개 spec(+헬퍼 2)이며 search-permission-regression.spec.ts는 그 15개에 이미 포함되어 있어 '+' 표기는 중복 계산 — '15개 스펙 전체'로 수정.
- - (과대·과소 scope) L 초과 의심. 권한 스코프 물질화(3개 필터 재작성 + 권한/월 변경 시 물질화 집합 무효화·동기화 로직, DENY 우선·break-glass 조건 보존) + 카운트/facet 최적화 + 신규 부하 벤치 도구(합성 20만 문서 생성 포함) + 웹 카운트 상한 UI가 한 유닛에 묶여 있다. 분할 권고: (a) 물질화+회귀 증명을 본 유닛(L 유지), (b) tools/bench/search-load-bench.ts + SLA 스펙 확장을 별도 S 유닛, (c) '1,000+' 상한 표기 UI는 D5로 이관 또는 별도 XS.
- - (과대·과소 scope) '수십만 문서 p95' 목표는 9인 펌 + 배제된 성능목표(동시 10,000명·샤딩 배제) 취지 대비 과대. '성능 임계 관측 시 착수'하는 조건부 유닛으로 H3 강등을 권고한다. 단, 행별 3중 상관 서브쿼리 해소 자체는 유지하되, A6(firm_open/restricted)이 권한 평가 의미론을 바꾸므로 D9의 권한 스코프 물질화(그리고 F7의 권한 스코프 CTE)에 A6를 deps로 명시하라.

External evidence needs:

- [object Object]
- [object Object]
- [object Object]

Codex implementation/evidence tasks:

- run or repair the benchmark/performance harness and store the receipt
- retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy

User/operator actions:

- provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens
- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- Full D9 benchmark receipt missing: the new runner has only smoke evidence; no run yet proves synthetic 200k documents with 9 concurrent users, keyword p95 < 3s, and hybrid p95 < 5s with scale_performance_runs row ids.
- Hybrid smoke was path-only: tools/bench/output/search-load-hybrid-smoke/search-load-bench-2026-07-05T03-26-04-178Z.json completed and inserted a scale row, but totalObserved=0, so it is not retrieval/SLA evidence.
- Manual /search QA receipt missing: large result query should show 결과 1,000+개 and pagination should remain usable in the browser.
- Changed-file LSP diagnostics unavailable: mcp__lsp.status and diagnostics returned Transport closed on 2026-07-05 for D9 API/web files and the new tools/bench files.
- Promotion to COMPLETE_CANDIDATE requires the full benchmark command, manual browser QA receipt, LSP diagnostics when available, and a final scoped diff/ledger validation refresh.

Promotion gate:

- close gap: Full D9 benchmark receipt missing: the new runner has only smoke evidence; no run yet proves synthetic 200k documents with 9 concurrent users, keyword p95 < 3s, and hybrid p95 < 5s with scale_performance_runs row ids.
- close gap: Hybrid smoke was path-only: tools/bench/output/search-load-hybrid-smoke/search-load-bench-2026-07-05T03-26-04-178Z.json completed and inserted a scale row, but totalObserved=0, so it is not retrieval/SLA evidence.
- close gap: Manual /search QA receipt missing: large result query should show 결과 1,000+개 and pagination should remain usable in the browser.
- close gap: Changed-file LSP diagnostics unavailable: mcp__lsp.status and diagnostics returned Transport closed on 2026-07-05 for D9 API/web files and the new tools/bench files.
- close gap: Promotion to COMPLETE_CANDIDATE requires the full benchmark command, manual browser QA receipt, LSP diagnostics when available, and a final scoped diff/ledger validation refresh.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage

### LCX-TUW80-D11 조항 검색 통합검색 노출 (SearchTarget 'clause')

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: Codex + operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:2746`
Tags: `manual-qa`, `lsp`
Evidence refs currently recorded: 42

Dependencies:

- D1
- F(조항은행 — contract-intel 조항 파싱 데이터 적재 확대)

Primary code anchors:

- db/migrations/0054_create_contract_intelligence.sql
- 신규: db/migrations/0102_clause_search_index.sql (missing)
- apps/api/src/modules/contract-intel/contract-intel.service.ts
- packages/shared/src/search/search-query.dto.ts
- apps/api/src/modules/search/query/search-query.builder.ts
- apps/web/src/components/search/result-card.tsx
- apps/web/src/components/search/search-advanced-controls.tsx

Acceptance tests:

- 신규 통합테스트 tests/integration/search-permission/search-clause.spec.ts: 조항 텍스트 질의가 해당 조항 스니펫을 반환하고, 소속 문서 권한이 없는 사용자와 wall 배제 사용자는 미히트
- apps/web/src/components/search/result-card.test.tsx: 조항 카드 변형(조항 유형·소속 문서 링크) 렌더 단언
- 수동: 계약서가 파싱된 matter에서 /search target=조항으로 '손해배상' 검색 → 조항 카드 표시 → 클릭 시 소속 문서 상세로 이동하면 통과

Manual QA requirement:

- 수동: 계약서가 파싱된 matter에서 /search target=조항으로 '손해배상' 검색 → 조항 카드 표시 → 클릭 시 소속 문서 상세로 이동하면 통과

Migration requirements:

- db/migrations/0054_create_contract_intelligence.sql
- db/migrations/0165_add_clause_search_index.sql
- D11 uses 0165 in the current migration sequence rather than the plan placeholder 0102_clause_search_index.sql.

Audit/security invariants:

- **Goal:** 사용자가 /search에서 '조항' 타깃을 선택해 계약 조항 텍스트를 직접 검색하고(예: '손해배상 한도'), 조항 유형·소속 문서·matter가 표시된 조항 카드에서 원문으로 이동할 수 있다.
- **Scope:** (1) contract_clauses/contract_clause_chunks(0054)에 D1과 동일한 한국어 매칭 인덱스 추가 마이그레이션. (2) searchTargets에 'clause' 추가하고 search-query.builder에 조항 검색 경로 신설 — 기존 matter/document/wall 권한 스코프 필터를 조항의 소속 문서 기준으로 재사용. (3) result-card에 조항 변형 카드(조항 유형·소속 문서·matter 라벨) 추가. 유사조항(임베딩) 검색·대체조항 추천은 F 워크스트림의 조항은행 고도화로 제외, /contracts 봉인 해제도 별도 게이트로 제외 — /search 노출 경로만 개방.
- - 신규 통합테스트 tests/integration/search-permission/search-clause.spec.ts: 조항 텍스트 질의가 해당 조항 스니펫을 반환하고, 소속 문서 권한이 없는 사용자와 wall 배제 사용자는 미히트

External evidence needs:

- [object Object]
- [object Object]

Codex implementation/evidence tasks:

- retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy

User/operator actions:

- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- Manual/staging QA receipt is still missing: authorized user must open /search, select target=조항, query '손해배상', verify the clause card shows 조항 유형/소속 문서/Matter context, click 원문 열기, and capture navigation to the source document detail without inaccessible clause/source leakage.
- Changed-file LSP diagnostics receipt is missing because mcp__lsp.diagnostics returned Transport closed for all D11 changed-file attempts on 2026-07-05; package typecheck/build evidence is present but does not replace LSP evidence under strict completion rules.

Promotion gate:

- close gap: Manual/staging QA receipt is still missing: authorized user must open /search, select target=조항, query '손해배상', verify the clause card shows 조항 유형/소속 문서/Matter context, click 원문 열기, and capture navigation to the source document detail without inaccessible clause/source leakage.
- close gap: Changed-file LSP diagnostics receipt is missing because mcp__lsp.diagnostics returned Transport closed for all D11 changed-file attempts on 2026-07-05; package typecheck/build evidence is present but does not replace LSP evidence under strict completion rules.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage

### LCX-TUW80-D12 판례·법령 검색 탭 (external authority 캐시 인덱스)

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: Codex + operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:2768`
Tags: `manual-qa`, `lsp`, `m365-office`, `real-fixture`, `external-ops`
Evidence refs currently recorded: 36

Dependencies:

- H(국내 법률데이터 연동 — 국가법령정보센터/판례 API 커넥터)
- D1

Primary code anchors:

- 신규: db/migrations/0103_create_external_authorities.sql (missing)
- 신규: apps/api/src/modules/integrations/legal-data/ (missing)
- apps/api/src/modules/integrations/matter-app (모듈 구조 참조 패턴)
- apps/api/src/modules/search/query/search-query.builder.ts
- packages/shared/src/search/search-query.dto.ts
- apps/web/src/app/(app)/search/search-client.tsx
- apps/web/src/components/search/result-card.tsx

Acceptance tests:

- 신규 통합테스트 tests/integration/search-authority.spec.ts: 커넥터 mock fixture로 법령 조문 적재 → target=authority 검색 히트, 내부 문서 권한 필터가 authority 결과에 오적용되지 않고 내부 문서 타깃에는 여전히 적용됨을 단언
- 신규 단위테스트 apps/api/src/modules/integrations/legal-data/ 적재 리포지토리 spec: API 응답 정규화·중복 적재 방지 검증
- 수동: /search에서 '상법 제398조' 검색 → 판례·법령 탭에 조문 카드, 전체 탭에 내부 문서 결과와 병렬 표시되면 통과

Manual QA requirement:

- 수동: /search에서 '상법 제398조' 검색 → 판례·법령 탭에 조문 카드, 전체 탭에 내부 문서 결과와 병렬 표시되면 통과

Migration requirements:

- 신규: db/migrations/0103_create_external_authorities.sql
- **Scope:** (1) H 워크스트림이 구축하는 legal-data 커넥터(국가법령정보센터 Open API 등)의 응답을 external_authorities 캐시 테이블 + 한국어 FTS 인덱스로 적재하는 마이그레이션·리포지토리. (2) /search에 target='authority' 탭 신설 — 외부 공개 데이터이므로 권한 필터 불필요 분리 경로로 구현(기존 permission 스코프 미적용을 명시적 화이트리스트로 처리). (3) 내부 문서 결과와 병렬 표시 UI. 법령 조문-내부 문서 그래프 링크('상법 제398조 이슈가 있던 보고서' 관계 질의)는 G/F의 knowledge graph 소관으로 제외.
- - `신규: db/migrations/0103_create_external_authorities.sql`

Audit/security invariants:

- #### D12 [M] 판례·법령 검색 탭 (external authority 캐시 인덱스)
- **Scope:** (1) H 워크스트림이 구축하는 legal-data 커넥터(국가법령정보센터 Open API 등)의 응답을 external_authorities 캐시 테이블 + 한국어 FTS 인덱스로 적재하는 마이그레이션·리포지토리. (2) /search에 target='authority' 탭 신설 — 외부 공개 데이터이므로 권한 필터 불필요 분리 경로로 구현(기존 permission 스코프 미적용을 명시적 화이트리스트로 처리). (3) 내부 문서 결과와 병렬 표시 UI. 법령 조문-내부 문서 그래프 링크('상법 제398조 이슈가 있던 보고서' 관계 질의)는 G/F의 knowledge graph 소관으로 제외.
- - `신규: db/migrations/0103_create_external_authorities.sql`
- - `신규: apps/api/src/modules/integrations/legal-data/`
- - 신규 통합테스트 tests/integration/search-authority.spec.ts: 커넥터 mock fixture로 법령 조문 적재 → target=authority 검색 히트, 내부 문서 권한 필터가 authority 결과에 오적용되지 않고 내부 문서 타깃에는 여전히 적용됨을 단언
- - 신규 단위테스트 apps/api/src/modules/integrations/legal-data/ 적재 리포지토리 spec: API 응답 정규화·중복 적재 방지 검증
- ### E: AI Assistant & Governance

External evidence needs:

- [object Object]
- [object Object]

Codex implementation/evidence tasks:

- retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy

User/operator actions:

- provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens
- provide real sanitized fixture or staging sample receipt for the named artifact
- provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence
- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- Manual /search QA receipt missing: run the app in a browser, search 상법 제398조 or a staged authority fixture, select 판례·법령, confirm the authority card appears, then switch back to 전체/문서 results and confirm internal document results remain permission-filtered.
- Changed-file LSP diagnostics unavailable: mcp__lsp.status and diagnostics returned Transport closed on 2026-07-05.
- Real external legal-data freshness remains tied to H12 evidence: D12 uses the external_authorities cache, so real law.go.kr credential/smoke receipts from H12 are still needed for production-grade current authority data.
- No browser screenshot/manual receipt proves the public authority card and internal document parallel display on the actual /search surface.
- Before COMPLETE_CANDIDATE promotion, collect manual QA, rerun LSP when available, rerun focused checks, regenerate ledger, validate JSON, and rerun git diff hygiene.

Promotion gate:

- close gap: Manual /search QA receipt missing: run the app in a browser, search 상법 제398조 or a staged authority fixture, select 판례·법령, confirm the authority card appears, then switch back to 전체/문서 results and confirm internal document results remain permission-filtered.
- close gap: Changed-file LSP diagnostics unavailable: mcp__lsp.status and diagnostics returned Transport closed on 2026-07-05.
- close gap: Real external legal-data freshness remains tied to H12 evidence: D12 uses the external_authorities cache, so real law.go.kr credential/smoke receipts from H12 are still needed for production-grade current authority data.
- close gap: No browser screenshot/manual receipt proves the public authority card and internal document parallel display on the actual /search surface.
- close gap: Before COMPLETE_CANDIDATE promotion, collect manual QA, rerun LSP when available, rerun focused checks, regenerate ledger, validate JSON, and rerun git diff hygiene.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage

### LCX-TUW80-E14 회의록 정합성 QC

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: Codex + operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:2815`
Tags: `manual-qa`, `lsp`, `dependency-gated`
Evidence refs currently recorded: 23

Dependencies:

- E7
- E9
- F(확정 graph facts — candidate
- confirmed 승인 플로우)

Primary code anchors:

- 신규: apps/api/src/modules/ai/prep/minutes-qc.builder.ts
- apps/api/src/modules/ai/prep/ai-prep.processor.ts
- packages/shared/src/ai/prep.ts (minutes_qc kind 추가)
- apps/api/src/modules/graph/graph-query.service.ts (확정 facts 소스)
- apps/api/src/modules/work/work.service.ts (검토 큐 적재)
- apps/web/src/app/(app)/work/work-queue-client.tsx (QC 항목 표시)

Acceptance tests:

- 신규 apps/api/src/modules/ai/prep/minutes-qc.builder.spec.ts: 회의록 날짜가 확정 타임라인과 다른 모의 케이스에서 불일치 항목(양측 인용 포함) 산출, 완전 일치 시 빈 리포트를 단언
- 신규 tests/integration/ai-minutes-qc.spec.ts: 회의록 업로드→QC 아티팩트 생성→dms_work_items 적재→확정 데이터 미변경을 단언
- 수동: 날짜를 고의로 틀린 회의록 업로드 → work 큐에 불일치 리포트가 뜨고 인용 클릭으로 회의록 원문과 근거 문서 양쪽을 확인할 수 있으면 통과

Manual QA requirement:

- 수동: 날짜를 고의로 틀린 회의록 업로드 → work 큐에 불일치 리포트가 뜨고 인용 클릭으로 회의록 원문과 근거 문서 양쪽을 확인할 수 있으면 통과

Migration requirements:

- db/migrations/0168_add_minutes_qc_ai_prep_artifact.sql extends ai_prep_artifacts artifact_kind CHECK with minutes_qc and replaces ai_prep_completed_payload_file_organization_allowed to permit minutes_qc key_fact claims only.
- db/migrations/0168_add_minutes_qc_ai_prep_artifact.sql down migration deletes minutes_qc work_items/artifacts, restores the prior matter_timeline artifact kind CHECK, and restores the payload allowlist without minutes_qc.
- tools/evalset/local-ai-eval.ts and packages/shared/src/ai/ops.ts are synchronized with the minutes_qc artifact kind.

Audit/security invariants:

- - `신규: apps/api/src/modules/ai/prep/minutes-qc.builder.ts`
- - `apps/api/src/modules/ai/prep/ai-prep.processor.ts`
- - `packages/shared/src/ai/prep.ts (minutes_qc kind 추가)`
- - 신규 apps/api/src/modules/ai/prep/minutes-qc.builder.spec.ts: 회의록 날짜가 확정 타임라인과 다른 모의 케이스에서 불일치 항목(양측 인용 포함) 산출, 완전 일치 시 빈 리포트를 단언
- - 신규 tests/integration/ai-minutes-qc.spec.ts: 회의록 업로드→QC 아티팩트 생성→dms_work_items 적재→확정 데이터 미변경을 단언
- - 수동: 날짜를 고의로 틀린 회의록 업로드 → work 큐에 불일치 리포트가 뜨고 인용 클릭으로 회의록 원문과 근거 문서 양쪽을 확인할 수 있으면 통과
- - (앵커 부정확) packages/shared/src/ai/prep.ts에 minutes_qc kind를 추가하면 db/migrations/0064_create_ai_prep_artifacts.sql의 artifact_kind CHECK 제약(37-48행)이 insert를 거부하므로 CHECK 확장 마이그레이션이 필수인데 anchors에 신규 마이그레이션이 전무함 — 통합 테스트 'QC 아티팩트 생성'이 CHECK 위반으로 통과 불가. 신규 db/migrations/010X_add_minutes_qc_artifact_kind.sql을 anchors에 추가하고, tools/evalset/local-ai-eval.ts의 하드코딩 kind 목록(17-26행) 동기화도 함께 명시할 것 (E7이 자체 4종만 0101에 담는 패턴과 동일).

External evidence needs:

- none

Codex implementation/evidence tasks:

- promote or explicitly block prerequisite TUWs before this row can move
- retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy

User/operator actions:

- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- Manual/staging QA receipt missing: upload intentionally wrong meeting minutes, verify /work shows 회의록 정합성 QC, and click citations to both the meeting original and evidence document.
- Changed-file LSP diagnostics unavailable: mcp__lsp.status and mcp__lsp.diagnostics returned Transport closed on 2026-07-05T11:08+09:00.
- Dependency completion evidence is still incomplete: E7 and E9 remain LOCAL_IMPLEMENTED_NEEDS_EVIDENCE, and the confirmed graph-fact review dependency remains evidence-gated rather than COMPLETE_CANDIDATE.
- No staging/operator receipt for the upload-to-QC-to-work-queue path; keep E14 out of COMPLETE_CANDIDATE until that receipt exists.

Promotion gate:

- close gap: Manual/staging QA receipt missing: upload intentionally wrong meeting minutes, verify /work shows 회의록 정합성 QC, and click citations to both the meeting original and evidence document.
- close gap: Changed-file LSP diagnostics unavailable: mcp__lsp.status and mcp__lsp.diagnostics returned Transport closed on 2026-07-05T11:08+09:00.
- close gap: Dependency completion evidence is still incomplete: E7 and E9 remain LOCAL_IMPLEMENTED_NEEDS_EVIDENCE, and the confirmed graph-fact review dependency remains evidence-gated rather than COMPLETE_CANDIDATE.
- close gap: No staging/operator receipt for the upload-to-QC-to-work-queue path; keep E14 out of COMPLETE_CANDIDATE until that receipt exists.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage

### LCX-TUW80-F12 유사조항 검색 — 조항 단위 임베딩 + clause-bank 검색 API/패널

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: Codex + operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:2841`
Tags: `manual-qa`, `lsp`, `benchmark`, `dependency-gated`, `preexisting-blocker`
Evidence refs currently recorded: 37

Dependencies:

- F11
- D2(실임베딩 서비스 bge-m3)

Primary code anchors:

- apps/api/src/modules/contract-intel/contract-intel.service.ts
- apps/api/src/modules/contract-intel/contract-intel.controller.ts
- apps/api/src/modules/search/permission/search-permission-scope.provider.ts
- apps/api/src/modules/search/query/search-query.builder.ts
- db/migrations/0049_create_document_chunks_and_embeddings.sql
- 신규: db/migrations/00XX_add_clause_embeddings.sql (missing)
- apps/web/src/lib/api/contract-intel.ts
- tests/integration/contract-intel.spec.ts

Acceptance tests:

- tests/integration/contract-intel.spec.ts 확장: 의미상 유사/무관 조항 시드 후 clause-search 상위 결과에 유사 조항이 무관 조항보다 먼저 랭크됨 assert (임베딩 모델 고정 시드 사용)
- 동일 spec: ethical wall 차단 matter의 조항이 결과에서 제외됨 assert (search-permission 헬퍼 재사용)
- 성능 기준: 조항 5,000건 시드에서 clause-search p95 < 800ms — 통합 테스트 반복 측정
- 수동 검증: /contracts 유사 조항 패널에서 한국어 질의('손해배상 책임 상한')로 관련 조항이 상위에 노출되면 통과

Manual QA requirement:

- 수동 검증: /contracts 유사 조항 패널에서 한국어 질의('손해배상 책임 상한')로 관련 조항이 상위에 노출되면 통과

Migration requirements:

- db/migrations/0049_create_document_chunks_and_embeddings.sql
- 신규: db/migrations/00XX_add_clause_embeddings.sql
- **Scope:** D 워크스트림이 도입한 실제 임베딩 라우트(로컬 Ollama 서빙)를 재사용해 contract_clauses/contract_clause_chunks 단위 임베딩 컬럼·인덱스 추가(마이그레이션), ingestion 시 조항 임베딩 생성, POST /contract-intel/clause-search(질의 텍스트→임베딩→pgvector 코사인, SearchPermissionScopeProvider로 권한 스코프 주입, approved 조항은행 엔트리 부스팅) 엔드포인트 추가. /contracts 조항은행 브라우저에 '유사 조항' 검색 패널 추가. 기존 16차원 해시 벡터 경로는 건드리지 않는다(D 소관).
- - `db/migrations/0049_create_document_chunks_and_embeddings.sql`
- - `신규: db/migrations/00XX_add_clause_embeddings.sql`

Audit/security invariants:

- **Scope:** D 워크스트림이 도입한 실제 임베딩 라우트(로컬 Ollama 서빙)를 재사용해 contract_clauses/contract_clause_chunks 단위 임베딩 컬럼·인덱스 추가(마이그레이션), ingestion 시 조항 임베딩 생성, POST /contract-intel/clause-search(질의 텍스트→임베딩→pgvector 코사인, SearchPermissionScopeProvider로 권한 스코프 주입, approved 조항은행 엔트리 부스팅) 엔드포인트 추가. /contracts 조항은행 브라우저에 '유사 조항' 검색 패널 추가. 기존 16차원 해시 벡터 경로는 건드리지 않는다(D 소관).
- **완화 노트:** 외부 임베딩 API는 DEC-11에 따라 계속 차단 — 로컬 모델 전제. 조항 클러스터링·추천은 제외, 질의 기반 검색만.
- - `apps/api/src/modules/search/permission/search-permission-scope.provider.ts`
- - 동일 spec: ethical wall 차단 matter의 조항이 결과에서 제외됨 assert (search-permission 헬퍼 재사용)

External evidence needs:

- **완화 노트:** 외부 임베딩 API는 DEC-11에 따라 계속 차단 — 로컬 모델 전제. 조항 클러스터링·추천은 제외, 질의 기반 검색만.

Codex implementation/evidence tasks:

- run or repair the benchmark/performance harness and store the receipt
- clear or explicitly disposition unrelated broad-check blockers before promotion
- promote or explicitly block prerequisite TUWs before this row can move
- retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy

User/operator actions:

- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- Manual/staging QA receipt is still missing: authorized user must open /contracts, run the 유사 조항 panel with Korean query '손해배상 책임 상한', and verify the related approved clause appears above unrelated clauses without exposing source body text.
- Changed-file LSP diagnostics are not clean in the hook: tests/integration/contract-intel.spec.ts reports unresolved @amic-vault/shared despite passing TypeScript/package/integration checks. Under fast evidence policy, do not spend a long turn chasing this tool-resolution gap before moving to the next dependency-valid TUW.

Promotion gate:

- close gap: Manual/staging QA receipt is still missing: authorized user must open /contracts, run the 유사 조항 panel with Korean query '손해배상 책임 상한', and verify the related approved clause appears above unrelated clauses without exposing source body text.
- close gap: Changed-file LSP diagnostics are not clean in the hook: tests/integration/contract-intel.spec.ts reports unresolved @amic-vault/shared despite passing TypeScript/package/integration checks. Under fast evidence policy, do not spend a long turn chasing this tool-resolution gap before moving to the next dependency-valid TUW.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage

### LCX-TUW80-F13 고객 Playbook 확장 — client 스코프 룰 + negotiation_positions + 상대방 요구 이력 집계

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: Codex + operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:2872`
Tags: `manual-qa`, `lsp`
Evidence refs currently recorded: 34

Dependencies:

- F1
- F2
- F11

Primary code anchors:

- db/migrations/0054_create_contract_intelligence.sql
- db/migrations/0020_create_parties.sql
- 신규: db/migrations/00XX_playbook_client_scope_and_negotiation_positions.sql (missing)
- apps/api/src/modules/contract-intel/contract-rule-engine.ts
- apps/api/src/modules/contract-intel/contract-intel.service.ts
- apps/api/src/modules/graph/graph-sync.service.ts
- packages/shared/src/contract/contract-types.ts
- tests/integration/contract-intel.spec.ts
- tests/integration/party.spec.ts

Acceptance tests:

- apps/api/src/modules/contract-intel/contract-rule-engine.spec.ts 확장: client 스코프 룰이 해당 client의 모든 matter 평가에 포함되고 타 client matter에는 미적용 assert
- tests/integration/contract-intel.spec.ts 확장: negotiation position 생성(round 1→2) 후 counterparty-patterns 응답에 조항 kind별 빈도 집계 반환 assert; 권한 없는 matter의 position 생성 403 assert
- tests/integration/graph.spec.ts 확장: sync 후 negotiation_position 노드와 party 연결 엣지 생성 assert
- 수동 검증: 동일 상대방 party가 2개 matter에서 indemnity 조항 포지션을 기록한 뒤 집계 API가 빈도 2로 반환하면 통과

Manual QA requirement:

- 수동 검증: 동일 상대방 party가 2개 matter에서 indemnity 조항 포지션을 기록한 뒤 집계 API가 빈도 2로 반환하면 통과

Migration requirements:

- db/migrations/0054_create_contract_intelligence.sql
- db/migrations/0020_create_parties.sql
- 신규: db/migrations/00XX_playbook_client_scope_and_negotiation_positions.sql
- **Scope:** (1) 마이그레이션으로 playbook_rules에 client_id 스코프 컬럼(FK, matter_id와 택일 CHECK) 추가, contract-rule-engine/서비스가 matter의 client를 따라 client 스코프 룰을 함께 평가하도록 확장(기존 required_clause/prohibited_term/threshold 3종 룰 유지). (2) negotiation_positions 테이블(tenant, matter_id, party_id FK parties, issue 라벨, position_summary, source document_version/contract_clause 참조, round 번호, RLS) + CRUD API·감사 이벤트. (3) 상대방(party)별 조항 kind 요구 빈도 집계 GET /contract-intel/counterparty-patterns?partyId — negotiation_positions와 contract_clauses 조인의 단순 GROUP BY. (4) F1의 HAS_PARTY 그래프 노드에 negotiation_position 노드 투영 추가.
- - `db/migrations/0054_create_contract_intelligence.sql`
- - `db/migrations/0020_create_parties.sql`
- - `신규: db/migrations/00XX_playbook_client_scope_and_negotiation_positions.sql`
- - (테스트 불가능한 완료판정 (집계 축이 되는 조항 kind 미정의)) 'counterparty-patterns 응답에 조항 kind별 빈도 집계'와 수동 검증의 'indemnity 조항 포지션'은 F2와 동일하게 의미적 조항 kind 분류체계가 현행 스키마에 없어 판정 축이 불명확함. 신규 마이그레이션(00XX_playbook_client_scope_and_negotiation_positions.sql)에서 negotiation_positions에 의미적 clause kind enum 컬럼을 정의한다는 것을 anchors/scope에 명시하고, acceptance test는 그 신규 enum 값 기준 집계로 문구를 고정해야 함(contract_clauses.clause_kind는 구조적 분류라 사용 불가).

Audit/security invariants:

- **Scope:** (1) 마이그레이션으로 playbook_rules에 client_id 스코프 컬럼(FK, matter_id와 택일 CHECK) 추가, contract-rule-engine/서비스가 matter의 client를 따라 client 스코프 룰을 함께 평가하도록 확장(기존 required_clause/prohibited_term/threshold 3종 룰 유지). (2) negotiation_positions 테이블(tenant, matter_id, party_id FK parties, issue 라벨, position_summary, source document_version/contract_clause 참조, round 번호, RLS) + CRUD API·감사 이벤트. (3) 상대방(party)별 조항 kind 요구 빈도 집계 GET /contract-intel/counterparty-patterns?partyId — negotiation_positions와 contract_clauses 조인의 단순 GROUP BY. (4) F1의 HAS_PARTY 그래프 노드에 negotiation_position 노드 투영 추가.
- - tests/integration/contract-intel.spec.ts 확장: negotiation position 생성(round 1→2) 후 counterparty-patterns 응답에 조항 kind별 빈도 집계 반환 assert; 권한 없는 matter의 position 생성 403 assert

External evidence needs:

- none

Codex implementation/evidence tasks:

- retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy

User/operator actions:

- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- Manual/staging QA receipt is still missing: in staging, create or identify the same counterparty across two authorized matters, record indemnity negotiation positions, call GET /v1/contract-intel/counterparty-patterns?partyId=..., and verify the frequency/matter count without exposing inaccessible matter text.
- Changed-file LSP diagnostics are not clean in the hook for tests/integration/contract-intel.spec.ts because @amic-vault/shared is unresolved in that hook context; package typecheck, tests tsconfig, and integration evidence are present but do not replace a clean LSP receipt under the strict completion rules.

Promotion gate:

- close gap: Manual/staging QA receipt is still missing: in staging, create or identify the same counterparty across two authorized matters, record indemnity negotiation positions, call GET /v1/contract-intel/counterparty-patterns?partyId=..., and verify the frequency/matter count without exposing inaccessible matter text.
- close gap: Changed-file LSP diagnostics are not clean in the hook for tests/integration/contract-intel.spec.ts because @amic-vault/shared is unresolved in that hook context; package typecheck, tests tsconfig, and integration evidence are present but do not replace a clean LSP receipt under the strict completion rules.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage

### LCX-TUW80-F14 LLM Wiki 재생성 + Obsidian export — matter_wiki_pages와 마크다운 vault 내보내기

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: Codex + operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:2902`
Tags: `manual-qa`, `lsp`, `repo-implementation`
Evidence refs currently recorded: 20

Dependencies:

- F1
- F3
- F4
- F8
- F9

Primary code anchors:

- 신규: db/migrations/00XX_create_matter_wiki_pages.sql (missing)
- db/migrations/0068_harden_ai_prep_completed_payload.sql
- apps/api/src/modules/ai/generation/local-gemma-generation.service.ts
- apps/api/src/modules/ai/generation/evidence-prompt.compiler.ts
- apps/api/src/modules/graph/graph-query.service.ts
- apps/api/src/modules/work/work.service.ts
- 신규: apps/api/src/modules/matter/matter-wiki.service.ts
- apps/web/src/app/(app)/matters/[matterId]/page.tsx
- 신규: tests/integration/matter-wiki.spec.ts

Acceptance tests:

- 신규 tests/integration/matter-wiki.spec.ts: confirmed fact+citation이 시드된 matter에서 위키 생성 트리거 → matter_wiki_pages에 ai_proposed 행 + 모든 서술 단락에 source_refs ≥1(DB CHECK 위반 시도 실패 포함) assert; work 큐 확인 후 review_status='confirmed' 전이 assert
- 동일 spec: wiki-export 응답 zip에 page_kind별 .md 파일이 존재하고 [[링크]] 대상이 실존 graph_nodes ID로 해석되며 citation 각주가 문서 참조를 포함함을 압축 해제 후 파싱 assert; matter 읽기 권한 없는 사용자 403 assert
- matter-knowledge-tab RTL 테스트 확장: 위키 서브탭에서 confirmed 페이지 렌더·[[링크]] 클릭 시 노드 라우팅 assert
- 수동 검증: export된 zip을 실제 Obsidian vault로 열어 백링크 그래프가 렌더되면 통과

Manual QA requirement:

- 수동 검증: export된 zip을 실제 Obsidian vault로 열어 백링크 그래프가 렌더되면 통과

Migration requirements:

- 신규: db/migrations/00XX_create_matter_wiki_pages.sql
- db/migrations/0068_harden_ai_prep_completed_payload.sql
- **Scope:** (1) 마이그레이션으로 matter_wiki_pages 테이블(matter_id, page_kind overview/issue/party/timeline CHECK, markdown_body, source_refs jsonb — 0068 패턴 CHECK로 citation 없는 서술 금지, provenance/review_status — F3와 동일 어휘, RLS). (2) 생성 잡: 그래프 facts(confirmed 우선)+litigation_facts+ai_claims를 evidence pack으로 LocalGemmaGenerationService 재사용, 산출물 ai_proposed 저장, F9의 work 큐 검토 메커니즘 재사용(kind 'wiki_page_review')으로 confirmed 전이. (3) /matters/[matterId] 지식 탭에 위키 서브탭 — [[링크]]는 graph_nodes 참조로 해석해 노드/문서로 라우팅. (4) GET /matters/:id/wiki-export — confirmed 페이지들을 [[위키링크]]·citation 각주 포함 Obsidian 호환 .md 파일 zip으로 내보내기 + WIKI_EXPORTED 감사 이벤트, 다운로드 권한은 matter 읽기 권한자.
- - `신규: db/migrations/00XX_create_matter_wiki_pages.sql`
- - `db/migrations/0068_harden_ai_prep_completed_payload.sql`

Audit/security invariants:

- **Goal:** 그래프·확정 Fact·citation 원장을 입력으로 matter별 위키 페이지(개요/이슈/당사자/타임라인)가 AI로 재생성되고, 변호사 확정 후 /matters 위키 탭에서 열람하며 Obsidian 호환 마크다운 vault(zip)로 내보낼 수 있다.
- **Scope:** (1) 마이그레이션으로 matter_wiki_pages 테이블(matter_id, page_kind overview/issue/party/timeline CHECK, markdown_body, source_refs jsonb — 0068 패턴 CHECK로 citation 없는 서술 금지, provenance/review_status — F3와 동일 어휘, RLS). (2) 생성 잡: 그래프 facts(confirmed 우선)+litigation_facts+ai_claims를 evidence pack으로 LocalGemmaGenerationService 재사용, 산출물 ai_proposed 저장, F9의 work 큐 검토 메커니즘 재사용(kind 'wiki_page_review')으로 confirmed 전이. (3) /matters/[matterId] 지식 탭에 위키 서브탭 — [[링크]]는 graph_nodes 참조로 해석해 노드/문서로 라우팅. (4) GET /matters/:id/wiki-export — confirmed 페이지들을 [[위키링크]]·citation 각주 포함 Obsidian 호환 .md 파일 zip으로 내보내기 + WIKI_EXPORTED 감사 이벤트, 다운로드 권한은 matter 읽기 권한자.
- - `db/migrations/0068_harden_ai_prep_completed_payload.sql`
- - `apps/api/src/modules/ai/generation/local-gemma-generation.service.ts`
- - `apps/api/src/modules/ai/generation/evidence-prompt.compiler.ts`
- - 신규 tests/integration/matter-wiki.spec.ts: confirmed fact+citation이 시드된 matter에서 위키 생성 트리거 → matter_wiki_pages에 ai_proposed 행 + 모든 서술 단락에 source_refs ≥1(DB CHECK 위반 시도 실패 포함) assert; work 큐 확인 후 review_status='confirmed' 전이 assert
- - 동일 spec: wiki-export 응답 zip에 page_kind별 .md 파일이 존재하고 [[링크]] 대상이 실존 graph_nodes ID로 해석되며 citation 각주가 문서 참조를 포함함을 압축 해제 후 파싱 assert; matter 읽기 권한 없는 사용자 403 assert
- ### G: Workflows & External Collaboration

External evidence needs:

- [object Object]

Codex implementation/evidence tasks:

- close the named repo implementation/test gap before promotion
- retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy

User/operator actions:

- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- LocalGemmaGenerationService and evidence-prompt compiler reuse is not fully wired; current generation is a deterministic repo-local evidence synthesis slice.
- Matter knowledge tab wiki subtab and [[link]] graph-node routing acceptance remain missing.
- Obsidian/manual/staging receipt is missing: export ZIP, open it in an actual Obsidian vault, and confirm backlink graph rendering plus citation readability.
- db rollback/redo evidence is missing for 0175; only db:migrate and focused integration evidence were collected in this slice.
- Changed-file LSP diagnostics are not collected in this turn; prior attempts for this workstream reported Transport closed.

Promotion gate:

- close gap: LocalGemmaGenerationService and evidence-prompt compiler reuse is not fully wired; current generation is a deterministic repo-local evidence synthesis slice.
- close gap: Matter knowledge tab wiki subtab and [[link]] graph-node routing acceptance remain missing.
- close gap: Obsidian/manual/staging receipt is missing: export ZIP, open it in an actual Obsidian vault, and confirm backlink graph rendering plus citation readability.
- close gap: db rollback/redo evidence is missing for 0175; only db:migrate and focused integration evidence were collected in this slice.
- close gap: Changed-file LSP diagnostics are not collected in this turn; prior attempts for this workstream reported Transport closed.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage

### LCX-TUW80-G4 AI 1차 검토 연결 — clause_analysis/risk_extraction 소비

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: Codex + operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:2931`
Tags: `manual-qa`, `lsp`, `benchmark`, `preexisting-blocker`
Evidence refs currently recorded: 62

Dependencies:

- G3

Primary code anchors:

- apps/api/src/modules/ai/features/ai-summary.service.ts
- packages/shared/src/ai/summary.ts
- apps/api/src/modules/contract-intel/contract-intel.service.ts
- apps/api/src/modules/contract-intel/contract-rule-engine.ts
- apps/api/src/modules/document/extraction/extraction-queue.service.ts
- apps/api/src/common/db/pg-boss-runtime-options.ts
- 신규: db/migrations/00XX_add_contract_ai_review_findings.sql (missing)

Acceptance tests:

- 자동: tests/integration/contract-intel.spec.ts 확장 — process 실행 후(AI 생성 스텁 주입) ai_source finding 행 생성, 인용 없는 AI 결과는 저장 거부, 승인 API 호출 시 CONTRACT_AI_REVIEW_ACCEPTED 감사 이벤트 기록
- 수동: 계약 문서 process 실행 → 계약 탭 통합 패널에 룰 위반과 AI 소견 카드(인용 포함)가 함께 표시되고 '검토 완료' 클릭 시 /audit에 승인 이벤트가 남으면 통과
- 성능: 로컬 Gemma 경로에서 문서 1건의 AI 검토 잡이 5분 내 완료(pg-boss 잡 시작/완료 타임스탬프 로그로 측정, 초과 시 잡 재시도 정책 확인)

Manual QA requirement:

- 수동: 계약 문서 process 실행 → 계약 탭 통합 패널에 룰 위반과 AI 소견 카드(인용 포함)가 함께 표시되고 '검토 완료' 클릭 시 /audit에 승인 이벤트가 남으면 통과

Migration requirements:

- 신규: db/migrations/00XX_add_contract_ai_review_findings.sql
- **Scope:** contract-intel processDocument 완료 시 pg-boss 잡(extraction-queue.service.ts의 잡 패턴 재사용)으로 ai-summary의 clause_analysis/risk_extraction 태스크를 실행하고, 결과를 룰 finding과 동일 스키마의 ai_source 구분으로 저장(마이그레이션). 계약 탭에 '룰 위반+AI 소견+인용' 통합 패널 추가. 변호사 승인 액션 → CONTRACT_AI_REVIEW_ACCEPTED 감사 이벤트(15단계의 'AI 1차 검토→변호사 검토' 전이를 데이터로 고정). 기존 로컬 Gemma 생성+인용 검증 경로를 그대로 사용 — Strong LLM 라우팅 고도화는 AI 워크스트림 담당.
- - `신규: db/migrations/00XX_add_contract_ai_review_findings.sql`

Audit/security invariants:

- #### G4 [M] AI 1차 검토 연결 — clause_analysis/risk_extraction 소비
- **Goal:** 계약 process 완료 시 AI 1차 검토(조항 분석·리스크 추출)가 자동 실행되어 룰엔진 finding과 함께 통합 패널에 표시되고, 변호사 승인이 감사 이벤트로 고정된다. '능력은 있으나 소비처 없음' 상태가 해소된다.
- **Scope:** contract-intel processDocument 완료 시 pg-boss 잡(extraction-queue.service.ts의 잡 패턴 재사용)으로 ai-summary의 clause_analysis/risk_extraction 태스크를 실행하고, 결과를 룰 finding과 동일 스키마의 ai_source 구분으로 저장(마이그레이션). 계약 탭에 '룰 위반+AI 소견+인용' 통합 패널 추가. 변호사 승인 액션 → CONTRACT_AI_REVIEW_ACCEPTED 감사 이벤트(15단계의 'AI 1차 검토→변호사 검토' 전이를 데이터로 고정). 기존 로컬 Gemma 생성+인용 검증 경로를 그대로 사용 — Strong LLM 라우팅 고도화는 AI 워크스트림 담당.
- - `apps/api/src/modules/ai/features/ai-summary.service.ts`
- - `packages/shared/src/ai/summary.ts`
- - `신규: db/migrations/00XX_add_contract_ai_review_findings.sql`
- - 자동: tests/integration/contract-intel.spec.ts 확장 — process 실행 후(AI 생성 스텁 주입) ai_source finding 행 생성, 인용 없는 AI 결과는 저장 거부, 승인 API 호출 시 CONTRACT_AI_REVIEW_ACCEPTED 감사 이벤트 기록
- - 수동: 계약 문서 process 실행 → 계약 탭 통합 패널에 룰 위반과 AI 소견 카드(인용 포함)가 함께 표시되고 '검토 완료' 클릭 시 /audit에 승인 이벤트가 남으면 통과
- - 성능: 로컬 Gemma 경로에서 문서 1건의 AI 검토 잡이 5분 내 완료(pg-boss 잡 시작/완료 타임스탬프 로그로 측정, 초과 시 잡 재시도 정책 확인)

External evidence needs:

- [object Object]
- [object Object]
- [object Object]

Codex implementation/evidence tasks:

- run or repair the benchmark/performance harness and store the receipt
- clear or explicitly disposition unrelated broad-check blockers before promotion
- retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy

User/operator actions:

- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- Manual QA receipt is missing: run contract process on a staging/local UI document, observe rule findings plus AI opinions with citations in the contract tab, click review complete/accept, and confirm CONTRACT_AI_REVIEW_ACCEPTED in /audit.
- Performance receipt is missing: local queue/worker retry policy is implemented and unit-tested, but no runtime pg-boss/local Gemma timestamp evidence proves automatic first-review completion within 5 minutes.
- Changed-file LSP diagnostics remain unavailable: mcp__lsp.status and diagnostics returned Transport closed on 2026-07-05 for changed G4 API/shared/integration/web files.
- Full contract-intel integration file currently has an unrelated non-G4 blocker: existing clause-search ranking test failed with unrelatedRank = -1 at tests/integration/contract-intel.spec.ts:795.

Promotion gate:

- close gap: Manual QA receipt is missing: run contract process on a staging/local UI document, observe rule findings plus AI opinions with citations in the contract tab, click review complete/accept, and confirm CONTRACT_AI_REVIEW_ACCEPTED in /audit.
- close gap: Performance receipt is missing: local queue/worker retry policy is implemented and unit-tested, but no runtime pg-boss/local Gemma timestamp evidence proves automatic first-review completion within 5 minutes.
- close gap: Changed-file LSP diagnostics remain unavailable: mcp__lsp.status and diagnostics returned Transport closed on 2026-07-05 for changed G4 API/shared/integration/web files.
- close gap: Full contract-intel integration file currently has an unrelated non-G4 blocker: existing clause-search ranking test failed with unrelatedRank = -1 at tests/integration/contract-intel.spec.ts:795.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage

### LCX-TUW80-G14 산출물 export — DD 보고서 초안·협상쟁점표·Closing Binder/Archive

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: Codex + operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:2953`
Tags: `manual-qa`, `lsp`, `m365-office`, `repo-implementation`, `external-ops`
Evidence refs currently recorded: 8

Dependencies:

- G3
- G5
- A12(Closing Binder 빌더 — 산출물 소비)

Primary code anchors:

- workers/ingestion/app/converters/docx_to_pdf.py
- workers/ingestion/tests/test_docx_to_pdf.py
- apps/api/src/modules/dd/dd.service.ts
- apps/api/src/modules/records/records.service.ts
- apps/api/src/modules/external/external.service.ts
- apps/api/src/modules/document/document-upload.service.ts
- apps/api/src/modules/document/extraction/extraction-queue.service.ts (pg-boss 잡 패턴)
- 신규: workers/ingestion/app/synthesis/ (보고서/바인더 합성 모듈)
- 신규: db/migrations/00XX_add_export_audit_actions.sql (missing)

Acceptance tests:

- 자동: workers/ingestion/tests/test_report_synthesis.py — 이슈/리스크 fixture로 DD 보고서 docx 생성, 필수 섹션(이슈 요약·리스크 등급표·인용 목록) 존재를 python-docx로 assert
- 자동: tests/integration/dd-vault.spec.ts 확장 — export 요청→pg-boss 잡 완료 후 documents 파이프라인에 신규 문서 행+감사 이벤트 생성; binder manifest의 각 항목 해시가 원본 document_versions.sha256과 전건 일치
- 자동: tests/integration/external-core.spec.ts 확장 — workspace archive 후 frozen 상태에서 신규 링크 발급 거부
- 수동: DD 탭에서 '보고서 초안 생성' 클릭 → 파일함에 docx가 나타나고 Word에서 정상 열람; 매터 종료 흐름에서 binder ZIP을 내려받아 manifest와 파일 수 일치 확인

Manual QA requirement:

- 수동: DD 탭에서 '보고서 초안 생성' 클릭 → 파일함에 docx가 나타나고 Word에서 정상 열람; 매터 종료 흐름에서 binder ZIP을 내려받아 manifest와 파일 수 일치 확인

Migration requirements:

- 신규: db/migrations/00XX_add_export_audit_actions.sql
- - `신규: db/migrations/00XX_add_export_audit_actions.sql`

Audit/security invariants:

- **Goal:** 버튼 한 번으로 DD 보고서 초안(docx), 협상쟁점표 export, Closing Binder(문서 목록+해시 manifest+ZIP)를 생성해 문서 파이프라인으로 재유입시키고, 매터/워크스페이스 종료 시 closing archive가 남는다.
- **Scope:** workers에 문서 합성 워커(python-docx 템플릿 엔진) 신설 — 기존 docx_to_pdf 컨버터를 후단 재사용. (1) DD 보고서 초안: report_inclusion=true 이슈+리스크+traceability 인용을 템플릿 합성(선택: ai-summary matter_summary 경로로 서술 초안 첨부). (2) 협상쟁점표 export(G3의 조인 데이터→docx/표). (3) Closing Binder: A 워크스트림의 매터 종료 이벤트에 연계해 문서 스냅샷 목록+document_versions sha256 manifest+ZIP export, records 보존 정책으로 freeze. (4) 외부 워크스페이스 closing archive: 문서 인덱스·Q&A·열람통계 manifest 포함, workspace frozen 전환. 생성물은 documents 업로드 파이프라인 재유입으로 버전·해시·감사를 자동 획득.
- - `apps/api/src/modules/external/external.service.ts`
- - `신규: db/migrations/00XX_add_export_audit_actions.sql`
- - 자동: tests/integration/dd-vault.spec.ts 확장 — export 요청→pg-boss 잡 완료 후 documents 파이프라인에 신규 문서 행+감사 이벤트 생성; binder manifest의 각 항목 해시가 원본 document_versions.sha256과 전건 일치
- - 자동: tests/integration/external-core.spec.ts 확장 — workspace archive 후 frozen 상태에서 신규 링크 발급 거부
- - (과대·과소 scope) size L인데 DD 보고서 docx 합성(신규 Python synthesis 모듈), 협상쟁점표 export, Closing Binder ZIP(manifest 해시 전건 대조), workspace archive freeze의 4개 산출물이 workers/ingestion·dd·records·external 4개 모듈에 걸쳐 있어 L 초과 의심. 예: G14a(DD 보고서 초안 + 협상쟁점표 export)와 G14b(Closing Binder/Archive + workspace freeze)로 분리 권고. 부수 문제: 제목에 '협상쟁점표' export가 있으나 acceptance tests에 협상쟁점표 export 검증이 전무함(테스트는 DD 보고서·binder·archive만 커버) — 분리하지 않는다면 협상쟁점표 export 테스트를 추가하거나 제목에서 제거하라.
- - (과대·과소 scope) G14의 'Closing Binder(문서 목록+해시 manifest+ZIP)'가 A12(Closing Binder 빌더)와 중복. G14에서 바인더 생성 로직을 제거하고 A12 산출물을 소비(export 포맷 추가·재유입)하는 것으로 축소하라. deps를 'A(매터 종료 자동화 이벤트)'가 아닌 A12로 명시.

External evidence needs:

- [object Object]

Codex implementation/evidence tasks:

- close the named repo implementation/test gap before promotion
- retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy

User/operator actions:

- provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens
- provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence
- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- DD export request path is not integrated with pg-boss or apps/api/src/modules/dd/dd.service.ts.
- Generated DOCX artifacts are not yet re-entered through apps/api/src/modules/document/document-upload.service.ts, so document rows, version hashes, and upload audit events are not proven.
- Export audit action migration is missing for real API export events.
- tests/integration/dd-vault.spec.ts export-request to document-pipeline coverage is missing.
- Closing Binder ZIP/archive work must consume A12 output; binder manifest hash parity is not proven in G14.
- tests/integration/external-core.spec.ts frozen workspace archive denial coverage is missing.
- Manual QA is missing: DD tab report generation, file appearance, Word open receipt, binder ZIP download, manifest/file-count parity.
- Changed-file LSP diagnostics are not collected; prior LSP attempts for this workstream reported Transport closed.

Promotion gate:

- close gap: DD export request path is not integrated with pg-boss or apps/api/src/modules/dd/dd.service.ts.
- close gap: Generated DOCX artifacts are not yet re-entered through apps/api/src/modules/document/document-upload.service.ts, so document rows, version hashes, and upload audit events are not proven.
- close gap: Export audit action migration is missing for real API export events.
- close gap: tests/integration/dd-vault.spec.ts export-request to document-pipeline coverage is missing.
- close gap: Closing Binder ZIP/archive work must consume A12 output; binder manifest hash parity is not proven in G14.
- close gap: tests/integration/external-core.spec.ts frozen workspace archive denial coverage is missing.
- close gap: Manual QA is missing: DD tab report generation, file appearance, Word open receipt, binder ZIP download, manifest/file-count parity.
- close gap: Changed-file LSP diagnostics are not collected; prior LSP attempts for this workstream reported Transport closed.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage

### LCX-TUW80-H12 국내 법률데이터 연동 — 법제처 국가법령정보 API→Authority 노드 + DART 공시 조회

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: Codex + operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:2988`
Tags: `manual-qa`, `lsp`, `real-fixture`, `repo-implementation`, `external-ops`
Evidence refs currently recorded: 21

Dependencies:

- F(F1 Authority 노드 타입·F4 Citation Ledger 연결 규약 협의 — 차단 아님)

Primary code anchors:

- apps/api/src/modules/integrations/ (matter-app 하위모듈 패턴 재사용)
- apps/api/src/modules/graph/graph-sync.service.ts
- apps/api/src/modules/graph/graph-query.service.ts
- db/migrations/0053_create_knowledge_graph.sql (:115 graph_nodes)
- apps/api/src/app.module.ts (모듈 등록)
- 신규: apps/api/src/modules/integrations/law-data/law-api.client.ts
- 신규: apps/api/src/modules/integrations/law-data/dart-api.client.ts
- 신규: apps/api/src/modules/integrations/law-data/law-data.controller.ts
- 신규: apps/api/src/modules/integrations/law-data/law-data.service.ts
- 신규: db/migrations/0102_add_authority_graph_nodes.sql (missing)
- 신규: tests/integration/law-data.spec.ts

Acceptance tests:

- 자동: tests/integration/law-data.spec.ts — HTTP 픽스처 목킹으로 법령 검색→graph_nodes에 authority 노드 upsert(동일 법령 재호출 시 중복 0, 멱등)·테넌트 RLS 준수; DART 회사 검색 프록시 응답 스키마 검증; API 키 미설정 시 not_configured 응답.
- 자동: law-api.client.spec.ts / dart-api.client.spec.ts — XML/JSON 응답 파싱 정규화, 레이트리밋 초과 시 backoff 재시도, 4xx fail-closed.
- 자동: tests/integration/graph.spec.ts 회귀 통과(노드 타입 확장이 기존 그래프 일관성 검사를 깨지 않음).
- 수동: 실 API 키로 '개인정보 보호법' 검색→조문 authority 노드 생성 확인, DART에서 상장사 1곳 최근 공시 10건 조회 응답 확인하면 통과.

Manual QA requirement:

- 수동: 실 API 키로 '개인정보 보호법' 검색→조문 authority 노드 생성 확인, DART에서 상장사 1곳 최근 공시 10건 조회 응답 확인하면 통과.

Migration requirements:

- db/migrations/0053_create_knowledge_graph.sql (:115 graph_nodes)
- 신규: db/migrations/0102_add_authority_graph_nodes.sql
- **Scope:** (1) integrations 모듈에 경량 커넥터 계층: API 키 관리(Secrets/env), 레이트리밋·재시도, 응답 정규화. (2) 국가법령정보센터 공동활용 OpenAPI(law.go.kr) 클라이언트: 법령/조문 메타 검색→graph_nodes에 authority 타입 노드 upsert(신규 마이그레이션으로 node type 확장), GET /v1/integrations/law/search 엔드포인트, 참조된 법령의 개정 여부 증분 갱신 pg-boss 주기 잡. (3) DART OpenAPI: 회사 검색+최근 공시 목록 READ 전용 프록시(GET /v1/integrations/dart/filings, 조회 캐시만 저장). (4) API 키 미설정 시 'not_configured' 명시 응답(fail-closed). 만들지 않음: 대법원 종합법률정보(공식 API 부재)·KRX, 판례 본문 대량 수집, Citation Ledger/조항은행 연결(knowledge-graph 워크스트림), 공시 원문 저장.
- - `db/migrations/0053_create_knowledge_graph.sql (:115 graph_nodes)`
- - `신규: db/migrations/0102_add_authority_graph_nodes.sql`

Audit/security invariants:

- **Scope:** (1) integrations 모듈에 경량 커넥터 계층: API 키 관리(Secrets/env), 레이트리밋·재시도, 응답 정규화. (2) 국가법령정보센터 공동활용 OpenAPI(law.go.kr) 클라이언트: 법령/조문 메타 검색→graph_nodes에 authority 타입 노드 upsert(신규 마이그레이션으로 node type 확장), GET /v1/integrations/law/search 엔드포인트, 참조된 법령의 개정 여부 증분 갱신 pg-boss 주기 잡. (3) DART OpenAPI: 회사 검색+최근 공시 목록 READ 전용 프록시(GET /v1/integrations/dart/filings, 조회 캐시만 저장). (4) API 키 미설정 시 'not_configured' 명시 응답(fail-closed). 만들지 않음: 대법원 종합법률정보(공식 API 부재)·KRX, 판례 본문 대량 수집, Citation Ledger/조항은행 연결(knowledge-graph 워크스트림), 공시 원문 저장.
- - 자동: tests/integration/law-data.spec.ts — HTTP 픽스처 목킹으로 법령 검색→graph_nodes에 authority 노드 upsert(동일 법령 재호출 시 중복 0, 멱등)·테넌트 RLS 준수; DART 회사 검색 프록시 응답 스키마 검증; API 키 미설정 시 not_configured 응답.
- - 자동: law-api.client.spec.ts / dart-api.client.spec.ts — XML/JSON 응답 파싱 정규화, 레이트리밋 초과 시 backoff 재시도, 4xx fail-closed.

External evidence needs:

- [object Object]
- [object Object]
- [object Object]
- [object Object]

Codex implementation/evidence tasks:

- close the named repo implementation/test gap before promotion
- retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy

User/operator actions:

- provide real sanitized fixture or staging sample receipt for the named artifact
- provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence
- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- Real law.go.kr API credential/operator receipt missing; current evidence uses local fixture HTTP server only.
- Real OpenDART API credential/operator receipt missing; current evidence uses local fixture HTTP server only.
- External smoke missing: no real law.go.kr search for 개인정보 보호법 or equivalent has been executed and recorded against the official API.
- External smoke missing: no real DART recent-filings lookup for a listed company has been executed and recorded against the official API.
- DART company-search/corp-code discovery remains incomplete; the implemented repo-local slice accepts corpCode and does not yet provide a company-name lookup or corpCode.xml cache.
- Law amendment incremental refresh pg-boss periodic job is not implemented in this repo-local slice.
- Manual/staging QA receipt missing: lawyer searches a law, confirms authority node creation/visibility, and views recent DART filings for a real listed company.
- D12 search UI authority tab and Citation Ledger/조항은행 integration are separate downstream surfaces and are not implemented by H12.
- Changed-file LSP diagnostics unavailable: mcp__lsp.status and mcp__lsp.diagnostics returned Transport closed on 2026-07-05.
- Before COMPLETE_CANDIDATE promotion, rerun focused checks, external smokes, manual/staging QA, ledger regeneration, JSON validation, and git diff check.

Promotion gate:

- close gap: Real law.go.kr API credential/operator receipt missing; current evidence uses local fixture HTTP server only.
- close gap: Real OpenDART API credential/operator receipt missing; current evidence uses local fixture HTTP server only.
- close gap: External smoke missing: no real law.go.kr search for 개인정보 보호법 or equivalent has been executed and recorded against the official API.
- close gap: External smoke missing: no real DART recent-filings lookup for a listed company has been executed and recorded against the official API.
- close gap: DART company-search/corp-code discovery remains incomplete; the implemented repo-local slice accepts corpCode and does not yet provide a company-name lookup or corpCode.xml cache.
- close gap: Law amendment incremental refresh pg-boss periodic job is not implemented in this repo-local slice.
- close gap: Manual/staging QA receipt missing: lawyer searches a law, confirms authority node creation/visibility, and views recent DART filings for a real listed company.
- close gap: D12 search UI authority tab and Citation Ledger/조항은행 integration are separate downstream surfaces and are not implemented by H12.
- close gap: Changed-file LSP diagnostics unavailable: mcp__lsp.status and mcp__lsp.diagnostics returned Transport closed on 2026-07-05.
- close gap: Before COMPLETE_CANDIDATE promotion, rerun focused checks, external smokes, manual/staging QA, ledger regeneration, JSON validation, and git diff check.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage

### LCX-TUW80-H13 Analytics-lite — 사용 통계 대시보드

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: Codex + operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:3022`
Tags: `manual-qa`, `lsp`, `benchmark`
Evidence refs currently recorded: 40

Dependencies:

- none

Primary code anchors:

- apps/api/src/modules/dashboard/dashboard.service.ts
- apps/api/src/modules/dashboard/dashboard.controller.ts
- apps/api/src/modules/dashboard/dashboard.service.spec.ts
- apps/api/src/modules/audit/audit-query.service.ts (집계·CSV export 패턴 재사용)
- apps/web/src/app/(app)/dashboard/vault-activity-client.tsx
- apps/web/src/lib/api/dashboard.ts
- 신규: tests/integration/usage-stats.spec.ts

Acceptance tests:

- 자동: tests/integration/usage-stats.spec.ts — 감사 이벤트·문서·파일 시드 후 기간별 집계 수치 일치(업로드 3/다운로드 2/검색 5 등 기대값 assert), 타 테넌트 데이터 미포함(RLS), 비관리자 역할 403, CSV export 시 감사 이벤트 기록.
- 자동: dashboard.service.spec.ts 확장 — 기간 경계(월초/월말/빈 기간 0 반환)와 스토리지 합계 계산 검증.
- 성능: 감사 이벤트 10만 건 시드 기준 usage-stats 응답 p95 < 2초(통합 테스트 내 타이머 측정으로 기록).
- 수동: /dashboard에서 지난 30일 통계 카드 표시, 수치가 /audit 콘솔 동일 기간 필터 건수와 일치, CSV 다운로드 열림 확인하면 통과.

Manual QA requirement:

- 수동: /dashboard에서 지난 30일 통계 카드 표시, 수치가 /audit 콘솔 동일 기간 필터 건수와 일치, CSV 다운로드 열림 확인하면 통과.

Migration requirements:

- none

Audit/security invariants:

- **Scope:** (1) dashboard 모듈 확장: GET /v1/dashboard/usage-stats(기간 파라미터, firm_admin/security_admin 전용) — audit_events·documents·file_objects 온디맨드 집계(9인 규모라 materialized 테이블 불필요, 필요 인덱스만 확인·추가). (2) /dashboard에 사용 통계 섹션(기존 vault-activity-client 패턴으로 카드+표). (3) CSV export(기존 audit export 패턴 재사용, export 행위 자체 감사). 만들지 않음: BI 도구 연동, 예측/이상 분석, 과금·미터링, 사용자별 생산성 평가 지표.
- - `apps/api/src/modules/audit/audit-query.service.ts (집계·CSV export 패턴 재사용)`
- - 자동: tests/integration/usage-stats.spec.ts — 감사 이벤트·문서·파일 시드 후 기간별 집계 수치 일치(업로드 3/다운로드 2/검색 5 등 기대값 assert), 타 테넌트 데이터 미포함(RLS), 비관리자 역할 403, CSV export 시 감사 이벤트 기록.
- - 성능: 감사 이벤트 10만 건 시드 기준 usage-stats 응답 p95 < 2초(통합 테스트 내 타이머 측정으로 기록).
- - 수동: /dashboard에서 지난 30일 통계 카드 표시, 수치가 /audit 콘솔 동일 기간 필터 건수와 일치, CSV 다운로드 열림 확인하면 통과.
- - (테스트 불가능한 완료판정) 성능 기준 'p95 < 2초(통합 테스트 내 타이머 측정으로 기록)'은 (1) 표본 수가 정의되지 않아 p95 산출 절차가 모호하고 (2) '기록'만 하고 assert 여부가 불명확해 통과/실패 판정이 불가. 예: '감사 이벤트 10만 건 시드 후 usage-stats 엔드포인트를 연속 20회 호출한 응답시간의 p95 < 2초를 테스트에서 assert'처럼 표본 수와 판정 방식을 확정하라.

External evidence needs:

- [object Object]
- [object Object]

Codex implementation/evidence tasks:

- run or repair the benchmark/performance harness and store the receipt
- retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy

User/operator actions:

- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- Manual/staging QA receipt missing: on the running /dashboard surface, confirm the last-30-days usage-stat cards render, compare uploads/downloads/searches against the /audit console with the same period filter, and open the downloaded CSV.
- Changed-file LSP diagnostics receipt missing: mcp__lsp.diagnostics returned Transport closed on 2026-07-04; rerun diagnostics when LSP transport is available.

Promotion gate:

- close gap: Manual/staging QA receipt missing: on the running /dashboard surface, confirm the last-30-days usage-stat cards render, compare uploads/downloads/searches against the /audit console with the same period filter, and open the downloaded CSV.
- close gap: Changed-file LSP diagnostics receipt missing: mcp__lsp.diagnostics returned Transport closed on 2026-07-04; rerun diagnostics when LSP transport is available.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage

### LCX-TUW80-H14 Microsoft OIDC 간편 로그인 (선택·저순위)

Ledger status: `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`
Owner: Codex + operator
Source: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:3050`
Tags: `manual-qa`, `lsp`, `m365-office`, `external-ops`
Evidence refs currently recorded: 18

Dependencies:

- H1(로그인 플로 리팩터링 선행 — mfa_pending 상태머신과의 충돌 방지)
- H2(비활성 사용자 거부 경로 재사용)

Primary code anchors:

- apps/api/src/modules/auth/auth.controller.ts
- apps/api/src/modules/auth/auth.service.ts (세션 발급 경로 재사용)
- apps/api/src/modules/auth/session.repository.ts
- apps/api/src/modules/user/user-login-identity.service.ts
- apps/api/src/modules/user/user-login-identity.controller.ts
- db/migrations/0090_create_user_login_identities.sql
- apps/web/src/app/(auth)/login/login-form.tsx
- packages/shared/src/audit/audit-event-types.ts
- 신규: apps/api/src/modules/auth/oidc-microsoft.service.ts
- 신규: tests/integration/auth-oidc.spec.ts

Acceptance tests:

- 자동: tests/integration/auth-oidc.spec.ts — 로컬 JWKS로 목킹한 IdP 토큰으로 callback 검증: 유효 ID 토큰+매핑된 identity→세션 발급, 미매핑 sub→403+LOGIN_FAILURE 감사, state/nonce 불일치→거부, 비활성 사용자→거부.
- 자동: oidc-microsoft.service.spec.ts — 서명 불일치/만료/audience 불일치 토큰 전부 fail-closed 거부 검증.
- 자동: tests/integration/auth-session.spec.ts·auth-mfa.spec.ts 회귀 — 비밀번호+TOTP 경로 무변경.
- 수동: Entra 테스트 테넌트로 로그인 버튼→M365 계정 인증→대시보드 진입, /audit에서 method=oidc LOGIN_SUCCESS 확인, 비활성화 계정은 OIDC로도 차단되면 통과.
- **B11**: deps에 B18 추가, 조항 내부 diff를 packages/redline 문자 diff로 대체(이중 엔진 금지). '만들지 않는 것'의 PDF 배제는 B19가 담당함을 명시.
- **C13**: scope에 add-in 매터 자유검색 picker가 C16에서 선행 구현됨을 반영(중복 방지).
- **C14**: scope (4)의 send_and_file 원문 재검사 전제가 C16으로 해소됨을 명시.
- **B12**: 편집 종료 다이얼로그에 B17 버전 선택 통합.

Manual QA requirement:

- 수동: Entra 테스트 테넌트로 로그인 버튼→M365 계정 인증→대시보드 진입, /audit에서 method=oidc LOGIN_SUCCESS 확인, 비활성화 계정은 OIDC로도 차단되면 통과.

Migration requirements:

- db/migrations/0090_create_user_login_identities.sql
- - `db/migrations/0090_create_user_login_identities.sql`
- **Code anchors:** `db/migrations/(신규)_add_documents_updated_by.sql`, `packages/shared/src/types/document.ts:99-116`, `apps/api/src/modules/document/document.service.ts:227-241`, `apps/api/src/modules/document/document-editing.service.ts:570,631,1199`, `apps/web/src/components/document/document-vault-list.tsx`, `apps/web/src/app/(app)/clients/[clientId]/page.tsx`
- **Code anchors:** `apps/api/src/modules/document/document-editing.service.ts:515-527(잠금 분기),242-244(documentLocked 헬퍼)`, `apps/web/src/components/document/document-action-center.tsx:344-345`, `apps/web/src/lib/api-client.ts:68-82(에러 파싱 계약 — 변경 금지)`, `packages/shared/src/dto/audit(action enum·documentTimelineAuditActions)`, `apps/api/src/modules/audit/events/document-events.ts`, `db/migrations/0086(notifications kind)`, `apps/api/src/modules/document/document-version.service.ts(잠금 중 버전 차단)`
- **Acceptance tests:** 자동 — (a) 이식된 diff-engine 테스트 전체가 pnpm test로 통과, (b) 한글 계약서 DOCX 버전쌍 픽스처에서 삽입/삭제/이동/표 셀 변경이 문자 단위 스팬으로 검출되는 회귀 테스트 — **픽스처는 익명화 합성 문서로 제작**(실계약서 리포 반입 금지; 조항 번호 문단·표·정의어 목록을 포함한 20p/100p 2종, 발주자 제공 샘플 참조 후 합성), (c) 5,000자 초과 문단의 단어 폴백 경계 테스트, (d) NFC 미정규화 입력 처리 테스트. 성능 — 100페이지급 합성 픽스처 쌍 diff가 워커 스레드에서 **p95 210초(3.5분) 내** 완료 assert(B19 e2e 5분 예산과 정합). 캐시: 초기 구현은 **캐시 생략을 기본**으로 하고, 도입 시 redline_cache(tenant_id 포함, RLS FORCE, 롤백 스크립트 — 리포 마이그레이션 규약 준수)로 추가한다.
- **Code anchors:** `신규: apps/api/src/modules/comparison/**`, `db/migrations/(신규)_create_redline_jobs.sql`, `apps/api/src/modules/document/document-version.service.ts`, `apps/web/src/components/document/document-action-center.tsx (버전 목록)`, `apps/api/src/modules/storage`

Audit/security invariants:

- **Scope:** (1) openid-client 기반 Entra ID OIDC authorization code flow(PKCE): GET /v1/auth/oidc/microsoft/start, /callback — state/nonce, ID 토큰 issuer/audience/서명 검증. (2) 사용자 매핑은 기존 user_login_identities(0090) 재사용: 사전 등록된 identity만 허용, 미매핑 sub는 거부(JIT 생성 없음). (3) 성공 시 기존 세션 발급 경로 재사용, 비활성 사용자는 기존 fail-closed 검사로 거부. (4) OIDC 경로의 MFA는 Entra 정책에 위임하고 sessions.mfa_verified 처리 근거를 문서화. (5) LOGIN_SUCCESS 감사 metadata에 method=oidc. (6) 로그인 폼에 버튼 추가. 만들지 않음: SAML, SCIM 프로비저닝, JIT 사용자 생성, 비밀번호 로그인 비활성화 강제(enforcement_mode), Google OIDC.
- **완화 노트:** SAML SSO 런타임은 완화 정책으로 제외 — 선택 항목인 Microsoft OIDC만, horizon 3 저순위. 기존 enterprise_sso_providers 해시 등록부는 건드리지 않음(감사 원장으로 유지).
- - `packages/shared/src/audit/audit-event-types.ts`
- - 자동: tests/integration/auth-oidc.spec.ts — 로컬 JWKS로 목킹한 IdP 토큰으로 callback 검증: 유효 ID 토큰+매핑된 identity→세션 발급, 미매핑 sub→403+LOGIN_FAILURE 감사, state/nonce 불일치→거부, 비활성 사용자→거부.
- - 자동: oidc-microsoft.service.spec.ts — 서명 불일치/만료/audience 불일치 토큰 전부 fail-closed 거부 검증.
- - 수동: Entra 테스트 테넌트로 로그인 버튼→M365 계정 인증→대시보드 진입, /audit에서 method=oidc LOGIN_SUCCESS 확인, 비활성화 계정은 OIDC로도 차단되면 통과.
- 2. AI 노출은 검색 품질 이후: E2 → E1(D2/D3 이후 착수 권장) → E3 → E4. F4·F5는 E3와 병렬 가능.
- **Acceptance tests:** 자동 — tests/integration/document-access 계열에 (a) clientId 필터 목록이 해당 고객 매터의 문서만 반환, (b) cross-tenant clientId는 빈 결과, (c) 체크인 수행 후 updated_by가 편집자로 갱신됨을 검증. 수동 — /files에서 고객 선택 시 목록이 즉시 필터되고 각 행에 고객명·최종 편집자가 표시되면 통과.
- **Scope:** (1) 잠금 정보 노출: 에러 페이로드 확장이 아니라 **기존 GET /documents/:id/edit-sessions/active 조회로 확정** — 응답 DTO에 lockOwnerDisplayName(users JOIN)·checkedOutAt·expiresAt 추가. 웹은 DOCUMENT_LOCKED(400, {code, reason, requestId} 계약 불변) 수신 시 이 API를 호출해 프롬프트를 구성한다. (2) 액션센터의 정적 에러 배너를 대화형 프롬프트로 교체 — 선택지: [작업사본 다운로드] / [잠금 해제 요청] / [취소]. 작업사본 다운로드는 기존 감사 다운로드 엔드포인트에 `purpose=working_copy` 파라미터를 추가해 **서버가 Content-Disposition으로 `{원제}_copy_{사용자}_{일시}` 파일명을 결정**하고 DOCUMENT_COPY_DOWNLOADED 감사 이벤트를 기록한다(신규 action은 packages/shared audit-query action enum + documentTimelineAuditActions + document-events.ts 3곳 등록 — 문서 감사 타임라인에 노출 필수). 잠금 해제 요청은 1단계 축소 구현: POST .../edit-sessions/:sessionId/release-requests → 잠금 소유자에게 인앱 알림(0086 notifications kind 추가, matter owner CC) + DOCUMENT_LOCK_RELEASE_REQUESTED 감사 + 동일 세션당 1회 억제. 강제 해제 자체는 B6의 관리자 권한. (3) 사본 재업로드 안내: 업로드 패널에서 '기존 문서의 새 버전으로 업로드' 경로 안내 배너(자동 병합은 하지 않음 — 수동 검토 전제 명시). (4) **잠금 활성 중 버전 정책 확정**: 타인 잠금이 활성인 동안 해당 문서의 새 공식 버전 업로드는 409(DOCUMENT_LOCKED_FOR_VERSIONING)로 차단한다 — copy 작업자는 소유자의 체크인/잠금 해제 후 새 버전으로 업로드한다(버전 체인 인터리빙 금지). 만들지 않을 것: 자동 병합, 브랜치·포크 버전 트리(단일 버전 체인 유지), 동시 편집, 에러 페이로드 스키마 변경.
- **Code anchors:** `apps/api/src/modules/document/document-editing.service.ts:515-527(잠금 분기),242-244(documentLocked 헬퍼)`, `apps/web/src/components/document/document-action-center.tsx:344-345`, `apps/web/src/lib/api-client.ts:68-82(에러 파싱 계약 — 변경 금지)`, `packages/shared/src/dto/audit(action enum·documentTimelineAuditActions)`, `apps/api/src/modules/audit/events/document-events.ts`, `db/migrations/0086(notifications kind)`, `apps/api/src/modules/document/document-version.service.ts(잠금 중 버전 차단)`
- **Acceptance tests:** 자동(통합테스트) — (a) 타인 잠금 상태에서 GET edit-sessions/active 응답에 lockOwnerDisplayName·expiresAt 포함, (b) purpose=working_copy 다운로드 시 Content-Disposition 사본 파일명 + DOCUMENT_COPY_DOWNLOADED 감사 행 + 문서 감사 타임라인 노출, (c) 잠금 활성 중 타인의 새 버전 업로드가 409 DOCUMENT_LOCKED_FOR_VERSIONING으로 거부되고 체크인 후 성공하는 인터리빙 테스트, (d) 해제 요청 시 소유자 알림 생성 + 동일 세션 중복 요청 억제. 수동 — 계정 2개로 동시 편집 시도: 두 번째 계정에 프롬프트가 뜨고 [작업사본 다운로드]→로컬 수정→(소유자 체크인 후) 새 버전 업로드 흐름이 완결되면 통과.
- **Scope:** (1) check-in API에 `promoteImmediately` 옵션 추가 — 리뷰어가 지정되지 않은 문서는 체크인+promote를 단일 트랜잭션으로 수행(9인 내부용 완화: self-promote 허용을 테넌트 정책 플래그로), 리뷰어 지정 문서는 기존 리뷰 게이트 유지. (2) 웹 체크인 다이얼로그: [검토본으로 저장 vN.M] / [공식 버전으로 발행 vN+1 — B4 버전 라벨(고객송부/최종본/체결본 등) 선택 포함]. (3) B12 데스크톱 브리지의 편집 종료 흐름에도 동일 다이얼로그 노출. 만들지 않을 것: 리뷰 게이트 폐지(정책 플래그 기본값은 게이트 유지), 저장(save)마다 선택(저장은 서브버전 자동 유지 — 선택은 체크인 시점에만).
- **Acceptance tests:** 자동 — (a) 리뷰어 미지정 문서에서 promoteImmediately 체크인 시 새 공식 버전 생성+검토본 promoted 전이+감사 2건, (b) 리뷰어 지정 문서에서 동일 요청이 review_required로 거부, (c) 정책 플래그 off 테넌트에서 promoteImmediately 거부 검증(통합테스트). 수동 — 편집→체크인 다이얼로그에서 '공식 버전으로 발행+체결본 라벨' 선택 시 버전 목록에 vN+1·체결본 배지가 표시되면 통과.
- **Scope:** (1) `outlook_filing_requests(request_kind='send_and_file')` 소비 이행 경로 신설(기존 outlook-fulfillment 상태기계 재사용). **인증 모델 확정: 위임(OBO) 방식** — send-file 요청 생성 시 add-in이 단기 OBO assertion을 동반 전달(수신 파일링 DTO 패턴 재사용)하도록 createOutlookSendFileRequestSchema에 graphOboAssertion 필드를 확장하고, 서버는 요청 생성 트랜잭션 내에서 이행 잡을 enqueue한다(애플리케이션 권한 Mail.Read 방식은 채택하지 않음 — 채택 변경은 핸드오프 패키지 07 문서에 신규 결정으로 등록해 발주자 승인 필요). **이행 트리거·재시도**: 초기 지연 20초 후 첫 시도, Sent Items 미반영 시 백오프 15s→30s→60s(이후 60s 고정)로 최대 10분 재시도, 최종 미발견 시 failed(사유코드 sent_item_not_found)로 종결하고 태스크페인·/notifications에 노출. **매칭 규칙**: Graph 질의 창은 발송 요청 시각 ±10분·최대 50건, 매칭 키 우선순위 ① internetMessageId 해시 ② conversationId 해시 + 정규화 메시지(canonical) 해시 병합 — 해시는 smart-alerts.js의 namespacedHash 규약을 서버와 공유 모듈로 통일. 다중 매치 시 최신 1건 + 감사 경고, 무매치 시 재시도. (2) Smart Alerts warn 프롬프트에서 compose 태스크페인 오픈 연계(contextData/commandId)로 '발송 시 e-filing→매터 선택' UX 완결. (3) 태스크페인 Matter 카드에 자유검색 입력 추가(기존 matter-lookup/suggestions API 확장) — 추천 없음 케이스 해소. (4) 운영 게이트: **R0(관리자) 링 기준으로 구현·검증하고**, D-04(허용 링) 확정 시 outlook-operational-gate 설정 변경만으로 확대되도록 디커플링. C14(발송 전 DLP 검사)의 '이행 시 원문 재검사' 전제를 이 유닛이 해소함을 명시. 만들지 않을 것: 자동 파일링(발송 메일 전건 저장 — 사용자 선택 유지), Gmail, 애플리케이션 권한 기반 메일박스 상시 접근.
- **Acceptance tests:** 자동 — tests/integration에 (a) send_and_file 요청 생성→이행 잡 실행→email_messages 행+매터 파일링+completed 전이, (b) Sent Items 미반영 시뮬레이션에서 백오프 재시도 후 성공, 10분 초과 시 sent_item_not_found로 failed 전이, (c) 매칭 키 우선순위(internetMessageId→conversationId+canonical) 및 다중 매치 처리 검증, (d) 권한 없는 매터 지정 시 거부. 수동 — 파일럿(R0) 계정에서 외부 수신자 메일 발송 시 SoftBlock 프롬프트→태스크페인→매터 자유검색 선택→발송 후 표시(정상 경로 1분 내, Sent Items 지연 시 최대 10분 + 상태 노출)되면 통과.
- **Code anchors:** `신규: packages/redline/**`, 원본: Contract Desk `src/main/services/{diff-engine,text-normalizer,docx-block-extractor,comparison-file-extractor,pdf-visual-document,pdf-ocr}.ts`, `src/main/__tests__/diff-engine.test.ts` 외
- **Acceptance tests:** 자동 — (a) 이식된 diff-engine 테스트 전체가 pnpm test로 통과, (b) 한글 계약서 DOCX 버전쌍 픽스처에서 삽입/삭제/이동/표 셀 변경이 문자 단위 스팬으로 검출되는 회귀 테스트 — **픽스처는 익명화 합성 문서로 제작**(실계약서 리포 반입 금지; 조항 번호 문단·표·정의어 목록을 포함한 20p/100p 2종, 발주자 제공 샘플 참조 후 합성), (c) 5,000자 초과 문단의 단어 폴백 경계 테스트, (d) NFC 미정규화 입력 처리 테스트. 성능 — 100페이지급 합성 픽스처 쌍 diff가 워커 스레드에서 **p95 210초(3.5분) 내** 완료 assert(B19 e2e 5분 예산과 정합). 캐시: 초기 구현은 **캐시 생략을 기본**으로 하고, 도입 시 redline_cache(tenant_id 포함, RLS FORCE, 롤백 스크립트 — 리포 마이그레이션 규약 준수)로 추가한다.
- **Goal:** 사용자가 문서 상세의 버전 타임라인에서 두 버전(공식 버전 또는 검토본)을 선택해 '음절단위 redline PDF 생성'을 누르면, 요약 페이지+본문 redline(추가=파랑, 삭제=빨강 취소선, 이동=초록)+변경노트로 구성된 PDF가 생성되어 권한·감사 통제 하에 열람·다운로드된다.
- **Scope:** (1) apps/api ComparisonModule — 입력 (documentId, versionA, versionB) 쌍: 양 버전 canRead 권한·윤리장벽 검사(fail-closed)→S3 임시 다운로드→packages/redline 호출. 소형 문서는 동기, 그 외 pg-boss `redline.generate` 잡(Contract Desk comparison_export_jobs 패턴: PENDING→COMPLETED/FAILED, 재시도·타임아웃 정책). (2) PDF 렌더: redline HTML 조립 후 Playwright chromium printToPDF(한글 폰트 컨테이너 포함) — Electron printToPDF 대체. (3) 산출물을 rendition으로 S3 저장+documents 파생물 행 기록(원본과 동일 confidentiality 상속, REDLINE_GENERATED 감사 이벤트, 외부공유 시 B3 워터마크 경로 통과). (4) UI: 문서 상세 버전 목록에 비교 대상 선택 체크박스+'Redline PDF' 버튼, 생성 상태 표시(진행/완료/실패), 완료 시 미리보기·다운로드. B11(조항 단위 비교 탭)은 본 패키지의 diff 결과를 재사용하도록 scope 조정 — B11 deps에 B18 추가. 만들지 않을 것: PDF↔DOCX 교차 비교, 서식보존 DOCX redline(B20).
- **Dependencies:** B18, B3(워터마크 — 외부공유 경로), H6(워커 — 소프트)

External evidence needs:

- **Goal:** 사용자가 로그인 화면의 'Microsoft로 로그인' 버튼으로 로펌 M365 계정 인증만으로 로그인할 수 있다(기존 비밀번호+TOTP 로그인은 그대로 유지).
- - 수동: Entra 테스트 테넌트로 로그인 버튼→M365 계정 인증→대시보드 진입, /audit에서 method=oidc LOGIN_SUCCESS 확인, 비활성화 계정은 OIDC로도 차단되면 통과.
- **Scope:** (1) check-in API에 `promoteImmediately` 옵션 추가 — 리뷰어가 지정되지 않은 문서는 체크인+promote를 단일 트랜잭션으로 수행(9인 내부용 완화: self-promote 허용을 테넌트 정책 플래그로), 리뷰어 지정 문서는 기존 리뷰 게이트 유지. (2) 웹 체크인 다이얼로그: [검토본으로 저장 vN.M] / [공식 버전으로 발행 vN+1 — B4 버전 라벨(고객송부/최종본/체결본 등) 선택 포함]. (3) B12 데스크톱 브리지의 편집 종료 흐름에도 동일 다이얼로그 노출. 만들지 않을 것: 리뷰 게이트 폐지(정책 플래그 기본값은 게이트 유지), 저장(save)마다 선택(저장은 서브버전 자동 유지 — 선택은 체크인 시점에만).
- **Acceptance tests:** 자동 — (a) 리뷰어 미지정 문서에서 promoteImmediately 체크인 시 새 공식 버전 생성+검토본 promoted 전이+감사 2건, (b) 리뷰어 지정 문서에서 동일 요청이 review_required로 거부, (c) 정책 플래그 off 테넌트에서 promoteImmediately 거부 검증(통합테스트). 수동 — 편집→체크인 다이얼로그에서 '공식 버전으로 발행+체결본 라벨' 선택 시 버전 목록에 vN+1·체결본 배지가 표시되면 통과.
- **Acceptance tests:** 자동 — tests/integration에 (a) send_and_file 요청 생성→이행 잡 실행→email_messages 행+매터 파일링+completed 전이, (b) Sent Items 미반영 시뮬레이션에서 백오프 재시도 후 성공, 10분 초과 시 sent_item_not_found로 failed 전이, (c) 매칭 키 우선순위(internetMessageId→conversationId+canonical) 및 다중 매치 처리 검증, (d) 권한 없는 매터 지정 시 거부. 수동 — 파일럿(R0) 계정에서 외부 수신자 메일 발송 시 SoftBlock 프롬프트→태스크페인→매터 자유검색 선택→발송 후 표시(정상 경로 1분 내, Sent Items 지연 시 최대 10분 + 상태 노출)되면 통과.
- **Scope:** (1) apps/api ComparisonModule — 입력 (documentId, versionA, versionB) 쌍: 양 버전 canRead 권한·윤리장벽 검사(fail-closed)→S3 임시 다운로드→packages/redline 호출. 소형 문서는 동기, 그 외 pg-boss `redline.generate` 잡(Contract Desk comparison_export_jobs 패턴: PENDING→COMPLETED/FAILED, 재시도·타임아웃 정책). (2) PDF 렌더: redline HTML 조립 후 Playwright chromium printToPDF(한글 폰트 컨테이너 포함) — Electron printToPDF 대체. (3) 산출물을 rendition으로 S3 저장+documents 파생물 행 기록(원본과 동일 confidentiality 상속, REDLINE_GENERATED 감사 이벤트, 외부공유 시 B3 워터마크 경로 통과). (4) UI: 문서 상세 버전 목록에 비교 대상 선택 체크박스+'Redline PDF' 버튼, 생성 상태 표시(진행/완료/실패), 완료 시 미리보기·다운로드. B11(조항 단위 비교 탭)은 본 패키지의 diff 결과를 재사용하도록 scope 조정 — B11 deps에 B18 추가. 만들지 않을 것: PDF↔DOCX 교차 비교, 서식보존 DOCX redline(B20).
- **Dependencies:** B18, B3(워터마크 — 외부공유 경로), H6(워커 — 소프트)

Codex implementation/evidence tasks:

- retry changed-file LSP diagnostics or record the accepted unavailable-tool evidence under policy

User/operator actions:

- provide sanitized M365/Office/Entra manual or admin receipt without secrets, tenant ids, account ids, mailbox addresses, or tokens
- provide official API/ops receipt or mark the external credential/operation as blocked with non-repo evidence
- perform the exact staging/browser manual QA path in the row and capture a sanitized receipt

Remaining gaps from current ledger:

- H14 manual/staging QA receipt gap: no current evidence shows a real Entra test tenant login through the Microsoft button, M365 account authentication, dashboard redirect, and /audit LOGIN_SUCCESS metadata method=oidc.
- H14 inactive-user manual QA gap: no current staging/browser receipt confirms a real inactive Entra-mapped account is blocked through OIDC.
- H14 LSP evidence gap: direct MCP LSP diagnostics returned Transport closed for changed TS/TSX files; retry when LSP transport is available.
- H14 final promotion gap: after manual/staging and LSP evidence are available or formally documented as external blockers, rerun focused checks, ledger regeneration, JSON validation, and git diff check before considering COMPLETE_CANDIDATE.

Promotion gate:

- close gap: H14 manual/staging QA receipt gap: no current evidence shows a real Entra test tenant login through the Microsoft button, M365 account authentication, dashboard redirect, and /audit LOGIN_SUCCESS metadata method=oidc.
- close gap: H14 inactive-user manual QA gap: no current staging/browser receipt confirms a real inactive Entra-mapped account is blocked through OIDC.
- close gap: H14 LSP evidence gap: direct MCP LSP diagnostics returned Transport closed for changed TS/TSX files; retry when LSP transport is available.
- close gap: H14 final promotion gap: after manual/staging and LSP evidence are available or formally documented as external blockers, rerun focused checks, ledger regeneration, JSON validation, and git diff check before considering COMPLETE_CANDIDATE.
- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage
