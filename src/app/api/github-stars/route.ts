typescript
import { NextResponse } from 'next/server';
import { LRUCache } from 'lru-cache';

export const revalidate = 0;

// 5‑minute in‑memory cache for GitHub API responses
const starsCache = new LRUCache<string, number>({
  max: 1,
  ttl: 1000 * 60 * 5, // 5 minutes
});

// Repository identifier in the format "owner/repo"
const REPO = 'atharvnaik1/GraciasAi-Appstore-Policy-Auditor-Opensource';
const CACHE_KEY = 'stars';

// Helper to build consistent JSON responses
function jsonResponse(payload: object, status = 200) {
  return NextResponse.json(payload, { status });
}

// Validate that a GitHub token is provided
function getGitHubToken(): string | null {
  return process.env.GITHUB_TOKEN?.trim() || null;
}

export async function GET() {
  try {
    // Return cached value if available
    const cached = starsCache.get(CACHE_KEY);
    if (cached !== undefined) {
      return jsonResponse({ stars: cached });
    }

    const token = getGitHubToken();
    if (!token) {
      return jsonResponse(
        { error: 'GitHub token is missing. Set GITHUB_TOKEN environment variable.' },
        401
      );
    }

    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `token ${token}`,
      },
      // Ensure Next.js does not cache the request itself
      next: { revalidate: 0 },
    });

    // Rate‑limit handling (GitHub may return 403 or 429)
    if (res.status === 403 || res.status === 429) {
      const remaining = Number(res.headers.get('X-RateLimit-Remaining'));
      const reset = Number(res.headers.get('X-RateLimit-Reset')) * 1000;
      const resetDate = new Date(reset);
      if (remaining === 0) {
        return jsonResponse(
          {
            error: `GitHub API rate limit exceeded. Limit resets at ${resetDate.toISOString()}.`,
          },
          429
        );
      }
    }

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`GitHub API responded with ${res.status}: ${errorBody}`);
    }

    const data = await res.json();
    const stars = data.stargazers_count ?? 0;
    starsCache.set(CACHE_KEY, stars);

    return jsonResponse({ stars });
  } catch (error: any) {
    console.error('GitHub Stars Error:', error);
    return jsonResponse(
      { error: error?.message ?? 'Unexpected error while fetching stars.' },
      500
    );
  }
}