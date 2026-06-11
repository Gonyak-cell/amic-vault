import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns liveness without internal details', () => {
    expect(new HealthController().live()).toEqual({ status: 'ok' });
  });

  it('returns readiness 200 when the DB probe succeeds', async () => {
    const controller = new HealthController(async () => true);
    const response = { status: () => undefined };

    await expect(controller.ready(response)).resolves.toEqual({ status: 'ok' });
  });

  it('returns readiness 503 without exposing DB host or version', async () => {
    const controller = new HealthController(async () => false);
    let statusCode = 200;
    const response = { status: (code: number) => void (statusCode = code) };

    const body = await controller.ready(response);

    expect(statusCode).toBe(503);
    expect(body).toEqual({ status: 'unready' });
    expect(JSON.stringify(body)).not.toContain('postgres');
  });
});
