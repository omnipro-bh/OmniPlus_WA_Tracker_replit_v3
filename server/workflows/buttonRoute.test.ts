/**
 * Phase 2.5 — option-click routing.
 *
 * An option (quick-reply button or list row) declared by an `action.ai_agent`
 * node must resume at that AI node with the option title as the visitor's next
 * turn, even when the owner drew edges from the per-option handles. Every other
 * node type keeps the historical edge resolution.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { findButtonTitle, resolveButtonRoute } from './flowRunner';

const aiNode = (id: string, config: Record<string, any>) => ({
  id,
  data: { type: 'action.ai_agent', config },
});

const messageNode = (id: string, type = 'input.text') => ({
  id,
  data: { type, config: {} },
});

test('AI-declared button routes back to the AI node even with a drawn edge', () => {
  const definition = {
    nodes: [
      aiNode('ai', { buttons: [{ id: 'btn_pricing', title: 'See pricing' }] }),
      messageNode('bridge'),
    ],
    edges: [{ source: 'ai', sourceHandle: 'btn_pricing', target: 'bridge' }],
  };

  assert.deepEqual(resolveButtonRoute(definition, 'btn_pricing'), {
    kind: 'ai',
    nodeId: 'ai',
    title: 'See pricing',
  });
});

test('AI-declared button routes back to the AI node with no edges at all', () => {
  const definition = {
    nodes: [aiNode('ai', { buttons: [{ id: 'btn_sales', title: 'Talk to sales' }] })],
    edges: [],
  };

  assert.deepEqual(resolveButtonRoute(definition, 'btn_sales'), {
    kind: 'ai',
    nodeId: 'ai',
    title: 'Talk to sales',
  });
});

test('AI-declared list row routes back to the AI node', () => {
  const definition = {
    nodes: [
      aiNode('ai', {
        listRows: [
          { id: 'row_cardio', title: 'Cardiology', description: 'Heart' },
          { id: 'row_derma', title: 'Dermatology' },
        ],
      }),
    ],
    edges: [],
  };

  assert.deepEqual(resolveButtonRoute(definition, 'row_cardio'), {
    kind: 'ai',
    nodeId: 'ai',
    title: 'Cardiology',
  });
  assert.equal(findButtonTitle(definition, 'row_derma'), 'Dermatology');
});

test('legacy interactive option keeps edge routing', () => {
  const definition = {
    nodes: [
      {
        id: 'qr',
        data: {
          type: 'quickReply',
          config: { buttons: [{ id: 'btn_a', title: 'A' }] },
        },
      },
      messageNode('after', 'message.text'),
    ],
    edges: [{ source: 'qr', sourceHandle: 'btn_a', target: 'after' }],
  };

  assert.deepEqual(resolveButtonRoute(definition, 'btn_a'), {
    kind: 'node',
    nodeId: 'after',
    sourceId: 'qr',
    sourceHandle: 'btn_a',
  });
});

test('unknown option id resolves to null', () => {
  const definition = {
    nodes: [aiNode('ai', { buttons: [{ id: 'btn_a', title: 'A' }] })],
    edges: [],
  };

  assert.equal(resolveButtonRoute(definition, 'nope'), null);
});
