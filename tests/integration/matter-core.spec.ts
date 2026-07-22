import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/modules/auth/session.repository';
import {
  createAppClient,
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from './helpers/db';

const betaOwnerUserId = '22222222-2222-4222-8222-222222222201';
const betaMemberUserId = '22222222-2222-4222-8222-222222222202';

async function login(
  baseUrl: string,
  input: { tenantId: string; email: string; password: string },
): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=`));
  return cookie;
}

async function createClient(baseUrl: string, cookie: string, name: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/clients`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { clientId: string }).clientId;
}

async function createMatter(
  baseUrl: string,
  cookie: string,
  input: {
    clientId: string;
    matterCode?: string;
    matterName?: string;
    matterType?: string;
    leadLawyerId?: string;
    leadPartnerId?: string;
    leadAssociateId?: string;
    confidentialityLevel?: 'standard' | 'high' | 'restricted';
    accessScope?: 'firm_open' | 'restricted';
    intakeTemplateCode?: 'default_open' | 'restricted';
  },
) {
  return fetch(`${baseUrl}/v1/matters`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId: input.clientId,
      matterCode: input.matterCode ?? `M-${randomUUID()}`,
      matterName: input.matterName ?? `Matter ${randomUUID()}`,
      matterType: input.matterType ?? 'contract',
      leadLawyerId: input.leadLawyerId,
      leadPartnerId: input.leadPartnerId,
      leadAssociateId: input.leadAssociateId,
      confidentialityLevel: input.confidentialityLevel,
      accessScope: input.accessScope,
      intakeTemplateCode: input.intakeTemplateCode,
    }),
  });
}

async function latestMatterAudit(matterId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ metadata_json: Record<string, unknown> }>(
      `
        SELECT metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'MATTER_CREATED'
          AND target_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantBetaId, matterId],
    );
    return result.rows[0];
  });
}

async function latestMatterUpdateAudit(matterId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ metadata_json: Record<string, unknown> }>(
      `
        SELECT metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'MATTER_UPDATED'
          AND target_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantBetaId, matterId],
    );
    return result.rows[0];
  });
}

async function matterAiPolicyId(matterId: string): Promise<string | null> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ ai_policy_id: string | null }>(
      `
        SELECT ai_policy_id::text
        FROM matters
        WHERE tenant_id = $1
          AND matter_id = $2
        LIMIT 1
      `,
      [tenantBetaId, matterId],
    );
    return result.rows[0]?.ai_policy_id ?? null;
  });
}

async function setMatterIntakeTemplateStatus(
  templateCode: 'default_open' | 'restricted',
  status: 'active' | 'disabled',
): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantBetaId);
    const result = await client.query(
      `
        UPDATE matter_intake_templates
        SET status = $3,
            updated_at = now()
        WHERE tenant_id = $1
          AND template_code = $2
      `,
      [tenantBetaId, templateCode, status],
    );
    expect(result.rowCount).toBeGreaterThan(0);
  });
}

async function setMatterIntakeTemplateAccessScope(
  templateCode: 'default_open' | 'restricted',
  accessScope: 'firm_open' | 'restricted',
): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantBetaId);
    const result = await client.query(
      `
        UPDATE matter_intake_templates
        SET default_access_scope = $3,
            updated_at = now()
        WHERE tenant_id = $1
          AND template_code = $2
      `,
      [tenantBetaId, templateCode, accessScope],
    );
    expect(result.rowCount).toBeGreaterThan(0);
  });
}

async function countMattersByCode(matterCode: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM matters
        WHERE tenant_id = $1
          AND matter_code = $2
      `,
      [tenantBetaId, matterCode],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

async function countMatterMembersByCode(matterCode: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM matter_members mm
        JOIN matters m
          ON m.tenant_id = mm.tenant_id
         AND m.matter_id = mm.matter_id
        WHERE m.tenant_id = $1
          AND m.matter_code = $2
      `,
      [tenantBetaId, matterCode],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

async function matterMembers(
  matterId: string,
): Promise<Array<{ access_level: string; matter_role: string; user_id: string }>> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      access_level: string;
      matter_role: string;
      user_id: string;
    }>(
      `
        SELECT user_id::text, matter_role, access_level
        FROM matter_members
        WHERE tenant_id = $1
          AND matter_id = $2
        ORDER BY user_id
      `,
      [tenantBetaId, matterId],
    );
    return result.rows;
  });
}

