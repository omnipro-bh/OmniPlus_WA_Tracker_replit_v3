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
