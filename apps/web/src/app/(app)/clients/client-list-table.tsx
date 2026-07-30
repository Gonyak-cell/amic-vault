import React from 'react';
import Link from 'next/link';
import type { ClientDto } from '@amic-vault/shared';
import {
  clientConfidentialityLabels as clientConfidentialityLabelsByLanguage,
  clientStatusLabels as clientStatusLabelsByLanguage,
  clientTypeLabels as clientTypeLabelsByLanguage,
  clientUnknownLabels,
} from '@/lib/i18n';

const clientTypeLabels: Readonly<Record<string, string>> = clientTypeLabelsByLanguage.ko;
const confidentialityLabels: Readonly<Record<string, string>> =
  clientConfidentialityLabelsByLanguage.ko;
const statusLabels: Readonly<Record<string, string>> = clientStatusLabelsByLanguage.ko;

export function clientDetailPath(clientId: string): string {
  return `/clients/${encodeURIComponent(clientId)}`;
}

export function clientDetailActionLabel(client: ClientDto, index: number): string {
  const name = client.displayName || client.name || '이름 없는 고객';
  return `고객 상세 보기: ${name} · 목록 ${index + 1}번`;
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
        {clients.map((client, index) => {
          const aliases = Array.isArray(client.aliases) ? client.aliases : [];
          const displayName = client.displayName || client.name || '이름 없는 고객';
          return (
            <div
              key={client.clientId}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b px-3 py-3 text-sm last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(100px,0.4fr)_auto] md:gap-3 md:px-4 xl:grid-cols-[minmax(220px,1fr)_120px_110px_110px_minmax(180px,1fr)] xl:gap-4 xl:px-5 xl:py-4"
            >
              <Link
                aria-label={clientDetailActionLabel(client, index)}
                href={clientDetailPath(client.clientId)}
                className="min-w-0 rounded-md underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title={displayName}
              >
                <span className="block truncate font-semibold">{displayName}</span>
              </Link>
              <span className="hidden truncate text-muted-foreground md:block">
                {clientTypeLabels[client.clientType] ?? clientUnknownLabels.ko.type}
              </span>
              <span className="truncate text-muted-foreground">
                {statusLabels[client.status] ?? clientUnknownLabels.ko.status}
              </span>
              <span className="hidden truncate text-muted-foreground xl:block">
                {confidentialityLabels[client.confidentialityLevel] ??
                  clientUnknownLabels.ko.confidentiality}
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
