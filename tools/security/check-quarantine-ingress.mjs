import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const requiredIngress = [
  {
    path: 'apps/api/src/modules/document/document.controller.ts',
    markers: ['quarantineIngressEnabled()', 'this.quarantineIntake.intake(input)', 'response.status(202)'],
  },
  {
    path: 'apps/api/src/modules/document/bulk-upload.job.ts',
    markers: ['quarantineIngressEnabled()', 'this.quarantineIntake.intake({', "status: 'quarantined'"],
  },
  {
    path: 'apps/api/src/modules/email/email.service.ts',
    markers: ['quarantineIngressEnabled()', 'this.quarantineIntake.intakeBuffer({', "sourceSystem: 'email_ingest'"],
  },
  {
    path: 'apps/api/src/tools/onedrive-pilot-write-runner.ts',
    markers: ['quarantineIngressEnabled()', 'quarantineIntake.intake({', "sourceSystem: 'migration'"],
  },
  {
    path: 'apps/api/src/tools/onedrive-customer-wide-import-runner.ts',
    markers: ['quarantineIngressEnabled()', 'quarantineIntake.intake({', "sourceSystem: 'migration'"],
  },
];

const missing = [];
for (const ingress of requiredIngress) {
  const source = await readFile(resolve(ingress.path), 'utf8');
  for (const marker of ingress.markers) {
    if (!source.includes(marker)) missing.push(`${ingress.path}: ${marker}`);
  }
}

if (missing.length > 0) {
  throw new Error(`QUARANTINE_INGRESS_BYPASS_RISK\n${missing.join('\n')}`);
}

console.log('quarantine ingress source checks passed');
