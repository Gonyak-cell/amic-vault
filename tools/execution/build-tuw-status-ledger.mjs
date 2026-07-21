import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const planPath = 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md';
const jsonPath = 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.json';
const mdPath = 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.md';
const overridesPath = 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json';

const objective = [
  '110 TUW strict completion audit and execution gate.',
  `Use ${planPath} as the authoritative 110-unit checklist and keep ${jsonPath} plus ${mdPath} as the execution-control ledger.`,
  'For every TUW A1-H14 across H1/H2/H3, classify the current state as COMPLETE_CANDIDATE, LOCAL_IMPLEMENTED_NEEDS_EVIDENCE, PARTIAL, NOT_STARTED, or EXTERNAL_BLOCKED.',
  'Do not treat file existence, passing unit tests, generated ledger rows, or plan text as completion.',
  'For each TUW, preserve its acceptance tests, manual QA requirement, dependencies, code anchors, migration requirements, audit/security invariants, external evidence needs, evidenceRefs, and nextAction.',
  'Work one TUW at a time, starting from the smallest dependency-valid row.',
  'Promote a TUW to COMPLETE_CANDIDATE only when required code, migrations, integration/unit tests, permission/audit/security negative tests, staging/manual QA receipt or documented external blocker, focused package checks, changed-file LSP diagnostics where available, db migrate/rollback/migrate where applicable, and git diff check have current evidence refs.',
  'Do not broaden implementation beyond the active TUW, and do not collapse multiple TUWs into a vague uplift task.',
  'Stop claiming product readiness until all 110 rows are COMPLETE_CANDIDATE with evidenceRefs or EXTERNAL_BLOCKED by non-repo operational evidence.',
].join(' ');

const statusById = new Map([
  ...[
    'A1',
    'A2',
    'A3',
    'A4',
    'A5',
    'A6',
    'C1',
    'C2',
    'C4',
    'C5',
    'C6',
    'D1',
    'D3',
    'F4',
    'F5',
    'H1',
    'H2',
    'H5',
    'H6',
    'A14',
    'D8',
    'E6',
    'G13',
    'H8',
    'H9',
  ].map((id) => [id, 'LOCAL_IMPLEMENTED_NEEDS_EVIDENCE']),
  ...[
    'A7',
    'B1',
    'B2',
    'B4',
    'B6',
    'C3',
    'D2',
    'D4',
    'E1',
    'E2',
    'E3',
    'E4',
    'G1',
    'G2',
    'A8',
    'A9',
    'A10',
    'A11',
    'A12',
    'B5',
    'B7',
    'B9',
    'B12',
    'C8',
    'C9',
    'C10',
    'C13',
    'D5',
    'D6',
    'D7',
    'E5',
    'E7',
    'E9',
    'E10',
    'E11',
    'E12',
    'F1',
    'F2',
    'F3',
    'F6',
    'F7',
    'F8',
    'F9',
    'F10',
    'F11',
    'G3',
    'G5',
    'G6',
    'G7',
    'G8',
    'G9',
    'G10',
    'G11',
    'G12',
    'H7',
    'B13',
    'C14',
    'D9',
    'D11',
    'F12',
    'F13',
    'G4',
    'G14',
    'H13',
    'H14',
  ].map((id) => [id, 'PARTIAL']),
  ...[
    'B3',
    'B8',
    'B10',
    'B11',
    'C11',
    'C12',
    'D10',
    'E8',
    'H4',
    'H11',
    'A13',
    'B14',
    'D12',
    'E13',
    'E14',
    'F14',
    'H12',
  ].map((id) => [id, 'NOT_STARTED']),
  ...['C7', 'H3', 'C15'].map((id) => [id, 'EXTERNAL_BLOCKED']),
]);

const nextActionByStatus = {
  COMPLETE_CANDIDATE:
    'Do not do feature work. Re-run the full current-evidence completion audit and fill command/manual evidence refs before closing.',
  LOCAL_IMPLEMENTED_NEEDS_EVIDENCE:
    'Inspect the current implementation against this TUW acceptance block, add missing integration/manual evidence, run focused gates, then fill evidenceRefs.',
  PARTIAL:
    'Identify the missing code or acceptance surface for this TUW only, implement the smallest dependency-valid slice, then collect the required evidence.',
  NOT_STARTED:
    'Do not infer implementation from nearby files. Start this TUW from its plan block after dependencies are satisfied.',
  EXTERNAL_BLOCKED:
    'Keep repo code prepared and default-safe. Completion requires opaque external operational evidence, not more local implementation.',
};

