'use client';

import type {
  AuditEventListDto,
  AuditExportQueryDto,
  AuditQueryDto,
  DocumentAuditEventListDto,
  DocumentAuditQueryDto,
  MatterAuditQueryDto,
} from '@amic-vault/shared';
import { apiFetch } from '../api-client';
import { apiBaseUrl } from '../config';

type AuditQueryInput = Partial<AuditQueryDto | AuditExportQueryDto>;
type DocumentAuditQueryInput = Partial<DocumentAuditQueryDto>;
type MatterAuditQueryInput = Partial<MatterAuditQueryDto>;

export interface AuditAnchorSummaryDto {
  anchorId: string;
  anchorDate: string;
  seqStart: string | null;
  seqEnd: string | null;
  eventCount: number;
  anchorHash: string;
  storageRecorded: boolean;
  createdAt: string;
}

export interface AuditAnchorStatusDto {
  status: 'missing' | 'verified' | 'mismatch';
  latest: AuditAnchorSummaryDto | null;
  items: AuditAnchorSummaryDto[];
  mismatchCount?: number;
}

function queryString(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const rendered = params.toString();
  return rendered ? `?${rendered}` : '';
}

export function listAuditEvents(query: AuditQueryInput): Promise<AuditEventListDto> {
  return apiFetch<AuditEventListDto>(`/audit-events${queryString(query)}`);
}

export function getAuditAnchorStatus(): Promise<AuditAnchorStatusDto> {
  return apiFetch<AuditAnchorStatusDto>('/audit-events/anchors');
}

export function listDocumentAuditEvents(
  documentId: string,
  query: DocumentAuditQueryInput = {},
): Promise<DocumentAuditEventListDto> {
  return apiFetch<DocumentAuditEventListDto>(
    `/documents/${encodeURIComponent(documentId)}/audit-events${queryString(query)}`,
  );
}

export function listMatterAuditEvents(
  matterId: string,
  query: MatterAuditQueryInput = {},
): Promise<AuditEventListDto> {
  return apiFetch<AuditEventListDto>(
    `/matters/${encodeURIComponent(matterId)}/audit-events${queryString(query)}`,
  );
}

export async function exportAuditEventsCsv(query: AuditQueryInput): Promise<string> {
  const response = await fetch(`${apiBaseUrl()}/audit-events/export.csv${queryString(query)}`, {
    cache: 'no-store',
    credentials: 'include',
  });
  if (!response.ok) throw new Error('AUDIT_EXPORT_FAILED');
  return response.text();
}
