/**
 * Google Sheets node executor for workflows.
 *
 * Phase 1 (Model A — shared Service Account).
 *
 * Mirrors the HTTP node split (httpExecutor.ts + httpNodeExecutor.ts) but in a
 * single file, per the approved investigation:
 *   - `executeGoogleSheetsNode(config, context)` is the pure executor.
 *   - `executeGoogleSheetsWorkflowNode(node, ...)` is the node-level wrapper that
 *     extracts `node.data.config`, builds the execution context, runs the
 *     operation, and returns the same `{ success, nextHandle, result, stateUpdate }`
 *     shape as `executeHttpNode`, so routes.ts / flowRunner.ts wire it up identically.
 *
 * Auth: a single shared Service Account, base64-encoded in
 * `GOOGLE_SERVICE_ACCOUNT_JSON` (see .env). No per-tenant credentials.
 *
 * Security model:
 *   - Read-only scopes (spreadsheets) — no Drive access.
 *   - Credentials never leave the server; decoded from env at call time.
 *   - All failures return `{ success: false, error }` instead of throwing.
 */

import { sheets, type sheets_v4 } from '@googleapis/sheets';
import { GoogleAuth } from 'google-auth-library';
import { resolveTemplate } from './httpExecutor';
import { MAX_LOOKUP_ROWS } from '../ai/tools';

// ── Types ──────────────────────────────────────────────────────────────────

export type GoogleSheetsOperation = 'read' | 'append' | 'update';

/** Column -> value pair for write operations (append/update). */
export interface GoogleSheetsDataMapping {
  /** A1 column letter (e.g. "A") or, for update, a header name. */
  column: string;
  /** Literal or {{template}} value to write. */
  value: string;
}

/** read: map a single column to a context variable (multi-column return). */
export interface GoogleSheetsReturnMapping {
  /** Column to read: "A" or a header name like "Fees". */
  column: string;
  /** Context variable name to store the value into. */
  variable: string;
}

export interface GoogleSheetsNodeConfig {
  operation: GoogleSheetsOperation;
  /** Spreadsheet ID from the sheet URL (the long id between /d/ and /edit). */
  spreadsheetId: string;
  /** A1 range, e.g. "Sheet1!A:F" (read/update search range, append target). */
  range: string;
  /** Value to match against lookupColumn (literal or {{template}}). */
  lookupKey: string;
  /** Column the key lives in: "A" or a header name like "Student ID". */
  lookupColumn: string;
  /** read (legacy): column to return ("B" or a header name like "Fees"). */
  returnColumn?: string;
  /** read (legacy): context variable to store the returned value into. */
  returnVariable?: string;
  /** read: return multiple columns, each mapped to a variable name. */
  returnMappings?: GoogleSheetsReturnMapping[];
  /** append/update: columns and values to write. */
  dataMapping?: GoogleSheetsDataMapping[];
}

export interface GoogleSheetsExecutionResult {
  success: boolean;
  operation: GoogleSheetsOperation;
  /** read/update: did lookupKey match a row? */
  found?: boolean;
  /** Matched row number (1-based). */
  rowIndex?: number;
  /** Returned value (read) or write acknowledgement (append/update). */
  data?: any;
  /** Values merged into the context root (e.g. returnVariable). */
  mappedVariables?: Record<string, any>;
  error?: string;
}

/** Node-level result — mirrors `HttpNodeExecutionResult`. */
export interface GoogleSheetsNodeExecutionResult {
  success: boolean;
  nextHandle: 'success' | 'error';
  result: GoogleSheetsExecutionResult;
  stateUpdate: any;
}

// ── Auth ───────────────────────────────────────────────────────────────────

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function getServiceAccountCredentials(): any {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!b64) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not configured');
  }
  try {
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid base64 JSON');
  }
}

async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  const auth = new GoogleAuth({
    credentials: getServiceAccountCredentials(),
    scopes: SCOPES,
  });
  const client = await auth.getClient();
  return sheets({ version: 'v4', auth: client as any });
}

// ── A1 helpers ─────────────────────────────────────────────────────────────

