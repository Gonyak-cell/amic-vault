'use client';

import React, { type FormEvent, useEffect, useState } from 'react';
import { Download, FileText, MessageSquare, Send, ShieldCheck } from 'lucide-react';
import type {
  ExternalAccessManifestDto,
  ExternalAccessStatusResponseDto,
  ExternalDownloadTicketDto,
  ExternalQaMessageDto,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  acceptExternalNda,
  createExternalQuestion,
  getExternalAccessStatus,
  getExternalDownloadTicket,
  getExternalManifest,
  listExternalQa,
} from '@/lib/api/external-portal';

type PortalState = 'loading' | 'nda_required' | 'ready' | 'blocked';

export function ExternalPortalClient({ token }: { token: string }) {
  const [state, setState] = useState<PortalState>('loading');
  const [status, setStatus] = useState<ExternalAccessStatusResponseDto | null>(null);
  const [manifest, setManifest] = useState<ExternalAccessManifestDto | null>(null);
  const [download, setDownload] = useState<ExternalDownloadTicketDto | null>(null);
  const [messages, setMessages] = useState<ExternalQaMessageDto[]>([]);
  const [question, setQuestion] = useState('');

  useEffect(() => {
    let active = true;
    getExternalAccessStatus(token)
      .then(async (result) => {
        if (!active) return;
        setStatus(result);
        if (result.status === 'ready') {
          await loadReady(token, active, setManifest, setMessages);
          setState('ready');
          return;
        }
        setState('nda_required');
      })
      .catch(() => {
        if (active) setState('blocked');
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function handleAcceptNda() {
    await acceptExternalNda(token);
    setStatus({ status: 'ready', ndaRequired: false, expiresAt: status?.expiresAt ?? new Date().toISOString() });
    await loadReady(token, true, setManifest, setMessages);
    setState('ready');
  }

  async function handleDownload() {
    setDownload(await getExternalDownloadTicket(token));
  }

  async function handleQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text) return;
    const created = await createExternalQuestion(token, text);
    setMessages((current) => [...current, created]);
    setQuestion('');
  }

  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
        <header className="flex flex-col gap-2 border-b pb-5">
          <p className="text-sm font-medium text-muted-foreground">AMIC Vault External Portal</p>
          <h1 className="text-2xl font-semibold tracking-normal">Shared Matter Room</h1>
        </header>

        {state === 'loading' ? <p className="text-sm text-muted-foreground">Loading access state</p> : null}
        {state === 'blocked' ? <p className="text-sm text-destructive">Access unavailable</p> : null}

        {state === 'nda_required' ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                NDA Required
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">Expires {formatDate(status?.expiresAt)}</p>
              <Button type="button" onClick={handleAcceptNda}>
                <ShieldCheck className="h-4 w-4" />
                Accept NDA
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {state === 'ready' && manifest ? (
          <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Document Access
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <p>
                  <span className="font-medium">Document</span> {manifest.documentId}
                </p>
                <p>
                  <span className="font-medium">Watermark</span> {manifest.watermarkRef}
                </p>
                <p className="text-muted-foreground">Expires {formatDate(manifest.expiresAt)}</p>
                <Button type="button" onClick={handleDownload}>
                  <Download className="h-4 w-4" />
                  Download Ticket
                </Button>
                {download ? (
                  <p className="break-all rounded-md border bg-muted p-3 text-xs">{download.downloadRef}</p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Q&A
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex max-h-64 flex-col gap-3 overflow-auto">
                  {messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No messages</p>
                  ) : (
                    messages.map((message) => (
                      <div key={message.messageId} className="rounded-md border p-3 text-sm">
                        <p className="font-medium">
                          {message.direction === 'external_question' ? 'Question' : 'Answer'}
                        </p>
                        <p className="mt-1 text-muted-foreground">{message.messageText}</p>
                      </div>
                    ))
                  )}
                </div>
                <form className="flex flex-col gap-3" onSubmit={handleQuestion}>
                  <textarea
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    maxLength={2000}
                  />
                  <Button type="submit" disabled={!question.trim()}>
                    <Send className="h-4 w-4" />
                    Send
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </section>
    </main>
  );
}

async function loadReady(
  token: string,
  active: boolean,
  setManifest: (manifest: ExternalAccessManifestDto) => void,
  setMessages: (messages: ExternalQaMessageDto[]) => void,
) {
  const [manifest, qa] = await Promise.all([getExternalManifest(token), listExternalQa(token)]);
  if (!active) return;
  setManifest(manifest);
  setMessages(qa.messages);
}

function formatDate(value: string | undefined): string {
  if (!value) return 'unknown';
  return new Date(value).toISOString().slice(0, 10);
}
