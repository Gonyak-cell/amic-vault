import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';

import {
  buildBulkScope,
  classifyEvidence,
  classifyLane,
  extensionOfKey,
  inferClientHint,
  inferMatterTypeDetail,
  parseArgs,
  relativeKey,
} from './onedrive-bulk-scope.mjs';

test('classifies archive segments with Unicode normalization', () => {
  const archiveSegments = new Set(['999_이전 자료들'.normalize('NFC').toLowerCase()]);
  const decomposed = '999_이전 자료들'.normalize('NFD');
  assert.equal(
    classifyLane({
      segments: ['AMIC - 1. AMIC', decomposed, 'matter', 'file.pdf'],
      extension: '.pdf',
      archiveSegments,
    }),
    'archive_only',
  );
});

test('extracts relative source-tree keys and safe extensions', () => {
  assert.equal(relativeKey('runs/x/source-tree/A/B/file.PDF'), 'A/B/file.PDF');
  assert.equal(extensionOfKey('runs/x/source-tree/A/B/file.PDF'), '.pdf');
  assert.equal(extensionOfKey('runs/x/source-tree/A/B/no-extension'), '[no_ext]');
});

test('uses approved English matter type categories', () => {
  assert.deepEqual(classifyEvidence('A/B/형사 고소장.pdf'), ['criminal', 'proceeding']);
  assert.equal(inferMatterTypeDetail({ criminal: 1 }).matter_type_english, 'Criminal');
  assert.equal(inferMatterTypeDetail({ proceeding: 1 }).matter_type_english, 'Civil');
  assert.equal(inferMatterTypeDetail({ transaction: 1 }).matter_type_english, 'M&A');
  assert.equal(inferMatterTypeDetail({ advisory: 1 }).matter_type_english, 'Advisory');
});

test('does not treat source category folders as clients', () => {
  assert.equal(inferClientHint('5. 기업 인수&합병').client_short_name_candidate, null);
  assert.equal(inferClientHint('5. 기업 인수&합병/01_벨로크').client_short_name_candidate, '벨로크');
  assert.equal(inferClientHint('5. 기업 인수&합병/09_Pjt. Lion').client_short_name_candidate, '롯데에코월');
  assert.equal(inferClientHint('098_양식/계약서').client_short_name_candidate, null);
  assert.equal(
    inferClientHint('5. 기업 인수&합병/17_Pjt. Washington/03_검토').client_short_name_candidate,
    '더블유더블유지미래혁신사모투자',
  );
  assert.equal(
    inferClientHint('5. 기업 인수&합병/17_Pjt. Washington/Pjt_Washington_SPA_v0.5_점검메모_260529.docx')
      .client_short_name_candidate,
    '더블유더블유지미래혁신사모투자',
  );
  assert.equal(
    inferClientHint('5. 기업 인수&합병/98_References/HORIZON - Midterm Report v2 - 260508.pdf')
      .client_short_name_candidate,
    null,
  );
  assert.equal(inferClientHint('5. 기업 인수&합병/17_세탁').client_short_name_candidate, null);
  assert.equal(inferClientHint('2. 형사/5. 형사고소_장영준').client_short_name_candidate, null);
  assert.equal(inferClientHint('4. 기업 자문/KWM 조세불복').client_short_name_candidate, null);
  assert.equal(inferClientHint('4. 기업 자문/그래비티 유권해석').client_short_name_candidate, null);
  assert.equal(inferClientHint('1. 민사/2025가단11808 성현석 v. 신내종합주류').client_short_name_candidate, null);
  assert.equal(inferClientHint('1. 민사/명륜당 v. 민선종합주류').client_short_name_candidate, null);
  assert.equal(inferClientHint('1. 민사/풍무역세권개발사업 관련').client_short_name_candidate, null);
  assert.equal(
    inferClientHint('5. 기업 인수&합병/03_Pjt. London').client_short_name_candidate,
    '더블유더블유지미래혁신사모투자',
  );
  assert.equal(inferClientHint('5. 기업 인수&합병/02_Project Fausta').client_short_name_candidate, '봉경환 이익중');
  assert.equal(inferClientHint('5. 기업 인수&합병/16_Pjt. El Paso').client_short_name_candidate, '이엠엘');
  assert.equal(inferClientHint('1. 민사/Project Equity').client_short_name_candidate, '이은주');
  assert.equal(inferClientHint('1. 민사/Project Kingston_dispute').client_short_name_candidate, '이로투자조합1호');
  assert.equal(inferClientHint('5. 기업 인수&합병/20_Project Horizon').client_short_name_candidate, '유진이엔티');
  assert.equal(inferClientHint('5. 기업 인수&합병/04_Pjt. Next').client_short_name_candidate, '최재헌 외 2인');
  assert.equal(
    inferClientHint('5. 기업 인수&합병/12_Pjt. Switch').client_short_name_candidate,
    '성진종합전기',
  );
  assert.equal(inferClientHint('5. 기업 인수&합병/12_Pjt. Switch').confidence, 'human_corrected_candidate');
  assert.equal(inferClientHint('3. 행정/명의신탁 환원 프로젝트').client_short_name_candidate, '진형건설');
  assert.equal(inferClientHint('5. 기업 인수&합병/11_Pjt. Spicy').client_short_name_candidate, null);
  assert.equal(inferClientHint('2. 형사/오영석 (세웅)').client_short_name_candidate, '오영석');
  assert.equal(inferClientHint('2. 형사/김홍현(탈세제보)').client_short_name_candidate, '김홍현');
  assert.equal(inferClientHint('1. 민사/송수연 선생님').client_short_name_candidate, '송수연');
  assert.equal(inferClientHint('1. 민사/황진수 교수님(1세대 2주택)').client_short_name_candidate, '황진수');
  assert.equal(inferClientHint('4. 기업 자문/황효건 (세무법인 선율)').client_short_name_candidate, '황효건');
  assert.equal(inferClientHint('2. 형사/장정도PD').client_short_name_candidate, '장정도');
  assert.equal(inferClientHint('2. 형사/임인홍 회장님').client_short_name_candidate, '임인홍');
  assert.equal(inferClientHint('4. 기업 자문/창천').client_short_name_candidate, '회계법인 창천');
  assert.equal(inferClientHint('2. 형사/한승민 원장님').client_short_name_candidate, '한승민');
  assert.equal(inferClientHint('4. 기업 자문/허유지 작가').client_short_name_candidate, '허유지');
  assert.equal(inferClientHint('1. 민사/최원준_이상현').client_short_name_candidate, '최원준');
  assert.equal(inferClientHint('1. 민사/최원준이상현').client_short_name_candidate, '최원준');
  assert.equal(inferClientHint('1. 민사/황미혜_김성우').client_short_name_candidate, '황미혜');
  assert.equal(inferClientHint('1. 민사/황미혜김성우').client_short_name_candidate, '황미혜');
  assert.equal(inferClientHint('4. 기업 자문/다스버스_박길홍').client_short_name_candidate, '다스버스');
  assert.equal(inferClientHint('4. 기업 자문/다스버스박길홍').client_short_name_candidate, '다스버스');
  assert.equal(inferClientHint('4. 기업 자문/다스버스 박길홍').client_short_name_candidate, '다스버스');
});

