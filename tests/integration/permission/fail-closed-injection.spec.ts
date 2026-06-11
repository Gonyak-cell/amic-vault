import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { FailClosedPermissionWrapper } from '../../../apps/api/src/modules/permission/fail-closed.wrapper';
import { allowPermission } from '../../../packages/shared/src/permission/permission-decision';
import { createOwnerClient, tenantAlphaId, withClient } from '../helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';

async function accessDeniedCount(targetId: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'ACCESS_DENIED'
          AND target_id = $2
          AND metadata_json->>'reason_code' = 'EVAL_FAILURE'
      `,
      [tenantAlphaId, targetId],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

describe('permission fail-closed injection integration', () => {
  let app: INestApplication;
  let wrapper: FailClosedPermissionWrapper;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    wrapper = app.get(FailClosedPermissionWrapper);
  });

  afterAll(async () => {
    await app.close();
  });

  it('converts exceptions, undefined decisions, and timeouts to denied audit records', async () => {
    const targetId = randomUUID();
    const target = {
      tenantId: tenantAlphaId,
      actorId: alphaOwnerUserId,
      targetType: 'matter',
      targetId,
      matterId: targetId,
    };

    await expect(
      wrapper.evaluate(target, () => {
        throw new Error('forced permission backend failure');
      }),
    ).resolves.toMatchObject({ effect: 'DENY', reasonCode: 'EVAL_FAILURE' });
    await expect(wrapper.evaluate(target, () => undefined)).resolves.toMatchObject({
      effect: 'DENY',
      reasonCode: 'EVAL_FAILURE',
    });
    await expect(
      wrapper.evaluate(
        target,
        () => new Promise((resolve) => setTimeout(() => resolve(allowPermission()), 20)),
        1,
      ),
    ).resolves.toMatchObject({ effect: 'DENY', reasonCode: 'EVAL_FAILURE' });

    await expect(accessDeniedCount(targetId)).resolves.toBeGreaterThanOrEqual(3);
  });
});
