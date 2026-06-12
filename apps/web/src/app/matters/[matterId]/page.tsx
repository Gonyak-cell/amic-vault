'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Mail, ShieldCheck, Users } from 'lucide-react';
import type { EmailMatterFilingDto, MatterDto } from '@amic-vault/shared';
import { getMatter, listMatterEmailTimeline } from '@/lib/api-client';
import { MatterStatusBadge } from '@/components/matter/matter-status-badge';
import { Button } from '@/components/ui/button';

export default function MatterDetailPage({ params }: { params: { matterId: string } }) {
  const [matter, setMatter] = useState<MatterDto | null>(null);
  const [emails, setEmails] = useState<EmailMatterFilingDto[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([getMatter(params.matterId), listMatterEmailTimeline(params.matterId)])
      .then(([matterResult, timeline]) => {
        if (!active) return;
        setMatter(matterResult);
        setEmails([...timeline.items]);
      })
      .catch(() => {
        if (!active) return;
        setMatter(null);
        setEmails([]);
      });
    return () => {
      active = false;
    };
  }, [params.matterId]);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-5 px-6 py-6">
      <section className="flex items-start justify-between gap-4 border-b pb-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {matter?.matterCode ?? params.matterId}
          </p>
          <h1 className="text-2xl font-semibold tracking-normal">
            {matter?.matterName ?? 'Matter'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link
              aria-label="Open matter team"
              title="Open matter team"
              href={`/matters/${params.matterId}/team`}
            >
              <Users className="h-4 w-4" />
            </Link>
          </Button>
          <MatterStatusBadge status={matter?.status ?? 'unknown'} />
        </div>
      </section>
      {matter ? (
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-md border p-3">
            <dt className="text-xs uppercase text-muted-foreground">Type</dt>
            <dd className="mt-1 font-medium">{matter.matterType}</dd>
          </div>
          <div className="rounded-md border p-3">
            <dt className="text-xs uppercase text-muted-foreground">Client</dt>
            <dd className="mt-1 font-medium">{matter.clientId}</dd>
          </div>
        </dl>
      ) : null}
      {matter ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold tracking-normal">Filed emails</h2>
          </div>
          <div className="overflow-hidden rounded-md border">
            {emails.length > 0 ? (
              <ul className="divide-y">
                {emails.map((email) => (
                  <li
                    key={email.filingId}
                    className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_auto]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{email.subject ?? email.emailId}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{email.documentIds.length} documents</span>
                        <span>{email.thread.relatedEmailCount} related</span>
                        {email.warningCodes.map((code) => (
                          <span
                            key={code}
                            className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {code === 'outside_participant'
                              ? 'Outside recipient'
                              : 'Matter mismatch'}
                          </span>
                        ))}
                        {email.privilegeTagSuggestion ? (
                          <span className="inline-flex items-center gap-1 rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-sky-800">
                            <ShieldCheck className="h-3 w-3" />
                            {email.privilegeTagSuggestion.tag === 'attorney_client_privilege'
                              ? 'Privilege suggested'
                              : 'Confidential suggested'}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <time className="text-xs text-muted-foreground">
                      {new Date(email.filedAt).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-sm text-muted-foreground">No filed emails</p>
            )}
          </div>
        </section>
      ) : null}
    </main>
  );
}
