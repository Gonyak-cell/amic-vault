import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { join } from 'node:path';
import vm from 'node:vm';
import { TextEncoder } from 'node:util';
import { describe, expect, it, vi } from 'vitest';

interface AsyncResult<T> {
  status: string;
  value?: T;
}

interface SmartAlertEvent {
  completed: ReturnType<typeof vi.fn>;
}

interface SmartAlertWindow {
  Office: unknown;
  crypto: Crypto;
  onAmicVaultMessageSend?: (event: SmartAlertEvent) => Promise<void>;
}

function asyncValue<T>(value: T) {
  return {
    getAsync(callback: (result: AsyncResult<T>) => void) {
      callback({ status: 'succeeded', value });
    },
  };
}

function loadRuntime(options: { bodyStatus?: string; bodyText?: string; policyDecision: 'allow' | 'warn' | 'block' }) {
  let postedPayload: Record<string, unknown> | undefined;
  const bodyStatus = options.bodyStatus ?? 'succeeded';
  const office = {
    AsyncResultStatus: {
      Succeeded: 'succeeded',
    },
    CoercionType: {
      Text: 'text',
    },
    MailboxEnums: {
      SendModeOverride: {
        PromptUser: 'promptUser',
      },
    },
    actions: {
      associate: vi.fn(),
    },
    context: {
      mailbox: {
        userProfile: {
          emailAddress: 'lawyer@amic.test',
        },
        item: {
          itemId: 'compose-item-1',
          conversationId: 'conversation-1',
          to: asyncValue([{ emailAddress: 'counterparty@example.test' }]),
          cc: asyncValue([]),
          subject: asyncValue('Settlement draft'),
          body: {
            getAsync(_coercion: string, callback: (result: AsyncResult<string>) => void) {
              callback(
                bodyStatus === 'succeeded'
                  ? { status: 'succeeded', value: options.bodyText ?? '' }
                  : { status: 'failed' },
              );
            },
          },
          getAttachmentsAsync(callback: (result: AsyncResult<unknown[]>) => void) {
            callback({ status: 'succeeded', value: [] });
          },
        },
      },
    },
  };
  const windowObject: SmartAlertWindow = {
    Office: office,
    crypto: webcrypto as Crypto,
  };
  const context = {
    Office: office,
    TextEncoder,
    URL,
    fetch: vi.fn(async (_url: string, init?: { body?: string }) => {
      postedPayload = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      return {
        ok: true,
        json: async () => ({
          decision: options.policyDecision,
          warningReasonCodes:
            options.policyDecision === 'warn' ? ['dlp_scan_failed'] : ['dlp_finding'],
        }),
      };
    }),
    location: {
      origin: 'https://vault.example.test',
    },
    window: windowObject,
  };
  const runtime = readFileSync(join(process.cwd(), 'public/outlook-addin/smart-alerts.js'), 'utf8');
  vm.runInNewContext(runtime, context);
  return { context, postedPayload: () => postedPayload };
}

describe('Outlook Smart Alerts runtime DLP scan', () => {
  it('reports only hash-only DLP findings and honors server block decisions', async () => {
    const sensitiveBody = 'resident number 000000-0000000';
    const runtime = loadRuntime({
      bodyText: sensitiveBody,
      policyDecision: 'block',
    });
    const event: SmartAlertEvent = { completed: vi.fn() };

    await runtime.context.window.onAmicVaultMessageSend?.(event);

    const payload = runtime.postedPayload();
    expect(payload?.dlpReport).toMatchObject({
      status: 'finding',
      findingCount: 1,
      restrictedFindingCount: 1,
    });
    expect(JSON.stringify(payload)).not.toContain(sensitiveBody);
    expect(JSON.stringify(payload)).not.toContain('000000-0000000');
    expect(event.completed).toHaveBeenCalledWith(
      expect.objectContaining({
        allowEvent: false,
        errorMessage: expect.stringContaining('blocked'),
      }),
    );
  });

  it('reports scan failure as a warning payload without message body leakage', async () => {
    const runtime = loadRuntime({
      bodyStatus: 'failed',
      bodyText: 'should not be read',
      policyDecision: 'warn',
    });
    const event: SmartAlertEvent = { completed: vi.fn() };

    await runtime.context.window.onAmicVaultMessageSend?.(event);

    expect(runtime.postedPayload()?.dlpReport).toEqual({
      status: 'scan_failed',
      failureCode: 'body_unavailable',
    });
    expect(JSON.stringify(runtime.postedPayload())).not.toContain('should not be read');
    expect(event.completed).toHaveBeenCalledWith(
      expect.objectContaining({
        allowEvent: false,
        sendModeOverride: 'promptUser',
      }),
    );
  });
});
