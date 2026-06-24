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
const DEFAULT_TOP_LIMIT = 40;

export function parseArgs(argv) {
  const args = {
    topLimit: DEFAULT_TOP_LIMIT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      throw new Error(`unexpected argument: ${arg}`);
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (key === 'help') {
      args.help = true;
      continue;
    }
    if (!next || next.startsWith('--')) {
      throw new Error(`missing value for --${key}`);
    }
    index += 1;
    if (key === 'input') args.input = next;
    else if (key === 'sanitized-output') args.sanitizedOutput = next;
    else if (key === 'markdown-output') args.markdownOutput = next;
    else if (key === 'run-id') args.runId = next;
    else if (key === 'source-prefix') args.sourcePrefix = next;
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

export function usage() {
  return [
    'usage: node tools/migration/onedrive-profile-manifest.mjs --input <raw.ndjson.gz> --sanitized-output <out.json> [--markdown-output <out.md>] [--run-id <id>] [--source-prefix <prefix>]',
    '',
    'Reads the local raw object manifest and emits sanitized pilot candidate profiling only.',
  ].join('\n');
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

export function extensionOfKey(key) {
  const leaf = key.split('/').filter(Boolean).at(-1) ?? '';
  if (!leaf || !leaf.includes('.')) return '[no_ext]';
  if (leaf.startsWith('.') && leaf.indexOf('.', 1) === -1) return '[no_ext]';
  const ext = leaf.split('.').at(-1)?.trim().toLowerCase() ?? '';
  if (!ext || ext.length > 12 || /[\\/\s:]/.test(ext)) return '[other_or_long_ext]';
  return `.${ext}`;
}

export function sizeBucket(sizeBytes) {
  if (sizeBytes === 0) return 'zero_bytes';
  if (sizeBytes < MIB) return 'lt_1_mib';
  if (sizeBytes < 10 * MIB) return '1_to_10_mib';
  if (sizeBytes < 100 * MIB) return '10_to_100_mib';
  if (sizeBytes < GIB) return '100_mib_to_1_gib';
  return 'gte_1_gib';
}

function relativeKey(key, sourcePrefix) {
  if (sourcePrefix && key.startsWith(sourcePrefix)) {
    return key.slice(sourcePrefix.length);
  }
  const marker = '/source-tree/';
  const markerIndex = key.indexOf(marker);
  if (markerIndex !== -1) {
    return key.slice(markerIndex + marker.length);
  }
  return key;
}

function depthOfRelativeKey(value) {
  return value.split('/').filter(Boolean).length;
}

function groupToken(key, sourcePrefix) {
  const relative = relativeKey(key, sourcePrefix);
  const segments = relative.split('/').filter(Boolean);
  const groupSegments = segments.slice(0, Math.min(2, Math.max(1, segments.length - 1)));
  const groupRaw = groupSegments.join('/');
  const groupStable = groupRaw || '[root]';
  return {
    id: sha256Hex(groupStable).slice(0, 16),
    depth: segments.length,
    stableRawForHashOnly: groupStable,
  };
}

function createGroup(id) {
  return {
    id,
    count: 0,
    bytes: 0,
    zeroBytes: 0,
    over200MiB: 0,
    over1GiB: 0,
    maxBytes: 0,
    minDepth: Number.POSITIVE_INFINITY,
    maxDepth: 0,
    extensions: new Map(),
    sizeBuckets: new Map(),
  };
}

function classifyGroup(group) {
  const reasons = [];
  const gib = group.bytes / GIB;
  const zeroRatio = group.count > 0 ? group.zeroBytes / group.count : 0;
  const extensionDiversity = group.extensions.size;

  if (group.count < 1) reasons.push('empty_group');
  if (group.count > 10000) reasons.push('too_many_objects_for_pilot');
  if (gib > 50) reasons.push('too_large_for_pilot');
  if (group.over1GiB > 0) reasons.push('contains_gte_1_gib_objects');
  if (group.over200MiB > 20) reasons.push('many_objects_over_browser_upload_default');
  if (zeroRatio > 0.05) reasons.push('high_zero_byte_ratio');
  if (extensionDiversity > 40) reasons.push('high_extension_diversity');

  if (
    group.count >= 500 &&
    group.count <= 3000 &&
    gib >= 1 &&
    gib <= 10 &&
    group.over1GiB === 0 &&
    group.over200MiB <= 20 &&
    zeroRatio <= 0.02 &&
    extensionDiversity <= 25
  ) {
    return { risk: 'low_risk', reasons: ['pilot_sized_candidate'] };
  }

  if (reasons.length === 0 && group.count <= 10000 && gib <= 50) {
    return { risk: 'medium_risk', reasons: ['requires_mapping_and_owner_review'] };
  }

  return { risk: 'blocked', reasons };
}

function serializeGroup(group, classification, topLimit) {
  return {
    candidate_id: group.id,
    grouping_strategy: 'sha256(first_two_source_path_segments)',
    risk: classification.risk,
    risk_reasons: classification.reasons,
    object_count: group.count,
    total_bytes: group.bytes,
    total_gib: Number((group.bytes / GIB).toFixed(3)),
    zero_byte_object_count: group.zeroBytes,
    over_200_mib_object_count: group.over200MiB,
    over_1_gib_object_count: group.over1GiB,
    max_object_size_bytes: group.maxBytes,
    path_depth_range: {
      min: Number.isFinite(group.minDepth) ? group.minDepth : 0,
      max: group.maxDepth,
    },
    top_extensions_by_count: topEntries(group.extensions, Math.min(10, topLimit)).map(({ key, count }) => ({
      extension: key,
      count,
    })),
    size_bucket_counts: Object.fromEntries([...group.sizeBuckets.entries()].sort()),
  };
}

function sortCandidates(left, right) {
  const leftScore = Math.abs(left.total_gib - 5) + Math.abs(left.object_count - 1500) / 1000;
  const rightScore = Math.abs(right.total_gib - 5) + Math.abs(right.object_count - 1500) / 1000;
  return leftScore - rightScore || left.candidate_id.localeCompare(right.candidate_id);
}

export async function profileManifest(input) {
  const sourcePrefix = input.sourcePrefix ?? '';
  const topLimit = input.topLimit ?? DEFAULT_TOP_LIMIT;
  const totals = {
    objectCount: 0,
    bytes: 0,
    zeroBytes: 0,
    over200MiB: 0,
    over1GiB: 0,
    maxBytes: 0,
    minDepth: Number.POSITIVE_INFINITY,
    maxDepth: 0,
  };
  const extensions = new Map();
  const sizeBuckets = new Map();
  const depthBuckets = new Map();
  const groups = new Map();

  const stream = fs.createReadStream(input.inputPath).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const key = String(row.key ?? '');
    const size = Number(row.size ?? 0);
    if (!key || !Number.isSafeInteger(size) || size < 0) {
      throw new Error('raw manifest row has invalid key or size');
    }

    const ext = extensionOfKey(key);
    const bucket = sizeBucket(size);
    const groupInfo = groupToken(key, sourcePrefix);
    const group = groups.get(groupInfo.id) ?? createGroup(groupInfo.id);
    groups.set(groupInfo.id, group);

    totals.objectCount += 1;
    totals.bytes += size;
    totals.maxBytes = Math.max(totals.maxBytes, size);
    totals.minDepth = Math.min(totals.minDepth, groupInfo.depth);
    totals.maxDepth = Math.max(totals.maxDepth, groupInfo.depth);
    if (size === 0) totals.zeroBytes += 1;
    if (size > 200 * MIB) totals.over200MiB += 1;
    if (size >= GIB) totals.over1GiB += 1;
    addCounter(extensions, ext);
    addCounter(sizeBuckets, bucket);
    addCounter(depthBuckets, String(groupInfo.depth));

    group.count += 1;
    group.bytes += size;
    group.maxBytes = Math.max(group.maxBytes, size);
    group.minDepth = Math.min(group.minDepth, groupInfo.depth);
    group.maxDepth = Math.max(group.maxDepth, groupInfo.depth);
    if (size === 0) group.zeroBytes += 1;
    if (size > 200 * MIB) group.over200MiB += 1;
    if (size >= GIB) group.over1GiB += 1;
    addCounter(group.extensions, ext);
    addCounter(group.sizeBuckets, bucket);
  }

  const candidatesByRisk = {
    low_risk: [],
    medium_risk: [],
    blocked: [],
  };

  for (const group of groups.values()) {
    const classification = classifyGroup(group);
    candidatesByRisk[classification.risk].push(serializeGroup(group, classification, topLimit));
  }

  for (const candidates of Object.values(candidatesByRisk)) {
    candidates.sort(sortCandidates);
  }

  return {
    run_id: input.runId ?? 'unknown',
    generated_at: new Date().toISOString(),
    scope: 'sanitized OneDrive staging manifest profile for pilot Matter candidate selection',
    source: {
      manifest_kind: 'local_raw_manifest',
      raw_manifest_uploaded: false,
      raw_manifest_committed: false,
      source_prefix_kind: sourcePrefix ? 'provided_prefix' : 'auto_detect_source_tree',
    },
    totals: {
      object_count: totals.objectCount,
      total_bytes: totals.bytes,
      total_gib: Number((totals.bytes / GIB).toFixed(3)),
      zero_byte_object_count: totals.zeroBytes,
      over_200_mib_object_count: totals.over200MiB,
      over_1_gib_object_count: totals.over1GiB,
      max_object_size_bytes: totals.maxBytes,
      path_depth_range: {
        min: Number.isFinite(totals.minDepth) ? totals.minDepth : 0,
        max: totals.maxDepth,
      },
    },
    distribution: {
      size_bucket_counts: Object.fromEntries([...sizeBuckets.entries()].sort()),
      path_depth_counts: Object.fromEntries([...depthBuckets.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))),
      top_extensions_by_count: topEntries(extensions, topLimit).map(({ key, count }) => ({
        extension: key,
        count,
      })),
    },
    pilot_candidate_summary: {
      grouping_strategy: 'sha256(first_two_source_path_segments)',
      low_risk_count: candidatesByRisk.low_risk.length,
      medium_risk_count: candidatesByRisk.medium_risk.length,
      blocked_count: candidatesByRisk.blocked.length,
      low_risk: candidatesByRisk.low_risk.slice(0, topLimit),
      medium_risk: candidatesByRisk.medium_risk.slice(0, topLimit),
      blocked: candidatesByRisk.blocked.slice(0, topLimit),
    },
    required_next_mapping_fields: [
      'tenant_ref',
      'client_ref',
      'matter_ref',
      'folder_class',
      'retention_class',
      'legal_hold_flag',
      'owner_ref',
      'permission_source_ref',
      'ethical_wall_implication',
      'duplicate_policy',
      'rollback_owner_ref',
    ],
    not_claimed: [
      'Vault import',
      'OneDrive connected state',
      'Office open/save/sync',
      'source-of-truth cutover',
      'Gemma indexing',
    ],
    sanitization: 'No raw file names, raw local paths, customer path-bearing S3 keys, tenant identifiers, secrets, or document contents are included.',
  };
}

export function renderMarkdown(profile) {
  const lines = [
    '# OneDrive Pilot Candidate Summary',
    '',
    `Run ID: \`${profile.run_id}\``,
    `Generated: \`${profile.generated_at}\``,
    '',
    '## Totals',
    '',
    `- Objects: \`${profile.totals.object_count}\``,
    `- Size: \`${profile.totals.total_gib} GiB\``,
    `- Zero-byte objects: \`${profile.totals.zero_byte_object_count}\``,
    `- Objects over 200 MiB: \`${profile.totals.over_200_mib_object_count}\``,
    `- Objects at or over 1 GiB: \`${profile.totals.over_1_gib_object_count}\``,
    '',
    '## Candidate Counts',
    '',
    `- Low risk: \`${profile.pilot_candidate_summary.low_risk_count}\``,
    `- Medium risk: \`${profile.pilot_candidate_summary.medium_risk_count}\``,
    `- Blocked: \`${profile.pilot_candidate_summary.blocked_count}\``,
    '',
    '## Candidate Preview',
    '',
    '| Risk | Candidate ID | Objects | GiB | Reasons |',
    '|---|---:|---:|---:|---|',
  ];

  for (const risk of ['low_risk', 'medium_risk', 'blocked']) {
    for (const candidate of profile.pilot_candidate_summary[risk].slice(0, 10)) {
      lines.push(
        `| ${risk} | \`${candidate.candidate_id}\` | ${candidate.object_count} | ${candidate.total_gib} | ${candidate.risk_reasons.join(', ')} |`,
      );
    }
  }

  lines.push(
    '',
    '## Boundary',
    '',
    '- This is a sanitized candidate profile only.',
    '- No Vault import was executed.',
    '- No raw customer path, file name, object key, document content, or private tenant identifier is included.',
  );

  return `${lines.join('\n')}\n`;
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function writeText(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, { mode: 0o600 });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.input || !args.sanitizedOutput) {
    throw new Error('required options: --input and --sanitized-output');
  }

  const profile = await profileManifest({
    inputPath: args.input,
    runId: args.runId,
    sourcePrefix: args.sourcePrefix,
    topLimit: args.topLimit,
  });
  await writeJson(args.sanitizedOutput, profile);
  if (args.markdownOutput) {
    await writeText(args.markdownOutput, renderMarkdown(profile));
  }
  console.log(
    JSON.stringify({
      run_id: profile.run_id,
      object_count: profile.totals.object_count,
      total_gib: profile.totals.total_gib,
      low_risk_count: profile.pilot_candidate_summary.low_risk_count,
      medium_risk_count: profile.pilot_candidate_summary.medium_risk_count,
      blocked_count: profile.pilot_candidate_summary.blocked_count,
    }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
