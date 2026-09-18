import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { PermissionDecision } from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../../audit/audit.service';
import { DlpService, type DlpEgressDecision } from '../../dlp/dlp.service';
import { promotedDocumentExistsSql } from '../../file-security/promoted-file.guard';
import { PermissionService } from '../../permission/permission.service';
import { StorageService } from '../../storage/storage.service';
import { TenantContextService } from '../../tenant/tenant-context';
import type {
  AmicOsVaultExactVersion,
  AmicOsVaultExportAuthorization,
  AmicOsVaultExportAuthorizeInput,
  AmicOsVaultExportDownloadInput,
  AmicOsVaultExportDownloadMetadata,
  AmicOsVaultExportReadbackInput,
  AmicOsVaultProviderAudit,
  AmicOsVaultProviderDecisions,
} from './amic-os-vault-provider.contract';
import { AMIC_OS_VAULT_MAX_OUTLOOK_ATTACHMENT_BYTES } from './amic-os-vault-provider.contract';
import {
  AmicOsVaultProviderConfig,
  type AmicOsVaultProviderPrincipal,
} from './amic-os-vault-provider.guard';

const grantLifetimeSeconds = 45;
const chunkedExportGrantLifetimeSeconds = 600;
const downloadReasonCode = 'amic_os_exact_copy';
const replayDownloadReasonCode = 'amic_os_exact_copy_replay';
const exportChunkBytes = 3 * 1024 * 1024;

type DenialReason =
  | 'permission_denied'
  | 'document_locked'
  | 'policy_denied'
  | 'expired'
  | 'consumed'
  | 'integrity_failed'
  | 'oversize';

interface MatterProjectionRow {
  matter_id: string;
}

interface ExactTargetRow {
  document_id: string;
  version_id: string;
  file_object_id: string;
  matter_id: string;
  storage_uri: string;
  normalized_filename: string;
  mime_type: string;
  size_bytes: string;
  sha256: string;
  document_status: string;
  matter_status: string;
  document_legal_hold: boolean;
  matter_legal_hold: boolean;
  active_legal_hold: boolean;
  active_disposal_request: boolean;
}

interface ExactTarget extends Omit<ExactTargetRow, 'size_bytes'> {
  size_bytes: number;
}

interface GrantRow {
  preview_session_id: string;
  tenant_id: string;
  user_id: string;
  document_id: string;
  version_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
  active?: boolean;
}

interface AllowedPolicy {
  kind: 'allowed';
  target: ExactTarget;
  decisions: AmicOsVaultProviderDecisions;
}

interface DeniedOutcome {
  kind: 'denied';
  reason: DenialReason;
  target?: ExactTarget;
}

type PolicyOutcome = AllowedPolicy | DeniedOutcome;

