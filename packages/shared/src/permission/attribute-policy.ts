export const permissionAttributeKeys = [
  'actor.role',
  'actor.practice_group',
  'matter.status',
  'matter.practice_group',
  'matter.client_id',
  'document.status',
  'document.document_type',
  'document.confidentiality_level',
  'document.privilege_status',
] as const;

export type PermissionAttributeKey = (typeof permissionAttributeKeys)[number];

export const permissionConditionOperators = [
  'eq',
  'not_eq',
  'in',
  'not_in',
  'exists',
] as const;

export type PermissionConditionOperator = (typeof permissionConditionOperators)[number];

export type PermissionAttributeValue = string | boolean | null;

export interface PermissionAttributeContext {
  actor: {
    role: string;
    practiceGroup?: string | null;
  };
  matter?: {
    status?: string | null;
    practiceGroup?: string | null;
    clientId?: string | null;
  };
  document?: {
    status?: string | null;
    documentType?: string | null;
    confidentialityLevel?: string | null;
    privilegeStatus?: string | null;
  };
}

export type PermissionConditionEvaluationOutcome = 'match' | 'no_match' | 'invalid';

export interface PermissionConditionEvaluation {
  outcome: PermissionConditionEvaluationOutcome;
  reason?: string;
}

type ConditionResult =
  | { valid: true; matched: boolean }
  | { valid: false; reason: string };

const maxDepth = 5;
const maxClauses = 20;

function invalid(reason: string): ConditionResult {
  return { valid: false, reason };
}

function valid(matched: boolean): ConditionResult {
  return { valid: true, matched };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAttributeKey(value: unknown): value is PermissionAttributeKey {
  return typeof value === 'string' && permissionAttributeKeys.includes(value as PermissionAttributeKey);
}

function isOperator(value: unknown): value is PermissionConditionOperator {
  return (
    typeof value === 'string' &&
    permissionConditionOperators.includes(value as PermissionConditionOperator)
  );
}

function isScalar(value: unknown): value is PermissionAttributeValue {
  return value === null || typeof value === 'string' || typeof value === 'boolean';
}

function scalarArray(value: unknown): PermissionAttributeValue[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxClauses) return null;
  return value.every(isScalar) ? value : null;
}

function hasOnlyKeys(node: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(node).every((key) => allowed.includes(key));
}

function resolveAttribute(
  key: PermissionAttributeKey,
  context: PermissionAttributeContext,
): PermissionAttributeValue | undefined {
  switch (key) {
    case 'actor.role':
      return context.actor.role;
    case 'actor.practice_group':
      return context.actor.practiceGroup ?? null;
    case 'matter.status':
      return context.matter?.status ?? null;
    case 'matter.practice_group':
      return context.matter?.practiceGroup ?? null;
    case 'matter.client_id':
      return context.matter?.clientId ?? null;
    case 'document.status':
      return context.document?.status ?? null;
    case 'document.document_type':
      return context.document?.documentType ?? null;
    case 'document.confidentiality_level':
      return context.document?.confidentialityLevel ?? null;
    case 'document.privilege_status':
      return context.document?.privilegeStatus ?? null;
  }
}

function compareLeaf(
  operator: PermissionConditionOperator,
  actual: PermissionAttributeValue | undefined,
  expected: unknown,
  valuePresent: boolean,
): ConditionResult {
  if (operator === 'exists') {
    if (valuePresent) return invalid('exists_value_not_allowed');
    return valid(actual !== undefined && actual !== null && actual !== '');
  }

  if (operator === 'in' || operator === 'not_in') {
    const values = scalarArray(expected);
    if (!values) return invalid('invalid_array_value');
    const matched = actual !== undefined && values.includes(actual);
    return valid(operator === 'in' ? matched : !matched);
  }

  if (!valuePresent || !isScalar(expected)) return invalid('invalid_scalar_value');
  const matched = actual !== undefined && actual === expected;
  return valid(operator === 'eq' ? matched : !matched);
}

function evaluateLeaf(
  node: Record<string, unknown>,
  context: PermissionAttributeContext,
): ConditionResult {
  if (!hasOnlyKeys(node, ['attribute', 'operator', 'value'])) {
    return invalid('unsupported_leaf_key');
  }
  if (!isAttributeKey(node.attribute)) return invalid('unknown_attribute');
  if (!isOperator(node.operator)) return invalid('unsupported_operator');

  return compareLeaf(
    node.operator,
    resolveAttribute(node.attribute, context),
    node.value,
    Object.prototype.hasOwnProperty.call(node, 'value'),
  );
}

function evaluateNode(
  node: unknown,
  context: PermissionAttributeContext,
  depth: number,
): ConditionResult {
  if (depth > maxDepth) return invalid('max_depth_exceeded');
  if (!isRecord(node)) return invalid('condition_not_object');

  const keys = Object.keys(node);
  if (keys.length === 0) return valid(true);

  if (Object.prototype.hasOwnProperty.call(node, 'all')) {
    if (!hasOnlyKeys(node, ['all'])) return invalid('unsupported_all_key');
    if (!Array.isArray(node.all) || node.all.length === 0 || node.all.length > maxClauses) {
      return invalid('invalid_all_clause');
    }
    for (const child of node.all) {
      const result = evaluateNode(child, context, depth + 1);
      if (!result.valid) return result;
      if (!result.matched) return valid(false);
    }
    return valid(true);
  }

  if (Object.prototype.hasOwnProperty.call(node, 'any')) {
    if (!hasOnlyKeys(node, ['any'])) return invalid('unsupported_any_key');
    if (!Array.isArray(node.any) || node.any.length === 0 || node.any.length > maxClauses) {
      return invalid('invalid_any_clause');
    }
    let matched = false;
    for (const child of node.any) {
      const result = evaluateNode(child, context, depth + 1);
      if (!result.valid) return result;
      matched ||= result.matched;
    }
    return valid(matched);
  }

  if (Object.prototype.hasOwnProperty.call(node, 'not')) {
    if (!hasOnlyKeys(node, ['not'])) return invalid('unsupported_not_key');
    const result = evaluateNode(node.not, context, depth + 1);
    return result.valid ? valid(!result.matched) : result;
  }

  return evaluateLeaf(node, context);
}

export function evaluatePermissionCondition(
  conditionJson: unknown,
  context: PermissionAttributeContext,
): PermissionConditionEvaluation {
  if (conditionJson === null || conditionJson === undefined) return { outcome: 'match' };
  const result = evaluateNode(conditionJson, context, 0);
  if (!result.valid) return { outcome: 'invalid', reason: result.reason };
  return { outcome: result.matched ? 'match' : 'no_match' };
}
