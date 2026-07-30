import React from 'react';
import Link from 'next/link';
import type {
  ClientConfidentialityLevel,
  ClientDto,
  ClientStatus,
  ClientType,
} from '@amic-vault/shared';

const clientTypeLabels = {
  corporation: '법인',
  fund: '펀드',
  government: '공공기관',
  individual: '개인',
  npo: '비영리',
  other: '기타',
} satisfies Record<ClientType, string>;

const confidentialityLabels = {
  high: '높음',
  restricted: '제한',
  standard: '표준',
} satisfies Record<ClientConfidentialityLevel, string>;

const statusLabels = {
  active: '활성',
  closed: '종료',
  dormant: '휴면',
} satisfies Record<ClientStatus, string>;

export function clientDetailPath(clientId: string): string {
  return `/clients/${encodeURIComponent(clientId)}`;
}

export function ClientListTable({ clients }: { clients: ClientDto[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[860px]">
        <div className="grid min-h-14 grid-cols-[minmax(220px,1fr)_120px_110px_110px_minmax(180px,1fr)] items-center gap-4 border-b px-5 py-3 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
          <span>고객</span>
          <span>유형</span>
          <span>상태</span>
          <span>기밀도</span>
          <span>별칭</span>
        </div>
        {clients.map((client) => {
          const aliases = Array.isArray(client.aliases) ? client.aliases : [];
          return (
            <div
              key={client.clientId}
              className="grid grid-cols-[minmax(220px,1fr)_120px_110px_110px_minmax(180px,1fr)] items-center gap-4 border-b px-5 py-4 text-sm last:border-b-0"
            >
              <Link
                href={clientDetailPath(client.clientId)}
                className="min-w-0 rounded-md underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="block truncate font-semibold">{client.displayName || client.name}</span>
              </Link>
              <span className="truncate text-muted-foreground">
                {clientTypeLabels[client.clientType as ClientType] ?? client.clientType}
              </span>
              <span className="truncate text-muted-foreground">
                {statusLabels[client.status as ClientStatus] ?? client.status}
              </span>
              <span className="truncate text-muted-foreground">
                {confidentialityLabels[client.confidentialityLevel as ClientConfidentialityLevel] ??
                  client.confidentialityLevel}
              </span>
              <span className="truncate text-muted-foreground">
                {aliases.length > 0 ? aliases.join(', ') : '없음'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
