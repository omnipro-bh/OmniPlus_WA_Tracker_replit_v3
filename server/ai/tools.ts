/**
 * Phase 2 AI Agent node — tool definitions.
 *
 * Tools built from node config:
 *   - `send_buttons` — offer a subset of the owner-declared button slots (≤ 3).
 *   - `send_list`    — offer a subset of the owner-declared list rows (≤ 10).
 *   - `handover`     — hand the conversation to a declared department.
 *   - `lookup_sheet` — (Phase 4) read rows from a Google Sheet tab.
 *
 * All are enum-constrained so the model can only name ids the owner declared,
 * and the `maxItems` caps mirror the WhatsApp ceilings (3 quick replies, 10 list
 * rows). The enum constraint is defence-in-depth: the executor still re-validates
 * every returned id at execution time (a model can hallucinate past a schema).
 *
 * `send_buttons` and `send_list` are the same affordance at two sizes: the AI
 * presents options and the tap comes back to the AI as the next user turn.
 *
 * `lookup_sheet` is a NON-terminal tool: the executor feeds its rows back to the
 * model so it can continue answering (or call the tool again for the next step).
 *
 * Pure functions, no SDK / no I/O — unit-tested directly.
 */

import type { LlmToolDef } from './types';

/** One owner-declared button slot, from `node.data.config.buttons`. */
export interface AiButtonSlot {
  id: string;
  title: string;
}

/** One owner-declared list row, from `node.data.config.listRows`. */
export interface AiListRowSlot {
  id: string;
  title: string;
  description?: string;
}

/** One owner-declared department, from `node.data.config.handoverDepartments`. */
export interface AiDepartmentSlot {
  id: string;
  title: string;
}

/** Tool names, shared between the executor and its tests. */
export const TOOL_SEND_BUTTONS = 'send_buttons';
export const TOOL_SEND_LIST = 'send_list';
export const TOOL_HANDOVER = 'handover';
export const TOOL_LOOKUP_SHEET = 'lookup_sheet';

/** WhatsApp quick-reply hard ceiling. */
export const MAX_BUTTONS_PER_MESSAGE = 3;

/** WhatsApp list hard ceiling. */
export const MAX_LIST_ROWS_PER_MESSAGE = 10;

/** Max rows a single `lookup_sheet` call returns (keeps the context bounded). */
export const MAX_LOOKUP_ROWS = 20;

/**
 * Build the `send_buttons` tool, enum-constrained to the declared slots.
 * The model returns a subset (up to 3) of `buttons[].id`.
 */
export function buildSendButtonsTool(buttons: AiButtonSlot[]): LlmToolDef {
  const slots = Array.isArray(buttons) ? buttons : [];
  const enumIds = slots.map((b) => b.id).filter(Boolean);

  return {
    type: 'function',
    function: {
      name: TOOL_SEND_BUTTONS,
      description:
        'Show the customer one or more quick-reply buttons and wait for their choice. Only use ids from the provided list.',
      parameters: {
        type: 'object',
        properties: {
          buttons: {
            type: 'array',
            maxItems: MAX_BUTTONS_PER_MESSAGE,
            description: 'The button ids to show (1 to 3).',
            items: {
              type: 'string',
              enum: enumIds,
            },
          },
        },
        required: ['buttons'],
      },
    },
  };
}

/**
 * Build the `send_list` tool, enum-constrained to the declared rows.
 * The model returns a subset (up to 10) of `listRows[].id`.
 */
export function buildSendListTool(rows: AiListRowSlot[]): LlmToolDef {
  const slots = Array.isArray(rows) ? rows : [];
  const enumIds = slots.map((r) => r.id).filter(Boolean);

  return {
    type: 'function',
    function: {
      name: TOOL_SEND_LIST,
      description:
        'Show the customer a list of options to pick from and wait for their choice. Prefer this over send_buttons when there are more than 3 options. Only use ids from the provided list.',
      parameters: {
        type: 'object',
        properties: {
          rows: {
            type: 'array',
            maxItems: MAX_LIST_ROWS_PER_MESSAGE,
            description: 'The list row ids to show (1 to 10).',
            items: {
              type: 'string',
              enum: enumIds,
            },
          },
        },
        required: ['rows'],
      },
    },
  };
}

/**
 * Build the `handover` tool, enum-constrained to the declared departments.
 * `reason` is free text so the owner can see why the customer was escalated.
 */
export function buildHandoverTool(departments: AiDepartmentSlot[]): LlmToolDef {
  const slots = Array.isArray(departments) ? departments : [];
  const enumIds = slots.map((d) => d.id).filter(Boolean);

  return {
    type: 'function',
    function: {
      name: TOOL_HANDOVER,
      description:
        'Hand the conversation to a human team (e.g. sales or support). Use when the customer asks for a person or the answer is unavailable.',
      parameters: {
        type: 'object',
        properties: {
          department: {
            type: 'string',
            enum: enumIds,
            description: 'The department to escalate to.',
          },
          reason: {
            type: 'string',
            description: 'Why the customer needs a human.',
          },
        },
        required: ['department'],
      },
    },
  };
}

/**
 * Build the `lookup_sheet` tool, enum-constrained to the declared tab names.
 * `filter_column` / `filter_value` / `limit` are optional so the model can also
 * read a whole tab.
 */
