const command = process.argv[2] ?? 'unknown';

const introducedLater = new Set(['db:migrate', 'db:rollback', 'db:seed', 'test:integration']);

if (!introducedLater.has(command)) {
  console.error(`Unknown placeholder command: ${command}`);
  process.exit(1);
}

console.log(`${command} is a PACK-R0 bootstrap placeholder and will be implemented by later R0 TUWs.`);
