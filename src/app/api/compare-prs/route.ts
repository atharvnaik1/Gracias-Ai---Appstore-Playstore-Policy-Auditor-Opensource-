import { NextRequest, NextResponse } from 'next/server';

export const revalidate = 0;

type PullRequestInput = {
  url: string;
};

type GitHubPullRequest = {
  html_url: string;
  number: number;
  title: string;
  state: string;
  draft: boolean;
  additions: number;
  deletions: number;
  changed_files: number;
  commits: number;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  mergeable_state?: string;
  user?: {
    login: string;
  };
  base: {
    ref: string;
    repo: {
      full_name: string;
    };
  };
  head: {
    ref: string;
    repo: {
      full_name: string;
    } | null;
  };
};

type GitHubFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
};

type PullRequestSummary = {
  url: string;
  title: string;
  number: number;
  author: string;
  state: string;
  draft: boolean;
  updatedAt: string;
  base: string;
  head: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: number;
  score: number;
  strengths: string[];
  risks: string[];
  testFiles: string[];
  importantFiles: string[];
  fileTypes: Record<string, number>;
};

const GITHUB_PR_URL_RE = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)\/?$/i;

function parsePullRequestUrl(url: string) {
  const match = url.trim().match(GITHUB_PR_URL_RE);
  if (!match) {
    return null;
  }

  return {
    owner: match[1],
    repo: match[2],
    number: Number(match[3]),
  };
}

function githubHeaders() {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'ipaship-pr-compare',
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: githubHeaders(),
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('GitHub API rate limit reached. Set GITHUB_TOKEN in the server environment and try again.');
    }

    throw new Error(`GitHub API returned ${response.status} for ${url}`);
  }

  return response.json() as Promise<T>;
}

function fileExtension(filename: string) {
  const lastSegment = filename.split('/').pop() || filename;
  const dotIndex = lastSegment.lastIndexOf('.');
  if (dotIndex <= 0) {
    return 'no extension';
  }

  return lastSegment.slice(dotIndex + 1).toLowerCase();
}

function isTestFile(filename: string) {
  const lower = filename.toLowerCase();
  return (
    lower.includes('__tests__') ||
    lower.includes('/test/') ||
    lower.includes('/tests/') ||
    lower.endsWith('.test.ts') ||
    lower.endsWith('.test.tsx') ||
    lower.endsWith('.test.js') ||
    lower.endsWith('.spec.ts') ||
    lower.endsWith('.spec.tsx') ||
    lower.endsWith('.spec.js')
  );
}

function isHighSignalFile(filename: string) {
  const lower = filename.toLowerCase();
  return (
    lower.includes('package.json') ||
    lower.includes('package-lock.json') ||
    lower.includes('next.config') ||
    lower.includes('tsconfig') ||
    lower.includes('/api/') ||
    lower.includes('/app/') ||
    lower.includes('/utils/') ||
    lower.includes('/lib/')
  );
}

function summarizePr(pr: GitHubPullRequest, files: GitHubFile[]): PullRequestSummary {
  const testFiles = files.filter(file => isTestFile(file.filename)).map(file => file.filename);
  const importantFiles = files.filter(file => isHighSignalFile(file.filename)).map(file => file.filename);
  const fileTypes = files.reduce<Record<string, number>>((acc, file) => {
    const ext = fileExtension(file.filename);
    acc[ext] = (acc[ext] || 0) + 1;
    return acc;
  }, {});

  const risks: string[] = [];
  const strengths: string[] = [];

  if (pr.draft) risks.push('Draft PR: not ready to merge yet.');
  if (pr.changed_files > 20) risks.push('Large change set: review surface is broad.');
  if (pr.additions + pr.deletions > 900) risks.push('High line churn: more regression risk.');
  if (testFiles.length === 0) risks.push('No obvious test files changed.');
  if (files.some(file => file.filename.includes('package-lock.json'))) risks.push('Lockfile changed: verify dependency intent.');
  if (files.some(file => file.filename.toLowerCase().includes('.env'))) risks.push('Environment file touched: check for secret handling.');

  if (!pr.draft) strengths.push('Ready for review rather than draft.');
  if (testFiles.length > 0) strengths.push(`Includes ${testFiles.length} test-related file${testFiles.length === 1 ? '' : 's'}.`);
  if (pr.changed_files <= 8) strengths.push('Small review surface.');
  if (pr.commits <= 3) strengths.push('Compact commit history.');
  if (importantFiles.length > 0) strengths.push('Touches files that map directly to app behavior.');

  let score = 70;
  score += testFiles.length > 0 ? 12 : -14;
  score += pr.changed_files <= 8 ? 8 : pr.changed_files > 20 ? -12 : 0;
  score += pr.additions + pr.deletions <= 350 ? 6 : pr.additions + pr.deletions > 900 ? -10 : 0;
  score += pr.draft ? -20 : 6;
  score += pr.commits <= 3 ? 4 : pr.commits > 10 ? -5 : 0;
  score = Math.max(0, Math.min(100, score));

  return {
    url: pr.html_url,
    title: pr.title,
    number: pr.number,
    author: pr.user?.login || 'unknown',
    state: pr.merged_at ? 'merged' : pr.state,
    draft: pr.draft,
    updatedAt: pr.updated_at,
    base: `${pr.base.repo.full_name}:${pr.base.ref}`,
    head: `${pr.head.repo?.full_name || 'deleted fork'}:${pr.head.ref}`,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    commits: pr.commits,
    score,
    strengths,
    risks,
    testFiles: testFiles.slice(0, 8),
    importantFiles: importantFiles.slice(0, 10),
    fileTypes,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const pullRequests = (body.pullRequests || []) as PullRequestInput[];
    const urls = pullRequests
      .map(item => item.url?.trim())
      .filter((url): url is string => Boolean(url));

    if (urls.length < 2) {
      return NextResponse.json({ error: 'Provide at least two pull request URLs to compare.' }, { status: 400 });
    }

    if (urls.length > 6) {
      return NextResponse.json({ error: 'Compare up to six pull requests at a time.' }, { status: 400 });
    }

    const parsedUrls = urls.map(parsePullRequestUrl);
    if (parsedUrls.some(parsed => parsed === null)) {
      return NextResponse.json({ error: 'Every pull request URL must look like https://github.com/owner/repo/pull/123.' }, { status: 400 });
    }

    const summaries = await Promise.all(parsedUrls.map(async parsed => {
      const { owner, repo, number } = parsed!;
      const apiBase = `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`;
      const [pr, files] = await Promise.all([
        fetchJson<GitHubPullRequest>(apiBase),
        fetchJson<GitHubFile[]>(`${apiBase}/files?per_page=100`),
      ]);

      return summarizePr(pr, files);
    }));

    const sorted = [...summaries].sort((a, b) => b.score - a.score);

    return NextResponse.json({
      comparedAt: new Date().toISOString(),
      recommendation: sorted[0],
      pullRequests: sorted,
    });
  } catch (error: any) {
    console.error('PR compare error:', error);
    return NextResponse.json({ error: error.message || 'Unable to compare pull requests.' }, { status: 500 });
  }
}
