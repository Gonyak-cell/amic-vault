import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const planPath = 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md';
const jsonPath = 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.json';
const mdPath = 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.md';
const overridesPath = 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_OVERRIDES.json';
const defaultGeneratedAt = '2026-07-17T00:00:00.000Z';

// Frozen from docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md
// (SHA-256 ee05e4e3e453fab573a8e99153eaeb3bca610e80ecc4d42b15a4491dff5474b1).
// Keep this set local to the parser: importing the source plan would make
// parser tests depend on repository files and would hide source drift.
const FROZEN_TUW_IDS = Object.freeze([
  'A1',
  'A2',
  'A3',
  'A4',
  'A5',
  'A6',
  'A7',
  'B1',
  'B2',
  'B3',
  'B4',
  'B6',
  'C1',
  'C2',
  'C3',
  'C4',
  'C5',
  'C6',
  'C7',
  'D1',
  'D2',
  'D3',
  'D4',
  'E1',
  'E2',
  'E3',
  'E4',
  'F4',
  'F5',
  'G1',
  'G2',
  'H1',
  'H2',
  'H3',
  'H5',
  'H6',
  'A8',
  'A9',
  'A10',
  'A11',
  'A12',
  'A14',
  'B5',
  'B7',
  'B8',
  'B9',
  'B10',
  'B11',
  'B12',
  'C8',
  'C9',
  'C10',
  'C11',
  'C12',
  'C13',
  'C15',
  'D5',
  'D6',
  'D7',
  'D8',
  'D10',
  'E5',
  'E6',
  'E7',
  'E8',
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
  'G13',
  'H4',
  'H7',
  'H8',
  'H9',
  'H11',
  'A13',
  'B13',
  'B14',
  'C14',
  'D9',
  'D11',
  'D12',
  'E13',
  'E14',
  'F12',
  'F13',
  'F14',
  'G4',
  'G14',
  'H12',
  'H13',
  'H14',
  'B15',
  'B16',
  'B17',
  'C16',
  'B18',
  'B19',
  'B20',
]);

const objective = [
  '117 TUW strict completion audit and execution gate.',
  `Use ${planPath} as the authoritative 117-unit checklist and keep ${jsonPath} plus ${mdPath} as the active execution-control ledger.`,
  'For every TUW A1-H14 and Appendix-2 row across H1/H2/H3, classify the current state as COMPLETE_CANDIDATE, LOCAL_IMPLEMENTED_NEEDS_EVIDENCE, PARTIAL, NOT_STARTED, EXTERNAL_BLOCKED, or UNADJUDICATED.',
  'Do not treat file existence, passing unit tests, generated ledger rows, or plan text as completion.',
  'For each TUW, preserve its acceptance tests, manual QA requirement, dependencies, code anchors, migration requirements, audit/security invariants, external evidence needs, evidenceRefs, and nextAction.',
  'Work one TUW at a time, starting from the smallest dependency-valid row.',
  'Promote a TUW to COMPLETE_CANDIDATE only when required code, migrations, integration/unit tests, permission/audit/security negative tests, staging/manual QA receipt or documented external blocker, focused package checks, changed-file LSP diagnostics where available, db migrate/rollback/migrate where applicable, and git diff check have current evidence refs.',
  'Do not broaden implementation beyond the active TUW, and do not collapse multiple TUWs into a vague uplift task.',
  'Stop claiming product readiness until all 117 rows are COMPLETE_CANDIDATE with evidenceRefs or EXTERNAL_BLOCKED by non-repo operational evidence; UNADJUDICATED rows are not completion evidence.',
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
  ...['B15', 'B16', 'B17', 'C16', 'B18', 'B19', 'B20'].map((id) => [id, 'UNADJUDICATED']),
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
  UNADJUDICATED:
    'Do not infer completion. Adjudicate this newly registered TUW against its acceptance block and record current evidence before any status change.',
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
  UNADJUDICATED:
    'The TUW is present in the active 117-unit plan but has no adjudication or completion evidence recorded yet.',
};

function lineNumberAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

const tuwIdPrefixRegex = /^[A-H]\d+(?:[ \t]|$)/;

/**
 * Parse one Markdown heading without reading the frozen source plan.
 *
 * The source has two intentionally different grammars:
 *   #### ID [S|M|L] Title
 *   ### ID [H1|H2|H3/S|M|L(·선택)] Title
 */
