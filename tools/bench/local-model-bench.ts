import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readEvaluationCases, type EvaluationCaseInput } from '../evalset/load-evaluation-cases.ts';
import {
  findBenchCandidate,
  localModelBenchCandidates,
  type LocalModelBenchCandidate,
} from './local-model-candidates.ts';

export type BenchEndpointClass = 'loopback' | 'private_network' | 'blocked';
export type BenchRunStatus = 'completed' | 'blocked' | 'failed' | 'skipped';

export interface LocalBenchTransport {
  fetch(
    url: string,
    init: {
      method: 'GET' | 'POST';
      headers?: Record<string, string>;
      body?: string;
      signal?: AbortSignal;
    },
  ): Promise<{
    ok: boolean;
    status: number;
    json?: (() => Promise<unknown>) | undefined;
    text?: (() => Promise<string>) | undefined;
  }>;
}

export interface RunLocalModelBenchInput {
  enabled: boolean;
  endpoint: string;
  candidateIds: readonly string[];
  fixtureDir: string;
  outputDir?: string | undefined;
  timeoutMs?: number | undefined;
  transport?: LocalBenchTransport | undefined;
  now?: Date | undefined;
}

export interface LocalModelBenchRun {
  candidateId: string;
  ollamaModel: string;
  caseNo: string;
  status: BenchRunStatus;
  latencyMs: number | null;
  promptHash: string;
  responseHash: string | null;
  responseChars: number;
  promptEvalCount: number | null;
  evalCount: number | null;
  reasonCode: string | null;
}

export interface LocalModelBenchReport {
  generatedAt: string;
  status: 'disabled' | 'completed';
  endpointClass: BenchEndpointClass;
  outputPath: string | null;
  fixtureDir: string;
  caseCount: number;
  candidates: Array<{
    id: string;
    ollamaModel: string;
    workload: LocalModelBenchCandidate['workload'];
    role: LocalModelBenchCandidate['role'];
  }>;
  runs: LocalModelBenchRun[];
  warnings: string[];
}

interface OllamaGenerateResponse {
  model?: string;
  response?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
}

const defaultEndpoint = 'http://127.0.0.1:11434';
const defaultOutputDir = path.resolve('tools/bench/output');

export async function runLocalModelBench(
  input: RunLocalModelBenchInput,
): Promise<LocalModelBenchReport> {
  const endpointClass = classifyBenchEndpoint(input.endpoint);
  const candidates = selectCandidates(input.candidateIds);
  const cases = readEvaluationCases(input.fixtureDir);
  const generatedAt = (input.now ?? new Date()).toISOString();
  const warnings: string[] = [];
  if (cases.length < 20) warnings.push(`Bench fixture has ${cases.length} cases; operational target is 20-50.`);

  if (!input.enabled) {
    return {
      generatedAt,
      status: 'disabled',
      endpointClass,
      outputPath: null,
      fixtureDir: input.fixtureDir,
      caseCount: cases.length,
      candidates: reportCandidates(candidates),
      runs: [],
      warnings: ['AI_BENCH_HARNESS_ENABLED is not true; no local model calls were made.', ...warnings],
    };
  }
  if (endpointClass === 'blocked') {
    throw new Error('bench endpoint must be loopback or private network');
  }

  const outputDir = ensureBenchOutputDir(input.outputDir ?? defaultOutputDir);
  const transport = input.transport ?? defaultTransport();
  const runs: LocalModelBenchRun[] = [];
  for (const candidate of candidates.filter((item) => item.workload === 'generation')) {
    for (const benchCase of cases) {
      runs.push(
        await runCandidateCase({
          endpoint: input.endpoint,
          candidate,
          benchCase,
          timeoutMs: input.timeoutMs ?? 30_000,
          transport,
        }),
      );
    }
  }
  const report: LocalModelBenchReport = {
    generatedAt,
    status: 'completed',
    endpointClass,
    outputPath: null,
    fixtureDir: input.fixtureDir,
    caseCount: cases.length,
    candidates: reportCandidates(candidates),
    runs,
    warnings,
  };
  const outputPath = path.join(outputDir, `local-model-bench-${safeTimestamp(generatedAt)}.json`);
  report.outputPath = outputPath;
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

export function classifyBenchEndpoint(endpoint: string): BenchEndpointClass {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return 'blocked';
  }
  if (!['http:', 'https:'].includes(url.protocol)) return 'blocked';
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') {
    return 'loopback';
  }
  if (
    host === 'gemma' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.svc') ||
    isPrivateIpv4(host)
  ) {
    return 'private_network';
  }
  return 'blocked';
}

