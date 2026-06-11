import type { DocumentMetadataSuggestionDto } from '@amic-vault/shared';

const datePatterns = [
  /(?<year>20\d{2})(?<month>0[1-9]|1[0-2])(?<day>0[1-9]|[12]\d|3[01])/,
  /(?<year>20\d{2})[-.](?<month>0[1-9]|1[0-2])[-.](?<day>0[1-9]|[12]\d|3[01])/,
] as const;

const typeRules = [
  { type: 'contract', patterns: [/contract/i, /agreement/i, /계약/, /계약서/] },
  { type: 'memo', patterns: [/memo/i, /review/i, /메모/, /검토/] },
  { type: 'opinion', patterns: [/opinion/i, /의견서/] },
  { type: 'court_filing', patterns: [/filing/i, /소장/, /준비서면/, /신청서/] },
  { type: 'evidence', patterns: [/evidence/i, /증거/] },
  { type: 'correspondence', patterns: [/email/i, /letter/i, /이메일/, /서신/] },
  { type: 'corporate_record', patterns: [/minutes/i, /board/i, /이사회/, /회의록/] },
  { type: 'financial', patterns: [/finance/i, /financial/i, /재무/, /정산/] },
] as const;

function baseName(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
}

function dateFromFilename(filename: string): string | undefined {
  for (const pattern of datePatterns) {
    const match = pattern.exec(filename);
    if (match?.groups) {
      return `${match.groups.year}-${match.groups.month}-${match.groups.day}`;
    }
  }
  return undefined;
}

function versionFromFilename(filename: string): string | undefined {
  const version = /(?:^|[\s_.(-])(?<version>[vV]\d{1,3})(?:$|[\s_.)-])/.exec(filename);
  if (version?.groups?.version) return version.groups.version.toLowerCase();
  const copyNumber = /\((?<version>\d{1,3})\)/.exec(filename);
  if (copyNumber?.groups?.version) return `copy-${copyNumber.groups.version}`;
  if (filename.includes('최종')) return 'final';
  return undefined;
}

export function parseFilenameMetadata(filename: string): DocumentMetadataSuggestionDto {
  const name = baseName(filename).normalize('NFC');
  const output: DocumentMetadataSuggestionDto = {};
  const typeRule = typeRules.find((rule) => rule.patterns.some((pattern) => pattern.test(name)));
  if (typeRule) output.documentType = typeRule.type;
  const date = dateFromFilename(name);
  if (date) output.date = date;
  const versionLabel = versionFromFilename(name);
  if (versionLabel) output.versionLabel = versionLabel;
  return output;
}
