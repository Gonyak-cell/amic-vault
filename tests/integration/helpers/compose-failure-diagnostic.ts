export type ComposeFailureReason =
  | 'SETGID_FAILED'
  | 'SETUID_FAILED'
  | 'OPERATION_NOT_PERMITTED'
  | 'SECRET_PERMISSION_DENIED'
  | 'CERTIFICATE_LOAD_FAILED'
  | 'CERTIFICATE_VERIFY_FAILED'
  | 'RUNTIME_DIRECTORY_FAILED'
  | 'LISTENER_BIND_FAILED'
  | 'WORKER_GROUP_MISSING'
  | 'WORKER_USER_MISSING'
  | 'REQUIRED_FILE_MISSING'
  | 'EGRESS_DNS_UNAVAILABLE'
  | 'EGRESS_DESTINATION_DENIED'
  | 'STORAGE_FIXTURE_NOT_READY'
  | 'CLAMAV_FIXTURE_NOT_READY'
  | 'UNAPPROVED_FIXTURE_NOT_READY'
  | 'INGESTION_NOT_READY'
  | 'GATEWAY_NOT_READY'
  | 'API_PROBE_NOT_READY'
  | 'SERVICE_UNHEALTHY'
  | 'IMAGE_BUILD_FAILED'
  | 'DISK_EXHAUSTED'
  | 'MEMORY_EXHAUSTED'
  | 'COMMAND_TIMEOUT'
  | 'UNKNOWN';

const notReadyReasons = {
  'storage-fixture': 'STORAGE_FIXTURE_NOT_READY',
  'clamav-fixture': 'CLAMAV_FIXTURE_NOT_READY',
  'unapproved-fixture': 'UNAPPROVED_FIXTURE_NOT_READY',
  ingestion: 'INGESTION_NOT_READY',
  'ingestion-gateway': 'GATEWAY_NOT_READY',
  'api-probe': 'API_PROBE_NOT_READY',
} as const satisfies Record<string, ComposeFailureReason>;

function serviceNotReadyReason(diagnostic: string): ComposeFailureReason | undefined {
  for (const line of diagnostic.split(/\r?\n/u)) {
    try {
      const decoded = JSON.parse(line) as unknown;
      const rows = Array.isArray(decoded) ? decoded : [decoded];
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const state = row as Record<string, unknown>;
        const service = String(state.service ?? state.Service ?? '');
        const reason = notReadyReasons[service as keyof typeof notReadyReasons];
        if (!reason) continue;
        const lifecycle = String(state.state ?? state.State ?? '').toLowerCase();
        const health = String(state.health ?? state.Health ?? '').toLowerCase();
        const exitCode = Number(state.exitCode ?? state.ExitCode ?? 0);
        if (
          ['exited', 'dead', 'restarting'].includes(lifecycle) ||
          health === 'unhealthy' ||
          exitCode > 0
        ) {
          return reason;
        }
      }
    } catch {
      // Non-JSON service logs are classified by the bounded pattern table below.
    }
  }
  return undefined;
}

export function classifyComposeFailure(rawDiagnostic: string): ComposeFailureReason {
  const diagnostic = rawDiagnostic.toLowerCase();
  const serviceReason = serviceNotReadyReason(diagnostic);
  if (serviceReason) return serviceReason;

  return (
    (
      [
        ['egress_dns_unavailable', 'EGRESS_DNS_UNAVAILABLE'],
        ['egress_destination_denied', 'EGRESS_DESTINATION_DENIED'],
        ['certificate verify failed', 'CERTIFICATE_VERIFY_FAILED'],
        ['cannot load certificate', 'CERTIFICATE_LOAD_FAILED'],
        ['setgid', 'SETGID_FAILED'],
        ['setuid', 'SETUID_FAILED'],
        ['operation not permitted', 'OPERATION_NOT_PERMITTED'],
        ['permission denied', 'SECRET_PERMISSION_DENIED'],
        ['mkdir()', 'RUNTIME_DIRECTORY_FAILED'],
        ['bind()', 'LISTENER_BIND_FAILED'],
        ['address already in use', 'LISTENER_BIND_FAILED'],
        ['getgrnam', 'WORKER_GROUP_MISSING'],
        ['getpwnam', 'WORKER_USER_MISSING'],
        ['no such file', 'REQUIRED_FILE_MISSING'],
        ['no space left on device', 'DISK_EXHAUSTED'],
        ['cannot allocate memory', 'MEMORY_EXHAUSTED'],
        ['out of memory', 'MEMORY_EXHAUSTED'],
        ['exit code: 137', 'MEMORY_EXHAUSTED'],
        ['signal: killed', 'MEMORY_EXHAUSTED'],
        ['context deadline exceeded', 'COMMAND_TIMEOUT'],
        ['timed out', 'COMMAND_TIMEOUT'],
        ['unhealthy', 'SERVICE_UNHEALTHY'],
        ['failed to solve', 'IMAGE_BUILD_FAILED'],
        ['build failed', 'IMAGE_BUILD_FAILED'],
      ] as const
    ).find(([needle]) => diagnostic.includes(needle))?.[1] ?? 'UNKNOWN'
  );
}
