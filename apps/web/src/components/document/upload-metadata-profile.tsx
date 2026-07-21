import * as React from 'react';
import {
  documentConfidentialityLevels,
  documentPrivilegeStatuses,
  documentSources,
  documentVersionRenditionTypes,
  documentVersionSignificances,
  type DocumentConfidentialityLevel,
  type DocumentPrivilegeStatus,
  type DocumentSource,
  type DocumentType,
  type DocumentVersionRenditionType,
  type DocumentVersionSignificance,
  type EnterpriseApprovedDmsTaxonomyDto,
  type UploadDocumentFieldsDto,
} from '@amic-vault/shared';
import { Input } from '@/components/ui/input';
import {
  approvedDocumentTypeOptions,
  approvedSubtypeOptions,
} from '@/lib/dms-taxonomy';

export interface UploadMetadataProfileState {
  aiAllowed: boolean;
  confidentialityLevel: DocumentConfidentialityLevel;
  documentType: DocumentType;
  privilegeStatus: DocumentPrivilegeStatus;
  source: DocumentSource;
  subtype: string;
  versionLabel: string;
  versionSignificance: DocumentVersionSignificance;
  renditionType: DocumentVersionRenditionType;
}

export const defaultUploadMetadataProfile: UploadMetadataProfileState = {
  aiAllowed: true,
  confidentialityLevel: 'standard',
  documentType: 'other',
  privilegeStatus: 'none',
  source: 'internal_work_product',
  subtype: '',
  versionLabel: '',
  versionSignificance: 'internal_draft',
  renditionType: 'clean',
};

export const uploadDocumentTypeLabels = {
  contract: '계약',
  memo: '메모',
  opinion: '의견서',
  court_filing: '소송 제출',
  evidence: '증거',
  email: '이메일',
  correspondence: '서신',
  corporate_record: '회사 기록',
  financial: '재무',
  other: '기타',
} as const satisfies Record<DocumentType, string>;

export const uploadConfidentialityLabels = {
  standard: '일반',
  high: '높음',
  restricted: '제한',
} as const satisfies Record<DocumentConfidentialityLevel, string>;

export const uploadPrivilegeLabels = {
  none: '비특권',
  privileged: '특권',
  work_product: '업무 산출물',
  joint_privilege: '공동 특권',
} as const satisfies Record<DocumentPrivilegeStatus, string>;

export const uploadSourceLabels = {
  client_provided: '고객 제공',
  counterparty_provided: '상대방 제공',
  internal_work_product: '내부 작성',
  public: '공개 자료',
} as const satisfies Record<DocumentSource, string>;

export const uploadVersionSignificanceLabels = {
  internal_draft: '내부초안',
  client_sent: '고객송부본',
  counterparty_sent: '상대방송부본',
  negotiation: '협상본',
  final: '최종본',
  execution_copy: '체결본',
} as const satisfies Record<DocumentVersionSignificance, string>;

export const uploadRenditionTypeLabels = {
  clean: 'Clean',
  markup: 'Markup',
} as const satisfies Record<DocumentVersionRenditionType, string>;

const selectClassName =
  'flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

export function uploadMetadataProfileFields(
  profile: UploadMetadataProfileState,
): UploadDocumentFieldsDto {
  const fields: UploadDocumentFieldsDto = {
    aiAllowed: profile.aiAllowed,
    confidentialityLevel: profile.confidentialityLevel,
    documentType: profile.documentType,
    privilegeStatus: profile.privilegeStatus,
    source: profile.source,
    versionSignificance: profile.versionSignificance,
    renditionType: profile.renditionType,
  };
  const subtype = profile.subtype.trim();
  if (subtype) fields.subtype = subtype;
  const versionLabel = profile.versionLabel.trim();
  if (versionLabel) fields.versionLabel = versionLabel;
  return fields;
}

