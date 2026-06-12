import type {
  ContractClauseBankQueryDto,
  ContractClauseBankResponseDto,
  ContractProcessRequestDto,
  ContractProcessResponseDto,
  ContractRuleFindingsQueryDto,
  ContractRuleFindingsResponseDto,
  CreatePlaybookRuleRequestDto,
  PlaybookRuleResponseDto,
} from '@amic-vault/shared';
import { apiFetch } from '../api-client';

function queryString(query: Partial<ContractClauseBankQueryDto | ContractRuleFindingsQueryDto>): string {
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

export function listContractRuleFindings(
  query: ContractRuleFindingsQueryDto,
): Promise<ContractRuleFindingsResponseDto> {
  return apiFetch<ContractRuleFindingsResponseDto>(
    `/contract-intel/rule-findings${queryString(query)}`,
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
