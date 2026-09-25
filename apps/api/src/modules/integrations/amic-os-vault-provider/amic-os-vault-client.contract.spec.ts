import { describe, expect, it } from 'vitest';
import { clientWorkspaceRef, parseClientDocumentEnvelope } from './amic-os-vault-client.contract';

const tenantId = 'lawos-tenant';
const partyId = 'party-1';
const documentId = '11111111-1111-4111-8111-111111111111';
const envelope = () => ({
  schema_version: 'amic-os.client-documents.v1',
  request_id: 'request-1',
  principal: { tenant_id: tenantId, user_id: 'user-1' },
  scope: { type: 'client_documents', party_id: partyId, workspace_ref: clientWorkspaceRef(tenantId, partyId) },
  authorization: { decision: 'allow', decision_ref: 'decision-1', action: 'dms:document:write',
    checked_at: new Date().toISOString() },
  input: { document_id: documentId, expected_revision: 0, category: 'registry_extract',
    issued_on: null, viewed_on: null },
});

describe('AMIC OS Client document envelope', () => {
  it('accepts initial metadata revision zero and binds a deterministic workspace', () => {
    const parsed = parseClientDocumentEnvelope(envelope(), 'metadata/update');
    expect(parsed.input.expected_revision).toBe(0);
    expect(parsed.scope.workspace_ref).toBe(clientWorkspaceRef(tenantId, partyId));
  });

  it('rejects stale authority, mismatched action and party workspace confusion', () => {
    const stale = envelope();
    stale.authorization.checked_at = new Date(Date.now() - 120_000).toISOString();
    expect(() => parseClientDocumentEnvelope(stale, 'metadata/update')).toThrow();
    const wrongAction = envelope();
    wrongAction.authorization.action = 'dms:document:read';
    expect(() => parseClientDocumentEnvelope(wrongAction, 'metadata/update')).toThrow();
    const wrongParty = envelope();
    wrongParty.scope.party_id = 'party-2';
    expect(() => parseClientDocumentEnvelope(wrongParty, 'metadata/update')).toThrow();
  });
});
