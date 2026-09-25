import { BadRequestException } from '@nestjs/common';

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const copyIdPattern = /^document-copy:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const snapshotIdPattern = /^document-copy-snapshot:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const sha256Pattern = /^[0-9a-f]{64}$/u;
const cursorPattern = /^dcp1\.[A-Za-z0-9_-]{1,480}$/u;

export const AMIC_OS_VAULT_NATIVE_COPY_MAX_BYTES = 25 * 1024 * 1024;
export const AMIC_OS_VAULT_NATIVE_COPY_READ_BYTES = 3 * 1024 * 1024;
export const AMIC_OS_VAULT_NATIVE_COPY_MIME_TYPES = new Set([
  'application/pdf',
  'message/rfc822',
]);

export interface AmicOsVaultNativeCopyPrincipalInput {
  tenant_id: string;
  user_id: string;
}

export interface AmicOsVaultNativeCopyExactVersion {
  document_id: string;
  version_id: string;
  file_object_id: string;
  sha256: string;
  byte_size: number;
  mime_type: string;
}

export interface AmicOsVaultNativeCopyFile {
  filename: string;
  sha256: string;
  byte_size: number;
  mime_type: string;
}

export interface AmicOsVaultNativeCopyBaseInput {
  principal: AmicOsVaultNativeCopyPrincipalInput;
  lawos_matter_id: string;
  requested_exact_version: AmicOsVaultNativeCopyExactVersion;
}

export interface AmicOsVaultNativeCopyBindingInput extends AmicOsVaultNativeCopyBaseInput {
  copy_id: string;
  snapshot_id: string;
}

export interface AmicOsVaultNativeCopyPrepareInput extends AmicOsVaultNativeCopyBindingInput {
  title: string;
  mode: 'clone' | 'upload';
  file: AmicOsVaultNativeCopyFile | null;
}

export interface AmicOsVaultNativeCopyListInput extends AmicOsVaultNativeCopyBaseInput {
  limit: number;
  cursor?: string;
}

export interface AmicOsVaultNativeCopyReadInput extends AmicOsVaultNativeCopyBindingInput {
  offset: number;
}

function invalid(reason = 'native_copy_request_invalid'): never {
  throw new BadRequestException({ code: 'VALIDATION_FAILED', reason });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key));
}

function boundedLabel(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
    value === value.normalize('NFC').trim() && !/[\\/\p{Cc}\p{Cf}\p{Cs}]/u.test(value);
}

function principal(value: unknown): AmicOsVaultNativeCopyPrincipalInput {
  if (!exactKeys(value, ['tenant_id', 'user_id']) ||
      ![value.tenant_id, value.user_id].every((item) => typeof item === 'string' && idPattern.test(item))) {
    invalid();
  }
  return { tenant_id: value.tenant_id as string, user_id: value.user_id as string };
}

function exactVersion(value: unknown): AmicOsVaultNativeCopyExactVersion {
  if (!exactKeys(value, [
    'document_id',
    'version_id',
    'file_object_id',
    'sha256',
    'byte_size',
    'mime_type',
  ]) ||
      ![value.document_id, value.version_id, value.file_object_id]
        .every((item) => typeof item === 'string' && uuidPattern.test(item)) ||
      typeof value.sha256 !== 'string' || !sha256Pattern.test(value.sha256) ||
      !Number.isSafeInteger(value.byte_size) || Number(value.byte_size) < 1 ||
      Number(value.byte_size) > AMIC_OS_VAULT_NATIVE_COPY_MAX_BYTES ||
      typeof value.mime_type !== 'string' ||
      !AMIC_OS_VAULT_NATIVE_COPY_MIME_TYPES.has(value.mime_type)) {
    invalid();
  }
  return {
    document_id: value.document_id as string,
    version_id: value.version_id as string,
    file_object_id: value.file_object_id as string,
    sha256: value.sha256,
    byte_size: Number(value.byte_size),
    mime_type: value.mime_type,
  };
}

