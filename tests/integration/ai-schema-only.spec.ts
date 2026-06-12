import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createAppClient,
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from './helpers/db';
import { readIfSmall, sourceFiles } from './document-access/document-api-helpers';

describe('ai policy boundary integration', () => {
  it('creates default-deny R2 schema plus R6 local-only model policy RLS', async () => {
    await withClient(createOwnerClient(), async (client) => {
      const columns = await client.query<{
        table_name: string;
        column_name: string;
        is_nullable: string;
        column_default: string | null;
      }>(
        `
          SELECT table_name, column_name, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND (
              (table_name = 'documents' AND column_name = 'ai_allowed')
              OR (table_name = 'matters' AND column_name = 'ai_policy_id')
            )
          ORDER BY table_name, column_name
        `,
      );
      expect(columns.rows).toEqual([
        {
          table_name: 'documents',
          column_name: 'ai_allowed',
          is_nullable: 'NO',
          column_default: 'false',
        },
        {
          table_name: 'matters',
          column_name: 'ai_policy_id',
          is_nullable: 'YES',
          column_default: null,
        },
      ]);

      const checks = await client.query<{ conname: string; definition: string }>(
        `
          SELECT conname, pg_get_constraintdef(oid) AS definition
          FROM pg_constraint
          WHERE conrelid = 'ai_policies'::regclass
          ORDER BY conname
        `,
      );
      expect(checks.rows.map((row) => `${row.conname}:${row.definition}`).join('\n')).toContain(
        'default_effect',
      );
      expect(checks.rows.map((row) => `${row.conname}:${row.definition}`).join('\n')).toContain(
        'external_model_allowed',
      );

      const policyId = randomUUID();
      const accessPolicyId = randomUUID();
      await client.query(
        `
          INSERT INTO ai_policies (policy_id, tenant_id, name)
          VALUES ($1, $2, 'Schema Only')
        `,
        [policyId, tenantAlphaId],
      );
      await client.query(
        `
          INSERT INTO ai_model_access_policies (
            access_policy_id, tenant_id, route_key, model_tier
          )
          VALUES ($1, $2, 'local_gemma', 'local')
          ON CONFLICT (tenant_id, route_key) DO NOTHING
        `,
        [accessPolicyId, tenantAlphaId],
      );

      await withClient(createAppClient(), async (appClient) => {
        await setTenant(appClient, tenantAlphaId);
        const alpha = await appClient.query<{ count: string }>(
          'SELECT count(*)::text FROM ai_policies WHERE policy_id = $1',
          [policyId],
        );
        expect(alpha.rows[0]?.count).toBe('1');
        const alphaModel = await appClient.query<{ count: string }>(
          `
            SELECT count(*)::text
            FROM ai_model_access_policies
            WHERE route_key = 'local_gemma'
          `,
        );
        expect(Number(alphaModel.rows[0]?.count ?? '0')).toBeGreaterThanOrEqual(1);

        await setTenant(appClient, tenantBetaId);
        const beta = await appClient.query<{ count: string }>(
          'SELECT count(*)::text FROM ai_policies WHERE policy_id = $1',
          [policyId],
        );
        expect(beta.rows[0]?.count).toBe('0');
        const betaModel = await appClient.query<{ count: string }>(
          `
            SELECT count(*)::text
            FROM ai_model_access_policies
            WHERE tenant_id = $1
              AND route_key = 'local_gemma'
          `,
          [tenantAlphaId],
        );
        expect(betaModel.rows[0]?.count).toBe('0');
      });
    });

    const controllerRefs = sourceFiles('apps/api/src').flatMap((file) => {
      if (!file.endsWith('.controller.ts')) return [];
      const text = readIfSmall(file);
      return /@(Controller|Get|Post|Patch|Delete)\(['"`][^'"`]*ai/i.test(text) ? [file] : [];
    });
    const allowedR6ControllerRefs = new Set([
      'apps/api/src/modules/ai/citation/ai-citation.controller.ts',
    ]);
    expect(controllerRefs.filter((file) => !allowedR6ControllerRefs.has(file))).toEqual([]);

    const generativeEndpointRefs = controllerRefs.flatMap((file) => {
      const text = readIfSmall(file);
      return /@(Get|Post)\(['"`](generate|chat|answer|complete|stream)/i.test(text) ? [file] : [];
    });
    expect(generativeEndpointRefs).toEqual([]);

    const aiPackageDiff = execFileSync('git', ['diff', '--name-only', '--', 'packages/ai'], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);
    expect(aiPackageDiff).toEqual([]);

    const packageJsonRefs = ['package.json', 'apps/api/package.json', 'packages/ai/package.json']
      .map((file) => [file, readIfSmall(path.resolve(file))] as const)
      .flatMap(([file, text]) =>
        /\b(openai|@anthropic-ai|@google\/generative-ai|langchain|llamaindex)\b/i.test(text)
          ? [file]
          : [],
      );
    expect(packageJsonRefs).toEqual([]);
  });
});
