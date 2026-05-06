import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const routeSource = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');
const auditRouteSource = readFileSync(new URL('../audit/route.ts', import.meta.url), 'utf8');

test('GitHub stars route uses an owner/repo API URL for this repository', () => {
  assert.match(routeSource, /GITHUB_REPO\s*=\s*['"]atharvnaik1\/ipaship-app-reviewer['"]/);
  assert.match(routeSource, /https:\/\/api\.github\.com\/repos\/\$\{GITHUB_REPO\}/);
  assert.doesNotMatch(routeSource, /api\.github\.com\/repos\/https:\/\/github\.com/);
  assert.doesNotMatch(routeSource, /GraciasAi-Appstore-Policy-Auditor-Opensource/);
});

test('audit route resolves API keys from the selected provider env var', () => {
  for (const envName of ['NVIDIA_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY']) {
    assert.match(auditRouteSource, new RegExp(`process\\.env\\.${envName}`));
  }

  assert.match(auditRouteSource, /providerApiKeys\[provider\]/);
  assert.match(auditRouteSource, /API key is required for \$\{provider\}/);
});
