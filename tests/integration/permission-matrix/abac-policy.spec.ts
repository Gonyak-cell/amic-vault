import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { PermissionService } from '../../../apps/api/src/modules/permission/permission.service';
import {
  createAppClient,
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from '../helpers/db';

const betaOwnerUserId = '22222222-2222-4222-8222-222222222201';
const betaMemberUserId = '22222222-2222-4222-8222-222222222202';

interface MatterFixture {
  clientId: string;
  matterId: string;
}

describe('ABAC permission policy integration', () => {
  let app: INestApplication;
  let permissionService: PermissionService;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    permissionService = app.get(PermissionService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps policy attribute catalog tenant-scoped with RLS', async () => {
    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantBetaId);
      await client.query(
        `
          INSERT INTO permission_policy_attributes (
            tenant_id, attribute_key, resource_scope, value_type
          )
          VALUES ($1, 'matter.practice_group', 'matter', 'string')
          ON CONFLICT (tenant_id, attribute_key) DO UPDATE
            SET status = 'active'
        `,
        [tenantBetaId],
      );
      const betaRows = await client.query(
        'SELECT attribute_key FROM permission_policy_attributes ORDER BY attribute_key',
      );
      expect(betaRows.rows).toEqual([{ attribute_key: 'matter.practice_group' }]);

      await setTenant(client, tenantAlphaId);
      const alphaRows = await client.query(
        'SELECT attribute_key FROM permission_policy_attributes ORDER BY attribute_key',
      );
      expect(alphaRows.rows).toEqual([]);
    });
  });

  it('applies supported matter conditions and ignores valid false conditions', async () => {
    const denied = await createMatterFixture('litigation');
    await insertPermission({
      resourceType: 'matter',
      resourceId: denied.matterId,
      action: 'read',
      effect: 'DENY',
      conditionJson: { attribute: 'actor.practice_group', operator: 'eq', value: 'tax' },
    });

    await expect(
      permissionService.canReadMatter(
        { tenantId: tenantBetaId, userId: betaMemberUserId },
        denied.matterId,
      ),
    ).resolves.toMatchObject({
      effect: 'DENY',
      appliedRules: ['permissions:explicit_deny'],
    });

    const allowed = await createMatterFixture('tax');
    await insertPermission({
      resourceType: 'matter',
      resourceId: allowed.matterId,
      action: 'read',
      effect: 'DENY',
      conditionJson: { attribute: 'matter.practice_group', operator: 'eq', value: 'litigation' },
    });

    await expect(
      permissionService.canReadMatter(
        { tenantId: tenantBetaId, userId: betaMemberUserId },
        allowed.matterId,
      ),
    ).resolves.toMatchObject({ effect: 'ALLOW' });
  });

  it('uses valid document conditions for explicit allow and treats expired allow as absent', async () => {
    const matter = await createMatterFixture('tax');
    const allowedDocumentId = await createDocumentFixture(matter.matterId, 'high');
    await insertPermission({
      resourceType: 'document',
      resourceId: allowedDocumentId,
      action: 'read',
      effect: 'ALLOW',
      conditionJson: {
        all: [
          { attribute: 'matter.practice_group', operator: 'eq', value: 'tax' },
          { attribute: 'document.confidentiality_level', operator: 'eq', value: 'high' },
        ],
      },
    });

    await expect(
      permissionService.canReadDocument(
        { tenantId: tenantBetaId, userId: betaMemberUserId },
        allowedDocumentId,
      ),
    ).resolves.toMatchObject({ effect: 'ALLOW' });

    const expiredDocumentId = await createDocumentFixture(matter.matterId, 'high');
    await insertPermission({
      resourceType: 'document',
      resourceId: expiredDocumentId,
      action: 'read',
      effect: 'ALLOW',
      conditionJson: { attribute: 'matter.practice_group', operator: 'eq', value: 'tax' },
      expired: true,
    });

    await expect(
      permissionService.canReadDocument(
        { tenantId: tenantBetaId, userId: betaMemberUserId },
        expiredDocumentId,
      ),
    ).resolves.toMatchObject({
      effect: 'DENY',
      appliedRules: ['document.confidentiality:high:explicit_allow_required'],
    });
  });

  it('fails closed for unknown attributes and preserves deny-overrides over priority', async () => {
    const matter = await createMatterFixture('tax');
    const invalidDocumentId = await createDocumentFixture(matter.matterId, 'standard');
    await insertPermission({
      resourceType: 'document',
      resourceId: invalidDocumentId,
      action: 'read',
      effect: 'ALLOW',
      conditionJson: { attribute: 'matter.billing_rate', operator: 'eq', value: 'private' },
    });

    await expect(
      permissionService.canReadDocument(
        { tenantId: tenantBetaId, userId: betaMemberUserId },
        invalidDocumentId,
      ),
    ).resolves.toMatchObject({
      effect: 'DENY',
      appliedRules: ['permissions:condition_invalid:unknown_attribute'],
    });

    const deniedDocumentId = await createDocumentFixture(matter.matterId, 'high');
    await insertPermission({
      resourceType: 'document',
      resourceId: deniedDocumentId,
      action: 'read',
      effect: 'ALLOW',
      priority: 1,
      conditionJson: { attribute: 'matter.practice_group', operator: 'eq', value: 'tax' },
    });
    await insertPermission({
      resourceType: 'document',
      resourceId: deniedDocumentId,
      action: 'read',
      effect: 'DENY',
      priority: 100,
      conditionJson: { attribute: 'actor.practice_group', operator: 'eq', value: 'tax' },
    });

    await expect(
      permissionService.canReadDocument(
        { tenantId: tenantBetaId, userId: betaMemberUserId },
        deniedDocumentId,
      ),
    ).resolves.toMatchObject({
      effect: 'DENY',
      appliedRules: ['permissions:explicit_deny'],
    });
  });
});

