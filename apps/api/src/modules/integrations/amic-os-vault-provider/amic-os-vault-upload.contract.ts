import { BadRequestException } from '@nestjs/common';

const safeIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const accountLedgerIdPattern = /^[a-z0-9][a-z0-9._-]{1,78}[a-z0-9]$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const mimeTypePattern = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/u;
const operationIdPattern = /^vaultop_[a-f0-9]{32}$/u;
const correlationIdPattern = /^vaultcorr_[a-f0-9]{32}$/u;
const maxUploadBytes = 1024 * 1024 * 1024;
const maxBufferedUploadBytes = 16 * 1024 * 1024;
export const AMIC_OS_LIVE_MATTER_PROJECTION_REVISION = 'lawos-live-matter-projection-v1';

export interface AmicOsVaultUploadPrincipalInput {
  tenant_id: string;
  user_id: string;
}

export type AmicOsVaultUploadOperationKind =
  | 'save_local_file'
  | 'save_email'
  | 'save_email_attachment';

export interface AmicOsVaultUploadSource {
  kind: 'microsoft_graph_mime' | 'microsoft_graph_mime_attachment';
  ref_sha256: string;
}

export interface AmicOsVaultUploadDecision {
  effect: 'allow' | 'pending' | 'deferred';
  decision_ref: string;
}

export interface AmicOsVaultUploadDecisions {
  permission: AmicOsVaultUploadDecision & { effect: 'allow' };
  ethical_wall: AmicOsVaultUploadDecision & { effect: 'allow' };
  records: AmicOsVaultUploadDecision & { effect: 'allow' };
  dlp: AmicOsVaultUploadDecision;
}

export interface AmicOsVaultUploadAudit {
  event_id: string;
  correlation_id: string;
}

export interface AmicOsVaultUploadResolvedBinding {
  vault_tenant_id: string;
  vault_actor_id: string;
  vault_matter_id: string;
  vault_workspace_id: string;
  vault_folder_id: string | null;
}

export interface AmicOsVaultUploadPreflight {
  authority_kind: 'amic-vault-api';
  authority_ref: string;
  provider_revision: string;
  preflight_ref: string;
  expires_at: string;
  resolved: AmicOsVaultUploadResolvedBinding;
  decisions: AmicOsVaultUploadDecisions;
  audit: AmicOsVaultUploadAudit;
}

export interface AmicOsVaultUploadFingerprint {
  sha256: string;
  byte_size: number;
  mime_type: string;
}

export interface AmicOsVaultUploadFile extends AmicOsVaultUploadFingerprint {
  filename: string;
}

export interface AmicOsVaultExactVersion extends AmicOsVaultUploadFingerprint {
  document_id: string;
  version_id: string;
  file_object_id: string;
}

export interface AmicOsVaultUploadCommit {
  authority_kind: 'amic-vault-api';
  authority_ref: string;
  provider_revision: string;
  state: 'quarantined';
  provider_operation_ref: string;
  accepted: AmicOsVaultUploadFingerprint;
  exact_version: null;
  retry_after_ms: number;
  audit: AmicOsVaultUploadAudit;
}

export interface AmicOsVaultUploadPreflightInput {
  principal: AmicOsVaultUploadPrincipalInput;
  lawos_matter_id: string;
  matter_projection?: AmicOsVaultLiveMatterProjection;
  requested_workspace_id: string | null;
  requested_folder_id: string | null;
  source?: AmicOsVaultUploadSource;
  operation_id: string;
  correlation_id: string;
  request_id: string;
}

export interface AmicOsVaultLiveMatterProjection {
  lawos_client_id: string;
  client_display_name: string;
  matter_code: string | null;
  matter_name: string;
  matter_status: 'opening' | 'open';
  source_revision: typeof AMIC_OS_LIVE_MATTER_PROJECTION_REVISION;
  source_updated_at: string;
}

