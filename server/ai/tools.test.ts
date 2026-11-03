/**
 * Phase 2 AI Agent node — tool definition tests.
 *
 * The critical guarantee under test: the model can only name ids the owner
 * declared, and `send_buttons` is capped at 3 (WhatsApp's quick-reply ceiling).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ToolArgumentError,
  buildHandoverTool,
  buildSendButtonsTool,
  buildToolList,
  parseHandoverArgs,
  parseSendButtonsArgs,
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
