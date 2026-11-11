/**
 * Shared AI Agent prompt defaults.
 *
 * These strings are shown in the owner-facing node config (as the System Prompt
 * placeholder) and appended automatically by `server/ai/prompt.ts`, so the
 * "don't re-send the menu after a click" rule is present even when the owner
 * never edits the prompt.
 *
 * The runtime guard in `aiAgentExecutor.ts` is the enforcement layer: on a
 * detected option click the option tools are physically removed from the
 * request, so the model cannot loop even if it ignores these instructions.
 */

/**
 * The option-tool rules. Appended to every AI node that declares buttons or
 * list rows.
 */
export const AI_TOOL_RULES = [
  'TOOLS AVAILABLE:',
  '- send_buttons: Present 1–3 options as buttons.',
  '- send_list: Present 4–10 options as a list.',
  '- handover: Hand off to a human agent.',
  '',
  'RULES:',
  '1. Use send_buttons or send_list ONLY when asking the user to choose from options.',
  '2. If the user CLICKS a button (their message is a button title like "See pricing"), do NOT send buttons again. Answer their question with TEXT.',
  '3. Never send buttons for options the user has already chosen.',
].join('\n');

/** Default content offered in the node config's System Prompt field. */
export const AI_DEFAULT_SYSTEM_PROMPT = ['You are a helpful assistant.', '', AI_TOOL_RULES].join(
  '\n'
);

/**
 * AI Studio — owner-level config, persisted in the `settings` key/value table.
 * Scoped per workflow (Increment F): each workflow has its own Instructions +
 * Persona, keyed by `workflowId`.
 */
export function aiStudioInstructionsKey(workflowId: number | string): string {
  return `ai_studio_instructions_wf_${workflowId}`;
}

export function aiStudioPersonaKey(workflowId: number | string): string {
  return `ai_studio_persona_wf_${workflowId}`;
}

export function aiStudioObjectivesKey(workflowId: number | string): string {
  return `ai_studio_objectives_wf_${workflowId}`;
}

/** Tab of the owner's spreadsheet where captured leads are appended. */
export function aiLeadsTabKey(workflowId: number | string): string {
  return `ai_leads_tab_wf_${workflowId}`;
}

/** Column list of the lead tab (comma separated). */
export function aiLeadsColumnsKey(workflowId: number | string): string {
  return `ai_leads_columns_wf_${workflowId}`;
}

/** Default lead tab name. */
export const DEFAULT_LEADS_TAB = 'Leads';

/**
 * Default lead columns. The list is a *base*: any slot the flow collected that
 * is not already covered (e.g. `property_type`, `budget`) is appended as its
 * own column, so the sheet fits whatever vertical the workflow collects.
 */
export const DEFAULT_LEADS_COLUMNS =
  'Timestamp, Type, Name, Phone, Email, CPR, Department, Location, Datetime, Status';

/** Persona injected at the top of the system prompt as the assistant's identity. */
export interface AiStudioPersona {
  alias: string;
  title: string;
  description: string;
}

/** The full AI Studio config surfaced by `/api/ai-studio/config`. */
export interface AiStudioConfig {
  instructions: string;
  persona: AiStudioPersona;
  /** Priority-ordered list of objectives for Chain-of-Thought reasoning when no intent matches. */
  objectives: string[];
  /** Tab of the owner's spreadsheet where captured leads are appended. */
  leadsTab: string;
  /** Comma-separated column list of the lead tab. */
  leadsColumns: string;
}

export const EMPTY_AI_STUDIO_PERSONA: AiStudioPersona = {
  alias: '',
  title: '',
  description: '',
};

export const DEFAULT_AI_STUDIO_CONFIG: AiStudioConfig = {
  instructions: '',
  persona: EMPTY_AI_STUDIO_PERSONA,
  objectives: ['Book an appointment', 'Capture leads', 'Answer FAQs'],
  leadsTab: DEFAULT_LEADS_TAB,
  leadsColumns: DEFAULT_LEADS_COLUMNS,
};

/**
 * Phase 4 — canonical two-tab Google Sheets schema used by the AI Agent's
 * `lookup_sheet` tool.
 *
 * The owner keeps one spreadsheet with an `Intents` tab and a `Workflow_Steps`
 * tab. `column` is the expected header name; the config UI lets the owner
 * override it when their sheet uses different headers (the mapping is injected
 * into the system prompt so the model filters on the real header).
 */
export interface AiSheetColumn {
  /** Canonical key used internally and in the prompt. */
  key: string;
  /** Owner-facing label in the config UI. */
  label: string;
  /** Header name expected in the sheet unless overridden. */
  column: string;
}