interface DownloadResult {
  metadata: AmicOsVaultExportDownloadMetadata;
  body: Buffer;
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function denialException(reason: DenialReason): Error {
  if (reason === 'document_locked') {
    return new BadRequestException({ code: 'DOCUMENT_LOCKED' });
  }
  if (reason === 'expired') {
    return new GoneException({ code: 'PERMISSION_DENIED' });
  }
  if (reason === 'consumed') {
    return new ConflictException({ code: 'PERMISSION_DENIED' });
  }
  if (reason === 'integrity_failed') {
    return new ConflictException({ code: 'VALIDATION_FAILED' });
  }
  if (reason === 'oversize') {
    return new PayloadTooLargeException({ code: 'VALIDATION_FAILED' });
  }
  return permissionDenied();
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stableHash(namespace: string, values: readonly unknown[]): string {
  return sha256Hex(`${namespace}\0${JSON.stringify(values)}`);
}

function decisionRef(namespace: string, values: readonly unknown[]): string {
  return `vault-${namespace}:${stableHash(namespace, values).slice(0, 40)}`;
}

function grantId(operationId: string): string {
  const hex = sha256Hex(`amic-os-vault-export-grant-id-v1\0${operationId}`);
  const variant = ((Number.parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function providerExportRef(operationId: string): string {
  return `vault-export:${grantId(operationId)}`;
}

function clientRequestHash(input: {
  principalTenantId: string;
  lawosMatterId: string;
  installationRefSha256: string | null;
  composeTargetSha256: string | null;
}): string {
  return stableHash('amic-os-vault-export-client-binding-v1', [
    input.principalTenantId,
    input.lawosMatterId,
    input.installationRefSha256,
    input.composeTargetSha256,
  ]);
}

function exactVersion(target: ExactTarget): AmicOsVaultExactVersion {
  return {
    document_id: target.document_id,
    version_id: target.version_id,
    file_object_id: target.file_object_id,
    sha256: target.sha256,
    byte_size: target.size_bytes,
    mime_type: target.mime_type.toLowerCase(),
  };
}

function sameExactVersion(
  left: AmicOsVaultExactVersion,
  right: AmicOsVaultExactVersion,
): boolean {
  return (
    left.document_id === right.document_id &&
    left.version_id === right.version_id &&
    left.file_object_id === right.file_object_id &&
    left.sha256 === right.sha256 &&
    left.byte_size === right.byte_size &&
    left.mime_type === right.mime_type
  );
}

function sameDecisions(
  left: AmicOsVaultProviderDecisions,
  right: AmicOsVaultProviderDecisions,
): boolean {
  return (['permission', 'ethical_wall', 'records', 'dlp'] as const).every(
    (key) =>
      left[key].effect === right[key].effect &&
      left[key].decision_ref === right[key].decision_ref,
  );
}

function hasUnsafeControl(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f || (code >= 0xd800 && code <= 0xdfff);
  });
}

function safeAttachmentName(value: string): string | null {
  const name = value.normalize('NFC');
  if (
    !name ||
    name !== name.trim() ||
    name.length > 240 ||
    /[\\/]/u.test(name) ||
    hasUnsafeControl(name)
  ) {
    return null;
  }
  return name;
}

function recordsLocked(target: ExactTarget): boolean {
  return (
    target.document_status === 'deleted' ||
    target.document_status === 'disposal_locked' ||
    target.matter_status === 'disposal_review' ||
    target.matter_status === 'disposed' ||
    target.document_legal_hold ||
    target.matter_legal_hold ||
    target.active_legal_hold ||
    target.active_disposal_request
  );
}

function permissionDecisionRef(decision: PermissionDecision): string {
  return decisionRef('permission', [
    decision.effect,
    decision.reasonCode,
    [...decision.appliedRules].sort(),
  ]);
}

function wallDecisionRef(decision: PermissionDecision): string {
  return decisionRef('ethical-wall', [
    ...decision.appliedRules.filter((rule) => rule.startsWith('ethical_wall:')).sort(),
    'clear',
  ]);
}

function recordsDecisionRef(target: ExactTarget): string {
  return decisionRef('records', [
    target.document_status,
    target.matter_status,
    target.document_legal_hold,
    target.matter_legal_hold,
    target.active_legal_hold,
    target.active_disposal_request,
  ]);
}

function dlpDecisionRef(decision: DlpEgressDecision): string {
  return decisionRef('dlp', [
    decision.assessmentId,
    decision.reviewId,
    decision.policyVersion,
    decision.resultHash,
    decision.allowed,
  ]);
}

function mappedReason(reason: DenialReason): string {
  if (reason === 'document_locked') return 'document_locked';
  if (reason === 'policy_denied') return 'policy_denied';
  if (reason === 'expired') return 'grant_expired';
  if (reason === 'consumed') return 'grant_consumed';
  if (reason === 'integrity_failed') return 'exact_version_mismatch';
  if (reason === 'oversize') return 'attachment_oversize';
  return 'permission_denied';
}

@Injectable()
export class AmicOsVaultProviderService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(DlpService) private readonly dlpService: DlpService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(StorageService) private readonly storageService: StorageService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(AmicOsVaultProviderConfig)
    private readonly config: AmicOsVaultProviderConfig,
  ) {}

  async authorize(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultExportAuthorizeInput,
  ): Promise<AmicOsVaultExportAuthorization> {
    this.assertPrincipal(principal, input.principal.user_id);
    let outcome:
      | { kind: 'allowed'; authorization: AmicOsVaultExportAuthorization }
      | DeniedOutcome;
    try {
      outcome = await this.auditService.transaction(principal.tenantId, async (tx) => {
        const policy = await this.evaluatePolicy(
          tx,
          principal,
          input.lawos_matter_id,
          input.requested_exact_version,
        );
        if (policy.kind === 'denied') return policy;
        if (policy.target.size_bytes > (input.operation_kind === 'attach_outlook'
          ? AMIC_OS_VAULT_MAX_OUTLOOK_ATTACHMENT_BYTES : this.config.maxExportBytes())) {
          return { kind: 'denied' as const, reason: 'oversize' as const, target: policy.target };
        }

        const fingerprint = this.grantFingerprint(principal, {
          principalTenantId: input.principal.tenant_id,
          lawosMatterId: input.lawos_matter_id,
          installationRefSha256: input.installation_ref_sha256,
          composeTargetSha256: input.compose_target_sha256,
          operationId: input.operation_id,
          correlationId: input.correlation_id,
          operationKind: input.operation_kind,
          idempotencyKey: input.idempotency_key,
          exact: input.requested_exact_version,
        });
        const grant = await this.issueOrReadGrant(
          tx,
          principal,
          input.operation_id,
          policy.target,
          this.config.grantTokenHash(fingerprint),
          input.operation_kind === 'export_exact_version' && policy.target.size_bytes > AMIC_OS_VAULT_MAX_OUTLOOK_ATTACHMENT_BYTES
            ? chunkedExportGrantLifetimeSeconds : grantLifetimeSeconds,
        );
        if (grant.kind === 'denied') return { ...grant, target: policy.target };

        const audit = await this.auditService.log(
          {
            tenantId: principal.tenantId,
            actorId: principal.actorUserId,
            action: 'OUTLOOK_DOCUMENT_INSERT_REQUESTED',
            targetType: 'amic_os_exact_export',
            targetId: grant.row.preview_session_id,
            matterId: policy.target.matter_id,
            metadata: {
              request_id: input.operation_id,
              correlation_id: input.correlation_id,
              matter_id: policy.target.matter_id,
              document_id: policy.target.document_id,
              version_id: policy.target.version_id,
              file_object_id: policy.target.file_object_id,
              hash: policy.target.sha256,
              idempotency_hash: sha256Hex(input.idempotency_key),
              client_request_hash: clientRequestHash({
                principalTenantId: input.principal.tenant_id,
                lawosMatterId: input.lawos_matter_id,
                installationRefSha256: input.installation_ref_sha256,
                composeTargetSha256: input.compose_target_sha256,
              }),
              policy_mode: input.operation_kind,
              outlook_status: 'authorized',
              ...(grant.duplicate ? { reason_code: 'duplicate' } : {}),
            },
          },
          tx,
        );

        return {
          kind: 'allowed' as const,
          authorization: {
            authority_kind: 'amic-vault-api',
            authority_ref: this.config.authorityRef(),
            provider_revision: this.config.providerRevision(),
            state: 'authorized',
            provider_export_ref: providerExportRef(input.operation_id),
            expires_at: grant.row.expires_at.toISOString(),
            exact_version: exactVersion(policy.target),
            attachment_name: policy.target.normalized_filename,
            decisions: policy.decisions,
            audit: {
              event_id: audit.eventId,
              correlation_id: input.correlation_id,
            },
          },
        };
      });
    } catch {
      outcome = { kind: 'denied', reason: 'permission_denied' };
    }

    if (outcome.kind === 'allowed') return outcome.authorization;
    await this.recordDenied(principal, {
      operationId: input.operation_id,
      correlationId: input.correlation_id,
      operationKind: input.operation_kind,
      exact: input.requested_exact_version,
      reason: outcome.reason,
      ...(outcome.target ? { target: outcome.target } : {}),
      idempotencyKey: input.idempotency_key,
    });
    throw denialException(outcome.reason);
  }

  async download(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultExportDownloadInput,
  ): Promise<DownloadResult> {
    this.assertPrincipal(principal, input.principal.user_id);
    const operation = input.operation;
    const auditContext = {
      operationId: operation.operation_id,
      correlationId: operation.correlation_id,
      operationKind: operation.operation_kind,
      exact: input.authorization.exact_version,
      idempotencyKey: operation.idempotency_key,
    };

    const first = await this.inspectAuthorizedGrant(principal, input, false);
    let authorized: AllowedPolicy;
    let replay = false;
    if (first.kind === 'denied') {
      if (first.reason !== 'consumed') {
        await this.recordDenied(principal, { ...auditContext, ...first });
        throw denialException(first.reason);
      }
      const inspectedReplay = await this.inspectConsumedReplay(principal, input, false);
      if (inspectedReplay.kind === 'denied') {
        await this.recordDenied(principal, { ...auditContext, ...inspectedReplay });
        throw denialException(inspectedReplay.reason);
      }
      authorized = inspectedReplay;
      replay = true;
    } else {
      authorized = first;
    }

    if (authorized.target.size_bytes > AMIC_OS_VAULT_MAX_OUTLOOK_ATTACHMENT_BYTES) {
      await this.recordDenied(principal, { ...auditContext, reason: 'oversize', target: authorized.target });
      throw denialException('oversize');
    }

    let bytes: Buffer;
    try {
      bytes = await this.readExactBytes(principal.tenantId, authorized.target);
    } catch (error) {
      const reason: DenialReason =
        error instanceof PayloadTooLargeException ? 'oversize' : 'integrity_failed';
      await this.recordDenied(principal, {
        ...auditContext,
        reason,
        target: authorized.target,
      });
      throw denialException(reason);
    }

    let completed = replay
      ? await this.recordConsumedReplay(principal, input, authorized.target)
      : await this.consumeAuthorizedGrant(principal, input, authorized.target);
    if (!replay && completed.kind === 'denied' && completed.reason === 'consumed') {
      completed = await this.recordConsumedReplay(principal, input, authorized.target);
    }
    if (completed.kind === 'denied') {
      bytes.fill(0);
      await this.recordDenied(principal, { ...auditContext, ...completed });
      throw denialException(completed.reason);
    }

    return this.downloadResult(input, completed.target, completed.audit, bytes);
  }

  async downloadChunk(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultExportDownloadInput,
    offset: number,
    byteSize: number,
  ): Promise<DownloadResult & { offset: number; sha256: string }> {
    this.assertPrincipal(principal, input.principal.user_id);
    if (input.operation.operation_kind !== 'export_exact_version'
      || !Number.isSafeInteger(offset) || offset < 0 || offset % exportChunkBytes !== 0
      || !Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > exportChunkBytes
      || byteSize !== Math.min(exportChunkBytes, input.authorization.exact_version.byte_size - offset)) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED' });
    }
    const finalChunk = offset + byteSize === input.authorization.exact_version.byte_size;
    const first = await this.inspectAuthorizedGrant(principal, input, false);
    let authorized: AllowedPolicy;
    let replay = false;
    if (first.kind === 'denied') {
      if (!finalChunk || first.reason !== 'consumed') throw denialException(first.reason);
      const inspectedReplay = await this.inspectConsumedReplay(principal, input, false);
      if (inspectedReplay.kind === 'denied') throw denialException(inspectedReplay.reason);
      authorized = inspectedReplay;
      replay = true;
    } else authorized = first;
    if (authorized.target.size_bytes > this.config.maxExportBytes()) throw denialException('oversize');
    const bytes = await this.readExactRange(principal.tenantId, authorized.target, offset, byteSize);
    let audit: AmicOsVaultProviderAudit;
    if (finalChunk) {
      let completed = replay
        ? await this.recordConsumedReplay(principal, input, authorized.target)
        : await this.consumeAuthorizedGrant(principal, input, authorized.target);
      if (!replay && completed.kind === 'denied' && completed.reason === 'consumed') {
        completed = await this.recordConsumedReplay(principal, input, authorized.target);
      }
      if (completed.kind === 'denied') {
        bytes.fill(0);
        throw denialException(completed.reason);
      }
      audit = completed.audit;
    } else {
      const current = await this.inspectAuthorizedGrant(principal, input, false);
      if (current.kind === 'denied' || !sameExactVersion(exactVersion(current.target), exactVersion(authorized.target))) {
        bytes.fill(0);
        throw denialException(current.kind === 'denied' ? current.reason : 'integrity_failed');
      }
      audit = input.authorization.audit;
    }
    return { ...this.downloadResult(input, authorized.target, audit, bytes), offset,
      sha256: createHash('sha256').update(bytes).digest('hex') };
  }

