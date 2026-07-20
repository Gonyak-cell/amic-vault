import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { tenantAlphaId } from '../helpers/db';
import { addMatterMember, alphaOwnerUserId, insertSearchIndexedRow } from './search-fixtures';
import { loginSearchUser, postSearch, resultTitles } from './search-http-helpers';

describe('Korean morphology search integration', () => {
  const marker = `korean${randomUUID().replaceAll('-', '')}`;
  const accessibleMatterId = randomUUID();
  const accessibleClientId = randomUUID();
  const hiddenMatterId = randomUUID();
  const hiddenClientId = randomUUID();
  const damageTitle = `${marker} Korean Damage Memo`;
  const damagesTheoryTitle = `${marker} Korean Damages Theory`;
  const lenderTitle = `${marker} Korean Lender Rights`;
  const leaseTitle = `${marker} Korean Lease Owner`;
  let app: INestApplication;
  let baseUrl: string;
  let cookie: string;

  beforeAll(async () => {
    await insertSearchIndexedRow(
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId: accessibleClientId,
        matterId: accessibleMatterId,
        documentId: randomUUID(),
        versionId: randomUUID(),
        title: damageTitle,
        contentText: `${marker} 계약을 해지한다는 통지와 손해배상액을 청구하는 문서`,
        documentType: 'memo',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-06-15T00:00:00.000Z',
      },
      930,
    );
    await insertSearchIndexedRow(
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId: accessibleClientId,
        matterId: accessibleMatterId,
        documentId: randomUUID(),
        versionId: randomUUID(),
        title: damagesTheoryTitle,
        contentText: `${marker} 손해배상의 산정 기준과 손해배상액 예정 조항 검토`,
        documentType: 'memo',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-06-15T12:00:00.000Z',
      },
      934,
    );
    await insertSearchIndexedRow(
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId: accessibleClientId,
        matterId: accessibleMatterId,
        documentId: randomUUID(),
        versionId: randomUUID(),
        title: lenderTitle,
        contentText: '대주(貸主) 권리 보전과 담보 실행 절차 검토',
        documentType: 'memo',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-06-16T00:00:00.000Z',
      },
      931,
    );
    await insertSearchIndexedRow(
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId: accessibleClientId,
        matterId: accessibleMatterId,
        documentId: randomUUID(),
        versionId: randomUUID(),
        title: leaseTitle,
        contentText: '임대주 권리 보전과 상가 관리 절차 검토',
        documentType: 'memo',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-06-17T00:00:00.000Z',
      },
      932,
    );
    await insertSearchIndexedRow(
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId: hiddenClientId,
        matterId: hiddenMatterId,
        documentId: randomUUID(),
        versionId: randomUUID(),
        title: `${marker} Hidden Korean Damage Memo`,
        contentText: `${marker} 손해배상의 산정 방식은 권한 밖 문서에만 존재`,
        documentType: 'memo',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-06-18T00:00:00.000Z',
      },
      933,
    );
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: accessibleMatterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });

    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    cookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('finds Korean particle variants after permission scoping', async () => {
    const response = await postSearch(baseUrl, cookie, {
      query: '손해배상',
      filters: { matterId: accessibleMatterId },
      page: 1,
      pageSize: 10,
    });

    expect(resultTitles(response)).toEqual(
      expect.arrayContaining([damagesTheoryTitle, damageTitle]),
    );
    expect(JSON.stringify(response)).not.toContain(hiddenMatterId);
  });

  it('does not match short Korean terms inside unrelated longer words', async () => {
    const response = await postSearch(baseUrl, cookie, {
      query: '대주',
      filters: { matterId: accessibleMatterId },
      page: 1,
      pageSize: 10,
    });

    expect(resultTitles(response)).toEqual([lenderTitle]);
    expect(JSON.stringify(response)).not.toContain(leaseTitle);
  });
});
