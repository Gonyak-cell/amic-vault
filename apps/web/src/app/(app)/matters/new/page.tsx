'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  BriefcaseBusiness,
  CheckCircle2,
  Loader2,
  Save,
  X,
} from 'lucide-react';
import {
  matterAccessScopes,
  matterIntakeTemplateAccessScopes,
  matterIntakeTemplateCodes,
  matterTypes,
  type ClientDto,
  type MatterAccessScope,
  type MatterIntakeTemplateCode,
  type MatterType,
  type OrgDirectorySubjectDto,
} from '@amic-vault/shared';
import { OrgSubjectPicker } from '@/components/access/org-subject-picker';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { ApiClientError, createMatter, listClients } from '@/lib/api-client';
import { useI18n, type Language } from '@/lib/i18n';
import { submitCreateMatter, type NewMatterFormState } from './matter-create-contract';

type ClientLoadState = 'loading' | 'ready' | 'empty' | 'error';
type SubmitState = 'idle' | 'submitting' | 'invalid' | 'error';

type NewMatterCopy = {
  title: string;
  description: string;
  back: string;
  formTitle: string;
  formMeta: string;
  client: string;
  clientLoading: string;
  clientEmpty: string;
  intakeTemplate: string;
  accessScope: string;
  appliedTemplate: string;
  appliedAccessScope: string;
  appliedAiPolicy: string;
  appliedLeadOwner: string;
  appliedLeadPolicy: string;
  templatePreview: string;
  matterType: string;
  matterCode: string;
  matterName: string;
  practiceGroup: string;
  leadLawyer: string;
  leadLawyerOptional: string;
  selectedLead: string;
  clearLead: string;
  submit: string;
  submitting: string;
  invalid: string;
  denied: string;
  failed: string;
  clientError: string;
  nextStepTitle: string;
  nextStepDescription: string;
  accessScopeLabels: Record<MatterAccessScope, string>;
  templateLabels: Record<MatterIntakeTemplateCode, string>;
  templateDescriptions: Record<MatterIntakeTemplateCode, string>;
  typeLabels: Record<MatterType, string>;
};

const newMatterCopy: Record<Language, NewMatterCopy> = {
  ko: {
    title: '새 Matter',
    description: '고객, 사건 유형, 담당자를 지정해 Matter를 생성합니다.',
    back: 'Matter 목록',
    formTitle: 'Matter 기본 정보',
    formMeta: 'proposed 상태로 생성',
    client: '고객',
    clientLoading: '고객 목록을 불러오는 중입니다.',
    clientEmpty: '선택할 고객이 없습니다.',
    intakeTemplate: '생성 템플릿',
    accessScope: '접근 범위',
    appliedTemplate: '적용 템플릿',
    appliedAccessScope: '적용 접근 범위',
    appliedAiPolicy: 'AI 정책',
    appliedLeadOwner: '담당 변호사 · owner',
    appliedLeadPolicy: '초기 구성원',
    templatePreview: '템플릿 적용값',
    matterType: '사건 유형',
    matterCode: 'Matter code',
    matterName: 'Matter 이름',
    practiceGroup: 'Practice group',
    leadLawyer: '담당 변호사',
    leadLawyerOptional: '선택하지 않으면 현재 사용자가 담당자로 지정됩니다.',
    selectedLead: '선택된 담당자',
    clearLead: '담당자 선택 해제',
    submit: 'Matter 생성',
    submitting: '생성 중',
    invalid: '필수 항목을 확인해 주세요.',
    denied: 'Matter를 생성할 권한이 없습니다.',
    failed: 'Matter를 생성하지 못했습니다.',
    clientError: '고객 목록을 불러오지 못했습니다.',
    nextStepTitle: '생성 후 상태',
    nextStepDescription: '생성된 Matter는 proposed 상태로 열리고 상세 화면에서 검토를 이어갑니다.',
    accessScopeLabels: {
      firm_open: '펌 전체 열람',
      restricted: '제한 Matter',
    },
    templateLabels: {
      default_open: '기본개방 Matter',
      restricted: '제한 Matter',
    },
    templateDescriptions: {
      default_open: '담당 변호사를 owner로 지정하고 펌 전체 열람 범위로 시작합니다.',
      restricted: '담당 변호사를 owner로 지정하고 구성원 기반 열람 범위로 시작합니다.',
    },
    typeLabels: {
      advisory: '자문',
      arbitration: '중재',
      compliance: '컴플라이언스',
      contract: '계약',
      finance: '금융',
      investigation: '조사',
      ip: '지식재산',
      litigation: '송무',
      ma: 'M&A',
      other: '기타',
    },
  },
  en: {
    title: 'New matter',
    description: 'Create a matter with a client, matter type, and lead lawyer.',
    back: 'Matter list',
    formTitle: 'Matter basics',
    formMeta: 'Created as proposed',
    client: 'Client',
    clientLoading: 'Loading clients.',
    clientEmpty: 'No clients available.',
    intakeTemplate: 'Intake template',
    accessScope: 'Access scope',
    appliedTemplate: 'Applied template',
    appliedAccessScope: 'Applied access scope',
    appliedAiPolicy: 'AI policy',
    appliedLeadOwner: 'Lead lawyer · owner',
    appliedLeadPolicy: 'Initial member',
    templatePreview: 'Template values',
    matterType: 'Matter type',
    matterCode: 'Matter code',
    matterName: 'Matter name',
    practiceGroup: 'Practice group',
    leadLawyer: 'Lead lawyer',
    leadLawyerOptional: 'If blank, the current user is assigned as lead.',
    selectedLead: 'Selected lead',
    clearLead: 'Clear lead lawyer',
    submit: 'Create matter',
    submitting: 'Creating',
    invalid: 'Check the required fields.',
    denied: 'You do not have permission to create matters.',
    failed: 'Unable to create matter.',
    clientError: 'Unable to load clients.',
    nextStepTitle: 'After creation',
    nextStepDescription: 'The matter opens as proposed and continues in the detail screen.',
    accessScopeLabels: {
      firm_open: 'Firm open',
      restricted: 'Restricted matter',
    },
    templateLabels: {
      default_open: 'Default open matter',
      restricted: 'Restricted matter',
    },
    templateDescriptions: {
      default_open: 'Starts with the lead lawyer as owner and firm-wide read access.',
      restricted: 'Starts with the lead lawyer as owner and member-based read access.',
    },
    typeLabels: {
      advisory: 'Advisory',
      arbitration: 'Arbitration',
      compliance: 'Compliance',
      contract: 'Contract',
      finance: 'Finance',
      investigation: 'Investigation',
      ip: 'IP',
      litigation: 'Litigation',
      ma: 'M&A',
      other: 'Other',
    },
  },
};

