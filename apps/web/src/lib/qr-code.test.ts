import { describe, expect, it } from 'vitest';
import { qrSvg, qrSvgDataUri } from './qr-code';

describe('qr-code', () => {
  it('renders a local SVG QR code without external requests', () => {
    const value =
      'otpauth://totp/AMIC%20Vault:alpha-firm-admin%40test.local?secret=JBSWY3DPEHPK3PXP&issuer=AMIC%20Vault&algorithm=SHA1&digits=6&period=30';

    const svg = qrSvg(value);
    const dataUri = qrSvgDataUri(value);

    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 65 65"');
    expect(svg).toContain('<path fill="#111827"');
    expect(dataUri).toMatch(/^data:image\/svg\+xml;utf8,/);
    expect(dataUri).not.toContain('api.qrserver');
    expect(dataUri).not.toContain('chart.googleapis');
  });
});
