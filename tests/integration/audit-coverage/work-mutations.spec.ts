import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type {
  DmsWorkQueueResponseDto,
  DmsWorkReassignmentCandidatesResponseDto,
  UserRole,
} from '@amic-vault/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import {
  createOpaqueToken,
  hashOpaqueToken,
  SESSION_COOKIE_NAME,
} from '../../../apps/api/src/modules/auth/session.repository';
import {
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from '../helpers/db';

const alphaFirmAdminUserId = '11111111-1111-4111-8111-111111111100';
const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';
const alphaMemberUserId = '11111111-1111-4111-8111-111111111102';
const alphaRbacTargetUserId = '11111111-1111-4111-8111-111111111104';
const alphaPermissionMemberUserId = '11111111-1111-4111-8111-111111111105';
const auditFailureTrigger = 'test_work_mutation_audit_failure';
const auditFailureFunction = 'test_work_mutation_audit_failure_fn';

interface WorkItemFixture {
  workItemId: string;
  itemKey: string;
  dueAt: string;
}

interface WorkItemState {
  assigned_to_user_id: string;
  due_at: Date;
  status: string;
  last_action: string | null;
}

interface AccessDeniedAudit {
  target_type: string;
  target_id: string;
  matter_id: string;
  result: string;
  metadata_json: Record<string, unknown>;
}

async function createSessionCookie(userId: string): Promise<string> {
  const token = createOpaqueToken();
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO sessions (
          tenant_id, user_id, token_hash, expires_at, mfa_verified
        )
        VALUES ($1, $2, $3, now() + interval '1 hour', true)
      `,
      [tenantAlphaId, userId, hashOpaqueToken(token)],
    );
  });
  return `${SESSION_COOKIE_NAME}=${token}`;
}

async function createClient(baseUrl: string, cookie: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/clients`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: `Work Mutation Client ${randomUUID()}` }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { clientId: string }).clientId;
}

async function createMatter(baseUrl: string, cookie: string, clientId: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/matters`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId,
      matterCode: `WORK-${randomUUID()}`,
      matterName: `Work Mutation ${randomUUID()}`,
      matterType: 'contract',
      leadLawyerId: alphaOwnerUserId,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { matterId: string }).matterId;
}

async function addMatterMember(
  baseUrl: string,
  cookie: string,
  matterId: string,
  userId: string,
  matterRole: 'owner' | 'member' | 'limited_reviewer' = 'member',
  accessLevel: 'read' | 'edit' = matterRole === 'limited_reviewer' ? 'read' : 'edit',
): Promise<void> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/members`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      userId,
      matterRole,
      accessLevel,
    }),
  });
  expect(response.status, await response.text()).toBe(201);
}

async function insertCandidateUser(input: {
  name: string;
  role?: UserRole;
  status?: 'active' | 'inactive' | 'locked';
  matterId?: string;
  matterRole?: 'owner' | 'member' | 'limited_reviewer';
}): Promise<{ userId: string; email: string }> {
  const userId = randomUUID();
  const email = `work-candidate-${randomUUID()}@test.local`;
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO users (
          user_id, tenant_id, email, name, role, status, password_hash
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'integration-test-only')
      `,
      [
        userId,
        tenantAlphaId,
        email,
        input.name,
        input.role ?? 'matter_member',
        input.status ?? 'active',
      ],
    );
    if (input.matterId) {
      const matterRole = input.matterRole ?? 'member';
      await client.query(
        `
          INSERT INTO matter_members (
            tenant_id, matter_id, user_id, matter_role, access_level, added_by
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          tenantAlphaId,
          input.matterId,
          userId,
          matterRole,
          matterRole === 'limited_reviewer' ? 'read' : 'edit',
          alphaOwnerUserId,
        ],
      );
    }
  });
  return { userId, email };
}

function itemKeyFor(workItemId: string, prefix = 'workflow-work'): string {
  const digest = createHash('sha256').update(workItemId).digest('hex').slice(0, 12);
  return `${prefix}-${digest}`;
}

async function insertWorkItem(
  matterId: string,
  assignedToUserId: string,
  dueAt: string,
): Promise<WorkItemFixture> {
  const workItemId = randomUUID();
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO work_items (
          work_item_id, tenant_id, source, kind, target_type, target_id, matter_id,
          status, assignment_scope, assigned_to_user_id, due_at, created_by,
          created_audit_event_id, last_audit_event_id
        )
        VALUES (
          $1, $2, 'operational_data', 'contract_review_stage', 'contract_review', $3, $4,
          'open', 'user', $5, $6, $7, $8, $8
        )
      `,
      [
        workItemId,
        tenantAlphaId,
        randomUUID(),
        matterId,
        assignedToUserId,
        dueAt,
        alphaOwnerUserId,
        randomUUID(),
      ],
    );
  });
  return { workItemId, itemKey: itemKeyFor(workItemId), dueAt };
}

async function insertRecordsWorkItem(matterId: string, dueAt: string): Promise<WorkItemFixture> {
  const workItemId = randomUUID();
  const disposalRequestId = randomUUID();
  const auditEventId = randomUUID();
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO disposal_requests (
          disposal_request_id, tenant_id, matter_id, document_id, status,
          reason_code, requested_by, due_at
        )
        VALUES ($1, $2, $3, $4, 'requested', 'CLIENT_RECORDS', $5, $6)
      `,
      [disposalRequestId, tenantAlphaId, matterId, randomUUID(), alphaOwnerUserId, dueAt],
    );
    await client.query(
      `
        INSERT INTO work_items (
          work_item_id, tenant_id, source, kind, target_type, target_id, matter_id,
          status, assignment_scope, due_at, created_by,
          created_audit_event_id, last_audit_event_id
        )
        VALUES (
          $1, $2, 'records', 'records_disposal_approval', 'disposal_request', $3, $4,
          'open', 'records_admin', $5, $6, $7, $7
        )
      `,
      [
        workItemId,
        tenantAlphaId,
        disposalRequestId,
        matterId,
        dueAt,
        alphaOwnerUserId,
        auditEventId,
      ],
    );
  });
  return {
    workItemId,
    itemKey: itemKeyFor(workItemId, 'records-disposal'),
    dueAt,
  };
}

