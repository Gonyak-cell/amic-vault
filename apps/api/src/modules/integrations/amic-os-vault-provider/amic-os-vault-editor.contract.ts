import { BadRequestException } from '@nestjs/common';

const safeIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const accountLedgerIdPattern = /^[a-z0-9][a-z0-9._-]{1,78}[a-z0-9]$/u;
const clientTokenPattern = /^[A-Za-z0-9._:-]{8,160}$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const copyIdPattern = /^document-copy:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const snapshotIdPattern = /^document-copy-snapshot:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const officeMimeTypes = new Set([
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export interface AmicOsVaultOfficeExactVersion {
  document_id: string;
  version_id: string;
  file_object_id: string;
  sha256: string;
  byte_size: number;
  mime_type: string;
}

export interface AmicOsVaultOfficeBaseInput {
  principal: { tenant_id: string; user_id: string };
  lawos_matter_id: string;
  requested_exact_version: AmicOsVaultOfficeExactVersion;
}

export interface AmicOsVaultOfficeOpenInput extends AmicOsVaultOfficeBaseInput {
  idempotency_key: string;
}

export interface AmicOsVaultOfficeBoundSessionInput extends AmicOsVaultOfficeBaseInput {
  edit_session_id: string;
  lock_token: string;
}

export interface AmicOsVaultOfficeStatusInput extends AmicOsVaultOfficeBoundSessionInput {
  client_save_id: string | null;
}

export interface AmicOsVaultOfficeRecoveryInput extends AmicOsVaultOfficeBaseInput {
  session_id: string;
}

export interface AmicOsVaultOfficeSaveInput extends AmicOsVaultOfficeBoundSessionInput {
  client_save_id: string;
  close: boolean;
  file: { filename: string; sha256: string; byte_size: number; mime_type: string };
}

export interface AmicOsVaultOfficeCopyCreateInput extends AmicOsVaultOfficeBaseInput {
  copy_id: string;
  snapshot_id: string;
  title: string;
  resume: { copy_id: string; snapshot_id: string } | null;
}

export interface AmicOsVaultOfficeCopyBindingInput extends AmicOsVaultOfficeBaseInput {
  copy_id: string;
  snapshot_id: string;
  working_document_id: string;
}

export interface AmicOsVaultOfficeCopyListInput extends AmicOsVaultOfficeBaseInput {
  limit: number;
}

function invalid(): never {
  throw new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) invalid();
}

function safeId(value: unknown): string {
  if (typeof value !== 'string' || !safeIdPattern.test(value)) return invalid();
  return value;
}

function uuid(value: unknown): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) return invalid();
  return value.toLowerCase();
}

function clientToken(value: unknown): string {
  if (typeof value !== 'string' || !clientTokenPattern.test(value)) return invalid();
  return value;
}

function copyId(value: unknown): string {
  if (typeof value !== 'string' || !copyIdPattern.test(value)) return invalid();
  return value.toLowerCase();
}

function snapshotId(value: unknown): string {
  if (typeof value !== 'string' || !snapshotIdPattern.test(value)) return invalid();
  return value.toLowerCase();
}

function principal(value: unknown): AmicOsVaultOfficeBaseInput['principal'] {
  const input = object(value);
  exactKeys(input, ['tenant_id', 'user_id']);
  const userId = typeof input.user_id === 'string' ? input.user_id.trim().toLowerCase() : '';
  if (!accountLedgerIdPattern.test(userId)) return invalid();
  return { tenant_id: safeId(input.tenant_id), user_id: userId };
}

function exactVersion(value: unknown): AmicOsVaultOfficeExactVersion {
  const input = object(value);
  exactKeys(input, ['document_id', 'version_id', 'file_object_id', 'sha256', 'byte_size', 'mime_type']);
  const hash = typeof input.sha256 === 'string' ? input.sha256.trim().toLowerCase() : '';
  const mimeType = typeof input.mime_type === 'string' ? input.mime_type.toLowerCase() : '';
  if (!sha256Pattern.test(hash) || !officeMimeTypes.has(mimeType)
      || !Number.isSafeInteger(input.byte_size) || Number(input.byte_size) < 1
      || Number(input.byte_size) > 25 * 1024 * 1024) return invalid();
  return {
    document_id: uuid(input.document_id),
    version_id: uuid(input.version_id),
    file_object_id: uuid(input.file_object_id),
    sha256: hash,
    byte_size: Number(input.byte_size),
    mime_type: mimeType,
  };
}

function base(value: unknown, extraKeys: readonly string[] = []): AmicOsVaultOfficeBaseInput & Record<string, unknown> {
  const input = object(value);
  exactKeys(input, ['principal', 'lawos_matter_id', 'requested_exact_version', ...extraKeys]);
  return {
    principal: principal(input.principal),
    lawos_matter_id: safeId(input.lawos_matter_id),
    requested_exact_version: exactVersion(input.requested_exact_version),
  };
}

