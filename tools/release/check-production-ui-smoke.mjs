#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();

const hiddenRoutes = ['/launch', '/scale', '/contracts', '/dd', '/litigation'];
const hiddenUntilApiRoutes = ['/integrations/onedrive'];
const blockedRoutePages = new Map([
  ['/launch', 'apps/web/src/app/(app)/launch/page.tsx'],
  ['/scale', 'apps/web/src/app/(app)/scale/page.tsx'],
  ['/contracts', 'apps/web/src/app/(app)/contracts/page.tsx'],
  ['/dd', 'apps/web/src/app/(app)/dd/page.tsx'],
  ['/litigation', 'apps/web/src/app/(app)/litigation/page.tsx'],
]);

const scanRoots = ['apps/web/src/app', 'apps/web/src/components'];
const excludedFilePatterns = [/\.test\.[tj]sx?$/, /\.spec\.[tj]sx?$/, /\.stories\.[tj]sx?$/];

const forbiddenPatterns = [
  { name: 'raw hex color literal', pattern: /#[0-9a-f]{3,8}\b/i },
  { name: 'nullish fallback count', pattern: /\?\?\s*0\b/ },
  {
    name: 'unsafe id slice formatter',
    pattern:
      /\b(documentId|matterId|clientId|userId|tenantId|workspaceId)\b[^;\n]*\.slice\s*\(\s*0\s*,/i,
  },
  {
    name: 'unsafe id short hash formatter',
    pattern:
      /\bshortHash\s*\(\s*(status\.)?(matterId|documentId|clientId|userId|tenantId|workspaceId|selectedMatterId|selectedDocumentId)\b/i,
  },
  { name: 'workspace id visible copy', pattern: /workspace\s*id|워크스페이스 ID/i },
  { name: 'theme selector copy', pattern: /디자인 테마|design theme/i },
  { name: 'raw prompt copy', pattern: /raw prompt|prompt 원문/i },
  { name: 'raw source copy', pattern: /raw source|source text|source 원문/i },
  { name: 'model response copy', pattern: /model response|model-response|모델 응답/i },
  { name: 'external model copy', pattern: /external model|외부 모델/i },
  { name: 'legal analysis copy', pattern: /legal analysis|법률 분석/i },
];

const blockedRouteForbiddenLiterals = [
  /RFI-001/,
  /EV-001/,
  /FACT-001/,
  /DD-ISS-001/,
  /PLD-001/,
  /Witness timeline/,
  /Corporate charter documents/,
];

const designSystemChecklistPatterns = [
  {
    name: 'screen inventory',
    pattern:
      /Login[\s\S]*AppShell[\s\S]*Dashboard[\s\S]*Matters[\s\S]*Search[\s\S]*Records[\s\S]*Audit[\s\S]*Admin/,
  },
  { name: 'token and raw hex rules', pattern: /shared CSS tokens[\s\S]*raw hex color literals/i },
  {
    name: 'component rules',
    pattern: /PageHeader[\s\S]*SectionCard[\s\S]*EmptyState[\s\S]*StatusBadge/,
  },
  { name: 'shadow and gradient rules', pattern: /custom shadows[\s\S]*custom gradient/i },
  { name: 'responsive viewports', pattern: /1440px[\s\S]*768px[\s\S]*375px/ },
  {
    name: 'fake data and reference safety',
    pattern: /fake\/mock\/sample\/demo[\s\S]*workspace ID[\s\S]*AI Prep/i,
  },
];

const productionInventoryPatterns = [
  {
    name: 'status definitions',
    pattern:
      /visible[\s\S]*visible_admin_only[\s\S]*visible_limited[\s\S]*hidden_until_api_ready[\s\S]*hidden/,
  },
  {
    name: 'core visible routes',
    pattern:
      /\/dashboard[\s\S]*`visible`[\s\S]*\/matters[\s\S]*`visible`[\s\S]*\/search[\s\S]*`visible`[\s\S]*\/search\/folders[\s\S]*`visible`[\s\S]*\/work[\s\S]*`visible`[\s\S]*\/notifications[\s\S]*`visible`/,
  },
  {
    name: 'admin and governance routes',
    pattern:
      /\/records[\s\S]*`visible_admin_only`[\s\S]*\/audit[\s\S]*`visible_admin_only`[\s\S]*\/walls[\s\S]*`visible_admin_only`[\s\S]*\/admin[\s\S]*`visible_admin_only`[\s\S]*\/enterprise[\s\S]*`visible_admin_only`/,
  },
  {
    name: 'document vault visible route',
    pattern: /\/files[\s\S]*`visible`[\s\S]*Shown[\s\S]*Matter Code-gated/i,
  },
  {
    name: 'API-unready routes',
    pattern: /\/integrations\/onedrive[\s\S]*`hidden_until_api_ready`/,
  },
  {
    name: 'AI Prep limited route',
    pattern: /\/ai-prep[\s\S]*`visible_limited`[\s\S]*File organization prep\/readiness only/i,
  },
  {
    name: 'hidden route list',
    pattern:
      /\/launch[\s\S]*`hidden`[\s\S]*\/scale[\s\S]*`hidden`[\s\S]*\/contracts[\s\S]*`hidden`[\s\S]*\/dd[\s\S]*`hidden`[\s\S]*\/litigation[\s\S]*`hidden`/,
  },
  {
    name: 'route policy source link',
    pattern: /apps\/web\/src\/lib\/features\.ts[\s\S]*apps\/web\/src\/lib\/navigation\.ts/,
  },
  {
    name: 'production data invariants',
    pattern: /fake\/mock\/sample\/demo[\s\S]*workspace ID[\s\S]*tenant ID[\s\S]*raw UUID slices/i,
  },
  {
    name: 'AI scope exclusion',
    pattern:
      /Legal analysis[\s\S]*summary[\s\S]*external model[\s\S]*raw prompt[\s\S]*model response/i,
  },
];

const uploadBrowseFlowFiles = [
  {
    path: 'apps/web/src/app/(app)/files/page.tsx',
    patterns: [
      { name: 'Matter Code picker on files route', pattern: /MatterCodePicker/ },
      { name: 'matter-scoped upload panel on files route', pattern: /DocumentUploadPanel/ },
      { name: 'matter document list on files route', pattern: /MatterDocumentList/ },
      { name: 'Matter app source mode on files route', pattern: /matterAppSourceMode/ },
    ],
  },
  {
    path: 'apps/web/src/app/(app)/matters/[matterId]/page.tsx',
    patterns: [{ name: 'matter detail file section', pattern: /MatterFileSection/ }],
  },
  {
    path: 'apps/web/src/components/document/matter-file-section.tsx',
    patterns: [
      { name: 'matter filing context card', pattern: /파일링 기준/ },
      { name: 'metadata filing model', pattern: /Matter 메타데이터 기준/ },
      { name: 'no pseudo folder model', pattern: /폴더 모델[\s\S]*미적용/ },
      { name: 'matter-scoped browse copy', pattern: /Matter 범위 목록/ },
      { name: 'Matter Code upload copy', pattern: /Matter Code 확인 후 업로드/ },
    ],
  },
  {
    path: 'apps/web/src/lib/api-client.ts',
    patterns: [
      { name: 'FormData helper', pattern: /apiFetchFormData/ },
      { name: 'matter document list client', pattern: /listMatterDocuments/ },
      { name: 'matter-scoped upload client', pattern: /uploadDocument/ },
      { name: 'multipart content type guard', pattern: /withoutContentType/ },
    ],
  },
  {
    path: 'apps/web/src/lib/matter-app.ts',
    patterns: [
      { name: 'Matter app configured flag', pattern: /NEXT_PUBLIC_MATTER_APP_SOURCE_CONFIGURED/ },
      {
        name: 'projection fallback production guard',
        pattern: /NEXT_PUBLIC_ALLOW_VAULT_PROJECTION_MATTER_SOURCE/,
      },
      {
        name: 'source mode fail closed',
        pattern: /return isMatterAppSourceConfigured\(mode\) \? mode : 'unconfigured'/,
      },
    ],
  },
  {
    path: 'apps/web/src/components/matter/matter-code-picker.tsx',
    patterns: [
      { name: 'no unconfigured Matter app upload', pattern: /Matter app 연결 필요/ },
      {
        name: 'permission-scoped matter list lookup',
        pattern: /listMatters\(\{ pageSize: 50 \}\)/,
      },
    ],
  },
  {
    path: 'apps/web/src/components/document/document-upload-panel.tsx',
    patterns: [
      {
        name: 'selected matter required before upload',
        pattern: /Matter Code를 먼저 선택해 주세요/,
      },
      { name: 'upload source readiness gate', pattern: /isMatterUploadSourceMode/ },
      {
        name: 'matter-scoped upload call',
        pattern: /uploadDocument\(selectedMatter\.matterReference/,
      },
      { name: 'bulk file picker', pattern: /multiple/ },
      { name: 'bulk upload queue', pattern: /업로드 큐/ },
    ],
  },
  {
    path: 'apps/web/src/components/document/matter-document-list.tsx',
    patterns: [
      {
        name: 'selected matter required before list',
        pattern: /Matter Code를 선택하면 파일 목록이 표시됩니다/,
      },
      {
        name: 'matter-scoped list call',
        pattern: /listMatterDocuments\(selectedMatter\.matterReference/,
      },
    ],
  },
  {
    path: 'apps/web/src/components/document/document-vault-list.tsx',
    patterns: [
      { name: 'document vault filter bar', pattern: /문서함 필터/ },
      { name: 'document vault Matter Code filter', pattern: /document-vault-matter-code/ },
      { name: 'document vault security filter', pattern: /document-vault-confidentiality/ },
      { name: 'document vault AI prep filter', pattern: /document-vault-ai-allowed/ },
      { name: 'document vault extraction filter', pattern: /document-vault-extraction-status/ },
      { name: 'document vault extraction status display', pattern: /extractionStatusLabels/ },
      { name: 'server query from vault filters', pattern: /documentVaultListQueryFromFilters/ },
    ],
  },
  {
    path: 'apps/api/src/modules/document/document.service.ts',
    patterns: [
      { name: 'query-stage document list source', pattern: /FROM document_search_index idx/ },
      { name: 'search permission scope for document list', pattern: /scopeForSearch/ },
      { name: 'matter-scoped document list API service', pattern: /listMatterDocuments/ },
      { name: 'document list filter SQL', pattern: /documentListFilterClauses/ },
      { name: 'document list sort whitelist', pattern: /documentListOrderBy/ },
      { name: 'document list extraction state join', pattern: /LEFT JOIN canonical_documents cd/ },
      { name: 'document list extraction filter', pattern: /cd\.extraction_status/ },
    ],
  },
];

const documentActionCenterFiles = [
  {
    path: 'apps/web/src/app/(app)/documents/[id]/page.tsx',
    patterns: [
      { name: 'document detail action center route', pattern: /DocumentActionCenter/ },
      { name: 'document detail app shell wrapper', pattern: /PageShell/ },
      { name: 'document search hit context route params', pattern: /searchHitContextFromParams/ },
    ],
  },
  {
    path: 'apps/web/src/components/document/document-action-center.tsx',
    patterns: [
      { name: 'document profile read view', pattern: /문서 프로필/ },
      { name: 'document metadata edit flow', pattern: /updateDocumentMetadata/ },
      { name: 'preview panel integration', pattern: /documentPreviewUrl/ },
      { name: 'controlled download flow', pattern: /documentDownloadUrl/ },
      { name: 'download reason selector', pattern: /documentDownloadReasonCodes/ },
      { name: 'version list integration', pattern: /listDocumentVersions/ },
      { name: 'new version upload flow', pattern: /addDocumentVersion/ },
      { name: 'document audit timeline integration', pattern: /DocumentAuditTimeline/ },
      { name: 'document upload processing queue', pattern: /업로드 및 처리 큐/ },
      { name: 'search hit context panel', pattern: /검색 결과 문맥/ },
      { name: 'bounded search hit parser', pattern: /boundedInteger/ },
      { name: 'records action entry points', pattern: /recordsUrlForDocument/ },
      { name: 'file cabinet return link', pattern: /fileCabinetUrlForDocument/ },
    ],
  },
  {
    path: 'apps/web/src/components/document/document-audit-timeline.tsx',
    patterns: [
      { name: 'document audit scoped endpoint client', pattern: /listDocumentAuditEvents/ },
      { name: 'document audit timeline heading', pattern: /문서 감사 타임라인/ },
      { name: 'document audit empty state', pattern: /표시할 감사 기록이 없습니다/ },
    ],
  },
  {
    path: 'apps/web/src/lib/api/audit.ts',
    patterns: [{ name: 'document audit API client', pattern: /documents.*audit-events/ }],
  },
  {
    path: 'apps/web/src/lib/api-client.ts',
    patterns: [
      { name: 'document detail client', pattern: /getDocument/ },
      { name: 'document metadata update client', pattern: /updateDocumentMetadata/ },
      { name: 'document version list client', pattern: /listDocumentVersions/ },
      { name: 'new document version client', pattern: /addDocumentVersion/ },
      { name: 'document preview URL helper', pattern: /documentPreviewUrl/ },
      { name: 'document download URL helper', pattern: /documentDownloadUrl/ },
    ],
  },
  {
    path: 'docs/adr/ADR-016-document-editing-and-office-flow.md',
    patterns: [
      { name: 'document editing model decision', pattern: /read\/download-only launch/i },
      { name: 'check-out deferred', pattern: /check-out\/check-in/i },
      { name: 'Office integration deferred', pattern: /Office integration/i },
    ],
  },
];

const enterpriseSearchFiles = [
  {
    path: 'packages/shared/src/search/search-query.dto.ts',
    patterns: [
      { name: 'search target DTO', pattern: /searchTargets/ },
      { name: 'search sort DTO', pattern: /searchSorts/ },
      { name: 'search group DTO', pattern: /searchGroupBys/ },
      { name: 'saved search DTO', pattern: /createSavedSearchSchema/ },
      {
        name: 'display text filters',
        pattern: /matterCode[\s\S]*matterName[\s\S]*clientName[\s\S]*title/,
      },
    ],
  },
  {
    path: 'apps/api/src/modules/search/search.controller.ts',
    patterns: [
      { name: 'saved search list route', pattern: /Get\('saved-searches'\)/ },
      { name: 'saved search save route', pattern: /Post\('saved-searches'\)/ },
      { name: 'saved search delete route', pattern: /Delete\('saved-searches\/:savedSearchId'\)/ },
    ],
  },
  {
    path: 'apps/api/src/modules/search/search.service.ts',
    patterns: [
      { name: 'saved search table access', pattern: /FROM saved_searches/ },
      { name: 'saved search scoped delete', pattern: /DELETE FROM saved_searches/ },
      { name: 'saved search bounded audit refs', pattern: /savedSearchFilterRefs/ },
    ],
  },
  {
    path: 'apps/api/src/modules/search/query/search-filter.builder.ts',
    patterns: [
      { name: 'title filter', pattern: /idx\.title ILIKE/ },
      { name: 'Matter Code filter', pattern: /matter_filter\.matter_code ILIKE/ },
      { name: 'client name filter', pattern: /client_filter\.name ILIKE/ },
      { name: 'LIKE wildcard escaping', pattern: /likeContains/ },
    ],
  },
  {
    path: 'apps/api/src/modules/search/query/search-query.builder.ts',
    patterns: [
      { name: 'target-scoped keyword search', pattern: /keywordMatchSql/ },
      { name: 'safe sort switch', pattern: /orderBySql/ },
      { name: 'title search target', pattern: /idx\.title_tsv @@ tsq\.query/ },
      { name: 'body search target', pattern: /idx\.content_tsv @@ tsq\.query/ },
    ],
  },
  {
    path: 'apps/web/src/app/(app)/search/search-client.tsx',
    patterns: [
      { name: 'advanced search controls wired', pattern: /SearchAdvancedControls/ },
      { name: 'search save panel wired', pattern: /SearchSavePanel/ },
      { name: 'saved search API list wired', pattern: /listSavedSearches/ },
      { name: 'saved search API save wired', pattern: /saveSavedSearch/ },
      { name: 'saved search API delete wired', pattern: /deleteSavedSearch/ },
      { name: 'target URL state', pattern: /target/ },
      { name: 'sort URL state', pattern: /sortBy/ },
      { name: 'group URL state', pattern: /groupBy/ },
    ],
  },
  {
    path: 'apps/web/src/app/(app)/search/folders/search-folders-client.tsx',
    patterns: [
      { name: 'search folders route saved-search API list', pattern: /listSavedSearches/ },
      { name: 'search folders route saved-search API delete', pattern: /deleteSavedSearch/ },
      { name: 'search folders route title', pattern: /내 검색 폴더/ },
      { name: 'search folders safe URL helper', pattern: /searchUrlForSavedQuery/ },
      { name: 'search folders no id display by design', pattern: /savedSearchId/ },
    ],
  },
  {
    path: 'apps/web/src/components/search/search-save-panel.tsx',
    patterns: [
      { name: 'current search reusable link', pattern: /링크 복사/ },
      { name: 'saved search list', pattern: /검색 목록/ },
      { name: 'saved search save action', pattern: /onSaveSearch/ },
      { name: 'saved search delete action', pattern: /onDeleteSavedSearch/ },
      { name: 'search pattern summary', pattern: /searchPatternItems/ },
    ],
  },
  {
    path: 'apps/web/src/components/search/search-advanced-controls.tsx',
    patterns: [
      { name: 'Matter Code filter UI', pattern: /Matter Code/ },
      { name: 'Matter name filter UI', pattern: /Matter 이름/ },
      { name: 'document type filter UI', pattern: /문서 유형/ },
      { name: 'version status filter UI', pattern: /버전 상태/ },
      { name: 'updated date range filter UI', pattern: /수정 기간/ },
      { name: 'search range selector', pattern: /검색 범위/ },
      { name: 'sort selector', pattern: /정렬/ },
      { name: 'group selector', pattern: /그룹/ },
    ],
  },
  {
    path: 'apps/web/src/components/search/search-results.tsx',
    patterns: [
      { name: 'display-safe result grouping', pattern: /groupResults/ },
      { name: 'Matter display label grouping', pattern: /matterDisplayCode/ },
    ],
  },
];

const governanceWorkflowOpsFiles = [
  {
    path: 'apps/web/src/components/governance/governance-context-panel.tsx',
    patterns: [
      { name: 'document governance panel', pattern: /DocumentGovernanceContextPanel/ },
      { name: 'matter governance panel', pattern: /MatterGovernanceContextPanel/ },
      { name: 'document workflow ops panel', pattern: /DocumentWorkflowOpsPanel/ },
      { name: 'matter workflow ops panel', pattern: /MatterWorkflowOpsPanel/ },
      { name: 'file organization prep scope copy', pattern: /파일 정리 준비 범위/ },
      { name: 'real-state-only task copy', pattern: /실제 문서·사건 상태에서 발생한 작업만 표시/ },
    ],
  },
  {
    path: 'apps/web/src/components/document/document-action-center.tsx',
    patterns: [
      { name: 'document governance panel wired', pattern: /DocumentGovernanceContextPanel/ },
      { name: 'document workflow ops panel wired', pattern: /DocumentWorkflowOpsPanel/ },
    ],
  },
  {
    path: 'apps/web/src/app/(app)/matters/[matterId]/page.tsx',
    patterns: [
      { name: 'matter governance panel wired', pattern: /MatterGovernanceContextPanel/ },
      { name: 'matter audit timeline wired', pattern: /MatterAuditTimeline/ },
      { name: 'matter workflow ops panel wired', pattern: /MatterWorkflowOpsPanel/ },
    ],
  },
  {
    path: 'apps/web/src/components/matter/matter-audit-timeline.tsx',
    patterns: [
      { name: 'matter-scoped audit endpoint client', pattern: /listMatterAuditEvents/ },
      { name: 'matter audit timeline heading', pattern: /사건 감사 타임라인/ },
      { name: 'matter audit empty state', pattern: /표시할 감사 기록이 없습니다/ },
    ],
  },
  {
    path: 'apps/web/src/app/(app)/dashboard/vault-activity-client.tsx',
    patterns: [
      { name: 'dashboard action queue', pattern: /DashboardWorkQueueSection/ },
      { name: 'no fake dashboard queue counts', pattern: /DashboardWorkQueueSection/ },
    ],
  },
  {
    path: 'apps/web/src/app/(app)/work/work-queue-client.tsx',
    patterns: [
      { name: 'work queue page heading', pattern: /작업함/ },
      { name: 'work queue dashboard source', pattern: /getDashboardOverview/ },
      { name: 'work queue file cabinet filters', pattern: /문서함 조치 필터/ },
      { name: 'work queue extraction failed link', pattern: /\/files\?extractionStatus=failed/ },
      {
        name: 'work queue AI prep file link',
        pattern: /\/files\?aiAllowed=true&sortBy=matter_asc/,
      },
    ],
  },
  {
    path: 'apps/web/src/app/(app)/notifications/notifications-client.tsx',
    patterns: [
      { name: 'notifications page heading', pattern: /알림/ },
      { name: 'notifications dashboard source', pattern: /getDashboardOverview/ },
      { name: 'real notification copy', pattern: /실제 운영 이벤트와 상태 알림만 표시/ },
    ],
  },
  {
    path: 'apps/web/src/components/dashboard/dashboard-work-queue.tsx',
    patterns: [
      { name: 'shared dashboard action derivation', pattern: /dashboardActionItems/ },
      { name: 'real operations task copy', pattern: /실제 운영 데이터에서 발생한 작업만 표시/ },
      { name: 'permission policy task', pattern: /권한\/정책 알림 확인/ },
      { name: 'file organization prep task', pattern: /파일 정리 준비 상태 확인/ },
      { name: 'no persisted task claim', pattern: /DashboardOverviewState/ },
    ],
  },
  {
    path: 'apps/web/src/components/dashboard/dashboard-notifications.tsx',
    patterns: [
      { name: 'shared dashboard notification derivation', pattern: /dashboardNotificationItems/ },
      {
        name: 'real notification empty copy',
        pattern: /실제 운영 이벤트와 상태에서 발생한 알림만 표시/,
      },
      { name: 'no fake notification source', pattern: /DashboardOverviewState/ },
    ],
  },
  {
    path: 'apps/web/src/app/(app)/walls/wall-admin-client.tsx',
    patterns: [
      { name: 'wall Matter Code picker', pattern: /MatterCodePicker/ },
      { name: 'selected Matter display', pattern: /selectedMatter/ },
      { name: 'advanced user refs only', pattern: /사용자 선택 API/ },
    ],
  },
];

const adminIntegrationsFiles = [
  {
    path: 'apps/web/src/app/(app)/enterprise/enterprise-hardening-client.tsx',
    patterns: [
      { name: 'DMS configuration IA panel', pattern: /AdminDmsConfigurationPanel/ },
      { name: 'taxonomy admin contract state', pattern: /taxonomy/ },
      { name: 'matter template admin contract state', pattern: /templates/ },
      { name: 'search refiner admin contract state', pattern: /refiners/ },
      { name: 'search index operations panel', pattern: /AdminSearchOperationsPanel/ },
      { name: 'tenant reindex API client', pattern: /requestTenantSearchReindex/ },
      { name: 'reindex audit-only status copy', pattern: /감사 기록과 큐 등록 수/ },
      { name: 'read-only until API approved copy', pattern: /저장 API 승인 전 읽기 전용/ },
    ],
  },
  {
    path: 'apps/web/src/app/(app)/integrations/page.tsx',
    patterns: [
      { name: 'Outlook status route link', pattern: /\/integrations\/outlook/ },
      { name: 'OneDrive gate copy', pattern: /승인 전 숨김/ },
      { name: 'Office contract gate copy', pattern: /계약 필요/ },
    ],
  },
  {
    path: 'apps/web/src/app/(app)/integrations/outlook/page.tsx',
    patterns: [
      { name: 'Vault filing path section', pattern: /Vault 파일링 경로/ },
      { name: 'same document model copy', pattern: /동일 문서 모델/ },
      { name: 'search/detail flow link', pattern: /\/search/ },
    ],
  },
];

const releaseHardeningPatterns = [
  {
    name: 'authenticated main loop smoke',
    pattern: /Login[\s\S]*Matter Code[\s\S]*Upload[\s\S]*document detail[\s\S]*Search/i,
  },
  { name: 'negative auth smoke', pattern: /Non-member[\s\S]*Wall-blocked[\s\S]*Non-admin/i },
  { name: 'no fake data sweep', pattern: /DMS-UX-803 No Fake Data Sweep/ },
  { name: 'internal ref sweep', pattern: /DMS-UX-804 Internal Ref Sweep/ },
  { name: 'AI scope sweep', pattern: /DMS-UX-805 AI Scope Sweep/ },
  { name: 'responsive QA viewports', pattern: /1440px[\s\S]*768px[\s\S]*375px/ },
  {
    name: 'accessibility QA',
    pattern: /Keyboard access[\s\S]*aria-current[\s\S]*Accessible names/i,
  },
  { name: 'evidence package refs only', pattern: /Evidence package[\s\S]*refs only/i },
  { name: 'rollout checklist', pattern: /DMS-UX-809 Rollout Checklist/ },
  { name: 'rollback plan', pattern: /DMS-UX-810 Rollback Plan/ },
  { name: 'production monitor', pattern: /DMS-UX-811 Production Monitor/ },
  {
    name: 'release signoff owners',
    pattern:
      /Operator owner[\s\S]*Security owner[\s\S]*Legal-data owner[\s\S]*Customer-scope owner/i,
  },
];

const findings = [];

function fail(message) {
  findings.push(message);
}

function readRequired(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    fail(`Missing required file: ${relativePath}`);
    return '';
  }
  return readFileSync(absolutePath, 'utf8');
}

function walk(directory) {
  const absoluteDirectory = path.join(repoRoot, directory);
  const files = [];
  for (const entry of readdirSync(absoluteDirectory)) {
    const filePath = path.join(absoluteDirectory, entry);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      files.push(...walk(path.relative(repoRoot, filePath)));
    } else if (
      /\.[tj]sx?$/.test(filePath) &&
      !excludedFilePatterns.some((pattern) => pattern.test(filePath))
    ) {
      files.push(filePath);
    }
  }
  return files;
}

function assertRoutePolicy(featuresSource, route, production, showInNavigation) {
  const routeStart = featuresSource.indexOf(`route: '${route}'`);
  if (routeStart === -1) {
    fail(`Route visibility policy missing for ${route}`);
    return;
  }
  const nextRoute = featuresSource.indexOf('route: ', routeStart + 1);
  const block = featuresSource.slice(routeStart, nextRoute === -1 ? undefined : nextRoute);
  if (!block.includes(`production: '${production}'`)) {
    fail(`${route} must have production: '${production}'`);
  }
  if (!block.includes(`showInNavigation: ${showInNavigation}`)) {
    fail(`${route} must have showInNavigation: ${showInNavigation}`);
  }
}

function parseFeaturePolicyMap(featuresSource) {
  const map = new Map();
  const routeMatches = [...featuresSource.matchAll(/route: '([^']+)'/g)];
  for (const [index, match] of routeMatches.entries()) {
    const route = match[1];
    const routeStart = match.index ?? -1;
    const nextRouteStart = routeMatches[index + 1]?.index ?? featuresSource.length;
    const block = featuresSource.slice(routeStart, nextRouteStart);
    const production = block.match(/production: '([^']+)'/)?.[1];
    const navigation = block.match(/showInNavigation: (true|false)/)?.[1];
    if (route && production && navigation) {
      map.set(route, {
        production,
        showInNavigation: navigation === 'true',
      });
    }
  }
  return map;
}

function parseInventoryPolicyMap(inventorySource) {
  const map = new Map();
  const rowPattern = /^\|\s*`(\/[^`]+)`\s*\|[^|]*\|\s*`([^`]+)`\s*\|\s*([^|]+)\|/gm;
  for (const match of inventorySource.matchAll(rowPattern)) {
    const route = match[1];
    const production = match[2];
    const navigationCell = match[3].trim();
    map.set(route, {
      production,
      showInNavigation: navigationCell.startsWith('Shown'),
    });
  }
  return map;
}

function runExistingLiteralCheck() {
  execFileSync(process.execPath, ['tools/quality/check-production-ui-literals.mjs'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

function scanProductionUiSources() {
  for (const root of scanRoots) {
    for (const absolutePath of walk(root)) {
      const relativePath = path.relative(repoRoot, absolutePath);
      const source = readFileSync(absolutePath, 'utf8');
      const lines = source.split(/\r?\n/);
      for (const [index, line] of lines.entries()) {
        for (const { name, pattern } of forbiddenPatterns) {
          if (pattern.test(line)) {
            fail(`${relativePath}:${index + 1} ${name}: ${line.trim()}`);
          }
        }
      }
    }
  }
}

function checkRouteVisibility() {
  const featuresSource = readRequired('apps/web/src/lib/features.ts');
  const navigationSource = readRequired('apps/web/src/lib/navigation.ts');
  for (const route of hiddenRoutes) {
    assertRoutePolicy(featuresSource, route, 'hidden', 'false');
    if (navigationSource.includes(`'${route}'`) || navigationSource.includes(`"${route}"`)) {
      fail(`${route} must not be present in routeNavigation`);
    }
  }
  for (const route of hiddenUntilApiRoutes) {
    assertRoutePolicy(featuresSource, route, 'hidden_until_api_ready', 'false');
  }
}

function checkBlockedRoutes() {
  for (const [route, relativePath] of blockedRoutePages) {
    const source = readRequired(relativePath);
    if (!source.includes('RouteBlockedState')) {
      fail(`${route} direct page must render RouteBlockedState`);
    }
    for (const pattern of blockedRouteForbiddenLiterals) {
      if (pattern.test(source)) {
        fail(`${relativePath} contains forbidden placeholder literal ${pattern}`);
      }
    }
  }
}

function checkDesignSystemChecklist() {
  const source = readRequired('docs/ui/design-system-checklist.md');
  for (const { name, pattern } of designSystemChecklistPatterns) {
    if (!pattern.test(source)) {
      fail(`Design system checklist missing ${name}`);
    }
  }
}

function checkProductionUiInventory() {
  const source = readRequired('docs/ui/production-ui-inventory.md');
  const featuresSource = readRequired('apps/web/src/lib/features.ts');
  const featurePolicies = parseFeaturePolicyMap(featuresSource);
  const inventoryPolicies = parseInventoryPolicyMap(source);
  for (const { name, pattern } of productionInventoryPatterns) {
    if (!pattern.test(source)) {
      fail(`Production UI inventory missing ${name}`);
    }
  }
  for (const [route, policy] of featurePolicies) {
    const inventory = inventoryPolicies.get(route);
    if (!inventory) {
      fail(`Production UI inventory missing route from features.ts: ${route}`);
      continue;
    }
    if (inventory.production !== policy.production) {
      fail(
        `Production UI inventory status mismatch for ${route}: inventory ${inventory.production}, features.ts ${policy.production}`,
      );
    }
    if (inventory.showInNavigation !== policy.showInNavigation) {
      fail(
        `Production UI inventory navigation mismatch for ${route}: inventory ${inventory.showInNavigation}, features.ts ${policy.showInNavigation}`,
      );
    }
  }
}

function checkUploadBrowseFlowGuard() {
  for (const file of uploadBrowseFlowFiles) {
    const source = readRequired(file.path);
    for (const { name, pattern } of file.patterns) {
      if (!pattern.test(source)) {
        fail(`Upload/browse production smoke guard missing ${name} in ${file.path}`);
      }
    }
  }
}

function checkDocumentActionCenterGuard() {
  for (const file of documentActionCenterFiles) {
    const source = readRequired(file.path);
    for (const { name, pattern } of file.patterns) {
      if (!pattern.test(source)) {
        fail(`Document action center production smoke guard missing ${name} in ${file.path}`);
      }
    }
  }
}

function checkEnterpriseSearchGuard() {
  for (const file of enterpriseSearchFiles) {
    const source = readRequired(file.path);
    for (const { name, pattern } of file.patterns) {
      if (!pattern.test(source)) {
        fail(`Enterprise search production smoke guard missing ${name} in ${file.path}`);
      }
    }
  }
}

function checkGovernanceWorkflowOpsGuard() {
  for (const file of governanceWorkflowOpsFiles) {
    const source = readRequired(file.path);
    for (const { name, pattern } of file.patterns) {
      if (!pattern.test(source)) {
        fail(`Governance/workflow/ops production smoke guard missing ${name} in ${file.path}`);
      }
    }
  }
}

function checkAdminIntegrationsGuard() {
  for (const file of adminIntegrationsFiles) {
    const source = readRequired(file.path);
    for (const { name, pattern } of file.patterns) {
      if (!pattern.test(source)) {
        fail(`Admin/integrations production smoke guard missing ${name} in ${file.path}`);
      }
    }
  }
}

function checkReleaseHardeningGuard() {
  const source = readRequired('docs/ui/enterprise-dms-release-hardening.md');
  for (const { name, pattern } of releaseHardeningPatterns) {
    if (!pattern.test(source)) {
      fail(`Release hardening production smoke guard missing ${name}`);
    }
  }
}

try {
  runExistingLiteralCheck();
  scanProductionUiSources();
  checkRouteVisibility();
  checkBlockedRoutes();
  checkDesignSystemChecklist();
  checkProductionUiInventory();
  checkUploadBrowseFlowGuard();
  checkDocumentActionCenterGuard();
  checkEnterpriseSearchGuard();
  checkGovernanceWorkflowOpsGuard();
  checkAdminIntegrationsGuard();
  checkReleaseHardeningGuard();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

if (findings.length > 0) {
  console.error('Production UI smoke check failed:');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log('Production UI smoke check passed.');
