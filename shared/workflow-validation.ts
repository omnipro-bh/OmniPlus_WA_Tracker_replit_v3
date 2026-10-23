/**
 * Phase 4A-1 — lightweight, dependency-free validation for the new workflow
 * node types (`input.text`, `condition`, `setVariable`).
 *
 * This deliberately does NOT validate the whole `definitionJson` shape. Full
 * schema validation of the graph is out of scope for 4A-1; only the config of
 * the three new node types is checked, on save, on both client and server.
 */

export const VARIABLE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Dot-path into the conversation context. Mirrors how `getNestedValue` in
 * server/workflows/httpExecutor.ts splits paths, including `data[0]` indexes.
 */
export const VARIABLE_PATH_RE =
  /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\])*$/;

/** Internal context keys that workflows must not overwrite. */
export const RESERVED_CONTEXT_KEYS = [
  'http',
  'bookingState',
  'checkBookingsState',
  'captureActive',
  'captureSequenceName',
  'capturedClicks',
  'captureStartNodeId',
  'captureCompleted',
  'lastBookingId',
];

const SUPPORTED_CONDITION_OPERATORS = [
  'equals',
  'not_equals',
  'greater_than',
  'less_than',
  'is_empty',
  'is_not_empty',
  'exists',
  'not_exists',
];

/** Entry nodes that the runtime can actually start from the first-message path. */
const SUPPORTED_ENTRY_TYPES = [
  'message.text',
  'message.media',
  'message.location',
  'quickReply',
  'quickReplyImage',
  'quickReplyVideo',
  'listMessage',
  'buttons',
  'carousel',
  'input.text',
];

export type WorkflowValidationLevel = 'error' | 'warning';

export interface WorkflowValidationIssue {
  nodeId: string;
  level: WorkflowValidationLevel;
  message: string;
}

function nodeTypeOf(node: any): string {
  return node?.data?.type || node?.data?.nodeType || '';
}

function nodeLabelOf(node: any): string {
  return node?.data?.label || node?.id || 'Unnamed node';
}

/**
 * Validate the three Phase 4A-1 node types.
 *
 * Errors block saving. Warnings are surfaced to the owner but allow saving.
 * `entryNodeId` is optional; when provided, unsupported entry node types
 * produce a warning (warn-only by design).
 */