  private downloadResult(
    input: AmicOsVaultExportDownloadInput,
    target: ExactTarget,
    audit: AmicOsVaultProviderAudit,
    body: Buffer,
  ): DownloadResult {
    return {
      metadata: {
        authority_kind: 'amic-vault-api',
        authority_ref: this.config.authorityRef(),
        provider_revision: this.config.providerRevision(),
        state: 'downloaded',
        provider_export_ref: input.authorization.provider_export_ref,
        exact_version: exactVersion(target),
        attachment_name: target.normalized_filename,
        audit,
      },
      body,
    };
  }

  async readback(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultExportReadbackInput,
  ): Promise<{
    authority_kind: 'amic-vault-api';
    authority_ref: string;
    provider_revision: string;
    state: 'consumed';
    provider_export_ref: string;
    exact_version: AmicOsVaultExactVersion;
    decisions: AmicOsVaultProviderDecisions;
    audit: AmicOsVaultProviderAudit;
  }> {
    this.assertPrincipal(principal, input.principal.user_id);
    const operation = input.operation;
    const outcome = await this.auditService.transaction(principal.tenantId, async (tx) => {
      const identity = this.validateProviderIdentity(
        operation.operation_id,
        operation.correlation_id,
        input.authorization,
      );
      if (identity) return identity;

      const grant = await this.readGrant(
        tx,
        principal,
        operation.operation_id,
        input.authorization.exact_version,
        undefined,
        true,
        false,
      );
      if (grant.kind === 'denied') return grant;
      if (!grant.row.revoked_at) return { kind: 'denied' as const, reason: 'consumed' as const };

      const policy = await this.evaluatePolicy(
        tx,
        principal,
        input.lawos_matter_id,
        input.authorization.exact_version,
      );
      if (policy.kind === 'denied') return policy;
      const authorizationMismatch = await this.authorizationMismatch(
        tx,
        principal,
        operation.operation_id,
        operation.correlation_id,
        input.authorization,
        grant.row,
        policy,
        clientRequestHash({
          principalTenantId: input.principal.tenant_id,
          lawosMatterId: input.lawos_matter_id,
          installationRefSha256: input.installation_ref_sha256,
          composeTargetSha256: input.compose_target_sha256,
        }),
      );
      if (authorizationMismatch) return authorizationMismatch;
      if (!this.matchesDownloadMetadata(input.download, input.authorization, operation.correlation_id)) {
        return { kind: 'denied' as const, reason: 'integrity_failed' as const };
      }

      const auditResult = await tx.query(
        `
          SELECT event_id
          FROM audit_events
          WHERE tenant_id = $1
            AND event_id = $2::uuid
            AND actor_id = $3::uuid
            AND action = 'DOCUMENT_DOWNLOADED'
            AND target_type = 'document'
            AND target_id = $4::uuid
            AND matter_id = $5::uuid
            AND correlation_id = $6
            AND metadata_json ->> 'version_id' = $7
            AND metadata_json ->> 'file_object_id' = $8
            AND metadata_json ->> 'hash' = $9
          LIMIT 1
        `,
        [
          principal.tenantId,
          input.download.audit.event_id,
          principal.actorUserId,
          policy.target.document_id,
          policy.target.matter_id,
          operation.correlation_id,
          policy.target.version_id,
          policy.target.file_object_id,
          policy.target.sha256,
        ],
      );
      if (auditResult.rowCount !== 1) {
        return { kind: 'denied' as const, reason: 'integrity_failed' as const };
      }
      return {
        kind: 'allowed' as const,
        target: policy.target,
        decisions: policy.decisions,
      };
    });

    if (outcome.kind === 'denied') {
      await this.recordDenied(principal, {
        operationId: operation.operation_id,
        correlationId: operation.correlation_id,
        operationKind: operation.operation_kind,
        exact: input.authorization.exact_version,
        reason: outcome.reason,
        ...(outcome.target ? { target: outcome.target } : {}),
      });
      throw denialException(outcome.reason);
    }

    return {
      authority_kind: 'amic-vault-api',
      authority_ref: this.config.authorityRef(),
      provider_revision: this.config.providerRevision(),
      state: 'consumed',
      provider_export_ref: input.authorization.provider_export_ref,
      exact_version: exactVersion(outcome.target),
      decisions: outcome.decisions,
      audit: {
        event_id: input.download.audit.event_id,
        correlation_id: operation.correlation_id,
      },
    };
  }

