/**
 * Phase 4A-1 — pure control-flow helpers for workflow nodes.
 *
 * No I/O, no dependencies. Used by the inline workflow engine in
 * server/routes.ts for the `condition`, `setVariable` and `input.text` nodes.
 *
 * Design notes:
 * - `resolveTemplate` / `getNestedValue` live in ./httpExecutor and are reused
 *   here so the new nodes behave exactly like the HTTP node's templating.
 * - Condition comparisons are intentionally string-based for equality and
 *   numeric-coercing for greater/less-than. See evaluateCondition().
 */

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'is_empty'
  | 'is_not_empty'
  | 'exists'
  | 'not_exists';

export const CONDITION_OPERATORS: ConditionOperator[] = [
  'equals',
  'not_equals',
  'greater_than',
  'less_than',
  'is_empty',
  'is_not_empty',
  'exists',
  'not_exists',
];

/** Operators that do not use a comparison value. */
export const VALUELESS_CONDITION_OPERATORS: ConditionOperator[] = [
  'exists',
  'not_exists',
  'is_empty',
  'is_not_empty',
];

/** Hard cap for a single input.text capture (characters). */
export const MAX_CAPTURE_LENGTH = 2000;

/** Soft cap for the whole conversation context (approximate bytes / UTF-16 units). */
export const MAX_CONTEXT_BYTES = 65536;

export function isSupportedConditionOperator(value: unknown): value is ConditionOperator {
  return typeof value === 'string' && (CONDITION_OPERATORS as string[]).includes(value);
}

/**
 * "Empty" means: missing, null, or a whitespace-only string.
 * 0 and false are NOT empty.
 */
export function isEmptyValue(actual: any): boolean {
  if (actual === undefined || actual === null) return true;
  if (typeof actual === 'string') return actual.trim() === '';
  return false;
}

/** Coerce to a finite number, or null when the value is not numeric. */
export function coerceNumber(value: any): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const num = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(num) ? num : null;
}

/**
 * Evaluate a condition.
 *
 * Missing-variable behaviour:
 * - equals          -> false
 * - not_equals      -> true
 * - exists          -> false
 * - not_exists      -> true
 * - is_empty        -> true
 * - is_not_empty    -> false
 * - greater_than    -> false
 * - less_than       -> false
 */
export function evaluateCondition(
  operator: unknown,
  actual: any,
  expected: any
): boolean {
  const exists = actual !== undefined && actual !== null;
  const expectedExists = expected !== undefined && expected !== null;

  switch (operator) {
    case 'equals':
      return exists && expectedExists && String(actual) === String(expected);
    case 'not_equals':
      if (!exists || !expectedExists) return true;
      return String(actual) !== String(expected);
    case 'exists':
      return exists;
    case 'not_exists':
      return !exists;
    case 'is_empty':
      return isEmptyValue(actual);
    case 'is_not_empty':
      return !isEmptyValue(actual);
    case 'greater_than': {
      const left = coerceNumber(actual);
      const right = coerceNumber(expected);
      if (left === null || right === null) return false;
      return left > right;
    }
    case 'less_than': {
      const left = coerceNumber(actual);
      const right = coerceNumber(expected);
      if (left === null || right === null) return false;
      return left < right;
    }
    default:
      // Unknown operator -> fail closed.
      return false;
  }
}

/**
 * Follow the single outgoing edge of a one-output node.
 *
 * ReactFlow writes `sourceHandle: null` for an id-less default handle, so
 * nullish handles are treated as the single edge. If a node was mis-wired with
 * multiple edges, the nullish/"out" edge wins, else the first edge is used.
 */
export function getNextNodeBySingleEdge(nodeId: string, edges: any[] | undefined): string | null {
  const outgoing = (edges || []).filter((edge: any) => edge?.source === nodeId);
  if (outgoing.length === 0) return null;

  const preferred = outgoing.find(
    (edge: any) => !edge.sourceHandle || edge.sourceHandle === 'out'
  );
  const chosen = preferred || outgoing[0];
  return chosen?.target || null;
}

/**
 * Fit a value into the soft context ceiling.
 *
 * Returns the (possibly truncated) value plus whether truncation happened.
 * Never throws and never blocks the caller — truncated writes are preferable
 * to dropping an in-flight conversation.
 */
export function enforceContextCeiling(
  context: Record<string, any>,
  key: string,
  value: string
): { value: string; truncated: boolean; bytes: number } {
  let candidate = value;
  let serialized = JSON.stringify({ ...context, [key]: candidate });

  if (serialized.length <= MAX_CONTEXT_BYTES) {
    return { value: candidate, truncated: false, bytes: serialized.length };
  }

  const overflow = serialized.length - MAX_CONTEXT_BYTES;
  candidate = value.slice(0, Math.max(0, value.length - overflow - 64));
  serialized = JSON.stringify({ ...context, [key]: candidate });

  return { value: candidate, truncated: true, bytes: serialized.length };
}
