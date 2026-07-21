'use client';

import type {
  AiSessionClaimsResponseDto,
  GraphEdgeType,
  GraphFactsResponseDto,
  GraphNeighborhoodResponseDto,
} from '@amic-vault/shared';
import {
  aiSessionClaimsResponseSchema,
  graphFactsResponseSchema,
  graphNeighborhoodResponseSchema,
} from '@amic-vault/shared';
import { apiFetch } from '../api-client';

export interface GraphFactsClientQuery {
  documentId?: string;
  limit?: number;
  matterId: string;
}

export interface GraphNeighborhoodClientQuery {
  cursor?: number;
  depth?: number;
  edgeTypes?: readonly GraphEdgeType[];
  limit?: number;
  nodeId: string;
}

type GraphQueryValue = number | readonly string[] | string | undefined;

function queryString(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query) as [string, GraphQueryValue][]) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(','));
      continue;
    }
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export async function listGraphFacts(
  query: GraphFactsClientQuery,
): Promise<GraphFactsResponseDto> {
  const response = await apiFetch<unknown>(`/graph/facts${queryString(query)}`);
  return graphFactsResponseSchema.parse(response);
}

export async function listGraphNeighborhood(
  query: GraphNeighborhoodClientQuery,
): Promise<GraphNeighborhoodResponseDto> {
  const response = await apiFetch<unknown>(`/graph/neighborhood${queryString(query)}`);
  return graphNeighborhoodResponseSchema.parse(response);
}

export async function getAiSessionClaims(
  sessionId: string,
): Promise<AiSessionClaimsResponseDto> {
  const response = await apiFetch<unknown>(`/ai/sessions/${encodeURIComponent(sessionId)}/claims`, {
    redirectOnAuthRequired: false,
  });
  return aiSessionClaimsResponseSchema.parse(response);
}
