import { BadRequestException } from '@nestjs/common';

const safeIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const accountLedgerIdPattern = /^[a-z0-9][a-z0-9._-]{1,78}[a-z0-9]$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const mimeTypePattern = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/u;
const operationIdPattern = /^vaultop_[a-f0-9]{32}$/u;
const correlationIdPattern = /^vaultcorr_[a-f0-9]{32}$/u;
const maxExportBytes = 25 * 1024 * 1024;

export interface AmicOsVaultProviderPrincipalInput {
  tenant_id: string;
  user_id: string;
}

export interface AmicOsVaultExactVersion {
  document_id: string;
  version_id: string;
  file_object_id: string;
  sha256: string;
  byte_size: number;
  mime_type: string;
}

export type AmicOsVaultExportOperationKind = 'export_exact_version' | 'attach_outlook';

export interface AmicOsVaultExportOperation {
  operation_id: string;
  correlation_id: string;
  operation_kind: AmicOsVaultExportOperationKind;
  idempotency_key?: string;
}

export interface AmicOsVaultProviderDecision {
  effect: 'allow';
  decision_ref: string;
}

export interface AmicOsVaultProviderDecisions {
  permission: AmicOsVaultProviderDecision;
  ethical_wall: AmicOsVaultProviderDecision;
  records: AmicOsVaultProviderDecision;
  dlp: AmicOsVaultProviderDecision;
}

export interface AmicOsVaultProviderAudit {
  event_id: string;
  correlation_id: string;
}

export interface AmicOsVaultExportAuthorization {
  authority_kind: 'amic-vault-api';
  authority_ref: string;
  provider_revision: string;
  state: 'authorized';
  provider_export_ref: string;
  expires_at: string;
  exact_version: AmicOsVaultExactVersion;
  attachment_name: string;
  decisions: AmicOsVaultProviderDecisions;
  audit: AmicOsVaultProviderAudit;
}

export interface AmicOsVaultExportDownloadMetadata {
  authority_kind: 'amic-vault-api';
  authority_ref: string;
  provider_revision: string;
  state: 'downloaded';
  provider_export_ref: string;
  exact_version: AmicOsVaultExactVersion;
  attachment_name: string;
  audit: AmicOsVaultProviderAudit;
}

export interface AmicOsVaultExportAuthorizeInput {
  principal: AmicOsVaultProviderPrincipalInput;
  lawos_matter_id: string;
  requested_exact_version: AmicOsVaultExactVersion;
  installation_ref_sha256: string | null;
  compose_target_sha256: string | null;
  operation_id: string;
  correlation_id: string;
  operation_kind: AmicOsVaultExportOperationKind;
  idempotency_key: string;
}

export interface AmicOsVaultExportDownloadInput {
  principal: AmicOsVaultProviderPrincipalInput;
  lawos_matter_id: string;
  installation_ref_sha256: string | null;
  compose_target_sha256: string | null;
  operation: Required<AmicOsVaultExportOperation>;
  authorization: AmicOsVaultExportAuthorization;
}

export interface AmicOsVaultExportReadbackInput {
  principal: AmicOsVaultProviderPrincipalInput;
  lawos_matter_id: string;
  installation_ref_sha256: string | null;
  compose_target_sha256: string | null;
  operation: Omit<Required<AmicOsVaultExportOperation>, 'idempotency_key'>;
  authorization: AmicOsVaultExportAuthorization;
  download: AmicOsVaultExportDownloadMetadata;
}

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw validationFailed();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw validationFailed();
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw validationFailed();
  }
}

function hasUnsafeControl(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f || (code >= 0xd800 && code <= 0xdfff);
  });
}

function safeId(value: unknown): string {
  if (typeof value !== 'string' || !safeIdPattern.test(value)) throw validationFailed();
  return value;
}

function uuid(value: unknown): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw validationFailed();
  return value.toLowerCase();
}

function sha256(value: unknown): string {
  if (typeof value !== 'string' || !sha256Pattern.test(value)) throw validationFailed();
  return value;
}

function nullableSha256(value: unknown): string | null {
  return value === null ? null : sha256(value);
}

