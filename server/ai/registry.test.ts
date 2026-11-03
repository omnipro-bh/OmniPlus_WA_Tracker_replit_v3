/**
 * Phase 1 AI Agent node — provider registry tests.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PROVIDER,
  LLM_PROVIDERS,
  clearLlmClientCache,
  getLlmClient,
  isLlmProviderId,
  listLlmProviders,
  resolveApiKey,
  resolveModel,
} from './registry';
import { MockLlmClient } from './clients/mock';
import { OpenAiCompatibleClient } from './clients/openaiCompatible';

function withEnv(key: string, value: string | undefined): () => void {
  const previous = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;

  return () => {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  };
}

test('registry exposes the three Phase 1 providers', () => {
  assert.deepEqual(listLlmProviders().map((provider) => provider.id).sort(), [
    'deepseek',
    'groq',
    'mock',
  ]);
  assert.equal(DEFAULT_PROVIDER, 'deepseek');
});

test('provider definitions carry the locked base URLs and models', () => {
  assert.equal(LLM_PROVIDERS.deepseek.baseURL, 'https://api.deepseek.com/v1');
  assert.equal(LLM_PROVIDERS.deepseek.defaultModel, 'deepseek-flash');
  assert.equal(LLM_PROVIDERS.deepseek.envKey, 'DEEPSEEK_API_KEY');

  assert.equal(LLM_PROVIDERS.groq.baseURL, 'https://api.groq.com/openai/v1');
  assert.equal(LLM_PROVIDERS.groq.defaultModel, 'qwen/qwen3.8-27b');
  assert.equal(LLM_PROVIDERS.groq.envKey, 'GROQ_API_KEY');

  assert.equal(LLM_PROVIDERS.mock.envKey, null);
});

test('isLlmProviderId rejects unknown providers', () => {
  assert.equal(isLlmProviderId('deepseek'), true);
  assert.equal(isLlmProviderId('groq'), true);
  assert.equal(isLlmProviderId('mock'), true);
  assert.equal(isLlmProviderId('openai'), false);
  assert.equal(isLlmProviderId(undefined), false);
});

test('resolveModel falls back to the provider default', () => {
  assert.equal(resolveModel('deepseek', ''), 'deepseek-flash');
  assert.equal(resolveModel('groq', '   '), 'qwen/qwen3.8-27b');
  assert.equal(resolveModel('groq', ' openai/gpt-oss-120b '), 'openai/gpt-oss-120b');
});

test('mock needs no API key and is cached', () => {
  clearLlmClientCache();

  const first = getLlmClient('mock');
  const second = getLlmClient('mock');

  assert.ok(first instanceof MockLlmClient);
  assert.equal(first, second, 'expected the same cached instance');
});

test('deepseek without DEEPSEEK_API_KEY throws a configuration error', () => {
  const restore = withEnv('DEEPSEEK_API_KEY', undefined);
  clearLlmClientCache();

  try {
    assert.throws(() => getLlmClient('deepseek'), /DEEPSEEK_API_KEY/);
  } finally {
    restore();
    clearLlmClientCache();
  }
});

test('groq with a key resolves to the OpenAI-compatible client and is cached', () => {
  const restore = withEnv('GROQ_API_KEY', 'test-key-not-used');
  clearLlmClientCache();

  try {
    const client = getLlmClient('groq');
    assert.ok(client instanceof OpenAiCompatibleClient);
    assert.equal(client.id, 'groq');
    assert.equal(client.defaultModel, 'qwen/qwen3.8-27b');
    assert.equal(getLlmClient('groq'), client, 'expected the same cached instance');
  } finally {
    restore();
    clearLlmClientCache();
  }
});

test('clearLlmClientCache forces a rebuild', () => {
  const restore = withEnv('DEEPSEEK_API_KEY', 'test-key-not-used');
  clearLlmClientCache();

  try {
    const first = getLlmClient('deepseek');
    clearLlmClientCache();
    const second = getLlmClient('deepseek');

    assert.notEqual(first, second);
  } finally {
    restore();
    clearLlmClientCache();
  }
});

test('resolveApiKey ignores blank values', () => {
  const restore = withEnv('GROQ_API_KEY', '   ');

  try {
    assert.equal(resolveApiKey('groq'), null);
    assert.equal(resolveApiKey('mock'), null);
  } finally {
    restore();
  }
});
