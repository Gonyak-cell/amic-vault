# 05. Contract Desk Redline 엔진 이식 명세 (B18·B19·B20 전용)

대상 유닛: B18(packages/redline 이식), B19(Redline PDF 서비스+UI), B20(서식보존 트랙체인지 — 조건부).
원본: Contract Desk 앱 — 폴더명 `01_Contract Desk_v0.11.0_auth_redline`, **실코드 버전 0.14.24** (package.json 기준). Electron(electron-vite) + React 19 + better-sqlite3.

> **착수 전 필수 — 원본 확보 절차**:
> 1. 스냅샷 위치(분석에 사용된 사본): `/Users/jws/Library/CloudStorage/GoogleDrive-sweatqoo@gmail.com/내 드라이브/01_Contract Desk_v0.11.0_auth_redline/` (발주자 Google Drive — 개발팀 전달 시 발주자가 사본 제공)
> 2. 원본 git 리포지토리 접근은 **발주자가 제공**한다(07 문서 §5 발주자 제공 의무 — URL·권한은 킥오프에서 기입). 최신본 확보 후 스냅샷(v0.14.24)과 대조하고 이식 기준 커밋/태그를 고정해 B18 PR 본문에 기록하라.
> 3. **폴백**: 킥오프 후 2주 내 git 접근이 제공되지 않으면 스냅샷(v0.14.24) 기준 이식으로 진행한다(발주자 서면 확인 — 07 §2 D-08).
> 4. 인코딩: 이식 전 **전 파일 UTF-8 유효성 검증 후 정리**를 절차로 일반화한다(확인된 사례: compare-v2.ts의 한글 문자열 mojibake — 이 파일 자체는 이식 목록 외지만 동일 오염이 다른 파일에 있을 수 있음).

## 1. 원본 앱 구조 (실측)

- **main 프로세스** `src/main/`: better-sqlite3 로컬 DB(projects, markups=버전, negotiation_issues, diff_cache, comparison_export_jobs 등 27개 테이블), IPC 핸들러 18모듈(compare, compare-v2, comparison-export, report, auth 등), 서비스 계층, worker_threads 기반 diff/extract 워커.
- **renderer** `src/renderer/`: React + TanStack Query + Tiptap, RedlineViewer/UnifiedView/ParagraphView.
- 기능: 프로젝트별 계약서 버전(markup) 타임라인, DOCX/PDF/XLSX/PPTX 버전쌍 비교, redline PDF·XLSX·PPTX 내보내기, LLM 조항 분석, Supabase 인증(이식 대상 아님 — vault 세션으로 대체).
- 테스트: vitest 83개 파일(main 36 + renderer). diff-engine·block-diff·comparison-export·pdf-direct-redline·word-redline 핵심 경로 커버.

## 2. "음절단위 redline"의 실제 구현 (이식 대상 파이프라인)

### 2.1 추출
- DOCX: `mammoth.convertToHtml` → 정규식 HTML 파싱으로 문단/표 블록화 — `src/main/services/docx-block-extractor.ts:4-42` (CompareBlock = paragraph | table)
- PDF: `pdfjs-dist`(legacy) 네이티브 텍스트, 텍스트 없으면 `tesseract.js`(kor+eng) OCR 폴백 + `@napi-rs/canvas` 페이지 PNG 렌더 — `comparison-file-extractor.ts:240`, `pdf-visual-document.ts:88-100`, `pdf-ocr.ts:57-58`

### 2.2 정규화
`text-normalizer.ts:71-95` — 공백·마침표·쉼표 제거하되 법률기호(₩ $ % § 원문자 ① 등) 화이트리스트 보존, `offsetMap`으로 원문 인덱스 기억(redline 스팬을 원문 위치로 복원하는 핵심).

### 2.3 Diff (외부 라이브러리 없음 — 자체 Myers O(ND))
`diff-engine.ts`(1,091줄), 3단계:
1. 블록 시그니처 LCS — `computeBlockDiff` (794-885행)
2. modified 문단쌍에 **문자 스트림 전체 Myers** — `diffCharsFullParagraph` (430-461행). 합산 5,000자 초과 시 단어 단위 폴백 후 changed run만 문자 세분화(`CHAR_DIFF_THRESHOLD`, 423행)
3. offsetMap 복원 — `charDiffWithOffsetRestore` (463-520행)

