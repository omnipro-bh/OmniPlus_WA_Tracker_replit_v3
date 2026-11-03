/**
 * Phase 2 AI Agent node — tool definitions.
 *
 * Two tools exist today, both built from node config:
 *   - `send_buttons` — offer a subset of the owner-declared button slots.
 *   - `handover`     — hand the conversation to a declared department.
 *
 * Both are enum-constrained so the model can only name ids the owner declared,
 * and `maxItems: 3` on `send_buttons` mirrors the WhatsApp quick-reply ceiling.
 * The enum constraint is defence-in-depth: the executor still re-validates every
 * returned id at execution time (a model can hallucinate past a schema).
 *
 * Pure functions, no SDK / no I/O — unit-tested directly.
 */

import type { LlmToolDef } from './types';

/** One owner-declared button slot, from `node.data.config.buttons`. */
export interface AiButtonSlot {
  id: string;
  title: string;
}

/** One owner-declared department, from `node.data.config.handoverDepartments`. */
export interface AiDepartmentSlot {
  id: string;
  title: string;
}

/** Tool names, shared between the executor and its tests. */
export const TOOL_SEND_BUTTONS = 'send_buttons';
export const TOOL_HANDOVER = 'handover';

/** WhatsApp quick-reply hard ceiling. */
export const MAX_BUTTONS_PER_MESSAGE = 3;

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
 * Build the tool list for a node. A tool is only offered when the owner
 * declared at least one slot for it — an empty enum would make the model's job
 * impossible and some providers reject an empty `enum`.
 */
export function buildToolList(config: {
  buttons?: AiButtonSlot[];
  handoverDepartments?: AiDepartmentSlot[];
}): LlmToolDef[] {
  const tools: LlmToolDef[] = [];
  const buttons = Array.isArray(config?.buttons) ? config.buttons : [];
  const departments = Array.isArray(config?.handoverDepartments) ? config.handoverDepartments : [];

  if (buttons.length > 0) tools.push(buildSendButtonsTool(buttons));
  if (departments.length > 0) tools.push(buildHandoverTool(departments));

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