const initialForm: NewMatterFormState = {
  accessScope: 'firm_open',
  clientId: '',
  intakeTemplateCode: 'default_open',
  matterCode: '',
  matterName: '',
  matterType: 'advisory',
  practiceGroup: '',
};

function selectedSubjectLabel(subject: OrgDirectorySubjectDto): string {
  return subject.safeLabel || subject.displayName || subject.displayEmail || '';
}

function isFormValidationError(error: unknown): boolean {
  return error instanceof Error && error.name === 'ZodError';
}

function submitErrorMessage(
  error: unknown,
  submitState: SubmitState,
  copy: NewMatterCopy,
): string | null {
  if (submitState === 'invalid') return copy.invalid;
  if (submitState !== 'error') return null;
  if (error instanceof ApiClientError) {
    if (error.code === 'PERMISSION_DENIED' || error.code === 'AUTH_REQUIRED') return copy.denied;
  }
  return copy.failed;
}

export default function NewMatterPage() {
  const { language } = useI18n();
  const copy = newMatterCopy[language];
  const [clients, setClients] = useState<ClientDto[]>([]);
  const [clientLoadState, setClientLoadState] = useState<ClientLoadState>('loading');
  const [form, setForm] = useState<NewMatterFormState>(initialForm);
  const [selectedLead, setSelectedLead] = useState<OrgDirectorySubjectDto | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    setClientLoadState('loading');
    listClients({ pageSize: 100, status: 'active' })
      .then((result) => {
        if (!active) return;
        setClients(result.items);
        setClientLoadState(result.items.length === 0 ? 'empty' : 'ready');
        setForm((current) => ({
          ...current,
          clientId: current.clientId || result.items[0]?.clientId || '',
        }));
      })
      .catch(() => {
        if (!active) return;
        setClients([]);
        setClientLoadState('error');
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setSubmitState('submitting');
    try {
      await submitCreateMatter(form, selectedLead, createMatter, (href) =>
        window.location.assign(href),
      );
    } catch (error) {
      setSubmitError(error);
      setSubmitState(isFormValidationError(error) ? 'invalid' : 'error');
      return;
    }
  }

  const error = submitErrorMessage(submitError, submitState, copy);
  const canSubmit = clientLoadState === 'ready' && submitState !== 'submitting';
  const appliedAccessScope = matterIntakeTemplateAccessScopes[form.intakeTemplateCode];

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['문서 보관', 'Matter', copy.title]}
        title={copy.title}
        description={copy.description}
        actions={
          <Button asChild variant="outline">
            <Link href="/matters">
              <ArrowLeft className="h-4 w-4" />
              {copy.back}
            </Link>
          </Button>
        }
      />

      <div className="rounded-md border bg-card px-4 py-3">
        <div className="flex gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{copy.nextStepTitle}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {copy.nextStepDescription}
            </p>
          </div>
        </div>
      </div>

      <SectionCard
        icon={<BriefcaseBusiness className="h-4 w-4" />}
        title={copy.formTitle}
        meta={copy.formMeta}
      >
        <form className="grid gap-5" onSubmit={submit}>
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <label className="grid min-w-0 gap-1.5 text-sm font-medium">
              {copy.client}
              <select
                aria-label={copy.client}
                className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={clientLoadState !== 'ready' || submitState === 'submitting'}
                value={form.clientId}
                onChange={(event) => setForm({ ...form, clientId: event.target.value })}
              >
                {clientLoadState === 'loading' ? (
                  <option value="">{copy.clientLoading}</option>
                ) : null}
                {clientLoadState === 'empty' ? <option value="">{copy.clientEmpty}</option> : null}
                {clients.map((client) => (
                  <option key={client.clientId} value={client.clientId}>
                    {client.displayName || client.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid min-w-0 gap-1.5 text-sm font-medium">
              {copy.matterType}
              <select
                aria-label={copy.matterType}
                className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={submitState === 'submitting'}
                value={form.matterType}
                onChange={(event) =>
                  setForm({ ...form, matterType: event.target.value as MatterType })
                }
              >
                {matterTypes.map((matterType) => (
                  <option key={matterType} value={matterType}>
                    {copy.typeLabels[matterType]}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid min-w-0 gap-1.5 text-sm font-medium">
              {copy.intakeTemplate}
              <select
                aria-label={copy.intakeTemplate}
                className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={submitState === 'submitting'}
                value={form.intakeTemplateCode}
                onChange={(event) => {
                  const intakeTemplateCode = event.target.value as MatterIntakeTemplateCode;
                  setForm({
                    ...form,
                    accessScope: matterIntakeTemplateAccessScopes[intakeTemplateCode],
                    intakeTemplateCode,
                  });
                }}
              >
                {matterIntakeTemplateCodes.map((templateCode) => (
                  <option key={templateCode} value={templateCode}>
                    {copy.templateLabels[templateCode]}
                  </option>
                ))}
              </select>
              <span className="text-xs font-normal leading-5 text-muted-foreground">
                {copy.templateDescriptions[form.intakeTemplateCode]}
              </span>
            </label>

            <label className="grid min-w-0 gap-1.5 text-sm font-medium">
              {copy.accessScope}
              <select
                aria-label={copy.accessScope}
                className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-100"
                disabled
                value={appliedAccessScope}
                onChange={() => undefined}
              >
                {matterAccessScopes.map((accessScope) => (
                  <option key={accessScope} value={accessScope}>
                    {copy.accessScopeLabels[accessScope]}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid min-w-0 gap-1.5 text-sm font-medium">
              {copy.matterCode}
              <Input
                required
                aria-label={copy.matterCode}
                autoComplete="off"
                disabled={submitState === 'submitting'}
                maxLength={120}
                value={form.matterCode}
                onChange={(event) => setForm({ ...form, matterCode: event.target.value })}
              />
            </label>

            <label className="grid min-w-0 gap-1.5 text-sm font-medium">
              {copy.matterName}
              <Input
                required
                aria-label={copy.matterName}
                autoComplete="off"
                disabled={submitState === 'submitting'}
                maxLength={1000}
                value={form.matterName}
                onChange={(event) => setForm({ ...form, matterName: event.target.value })}
              />
            </label>

            <label className="grid min-w-0 gap-1.5 text-sm font-medium md:col-span-2">
              {copy.practiceGroup}
              <Input
                aria-label={copy.practiceGroup}
                autoComplete="off"
                disabled={submitState === 'submitting'}
                maxLength={128}
                value={form.practiceGroup}
                onChange={(event) => setForm({ ...form, practiceGroup: event.target.value })}
              />
            </label>
          </div>

          <section className="grid gap-3 rounded-md border bg-muted/20 p-4">
            <h2 className="text-sm font-medium tracking-normal">{copy.templatePreview}</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">{copy.appliedTemplate}</dt>
                <dd className="mt-1 font-medium text-foreground">
                  {copy.templateLabels[form.intakeTemplateCode]}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{copy.appliedAccessScope}</dt>
                <dd className="mt-1 font-medium text-foreground">
                  {copy.accessScopeLabels[appliedAccessScope]}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{copy.appliedLeadPolicy}</dt>
                <dd className="mt-1 font-medium text-foreground">{copy.appliedLeadOwner}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{copy.appliedAiPolicy}</dt>
                <dd className="mt-1 font-medium text-foreground">
                  AMIC local file organization prep
                </dd>
              </div>
            </dl>
          </section>

          <section className="grid gap-3 rounded-md border bg-muted/20 p-4">
            <div className="space-y-1">
              <h2 className="text-sm font-medium tracking-normal">{copy.leadLawyer}</h2>
              <p className="text-sm leading-6 text-muted-foreground">{copy.leadLawyerOptional}</p>
            </div>
            <OrgSubjectPicker
              onSubjectSelected={setSelectedLead}
              purpose="matter-intake"
              selectedSubject={selectedLead}
              subjectType="user"
            />
            {selectedLead ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                <span className="text-muted-foreground">{copy.selectedLead}</span>
                <span className="font-medium text-foreground">{selectedSubjectLabel(selectedLead)}</span>
                <Button
                  aria-label={copy.clearLead}
                  title={copy.clearLead}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedLead(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </section>

          {clientLoadState === 'error' ? (
            <EmptyState variant="api-error" title={copy.clientError} />
          ) : null}
          {error ? (
            <p className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              {error}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={!canSubmit}>
              {submitState === 'submitting' ? (
                <Loader2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              {submitState === 'submitting' ? copy.submitting : copy.submit}
            </Button>
          </div>
        </form>
      </SectionCard>
    </PageShell>
  );
}
