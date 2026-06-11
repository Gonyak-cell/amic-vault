export const releaseOrder = new Map([
  ['R0', 0],
  ['R1', 1],
  ['R2', 2],
  ['R3', 3],
  ['R4', 4],
  ['R5', 5],
  ['R6', 6],
  ['R7', 7],
  ['R8', 8],
  ['R9', 9],
  ['R10', 10],
  ['R11', 11],
  ['R12', 12],
  ['R13', 13],
  ['R14', 14],
]);

export const requiredFields = [
  'work_id',
  'title',
  'release',
  'module',
  'risk',
  'size',
  'depends_on',
  'files',
  'verification',
];

export function releaseRank(release) {
  const rank = releaseOrder.get(release);
  if (rank === undefined) {
    throw new Error(`unknown release ${release}`);
  }
  return rank;
}

export function violatesReleaseBan(row) {
  const release = releaseRank(row.release);
  const id = row.work_id;
  const module = row.module;
  const title = row.title.toLowerCase();
  const text = `${id} ${module} ${row.title}`.toLowerCase();

  if (module.startsWith('AI-') && id !== 'AI-AIPOLI-SCHEMAONLY-TUW-001' && release < 6) {
    return 'AI feature TUW before R6';
  }

  if (/(external|vdr|secure[- ]?link|external portal)/i.test(text) && release < 11) {
    return 'external sharing or VDR before R11';
  }

  if (/(neo4j|graphsync|graph sync|graph database)/i.test(text) && release < 7) {
    return 'graph database or GraphSync before R7';
  }

  if (/(^|[^a-z])(vector|semantic|embedding|pgvector|similarity|hybrid score)([^a-z]|$)|의미검색|벡터/i.test(text) && release < 6) {
    return 'vector or semantic search before R6';
  }

  const isDeletionProhibition = /(soft delete|금지|없음|부재|차단)/i.test(title);
  if (!isDeletionProhibition && /(hard delete|secure delete|destruction certificate|폐기)/i.test(title) && release < 12) {
    return 'hard delete or disposal before R12';
  }

  return null;
}