  private assertPrincipal(principal: AmicOsVaultProviderPrincipal, accountLedgerId: string): void {
    const context = this.tenantContext.require();
    if (
      context.source !== 'amic-os-provider' ||
      context.tenantId !== principal.tenantId ||
      principal.accountLedgerId !== accountLedgerId
    ) {
      throw permissionDenied();
    }
  }

  private async evaluatePolicy(
    tx: QueryClient,
    principal: AmicOsVaultProviderPrincipal,
    lawosMatterId: string,
    expected: AmicOsVaultExactVersion,
  ): Promise<PolicyOutcome> {
    const target = await this.findExactTarget(tx, principal.tenantId, lawosMatterId, expected);
    if (!target) return { kind: 'denied', reason: 'permission_denied' };

    let permission: PermissionDecision;
    try {
      permission = await this.permissionService.canDownloadDocument(
        { tenantId: principal.tenantId, userId: principal.actorUserId },
        target.document_id,
        downloadReasonCode,
      );
    } catch {
      return { kind: 'denied', reason: 'permission_denied', target };
    }
    if (permission.effect !== 'ALLOW') {
      return {
        kind: 'denied',
        reason: permission.reasonCode === 'DOCUMENT_LOCKED' ? 'document_locked' : 'permission_denied',
        target,
      };
    }
    if (recordsLocked(target)) return { kind: 'denied', reason: 'document_locked', target };

    const dlp = await this.dlpService.evaluateDocumentEgress(tx, {
      tenantId: principal.tenantId,
      matterId: target.matter_id,
      documentId: target.document_id,
      versionId: target.version_id,
      purpose: 'outlook_document_insertion',
      authorization: { kind: 'internal', userId: principal.actorUserId },
    });
    if (!dlp.allowed) return { kind: 'denied', reason: 'policy_denied', target };

    return {
      kind: 'allowed',
      target,
      decisions: {
        permission: { effect: 'allow', decision_ref: permissionDecisionRef(permission) },
        ethical_wall: { effect: 'allow', decision_ref: wallDecisionRef(permission) },
        records: { effect: 'allow', decision_ref: recordsDecisionRef(target) },
        dlp: { effect: 'allow', decision_ref: dlpDecisionRef(dlp) },
      },
    };
  }