**"음절단위"의 실체**: 별도의 한글 자모 분해 로직이 아니라 **문자(UTF-16 코드유닛) 단위 Myers diff**다. 한글 완성형 음절(U+AC00–D7A3)이 1코드유닛이므로 문자 diff = 음절 diff. 서로게이트 쌍(이모지 등)은 깨질 수 있으나 계약서 텍스트에서는 무해. **이식 시 NFC 정규화 전처리를 추가**할 것(조합형 자모 문서 대비 — B18 scope에 포함됨).

부가 기능(모두 이식): 인접 removed+added → modified 병합, trigram Jaccard ≥0.85 문단 이동(moved) 감지(1024-1060행), 표 셀 단위 인라인 diff(`computeTableCellDiffs`, 735-786행), formattingOnly 분류.

실행: worker_threads 단일 세마포어 + 적응 타임아웃 60~300s(`diff-worker-pool.ts:44-61`), SHA-256 파일해시 쌍 키 SQLite LRU 캐시 100MB(`diff-cache.ts`).

### 2.4 PDF 생성 — 4경로 (서버 이식 전략 포함)

| 경로 | 원본 구현 | 서버 이식 |
|---|---|---|
| DOCX 쌍 redline PDF (주력) | **Word COM 자동화** — PowerShell `Word.Application.CompareDocuments` → revision을 컬러 텍스트로 물질화(추가=파랑, 삭제=빨강 취소선, 각주·표 보존) → 요약 페이지 삽입 → `ExportAsFixedFormat` (`word-redline-export.ts:58-548,693-807`, `word-compare.ps1`). Windows+Word 필수 | **이식 불가 — 포기.** B19는 내장 diff→HTML→Playwright printToPDF(텍스트 redline)로 대체. 서식보존이 필요해지면 B20(OOXML 트랙체인지) |
| PDF 쌍 redline | 페이지 PNG 배경 + 번호 마커 + 변경노트 HTML → 숨김 `BrowserWindow.printToPDF` (`pdf-direct-redline-export.ts:95-150`) | HTML 조립부는 이식, printToPDF만 **Playwright chromium**으로 치환 |
| 협상 리포트 | HTML → printToPDF (`ipc/report.ts:33`) | B19 범위 외 |
| XLSX/PPTX redline | diff 스팬을 JSZip+fast-xml-parser로 원본 OOXML에 패치 → 네이티브 .xlsx/.pptx (`redline-spreadsheet-exporter.ts`, `redline-presentation-exporter.ts`) | B18 1단계 범위 외. **이 OOXML 패치 패턴이 B20(w:ins/w:del 생성)의 참조 구현** |

출력물 구조(유지할 것): [요약/통계 페이지] + [본문 redline] + [변경노트 페이지들].

## 3. 이식 파일 목록

### 3.1 순수 모듈 — 그대로 이식 (Electron import 0건 확인됨)

```
src/main/services/diff-engine.ts            → packages/redline/src/diff-engine.ts
src/main/services/text-normalizer.ts        → packages/redline/src/text-normalizer.ts
src/main/services/docx-block-extractor.ts   → packages/redline/src/docx-block-extractor.ts
src/main/services/comparison-file-extractor.ts → packages/redline/src/extractors/ (2,833줄 — DOCX/PDF/XLSX/PPTX)
src/main/services/pdf-visual-document.ts    → packages/redline/src/pdf-visual-document.ts
src/main/services/pdf-ocr.ts                → packages/redline/src/pdf-ocr.ts
src/main/workers/diff-worker.ts             → packages/redline/src/worker.ts (worker_threads — Node 서버에서 그대로 동작)
src/main/__tests__/diff-engine.test.ts 외 관련 테스트 → packages/redline/src/__tests__/
```

### 3.2 치환이 필요한 결합 지점

| 원본 | 결합 | 치환 |
|---|---|---|
| `pdf-direct-redline-export.ts:1,131-149` | `BrowserWindow.printToPDF` | Playwright chromium `page.pdf()` — 컨테이너에 한글 폰트(Pretendard 또는 Noto Sans KR) 설치 필수 |
| `ipc/*` | `ipcMain`, `dialog.showSaveDialog` | NestJS ComparisonModule 컨트롤러/API로 대체 |
| `diff-worker-pool.ts:13` | `electron-log/main` | 로거 인터페이스 주입 (vault 표준 로거) |
| `diff-cache.ts` | Electron userData 경로 + better-sqlite3 | 캐시 인터페이스화. **초기 구현은 캐시 생략이 기본**. 도입 시 Postgres `redline_cache`(tenant_id 포함, RLS FORCE, SHA-256 쌍 키, 롤백 스크립트 — 리포 마이그레이션 규약 준수) |
| `word-redline-export.ts`, `word-compare.ps1` | Windows + MS Word COM + PowerShell | **이식하지 않음** |
| `supabase-auth.ts`, `ipc/auth.ts` | Supabase | **이식하지 않음** — vault 세션·권한 체계 사용 |

