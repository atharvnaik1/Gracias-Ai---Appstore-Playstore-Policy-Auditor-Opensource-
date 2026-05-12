export type AuditProvider =
  | 'ipaship'
  | 'nvidia'
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'openrouter';

export const VALID_PROVIDERS = new Set<AuditProvider>([
  'ipaship',
  'nvidia',
  'anthropic',
  'openai',
  'gemini',
  'openrouter',
]);

export function isValidProvider(provider: string): provider is AuditProvider {
  return VALID_PROVIDERS.has(provider as AuditProvider);
}

const PROVIDER_ENV_KEYS: Record<AuditProvider, string[]> = {
  ipaship: ['NVIDIA_API_KEY', 'NVIDIA_KEY', 'NEXT_PUBLIC_API_KEY'],
  nvidia: ['NVIDIA_API_KEY', 'NVIDIA_KEY', 'NEXT_PUBLIC_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'NEXT_PUBLIC_API_KEY'],
  openai: ['OPENAI_API_KEY', 'NEXT_PUBLIC_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'NEXT_PUBLIC_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY', 'NEXT_PUBLIC_API_KEY'],
};

export function resolveProviderApiKey(
  provider: string,
  submittedApiKey: string | undefined,
  env: Record<string, string | undefined> = process.env
): string {
  const submitted = submittedApiKey?.trim();
  if (submitted) return submitted;

  const envKeys = PROVIDER_ENV_KEYS[provider as AuditProvider] || [];
  for (const key of envKeys) {
    const value = env[key]?.trim();
    if (value) return value;
  }

  return '';
}

export function getProviderApiKeyError(provider: string): string {
  switch (provider) {
    case 'anthropic':
      return 'Anthropic API key is required. Enter a Claude key or set ANTHROPIC_API_KEY/CLAUDE_API_KEY.';
    case 'openai':
      return 'OpenAI API key is required. Enter a key or set OPENAI_API_KEY.';
    case 'gemini':
      return 'Gemini API key is required. Enter a key or set GEMINI_API_KEY/GOOGLE_API_KEY.';
    case 'openrouter':
      return 'OpenRouter API key is required. Enter a key or set OPENROUTER_API_KEY.';
    case 'nvidia':
    case 'ipaship':
    default:
      return 'NVIDIA API key is required. Enter a key or set NVIDIA_API_KEY/NVIDIA_KEY.';
  }
}

export function extractStreamText(parsed: any): string {
  if (!parsed || typeof parsed !== 'object') return '';

  const anthropicText = parsed.delta?.text;
  if (typeof anthropicText === 'string') return anthropicText;

  const choice = parsed.choices?.[0];
  const openAiCompatibleText = choice?.delta?.content ?? choice?.message?.content ?? choice?.text;
  if (typeof openAiCompatibleText === 'string') return openAiCompatibleText;

  const geminiParts = parsed.candidates?.[0]?.content?.parts;
  if (Array.isArray(geminiParts)) {
    return geminiParts
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('');
  }

  return '';
}