function bound(value: unknown, extraKeys: readonly string[] = []): AmicOsVaultOfficeBoundSessionInput & Record<string, unknown> {
  const input = object(value);
  const parsed = base(input, ['edit_session_id', 'lock_token', ...extraKeys]);
  return { ...parsed, edit_session_id: uuid(input.edit_session_id), lock_token: clientToken(input.lock_token) };
}

function filename(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 240
      || value !== value.normalize('NFC').trim() || /[\\/]/u.test(value)
      || [...value].some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 0x1f || codePoint === 0x7f;
      })) return invalid();
  return value;
}

export function parseAmicOsVaultOfficeInfoInput(value: unknown): AmicOsVaultOfficeBaseInput {
  return base(value);
}

export function parseAmicOsVaultOfficeOpenInput(value: unknown): AmicOsVaultOfficeOpenInput {
  const input = object(value);
  return { ...base(input, ['idempotency_key']), idempotency_key: clientToken(input.idempotency_key) };
}

export function parseAmicOsVaultOfficeSourceInput(value: unknown): AmicOsVaultOfficeBoundSessionInput {
  return bound(value);
}

export function parseAmicOsVaultOfficeHeartbeatInput(value: unknown): AmicOsVaultOfficeBoundSessionInput {
  return bound(value);
}

export function parseAmicOsVaultOfficeStatusInput(value: unknown): AmicOsVaultOfficeStatusInput {
  const input = object(value);
  const parsed = bound(input, ['client_save_id']);
  return { ...parsed, client_save_id: input.client_save_id === null ? null : clientToken(input.client_save_id) };
}

export function parseAmicOsVaultOfficeSaveInput(value: unknown): AmicOsVaultOfficeSaveInput {
  const input = object(value);
  const parsed = bound(input, ['client_save_id', 'close', 'file']);
  const file = object(input.file);
  exactKeys(file, ['filename', 'sha256', 'byte_size', 'mime_type']);
  const exact = exactVersion({
    document_id: parsed.requested_exact_version.document_id,
    version_id: parsed.requested_exact_version.version_id,
    file_object_id: parsed.requested_exact_version.file_object_id,
    sha256: file.sha256,
    byte_size: file.byte_size,
    mime_type: file.mime_type,
  });
  if (typeof input.close !== 'boolean' || exact.mime_type !== parsed.requested_exact_version.mime_type) return invalid();
  return {
    ...parsed,
    client_save_id: clientToken(input.client_save_id),
    close: input.close,
    file: { filename: filename(file.filename), sha256: exact.sha256, byte_size: exact.byte_size, mime_type: exact.mime_type },
  };
}

export function parseAmicOsVaultOfficeCancelInput(value: unknown): AmicOsVaultOfficeBoundSessionInput {
  return bound(value);
}

export function parseAmicOsVaultOfficeRecoveryStatusInput(value: unknown): AmicOsVaultOfficeBaseInput {
  return base(value);
}

export function parseAmicOsVaultOfficeRecoverInput(value: unknown): AmicOsVaultOfficeRecoveryInput {
  const input = object(value);
  return { ...base(input, ['session_id']), session_id: uuid(input.session_id) };
}

export function parseAmicOsVaultOfficeCopyCreateInput(value: unknown): AmicOsVaultOfficeCopyCreateInput {
  const input = object(value);
  const parsed = base(input, ['copy_id', 'snapshot_id', 'title', 'resume']);
  let resume: AmicOsVaultOfficeCopyCreateInput['resume'] = null;
  if (input.resume !== null) {
    const selected = object(input.resume);
    exactKeys(selected, ['copy_id', 'snapshot_id']);
    resume = { copy_id: copyId(selected.copy_id), snapshot_id: snapshotId(selected.snapshot_id) };
  }
  const title = typeof input.title === 'string' ? input.title.normalize('NFC').trim() : '';
  if (!title || title.length > 180) return invalid();
  return { ...parsed, copy_id: copyId(input.copy_id), snapshot_id: snapshotId(input.snapshot_id), title, resume };
}

export function parseAmicOsVaultOfficeCopyBindingInput(value: unknown): AmicOsVaultOfficeCopyBindingInput {
  const input = object(value);
  const parsed = base(input, ['copy_id', 'snapshot_id', 'working_document_id']);
  return { ...parsed, copy_id: copyId(input.copy_id), snapshot_id: snapshotId(input.snapshot_id),
    working_document_id: uuid(input.working_document_id) };
}

export function parseAmicOsVaultOfficeCopyListInput(value: unknown): AmicOsVaultOfficeCopyListInput {
  const input = object(value);
  const parsed = base(input, ['limit']);
  if (!Number.isSafeInteger(input.limit) || Number(input.limit) < 1 || Number(input.limit) > 50) return invalid();
  return { ...parsed, limit: Number(input.limit) };
}
