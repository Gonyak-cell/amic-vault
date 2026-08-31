import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { TenantId, UploadDocumentFieldsDto } from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../../audit/audit.service';
import type { UploadedDiskFile } from '../../document/document-upload.service';
import { FileExtensionValidator } from '../../document/validators/file-extension.validator';
import { MimeTypeValidator } from '../../document/validators/mime-type.validator';
import {
  QuarantineIntakeService,
  type BoundQuarantineIntakeResult,
} from '../../file-security/quarantine-intake.service';
import { MatterSourcePolicyService } from '../matter-app/matter-source-policy';
import { StorageService } from '../../storage/storage.service';
import { TenantContextService } from '../../tenant/tenant-context';
import type {
  AmicOsVaultExactVersion,
  AmicOsVaultUploadCommit,
  AmicOsVaultUploadCommitInput,
  AmicOsVaultUploadCompleteInput,
  AmicOsVaultUploadDecisions,
  AmicOsVaultUploadFingerprint,
  AmicOsVaultUploadOperationKind,
  AmicOsVaultUploadPreflight,
  AmicOsVaultUploadPreflightInput,
  AmicOsVaultUploadPrepareInput,
  AmicOsVaultUploadReadbackInput,
  AmicOsVaultUploadResolvedBinding,
} from './amic-os-vault-upload.contract';
import {
  AMIC_OS_VAULT_MAX_BUFFERED_UPLOAD_BYTES,
  AMIC_OS_VAULT_MAX_UPLOAD_BYTES,
} from './amic-os-vault-upload.contract';
import {
  AmicOsVaultProviderConfig,
  type AmicOsVaultProviderPrincipal,
} from './amic-os-vault-provider.guard';

const preflightLifetimeMs = 2 * 60 * 60 * 1000;
const transferLifetimeSeconds = 2 * 60 * 60;
const retryAfterMs = 1_000;
const uuidNamespace = '89a6d751-46f5-5bd7-9309-17b23927c160';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface MatterRow {
  matter_id: string;
  status: string;
  legal_hold: boolean;
}

interface PreflightAuditRow {
  event_id: string;
  created_at: Date;
  correlation_id: string | null;
  metadata_json: Record<string, unknown>;
}

interface UploadStateRow {
  scan_id: string;
  matter_id: string;
  expected_sha256: string;
  size_bytes: string;
  state: string;
  result_code: string;
  created_by: string;
  original_filename: string;
  normalized_filename: string;
  mime_type: string;
  source_system: string;
  fields_json: unknown;
  document_id: string | null;
  version_id: string | null;
  file_object_id: string | null;
  primary_sha256: string | null;
  storage_uri: string | null;
  file_sha256: string | null;
  file_size_bytes: string | null;
  file_mime_type: string | null;
  document_matter_id: string | null;
  matter_status: string;
  matter_legal_hold: boolean;
}

interface OperationAuditRow {
  event_id: string;
  correlation_id: string | null;
  metadata_json: Record<string, unknown>;
}

function validationFailed(reason?: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    ...(reason ? { reason } : {}),
  });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function stateConflict(reason?: string): ConflictException {
  return new ConflictException({
    code: 'VALIDATION_FAILED',
    ...(reason ? { reason } : {}),
  });
}

