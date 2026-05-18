'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, GitCompareArrows, Github, Loader2, ShieldAlert, Sparkles } from 'lucide-react';

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

type CompareResponse = {
  comparedAt: string;
  recommendation: PullRequestSummary;
  pullRequests: PullRequestSummary[];
};

const initialPullRequests = [
  'https://github.com/atharvnaik1/ipaship-audit/pull/147',
  'https://github.com/atharvnaik1/ipaship-audit/pull/148',
];

function formatNumber(value: number) {
  return value.toLocaleString('en-US');
}

function scoreTone(score: number) {
  if (score >= 82) return 'border-[#9be15d]/40 bg-[#9be15d]/12 text-[#9be15d]';
  if (score >= 68) return 'border-yellow-400/35 bg-yellow-400/10 text-yellow-200';
  return 'border-red-400/35 bg-red-400/10 text-red-200';
}

export default function ComparePullRequestsPage() {
  const [input, setInput] = useState(initialPullRequests.join('\n'));
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const urls = useMemo(() => (
    input
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
  ), [input]);

  const handleCompare = async () => {
    setError('');
    setResult(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/compare-prs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pullRequests: urls.map(url => ({ url })),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Comparison failed.');
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Comparison failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-[#050606] text-[#f4f0e8] selection:bg-[#9be15d]/30">
      <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(to_right,rgba(244,240,232,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(244,240,232,0.035)_1px,transparent_1px)] bg-[size:48px_48px]" />
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_78%_14%,rgba(155,225,93,0.14),transparent_34%),radial-gradient(circle_at_12%_84%,rgba(31,74,255,0.14),transparent_34%)]" />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col px-4 py-5 md:px-6">
        <header className="flex items-center justify-between border-b border-[#f4f0e8]/10 pb-4">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-[#c9d0cb] transition-colors hover:text-[#9be15d]">
            <ArrowLeft className="h-4 w-4" />
            Back to audit
          </Link>
          <Link href="https://github.com/atharvnaik1/ipaship-audit/issues/150" target="_blank" className="inline-flex items-center gap-2 rounded-md border border-[#f4f0e8]/15 px-3 py-2 text-sm font-bold text-[#f4f0e8] transition-colors hover:border-[#9be15d]/50 hover:text-[#9be15d]">
            <Github className="h-4 w-4" />
            Issue #150
          </Link>
        </header>

        <section className="grid flex-1 gap-6 py-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
          <div className="rounded-lg border border-[#f4f0e8]/12 bg-[#090c0b]/82 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.36)] backdrop-blur-xl md:p-6">
            <div className="mb-6 flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-[#9be15d] text-[#050606]">
                <GitCompareArrows className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#9be15d]">Pull request compare</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#f4f0e8] md:text-4xl">Pick the safer PR</h1>
              </div>
            </div>

            <label htmlFor="pull-requests" className="text-sm font-bold text-[#c9d0cb]">Pull request URLs</label>
            <textarea
              id="pull-requests"
              value={input}
              onChange={event => setInput(event.target.value)}
              rows={8}
              className="mt-3 w-full resize-y rounded-md border border-[#f4f0e8]/12 bg-[#050606]/80 p-4 font-mono text-sm leading-relaxed text-[#f4f0e8] outline-none transition-colors placeholder:text-[#8b9691] focus:border-[#9be15d]/70"
              placeholder="https://github.com/owner/repo/pull/123"
            />
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-sm text-[#8b9691]">{urls.length} PR{urls.length === 1 ? '' : 's'} queued</p>
              <button
                type="button"
                onClick={handleCompare}
                disabled={isLoading || urls.length < 2}
                className="inline-flex min-w-[150px] items-center justify-center gap-2 rounded-md bg-[#9be15d] px-4 py-3 text-sm font-black text-[#050606] transition-colors hover:bg-[#b7f278] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Compare
              </button>
            </div>

            {error && (
              <div className="mt-5 flex gap-3 rounded-md border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-100">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                <p>{error}</p>
              </div>
            )}
          </div>

          <div className="space-y-5">
            {!result && (
              <div className="min-h-[420px] rounded-lg border border-dashed border-[#f4f0e8]/18 bg-[#090c0b]/58 p-6 text-[#8b9691]">
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#c9d0cb]">Waiting for comparison</p>
                <p className="mt-3 max-w-xl text-sm leading-relaxed">Paste two to six GitHub pull request URLs for the same bounty or issue. The tool scores each PR by review surface, test coverage signals, dependency risk, and merge readiness.</p>
              </div>
            )}

            {result && (
              <>
                <div className="rounded-lg border border-[#9be15d]/24 bg-[#9be15d]/10 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-[#9be15d]">Recommended first review</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <Link href={result.recommendation.url} target="_blank" className="text-xl font-semibold text-[#f4f0e8] underline decoration-[#f4f0e8]/30 underline-offset-4 hover:text-[#9be15d]">
                        #{result.recommendation.number} {result.recommendation.title}
                      </Link>
                      <p className="mt-1 text-sm text-[#c9d0cb]">by @{result.recommendation.author}</p>
                    </div>
                    <span className={`rounded-md border px-4 py-2 text-lg font-black ${scoreTone(result.recommendation.score)}`}>
                      {result.recommendation.score}/100
                    </span>
                  </div>
                </div>

                <div className="grid gap-5">
                  {result.pullRequests.map(pr => (
                    <article key={pr.url} className="rounded-lg border border-[#f4f0e8]/12 bg-[#090c0b]/82 p-5 backdrop-blur-xl">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <Link href={pr.url} target="_blank" className="text-lg font-semibold text-[#f4f0e8] underline decoration-[#f4f0e8]/25 underline-offset-4 hover:text-[#9be15d]">
                            #{pr.number} {pr.title}
                          </Link>
                          <p className="mt-1 text-sm text-[#8b9691]">@{pr.author} · {pr.state}{pr.draft ? ' · draft' : ''}</p>
                        </div>
                        <span className={`rounded-md border px-3 py-2 text-base font-black ${scoreTone(pr.score)}`}>{pr.score}/100</span>
                      </div>

                      <dl className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
                        <div className="rounded-md border border-[#f4f0e8]/10 bg-[#f4f0e8]/[0.035] p-3">
                          <dt className="text-xs text-[#8b9691]">Files</dt>
                          <dd className="mt-1 text-lg font-bold">{formatNumber(pr.changedFiles)}</dd>
                        </div>
                        <div className="rounded-md border border-[#f4f0e8]/10 bg-[#f4f0e8]/[0.035] p-3">
                          <dt className="text-xs text-[#8b9691]">Additions</dt>
                          <dd className="mt-1 text-lg font-bold text-[#9be15d]">+{formatNumber(pr.additions)}</dd>
                        </div>
                        <div className="rounded-md border border-[#f4f0e8]/10 bg-[#f4f0e8]/[0.035] p-3">
                          <dt className="text-xs text-[#8b9691]">Deletions</dt>
                          <dd className="mt-1 text-lg font-bold text-red-200">-{formatNumber(pr.deletions)}</dd>
                        </div>
                        <div className="rounded-md border border-[#f4f0e8]/10 bg-[#f4f0e8]/[0.035] p-3">
                          <dt className="text-xs text-[#8b9691]">Commits</dt>
                          <dd className="mt-1 text-lg font-bold">{formatNumber(pr.commits)}</dd>
                        </div>
                        <div className="rounded-md border border-[#f4f0e8]/10 bg-[#f4f0e8]/[0.035] p-3">
                          <dt className="text-xs text-[#8b9691]">Tests</dt>
                          <dd className="mt-1 text-lg font-bold">{formatNumber(pr.testFiles.length)}</dd>
                        </div>
                      </dl>

                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div>
                          <h2 className="text-sm font-black text-[#9be15d]">Strengths</h2>
                          <ul className="mt-2 space-y-2 text-sm text-[#c9d0cb]">
                            {(pr.strengths.length ? pr.strengths : ['No strong positive signals detected.']).map(item => <li key={item}>- {item}</li>)}
                          </ul>
                        </div>
                        <div>
                          <h2 className="text-sm font-black text-yellow-200">Risks</h2>
                          <ul className="mt-2 space-y-2 text-sm text-[#c9d0cb]">
                            {(pr.risks.length ? pr.risks : ['No major review risks detected.']).map(item => <li key={item}>- {item}</li>)}
                          </ul>
                        </div>
                      </div>

                      {pr.importantFiles.length > 0 && (
                        <div className="mt-5">
                          <h2 className="text-sm font-black text-[#c9d0cb]">Important files</h2>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {pr.importantFiles.map(file => (
                              <span key={file} className="rounded-md border border-[#f4f0e8]/10 bg-[#050606]/70 px-2.5 py-1.5 font-mono text-xs text-[#8b9691]">{file}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
