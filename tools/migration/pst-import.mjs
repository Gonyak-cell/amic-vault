#!/usr/bin/env node
import crypto from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

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
    if (key === '--pst') args.pst = value;
    else if (key === '--eml-dir') args.emlDir = value;
    else if (key === '--extract-dir') args.extractDir = value;
    else if (key === '--plan-out') args.planOut = value;
    else if (key === '--receipt-out') args.receiptOut = value;
    else if (key === '--run-id') args.runId = value;
    else if (key === '--matter-code') args.matterCode = value;
    else if (key === '--readpst-bin') args.readpstBin = value;
    else throw new Error(`unknown argument: ${key}`);
  }
  return args;
}

export function usage() {
  return [
    'usage: node tools/migration/pst-import.mjs (--pst <archive.pst> --extract-dir <dir> | --eml-dir <dir>) --plan-out <local.ndjson> --receipt-out <sanitized.json> --matter-code <client/type/detail> [--dry-run]',
    '',
    'Builds an email import plan from readpst output or an already extracted EML directory.',
    'No Vault DB, storage, or email writes are performed.',
  ].join('\n');
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function matterCodeBlockers(matterCode) {
  if (!matterCode) return ['missing_matter_code'];
  const parts = String(matterCode).split('/');
  if (parts.length !== 3 || parts.some((part) => part.trim().length === 0)) {
    return ['invalid_matter_code_format'];
  }
  return [];
}

async function collectEmlFiles(root) {
  const entries = [];
  async function walk(current) {
    const children = await readdir(current, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const childPath = path.join(current, child.name);
      if (child.isDirectory()) {
        await walk(childPath);
      } else if (child.isFile() && child.name.toLowerCase().endsWith('.eml')) {
        entries.push(childPath);
      }
    }
  }
  await walk(root);
  return entries;
}

function parseHeaders(text) {
  const headers = {};
  let current = null;
  for (const line of text.split(/\r?\n/u)) {
    if (line === '') break;
    if (/^[ \t]/.test(line) && current) {
      headers[current] = `${headers[current]} ${line.trim()}`;
      continue;
    }
    const match = /^([^:]+):\s*(.*)$/u.exec(line);
    if (!match) continue;
    current = match[1].toLowerCase();
    headers[current] = match[2].trim();
  }
  return headers;
}

async function runReadpst({ pst, extractDir, readpstBin = 'readpst' }) {
  await mkdir(extractDir, { recursive: true });
  await new Promise((resolve, reject) => {
    const child = spawn(readpstBin, ['-r', '-e', '-o', extractDir, pst], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`readpst exited ${code}: ${stderr.trim()}`));
    });
  });
}

export async function buildPstImportPlan(input) {
  const blockers = matterCodeBlockers(input.matterCode);
  let sourceDir = input.emlDir ? path.resolve(input.emlDir) : null;
  if (input.pst) {
    if (!input.extractDir) throw new Error('--extract-dir is required with --pst');
    await runReadpst({
      pst: path.resolve(input.pst),
      extractDir: path.resolve(input.extractDir),
      readpstBin: input.readpstBin,
    });
    sourceDir = path.resolve(input.extractDir);
  }
  if (!sourceDir) throw new Error('--pst or --eml-dir is required');
  const sourceStat = await stat(sourceDir);
  if (!sourceStat.isDirectory()) throw new Error('EML source must be a directory');

  const files = await collectEmlFiles(sourceDir);
  const seen = new Set();
  const rows = [];
  const blockerCounts = new Map();
  let duplicateCount = 0;

  for (const filePath of files) {
    const bytes = await readFile(filePath);
    const hash = sha256Hex(bytes);
    const relativePath = path.relative(sourceDir, filePath).split(path.sep).join('/');
    const headers = parseHeaders(bytes.toString('utf8'));
    const rowBlockers = [...blockers];
    if (seen.has(hash)) {
      duplicateCount += 1;
      rowBlockers.push('duplicate_message_hash');
    }
    if (!headers['message-id']) rowBlockers.push('missing_message_id');
    if (!headers.subject) rowBlockers.push('missing_subject');
    for (const blocker of rowBlockers) {
      blockerCounts.set(blocker, (blockerCounts.get(blocker) ?? 0) + 1);
    }
    seen.add(hash);
    rows.push({
      source_lane: 'pst_email_import',
      source_message_hash: hash,
      source_path_hash: sha256Hex(relativePath),
      matter_code: input.matterCode ?? '',
      message_id_hash: headers['message-id'] ? sha256Hex(headers['message-id']) : null,
      subject_hash: headers.subject ? sha256Hex(headers.subject) : null,
      size_bytes: bytes.length,
      planned_action:
        rowBlockers.length === 0 ? 'import_via_email_service_raw_eml' : 'blocked_pending_mapping',
      blockers: rowBlockers,
      raw: {
        file_path: relativePath,
      },
    });
  }

  return {
    planRows: rows,
    receipt: {
      run_id: input.runId ?? 'unknown',
      generated_at: new Date().toISOString(),
      source_type: input.pst ? 'pst_readpst' : 'extracted_eml_directory',
      dry_run_only: true,
      db_writes: 0,
      storage_writes: 0,
      email_service_writes: 0,
      totals: {
        eml_count: files.length,
        unique_message_count: seen.size,
        duplicate_message_count: duplicateCount,
      },
      blocker_counts: Object.fromEntries([...blockerCounts.entries()].sort()),
      plan_sanitization:
        'Local plan contains raw relative EML paths for operator-only execution; sanitized receipt contains hashes/counts only.',
      not_claimed: [
        'Vault email import execution',
        'Outlook Graph acquisition',
        'PST live synchronization',
        'SharePoint/iManage/NetDocuments adapters',
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
  if (!args.planOut || !args.receiptOut || !args.matterCode) {
    throw new Error('--plan-out, --receipt-out, and --matter-code are required');
  }
  const result = await buildPstImportPlan(args);
  await writeNdjson(args.planOut, result.planRows);
  await writeJson(args.receiptOut, result.receipt);
  if (args.dryRun) {
    console.error('dry-run complete: no Vault DB, storage, or email writes performed');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
