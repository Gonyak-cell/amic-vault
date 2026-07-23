import { Injectable } from '@nestjs/common';
import { fetchIngestionWorker } from '../document/extraction/private-gateway.transport';

export const previewConvertQueueName = 'document.preview-convert';

export class PreviewConversionUnavailableError extends Error {
  constructor(message = 'preview conversion unavailable') {
    super(message);
    this.name = 'PreviewConversionUnavailableError';
  }
}

@Injectable()
export class PreviewConvertJob {
  readonly queueName = previewConvertQueueName;

  async convertOfficeToPdf(input: {
    tenantId: string;
    filename: string;
    contentType: string;
    body: Buffer;
  }): Promise<Buffer> {
    const form = new FormData();
    form.append('tenant_id', input.tenantId);
    form.append(
      'file',
      new Blob([new Uint8Array(input.body)], { type: input.contentType }),
      input.filename,
    );

    let response: Response;
    try {
      response = await fetchIngestionWorker('/convert/office-to-pdf', {
        method: 'POST',
        headers: { 'x-amic-tenant-id': input.tenantId },
        body: form,
      });
    } catch {
      throw new PreviewConversionUnavailableError();
    }
    if (!response.ok) {
      throw new PreviewConversionUnavailableError(`preview conversion failed: ${response.status}`);
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/pdf')) {
      throw new PreviewConversionUnavailableError('preview conversion returned non-pdf');
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.subarray(0, 5).toString('latin1').startsWith('%PDF')) {
      throw new PreviewConversionUnavailableError('preview conversion returned invalid pdf');
    }
    return buffer;
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