export function validateWorkflowNodeConfigs(
  definitionJson: any,
  entryNodeId?: string | null
): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = [];
  const nodes: any[] = Array.isArray(definitionJson?.nodes) ? definitionJson.nodes : [];

  const addError = (nodeId: string, message: string) =>
    issues.push({ nodeId, level: 'error', message });
  const addWarning = (nodeId: string, message: string) =>
    issues.push({ nodeId, level: 'warning', message });

  // Track variable writers for the duplicate-name warning.
  const variableWriters = new Map<string, string[]>();

  for (const node of nodes) {
    const nodeId = String(node?.id || '');
    const type = nodeTypeOf(node);
    const label = nodeLabelOf(node);
    const config = node?.data?.config || {};

    if (type === 'input.text') {
      const variableName = typeof config.variableName === 'string' ? config.variableName.trim() : '';
      const prompt = typeof config.prompt === 'string' ? config.prompt.trim() : '';

      if (!variableName) {
        addError(nodeId, `"${label}" (Text Input): variable name is required.`);
      } else if (!VARIABLE_NAME_RE.test(variableName)) {
        addError(
          nodeId,
          `"${label}" (Text Input): variable name "${variableName}" is invalid. Use letters, numbers and underscores only, and do not start with a digit.`
        );
      } else {
        if (RESERVED_CONTEXT_KEYS.includes(variableName)) {
          addError(nodeId, `"${label}" (Text Input): "${variableName}" is a reserved internal variable and cannot be overwritten.`);
        }
        const writers = variableWriters.get(variableName) || [];
        writers.push(nodeId);
        variableWriters.set(variableName, writers);
      }

      if (!prompt) {
        addWarning(nodeId, `"${label}" (Text Input): prompt is empty; a generic prompt will be sent.`);
      }

      const min = config.minLength;
      const max = config.maxLength;

      if (min !== undefined && min !== null && min !== '') {
        const minNum = Number(min);
        if (!Number.isInteger(minNum) || minNum < 0 || minNum > 2000) {
          addError(nodeId, `"${label}" (Text Input): minimum length must be a whole number between 0 and 2000.`);
        }
      }

      if (max !== undefined && max !== null && max !== '') {
        const maxNum = Number(max);
        if (!Number.isInteger(maxNum) || maxNum < 1 || maxNum > 2000) {
          addError(nodeId, `"${label}" (Text Input): maximum length must be a whole number between 1 and 2000.`);
        }
        if (min !== undefined && min !== null && min !== '' && Number(min) > maxNum) {
          addError(nodeId, `"${label}" (Text Input): maximum length cannot be smaller than the minimum length.`);
        }
      }

      continue;
    }

    if (type === 'condition') {
      const variable = typeof config.variable === 'string' ? config.variable.trim() : '';
      const operator = config.operator ?? 'equals';

      if (!variable) {
        addError(nodeId, `"${label}" (Condition): variable path is required.`);
      } else if (!VARIABLE_PATH_RE.test(variable)) {
        addError(
          nodeId,
          `"${label}" (Condition): variable path "${variable}" is malformed. Use dot notation such as bookingState.status or http.node_123.data.id.`
        );
      } else {
        const rootKey = variable.split('.')[0].split('[')[0];
        if (RESERVED_CONTEXT_KEYS.includes(rootKey)) {
          addWarning(
            nodeId,
            `"${label}" (Condition): reads internal variable "${rootKey}". Make sure you know how it is shaped.`
          );
        }
      }

      if (!SUPPORTED_CONDITION_OPERATORS.includes(operator)) {
        addError(nodeId, `"${label}" (Condition): choose a valid operator.`);
      }

      continue;
    }

    if (type === 'setVariable') {
      const variable = typeof config.variable === 'string' ? config.variable.trim() : '';

      if (!variable) {
        addError(nodeId, `"${label}" (Set Variable): variable name is required.`);
      } else if (!VARIABLE_NAME_RE.test(variable)) {
        addError(
          nodeId,
          `"${label}" (Set Variable): variable name "${variable}" is invalid. Use letters, numbers and underscores only, and do not start with a digit.`
        );
      } else {
        if (RESERVED_CONTEXT_KEYS.includes(variable)) {
          addError(nodeId, `"${label}" (Set Variable): "${variable}" is a reserved internal variable and cannot be overwritten.`);
        }
        const writers = variableWriters.get(variable) || [];
        writers.push(nodeId);
        variableWriters.set(variable, writers);
      }

      continue;
    }
  }

  // Duplicate variable writers: warning only (last write wins at runtime).
  variableWriters.forEach((writers, variable) => {
    if (writers.length > 1) {
      writers.forEach((nodeId) => {
        addWarning(
          nodeId,
          `Variable "${variable}" is written by ${writers.length} nodes. The last node to run wins.`
        );
      });
    }
  });

  // Entry-node suitability: warn-only, never block.
  if (entryNodeId) {
    const entryNode = nodes.find((node: any) => node?.id === entryNodeId);
    if (!entryNode) {
      addWarning(entryNodeId, `Entry node "${entryNodeId}" was not found in the workflow.`);
    } else {
      const entryType = nodeTypeOf(entryNode);
      if (entryType && !SUPPORTED_ENTRY_TYPES.includes(entryType)) {
        addWarning(
          entryNodeId,
          `"${nodeLabelOf(entryNode)}" (${entryType}) cannot run as an entry node. Use a message or Text Input node as the entry point.`
        );
      }
    }
  }

  return issues;
}
