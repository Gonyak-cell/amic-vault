import fs from 'node:fs';
import path from 'node:path';
import type { EvaluationCaseInput } from './load-evaluation-cases.ts';

const outputPath = path.resolve('tests/fixtures/evalset-v0/upload-prep-100-cases.json');
const aiPrepArtifactKinds = [
  'document_profile',
  'key_fields',
  'date_facts',
  'people_organizations',
  'keyword_tags',
  'filing_suggestions',
  'source_outline',
  'retrieval_hints',
] as const;
type AiPrepArtifactKind = (typeof aiPrepArtifactKinds)[number];

const queryByArtifactKind: Record<AiPrepArtifactKind, string> = {
  document_profile: '업로드 문서의 중립적인 파일 프로필을 정리하라',
  key_fields: '업로드 문서에서 파일 정리에 필요한 주요 필드만 정리하라',
  date_facts: '업로드 문서의 날짜 단서를 파일 정리용으로만 정리하라',
  people_organizations: '업로드 문서의 사람과 조직 단서를 파일 정리용으로만 정리하라',
  keyword_tags: '업로드 문서의 검색 태그 후보를 중립적으로 정리하라',
  filing_suggestions: '업로드 문서의 보관 위치 후보를 중립적으로 제안하라',
  source_outline: '업로드 문서의 출처 개요를 중립적으로 정리하라',
  retrieval_hints: '업로드 문서의 향후 검색 힌트를 중립적으로 정리하라',
};

const familyLabels = [
  'contract-intake',
  'invoice-support',
  'board-material',
  'employment-file',
  'lease-record',
  'closing-binder',
  'regulatory-upload',
  'email-attachment',
  'litigation-index',
  'diligence-record',
] as const;

const cases: EvaluationCaseInput[] = Array.from({ length: 100 }, (_, index) => {
  const caseNumber = index + 1;
  const padded = String(caseNumber).padStart(4, '0');
  const artifactKind = aiPrepArtifactKinds[index % aiPrepArtifactKinds.length]!;
  const family = familyLabels[index % familyLabels.length]!;
  const sourceDocRef = `doc:synthetic-upload-prep-${padded}`;
  return {
    caseNo: `EV-PREP-${padded}`,
    sourceDocRef,
    caseType: `upload_prep_${artifactKind}`,
    queryText: `${queryByArtifactKind[artifactKind]} (${family} synthetic ${padded})`,
    expectedRefs: [sourceDocRef],
    deidentified: true,
    notes: `synthetic deidentified upload-prep ${artifactKind} case; no client, person, phone, email, account, or raw document text`,
  };
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(cases, null, 2)}\n`, 'utf8');
console.log(`generated ${cases.length} upload-prep eval cases at ${outputPath}`);
