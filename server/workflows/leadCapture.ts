/**
 * Lead capture — Postgres row + Google Sheet row.
 *
 * The owner asked for leads to be visible in a spreadsheet, not only in a
 * hidden database table. Two things are written when a flow ends:
 *
 *   1. the `leads` table (the historical behaviour), and
 *   2. a row in the configured tab of the workflow's own Google Sheet.
 *
 * The columns are DYNAMIC: the owner configures a base list (Timestamp, Type,
 * Name, Phone, …) and every slot the flow collected that is not already
 * covered becomes its own column, so a real-estate workflow writes
 * `property_type` and `budget` without any code change.
 */

import { DEFAULT_LEADS_COLUMNS, DEFAULT_LEADS_TAB } from '@shared/ai-defaults';
import { appendSheetRow } from './googleSheetsExecutor';

/** A completed booking vs. an abandoned flow that still left contact details. */
export type LeadType = 'Booking' | 'Lead';
export type LeadStatus = 'Confirmed' | 'Pending';

/** Canonical column → the slots that may hold its value, most specific first. */
const COLUMN_SLOT_ALIASES: Record<string, string[]> = {
  name: ['name', 'full_name', 'customer_name', 'client_name', 'patient_name', 'contact_name'],
  phone: ['phone', 'phone_number', 'mobile', 'mobile_number', 'contact_number', 'whatsapp'],
  email: ['email', 'email_address', 'mail'],
  cpr: ['cpr', 'cpr_number', 'national_id', 'id_number', 'qatar_id', 'civil_id'],
  department: ['department', 'specialty', 'category', 'service', 'department_name'],
  location: ['location', 'branch', 'city', 'area', 'region'],
  datetime: ['datetime', 'date', 'time', 'appointment_datetime', 'booking_datetime'],
};

/** Reserved columns: their value comes from the capture, never from a slot. */
const RESERVED_COLUMNS = new Set(['timestamp', 'type', 'status']);

