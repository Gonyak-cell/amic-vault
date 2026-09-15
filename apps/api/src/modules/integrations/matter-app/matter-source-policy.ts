import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { isMatterMutationBlockedState, isMatterState } from '@amic-vault/domain';
import {
  uploadPreflightResponseSchema,
  type PermissionDecision,
  type TenantId,
  type UploadPreflightPurpose,
  type UploadPreflightResponseDto,
} from '@amic-vault/shared';
import { DatabaseService } from '../../../common/db/database.service';
import { tenantQuery } from '../../../common/db/tenant-query';
import { PermissionService } from '../../permission/permission.service';
import { MatterAppRuntimeService } from './matter-app-runtime.service';

const PREFLIGHT_TTL_MS = 1000 * 60 * 5;
const MAX_OPERATION_SOURCE_PROOF_MS = 2 * 60 * 60 * 1000 + 60_000;

const uploadPreflightReceipts = new Map<string, UploadPreflightReceipt>();

interface MatterSourceRow {
  matter_id: string;
  matter_code: string;
  status: string;
  metadata_json: Record<string, unknown> | null;
  updated_at: Date;
}

export interface MatterSourceMutationDecision {
  decisionRef: string;
  matterId: string;
  permissionDecisionRef: string;
  preflightRef?: string;
  preflightExpiresAt?: string;
  sourceMode: string;
  sourceRevision: string | null;
  sourceUpdatedAt: string | null;
}

export interface AuthoritativeMatterAppSource {
  mode: 'matter_app_api';
  operationExpiresAt?: string;
  sourceRevision: string;
  sourceUpdatedAt: string;
}

interface UploadPreflightReceipt {
  actorUserId: string;
  expiresAtMs: number;
  matterId: string;
  permissionDecisionRef: string;
  sourceDecisionRef: string;
  tenantId: string;
}

function validationFailed(reason: string): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED', reason });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function ethicalWallBlocked(): ForbiddenException {
  return new ForbiddenException({ code: 'ETHICAL_WALL_BLOCKED' });
}

