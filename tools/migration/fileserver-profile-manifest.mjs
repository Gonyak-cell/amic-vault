#!/usr/bin/env node
import crypto from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { validateImportScopeRow } from './onedrive-import-target-resolution.mjs';

const allowedMatterTypes = new Set(['Criminal', 'Civil', 'Advisory', 'M&A']);

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--help') {
      args.help = true;
      continue;
    }
    if (key === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    const value = argv[index + 1];
    if (!key.startsWith('--')) throw new Error(`unexpected argument: ${key}`);
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${key}`);
    index += 1;
    if (key === '--root') args.root = value;
    else if (key === '--manifest-out') args.manifestOut = value;
    else if (key === '--receipt-out') args.receiptOut = value;
    else if (key === '--run-id') args.runId = value;
    else throw new Error(`unknown argument: ${key}`);
  }
  return args;
}

export function usage() {
  return [
    'usage: node tools/migration/fileserver-profile-manifest.mjs --root <dir> --manifest-out <local.ndjson> --receipt-out <sanitized.json> [--run-id <id>] [--dry-run]',
    '',
    'Crawls a mounted file-server directory and emits a local import-scope manifest plus a sanitized receipt.',
    'No Vault DB, storage, or document writes are performed.',
  ].join('\n');
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function extensionOfPath(filePath) {
  const ext = path.extname(filePath).trim().toLowerCase();
  if (!ext) return '[no_ext]';
  if (ext.length > 13 || /[\\/\s:]/.test(ext)) return '[other_or_long_ext]';
  return ext;
}

function normalizeRelativePath(value) {
  return value.split(path.sep).join('/').normalize('NFC');
}

function matterParts(relativePath) {
  const segments = relativePath.split('/').filter(Boolean);
  return {
    clientShortName: segments[0] ?? '',
    matterTypeEnglish: segments[1] ?? '',
    matterDetailTypeKorean: segments[2] ?? '',
    matterCode:
      segments.length >= 3 ? `${segments[0]}/${segments[1]}/${segments[2]}` : '',
  };
}

async function collectFiles(root) {
  const entries = [];
  async function walk(current) {
    const children = await readdir(current, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const childPath = path.join(current, child.name);
      if (child.isDirectory()) {
        await walk(childPath);
      } else if (child.isFile()) {
        entries.push(childPath);
      }
    }
  }
  await walk(root);
  return entries;
}

export async function buildFileserverManifest(input) {
  const root = path.resolve(input.root);
  const rootStat = await stat(root);
  if (!rootStat.isDirectory()) throw new Error('--root must be a directory');

  const files = await collectFiles(root);
  const rows = [];
  const blockersByReason = new Map();
  const extensionCounts = new Map();
  let totalBytes = 0;
  let newestMtimeMs = 0;

  for (const filePath of files) {
    const fileStat = await stat(filePath);
    const relativePath = normalizeRelativePath(path.relative(root, filePath));
    const parts = matterParts(relativePath);
    const bytes = await readFile(filePath);
    const sourceObjectHash = sha256Hex(bytes);
    const groupId = sha256Hex(parts.matterCode || relativePath).slice(0, 16);
    const extension = extensionOfPath(relativePath);
    const row = {
      source_lane: 'fileserver_manifest',
      source_object_hash: sourceObjectHash,
      source_object_path_hash: sha256Hex(relativePath),
      group_id: groupId,
      matter_code: parts.matterCode,
      client_short_name: parts.clientShortName,
      matter_type_english: parts.matterTypeEnglish,
      matter_detail_type_korean: parts.matterDetailTypeKorean,
      size_bytes: fileStat.size,
      mtime_ms: Math.trunc(fileStat.mtimeMs),
      extension,
      readable: true,
      raw: {
        key: relativePath,
      },
    };
    const blockers = validateImportScopeRow(row);
    if (parts.matterTypeEnglish && !allowedMatterTypes.has(parts.matterTypeEnglish)) {
      blockers.push('unsupported_fileserver_matter_type_segment');
    }
    for (const blocker of blockers) {
      blockersByReason.set(blocker, (blockersByReason.get(blocker) ?? 0) + 1);
    }
    extensionCounts.set(extension, (extensionCounts.get(extension) ?? 0) + 1);
    totalBytes += fileStat.size;
    newestMtimeMs = Math.max(newestMtimeMs, fileStat.mtimeMs);
    rows.push({ ...row, blockers });
  }

  return {
    manifestRows: rows,
    receipt: {
      run_id: input.runId ?? 'unknown',
      generated_at: new Date().toISOString(),
      source_type: 'fileserver',
      dry_run_only: true,
      db_writes: 0,
      storage_writes: 0,
      totals: {
        file_count: rows.length,
        total_bytes: totalBytes,
        newest_mtime_ms: Math.trunc(newestMtimeMs),
      },
      blocker_counts: Object.fromEntries([...blockersByReason.entries()].sort()),
      extension_counts: Object.fromEntries([...extensionCounts.entries()].sort()),
      manifest_sanitization:
        'Local manifest contains raw relative paths for operator-only import execution; sanitized receipt contains hashes/counts only.',
      not_claimed: [
        'Vault write/import execution',
        'approved workbook generation',
        'source-of-truth cutover',
        'file server live synchronization',
      ],
    },
  };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function writeNdjson(filePath, rows) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', {
    mode: 0o600,
  });
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.root || !args.manifestOut || !args.receiptOut) {
    throw new Error('--root, --manifest-out, and --receipt-out are required');
  }
  const result = await buildFileserverManifest({
    root: args.root,
    runId: args.runId,
  });
  await writeNdjson(args.manifestOut, result.manifestRows);
  await writeJson(args.receiptOut, result.receipt);
  if (args.dryRun) {
    console.error('dry-run complete: no Vault DB or storage writes performed');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
