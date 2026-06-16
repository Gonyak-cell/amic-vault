import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('Outlook Smart Alerts manifest', () => {
  it('declares OnMessageSend with a bounded Smart Alerts runtime', () => {
    const manifest = readFileSync(
      join(root, 'public/outlook-addin/manifest.xml'),
      'utf8',
    );

    expect(manifest).toContain('VersionOverridesV1_1');
    expect(manifest).toContain('DefaultMinVersion="1.14"');
    expect(manifest).toContain('MessageComposeCommandSurface');
    expect(manifest).toContain('LaunchEvent Type="OnMessageSend"');
    expect(manifest).toContain('FunctionName="onAmicVaultMessageSend"');
    expect(manifest).toContain('SendMode="SoftBlock"');
    expect(manifest).toContain('/outlook-addin/smart-alerts.html');
    expect(manifest).toContain('/outlook-addin/smart-alerts.js');
    expect(manifest).not.toContain('ReadWriteMailbox');
    expect(manifest).not.toContain('Mail.Send');
    expect(manifest).not.toContain('WebApplicationInfo');
  });

  it('keeps the Smart Alerts runtime stateless and server-policy driven', () => {
    const runtime = readFileSync(
      join(root, 'public/outlook-addin/smart-alerts.js'),
      'utf8',
    );

    expect(runtime).toContain('/v1/m365/outlook/send-policy-decisions');
    expect(runtime).toContain('sendModeOverride');
    expect(runtime).toContain('onAmicVaultMessageSend');
    expect(runtime).not.toContain('localStorage');
    expect(runtime).not.toContain('sessionStorage');
    expect(runtime).not.toContain('indexedDB');
    expect(runtime).not.toContain('accessToken');
    expect(runtime).not.toContain('refreshToken');
  });
});