async function insertSoftDeletedDocumentWorkItem(
  matterId: string,
  assignedToUserId: string,
  dueAt: string,
): Promise<WorkItemFixture> {
  const documentId = randomUUID();
  const workItemId = randomUUID();
  const auditEventId = randomUUID();
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO documents (
          document_id, tenant_id, matter_id, document_family_id, title, status,
          created_by, document_type, subtype, deleted_at, deleted_by,
          deleted_previous_status
        )
        VALUES (
          $1, $2, $3, $4, 'Soft deleted Work target', 'deleted',
          $5, 'contract', 'work-target', now(), $5, 'draft'
        )
      `,
      [documentId, tenantAlphaId, matterId, randomUUID(), alphaOwnerUserId],
    );
    await client.query(
      `
        INSERT INTO work_items (
          work_item_id, tenant_id, source, kind, target_type, target_id, matter_id,
          document_id, status, assignment_scope, assigned_to_user_id, due_at,
          created_by, created_audit_event_id, last_audit_event_id
        )
        VALUES (
          $1, $2, 'operational_data', 'document_metadata_required', 'document', $3, $4,
          $3, 'open', 'user', $5, $6, $7, $8, $8
        )
      `,
      [
        workItemId,
        tenantAlphaId,
        documentId,
        matterId,
        assignedToUserId,
        dueAt,
        alphaOwnerUserId,
        auditEventId,
      ],
    );
  });
  return {
    workItemId,
    itemKey: itemKeyFor(workItemId, 'document-work'),
    dueAt,
  };
}

async function insertExplicitMatterDeny(matterId: string, userId: string): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO permissions (
          tenant_id, subject_type, subject_id, resource_type, resource_id,
          action, effect, created_by
        )
        VALUES ($1, 'user', $2, 'matter', $3, 'read', 'DENY', $4)
      `,
      [tenantAlphaId, userId, matterId, alphaOwnerUserId],
    );
  });
}

async function addEthicalWall(
  matterId: string,
  subjectId: string,
  membershipType: 'excluded' | 'insider',
): Promise<void> {
  const wallId = randomUUID();
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO ethical_walls (
          wall_id, tenant_id, matter_id, wall_name, reason, created_by
        )
        VALUES ($1, $2, $3, $4, 'work matter filter proof', $5)
      `,
      [wallId, tenantAlphaId, matterId, `Work Matter Filter Wall ${wallId}`, alphaOwnerUserId],
    );
    await client.query(
      `
        INSERT INTO ethical_wall_memberships (
          tenant_id, wall_id, subject_type, subject_id, membership_type, created_by
        )
        VALUES ($1, $2, 'user', $3, $4, $5)
      `,
      [tenantAlphaId, wallId, subjectId, membershipType, alphaOwnerUserId],
    );
  });
}

async function completeWorkItem(workItemId: string): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query(
      `
        UPDATE work_items
        SET status = 'completed',
          completed_by = $3,
          completed_at = now(),
          updated_at = now()
        WHERE tenant_id = $1
          AND work_item_id = $2
      `,
      [tenantAlphaId, workItemId, alphaOwnerUserId],
    );
    expect(result.rowCount).toBe(1);
  });
}

async function waitForCandidateLockWait(): Promise<void> {
  const observer = createOwnerClient();
  await observer.connect();
  try {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const result = await observer.query<{ waiting: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM pg_locks lock
            JOIN pg_stat_activity activity
              ON activity.pid = lock.pid
            WHERE activity.datname = current_database()
              AND lock.locktype = 'transactionid'
              AND lock.mode = 'ShareLock'
              AND NOT lock.granted
          ) AS waiting
        `,
      );
      if (result.rows[0]?.waiting) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('candidate query did not wait for the concurrent Work row lock');
  } finally {
    await observer.end();
  }
}

async function setWorkItemsUpdatedAt(workItemIds: string[], updatedAt: string): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query(
      `
        UPDATE work_items
        SET updated_at = $3
        WHERE tenant_id = $1
          AND work_item_id = ANY ($2::uuid[])
      `,
      [tenantAlphaId, workItemIds, updatedAt],
    );
    expect(result.rowCount).toBe(workItemIds.length);
  });
}

async function workItemState(workItemId: string): Promise<WorkItemState> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<WorkItemState>(
      `
        SELECT
          wi.assigned_to_user_id::text,
          wi.due_at,
          wi.status,
          ae.action AS last_action
        FROM work_items wi
        LEFT JOIN audit_events ae
          ON ae.tenant_id = wi.tenant_id
         AND ae.event_id = wi.last_audit_event_id
        WHERE wi.tenant_id = $1
          AND wi.work_item_id = $2
      `,
      [tenantAlphaId, workItemId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('work item fixture missing');
    return row;
  });
}

