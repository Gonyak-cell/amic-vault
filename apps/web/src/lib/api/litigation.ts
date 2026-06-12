import type {
  CreateLitigationEvidenceRequestDto,
  CreateLitigationFactRequestDto,
  CreateLitigationIssueRequestDto,
  CreateLitigationPleadingRequestDto,
  LitigationCaseMapQueryDto,
  LitigationCaseMapResponseDto,
  LitigationEvidenceDto,
  LitigationEvidenceListResponseDto,
  LitigationEvidenceQueryDto,
  LitigationFactDto,
  LitigationFactListResponseDto,
  LitigationFactQueryDto,
  LitigationIssueDto,
  LitigationIssueListResponseDto,
  LitigationIssueQueryDto,
  LitigationPleadingDto,
  LitigationPleadingListResponseDto,
  LitigationPleadingQueryDto,
} from '@amic-vault/shared';
import { apiFetch } from '../api-client';

type LitigationQuery =
  | Partial<LitigationEvidenceQueryDto>
  | Partial<LitigationFactQueryDto>
  | Partial<LitigationIssueQueryDto>
  | Partial<LitigationPleadingQueryDto>
  | Partial<LitigationCaseMapQueryDto>;

function queryString(query: LitigationQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function createLitigationEvidence(
  input: CreateLitigationEvidenceRequestDto,
): Promise<LitigationEvidenceDto> {
  return apiFetch<LitigationEvidenceDto>('/litigation/evidence', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listLitigationEvidence(
  query: LitigationEvidenceQueryDto,
): Promise<LitigationEvidenceListResponseDto> {
  return apiFetch<LitigationEvidenceListResponseDto>(
    `/litigation/evidence${queryString(query)}`,
  );
}

export function createLitigationFact(
  input: CreateLitigationFactRequestDto,
): Promise<LitigationFactDto> {
  return apiFetch<LitigationFactDto>('/litigation/facts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listLitigationFacts(
  query: LitigationFactQueryDto,
): Promise<LitigationFactListResponseDto> {
  return apiFetch<LitigationFactListResponseDto>(`/litigation/facts${queryString(query)}`);
}

export function createLitigationIssue(
  input: CreateLitigationIssueRequestDto,
): Promise<LitigationIssueDto> {
  return apiFetch<LitigationIssueDto>('/litigation/issues', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listLitigationIssues(
  query: LitigationIssueQueryDto,
): Promise<LitigationIssueListResponseDto> {
  return apiFetch<LitigationIssueListResponseDto>(`/litigation/issues${queryString(query)}`);
}

export function createLitigationPleading(
  input: CreateLitigationPleadingRequestDto,
): Promise<LitigationPleadingDto> {
  return apiFetch<LitigationPleadingDto>('/litigation/pleadings', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listLitigationPleadings(
  query: LitigationPleadingQueryDto,
): Promise<LitigationPleadingListResponseDto> {
  return apiFetch<LitigationPleadingListResponseDto>(
    `/litigation/pleadings${queryString(query)}`,
  );
}

export function loadLitigationCaseMap(
  query: LitigationCaseMapQueryDto,
): Promise<LitigationCaseMapResponseDto> {
  return apiFetch<LitigationCaseMapResponseDto>(
    `/litigation/case-map${queryString(query)}`,
  );
}