/** "A" -> 0, "B" -> 1, ... "Z" -> 25, "AA" -> 26. */
function columnToIndex(letter: string): number {
  let result = 0;
  for (let i = 0; i < letter.length; i++) {
    result = result * 26 + (letter.toUpperCase().charCodeAt(i) - 64);
  }
  return result - 1;
}

/** 0 -> "A", 25 -> "Z", 26 -> "AA". */
function indexToColumn(index: number): string {
  let n = index;
  let result = '';
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

function isColumnLetter(s: string): boolean {
  return /^[A-Za-z]{1,3}$/.test(s);
}

/** Parse the sheet name and starting column/row out of an A1 range. */
function parseRange(range: string): { sheet: string; startCol: string; startRow: number } {
  const parts = range.split('!');
  const sheet = parts.length > 1 ? parts[0] : '';
  const cells = parts.length > 1 ? parts[1] : parts[0];
  const m = cells.match(/^([A-Za-z]+)(\d*)/);
  const startCol = m?.[1] ? m[1].toUpperCase() : 'A';
  const startRow = m?.[2] ? parseInt(m[2], 10) || 1 : 1;
  return { sheet, startCol, startRow };
}

/**
 * Resolve a column spec ("A" or a header name) to a 0-based offset relative to
 * the first cell in the range. Falls back to header matching against the first
 * returned row when the spec is not a pure column letter.
 */
function resolveColumnOffset(rows: any[][], rangeStartCol: string, spec: string): number {
  if (!spec) return -1;
  if (isColumnLetter(spec)) {
    return columnToIndex(spec) - columnToIndex(rangeStartCol);
  }
  const header = rows[0] || [];
  const needle = spec.trim().toLowerCase();
  for (let i = 0; i < header.length; i++) {
    if (String(header[i] ?? '').trim().toLowerCase() === needle) return i;
  }
  return -1;
}

/**
 * Expand a range's end column to cover the right-most of the given columns.
 * Only letter columns (A, B, ...) are considered; header names are ignored
 * (their offset is resolved later against the fetched rows).
 *
 * Examples:
 *   expandRangeEnd("Sheet1!A:C", ["A", "D", "E"]) -> "Sheet1!A:E"
 *   expandRangeEnd("Sheet1!A2:C100", ["D"])       -> "Sheet1!A2:D100"
 */
function expandRangeEnd(range: string, columns: string[]): string {
  const parts = range.split('!');
  const sheet = parts.length > 1 ? parts[0] : '';
  const cells = parts.length > 1 ? parts[1] : parts[0];

  const m = cells.match(/^([A-Za-z]+)(\d*)(?::([A-Za-z]+)(\d*))?$/);
  if (!m) return range;

  const startCol = (m[1] || 'A').toUpperCase();
  const startRow = m[2] || '';
  const endCol = (m[3] || '').toUpperCase();
  const endRow = m[4] || '';

  let maxCol = startCol;
  const consider = (c: string) => {
    const cc = c.toUpperCase();
    if (cc && isColumnLetter(cc) && columnToIndex(cc) > columnToIndex(maxCol)) {
      maxCol = cc;
    }
  };
  if (endCol) consider(endCol);
  for (const c of columns) {
    if (c) consider(c);
  }

  const cellRange = startRow !== '' || endRow !== ''
    ? `${startCol}${startRow}:${maxCol}${endRow}`
    : `${startCol}:${maxCol}`;

  return sheet ? `${sheet}!${cellRange}` : cellRange;
}

// ── Operations ─────────────────────────────────────────────────────────────

async function doRead(
  client: sheets_v4.Sheets,
  config: GoogleSheetsNodeConfig,
  context: Record<string, any>
): Promise<GoogleSheetsExecutionResult> {
  const spreadsheetId = resolveTemplate(config.spreadsheetId, context);
  const range = resolveTemplate(config.range, context);
  const lookupKey = resolveTemplate(config.lookupKey ?? '', context);
  const { startCol, startRow } = parseRange(range);

  // Return mappings: either the new multi-column `returnMappings`, or the
  // legacy single `returnColumn`/`returnVariable` fallback.
  const returnMappings = (config.returnMappings || []).filter(
    (m: any) => m?.column && m?.variable
  );

  // Expand the fetch range so it covers the lookup column and every return
  // column. Otherwise columns beyond the configured range (e.g. range
  // "Sheet1!A:C" with a mapping for "E") are silently dropped.
  const returnSpecs = returnMappings.length > 0
    ? returnMappings.map((m: any) => m.column)
    : (config.returnColumn ? [config.returnColumn] : []);
  const fetchRange = expandRangeEnd(range, [config.lookupColumn || 'A', ...returnSpecs]);

  const res = await client.spreadsheets.values.get({ spreadsheetId, range: fetchRange });
  const rows: any[][] = res.data.values || [];

  const lookupOffset = resolveColumnOffset(rows, startCol, config.lookupColumn || 'A');
  if (lookupOffset < 0) {
    return {
      success: false,
      operation: 'read',
      error: `Lookup column "${config.lookupColumn}" not found in range ${fetchRange}`,
    };
  }

  // Pre-resolve return columns (validate up front, before scanning rows).
  let resolvedReturns: Array<{ offset: number; variable: string }> | null = null;
  if (returnMappings.length > 0) {
    resolvedReturns = [];
    for (const m of returnMappings) {
      const offset = resolveColumnOffset(rows, startCol, m.column);
      if (offset < 0) {
        return {
          success: false,
          operation: 'read',
          error: `Return column "${m.column}" not found in range ${range}`,
        };
      }
      resolvedReturns.push({ offset, variable: m.variable });
    }
  }

  let legacyReturnOffset: number | null = null;
  if (returnMappings.length === 0) {
    legacyReturnOffset = config.returnColumn
      ? resolveColumnOffset(rows, startCol, config.returnColumn)
      : null;
    if (config.returnColumn && (legacyReturnOffset === null || legacyReturnOffset < 0)) {
      return {
        success: false,
        operation: 'read',
        error: `Return column "${config.returnColumn}" not found in range ${range}`,
      };
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    const cell = row[lookupOffset];
    if (cell !== undefined && cell !== null && String(cell) === lookupKey) {
      const sheetRow = startRow + i;

      const mappedVariables: Record<string, any> = {};
      let data: any;

      if (resolvedReturns) {
        // Multi-column return: one variable per mapping.
        for (const r of resolvedReturns) {
          mappedVariables[r.variable] = row[r.offset];
        }
        data = { ...mappedVariables };
      } else if (legacyReturnOffset !== null && legacyReturnOffset >= 0) {
        // Legacy: single returnColumn.
        const value = row[legacyReturnOffset];
        if (config.returnVariable) {
          mappedVariables[config.returnVariable] = value;
        }
        data = value;
      } else {
        // Legacy: no returnColumn — return the whole row.
        const value = row;
        if (config.returnVariable) {
          mappedVariables[config.returnVariable] = value;
        }
        data = value;
      }

      return {
        success: true,
        operation: 'read',
        found: true,
        rowIndex: sheetRow,
        data,
        mappedVariables,
      };
    }
  }

  return {
    success: false,
    operation: 'read',
    found: false,
    error: `No row found where column ${config.lookupColumn} equals "${lookupKey}"`,
  };
}

async function doAppend(
  client: sheets_v4.Sheets,
  config: GoogleSheetsNodeConfig,
  context: Record<string, any>
): Promise<GoogleSheetsExecutionResult> {
  const spreadsheetId = resolveTemplate(config.spreadsheetId, context);
  const range = resolveTemplate(config.range, context);
  const { startCol } = parseRange(range);

  const mappings = config.dataMapping || [];
  if (mappings.length === 0) {
    return { success: false, operation: 'append', error: 'dataMapping is required for append' };
  }

  // Build a dense row aligned to the range's columns.
  const entries: Array<{ idx: number; value: string }> = [];
  let maxIdx = -1;
  for (const m of mappings) {
    if (!m || !m.column) continue;
    // Append requires A1 column letters (there is no header row to match against).
    if (!isColumnLetter(m.column)) continue;
    const colIdx = columnToIndex(m.column) - columnToIndex(startCol);
    if (colIdx < 0) continue;
    entries.push({ idx: colIdx, value: resolveTemplate(m.value ?? '', context) });
    if (colIdx > maxIdx) maxIdx = colIdx;
  }
  if (maxIdx < 0) {
    return { success: false, operation: 'append', error: 'No valid dataMapping columns for append' };
  }

  const row: any[] = new Array(maxIdx + 1).fill('');
  for (const e of entries) row[e.idx] = e.value;

  const res = await client.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });

  return {
    success: true,
    operation: 'append',
    data: {
      updatedRange: res.data.updates?.updatedRange,
      updatedRows: res.data.updates?.updatedRows,
    },
  };
}

