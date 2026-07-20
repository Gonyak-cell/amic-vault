import type {
  CreateExternalAnswerRequestDto,
  CreateExternalLinkRequestDto,
  CreateExternalUserRequestDto,
  CreateExternalWorkspaceRequestDto,
  ExternalAccessManifestDto,
  ExternalAccessStatusResponseDto,
  ExternalDownloadTicketDto,
  ExternalLinkCreatedResponseDto,
  ExternalLinkDto,
  ExternalManagementWorkspaceListResponseDto,
  ExternalNdaAcceptanceDto,
  ExternalQaListResponseDto,
  ExternalQaMessageDto,
  ExternalUserDto,
  ExternalWorkspaceDto,
  ReviewExternalAnswerRequestDto,
} from '@amic-vault/shared';
import { apiFetch } from '../api-client';
import { apiBaseUrl } from '../config';

async function externalPortalFetch<T>(token: string, suffix: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}/external/access/${encodeURIComponent(token)}${suffix}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error('EXTERNAL_PORTAL_REQUEST_FAILED');
  }
  return (await response.json()) as T;
}

export function getExternalAccessStatus(token: string): Promise<ExternalAccessStatusResponseDto> {
  return externalPortalFetch<ExternalAccessStatusResponseDto>(token, '');
}

export function acceptExternalNda(token: string): Promise<ExternalNdaAcceptanceDto> {
  return externalPortalFetch<ExternalNdaAcceptanceDto>(token, '/nda', {
    method: 'POST',
    body: JSON.stringify({ accepted: true, ndaVersion: 'NDA-R11-V1' }),
  });
}

export function getExternalManifest(token: string): Promise<ExternalAccessManifestDto> {
  return externalPortalFetch<ExternalAccessManifestDto>(token, '/manifest');
}

export function getExternalDownloadTicket(token: string): Promise<ExternalDownloadTicketDto> {
  return externalPortalFetch<ExternalDownloadTicketDto>(token, '/download-ticket');
}

export function listExternalQa(token: string): Promise<ExternalQaListResponseDto> {
  return externalPortalFetch<ExternalQaListResponseDto>(token, '/qa');
}

export function createExternalQuestion(
  token: string,
  messageText: string,
): Promise<ExternalQaMessageDto> {
  return externalPortalFetch<ExternalQaMessageDto>(token, '/qa/questions', {
    method: 'POST',
    body: JSON.stringify({ messageText }),
  });
}

export function listExternalWorkspaces(
  matterId: string,
): Promise<ExternalManagementWorkspaceListResponseDto> {
  const query = new URLSearchParams({ matterId });
  return apiFetch<ExternalManagementWorkspaceListResponseDto>(`/external/workspaces?${query}`);
}

export function createExternalWorkspace(
  input: CreateExternalWorkspaceRequestDto,
): Promise<ExternalWorkspaceDto> {
  return apiFetch<ExternalWorkspaceDto>('/external/workspaces', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createExternalUser(input: CreateExternalUserRequestDto): Promise<ExternalUserDto> {
  return apiFetch<ExternalUserDto>('/external/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createExternalLink(
  input: CreateExternalLinkRequestDto,
): Promise<ExternalLinkCreatedResponseDto> {
  return apiFetch<ExternalLinkCreatedResponseDto>('/external/links', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function revokeExternalLink(linkId: string): Promise<ExternalLinkDto> {
  return apiFetch<ExternalLinkDto>(`/external/links/${encodeURIComponent(linkId)}/revoke`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function listWorkspaceQa(workspaceId: string): Promise<ExternalQaListResponseDto> {
  return apiFetch<ExternalQaListResponseDto>(
    `/external/workspaces/${encodeURIComponent(workspaceId)}/qa`,
  );
}

export function createExternalAnswer(
  messageId: string,
  input: CreateExternalAnswerRequestDto,
): Promise<ExternalQaMessageDto> {
  return apiFetch<ExternalQaMessageDto>(
    `/external/qa/${encodeURIComponent(messageId)}/answers`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function reviewExternalAnswer(
  messageId: string,
  input: ReviewExternalAnswerRequestDto,
): Promise<ExternalQaMessageDto> {
  return apiFetch<ExternalQaMessageDto>(
    `/external/qa/${encodeURIComponent(messageId)}/review`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}
