/**
 * Phase 2 AI Agent node — tool loop tests.
 *
 * Uses the mock provider (no network, no spend) to drive the executor through
 * its tool-call rounds. The mock's `toolCalls` queue scripts each turn.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { MockLlmClient } from '../ai/clients/mock';
import { executeAiAgentNode } from './aiAgentExecutor';

const baseConfig = {
  provider: 'mock' as const,
  systemPrompt: 'You are a support assistant.',
};

function run(config: any, mock: MockLlmClient) {
  return executeAiAgentNode(config, {
    nodeId: 'n1',
    context: {},
    userMessage: 'hello',
    client: mock,
    channel: 'whatsapp',
  });
}

test('send_buttons routes to the buttons handle and stores the bubble', async () => {
  const mock = new MockLlmClient({
    toolCalls: [[{ name: 'send_buttons', arguments: { buttons: ['sales'] } }]],
  });

  const result = await run(
    {
      ...baseConfig,
      buttons: [
        { id: 'sales', title: 'Sales' },
        { id: 'support', title: 'Support' },
      ],
    },
    mock
  );

  assert.equal(result.success, true);
  assert.equal(result.nextHandle, 'buttons');
  assert.deepEqual(result.buttons, [{ id: 'sales', title: 'Sales' }]);
  assert.equal(result.buttonText, 'Please choose an option:');
  assert.deepEqual(result.stateUpdate.ai.n1.buttons, [{ id: 'sales', title: 'Sales' }]);
  assert.equal(mock.callCount, 1);
});

test('send_list routes to the list handle and stores the rows', async () => {
  const mock = new MockLlmClient({
    toolCalls: [[{ name: 'send_list', arguments: { rows: ['row_cardio', 'row_derma'] } }]],
  });

  const result = await run(
    {
      ...baseConfig,
      buttons: [{ id: 'btn_a', title: 'A' }],
      listRows: [
        { id: 'row_cardio', title: 'Cardiology', description: 'Heart' },
        { id: 'row_derma', title: 'Dermatology' },
      ],
    },
    mock
  );

  assert.equal(result.success, true);
  assert.equal(result.nextHandle, 'list');
  assert.deepEqual(result.listRows, [
    { id: 'row_cardio', title: 'Cardiology', description: 'Heart' },
    { id: 'row_derma', title: 'Dermatology' },
  ]);
  assert.equal(result.listTitle, 'Please choose:');
  assert.deepEqual(result.stateUpdate.ai.n1.listRows, result.listRows);
  assert.equal(result.stateUpdate.ai.n1.listTitle, 'Please choose:');
  assert.equal(mock.callCount, 1);
});

test('handover is terminal and routes to the handover handle', async () => {
  const mock = new MockLlmClient({
    toolCalls: [[{ name: 'handover', arguments: { department: 'sales', reason: 'wants a quote' } }]],
  });

  const result = await run(
    {
      ...baseConfig,
      handoverDepartments: [
        { id: 'sales', title: 'Sales' },
        { id: 'support', title: 'Support' },
      ],
    },
    mock
  );

  assert.equal(result.success, true);
  assert.equal(result.nextHandle, 'handover');
  assert.deepEqual(result.handover, {
    department: 'sales',
    reason: 'wants a quote',
    title: 'Sales',
  });
  assert.deepEqual(result.stateUpdate.ai.n1.handover, {
    department: 'sales',
    reason: 'wants a quote',
    title: 'Sales',
  });
  assert.equal(mock.callCount, 1); // terminal — no second model round
});

test('stops after 3 tool rounds when the model never answers', async () => {
  const mock = new MockLlmClient({
    toolCalls: [
      [{ name: 'loop_forever' }],
      [{ name: 'loop_forever' }],
      [{ name: 'loop_forever' }],
      [{ name: 'loop_forever' }],
    ],
  });

  const result = await run({ ...baseConfig }, mock);

  assert.equal(result.success, false);
  assert.equal(result.nextHandle, 'error');
  assert.match(result.error ?? '', /did not produce a final answer/);
  assert.equal(mock.callCount, 3); // capped, the 4th scripted turn is never used
});

test('rejects an undeclared button id with the error handle', async () => {
  const mock = new MockLlmClient({
    toolCalls: [[{ name: 'send_buttons', arguments: { buttons: ['nope'] } }]],
  });

  const result = await run(
    { ...baseConfig, buttons: [{ id: 'sales', title: 'Sales' }] },
    mock
  );

  assert.equal(result.success, false);
  assert.equal(result.nextHandle, 'error');
  assert.match(result.error ?? '', /not a declared button id/);
});

test('no tools configured preserves Phase 1 behaviour (single call, success)', async () => {
  const mock = new MockLlmClient({ replies: ['hello there'] });

  const result = await run({ ...baseConfig }, mock);

  assert.equal(result.success, true);
  assert.equal(result.nextHandle, 'success');
  assert.equal(result.text, 'hello there');
  assert.equal(result.stateUpdate.ai_response, 'hello there');
  assert.equal(mock.callCount, 1);
});

test('text-only reply routes success and populates the response variable', async () => {
  const mock = new MockLlmClient({ replies: ['We are open 9 to 5.'] });

  const result = await run(
    { ...baseConfig, buttons: [{ id: 'hours', title: 'Hours' }] },
    mock
  );

  assert.equal(result.success, true);
  assert.equal(result.nextHandle, 'success');
  assert.equal(result.text, 'We are open 9 to 5.');
  assert.equal(result.stateUpdate.ai_response, 'We are open 9 to 5.');
  assert.equal(mock.callCount, 1);
});