export function parseTuwHeading(line, lineNumber = 1) {
  const headingMatch = /^(#{1,6})[ \t]+(.+?)[ \t]*$/.exec(line.trimEnd());
  if (!headingMatch) return null;

  const rank = headingMatch[1].length;
  const text = headingMatch[2].trim();

  if (rank === 4) {
    const originalMatch = /^([A-H]\d+)[ \t]+\[([SML])\][ \t]+(.+)$/.exec(text);
    if (originalMatch) {
      return {
        grammar: 'original',
        rank,
        id: originalMatch[1],
        horizon: null,
        size: originalMatch[2],
        conditional: false,
        title: originalMatch[3].trim(),
        heading: line.trimEnd(),
        line: lineNumber,
      };
    }
  }

  if (rank === 3) {
    const appendixMatch = /^([A-H]\d+)[ \t]+\[(H[123])\/([SML])(·선택)?\][ \t]+(.+)$/.exec(text);
    if (appendixMatch) {
      const [, id, horizon, size, marker, title] = appendixMatch;
      const conditional = Boolean(marker);
      const conditionalShape = horizon === 'H3' && size === 'L';
      if (conditional !== conditionalShape) {
        throw new Error(
          `Malformed Appendix-2 conditional marker for ${id} at line ${lineNumber}; H3/L requires ·선택 and other forms forbid it`,
        );
      }
      return {
        grammar: 'appendix-2',
        rank,
        id,
        horizon,
        size,
        conditional,
        title: title.trim(),
        heading: line.trimEnd(),
        line: lineNumber,
      };
    }
  }

  if ((rank === 3 || rank === 4 || tuwIdPrefixRegex.test(text)) && tuwIdPrefixRegex.test(text)) {
    throw new Error(`Malformed TUW heading at line ${lineNumber}: ${line.trim()}`);
  }
  return null;
}

function duplicateValues(values) {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

export function assertExactTuwIdSet(units, expectedIds = FROZEN_TUW_IDS) {
  const actualIds = units.map((unit) => (typeof unit === 'string' ? unit : unit.id));
  const expected = [...expectedIds];
  const expectedSet = new Set(expected);
  const actualSet = new Set(actualIds);
  const duplicates = duplicateValues(actualIds);
  const missing = expected.filter((id) => !actualSet.has(id));
  const extra = [...actualSet].filter((id) => !expectedSet.has(id));
  if (duplicates.length || missing.length || extra.length || actualIds.length !== expected.length) {
    const details = [
      `Expected exact ${expected.length} TUW IDs, found ${actualIds.length}`,
      missing.length ? `missing: ${missing.join(', ')}` : '',
      duplicates.length ? `duplicate: ${duplicates.join(', ')}` : '',
      extra.length ? `extra: ${extra.join(', ')}` : '',
    ].filter(Boolean);
    throw new Error(details.join('; '));
  }
  return true;
}

/**
 * Parse all TUW blocks and cut each block at the next heading whose rank is
 * equal to or higher than the TUW heading rank. Non-TUW headings participate
 * in the boundary scan so category/directive text cannot bleed into a TUW.
 */
export function parseTuwBlocks(markdown, options = {}) {
  if (typeof markdown !== 'string') {
    throw new TypeError('Expected Markdown source text');
  }
  const { expectedIds = FROZEN_TUW_IDS, assertExact = true } = options;
  const headings = [];
  const headingScan = /^(#{1,6})[ \t]+(.+?)[ \t]*$/gm;
  let match;
  while ((match = headingScan.exec(markdown))) {
    const line = match[0];
    const lineNumber = lineNumberAt(markdown, match.index ?? 0);
    const parsed = parseTuwHeading(line, lineNumber);
    headings.push({
      index: match.index ?? 0,
      endIndex: headingScan.lastIndex,
      rank: match[1].length,
      parsed,
    });
  }

  const blocks = headings
    .filter((heading) => heading.parsed)
    .map((heading) => {
      const boundary = headings.find(
        (candidate) => candidate.index > heading.index && candidate.rank <= heading.rank,
      );
      const end = boundary?.index ?? markdown.length;
      const parsed = heading.parsed;
      return {
        ...parsed,
        start: heading.index,
        end,
        endLine: lineNumberAt(markdown, end),
        block: markdown.slice(heading.index, end),
        body: markdown.slice(heading.endIndex, end),
      };
    });

  if (assertExact) assertExactTuwIdSet(blocks, expectedIds);
  return blocks;
}

export const parseTuwDocument = parseTuwBlocks;
export { FROZEN_TUW_IDS };

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

function parsePlanUnits(plan, overrides) {
  const horizonMarkers = [...plan.matchAll(/^##\s+Horizon\s+(\d+)/gm)].map((match) => ({
    horizon: match[1],
    index: match.index ?? 0,
  }));

  return parseTuwBlocks(plan).map((parsedUnit) => {
    const block = parsedUnit.block;
    const id = parsedUnit.id;
    const status = statusById.get(id);
    if (!status) {
      throw new Error(`Missing status classification for ${id}`);
    }
    const horizon =
      parsedUnit.horizon?.replace(/^H/, '') ??
      horizonMarkers.filter((marker) => marker.index < parsedUnit.start).at(-1)?.horizon ??
      'unknown';
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
    return applyOverride(
      {
        id,
        horizon,
        size: parsedUnit.size,
        title: parsedUnit.title,
        source: {
          planPath,
          planLine: parsedUnit.line,
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
    );
  });
}

export function buildLedgerFromPlan(
  plan,
  { overrides = { updatedAt: defaultGeneratedAt, unitOverrides: {} } } = {},
) {
  const units = parsePlanUnits(plan, overrides);
  const ledger = {
    schemaVersion: 1,
    generatedAt: overrides.updatedAt ?? defaultGeneratedAt,
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
  const markdown = [
    '# TUW Internal DMS Uplift 117 Status Ledger',
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
  return { ledger, markdown };
}

export function generateLedger({ check = false } = {}) {
  const plan = readFileSync(planPath, 'utf8');
  const overrides = readOverrides();
  const { ledger, markdown } = buildLedgerFromPlan(plan, { overrides });
  const json = `${JSON.stringify(ledger, null, 2)}\n`;
  if (check) {
    const actualJson = existsSync(jsonPath) ? readFileSync(jsonPath, 'utf8') : null;
    const actualMarkdown = existsSync(mdPath) ? readFileSync(mdPath, 'utf8') : null;
    if (actualJson !== json || actualMarkdown !== markdown) {
      throw new Error(`Generated 117 ledger drift detected in ${jsonPath} or ${mdPath}`);
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          check: true,
          count: ledger.units.length,
          counts: ledger.counts,
          jsonPath,
          mdPath,
        },
        null,
        2,
      ),
    );
    return ledger;
  }
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, json);
  writeFileSync(mdPath, markdown);
  console.log(
    JSON.stringify(
      {
        ok: true,
        count: ledger.units.length,
        counts: ledger.counts,
        jsonPath,
        mdPath,
      },
      null,
      2,
    ),
  );
  return ledger;
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) {
  try {
    generateLedger({ check: process.argv.includes('--check') });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
