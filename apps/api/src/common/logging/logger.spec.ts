import { describe, expect, it } from 'vitest';
import {
  createCapturingLogWriter,
  redactSensitive,
  REDACTED,
  safeReference,
  StructuredLogger,
} from './logger';
import { runWithRequestId, sanitizeRequestId } from './correlation.middleware';

describe('StructuredLogger', () => {
  it('writes one-line JSON with level, time, msg, and context', () => {
    const writer = createCapturingLogWriter();
    const logger = new StructuredLogger(writer);

    logger.log('hello', 'LoggerSpec');

    expect(writer.lines).toHaveLength(1);
    expect(JSON.parse(writer.lines[0] ?? '')).toMatchObject({
      level: 'info',
      msg: 'hello',
      context: 'LoggerSpec',
    });
    expect(JSON.parse(writer.lines[0] ?? '')).toHaveProperty('time');
  });

  it('redacts sensitive keys recursively before output', () => {
    const writer = createCapturingLogWriter();
    const logger = new StructuredLogger(writer);

    logger.warn(
      {
        msg: 'login',
        password: 'plain-password',
        nested: { token: 'session-token', body: { text: 'secret body' } },
      },
      'LoggerSpec',
    );

    const line = writer.lines[0] ?? '';
    expect(line).not.toContain('plain-password');
    expect(line).not.toContain('session-token');
    expect(line).not.toContain('secret body');
    expect(JSON.parse(line)).toMatchObject({
      password: REDACTED,
      nested: { token: REDACTED, body: REDACTED },
    });
  });

  it('propagates only a one-way request reference into log lines', () => {
    const writer = createCapturingLogWriter();
    const logger = new StructuredLogger(writer);

    runWithRequestId('req-test-1', () => logger.log('inside request'));

    const line = writer.lines[0] ?? '';
    expect(JSON.parse(line)).toMatchObject({
      requestRef: safeReference('req-test-1'),
      msg: 'LOG_EVENT',
    });
    expect(line).not.toContain('req-test-1');
  });

  it('rejects malformed request ids', () => {
    expect(sanitizeRequestId('valid-id_123')).toBe('valid-id_123');
    expect(sanitizeRequestId('bad id')).toBeUndefined();
    expect(sanitizeRequestId('x'.repeat(81))).toBeUndefined();
  });

  it('supports direct redaction checks for review fixtures', () => {
    expect(redactSensitive({ headers: { cookie: 'secret' } })).toEqual({
      headers: { cookie: REDACTED },
    });
  });

  it('uses the language-neutral SHA-256 reference golden vector', () => {
    expect(safeReference('11111111-1111-4111-8111-111111111111')).toBe('ref:bd7662a5eeb41614');
    expect(safeReference('11111111-1111-4111-8111-111111111112')).not.toBe('ref:bd7662a5eeb41614');
  });

  it('hashes identifiers and removes nested raw-data canaries', () => {
    const rawId = '11111111-1111-4111-8111-111111111111';
    const sanitized = redactSensitive({
      documentId: rawId,
      eventId: 42,
      nested: [
        {
          clientIp: '192.0.2.10',
          originalFilename: 'client-contract.docx',
          arbitraryNote: 'confidential contract body',
          stack: 'Error: canary\n at /private/source.ts:1',
        },
      ],
      status: 'ready',
      method: 'POST',
    });
    const serialized = JSON.stringify(sanitized);

    expect(sanitized).toMatchObject({
      documentId: 'ref:bd7662a5eeb41614',
      eventId: safeReference('42'),
      nested: [
        {
          clientIp: REDACTED,
          originalFilename: REDACTED,
          arbitraryNote: REDACTED,
          stack: REDACTED,
        },
      ],
      status: 'ready',
      method: 'POST',
    });
    for (const canary of [
      rawId,
      '192.0.2.10',
      'client-contract.docx',
      'confidential contract body',
      '/private/source.ts',
    ]) {
      expect(serialized).not.toContain(canary);
    }
  });
});