### 3.3 의존성 (package.json에 추가)

`mammoth ^1.11`, `pdfjs-dist ^5.5 (legacy build)`, `tesseract.js ^6 + @tesseract.js-data/kor·eng`, `@napi-rs/canvas ^0.1.97`(네이티브 — Docker glibc/arm64 빌드 검증 필요), `jszip ^3.10`, `fast-xml-parser ^5.5`(B20에서), `playwright`(chromium, B19). ~~better-sqlite3~~(제거 — Postgres 캐시로 대체).

## 4. Vault 통합 아키텍처 (B19)

```
[문서 상세 UI: 버전 2개 선택 → Redline PDF]
        │ POST /documents/:id/comparisons {versionA, versionB}
        ▼
[apps/api ComparisonModule]
  1) 양 버전 canRead + ethical wall 검사 (fail-closed — 기존 document-permission 재사용)
  2) redline_jobs 행 생성 (PENDING) — Contract Desk comparison_export_jobs 패턴
  3) pg-boss 'redline.generate' enqueue (retry/backoff/dead-letter — 기존 큐 패턴)
        ▼
[pg-boss 워커 (H6 독립 워커 프로세스)]
  4) S3에서 두 버전 파일 임시 다운로드 (기존 storage adapter)
  5) packages/redline: extractBlocks → computeBlockDiff → DiffResultV2
  6) redline HTML 조립(요약+본문+변경노트) → Playwright printToPDF
  7) 산출물을 rendition으로 S3 저장 + documents 파생물 행(원본 confidentiality 상속)
  8) redline_jobs COMPLETED + REDLINE_GENERATED 감사 이벤트
        ▼
[UI 폴링/알림 → 미리보기·다운로드 (기존 preview/download 경로 = 권한·감사·워터마크 통과)]
```

- 소형 문서(예: 합산 200KB 미만)는 동기 응답 허용, 그 외 비동기 잡.
- 동시성: pg-boss teamSize 1~2 (원본의 단일 세마포어 대응). 성능 예산 분해: diff p95 ≤3.5분(B18), 다운로드+렌더+업로드 ≤1.5분 → e2e p95 5분(B19). 대형 문서는 명시 타임아웃+실패 시 단어 단위 폴백 결과라도 반환.
- 입력은 (document_version_id | document_subversion_id) 쌍 — 서브버전 간 비교도 허용(검토 중 마크업 비교 용도).
- 실행 형상 폴백: 위 다이어그램은 H6(워커 독립 프로세스) 완료 형상이다. **H6 미완 시 API 프로세스 내 pg-boss 소비로 가동**하고 H6 완료 시 워커로 이전한다.

## 5. 알려진 한계 (발주자 합의된 기대치 — 임의로 "개선"하려 들지 말 것)

1. mammoth 추출 특성상 내장 diff는 번호 매기기·들여쓰기·각주·헤더/푸터가 없는 **텍스트 redline**이다. 서식보존은 B20(조건부)의 몫.
2. 문단 합산 5,000자 초과 시 단어 단위 폴백(원본 동작 유지 — 임계값은 설정화).
3. 표는 셀 텍스트만 비교(병합셀·스타일 제외).
4. 스캔 PDF는 OCR 신뢰도 0.82 미만 시 정밀 마커 대신 review 마커 강등(원본 동작 유지).
5. Myers 최악 O((N+M)²) 메모리 — 수백 페이지 문서는 타임아웃 허용·재시도 정책으로 방어(B19 acceptance에 100페이지 p95 5분 기준).

## 6. B20 (조건부 — B19 운영 후 서식 요구 확인 시에만)

내장 diff 결과를 원본 DOCX OOXML에 `w:ins`/`w:del`로 패치(참조: `redline-presentation-exporter.ts`의 OOXML 패치 패턴)해 Word 변경추적 형식 redline DOCX 생성 → LibreOffice headless로 PDF 변환. Word COM 없이 각주·번호·서식 보존을 달성하는 경로. 착수 조건: 발주자가 B19 텍스트 redline을 4주 이상 실사용 후 서식보존 필요를 서면 확인.