  private async findExactTarget(
    tx: QueryClient,
    tenantId: string,
    lawosMatterId: string,
    expected: AmicOsVaultExactVersion,
  ): Promise<ExactTarget | null> {
    const matterResult = await tx.query(
      `
        SELECT matter_id
        FROM matters
        WHERE tenant_id = $1
          AND (
            metadata_json ->> 'lawosMatterId' = $2
            OR metadata_json ->> 'matterAppMatterId' = $2
          )
        ORDER BY matter_id
        LIMIT 2
      `,
      [tenantId, lawosMatterId],
    );
    const matters = matterResult.rows as MatterProjectionRow[];
    if (matters.length !== 1) return null;

    const result = await tx.query(
      `
        SELECT
          d.document_id,
          dv.version_id,
          f.file_object_id,
          d.matter_id,
          f.storage_uri,
          f.normalized_filename,
          lower(f.mime_type) AS mime_type,
          f.size_bytes::text,
          COALESCE(f.sha256, dv.file_hash) AS sha256,
          d.status AS document_status,
          m.status AS matter_status,
          d.legal_hold AS document_legal_hold,
          m.legal_hold AS matter_legal_hold,
          EXISTS (
            SELECT 1
            FROM legal_holds lh
            WHERE lh.tenant_id = d.tenant_id
              AND lh.status = 'active'
              AND (
                lh.document_id = d.document_id
                OR (lh.document_id IS NULL AND lh.matter_id = d.matter_id)
              )
          ) AS active_legal_hold,
          EXISTS (
            SELECT 1
            FROM disposal_requests dr
            WHERE dr.tenant_id = d.tenant_id
              AND dr.document_id = d.document_id
              AND dr.status IN ('requested', 'approved')
          ) AS active_disposal_request
        FROM documents d
        JOIN matters m
          ON m.tenant_id = d.tenant_id
         AND m.matter_id = d.matter_id
        JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
         AND dv.document_id = d.document_id
        JOIN file_objects f
          ON f.tenant_id = dv.tenant_id
         AND f.file_object_id = dv.file_object_id
        WHERE d.tenant_id = $1
          AND d.matter_id = $2::uuid
          AND d.document_id = $3::uuid
          AND dv.version_id = $4::uuid
          AND f.file_object_id = $5::uuid
          AND ${promotedDocumentExistsSql('d', 'dv')}
        LIMIT 1
      `,
      [
        tenantId,
        matters[0]?.matter_id,
        expected.document_id,
        expected.version_id,
        expected.file_object_id,
      ],
    );
    const row = result.rows[0] as ExactTargetRow | undefined;
    if (!row) return null;
    const size = Number(row.size_bytes);
    const name = safeAttachmentName(row.normalized_filename);
    if (!Number.isSafeInteger(size) || size < 1 || !name) return null;
    const target: ExactTarget = {
      ...row,
      normalized_filename: name,
      mime_type: row.mime_type.toLowerCase(),
      size_bytes: size,
    };
    return sameExactVersion(exactVersion(target), expected) ? target : null;
  }

  private grantFingerprint(
    principal: AmicOsVaultProviderPrincipal,
    input: {
      principalTenantId: string;
      lawosMatterId: string;
      installationRefSha256: string | null;
      composeTargetSha256: string | null;
      operationId: string;
      correlationId: string;
      operationKind: string;
      idempotencyKey: string;
      exact: AmicOsVaultExactVersion;
    },
  ): string {
    return stableHash('amic-os-vault-export-grant-fingerprint-v1', [
      principal.tenantId,
      principal.actorUserId,
      principal.accountLedgerId,
      input.principalTenantId,
      input.lawosMatterId,
      input.installationRefSha256,
      input.composeTargetSha256,
      input.operationId,
      input.correlationId,
      input.operationKind,
      input.idempotencyKey,
      input.exact,
    ]);
  }

  private async issueOrReadGrant(
    tx: QueryClient,
    principal: AmicOsVaultProviderPrincipal,
    operationId: string,
    target: ExactTarget,
    tokenHash: string,
    lifetimeSeconds: number,
  ): Promise<{ kind: 'allowed'; row: GrantRow; duplicate: boolean } | DeniedOutcome> {
    const id = grantId(operationId);
    const inserted = await tx.query(
      `
        INSERT INTO preview_access_sessions (
          preview_session_id, tenant_id, user_id, document_id, version_id,
          token_hash, expires_at
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6,
          now() + ($7::integer * interval '1 second'))
        ON CONFLICT DO NOTHING
        RETURNING preview_session_id, tenant_id, user_id, document_id, version_id,
          token_hash, expires_at, revoked_at, created_at
      `,
      [
        id,
        principal.tenantId,
        principal.actorUserId,
        target.document_id,
        target.version_id,
        tokenHash,
        lifetimeSeconds,
      ],
    );
    const insertedRow = inserted.rows[0] as GrantRow | undefined;
    if (insertedRow) return { kind: 'allowed', row: insertedRow, duplicate: false };

    const existing = await this.readGrant(
      tx,
      principal,
      operationId,
      exactVersion(target),
      tokenHash,
      false,
      false,
    );
    return existing.kind === 'allowed'
      ? { kind: 'allowed', row: existing.row, duplicate: true }
      : existing;
  }

