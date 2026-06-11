import { describe, expect, it } from 'vitest';
import { createCapturingLogWriter, StructuredLogger } from '../logging/logger';
import { LogErrorTracker } from './error-tracker';

describe('LogErrorTracker', () => {
  it('logs requestId and stack without request body or headers', async () => {
    const writer = createCapturingLogWriter();
    const tracker = new LogErrorTracker(new StructuredLogger(writer));

    await tracker.capture(new Error('forced'), {
      requestId: 'req-1',
      method: 'POST',
      path: '/v1/example',
    });

    const line = writer.lines[0] ?? '';
    expect(line).toContain('req-1');
    expect(line).toContain('forced');
    expect(line).not.toContain('password');
    expect(line).not.toContain('cookie');
  });
});
