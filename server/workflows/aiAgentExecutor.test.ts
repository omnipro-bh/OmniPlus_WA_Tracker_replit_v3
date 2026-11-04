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

test('send_buttons records the offered titles for the click guard', async () => {
  const mock = new MockLlmClient({
    toolCalls: [[{ name: 'send_buttons', arguments: { buttons: ['sales', 'support'] } }]],
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

  assert.equal(result.nextHandle, 'buttons');
  assert.deepEqual(result.stateUpdate.ai.n1.lastSentOptions.titles, ['Sales', 'Support']);
  assert.equal(typeof result.stateUpdate.ai.n1.lastSentOptions.at, 'number');
});

test('button click strips send_buttons tool', async () => {
  const mock = new MockLlmClient({ replies: ['Our plans start at 10 BHD per month.'] });

  const result = await executeAiAgentNode(
    {
      ...baseConfig,
      buttons: [{ id: 'btn_pricing', title: 'See pricing' }],
      listRows: [
        { id: 'row_1', title: 'Row 1' },
        { id: 'row_2', title: 'Row 2' },
        { id: 'row_3', title: 'Row 3' },
        { id: 'row_4', title: 'Row 4' },
      ],
      handoverDepartments: [{ id: 'sales', title: 'Sales' }],
    },
    {
      nodeId: 'n1',
      context: {
        ai: {
          n1: {
            lastSentOptions: { titles: ['See pricing', 'Talk to sales'], at: Date.now() },
          },
        },
      },
      userMessage: 'See pricing',
      client: mock,
      channel: 'whatsapp',
    }
  );

  // The click is answered with text...
  assert.equal(result.success, true);
  assert.equal(result.nextHandle, 'success');
  assert.equal(result.text, 'Our plans start at 10 BHD per month.');

  // ...because send_buttons / send_list were physically removed from the request
  // (handover is still available).
  const sentTools = (mock.requests[0].tools ?? []).map((tool) => tool.function.name);
  assert.deepEqual(sentTools, ['handover']);

  // Tracking is cleared once the model answers.
  assert.equal(result.stateUpdate.ai.n1.lastSentOptions, undefined);
  assert.deepEqual(result.stateUpdate.ai.n1.history.at(-1), {
    role: 'assistant',
    content: 'Our plans start at 10 BHD per month.',
  });
});

test('a normal message keeps every declared tool', async () => {
  const mock = new MockLlmClient({ replies: ['Hello! How can I help?'] });

  const result = await executeAiAgentNode(
    {
      ...baseConfig,
      buttons: [{ id: 'btn_pricing', title: 'See pricing' }],
      listRows: [{ id: 'row_1', title: 'Row 1' }],
      handoverDepartments: [{ id: 'sales', title: 'Sales' }],
    },
    {
      nodeId: 'n1',
      context: {
        ai: {
          n1: { lastSentOptions: { titles: ['See pricing'], at: Date.now() } },
        },
      },
      userMessage: 'Do you deliver on Fridays?',
      client: mock,
      channel: 'whatsapp',
    }
  );

  assert.equal(result.nextHandle, 'success');
  const sentTools = (mock.requests[0].tools ?? []).map((tool) => tool.function.name);
  assert.deepEqual(sentTools, ['send_buttons', 'send_list', 'handover']);
});

test('an expired option title no longer counts as a click', async () => {
  const mock = new MockLlmClient({ replies: ['Sure.'] });

  const result = await executeAiAgentNode(
    {
      ...baseConfig,
      buttons: [{ id: 'btn_pricing', title: 'See pricing' }],
    },
    {
      nodeId: 'n1',
      context: {
        ai: {
          n1: {
            lastSentOptions: {
              titles: ['See pricing'],
              at: Date.now() - 6 * 60 * 1000, // older than OPTION_CLICK_TTL_MS
            },
          },
        },
      },
      userMessage: 'See pricing',
      client: mock,
      channel: 'whatsapp',
    }
  );

  assert.equal(result.nextHandle, 'success');
  const sentTools = (mock.requests[0].tools ?? []).map((tool) => tool.function.name);
  assert.deepEqual(sentTools, ['send_buttons']);
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