async function doUpdate(
  client: sheets_v4.Sheets,
  config: GoogleSheetsNodeConfig,
  context: Record<string, any>
): Promise<GoogleSheetsExecutionResult> {
  const spreadsheetId = resolveTemplate(config.spreadsheetId, context);
  const range = resolveTemplate(config.range, context);
  const lookupKey = resolveTemplate(config.lookupKey ?? '', context);
  const { sheet, startCol, startRow } = parseRange(range);

  const mappings = config.dataMapping || [];
  if (mappings.length === 0) {
    return { success: false, operation: 'update', error: 'dataMapping is required for update' };
  }

  const res = await client.spreadsheets.values.get({ spreadsheetId, range });
  const rows: any[][] = res.data.values || [];

  const lookupOffset = resolveColumnOffset(rows, startCol, config.lookupColumn || 'A');
  if (lookupOffset < 0) {
    return {
      success: false,
      operation: 'update',
      error: `Lookup column "${config.lookupColumn}" not found in range ${range}`,
    };
  }

  let matchedRow = -1;
  for (let i = 0; i < rows.length; i++) {
    const cell = (rows[i] || [])[lookupOffset];
    if (cell !== undefined && cell !== null && String(cell) === lookupKey) {
      matchedRow = i;
      break;
    }
  }

  if (matchedRow === -1) {
    return {
      success: false,
      operation: 'update',
      found: false,
      error: `No row found where column ${config.lookupColumn} equals "${lookupKey}"`,
    };
  }

  const sheetRow = startRow + matchedRow;

  for (const m of mappings) {
    if (!m || !m.column) continue;
    const offset = resolveColumnOffset(rows, startCol, m.column);
    if (offset < 0) continue;
    const colLetter = indexToColumn(offset + columnToIndex(startCol));
    const value = resolveTemplate(m.value ?? '', context);
    await client.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheet}!${colLetter}${sheetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[value]] },
    });
  }

  return {
    success: true,
    operation: 'update',
    found: true,
    rowIndex: sheetRow,
    data: { updatedRow: sheetRow, columns: mappings.map((m) => m.column) },
  };
}

