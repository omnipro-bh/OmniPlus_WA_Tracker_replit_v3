/**
 * Phase 2 AI Agent node — tool definition tests.
 *
 * The critical guarantee under test: the model can only name ids the owner
 * declared, and `send_buttons` is capped at 3 (WhatsApp's quick-reply ceiling).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_LOOKUP_ROWS,
  ToolArgumentError,
  buildHandoverTool,
  buildLookupSheetTool,
  buildSendButtonsTool,
  buildSendListTool,
  buildToolList,
  parseHandoverArgs,
  parseLookupSheetArgs,
  parseSendButtonsArgs,
  parseSendListArgs,
} from './tools';

test('buildSendButtonsTool constrains buttons to declared ids and caps at 3', () => {
  const tool = buildSendButtonsTool([
    { id: 'sales', title: 'Sales' },
    { id: 'support', title: 'Support' },
  ]);

  assert.equal(tool.type, 'function');
  assert.equal(tool.function.name, 'send_buttons');
  const schema = tool.function.parameters;
  assert.equal(schema.properties.buttons.maxItems, 3);
  assert.deepEqual(schema.properties.buttons.items.enum, ['sales', 'support']);
  assert.deepEqual(schema.required, ['buttons']);
});

test('buildHandoverTool constrains department to declared ids', () => {
  const tool = buildHandoverTool([
    { id: 'sales', title: 'Sales' },
    { id: 'billing', title: 'Billing' },
  ]);

  assert.equal(tool.function.name, 'handover');
  assert.deepEqual(tool.function.parameters.properties.department.enum, ['sales', 'billing']);
  assert.deepEqual(tool.function.parameters.required, ['department']);
});

test('buildToolList only offers tools whose slots were declared', () => {
  assert.deepEqual(buildToolList({}), []);

  assert.deepEqual(
    buildToolList({ buttons: [{ id: 'b1', title: 'B1' }] }).map((t) => t.function.name),
    ['send_buttons']
  );

  assert.deepEqual(
    buildToolList({
      buttons: [{ id: 'b1', title: 'B1' }],
      handoverDepartments: [{ id: 'sales', title: 'Sales' }],
    }).map((t) => t.function.name),
    ['send_buttons', 'handover']
  );
});

test('parseSendButtonsArgs validates shape', () => {
  assert.deepEqual(parseSendButtonsArgs({ buttons: ['a', 'b'] }), ['a', 'b']);
  assert.throws(() => parseSendButtonsArgs({}), ToolArgumentError);
  assert.throws(() => parseSendButtonsArgs({ buttons: 'a' }), ToolArgumentError);
  assert.throws(() => parseSendButtonsArgs({ buttons: [] }), ToolArgumentError);
  assert.throws(() => parseSendButtonsArgs({ buttons: ['a', 'b', 'c', 'd'] }), ToolArgumentError);
});

test('buildSendListTool constrains rows to declared ids and caps at 10', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    id: `row_${i}`,
    title: `Row ${i}`,
    description: `Description ${i}`,
  }));
  const tool = buildSendListTool(rows);

  assert.equal(tool.type, 'function');
  assert.equal(tool.function.name, 'send_list');
  const schema = tool.function.parameters;
  assert.equal(schema.properties.rows.maxItems, 10);
  assert.deepEqual(schema.properties.rows.items.enum, rows.map((r) => r.id));
  assert.deepEqual(schema.required, ['rows']);
});

test('buildToolList offers send_list only when list rows are declared', () => {
  const names = (config: any) => buildToolList(config).map((t) => t.function.name);

  assert.deepEqual(
    names({ listRows: [{ id: 'row_a', title: 'A' }] }),
    ['send_list']
  );

  assert.deepEqual(
    names({
      buttons: [{ id: 'b1', title: 'B1' }],
      listRows: [{ id: 'row_a', title: 'A' }],
      handoverDepartments: [{ id: 'sales', title: 'Sales' }],
    }),
    ['send_buttons', 'send_list', 'handover']
  );

  assert.deepEqual(names({ listRows: [] }), []);
});

test('parseSendListArgs validates shape', () => {
  assert.deepEqual(parseSendListArgs({ rows: ['a', 'b'] }), ['a', 'b']);
  assert.throws(() => parseSendListArgs({}), ToolArgumentError);
  assert.throws(() => parseSendListArgs({ rows: 'a' }), ToolArgumentError);
  assert.throws(() => parseSendListArgs({ rows: [] }), ToolArgumentError);
  assert.throws(
    () => parseSendListArgs({ rows: Array.from({ length: 11 }, (_, i) => `r${i}`) }),
    ToolArgumentError
  );
});

test('parseHandoverArgs validates shape', () => {
  assert.deepEqual(parseHandoverArgs({ department: 'sales', reason: 'angry' }), {
    department: 'sales',
    reason: 'angry',
  });
  assert.deepEqual(parseHandoverArgs({ department: 'sales' }), {
    department: 'sales',
    reason: '',
  });
  assert.throws(() => parseHandoverArgs({}), ToolArgumentError);
});

// ── Phase 4: lookup_sheet ───────────────────────────────────────────────────

test('buildLookupSheetTool enum-constrains tabs and caps rows at 20', () => {
  const tool = buildLookupSheetTool(['Intents', 'Workflow_Steps']);
  const schema: any = tool.function.parameters;

  assert.equal(tool.function.name, 'lookup_sheet');
  assert.equal(MAX_LOOKUP_ROWS, 20);
  assert.deepEqual(schema.properties.tab.enum, ['Intents', 'Workflow_Steps']);
  assert.deepEqual(schema.required, ['tab']);
  assert.equal(schema.properties.limit.maximum, 20);
  assert.equal(schema.properties.limit.minimum, 1);
});

test('buildToolList offers lookup_sheet only when a tab is declared', () => {
  const names = (config: any) => buildToolList(config).map((t) => t.function.name);

  assert.deepEqual(names({ sheetTabs: ['Intents'] }), ['lookup_sheet']);
  assert.deepEqual(names({ sheetTabs: [] }), []);
  assert.deepEqual(
    names({ buttons: [{ id: 'b1', title: 'B1' }], sheetTabs: ['Intents', 'Workflow_Steps'] }),
    ['send_buttons', 'lookup_sheet']
  );
});

test('parseLookupSheetArgs validates the tab, filter and limit', () => {
  assert.deepEqual(parseLookupSheetArgs({ tab: 'Intents' }), {
    tab: 'Intents',
    filterColumn: undefined,
    filterValue: undefined,
    limit: undefined,
  });
  assert.deepEqual(
    parseLookupSheetArgs({
      tab: 'Intents',
      filter_column: ' keywords ',
      filter_value: 'pricing',
      limit: 5,
    }),
    { tab: 'Intents', filterColumn: 'keywords', filterValue: 'pricing', limit: 5 }
  );
  assert.throws(() => parseLookupSheetArgs({}), ToolArgumentError);
  assert.throws(() => parseLookupSheetArgs({ tab: '  ' }), ToolArgumentError);
  assert.throws(() => parseLookupSheetArgs({ tab: 'Intents', limit: 21 }), ToolArgumentError);
  assert.throws(() => parseLookupSheetArgs({ tab: 'Intents', limit: 0 }), ToolArgumentError);
  assert.throws(() => parseLookupSheetArgs({ tab: 'Intents', limit: 'abc' }), ToolArgumentError);
});