export interface AmicOsVaultUploadCommitInput {
  principal: AmicOsVaultUploadPrincipalInput;
  preflight: AmicOsVaultUploadPreflight;
  operation: {
    operation_id: string;
    correlation_id: string;
    idempotency_key: string;
    operation_kind: AmicOsVaultUploadOperationKind;
  };
  source?: { ref_sha256: string };
  file: AmicOsVaultUploadFile;
  request_id: string;
}

export interface AmicOsVaultUploadPrepareInput {
  principal: AmicOsVaultUploadPrincipalInput;
  preflight: AmicOsVaultUploadPreflight;
  operation: AmicOsVaultUploadCommitInput['operation'];
  file: Omit<AmicOsVaultUploadFile, 'sha256'>;
  request_id: string;
}

export interface AmicOsVaultUploadCompleteInput extends AmicOsVaultUploadCommitInput {
  transfer: { transfer_ref: string };
}

export interface AmicOsVaultUploadReadbackInput {
  principal: AmicOsVaultUploadPrincipalInput;
  preflight: AmicOsVaultUploadPreflight;
  commit: AmicOsVaultUploadCommit;
  operation: {
    operation_id: string;
    correlation_id: string;
    operation_kind: AmicOsVaultUploadOperationKind;
  };
  expected: AmicOsVaultUploadFingerprint;
  request_id: string;
}

export interface AmicOsVaultCapabilityInput {
  principal: AmicOsVaultUploadPrincipalInput;
  request_id: string;
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

function hasControl(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f;
  });
}

function safeId(value: unknown): string {
  if (typeof value !== 'string' || !safeIdPattern.test(value)) throw validationFailed();
  return value;
}

function nullableSafeId(value: unknown): string | null {
  return value === null ? null : safeId(value);
}

function uuid(value: unknown): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw validationFailed();
  return value.toLowerCase();
}