async function auditCount(action: string, workItemId: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM audit_events
        WHERE tenant_id = $1
          AND action = $2
          AND target_type = 'work_item'
          AND target_id = $3
      `,
      [tenantAlphaId, action, workItemId],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

async function latestAccessDeniedAudit(
  matterId: string,
  actorUserId: string,
): Promise<AccessDeniedAudit | undefined> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<AccessDeniedAudit>(
      `
        SELECT
          target_type,
          target_id::text,
          matter_id::text,
          result,
          metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND actor_id = $2
          AND action = 'ACCESS_DENIED'
          AND target_type = 'matter'
          AND target_id = $3
        ORDER BY created_at DESC, event_id DESC
        LIMIT 1
      `,
      [tenantAlphaId, actorUserId, matterId],
    );
    return result.rows[0];
  });
}

function workQueueUrl(baseUrl: string, matterId: string): string {
  return `${baseUrl}/v1/work/items?matterId=${encodeURIComponent(matterId)}`;
}

async function getWorkQueue(
  baseUrl: string,
  cookie: string,
  matterId: string,
): Promise<DmsWorkQueueResponseDto> {
  const response = await fetch(workQueueUrl(baseUrl, matterId), { headers: { cookie } });
  const body = await response.text();
  expect(response.status, body).toBe(200);
  return JSON.parse(body) as DmsWorkQueueResponseDto;
}

async function getReassignmentCandidates(
  baseUrl: string,
  cookie: string,
  itemKey: string,
  query = '',
): Promise<DmsWorkReassignmentCandidatesResponseDto> {
  const response = await fetch(
    `${baseUrl}/v1/work/items/${itemKey}/reassignment-candidates${query}`,
    { headers: { cookie } },
  );
  const body = await response.text();
  expect(response.status, body).toBe(200);
  return JSON.parse(body) as DmsWorkReassignmentCandidatesResponseDto;
}

async function expectWorkQueueDenied(input: {
  baseUrl: string;
  cookie: string;
  matterId: string;
  code: 'PERMISSION_DENIED' | 'ETHICAL_WALL_BLOCKED';
  hiddenIds?: string[];
}): Promise<void> {
  const response = await fetch(workQueueUrl(input.baseUrl, input.matterId), {
    headers: { cookie: input.cookie },
  });
  const body = await response.text();
  expect(response.status, body).toBe(403);
  const parsed = JSON.parse(body) as { code: string; requestId: string };
  expect(parsed).toMatchObject({
    code: input.code,
    requestId: expect.stringMatching(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    ),
  });
  expect(Object.keys(parsed).sort()).toEqual(['code', 'requestId']);
  for (const hiddenId of [tenantAlphaId, input.matterId, ...(input.hiddenIds ?? [])]) {
    expect(body).not.toContain(hiddenId);
  }
}

async function dropAuditFailureTrigger(): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query(`DROP TRIGGER IF EXISTS ${auditFailureTrigger} ON audit_events`);
    await client.query(`DROP FUNCTION IF EXISTS ${auditFailureFunction}()`);
  });
}

async function createAuditFailureTrigger(workItemId: string): Promise<void> {
  await dropAuditFailureTrigger();
  await withClient(createOwnerClient(), async (client) => {
    await client.query(`
      CREATE FUNCTION ${auditFailureFunction}()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.action = 'WORK_ITEM_DUE_AT_CHANGED'
          AND NEW.target_id = '${workItemId}'::uuid
        THEN
          RAISE EXCEPTION 'injected work mutation audit failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await client.query(`
      CREATE TRIGGER ${auditFailureTrigger}
      BEFORE INSERT ON audit_events
      FOR EACH ROW
      EXECUTE FUNCTION ${auditFailureFunction}()
    `);
  });
}

describe('work mutation audit and concurrency integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let firmAdminCookie: string;
  let ownerCookie: string;
  let memberCookie: string;
  let nonmemberCookie: string;
  let clientId: string;
  let matterId: string;
  let otherMatterId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    firmAdminCookie = await createSessionCookie(alphaFirmAdminUserId);
    ownerCookie = await createSessionCookie(alphaOwnerUserId);
    memberCookie = await createSessionCookie(alphaMemberUserId);
    nonmemberCookie = await createSessionCookie(alphaPermissionMemberUserId);
    clientId = await createClient(baseUrl, ownerCookie);
    matterId = await createMatter(baseUrl, ownerCookie, clientId);
    otherMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    await addMatterMember(baseUrl, ownerCookie, matterId, alphaMemberUserId);
    await addMatterMember(baseUrl, ownerCookie, matterId, alphaRbacTargetUserId);
  });

  afterAll(async () => {
    await dropAuditFailureTrigger();
    await app.close();
  });

  it('returns allowed items but fails closed for a nonmember without exposing ids', async () => {
    const visible = await insertWorkItem(matterId, alphaOwnerUserId, '2026-08-01T00:00:00.000Z');
    const other = await insertWorkItem(otherMatterId, alphaOwnerUserId, '2026-08-02T00:00:00.000Z');

    const ownerQueue = await getWorkQueue(baseUrl, ownerCookie, matterId);
    expect(ownerQueue.items.map((item) => item.itemKey)).toContain(visible.itemKey);
    expect(ownerQueue.items.map((item) => item.itemKey)).not.toContain(other.itemKey);
    expect(ownerQueue.items.find((item) => item.itemKey === visible.itemKey)).toMatchObject({
      canReassign: true,
      canUpdateDueAt: true,
    });

    const invalidFilter = await fetch(`${baseUrl}/v1/work/items?matterId=not-a-uuid`, {
      headers: { cookie: ownerCookie },
    });
    expect(invalidFilter.status, await invalidFilter.text()).toBe(400);

    await expectWorkQueueDenied({
      baseUrl,
      cookie: nonmemberCookie,
      matterId,
      code: 'PERMISSION_DENIED',
      hiddenIds: [visible.workItemId],
    });
    await expect(latestAccessDeniedAudit(matterId, alphaPermissionMemberUserId)).resolves.toEqual({
      target_type: 'matter',
      target_id: matterId,
      matter_id: matterId,
      result: 'denied',
      metadata_json: {
        matter_id: matterId,
        reason_code: 'PERMISSION_DENIED',
      },
    });

    const deniedMutation = await fetch(`${baseUrl}/v1/work/items/${visible.itemKey}/assignee`, {
      method: 'PATCH',
      headers: { cookie: nonmemberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ assignedToUserId: alphaRbacTargetUserId }),
    });
    const deniedBody = await deniedMutation.text();
    expect(deniedMutation.status, deniedBody).toBe(403);
    expect(deniedBody).not.toContain(visible.workItemId);
    await expect(auditCount('WORK_ITEM_REASSIGNED', visible.workItemId)).resolves.toBe(0);
  });

  it('returns safe Matter-member candidates with duplicate-safe labels and literal search', async () => {
    const work = await insertWorkItem(matterId, alphaMemberUserId, '2026-08-02T01:00:00.000Z');
    const duplicate = await insertCandidateUser({
      name: 'Alpha Member',
      matterId,
    });
    const inactive = await insertCandidateUser({
      name: 'Inactive Candidate',
      status: 'inactive',
      matterId,
    });
    const external = await insertCandidateUser({
      name: 'External Candidate',
      role: 'external_user',
      matterId,
    });
    const globalLimited = await insertCandidateUser({
      name: 'Global Limited Candidate',
      role: 'limited_reviewer',
      matterId,
    });
    const matterLimited = await insertCandidateUser({
      name: 'Matter Limited Candidate',
      matterId,
      matterRole: 'limited_reviewer',
    });
    const nonmember = await insertCandidateUser({ name: 'Nonmember Candidate' });
    const otherMatterMember = await insertCandidateUser({
      name: 'Other Matter Candidate',
      matterId: otherMatterId,
    });

    const candidates = await getReassignmentCandidates(
      baseUrl,
      memberCookie,
      work.itemKey,
      '?limit=25',
    );
    const candidateIds = candidates.items.map((candidate) => candidate.userId);
    expect(candidateIds).toEqual(
      expect.arrayContaining([
        alphaOwnerUserId,
        alphaMemberUserId,
        alphaRbacTargetUserId,
        duplicate.userId,
      ]),
    );
    expect(candidateIds).not.toEqual(
      expect.arrayContaining([
        inactive.userId,
        external.userId,
        globalLimited.userId,
        matterLimited.userId,
        nonmember.userId,
        otherMatterMember.userId,
        '22222222-2222-4222-8222-222222222201',
      ]),
    );
    expect(
      candidates.items.filter((candidate) => candidate.label.startsWith('Alpha Member · ')),
    ).toEqual(
      expect.arrayContaining([
        {
          userId: alphaMemberUserId,
          label: 'Alpha Member · alpha-member@test.local',
        },
        {
          userId: duplicate.userId,
          label: `Alpha Member · ${duplicate.email}`,
        },
      ]),
    );
    expect(Object.keys(candidates)).toEqual(['items']);
    expect(
      candidates.items.every(
        (candidate) =>
          Object.keys(candidate).sort().join(',') === 'label,userId' &&
          candidate.label.length <= 160,
      ),
    ).toBe(true);
    const serialized = JSON.stringify(candidates);
    expect(serialized).not.toContain(tenantAlphaId);
    expect(serialized).not.toContain(tenantBetaId);
    expect(serialized).not.toContain(matterId);
    expect(serialized).not.toContain(otherMatterId);
    expect(serialized).not.toContain('group');

    await expect(
      getReassignmentCandidates(
        baseUrl,
        memberCookie,
        work.itemKey,
        `?q=${encodeURIComponent(duplicate.email.toUpperCase())}&limit=1`,
      ),
    ).resolves.toEqual({
      items: [
        {
          userId: duplicate.userId,
          label: `Alpha Member · ${duplicate.email}`,
        },
      ],
    });
    await expect(
      getReassignmentCandidates(baseUrl, memberCookie, work.itemKey, '?q=%25'),
    ).resolves.toEqual({ items: [] });

    const excessiveLimit = await fetch(
      `${baseUrl}/v1/work/items/${work.itemKey}/reassignment-candidates?limit=26`,
      { headers: { cookie: memberCookie } },
    );
    expect(excessiveLimit.status, await excessiveLimit.text()).toBe(400);
  });

  it('lets a Matter-member admin manage another assignee while denying ordinary other-user access', async () => {
    const adminMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    await addMatterMember(baseUrl, ownerCookie, adminMatterId, alphaFirmAdminUserId);
    await addMatterMember(baseUrl, ownerCookie, adminMatterId, alphaMemberUserId);
    const adminWork = await insertWorkItem(
      adminMatterId,
      alphaMemberUserId,
      '2026-08-02T01:30:00.000Z',
    );

    const adminQueue = await getWorkQueue(baseUrl, firmAdminCookie, adminMatterId);
    expect(adminQueue.items.find((item) => item.itemKey === adminWork.itemKey)).toMatchObject({
      canReassign: true,
      canUpdateDueAt: true,
    });
    await expect(
      getReassignmentCandidates(baseUrl, firmAdminCookie, adminWork.itemKey),
    ).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ userId: alphaMemberUserId })]),
    });

    const ownerCandidateResponse = await fetch(
      `${baseUrl}/v1/work/items/${adminWork.itemKey}/reassignment-candidates`,
      { headers: { cookie: ownerCookie } },
    );
    const ownerCandidateBody = await ownerCandidateResponse.text();
    expect(ownerCandidateResponse.status, ownerCandidateBody).toBe(403);
    expect(ownerCandidateBody).not.toContain(adminWork.workItemId);
    expect(ownerCandidateBody).not.toContain(adminMatterId);

    const ownerMutation = await fetch(`${baseUrl}/v1/work/items/${adminWork.itemKey}/due-at`, {
      method: 'PATCH',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ dueAt: '2026-08-02T02:00:00.000Z' }),
    });
    expect(ownerMutation.status, await ownerMutation.text()).toBe(403);
    await expect(auditCount('WORK_ITEM_DUE_AT_CHANGED', adminWork.workItemId)).resolves.toBe(0);
  });

  it('rechecks a candidate under the Work row lock instead of trusting a stale snapshot', async () => {
    const work = await insertWorkItem(matterId, alphaMemberUserId, '2026-08-02T01:45:00.000Z');
    const staleCandidate = await insertCandidateUser({
      name: 'Stale Candidate',
      matterId,
    });
    await expect(
      getReassignmentCandidates(
        baseUrl,
        memberCookie,
        work.itemKey,
        `?q=${encodeURIComponent(staleCandidate.email)}`,
      ),
    ).resolves.toEqual({
      items: [
        {
          userId: staleCandidate.userId,
          label: `Stale Candidate · ${staleCandidate.email}`,
        },
      ],
    });

    await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query(
        `
          UPDATE users
          SET status = 'inactive'
          WHERE tenant_id = $1
            AND user_id = $2
        `,
        [tenantAlphaId, staleCandidate.userId],
      );
      expect(result.rowCount).toBe(1);
    });

    const reassignment = await fetch(`${baseUrl}/v1/work/items/${work.itemKey}/assignee`, {
      method: 'PATCH',
      headers: { cookie: memberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ assignedToUserId: staleCandidate.userId }),
    });
    const body = await reassignment.text();
    expect(reassignment.status, body).toBe(403);
    expect(body).not.toContain(staleCandidate.userId);
    expect(body).not.toContain(work.workItemId);
    await expect(auditCount('WORK_ITEM_REASSIGNED', work.workItemId)).resolves.toBe(0);
    await expect(workItemState(work.workItemId)).resolves.toMatchObject({
      assigned_to_user_id: alphaMemberUserId,
    });
  });

  it('waits for concurrent Work completion and returns no stale candidates', async () => {
    const work = await insertWorkItem(matterId, alphaMemberUserId, '2026-08-02T01:50:00.000Z');
    const completionClient = createOwnerClient();
    await completionClient.connect();
    let transactionOpen = false;
    try {
      await completionClient.query('BEGIN');
      transactionOpen = true;
      await setTenant(completionClient, tenantAlphaId);
      const completion = await completionClient.query(
        `
            UPDATE work_items
            SET status = 'completed',
              completed_by = $3,
              completed_at = now(),
              updated_at = now()
            WHERE tenant_id = $1
              AND work_item_id = $2
          `,
        [tenantAlphaId, work.workItemId, alphaOwnerUserId],
      );
      expect(completion.rowCount).toBe(1);

      const candidatesPromise = fetch(
        `${baseUrl}/v1/work/items/${work.itemKey}/reassignment-candidates`,
        { headers: { cookie: memberCookie } },
      );
      await waitForCandidateLockWait();
      await completionClient.query('COMMIT');
      transactionOpen = false;

      const candidates = await candidatesPromise;
      const body = await candidates.text();
      expect(candidates.status, body).toBe(403);
      expect(body).not.toContain(work.workItemId);
      expect(body).not.toContain(matterId);
    } finally {
      if (transactionOpen) await completionClient.query('ROLLBACK').catch(() => undefined);
      await completionClient.end();
    }
  }, 15_000);

  it('keeps per-Matter limited reviewers read-only with capability false and audit zero', async () => {
    const limitedMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    await addMatterMember(
      baseUrl,
      ownerCookie,
      limitedMatterId,
      alphaPermissionMemberUserId,
      'limited_reviewer',
    );
    const limitedWork = await insertWorkItem(
      limitedMatterId,
      alphaPermissionMemberUserId,
      '2026-08-02T02:00:00.000Z',
    );

    const queue = await getWorkQueue(baseUrl, nonmemberCookie, limitedMatterId);
    expect(queue.items.find((item) => item.itemKey === limitedWork.itemKey)).toMatchObject({
      canReassign: false,
      canUpdateDueAt: false,
    });

    const candidates = await fetch(
      `${baseUrl}/v1/work/items/${limitedWork.itemKey}/reassignment-candidates`,
      { headers: { cookie: nonmemberCookie } },
    );
    const candidateBody = await candidates.text();
    expect(candidates.status, candidateBody).toBe(403);
    expect(candidateBody).not.toContain(limitedMatterId);
    expect(candidateBody).not.toContain(limitedWork.workItemId);

    const dueMutation = await fetch(`${baseUrl}/v1/work/items/${limitedWork.itemKey}/due-at`, {
      method: 'PATCH',
      headers: { cookie: nonmemberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ dueAt: '2026-08-03T02:00:00.000Z' }),
    });
    expect(dueMutation.status, await dueMutation.text()).toBe(403);
    const reassignment = await fetch(`${baseUrl}/v1/work/items/${limitedWork.itemKey}/assignee`, {
      method: 'PATCH',
      headers: { cookie: nonmemberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ assignedToUserId: alphaOwnerUserId }),
    });
    expect(reassignment.status, await reassignment.text()).toBe(403);
    await expect(auditCount('WORK_ITEM_DUE_AT_CHANGED', limitedWork.workItemId)).resolves.toBe(0);
    await expect(auditCount('WORK_ITEM_REASSIGNED', limitedWork.workItemId)).resolves.toBe(0);
    await expect(workItemState(limitedWork.workItemId)).resolves.toMatchObject({
      assigned_to_user_id: alphaPermissionMemberUserId,
      due_at: new Date(limitedWork.dueAt),
    });
  });

  it('fails closed for an explicit matter DENY and records a reference-only denial audit', async () => {
    const deniedMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    await addMatterMember(baseUrl, ownerCookie, deniedMatterId, alphaMemberUserId);
    const deniedWork = await insertWorkItem(
      deniedMatterId,
      alphaMemberUserId,
      '2026-08-02T03:00:00.000Z',
    );
    await insertExplicitMatterDeny(deniedMatterId, alphaMemberUserId);

    await expectWorkQueueDenied({
      baseUrl,
      cookie: memberCookie,
      matterId: deniedMatterId,
      code: 'PERMISSION_DENIED',
      hiddenIds: [deniedWork.workItemId],
    });
    const deniedCandidates = await fetch(
      `${baseUrl}/v1/work/items/${deniedWork.itemKey}/reassignment-candidates`,
      { headers: { cookie: memberCookie } },
    );
    const deniedCandidatesBody = await deniedCandidates.text();
    expect(deniedCandidates.status, deniedCandidatesBody).toBe(403);
    expect(deniedCandidatesBody).not.toContain(deniedMatterId);
    expect(deniedCandidatesBody).not.toContain(deniedWork.workItemId);
    const deniedMutation = await fetch(`${baseUrl}/v1/work/items/${deniedWork.itemKey}/due-at`, {
      method: 'PATCH',
      headers: { cookie: memberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ dueAt: '2026-08-03T03:00:00.000Z' }),
    });
    expect(deniedMutation.status, await deniedMutation.text()).toBe(403);
    await expect(auditCount('WORK_ITEM_DUE_AT_CHANGED', deniedWork.workItemId)).resolves.toBe(0);

    const audit = await latestAccessDeniedAudit(deniedMatterId, alphaMemberUserId);
    expect(audit).toEqual({
      target_type: 'matter',
      target_id: deniedMatterId,
      matter_id: deniedMatterId,
      result: 'denied',
      metadata_json: {
        matter_id: deniedMatterId,
        reason_code: 'PERMISSION_DENIED',
      },
    });
    expect(Object.keys(audit?.metadata_json ?? {}).sort()).toEqual(['matter_id', 'reason_code']);
  });

  it('returns the canonical Wall denial for excluded and non-insider members', async () => {
    const excludedMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    const excludedWork = await insertWorkItem(
      excludedMatterId,
      alphaOwnerUserId,
      '2026-08-02T04:00:00.000Z',
    );
    await addEthicalWall(excludedMatterId, alphaOwnerUserId, 'excluded');

    await expectWorkQueueDenied({
      baseUrl,
      cookie: ownerCookie,
      matterId: excludedMatterId,
      code: 'ETHICAL_WALL_BLOCKED',
      hiddenIds: [excludedWork.workItemId],
    });
    const excludedCandidates = await fetch(
      `${baseUrl}/v1/work/items/${excludedWork.itemKey}/reassignment-candidates`,
      { headers: { cookie: ownerCookie } },
    );
    const excludedCandidatesBody = await excludedCandidates.text();
    expect(excludedCandidates.status, excludedCandidatesBody).toBe(403);
    expect(excludedCandidatesBody).not.toContain(excludedMatterId);
    expect(excludedCandidatesBody).not.toContain(excludedWork.workItemId);
    const excludedMutation = await fetch(
      `${baseUrl}/v1/work/items/${excludedWork.itemKey}/due-at`,
      {
        method: 'PATCH',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ dueAt: '2026-08-03T04:00:00.000Z' }),
      },
    );
    expect(excludedMutation.status, await excludedMutation.text()).toBe(403);
    await expect(auditCount('WORK_ITEM_DUE_AT_CHANGED', excludedWork.workItemId)).resolves.toBe(0);
    await expect(
      latestAccessDeniedAudit(excludedMatterId, alphaOwnerUserId),
    ).resolves.toMatchObject({
      target_type: 'matter',
      target_id: excludedMatterId,
      matter_id: excludedMatterId,
      result: 'denied',
      metadata_json: {
        matter_id: excludedMatterId,
        reason_code: 'ETHICAL_WALL_BLOCKED',
      },
    });

    const insiderMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    await addMatterMember(baseUrl, ownerCookie, insiderMatterId, alphaMemberUserId);
    const insiderWork = await insertWorkItem(
      insiderMatterId,
      alphaMemberUserId,
      '2026-08-02T05:00:00.000Z',
    );
    await addEthicalWall(insiderMatterId, alphaOwnerUserId, 'insider');

    await expectWorkQueueDenied({
      baseUrl,
      cookie: memberCookie,
      matterId: insiderMatterId,
      code: 'ETHICAL_WALL_BLOCKED',
      hiddenIds: [insiderWork.workItemId],
    });
    await expect(
      latestAccessDeniedAudit(insiderMatterId, alphaMemberUserId),
    ).resolves.toMatchObject({
      target_type: 'matter',
      target_id: insiderMatterId,
      matter_id: insiderMatterId,
      result: 'denied',
      metadata_json: {
        matter_id: insiderMatterId,
        reason_code: 'ETHICAL_WALL_BLOCKED',
      },
    });
  });

  it('returns an explicit empty page for an allowed Matter with no Work items', async () => {
    const emptyMatterId = await createMatter(baseUrl, ownerCookie, clientId);

    await expect(getWorkQueue(baseUrl, ownerCookie, emptyMatterId)).resolves.toMatchObject({
      items: [],
      page: {
        offset: 0,
        total: 0,
        hasNext: false,
      },
    });
    await expect(latestAccessDeniedAudit(emptyMatterId, alphaOwnerUserId)).resolves.toBeUndefined();
  });

  it('sorts all active Work globally by dueAt before deterministic tie-breakers', async () => {
    const sortMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    await addMatterMember(baseUrl, ownerCookie, sortMatterId, alphaFirmAdminUserId);
    const recordsWork = await insertRecordsWorkItem(sortMatterId, '2026-08-20T00:00:00.000Z');
    const workflowWork = await insertWorkItem(
      sortMatterId,
      alphaOwnerUserId,
      '2026-08-10T00:00:00.000Z',
    );
    const tiedWork = await Promise.all([
      insertWorkItem(sortMatterId, alphaOwnerUserId, '2026-08-11T00:00:00.000Z'),
      insertWorkItem(sortMatterId, alphaOwnerUserId, '2026-08-11T00:00:00.000Z'),
    ]);
    await setWorkItemsUpdatedAt(
      tiedWork.map((item) => item.workItemId),
      '2026-07-31T00:00:00.000Z',
    );
    const deterministicTieOrder = [...tiedWork]
      .sort((left, right) => left.workItemId.localeCompare(right.workItemId))
      .map((item) => item.itemKey);

    const queue = await getWorkQueue(baseUrl, firmAdminCookie, sortMatterId);
    expect(queue.items.map((item) => item.itemKey)).toEqual([
      workflowWork.itemKey,
      ...deterministicTieOrder,
      recordsWork.itemKey,
    ]);
    expect(queue.items.map((item) => item.dueAt)).toEqual([
      workflowWork.dueAt,
      tiedWork[0]!.dueAt,
      tiedWork[0]!.dueAt,
      recordsWork.dueAt,
    ]);
  });

  it('excludes a soft-deleted document target from list, mutation, and audit', async () => {
    const deletedMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    const deletedWork = await insertSoftDeletedDocumentWorkItem(
      deletedMatterId,
      alphaOwnerUserId,
      '2026-08-03T00:00:00.000Z',
    );

    const mutation = await fetch(`${baseUrl}/v1/work/items/${deletedWork.itemKey}/due-at`, {
      method: 'PATCH',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ dueAt: '2026-08-04T00:00:00.000Z' }),
    });
    const mutationBody = await mutation.text();
    expect(mutation.status, mutationBody).toBe(403);
    expect(mutationBody).not.toContain(deletedWork.workItemId);
    expect(mutationBody).not.toContain(deletedMatterId);
    await expect(auditCount('WORK_ITEM_DUE_AT_CHANGED', deletedWork.workItemId)).resolves.toBe(0);
    const candidates = await fetch(
      `${baseUrl}/v1/work/items/${deletedWork.itemKey}/reassignment-candidates`,
      { headers: { cookie: ownerCookie } },
    );
    expect(candidates.status, await candidates.text()).toBe(403);

    const queue = await getWorkQueue(baseUrl, ownerCookie, deletedMatterId);
    expect(queue.items.map((item) => item.itemKey)).not.toContain(deletedWork.itemKey);
    await expect(workItemState(deletedWork.workItemId)).resolves.toMatchObject({
      status: 'cancelled',
      last_action: null,
    });
  });

  it('fails closed without audit for completed and missing mutation targets', async () => {
    const completed = await insertWorkItem(matterId, alphaOwnerUserId, '2026-08-03T00:00:00.000Z');
    await completeWorkItem(completed.workItemId);

    const completedMutation = await fetch(`${baseUrl}/v1/work/items/${completed.itemKey}/due-at`, {
      method: 'PATCH',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ dueAt: '2026-08-04T00:00:00.000Z' }),
    });
    expect(completedMutation.status, await completedMutation.text()).toBe(403);
    await expect(auditCount('WORK_ITEM_DUE_AT_CHANGED', completed.workItemId)).resolves.toBe(0);
    const completedCandidates = await fetch(
      `${baseUrl}/v1/work/items/${completed.itemKey}/reassignment-candidates`,
      { headers: { cookie: ownerCookie } },
    );
    expect(completedCandidates.status, await completedCandidates.text()).toBe(403);

    const missingMutation = await fetch(
      `${baseUrl}/v1/work/items/${itemKeyFor(randomUUID())}/due-at`,
      {
        method: 'PATCH',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ dueAt: '2026-08-04T00:00:00.000Z' }),
      },
    );
    expect(missingMutation.status, await missingMutation.text()).toBe(403);
  });

  it('persists reassignment and dueAt across fresh sessions and rejects an invalid assignee', async () => {
    const work = await insertWorkItem(matterId, alphaOwnerUserId, '2026-08-05T00:00:00.000Z');

    const reassigned = await fetch(`${baseUrl}/v1/work/items/${work.itemKey}/assignee`, {
      method: 'PATCH',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ assignedToUserId: alphaMemberUserId }),
    });
    const reassignedBody = await reassigned.text();
    expect(reassigned.status, reassignedBody).toBe(200);
    expect(JSON.parse(reassignedBody)).toMatchObject({
      itemKey: work.itemKey,
      assignedToUserId: alphaMemberUserId,
      assignedToLabel: 'Alpha Member',
    });
    await expect(auditCount('WORK_ITEM_REASSIGNED', work.workItemId)).resolves.toBe(1);

    const freshMemberCookie = await createSessionCookie(alphaMemberUserId);
    const reloadedAfterReassign = await getWorkQueue(baseUrl, freshMemberCookie, matterId);
    expect(reloadedAfterReassign.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemKey: work.itemKey,
          assignedToLabel: 'Alpha Member',
        }),
      ]),
    );

    const invalidAssignee = await fetch(`${baseUrl}/v1/work/items/${work.itemKey}/assignee`, {
      method: 'PATCH',
      headers: { cookie: freshMemberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ assignedToUserId: alphaFirmAdminUserId }),
    });
    expect(invalidAssignee.status, await invalidAssignee.text()).toBe(403);
    await expect(auditCount('WORK_ITEM_REASSIGNED', work.workItemId)).resolves.toBe(1);
    await expect(workItemState(work.workItemId)).resolves.toMatchObject({
      assigned_to_user_id: alphaMemberUserId,
    });

    const nextDueAt = '2026-08-06T03:30:00.000Z';
    const dueAtUpdate = await fetch(`${baseUrl}/v1/work/items/${work.itemKey}/due-at`, {
      method: 'PATCH',
      headers: { cookie: freshMemberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ dueAt: nextDueAt }),
    });
    const dueAtBody = await dueAtUpdate.text();
    expect(dueAtUpdate.status, dueAtBody).toBe(200);
    expect(JSON.parse(dueAtBody)).toEqual({ itemKey: work.itemKey, dueAt: nextDueAt });

    const secondFreshMemberCookie = await createSessionCookie(alphaMemberUserId);
    const reloadedAfterDueAt = await getWorkQueue(baseUrl, secondFreshMemberCookie, matterId);
    expect(reloadedAfterDueAt.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemKey: work.itemKey,
          dueAt: nextDueAt,
        }),
      ]),
    );
    const persisted = await workItemState(work.workItemId);
    expect(persisted.due_at.toISOString()).toBe(nextDueAt);
    expect(persisted.last_action).toBe('WORK_ITEM_DUE_AT_CHANGED');
    await expect(auditCount('WORK_ITEM_DUE_AT_CHANGED', work.workItemId)).resolves.toBe(1);
  });

  it('allows only one audited winner for competing stale reassignments', async () => {
    const work = await insertWorkItem(matterId, alphaMemberUserId, '2026-08-07T00:00:00.000Z');
    const requestReassignment = (assignedToUserId: string) =>
      fetch(`${baseUrl}/v1/work/items/${work.itemKey}/assignee`, {
        method: 'PATCH',
        headers: { cookie: memberCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ assignedToUserId }),
      });

    const responses = await Promise.all([
      requestReassignment(alphaOwnerUserId),
      requestReassignment(alphaRbacTargetUserId),
    ]);
    const responseBodies = await Promise.all(responses.map((response) => response.text()));
    expect(
      responses.map((response) => response.status).sort((left, right) => left - right),
      responseBodies.join('\n'),
    ).toEqual([200, 403]);

    const persisted = await workItemState(work.workItemId);
    expect([alphaOwnerUserId, alphaRbacTargetUserId]).toContain(persisted.assigned_to_user_id);
    expect(persisted.last_action).toBe('WORK_ITEM_REASSIGNED');
    await expect(auditCount('WORK_ITEM_REASSIGNED', work.workItemId)).resolves.toBe(1);
  });

  it('rolls back the dueAt update when audit persistence fails', async () => {
    const work = await insertWorkItem(matterId, alphaOwnerUserId, '2026-08-08T00:00:00.000Z');
    await createAuditFailureTrigger(work.workItemId);
    try {
      const response = await fetch(`${baseUrl}/v1/work/items/${work.itemKey}/due-at`, {
        method: 'PATCH',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ dueAt: '2026-08-09T00:00:00.000Z' }),
      });
      expect(response.status, await response.text()).toBe(500);
    } finally {
      await dropAuditFailureTrigger();
    }

    const persisted = await workItemState(work.workItemId);
    expect(persisted.due_at.toISOString()).toBe(work.dueAt);
    expect(persisted.last_action).toBeNull();
    await expect(auditCount('WORK_ITEM_DUE_AT_CHANGED', work.workItemId)).resolves.toBe(0);
  });
});
