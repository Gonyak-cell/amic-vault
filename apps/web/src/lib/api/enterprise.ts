import type {
  CreateEnterpriseBackupSnapshotRequestDto,
  CreateEnterpriseComplianceEvidenceRequestDto,
  CreateEnterpriseKeyReferenceRequestDto,
  CreateEnterpriseSiemExportRequestDto,
  CreateEnterpriseSsoProviderRequestDto,
  EnterpriseBackupSnapshotDto,
  EnterpriseBackupSnapshotListResponseDto,
  EnterpriseComplianceEvidenceDto,
  EnterpriseComplianceEvidenceListResponseDto,
  EnterpriseKeyReferenceDto,
  EnterpriseKeyReferenceListResponseDto,
  EnterpriseReadinessSummaryDto,
  EnterpriseSiemExportDto,
  EnterpriseSiemExportListResponseDto,
  EnterpriseSsoProviderDto,
  EnterpriseSsoProviderListResponseDto,
  EnterpriseSsoSpMetadataDto,
} from '@amic-vault/shared';
import { apiFetch } from '../api-client';

export function createEnterpriseSsoProvider(
  input: CreateEnterpriseSsoProviderRequestDto,
): Promise<EnterpriseSsoProviderDto> {
  return apiFetch<EnterpriseSsoProviderDto>('/enterprise/sso-providers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listEnterpriseSsoProviders(): Promise<EnterpriseSsoProviderListResponseDto> {
  return apiFetch<EnterpriseSsoProviderListResponseDto>('/enterprise/sso-providers');
}

export function activateEnterpriseSsoProvider(
  providerId: string,
): Promise<EnterpriseSsoProviderDto> {
  return apiFetch<EnterpriseSsoProviderDto>(
    `/enterprise/sso-providers/${providerId}/activate`,
    { method: 'POST' },
  );
}

export function getEnterpriseSsoMetadata(): Promise<EnterpriseSsoSpMetadataDto> {
  return apiFetch<EnterpriseSsoSpMetadataDto>('/enterprise/sso/metadata');
}

export function createEnterpriseKeyReference(
  input: CreateEnterpriseKeyReferenceRequestDto,
): Promise<EnterpriseKeyReferenceDto> {
  return apiFetch<EnterpriseKeyReferenceDto>('/enterprise/key-references', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listEnterpriseKeyReferences(): Promise<EnterpriseKeyReferenceListResponseDto> {
  return apiFetch<EnterpriseKeyReferenceListResponseDto>('/enterprise/key-references');
}

export function verifyEnterpriseKeyReference(
  keyReferenceId: string,
): Promise<EnterpriseKeyReferenceDto> {
  return apiFetch<EnterpriseKeyReferenceDto>(
    `/enterprise/key-references/${keyReferenceId}/verify`,
    { method: 'POST' },
  );
}

export function createEnterpriseSiemExport(
  input: CreateEnterpriseSiemExportRequestDto,
): Promise<EnterpriseSiemExportDto> {
  return apiFetch<EnterpriseSiemExportDto>('/enterprise/siem/exports', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listEnterpriseSiemExports(): Promise<EnterpriseSiemExportListResponseDto> {
  return apiFetch<EnterpriseSiemExportListResponseDto>('/enterprise/siem/exports');
}

export function createEnterpriseBackupSnapshot(
  input: CreateEnterpriseBackupSnapshotRequestDto,
): Promise<EnterpriseBackupSnapshotDto> {
  return apiFetch<EnterpriseBackupSnapshotDto>('/enterprise/backups/snapshots', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listEnterpriseBackupSnapshots(): Promise<EnterpriseBackupSnapshotListResponseDto> {
  return apiFetch<EnterpriseBackupSnapshotListResponseDto>('/enterprise/backups/snapshots');
}

export function createEnterpriseComplianceEvidence(
  input: CreateEnterpriseComplianceEvidenceRequestDto,
): Promise<EnterpriseComplianceEvidenceDto> {
  return apiFetch<EnterpriseComplianceEvidenceDto>('/enterprise/compliance/evidence', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listEnterpriseComplianceEvidence(): Promise<EnterpriseComplianceEvidenceListResponseDto> {
  return apiFetch<EnterpriseComplianceEvidenceListResponseDto>('/enterprise/compliance/evidence');
}

export function getEnterpriseReadiness(): Promise<EnterpriseReadinessSummaryDto> {
  return apiFetch<EnterpriseReadinessSummaryDto>('/enterprise/readiness');
}
