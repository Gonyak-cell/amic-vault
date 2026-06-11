import { describe, expect, it } from 'vitest';
import { createCapturingLogWriter, redactSensitive, REDACTED, StructuredLogger } from './logger';
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

  it('propagates requestId into log lines', () => {
    const writer = createCapturingLogWriter();
    const logger = new StructuredLogger(writer);

    runWithRequestId('req-test-1', () => logger.log('inside request'));

    expect(JSON.parse(writer.lines[0] ?? '')).toMatchObject({ requestId: 'req-test-1' });
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
});