async function createMatterFixture(practiceGroup: string): Promise<MatterFixture> {
  const clientId = randomUUID();
  const matterId = randomUUID();
  await withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        INSERT INTO clients (client_id, tenant_id, name, created_by)
        VALUES ($1, $2, $3, $4)
      `,
      [clientId, tenantBetaId, `ABAC Client ${clientId}`, betaOwnerUserId],
    );
    await client.query(
      `
        INSERT INTO matters (
          matter_id, tenant_id, client_id, matter_code, matter_name, matter_type,
          lead_lawyer_id, practice_group, created_by
        )
        VALUES ($1, $2, $3, $4, $5, 'contract', $6, $7, $6)
      `,
      [
        matterId,
        tenantBetaId,
        clientId,
        `ABAC-${matterId}`,
        `ABAC Matter ${matterId}`,
        betaOwnerUserId,
        practiceGroup,
      ],
    );
    await client.query(
      `
        INSERT INTO matter_members (
          tenant_id, matter_id, user_id, matter_role, access_level, added_by
        )
        VALUES ($1, $2, $3, 'member', 'read', $4)
      `,
      [tenantBetaId, matterId, betaMemberUserId, betaOwnerUserId],
    );
  });
  return { clientId, matterId };
}

async function createDocumentFixture(
  matterId: string,
  confidentialityLevel: 'standard' | 'high',
): Promise<string> {
  const documentId = randomUUID();
  await withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        INSERT INTO documents (
          document_id, tenant_id, matter_id, document_family_id, title,
          document_type, confidentiality_level, created_by
        )
        VALUES ($1, $2, $3, $4, $5, 'contract', $6, $7)
      `,
      [
        documentId,
        tenantBetaId,
        matterId,
        randomUUID(),
        `ABAC Document ${documentId}`,
        confidentialityLevel,
        betaOwnerUserId,
      ],
    );
  });
  return documentId;
}

async function insertPermission(input: {
  resourceType: 'matter' | 'document';
  resourceId: string;
  action: 'read';
  effect: 'ALLOW' | 'DENY';
  conditionJson: Record<string, unknown>;
  priority?: number;
  expired?: boolean;
}): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        INSERT INTO permissions (
          tenant_id, subject_type, subject_id, resource_type, resource_id,
          action, effect, condition_json, priority, valid_to, created_by
        )
        VALUES (
          $1, 'user', $2, $3, $4, $5, $6, $7::jsonb, $8,
          CASE WHEN $10::boolean THEN now() - interval '1 minute' ELSE NULL END,
          $9
        )
      `,
      [
        tenantBetaId,
        betaMemberUserId,
        input.resourceType,
        input.resourceId,
        input.action,
        input.effect,
        JSON.stringify(input.conditionJson),
        input.priority ?? 100,
        betaOwnerUserId,
        input.expired ?? false,
      ],
    );
  });
}
