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
import { useI18n, type Language } from '@/lib/i18n';

type PortalState = 'loading' | 'nda_required' | 'ready' | 'blocked';

const portalCopy: Record<
  Language,
  {
    eyebrow: string;
    title: string;
    loading: string;
    blocked: string;
    ndaTitle: string;
    expires: string;
    acceptNda: string;
    documentAccess: string;
    document: string;
    documentReady: string;
    watermark: string;
    watermarkReady: string;
    download: string;
    downloadReady: string;
    qa: string;
    emptyMessages: string;
    question: string;
    answer: string;
    questionPlaceholder: string;
    send: string;
    unknownDate: string;
  }
> = {
  ko: {
    eyebrow: 'AMIC Vault 외부 공유',
    title: '공유 문서',
    loading: '접근 상태를 확인하는 중입니다.',
    blocked: '이 링크로는 더 이상 접근할 수 없습니다.',
    ndaTitle: '비밀유지 약관 확인',
    expires: '만료일',
    acceptNda: '동의하고 열람하기',
    documentAccess: '문서 열람',
    document: '문서',
    documentReady: '열람 가능한 문서가 준비되었습니다.',
    watermark: '워터마크',
    watermarkReady: '워터마크가 적용됩니다.',
    download: '다운로드 준비',
    downloadReady: '다운로드가 준비되었습니다.',
    qa: '질문과 답변',
    emptyMessages: '아직 등록된 질문이 없습니다.',
    question: '질문',
    answer: '답변',
    questionPlaceholder: '자료와 관련된 질문을 입력하세요.',
    send: '질문 보내기',
    unknownDate: '확인 중',
  },
  en: {
    eyebrow: 'AMIC Vault external access',
    title: 'Shared documents',
    loading: 'Checking access status.',
    blocked: 'This link is no longer available.',
    ndaTitle: 'Review confidentiality terms',
    expires: 'Expires',
    acceptNda: 'Accept and view',
    documentAccess: 'Document access',
    document: 'Document',
    documentReady: 'A shared document is ready to view.',
    watermark: 'Watermark',
    watermarkReady: 'Watermarking will be applied.',
    download: 'Prepare download',
    downloadReady: 'Download is ready.',
    qa: 'Q&A',
    emptyMessages: 'No questions yet.',
    question: 'Question',
    answer: 'Answer',
    questionPlaceholder: 'Ask a question about the shared materials.',
    send: 'Send question',
    unknownDate: 'Checking',
  },
};

export function ExternalPortalClient({ token }: { token: string }) {
  const { language } = useI18n();
  const copy = portalCopy[language];
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
    setStatus({
      status: 'ready',
      ndaRequired: false,
      expiresAt: status?.expiresAt ?? new Date().toISOString(),
    });
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
          <p className="text-sm font-medium text-muted-foreground">{copy.eyebrow}</p>
          <h1 className="text-2xl font-semibold tracking-normal">{copy.title}</h1>
        </header>

        {state === 'loading' ? (
          <p className="text-sm text-muted-foreground">{copy.loading}</p>
        ) : null}
        {state === 'blocked' ? <p className="text-sm text-destructive">{copy.blocked}</p> : null}

        {state === 'nda_required' ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                {copy.ndaTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                {copy.expires} {formatDate(status?.expiresAt, copy.unknownDate)}
              </p>
              <Button type="button" onClick={handleAcceptNda}>
                <ShieldCheck className="h-4 w-4" />
                {copy.acceptNda}
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
                  {copy.documentAccess}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <p>
                  <span className="font-medium">{copy.document}</span> {copy.documentReady}
                </p>
                <p>
                  <span className="font-medium">{copy.watermark}</span> {copy.watermarkReady}
                </p>
                <p className="text-muted-foreground">
                  {copy.expires} {formatDate(manifest.expiresAt, copy.unknownDate)}
                </p>
                <Button type="button" onClick={handleDownload}>
                  <Download className="h-4 w-4" />
                  {copy.download}
                </Button>
                {download ? (
                  <p className="rounded-md border bg-muted p-3 text-xs">{copy.downloadReady}</p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  {copy.qa}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex max-h-64 flex-col gap-3 overflow-auto">
                  {messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{copy.emptyMessages}</p>
                  ) : (
                    messages.map((message) => (
                      <div key={message.messageId} className="rounded-md border p-3 text-sm">
                        <p className="font-medium">
                          {message.direction === 'external_question' ? copy.question : copy.answer}
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
                    placeholder={copy.questionPlaceholder}
                  />
                  <Button type="submit" disabled={!question.trim()}>
                    <Send className="h-4 w-4" />
                    {copy.send}
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

function formatDate(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  return new Date(value).toISOString().slice(0, 10);
}
