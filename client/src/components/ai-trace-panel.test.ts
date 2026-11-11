/**
 * AI Trace Panel — raw JSON presentation.
 *
 * The panel used to render the raw JSON inside a Radix `ScrollArea`. That
 * ScrollArea's viewport is `height: 100%` of an auto-height parent, so it grew
 * to the full height of the JSON, Radix never enabled its scrollbar
 * (`contentHeight === viewportHeight`) and the root clipped the payload at
 * 400px with `overflow: hidden` — the tail of the JSON was unreachable.
 *
 * These tests pin the fix: a native scroll container, the complete JSON in the
 * markup, and a copy button that copies the full payload.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The component is TSX compiled with the classic JSX runtime under `tsx`, so
// the React global must exist before it is imported.
(globalThis as any).React = React;

const { AiTracePanel, buildRawJson, copyRawJson } = await import('./ai-trace-panel');

const TRACE = {
  id: 9948,
  executedAt: '2026-11-11T09:30:11.775917Z',
  channel: 'sandbox',
  phone: 'sandbox_mwbx3a5zxqs2qqys',
  messageType: 'text',
  status: 'success',
  aiTrace: {
    text: 'I could not find anything matching that.',
    model: 'qwen/qwen3.8-27b',
    nodeId: 'action.ai_agent_1793717615091',
    provider: 'groq',
    tokensIn: 1890,
    tokensOut: 74,
    elapsedMs: 1937,
    toolCalls: [
      {
        args: { tab: 'Workflow_Steps', filter_column: 'intent_id', filter_value: '1' },
        name: 'lookup_sheet',
        rows: 8,
      },
      {
        args: {
          tab: 'Doctors_Schedule',
          filter: 'search {"category":"blood test","location":"Riffa","day":"wednesday"}',
        },
        name: 'lookup_sheet',
        rows: 0,
      },
    ],
    nextHandle: 'success',
    sheetState: {
      intentId: '1',
      stepId: null,
      slots: { department: 'blood test', confirm: 'Yes', location: 'Riffa', datetime: '5 PM today' },
    },
    unanswered: true,
    userMessage: '5 PM today',
    fallbackUsed: false,
    finishReason: 'stop',
  },
} as any;

function render(trace: any = TRACE): string {
  return renderToStaticMarkup(React.createElement(AiTracePanel, { trace }));
}

/** React escapes the JSON for HTML — decode it back before comparing. */
function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** The content of the raw-JSON <pre> element. */
function rawJsonBlock(html: string): string {
  const match = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
  assert.ok(match, 'the raw JSON <pre> is rendered');
  return decodeHtml(match![1]);
}

test('the raw JSON panel shows every line of the payload', () => {
  const html = render();
  const raw = buildRawJson(TRACE);
  const lines = raw.split('\n');

  assert.ok(lines.length > 20, 'the fixture is long enough to be clipped');

  // The rendered block is the complete payload — line for line, nothing cut.
  const rendered = rawJsonBlock(html);
  assert.equal(rendered.split('\n').length, lines.length);
  assert.equal(rendered, raw);

  // Spot-check the tail, which the old ScrollArea made unreachable.
  const tail = lines.slice(-6).map((line) => line.trim()).filter(Boolean);
  for (const line of tail) {
    assert.ok(rendered.includes(line), `the tail line "${line}" is visible`);
  }
});

test('the raw JSON panel is a native scroll container, not the clipped ScrollArea', () => {
  const html = render();

  // A real scroll container: `overflow-auto` on the <pre>.
  assert.match(html, /<pre class="[^"]*overflow-auto[^"]*"/);
  // The Radix ScrollArea viewport (the thing that clipped the JSON) is gone.
  assert.doesNotMatch(html, /data-radix-scroll-area-viewport/);
});

test('the copy button copies the full JSON to the clipboard', async () => {
  const html = render();
  assert.match(html, /Copy to Clipboard/);

  let copied: string | null = null;
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (text: string) => {
          copied = text;
        },
      },
    },
  });

  try {
    const ok = await copyRawJson(buildRawJson(TRACE));
    assert.equal(ok, true);
    assert.equal(copied, JSON.stringify(TRACE, null, 2));
    assert.equal((copied as unknown as string).split('\n').length, JSON.stringify(TRACE, null, 2).split('\n').length);
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete (globalThis as any).navigator;
  }
});

test('copyRawJson reports failure instead of throwing when the clipboard is blocked', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText: async () => {
          throw new Error('denied');
        },
      },
    },
  });

  try {
    assert.equal(await copyRawJson('{}'), false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete (globalThis as any).navigator;
  }
});