function file(value: unknown, version: AmicOsVaultNativeCopyExactVersion): AmicOsVaultNativeCopyFile {
  if (!exactKeys(value, ['filename', 'sha256', 'byte_size', 'mime_type']) ||
      !boundedLabel(value.filename, 240) ||
      value.sha256 !== version.sha256 || value.byte_size !== version.byte_size ||
      value.mime_type !== version.mime_type) {
    invalid('native_copy_immutable_source_required');
  }
  return {
    filename: value.filename,
    sha256: value.sha256,
    byte_size: value.byte_size,
    mime_type: value.mime_type,
  };
}

function base(value: Record<string, unknown>): AmicOsVaultNativeCopyBaseInput {
  if (typeof value.lawos_matter_id !== 'string' || !idPattern.test(value.lawos_matter_id)) invalid();
  return {
    principal: principal(value.principal),
    lawos_matter_id: value.lawos_matter_id,
    requested_exact_version: exactVersion(value.requested_exact_version),
  };
}

function binding(value: Record<string, unknown>): Pick<AmicOsVaultNativeCopyBindingInput, 'copy_id' | 'snapshot_id'> {
  if (typeof value.copy_id !== 'string' || !copyIdPattern.test(value.copy_id) ||
      typeof value.snapshot_id !== 'string' || !snapshotIdPattern.test(value.snapshot_id)) {
    invalid();
  }
  return { copy_id: value.copy_id, snapshot_id: value.snapshot_id };
}

export function parseAmicOsVaultNativeCopyPrepareInput(
  value: unknown,
): AmicOsVaultNativeCopyPrepareInput {
  if (!exactKeys(value, [
    'principal',
    'lawos_matter_id',
    'requested_exact_version',
    'copy_id',
    'snapshot_id',
    'title',
    'mode',
    'file',
  ]) || !boundedLabel(value.title, 180) || !['clone', 'upload'].includes(String(value.mode))) {
    invalid();
  }
  const parsedBase = base(value);
  const mode = value.mode as 'clone' | 'upload';
  if (mode === 'clone' && value.file !== null || mode === 'upload' && value.file === null) invalid();
  return {
    ...parsedBase,
    ...binding(value),
    title: value.title,
    mode,
    file: value.file === null ? null : file(value.file, parsedBase.requested_exact_version),
  };
}

export function parseAmicOsVaultNativeCopyBindingInput(
  value: unknown,
): AmicOsVaultNativeCopyBindingInput {
  if (!exactKeys(value, [
    'principal',
    'lawos_matter_id',
    'requested_exact_version',
    'copy_id',
    'snapshot_id',
  ])) invalid();
  return { ...base(value), ...binding(value) };
}

export function parseAmicOsVaultNativeCopyReadInput(value: unknown): AmicOsVaultNativeCopyReadInput {
  if (!exactKeys(value, [
    'principal',
    'lawos_matter_id',
    'requested_exact_version',
    'copy_id',
    'snapshot_id',
    'offset',
  ]) || !Number.isSafeInteger(value.offset) || Number(value.offset) < 0 ||
      Number(value.offset) % AMIC_OS_VAULT_NATIVE_COPY_READ_BYTES !== 0) {
    invalid();
  }
  return { ...base(value), ...binding(value), offset: Number(value.offset) };
}

export function parseAmicOsVaultNativeCopyListInput(value: unknown): AmicOsVaultNativeCopyListInput {
  if (!isRecord(value)) invalid();
  const keys = Object.hasOwn(value, 'cursor')
    ? ['principal', 'lawos_matter_id', 'requested_exact_version', 'limit', 'cursor']
    : ['principal', 'lawos_matter_id', 'requested_exact_version', 'limit'];
  if (!exactKeys(value, keys) || !Number.isSafeInteger(value.limit) || Number(value.limit) < 1 ||
      Number(value.limit) > 50 || Object.hasOwn(value, 'cursor') &&
      (typeof value.cursor !== 'string' || !cursorPattern.test(value.cursor))) {
    invalid();
  }
  return {
    ...base(value),
    limit: Number(value.limit),
    ...(typeof value.cursor === 'string' ? { cursor: value.cursor } : {}),
  };
}
