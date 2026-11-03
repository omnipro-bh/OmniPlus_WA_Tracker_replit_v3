/**
 * Phase 1 AI Agent node — history trimming / token estimate tests.
 *
 * Inspector note: these cover the two behaviours the investigation flagged as
 * load-bearing — the 12-message cap and the 8 KB byte cap, plus the Arabic vs
 * Latin token density used for logging.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_HISTORY_BYTES,
  MAX_HISTORY_MESSAGES,
  approxTokens,
  buildChatContext,
  historyBytes,
  trimHistory,
} from './contextBuilder';
import type { LlmMessage } from './types';

function turns(count: number): LlmMessage[] {
  const messages: LlmMessage[] = [];
  for (let i = 0; i < count; i++) {
    messages.push({ role: 'user', content: `user message ${i}` });
    messages.push({ role: 'assistant', content: `assistant reply ${i}` });
  }
  return messages;
}

test('trimHistory keeps only the newest MAX_HISTORY_MESSAGES', () => {
  const history = turns(30); // 60 messages
  const trimmed = trimHistory(history);

  assert.equal(trimmed.length, MAX_HISTORY_MESSAGES);
  // The newest turn survives; the oldest is gone.
  assert.equal(trimmed[trimmed.length - 1].content, 'assistant reply 29');
  assert.equal(trimmed[0].content, 'user message 24');
});

test('trimHistory honours an explicit message limit', () => {
  const trimmed = trimHistory(turns(5), { maxMessages: 4 });

  assert.equal(trimmed.length, 4);
  assert.deepEqual(
    trimmed.map((message) => message.content),
    ['user message 3', 'assistant reply 3', 'user message 4', 'assistant reply 4']
  );
});

test('trimHistory drops oldest messages until the byte budget is met', () => {
  // Four 400-char messages ≈ 1.7 KB; a 1 KB budget must drop the oldest ones.
  const history: LlmMessage[] = Array.from({ length: 4 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `${i}-${'x'.repeat(400)}`,
  }));

  const trimmed = trimHistory(history, { maxBytes: 1024, maxMessages: 100 });

  assert.ok(trimmed.length < history.length, 'expected some messages to be dropped');
  assert.ok(historyBytes(trimmed) <= 1024, `expected <= 1024 bytes, got ${historyBytes(trimmed)}`);
  // Newest message is always kept.
  assert.equal(trimmed[trimmed.length - 1].content, history[history.length - 1].content);
});

test('trimHistory truncates a single oversized message instead of dropping it', () => {
  const history: LlmMessage[] = [{ role: 'user', content: 'y'.repeat(5000) }];

  const trimmed = trimHistory(history, { maxBytes: 512 });

  assert.equal(trimmed.length, 1);
  assert.ok(trimmed[0].content.length < 5000);
  assert.ok(historyBytes(trimmed) <= 512);
});

test('trimHistory ignores malformed entries and never throws', () => {
  const messy: any[] = [
    null,
    undefined,
    { role: 'user' },
    { role: 'tool', content: 'not a chat role' },
    { role: 'user', content: '' },
    { role: 'user', content: 'valid' },
  ];

  assert.deepEqual(trimHistory(messy as LlmMessage[]), [{ role: 'user', content: 'valid' }]);
  assert.deepEqual(trimHistory(undefined as any), []);
});

test('approxTokens: Arabic is denser than Latin for the same character count', () => {
  const latin = 'a'.repeat(40);
  const arabic = 'م'.repeat(40);

  const latinTokens = approxTokens(latin);
  const arabicTokens = approxTokens(arabic);

  assert.equal(latinTokens, 10); // 40 / 4
  assert.equal(arabicTokens, 20); // 40 / 2
  assert.ok(arabicTokens > latinTokens);
  assert.equal(approxTokens(''), 0);
});

test('buildChatContext orders system, history, then the user turn', () => {
  const messages = buildChatContext({
    systemPrompt: 'SYSTEM',
    history: [
      { role: 'user', content: 'earlier question' },
      { role: 'assistant', content: 'earlier answer' },
    ],
    userMessage: 'latest question',
  });

  assert.deepEqual(messages.map((message) => message.role), [
    'system',
    'user',
    'assistant',
    'user',
  ]);
  assert.equal(messages[0].content, 'SYSTEM');
  assert.equal(messages[3].content, 'latest question');
});

test('buildChatContext omits an empty system prompt and empty user turn', () => {
  const messages = buildChatContext({ systemPrompt: '   ', userMessage: '  hello  ' });

  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0], { role: 'user', content: 'hello' });
});

test('MAX_HISTORY_BYTES matches the locked Phase 1 budget', () => {
  assert.equal(MAX_HISTORY_BYTES, 8 * 1024);
  assert.equal(MAX_HISTORY_MESSAGES, 12);
});
