import { describe, expect, it } from 'vitest';

import { classifyComposeFailure } from './compose-failure-diagnostic';

describe('bounded compose failure diagnostic', () => {
  it.each([
    ['failed to solve: executor failed', 'IMAGE_BUILD_FAILED'],
    ['worker startup denied EGRESS_DNS_UNAVAILABLE', 'EGRESS_DNS_UNAVAILABLE'],
    ['ssl: certificate verify failed', 'CERTIFICATE_VERIFY_FAILED'],
    ['process exited with exit code: 137', 'MEMORY_EXHAUSTED'],
    ['{"Service":"storage-fixture","State":"exited","ExitCode":137}', 'MEMORY_EXHAUSTED'],
    ['image does not provide the specified platform', 'PLATFORM_MISMATCH'],
    [
      'storage-fixture | Traceback (most recent call last)\nPermission denied',
      'SECRET_PERMISSION_DENIED',
    ],
    ['{"Service":"storage-fixture","State":"exited","ExitCode":1}', 'STORAGE_FIXTURE_NOT_READY'],
    ['{"Service":"ingestion-gateway","State":"running","Health":"unhealthy"}', 'GATEWAY_NOT_READY'],
  ] as const)('maps %s to %s', (diagnostic, expected) => {
    expect(classifyComposeFailure(diagnostic)).toBe(expected);
  });

  it('returns only a bounded fallback for unknown raw output', () => {
    const secret = 'SF20_RAW_CUSTOMER_SECRET_CANARY_7251';
    expect(classifyComposeFailure(`unexpected ${secret}`)).toBe('UNKNOWN');
    expect(classifyComposeFailure(`unexpected ${secret}`)).not.toContain(secret);
  });
});
