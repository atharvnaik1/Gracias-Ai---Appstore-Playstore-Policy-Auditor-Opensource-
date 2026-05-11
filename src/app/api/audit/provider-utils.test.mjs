import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractTextFromProviderChunk,
  resolveProviderApiKey,
} from './provider-utils.ts';

test('resolveProviderApiKey prefers NVIDIA keys for NVIDIA provider', () => {
  const key = resolveProviderApiKey('nvidia', '', {
    NVIDIA_API_KEY: 'nvapi-key',
    ANTHROPIC_API_KEY: 'claude-key',
  });

  assert.equal(key, 'nvapi-key');
});

test('resolveProviderApiKey prefers Anthropic keys for Claude provider', () => {
  const key = resolveProviderApiKey('anthropic', '', {
    NVIDIA_API_KEY: 'nvapi-key',
    ANTHROPIC_API_KEY: 'claude-key',
  });

  assert.equal(key, 'claude-key');
});

test('resolveProviderApiKey lets user supplied key override environment keys', () => {
  const key = resolveProviderApiKey('nvidia', ' user-key ', {
    NVIDIA_API_KEY: 'nvapi-key',
  });

  assert.equal(key, 'user-key');
});

test('extractTextFromProviderChunk supports Anthropic message deltas', () => {
  const text = extractTextFromProviderChunk('anthropic', {
    delta: { text: 'claude text' },
  });

  assert.equal(text, 'claude text');
});

test('extractTextFromProviderChunk supports NVIDIA/OpenAI chat completion chunks', () => {
  const text = extractTextFromProviderChunk('nvidia', {
    choices: [{ delta: { content: 'nvidia text' } }],
  });

  assert.equal(text, 'nvidia text');
});

test('extractTextFromProviderChunk supports Gemini stream chunks', () => {
  const text = extractTextFromProviderChunk('gemini', {
    candidates: [
      {
        content: {
          parts: [{ text: 'gemini text' }],
        },
      },
    ],
  });

  assert.equal(text, 'gemini text');
});
