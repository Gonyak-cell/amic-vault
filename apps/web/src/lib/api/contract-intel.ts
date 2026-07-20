import type {
  ClauseBankEntryDto,
  ClauseBankEntryListResponseDto,
  ClauseBankEntryQueryDto,
  ClauseSearchRequestDto,
  ClauseSearchResponseDto,
  ContractAiReviewFindingDto,
  ContractAiReviewFindingListResponseDto,
  ContractAiReviewFindingQueryDto,
  ContractClauseBankQueryDto,
  ContractClauseBankResponseDto,
  ContractProcessRequestDto,
  ContractProcessResponseDto,
  ContractRuleFindingsQueryDto,
  ContractRuleFindingsResponseDto,
  CreateClauseBankEntryRequestDto,
  CreatePlaybookRuleRequestDto,
  NegotiationIssueDto,
  NegotiationIssueListResponseDto,
  NegotiationIssueQueryDto,
  PlaybookRuleResponseDto,
  UpdateClauseBankEntryRequestDto,
  UpdateNegotiationIssueStatusRequestDto,
  WordClauseInsertionRequestDto,
  WordClauseInsertionResponseDto,
} from '@amic-vault/shared';
import { apiFetch } from '../api-client';

function queryString(
  query: Partial<
    | ContractClauseBankQueryDto
    | ContractAiReviewFindingQueryDto
    | ContractRuleFindingsQueryDto
    | ClauseBankEntryQueryDto
    | NegotiationIssueQueryDto
  >,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function processContractDocument(
  input: ContractProcessRequestDto,
): Promise<ContractProcessResponseDto> {
  return apiFetch<ContractProcessResponseDto>('/contract-intel/process', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listContractClauseBank(
  query: ContractClauseBankQueryDto,
): Promise<ContractClauseBankResponseDto> {
  return apiFetch<ContractClauseBankResponseDto>(
    `/contract-intel/clause-bank${queryString(query)}`,
  );
}

export function createClauseBankEntry(
  input: CreateClauseBankEntryRequestDto,
): Promise<ClauseBankEntryDto> {
  return apiFetch<ClauseBankEntryDto>('/contract-intel/clause-bank/entries', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listClauseBankEntries(
  query: ClauseBankEntryQueryDto,
): Promise<ClauseBankEntryListResponseDto> {
  return apiFetch<ClauseBankEntryListResponseDto>(
    `/contract-intel/clause-bank/entries${queryString(query)}`,
  );
}

export function updateClauseBankEntry(
  entryId: string,
  input: UpdateClauseBankEntryRequestDto,
): Promise<ClauseBankEntryDto> {
  return apiFetch<ClauseBankEntryDto>(`/contract-intel/clause-bank/entries/${entryId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function searchSimilarClauses(
  input: ClauseSearchRequestDto,
): Promise<ClauseSearchResponseDto> {
  return apiFetch<ClauseSearchResponseDto>('/contract-intel/clause-search', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function prepareWordClauseInsertion(
  input: WordClauseInsertionRequestDto,
): Promise<WordClauseInsertionResponseDto> {
  return apiFetch<WordClauseInsertionResponseDto>('/contract-intel/word-addin/clause-insertions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listContractRuleFindings(
  query: ContractRuleFindingsQueryDto,
): Promise<ContractRuleFindingsResponseDto> {
  return apiFetch<ContractRuleFindingsResponseDto>(
    `/contract-intel/rule-findings${queryString(query)}`,
  );
}

export function listNegotiationIssues(
  query: NegotiationIssueQueryDto,
): Promise<NegotiationIssueListResponseDto> {
  return apiFetch<NegotiationIssueListResponseDto>(
    `/contract-intel/negotiation-issues${queryString(query)}`,
  );
}

export function listContractAiReviewFindings(
  query: ContractAiReviewFindingQueryDto,
): Promise<ContractAiReviewFindingListResponseDto> {
  return apiFetch<ContractAiReviewFindingListResponseDto>(
    `/contract-intel/ai-review-findings${queryString(query)}`,
  );
}

export function acceptContractAiReviewFinding(
  findingId: string,
): Promise<ContractAiReviewFindingDto> {
  return apiFetch<ContractAiReviewFindingDto>(
    `/contract-intel/ai-review-findings/${encodeURIComponent(findingId)}/accept`,
    {
      method: 'PATCH',
    },
  );
}

export function updateNegotiationIssueStatus(
  issueId: string,
  input: UpdateNegotiationIssueStatusRequestDto,
): Promise<NegotiationIssueDto> {
  return apiFetch<NegotiationIssueDto>(
    `/contract-intel/negotiation-issues/${encodeURIComponent(issueId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}

export function createContractPlaybookRule(
  input: CreatePlaybookRuleRequestDto,
): Promise<PlaybookRuleResponseDto> {
  return apiFetch<PlaybookRuleResponseDto>('/contract-intel/playbook-rules', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