export function buildLookupSheetTool(tabs: string[]): LlmToolDef {
  const names = Array.isArray(tabs) ? tabs.map((t) => String(t).trim()).filter(Boolean) : [];

  return {
    type: 'function',
    function: {
      name: TOOL_LOOKUP_SHEET,
      description:
        'Read rows from a Google Sheet tab. Use it to look up an intent, an answer, or the workflow steps for an intent. Returns up to 20 rows matching an optional filter.',
      parameters: {
        type: 'object',
        properties: {
          tab: {
            type: 'string',
            enum: names,
            description: 'The tab to read.',
          },
          filter_column: {
            type: 'string',
            description: 'Column name to filter on (matches the sheet header row, e.g. "keywords" or "intent_id").',
          },
          filter_value: {
            type: 'string',
            description: 'Value to match in filter_column.',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: MAX_LOOKUP_ROWS,
            description: `Max rows to return (default ${MAX_LOOKUP_ROWS}).`,
          },
        },
        required: ['tab'],
      },
    },
  };
}

/**
 * Build the tool list for a node. A tool is only offered when the owner
 * declared at least one slot for it — an empty enum would make the model's job
 * impossible and some providers reject an empty `enum`.
 */
export function buildToolList(config: {
  buttons?: AiButtonSlot[];
  listRows?: AiListRowSlot[];
  handoverDepartments?: AiDepartmentSlot[];
  sheetTabs?: string[];
}): LlmToolDef[] {
  const tools: LlmToolDef[] = [];
  const buttons = Array.isArray(config?.buttons) ? config.buttons : [];
  const listRows = Array.isArray(config?.listRows) ? config.listRows : [];
  const departments = Array.isArray(config?.handoverDepartments) ? config.handoverDepartments : [];
  const sheetTabs = Array.isArray(config?.sheetTabs) ? config.sheetTabs : [];

  if (buttons.length > 0) tools.push(buildSendButtonsTool(buttons));
  if (listRows.length > 0) tools.push(buildSendListTool(listRows));
  if (departments.length > 0) tools.push(buildHandoverTool(departments));
  if (sheetTabs.length > 0) tools.push(buildLookupSheetTool(sheetTabs));

  return tools;
}

/** Thrown when a model's tool arguments fail shape validation. */
export class ToolArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolArgumentError';
  }
}

/**
 * Validate `send_buttons` arguments: an array of 1–3 string ids. The declared-id
 * check lives in the executor, which owns the node config.
 */
export function parseSendButtonsArgs(args: Record<string, any>): string[] {
  const raw = args?.buttons;
  if (!Array.isArray(raw)) {
    throw new ToolArgumentError('send_buttons: "buttons" must be an array of button ids.');
  }
  const ids = raw.map((id) => String(id ?? '').trim()).filter(Boolean);
  if (ids.length === 0) {
    throw new ToolArgumentError('send_buttons: no buttons selected.');
  }
  if (ids.length > MAX_BUTTONS_PER_MESSAGE) {
    throw new ToolArgumentError(`send_buttons: at most ${MAX_BUTTONS_PER_MESSAGE} buttons may be sent.`);
  }
  return ids;
}

/**
 * Validate `send_list` arguments: an array of 1–10 string row ids. The declared-id
 * check lives in the executor, which owns the node config.
 */
export function parseSendListArgs(args: Record<string, any>): string[] {
  const raw = args?.rows;
  if (!Array.isArray(raw)) {
    throw new ToolArgumentError('send_list: "rows" must be an array of row ids.');
  }
  const ids = raw.map((id) => String(id ?? '').trim()).filter(Boolean);
  if (ids.length === 0) {
    throw new ToolArgumentError('send_list: no rows selected.');
  }
  if (ids.length > MAX_LIST_ROWS_PER_MESSAGE) {
    throw new ToolArgumentError(
      `send_list: at most ${MAX_LIST_ROWS_PER_MESSAGE} rows may be sent.`
    );
  }
  return ids;
}

/**
 * Validate `handover` arguments: a non-empty department id (optional reason).
 * The declared-department check lives in the executor.
 */
export function parseHandoverArgs(args: Record<string, any>): { department: string; reason: string } {
  const department = typeof args?.department === 'string' ? args.department.trim() : '';
  if (!department) {
    throw new ToolArgumentError('handover: "department" is required.');
  }
  const reason = typeof args?.reason === 'string' ? args.reason.trim() : '';
  return { department, reason };
}

/** Parsed `lookup_sheet` arguments. */
export interface LookupSheetArgs {
  tab: string;
  filterColumn?: string;
  filterValue?: string;
  limit?: number;
}

/**
 * Validate `lookup_sheet` arguments: a non-empty tab plus optional filter and a
 * 1–20 row limit. The declared-tab check lives in the executor, which owns the
 * node config.
 */
export function parseLookupSheetArgs(args: Record<string, any>): LookupSheetArgs {
  const tab = typeof args?.tab === 'string' ? args.tab.trim() : '';
  if (!tab) {
    throw new ToolArgumentError('lookup_sheet: "tab" is required.');
  }

  const filterColumn =
    typeof args?.filter_column === 'string' ? args.filter_column.trim() : undefined;
  const filterValue =
    typeof args?.filter_value === 'string' ? args.filter_value.trim() : undefined;

  let limit: number | undefined;
  if (args?.limit !== undefined && args?.limit !== null && args?.limit !== '') {
    limit = Number(args.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LOOKUP_ROWS) {
      throw new ToolArgumentError(
        `lookup_sheet: "limit" must be a whole number between 1 and ${MAX_LOOKUP_ROWS}.`
      );
    }
  }

  return { tab, filterColumn, filterValue, limit };
}
