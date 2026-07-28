# DMS OSS Workbench Capability Inventory

> 기준: `origin/main@8166d1c6`
> 목적: `PACK-DMS-WB-00`의 current-main 재대조. 사용자 데이터·외부 tenant·운영 receipt는 포함하지 않는다.

## 분류 규칙

- **Reuse:** 현재 승인된 API·schema·UI를 소비한다. 새 backend를 만들지 않는다.
- **Workbench UI:** 기존 DTO와 route를 사용해 UI 구조만 바꾼다.
- **New internal contract:** data/API 계약을 먼저 별도 TUW로 확정해야 한다.
- **Excluded:** 이번 실행 goal에서 구현하지 않는다.

| 영역 | 상태 | source evidence | test/evidence | workbench 처리 |
|---|---|---|---|---|
| 전체 문서 목록 | Workbench UI | `apps/web/src/app/(app)/files/page.tsx`, `components/document/document-vault-list.tsx` | files page/list component tests | rail/list/inspector로 재구성 |
| Matter 문서·폴더·태그 | Reuse | `document-folder.*`, `matter-document-list.tsx`, migration `0140` | `document-folders.spec.ts` | Matter 선택 뒤 실제 folder만 rail/filter에서 사용 |
| 업로드·메일·bulk upload | Reuse | `document-upload-panel.tsx`, `email-upload-card.tsx`, migration `0138` | `bulk-upload-batch.spec.ts` | drawer/panel composition만 변경 |
| 행 선택·상세 표면 | Workbench UI | `components/ui/data-table.tsx`, `detail-inspector.tsx` | colocated component tests | existing keyboard/ARIA props 재사용 |
| 문서 preview | Reuse | `preview-session-frame.tsx`, preview API client | preview session/token/audit integration tests | explicit action만; 선택/hover로 session 금지 |
| 편집·review·version | Reuse | `document-action-center.tsx`, document editing module | editing lifecycle tests | quick inspector는 detail route 진입만 제공 |
| 저장 검색·검색 folder | Reuse | `search-save-panel.tsx`, `/search/folders` | saved-search scope/search tests | rail/drawer IA로만 이동 |
| 검색 결과/고급 filter | Workbench UI | `search-results.tsx`, `search-advanced-controls.tsx` | colocated tests | query owner와 permission-bound API는 유지 |
| search hit anchor | Reuse | `anchorId` search result contract, `document-action-center.tsx` | DMS-GA-3B evidence, preview/metadata leakage tests | bounded anchor를 보존, 새 index/preview backend 금지 |
| break-glass 접근 | Reuse / boundary | break-glass module, `docs/security/access-request-workflow.md` | break-glass/search permission tests | self-service access request UI 금지 |
| 즐겨찾기 | Implemented internal contract | ADR-019, migration `0210`, `/v1/saved-items`, files/search rail and inspector actions | saved-item DTO/service/web/integration tests | personal document/Matter/personal saved-search only; permission-scoped on every read |
| 다중 문서 변경 | New internal contract | bulk upload만 존재 | bulk upload/DLP tests | folder/tag/status batch만 후보; delete/share/Office 제외 |
| web offline document cache | New internal decision | PWA shell과 desktop cache 경계 존재 | desktop cache policy tests | customer document cache는 승인 전 금지 |
| M365/Office/WOPI | Excluded | ADR-017 및 OneDrive release docs | gate/receipt docs | 이번 goal에서 변경하지 않음 |

## 구현 전제가 되는 기존 계약

1. `DocumentVaultList`와 `SearchResults`의 목록 응답은 권한 범위가 이미 적용된 데이터다. 새 UI는 client-side access filtering을 추가하지 않는다.
2. preview는 session+token header 경로이며 token은 URL·history·로그에 들어가지 않는다.
3. document editing, sharing, records는 canonical detail route/action center가 소유한다. workbench inspector는 이를 복제하지 않는다.
4. search anchor는 opaque bounded 값이며 raw snippet/query/page coordinate를 만들거나 변환하지 않는다.
5. normal denied state는 break-glass request를 생성했다는 상태를 만들지 않는다.

## 이번 goal의 실제 신규 코드 범위

| 순서 | Pack | 가능한 코드 범위 | 선행 조건 |
|---:|---|---|---|
| 1 | `PACK-DMS-WB-01` | `/files` layout, selection, safe inspector, explicit preview, upload composition, responsive behavior | `PACK-DMS-WB-00` local evidence |
| 2 | `PACK-DMS-WB-02` | `/search` query ownership, progressive filters, saved-search rail, inspector, existing anchor consumption, Matter/detail return | `PACK-DMS-WB-01` |
| 3 | `PACK-DMS-WB-03` | personal favorites persistence/API/UI/audit | ADR-019 |
| 4 | `PACK-DMS-WB-04` | approved folder/tag/status batch actions only | bulk action/atomicity decision |
| 5 | `PACK-DMS-WB-05` | no-document-cache guard only | explicit no-cache decision |
| 6 | `PACK-DMS-WB-06` | repo-local component/security/a11y evidence | enabled predecessors |

## Hard exclusions

- external tenant, vendor, cloud, credentials, consent, runtime smoke, production rollout
- self-service access-request workflow or a direct ACL write path
- new folder backend, saved-search backend, preview backend, document editing backend, external sharing backend, records disposal backend
- hard delete, bulk external share, bulk Office action, raw UUID entry as primary navigation
- OpenSearch, external AI, new dependency, copied OSS source/UI
