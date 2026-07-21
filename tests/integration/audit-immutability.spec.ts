import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AuditMetadataNormalizer } from '../../apps/api/src/modules/audit/audit-metadata.normalizer';
import { AuditAnchorService } from '../../apps/api/src/modules/audit/audit-anchor.service';
import { AuditService } from '../../apps/api/src/modules/audit/audit.service';
import { TenantContextService } from '../../apps/api/src/modules/tenant/tenant-context';
import {
  createAppClient,
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  withClient,
} from './helpers/db';

async function ensureAuditFixture(): Promise<string> {
  return withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        INSERT INTO tenants (tenant_id, name, slug, region, data_residency, status)
        VALUES ($1, 'Tenant Alpha', 'tenant-alpha', 'kr', 'kr', 'active')
        ON CONFLICT (tenant_id) DO NOTHING
      `,
      [tenantAlphaId],
    );

    const result = await client.query<{ event_id: string }>(
      `
        INSERT INTO audit_events (
          tenant_id, actor_type, action, target_type, target_id, result, metadata_json
        )
        VALUES ($1, 'system', 'PERMISSION_DENIED_HIT', 'system', NULL, 'denied', $2)
        RETURNING event_id
      `,
      [tenantAlphaId, { reason_code: 'fixture' }],
    );
    const row = result.rows[0];
    if (!row) throw new Error('audit fixture insert returned no row');
    return row.event_id;
  });
}

async function snapshotAuditEvent(eventId: string): Promise<{ count: string; checksum: string }> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ count: string; checksum: string }>(
      `
        SELECT count(*)::text AS count,
               coalesce(md5(string_agg(md5(audit_events::text), ',' ORDER BY event_id)), '') AS checksum
        FROM audit_events
        WHERE event_id = $1
      `,
      [eventId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('audit snapshot returned no row');
    return row;
  });
}

async function expectAuditUnchanged(eventId: string, run: () => Promise<void>): Promise<void> {
  const before = await snapshotAuditEvent(eventId);
  await expect(run()).rejects.toThrow(/permission denied|append-only|foreign key constraint/i);
  await expect(snapshotAuditEvent(eventId)).resolves.toEqual(before);
}

function createAnchorService(): AuditAnchorService {
  const storage = {
    putAuditAnchorObject: vi.fn(async (input: { tenantId: string; anchorDate: string }) => ({
      key: `tenants/${input.tenantId}/audit-anchors/${input.anchorDate}.json`,
      storageUri: `s3://vault-dev/tenants/${input.tenantId}/audit-anchors/${input.anchorDate}.json`,
      encryptionKeyId: null,
    })),
  };
  return new AuditAnchorService(
    new AuditService(new TenantContextService(), new AuditMetadataNormalizer()),
    storage,
  );
}

function uniqueAnchorDatePair(): { firstDate: string; secondDate: string } {
  const offset = Number.parseInt(randomUUID().split('-').join('').slice(0, 6), 16) % 20000;
  const first = new Date(Date.UTC(2030, 0, 1 + offset));
  const second = new Date(first);
  second.setUTCDate(first.getUTCDate() + 1);
  return {
    firstDate: first.toISOString().slice(0, 10),
    secondDate: second.toISOString().slice(0, 10),
  };
}

async function seedAnchorAuditEvents(input: {
  firstDate: string;
  secondDate: string;
}): Promise<{ firstEventId: string; originalMetadata: unknown }> {
  return withClient(createOwnerClient(), async (client) => {
    const first = await client.query<{ event_id: string; metadata_json: unknown }>(
      `
        INSERT INTO audit_events (
          tenant_id, actor_type, action, target_type, target_id, result, metadata_json, created_at
        )
        VALUES
          ($1, 'system', 'SESSION_REVOKED', 'session', NULL, 'success', $2, $4::timestamptz),
          ($1, 'system', 'PERMISSION_DENIED_HIT', 'system', NULL, 'denied', $3, $5::timestamptz)
        RETURNING event_id, metadata_json
      `,
      [
        tenantAlphaId,
        { reason_code: 'anchor_fixture_one' },
        { reason_code: 'anchor_fixture_two' },
        `${input.firstDate}T03:00:00.000Z`,
        `${input.secondDate}T03:00:00.000Z`,
      ],
    );
    const row = first.rows[0];
    if (!row) throw new Error('anchor audit fixture insert returned no row');
    return { firstEventId: row.event_id, originalMetadata: row.metadata_json };
  });
}

async function overwriteAuditMetadataWithTriggersDisabled(
  eventId: string,
  metadata: unknown,
): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query(
      'ALTER TABLE audit_events DISABLE TRIGGER trg_audit_events_block_update_delete',
    );
    try {
      await client.query('UPDATE audit_events SET metadata_json = $1 WHERE event_id = $2', [
        metadata,
        eventId,
      ]);
    } finally {
      await client.query(
        'ALTER TABLE audit_events ENABLE TRIGGER trg_audit_events_block_update_delete',
      );
    }
  });
}

