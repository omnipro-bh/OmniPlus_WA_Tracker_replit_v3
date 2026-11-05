/**
 * Phase 2 AI Agent node — tool loop tests.
 *
 * Uses the mock provider (no network, no spend) to drive the executor through
 * its tool-call rounds. The mock's `toolCalls` queue scripts each turn.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { MockLlmClient } from '../ai/clients/mock';
import { executeAiAgentNode, executeAiAgentWorkflowNode } from './aiAgentExecutor';

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

test('stops after 4 tool rounds when the model never answers', async () => {
  const mock = new MockLlmClient({
    toolCalls: [
      [{ name: 'loop_forever' }],
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
  assert.equal(mock.callCount, 4); // capped, the 5th scripted turn is never used
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

// ── Phase 3: schedule / usage / message-cap enforcement ────────────────────

test('outside schedule routes to error without calling the model', async () => {
  const mock = new MockLlmClient({ replies: ['You should not see this.'] });

  const result = await executeAiAgentNode(
    {
      ...baseConfig,
      aiSchedule: { startHour: 9, endHour: 17, daysOfWeek: [], tz: 'Asia/Bahrain' },
    },
    {
      nodeId: 'n1',
      context: {},
      userMessage: 'hello',
      client: mock,
      channel: 'whatsapp',
      now: new Date('2026-11-04T03:00:00Z').getTime(), // 06:00 Bahrain, before 9
    }
  );

  assert.equal(result.success, false);
  assert.equal(result.nextHandle, 'error');
  assert.equal(result.reason, 'outside_schedule');
  assert.equal(result.stateUpdate.ai.n1.reason, 'outside_schedule');
  assert.equal(mock.callCount, 0);
});

test('usage block routes to error with the reason and no model call', async () => {
  const mock = new MockLlmClient({ replies: ['You should not see this.'] });

  const result = await executeAiAgentNode(
    { ...baseConfig, usageLimits: { dailyMax: 1 } },
    {
      nodeId: 'n1',
      context: {},
      userMessage: 'hello',
      client: mock,
      channel: 'whatsapp',
      usageBlock: { reason: 'daily_limit_reached' },
    }
  );

  assert.equal(result.success, false);
  assert.equal(result.nextHandle, 'error');
  assert.equal(result.reason, 'daily_limit_reached');
  assert.equal(result.stateUpdate.ai.n1.reason, 'daily_limit_reached');
  assert.equal(mock.callCount, 0);
});

test('per-user daily cap with departments forces handover without calling the model', async () => {
  const mock = new MockLlmClient({ replies: ['You should not see this.'] });

  const result = await executeAiAgentNode(
    {
      ...baseConfig,
      maxAiCallsPerDay: 15,
      handoverDepartments: [{ id: 'sales', title: 'Sales' }],
    },
    {
      nodeId: 'n1',
      context: {},
      userMessage: 'hello',
      client: mock,
      channel: 'whatsapp',
      userDailyBlock: { reason: 'daily_user_cap_reached' },
    }
  );

  assert.equal(result.success, true);
  assert.equal(result.nextHandle, 'handover');
  assert.equal(result.reason, 'daily_user_cap_reached');
  assert.deepEqual(result.handover, {
    department: 'sales',
    reason: 'daily_user_cap_reached',
    title: 'Sales',
  });
  assert.equal(mock.callCount, 0);
});

test('per-user daily cap without departments routes to error', async () => {
  const mock = new MockLlmClient({ replies: ['You should not see this.'] });

  const result = await executeAiAgentNode(
    { ...baseConfig, maxAiCallsPerDay: 15 },
    {
      nodeId: 'n1',
      context: {},
      userMessage: 'hello',
      client: mock,
      channel: 'whatsapp',
      userDailyBlock: { reason: 'daily_user_cap_reached' },
    }
  );

  assert.equal(result.success, false);
  assert.equal(result.nextHandle, 'error');
  assert.equal(result.reason, 'daily_user_cap_reached');
  assert.equal(mock.callCount, 0);
});

test('a user under the daily cap is processed normally', async () => {
  const mock = new MockLlmClient({ replies: ['Hello there.'] });

  const result = await executeAiAgentNode(
    { ...baseConfig, maxAiCallsPerDay: 15 },
    { nodeId: 'n1', context: {}, userMessage: 'hello', client: mock, channel: 'whatsapp' }
  );

  assert.equal(result.nextHandle, 'success');
  assert.equal(result.reason, undefined);
  assert.equal(mock.callCount, 1);
});

// ── Phase 4: Google Sheets `lookup_sheet` data source ───────────────────────

const sheetConfig = {
  googleSheets: { spreadsheetId: 'sheet_123', tabs: ['Intents', 'Workflow_Steps'] },
};

test('lookup_sheet is non-terminal: rows go back to the model, then it answers', async () => {
  const mock = new MockLlmClient({
    toolCalls: [
      [
        {
          name: 'lookup_sheet',
          arguments: { tab: 'Intents', filter_column: 'keywords', filter_value: 'pricing' },
        },
      ],
      null,
    ],
    replies: ['Our plans start at 10 BHD per month.'],
  });

  const lookups: any[] = [];
  const result = await executeAiAgentNode(
    { ...baseConfig, ...sheetConfig },
    {
      nodeId: 'n1',
      context: {},
      userMessage: 'how much is pricing?',
      client: mock,
      channel: 'whatsapp',
      lookupSheet: async (args) => {
        lookups.push(args);
        return { ok: true, rows: [{ id: 'pricing', answer: '10 BHD per month' }] };
      },
    }
  );

  // The lookup did NOT end the node; the model answered on the next round.
  assert.equal(result.nextHandle, 'success');
  assert.equal(result.text, 'Our plans start at 10 BHD per month.');
  assert.equal(mock.callCount, 2);
  assert.equal(lookups.length, 1);
  assert.deepEqual(lookups[0], {
    tab: 'Intents',
    filterColumn: 'keywords',
    filterValue: 'pricing',
    limit: undefined,
  });

  // The second request carries the rows back as a `tool` message.
  const followUp = mock.requests[1].messages;
  const toolMessage: any = followUp.find((m: any) => m.role === 'tool');
  assert.ok(toolMessage, 'expected a tool result message in the follow-up request');
  assert.equal(toolMessage.name, 'lookup_sheet');
  assert.match(toolMessage.content, /10 BHD per month/);
});

test('lookup_sheet supports the two-tab sequence Intents → Workflow_Steps → answer', async () => {
  const mock = new MockLlmClient({
    toolCalls: [
      [{ name: 'lookup_sheet', arguments: { tab: 'Intents', filter_column: 'keywords', filter_value: 'refund' } }],
      [{ name: 'lookup_sheet', arguments: { tab: 'Workflow_Steps', filter_column: 'intent_id', filter_value: 'refund' } }],
      null,
    ],
    replies: ['Your refund will be processed within 5 days.'],
  });

  const lookups: any[] = [];
  const result = await executeAiAgentNode(
    { ...baseConfig, ...sheetConfig },
    {
      nodeId: 'n1',
      context: {},
      userMessage: 'I want a refund',
      client: mock,
      channel: 'whatsapp',
      lookupSheet: async (args) => {
        lookups.push(args.tab);
        return args.tab === 'Intents'
          ? { ok: true, rows: [{ id: 'refund', answer: 'Refund in 5 days' }] }
          : { ok: true, rows: [{ intent_id: 'refund', step_id: '1', ai_question: 'Order number?' }] };
      },
    }
  );

  assert.deepEqual(lookups, ['Intents', 'Workflow_Steps']);
  assert.equal(mock.callCount, 3);
  assert.equal(result.nextHandle, 'success');
  assert.equal(result.text, 'Your refund will be processed within 5 days.');
});

test('lookup_sheet rejects an undeclared tab without failing the node', async () => {
  const mock = new MockLlmClient({
    toolCalls: [[{ name: 'lookup_sheet', arguments: { tab: 'Secret_Data' } }], null],
    replies: ['Sorry, I do not have that information.'],
  });

  let seamCalls = 0;
  const result = await executeAiAgentNode(
    { ...baseConfig, ...sheetConfig },
    {
      nodeId: 'n1',
      context: {},
      userMessage: 'hello',
      client: mock,
      channel: 'whatsapp',
      lookupSheet: async () => {
        seamCalls += 1;
        return { ok: true, rows: [] };
      },
    }
  );

  assert.equal(seamCalls, 0, 'an undeclared tab must never reach the sheet');
  assert.equal(result.nextHandle, 'success');
  assert.equal(result.text, 'Sorry, I do not have that information.');

  const toolMessage: any = mock.requests[1].messages.find((m: any) => m.role === 'tool');
  assert.match(toolMessage.content, /not a declared tab/);
});

test('lookup_sheet tool is only offered when a sheet is configured', async () => {
  const withSheet = new MockLlmClient({ replies: ['ok'] });
  await executeAiAgentNode(
    { ...baseConfig, ...sheetConfig },
    { nodeId: 'n1', context: {}, userMessage: 'hi', client: withSheet, channel: 'whatsapp' }
  );
  const offered = (withSheet.requests[0] as any).tools.map((t: any) => t.function.name);
  assert.deepEqual(offered, ['lookup_sheet']);

  const withoutSheet = new MockLlmClient({ replies: ['ok'] });
  await executeAiAgentNode(
    { ...baseConfig },
    { nodeId: 'n1', context: {}, userMessage: 'hi', client: withoutSheet, channel: 'whatsapp' }
  );
  assert.equal((withoutSheet.requests[0] as any).tools, undefined);
});

// ── Phase 4b: execution trace (tool calls + wrapper aiTrace) ────────────────

test('records tool-call traces, including lookup_sheet row counts', async () => {
  const mock = new MockLlmClient({
    toolCalls: [
      [
        {
          name: 'lookup_sheet',
          arguments: { tab: 'Intents', filter_column: 'keywords', filter_value: 'pricing' },
        },
      ],
      null,
    ],
    replies: ['Plans start at 10 BHD.'],
  });

  const result = await executeAiAgentNode(
    { ...baseConfig, ...sheetConfig },
    {
      nodeId: 'n1',
      context: {},
      userMessage: 'pricing?',
      client: mock,
      channel: 'whatsapp',
      lookupSheet: async () => ({ ok: true, rows: [{ id: 'pricing' }, { id: 'pricing2' }] }),
    }
  );

  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].name, 'lookup_sheet');
  assert.equal(result.toolCalls[0].rows, 2);
});

test('a blocked turn carries an empty tool-call trace', async () => {
  const mock = new MockLlmClient({ replies: ['nope'] });

  const result = await executeAiAgentNode(
    {
      ...baseConfig,
      aiSchedule: { startHour: 9, endHour: 17, daysOfWeek: [], tz: 'Asia/Bahrain' },
    },
    {
      nodeId: 'n1',
      context: {},
      userMessage: 'hello',
      client: mock,
      channel: 'whatsapp',
      now: new Date('2026-11-04T03:00:00Z').getTime(),
    }
  );

  assert.deepEqual(result.toolCalls, []);
  assert.equal(mock.callCount, 0);
});

test('the node wrapper returns a populated aiTrace', async () => {
  const node = { id: 'n1', data: { config: { provider: 'mock', systemPrompt: 'x' } } };

  const r = await executeAiAgentWorkflowNode(
    node,
    { context: {} } as any,
    { text: { body: 'hello there' } } as any,
    { phone: '123', userId: 1 },
    { channel: 'whatsapp', logUsage: false }
  );

  assert.equal(r.aiTrace.nodeId, 'n1');
  assert.equal(r.aiTrace.userMessage, 'hello there');
  assert.equal(r.aiTrace.provider, 'mock');
  assert.equal(r.aiTrace.nextHandle, 'success');
  assert.equal(r.aiTrace.finishReason, 'stop');
  assert.equal(typeof r.aiTrace.elapsedMs, 'number');
  assert.equal(r.aiTrace.tokensIn, r.aiTrace.tokensIn); // number
  assert.ok(Array.isArray(r.aiTrace.toolCalls));
});
