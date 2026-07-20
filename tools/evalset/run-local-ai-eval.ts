#!/usr/bin/env node
import { collectLocalAiEval, type SummaryEvaluator } from './local-ai-eval.ts';

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertStringField(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`local AI eval invalid ${field}`);
  }
  return value;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function claimTextsFromClaimsResponse(value: unknown): string[] {
  if (!isRecord(value)) throw new Error('local AI eval invalid claims response');
  return records(value.claims).map((claim) => assertStringField(claim.claimText, 'claimText'));
}

function citationDocumentIdsFromClaimsResponse(value: unknown): string[] {
  if (!isRecord(value)) throw new Error('local AI eval invalid claims response');
  const ids = new Set<string>();
  for (const claim of records(value.claims)) {
    for (const citation of records(claim.citations)) {
      ids.add(assertStringField(citation.documentId, 'citation.documentId'));
    }
  }
  return [...ids].sort();
}

async function readJson(response: Response, context: string): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`local AI eval ${context} failed: ${response.status}`);
  }
  return response.json() as Promise<unknown>;
}

function createHttpSummaryEvaluator(input: {
  baseUrl: string;
  sessionCookie: string;
}): SummaryEvaluator {
  const baseUrl = input.baseUrl.replace(/\/+$/u, '');
  return async (item) => {
    const summary = await readJson(
      await fetch(`${baseUrl}/v1/ai/summaries`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: input.sessionCookie,
        },
        body: JSON.stringify({
          matterId: item.matterId,
          task: 'matter_qa',
          query: item.queryText,
          maxChunks: 12,
          locale: 'ko-KR',
        }),
      }),
      `summary POST for ${item.caseNo}`,
    );
    if (!isRecord(summary)) throw new Error('local AI eval invalid summary response');
    const sessionId = assertStringField(summary.sessionId, 'summary.sessionId');
    const claims = await readJson(
      await fetch(`${baseUrl}/v1/ai/sessions/${encodeURIComponent(sessionId)}/claims`, {
        headers: {
          cookie: input.sessionCookie,
        },
      }),
      `claims GET for ${item.caseNo}`,
    );
    return {
      claimTexts: claimTextsFromClaimsResponse(claims),
      citationDocumentIds: citationDocumentIdsFromClaimsResponse(claims),
    };
  };
}

const args = process.argv.slice(2);
const tenantId = argValue(args, '--tenant-id');
const matterId = argValue(args, '--matter-id');
const baseUrl = argValue(args, '--base-url') ?? process.env.EVAL_AI_BASE_URL;
const sessionCookie = argValue(args, '--session-cookie') ?? process.env.EVAL_AI_SESSION_COOKIE;
if (!tenantId) {
  console.error(
    [
      'usage: pnpm eval:local-ai -- --tenant-id <tenant_uuid>',
      '[--matter-id <matter_uuid> --base-url <api_base_url> --session-cookie <cookie>]',
    ].join(' '),
  );
  process.exit(2);
}

const liveArgCount = [matterId, baseUrl, sessionCookie].filter(Boolean).length;
if (liveArgCount > 0 && liveArgCount < 3) {
  console.error(
    'usage: live golden eval requires --matter-id, --base-url, and --session-cookie together',
  );
  process.exit(2);
}

const report = await collectLocalAiEval({
  tenantId,
  ...(matterId && baseUrl && sessionCookie
    ? {
        matterId,
        evaluateSummary: createHttpSummaryEvaluator({ baseUrl, sessionCookie }),
      }
    : {}),
});
console.log(
  JSON.stringify(
    {
      ...report,
      citationAccuracyPercent: formatPercent(report.citationAccuracy),
      claimRecallPercent: formatPercent(report.claimRecall),
      claimPrecisionPercent: formatPercent(report.claimPrecision),
      citationDocumentMatchPercent: formatPercent(report.citationDocumentJaccard),
      unsupportedClaimRatePercent: formatPercent(report.unsupportedClaimRate),
      fallbackRatePercent: formatPercent(report.fallbackRate),
      rejectedRatePercent: formatPercent(report.rejectedRate),
    },
    null,
    2,
  ),
);

if (!report.technicalPass) process.exit(1);
