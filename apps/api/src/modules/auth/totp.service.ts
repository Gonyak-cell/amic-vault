import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const totpStepSeconds = 30;
const totpDigits = 6;

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpCodeForSecret(secret: string, at = Date.now()): string {
  const counter = Math.floor(at / 1000 / totpStepSeconds);
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 10 ** totpDigits).padStart(totpDigits, '0');
}

export function verifyTotpCode(secret: string, code: string, at = Date.now()): boolean {
  const normalized = code.replace(/\s+/g, '');
  if (!/^[0-9]{6}$/.test(normalized)) return false;
  const candidate = Buffer.from(normalized);
  for (let offset = -1; offset <= 1; offset += 1) {
    const expected = Buffer.from(totpCodeForSecret(secret, at + offset * totpStepSeconds * 1000));
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) return true;
  }
  return false;
}

export function buildOtpAuthUri(input: {
  issuer: string;
  accountName: string;
  secret: string;
}): string {
  const label = `${input.issuer}:${input.accountName}`;
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: 'SHA1',
    digits: String(totpDigits),
    period: String(totpStepSeconds),
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

@Injectable()
export class TotpService {
  generateSecret(): string {
    return generateTotpSecret();
  }

  codeForSecret(secret: string, at = Date.now()): string {
    return totpCodeForSecret(secret, at);
  }

  verify(secret: string, code: string, at = Date.now()): boolean {
    return verifyTotpCode(secret, code, at);
  }

  otpauthUri(input: { issuer: string; accountName: string; secret: string }): string {
    return buildOtpAuthUri(input);
  }
}

function base32Encode(input: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += base32Alphabet[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const normalized = input.toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    const index = base32Alphabet.indexOf(char);
    if (index < 0) throw new Error('invalid_totp_secret');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
