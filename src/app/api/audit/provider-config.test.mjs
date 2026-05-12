import test from 'node:test';
import assert from 'node:assert/strict';

import { extractStreamText, resolveProviderApiKey } from './provider-config.ts';

test('resolveProviderApiKey prefers a submitted BYOK value over env fallbacks', () => {
  const env = {
    NVIDIA_API_KEY: 'env-nvidia-key',
    ANTHROPIC_API_KEY: 'env-anthropic-key',
  };

  assert.equal(resolveProviderApiKey('nvidia', ' submitted-key ', env), 'submitted-key');
  assert.equal(resolveProviderApiKey('anthropic', ' submitted-claude-key ', env), 'submitted-claude-key');
});

test('resolveProviderApiKey uses provider-specific environment fallbacks', () => {
  const env = {
    NVIDIA_KEY: 'env-nvidia-key',
    CLAUDE_API_KEY: 'env-claude-key',
    OPENAI_API_KEY: 'env-openai-key',
    GEMINI_API_KEY: 'env-gemini-key',
    OPENROUTER_API_KEY: 'env-openrouter-key',
  };

  assert.equal(resolveProviderApiKey('ipaship', '', env), 'env-nvidia-key');
  assert.equal(resolveProviderApiKey('nvidia', '', env), 'env-nvidia-key');
  assert.equal(resolveProviderApiKey('anthropic', '', env), 'env-claude-key');
  assert.equal(resolveProviderApiKey('openai', '', env), 'env-openai-key');
  assert.equal(resolveProviderApiKey('gemini', '', env), 'env-gemini-key');
  assert.equal(resolveProviderApiKey('openrouter', '', env), 'env-openrouter-key');
});

test('extractStreamText supports Anthropic, OpenAI-compatible, NVIDIA, and Gemini chunks', () => {
  assert.equal(extractStreamText({ delta: { text: 'claude' } }), 'claude');
  assert.equal(extractStreamText({ choices: [{ delta: { content: 'openai' } }] }), 'openai');
  assert.equal(extractStreamText({ choices: [{ text: 'legacy' }] }), 'legacy');
  assert.equal(
    extractStreamText({ candidates: [{ content: { parts: [{ text: 'gem' }, { text: 'ini' }] } }] }),
    'gemini'
  );
});