export interface AiSheetTabSchema {
  /** Default tab name; also the default `tab` value in `lookup_sheet`. */
  tab: string;
  columns: AiSheetColumn[];
}

export const AI_SHEET_TAB_SCHEMA: AiSheetTabSchema[] = [
  {
    tab: 'Intents',
    columns: [
      { key: 'id', label: 'ID', column: 'id' },
      { key: 'type', label: 'Type', column: 'type' },
      { key: 'keywords', label: 'Keywords', column: 'keywords' },
      { key: 'start_step', label: 'Start step', column: 'start_step' },
      {
        key: 'verification_question',
        label: 'Verification question',
        column: 'verification_question',
      },
      { key: 'answer', label: 'Answer', column: 'answer' },
      { key: 'media', label: 'Media', column: 'media' },
      { key: 'priority', label: 'Priority', column: 'priority' },
      { key: 'message_type', label: 'Message type', column: 'message_type' },
    ],
  },
  {
    tab: 'Workflow_Steps',
    columns: [
      { key: 'intent_id', label: 'Intent ID', column: 'intent_id' },
      { key: 'step_id', label: 'Step ID', column: 'step_id' },
      { key: 'step_type', label: 'Step type (ask|lookup)', column: 'step_type' },
      { key: 'ai_question', label: 'AI question', column: 'ai_question' },
      { key: 'expected_input', label: 'Expected input', column: 'expected_input' },
      { key: 'slot_name', label: 'Slot name', column: 'slot_name' },
      { key: 'options', label: 'Options (comma-separated)', column: 'options' },
      {
        key: 'validation',
        label: 'Validation (text|phone|email|number|date|regex)',
        column: 'validation',
      },
      { key: 'lookup_source', label: 'Lookup source tab', column: 'lookup_source' },
      { key: 'lookup_filter', label: 'Lookup filter', column: 'lookup_filter' },
      { key: 'lookup_extract', label: 'Lookup extract column', column: 'lookup_extract' },
      { key: 'alternate_step', label: 'Alternate step (no match)', column: 'alternate_step' },
      { key: 'next_step_logic', label: 'Next step logic', column: 'next_step_logic' },
      { key: 'fallback', label: 'Fallback', column: 'fallback' },
      { key: 'message_type', label: 'Message type', column: 'message_type' },
    ],
  },
  {
    // Normalized schedule: one row per entity (doctor/property/…), location,
    // category and a structured availability window. `Day-Off` blank means the
    // entity works every day; otherwise it lists the weekday(s) it does NOT work.
    tab: 'Doctors_Schedule',
    columns: [
      { key: 'doctor', label: 'Doctor (entity)', column: 'Doctor' },
      { key: 'branch', label: 'Branch (location)', column: 'Branch' },
      { key: 'department', label: 'Department (category)', column: 'Department' },
      { key: 'day_off', label: 'Day off', column: 'Day-Off' },
      { key: 'start_time', label: 'Start time', column: 'Start_Time' },
      { key: 'end_time', label: 'End time', column: 'End_Time' },
      { key: 'consultation_fees', label: 'Consultation fees', column: 'Consultation Fees' },
    ],
  },
];

/** Normalize a header for fuzzy matching: lowercase, letters/digits only. */
function normalizeHeader(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export interface SheetHeaderMatch {
  /** canonical schema key -> actual header in the sheet (matched keys only). */
  mapping: Record<string, string>;
  /** Schema keys with no matching header in the sheet. */
  missing: string[];
}

/**
 * Match a sheet's header row to a tab schema, case/space/underscore-insensitively
 * ("Verification Question" matches `verification_question`). Used by the config
 * UI's "Detect Headers" button and unit-tested directly.
 */
export function matchSheetHeaders(
  headers: string[],
  schema: AiSheetTabSchema
): SheetHeaderMatch {
  const byNormalized = new Map<string, string>();
  for (const header of Array.isArray(headers) ? headers : []) {
    const trimmed = String(header ?? '').trim();
    if (!trimmed) continue;
    const key = normalizeHeader(trimmed);
    if (key && !byNormalized.has(key)) byNormalized.set(key, trimmed);
  }

  const mapping: Record<string, string> = {};
  const missing: string[] = [];
  for (const col of schema.columns) {
    const hit =
      byNormalized.get(normalizeHeader(col.key)) ?? byNormalized.get(normalizeHeader(col.column));
    if (hit) mapping[col.key] = hit;
    else missing.push(col.key);
  }

  return { mapping, missing };
}