  private async readGrant(
    tx: QueryClient,
    principal: AmicOsVaultProviderPrincipal,
    operationId: string,
    exact: AmicOsVaultExactVersion,
    tokenHash: string | undefined,
    allowRevoked: boolean,
    lock: boolean,
  ): Promise<{ kind: 'allowed'; row: GrantRow } | DeniedOutcome> {
    const result = await tx.query(
      `
        SELECT preview_session_id, tenant_id, user_id, document_id, version_id,
          token_hash, expires_at, revoked_at, created_at, (expires_at > now()) AS active
        FROM preview_access_sessions
        WHERE tenant_id = $1::uuid
          AND preview_session_id = $2::uuid
          AND user_id = $3::uuid
          AND document_id = $4::uuid
          AND version_id = $5::uuid
          AND ($6::text IS NULL OR token_hash = $6)
        LIMIT 1
        ${lock ? 'FOR UPDATE' : ''}
      `,
      [
        principal.tenantId,
        grantId(operationId),
        principal.actorUserId,
        exact.document_id,
        exact.version_id,
        tokenHash ?? null,
      ],
    );
    const row = result.rows[0] as GrantRow | undefined;
    if (!row) return { kind: 'denied', reason: 'permission_denied' };
    if (row.revoked_at && !allowRevoked) return { kind: 'denied', reason: 'consumed' };
    if (row.active === false && !row.revoked_at) return { kind: 'denied', reason: 'expired' };
    return { kind: 'allowed', row };
  }

  private async inspectAuthorizedGrant(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultExportDownloadInput,
    lock: boolean,
  ): Promise<AllowedPolicy | DeniedOutcome> {
    try {
      return await this.auditService.transaction(principal.tenantId, (tx) =>
        this.inspectAuthorizedGrantInTransaction(tx, principal, input, lock),
      );
    } catch {
      return { kind: 'denied', reason: 'permission_denied' };
    }
  }

  private async consumeAuthorizedGrant(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultExportDownloadInput,
    firstTarget: ExactTarget,
  ): Promise<
    | { kind: 'allowed'; target: ExactTarget; audit: AmicOsVaultProviderAudit }
    | DeniedOutcome
  > {
    try {
      return await this.auditService.transaction(principal.tenantId, async (tx) => {
        const inspected = await this.inspectAuthorizedGrantInTransaction(
          tx,
          principal,
          input,
          true,
        );
        if (inspected.kind === 'denied') return inspected;
        if (!sameExactVersion(exactVersion(inspected.target), exactVersion(firstTarget))) {
          return {
            kind: 'denied' as const,
            reason: 'integrity_failed' as const,
            target: inspected.target,
          };
        }

        const updated = await tx.query(
          `
            UPDATE preview_access_sessions
            SET revoked_at = now()
            WHERE tenant_id = $1::uuid
              AND preview_session_id = $2::uuid
              AND user_id = $3::uuid
              AND document_id = $4::uuid
              AND version_id = $5::uuid
              AND revoked_at IS NULL
              AND expires_at > now()
            RETURNING revoked_at
          `,
          [
            principal.tenantId,
            grantId(input.operation.operation_id),
            principal.actorUserId,
            inspected.target.document_id,
            inspected.target.version_id,
          ],
        );
        if (updated.rowCount !== 1) {
          return { kind: 'denied' as const, reason: 'consumed' as const, target: inspected.target };
        }
        const audit = await this.auditService.log(
          {
            tenantId: principal.tenantId,
            actorId: principal.actorUserId,
            action: 'DOCUMENT_DOWNLOADED',
            targetType: 'document',
            targetId: inspected.target.document_id,
            matterId: inspected.target.matter_id,
            metadata: {
              request_id: input.operation.operation_id,
              correlation_id: input.operation.correlation_id,
              matter_id: inspected.target.matter_id,
              document_id: inspected.target.document_id,
              version_id: inspected.target.version_id,
              file_object_id: inspected.target.file_object_id,
              hash: inspected.target.sha256,
              download_byte_count: inspected.target.size_bytes,
              reason_code: downloadReasonCode,
              policy_mode: input.operation.operation_kind,
              idempotency_hash: sha256Hex(input.operation.idempotency_key),
            },
          },
          tx,
        );
        return {
          kind: 'allowed' as const,
          target: inspected.target,
          audit: {
            event_id: audit.eventId,
            correlation_id: input.operation.correlation_id,
          },
        };
      });
    } catch {
      return { kind: 'denied', reason: 'permission_denied' };
    }
  }

  private async inspectConsumedReplay(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultExportDownloadInput,
    lock: boolean,
  ): Promise<AllowedPolicy | DeniedOutcome> {
    try {
      return await this.auditService.transaction(principal.tenantId, async (tx) => {
        const inspected = await this.inspectAuthorizedGrantInTransaction(
          tx,
          principal,
          input,
          lock,
          true,
        );
        if (inspected.kind === 'denied') return inspected;
        return (await this.hasInitialDownloadAudit(tx, principal, input, inspected.target))
          ? inspected
          : { kind: 'denied' as const, reason: 'consumed' as const, target: inspected.target };
      });
    } catch {
      return { kind: 'denied', reason: 'permission_denied' };
    }
  }

