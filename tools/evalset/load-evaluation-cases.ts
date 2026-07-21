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
  expectedAnswerFacts: string[];
  expectedCitationDocumentIds: string[];
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

function assertStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new Error(`evalset ${field} must be an array of strings`);
  }
  return value;
}

function optionalStringArray(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  return assertStringArray(value, field);
}

function assertUuidArray(value: unknown, field: string): string[] {
  const entries = optionalStringArray(value, field);
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
  if (!entries.every((entry) => uuidPattern.test(entry))) {
    throw new Error(`evalset ${field} must be an array of uuid strings`);
  }
  return entries.map((entry) => entry.toLowerCase());
}

function parseCase(value: unknown): EvaluationCaseInput {
  if (!isRecord(value)) throw new Error('evalset case must be an object');
  const expectedRefs = assertStringArray(value.expectedRefs, 'expectedRefs');
  const expectedAnswerFacts = optionalStringArray(value.expectedAnswerFacts, 'expectedAnswerFacts');
  const expectedCitationDocumentIds = assertUuidArray(
    value.expectedCitationDocumentIds,
    'expectedCitationDocumentIds',
  );
  const parsed = {
    caseNo: assertString(value.caseNo, 'caseNo'),
    sourceDocRef: assertString(value.sourceDocRef, 'sourceDocRef'),
    caseType: assertString(value.caseType, 'caseType'),
    queryText: assertString(value.queryText, 'queryText'),
    expectedRefs,
    expectedAnswerFacts,
    expectedCitationDocumentIds,
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
    expectedAnswerFacts: parsed.expectedAnswerFacts,
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
            expected_refs, expected_answer_facts, expected_citation_document_ids,
            deidentified, notes, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::uuid[], true, $9, now())
          ON CONFLICT (tenant_id, case_no)
          DO UPDATE SET
            source_doc_ref = EXCLUDED.source_doc_ref,
            case_type = EXCLUDED.case_type,
            query_text = EXCLUDED.query_text,
            expected_refs = EXCLUDED.expected_refs,
            expected_answer_facts = EXCLUDED.expected_answer_facts,
            expected_citation_document_ids = EXCLUDED.expected_citation_document_ids,
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
          JSON.stringify(item.expectedAnswerFacts),
          item.expectedCitationDocumentIds,
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
