import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { assertNoIdentifierPatterns } from './identifier-pattern.check.ts';

const defaultDatabaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

export interface EvaluationCaseInput {
  caseNo: string;
  sourceDocRef: string;
  caseType: string;
  queryText: string;
  expectedRefs: string[];
  deidentified: boolean;
  notes?: string | null;
}

interface QueryableClient {
  query(sql: string, params?: readonly unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
}

export interface LoadEvaluationCasesInput {
  client: QueryableClient;
  tenantId: string;
  directory: string;
}

export interface LoadEvaluationCasesResult {
  loaded: number;
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`evalset invalid ${field}`);
  }
  return value;
}

function parseCase(value: unknown): EvaluationCaseInput {
  if (!isRecord(value)) throw new Error('evalset case must be an object');
  const expectedRefs = value.expectedRefs;
  if (!Array.isArray(expectedRefs) || !expectedRefs.every((entry) => typeof entry === 'string')) {
    throw new Error('evalset expectedRefs must be an array of strings');
  }
  const parsed = {
    caseNo: assertString(value.caseNo, 'caseNo'),
    sourceDocRef: assertString(value.sourceDocRef, 'sourceDocRef'),
    caseType: assertString(value.caseType, 'caseType'),
    queryText: assertString(value.queryText, 'queryText'),
    expectedRefs,
    deidentified: value.deidentified === true,
    notes: typeof value.notes === 'string' ? value.notes : null,
  };
  if (!parsed.deidentified) throw new Error(`evalset case ${parsed.caseNo} is not deidentified`);
  assertNoIdentifierPatterns({
    caseNo: parsed.caseNo,
    sourceDocRef: parsed.sourceDocRef,
    caseType: parsed.caseType,
    queryText: parsed.queryText,
    expectedRefs: parsed.expectedRefs,
    notes: parsed.notes,
  });
  return parsed;
}

export function readEvaluationCases(directory: string): EvaluationCaseInput[] {
  const files = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .sort();
  return files.flatMap((file) => {
    const parsed = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')) as unknown;
    return (Array.isArray(parsed) ? parsed : [parsed]).map(parseCase);
  });
}

export async function loadEvaluationCases(
  input: LoadEvaluationCasesInput,
): Promise<LoadEvaluationCasesResult> {
  const cases = readEvaluationCases(input.directory);
  const warnings: string[] = [];
  if (cases.length < 100) {
    warnings.push(`evalset contains ${cases.length} cases; LAI-18 technical target is 100`);
  }

  await input.client.query('BEGIN');
  try {
    await input.client.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant_id',
      input.tenantId,
    ]);
    for (const item of cases) {
      await input.client.query(
        `
          INSERT INTO evaluation_cases (
            tenant_id, case_no, source_doc_ref, case_type, query_text,
            expected_refs, deidentified, notes, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, true, $7, now())
          ON CONFLICT (tenant_id, case_no)
          DO UPDATE SET
            source_doc_ref = EXCLUDED.source_doc_ref,
            case_type = EXCLUDED.case_type,
            query_text = EXCLUDED.query_text,
            expected_refs = EXCLUDED.expected_refs,
            deidentified = true,
            notes = EXCLUDED.notes,
            updated_at = now()
        `,
        [
          input.tenantId,
          item.caseNo,
          item.sourceDocRef,
          item.caseType,
          item.queryText,
          JSON.stringify(item.expectedRefs),
          item.notes,
        ],
      );
    }
    await input.client.query('COMMIT');
  } catch (error) {
    await input.client.query('ROLLBACK');
    throw error;
  }
  return { loaded: cases.length, warnings };
}

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const tenantId = argValue(args, '--tenant-id');
  const directory = argValue(args, '--dir') ?? 'tests/fixtures/evalset-v0';
  if (!tenantId) {
    console.error('usage: pnpm evalset:load -- --tenant-id <tenant_uuid> [--dir tests/fixtures/evalset-v0]');
    process.exit(2);
  }
  const client = new Client({ connectionString: defaultDatabaseUrl });
  await client.connect();
  try {
    const result = await loadEvaluationCases({ client, tenantId, directory });
    for (const warning of result.warnings) console.warn(warning);
    console.log(`evalset load completed: loaded=${result.loaded}`);
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith('load-evaluation-cases.ts')) {
  await main();
}