export function UploadMetadataProfile({
  onChange,
  profile,
  taxonomyCatalog = [],
}: {
  onChange: (profile: UploadMetadataProfileState) => void;
  profile: UploadMetadataProfileState;
  taxonomyCatalog?: EnterpriseApprovedDmsTaxonomyDto[];
}) {
  const typeInputId = React.useId();
  const subtypeInputId = React.useId();
  const subtypeListId = React.useId();
  const confidentialityInputId = React.useId();
  const privilegeInputId = React.useId();
  const sourceInputId = React.useId();
  const versionLabelInputId = React.useId();
  const versionSignificanceInputId = React.useId();
  const renditionInputId = React.useId();
  const prepInputId = React.useId();
  const documentTypeOptions = React.useMemo(
    () => approvedDocumentTypeOptions(uploadDocumentTypeLabels, taxonomyCatalog),
    [taxonomyCatalog],
  );
  const subtypeOptions = React.useMemo(
    () => approvedSubtypeOptions(profile.documentType, taxonomyCatalog),
    [profile.documentType, taxonomyCatalog],
  );

  function update<K extends keyof UploadMetadataProfileState>(
    key: K,
    value: UploadMetadataProfileState[K],
  ) {
    onChange({ ...profile, [key]: value });
  }

  return (
    <fieldset className="rounded-md border bg-background px-3 py-3">
      <legend className="px-1 text-sm font-semibold text-foreground">업로드 분류 프로필</legend>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1.5" htmlFor={typeInputId}>
          <span className="text-sm font-medium text-foreground">문서 유형</span>
          <select
            id={typeInputId}
            className={selectClassName}
            value={profile.documentType}
            onChange={(event) => update('documentType', event.target.value as DocumentType)}
          >
            {documentTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5" htmlFor={subtypeInputId}>
          <span className="text-sm font-medium text-foreground">세부 유형</span>
          <Input
            id={subtypeInputId}
            value={profile.subtype}
            maxLength={128}
            placeholder={subtypeOptions[0] ?? '예: 투자계약, 의견서 초안'}
            list={subtypeOptions.length > 0 ? subtypeListId : undefined}
            onChange={(event) => update('subtype', event.target.value)}
          />
          {subtypeOptions.length > 0 ? (
            <datalist id={subtypeListId}>
              {subtypeOptions.map((subtype) => (
                <option key={subtype} value={subtype} />
              ))}
            </datalist>
          ) : null}
        </label>

        <label className="grid gap-1.5" htmlFor={confidentialityInputId}>
          <span className="text-sm font-medium text-foreground">보안 등급</span>
          <select
            id={confidentialityInputId}
            className={selectClassName}
            value={profile.confidentialityLevel}
            onChange={(event) =>
              update('confidentialityLevel', event.target.value as DocumentConfidentialityLevel)
            }
          >
            {documentConfidentialityLevels.map((level) => (
              <option key={level} value={level}>
                {uploadConfidentialityLabels[level]}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5" htmlFor={sourceInputId}>
          <span className="text-sm font-medium text-foreground">출처</span>
          <select
            id={sourceInputId}
            className={selectClassName}
            value={profile.source}
            onChange={(event) => update('source', event.target.value as DocumentSource)}
          >
            {documentSources.map((source) => (
              <option key={source} value={source}>
                {uploadSourceLabels[source]}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5" htmlFor={privilegeInputId}>
          <span className="text-sm font-medium text-foreground">특권 상태</span>
          <select
            id={privilegeInputId}
            className={selectClassName}
            value={profile.privilegeStatus}
            onChange={(event) =>
              update('privilegeStatus', event.target.value as DocumentPrivilegeStatus)
            }
          >
            {documentPrivilegeStatuses.map((status) => (
              <option key={status} value={status}>
                {uploadPrivilegeLabels[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5" htmlFor={versionLabelInputId}>
          <span className="text-sm font-medium text-foreground">버전 라벨</span>
          <Input
            id={versionLabelInputId}
            value={profile.versionLabel}
            maxLength={80}
            placeholder="v1.0"
            onChange={(event) => update('versionLabel', event.target.value)}
          />
        </label>

        <label className="grid gap-1.5" htmlFor={versionSignificanceInputId}>
          <span className="text-sm font-medium text-foreground">버전 의미</span>
          <select
            id={versionSignificanceInputId}
            className={selectClassName}
            value={profile.versionSignificance}
            onChange={(event) =>
              update('versionSignificance', event.target.value as DocumentVersionSignificance)
            }
          >
            {documentVersionSignificances.map((significance) => (
              <option key={significance} value={significance}>
                {uploadVersionSignificanceLabels[significance]}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5" htmlFor={renditionInputId}>
          <span className="text-sm font-medium text-foreground">렌디션</span>
          <select
            id={renditionInputId}
            className={selectClassName}
            value={profile.renditionType}
            onChange={(event) =>
              update('renditionType', event.target.value as DocumentVersionRenditionType)
            }
          >
            {documentVersionRenditionTypes.map((renditionType) => (
              <option key={renditionType} value={renditionType}>
                {uploadRenditionTypeLabels[renditionType]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 grid gap-2 rounded-md bg-muted/40 p-3 text-sm">
        <label htmlFor={prepInputId} className="flex min-h-8 items-center gap-2 font-medium">
          <input
            id={prepInputId}
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={profile.aiAllowed}
            onChange={(event) => update('aiAllowed', event.currentTarget.checked)}
          />
          파일 정리 준비
        </label>
        <dl className="grid gap-1 text-muted-foreground sm:grid-cols-[7rem_1fr]">
          <dt className="font-medium text-foreground">보존 조치</dt>
          <dd>Matter 및 기록 보존 정책 적용</dd>
        </dl>
      </div>
    </fieldset>
  );
}
