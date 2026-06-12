import { describe, expect, it } from 'vitest';
import {
  emailDuplicateBlockedAudit,
  emailImportedAudit,
  emailMetadataUpdatedAudit,
} from './email-events';

const base = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  actorId: '11111111-1111-4111-8111-111111111101',
  emailId: '11111111-1111-4111-8111-1111111111ee',
};

describe('email audit event builders', () => {
  it('records import metadata as references and hashes only', () => {
    const event = emailImportedAudit({
      ...base,
      rawFileObjectId: '11111111-1111-4111-8111-1111111111ff',
      rawSha256: 'a'.repeat(64),
      parseStatus: 'parsed',
    });

    expect(event).toMatchObject({
      action: 'EMAIL_IMPORTED',
      targetType: 'email',
      targetId: base.emailId,
      metadata: {
        scope_type: 'email',
        scope_id: base.emailId,
        hash: 'a'.repeat(64),
        after_ref: 'parse_status:parsed',
      },
    });
    expect(JSON.stringify(event)).not.toContain('Message-ID');
    expect(JSON.stringify(event)).not.toContain('Subject');
  });

  it('records duplicate denial with the hash only', () => {
    const event = emailDuplicateBlockedAudit({
      ...base,
      messageIdHash: 'b'.repeat(64),
    });

    expect(event).toMatchObject({
      action: 'EMAIL_DUPLICATE_BLOCKED',
      result: 'denied',
      metadata: {
        scope_type: 'email_message_id',
        hash: 'b'.repeat(64),
        reason_code: 'DUPLICATE_MESSAGE_ID',
      },
    });
    expect(JSON.stringify(event)).not.toContain('case@example.test');
  });

  it('records metadata updates without subject or participant addresses', () => {
    const event = emailMetadataUpdatedAudit({
      ...base,
      participantCount: 3,
      warningCode: 'MALFORMED_DATE',
    });

    expect(event).toMatchObject({
      action: 'EMAIL_METADATA_UPDATED',
      metadata: {
        scope_type: 'email_metadata',
        scope_id: base.emailId,
        result_count: 3,
        reason_code: 'MALFORMED_DATE',
      },
    });
    expect(JSON.stringify(event)).not.toContain('Subject');
    expect(JSON.stringify(event)).not.toContain('person@example.test');
  });
});
