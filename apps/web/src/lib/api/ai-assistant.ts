'use client';

import type {
  AiFeedbackRequestDto,
  AiFeedbackResponseDto,
  AiSessionDetailDto,
  AiSummaryRequestDto,
  AiSummaryResponseDto,
} from '@amic-vault/shared';
import {
  aiFeedbackRequestSchema,
  aiFeedbackResponseSchema,
  aiSessionDetailSchema,
  aiSummaryRequestSchema,
  aiSummaryResponseSchema,
} from '@amic-vault/shared';
import { ApiClientError, apiFetch } from '../api-client';

export interface MatterQuestionInput {
  matterId: string;
  query: string;
  maxChunks?: number;
  locale?: 'ko-KR' | 'en-US';
}

export interface DocumentClauseRiskAnalysisInput {
  documentId: string;
  matterId: string;
  maxChunks?: number;
  query?: string;
  locale?: 'ko-KR' | 'en-US';
}

export interface DocumentEmailThreadSummaryInput {
  documentId: string;
  matterId: string;
  maxChunks?: number;
  query?: string;
  locale?: 'ko-KR' | 'en-US';
}

export function aiAssistantErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError && error.code === 'AI_POLICY_BLOCKED') {
    return 'AI 정책상 이 질문은 처리할 수 없습니다.';
  }
  if (error instanceof ApiClientError && error.code === 'PERMISSION_DENIED') {
    return '질의 권한을 확인할 수 없습니다.';
  }
  return 'AI 질의 상태를 확인할 수 없습니다.';
}

export async function askMatterQuestion(input: MatterQuestionInput): Promise<AiSummaryResponseDto> {
  const body: AiSummaryRequestDto = aiSummaryRequestSchema.parse({
    matterId: input.matterId,
    task: 'matter_qa',
    query: input.query,
    filters: { matterId: input.matterId },
    maxChunks: input.maxChunks ?? 8,
    locale: input.locale ?? 'ko-KR',
  });
  const response = await apiFetch<unknown>('/ai/summaries', {
    method: 'POST',
    redirectOnAuthRequired: false,
    body: JSON.stringify(body),
  });
  return aiSummaryResponseSchema.parse(response);
}

export async function analyzeDocumentClauseRisks(
  input: DocumentClauseRiskAnalysisInput,
): Promise<AiSummaryResponseDto> {
  const body: AiSummaryRequestDto = aiSummaryRequestSchema.parse({
    matterId: input.matterId,
    task: 'clause_analysis',
    query: input.query ?? '조항 리스크 분석',
    targetDocumentId: input.documentId,
    filters: { matterId: input.matterId },
    maxChunks: input.maxChunks ?? 6,
    locale: input.locale ?? 'ko-KR',
  });
  const response = await apiFetch<unknown>('/ai/summaries', {
    method: 'POST',
    redirectOnAuthRequired: false,
    body: JSON.stringify(body),
  });
  return aiSummaryResponseSchema.parse(response);
}

export async function summarizeEmailThread(
  input: DocumentEmailThreadSummaryInput,
): Promise<AiSummaryResponseDto> {
  const body: AiSummaryRequestDto = aiSummaryRequestSchema.parse({
    matterId: input.matterId,
    task: 'email_thread_summary',
    query: input.query ?? '이메일 쓰레드 요청사항과 기한 요약',
    targetDocumentId: input.documentId,
    filters: { matterId: input.matterId },
    maxChunks: input.maxChunks ?? 6,
    locale: input.locale ?? 'ko-KR',
  });
  const response = await apiFetch<unknown>('/ai/summaries', {
    method: 'POST',
    redirectOnAuthRequired: false,
    body: JSON.stringify(body),
  });
  return aiSummaryResponseSchema.parse(response);
}

export async function getAiAssistantSession(sessionId: string): Promise<AiSessionDetailDto> {
  const response = await apiFetch<unknown>(`/ai/sessions/${encodeURIComponent(sessionId)}`, {
    redirectOnAuthRequired: false,
  });
  return aiSessionDetailSchema.parse(response);
}

export async function recordAiAssistantFeedback(
  input: AiFeedbackRequestDto,
): Promise<AiFeedbackResponseDto> {
  const body = aiFeedbackRequestSchema.parse(input);
  const response = await apiFetch<unknown>('/ai/feedback', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return aiFeedbackResponseSchema.parse(response);
}
