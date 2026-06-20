import { describe, expect, it } from 'vitest';
import {
  matterAppLookupQuerySchema,
  matterAppLookupResponseSchema,
  matterAppSourceStatusSchema,
} from './matter-app.dto';

describe('matter app DTO schemas', () => {
  it('parses bounded lookup queries', () => {
    expect(
      matterAppLookupQuerySchema.parse({
        q: ' AMIC ',
        pageSize: '25',
      }),
    ).toEqual({
      q: 'AMIC',
      pageSize: 25,
    });

    expect(() => matterAppLookupQuerySchema.parse({ pageSize: 51 })).toThrow();
  });

  it('requires explicit source availability fields', () => {
    expect(
      matterAppSourceStatusSchema.parse({
        mode: 'unconfigured',
        requestedMode: 'matter_app_api',
        label: 'Matter app connection required',
        description: 'Runtime unavailable',
        sourceConfigured: false,
        runtimeReady: false,
        sourceContractReady: false,
        sourceAvailable: false,
        uploadAuthoritative: false,
        productionRuntime: true,
        projectionFallbackAllowed: false,
        stalenessMaxSeconds: 900,
        sourceUpdatedAt: null,
        sourceStale: false,
        unavailableReason: 'runtime_not_ready',
      }),
    ).toMatchObject({
      mode: 'unconfigured',
      unavailableReason: 'runtime_not_ready',
    });
  });

  it('validates lookup responses with reference-only Matter options', () => {
    expect(
      matterAppLookupResponseSchema.parse({
        source: {
          mode: 'matter_app_api',
          requestedMode: 'matter_app_api',
          label: 'Matter app API',
          description: 'Runtime ready',
          sourceConfigured: true,
          runtimeReady: true,
          sourceContractReady: true,
          sourceAvailable: true,
          uploadAuthoritative: true,
          productionRuntime: false,
          projectionFallbackAllowed: false,
          stalenessMaxSeconds: 900,
          sourceUpdatedAt: null,
          sourceStale: false,
        },
        lookupAvailable: true,
        items: [
          {
            matterReference: '11111111-1111-4111-8111-111111111111',
            matterCode: 'AMIC-2026-0001',
            matterName: 'Investment Advisory',
            clientDisplayName: 'AMIC Client',
            status: 'active',
            practiceGroup: 'Finance',
            sourceMode: 'matter_app_api',
            sourceUpdatedAt: null,
            sourceRevision: 'projection-rev-1',
            uploadEligible: true,
            blockedReason: null,
          },
        ],
        totalCount: 1,
        pageSize: 20,
      }).items[0],
    ).toMatchObject({
      matterCode: 'AMIC-2026-0001',
      uploadEligible: true,
    });
  });
});