// ── Public entry point ─────────────────────────────────────────────────────

export async function executeGoogleSheetsNode(
  config: GoogleSheetsNodeConfig,
  context: Record<string, any>
): Promise<GoogleSheetsExecutionResult> {
  const operation = config?.operation || 'read';

  try {
    if (!config?.spreadsheetId) {
      return { success: false, operation, error: 'spreadsheetId is required' };
    }
    if (!config?.range) {
      return { success: false, operation, error: 'range is required' };
    }
    if (!['read', 'append', 'update'].includes(operation)) {
      return { success: false, operation, error: `Unsupported operation: ${operation}` };
    }

    const client = await getSheetsClient();

    switch (operation) {
      case 'read':
        return doRead(client, config, context);
      case 'append':
        return doAppend(client, config, context);
      case 'update':
        return doUpdate(client, config, context);
      default:
        return { success: false, operation, error: `Unsupported operation: ${operation}` };
    }
  } catch (error: any) {
    console.error('[Google Sheets Executor] Execution failed:', error);
    return {
      success: false,
      operation,
      error: error?.message || 'Google Sheets operation failed',
    };
  }
}

// ── Node-level wrapper (mirrors httpNodeExecutor.executeHttpNode) ───────────

function buildExecutionContext(
  conversationState: any,
  incomingMessage: any,
  userMetadata: any
): Record<string, any> {
  return {
    phone: userMetadata.phone || incomingMessage.from || '',
    name: userMetadata.name || '',
    email: userMetadata.email || '',
    message: {
      text: incomingMessage.text?.body || '',
      from: incomingMessage.from || '',
      timestamp: incomingMessage.timestamp || Date.now(),
    },
    ...((conversationState.context as any) || {}),
  };
}

