import { Injectable } from '@nestjs/common';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { fetchIngestionWorker } from '../document/extraction/private-gateway.transport';

export const previewConvertQueueName = 'document.preview-convert';
// Keep the existing worker convert profile's input/output limits.
export const PREVIEW_MAX_INPUT_BYTES = 500 * 1024 * 1024;
export const PREVIEW_MAX_OUTPUT_BYTES = 256 * 1024 * 1024;
export const PREVIEW_CONVERT_TIMEOUT_MS = 65_000;

export class PreviewConversionUnavailableError extends Error {
  constructor(message = 'preview conversion unavailable') {
    super(message);
    this.name = 'PreviewConversionUnavailableError';
  }
}

export async function readPreviewBytes(
  stream: Readable,
  maximumBytes: number,
  expectedBytes?: number,
): Promise<Buffer> {
  try {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1
        || (expectedBytes !== undefined && (!Number.isSafeInteger(expectedBytes)
          || expectedBytes < 1 || expectedBytes > maximumBytes))) {
      throw new PreviewConversionUnavailableError();
    }
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of stream) {
      if (!(chunk instanceof Uint8Array)) throw new PreviewConversionUnavailableError();
      length += chunk.byteLength;
      if (length > maximumBytes || (expectedBytes !== undefined && length > expectedBytes)) {
        throw new PreviewConversionUnavailableError();
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (length < 1 || (expectedBytes !== undefined && length !== expectedBytes)) {
      throw new PreviewConversionUnavailableError();
    }
    return Buffer.concat(chunks, length);
  } catch {
    stream.destroy();
    throw new PreviewConversionUnavailableError();
  }
}

@Injectable()
export class PreviewConvertJob {
  readonly queueName = previewConvertQueueName;

  async getProfileSha256(tenantId: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PREVIEW_CONVERT_TIMEOUT_MS);
    let response: Response | undefined;
    try {
      response = await fetchIngestionWorker('/convert/office-to-pdf/profile', {
        method: 'GET', headers: { 'x-amic-tenant-id': tenantId }, signal: controller.signal,
      });
      if (!response.ok || response.headers.get('content-type')?.split(';', 1)[0]?.trim() !== 'application/json'
          || !response.body) throw new PreviewConversionUnavailableError();
      const bytes = await readPreviewBytes(
        Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>), 4096,
      );
      const profile: unknown = JSON.parse(bytes.toString('utf8'));
      if (!profile || typeof profile !== 'object' || !('profile_sha256' in profile)
          || Object.keys(profile).length !== 1 || typeof profile.profile_sha256 !== 'string'
          || !/^[a-f0-9]{64}$/u.test(profile.profile_sha256)) throw new PreviewConversionUnavailableError();
      return profile.profile_sha256;
    } catch {
      await response?.body?.cancel().catch(() => undefined);
      throw new PreviewConversionUnavailableError();
    } finally {
      clearTimeout(timeout);
    }
  }

  async convertOfficeToPdf(input: {
    tenantId: string;
    filename: string;
    contentType: string;
    body: Buffer;
    converterProfileSha256?: string;
  }): Promise<Buffer> {
    if (input.body.byteLength < 1 || input.body.byteLength > PREVIEW_MAX_INPUT_BYTES) {
      throw new PreviewConversionUnavailableError();
    }
    const profile = input.converterProfileSha256 ?? await this.getProfileSha256(input.tenantId);
    if (!/^[a-f0-9]{64}$/u.test(profile)) throw new PreviewConversionUnavailableError();
    const form = new FormData();
    form.append('tenant_id', input.tenantId);
    form.append(
      'file',
      new Blob([new Uint8Array(input.body)], { type: input.contentType }),
      input.filename,
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PREVIEW_CONVERT_TIMEOUT_MS);
    let response: Response | undefined;
    try {
      response = await fetchIngestionWorker('/convert/office-to-pdf', {
        method: 'POST',
        headers: { 'x-amic-tenant-id': input.tenantId, 'x-amic-converter-profile': profile },
        body: form,
        signal: controller.signal,
      });
      const contentType = (response.headers.get('content-type') ?? '')
        .split(';', 1)[0]?.trim().toLowerCase();
      if (!response.ok || contentType !== 'application/pdf' || !response.body
          || response.headers.get('x-amic-converter-profile') !== profile) {
        throw new PreviewConversionUnavailableError();
      }
      const declaredLength = response.headers.get('content-length');
      if (declaredLength !== null && !/^[1-9]\d*$/u.test(declaredLength)) {
        throw new PreviewConversionUnavailableError();
      }
      const buffer = await readPreviewBytes(
        Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>),
        PREVIEW_MAX_OUTPUT_BYTES,
        declaredLength === null ? undefined : Number(declaredLength),
      );
      if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
        throw new PreviewConversionUnavailableError();
      }
      return buffer;
    } catch {
      await response?.body?.cancel().catch(() => undefined);
      throw new PreviewConversionUnavailableError();
    } finally {
      clearTimeout(timeout);
    }
  }

  async convertDocxToPdf(input: {
    tenantId: string;
    filename: string;
    body: Buffer;
  }): Promise<Buffer> {
    return this.convertOfficeToPdf({
      ...input,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }
}