const statusTaxonomy = {
  COMPLETE_CANDIDATE:
    'All required code, DB migrations, unit/integration/negative tests, staging/manual QA receipt or documented external blocker, focused package checks, changed-file LSP diagnostics where available, migrate/rollback/migrate where applicable, and git diff check have current evidence refs.',
  LOCAL_IMPLEMENTED_NEEDS_EVIDENCE:
    'Implementation exists or is close, but the required completion evidence is missing, weak, stale, or narrower than the TUW acceptance block.',
  PARTIAL:
    'Some anchors or adjacent behavior exist, but material code, acceptance coverage, or gates are missing.',
  NOT_STARTED:
    'No reliable TUW-specific implementation evidence found. Nearby infrastructure does not count.',
  EXTERNAL_BLOCKED:
    'Repo-local work may be prepared, but completion depends on external operational evidence such as M365/admin/production/DR receipts.',
};

function lineNumberAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

function unique(values) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function sectionBetween(block, startLabel, stopPattern) {
  const start = block.indexOf(startLabel);
  if (start === -1) return '';
  const rest = block.slice(start + startLabel.length);
  const stop = rest.search(stopPattern);
  return stop === -1 ? rest : rest.slice(0, stop);
}

function bulletLines(section) {
  return unique(
    section
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.replace(/^- /, '').trim()),
  );
}

function inlineCodeValues(section) {
  return unique([...section.matchAll(/`([^`]+)`/g)].map((match) => match[1]));
}

function parseDependencies(block) {
  const match = block.match(/\*\*Dependencies:\*\*\s*([^\n]+)/);
  if (!match) return [];
  const value = match[1].trim();
  if (value === '없음' || value === '—' || value === '-') return [];
  return unique(value.split(/,\s*|\s*→\s*/));
}

function invariantLines(block) {
  const pattern =
    /(감사|Audit|audit|RLS|권한|permission|Permission|fail|tenant|테넌트|raw|token|secret|DLP|external|외부|legal|hold|wall|AI|민감|본문|원문|hash|해시)/i;
  return unique(
    block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => pattern.test(line))
      .slice(0, 20),
  );
}

function externalLines(block) {
  const pattern =
    /(EV-|M365|Microsoft 365|Integrated Apps|admin consent|tenant admin|운영증거|외부|external evidence|evidence-register|production|프로덕션|테넌트|관리자 승인|사이드로드)/i;
  return unique(
    block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => pattern.test(line))
      .slice(0, 20),
  );
}

function migrationLines(block, anchors) {
  return unique([
    ...anchors.filter((anchor) => anchor.includes('db/migrations/')),
    ...block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /마이그레이션|migration|db\/migrations/i.test(line)),
  ]);
}

function normalizeAnchorPath(anchor) {
  return anchor
    .replace(/^신규:\s*/, '')
    .replace(/^신규\([^)]*\):\s*/, '')
    .replace(/\s+\([^)]*\).*$/, '')
    .trim();
}

function statusCounts(rows) {
  return rows.reduce((counts, row) => {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    return counts;
  }, {});
}

function markdownTable(rows) {
  const lines = [
    '| ID | H | Size | Status | Evidence | Gaps | Plan line | Next action |',
    '|---|---:|:---:|---|---:|---:|---:|---|',
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.id} | ${row.horizon} | ${row.size} | ${row.status} | ${row.evidenceCount} | ${row.gapCount} | ${row.planLine} | ${row.nextAction} |`,
    );
  }
  return lines.join('\n');
}

function readOverrides() {
  if (!existsSync(overridesPath)) {
    return { unitOverrides: {} };
  }
  return JSON.parse(readFileSync(overridesPath, 'utf8'));
}

function applyOverride(unit, override) {
  if (!override) return unit;
  if (override.status && !Object.hasOwn(statusTaxonomy, override.status)) {
    throw new Error(`Invalid override status for ${unit.id}: ${override.status}`);
  }
  return {
    ...unit,
    status: override.status ?? unit.status,
    migrationRequirements: override.migrationRequirements ?? unit.migrationRequirements,
    externalEvidenceNeeds: override.externalEvidenceNeeds ?? unit.externalEvidenceNeeds,
    evidenceRefs: override.evidenceRefs ?? unit.evidenceRefs,
    remainingGaps: override.remainingGaps ?? unit.remainingGaps,
    nextAction: override.nextAction ?? unit.nextAction,
    statusRationale: override.statusRationale ?? unit.statusRationale,
    lastReviewedAt: override.lastReviewedAt ?? unit.lastReviewedAt,
  };
}

const plan = readFileSync(planPath, 'utf8');
const overrides = readOverrides();
const unitRegex = /^####\s+([A-H]\d+)\s+\[([SML])\]\s+(.+)$/gm;
const horizonRegex = /^## Horizon\s+(\d+)/gm;
const horizonMarkers = [...plan.matchAll(horizonRegex)].map((match) => ({
  horizon: match[1],
  index: match.index ?? 0,
}));

