import 'reflect-metadata';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { createOwnerClient, tenantAlphaId, withClient } from './helpers/db';
import { loginSearchUser } from './search-permission/search-http-helpers';

const alphaFirmAdminUserId = '11111111-1111-4111-8111-111111111100';
const expectedAxisCounts = JSON.stringify({ Advisory: 1, LIT: 1, Dispute: 1, DEAL: 1 });

function sourceMatter(
  token: string,
  suffix: string,
  overrides: {
    matterAxis: 'Advisory' | 'DEAL' | 'Dispute' | 'LIT';
    litigationAxis?: 'CIV';
    detail: string;
    revision: string;
  },
) {
  const clientName = `A14테스트${token}`;
  const matterCode =
    overrides.matterAxis === 'LIT'
      ? `${clientName}/LIT/${overrides.litigationAxis}/${overrides.detail}`
      : `${clientName}/${overrides.matterAxis}/${overrides.detail}`;
  return {
    matter_id: `matter_a14_${token}_${suffix}`,
    tenant_id: 'tenant_a14',
    client_id: `client_a14_${token}`,
    client_display_name: clientName,
    client_short_name: clientName,
    matter_code: matterCode,
    matter_number: `A14-${token}-${suffix}`,
    matter_name: matterCode,
    title: matterCode,
    matter_axis: overrides.matterAxis,
    matter_litigation_axis: overrides.litigationAxis ?? null,
    matter_type_english: overrides.matterAxis,
    matter_litigation_axis_english: overrides.litigationAxis ?? null,
    matter_detail_type_korean: overrides.detail,
    source_lane: `A14 ${suffix}`,
    source_ref: `A14 ${token} ${suffix}`,
    client_case_role: null,
    client_case_role_confidence: null,
    source_revision: overrides.revision,
    status: 'open',
    confidence: 'integration',
    review_required: false,
  };
}

function sourceArtifact(token: string, revision: string) {
  const clientName = `A14테스트${token}`;
  return {
    generated_at: new Date().toISOString(),
    source_revision: revision,
    client_count: 1,
    matter_count: 4,
    axis_counts: { Advisory: 1, LIT: 1, Dispute: 1, DEAL: 1 },
    clients: [
      {
        client_id: `client_a14_${token}`,
        client_display_name: clientName,
        client_short_name: clientName,
        canonical_display_name: clientName,
        legal_form: null,
        candidate_type: 'integration',
        source_lanes: ['A14 integration'],
        source_revision: revision,
      },
    ],
    matters: [
      sourceMatter(token, 'adv', { matterAxis: 'Advisory', detail: '자문', revision }),
      sourceMatter(token, 'lit', {
        matterAxis: 'LIT',
        litigationAxis: 'CIV',
        detail: '손해배상청구',
        revision,
      }),
      sourceMatter(token, 'dispute', { matterAxis: 'Dispute', detail: '분쟁자문', revision }),
      sourceMatter(token, 'deal', { matterAxis: 'DEAL', detail: 'Project A14', revision }),
    ],
  };
}

async function writeArtifact(token: string, revision: string): Promise<string> {
  const filePath = path.resolve('tmp', `a14-${token}-${revision}.json`);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(sourceArtifact(token, revision), null, 2)}\n`);
  return filePath;
}

function runReflection(input: {
  artifactPath: string;
  mode: 'dry-run' | 'execute';
  revision: string;
}) {
  return spawnSync(
    process.execPath,
    [
      'tools/migration/lawos-canonical-matter-reflection.mjs',
      '--mode',
      input.mode,
      '--tenant-id',
      tenantAlphaId,
      '--operator-user-id',
      alphaFirmAdminUserId,
      '--approval-ref',
      `A14-${input.revision}`,
      '--source-artifact',
      input.artifactPath,
      '--source-revision',
      input.revision,
      '--expected-clients',
      '1',
      '--expected-matters',
      '4',
      '--expected-axis-counts',
      expectedAxisCounts,
      '--receipt',
      path.resolve('tmp', `a14-${input.revision}-${input.mode}.receipt.json`),
      '--details',
      path.resolve('tmp', `a14-${input.revision}-${input.mode}.details.ndjson.gz`),
    ],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
}

async function syncState() {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      drift_count: number;
      last_sync_at: Date;
      reflected_count: number;
    }>(
      `
        SELECT last_sync_at, reflected_count, drift_count
        FROM matter_app_sync_state
        WHERE tenant_id = $1
          AND source_ref = 'lawos_lazycodex_canonical_identity'
        LIMIT 1
      `,
      [tenantAlphaId],
    );
    return result.rows[0];
  });
}

describe('matter app sync health integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let firmAdminCookie: string;
  let memberCookie: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    firmAdminCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
    });
    memberCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-member@test.local',
      password: 'dev-alpha-member-password',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('records runner sync state and exposes last sync health through the status API', async () => {
    const token = randomUUID().replaceAll('-', '').slice(0, 10);
    const executeRevision = `a14_execute_${token}`;
    const executeArtifact = await writeArtifact(token, executeRevision);
    const execute = runReflection({
      artifactPath: executeArtifact,
      mode: 'execute',
      revision: executeRevision,
    });
    expect(execute.status, `${execute.stdout}\n${execute.stderr}`).toBe(0);

    const stateAfterExecute = await syncState();
    expect(stateAfterExecute).toMatchObject({
      reflected_count: 5,
      drift_count: 0,
    });
    expect(stateAfterExecute?.last_sync_at).toBeInstanceOf(Date);

    const dryRunRevision = `a14_dry_${token}`;
    const dryRunArtifact = await writeArtifact(`${token}dry`, dryRunRevision);
    const dryRun = runReflection({
      artifactPath: dryRunArtifact,
      mode: 'dry-run',
      revision: dryRunRevision,
    });
    expect(dryRun.status, `${dryRun.stdout}\n${dryRun.stderr}`).toBe(0);
    const stateAfterDryRun = await syncState();
    expect(stateAfterDryRun?.last_sync_at.toISOString()).toBe(
      stateAfterExecute?.last_sync_at.toISOString(),
    );

    const response = await fetch(`${baseUrl}/v1/integrations/matter-app/status`, {
      headers: { cookie: firmAdminCookie },
    });
    const body = (await response.json()) as {
      driftCount?: number;
      lastSyncAt?: string | null;
      reflectedCount?: number;
      syncStateAvailable?: boolean;
    };
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body).toMatchObject({
      driftCount: 0,
      reflectedCount: 5,
      syncStateAvailable: true,
    });
    expect(body.lastSyncAt).toBe(stateAfterExecute?.last_sync_at.toISOString());
  });

  it('blocks ordinary members from Matter app operational status fields', async () => {
    const response = await fetch(`${baseUrl}/v1/integrations/matter-app/status`, {
      headers: { cookie: memberCookie },
    });
    const body = await response.text();

    expect(response.status, body).toBe(403);
    expect(body).toContain('PERMISSION_DENIED');
    expect(body).not.toContain('lastSyncAt');
    expect(body).not.toContain('reflectedCount');
    expect(body).not.toContain('driftCount');
  });
});