export async function executeGoogleSheetsWorkflowNode(
  node: any,
  conversationState: any,
  incomingMessage: any = {},
  userMetadata: any = {}
): Promise<GoogleSheetsNodeExecutionResult> {
  const config: GoogleSheetsNodeConfig = {
    operation: node.data?.config?.operation || 'read',
    spreadsheetId: node.data?.config?.spreadsheetId || '',
    range: node.data?.config?.range || '',
    lookupKey: node.data?.config?.lookupKey || '',
    lookupColumn: node.data?.config?.lookupColumn || 'A',
    returnColumn: node.data?.config?.returnColumn,
    returnVariable: node.data?.config?.returnVariable,
    returnMappings: node.data?.config?.returnMappings || [],
    dataMapping: node.data?.config?.dataMapping || [],
  };

  const executionContext = buildExecutionContext(conversationState, incomingMessage, userMetadata);

  const result = await executeGoogleSheetsNode(config, executionContext);

  const nextHandle: 'success' | 'error' = result.success ? 'success' : 'error';

  const contextUpdate: any = {
    ...((conversationState.context as any) || {}),
  };

  // Store under context.sheets[nodeId], mirroring context.http[nodeId].
  contextUpdate.sheets = contextUpdate.sheets || {};
  contextUpdate.sheets[node.id] = {
    operation: result.operation,
    found: result.found,
    rowIndex: result.rowIndex,
    data: result.data,
    mappedVariables: result.mappedVariables || {},
    error: result.error,
    executedAt: new Date().toISOString(),
  };

  // Merge returned values (e.g. returnVariable) into the context root.
  if (result.mappedVariables) {
    Object.assign(contextUpdate, result.mappedVariables);
  }

  return {
    success: result.success,
    nextHandle,
    result,
    stateUpdate: contextUpdate,
  };
}

// ── AI Agent `lookup_sheet` data source (Phase 4) ───────────────────────────

export interface LookupSheetRowsResult {
  success: boolean;
  rows: Record<string, any>[];
  error?: string;
}

/**
 * Accept either a bare spreadsheet ID or a full Google Sheets URL and return the
 * ID. Owners usually copy the URL from the address bar.
 */
export function extractSpreadsheetId(input: any): string {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return '';
  const match = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : raw;
}

/**
 * Pure row shaping: turn a raw `values.get` result (header row + data rows)
 * into objects keyed by header name, apply an optional case-insensitive filter,
 * and cap the result at 20 rows. `filter_column` is matched against the header
 * row (case-insensitive); `filter_value` uses a case-insensitive substring match
 * so a "keywords" cell like "pricing, cost" matches "pricing".
 */
