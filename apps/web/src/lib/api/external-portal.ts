import type {
  ExternalAccessManifestDto,
  ExternalAccessStatusResponseDto,
  ExternalDownloadTicketDto,
  ExternalNdaAcceptanceDto,
  ExternalQaListResponseDto,
  ExternalQaMessageDto,
} from '@amic-vault/shared';
import { apiBaseUrl } from '../config';

async function externalPortalFetch<T>(token: string, suffix: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}/external/access/${encodeURIComponent(token)}${suffix}`, {
    ...init,
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
