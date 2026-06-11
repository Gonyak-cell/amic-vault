import { Injectable } from '@nestjs/common';

export const previewConvertQueueName = 'document.preview-convert';

export class PreviewConversionUnavailableError extends Error {
  constructor(message = 'preview conversion unavailable') {
    super(message);
    this.name = 'PreviewConversionUnavailableError';
  }
}

function workerBaseUrl(): string {
  return (process.env.INGESTION_WORKER_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');
}

@Injectable()
export class PreviewConvertJob {
  readonly queueName = previewConvertQueueName;

  async convertDocxToPdf(input: {
    tenantId: string;
    filename: string;
    body: Buffer;
  }): Promise<Buffer> {
    const form = new FormData();
    form.append('tenant_id', input.tenantId);
    form.append(
      'file',
      new Blob([new Uint8Array(input.body)], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
      input.filename,
    );

    let response: Response;
    try {
      response = await fetch(`${workerBaseUrl()}/convert/docx-to-pdf`, {
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
}