async function countMatterCreatedAuditsByClient(clientId: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'MATTER_CREATED'
          AND metadata_json ->> 'client_id' = $2
      `,
      [tenantBetaId, clientId],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

async function createWallForMatter(matterId: string): Promise<string> {
  const wallId = randomUUID();
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantBetaId);
    await client.query(
      `
        INSERT INTO ethical_walls (wall_id, tenant_id, matter_id, wall_name, reason, created_by)
        VALUES ($1, $2, $3, $4, 'a8_matter_wall_visibility', $5)
      `,
      [wallId, tenantBetaId, matterId, `A8 Matter Wall ${wallId}`, betaOwnerUserId],
    );
  });
  return wallId;
}

async function releaseWall(wallId: string): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantBetaId);
    await client.query(
      `
        UPDATE ethical_walls
        SET status = 'released',
            released_by = $3,
            released_at = now()
        WHERE tenant_id = $1
          AND wall_id = $2
      `,
      [tenantBetaId, wallId, betaOwnerUserId],
    );
  });
}

describe('matter core integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let alphaOwnerCookie: string;
  let betaOwnerCookie: string;
  let betaMemberCookie: string;
  let betaClientId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    alphaOwnerCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
    betaOwnerCookie = await login(baseUrl, {
      tenantId: tenantBetaId,
      email: 'beta-matter-owner@test.local',
      password: 'dev-beta-owner-password',
    });
    betaMemberCookie = await login(baseUrl, {
      tenantId: tenantBetaId,
      email: 'beta-member@test.local',
      password: 'dev-beta-member-password',
    });
    betaClientId = await createClient(
      baseUrl,
      betaOwnerCookie,
      `Beta Matter Client ${randomUUID()}`,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates and reads a matter with reference-only audit metadata', async () => {
    const response = await createMatter(baseUrl, betaOwnerCookie, {
      clientId: betaClientId,
      confidentialityLevel: 'high',
      leadAssociateId: betaMemberUserId,
      leadPartnerId: betaOwnerUserId,
      matterName: 'Beta Confidential Matter',
    });
    const body = await response.text();
    expect(response.status, body).toBe(201);
    const matter = JSON.parse(body) as {
      accessScope: string;
      clientDisplayName: string;
      confidentialityLevel: string;
      ethicalWallActive: boolean;
      leadAssociateId: string | null;
      matterId: string;
      leadLawyerId: string;
      leadPartnerId: string | null;
      status: string;
    };
    expect(matter.accessScope).toBe('firm_open');
    expect(matter.clientDisplayName).toMatch(/^Beta Matter Client /);
    expect(matter.confidentialityLevel).toBe('high');
    expect(matter.ethicalWallActive).toBe(false);
    expect(matter.leadLawyerId).toBe(betaOwnerUserId);
    expect(matter.leadPartnerId).toBe(betaOwnerUserId);
    expect(matter.leadAssociateId).toBe(betaMemberUserId);
    expect(matter.status).toBe('proposed');

    const audit = await latestMatterAudit(matter.matterId);
    expect(audit?.metadata_json).toEqual(
      expect.objectContaining({
        matter_id: matter.matterId,
        client_id: betaClientId,
        template_ref: 'matter_intake_template:default_open',
        template_id: expect.any(String),
        policy_id: expect.any(String),
      }),
    );
    expect(JSON.stringify(audit?.metadata_json)).not.toContain('Beta Confidential Matter');
    await expect(matterAiPolicyId(matter.matterId)).resolves.toBe(audit?.metadata_json.policy_id);

    const detail = await fetch(`${baseUrl}/v1/matters/${matter.matterId}`, {
      headers: { cookie: betaOwnerCookie },
    });
    const detailBody = await detail.text();
    expect(detail.status, detailBody).toBe(200);
    expect(JSON.parse(detailBody)).toMatchObject({
      clientDisplayName: matter.clientDisplayName,
      confidentialityLevel: 'high',
      ethicalWallActive: false,
      leadAssociateId: betaMemberUserId,
      leadPartnerId: betaOwnerUserId,
      matterId: matter.matterId,
    });

    const list = await fetch(`${baseUrl}/v1/matters?pageSize=1`, {
      headers: { cookie: betaOwnerCookie },
    });
    const listBody = await list.text();
    expect(list.status, listBody).toBe(200);
    expect(
      JSON.parse(listBody) as {
        items: Array<{
          confidentialityLevel: string;
          ethicalWallActive: boolean;
          matterId: string;
          status: string;
        }>;
      },
    ).toMatchObject({
      items: [
        {
          confidentialityLevel: 'high',
          ethicalWallActive: false,
          matterId: matter.matterId,
          status: 'proposed',
        },
      ],
    });
  });

  it('links related matters, blocks cross-tenant links, exposes wall status, and masks unreadable related matter labels', async () => {
    const sourceResponse = await createMatter(baseUrl, betaOwnerCookie, {
      clientId: betaClientId,
      matterCode: `A8-SOURCE-${randomUUID()}`,
      matterName: 'A8 Related Source',
    });
    const sourceBody = await sourceResponse.text();
    expect(sourceResponse.status, sourceBody).toBe(201);
    const source = JSON.parse(sourceBody) as { matterId: string };
    await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantBetaId);
      await client.query(
        `
          INSERT INTO matter_members (
            tenant_id, matter_id, user_id, matter_role, access_level, added_by
          )
          VALUES ($1, $2, $3, 'member', 'read', $4)
          ON CONFLICT (matter_id, user_id) DO NOTHING
        `,
        [tenantBetaId, source.matterId, betaMemberUserId, betaOwnerUserId],
      );
    });

    const targetResponse = await createMatter(baseUrl, betaOwnerCookie, {
      clientId: betaClientId,
      matterCode: `A8-TARGET-${randomUUID()}`,
      matterName: 'A8 Related Target',
    });
    const targetBody = await targetResponse.text();
    expect(targetResponse.status, targetBody).toBe(201);
    const target = JSON.parse(targetBody) as { matterId: string };

    const addRelation = await fetch(`${baseUrl}/v1/matters/${source.matterId}/related-matters`, {
      method: 'POST',
      headers: { cookie: betaOwnerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ relatedMatterId: target.matterId, relationType: 'preceding' }),
    });
    const addRelationBody = await addRelation.text();
    expect(addRelation.status, addRelationBody).toBe(201);
    expect(JSON.parse(addRelationBody)).toMatchObject({
      items: [
        {
          canReadRelatedMatter: true,
          relatedMatterId: target.matterId,
          relatedMatterName: 'A8 Related Target',
          relationType: 'preceding',
        },
      ],
    });

    const inverseRelation = await fetch(
      `${baseUrl}/v1/matters/${target.matterId}/related-matters`,
      {
        headers: { cookie: betaOwnerCookie },
      },
    );
    const inverseRelationBody = await inverseRelation.text();
    expect(inverseRelation.status, inverseRelationBody).toBe(200);
    expect(JSON.parse(inverseRelationBody)).toMatchObject({
      items: [
        {
          canReadRelatedMatter: true,
          relatedMatterId: source.matterId,
          relatedMatterName: 'A8 Related Source',
          relationType: 'subsequent',
        },
      ],
    });

    const relationAudit = await latestMatterUpdateAudit(source.matterId);
    expect(relationAudit?.metadata_json).toEqual(
      expect.objectContaining({
        matter_id: source.matterId,
        diff_keys: ['related_matters'],
        related_matter_id: target.matterId,
        relation_type: 'preceding',
      }),
    );
    expect(JSON.stringify(relationAudit?.metadata_json)).not.toContain('A8 Related Target');

    const alphaClientId = await createClient(
      baseUrl,
      alphaOwnerCookie,
      `Alpha Related Matter Client ${randomUUID()}`,
    );
    const alphaMatterResponse = await createMatter(baseUrl, alphaOwnerCookie, {
      clientId: alphaClientId,
      matterCode: `A8-ALPHA-${randomUUID()}`,
      matterName: 'A8 Alpha Related Target',
    });
    const alphaMatterBody = await alphaMatterResponse.text();
    expect(alphaMatterResponse.status, alphaMatterBody).toBe(201);
    const alphaMatter = JSON.parse(alphaMatterBody) as { matterId: string };

    const crossTenantAdd = await fetch(`${baseUrl}/v1/matters/${source.matterId}/related-matters`, {
      method: 'POST',
      headers: { cookie: betaOwnerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ relatedMatterId: alphaMatter.matterId, relationType: 'parallel' }),
    });
    const crossTenantAddBody = await crossTenantAdd.text();
    expect(crossTenantAdd.status, crossTenantAddBody).toBe(404);
    expect(crossTenantAddBody).not.toContain(alphaMatter.matterId);

    await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantBetaId);
      await expect(
        client.query(
          `
            INSERT INTO related_matters (
              tenant_id, matter_id, related_matter_id, relation_type, created_by
            )
            VALUES ($1, $2, $3, 'parallel', $4)
          `,
          [tenantBetaId, source.matterId, alphaMatter.matterId, betaOwnerUserId],
        ),
      ).rejects.toThrow(/foreign key constraint/);
    });

    const wallId = await createWallForMatter(source.matterId);
    const activeWall = await fetch(`${baseUrl}/v1/matters/${source.matterId}`, {
      headers: { cookie: betaOwnerCookie },
    });
    const activeWallBody = await activeWall.text();
    expect(activeWall.status, activeWallBody).toBe(200);
    expect(JSON.parse(activeWallBody)).toMatchObject({ ethicalWallActive: true });
    await releaseWall(wallId);
    const releasedWall = await fetch(`${baseUrl}/v1/matters/${source.matterId}`, {
      headers: { cookie: betaOwnerCookie },
    });
    const releasedWallBody = await releasedWall.text();
    expect(releasedWall.status, releasedWallBody).toBe(200);
    expect(JSON.parse(releasedWallBody)).toMatchObject({ ethicalWallActive: false });

    const restrictedResponse = await createMatter(baseUrl, betaOwnerCookie, {
      accessScope: 'restricted',
      clientId: betaClientId,
      confidentialityLevel: 'restricted',
      intakeTemplateCode: 'restricted',
      matterCode: `A8-RESTRICTED-${randomUUID()}`,
      matterName: 'A8 Restricted Related Target',
    });
    const restrictedBody = await restrictedResponse.text();
    expect(restrictedResponse.status, restrictedBody).toBe(201);
    const restricted = JSON.parse(restrictedBody) as { matterId: string };

    const addRestrictedRelation = await fetch(
      `${baseUrl}/v1/matters/${source.matterId}/related-matters`,
      {
        method: 'POST',
        headers: { cookie: betaOwnerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ relatedMatterId: restricted.matterId, relationType: 'parallel' }),
      },
    );
    expect(addRestrictedRelation.status, await addRestrictedRelation.text()).toBe(201);

    const memberView = await fetch(`${baseUrl}/v1/matters/${source.matterId}/related-matters`, {
      headers: { cookie: betaMemberCookie },
    });
    const memberViewBody = await memberView.text();
    expect(memberView.status, memberViewBody).toBe(200);
    const restrictedItem = (
      JSON.parse(memberViewBody) as {
        items: Array<{
          canReadRelatedMatter: boolean;
          relatedMatterId: string;
          relatedMatterName: string | null;
          safeLabel: string;
        }>;
      }
    ).items.find((item) => item.relatedMatterId === restricted.matterId);
    expect(restrictedItem).toMatchObject({
      canReadRelatedMatter: false,
      relatedMatterName: null,
      safeLabel: '권한 제한 Matter',
    });
    expect(memberViewBody).not.toContain('A8 Restricted Related Target');
  });

  it('applies the restricted intake template with AI policy, lead owner, and reference-only audit metadata', async () => {
    const matterCode = `RESTRICTED-TEMPLATE-${randomUUID()}`;
    const response = await createMatter(baseUrl, betaOwnerCookie, {
      accessScope: 'restricted',
      clientId: betaClientId,
      intakeTemplateCode: 'restricted',
      leadLawyerId: betaMemberUserId,
      matterCode,
      matterName: 'Restricted Template Matter',
    });
    const body = await response.text();
    expect(response.status, body).toBe(201);
    const matter = JSON.parse(body) as {
      accessScope: string;
      leadLawyerId: string;
      matterId: string;
    };
    expect(matter.accessScope).toBe('restricted');
    expect(matter.leadLawyerId).toBe(betaMemberUserId);

    const audit = await latestMatterAudit(matter.matterId);
    expect(audit?.metadata_json).toEqual(
      expect.objectContaining({
        matter_id: matter.matterId,
        client_id: betaClientId,
        template_ref: 'matter_intake_template:restricted',
        template_id: expect.any(String),
        policy_id: expect.any(String),
      }),
    );
    expect(JSON.stringify(audit?.metadata_json)).not.toContain('Restricted Template Matter');
    await expect(matterAiPolicyId(matter.matterId)).resolves.toBe(audit?.metadata_json.policy_id);
    await expect(matterMembers(matter.matterId)).resolves.toEqual([
      {
        access_level: 'edit',
        matter_role: 'owner',
        user_id: betaMemberUserId,
      },
    ]);
  });

  it('updates matter metadata with diff-only audit metadata', async () => {
    const response = await createMatter(baseUrl, betaOwnerCookie, {
      clientId: betaClientId,
      matterName: 'Beta Matter Before Update',
    });
    const body = await response.text();
    expect(response.status, body).toBe(201);
    const matter = JSON.parse(body) as { matterId: string };

    const update = await fetch(`${baseUrl}/v1/matters/${matter.matterId}`, {
      method: 'PATCH',
      headers: { cookie: betaOwnerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterName: 'Beta Matter After Update',
        metadata: { stage: 'intake' },
      }),
    });
    const updateBody = await update.text();
    expect(update.status, updateBody).toBe(200);
    expect(JSON.parse(updateBody)).toMatchObject({
      matterName: 'Beta Matter After Update',
      metadata: { stage: 'intake' },
    });

    const audit = await latestMatterUpdateAudit(matter.matterId);
    expect(audit?.metadata_json).toEqual({
      matter_id: matter.matterId,
      diff_keys: ['matter_name', 'metadata'],
    });
    expect(JSON.stringify(audit?.metadata_json)).not.toContain('Beta Matter After Update');
    expect(JSON.stringify(audit?.metadata_json)).not.toContain('intake');
  });

  it('fails closed for unresolved clients, cross-tenant clients, and non-manager creates', async () => {
    const missingClient = await createMatter(baseUrl, betaOwnerCookie, {
      clientId: randomUUID(),
    });
    const missingClientBody = await missingClient.text();
    expect(missingClient.status, missingClientBody).toBe(404);
    expect(missingClientBody).toContain('PERMISSION_DENIED');

    const alphaClientId = await createClient(
      baseUrl,
      alphaOwnerCookie,
      `Alpha Matter Client ${randomUUID()}`,
    );
    const crossTenant = await createMatter(baseUrl, betaOwnerCookie, {
      clientId: alphaClientId,
    });
    const crossTenantBody = await crossTenant.text();
    expect(crossTenant.status, crossTenantBody).toBe(404);
    expect(crossTenantBody).toContain('PERMISSION_DENIED');
    expect(crossTenantBody).not.toContain(alphaClientId);

    const denied = await createMatter(baseUrl, betaMemberCookie, {
      clientId: betaClientId,
    });
    expect(denied.status, await denied.text()).toBe(403);

    const invalidType = await createMatter(baseUrl, betaOwnerCookie, {
      clientId: betaClientId,
      matterType: 'MA',
    });
    expect(invalidType.status, await invalidType.text()).toBe(400);
  });

  it('fails closed before insert when the selected intake template is disabled', async () => {
    const matterCode = `DISABLED-TEMPLATE-${randomUUID()}`;
    const disabledTemplateClientId = await createClient(
      baseUrl,
      betaOwnerCookie,
      `Beta Disabled Template Client ${randomUUID()}`,
    );
    const auditCountBefore = await countMatterCreatedAuditsByClient(disabledTemplateClientId);
    await setMatterIntakeTemplateStatus('restricted', 'disabled');
    try {
      const response = await createMatter(baseUrl, betaOwnerCookie, {
        accessScope: 'restricted',
        clientId: disabledTemplateClientId,
        intakeTemplateCode: 'restricted',
        matterCode,
      });
      const body = await response.text();
      expect(response.status, body).toBe(400);
      expect(body).toContain('VALIDATION_FAILED');
      await expect(countMattersByCode(matterCode)).resolves.toBe(0);
      await expect(countMatterMembersByCode(matterCode)).resolves.toBe(0);
      await expect(countMatterCreatedAuditsByClient(disabledTemplateClientId)).resolves.toBe(
        auditCountBefore,
      );
    } finally {
      await setMatterIntakeTemplateStatus('restricted', 'active');
    }
  });

  it('rolls back matter creation when an active intake template violates its access-scope contract', async () => {
    const matterCode = `BAD-TEMPLATE-SCOPE-${randomUUID()}`;
    const badTemplateClientId = await createClient(
      baseUrl,
      betaOwnerCookie,
      `Beta Bad Template Scope Client ${randomUUID()}`,
    );
    const auditCountBefore = await countMatterCreatedAuditsByClient(badTemplateClientId);
    await setMatterIntakeTemplateAccessScope('restricted', 'firm_open');
    try {
      const response = await createMatter(baseUrl, betaOwnerCookie, {
        accessScope: 'restricted',
        clientId: badTemplateClientId,
        intakeTemplateCode: 'restricted',
        matterCode,
      });
      const body = await response.text();
      expect(response.status, body).toBe(400);
      expect(body).toContain('MATTER_TEMPLATE_ACCESS_SCOPE_MISMATCH');
      await expect(countMattersByCode(matterCode)).resolves.toBe(0);
      await expect(countMatterMembersByCode(matterCode)).resolves.toBe(0);
      await expect(countMatterCreatedAuditsByClient(badTemplateClientId)).resolves.toBe(
        auditCountBefore,
      );
    } finally {
      await setMatterIntakeTemplateAccessScope('restricted', 'restricted');
    }
  });

  it('applies membership detail and list guards at query time', async () => {
    const ownerMatterResponse = await createMatter(baseUrl, betaOwnerCookie, {
      accessScope: 'restricted',
      clientId: betaClientId,
      intakeTemplateCode: 'restricted',
      matterCode: `OWNER-${randomUUID()}`,
      matterType: 'finance',
    });
    const ownerMatter = JSON.parse(await ownerMatterResponse.text()) as { matterId: string };

    const memberMatterResponse = await createMatter(baseUrl, betaOwnerCookie, {
      accessScope: 'restricted',
      clientId: betaClientId,
      intakeTemplateCode: 'restricted',
      matterCode: `MEMBER-${randomUUID()}`,
      matterType: 'finance',
      leadLawyerId: betaMemberUserId,
    });
    const memberMatter = JSON.parse(await memberMatterResponse.text()) as { matterId: string };

    const memberDenied = await fetch(`${baseUrl}/v1/matters/${ownerMatter.matterId}`, {
      headers: { cookie: betaMemberCookie },
    });
    expect(memberDenied.status, await memberDenied.text()).toBe(404);

    const memberDetail = await fetch(`${baseUrl}/v1/matters/${memberMatter.matterId}`, {
      headers: { cookie: betaMemberCookie },
    });
    expect(memberDetail.status, await memberDetail.text()).toBe(200);

    const ownerList = await fetch(
      `${baseUrl}/v1/matters?matterType=finance&clientId=${betaClientId}&pageSize=100`,
      { headers: { cookie: betaOwnerCookie } },
    );
    const ownerListBody = await ownerList.text();
    expect(ownerList.status, ownerListBody).toBe(200);
    const ownerItems = (
      JSON.parse(ownerListBody) as {
        items: Array<{ clientDisplayName: string; matterId: string }>;
      }
    ).items;
    expect(ownerItems.some((item) => item.matterId === ownerMatter.matterId)).toBe(true);
    expect(
      ownerItems.some((item) => item.clientDisplayName.startsWith('Beta Matter Client ')),
    ).toBe(true);
    expect(ownerItems.some((item) => item.matterId === memberMatter.matterId)).toBe(false);

    const crossTenant = await fetch(`${baseUrl}/v1/matters/${memberMatter.matterId}`, {
      headers: { cookie: alphaOwnerCookie },
    });
    expect(crossTenant.status, await crossTenant.text()).toBe(404);
  });

  it('enforces DB checks and RLS through the app role', async () => {
    await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantBetaId);
      await expect(
        client.query(
          `
            INSERT INTO matters (
              tenant_id, client_id, matter_code, matter_name, matter_type, created_by
            )
            VALUES ($1, $2, $3, 'Invalid Type Matter', 'MA', $4)
          `,
          [tenantBetaId, betaClientId, `BADTYPE-${randomUUID()}`, betaOwnerUserId],
        ),
      ).rejects.toThrow(/matters_matter_type_check/);
      await expect(
        client.query(
          `
            INSERT INTO matters (
              tenant_id, client_id, matter_code, matter_name, matter_type,
              opened_at, closed_at, created_by
            )
            VALUES (
              $1, $2, $3, 'Bad Dates Matter', 'contract',
              '2026-01-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z', $4
            )
          `,
          [tenantBetaId, betaClientId, `BADDATES-${randomUUID()}`, betaOwnerUserId],
        ),
      ).rejects.toThrow(/check constraint/);
    });

    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query('SELECT matter_id FROM matters WHERE tenant_id = $1', [
        tenantBetaId,
      ]);
      expect(result.rowCount).toBe(0);
    });
  });
});
