/**
 * Phase 4A-1 — lightweight, dependency-free validation for the new workflow
 * node types (`input.text`, `condition`, `setVariable`). Phase 1 of the AI Agent
 * node (`action.ai_agent`) is validated here too.
 *
 * This deliberately does NOT validate the whole `definitionJson` shape. Full
 * schema validation of the graph is out of scope for 4A-1; only the config of
 * the newer node types is checked, on save, on both client and server.
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
  'sheets',
  'ai',
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

/** Phase 1 AI providers. OpenAI lands in Phase 2. */
export const AI_PROVIDERS = ['deepseek', 'groq', 'mock'] as const;
export const AI_MAX_TOKENS_LIMIT = 8192;
export const AI_MAX_HISTORY_LIMIT = 50;

/** Phase 2 AI button/department slots (send_buttons / handover). */
export const AI_MAX_BUTTONS = 3;
export const AI_BUTTON_ID_RE = /^[a-zA-Z0-9_]{1,20}$/;

/** Phase 2.5 AI list rows (send_list). WhatsApp caps these at 10 rows. */
export const AI_MAX_LIST_ROWS = 10;
export const AI_LIST_ROW_ID_MAX = 24;
export const AI_LIST_ROW_TITLE_MAX = 24;
export const AI_LIST_ROW_DESCRIPTION_MAX = 72;