function principal(value: unknown): AmicOsVaultProviderPrincipalInput {
  const input = record(value);
  exactKeys(input, ['tenant_id', 'user_id']);
  const userId = typeof input.user_id === 'string' ? input.user_id.trim().toLowerCase() : '';
  if (!accountLedgerIdPattern.test(userId)) throw validationFailed();
  return {
    tenant_id: safeId(input.tenant_id),
    user_id: userId,
  };
}

function exactVersion(value: unknown): AmicOsVaultExactVersion {
  const input = record(value);
  exactKeys(input, [
    'document_id',
    'version_id',
    'file_object_id',
    'sha256',
    'byte_size',
    'mime_type',
  ]);
  const mimeType = typeof input.mime_type === 'string' ? input.mime_type.toLowerCase() : '';
  if (!mimeTypePattern.test(mimeType)) throw validationFailed();
  if (
    !Number.isSafeInteger(input.byte_size) ||
    Number(input.byte_size) < 1 ||
    Number(input.byte_size) > maxExportBytes
  ) {
    throw validationFailed();
  }
  return {
    document_id: uuid(input.document_id),
    version_id: uuid(input.version_id),
    file_object_id: uuid(input.file_object_id),
    sha256: sha256(input.sha256),
    byte_size: Number(input.byte_size),
    mime_type: mimeType,
  };
}

function operationKind(value: unknown): AmicOsVaultExportOperationKind {
  if (value !== 'export_exact_version' && value !== 'attach_outlook') throw validationFailed();
  return value;
}

function operationId(value: unknown): string {
  if (typeof value !== 'string' || !operationIdPattern.test(value)) throw validationFailed();
  return value;
}

function correlationId(value: unknown): string {
  if (typeof value !== 'string' || !correlationIdPattern.test(value)) throw validationFailed();
  return value;
}

function attachmentName(value: unknown): string {
  const name = typeof value === 'string' ? value.normalize('NFC') : '';
  if (
    !name ||
    name !== name.trim() ||
    name.length > 240 ||
    /[\\/]/u.test(name) ||
    hasUnsafeControl(name)
  ) {
    throw validationFailed();
  }
  return name;
}

function instant(value: unknown): string {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (
    typeof value !== 'string' ||
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString() !== value
  ) {
    throw validationFailed();
  }
  return value;
}

function audit(value: unknown): AmicOsVaultProviderAudit {
  const input = record(value);
  exactKeys(input, ['event_id', 'correlation_id']);
  return {
    event_id: uuid(input.event_id),
    correlation_id: correlationId(input.correlation_id),
  };
}

function decision(value: unknown): AmicOsVaultProviderDecision {
  const input = record(value);
  exactKeys(input, ['effect', 'decision_ref']);
  if (input.effect !== 'allow') throw validationFailed();
  return { effect: 'allow', decision_ref: safeId(input.decision_ref) };
}

function decisions(value: unknown): AmicOsVaultProviderDecisions {
  const input = record(value);
  exactKeys(input, ['permission', 'ethical_wall', 'records', 'dlp']);
  return {
    permission: decision(input.permission),
    ethical_wall: decision(input.ethical_wall),
    records: decision(input.records),
    dlp: decision(input.dlp),
  };
}

function authorization(value: unknown): AmicOsVaultExportAuthorization {
  const input = record(value);
  exactKeys(input, [
    'authority_kind',
    'authority_ref',
    'provider_revision',
    'state',
    'provider_export_ref',
    'expires_at',
    'exact_version',
    'attachment_name',
    'decisions',
    'audit',
  ]);
  if (input.authority_kind !== 'amic-vault-api' || input.state !== 'authorized') {
    throw validationFailed();
  }
  return {
    authority_kind: 'amic-vault-api',
    authority_ref: safeId(input.authority_ref),
    provider_revision: safeId(input.provider_revision),
    state: 'authorized',
    provider_export_ref: safeId(input.provider_export_ref),
    expires_at: instant(input.expires_at),
    exact_version: exactVersion(input.exact_version),
    attachment_name: attachmentName(input.attachment_name),
    decisions: decisions(input.decisions),
    audit: audit(input.audit),
  };
}

