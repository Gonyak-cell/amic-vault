import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import {
  SEARCH_PERMISSION_SCOPE_PROVIDER,
  type SearchPermissionScopeProvider,
} from '../../../apps/api/src/modules/search/permission/search-permission-scope.provider';
import { tenantAlphaId } from '../helpers/db';
import { alphaOwnerUserId } from './search-fixtures';

describe('search permission provider binding integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('binds the search scope provider to the permission-backed implementation', async () => {
    const provider = app.get<SearchPermissionScopeProvider>(SEARCH_PERMISSION_SCOPE_PROVIDER);
    const decision = await provider.scopeForSearch({
      tenantId: tenantAlphaId,
      userId: alphaOwnerUserId,
    });

    expect(decision).toMatchObject({
      effect: 'ALLOW',
      appliedRules: expect.arrayContaining([
        'matter.membership:required',
        'document.permissions:explicit_deny',
        'ethical_wall:excluded_filter',
      ]),
    });
  });
});
