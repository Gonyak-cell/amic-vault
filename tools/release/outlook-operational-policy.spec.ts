import { describe, expect, it } from 'vitest';
import {
  evaluateOutlookOperationalGate,
  parseOutlookEvidenceRef,
  scanDirectOutlookEnvReads,
  scanFiles,
} from './outlook-operational-policy.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const validRefs = {
  OUTLOOK_OPERATOR_APPROVAL_REF: 'APPROVAL-OUTLOOK-OPERATOR-20260616-ABCDEFGH',
  OUTLOOK_MANIFEST_VALIDATION_REF: 'EVREF-OUTLOOK-002-20260616-ABCDEFGH',
  OUTLOOK_GRAPH_CONSENT_REF: 'EVREF-OUTLOOK-003-20260616-ABCDEFGH',
  OUTLOOK_DISABLE_REMOVE_REHEARSAL_REF: 'REHEARSAL-OUTLOOK-REMOVE-20260616-ABCDEFGH',
};

describe('outlook operational release policy', () => {
  it('passes production enforcement when Outlook is fully disabled', () => {
    expect(
      evaluateOutlookOperationalGate({
        target: 'production',
        mode: 'enforce',
        env: {},
      }),
    ).toEqual(expect.objectContaining({ status: 'pass', enabledFeatures: [] }));
  });

  it('blocks production enablement when required refs are missing', () => {
    const report = evaluateOutlookOperationalGate({
      target: 'production',
      mode: 'enforce',
      env: {
        OUTLOOK_ADDIN_ENABLED: 'true',
        OUTLOOK_SEND_FILE_ENABLED: 'true',
        OUTLOOK_ROLLOUT_RING: 'R1_PILOT_PRACTICE',
      },
    });
    expect(report.status).toBe('fail');
    expect(report.failures.map((failure) => failure.code)).toContain(
      'MISSING_OPERATOR_APPROVAL_REF',
    );
    expect(report.failures.map((failure) => failure.code)).toContain(
      'MISSING_MANIFEST_VALIDATION_REF',
    );
  });

  it('blocks ring-feature mismatch without printing raw refs', () => {
    const report = evaluateOutlookOperationalGate({
      target: 'production',
      mode: 'enforce',
      env: {
        OUTLOOK_ADDIN_ENABLED: 'true',
        OUTLOOK_AUTOFILE_ENABLED: 'true',
        OUTLOOK_ROLLOUT_RING: 'R0_ADMIN_ONLY',
        OUTLOOK_AUDIT_AVAILABLE: 'true',
        ...validRefs,
      },
    });
    expect(report.status).toBe('fail');
    expect(report.failures).toContainEqual({
      code: 'RING_FEATURE_NOT_ALLOWED',
      feature: 'AUTOFILE',
    });
    expect(JSON.stringify(report)).not.toContain(validRefs.OUTLOOK_OPERATOR_APPROVAL_REF);
  });

  it('requires Graph consent only for Graph-dependent features', () => {
    const report = evaluateOutlookOperationalGate({
      target: 'production',
      mode: 'enforce',
      env: {
        OUTLOOK_ADDIN_ENABLED: 'true',
        OUTLOOK_GRAPH_ATTACHMENT_ACQUISITION_ENABLED: 'true',
        OUTLOOK_ROLLOUT_RING: 'R1_PILOT_PRACTICE',
        OUTLOOK_OPERATOR_APPROVAL_REF: validRefs.OUTLOOK_OPERATOR_APPROVAL_REF,
        OUTLOOK_MANIFEST_VALIDATION_REF: validRefs.OUTLOOK_MANIFEST_VALIDATION_REF,
        OUTLOOK_DISABLE_REMOVE_REHEARSAL_REF: validRefs.OUTLOOK_DISABLE_REMOVE_REHEARSAL_REF,
      },
    });
    expect(report.failures).toContainEqual({
      code: 'MISSING_GRAPH_CONSENT_REF',
      evidenceKind: 'EV-OUTLOOK-003',
    });
  });

  it('requires explicit audit availability for production feature enablement', () => {
    const report = evaluateOutlookOperationalGate({
      target: 'production',
      mode: 'enforce',
      env: {
        OUTLOOK_ADDIN_ENABLED: 'true',
        OUTLOOK_SEND_FILE_ENABLED: 'true',
        OUTLOOK_ROLLOUT_RING: 'R1_PILOT_PRACTICE',
        ...validRefs,
      },
    });
    expect(report.failures).toContainEqual({ code: 'AUDIT_UNAVAILABLE' });
  });

  it('rejects concrete tenant or provider evidence as malformed refs', () => {
    expect(
      parseOutlookEvidenceRef('EV-OUTLOOK-003', 'https://login.microsoftonline.com/tenant'),
    ).toEqual(expect.objectContaining({ present: true, validFormat: false }));
    expect(parseOutlookEvidenceRef('EV-OUTLOOK-002', 'tenant.onmicrosoft.com')).toEqual(
      expect.objectContaining({ present: true, validFormat: false }),
    );
  });

  it('redaction scan reports sensitive provider evidence without echoing values', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'outlook-operational-policy-'));
    fs.mkdirSync(path.join(dir, 'docs/release'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'docs/release/live.md'),
      'admin evidence is at https://admin.microsoft.com/example',
      'utf8',
    );
    const failures = scanFiles(dir, ['docs/release/live.md']);
    expect(failures).toContainEqual({
      code: 'SENSITIVE_PATTERN_DETECTED',
      file: 'docs/release/live.md',
      patternCode: 'EXTERNAL_URL',
    });
    expect(JSON.stringify(failures)).not.toContain('admin.microsoft.com/example');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('blocks direct Outlook environment reads outside the central gate', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'outlook-operational-policy-'));
    fs.mkdirSync(path.join(dir, 'apps/api/src/modules/outlook'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'apps/api/src/modules/outlook/outlook.service.ts'),
      "export const open = process.env.OUTLOOK_SEND_FILE_ENABLED === 'true';",
      'utf8',
    );
    fs.writeFileSync(
      path.join(dir, 'apps/api/src/modules/outlook/outlook-operational-gate.ts'),
      "export const open = process.env.OUTLOOK_SEND_FILE_ENABLED === 'true';",
      'utf8',
    );

    expect(scanDirectOutlookEnvReads(dir)).toEqual([
      {
        code: 'DIRECT_OUTLOOK_ENV_READ',
        file: 'apps/api/src/modules/outlook/outlook.service.ts',
      },
    ]);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