test('builds sanitized baseline without raw keys', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'amic-vault-bulk-scope-test-'));
  try {
    const input = path.join(dir, 'manifest-fixture.ndjson.gz');
    const sanitizedOutput = path.join(dir, 'summary.json');
    const localOutputDir = path.join(dir, 'local');
    const rows = [
      {
        bucket: 'private-bucket',
        key: 'migration/source-tree/ClientA/MatterA/file-one.pdf',
        size: 10,
      },
      {
        bucket: 'private-bucket',
        key: 'migration/source-tree/ClientA/999_이전 자료들/archive-one.pdf',
        size: 20,
      },
      {
        bucket: 'private-bucket',
        key: 'migration/source-tree/ClientB/MatterB/audio.m4a',
        size: 30,
      },
    ];
    await writeFile(input, zlib.gzipSync(`${rows.map((row) => JSON.stringify(row)).join('\n')}\n`), {
      mode: 0o600,
    });

    const result = await buildBulkScope({
      input,
      runId: 'test-run',
      sanitizedOutput,
      localOutputDir,
      expectedRows: 3,
      archiveSegments: ['999_이전 자료들'],
      groupDepths: [1, 2, 3],
      topLimit: 10,
    });

    assert.equal(result.all_checks_passed, true);
    assert.deepEqual(result.initial_lane_accounting.lane_counts, {
      archive_only: 1,
      mapping_required: 1,
      unsupported: 1,
    });
    assert.equal(result.final_readiness.status, 'blocked_pending_human_approval');
    assert.deepEqual(result.final_readiness.row_accounting, {
      approved_import_candidate: 0,
      archive_only: 1,
      needs_review: 1,
      blocked: 0,
      unsupported: 1,
      deferred: 0,
    });
    assert.equal(result.tuw_coverage.at(-1), 'BULK-SCOPE-123');
    const sanitized = await readFile(sanitizedOutput, 'utf8');
    assert.equal(sanitized.includes('private-bucket'), false);
    assert.equal(sanitized.includes('file-one.pdf'), false);
    assert.equal(sanitized.includes('archive-one.pdf'), false);
    assert.equal(sanitized.includes('audio.m4a'), false);

    const rowLanePath = path.join(localOutputDir, 'bulk-row-lanes.local.ndjson.gz');
    const approvalPath = path.join(localOutputDir, 'human-approval-workbook.local.ndjson.gz');
    const approvedScopePath = path.join(localOutputDir, 'approved-import-scope.local.ndjson.gz');
    assert.equal((fs.statSync(rowLanePath).mode & 0o777).toString(8), '600');
    assert.equal((fs.statSync(approvalPath).mode & 0o777).toString(8), '600');
    assert.equal((fs.statSync(approvedScopePath).mode & 0o777).toString(8), '600');
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test('parses cli arguments', () => {
  const args = parseArgs([
    '--input',
    'raw.ndjson.gz',
    '--run-id',
    'run',
    '--sanitized-output',
    'out.json',
    '--local-output-dir',
    'local',
    '--expected-rows',
    '10',
  ]);
  assert.equal(args.input, 'raw.ndjson.gz');
  assert.equal(args.expectedRows, 10);
});