/** Phase 2 forced tool-choice values (config.forceToolChoice). */
export const AI_FORCE_TOOL_CHOICES = ['auto', 'send_buttons', 'handover'] as const;

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
  const edges: any[] = Array.isArray(definitionJson?.edges) ? definitionJson.edges : [];

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

    if (type === 'action.ai_agent') {
      const provider = typeof config.provider === 'string' && config.provider ? config.provider : 'deepseek';

      if (!(AI_PROVIDERS as readonly string[]).includes(provider)) {
        addError(nodeId, `"${label}" (AI Agent): choose a valid provider.`);
      }

      const model = typeof config.model === 'string' ? config.model.trim() : '';
      if (!model) {
        addWarning(nodeId, `"${label}" (AI Agent): no model set; the provider default will be used.`);
      }

      if (config.temperature !== undefined && config.temperature !== null && config.temperature !== '') {
        const temperature = Number(config.temperature);
        if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
          addError(nodeId, `"${label}" (AI Agent): temperature must be a number between 0 and 2.`);
        }
      }

      if (config.maxTokens !== undefined && config.maxTokens !== null && config.maxTokens !== '') {
        const maxTokens = Number(config.maxTokens);
        if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > AI_MAX_TOKENS_LIMIT) {
          addError(
            nodeId,
            `"${label}" (AI Agent): max tokens must be a whole number between 1 and ${AI_MAX_TOKENS_LIMIT}.`
          );
        }
      }

      if (config.historyLimit !== undefined && config.historyLimit !== null && config.historyLimit !== '') {
        const historyLimit = Number(config.historyLimit);
        if (!Number.isInteger(historyLimit) || historyLimit < 1 || historyLimit > AI_MAX_HISTORY_LIMIT) {
          addError(
            nodeId,
            `"${label}" (AI Agent): history limit must be a whole number between 1 and ${AI_MAX_HISTORY_LIMIT}.`
          );
        }
      }

      const responseVariable =
        typeof config.responseVariable === 'string' ? config.responseVariable.trim() : '';
      if (responseVariable) {
        if (!VARIABLE_NAME_RE.test(responseVariable)) {
          addError(
            nodeId,
            `"${label}" (AI Agent): response variable "${responseVariable}" is invalid. Use letters, numbers and underscores only, and do not start with a digit.`
          );
        } else if (RESERVED_CONTEXT_KEYS.includes(responseVariable)) {
          addError(
            nodeId,
            `"${label}" (AI Agent): "${responseVariable}" is a reserved internal variable and cannot be overwritten.`
          );
        } else {
          const writers = variableWriters.get(responseVariable) || [];
          writers.push(nodeId);
          variableWriters.set(responseVariable, writers);
        }
      }

      const systemPrompt = typeof config.systemPrompt === 'string' ? config.systemPrompt.trim() : '';
      if (!systemPrompt) {
        addWarning(
          nodeId,
          `"${label}" (AI Agent): system prompt is empty; the AI will improvise its business instructions.`
        );
      }

      // Phase 2: forced tool choice must be a known value.
      const forceToolChoice =
        typeof config.forceToolChoice === 'string' && config.forceToolChoice
          ? config.forceToolChoice
          : 'auto';
      if (!(AI_FORCE_TOOL_CHOICES as readonly string[]).includes(forceToolChoice)) {
        addError(
          nodeId,
          `"${label}" (AI Agent): tool choice must be one of auto, send_buttons, handover.`
        );
      } else if (
        forceToolChoice === 'send_buttons' &&
        !(Array.isArray(config.buttons) && config.buttons.length > 0)
      ) {
        addWarning(
          nodeId,
          `"${label}" (AI Agent): tool choice forces send_buttons, but no buttons are configured.`
        );
      } else if (
        forceToolChoice === 'handover' &&
        !(Array.isArray(config.handoverDepartments) && config.handoverDepartments.length > 0)
      ) {
        addWarning(
          nodeId,
          `"${label}" (AI Agent): tool choice forces handover, but no handover departments are configured.`
        );
      }

      // Phase 2: declared button slots (send_buttons).
      const buttons = Array.isArray(config.buttons) ? config.buttons : [];
      if (buttons.length > AI_MAX_BUTTONS) {
        addError(
          nodeId,
          `"${label}" (AI Agent): at most ${AI_MAX_BUTTONS} buttons may be declared.`
        );
      }

      const buttonIds = new Set<string>();
      for (const button of buttons) {
        const buttonId = typeof button?.id === 'string' ? button.id.trim() : '';
        const buttonTitle = typeof button?.title === 'string' ? button.title.trim() : '';

        if (!buttonId) {
          addError(nodeId, `"${label}" (AI Agent): every button needs an id.`);
        } else if (!AI_BUTTON_ID_RE.test(buttonId)) {
          addError(
            nodeId,
            `"${label}" (AI Agent): button id "${buttonId}" is invalid. Use 1-20 letters, numbers or underscores.`
          );
        } else if (buttonIds.has(buttonId)) {
          addError(nodeId, `"${label}" (AI Agent): duplicate button id "${buttonId}".`);
        } else {
          buttonIds.add(buttonId);
        }

        if (!buttonTitle) {
          addError(nodeId, `"${label}" (AI Agent): button id "${buttonId}" is missing a title.`);
        } else if (buttonTitle.length > 20) {
          addError(
            nodeId,
            `"${label}" (AI Agent): button title "${buttonTitle}" is longer than 20 characters.`
          );
        }
      }

      // Phase 2: declared handover departments.
      const departments = Array.isArray(config.handoverDepartments) ? config.handoverDepartments : [];
      const departmentIds = new Set<string>();
      for (const department of departments) {
        const departmentId = typeof department?.id === 'string' ? department.id.trim() : '';
        const departmentTitle = typeof department?.title === 'string' ? department.title.trim() : '';

        if (!departmentId) {
          addError(nodeId, `"${label}" (AI Agent): every handover department needs an id.`);
        } else if (departmentIds.has(departmentId)) {
          addError(nodeId, `"${label}" (AI Agent): duplicate department id "${departmentId}".`);
        } else {
          departmentIds.add(departmentId);
        }

        if (!departmentTitle) {
          addError(nodeId, `"${label}" (AI Agent): department id "${departmentId}" is missing a title.`);
        }
      }

      // Phase 2.5: AI button handles are DECORATIVE — a tap is consumed by the AI
      // node itself (resolveButtonRoute → { kind: 'ai' }), so an edge drawn from a
      // per-button handle is ignored. We therefore report an info warning rather
      // than an "unconnected button" problem (which used to mislead owners into
      // wiring a path that made the click skip the AI).
      if (buttons.length > 0) {
        addWarning(
          nodeId,
          `"${label}" (AI Agent): button handles are decorative — a tap returns to this AI node as the visitor's next message.`
        );
      }

      // Phase 2.5: declared list rows (send_list), offered when the AI has 4–10 options.
      const listRows = Array.isArray(config.listRows) ? config.listRows : [];
      if (listRows.length > AI_MAX_LIST_ROWS) {
        addError(
          nodeId,
          `"${label}" (AI Agent): at most ${AI_MAX_LIST_ROWS} list rows may be declared.`
        );
      } else if (listRows.length > 0 && listRows.length < 4) {
        addWarning(
          nodeId,
          `"${label}" (AI Agent): lists are meant for 4–10 options; with ${listRows.length} row(s) prefer quick reply buttons.`
        );
      }

      const listRowIds = new Set<string>();
      for (const row of listRows) {
        const rowId = typeof row?.id === 'string' ? row.id.trim() : '';
        const rowTitle = typeof row?.title === 'string' ? row.title.trim() : '';
        const rowDescription = typeof row?.description === 'string' ? row.description.trim() : '';

        if (!rowId) {
          addError(nodeId, `"${label}" (AI Agent): every list row needs an id.`);
        } else if (rowId.length > AI_LIST_ROW_ID_MAX) {
          addError(
            nodeId,
            `"${label}" (AI Agent): list row id "${rowId}" is longer than ${AI_LIST_ROW_ID_MAX} characters.`
          );
        } else if (listRowIds.has(rowId)) {
          addError(nodeId, `"${label}" (AI Agent): duplicate list row id "${rowId}".`);
        } else {
          listRowIds.add(rowId);
        }

        if (!rowTitle) {
          addError(nodeId, `"${label}" (AI Agent): list row id "${rowId}" is missing a title.`);
        } else if (rowTitle.length > AI_LIST_ROW_TITLE_MAX) {
          addError(
            nodeId,
            `"${label}" (AI Agent): list row title "${rowTitle}" is longer than ${AI_LIST_ROW_TITLE_MAX} characters.`
          );
        }

        if (rowDescription.length > AI_LIST_ROW_DESCRIPTION_MAX) {
          addError(
            nodeId,
            `"${label}" (AI Agent): list row description for "${rowId}" is longer than ${AI_LIST_ROW_DESCRIPTION_MAX} characters.`
          );
        }
      }
      if (listRows.length > 0) {
        addWarning(
          nodeId,
          `"${label}" (AI Agent): list row handles are decorative — a selection returns to this AI node as the visitor's next message.`
        );
      }

      // Phase 2.5: the AI answers with text on `success`. Wiring that handle into
      // an `input.text` node turns every answer into a re-prompt bridge and hides
      // the reply behind the input's own template.
      const successEdge = edges.find(
        (e: any) => e.source === nodeId && (e.sourceHandle === 'success' || e.sourceHandle === `${nodeId}-success`)
      );
      if (successEdge?.target) {
        const successTarget = nodes.find((n: any) => n?.id === successEdge.target);
        const successType = successTarget?.data?.type || successTarget?.data?.nodeType;
        if (successType === 'input.text') {
          addWarning(
            nodeId,
            `"${label}" (AI Agent): the success handle points to a Text Input node — consider redirecting it to a Message node (or leaving it unconnected) so the AI's answer is sent directly.`
          );
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