  private async recordConsumedReplay(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultExportDownloadInput,
    expectedTarget: ExactTarget,
  ): Promise<
    | { kind: 'allowed'; target: ExactTarget; audit: AmicOsVaultProviderAudit }
    | DeniedOutcome
  > {
    try {
      return await this.auditService.transaction(principal.tenantId, async (tx) => {
        const inspected = await this.inspectAuthorizedGrantInTransaction(
          tx,
          principal,
          input,
          true,
          true,
        );
        if (inspected.kind === 'denied') return inspected;
        if (!sameExactVersion(exactVersion(inspected.target), exactVersion(expectedTarget))) {
          return {
            kind: 'denied' as const,
            reason: 'integrity_failed' as const,
            target: inspected.target,
          };
        }
        if (!(await this.hasInitialDownloadAudit(tx, principal, input, inspected.target))) {
          return { kind: 'denied' as const, reason: 'consumed' as const, target: inspected.target };
        }
        const audit = await this.auditService.log(
          {
            tenantId: principal.tenantId,
            actorId: principal.actorUserId,
            action: 'DOCUMENT_DOWNLOADED',
            targetType: 'document',
            targetId: inspected.target.document_id,
            matterId: inspected.target.matter_id,
            metadata: {
              request_id: input.operation.operation_id,
              correlation_id: input.operation.correlation_id,
              matter_id: inspected.target.matter_id,
              document_id: inspected.target.document_id,
              version_id: inspected.target.version_id,
              file_object_id: inspected.target.file_object_id,
              hash: inspected.target.sha256,
              download_byte_count: inspected.target.size_bytes,
              reason_code: replayDownloadReasonCode,
              policy_mode: input.operation.operation_kind,
              idempotency_hash: sha256Hex(input.operation.idempotency_key),
            },
          },
          tx,
        );
        return {
          kind: 'allowed' as const,
          target: inspected.target,
          audit: {
            event_id: audit.eventId,
            correlation_id: input.operation.correlation_id,
          },
        };
      });
    } catch {
      return { kind: 'denied', reason: 'permission_denied' };
    }
  }

  private async inspectAuthorizedGrantInTransaction(
    tx: QueryClient,
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultExportDownloadInput,
    lock: boolean,
    allowRevoked = false,
  ): Promise<AllowedPolicy | DeniedOutcome> {
    const identity = this.validateProviderIdentity(
      input.operation.operation_id,
      input.operation.correlation_id,
      input.authorization,
    );
    if (identity) return identity;
    const fingerprint = this.grantFingerprint(principal, {
      principalTenantId: input.principal.tenant_id,
      lawosMatterId: input.lawos_matter_id,
      installationRefSha256: input.installation_ref_sha256,
      composeTargetSha256: input.compose_target_sha256,
      operationId: input.operation.operation_id,
      correlationId: input.operation.correlation_id,
      operationKind: input.operation.operation_kind,
      idempotencyKey: input.operation.idempotency_key,
      exact: input.authorization.exact_version,
    });
    const grant = await this.readGrant(
      tx,
      principal,
      input.operation.operation_id,
      input.authorization.exact_version,
      this.config.grantTokenHash(fingerprint),
      allowRevoked,
      lock,
    );
    if (grant.kind === 'denied') return grant;
    if (allowRevoked) {
      if (!grant.row.revoked_at) return { kind: 'denied', reason: 'consumed' };
      if (grant.row.active !== true) return { kind: 'denied', reason: 'expired' };
    }
    const policy = await this.evaluatePolicy(
      tx,
      principal,
      input.lawos_matter_id,
      input.authorization.exact_version,
    );
    if (policy.kind === 'denied') return policy;
    const mismatch = await this.authorizationMismatch(
      tx,
      principal,
      input.operation.operation_id,
      input.operation.correlation_id,
      input.authorization,
      grant.row,
      policy,
      clientRequestHash({
        principalTenantId: input.principal.tenant_id,
        lawosMatterId: input.lawos_matter_id,
        installationRefSha256: input.installation_ref_sha256,
        composeTargetSha256: input.compose_target_sha256,
      }),
    );
    return mismatch ?? policy;
  }

  private async hasInitialDownloadAudit(
    tx: QueryClient,
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultExportDownloadInput,
    target: ExactTarget,
  ): Promise<boolean> {
    const result = await tx.query(
      `
        SELECT event_id
        FROM audit_events
        WHERE tenant_id = $1::uuid
          AND actor_id = $2::uuid
          AND action = 'DOCUMENT_DOWNLOADED'
          AND target_type = 'document'
          AND target_id = $3::uuid
          AND matter_id = $4::uuid
          AND correlation_id = $5
          AND metadata_json ->> 'version_id' = $6
          AND metadata_json ->> 'file_object_id' = $7
          AND metadata_json ->> 'hash' = $8
          AND metadata_json ->> 'request_id' = $9
          AND metadata_json ->> 'idempotency_hash' = $10
          AND metadata_json ->> 'reason_code' = $11
          AND metadata_json ->> 'download_byte_count' = $12
          AND metadata_json ->> 'policy_mode' = $13
        LIMIT 1
      `,
      [
        principal.tenantId,
        principal.actorUserId,
        target.document_id,
        target.matter_id,
        input.operation.correlation_id,
        target.version_id,
        target.file_object_id,
        target.sha256,
        input.operation.operation_id,
        sha256Hex(input.operation.idempotency_key),
        downloadReasonCode,
        String(target.size_bytes),
        input.operation.operation_kind,
      ],
    );
    return result.rowCount === 1;
  }

  private validateProviderIdentity(
    operationId: string,
    correlationId: string,
    authorization: AmicOsVaultExportAuthorization,
  ): DeniedOutcome | null {
    if (
      authorization.authority_kind !== 'amic-vault-api' ||
      authorization.authority_ref !== this.config.authorityRef() ||
      authorization.provider_revision !== this.config.providerRevision() ||
      authorization.state !== 'authorized' ||
      authorization.provider_export_ref !== providerExportRef(operationId) ||
      authorization.audit.correlation_id !== correlationId
    ) {
      return { kind: 'denied', reason: 'integrity_failed' };
    }
    return null;
  }