describe('audit immutability', () => {
  let eventId: string;

  beforeAll(async () => {
    eventId = await ensureAuditFixture();
  });

  it('allows app role to append and read tenant audit rows', async () => {
    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const inserted = await client.query<{ event_id: string }>(
        `
          INSERT INTO audit_events (
            tenant_id, actor_type, action, target_type, result, metadata_json
          )
          VALUES ($1, 'system', 'SESSION_REVOKED', 'session', 'success', $2)
          RETURNING event_id
        `,
        [tenantAlphaId, { reason_code: 'session_revoked', correlation_id: 'integration-session' }],
      );
      const insertedRow = inserted.rows[0];
      expect(insertedRow?.event_id).toMatch(/[0-9a-f-]{36}/);

      const visible = await client.query('SELECT event_id FROM audit_events WHERE event_id = $1', [
        insertedRow?.event_id,
      ]);
      expect(visible.rowCount).toBe(1);
    });
  });

  it('blocks direct SQL update, delete, and truncate through the app role', async () => {
    await expectAuditUnchanged(eventId, () =>
      withClient(createAppClient(), async (client) => {
        await setTenant(client, tenantAlphaId);
        await client.query('UPDATE audit_events SET action = $1 WHERE event_id = $2', [
          'LOGIN_SUCCESS',
          eventId,
        ]);
      }),
    );

    await expectAuditUnchanged(eventId, () =>
      withClient(createAppClient(), async (client) => {
        await setTenant(client, tenantAlphaId);
        await client.query('DELETE FROM audit_events WHERE event_id = $1', [eventId]);
      }),
    );

    await expectAuditUnchanged(eventId, () =>
      withClient(createAppClient(), async (client) => {
        await setTenant(client, tenantAlphaId);
        await client.query('TRUNCATE audit_events');
      }),
    );
  });

  it('blocks owner mutation paths through append-only triggers', async () => {
    await expectAuditUnchanged(eventId, () =>
      withClient(createOwnerClient(), async (client) => {
        await client.query('UPDATE audit_events SET action = $1 WHERE event_id = $2', [
          'LOGIN_SUCCESS',
          eventId,
        ]);
      }),
    );

    await expectAuditUnchanged(eventId, () =>
      withClient(createOwnerClient(), async (client) => {
        await client.query('DELETE FROM audit_events WHERE event_id = $1', [eventId]);
      }),
    );

    await expectAuditUnchanged(eventId, () =>
      withClient(createOwnerClient(), async (client) => {
        await client.query('TRUNCATE audit_events');
      }),
    );
  });

  it('keeps mutation privileges and triggers absent from runtime paths', async () => {
    await withClient(createOwnerClient(), async (client) => {
      const grants = await client.query(
        `
          SELECT grantee, privilege_type
          FROM information_schema.role_table_grants
          WHERE table_name = 'audit_events'
            AND grantee = 'vault_app'
            AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE')
        `,
      );
      expect(grants.rowCount).toBe(0);

      const triggers = await client.query<{ tgname: string }>(
        `
          SELECT tgname
          FROM pg_trigger
          WHERE tgrelid = 'audit_events'::regclass
            AND NOT tgisinternal
          ORDER BY tgname
        `,
      );
      expect(triggers.rows.map((row) => row.tgname)).toEqual([
        'trg_audit_events_block_truncate',
        'trg_audit_events_block_update_delete',
      ]);
    });
  });

  it('detects privileged audit-event tampering through daily anchor verification', async () => {
    const service = createAnchorService();
    const dates = uniqueAnchorDatePair();
    const fixture = await seedAnchorAuditEvents(dates);
    const first = await service.recordDailyAnchor({
      tenantId: tenantAlphaId,
      anchorDate: dates.firstDate,
    });
    const second = await service.recordDailyAnchor({
      tenantId: tenantAlphaId,
      anchorDate: dates.secondDate,
    });

    expect(first.eventCount).toBe(1);
    expect(second.previousAnchorHash).toBe(first.anchorHash);
    await expect(
      service.verifyAnchors({
        tenantId: tenantAlphaId,
        fromDate: dates.firstDate,
        toDate: dates.secondDate,
      }),
    ).resolves.toMatchObject({ ok: true, checkedCount: 2 });

    await overwriteAuditMetadataWithTriggersDisabled(fixture.firstEventId, {
      reason_code: 'tampered_anchor_fixture',
    });
    try {
      const tampered = await service.verifyAnchors({
        tenantId: tenantAlphaId,
        fromDate: dates.firstDate,
        toDate: dates.secondDate,
      });
      expect(tampered.ok).toBe(false);
      expect(tampered.items[0]).toMatchObject({
        verified: false,
        reason: 'events_hash_mismatch',
      });
    } finally {
      await overwriteAuditMetadataWithTriggersDisabled(
        fixture.firstEventId,
        fixture.originalMetadata,
      );
    }
  });

  it('does not expose API controller routes that mutate audit events', () => {
    const apiRoot = path.resolve('apps/api/src');
    const entries = fs.readdirSync(apiRoot, { encoding: 'utf8', recursive: true });
    const controllerFiles = entries
      .map((entry: string) => entry.toString())
      .filter((entry: string) => entry.endsWith('.controller.ts'));
    const suspiciousRoutes = controllerFiles.flatMap((file: string): string[] => {
      const body = fs.readFileSync(path.join(apiRoot, file), 'utf8');
      return /@(Patch|Put|Delete)\s*\([^)]*audit/i.test(body) ? [file] : [];
    });

    expect(suspiciousRoutes).toEqual([]);
  });
});
