import { NextResponse } from 'next/server';
import { LRUCache } from 'lru-cache';

export const revalidate = 0;

const starsCache = new LRUCache<string, number>({
  max: 1,
  ttl: 1000 * 60 * 5, // 5 minutes
});

export const GITHUB_REPO = 'atharvnaik1/ipaship-app-reviewer';
export const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}`;
const CACHE_KEY = 'stars';

export async function GET() {
  try {
    const cached = starsCache.get(CACHE_KEY);
    if (cached !== undefined) {
      return NextResponse.json({ stars: cached });
    }

    const res = await fetch(GITHUB_API_URL, {
      headers: { Accept: 'application/vnd.github.v3+json' },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      throw new Error(`GitHub API responded with ${res.status}`);
    }

    const data = await res.json();
    const stars = data.stargazers_count ?? 0;
    starsCache.set(CACHE_KEY, stars);

    return NextResponse.json({ stars });
  } catch (error) {
    console.error('GitHub Stars Error:', error);
    return NextResponse.json({ stars: 0 });
  }
}