function metadataString(metadata: Record<string, unknown> | null, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function matterSourceRevision(row: MatterSourceRow): string | null {
  return (
    metadataString(row.metadata_json, 'matterAppSourceRevision') ??
    metadataString(row.metadata_json, 'sourceRevision') ??
    null
  );
}

function hashRef(prefix: string, parts: readonly unknown[]): string {
  const hash = createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  return `${prefix}:${hash}`;
}

function preflightRef(parts: readonly unknown[]): string {
  return `upf_${createHash('sha256')
    .update(JSON.stringify([...parts, randomUUID()]))
    .digest('base64url')
    .slice(0, 43)}`;
}

function pruneUploadPreflightReceipts(nowMs: number): void {
  for (const [ref, receipt] of uploadPreflightReceipts) {
    if (receipt.expiresAtMs <= nowMs) uploadPreflightReceipts.delete(ref);
  }
}

@Injectable()
export class MatterSourcePolicyService {
  private readonly logger = new Logger(MatterSourcePolicyService.name);

  constructor(
    @Inject(MatterAppRuntimeService) private readonly matterAppRuntime: MatterAppRuntimeService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
  ) {}

  async createUploadPreflight(input: {
    actorUserId: string;
    matterId: string;
    tenantId: TenantId;
    now?: Date;
  }): Promise<UploadPreflightResponseDto> {
    const now = input.now ?? new Date();
    const decision = await this.assertUploadMutationAllowed({
      actorUserId: input.actorUserId,
      matterId: input.matterId,
      tenantId: input.tenantId,
      purpose: 'document_upload',
      now,
    });
    if (!decision.preflightRef || !decision.preflightExpiresAt) {
      throw validationFailed('UPLOAD_PREFLIGHT_REF_REQUIRED');
    }
    return uploadPreflightResponseSchema.parse({
      matterReference: input.matterId,
      preflightRef: decision.preflightRef,
      expiresAt: decision.preflightExpiresAt,
      sourceMode: decision.sourceMode,
      sourceUpdatedAt: decision.sourceUpdatedAt,
      sourceRevision: decision.sourceRevision,
      permissionDecisionRef: decision.permissionDecisionRef,
      uploadEligible: true,
      blockedReason: null,
      duplicateDecisionRequired: false,
      duplicateCandidates: [],
    });
  }

  async assertUploadMutationAllowed(input: {
    actorUserId: string;
    authoritativeSource?: AuthoritativeMatterAppSource;
    matterId: string;
    tenantId: TenantId;
    purpose: Extract<UploadPreflightPurpose, 'document_upload' | 'document_version'>;
    now?: Date;
    uploadPreflightRef?: string | undefined;
  }): Promise<MatterSourceMutationDecision> {
    const sourceDecision = await this.assertMatterSourceMutationAllowed(input);
    const permissionDecision = await this.canUploadToMatter(
      input.tenantId,
      input.actorUserId,
      input.matterId,
    );
    if (permissionDecision.effect !== 'ALLOW') {
      if (permissionDecision.reasonCode === 'ETHICAL_WALL_BLOCKED') throw ethicalWallBlocked();
      throw permissionDenied();
    }

    const now = input.now ?? new Date();
    const nowMs = now.getTime();
    pruneUploadPreflightReceipts(nowMs);
    const expiresAt = new Date(nowMs + PREFLIGHT_TTL_MS);
    const permissionDecisionRef = hashRef('matter-upload-permission', [
      input.tenantId,
      input.actorUserId,
      input.matterId,
      permissionDecision.effect,
      permissionDecision.reasonCode,
      permissionDecision.appliedRules,
    ]);
    const issuedRef = input.uploadPreflightRef
      ? this.assertUploadPreflightReceipt({
          actorUserId: input.actorUserId,
          matterId: input.matterId,
          nowMs,
          permissionDecisionRef,
          preflightRef: input.uploadPreflightRef,
          sourceDecisionRef: sourceDecision.decisionRef,
          tenantId: input.tenantId,
        })
      : this.issueUploadPreflightReceipt({
          actorUserId: input.actorUserId,
          expiresAtMs: expiresAt.getTime(),
          matterId: input.matterId,
          permissionDecisionRef,
          sourceDecisionRef: sourceDecision.decisionRef,
          tenantId: input.tenantId,
        });
    const receipt = uploadPreflightReceipts.get(issuedRef);
    if (!receipt) throw validationFailed('UPLOAD_PREFLIGHT_INVALID');

    return {
      ...sourceDecision,
      permissionDecisionRef,
      preflightRef: issuedRef,
      preflightExpiresAt: new Date(receipt.expiresAtMs).toISOString(),
    };
  }

  private issueUploadPreflightReceipt(receipt: UploadPreflightReceipt): string {
    const issuedRef = preflightRef([
      receipt.tenantId,
      receipt.actorUserId,
      receipt.matterId,
      receipt.expiresAtMs,
      receipt.sourceDecisionRef,
      receipt.permissionDecisionRef,
    ]);
    uploadPreflightReceipts.set(issuedRef, receipt);
    return issuedRef;
  }

  private assertUploadPreflightReceipt(input: {
    actorUserId: string;
    matterId: string;
    nowMs: number;
    permissionDecisionRef: string;
    preflightRef: string;
    sourceDecisionRef: string;
    tenantId: TenantId;
  }): string {
    const receipt = uploadPreflightReceipts.get(input.preflightRef);
    if (!receipt) throw validationFailed('UPLOAD_PREFLIGHT_INVALID');
    if (receipt.expiresAtMs <= input.nowMs) {
      uploadPreflightReceipts.delete(input.preflightRef);
      throw validationFailed('UPLOAD_PREFLIGHT_EXPIRED');
    }

    const matches =
      receipt.actorUserId === input.actorUserId &&
      receipt.matterId === input.matterId &&
      receipt.permissionDecisionRef === input.permissionDecisionRef &&
      receipt.sourceDecisionRef === input.sourceDecisionRef &&
      receipt.tenantId === input.tenantId;
    if (!matches) throw validationFailed('UPLOAD_PREFLIGHT_INVALID');

    return input.preflightRef;
  }

  async assertMatterSourceMutationAllowed(input: {
    authoritativeSource?: AuthoritativeMatterAppSource;
    matterId: string;
    purpose: UploadPreflightPurpose;
    tenantId: TenantId;
    now?: Date;
  }): Promise<MatterSourceMutationDecision> {
    const now = input.now ?? new Date();
    const source = await this.matterAppRuntime.status(now);
    const authoritativeSource = input.authoritativeSource
      ? this.validateAuthoritativeSource(input.authoritativeSource, source, now)
      : null;
    if (
      !authoritativeSource &&
      (!source.uploadAuthoritative || !source.sourceContractReady || source.sourceStale)
    ) {
      throw validationFailed(source.unavailableReason ?? 'MATTER_SOURCE_UNAVAILABLE');
    }

    const matter = await this.findMatter(input.tenantId, input.matterId);
    if (!matter) throw permissionDenied();
    if (!isMatterState(matter.status)) throw validationFailed('MATTER_STATUS_UNKNOWN');
    if (isMatterMutationBlockedState(matter.status)) {
      throw permissionDenied();
    }

    const sourceRevision = authoritativeSource?.sourceRevision ?? matterSourceRevision(matter);
    const sourceUpdatedAt = authoritativeSource?.sourceUpdatedAt
      ?? source.sourceUpdatedAt
      ?? matter.updated_at.toISOString();
    const sourceMode = authoritativeSource?.mode ?? source.mode;
    const decisionRef = hashRef('matter-source-mutation', [
      input.tenantId,
      input.matterId,
      input.purpose,
      sourceMode,
      sourceUpdatedAt,
      sourceRevision,
      matter.status,
    ]);

    return {
      decisionRef,
      matterId: matter.matter_id,
      permissionDecisionRef: decisionRef,
      sourceMode,
      sourceRevision,
      sourceUpdatedAt,
    };
  }

  private validateAuthoritativeSource(
    authority: AuthoritativeMatterAppSource,
    source: Awaited<ReturnType<MatterAppRuntimeService['status']>>,
    now: Date,
  ): AuthoritativeMatterAppSource {
    const updatedAtMs = Date.parse(authority.sourceUpdatedAt);
    const operationExpiresAtMs = authority.operationExpiresAt
      ? Date.parse(authority.operationExpiresAt)
      : Number.NaN;
    const operationBoundProofActive = authority.operationExpiresAt !== undefined
      && Number.isFinite(operationExpiresAtMs)
      && new Date(operationExpiresAtMs).toISOString() === authority.operationExpiresAt
      && operationExpiresAtMs > now.getTime()
      && operationExpiresAtMs - updatedAtMs <= MAX_OPERATION_SOURCE_PROOF_MS;
    const validTimestamp = Number.isFinite(updatedAtMs)
      && new Date(updatedAtMs).toISOString() === authority.sourceUpdatedAt
      && updatedAtMs <= now.getTime() + 60_000
      && (
        now.getTime() - updatedAtMs <= source.stalenessMaxSeconds * 1_000
        || operationBoundProofActive
      );
    const sourceFailureCanBeReplaced = source.unavailableReason === undefined
      || source.unavailableReason === 'stale_projection';
    if (
      authority.mode !== 'matter_app_api'
      || !authority.sourceRevision
      || authority.sourceRevision.length > 256
      || source.requestedMode !== 'matter_app_api'
      || source.sourceConfigured !== true
      || source.runtimeReady !== true
      || !sourceFailureCanBeReplaced
      || !validTimestamp
    ) {
      throw validationFailed('MATTER_SOURCE_PROOF_INVALID');
    }
    return authority;
  }

  private async canUploadToMatter(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
  ): Promise<PermissionDecision> {
    try {
      return await this.permissionService.canUploadToMatter(
        { tenantId, userId: actorUserId },
        matterId,
      );
    } catch {
      this.logger.warn({ code: 'PERM_EVAL_ERROR', matterId });
      throw permissionDenied();
    }
  }

  private async findMatter(tenantId: TenantId, matterId: string): Promise<MatterSourceRow | null> {
    const result = await tenantQuery<MatterSourceRow>(
      this.databaseService,
      tenantId,
      `
        SELECT matter_id, matter_code, status, metadata_json, updated_at
        FROM matters
        WHERE tenant_id = $1
          AND matter_id = $2
        LIMIT 1
      `,
      [tenantId, matterId],
    );
    return result.rows[0] ?? null;
  }
}