function sha256(value: unknown): string {
  if (typeof value !== 'string' || !sha256Pattern.test(value)) throw validationFailed();
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

function instant(value: unknown): string {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (typeof value !== 'string' || !Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw validationFailed();
  }
  return value;
}

function displayText(value: unknown, maximumLength: number): string {
  const normalized = typeof value === 'string' ? value.normalize('NFC').trim() : '';
  if (!normalized || normalized.length > maximumLength || hasControl(normalized)) {
    throw validationFailed();
  }
  return normalized;
}

function liveMatterProjection(value: unknown): AmicOsVaultLiveMatterProjection {
  const input = record(value);
  exactKeys(input, [
    'lawos_client_id',
    'client_display_name',
    'matter_code',
    'matter_name',
    'matter_status',
    'source_revision',
    'source_updated_at',
  ]);
  if (
    !['opening', 'open'].includes(String(input.matter_status)) ||
    input.source_revision !== AMIC_OS_LIVE_MATTER_PROJECTION_REVISION
  ) {
    throw validationFailed();
  }
  return {
    lawos_client_id: safeId(input.lawos_client_id),
    client_display_name: displayText(input.client_display_name, 1_000),
    matter_code: input.matter_code === null ? null : displayText(input.matter_code, 120),
    matter_name: displayText(input.matter_name, 1_000),
    matter_status: input.matter_status as 'opening' | 'open',
    source_revision: AMIC_OS_LIVE_MATTER_PROJECTION_REVISION,
    source_updated_at: instant(input.source_updated_at),
  };
}

function principal(value: unknown): AmicOsVaultUploadPrincipalInput {
  const input = record(value);
  exactKeys(input, ['tenant_id', 'user_id']);
  const userId = typeof input.user_id === 'string' ? input.user_id.trim().toLowerCase() : '';
  if (!accountLedgerIdPattern.test(userId)) throw validationFailed();
  return { tenant_id: safeId(input.tenant_id), user_id: userId };
}

function source(value: unknown): AmicOsVaultUploadSource {
  const input = record(value);
  exactKeys(input, ['kind', 'ref_sha256']);
  if (
    input.kind !== 'microsoft_graph_mime' &&
    input.kind !== 'microsoft_graph_mime_attachment'
  ) {
    throw validationFailed();
  }
  return { kind: input.kind, ref_sha256: sha256(input.ref_sha256) };
}

function sourceRef(value: unknown): { ref_sha256: string } {
  const input = record(value);
  exactKeys(input, ['ref_sha256']);
  return { ref_sha256: sha256(input.ref_sha256) };
}

function audit(value: unknown): AmicOsVaultUploadAudit {
  const input = record(value);
  exactKeys(input, ['event_id', 'correlation_id']);
  return { event_id: uuid(input.event_id), correlation_id: correlationId(input.correlation_id) };
}

function decision(
  value: unknown,
  effects: readonly AmicOsVaultUploadDecision['effect'][],
): AmicOsVaultUploadDecision {
  const input = record(value);
  exactKeys(input, ['effect', 'decision_ref']);
  if (!effects.includes(input.effect as AmicOsVaultUploadDecision['effect'])) {
    throw validationFailed();
  }
  return {
    effect: input.effect as AmicOsVaultUploadDecision['effect'],
    decision_ref: safeId(input.decision_ref),
  };
}

function decisions(value: unknown): AmicOsVaultUploadDecisions {
  const input = record(value);
  exactKeys(input, ['permission', 'ethical_wall', 'records', 'dlp']);
  return {
    permission: decision(input.permission, ['allow']) as AmicOsVaultUploadDecisions['permission'],
    ethical_wall: decision(input.ethical_wall, ['allow']) as AmicOsVaultUploadDecisions['ethical_wall'],
    records: decision(input.records, ['allow']) as AmicOsVaultUploadDecisions['records'],
    dlp: decision(input.dlp, ['allow', 'pending', 'deferred']),
  };
}

function resolved(value: unknown): AmicOsVaultUploadResolvedBinding {
  const input = record(value);
  exactKeys(input, [
    'vault_tenant_id',
    'vault_actor_id',
    'vault_matter_id',
    'vault_workspace_id',
    'vault_folder_id',
  ]);
  return {
    vault_tenant_id: uuid(input.vault_tenant_id),
    vault_actor_id: uuid(input.vault_actor_id),
    vault_matter_id: uuid(input.vault_matter_id),
    vault_workspace_id: uuid(input.vault_workspace_id),
    vault_folder_id: input.vault_folder_id === null ? null : uuid(input.vault_folder_id),
  };
}

function preflight(value: unknown): AmicOsVaultUploadPreflight {
  const input = record(value);
  exactKeys(input, [
    'authority_kind',
    'authority_ref',
    'provider_revision',
    'preflight_ref',
    'expires_at',
    'resolved',
    'decisions',
    'audit',
  ]);
  if (input.authority_kind !== 'amic-vault-api') throw validationFailed();
  return {
    authority_kind: 'amic-vault-api',
    authority_ref: safeId(input.authority_ref),
    provider_revision: safeId(input.provider_revision),
    preflight_ref: safeId(input.preflight_ref),
    expires_at: instant(input.expires_at),
    resolved: resolved(input.resolved),
    decisions: decisions(input.decisions),
    audit: audit(input.audit),
  };
}

function filename(value: unknown): string {
  const name = typeof value === 'string' ? value.normalize('NFC') : '';
  if (
    !name ||
    name !== name.trim() ||
    name.length > 240 ||
    /[\\/]/u.test(name) ||
    hasControl(name)
  ) {
    throw validationFailed();
  }
  return name;
}

function fingerprint(value: unknown): AmicOsVaultUploadFingerprint {
  const input = record(value);
  exactKeys(input, ['sha256', 'byte_size', 'mime_type']);
  const mimeType = typeof input.mime_type === 'string' ? input.mime_type.toLowerCase() : '';
  if (
    !Number.isSafeInteger(input.byte_size) ||
    Number(input.byte_size) < 1 ||
    Number(input.byte_size) > maxUploadBytes ||
    !mimeTypePattern.test(mimeType)
  ) {
    throw validationFailed();
  }
  return {
    sha256: sha256(input.sha256),
    byte_size: Number(input.byte_size),
    mime_type: mimeType,
  };
}

function file(value: unknown): AmicOsVaultUploadFile {
  const input = record(value);
  exactKeys(input, ['filename', 'sha256', 'byte_size', 'mime_type']);
  return { filename: filename(input.filename), ...fingerprint({
    sha256: input.sha256,
    byte_size: input.byte_size,
    mime_type: input.mime_type,
  }) };
}

function preparedFile(value: unknown): Omit<AmicOsVaultUploadFile, 'sha256'> {
  const input = record(value);
  exactKeys(input, ['filename', 'byte_size', 'mime_type']);
  const parsed = fingerprint({
    sha256: '0'.repeat(64),
    byte_size: input.byte_size,
    mime_type: input.mime_type,
  });
  return {
    filename: filename(input.filename),
    byte_size: parsed.byte_size,
    mime_type: parsed.mime_type,
  };
}

function operationKind(value: unknown): AmicOsVaultUploadOperationKind {
  if (
    value !== 'save_local_file' &&
    value !== 'save_email' &&
    value !== 'save_email_attachment'
  ) {
    throw validationFailed();
  }
  return value;
}

function commitOperation(value: unknown): AmicOsVaultUploadCommitInput['operation'] {
  const input = record(value);
  const hasKind = Object.hasOwn(input, 'operation_kind');
  exactKeys(
    input,
    hasKind
      ? ['operation_id', 'correlation_id', 'idempotency_key', 'operation_kind']
      : ['operation_id', 'correlation_id', 'idempotency_key'],
  );
  return {
    operation_id: operationId(input.operation_id),
    correlation_id: correlationId(input.correlation_id),
    idempotency_key: safeId(input.idempotency_key),
    operation_kind: hasKind ? operationKind(input.operation_kind) : 'save_local_file',
  };
}

function readbackOperation(value: unknown): AmicOsVaultUploadReadbackInput['operation'] {
  const input = record(value);
  const hasKind = Object.hasOwn(input, 'operation_kind');
  exactKeys(
    input,
    hasKind
      ? ['operation_id', 'correlation_id', 'operation_kind']
      : ['operation_id', 'correlation_id'],
  );
  return {
    operation_id: operationId(input.operation_id),
    correlation_id: correlationId(input.correlation_id),
    operation_kind: hasKind ? operationKind(input.operation_kind) : 'save_local_file',
  };
}

function commit(value: unknown): AmicOsVaultUploadCommit {
  const input = record(value);
  exactKeys(input, [
    'authority_kind',
    'authority_ref',
    'provider_revision',
    'state',
    'provider_operation_ref',
    'accepted',
    'exact_version',
    'retry_after_ms',
    'audit',
  ]);
  if (
    input.authority_kind !== 'amic-vault-api' ||
    input.state !== 'quarantined' ||
    input.exact_version !== null ||
    !Number.isSafeInteger(input.retry_after_ms) ||
    Number(input.retry_after_ms) < 250 ||
    Number(input.retry_after_ms) > 60_000
  ) {
    throw validationFailed();
  }
  return {
    authority_kind: 'amic-vault-api',
    authority_ref: safeId(input.authority_ref),
    provider_revision: safeId(input.provider_revision),
    state: 'quarantined',
    provider_operation_ref: safeId(input.provider_operation_ref),
    accepted: fingerprint(input.accepted),
    exact_version: null,
    retry_after_ms: Number(input.retry_after_ms),
    audit: audit(input.audit),
  };
}

export function parseAmicOsVaultUploadPreflightInput(
  value: unknown,
): AmicOsVaultUploadPreflightInput {
  const input = record(value);
  const hasSource = Object.hasOwn(input, 'source');
  const hasMatterProjection = Object.hasOwn(input, 'matter_projection');
  exactKeys(input, [
    'principal',
    'lawos_matter_id',
    ...(hasMatterProjection ? ['matter_projection'] : []),
    'requested_workspace_id',
    'requested_folder_id',
    ...(hasSource ? ['source'] : []),
    'operation_id',
    'correlation_id',
    'request_id',
  ]);
  return {
    principal: principal(input.principal),
    lawos_matter_id: safeId(input.lawos_matter_id),
    ...(hasMatterProjection ? { matter_projection: liveMatterProjection(input.matter_projection) } : {}),
    requested_workspace_id: nullableSafeId(input.requested_workspace_id),
    requested_folder_id: nullableSafeId(input.requested_folder_id),
    ...(hasSource ? { source: source(input.source) } : {}),
    operation_id: operationId(input.operation_id),
    correlation_id: correlationId(input.correlation_id),
    request_id: safeId(input.request_id),
  };
}

export function parseAmicOsVaultUploadCommitInput(
  value: unknown,
): AmicOsVaultUploadCommitInput {
  const input = record(value);
  const hasSource = Object.hasOwn(input, 'source');
  exactKeys(input, [
    'principal',
    'preflight',
    'operation',
    ...(hasSource ? ['source'] : []),
    'file',
    'request_id',
  ]);
  const operation = commitOperation(input.operation);
  if ((operation.operation_kind === 'save_local_file') === hasSource) throw validationFailed();
  return {
    principal: principal(input.principal),
    preflight: preflight(input.preflight),
    operation,
    ...(hasSource ? { source: sourceRef(input.source) } : {}),
    file: file(input.file),
    request_id: safeId(input.request_id),
  };
}

export function parseAmicOsVaultUploadPrepareInput(
  value: unknown,
): AmicOsVaultUploadPrepareInput {
  const input = record(value);
  exactKeys(input, ['principal', 'preflight', 'operation', 'file', 'request_id']);
  const operation = commitOperation(input.operation);
  if (operation.operation_kind !== 'save_local_file') throw validationFailed();
  return {
    principal: principal(input.principal),
    preflight: preflight(input.preflight),
    operation,
    file: preparedFile(input.file),
    request_id: safeId(input.request_id),
  };
}

export function parseAmicOsVaultUploadCompleteInput(
  value: unknown,
): AmicOsVaultUploadCompleteInput {
  const input = record(value);
  exactKeys(input, [
    'principal',
    'preflight',
    'operation',
    'transfer',
    'file',
    'request_id',
  ]);
  const operation = commitOperation(input.operation);
  if (operation.operation_kind !== 'save_local_file') throw validationFailed();
  const transfer = record(input.transfer);
  exactKeys(transfer, ['transfer_ref']);
  return {
    principal: principal(input.principal),
    preflight: preflight(input.preflight),
    operation,
    transfer: { transfer_ref: safeId(transfer.transfer_ref) },
    file: file(input.file),
    request_id: safeId(input.request_id),
  };
}

export function parseAmicOsVaultUploadReadbackInput(
  value: unknown,
): AmicOsVaultUploadReadbackInput {
  const input = record(value);
  exactKeys(input, ['principal', 'preflight', 'commit', 'operation', 'expected', 'request_id']);
  return {
    principal: principal(input.principal),
    preflight: preflight(input.preflight),
    commit: commit(input.commit),
    operation: readbackOperation(input.operation),
    expected: fingerprint(input.expected),
    request_id: safeId(input.request_id),
  };
}

export function parseAmicOsVaultCapabilityInput(
  value: unknown,
): AmicOsVaultCapabilityInput {
  const input = record(value);
  exactKeys(input, ['principal', 'request_id']);
  return {
    principal: principal(input.principal),
    request_id: safeId(input.request_id),
  };
}

export const AMIC_OS_VAULT_MAX_UPLOAD_BYTES = maxUploadBytes;
export const AMIC_OS_VAULT_MAX_BUFFERED_UPLOAD_BYTES = maxBufferedUploadBytes;
