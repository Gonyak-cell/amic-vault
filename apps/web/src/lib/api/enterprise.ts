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
  EnterpriseDmsSearchRefinerDto,
  EnterpriseDmsSearchRefinerListResponseDto,
  EnterpriseDmsTaxonomyDto,
  EnterpriseDmsTaxonomyListResponseDto,
  EnterpriseKeyReferenceDto,
  EnterpriseKeyReferenceListResponseDto,
  EnterpriseReadinessSummaryDto,
  EnterpriseSiemExportDto,
  EnterpriseSiemExportListResponseDto,
  EnterpriseSsoProviderDto,
  EnterpriseSsoProviderListResponseDto,
  EnterpriseSsoSpMetadataDto,
  UpsertEnterpriseDmsSearchRefinerRequestDto,
  UpsertEnterpriseDmsTaxonomyRequestDto,
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

export function upsertEnterpriseDmsTaxonomy(
  input: UpsertEnterpriseDmsTaxonomyRequestDto,
): Promise<EnterpriseDmsTaxonomyDto> {
  return apiFetch<EnterpriseDmsTaxonomyDto>('/enterprise/dms/taxonomies', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listEnterpriseDmsTaxonomies(): Promise<EnterpriseDmsTaxonomyListResponseDto> {
  return apiFetch<EnterpriseDmsTaxonomyListResponseDto>('/enterprise/dms/taxonomies');
}

export function disableEnterpriseDmsTaxonomy(
  taxonomyId: string,
): Promise<EnterpriseDmsTaxonomyDto> {
  return apiFetch<EnterpriseDmsTaxonomyDto>(
    `/enterprise/dms/taxonomies/${taxonomyId}/disable`,
    { method: 'POST' },
  );
}

export function upsertEnterpriseDmsSearchRefiner(
  input: UpsertEnterpriseDmsSearchRefinerRequestDto,
): Promise<EnterpriseDmsSearchRefinerDto> {
  return apiFetch<EnterpriseDmsSearchRefinerDto>('/enterprise/dms/search-refiners', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listEnterpriseDmsSearchRefiners(): Promise<EnterpriseDmsSearchRefinerListResponseDto> {
  return apiFetch<EnterpriseDmsSearchRefinerListResponseDto>('/enterprise/dms/search-refiners');
}

export function disableEnterpriseDmsSearchRefiner(
  refinerId: string,
): Promise<EnterpriseDmsSearchRefinerDto> {
  return apiFetch<EnterpriseDmsSearchRefinerDto>(
    `/enterprise/dms/search-refiners/${refinerId}/disable`,
    { method: 'POST' },
  );
}
