python
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

export async function GET() {
  try {
    // Return cached value if available
    const cached = starsCache.get(CACHE_KEY);
    if (cached !== undefined) {
      return NextResponse.json({ stars: cached });
    }

    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
      // Ensure Next.js does not cache the request itself
      next: { revalidate: 0 },
    });

    // Rate‑limit handling
    if (res.status === 403) {
      const remaining = Number(res.headers.get('X-RateLimit-Remaining'));
      if (remaining === 0) {
        const reset = Number(res.headers.get('X-RateLimit-Reset')) * 1000;
        const resetDate = new Date(reset);
        return NextResponse.json(
          {
            error:
              `GitHub API rate limit exceeded. ` +
              `Limit resets at ${resetDate.toISOString()}.`,
          },
          { status: 429 }
        );
      }
    }

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(
        `GitHub API responded with ${res.status}: ${errorBody}`
      );
    }

    const data = await res.json();
    const stars = data.stargazers_count ?? 0;
    starsCache.set(CACHE_KEY, stars);

    return NextResponse.json({ stars });
  } catch (error: any) {
    console.error('GitHub Stars Error:', error);
    // Return a clear error message for the client
    return NextResponse.json(
      { error: error?.message ?? 'Unexpected error while fetching stars.' },
      { status: 500 }
    );
  }
}