export function projectSheetRows(
  rawRows: any[][],
  options: {
    filterColumn?: string;
    filterValue?: string;
    limit?: number;
    /** Hard cap on returned rows (defaults to `MAX_LOOKUP_ROWS`). The state machine passes a larger value. */
    maxRows?: number;
  } = {}
): { rows: Record<string, any>[]; error?: string } {
  if (!Array.isArray(rawRows) || rawRows.length === 0) return { rows: [] };

  const header = rawRows[0].map((h: any) => String(h ?? '').trim());
  const dataRows = rawRows.slice(1);

  const headerByName = new Map<string, string>(); // lowercase -> actual header
  header.forEach((h, i) => {
    if (h && !headerByName.has(h.toLowerCase())) headerByName.set(h.toLowerCase(), h);
  });

  let rows = dataRows.map((row) => {
    const obj: Record<string, any> = {};
    header.forEach((h, i) => {
      if (h) obj[h] = row[i] ?? '';
    });
    return obj;
  });

  const filterColumn = options.filterColumn?.trim();
  if (filterColumn) {
    const actualHeader = headerByName.get(filterColumn.toLowerCase());
    if (!actualHeader) {
      return { rows: [], error: `Column "${filterColumn}" not found in the tab header` };
    }
    const filterValue = options.filterValue;
    if (filterValue !== undefined && filterValue !== '') {
      const raw = String(filterValue).trim();
      const tokens = raw.split(/\s+/).filter(Boolean);

      if (tokens.length <= 1) {
        // Single token: the original case-insensitive substring match.
        const needle = raw.toLowerCase();
        rows = rows.filter((obj) => {
          const cell = obj[actualHeader];
          return cell !== undefined && cell !== null && String(cell).toLowerCase().includes(needle);
        });
      } else {
        // Multi-word phrase ("dental appointment"): match ANY word (≥3 chars) and
        // rank rows by how many of the words they contain, so the most specific
        // match ("dental") sorts above a generic one ("appointment").
        const words = tokens.map((t) => t.toLowerCase()).filter((w) => w.length >= 3);
        const needles = words.length > 0 ? words : [raw.toLowerCase()];
        const scored = rows.map((obj) => {
          const cell = obj[actualHeader];
          const text = cell !== undefined && cell !== null ? String(cell).toLowerCase() : '';
          const matches = needles.filter((w) => text.includes(w)).length;
          return { obj, matches };
        });
        rows = scored
          .filter((s) => s.matches > 0)
          .sort((a, b) => b.matches - a.matches)
          .map((s) => s.obj);
      }
    }
  }

  const cap = options.maxRows && options.maxRows > 0 ? options.maxRows : MAX_LOOKUP_ROWS;
  const requested = options.limit && options.limit > 0 ? options.limit : cap;
  const max = Math.min(requested, cap);
  return { rows: rows.slice(0, max) };
}

/**
 * Read a whole tab as objects, optionally filtered. Used by the AI Agent's
 * `lookup_sheet` tool. Read-only, uses the shared service account.
 */
export async function lookupSheetRows(
  spreadsheetId: string,
  tabName: string,
  options: {
    filterColumn?: string;
    filterValue?: string;
    limit?: number;
    /** Hard cap on returned rows (defaults to `MAX_LOOKUP_ROWS`). */
    maxRows?: number;
  } = {}
): Promise<LookupSheetRowsResult> {
  try {
    const id = extractSpreadsheetId(spreadsheetId);
    if (!id) return { success: false, rows: [], error: 'spreadsheetId is required' };
    if (!tabName) return { success: false, rows: [], error: 'tab is required' };

    const client = await getSheetsClient();
    // A bare tab name reads the whole sheet (Sheets infers the used range).
    const res = await client.spreadsheets.values.get({ spreadsheetId: id, range: tabName });
    const rawRows: any[][] = res.data.values || [];

    const projected = projectSheetRows(rawRows, options);
    if (projected.error) return { success: false, rows: [], error: projected.error };
    return { success: true, rows: projected.rows };
  } catch (error: any) {
    console.error('[AI lookup_sheet] failed:', error);
    return { success: false, rows: [], error: error?.message || 'lookup_sheet failed' };
  }
}

export interface SheetHeadersResult {
  success: boolean;
  /** Row 1 of the tab, trimmed and empty cells dropped. */
  headers: string[];
  /** Data rows below the header (row 1 excluded). */
  rowCount: number;
  /** First few rows as objects, for the config panel preview. */
  sample: Record<string, any>[];
  error?: string;
}

/**
 * Pure header extraction: row 1 → header names (trimmed, blanks dropped),
 * remaining rows → `rowCount`, plus a small projected sample. Empty/blank
 * sheets return empty values so the caller can report a clear error.
 */
export function headersFromRows(
  rawRows: any[][],
  sampleSize = 3
): { headers: string[]; rowCount: number; sample: Record<string, any>[] } {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const headers = (rows[0] || []).map((h: any) => String(h ?? '').trim()).filter(Boolean);
  const requested = Math.max(1, Math.min(sampleSize, 10));
  const sample = rows.slice(1, 1 + requested).map((row) => {
    const obj: Record<string, any> = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = row[i] ?? '';
    });
    return obj;
  });
  return {
    headers,
    rowCount: Math.max(0, rows.length - 1),
    sample,
  };
}

/**
 * Read a tab's header row for the config UI's "Detect Headers" button, so owners
 * do not have to retype their column names. Read-only, shared service account.
 */
