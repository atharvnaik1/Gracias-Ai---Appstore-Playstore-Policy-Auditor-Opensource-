'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bug, Play, Loader2, AlertTriangle,
  CheckCircle, XCircle, ChevronDown,
  ArrowLeft, Terminal, Code2, Zap
} from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type DebugPhase = 'idle' | 'debugging' | 'complete' | 'error';

interface Breakpoint {
  line: number;
  code: string;
  finding: string;
  variableInsight: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
}

interface DebugResult {
  summary: string;
  rootCause: string;
  breakpoints: Breakpoint[];
  suggestedFix: string;
  correctedCode?: string;
  traceback?: string;
}

const LANGUAGES = [
  'javascript', 'typescript', 'python', 'swift', 'kotlin',
  'java', 'go', 'rust', 'dart', 'c++', 'c#', 'ruby', 'php'
];

export default function DebugPage() {
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [apiKey, setApiKey] = useState('');
  const [phase, setPhase] = useState<DebugPhase>('idle');
  const [result, setResult] = useState<DebugResult | null>(null);
  const [error, setError] = useState('');
  const [expandedBp, setExpandedBp] = useState<number | null>(null);

  const handleDebug = useCallback(async () => {
    if (!code.trim()) {
      setError('Please paste some code to debug');
      return;
    }
    if (!apiKey.trim()) {
      setError('API key is required');
      return;
    }

    setPhase('debugging');
    setError('');
    setResult(null);

    try {
      const resp = await fetch('/api/debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim(),
          description: description.trim(),
          language,
          apiKey: apiKey.trim(),
          provider: 'openrouter',
          model: 'anthropic/claude-3.5-sonnet',
        }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Debug request failed');
      }

      const data = await resp.json();
      setResult(data.result);
      setPhase('complete');
    } catch (e: any) {
      setError(e.message || 'Debug failed');
      setPhase('error');
    }
  }, [code, description, language, apiKey]);

  const severityColor = (s: string) => {
    switch (s) {
      case 'CRITICAL': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'WARNING': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'INFO': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white">
      {/* Header */}
      <header className="border-b border-white/5 bg-[#0a0a1a]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Auditor
          </Link>
          <div className="flex items-center gap-2">
            <Bug className="w-5 h-5 text-primary" />
            <span className="font-bold text-sm">AI Debugger</span>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        <AnimatePresence mode="wait">
          {(phase === 'idle' || phase === 'error') && (
            <motion.div key="idle" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary mb-4">
                  <Terminal className="w-3.5 h-3.5" />
                  Set Breakpoints. Inspect Variables. Find Bugs.
                </div>
                <h1 className="text-3xl md:text-5xl font-black mb-3">
                  <span className="text-white">AI-Powered</span>{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-amber-400 to-red-500">
                    Code Debugger
                  </span>
                </h1>
                <p className="text-muted-foreground max-w-xl mx-auto text-sm md:text-base">
                  Paste your buggy code, describe the issue, and watch the AI step through
                  it with virtual breakpoints — inspecting state at every critical line.
                </p>
              </div>

              {error && (
                <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                  <XCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Language</label>
                  <select
                    value={language}
                    onChange={e => setLanguage(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {LANGUAGES.map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">API Key (OpenRouter/Anthropic)</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="sk-or-v1-..."
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">What&apos;s the bug?</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="E.g., 'Function returns undefined unexpectedly when passed empty array' or 'Infinite loop when two users like the same post simultaneously'"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>

              <div className="mb-4">
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Code to Debug</label>
                <textarea
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder={`function processOrders(orders) {\n  let total = 0;\n  for (let i = 0; i <= orders.length; i++) {\n    total += orders[i].amount;\n  }\n  return total;\n}`}
                  rows={12}
                  className="w-full px-3 py-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono resize-y"
                />
              </div>

              <button
                onClick={handleDebug}
                disabled={!code.trim()}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-red-500 to-amber-500 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" />
                Start Debugging
              </button>
            </motion.div>
          )}

          {phase === 'debugging' && (
            <motion.div
              key="debugging"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-20"
            >
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-6">
                  <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
                </div>
                <div className="absolute -inset-4 bg-amber-500/5 rounded-full blur-2xl animate-pulse" />
              </div>
              <h3 className="text-xl font-bold mb-2">Debugging in Progress</h3>
              <p className="text-muted-foreground text-sm">AI is stepping through breakpoints...</p>
            </motion.div>
          )}

          {phase === 'complete' && result && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {/* Summary */}
              <div className="mb-6 p-6 rounded-2xl bg-gradient-to-br from-green-500/5 to-emerald-500/5 border border-green-500/10">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  <h2 className="text-lg font-bold">Debug Analysis Complete</h2>
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed">{result.summary}</p>
              </div>

              {/* Root Cause */}
              <div className="mb-6 p-5 rounded-xl bg-red-500/5 border border-red-500/10">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <h3 className="font-bold text-sm text-red-400">Root Cause</h3>
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed">{result.rootCause}</p>
              </div>

              {/* Breakpoints */}
              {result.breakpoints?.length > 0 && (
                <div className="mb-6">
                  <h3 className="flex items-center gap-2 text-sm font-bold mb-3">
                    <Bug className="w-4 h-4 text-amber-400" />
                    Breakpoint Analysis ({result.breakpoints.length} breakpoints)
                  </h3>
                  <div className="space-y-2">
                    {result.breakpoints.map((bp, i) => (
                      <div key={i}
                        className="rounded-xl bg-white/[0.02] border border-white/5 overflow-hidden"
                      >
                        <button
                          onClick={() => setExpandedBp(expandedBp === i ? null : i)}
                          className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/[0.03] transition-colors"
                        >
                          <span className="text-xs font-mono text-muted-foreground w-8 flex-shrink-0">
                            L{bp.line}
                          </span>
                          <span className="flex-1 text-xs font-mono text-white/80 truncate">
                            {bp.code?.slice(0, 80)}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${severityColor(bp.severity)}`}>
                            {bp.severity}
                          </span>
                          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expandedBp === i ? 'rotate-180' : ''}`} />
                        </button>
                        {expandedBp === i && (
                          <div className="px-4 pb-3 pl-14 space-y-2">
                            <div>
                              <span className="text-[10px] font-bold text-muted-foreground uppercase">Finding</span>
                              <p className="text-xs text-white/70 mt-0.5">{bp.finding}</p>
                            </div>
                            <div>
                              <span className="text-[10px] font-bold text-muted-foreground uppercase">Variable State</span>
                              <p className="text-xs text-white/70 mt-0.5 font-mono">{bp.variableInsight}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Traceback */}
              {result.traceback && (
                <div className="mb-6 p-4 rounded-xl bg-red-500/5 border border-red-500/10">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="w-4 h-4 text-red-400" />
                    <h3 className="font-bold text-sm text-red-400">Traceback</h3>
                  </div>
                  <pre className="text-xs text-red-300/70 font-mono whitespace-pre-wrap overflow-x-auto">
                    {result.traceback}
                  </pre>
                </div>
              )}

              {/* Suggested Fix */}
              <div className="mb-6 p-5 rounded-xl bg-blue-500/5 border border-blue-500/10">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-blue-400" />
                  <h3 className="font-bold text-sm text-blue-400">Suggested Fix</h3>
                </div>
                <div className="prose prose-invert prose-sm max-w-none text-muted-foreground">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {result.suggestedFix}
                  </ReactMarkdown>
                </div>
              </div>

              {/* Corrected Code */}
              {result.correctedCode && (
                <div className="mb-6 p-4 rounded-xl bg-green-500/5 border border-green-500/10">
                  <div className="flex items-center gap-2 mb-2">
                    <Code2 className="w-4 h-4 text-green-400" />
                    <h3 className="font-bold text-sm text-green-400">Corrected Code</h3>
                  </div>
                  <pre className="text-xs text-green-300/70 font-mono whitespace-pre-wrap overflow-x-auto">
                    {result.correctedCode}
                  </pre>
                </div>
              )}

              {/* Reset */}
              <button
                onClick={() => { setPhase('idle'); setResult(null); }}
                className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-medium text-muted-foreground hover:text-white hover:bg-white/10 transition-all"
              >
                Debug Another Issue
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
