#!/usr/bin/env node
import {
  changedFiles,
  collectOperationalScanFiles,
  scanChangedFileAdditions,
  scanFiles,
} from './outlook-operational-policy.ts';

const args = process.argv.slice(2);
const repoRoot = process.cwd();
const mode = args.includes('--all') ? 'all' : 'changed';
const files = mode === 'all' ? collectOperationalScanFiles(repoRoot) : changedFiles(repoRoot);
const failures =
  mode === 'all' ? scanFiles(repoRoot, files) : scanChangedFileAdditions(repoRoot, files);
const report = {
  status: failures.length > 0 ? 'fail' : 'pass',
  mode,
  scannedFileCount: files.length,
  failures,
  sensitiveValuesPrinted: false,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exit(1);