function operation(value: unknown, includeIdempotency: boolean) {
  const input = record(value);
  exactKeys(
    input,
    includeIdempotency
      ? ['operation_id', 'correlation_id', 'operation_kind', 'idempotency_key']
      : ['operation_id', 'correlation_id', 'operation_kind'],
  );
  return {
    operation_id: operationId(input.operation_id),
    correlation_id: correlationId(input.correlation_id),
    operation_kind: operationKind(input.operation_kind),
    ...(includeIdempotency ? { idempotency_key: safeId(input.idempotency_key) } : {}),
  };
}

function downloadMetadata(value: unknown): AmicOsVaultExportDownloadMetadata {
  const input = record(value);
  exactKeys(input, [
    'authority_kind',
    'authority_ref',
    'provider_revision',
    'state',
    'provider_export_ref',
    'exact_version',
    'attachment_name',
    'audit',
  ]);
  if (input.authority_kind !== 'amic-vault-api' || input.state !== 'downloaded') {
    throw validationFailed();
  }
  return {
    authority_kind: 'amic-vault-api',
    authority_ref: safeId(input.authority_ref),
    provider_revision: safeId(input.provider_revision),
    state: 'downloaded',
    provider_export_ref: safeId(input.provider_export_ref),
    exact_version: exactVersion(input.exact_version),
    attachment_name: attachmentName(input.attachment_name),
    audit: audit(input.audit),
  };
}

export function parseAmicOsVaultExportAuthorizeInput(
  value: unknown,
): AmicOsVaultExportAuthorizeInput {
  const input = record(value);
  exactKeys(input, [
    'principal',
    'lawos_matter_id',
    'requested_exact_version',
    'installation_ref_sha256',
    'compose_target_sha256',
    'operation_id',
    'correlation_id',
    'operation_kind',
    'idempotency_key',
  ]);
  return {
    principal: principal(input.principal),
    lawos_matter_id: safeId(input.lawos_matter_id),
    requested_exact_version: exactVersion(input.requested_exact_version),
    installation_ref_sha256: nullableSha256(input.installation_ref_sha256),
    compose_target_sha256: nullableSha256(input.compose_target_sha256),
    operation_id: operationId(input.operation_id),
    correlation_id: correlationId(input.correlation_id),
    operation_kind: operationKind(input.operation_kind),
    idempotency_key: safeId(input.idempotency_key),
  };
}

export function parseAmicOsVaultExportDownloadInput(
  value: unknown,
): AmicOsVaultExportDownloadInput {
  const input = record(value);
  exactKeys(input, [
    'principal',
    'lawos_matter_id',
    'installation_ref_sha256',
    'compose_target_sha256',
    'operation',
    'authorization',
  ]);
  return {
    principal: principal(input.principal),
    lawos_matter_id: safeId(input.lawos_matter_id),
    installation_ref_sha256: nullableSha256(input.installation_ref_sha256),
    compose_target_sha256: nullableSha256(input.compose_target_sha256),
    operation: operation(input.operation, true) as Required<AmicOsVaultExportOperation>,
    authorization: authorization(input.authorization),
  };
}

export function parseAmicOsVaultExportReadbackInput(
  value: unknown,
): AmicOsVaultExportReadbackInput {
  const input = record(value);
  exactKeys(input, [
    'principal',
    'lawos_matter_id',
    'installation_ref_sha256',
    'compose_target_sha256',
    'operation',
    'authorization',
    'download',
  ]);
  return {
    principal: principal(input.principal),
    lawos_matter_id: safeId(input.lawos_matter_id),
    installation_ref_sha256: nullableSha256(input.installation_ref_sha256),
    compose_target_sha256: nullableSha256(input.compose_target_sha256),
    operation: operation(input.operation, false) as Omit<
      Required<AmicOsVaultExportOperation>,
      'idempotency_key'
    >,
    authorization: authorization(input.authorization),
    download: downloadMetadata(input.download),
  };
}

export const AMIC_OS_VAULT_MAX_EXPORT_BYTES = maxExportBytes;