function expired(): GoneException {
  return new GoneException({ code: 'PERMISSION_DENIED' });
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableHash(namespace: string, values: readonly unknown[]): string {
  return sha256(`${namespace}\0${JSON.stringify(values)}`);
}

function decisionRef(namespace: string, values: readonly unknown[]): string {
  return `vault-upload-${namespace}:${stableHash(namespace, values).slice(0, 40)}`;
}

function uuidBytes(value: string): Buffer {
  return Buffer.from(value.replaceAll('-', ''), 'hex');
}

function formatUuid(value: Buffer): string {
  const hex = value.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function uuidV5(name: string): string {
  const bytes = createHash('sha1')
    .update(uuidBytes(uuidNamespace))
    .update(name, 'utf8')
    .digest()
    .subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  return formatUuid(bytes);
}

function preflightTargetId(tenantId: string, operationId: string): string {
  return uuidV5(`amic-os-vault-upload-preflight-v1\0${tenantId}\0${operationId}`);
}

function quarantineRef(tenantId: string, operationId: string): string {
  return uuidV5(`amic-os-vault-upload-quarantine-v1\0${tenantId}\0${operationId}`);
}

function preflightRef(tenantId: string, operationId: string): string {
  return `vault-preflight:${preflightTargetId(tenantId, operationId)}`;
}

function providerOperationRef(tenantId: string, operationId: string): string {
  return `vault-upload:${quarantineRef(tenantId, operationId)}`;
}

function transferRef(tenantId: string, operationId: string): string {
  return `vault-transfer:${quarantineRef(tenantId, operationId)}`;
}

function sameFingerprint(
  left: AmicOsVaultUploadFingerprint,
  right: AmicOsVaultUploadFingerprint,
): boolean {
  return (
    left.sha256 === right.sha256 &&
    left.byte_size === right.byte_size &&
    left.mime_type === right.mime_type
  );
}

function requestKind(input: AmicOsVaultUploadPreflightInput): string {
  return input.source?.kind ?? 'local_file';
}

function operationRequestKind(kind: AmicOsVaultUploadOperationKind): string {
  if (kind === 'save_email') return 'microsoft_graph_mime';
  if (kind === 'save_email_attachment') return 'microsoft_graph_mime_attachment';
  return 'local_file';
}

function preflightRequestHash(
  principal: AmicOsVaultProviderPrincipal,
  input: AmicOsVaultUploadPreflightInput,
): string {
  return stableHash('amic-os-vault-upload-preflight-request-v1', [
    principal.tenantId,
    principal.actorUserId,
    principal.accountLedgerId,
    input.principal.tenant_id,
    input.lawos_matter_id,
    input.requested_workspace_id,
    input.requested_folder_id,
    input.source ?? null,
    input.operation_id,
    input.correlation_id,
  ]);
}

function preflightBindingHash(
  resolved: AmicOsVaultUploadResolvedBinding,
  decisions: AmicOsVaultUploadDecisions,
): string {
  return stableHash('amic-os-vault-upload-preflight-binding-v1', [resolved, decisions]);
}

function operationBindingHash(
  principal: AmicOsVaultProviderPrincipal,
  operation: {
    operation_id: string;
    correlation_id: string;
    operation_kind: AmicOsVaultUploadOperationKind;
  },
  preflight: AmicOsVaultUploadPreflight,
  fingerprint: AmicOsVaultUploadFingerprint,
): string {
  return stableHash('amic-os-vault-upload-operation-binding-v1', [
    principal.tenantId,
    principal.actorUserId,
    principal.accountLedgerId,
    operation.operation_id,
    operation.correlation_id,
    operation.operation_kind,
    preflight.audit.event_id,
    preflight.resolved,
    fingerprint,
  ]);
}

function normalizeTransportFilename(filename: string): string {
  if ([...filename].some((character) => (character.codePointAt(0) ?? 0) > 0xff)) {
    return filename.normalize('NFC');
  }
  const repaired = Buffer.from(filename, 'latin1').toString('utf8');
  return (repaired.includes('\uFFFD') ? filename : repaired).normalize('NFC');
}

function promotionFields(
  kind: AmicOsVaultUploadOperationKind,
  folderId: string | null,
): UploadDocumentFieldsDto {
  return {
    aiAllowed: false,
    documentType: kind === 'save_email' ? 'email' : 'other',
    duplicateDecision: 'new_document',
    source: 'internal_work_product',
    ...(folderId ? { folderId } : {}),
  };
}

function sourceSystem(
  kind: AmicOsVaultUploadOperationKind,
): 'upload' | 'email_ingest' {
  return kind === 'save_local_file' ? 'upload' : 'email_ingest';
}

function canonicalInstant(value: unknown): string | null {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return typeof value === 'string' && Number.isFinite(parsed) && new Date(parsed).toISOString() === value
    ? value
    : null;
}

function exactVersion(row: UploadStateRow): AmicOsVaultExactVersion | null {
  const byteSize = Number(row.file_size_bytes);
  if (
    !row.document_id ||
    !row.version_id ||
    !row.file_object_id ||
    !row.file_sha256 ||
    !row.file_mime_type ||
    !Number.isSafeInteger(byteSize) ||
    byteSize < 1
  ) {
    return null;
  }
  return {
    document_id: row.document_id,
    version_id: row.version_id,
    file_object_id: row.file_object_id,
    sha256: row.file_sha256,
    byte_size: byteSize,
    mime_type: row.file_mime_type.toLowerCase(),
  };
}

@Injectable()
export class AmicOsVaultUploadService {
  private readonly extensionValidator = new FileExtensionValidator();
  private readonly mimeTypeValidator = new MimeTypeValidator();

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(MatterSourcePolicyService)
    private readonly matterSourcePolicy: MatterSourcePolicyService,
    @Inject(QuarantineIntakeService)
    private readonly quarantineIntake: QuarantineIntakeService,
    @Inject(StorageService) private readonly storageService: StorageService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(AmicOsVaultProviderConfig)
    private readonly config: AmicOsVaultProviderConfig,
  ) {}

  async preflight(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultUploadPreflightInput,
  ): Promise<AmicOsVaultUploadPreflight> {
    this.assertPrincipal(principal, input.principal.user_id);
    try {
      return await this.auditService.transaction(principal.tenantId, async (tx) => {
        const targetId = preflightTargetId(principal.tenantId, input.operation_id);
        await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
          `${principal.tenantId}:${targetId}`,
        ]);
        const matter = await this.resolveLawosMatter(tx, principal.tenantId, input.lawos_matter_id);
        const decisions = await this.evaluateUploadPolicy(principal, matter);
        const resolved: AmicOsVaultUploadResolvedBinding = {
          vault_tenant_id: principal.tenantId,
          vault_actor_id: principal.actorUserId,
          vault_matter_id: matter.matter_id,
          vault_workspace_id: await this.resolveWorkspace(
            tx,
            principal.tenantId,
            input.requested_workspace_id,
          ),
          vault_folder_id: await this.resolveFolder(
            tx,
            principal.tenantId,
            matter.matter_id,
            input.requested_folder_id,
          ),
        };
        const requestHash = preflightRequestHash(principal, input);
        const bindingHash = preflightBindingHash(resolved, decisions);
        const existing = await this.readPreflightAudit(tx, principal, targetId);
        if (existing.length > 1) throw stateConflict('VAULT_UPLOAD_PREFLIGHT_DUPLICATED');

        let auditEventId: string;
        let expiresAt: string;
        const current = existing[0];
        if (current) {
          const metadata = current.metadata_json;
          expiresAt = canonicalInstant(metadata.expires_at) ?? '';
          if (
            current.correlation_id !== input.correlation_id ||
            metadata.request_id !== input.operation_id ||
            metadata.client_request_hash !== requestHash ||
            metadata.metadata_hash !== bindingHash ||
            metadata.request_kind !== requestKind(input) ||
            (input.source
              ? metadata.message_hash !== input.source.ref_sha256
              : Object.hasOwn(metadata, 'message_hash'))
          ) {
            throw stateConflict('VAULT_UPLOAD_PREFLIGHT_CONFLICT');
          }
          if (!expiresAt || Date.parse(expiresAt) <= Date.now()) throw expired();
          auditEventId = current.event_id;
        } else {
          expiresAt = new Date(Date.now() + preflightLifetimeMs).toISOString();
          const audit = await this.auditService.log(
            {
              tenantId: principal.tenantId,
              actorId: principal.actorUserId,
              action: 'OUTLOOK_DOCUMENT_INSERT_REQUESTED',
              targetType: 'amic_os_vault_upload_preflight',
              targetId,
              matterId: matter.matter_id,
              result: 'success',
              metadata: {
                request_id: input.operation_id,
                correlation_id: input.correlation_id,
                client_request_hash: requestHash,
                metadata_hash: bindingHash,
                request_kind: requestKind(input),
                policy_mode: 'vault_upload_preflight',
                scope_id: resolved.vault_workspace_id,
                folder_ref_hash: sha256(resolved.vault_folder_id ?? 'root'),
                expires_at: expiresAt,
                ...(input.source ? { message_hash: input.source.ref_sha256 } : {}),
              },
            },
            tx,
          );
          auditEventId = audit.eventId;
        }

        return {
          authority_kind: 'amic-vault-api',
          authority_ref: this.config.uploadAuthorityRef(),
          provider_revision: this.config.uploadProviderRevision(),
          preflight_ref: preflightRef(principal.tenantId, input.operation_id),
          expires_at: expiresAt,
          resolved,
          decisions,
          audit: {
            event_id: auditEventId,
            correlation_id: input.correlation_id,
          },
        };
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw permissionDenied();
    }
  }

  async commit(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultUploadCommitInput,
    uploadedFile: UploadedDiskFile | undefined,
  ): Promise<AmicOsVaultUploadCommit> {
    this.assertPrincipal(principal, input.principal.user_id);
    const file = this.assertUploadedFile(uploadedFile, input.file);
    await this.assertPreflightAudit(
      principal,
      input.preflight,
      input.operation.operation_id,
      input.operation.correlation_id,
      operationRequestKind(input.operation.operation_kind),
      input.source?.ref_sha256 ?? null,
    );
    const fingerprint: AmicOsVaultUploadFingerprint = {
      sha256: input.file.sha256,
      byte_size: input.file.byte_size,
      mime_type: input.file.mime_type,
    };
    const bindingHash = operationBindingHash(
      principal,
      input.operation,
      input.preflight,
      fingerprint,
    );
    const idempotencyHash = sha256(input.operation.idempotency_key);
    const accepted: BoundQuarantineIntakeResult = await this.quarantineIntake.intakeBound({
      actorUserId: principal.actorUserId,
      matterId: input.preflight.resolved.vault_matter_id,
      fields: promotionFields(
        input.operation.operation_kind,
        input.preflight.resolved.vault_folder_id,
      ),
      file,
      sourceSystem: sourceSystem(input.operation.operation_kind),
      binding: {
        quarantineRef: quarantineRef(principal.tenantId, input.operation.operation_id),
        expectedSha256: fingerprint.sha256,
        preflightAuditEventId: input.preflight.audit.event_id,
        preflightTargetId: preflightTargetId(principal.tenantId, input.operation.operation_id),
        preflightClientBindingHash: preflightBindingHash(
          input.preflight.resolved,
          input.preflight.decisions,
        ),
        correlationId: input.operation.correlation_id,
        requestFingerprint: bindingHash,
        idempotencyHash,
        expiresAt: input.preflight.expires_at,
      },
    });
    if (
      accepted.expectedSha256 !== fingerprint.sha256 ||
      accepted.byteSize !== fingerprint.byte_size ||
      accepted.mimeType !== fingerprint.mime_type
    ) {
      throw stateConflict('VAULT_UPLOAD_QUARANTINE_MISMATCH');
    }
    return {
      authority_kind: 'amic-vault-api',
      authority_ref: this.config.uploadAuthorityRef(),
      provider_revision: this.config.uploadProviderRevision(),
      state: 'quarantined',
      provider_operation_ref: providerOperationRef(
        principal.tenantId,
        input.operation.operation_id,
      ),
      accepted: fingerprint,
      exact_version: null,
      retry_after_ms: retryAfterMs,
      audit: {
        event_id: accepted.auditEventId,
        correlation_id: input.operation.correlation_id,
      },
    };
  }

  async prepare(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultUploadPrepareInput,
  ): Promise<{
    authority_kind: 'amic-vault-api';
    authority_ref: string;
    provider_revision: string;
    state: 'transfer_ready';
    transfer_ref: string;
    expires_at: string;
    method: 'PUT';
    upload_url: string;
    required_headers: Readonly<Record<string, string>>;
    file: { filename: string; byte_size: number; mime_type: string };
    max_upload_bytes: number;
  }> {
    this.assertPrincipal(principal, input.principal.user_id);
    await this.assertPreflightAudit(
      principal,
      input.preflight,
      input.operation.operation_id,
      input.operation.correlation_id,
      'local_file',
      null,
    );
    if (Date.parse(input.preflight.expires_at) <= Date.now()) throw expired();
    const { extension, normalizedFilename } = this.extensionValidator.validate(input.file.filename);
    const declaration = this.mimeTypeValidator.validateDeclaration({
      extension,
      declaredMimeType: input.file.mime_type,
    });
    if (
      normalizedFilename !== input.file.filename ||
      declaration.mimeType !== input.file.mime_type
    ) {
      throw validationFailed('VAULT_UPLOAD_DECLARATION_MISMATCH');
    }
    const remainingSeconds = Math.max(
      1,
      Math.floor((Date.parse(input.preflight.expires_at) - Date.now()) / 1_000),
    );
    const transfer = await this.storageService.createQuarantineWriteUrl({
      tenantId: principal.tenantId,
      quarantineRef: quarantineRef(principal.tenantId, input.operation.operation_id),
      contentLength: input.file.byte_size,
      contentType: input.file.mime_type,
      expiresInSeconds: Math.min(transferLifetimeSeconds, remainingSeconds),
    });
    return {
      authority_kind: 'amic-vault-api',
      authority_ref: this.config.uploadAuthorityRef(),
      provider_revision: this.config.uploadProviderRevision(),
      state: 'transfer_ready',
      transfer_ref: transferRef(principal.tenantId, input.operation.operation_id),
      expires_at: transfer.expiresAt.toISOString(),
      method: 'PUT',
      upload_url: transfer.url,
      required_headers: transfer.headers,
      file: {
        filename: input.file.filename,
        byte_size: input.file.byte_size,
        mime_type: input.file.mime_type,
      },
      max_upload_bytes: AMIC_OS_VAULT_MAX_UPLOAD_BYTES,
    };
  }

  async complete(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultUploadCompleteInput,
  ): Promise<AmicOsVaultUploadCommit> {
    this.assertPrincipal(principal, input.principal.user_id);
    if (input.transfer.transfer_ref !== transferRef(principal.tenantId, input.operation.operation_id)) {
      throw stateConflict('VAULT_UPLOAD_TRANSFER_MISMATCH');
    }
    await this.assertPreflightAudit(
      principal,
      input.preflight,
      input.operation.operation_id,
      input.operation.correlation_id,
      'local_file',
      null,
    );
    const fingerprint: AmicOsVaultUploadFingerprint = {
      sha256: input.file.sha256,
      byte_size: input.file.byte_size,
      mime_type: input.file.mime_type,
    };
    const bindingHash = operationBindingHash(
      principal,
      input.operation,
      input.preflight,
      fingerprint,
    );
    const accepted = await this.quarantineIntake.intakeBoundStored({
      actorUserId: principal.actorUserId,
      matterId: input.preflight.resolved.vault_matter_id,
      fields: promotionFields('save_local_file', input.preflight.resolved.vault_folder_id),
      file: {
        originalFilename: input.file.filename,
        mimeType: input.file.mime_type,
        byteSize: input.file.byte_size,
      },
      sourceSystem: 'upload',
      binding: {
        quarantineRef: quarantineRef(principal.tenantId, input.operation.operation_id),
        expectedSha256: fingerprint.sha256,
        preflightAuditEventId: input.preflight.audit.event_id,
        preflightTargetId: preflightTargetId(principal.tenantId, input.operation.operation_id),
        preflightClientBindingHash: preflightBindingHash(
          input.preflight.resolved,
          input.preflight.decisions,
        ),
        correlationId: input.operation.correlation_id,
        requestFingerprint: bindingHash,
        idempotencyHash: sha256(input.operation.idempotency_key),
        expiresAt: input.preflight.expires_at,
      },
    });
    if (
      accepted.expectedSha256 !== fingerprint.sha256 ||
      accepted.byteSize !== fingerprint.byte_size ||
      accepted.mimeType !== fingerprint.mime_type
    ) {
      throw stateConflict('VAULT_UPLOAD_QUARANTINE_MISMATCH');
    }
    return {
      authority_kind: 'amic-vault-api',
      authority_ref: this.config.uploadAuthorityRef(),
      provider_revision: this.config.uploadProviderRevision(),
      state: 'quarantined',
      provider_operation_ref: providerOperationRef(principal.tenantId, input.operation.operation_id),
      accepted: fingerprint,
      exact_version: null,
      retry_after_ms: retryAfterMs,
      audit: {
        event_id: accepted.auditEventId,
        correlation_id: input.operation.correlation_id,
      },
    };
  }

  async readback(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultUploadReadbackInput,
  ): Promise<{
    authority_kind: 'amic-vault-api';
    authority_ref: string;
    provider_revision: string;
    state:
      | 'quarantined'
      | 'scanning'
      | 'readback_verified'
      | 'infected'
      | 'security_hold'
      | 'scan_error';
    provider_operation_ref: string;
    exact_version: AmicOsVaultExactVersion | null;
    retry_after_ms: number | null;
    decisions: AmicOsVaultUploadDecisions | null;
    audit: { event_id: string; correlation_id: string };
  }> {
    this.assertPrincipal(principal, input.principal.user_id);
    if (!sameFingerprint(input.commit.accepted, input.expected)) {
      throw stateConflict('VAULT_UPLOAD_EXPECTED_MISMATCH');
    }
    this.assertCommitIdentity(principal, input);
    await this.assertPreflightAudit(
      principal,
      input.preflight,
      input.operation.operation_id,
      input.operation.correlation_id,
      operationRequestKind(input.operation.operation_kind),
      null,
      true,
    );

    const operationFingerprint = operationBindingHash(
      principal,
      input.operation,
      input.preflight,
      input.expected,
    );
    const result = await this.auditService.transaction(principal.tenantId, async (tx) => {
      const state = await this.readUploadState(
        tx,
        principal.tenantId,
        quarantineRef(principal.tenantId, input.operation.operation_id),
      );
      if (!state) throw stateConflict('VAULT_UPLOAD_OPERATION_NOT_FOUND');
      const intakeAudit = await this.requireOperationAudit(
        tx,
        principal,
        state.scan_id,
        'FILE_QUARANTINED',
        input.operation.correlation_id,
        operationFingerprint,
        input.expected.sha256,
      );
      if (
        intakeAudit.event_id !== input.commit.audit.event_id ||
        state.matter_id !== input.preflight.resolved.vault_matter_id ||
        state.created_by !== principal.actorUserId ||
        state.expected_sha256 !== input.expected.sha256 ||
        Number(state.size_bytes) !== input.expected.byte_size ||
        state.mime_type.toLowerCase() !== input.expected.mime_type
      ) {
        throw stateConflict('VAULT_UPLOAD_OPERATION_MISMATCH');
      }

      if (state.state === 'infected') {
        return this.negativeReadback(input, intakeAudit.event_id, 'infected');
      }
      if (state.state === 'security_hold') {
        return this.negativeReadback(input, intakeAudit.event_id, 'security_hold');
      }
      if (state.state === 'error') {
        return this.negativeReadback(input, intakeAudit.event_id, 'scan_error');
      }

      const decisions = await this.evaluateUploadPolicy(principal, {
        matter_id: state.matter_id,
        status: state.matter_status,
        legal_hold: state.matter_legal_hold,
      });
      if (state.state !== 'promoted') {
        return {
          authority_kind: 'amic-vault-api' as const,
          authority_ref: this.config.uploadAuthorityRef(),
          provider_revision: this.config.uploadProviderRevision(),
          state: state.state === 'quarantined' ? 'quarantined' as const : 'scanning' as const,
          provider_operation_ref: input.commit.provider_operation_ref,
          exact_version: null,
          retry_after_ms: retryAfterMs,
          decisions,
          audit: {
            event_id: intakeAudit.event_id,
            correlation_id: input.operation.correlation_id,
          },
        };
      }

      const exact = exactVersion(state);
      if (
        !exact ||
        !sameFingerprint(exact, input.expected) ||
        state.primary_sha256 !== input.expected.sha256 ||
        state.document_matter_id !== state.matter_id ||
        !state.storage_uri
      ) {
        throw stateConflict('VAULT_UPLOAD_PROMOTION_MISMATCH');
      }
      const head = await this.storageService.headByStorageUri(
        principal.tenantId,
        state.storage_uri,
      );
      if (
        !head ||
        head.contentLength !== exact.byte_size ||
        head.contentType?.toLowerCase() !== exact.mime_type ||
        await this.storageService.sha256ByStorageUri(
          principal.tenantId,
          state.storage_uri,
        ) !== exact.sha256
      ) {
        throw stateConflict('VAULT_UPLOAD_PRIMARY_READBACK_MISMATCH');
      }
      const promotionAudit = await this.requireOperationAudit(
        tx,
        principal,
        state.scan_id,
        'FILE_PROMOTED',
        input.operation.correlation_id,
        operationFingerprint,
        input.expected.sha256,
      );
      return {
        authority_kind: 'amic-vault-api' as const,
        authority_ref: this.config.uploadAuthorityRef(),
        provider_revision: this.config.uploadProviderRevision(),
        state: 'readback_verified' as const,
        provider_operation_ref: input.commit.provider_operation_ref,
        exact_version: exact,
        retry_after_ms: null,
        decisions,
        audit: {
          event_id: promotionAudit.event_id,
          correlation_id: input.operation.correlation_id,
        },
      };
    });
    return result;
  }

  private assertPrincipal(
    principal: AmicOsVaultProviderPrincipal,
    accountLedgerId: string,
  ): void {
    const context = this.tenantContext.require();
    if (
      context.source !== 'amic-os-provider' ||
      context.tenantId !== principal.tenantId ||
      principal.accountLedgerId !== accountLedgerId
    ) {
      throw permissionDenied();
    }
  }

  private async resolveLawosMatter(
    tx: QueryClient,
    tenantId: string,
    lawosMatterId: string,
  ): Promise<MatterRow> {
    const result = await tx.query(
      `
        SELECT matter_id, status, legal_hold
        FROM matters
        WHERE tenant_id = $1::uuid
          AND (
            metadata_json ->> 'lawosMatterId' = $2
            OR metadata_json ->> 'matterAppMatterId' = $2
          )
        ORDER BY matter_id
        LIMIT 2
      `,
      [tenantId, lawosMatterId],
    );
    const rows = result.rows as MatterRow[];
    if (rows.length !== 1 || !rows[0]) throw permissionDenied();
    return rows[0];
  }

  private async evaluateUploadPolicy(
    principal: AmicOsVaultProviderPrincipal,
    matter: MatterRow,
  ): Promise<AmicOsVaultUploadDecisions> {
    const source = await this.matterSourcePolicy.assertUploadMutationAllowed({
      actorUserId: principal.actorUserId,
      matterId: matter.matter_id,
      tenantId: principal.tenantId as TenantId,
      purpose: 'document_upload',
    });
    return {
      permission: {
        effect: 'allow',
        decision_ref: decisionRef('permission', [source.permissionDecisionRef]),
      },
      ethical_wall: {
        effect: 'allow',
        decision_ref: decisionRef('ethical-wall', [source.permissionDecisionRef, 'clear']),
      },
      records: {
        effect: 'allow',
        decision_ref: decisionRef('records', [matter.status, matter.legal_hold]),
      },
      dlp: {
        effect: 'deferred',
        decision_ref: decisionRef('dlp', ['quarantine-ingress', 'deferred']),
      },
    };
  }

  private async resolveWorkspace(
    tx: QueryClient,
    tenantId: string,
    requestedWorkspaceId: string | null,
  ): Promise<string> {
    if (requestedWorkspaceId !== null && !uuidPattern.test(requestedWorkspaceId)) {
      throw permissionDenied();
    }
    const result = await tx.query(
      `
        SELECT workspace_id
        FROM workspaces
        WHERE tenant_id = $1::uuid
          AND status = 'active'
          AND ($2::uuid IS NULL OR workspace_id = $2::uuid)
        ORDER BY created_at, workspace_id
        LIMIT 1
      `,
      [tenantId, requestedWorkspaceId],
    );
    const workspaceId = (result.rows[0] as { workspace_id?: string } | undefined)?.workspace_id;
    if (!workspaceId) throw permissionDenied();
    return workspaceId;
  }

  private async resolveFolder(
    tx: QueryClient,
    tenantId: string,
    matterId: string,
    requestedFolderId: string | null,
  ): Promise<string | null> {
    if (requestedFolderId === null) return null;
    if (!uuidPattern.test(requestedFolderId)) throw permissionDenied();
    const result = await tx.query(
      `
        SELECT folder_id
        FROM document_folders
        WHERE tenant_id = $1::uuid
          AND matter_id = $2::uuid
          AND folder_id = $3::uuid
        LIMIT 1
      `,
      [tenantId, matterId, requestedFolderId],
    );
    const folderId = (result.rows[0] as { folder_id?: string } | undefined)?.folder_id;
    if (!folderId) throw permissionDenied();
    return folderId;
  }

  private async readPreflightAudit(
    tx: QueryClient,
    principal: AmicOsVaultProviderPrincipal,
    targetId: string,
  ): Promise<PreflightAuditRow[]> {
    const result = await tx.query(
      `
        SELECT event_id, created_at, correlation_id, metadata_json
        FROM audit_events
        WHERE tenant_id = $1::uuid
          AND actor_id = $2::uuid
          AND action = 'OUTLOOK_DOCUMENT_INSERT_REQUESTED'
          AND target_type = 'amic_os_vault_upload_preflight'
          AND target_id = $3::uuid
        ORDER BY seq
        LIMIT 2
      `,
      [principal.tenantId, principal.actorUserId, targetId],
    );
    return result.rows as PreflightAuditRow[];
  }

  private async assertPreflightAudit(
    principal: AmicOsVaultProviderPrincipal,
    preflight: AmicOsVaultUploadPreflight,
    operationId: string,
    correlationId: string,
    expectedRequestKind: string,
    sourceRefSha256: string | null,
    allowSourceOmission = false,
  ): Promise<void> {
    const targetId = preflightTargetId(principal.tenantId, operationId);
    const expectedPreflightRef = preflightRef(principal.tenantId, operationId);
    if (
      preflight.authority_kind !== 'amic-vault-api' ||
      preflight.authority_ref !== this.config.uploadAuthorityRef() ||
      preflight.provider_revision !== this.config.uploadProviderRevision() ||
      preflight.preflight_ref !== expectedPreflightRef ||
      preflight.audit.correlation_id !== correlationId ||
      preflight.resolved.vault_tenant_id !== principal.tenantId ||
      preflight.resolved.vault_actor_id !== principal.actorUserId
    ) {
      throw stateConflict('VAULT_UPLOAD_PREFLIGHT_IDENTITY_MISMATCH');
    }
    const bindingHash = preflightBindingHash(preflight.resolved, preflight.decisions);
    await this.auditService.transaction(principal.tenantId, async (tx) => {
      const result = await tx.query(
        `
          SELECT correlation_id, metadata_json
          FROM audit_events
          WHERE tenant_id = $1::uuid
            AND event_id = $2::uuid
            AND actor_id = $3::uuid
            AND action = 'OUTLOOK_DOCUMENT_INSERT_REQUESTED'
            AND target_type = 'amic_os_vault_upload_preflight'
            AND target_id = $4::uuid
            AND matter_id = $5::uuid
          LIMIT 2
        `,
        [
          principal.tenantId,
          preflight.audit.event_id,
          principal.actorUserId,
          targetId,
          preflight.resolved.vault_matter_id,
        ],
      );
      const rows = result.rows as Array<{
        correlation_id: string | null;
        metadata_json: Record<string, unknown>;
      }>;
      const row = rows[0];
      const metadata = row?.metadata_json;
      if (
        rows.length !== 1 ||
        row?.correlation_id !== correlationId ||
        metadata?.request_id !== operationId ||
        metadata?.metadata_hash !== bindingHash ||
        metadata?.expires_at !== preflight.expires_at ||
        metadata?.request_kind !== expectedRequestKind ||
        (sourceRefSha256 !== null && metadata?.message_hash !== sourceRefSha256) ||
        (!allowSourceOmission && sourceRefSha256 === null && metadata && Object.hasOwn(metadata, 'message_hash'))
      ) {
        throw stateConflict('VAULT_UPLOAD_PREFLIGHT_AUDIT_MISMATCH');
      }
    });
  }

  private assertUploadedFile(
    file: UploadedDiskFile | undefined,
    expected: AmicOsVaultUploadCommitInput['file'],
  ): UploadedDiskFile {
    if (
      !file ||
      typeof file.path !== 'string' ||
      !Number.isSafeInteger(file.size) ||
      file.size < 1 ||
      file.size > AMIC_OS_VAULT_MAX_BUFFERED_UPLOAD_BYTES ||
      file.size !== expected.byte_size ||
      file.mimetype.toLowerCase() !== expected.mime_type ||
      normalizeTransportFilename(file.originalname) !== expected.filename
    ) {
      throw validationFailed('VAULT_UPLOAD_MULTIPART_MISMATCH');
    }
    return {
      path: file.path,
      originalname: expected.filename,
      mimetype: expected.mime_type,
      size: expected.byte_size,
    };
  }

  private assertCommitIdentity(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultUploadReadbackInput,
  ): void {
    if (
      input.commit.authority_kind !== 'amic-vault-api' ||
      input.commit.authority_ref !== this.config.uploadAuthorityRef() ||
      input.commit.provider_revision !== this.config.uploadProviderRevision() ||
      input.commit.state !== 'quarantined' ||
      input.commit.exact_version !== null ||
      input.commit.provider_operation_ref !== providerOperationRef(
        principal.tenantId,
        input.operation.operation_id,
      ) ||
      input.commit.audit.correlation_id !== input.operation.correlation_id
    ) {
      throw stateConflict('VAULT_UPLOAD_COMMIT_IDENTITY_MISMATCH');
    }
  }

  private async readUploadState(
    tx: QueryClient,
    tenantId: string,
    expectedQuarantineRef: string,
  ): Promise<UploadStateRow | null> {
    const result = await tx.query(
      `
        SELECT s.scan_id, s.matter_id, s.expected_sha256, s.size_bytes::text,
          s.state, s.result_code, s.created_by,
          i.original_filename, i.normalized_filename, i.mime_type, i.source_system,
          i.fields_json,
          p.document_id, p.version_id, p.file_object_id, p.primary_sha256,
          f.storage_uri, f.sha256 AS file_sha256, f.size_bytes::text AS file_size_bytes,
          lower(f.mime_type) AS file_mime_type,
          d.matter_id AS document_matter_id,
          m.status AS matter_status, m.legal_hold AS matter_legal_hold
        FROM file_security_scans s
        JOIN file_security_promotion_inputs i
          ON i.tenant_id = s.tenant_id AND i.scan_id = s.scan_id
        JOIN matters m
          ON m.tenant_id = s.tenant_id AND m.matter_id = s.matter_id
        LEFT JOIN file_security_promotions p
          ON p.tenant_id = s.tenant_id AND p.scan_id = s.scan_id
        LEFT JOIN documents d
          ON d.tenant_id = p.tenant_id AND d.document_id = p.document_id
        LEFT JOIN document_versions v
          ON v.tenant_id = p.tenant_id
         AND v.version_id = p.version_id
         AND v.document_id = p.document_id
         AND v.file_object_id = p.file_object_id
        LEFT JOIN file_objects f
          ON f.tenant_id = p.tenant_id AND f.file_object_id = p.file_object_id
        WHERE s.tenant_id = $1::uuid
          AND s.quarantine_ref = $2::uuid
        LIMIT 1
      `,
      [tenantId, expectedQuarantineRef],
    );
    return (result.rows[0] as UploadStateRow | undefined) ?? null;
  }

  private async requireOperationAudit(
    tx: QueryClient,
    principal: AmicOsVaultProviderPrincipal,
    scanId: string,
    action: 'FILE_QUARANTINED' | 'FILE_PROMOTED',
    correlationId: string,
    requestFingerprint: string,
    expectedSha256: string,
  ): Promise<OperationAuditRow> {
    const result = await tx.query(
      `
        SELECT event_id, correlation_id, metadata_json
        FROM audit_events
        WHERE tenant_id = $1::uuid
          AND actor_id = $2::uuid
          AND action = $3
          AND target_type = 'file_security_scan'
          AND target_id = $4::uuid
        ORDER BY seq
        LIMIT 2
      `,
      [principal.tenantId, principal.actorUserId, action, scanId],
    );
    const rows = result.rows as OperationAuditRow[];
    const row = rows[0];
    if (
      rows.length !== 1 ||
      !row ||
      row.correlation_id !== correlationId ||
      row.metadata_json.request_id !== requestFingerprint ||
      row.metadata_json.hash !== expectedSha256
    ) {
      throw stateConflict('VAULT_UPLOAD_AUDIT_BINDING_MISMATCH');
    }
    return row;
  }

  private negativeReadback(
    input: AmicOsVaultUploadReadbackInput,
    auditEventId: string,
    state: 'infected' | 'security_hold' | 'scan_error',
  ) {
    return {
      authority_kind: 'amic-vault-api' as const,
      authority_ref: this.config.uploadAuthorityRef(),
      provider_revision: this.config.uploadProviderRevision(),
      state,
      provider_operation_ref: input.commit.provider_operation_ref,
      exact_version: null,
      retry_after_ms: null,
      decisions: null,
      audit: {
        event_id: auditEventId,
        correlation_id: input.operation.correlation_id,
      },
    };
  }
}

export const amicOsVaultUploadDeterministicRefs = Object.freeze({
  preflightTargetId,
  quarantineRef,
});