export async function fetchSheetHeaders(
  spreadsheetId: string,
  tabName: string,
  sampleSize = 3
): Promise<SheetHeadersResult> {
  const empty = { headers: [], rowCount: 0, sample: [] };
  try {
    const id = extractSpreadsheetId(spreadsheetId);
    if (!id) {
      return { success: false, ...empty, error: 'spreadsheetId is required' };
    }
    if (!tabName) return { success: false, ...empty, error: 'tab is required' };

    const client = await getSheetsClient();
    const res = await client.spreadsheets.values.get({ spreadsheetId: id, range: tabName });
    const rawRows: any[][] = res.data.values || [];

    if (rawRows.length === 0) {
      return { success: false, ...empty, error: `Tab "${tabName}" is empty.` };
    }

    return { success: true, ...headersFromRows(rawRows, sampleSize) };
  } catch (error: any) {
    console.error('[AI sheet headers] failed:', error);
    return {
      success: false,
      ...empty,
      error: error?.message || 'Failed to read the sheet headers',
    };
  }
}

export interface OverwriteSheetResult {
  success: boolean;
  updatedRows?: number;
  error?: string;
}

/**
 * Overwrite a whole tab: clear it, then write the provided rows (first row is
 * expected to be the header). Used by the AI Studio Scenario Builder to persist
 * edited `Workflow_Steps` back to Google Sheets.
 */
export async function overwriteSheetTab(
  spreadsheetId: string,
  tabName: string,
  rows: any[][]
): Promise<OverwriteSheetResult> {
  try {
    const id = extractSpreadsheetId(spreadsheetId);
    if (!id) return { success: false, error: 'spreadsheetId is required' };
    if (!tabName) return { success: false, error: 'tab is required' };
    if (!Array.isArray(rows)) return { success: false, error: 'rows must be an array' };

    const client = await getSheetsClient();
    await client.spreadsheets.values.clear({ spreadsheetId: id, range: tabName });
    const res = await client.spreadsheets.values.update({
      spreadsheetId: id,
      range: tabName,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows },
    });
    return { success: true, updatedRows: res.data.updatedRows ?? rows.length };
  } catch (error: any) {
    console.error('[AI overwrite sheet tab] failed:', error);
    return { success: false, error: error?.message || 'Failed to write the sheet tab' };
  }
}

export interface ListTabsResult {
  success: boolean;
  tabs: string[];
  error?: string;
}

/** List every tab name in a spreadsheet. */
export async function listSheetTabs(spreadsheetId: string): Promise<ListTabsResult> {
  try {
    const id = extractSpreadsheetId(spreadsheetId);
    if (!id) return { success: false, tabs: [], error: 'spreadsheetId is required' };
    const client = await getSheetsClient();
    const res = await client.spreadsheets.get({ spreadsheetId: id, fields: 'sheets.properties.title' });
    const tabs = (res.data.sheets ?? [])
      .map((s) => s.properties?.title)
      .filter((t): t is string => typeof t === 'string' && t.length > 0);
    return { success: true, tabs };
  } catch (error: any) {
    console.error('[AI list sheet tabs] failed:', error);
    return { success: false, tabs: [], error: error?.message || 'Failed to list tabs' };
  }
}

export interface RawValuesResult {
  success: boolean;
  values: any[][];
  error?: string;
}

/** Read a tab's raw cell values (header row + data rows) as a 2D array. */
export async function readSheetRawValues(
  spreadsheetId: string,
  tabName: string
): Promise<RawValuesResult> {
  try {
    const id = extractSpreadsheetId(spreadsheetId);
    if (!id) return { success: false, values: [], error: 'spreadsheetId is required' };
    if (!tabName) return { success: false, values: [], error: 'tab is required' };
    const client = await getSheetsClient();
    const res = await client.spreadsheets.values.get({ spreadsheetId: id, range: tabName });
    return { success: true, values: res.data.values ?? [] };
  } catch (error: any) {
    console.error('[AI read raw values] failed:', error);
    return { success: false, values: [], error: error?.message || 'Failed to read the sheet tab' };
  }
}
