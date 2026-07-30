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
      <div>
        <div className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b px-3 py-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground md:grid-cols-[minmax(0,1fr)_minmax(100px,0.4fr)_auto] md:gap-3 md:px-4 xl:min-h-14 xl:grid-cols-[minmax(220px,1fr)_120px_110px_110px_minmax(180px,1fr)] xl:gap-4 xl:px-5 xl:py-3">
          <span>고객</span>
          <span className="hidden md:block">유형</span>
          <span>상태</span>
          <span className="hidden xl:block">기밀도</span>
          <span className="hidden xl:block">별칭</span>
        </div>
        {clients.map((client) => {
          const aliases = Array.isArray(client.aliases) ? client.aliases : [];
          return (
            <div
              key={client.clientId}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b px-3 py-3 text-sm last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(100px,0.4fr)_auto] md:gap-3 md:px-4 xl:grid-cols-[minmax(220px,1fr)_120px_110px_110px_minmax(180px,1fr)] xl:gap-4 xl:px-5 xl:py-4"
            >
              <Link
                href={clientDetailPath(client.clientId)}
                className="min-w-0 rounded-md underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="block truncate font-semibold">{client.displayName || client.name}</span>
              </Link>
              <span className="hidden truncate text-muted-foreground md:block">
                {clientTypeLabels[client.clientType as ClientType] ?? client.clientType}
              </span>
              <span className="truncate text-muted-foreground">
                {statusLabels[client.status as ClientStatus] ?? client.status}
              </span>
              <span className="hidden truncate text-muted-foreground xl:block">
                {confidentialityLabels[client.confidentialityLevel as ClientConfidentialityLevel] ??
                  client.confidentialityLevel}
              </span>
              <span className="hidden truncate text-muted-foreground xl:block">
                {aliases.length > 0 ? aliases.join(', ') : '없음'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