function normalizeColumn(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Split the owner's comma separated column list. */
export function parseLeadColumns(columns: string | null | undefined): string[] {
  const list = String(columns ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  return list.length > 0 ? list : DEFAULT_LEADS_COLUMNS.split(',').map((c) => c.trim());
}

export interface LeadRowInput {
  /** The owner's base column list. */
  columns?: string | null;
  /** Everything the flow collected. */
  slots: Record<string, any>;
  /** `Booking` for a completed flow, `Lead` for an abandoned one. */
  type: LeadType;
  /** `Confirmed` when the booking completed, `Pending` otherwise. */
  status: LeadStatus;
  /** The channel phone (WhatsApp number) — used when no phone slot was filled. */
  fallbackPhone?: string;
  /** Row timestamp; defaults to now. */
  timestamp?: Date;
}

export interface LeadRow {
  headers: string[];
  values: string[];
}

/** Read a slot value, tolerating case/format differences. */
function slotValue(slots: Record<string, any>, names: string[]): string {
  const byNormalized = new Map<string, any>();
  for (const [key, value] of Object.entries(slots ?? {})) {
    const normalized = normalizeColumn(key);
    if (normalized && !byNormalized.has(normalized)) byNormalized.set(normalized, value);
  }
  for (const name of names) {
    const direct = slots?.[name];
    if (direct !== undefined && direct !== null && String(direct).trim() !== '') {
      return String(direct).trim();
    }
    const hit = byNormalized.get(normalizeColumn(name));
    if (hit !== undefined && hit !== null && String(hit).trim() !== '') {
      return String(hit).trim();
    }
  }
  return '';
}

/**
 * Build the sheet row: one header per column, one value per column.
 *
 * The base columns come from the owner's configuration; slots that are not
 * covered by them are appended as extra columns so nothing collected is lost.
 */
export function buildLeadRow(input: LeadRowInput): LeadRow {
  const baseColumns = parseLeadColumns(input.columns);
  const slots = input.slots ?? {};
  const type: LeadType = input.type === 'Booking' ? 'Booking' : 'Lead';
  const status: LeadStatus = input.status === 'Confirmed' ? 'Confirmed' : 'Pending';
  const timestamp = (input.timestamp ?? new Date()).toISOString();

  const headers: string[] = [...baseColumns];
  const values: string[] = [];

  const covered = new Set<string>();

  for (const column of baseColumns) {
    const key = normalizeColumn(column);
    if (RESERVED_COLUMNS.has(key)) {
      values.push(key === 'timestamp' ? timestamp : key === 'type' ? type : status);
      continue;
    }
    const aliases = COLUMN_SLOT_ALIASES[key] ?? [key];
    const value = slotValue(slots, aliases);
    if (value) for (const alias of aliases) covered.add(normalizeColumn(alias));
    if (value) covered.add(key);
    values.push(value);
  }

  // Dynamic columns: every collected slot that no base column covers.
  for (const [slotName, rawValue] of Object.entries(slots)) {
    const key = normalizeColumn(slotName);
    if (!key || covered.has(key)) continue;
    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') continue;
    headers.push(slotName);
    values.push(String(rawValue).trim());
    covered.add(key);
  }

  return { headers, values };
}

export interface WriteLeadRowInput {
  /** The workflow's Google Sheet. */
  spreadsheetId: string;
  /** Tab name (owner configured). */
  tab: string;
  /** The row to append. */
  row: LeadRow;
}

/** Append one lead row to the owner's sheet. Never throws. */
export async function writeLeadRow(input: WriteLeadRowInput): Promise<boolean> {
  if (!input.spreadsheetId) return false;
  const result = await appendSheetRow(input.spreadsheetId, input.tab || DEFAULT_LEADS_TAB, {
    headers: input.row.headers,
    values: input.row.values,
  });
  if (!result.success) {
    console.warn(`[AI] lead sheet append failed: ${result.error ?? 'unknown error'}`);
    return false;
  }
  return true;
}

export interface CaptureLeadInput {
  /** The workflow the lead belongs to. */
  workflowId: number;
  /** The AI node that produced the lead. */
  nodeId: string;
  /** Channel the conversation happened on. */
  channel: string;
  /** The phone number of the conversation (channel number). */
  phone: string;
  /** Everything the flow collected. */
  slots: Record<string, any>;
  /** `Booking` (completed) or `Lead` (abandoned). */
  type: LeadType;
  /** `Confirmed` or `Pending`. */
  status: LeadStatus;
  /** The workflow's Google Sheet — the lead tab lives there. */
  spreadsheetId?: string | null;
  /** Owner-configured lead tab + columns. */
  tab?: string | null;
  columns?: string | null;
}

export interface CaptureLeadResult {
  /** A row was written to the Postgres `leads` table. */
  inserted: boolean;
  /** A row was appended to the Google Sheet. */
  appended: boolean;
  /** The row that was written (for logging/tests). */
  row?: LeadRow;
}

/** The lead a finished turn produces. */
export interface LeadCaptureCandidate {
  type: LeadType;
  status: LeadStatus;
  slots: Record<string, any>;
}

/**
 * Which lead (if any) does this turn produce?
 *
 *  • a COMPLETED booking → `Booking` / `Confirmed`
 *  • an ABANDONED flow that still left contact details (the reasoning step
 *    asked for them) → `Lead` / `Pending`
 *
 * Everything else produces no lead.
 */
export function resolveLeadCapture(result: {
  completed?: boolean;
  completedSlots?: Record<string, any>;
  reasoningDecision?: { action?: string; slots?: Record<string, any> };
  sheetState?: { slots?: Record<string, any> };
}): LeadCaptureCandidate | null {
  if (result.completed) {
    return { type: 'Booking', status: 'Confirmed', slots: result.completedSlots ?? {} };
  }
  if (result.reasoningDecision?.action === 'capture_lead') {
    const slots = result.reasoningDecision?.slots ?? result.sheetState?.slots ?? {};
    return { type: 'Lead', status: 'Pending', slots };
  }
  return null;
}

/** Seam for tests: replace the database and the spreadsheet writer. */
export interface CaptureLeadDeps {
  /** Loads the workflow (its `captureLead` flag decides whether to capture). */
  getWorkflow?: (workflowId: number) => Promise<{ id: number; userId: number; captureLead?: boolean } | null>;
  /** Writes the Postgres `leads` row. */
  insertLead?: (lead: any) => Promise<any>;
  /** Writes the Google Sheet row. */
  appendRow?: (params: { spreadsheetId: string; tab: string; row: LeadRow }) => Promise<boolean>;
}

/**
 * Capture one lead: the Postgres row (historical behaviour) and the Google
 * Sheet row (the owner's spreadsheet). Never throws — a failed capture must
 * not break the conversation.
 */
export async function captureLead(
  input: CaptureLeadInput,
  deps: CaptureLeadDeps = {}
): Promise<CaptureLeadResult> {
  const result: CaptureLeadResult = { inserted: false, appended: false };
  try {
    const row = buildLeadRow({
      columns: input.columns,
      slots: input.slots,
      type: input.type,
      status: input.status,
      fallbackPhone: input.phone,
    });
    result.row = row;

    // 0. The workflow decides: `capture_lead` must be enabled.
    const getWorkflow =
      deps.getWorkflow ??
      (async (workflowId: number) => {
        const { storage } = await import('../storage');
        return storage.getWorkflow(workflowId);
      });
    const workflow = await getWorkflow(input.workflowId);
    if (!workflow?.captureLead) return result;

    // 1. The Postgres `leads` table.
    try {
      const insert =
        deps.insertLead ??
        (async (lead: any) => {
          const { storage } = await import('../storage');
          return storage.insertLead(lead);
        });
      await insert({
        userId: workflow.userId,
        workflowId: workflow.id,
        nodeId: input.nodeId,
        channel: input.channel,
        phone: String(input.phone ?? '').trim(),
        collectedSlotsJson: input.slots ?? {},
        source: input.type === 'Booking' ? 'completed_booking' : 'capture_lead',
      });
      result.inserted = true;
    } catch (error: any) {
      console.warn(`[AI] lead capture (database) failed: ${error?.message ?? error}`);
    }

    // 2. The owner's spreadsheet.
    if (input.spreadsheetId) {
      const append =
        deps.appendRow ??
        (async (params: { spreadsheetId: string; tab: string; row: LeadRow }) =>
          writeLeadRow(params));
      result.appended = await append({
        spreadsheetId: input.spreadsheetId,
        tab: input.tab || DEFAULT_LEADS_TAB,
        row,
      });
    }
  } catch (error: any) {
    console.warn(`[AI] lead capture failed: ${error?.message ?? error}`);
  }
  return result;
}
