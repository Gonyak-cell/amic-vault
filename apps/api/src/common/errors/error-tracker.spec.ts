import { describe, expect, it } from 'vitest';
import {
  createCapturingLogWriter,
  REDACTED,
  safeReference,
  StructuredLogger,
} from '../logging/logger';
import { LogErrorTracker } from './error-tracker';

describe('LogErrorTracker', () => {
  it('logs a safe request reference without raw path, stack, body, or headers', async () => {
    const writer = createCapturingLogWriter();
    const tracker = new LogErrorTracker(new StructuredLogger(writer));

    await tracker.capture(new Error('forced'), {
      requestId: 'req-1',
      method: 'POST',
      path: '/v1/example',
    });

    const line = writer.lines[0] ?? '';
    expect(JSON.parse(line)).toMatchObject({
      context: 'ErrorTracker',
      method: 'POST',
      msg: 'unhandled_exception',
      path: REDACTED,
      requestId: safeReference('req-1'),
      trace: REDACTED,
    });
    expect(line).not.toContain('req-1');
    expect(line).not.toContain('forced');
    expect(line).not.toContain('/v1/example');
    expect(line).not.toContain('password');
    expect(line).not.toContain('cookie');
  });
});
