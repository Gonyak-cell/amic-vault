import { createHash } from 'node:crypto';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { ClientDocumentAction, ClientDocumentAuthority } from '../../permission/client-document-authority';
import type { AmicOsVaultProviderConfig, AmicOsVaultProviderPrincipal } from './amic-os-vault-provider.guard';

export const clientDocumentSchemaVersion = 'amic-os.client-documents.v1';
export const clientDocumentProviderRevision = 'client-documents-v1';
export const maxClientDocumentBytes = 16 * 1024 * 1024;
export type ClientDocumentOperation = 'workspaces/resolve' | 'documents/list' | 'uploads/stage'
  | 'uploads/complete' | 'uploads/readback' | 'documents/versions' | 'documents/download'
  | 'metadata/read' | 'metadata/update';
export interface ClientDocumentMetadata {
  category: 'registry_extract' | 'business_registration_certificate' | 'engagement_contract' | 'other';
  issued_on: string | null;
  viewed_on: string | null;
}
export interface ClientDocumentEnvelope {
  schema_version: typeof clientDocumentSchemaVersion;
  request_id: string;
  principal: { tenant_id: string; user_id: string };
  scope: { type: 'client_documents'; party_id: string; workspace_ref: string };
  authorization: { decision: 'allow'; decision_ref: string; action: ClientDocumentAction; checked_at: string };
  input: Record<string, unknown>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
function invalid(): never { throw new BadRequestException({ code: 'VALIDATION_FAILED' }); }
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== keys.length || keys.some((key) => !Object.hasOwn(input, key))) return invalid();
  return input;
}
function text(value: unknown, max = 256): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max
    || [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return invalid();
  return value;
}
function id(value: unknown): string { const parsed = text(value); return uuid.test(parsed) ? parsed : invalid(); }
function date(value: unknown): string | null {
  if (value === null) return null;
  const parsed = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(parsed) || new Date(`${parsed}T00:00:00.000Z`).toISOString().slice(0, 10) !== parsed) return invalid();
  return parsed;
}
export function clientWorkspaceRef(osTenantId: string, partyId: string): string {
  return `workspace:client:${createHash('sha256').update(`${osTenantId}\0${partyId}`).digest('hex').slice(0, 32)}`;
}
export function clientOperationAction(operation: ClientDocumentOperation, input: Record<string, unknown>): ClientDocumentAction {
  if (operation === 'documents/download') return 'dms:document:download';
  if (operation === 'uploads/stage' || operation === 'uploads/complete' || operation === 'metadata/update'
    || (operation === 'workspaces/resolve' && input.mode === 'ensure')) return 'dms:document:write';
  return 'dms:document:read';
}
export function parseClientDocumentEnvelope(value: unknown, operation: ClientDocumentOperation): ClientDocumentEnvelope {
  const body = record(value, ['schema_version', 'request_id', 'principal', 'scope', 'authorization', 'input']);
  if (body.schema_version !== clientDocumentSchemaVersion) return invalid();
  text(body.request_id);
  const principal = record(body.principal, ['tenant_id', 'user_id']);
  text(principal.tenant_id); text(principal.user_id);
  const scope = record(body.scope, ['type', 'party_id', 'workspace_ref']);
  if (scope.type !== 'client_documents') return invalid();
  text(scope.party_id);
  if (scope.workspace_ref !== clientWorkspaceRef(String(principal.tenant_id), String(scope.party_id))) return invalid();
  const authorization = record(body.authorization, ['decision', 'decision_ref', 'action', 'checked_at']);
  text(authorization.decision_ref);
  const checkedAt = text(authorization.checked_at);
  const instant = Date.parse(checkedAt);
  if (!Number.isFinite(instant) || new Date(instant).toISOString() !== checkedAt) return invalid();
  if (instant > Date.now() + 5_000 || instant < Date.now() - 60_000) {
    throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
  }
  const fields: Record<ClientDocumentOperation, string[]> = {
    'workspaces/resolve': ['mode', 'idempotency_key'], 'documents/list': ['page', 'page_size'],
    'uploads/stage': ['idempotency_key', 'title', 'document_id', 'expected_version_id', 'file'],
    'uploads/complete': ['upload_id'], 'uploads/readback': ['upload_id'],
    'documents/versions': ['document_id'], 'documents/download': ['document_id', 'version_id'],
    'metadata/read': ['document_id'],
    'metadata/update': ['document_id', 'expected_revision', 'category', 'issued_on', 'viewed_on'],
  };
  const input = record(body.input, fields[operation]);
  if (authorization.decision !== 'allow' || authorization.action !== clientOperationAction(operation, input)) {
    throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
  }
  if ('document_id' in input && input.document_id !== null) id(input.document_id);
  if ('expected_version_id' in input && input.expected_version_id !== null) id(input.expected_version_id);
  if ('version_id' in input && input.version_id !== null) id(input.version_id);
  if (operation !== 'uploads/stage' && 'document_id' in input && input.document_id === null) return invalid();
  if ('upload_id' in input) id(input.upload_id);
  if (operation === 'workspaces/resolve') {
    if (input.mode !== 'read' && input.mode !== 'ensure') return invalid();
    if (input.idempotency_key !== null) text(input.idempotency_key);
    if (input.mode === 'ensure' && input.idempotency_key === null) return invalid();
  }
  if (operation === 'documents/list') {
    if (!Number.isSafeInteger(input.page) || Number(input.page) < 1 || Number(input.page) > 100000
      || !Number.isSafeInteger(input.page_size) || Number(input.page_size) < 1 || Number(input.page_size) > 100) return invalid();
  }
  if (operation === 'uploads/stage') {
    text(input.idempotency_key); text(input.title, 1000);
    if ((input.document_id === null) !== (input.expected_version_id === null)) return invalid();
    const file = record(input.file, ['filename', 'mime_type', 'byte_size', 'sha256']);
    text(file.filename, 255); text(file.mime_type, 128);
    if (!Number.isSafeInteger(file.byte_size) || Number(file.byte_size) < 1 || Number(file.byte_size) > maxClientDocumentBytes
      || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(file.sha256)) return invalid();
  }
  if (operation === 'metadata/update') {
    if (!Number.isSafeInteger(input.expected_revision) || Number(input.expected_revision) < 0) return invalid();
    if (!['registry_extract', 'business_registration_certificate', 'engagement_contract', 'other'].includes(String(input.category))) return invalid();
    date(input.issued_on); date(input.viewed_on);
    if (input.category !== 'registry_extract' && (input.issued_on !== null || input.viewed_on !== null)) return invalid();
  }
  return body as unknown as ClientDocumentEnvelope;
}
export function clientDocumentAuthority(
  principal: AmicOsVaultProviderPrincipal, envelope: ClientDocumentEnvelope, config: AmicOsVaultProviderConfig,
): ClientDocumentAuthority {
  if (principal.accountLedgerId !== envelope.principal.user_id
    || !config.acceptsClientTenant(envelope.principal.tenant_id, principal.tenantId)) {
    throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
  }
  return { tenantId: principal.tenantId, actorUserId: principal.actorUserId,
    osTenantId: envelope.principal.tenant_id, partyId: envelope.scope.party_id,
    workspaceRef: envelope.scope.workspace_ref, action: envelope.authorization.action,
    decisionRef: envelope.authorization.decision_ref, requestId: envelope.request_id };
}
