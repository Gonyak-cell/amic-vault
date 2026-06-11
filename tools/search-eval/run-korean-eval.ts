#!/usr/bin/env node
import fs from 'node:fs';
import { Client } from 'pg';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

export interface KoreanEvalCase {
  id: string;
  query: string;
  positive: string[];
  negative: string[];
}

export interface MatchResult {
  expected: boolean;
  matched: boolean;
}

export interface KoreanEvalMetrics {
  cases: number;
  documents: number;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  trueNegative: number;
  precision: number;
  recall: number;
  falsePositiveRate: number;
}

interface EvalRow {
  expected: boolean;
  matched: boolean;
}

export function computeMetrics(results: MatchResult[], cases: number): KoreanEvalMetrics {
  const truePositive = results.filter((row) => row.expected && row.matched).length;
  const falsePositive = results.filter((row) => !row.expected && row.matched).length;
  const falseNegative = results.filter((row) => row.expected && !row.matched).length;
  const trueNegative = results.filter((row) => !row.expected && !row.matched).length;
  const precisionDenominator = truePositive + falsePositive;
  const recallDenominator = truePositive + falseNegative;
  const falsePositiveDenominator = falsePositive + trueNegative;
  return {
    cases,
    documents: results.length,
    truePositive,
    falsePositive,
    falseNegative,
    trueNegative,
    precision: precisionDenominator === 0 ? 0 : truePositive / precisionDenominator,
    recall: recallDenominator === 0 ? 0 : truePositive / recallDenominator,
    falsePositiveRate:
      falsePositiveDenominator === 0 ? 0 : falsePositive / falsePositiveDenominator,
  };
}

function loadCases(path = 'tests/fixtures/search/korean-legal-terms.json'): KoreanEvalCase[] {
  const parsed = JSON.parse(fs.readFileSync(path, 'utf8')) as KoreanEvalCase[];
  if (parsed.length !== 30) {
    throw new Error(`expected 30 Korean legal-term cases, got ${parsed.length}`);
  }
  return parsed;
}

export async function runKoreanEval(path?: string): Promise<KoreanEvalMetrics> {
  const cases = loadCases(path);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const results: MatchResult[] = [];
  try {
    await client.query(
      `
        CREATE TEMP TABLE korean_eval_docs (
          doc_id text PRIMARY KEY,
          expected boolean NOT NULL,
          body_text text NOT NULL
        )
      `,
    );
    for (const testCase of cases) {
      await client.query('TRUNCATE korean_eval_docs');
      const docs = [
        ...testCase.positive.map((body, index) => ({
          docId: `${testCase.id}-P${index + 1}`,
          expected: true,
          body,
        })),
        ...testCase.negative.map((body, index) => ({
          docId: `${testCase.id}-N${index + 1}`,
          expected: false,
          body,
        })),
      ];
      for (const doc of docs) {
        await client.query(
          'INSERT INTO korean_eval_docs (doc_id, expected, body_text) VALUES ($1, $2, $3)',
          [doc.docId, doc.expected, doc.body],
        );
      }
      const queryResult = await client.query<EvalRow>(
        `
          SELECT expected,
            to_tsvector('simple', body_text) @@ websearch_to_tsquery('simple', $1) AS matched
          FROM korean_eval_docs
          ORDER BY doc_id
        `,
        [testCase.query],
      );
      results.push(...queryResult.rows);
    }
    return computeMetrics(results, cases.length);
  } finally {
    await client.end();
  }
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.argv[2];
  const metrics = await runKoreanEval(path);
  console.log(
    JSON.stringify(
      {
        ...metrics,
        precisionPercent: formatPercent(metrics.precision),
        recallPercent: formatPercent(metrics.recall),
        falsePositiveRatePercent: formatPercent(metrics.falsePositiveRate),
      },
      null,
      2,
    ),
  );
}