  private async authorizationMismatch(
    tx: QueryClient,
    principal: AmicOsVaultProviderPrincipal,
    operationId: string,
    correlationId: string,
    authorization: AmicOsVaultExportAuthorization,
    grant: GrantRow,
    policy: AllowedPolicy,
    expectedClientRequestHash: string,
  ): Promise<DeniedOutcome | null> {
    if (
      authorization.expires_at !== grant.expires_at.toISOString() ||
      !sameExactVersion(authorization.exact_version, exactVersion(policy.target)) ||
      authorization.attachment_name !== policy.target.normalized_filename ||
      !sameDecisions(authorization.decisions, policy.decisions)
    ) {
      return { kind: 'denied', reason: 'integrity_failed', target: policy.target };
    }
    const auditResult = await tx.query(
      `
        SELECT event_id
        FROM audit_events
        WHERE tenant_id = $1::uuid
          AND event_id = $2::uuid
          AND actor_id = $3::uuid
          AND action = 'OUTLOOK_DOCUMENT_INSERT_REQUESTED'
          AND target_type = 'amic_os_exact_export'
          AND target_id = $4::uuid
          AND matter_id = $5::uuid
          AND correlation_id = $6
          AND metadata_json ->> 'document_id' = $7
          AND metadata_json ->> 'version_id' = $8
          AND metadata_json ->> 'file_object_id' = $9
          AND metadata_json ->> 'client_request_hash' = $10
        LIMIT 1
      `,
      [
        principal.tenantId,
        authorization.audit.event_id,
        principal.actorUserId,
        grantId(operationId),
        policy.target.matter_id,
        correlationId,
        policy.target.document_id,
        policy.target.version_id,
        policy.target.file_object_id,
        expectedClientRequestHash,
      ],
    );
    return auditResult.rowCount === 1
      ? null
      : { kind: 'denied', reason: 'integrity_failed', target: policy.target };
  }

  private async readExactBytes(tenantId: string, target: ExactTarget): Promise<Buffer> {
    const maxBytes = Math.min(this.config.maxExportBytes(), AMIC_OS_VAULT_MAX_OUTLOOK_ATTACHMENT_BYTES);
    if (target.size_bytes > maxBytes) throw denialException('oversize');
    const object = await this.storageService.getByStorageUri(tenantId, target.storage_uri);
    const chunks: Buffer[] = [];
    const digest = createHash('sha256');
    let size = 0;
    try {
      for await (const value of object.body) {
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
        size += chunk.byteLength;
        if (size > maxBytes) throw denialException('oversize');
        if (size > target.size_bytes) throw denialException('integrity_failed');
        chunks.push(chunk);
        digest.update(chunk);
      }
    } catch (error) {
      object.body.destroy();
      throw error;
    }
    if (size !== target.size_bytes || digest.digest('hex') !== target.sha256) {
      throw denialException('integrity_failed');
    }
    return Buffer.concat(chunks, size);
  }

  private async readExactRange(tenantId: string, target: ExactTarget, offset: number, byteSize: number): Promise<Buffer> {
    const object = await this.storageService.getRangeByStorageUri(
      tenantId, target.storage_uri, offset, offset + byteSize - 1,
    );
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const value of object.body) {
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
        size += chunk.byteLength;
        if (size > byteSize) throw denialException('integrity_failed');
        chunks.push(chunk);
      }
    } catch (error) {
      object.body.destroy();
      throw error;
    }
    if (size !== byteSize) throw denialException('integrity_failed');
    return Buffer.concat(chunks, size);
  }

  private matchesDownloadMetadata(
    download: AmicOsVaultExportDownloadMetadata,
    authorization: AmicOsVaultExportAuthorization,
    correlationId: string,
  ): boolean {
    return (
      download.authority_kind === 'amic-vault-api' &&
      download.authority_ref === this.config.authorityRef() &&
      download.provider_revision === this.config.providerRevision() &&
      download.state === 'downloaded' &&
      download.provider_export_ref === authorization.provider_export_ref &&
      sameExactVersion(download.exact_version, authorization.exact_version) &&
      download.attachment_name === authorization.attachment_name &&
      download.audit.correlation_id === correlationId
    );
  }

  private async recordDenied(
    principal: AmicOsVaultProviderPrincipal,
    input: {
      operationId: string;
      correlationId: string;
      operationKind: string;
      exact: AmicOsVaultExactVersion;
      reason: DenialReason;
      target?: ExactTarget;
      idempotencyKey?: string;
    },
  ): Promise<void> {
    await this.auditService.log({
      tenantId: principal.tenantId,
      actorId: principal.actorUserId,
      action: 'OUTLOOK_DOCUMENT_INSERT_DENIED',
      targetType: 'amic_os_exact_export',
      targetId: grantId(input.operationId),
      matterId: input.target?.matter_id ?? null,
      result: 'denied',
      metadata: {
        request_id: input.operationId,
        correlation_id: input.correlationId,
        document_id: input.exact.document_id,
        version_id: input.exact.version_id,
        file_object_id: input.exact.file_object_id,
        hash: input.exact.sha256,
        policy_mode: input.operationKind,
        outlook_status: 'denied',
        reason_code: mappedReason(input.reason),
        ...(input.target ? { matter_id: input.target.matter_id } : {}),
        ...(input.idempotencyKey
          ? { idempotency_hash: sha256Hex(input.idempotencyKey) }
          : {}),
      },
    });
  }
}

export type { DownloadResult as AmicOsVaultProviderDownloadResult };
