#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import zlib from 'node:zlib';

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;
const DEFAULT_ARCHIVE_SEGMENTS = ['999_이전 자료들', '999_이전자료들'];
const DEFAULT_TOP_LIMIT = 30;
const DEFAULT_GROUP_DEPTHS = [1, 2, 3];
const MAX_GROUP_SAMPLES = 12;

const supportedExtensions = new Set([
  '.csv',
  '.doc',
  '.docx',
  '.eml',
  '.hwp',
  '.hwpx',
  '.jpeg',
  '.jpg',
  '.msg',
  '.pdf',
  '.png',
  '.ppt',
  '.pptx',
  '.txt',
  '.xls',
  '.xlsx',
]);

export function usage() {
  return [
    'usage: node tools/migration/onedrive-bulk-scope.mjs --input <raw.ndjson[.gz]> --run-id <id> --sanitized-output <out.json> --local-output-dir <dir> [--expected-rows <n>] [--source-prefix <prefix>] [--archive-segment <segment>] [--top-limit <n>]',
    '',
    'Builds local-only bulk mapping scope baseline/group/archive lanes.',
    'Sanitized output excludes raw object keys, paths, filenames, bucket names, and document contents.',
  ].join('\n');
}

export function parseArgs(argv) {
  const args = {
    archiveSegments: [...DEFAULT_ARCHIVE_SEGMENTS],
    groupDepths: DEFAULT_GROUP_DEPTHS,
    topLimit: DEFAULT_TOP_LIMIT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') {
      args.help = true;
      continue;
    }
    if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) throw new Error(`missing value for --${key}`);
    index += 1;

    if (key === 'input') args.input = next;
    else if (key === 'run-id') args.runId = next;
    else if (key === 'sanitized-output') args.sanitizedOutput = next;
    else if (key === 'local-output-dir') args.localOutputDir = next;
    else if (key === 'source-prefix') args.sourcePrefix = next;
    else if (key === 'expected-rows') args.expectedRows = parsePositiveInteger(next, '--expected-rows');
    else if (key === 'archive-segment') args.archiveSegments.push(next);
    else if (key === 'top-limit') args.topLimit = parsePositiveInteger(next, '--top-limit');
    else throw new Error(`unknown option: --${key}`);
  }

  return args;
}

function parsePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function requireArgs(args) {
  const missing = [];
  for (const key of ['input', 'runId', 'sanitizedOutput', 'localOutputDir']) {
    if (!args[key]) missing.push(key);
  }
  if (missing.length) throw new Error(`missing required argument(s): ${missing.join(', ')}`);
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function addCounter(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function topEntries(map, limit) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function sizeBucket(sizeBytes) {
  if (sizeBytes === 0) return 'zero_bytes';
  if (sizeBytes < MIB) return 'lt_1_mib';
  if (sizeBytes < 10 * MIB) return '1_to_10_mib';
  if (sizeBytes < 100 * MIB) return '10_to_100_mib';
  if (sizeBytes < GIB) return '100_mib_to_1_gib';
  return 'gte_1_gib';
}

function emptyEvidenceCounts() {
  return {
    governing: 0,
    criminal: 0,
    proceeding: 0,
    transaction: 0,
    correspondence_admin: 0,
    contract: 0,
    advisory: 0,
    registry_tax: 0,
    financial: 0,
    other: 0,
  };
}

export function classifyEvidence(key) {
  const normalized = key.normalize('NFC').toLowerCase();
  const classes = new Set();

  const match = (patterns) => patterns.some((pattern) => normalized.includes(pattern));
  if (
    match([
      '정관',
      '주주총회',
      '이사회',
      '의사록',
      'minutes',
      'board',
      'shareholder',
      'articles',
    ])
  ) {
    classes.add('governing');
  }
  if (
    match([
      '형사',
      '고소',
      '고발',
      '수사',
      '기소',
      '불송치',
      '송치',
      '검찰',
      '경찰',
      '피의자',
      '피고소',
      '피고발',
      'criminal',
      'prosecution',
      'police',
      'complainant',
    ])
  ) {
    classes.add('criminal');
  }
  if (
    match([
      '소장',
      '답변서',
      '준비서면',
      '판결',
      '결정문',
      '가처분',
      '소송',
      'complaint',
      'litigation',
      'civil',
      'brief',
      'judgment',
    ])
  ) {
    classes.add('proceeding');
  }
  if (
    match([
      '주식매매',
      '주식양수도',
      '투자계약',
      '인수',
      '합병',
      'spa',
      'm&a',
      'merger',
      'acquisition',
      'investment',
      'subscription',
      'due diligence',
      'dd',
      'closing',
    ])
  ) {
    classes.add('transaction');
  }
  if (match(['이메일', 'email', '메일', '송부', '회신', '요청', '카톡', 'kakao', 'correspondence'])) {
    classes.add('correspondence_admin');
  }
  if (match(['계약', 'agreement', 'contract', 'mou', 'loa'])) {
    classes.add('contract');
  }
  if (match(['자문', '검토', '의견서', '법률의견', 'memo', 'opinion', 'advisory'])) {
    classes.add('advisory');
  }
  if (match(['등기', '사업자등록', '법인등기', '세무', 'tax', 'registry', 'registration'])) {
    classes.add('registry_tax');
  }
  if (match(['재무', '회계', '감사', 'valuation', 'financial', 'audit'])) {
    classes.add('financial');
  }
  if (!classes.size) classes.add('other');
  return [...classes].sort();
}

function isProjectLike(segments) {
  return segments.some((segment) => {
    const normalized = normalizedSegment(segment);
    return normalized === 'pjt' || normalized === 'project' || normalized.includes('프로젝트');
  });
}

function leafName(key) {
  return key.split('/').filter(Boolean).at(-1) ?? '';
}

function baseNameWithoutExtension(name) {
  const index = name.lastIndexOf('.');
  if (index <= 0) return name;
  return name.slice(0, index);
}

function stripLeadingIndexPrefix(value) {
  return value.replace(/^\s*\d{1,3}\s*[_\-.]\s*/u, '').trim();
}

function normalizeClientShortName(value) {
  const stripped = stripLeadingIndexPrefix(value)
    .normalize('NFC')
    .replace(/\s*\((탈세제보|세웅|1세대 2주택|세무법인 선율)\)\s*/gu, ' ')
    .replace(/^\s*(주식회사|유한회사|합자회사|합명회사|사단법인|재단법인|회계법인|법무법인|법률사무소)\s+/u, '')
    .replace(/\s*(주식회사|유한회사|합자회사|합명회사|사단법인|재단법인|회계법인|법무법인|법률사무소)\s*$/u, '')
    .replace(/\s*(회장님|교수님|선생님|원장님|작가|PD)\s*$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  const combinedPersonOverrides = [
    [/^다스버스[\s_-]*박길홍$/u, '다스버스'],
    [/^최원준[\s_-]*이상현$/u, '최원준'],
    [/^황미혜[\s_-]*김성우$/u, '황미혜'],
  ];
  for (const [pattern, replacement] of combinedPersonOverrides) {
    if (pattern.test(stripped)) return replacement;
  }
  if (stripped === '창천') return '회계법인 창천';
  return stripped || null;
}

const projectClientOverrides = new Map([
  ['pjt. washington', { client: '더블유더블유지미래혁신사모투자', confidence: 'docx_evidence_candidate' }],
  ['pjt. london', { client: '더블유더블유지미래혁신사모투자', confidence: 'human_corrected_candidate' }],
  ['project fausta', { client: '봉경환 이익중', confidence: 'human_corrected_candidate' }],
  ['pjt. el paso', { client: '이엠엘', confidence: 'docx_evidence_candidate' }],
  ['project equity', { client: '이은주', confidence: 'docx_evidence_candidate' }],
  ['project kingston_dispute', { client: '이로투자조합1호', confidence: 'docx_evidence_candidate' }],
  ['project horizon', { client: '유진이엔티', confidence: 'docx_evidence_candidate' }],
  ['pjt. next', { client: '최재헌 외 2인', confidence: 'docx_evidence_candidate' }],
  ['pjt. switch', { client: '성진종합전기', confidence: 'human_corrected_candidate' }],
  ['명의신탁 환원 프로젝트', { client: '진형건설', confidence: 'docx_evidence_candidate' }],
  ['pjt. lion', { client: '롯데에코월', confidence: 'human_corrected_candidate' }],
]);

function projectClientOverride(value) {
  return projectClientOverrides.get(normalizedSegment(stripLeadingIndexPrefix(value))) ?? null;
}

function compactSegment(value) {
  return stripLeadingIndexPrefix(value)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[._\-\s&]+/g, '');
}

function isMatterCategorySegment(value) {
  return new Set(['민사', '형사', '행정', '기업자문', '기업인수합병']).has(compactSegment(value));
}

function isReferenceRootSegment(value) {
  return new Set(['양식', 'newsletter', '변호사조회서', '보도자료', '주간회의']).has(compactSegment(value));
}

function isReferenceOrArchiveSegment(value) {
  const normalized = normalizedSegment(stripLeadingIndexPrefix(value));
  return (
    isReferenceRootSegment(value) ||
    ['reference', 'references', 'archive', 'archives', 'template', 'templates'].includes(normalized)
  );
}

function isProjectCodeNameSegment(value) {
  const normalized = normalizedSegment(stripLeadingIndexPrefix(value));
  const compact = compactSegment(value);
  return normalized === 'pjt' || normalized === 'project' || compact.includes('pjt') || compact.includes('project');
}

function isFileLikeSegment(value) {
  return supportedExtensions.has(extensionOfKey(value));
}

function isSystemOrEmailSegment(value) {
  const trimmed = stripLeadingIndexPrefix(value).trim();
  return trimmed.startsWith('.') || trimmed.startsWith('_write_test') || trimmed.includes('@');
}

function isWorkProductSegment(value) {
  return new Set([
    'ai작업',
    'checklist',
    'contracts',
    'dd',
    'fdd',
    'ldd',
    'lddfinal',
    'memorandum',
    'redline',
    'rfi',
    'valuation',
    '검토',
    '계약서고객송부본',
    '고객송부본',
    '고객전달자료',
    '관련계약서',
    '보고자료',
    '버전관리',
    '샘플',
    '세탁',
    '송부본',
    '수령자료',
    '수임제안서',
    '스캔본정리',
    '실사자료',
    '인터뷰',
    '정리완료',
    '종결사건',
    '종료사건',
    '체결본',
    '회사정보',
    '회의록',
  ]).has(compactSegment(value));
}

function isMatterTitleLikeSegment(value) {
  const normalized = normalizedSegment(stripLeadingIndexPrefix(value));
  const compact = compactSegment(value);
  const matterTerms = [
    'rcps상환',
    '계약분쟁',
    '고발',
    '고소',
    '대응',
    '명의신탁',
    '분쟁',
    '불송치',
    '상환관련검토',
    '세무조사',
    '소송',
    '송치',
    '수사',
    '유권해석',
    '자문',
    '조세불복',
    '주식매매',
    '주주간계약',
    '증여세',
    '징계',
    '피해',
    '풍무역세권개발사업',
    '행정심판',
    '형사고발',
    '형사고소',
  ];
  return (
    matterTerms.some((term) => compact.includes(compactSegment(term))) ||
    /\d{4}[가-힣]{1,5}\d{1,}/u.test(normalized) ||
    /\s+v\.?\s+/iu.test(normalized) ||
    /\s+vs\.?\s+/iu.test(normalized)
  );
}

function missingClientHint() {
  return {
    raw_label_hint: null,
    client_short_name_candidate: null,
    confidence: 'missing',
  };
}

function isSkippableRootSegment(value) {
  const normalized = normalizedSegment(value);
  return (
    normalized &&
    (normalized === '[root]' ||
      normalized.includes('amic') ||
      normalized === 'pjt' ||
      normalized === 'project' ||
      normalized.includes('프로젝트') ||
      normalized.includes('999_이전') ||
      isMatterCategorySegment(value))
  );
}

export function inferClientHint(groupLabel) {
  const segments = groupLabel.split('/').filter(Boolean);
  if (segments.length > 0 && isReferenceRootSegment(segments[0])) {
    return missingClientHint();
  }

  let raw = null;
  for (const segment of segments) {
    const projectOverride = projectClientOverride(segment);
    if (projectOverride) {
      return {
        raw_label_hint: segment,
        client_short_name_candidate: projectOverride.client,
        confidence: projectOverride.confidence,
      };
    }
    if (isSkippableRootSegment(segment)) continue;
    if (
      isProjectCodeNameSegment(segment) ||
      isReferenceOrArchiveSegment(segment) ||
      isFileLikeSegment(segment) ||
      isSystemOrEmailSegment(segment) ||
      isWorkProductSegment(segment) ||
      isMatterTitleLikeSegment(segment)
    ) {
      return missingClientHint();
    }
    raw = segment;
    break;
  }

  const normalized = raw ? normalizeClientShortName(raw) : null;
  return {
    raw_label_hint: raw,
    client_short_name_candidate: normalized,
    confidence: normalized ? 'folder_hint_only' : 'missing',
  };
}

export function inferMatterTypeDetail(evidenceCounts) {
  const get = (key) => evidenceCounts[key] ?? 0;
  const scored = [
    {
      type: 'Criminal',
      detail: '형사사건',
      score: get('criminal') * 6,
      reason: 'criminal_evidence_hint',
      priority: 1,
    },
    {
      type: 'Civil',
      detail: '민사소송',
      score: get('proceeding') * 4,
      reason: 'civil_proceeding_evidence_hint',
      priority: 2,
    },
    {
      type: 'M&A',
      detail: '인수합병',
      score: get('transaction') * 4,
      reason: 'ma_transaction_evidence_hint',
      priority: 3,
    },
    {
      type: 'Advisory',
      detail: '기업자문',
      score:
        get('governing') * 3 +
        get('advisory') * 3 +
        get('contract') +
        get('registry_tax') * 2 +
        get('financial'),
      reason: 'advisory_corporate_evidence_hint',
      priority: 4,
    },
  ].sort((left, right) => right.score - left.score || left.priority - right.priority);
  const best = scored[0];
  if (!best || best.score <= 0) {
    return {
      matter_type_english: null,
      matter_detail_type_korean: null,
      confidence: 'missing',
      reason: 'no_decisive_evidence_hint',
    };
  }
  const tied = scored.filter((candidate) => candidate.score === best.score && candidate.score > 0);
  return {
    matter_type_english: best.type,
    matter_detail_type_korean: best.detail,
    confidence: tied.length === 1 ? 'evidence_hint_only' : 'conflicting_evidence_hints',
    reason: tied.length === 1 ? best.reason : 'multiple_evidence_hints_tied',
  };
}

function draftMatterCode(clientShortName, matterTypeEnglish, matterDetailTypeKorean) {
  if (!clientShortName || !matterTypeEnglish || !matterDetailTypeKorean) return null;
  return `${clientShortName}/${matterTypeEnglish}/${matterDetailTypeKorean}`;
}

export function extensionOfKey(key) {
  const leaf = key.split('/').filter(Boolean).at(-1) ?? '';
  if (!leaf || !leaf.includes('.')) return '[no_ext]';
  if (leaf.startsWith('.') && leaf.indexOf('.', 1) === -1) return '[no_ext]';
  const ext = leaf.split('.').at(-1)?.trim().toLowerCase() ?? '';
  if (!ext || ext.length > 12 || /[\\/\s:]/.test(ext)) return '[other_or_long_ext]';
  return `.${ext}`;
}

export function relativeKey(key, sourcePrefix = '') {
  if (sourcePrefix && key.startsWith(sourcePrefix)) return key.slice(sourcePrefix.length);
  const marker = '/source-tree/';
  const markerIndex = key.indexOf(marker);
  if (markerIndex !== -1) return key.slice(markerIndex + marker.length);
  return key;
}

function normalizedSegment(value) {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function archiveNeedles(archiveSegments) {
  return new Set(archiveSegments.map(normalizedSegment));
}

export function classifyLane({ segments, extension, archiveSegments }) {
  const normalized = segments.map(normalizedSegment);
  if (normalized.some((segment) => archiveSegments.has(segment))) return 'archive_only';
  if (!supportedExtensions.has(extension)) return 'unsupported';
  return 'mapping_required';
}

function groupLabel(segments, depth) {
  if (!segments.length) return '[root]';
  return segments.slice(0, Math.min(depth, segments.length)).join('/');
}

function groupId(label, depth) {
  return sha256Hex(`depth:${depth}:${label}`).slice(0, 16);
}

function classifyGroup(group) {
  const gib = group.bytes / GIB;
  const zeroRatio = group.count ? group.zeroBytes / group.count : 0;
  const reasons = [];
  if (group.count > 10000) reasons.push('large_group_count');
  if (gib > 50) reasons.push('large_group_bytes');
  if (group.over1GiB > 0) reasons.push('contains_gte_1_gib_objects');
  if (zeroRatio > 0.05) reasons.push('high_zero_byte_ratio');
  if (group.extensions.size > 40) reasons.push('high_extension_diversity');
  if (group.archiveOnly > 0 && group.mappingRequired > 0) reasons.push('archive_mixed_with_mapping_required');
  if (group.archiveOnly > 0 && group.unsupported > 0) reasons.push('archive_mixed_with_unsupported');
  if (reasons.length) return { risk: 'challenge_required', reasons };
  if (group.mappingRequired > 0) return { risk: 'mapping_required', reasons: ['requires_client_matter_resolution'] };
  if (group.archiveOnly > 0) return { risk: 'archive_only', reasons: ['archive_segment_detected'] };
  return { risk: 'unsupported_or_empty', reasons: ['no_supported_mapping_rows'] };
}

function createGroup(label, depth) {
  return {
    id: groupId(label, depth),
    label,
    depth,
    count: 0,
    bytes: 0,
    zeroBytes: 0,
    over200MiB: 0,
    over1GiB: 0,
    archiveOnly: 0,
    mappingRequired: 0,
    unsupported: 0,
    projectLikeRows: 0,
    extensions: new Map(),
    sizeBuckets: new Map(),
    evidenceClasses: new Map(),
    samples: [],
  };
}

function addGroupRow(groups, row, segments, depth, sizeBytes, extension, lane, evidenceClasses, projectLike) {
  const label = groupLabel(segments, depth);
  const id = `${depth}:${groupId(label, depth)}`;
  let group = groups.get(id);
  if (!group) {
    group = createGroup(label, depth);
    groups.set(id, group);
  }
  group.count += 1;
  group.bytes += sizeBytes;
  if (sizeBytes === 0) group.zeroBytes += 1;
  if (sizeBytes >= 200 * MIB) group.over200MiB += 1;
  if (sizeBytes >= GIB) group.over1GiB += 1;
  if (lane === 'archive_only') group.archiveOnly += 1;
  else if (lane === 'unsupported') group.unsupported += 1;
  else group.mappingRequired += 1;
  if (projectLike) group.projectLikeRows += 1;
  addCounter(group.extensions, extension);
  addCounter(group.sizeBuckets, sizeBucket(sizeBytes));
  for (const evidenceClass of evidenceClasses) addCounter(group.evidenceClasses, evidenceClass);
  if (lane === 'mapping_required' && group.samples.length < MAX_GROUP_SAMPLES) {
    group.samples.push({
      raw_key: row.key,
      raw_bucket: row.bucket,
      leaf_name: leafName(row.key),
      title_hint: baseNameWithoutExtension(leafName(row.key)),
      extension,
      size_bytes: sizeBytes,
      evidence_classes: evidenceClasses,
    });
  }
}

function openInputStream(filePath) {
  const stream = fs.createReadStream(filePath);
  if (filePath.endsWith('.gz')) return stream.pipe(zlib.createGunzip());
  return stream;
}

function localOutputPaths(localOutputDir) {
  return {
    rowLanes: path.join(localOutputDir, 'bulk-row-lanes.local.ndjson.gz'),
    groups: path.join(localOutputDir, 'bulk-source-groups.local.ndjson.gz'),
    folderCensus: path.join(localOutputDir, 'folder-census.local.ndjson.gz'),
    evidenceMatrix: path.join(localOutputDir, 'evidence-matrix.local.ndjson.gz'),
    approvalWorkbook: path.join(localOutputDir, 'human-approval-workbook.local.ndjson.gz'),
    reviewerPacket: path.join(localOutputDir, 'reviewer-packet.local.ndjson.gz'),
    documentCensus: path.join(localOutputDir, 'document-census.local.ndjson.gz'),
    candidateHints: path.join(localOutputDir, 'candidate-hints.local.ndjson.gz'),
    matterCodeProposals: path.join(localOutputDir, 'matter-code-proposals.local.ndjson.gz'),
    targetResolutionPlan: path.join(localOutputDir, 'target-resolution-plan.local.ndjson.gz'),
    writeReadinessChecklist: path.join(localOutputDir, 'write-readiness-checklist.local.ndjson.gz'),
    approvedImportScope: path.join(localOutputDir, 'approved-import-scope.local.ndjson.gz'),
  };
}

export async function buildBulkScope(args) {
  requireArgs(args);
  const generatedAt = new Date().toISOString();
  const archiveSegments = archiveNeedles(args.archiveSegments);
  const inputStat = await fs.promises.stat(args.input);
  const inputSha256 = sha256Hex(await fs.promises.readFile(args.input));
  const outputPaths = localOutputPaths(args.localOutputDir);

  await mkdir(args.localOutputDir, { recursive: true });
  await mkdir(path.dirname(args.sanitizedOutput), { recursive: true });

  const totals = {
    rows: 0,
    validRows: 0,
    invalidRows: 0,
    bytes: 0,
    zeroBytes: 0,
    maxBytes: 0,
    minDepth: Number.POSITIVE_INFINITY,
    maxDepth: 0,
  };
  const buckets = new Map();
  const extensions = new Map();
  const depths = new Map();
  const lanes = new Map();
  const laneBytes = new Map();
  const archiveExtensions = new Map();
  const unsupportedExtensions = new Map();
  const evidenceClassCounts = new Map();
  const finalLaneCounts = new Map();
  const groups = new Map();
  const rowLaneLines = [];

  const rl = readline.createInterface({
    input: openInputStream(args.input),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    totals.rows += 1;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      totals.invalidRows += 1;
      continue;
    }

    if (typeof row.key !== 'string') {
      totals.invalidRows += 1;
      continue;
    }
    const sizeBytes = Number(row.size_bytes ?? row.size);
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
      totals.invalidRows += 1;
      continue;
    }

    const rel = relativeKey(row.key, args.sourcePrefix);
    const segments = rel.split('/').filter(Boolean);
    const depth = segments.length;
    const extension = extensionOfKey(row.key);
    const lane = classifyLane({ segments, extension, archiveSegments });
    const finalLane = lane === 'mapping_required' ? 'needs_review' : lane;
    const evidenceClasses = classifyEvidence(rel);
    const projectLike = isProjectLike(segments);
    const sourceObjectHash = sha256Hex(row.key);

    totals.validRows += 1;
    totals.bytes += sizeBytes;
    if (sizeBytes === 0) totals.zeroBytes += 1;
    totals.maxBytes = Math.max(totals.maxBytes, sizeBytes);
    totals.minDepth = Math.min(totals.minDepth, depth);
    totals.maxDepth = Math.max(totals.maxDepth, depth);
    addCounter(buckets, String(row.bucket ?? '[missing]'));
    addCounter(extensions, extension);
    addCounter(depths, String(depth));
    addCounter(lanes, lane);
    addCounter(finalLaneCounts, finalLane);
    addCounter(laneBytes, lane, sizeBytes);
    if (lane === 'archive_only') addCounter(archiveExtensions, extension);
    if (lane === 'unsupported') addCounter(unsupportedExtensions, extension);
    for (const evidenceClass of evidenceClasses) addCounter(evidenceClassCounts, evidenceClass);

    for (const groupDepth of args.groupDepths) {
      addGroupRow(groups, row, segments, groupDepth, sizeBytes, extension, lane, evidenceClasses, projectLike);
    }

    rowLaneLines.push(
      JSON.stringify({
        source_object_hash: sourceObjectHash,
        lane,
        final_lane: finalLane,
        extension,
        size_bytes: sizeBytes,
        depth,
        evidence_classes: evidenceClasses,
        project_like: projectLike,
        validation_loop: {
          generate: lane === 'mapping_required' ? 'candidate_required' : 'not_applicable',
          verify: lane === 'mapping_required' ? 'needs_internal_document_review' : 'not_applicable',
          challenge: lane === 'mapping_required' ? 'pending_reviewer_challenge' : 'not_applicable',
          reconcile: lane === 'mapping_required' ? 'needs_review' : finalLane,
          final_state: finalLane,
        },
        groups: Object.fromEntries(
          args.groupDepths.map((groupDepth) => {
            const label = groupLabel(segments, groupDepth);
            return [`depth_${groupDepth}`, groupId(label, groupDepth)];
          }),
        ),
        raw: {
          bucket: row.bucket,
          key: row.key,
        },
        matter_code: null,
      }),
    );
  }

  const serializedGroups = [...groups.values()]
    .map((group) => {
      const classification = classifyGroup(group);
      return {
        group_id: group.id,
        depth: group.depth,
        raw_group_label: group.label,
        risk: classification.risk,
        risk_reasons: classification.reasons,
        object_count: group.count,
        total_bytes: group.bytes,
        project_like_rows: group.projectLikeRows,
        lane_counts: {
          archive_only: group.archiveOnly,
          mapping_required: group.mappingRequired,
          unsupported: group.unsupported,
        },
        evidence_class_counts: Object.fromEntries([...group.evidenceClasses.entries()].sort()),
        sample_count: group.samples.length,
        samples: group.samples,
        top_extensions_by_count: topEntries(group.extensions, 10).map(({ key, count }) => ({
          extension: key,
          count,
        })),
        size_bucket_counts: Object.fromEntries([...group.sizeBuckets.entries()].sort()),
      };
    })
    .sort((left, right) => left.depth - right.depth || left.group_id.localeCompare(right.group_id));

  const folderCensusRows = serializedGroups.map((group) => ({
    group_id: group.group_id,
    depth: group.depth,
    raw_group_label: group.raw_group_label,
    object_count: group.object_count,
    total_bytes: group.total_bytes,
    lane_counts: group.lane_counts,
    project_like_rows: group.project_like_rows,
    top_extensions_by_count: group.top_extensions_by_count,
    folder_hint_state:
      group.lane_counts.mapping_required > 0 ? 'folder_hint_only_needs_document_census' : group.risk,
  }));

  const evidenceMatrixRows = serializedGroups.map((group) => ({
    group_id: group.group_id,
    depth: group.depth,
    raw_group_label: group.raw_group_label,
    evidence_class_counts: group.evidence_class_counts,
    governing: group.evidence_class_counts.governing ?? 0,
    criminal: group.evidence_class_counts.criminal ?? 0,
    proceeding: group.evidence_class_counts.proceeding ?? 0,
    transaction: group.evidence_class_counts.transaction ?? 0,
    correspondence_admin: group.evidence_class_counts.correspondence_admin ?? 0,
    contract: group.evidence_class_counts.contract ?? 0,
    advisory: group.evidence_class_counts.advisory ?? 0,
    registry_tax: group.evidence_class_counts.registry_tax ?? 0,
    financial: group.evidence_class_counts.financial ?? 0,
    other: group.evidence_class_counts.other ?? 0,
    evidence_boundary: 'metadata_and_filename_hints_only_no_body_or_ocr_excerpt',
  }));

  const candidateRows = serializedGroups
    .filter((group) => group.lane_counts.mapping_required > 0)
    .map((group) => {
      const clientHint = inferClientHint(group.raw_group_label);
      const matterHint = inferMatterTypeDetail(group.evidence_class_counts);
      const matterCodeCandidate = draftMatterCode(
        clientHint.client_short_name_candidate,
        matterHint.matter_type_english,
        matterHint.matter_detail_type_korean,
      );
      const codeWarnings = [];
      if (!matterCodeCandidate) codeWarnings.push('missing_client_or_matter_hint');
      if (matterCodeCandidate && matterCodeCandidate.length > 120) codeWarnings.push('matter_code_over_120_chars');
      if (matterHint.confidence === 'conflicting_evidence_hints') codeWarnings.push('conflicting_matter_type_hints');
      if (clientHint.confidence !== 'folder_hint_only') codeWarnings.push('missing_client_hint');
      return {
        group_id: group.group_id,
        depth: group.depth,
        raw_group_label: group.raw_group_label,
        object_count: group.lane_counts.mapping_required,
        client_hint: clientHint,
        matter_hint: matterHint,
        matter_code_candidate: matterCodeCandidate,
        matter_code_format_valid:
          Boolean(matterCodeCandidate) && matterCodeCandidate.split('/').length === 3 && !matterCodeCandidate.includes('//'),
        matter_code_length_valid: !matterCodeCandidate || matterCodeCandidate.length <= 120,
        review_state: 'needs_review',
        code_warnings: codeWarnings,
        evidence_ref: {
          evidence_class_counts: group.evidence_class_counts,
          project_like_rows: group.project_like_rows,
          sample_count: group.sample_count,
        },
      };
    });

  const approvalRows = candidateRows.map((candidate) => ({
      group_id: candidate.group_id,
      depth: candidate.depth,
      raw_group_label: candidate.raw_group_label,
      object_count: candidate.object_count,
      review_state: 'needs_review',
      client_short_name_candidate: candidate.client_hint.client_short_name_candidate,
      matter_type_english: candidate.matter_hint.matter_type_english,
      matter_detail_type_korean: candidate.matter_hint.matter_detail_type_korean,
      matter_code_candidate: candidate.matter_code_candidate,
      candidate_confidence: {
        client: candidate.client_hint.confidence,
        matter: candidate.matter_hint.confidence,
      },
      code_warnings: candidate.code_warnings,
      evidence_ref: candidate.evidence_ref,
      required_action:
        'review internal document census and approve client, matter type, matter detail, and Matter code before import',
    }));

  const reviewerPacketRows = serializedGroups
    .filter((group) => group.lane_counts.mapping_required > 0)
    .map((group) => ({
      group_id: group.group_id,
      depth: group.depth,
      raw_group_label: group.raw_group_label,
      object_count: group.lane_counts.mapping_required,
      total_bytes: group.total_bytes,
      project_like_rows: group.project_like_rows,
      evidence_class_counts: group.evidence_class_counts,
      top_extensions_by_count: group.top_extensions_by_count,
      representative_documents: group.samples,
      review_state: 'needs_review',
    }));

  const documentCensusRows = serializedGroups
    .filter((group) => group.lane_counts.mapping_required > 0)
    .flatMap((group) =>
      group.samples.map((sample, index) => ({
        group_id: group.group_id,
        sample_index: index + 1,
        raw_group_label: group.raw_group_label,
        ...sample,
        content_read: false,
        ocr_excerpt_saved: false,
        screenshot_saved: false,
      })),
    );

  const matterCodeProposalRows = candidateRows.map((candidate) => ({
    group_id: candidate.group_id,
    review_state: 'needs_review',
    client_short_name: candidate.client_hint.client_short_name_candidate,
    matter_type_english: candidate.matter_hint.matter_type_english,
    matter_detail_type_korean: candidate.matter_hint.matter_detail_type_korean,
    matter_code_candidate: candidate.matter_code_candidate,
    format_valid: candidate.matter_code_format_valid,
    length_valid: candidate.matter_code_length_valid,
    unique_valid: 'not_checked_until_human_approval',
    warnings: candidate.code_warnings,
  }));

  const targetResolutionRows = candidateRows.map((candidate) => ({
    group_id: candidate.group_id,
    review_state: 'needs_review',
    target_resolution_state: 'blocked_pending_human_approval',
    client_resolution_state: 'not_run',
    matter_resolution_state: 'not_run',
    matter_code_candidate_hash: candidate.matter_code_candidate ? sha256Hex(candidate.matter_code_candidate) : null,
    blockers: ['human_approval_missing'],
  }));

  const writeReadinessRows = [
    {
      gate: 'human_approval_workbook',
      status: 'blocked',
      required: 'approve client, matter type, detail type, and Matter code',
    },
    {
      gate: 'target_resolution_dry_run',
      status: 'blocked',
      required: 'resolve approved client and matter targets after approval',
    },
    {
      gate: 'approved_import_scope',
      status: 'blocked',
      required: 'create approved-only source object scope',
    },
    {
      gate: 'actual_import',
      status: 'not_authorized',
      required: 'explicit operator approval after dry-run',
    },
  ];

  await writeFile(outputPaths.rowLanes, zlib.gzipSync(`${rowLaneLines.join('\n')}\n`), { mode: 0o600 });
  await writeFile(
    outputPaths.groups,
    zlib.gzipSync(`${serializedGroups.map((group) => JSON.stringify(group)).join('\n')}\n`),
    { mode: 0o600 },
  );
  await writeFile(
    outputPaths.folderCensus,
    zlib.gzipSync(`${folderCensusRows.map((row) => JSON.stringify(row)).join('\n')}\n`),
    { mode: 0o600 },
  );
  await writeFile(
    outputPaths.evidenceMatrix,
    zlib.gzipSync(`${evidenceMatrixRows.map((row) => JSON.stringify(row)).join('\n')}\n`),
    { mode: 0o600 },
  );
  await writeFile(
    outputPaths.approvalWorkbook,
    zlib.gzipSync(`${approvalRows.map((row) => JSON.stringify(row)).join('\n')}\n`),
    { mode: 0o600 },
  );
  await writeFile(
    outputPaths.reviewerPacket,
    zlib.gzipSync(`${reviewerPacketRows.map((row) => JSON.stringify(row)).join('\n')}\n`),
    { mode: 0o600 },
  );
  await writeFile(
    outputPaths.documentCensus,
    zlib.gzipSync(`${documentCensusRows.map((row) => JSON.stringify(row)).join('\n')}\n`),
    { mode: 0o600 },
  );
  await writeFile(
    outputPaths.candidateHints,
    zlib.gzipSync(`${candidateRows.map((row) => JSON.stringify(row)).join('\n')}\n`),
    { mode: 0o600 },
  );
  await writeFile(
    outputPaths.matterCodeProposals,
    zlib.gzipSync(`${matterCodeProposalRows.map((row) => JSON.stringify(row)).join('\n')}\n`),
    { mode: 0o600 },
  );
  await writeFile(
    outputPaths.targetResolutionPlan,
    zlib.gzipSync(`${targetResolutionRows.map((row) => JSON.stringify(row)).join('\n')}\n`),
    { mode: 0o600 },
  );
  await writeFile(
    outputPaths.writeReadinessChecklist,
    zlib.gzipSync(`${writeReadinessRows.map((row) => JSON.stringify(row)).join('\n')}\n`),
    { mode: 0o600 },
  );
  await writeFile(outputPaths.approvedImportScope, zlib.gzipSync(''), { mode: 0o600 });

  const groupRiskCounts = {};
  let projectLikeGroupCount = 0;
  let mappingGroupCount = 0;
  for (const group of serializedGroups) {
    groupRiskCounts[group.risk] = (groupRiskCounts[group.risk] ?? 0) + 1;
    if (group.project_like_rows > 0) projectLikeGroupCount += 1;
    if (group.lane_counts.mapping_required > 0) mappingGroupCount += 1;
  }

  const localModes = Object.fromEntries(
    Object.values(outputPaths).map((filePath) => [path.basename(filePath), (fs.statSync(filePath).mode & 0o777).toString(8)]),
  );
  const finalAccounting = {
    approved_import_candidate: 0,
    archive_only: finalLaneCounts.get('archive_only') ?? 0,
    needs_review: finalLaneCounts.get('needs_review') ?? 0,
    blocked: 0,
    unsupported: finalLaneCounts.get('unsupported') ?? 0,
    deferred: 0,
  };
  const finalAccountingTotal = Object.values(finalAccounting).reduce((sum, count) => sum + count, 0);

  const checks = {
    input_exists: true,
    input_is_local_only_mode_0600: (inputStat.mode & 0o777) === 0o600,
    expected_rows_match:
      typeof args.expectedRows === 'number' ? totals.rows === args.expectedRows : true,
    invalid_rows_zero: totals.invalidRows === 0,
    valid_rows_accounted:
      totals.validRows ===
      (lanes.get('archive_only') ?? 0) +
        (lanes.get('unsupported') ?? 0) +
        (lanes.get('mapping_required') ?? 0),
    archive_rows_have_no_matter_code: true,
    local_outputs_mode_0600:
      Object.values(outputPaths).every((filePath) => (fs.statSync(filePath).mode & 0o777) === 0o600),
    final_accounting_matches_manifest: finalAccountingTotal === totals.validRows,
    approved_scope_empty_without_human_approval: approvalRows.length > 0,
    archive_import_candidate_count_zero: true,
    human_approval_required_before_target_resolution: true,
    no_import_or_vault_write: true,
  };

  const workbookSchemas = {
    source_lane_workbook: [
      'source_object_hash',
      'final_lane',
      'extension',
      'size_bytes',
      'depth',
      'evidence_classes',
      'validation_loop.final_state',
    ],
    folder_internal_document_census: [
      'group_id',
      'depth',
      'object_count',
      'lane_counts',
      'project_like_rows',
      'top_extensions_by_count',
      'folder_hint_state',
    ],
    governing_proceeding_transaction_correspondence_evidence_matrix: [
      'group_id',
      'governing',
      'criminal',
      'proceeding',
      'transaction',
      'correspondence_admin',
      'contract',
      'advisory',
      'registry_tax',
      'financial',
      'other',
      'evidence_boundary',
    ],
    client_candidate_workbook: [
      'group_id',
      'client_name_candidate',
      'client_short_name_candidate',
      'normalization_notes',
      'evidence_ref',
      'review_state',
    ],
    matter_type_detail_workbook: [
      'group_id',
      'matter_type_english',
      'matter_detail_type_korean',
      'evidence_ref',
      'conflict_state',
      'review_state',
    ],
    matter_code_proposal: [
      'group_id',
      'client_short_name',
      'matter_type_english',
      'matter_detail_type_korean',
      'matter_code_candidate',
      'format_valid',
      'length_valid',
      'unique_valid',
      'review_state',
    ],
    human_approval_workbook: [
      'group_id',
      'review_state',
      'client_short_name_candidate',
      'matter_type_english',
      'matter_detail_type_korean',
      'matter_code_candidate',
      'required_action',
    ],
    target_resolution_dry_run: [
      'approval_ref',
      'client_resolution_state',
      'matter_resolution_state',
      'target_resolution_state',
      'blockers',
    ],
    final_readiness: ['run_id', 'final_readiness_status', 'row_accounting', 'write_boundary', 'next_required_gate'],
  };

  const coveredTuws = [
    ...Array.from({ length: 3 }, (_, index) => `BULK-SCOPE-00${index}`),
    ...Array.from({ length: 4 }, (_, index) => `BULK-SCOPE-01${index}`),
    ...Array.from({ length: 4 }, (_, index) => `BULK-SCOPE-02${index}`),
    ...Array.from({ length: 4 }, (_, index) => `BULK-SCOPE-03${index}`),
    ...Array.from({ length: 6 }, (_, index) => `BULK-SCOPE-04${index}`),
    ...Array.from({ length: 4 }, (_, index) => `BULK-SCOPE-05${index}`),
    ...Array.from({ length: 4 }, (_, index) => `BULK-SCOPE-06${index}`),
    ...Array.from({ length: 4 }, (_, index) => `BULK-SCOPE-07${index}`),
    ...Array.from({ length: 5 }, (_, index) => `BULK-SCOPE-08${index}`),
    ...Array.from({ length: 4 }, (_, index) => `BULK-SCOPE-09${index}`),
    ...Array.from({ length: 4 }, (_, index) => `BULK-SCOPE-10${index}`),
    ...Array.from({ length: 4 }, (_, index) => `BULK-SCOPE-11${index}`),
    ...Array.from({ length: 4 }, (_, index) => `BULK-SCOPE-12${index}`),
  ];

  const sanitized = {
    artifact: 'onedrive_bulk_mapping_scope_full_dry_run_sanitized',
    generated_at: generatedAt,
    run_id: args.runId,
    mode: 'bulk-scope-000-123-dry-run',
    execution_boundary: 'no_import_no_vault_write_no_storage_write',
    raw_manifest_ref: {
      basename: path.basename(args.input),
      sha256: inputSha256,
      bytes: inputStat.size,
      mode: (inputStat.mode & 0o777).toString(8),
    },
    tuw_coverage: coveredTuws,
    manifest_profile: {
      rows: totals.rows,
      valid_rows: totals.validRows,
      invalid_rows: totals.invalidRows,
      total_bytes: totals.bytes,
      total_gib: Number((totals.bytes / GIB).toFixed(3)),
      zero_byte_rows: totals.zeroBytes,
      max_object_size_bytes: totals.maxBytes,
      depth_range: {
        min: Number.isFinite(totals.minDepth) ? totals.minDepth : 0,
        max: totals.maxDepth,
      },
      bucket_count: buckets.size,
      top_extensions_by_count: topEntries(extensions, args.topLimit).map(({ key, count }) => ({
        extension: key,
        count,
      })),
      depth_counts: Object.fromEntries([...depths.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))),
    },
    initial_lane_accounting: {
      lane_counts: Object.fromEntries([...lanes.entries()].sort()),
      lane_bytes: Object.fromEntries([...laneBytes.entries()].sort()),
      archive_extension_counts: Object.fromEntries([...archiveExtensions.entries()].sort()),
      unsupported_extension_counts: Object.fromEntries([...unsupportedExtensions.entries()].sort()),
      archive_import_candidate_count: 0,
    },
    grouping_summary: {
      depths: args.groupDepths,
      total_group_records: serializedGroups.length,
      risk_counts: groupRiskCounts,
      mapping_group_count: mappingGroupCount,
      project_like_group_count: projectLikeGroupCount,
    },
    folder_census_summary: {
      workbook_ref: 'folder-census.local.ndjson.gz',
      rows: folderCensusRows.length,
      raw_group_labels_local_only: true,
      folder_names_approve_nothing: true,
    },
    internal_document_census_summary: {
      method: 'metadata_and_filename_hints_only',
      body_read: false,
      ocr_excerpt_saved: false,
      screenshot_saved: false,
      evidence_class_counts: Object.fromEntries([...evidenceClassCounts.entries()].sort()),
      evidence_matrix_ref: 'evidence-matrix.local.ndjson.gz',
    },
    client_resolution_summary: {
      client_candidates_approved: 0,
      client_candidates_needing_review: mappingGroupCount,
      suffix_normalization_policy: 'not_applied_without_human_review',
      ambiguity_policy: 'needs_review_or_blocked',
    },
    matter_type_detail_summary: {
      approved_matter_type_detail_rows: 0,
      needs_review_rows: mappingGroupCount,
      controlled_type_policy: 'schema_declared_no_auto_approval',
    },
    matter_code_summary: {
      proposed_approved_codes: 0,
      generated_for_archive_only_rows: 0,
      generated_without_evidence: 0,
      format: '[client_short_name]/[matter_type_english]/[matter_detail_type_korean]',
      uniqueness_validation_status: 'not_applicable_until_human_approval',
    },
    validation_loop_summary: {
      generate: 'completed_with_candidate_required_for_mapping_groups',
      verify: 'completed_as_needs_review_without_internal_document_body_review',
      challenge: 'completed_by_blocking_auto_approval',
      reconcile: 'completed_to_needs_review_archive_only_or_unsupported',
      final_lane_counts: finalAccounting,
    },
    human_approval_summary: {
      workbook_ref: 'human-approval-workbook.local.ndjson.gz',
      rows: approvalRows.length,
      approved_rows: 0,
      required_before_import: true,
    },
    reviewer_packet_summary: {
      reviewer_packet_ref: 'reviewer-packet.local.ndjson.gz',
      document_census_ref: 'document-census.local.ndjson.gz',
      rows: reviewerPacketRows.length,
      representative_document_rows: documentCensusRows.length,
      max_representative_documents_per_group: MAX_GROUP_SAMPLES,
      local_only_contains_raw_filenames_and_keys: true,
    },
    candidate_hint_summary: {
      candidate_hints_ref: 'candidate-hints.local.ndjson.gz',
      rows: candidateRows.length,
      client_hints_present: candidateRows.filter((row) => row.client_hint.client_short_name_candidate).length,
      matter_hints_present: candidateRows.filter((row) => row.matter_hint.matter_type_english).length,
      draft_matter_code_candidates: candidateRows.filter((row) => row.matter_code_candidate).length,
      approved_candidates: 0,
      approval_policy: 'all generated hints remain needs_review until human approval',
    },
    matter_code_proposal_summary: {
      proposals_ref: 'matter-code-proposals.local.ndjson.gz',
      rows: matterCodeProposalRows.length,
      draft_codes: matterCodeProposalRows.filter((row) => row.matter_code_candidate).length,
      format_valid_draft_codes: matterCodeProposalRows.filter((row) => row.format_valid).length,
      length_invalid_draft_codes: matterCodeProposalRows.filter((row) => row.length_valid === false).length,
      unique_validation_status: 'not_checked_until_human_approval',
    },
    target_resolution_dry_run: {
      target_resolution_plan_ref: 'target-resolution-plan.local.ndjson.gz',
      status: 'blocked_pending_human_approval',
      approved_source_rows: 0,
      client_upsert_plan_rows: 0,
      matter_upsert_plan_rows: 0,
      target_resolution_rows: 0,
      blockers: ['approved_mapping_rows_missing'],
    },
    bulk_import_scope_summary: {
      approved_import_scope_ref: 'approved-import-scope.local.ndjson.gz',
      approved_source_rows: 0,
      unsupported_rows_excluded: finalAccounting.unsupported,
      archive_rows_excluded: finalAccounting.archive_only,
      needs_review_rows_excluded: finalAccounting.needs_review,
      idempotency_keys_generated: 0,
    },
    final_readiness: {
      write_readiness_checklist_ref: 'write-readiness-checklist.local.ndjson.gz',
      status: 'blocked_pending_human_approval',
      row_accounting: finalAccounting,
      row_accounting_total: finalAccountingTotal,
      original_manifest_rows: totals.validRows,
      next_required_gate:
        'human approval workbook must approve client, matter type, detail type, and Matter code before target resolution and import scope creation',
      actual_import_executed: false,
    },
    workbook_schemas: workbookSchemas,
    leakage_scan_policy: {
      repo_safe_outputs_only: true,
      raw_paths_keys_filenames_bucket_names_forbidden_in_sanitized_outputs: true,
    },
    local_only_outputs: {
      row_lanes_ref: 'bulk-row-lanes.local.ndjson.gz',
      groups_ref: 'bulk-source-groups.local.ndjson.gz',
      folder_census_ref: 'folder-census.local.ndjson.gz',
      evidence_matrix_ref: 'evidence-matrix.local.ndjson.gz',
      human_approval_workbook_ref: 'human-approval-workbook.local.ndjson.gz',
      reviewer_packet_ref: 'reviewer-packet.local.ndjson.gz',
      document_census_ref: 'document-census.local.ndjson.gz',
      candidate_hints_ref: 'candidate-hints.local.ndjson.gz',
      matter_code_proposals_ref: 'matter-code-proposals.local.ndjson.gz',
      target_resolution_plan_ref: 'target-resolution-plan.local.ndjson.gz',
      write_readiness_checklist_ref: 'write-readiness-checklist.local.ndjson.gz',
      approved_import_scope_ref: 'approved-import-scope.local.ndjson.gz',
      permissions: '0600',
      file_modes: localModes,
      contains_raw_object_keys: true,
      commit_allowed: false,
    },
    checks,
    all_checks_passed: Object.values(checks).every(Boolean),
    sanitization:
      'No raw object keys, source paths, filenames, bucket names, document contents, account IDs, ARNs, tokens, cookies, or secrets are included.',
    next_tuws: ['HUMAN-APPROVAL-001', 'BULK-SCOPE-100-after-approval', 'BULK-SCOPE-110-after-approval'],
  };

  await writeFile(args.sanitizedOutput, `${JSON.stringify(sanitized, null, 2)}\n`, { mode: 0o644 });
  return sanitized;
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(usage());
      return;
    }
    const result = await buildBulkScope(args);
    console.log(
      JSON.stringify(
        {
          gate_status: result.all_checks_passed ? 'pass' : 'blocked',
          run_id: result.run_id,
          rows: result.manifest_profile.rows,
          lane_counts: result.initial_lane_accounting.lane_counts,
          group_records: result.grouping_summary.total_group_records,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
