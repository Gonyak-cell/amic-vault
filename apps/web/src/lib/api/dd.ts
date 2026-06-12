import type {
  CreateDdDataRoomMappingRequestDto,
  CreateDdIssueRequestDto,
  CreateDdRfiRequestDto,
  CreateDdRiskRequestDto,
  DdDataRoomMappingDto,
  DdDataRoomMappingListResponseDto,
  DdDataRoomMappingQueryDto,
  DdIssueDto,
  DdIssueListResponseDto,
  DdIssueQueryDto,
  DdRfiDto,
  DdRfiListResponseDto,
  DdRfiQueryDto,
  DdRiskDto,
  DdRiskListResponseDto,
  DdRiskQueryDto,
  DdTraceabilityQueryDto,
  DdTraceabilityResponseDto,
} from '@amic-vault/shared';
import { apiFetch } from '../api-client';

type DdQuery =
  | Partial<DdRfiQueryDto>
  | Partial<DdDataRoomMappingQueryDto>
  | Partial<DdIssueQueryDto>
  | Partial<DdRiskQueryDto>
  | Partial<DdTraceabilityQueryDto>;

function queryString(query: DdQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function createDdRfi(input: CreateDdRfiRequestDto): Promise<DdRfiDto> {
  return apiFetch<DdRfiDto>('/dd/rfis', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listDdRfis(query: DdRfiQueryDto): Promise<DdRfiListResponseDto> {
  return apiFetch<DdRfiListResponseDto>(`/dd/rfis${queryString(query)}`);
}

export function createDdMapping(
  input: CreateDdDataRoomMappingRequestDto,
): Promise<DdDataRoomMappingDto> {
  return apiFetch<DdDataRoomMappingDto>('/dd/data-room-mappings', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listDdMappings(
  query: DdDataRoomMappingQueryDto,
): Promise<DdDataRoomMappingListResponseDto> {
  return apiFetch<DdDataRoomMappingListResponseDto>(
    `/dd/data-room-mappings${queryString(query)}`,
  );
}

export function createDdIssue(input: CreateDdIssueRequestDto): Promise<DdIssueDto> {
  return apiFetch<DdIssueDto>('/dd/issues', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listDdIssues(query: DdIssueQueryDto): Promise<DdIssueListResponseDto> {
  return apiFetch<DdIssueListResponseDto>(`/dd/issues${queryString(query)}`);
}

export function createDdRisk(input: CreateDdRiskRequestDto): Promise<DdRiskDto> {
  return apiFetch<DdRiskDto>('/dd/risks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listDdRisks(query: DdRiskQueryDto): Promise<DdRiskListResponseDto> {
  return apiFetch<DdRiskListResponseDto>(`/dd/risks${queryString(query)}`);
}

export function loadDdTraceability(
  query: DdTraceabilityQueryDto,
): Promise<DdTraceabilityResponseDto> {
  return apiFetch<DdTraceabilityResponseDto>(`/dd/traceability${queryString(query)}`);
}