export function selectCandidates(ids: readonly string[]): LocalModelBenchCandidate[] {
  const requested = ids.length > 0 ? ids : ['gemma4-12b-baseline'];
  return requested.map((id) => {
    const candidate = findBenchCandidate(id);
    if (!candidate) throw new Error(`unknown bench candidate: ${id}`);
    return candidate;
  });
}

function reportCandidates(candidates: readonly LocalModelBenchCandidate[]): LocalModelBenchReport['candidates'] {
  return candidates.map((candidate) => ({
    id: candidate.id,
    ollamaModel: candidate.ollamaModel,
    workload: candidate.workload,
    role: candidate.role,
  }));
}

async function runCandidateCase(input: {
  endpoint: string;
  candidate: LocalModelBenchCandidate;
  benchCase: EvaluationCaseInput;
  timeoutMs: number;
  transport: LocalBenchTransport;
}): Promise<LocalModelBenchRun> {
  const prompt = compileBenchPrompt(input.benchCase);
  const promptHash = sha256(prompt);
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await input.transport.fetch(new URL('/api/generate', input.endpoint).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: input.candidate.ollamaModel,
        prompt,
        stream: false,
        format: 'json',
        options: { temperature: 0, num_predict: 512 },
      }),
    });
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      return blockedRun(input, promptHash, latencyMs, `ollama_http_${response.status}`);
    }
    const body = parseOllamaGenerateResponse(await safeJson(response));
    const generated = body.response ?? '';
    return {
      candidateId: input.candidate.id,
      ollamaModel: input.candidate.ollamaModel,
      caseNo: input.benchCase.caseNo,
      status: generated.length > 0 ? 'completed' : 'blocked',
      latencyMs,
      promptHash,
      responseHash: generated.length > 0 ? sha256(generated) : null,
      responseChars: generated.length,
      promptEvalCount: numberOrNull(body.prompt_eval_count),
      evalCount: numberOrNull(body.eval_count),
      reasonCode: generated.length > 0 ? null : 'empty_response',
    };
  } catch {
    return blockedRun(input, promptHash, Date.now() - started, 'generation_failed');
  } finally {
    clearTimeout(timeout);
  }
}

function blockedRun(
  input: {
    candidate: LocalModelBenchCandidate;
    benchCase: EvaluationCaseInput;
  },
  promptHash: string,
  latencyMs: number,
  reasonCode: string,
): LocalModelBenchRun {
  return {
    candidateId: input.candidate.id,
    ollamaModel: input.candidate.ollamaModel,
    caseNo: input.benchCase.caseNo,
    status: 'blocked',
    latencyMs,
    promptHash,
    responseHash: null,
    responseChars: 0,
    promptEvalCount: null,
    evalCount: null,
    reasonCode,
  };
}

function compileBenchPrompt(benchCase: EvaluationCaseInput): string {
  return [
    'AMIC Vault local-model benchmark.',
    'Use only this deidentified synthetic evaluation case.',
    'Return strict JSON: {"answer":"...", "source_refs":["..."], "warnings":[]}.',
    `case_no: ${benchCase.caseNo}`,
    `case_type: ${benchCase.caseType}`,
    `query: ${benchCase.queryText}`,
    `allowed_source_refs: ${benchCase.expectedRefs.join(', ')}`,
  ].join('\n');
}

function ensureBenchOutputDir(outputDir: string): string {
  const resolved = path.resolve(outputDir);
  const allowedRoot = path.resolve('tools/bench/output');
  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error('bench output must stay under tools/bench/output');
  }
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function defaultTransport(): LocalBenchTransport {
  return {
    async fetch(url, init) {
      const response = await fetch(url, init as RequestInit);
      return {
        ok: response.ok,
        status: response.status,
        json: () => response.json() as Promise<unknown>,
        text: () => response.text(),
      };
    },
  };
}

async function safeJson(response: {
  json?: (() => Promise<unknown>) | undefined;
  text?: (() => Promise<string>) | undefined;
}): Promise<unknown> {
  if (response.json) return response.json();
  if (response.text) return JSON.parse(await response.text());
  return {};
}

function parseOllamaGenerateResponse(value: unknown): OllamaGenerateResponse {
  return typeof value === 'object' && value !== null ? (value as OllamaGenerateResponse) : {};
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function safeTimestamp(value: string): string {
  return value.replace(/[:.]/g, '-');
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export const defaultLocalModelBenchEndpoint = defaultEndpoint;
export const allLocalModelBenchCandidates = localModelBenchCandidates;
