type Env = Record<string, string | undefined>;

const PROVIDER_ENV_KEYS: Record<string, string[]> = {
  nvidia: ['NVIDIA_API_KEY', 'NVIDIA_KEY', 'NEXT_PUBLIC_NVIDIA_API_KEY', 'NEXT_PUBLIC_API_KEY'],
  ipaship: ['NVIDIA_API_KEY', 'NVIDIA_KEY', 'NEXT_PUBLIC_NVIDIA_API_KEY', 'NEXT_PUBLIC_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'NEXT_PUBLIC_ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY', 'NEXT_PUBLIC_OPENAI_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'NEXT_PUBLIC_GEMINI_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY', 'NEXT_PUBLIC_OPENROUTER_API_KEY'],
};

export function resolveProviderApiKey(
  provider: string,
  userProvidedKey: string | undefined,
  env: Env = process.env
): string {
  const trimmedUserKey = userProvidedKey?.trim();
  if (trimmedUserKey) return trimmedUserKey;

  const keys = PROVIDER_ENV_KEYS[provider] || [];
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }

  return '';
}

export function extractTextFromProviderChunk(
  provider: string,
  parsed: any
): string {
  if (!parsed) return '';

  if (provider === 'anthropic') {
    return parsed.delta?.text || '';
  }

  if (provider === 'gemini') {
    return (
      parsed.candidates?.[0]?.content?.parts
        ?.map((part: any) => part?.text || '')
        .join('') || ''
    );
  }

  return parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.message?.content || '';
}
