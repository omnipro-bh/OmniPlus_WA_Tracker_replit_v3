/**
 * Lead capture — the Postgres row and the owner's Google Sheet row.
 *
 * The sheet row is what the owner actually sees, so its shape is pinned here:
 * a completed booking is `Type: Booking` / `Status: Confirmed`, an abandoned
 * flow is `Type: Lead` / `Status: Pending`, and the columns grow with whatever
 * the flow collected (`property_type`, `budget`, …).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLeadRow, captureLead, parseLeadColumns, resolveLeadCapture } from './leadCapture';

const DEFAULT_COLUMNS = 'Timestamp, Type, Name, Phone, Email, CPR, Department, Location, Datetime, Status';

test('parseLeadColumns falls back to the default column list', () => {
  assert.deepEqual(parseLeadColumns(''), DEFAULT_COLUMNS.split(', '));
  assert.deepEqual(parseLeadColumns(null), DEFAULT_COLUMNS.split(', '));
  assert.deepEqual(parseLeadColumns('A, B , C'), ['A', 'B', 'C']);
});

test('a completed booking is written as Type Booking / Status Confirmed', () => {
  const row = buildLeadRow({
    columns: DEFAULT_COLUMNS,
    slots: {
      name: 'Ali',
      phone: '39001234',
      email: 'ali@example.com',
      cpr: '880011223',
      department: 'ENT',
      location: 'Riffa',
      datetime: '5 PM today',
    },
    type: 'Booking',
    status: 'Confirmed',
    timestamp: new Date('2026-11-11T10:00:00.000Z'),
  });

  const at = (column: string) => row.values[row.headers.indexOf(column)];

  assert.equal(at('Timestamp'), '2026-11-11T10:00:00.000Z');
  assert.equal(at('Type'), 'Booking');
  assert.equal(at('Status'), 'Confirmed');
  assert.equal(at('Name'), 'Ali');
  assert.equal(at('Phone'), '39001234');
  assert.equal(at('Email'), 'ali@example.com');
  assert.equal(at('CPR'), '880011223');
  assert.equal(at('Department'), 'ENT');
  assert.equal(at('Location'), 'Riffa');
  assert.equal(at('Datetime'), '5 PM today');
});

test('an abandoned flow is written as Type Lead / Status Pending', () => {
  const row = buildLeadRow({
    columns: DEFAULT_COLUMNS,
    slots: { name: 'Ali', phone: '39001234' },
    type: 'Lead',
    status: 'Pending',
  });

  const at = (column: string) => row.values[row.headers.indexOf(column)];
  assert.equal(at('Type'), 'Lead');
  assert.equal(at('Status'), 'Pending');
});

test('slots that no configured column covers become their own column', () => {
  const row = buildLeadRow({
    columns: DEFAULT_COLUMNS,
    slots: {
      name: 'Ali',
      phone: '39001234',
      property_type: 'Villa',
      budget: '450000',
    },
    type: 'Booking',
    status: 'Confirmed',
  });

  // The base columns stay in the owner's order…
  assert.deepEqual(row.headers.slice(0, 10), DEFAULT_COLUMNS.split(', '));
  // …and the extra slots are appended with their values.
  assert.ok(row.headers.includes('property_type'));
  assert.ok(row.headers.includes('budget'));
  assert.equal(row.values[row.headers.indexOf('property_type')], 'Villa');
  assert.equal(row.values[row.headers.indexOf('budget')], '450000');
});

test('captureLead writes the Postgres row and the sheet row for a completed booking', async () => {
  const inserted: any[] = [];
  const appended: any[] = [];

  const result = await captureLead(
    {
      workflowId: 37,
      nodeId: 'action.ai_agent_1',
      channel: 'whatsapp',
      phone: '39001234',
      slots: { name: 'Ali', phone: '39001234', department: 'ENT' },
      type: 'Booking',
      status: 'Confirmed',
      spreadsheetId: 'https://docs.google.com/spreadsheets/d/abc/edit',
      tab: 'Leads',
      columns: DEFAULT_COLUMNS,
    },
    {
      getWorkflow: async () => ({ id: 37, userId: 7, captureLead: true }),
      insertLead: async (lead) => {
        inserted.push(lead);
        return lead;
      },
      appendRow: async (params) => {
        appended.push(params);
        return true;
      },
    }
  );

  assert.equal(result.inserted, true);
  assert.equal(result.appended, true);

  // The Postgres row.
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].source, 'completed_booking');
  assert.equal(inserted[0].phone, '39001234');
  assert.equal(inserted[0].collectedSlotsJson.department, 'ENT');

  // The sheet row.
  assert.equal(appended.length, 1);
  assert.equal(appended[0].tab, 'Leads');
  const headers = appended[0].row.headers;
  const values = appended[0].row.values;
  assert.equal(values[headers.indexOf('Type')], 'Booking');
  assert.equal(values[headers.indexOf('Status')], 'Confirmed');
  assert.equal(values[headers.indexOf('Phone')], '39001234');
});

test('captureLead writes a Lead/Pending sheet row for an abandoned flow', async () => {
  const appended: any[] = [];

  const result = await captureLead(
    {
      workflowId: 37,
      nodeId: 'action.ai_agent_1',
      channel: 'whatsapp',
      phone: '39001234',
      slots: { name: 'Ali', phone: '39001234' },
      type: 'Lead',
      status: 'Pending',
      spreadsheetId: 'https://docs.google.com/spreadsheets/d/abc/edit',
      tab: 'Leads',
      columns: DEFAULT_COLUMNS,
    },
    {
      getWorkflow: async () => ({ id: 37, userId: 7, captureLead: true }),
      insertLead: async (lead) => lead,
      appendRow: async (params) => {
        appended.push(params);
        return true;
      },
    }
  );

  assert.equal(result.appended, true);
  assert.equal(appended.length, 1);
  const headers = appended[0].row.headers;
  const values = appended[0].row.values;
  assert.equal(values[headers.indexOf('Type')], 'Lead');
  assert.equal(values[headers.indexOf('Status')], 'Pending');
});

test('captureLead does nothing when the workflow has lead capture disabled', async () => {
  const inserted: any[] = [];
  const appended: any[] = [];

  const result = await captureLead(
    {
      workflowId: 37,
      nodeId: 'action.ai_agent_1',
      channel: 'whatsapp',
      phone: '39001234',
      slots: { name: 'Ali' },
      type: 'Booking',
      status: 'Confirmed',
      spreadsheetId: 'https://docs.google.com/spreadsheets/d/abc/edit',
    },
    {
      getWorkflow: async () => ({ id: 37, userId: 7, captureLead: false }),
      insertLead: async (lead) => {
        inserted.push(lead);
        return lead;
      },
      appendRow: async (params) => {
        appended.push(params);
        return true;
      },
    }
  );

  assert.equal(result.inserted, false);
  assert.equal(result.appended, false);
  assert.equal(inserted.length, 0);
  assert.equal(appended.length, 0);
});

test('a completed booking resolves to a Booking/Confirmed lead', () => {
  const candidate = resolveLeadCapture({
    completed: true,
    completedSlots: { name: 'Ali', department: 'ENT' },
  });

  assert.equal(candidate?.type, 'Booking');
  assert.equal(candidate?.status, 'Confirmed');
  assert.equal(candidate?.slots.name, 'Ali');
});

test('an abandoned flow that left details resolves to a Lead/Pending lead', () => {
  const candidate = resolveLeadCapture({
    reasoningDecision: { action: 'capture_lead', slots: { name: 'Ali', phone: '39001234' } },
  });

  assert.equal(candidate?.type, 'Lead');
  assert.equal(candidate?.status, 'Pending');
  assert.equal(candidate?.slots.phone, '39001234');
});

test('an ordinary turn produces no lead', () => {
  assert.equal(resolveLeadCapture({}), null);
  assert.equal(resolveLeadCapture({ reasoningDecision: { action: 'answer_faq' } }), null);
});
