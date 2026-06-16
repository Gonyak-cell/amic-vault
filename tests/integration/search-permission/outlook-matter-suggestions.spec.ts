import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import {
  tenantAlphaId,
  tenantBetaId,
  withClient,
  createOwnerClient,
  setTenant,
} from '../helpers/db';
import {
  addMatterMember,
  addWallMembership,
  alphaOwnerUserId,
  betaOwnerUserId,
  createEthicalWall,
  insertSearchIndexedRow,
  setMatterSuggestionDomains,
} from './search-fixtures';
import { loginSearchUser, postMatterSuggestions } from './search-http-helpers';

const mailboxFingerprint = sha256Hex('oa04-outlook-suggestions-mailbox');

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

async function insertSuggestionSearchRow(input: {
  tenantId: string;
  ownerUserId: string;
  matterId: string;
  clientId: string;
  title: string;
  token: string;
  index: number;
}): Promise<void> {
  await insertSearchIndexedRow(
    {
      tenantId: input.tenantId,
      ownerUserId: input.ownerUserId,
      clientId: input.clientId,
      matterId: input.matterId,
      documentId: randomUUID(),
      versionId: randomUUID(),
      title: input.title,
      contentText: `${input.token} outlook suggestion searchable text`,
      documentType: 'memo',
      documentStatus: 'draft',
      versionStatus: 'current',
      updatedAt: '2026-06-16T00:00:00.000Z',
    },
    input.index,
  );
}

async function latestSuggestionAudit(input: {
  tenantId: string;
  actorId: string;
  mailboxHash: string;
}): Promise<{ result: string; metadata_json: Record<string, unknown> } | undefined> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, input.tenantId);
    const result = await client.query<{ result: string; metadata_json: Record<string, unknown> }>(
      `
        SELECT result, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND actor_id = $2
          AND action = 'OUTLOOK_MATTER_SUGGESTIONS_VIEWED'
          AND metadata_json->>'mailbox_fingerprint_hash' = $3
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [input.tenantId, input.actorId, input.mailboxHash],
    );
    return result.rows[0];
  });
}

describe('Outlook matter suggestion endpoint permission integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    ownerCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns only authorized hash-matched matters and records bounded audit metadata', async () => {
    const marker = `oa04-suggest-visible-${randomUUID()}`;
    const matterId = randomUUID();
    const clientId = randomUUID();
    const domain = `${marker}.example`;
    await insertSuggestionSearchRow({
      tenantId: tenantAlphaId,
      ownerUserId: alphaOwnerUserId,
      matterId,
      clientId,
      title: 'OA04 Outlook Visible Matter',
      token: marker,
      index: 1201,
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    await setMatterSuggestionDomains({
      tenantId: tenantAlphaId,
      matterId,
      clientId,
      clientDomain: domain,
    });

    const response = await postMatterSuggestions(baseUrl, ownerCookie, {
      sourceClient: 'outlook-web-addin',
      mailboxFingerprint,
      participantDomainHashes: [sha256Hex(domain.toLowerCase())],
      limit: 5,
    });

    expect(response.items).toHaveLength(1);
    expect(response.items[0]).toMatchObject({
      matterId,
      clientId,
      reasonCodes: ['participant_domain_hash'],
      score: 30,
    });

    const audit = await latestSuggestionAudit({
      tenantId: tenantAlphaId,
      actorId: alphaOwnerUserId,
      mailboxHash: mailboxFingerprint,
    });
    expect(audit?.result).toBe('success');
    expect(audit?.metadata_json).toMatchObject({
      mailbox_fingerprint_hash: mailboxFingerprint,
      result_count: 1,
      scope_type: 'outlook_matter_suggestions',
      outlook_status: 'suggestions_viewed',
    });
    const auditJson = JSON.stringify(audit?.metadata_json);
    expect(auditJson).not.toContain(domain);
    expect(auditJson).not.toContain(marker);
    expect(auditJson).not.toContain('OA04 Outlook Visible Matter');
  });

  it('does not suggest wall-excluded matters even when the Outlook hash matches', async () => {
    const marker = `oa04-suggest-wall-${randomUUID()}`;
    const matterId = randomUUID();
    const clientId = randomUUID();
    const domain = `${marker}.example`;
    await insertSuggestionSearchRow({
      tenantId: tenantAlphaId,
      ownerUserId: alphaOwnerUserId,
      matterId,
      clientId,
      title: 'OA04 Outlook Wall Hidden Matter',
      token: marker,
      index: 1202,
    });
    await addMatterMember({ tenantId: tenantAlphaId, matterId, userId: alphaOwnerUserId });
    await setMatterSuggestionDomains({
      tenantId: tenantAlphaId,
      matterId,
      clientId,
      clientDomain: domain,
    });
    const wallId = await createEthicalWall({ tenantId: tenantAlphaId, matterId });
    await addWallMembership({
      tenantId: tenantAlphaId,
      wallId,
      subjectId: alphaOwnerUserId,
      membershipType: 'excluded',
    });

    const response = await postMatterSuggestions(baseUrl, ownerCookie, {
      sourceClient: 'outlook-web-addin',
      mailboxFingerprint: sha256Hex(`${mailboxFingerprint}-wall`),
      participantDomainHashes: [sha256Hex(domain.toLowerCase())],
      limit: 5,
    });

    expect(response.items).toEqual([]);
    expect(JSON.stringify(response)).not.toContain(matterId);
    expect(JSON.stringify(response)).not.toContain(clientId);
  });

  it('does not expose cross-tenant matters from attacker-supplied hashes', async () => {
    const marker = `oa04-suggest-cross-${randomUUID()}`;
    const matterId = randomUUID();
    const clientId = randomUUID();
    const domain = `${marker}.example`;
    await insertSuggestionSearchRow({
      tenantId: tenantBetaId,
      ownerUserId: betaOwnerUserId,
      matterId,
      clientId,
      title: 'OA04 Outlook Beta Hidden Matter',
      token: marker,
      index: 1203,
    });
    await addMatterMember({
      tenantId: tenantBetaId,
      matterId,
      userId: betaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
      addedBy: betaOwnerUserId,
    });
    await setMatterSuggestionDomains({
      tenantId: tenantBetaId,
      matterId,
      clientId,
      clientDomain: domain,
    });

    const response = await postMatterSuggestions(baseUrl, ownerCookie, {
      sourceClient: 'outlook-web-addin',
      mailboxFingerprint: sha256Hex(`${mailboxFingerprint}-cross`),
      participantDomainHashes: [sha256Hex(domain.toLowerCase())],
      limit: 5,
    });

    expect(response.items).toEqual([]);
    expect(JSON.stringify(response)).not.toContain(matterId);
    expect(JSON.stringify(response)).not.toContain(clientId);
  });
});
