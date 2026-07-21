import type { DdIssueDto, DdRiskDto, NegotiationIssueDto } from '@amic-vault/shared';
import { buildStoredZip } from '../../common/zip-store';

export interface DdReportDocxInput {
  matterLabel: string;
  generatedAt: Date;
  issues: readonly DdIssueDto[];
  risks: readonly DdRiskDto[];
}

export function buildDdReportDocx(input: DdReportDocxInput): Buffer {
  const paragraphs = [
    `DD 보고서 초안 - ${input.matterLabel}`,
    `Generated at: ${input.generatedAt.toISOString()}`,
    `Included issues: ${input.issues.length}`,
    ...input.issues.map((issue) =>
      [
        `Issue ${issue.issueCode}`,
        issue.title,
        `severity=${issue.severity}`,
        `status=${issue.status}`,
        `citations=${issue.citationRefs.join(', ') || 'none'}`,
      ].join(' | '),
    ),
    `Included risks: ${input.risks.length}`,
    ...input.risks.map((risk) =>
      [
        `Risk ${risk.riskCode}`,
        `category=${risk.category}`,
        `severity=${risk.severity}`,
        `likelihood=${risk.likelihood}`,
        `status=${risk.status}`,
        `citations=${risk.citationRefs.join(', ') || 'none'}`,
      ].join(' | '),
    ),
  ];

  return buildDocx(paragraphs);
}

export interface NegotiationIssuesDocxInput {
  matterLabel: string;
  generatedAt: Date;
  issues: readonly NegotiationIssueDto[];
}

export function buildNegotiationIssuesDocx(input: NegotiationIssuesDocxInput): Buffer {
  const paragraphs = [
    `협상쟁점표 - ${input.matterLabel}`,
    `Generated at: ${input.generatedAt.toISOString()}`,
    `Negotiation issues: ${input.issues.length}`,
    ...input.issues.map((issue) =>
      [
        `Issue ${issue.issueId}`,
        `rule=${issue.ruleKey}@${issue.ruleVersion}`,
        `severity=${issue.severity}`,
        `status=${issue.status}`,
        `finding=${issue.findingCode}`,
        `redlineHash=${issue.redlineTextHash}`,
        `citations=${issue.citationRefs.join(', ') || 'none'}`,
      ].join(' | '),
    ),
  ];

  return buildDocx(paragraphs);
}

function buildDocx(paragraphs: readonly string[]): Buffer {
  return buildStoredZip([
    {
      name: '[Content_Types].xml',
      body:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      body:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>',
    },
    {
      name: 'word/document.xml',
      body:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        `<w:body>${paragraphs.map((text) => paragraphXml(text)).join('')}</w:body>` +
        '</w:document>',
    },
  ]);
}

function paragraphXml(text: string): string {
  return `<w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
}