const units = [];
let match;
while ((match = unitRegex.exec(plan))) {
  const start = match.index ?? 0;
  const next = plan.slice(unitRegex.lastIndex).search(/^####\s+[A-H]\d+\s+\[/m);
  const end = next === -1 ? plan.length : unitRegex.lastIndex + next;
  const block = plan.slice(start, end);
  const horizon =
    horizonMarkers.filter((marker) => marker.index < start).at(-1)?.horizon ?? 'unknown';
  const id = match[1];
  const status = statusById.get(id);
  if (!status) {
    throw new Error(`Missing status classification for ${id}`);
  }
  const codeAnchorSection = sectionBetween(
    block,
    '**Code anchors:**',
    /\n\*\*Acceptance tests|\n#### /,
  );
  const acceptanceSection = sectionBetween(
    block,
    '**Acceptance tests (완료판정):**',
    /\n\*\*검증 노트|\n#### /,
  );
  const anchors = inlineCodeValues(codeAnchorSection);
  const acceptanceTests = bulletLines(acceptanceSection);
  const manualQa = acceptanceTests.filter((line) => line.startsWith('수동'));
  units.push(
    applyOverride(
      {
        id,
        horizon,
        size: match[2],
        title: match[3].trim(),
        source: {
          planPath,
          planLine: lineNumberAt(plan, start),
        },
        status,
        dependencies: parseDependencies(block),
        codeAnchors: anchors.map((anchor) => {
          const pathCandidate = normalizeAnchorPath(anchor);
          return {
            anchor,
            pathCandidate,
            exists: existsSync(pathCandidate),
          };
        }),
        acceptanceTests,
        manualQa,
        migrationRequirements: migrationLines(block, anchors),
        auditSecurityInvariants: invariantLines(block),
        externalEvidenceNeeds: externalLines(block),
        evidenceRefs: [],
        remainingGaps: ['No current TUW-specific completion evidence has been recorded yet.'],
        nextAction: nextActionByStatus[status],
        statusRationale:
          'Initial strict audit classification from current repo scan; not completion evidence.',
        lastReviewedAt: null,
      },
      overrides.unitOverrides?.[id],
    ),
  );
}

if (units.length !== 110) {
  throw new Error(`Expected 110 TUWs, found ${units.length}`);
}

const duplicateIds = units
  .map((unit) => unit.id)
  .filter((id, index, ids) => ids.indexOf(id) !== index);
if (duplicateIds.length > 0) {
  throw new Error(`Duplicate TUW ids: ${duplicateIds.join(', ')}`);
}

const ledger = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourcePlan: planPath,
  overridesPath,
  objective,
  statusTaxonomy,
  completionGate: [
    'derive acceptance tests and manual QA from the source TUW block',
    'verify dependencies are satisfied or explicitly blocked',
    'inspect code anchors and migration requirements in current worktree',
    'run required unit, integration, permission/security negative, and audit tests',
    'run focused package checks plus db migrate/rollback/migrate where applicable',
    'collect current changed-file LSP diagnostics where the tool is available',
    'collect staging/manual QA receipts for TUWs whose acceptance block requires them',
    'record current evidence refs in this ledger',
    'promote exactly one TUW at a time',
  ],
  counts: statusCounts(units),
  units,
};

mkdirSync(dirname(jsonPath), { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(ledger, null, 2)}\n`);

const md = [
  '# TUW Internal DMS Uplift 110 Status Ledger',
  '',
  `Generated from \`${planPath}\`. This ledger is an execution-control artifact, not completion evidence by itself.`,
  `Overrides: \`${overridesPath}\`. Evidence refs are carried only when explicitly recorded there.`,
  '',
  '## Objective',
  '',
  ledger.objective,
  '',
  '## Status Counts',
  '',
  ...Object.entries(ledger.counts).map(([status, count]) => `- ${status}: ${count}`),
  '',
  '## Rules',
  '',
  ...ledger.completionGate.map((rule) => `- ${rule}`),
  '',
  '## Rows',
  '',
  markdownTable(
    units.map((unit) => ({
      id: unit.id,
      horizon: unit.horizon,
      size: unit.size,
      status: unit.status,
      planLine: unit.source.planLine,
      evidenceCount: unit.evidenceRefs.length,
      gapCount: unit.remainingGaps.length,
      nextAction: unit.nextAction,
    })),
  ),
  '',
].join('\n');

writeFileSync(mdPath, md);

console.log(
  JSON.stringify(
    {
      ok: true,
      count: units.length,
      counts: ledger.counts,
      jsonPath,
      mdPath,
    },
    null,
    2,
  ),
);
