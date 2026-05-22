'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, FileArchive, Key, Loader2,
  ChevronDown, Download, ArrowLeft,
  ShieldCheck, AlertTriangle, CheckCircle, XCircle,
  FileText, Sparkles, Info, Github, ExternalLink, Building2, Star, Mail,
  Zap, Lock, Code2, Clock, Apple, Cpu,
  type LucideIcon
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import { UserButton, SignedOut, SignedIn, useAuth, useClerk } from '@clerk/nextjs';
import AIDebugger from './components/AIDebugger';
import { buildFixPlanMarkdown, parseReportSummary } from '../utils/report-summary.mjs';

type AuditPhase = 'idle' | 'uploading' | 'analyzing' | 'complete' | 'error';

const providerModels: Record<string, { label: string; value: string }[]> = {
  anthropic: [
    { label: 'Claude Sonnet 4', value: 'claude-sonnet-4-20250514' },
    { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20241022' },
    { label: 'Claude 3.5 Haiku', value: 'claude-3-5-haiku-20241022' },
    { label: 'Claude Opus 4', value: 'claude-opus-4-20250514' },
  ],

  openai: [
    { label: 'GPT-4o', value: 'gpt-4o' },
    { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
    { label: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
    { label: 'o1', value: 'o1' },
    { label: 'o3 Mini', value: 'o3-mini' },
  ],
  gemini: [
    { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
    { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
    { label: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
    { label: 'Gemini 1.5 Pro', value: 'gemini-1.5-pro' },
  ],
  openrouter: [
    { label: 'Claude 3.5 Sonnet', value: 'anthropic/claude-3.5-sonnet' },
    { label: 'GPT-4o', value: 'openai/gpt-4o' },
    { label: 'Gemini Pro', value: 'google/gemini-pro-1.5' },
    { label: 'Llama 3.1 405B', value: 'meta-llama/llama-3.1-405b-instruct' },
    { label: 'Mixtral 8x22B', value: 'mistralai/mixtral-8x22b-instruct' },
  ],
  ipaship: [
    { label: 'GLM 5.1', value: 'glm-5.1' },
    { label: 'ipaShip AI Core', value: 'meta/llama-3.1-405b-instruct' },
    { label: 'ipaShip AI Fast', value: 'meta/llama-3.1-70b-instruct' },
  ],
};

const selectStyle = {
  backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E")',
  backgroundRepeat: 'no-repeat' as const,
  backgroundPosition: 'right 8px center',
  paddingRight: '24px',
};

type MetricProp = {
  label: string;
  value: string;
};

type IssueProp = {
  title: string;
  severity: 'Critical' | 'Major' | 'Minor';
};

type WorkflowStepProp = {
  step: string;
  title: string;
  body: string;
};

type SecurityProp = {
  title: string;
  description: string;
  icon: LucideIcon;
};

const readinessSection = {
  eyebrow: '02 / 04',
  title: 'Know what will',
  accent: 'block',
  titleSuffix: 'review',
  description: 'One pass turns a raw bundle into the score, blockers, and fix plan your release team needs.',
  panelTitle: 'Review readiness in one view.',
  score: '82',
  metrics: [
    { value: '3', label: 'Blockers' },
    { value: '4', label: 'Quick wins' },
    { value: '1', label: 'Fix plan' },
  ] satisfies MetricProp[],
  issues: [
    { title: 'Privacy permissions', severity: 'Critical' },
    { title: 'Metadata gap', severity: 'Major' },
    { title: 'Accessibility label', severity: 'Minor' },
  ] satisfies IssueProp[],
  summary: [
    { label: 'Score', value: '82/100' },
    { label: 'Verdict', value: 'Caveats' },
    { label: 'Export', value: 'Checklist' },
  ] satisfies MetricProp[],
};

const workflowSection = {
  eyebrow: '03 / 04',
  label: 'Workflow & Security',
  title: 'From bundle to fix plan',
  description: 'Every upload becomes a private, source-grounded review brief your team can act on.',
  steps: [
    { step: '01', title: 'Upload', body: '.ipa' },
    { step: '02', title: 'Extract', body: 'Info.plist\nAppDelegate.swift\nEntitlements.plist' },
    { step: '03', title: 'Audit', body: 'readiness lens' },
    { step: '04', title: 'Fix', body: 'Issues\nEvidence\nRemediation' },
  ] satisfies WorkflowStepProp[],
  security: [
    { title: 'Ephemeral files', description: 'Files exist only for the duration of your review and are securely wiped after.', icon: Lock },
    { title: 'BYOK providers', description: 'Bring your own keys with AWS KMS, GCP KMS, Azure Key Vault, or HashiCorp Vault.', icon: Key },
    { title: 'Open-source path', description: 'Core analysis engine is open source. Run it anywhere, inspect everything.', icon: Code2 },
  ] satisfies SecurityProp[],
};

const ctaSection = {
  title: 'Know before you submit',
  description: 'Run a private review pass and leave with the fixes that matter.',
  primary: 'Start audit',
  secondary: 'GitHub',
};

const auditProgressSteps = [
  { label: 'Upload', description: 'Bundle received' },
  { label: 'Extract', description: 'Source files indexed' },
  { label: 'Review', description: 'Policy analysis running' },
  { label: 'Report', description: 'Fix plan generated' },
];

export default function AuditPage() {
  const [file, setFile] = useState<File | null>(null);
  const [provider, setProvider] = useState('ipaship');
  const [model, setModel] = useState('glm-5.1');
  const [context, setContext] = useState('');
  const [phase, setPhase] = useState<AuditPhase>('idle');
  const [reportContent, setReportContent] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [filesScanned, setFilesScanned] = useState(0);
  const [visitorCount, setVisitorCount] = useState<number | null>(null);
  const [starCount, setStarCount] = useState<number | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showFileList, setShowFileList] = useState(false);
  // Upload progress state
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(''); // e.g. '1.2 MB/s'
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFileId, setUploadedFileId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [isAutoAnalyzing, setIsAutoAnalyzing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const completeReportRef = useRef<HTMLDivElement>(null);
  // Keep a ref to the latest handleRunAudit so useEffect can call it without going stale
  const handleRunAuditRef = useRef<(() => void) | null>(null);
  // Track the fileId that has already been auto-triggered to prevent double-runs
  const autoTriggeredFileIdRef = useRef<string | null>(null);
  const reportSummary = useMemo(() => parseReportSummary(reportContent), [reportContent]);

  useEffect(() => {
    fetch('/api/visitor')
      .then(res => res.json())
      .then(data => { setVisitorCount(data.count || 0); })
      .catch(() => { setVisitorCount(0); });
    fetch('/api/github-stars')
      .then(res => res.json())
      .then(data => { setStarCount(data.stars ?? 0); })
      .catch(() => { setStarCount(0); });
  }, []);


  // Auto-start audit as soon as upload finishes
  useEffect(() => {
    if (
      uploadedFileId &&
      uploadedFileId !== autoTriggeredFileIdRef.current &&
      handleRunAuditRef.current
    ) {
      autoTriggeredFileIdRef.current = uploadedFileId;
      setIsAutoAnalyzing(true);
      // Small delay so state settles before we start
      setTimeout(() => handleRunAuditRef.current?.(), 300);
    }
  }, [uploadedFileId]);


  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const startUpload = useCallback((picked: File) => {
    setFile(picked);
    setUploadedFileId(null);
    autoTriggeredFileIdRef.current = null;
    setUploadProgress(0);
    setUploadSpeed('');
    setUploadError('');
    setIsUploading(true);
    setErrorMessage('');
    setReportContent('');
    setFilesScanned(0);
    setFileNames([]);

    const formData = new FormData();
    formData.append('file', picked);

    const xhr = new XMLHttpRequest();
    let startTime = Date.now();
    let lastLoaded = 0;

    xhr.upload.addEventListener('progress', (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.round((e.loaded / e.total) * 100);
      setUploadProgress(pct);

      const now = Date.now();
      const elapsed = (now - startTime) / 1000; // seconds
      if (elapsed > 0) {
        const bytesSec = (e.loaded - lastLoaded) / ((now - startTime) / 1000);
        // Use total bytes sent / elapsed for a smoother reading
        const avgBytesPerSec = e.loaded / elapsed;
        const mbps = avgBytesPerSec / (1024 * 1024);
        if (mbps >= 1) {
          setUploadSpeed(`${mbps.toFixed(1)} MB/s`);
        } else {
          setUploadSpeed(`${(avgBytesPerSec / 1024).toFixed(0)} KB/s`);
        }
        lastLoaded = e.loaded;
      }
    });

    xhr.addEventListener('load', () => {
      setIsUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (!data.fileId) {
            throw new Error('Upload response missing file id.');
          }
          setUploadedFileId(data.fileId);
          setUploadProgress(100);
        } catch (err: any) {
          setUploadError(err.message || 'Upload response invalid.');
        }
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          setUploadError(data.error || 'Upload failed.');
        } catch {
          setUploadError('Upload failed.');
        }
      }
    });

    xhr.addEventListener('error', () => {
      setIsUploading(false);
      setUploadError('Upload failed. Check your connection.');
    });

    xhr.open('POST', '/api/upload');
    xhr.send(formData);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const ext = droppedFile.name.split('.').pop()?.toLowerCase();
      if (ext !== 'ipa' && ext !== 'apk' && ext !== 'zip') {
        setErrorMessage('Please upload an .ipa, .apk, or .zip file');
      } else if (droppedFile.size > 150 * 1024 * 1024) {
        setErrorMessage('File exceeds maximum size of 150MB');
      } else {
        setErrorMessage('');
        startUpload(droppedFile);
      }
    }
  }, [startUpload]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      const ext = selected.name.split('.').pop()?.toLowerCase();
      if (ext !== 'ipa' && ext !== 'apk' && ext !== 'zip') {
        setErrorMessage('Please upload an .ipa, .apk, or .zip file');
        e.target.value = '';
        return;
      }
      if (selected.size > 150 * 1024 * 1024) {
        setErrorMessage('File exceeds maximum size of 150MB');
        e.target.value = '';
        return;
      }
      setErrorMessage('');
      startUpload(selected);
    }
    e.target.value = '';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const { isSignedIn } = useAuth();
  const { openSignIn, openSignUp } = useClerk();

  const handleRunAudit = async () => {
    if (!file) {
      return;
    }
    if (isUploading) { setErrorMessage('Please wait for the file upload to complete.'); return; }
    if (uploadError) { setErrorMessage('Upload failed. Please re-select your file.'); return; }

    // Sign-in check only here, not on page load
    if (!isSignedIn) {
      openSignIn();
      return;
    }

    setPhase('analyzing');
    setReportContent('');
    setErrorMessage('');
    setFilesScanned(0);
    setFileNames([]);

    try {
      let response: Response;

      if (uploadedFileId) {
        // File is already on server — send params only
        const formData = new FormData();
        formData.append('fileId', uploadedFileId);
        formData.append('fileName', file.name);
        formData.append('provider', provider);
        formData.append('model', model);
        formData.append('context', context);
        response = await fetch('/api/audit', { method: 'POST', body: formData });
      } else {
        // Fallback: upload + audit in one go
        setPhase('uploading');
        const formData = new FormData();
        formData.append('file', file);
        formData.append('provider', provider);
        formData.append('model', model);
        formData.append('context', context);
        response = await fetch('/api/audit', { method: 'POST', body: formData });
        setPhase('analyzing');
      }

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Audit request failed');
      }
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      let totalScannedTemp = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === 'meta') {
              setFilesScanned(parsed.filesScanned);
              totalScannedTemp = parsed.filesScanned;
              setFileNames(parsed.fileNames || []);
            } else if (parsed.type === 'content') {
              accumulated += parsed.text;
              setReportContent(accumulated);
            } else if (parsed.type === 'error') {
              throw new Error(parsed.message);
            }
          } catch (e: any) {
            if (e.message === 'Stream interrupted') throw e;
          }
        }
      }

      setPhase('complete');
      fetch('/api/save-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportContent: accumulated, filesScanned: totalScannedTemp })
      }).catch(() => { });

    } catch (err: any) {
      console.error('Audit error:', err);
      setErrorMessage(err.message || 'An unexpected error occurred');
      setPhase('error');
    }
  };

  // Keep ref in sync so useEffect auto-trigger always has fresh closure
  handleRunAuditRef.current = handleRunAudit;

  const handleExportReport = () => {
    if (!reportContent) return;
    try {
      const blob = new Blob([reportContent], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `appstore-audit-report-${new Date().toISOString().slice(0, 10)}.md`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 500);
    } catch (err) {
      console.error('Markdown export failed:', err);
      setErrorMessage('Failed to export markdown report');
    }
  };

  const handleExportFixPlan = () => {
    if (!reportContent) return;
    try {
      const fixPlan = buildFixPlanMarkdown(reportSummary, reportContent);
      const blob = new Blob([fixPlan], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ipaship-fix-plan-${new Date().toISOString().slice(0, 10)}.md`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 500);
    } catch (err) {
      console.error('Fix plan export failed:', err);
      setErrorMessage('Failed to export fix plan');
    }
  };

  const handleExportPdf = async () => {
    if (!reportContent) return;
    try {
      const { marked } = await import('marked');

      // Configure marked for GFM (tables, strikethrough, etc.)
      marked.setOptions({ gfm: true, breaks: true } as any);

      const bodyHtml = await marked.parse(reportContent);
      const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ipaShip — App Store Compliance Report</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 13px;
      line-height: 1.7;
      color: #1a1a2e;
      background: #fff;
      padding: 32px 40px;
      max-width: 900px;
      margin: 0 auto;
    }

    /* ── Header ─────────────────────────────────── */
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #7c3aed;
      padding-bottom: 14px;
      margin-bottom: 28px;
    }
    .brand { display: flex; align-items: center; gap: 10px; }
    .brand-logo {
      background: linear-gradient(135deg, #7c3aed, #3b82f6);
      width: 32px; height: 32px;
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 15px; font-weight: 900;
    }
    .brand-name { font-size: 17px; font-weight: 800; color: #000; }
    .brand-sub { font-size: 9px; color: #777; letter-spacing: 1.2px; text-transform: uppercase; margin-top: 1px; }
    .meta { text-align: right; font-size: 9px; color: #777; }
    .meta a { color: #7c3aed; text-decoration: none; font-weight: 600; }

    /* ── Typography ─────────────────────────────── */
    h1 { font-size: 22px; font-weight: 900; color: #0f0f1a; margin: 24px 0 12px; border-bottom: 1px solid #e5e5f0; padding-bottom: 8px; }
    h2 { font-size: 17px; font-weight: 800; color: #0f0f1a; margin: 28px 0 10px; border-bottom: 1px solid #eee; padding-bottom: 6px; }
    h3 { font-size: 14px; font-weight: 700; color: #1a1a2e; margin: 18px 0 8px; }
    h4, h5, h6 { font-size: 13px; font-weight: 700; color: #1a1a2e; margin: 12px 0 6px; }
    p  { margin: 8px 0; color: #333; }
    ul { margin: 8px 0 8px 20px; }
    ol { margin: 8px 0 8px 4px; list-style: none; counter-reset: item; }
    ol li { counter-increment: item; display: flex; align-items: flex-start; gap: 10px; margin: 6px 0;
            padding: 8px 12px; border: 1px solid #ede9fe; border-radius: 8px; background: #faf8ff; }
    ol li::before {
      content: counter(item);
      min-width: 22px; height: 22px; border-radius: 50%;
      background: #7c3aed; color: #fff;
      font-size: 10px; font-weight: 900;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; margin-top: 1px;
    }
    ul li { margin: 4px 0; color: #444; }
    li > p { margin: 0; }
    strong { font-weight: 700; color: #0f0f1a; }
    em { font-style: italic; }
    a { color: #7c3aed; text-decoration: none; }
    code {
      font-family: "SF Mono", "Fira Code", Consolas, monospace;
      font-size: 11px;
      background: #f3f0ff;
      color: #7c3aed;
      padding: 2px 5px;
      border-radius: 4px;
      border: 1px solid #e9e5ff;
    }
    pre { background: #f8f8f8; border: 1px solid #e5e5e5; border-radius: 8px; padding: 14px; overflow-x: auto; margin: 12px 0; }
    pre code { background: none; border: none; padding: 0; color: #333; }
    blockquote {
      border-left: 3px solid #7c3aed;
      background: #faf8ff;
      margin: 12px 0;
      padding: 10px 16px;
      border-radius: 0 8px 8px 0;
      color: #444;
    }
    blockquote p { margin: 3px 0; }
    hr { border: none; border-top: 1px solid #eee; margin: 20px 0; }

    /* ── Tables ─────────────────────────────────── */
    table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 12px; border-radius: 8px; overflow: hidden; border: 1px solid #e5e5f0; }
    thead { background: #f3f0ff; }
    th { padding: 9px 12px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #555; border-bottom: 1px solid #e0ddf8; }
    td { padding: 9px 12px; border-bottom: 1px solid #f0eeff; color: #333; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) td { background: #fdfcff; }

    /* ── Severity Badges ────────────────────────── */
    td:has(span.badge) { padding: 7px 12px; }
    /* Inject badges via JS below */

    /* ── Watermark ──────────────────────────────── */
    .watermark {
      position: fixed; top: 50%; left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      font-size: 90px; font-weight: 900;
      color: rgba(124, 58, 237, 0.04);
      pointer-events: none; white-space: nowrap; z-index: 0;
    }

    /* ── Footer ─────────────────────────────────── */
    .report-footer {
      margin-top: 36px; padding-top: 14px;
      border-top: 1px solid #eee;
      display: flex; justify-content: space-between;
      font-size: 9px; color: #aaa;
    }

    @media print {
      body { padding: 20px 24px; }
      .no-print { display: none !important; }
      @page { margin: 16mm 14mm; size: A4; }
    }
  </style>
</head>
<body>
  <div class="watermark">ipaShip</div>

  <div class="report-header">
    <div class="brand">
      <div class="brand-logo">i</div>
      <div>
        <div class="brand-name">ipaShip</div>
        <div class="brand-sub">App Store Compliance Auditor</div>
      </div>
    </div>
    <div class="meta">
      <div>${dateStr}</div>
      <div style="margin-top:3px;">
        <a href="https://ipaship.com/">ipaship.com</a> &nbsp;|&nbsp;
        <a href="mailto:hello@ipaship.com">hello@ipaship.com</a>
      </div>
    </div>
  </div>

  <div id="report-body">
    ${bodyHtml}
  </div>

  <div class="report-footer">
    <span>Generated by ipaShip &mdash; App Store Compliance Auditor</span>
    <span>ipaship.com &nbsp;|&nbsp; hello@ipaship.com</span>
  </div>

  <script>
    // Colour-code severity cells
    document.querySelectorAll('td').forEach(function(td) {
      var t = td.textContent.trim();
      var map = {
        'CRITICAL': 'background:#fee2e2;color:#b91c1c;border:1px solid #fecaca;',
        'HIGH':     'background:#ffedd5;color:#c2410c;border:1px solid #fed7aa;',
        'MEDIUM':   'background:#fefce8;color:#a16207;border:1px solid #fde68a;',
        'LOW':      'background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;',
        'PASS':     'background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;',
        'WARN':     'background:#fffbeb;color:#b45309;border:1px solid #fde68a;',
        'FAIL':     'background:#fef2f2;color:#dc2626;border:1px solid #fecaca;',
        'N/A':      'background:#f9fafb;color:#6b7280;border:1px solid #e5e7eb;',
      };
      if (map[t]) {
        td.innerHTML = '<span style="display:inline-flex;align-items:center;padding:2px 10px;border-radius:20px;font-size:10px;font-weight:700;' + map[t] + '">' + t + '</span>';
      }
    });
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`;

      const blob = new Blob([fullHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const printWin = window.open(url, '_blank', 'width=900,height=700');
      if (!printWin) {
        // Fallback: direct download of HTML if popup blocked
        const a = document.createElement('a');
        a.href = url;
        a.download = `ipaship-audit-report-${new Date().toISOString().slice(0, 10)}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) {
      console.error('PDF export failed:', err);
      setErrorMessage('Failed to export report. Please try the Markdown export instead.');
    }
  };

  const isReady = file && !isUploading && !uploadError;
  const hasReport = reportContent.trim().length > 0;
  const readinessTone =
    reportSummary.verdict === 'READY'
      ? 'text-green-300 border-green-500/30 bg-green-500/10'
      : reportSummary.verdict === 'READY WITH CAVEATS'
        ? 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10'
        : reportSummary.verdict === 'NOT READY'
          ? 'text-red-300 border-red-500/30 bg-red-500/10'
          : 'text-muted-foreground border-white/10 bg-white/5';
  const severityCards = [
    { label: 'Critical', value: reportSummary.severityCounts.critical, className: 'text-red-300 bg-red-500/10 border-red-500/20' },
    { label: 'High', value: reportSummary.severityCounts.high, className: 'text-orange-300 bg-orange-500/10 border-orange-500/20' },
    { label: 'Medium', value: reportSummary.severityCounts.medium, className: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20' },
    { label: 'Low', value: reportSummary.severityCounts.low, className: 'text-blue-300 bg-blue-500/10 border-blue-500/20' },
  ];
  const blockers = reportSummary.topBlockers.filter((item: string) => item.toLowerCase() !== 'none found').slice(0, 3);
  const quickWins = reportSummary.quickWins.filter((item: string) => item.toLowerCase() !== 'none found').slice(0, 3);

  return (
    <main className="min-h-[100dvh] w-full bg-background text-foreground selection:bg-primary/30 relative overflow-hidden font-sans">
      {/* No full-screen auth gate — sign-in is only triggered on audit button click */}

      {/* Precision-lab background */}
      <div className="fixed inset-0 pointer-events-none z-0 bg-[#050606]">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(244,240,232,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(244,240,232,0.035)_1px,transparent_1px)] bg-[size:48px_48px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(155,225,93,0.14),transparent_34%),radial-gradient(circle_at_15%_82%,rgba(31,74,255,0.14),transparent_34%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,6,6,0.2),rgba(5,6,6,0.92))]" />
      </div>

      {phase !== 'idle' && phase !== 'error' && (
        <>
          {/* Security Banner */}
          <div className="w-full border-b border-[#f4f0e8]/10 bg-[#050606]/80 text-center py-2.5 px-4 relative z-30 backdrop-blur-xl">
            <p className="text-xs md:text-sm font-medium flex items-center justify-center gap-2 text-[#8b9691]">
              <Lock className="w-3.5 h-3.5 text-[#9be15d]" />
              <span className="text-[#f4f0e8] font-semibold">Private review lab</span>
              <span className="hidden sm:inline">Ephemeral files. BYOK providers. Open-source path.</span>
            </p>
          </div>

          {/* Navigation */}
          <header className="w-full border-b border-[#f4f0e8]/10 bg-[#050606]/70 backdrop-blur-2xl relative z-30 sticky top-0">
            <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 md:h-16 flex items-center justify-between">
              <Link href="https://ipaship.com" target="_blank" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
                <div className="bg-[#9be15d] w-8 h-8 rounded-lg flex items-center justify-center shadow-[0_0_22px_rgba(155,225,93,0.18)]">
                  <Apple className="w-4 h-4 text-[#050606]" />
                </div>
                <div className="flex flex-col">
                  <span className="text-base font-black text-[#f4f0e8] leading-tight">ipaShip</span>
                  <span className="text-[9px] font-medium text-[#8b9691] leading-tight tracking-wider uppercase hidden sm:block">Review readiness lab</span>
                </div>
              </Link>

              <nav className="hidden lg:flex items-center gap-6">
                <div className="flex items-center gap-1">
                  {['Audit', 'Security', 'Open Source'].map((item) => (
                    <a key={item} href={`#${item.toLowerCase().replace(/\s+/g, '-')}`}
                      className="px-3 py-2 text-sm font-medium text-[#8b9691] hover:text-[#f4f0e8] transition-all">
                      {item}
                    </a>
                  ))}
                  <Link href="/compare-prs" className="px-3 py-2 text-sm font-medium text-[#8b9691] hover:text-[#f4f0e8] transition-all">
                    Compare PRs
                  </Link>
                </div>
              </nav>

              <div className="flex items-center gap-2 md:gap-3">
                <Link
                  href="https://github.com/atharvnaik1/ipaship-app-reviewer"
                  target="_blank"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#f4f0e8]/15 text-xs font-bold text-[#f4f0e8] hover:border-[#9be15d]/50 hover:text-[#9be15d] transition-all"
                >
                  <Github className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Star on GitHub</span>
                  {starCount !== null && starCount > 0 && (
                    <>
                      <Star className="w-3 h-3 text-yellow-500" />
                      <span className="text-yellow-500">{starCount.toLocaleString()}</span>
                    </>
                  )}
                </Link>
                <SignedOut>
                  <button
                    onClick={() => openSignIn()}
                    className="px-3 py-1.5 rounded-lg bg-[#9be15d] text-xs font-bold text-[#050606] hover:bg-[#b7f278] transition-colors"
                  >
                    Sign In
                  </button>
                </SignedOut>
                <SignedIn>
                  <UserButton />
                </SignedIn>
              </div>
            </div>
          </header>
        </>
      )}

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-6">
        <AnimatePresence mode="wait">
          {/* ═══════════════ IDLE / ERROR STATE ═══════════════ */}
          {(phase === 'idle' || phase === 'error') && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
            >
              <section
                id="audit"
                className="relative mt-4 min-h-[700px] overflow-hidden border border-[#f4f0e8]/10 bg-[#050606] shadow-[0_38px_120px_rgba(0,0,0,0.55)] md:mt-6 md:min-h-[760px]"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <img
                  src="/images/ipaship-bg-hero.png"
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 h-full w-full object-cover opacity-90"
                  draggable={false}
                />
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,6,6,0.92)_0%,rgba(5,6,6,0.68)_37%,rgba(5,6,6,0.2)_70%,rgba(5,6,6,0.08)_100%)]" />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,6,6,0.35),rgba(5,6,6,0.06)_48%,rgba(5,6,6,0.55))]" />

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".ipa,.apk,.zip"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <header className="relative z-10 flex h-20 items-center justify-between border-b border-[#f4f0e8]/14 px-6 md:px-10">
                  <Link href="https://ipaship.com" target="_blank" className="text-2xl font-black tracking-[-0.04em] text-[#f4f0e8] transition-colors hover:text-[#9be15d]">
                    ipaShip
                  </Link>
                  <nav className="hidden items-center gap-12 text-sm font-medium text-[#c9d0cb]/72 md:flex">
                    <a href="#audit" className="transition-colors hover:text-[#f4f0e8]">Audit</a>
                    <a href="#security" className="transition-colors hover:text-[#f4f0e8]">Security</a>
                    <a href="#open-source" className="transition-colors hover:text-[#f4f0e8]">Open Source</a>
                    <Link href="/compare-prs" className="transition-colors hover:text-[#f4f0e8]">Compare PRs</Link>
                    <span className="h-8 w-px bg-[#f4f0e8]/20" />
                    <span className="grid h-7 w-7 place-items-center rounded-full border border-[#f4f0e8]/25">
                      <span className="h-2 w-2 rounded-full bg-[#9be15d] shadow-[0_0_18px_rgba(155,225,93,0.75)]" />
                    </span>
                  </nav>
                </header>

                <div className="relative z-10 flex min-h-[620px] flex-col justify-end px-6 pb-10 md:px-10 md:pb-12">
                  <div className="max-w-[640px]">
                    <h1 className="max-w-[560px] text-[clamp(4rem,9vw,6.6rem)] font-normal leading-[0.94] tracking-[-0.055em] text-[#f4f0e8]">
                      Ship before review day
                    </h1>
                    <p className="mt-6 max-w-[470px] text-lg leading-relaxed text-[#c9d0cb]/78 md:text-xl">
                      Audit your app bundle, surface rejection risks, and leave with a fix plan.
                    </p>
                    <div className="mt-8 flex flex-wrap items-center gap-7">
                      <button
                        type="button"
                        onClick={() => file ? handleRunAudit() : fileInputRef.current?.click()}
                        disabled={isUploading || (!!file && !isReady)}
                        className="inline-flex min-w-[210px] items-center justify-center gap-5 rounded-md bg-[#9be15d] px-7 py-4 text-lg font-medium text-[#050606] transition-colors hover:bg-[#b7f278] disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {file ? 'Run audit' : 'Run audit'}
                        <span className="text-3xl leading-none">→</span>
                      </button>
                      <Link
                        href="https://github.com/atharvnaik1/ipaship-app-reviewer"
                        target="_blank"
                        className="text-lg font-medium text-[#f4f0e8] underline decoration-[#f4f0e8]/70 underline-offset-8 transition-colors hover:text-[#9be15d]"
                      >
                        View source
                      </Link>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`mt-10 flex w-full items-center gap-5 rounded-xl border bg-[#08100e]/58 p-5 text-left backdrop-blur-md transition-all hover:border-[#9be15d]/60 hover:bg-[#0b1511]/72 md:absolute md:bottom-10 md:right-10 md:mt-0 md:w-[460px] ${isDragging ? 'border-[#9be15d]' : 'border-[#f4f0e8]/28'}`}
                    aria-label="Upload app bundle"
                  >
                    <span className="grid h-20 w-20 shrink-0 place-items-center rounded-lg border border-dashed border-[#f4f0e8]/26">
                      <Upload className="h-8 w-8 text-[#9be15d]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xl font-normal text-[#f4f0e8]">{file ? file.name : 'Upload app bundle'}</span>
                      <span className="mt-1 block text-sm text-[#c9d0cb]/68">{file ? formatFileSize(file.size) : '.ipa, .aab, or .zip'}</span>
                      <span className="mt-2 block text-sm text-[#8b9691]">
                        {file ? (uploadedFileId ? 'Upload complete. Ready to audit.' : 'Preparing upload...') : <>Drag &amp; drop or click to <span className="text-[#9be15d]">browse</span></>}
                      </span>
                    </span>
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#f4f0e8]/35 text-2xl text-[#c9d0cb]">→</span>
                  </button>
                </div>
              </section>

              {(file || uploadError || errorMessage || isUploading) && (
                <motion.section
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mx-auto mt-4 max-w-5xl rounded-2xl border border-[#f4f0e8]/12 bg-[#090c0b]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl md:p-5"
                >
                  <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr_0.8fr] lg:items-end">
                    <div className="min-w-0">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#9be15d]">Audit controls</p>
                      {file ? (
                        <div className="flex min-w-0 items-center gap-3 rounded-xl border border-[#f4f0e8]/10 bg-[#f4f0e8]/[0.035] p-3">
                          <div className={`shrink-0 rounded-lg border p-2 ${uploadError ? 'border-red-500/20 bg-red-500/10' : 'border-[#9be15d]/25 bg-[#9be15d]/10'}`}>
                            {isUploading ? <Loader2 className="h-5 w-5 animate-spin text-[#9be15d]" /> : uploadError ? <AlertTriangle className="h-5 w-5 text-red-400" /> : <FileArchive className="h-5 w-5 text-[#9be15d]" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[#f4f0e8]">{file.name}</p>
                            <p className="text-xs text-[#8b9691]">{formatFileSize(file.size)}{isUploading ? ` · Uploading ${uploadProgress}%` : uploadedFileId ? ' · Upload complete' : ''}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setFile(null); setUploadedFileId(null); setUploadProgress(0); setUploadSpeed(''); setUploadError(''); setIsUploading(false); setIsAutoAnalyzing(false); autoTriggeredFileIdRef.current = null; }}
                            className="rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-red-300 transition-colors hover:bg-red-500/20"
                            aria-label="Remove selected file"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#f4f0e8]/18 bg-[#f4f0e8]/[0.025] px-4 py-4 text-sm font-semibold text-[#f4f0e8] transition-colors hover:border-[#9be15d]/45 hover:bg-[#9be15d]/5 md:hidden"
                        >
                          <Upload className="h-4 w-4 text-[#9be15d]" />
                          Upload app bundle
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <select
                        value={provider}
                        onChange={(e) => {
                          const p = e.target.value;
                          setProvider(p);
                          setModel(providerModels[p][0].value);
                        }}
                        className="w-full rounded-lg border border-[#f4f0e8]/10 bg-[#f4f0e8]/5 px-3 py-2.5 text-xs font-medium text-[#f4f0e8] outline-none transition-colors hover:bg-[#f4f0e8]/[0.08] focus:ring-1 focus:ring-[#9be15d]/50"
                        style={selectStyle}
                        aria-label="AI provider"
                      >
                        <option value="ipaship">ipaShip AI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="openai">OpenAI</option>
                        <option value="gemini">Gemini</option>
                        <option value="openrouter">OpenRouter</option>
                      </select>
                      <select
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        className="w-full rounded-lg border border-[#f4f0e8]/10 bg-[#f4f0e8]/5 px-3 py-2.5 text-xs font-medium text-[#c9d0cb] outline-none transition-colors hover:bg-[#f4f0e8]/[0.08] focus:ring-1 focus:ring-[#9be15d]/50"
                        style={selectStyle}
                        aria-label="AI model"
                      >
                        {providerModels[provider]?.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={handleRunAudit}
                      disabled={!isReady || isUploading}
                      className={`rounded-xl px-4 py-3 text-sm font-black transition-all ${isReady && !isUploading
                        ? 'bg-[#9be15d] text-[#050606] hover:bg-[#b7f278]'
                        : 'cursor-not-allowed border border-[#f4f0e8]/8 bg-[#f4f0e8]/5 text-[#8b9691]/70'
                        }`}
                    >
                      {isUploading ? `Uploading ${uploadProgress}%` : 'Run audit'}
                    </button>
                  </div>

                  <textarea
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder="Optional context: category, subscriptions, HealthKit, review notes..."
                    className="mt-3 min-h-[64px] w-full resize-none rounded-xl border border-[#f4f0e8]/10 bg-[#f4f0e8]/5 px-3 py-2.5 text-xs text-[#f4f0e8] outline-none transition-all placeholder:text-[#8b9691]/60 focus:border-[#9be15d]/50 focus:ring-1 focus:ring-[#9be15d]/50"
                  />

                  <AnimatePresence>
                    {(uploadError || errorMessage) && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3">
                          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                          <p className="text-xs text-red-300">{uploadError || errorMessage}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.section>
              )}

              <section id="about" className="mt-8 overflow-hidden border border-[#f4f0e8]/10 bg-[#080a09] shadow-[0_28px_90px_rgba(0,0,0,0.36)] md:mt-12">
                <div className="grid gap-8 px-6 py-10 md:px-10 md:py-14 lg:grid-cols-[0.9fr_1.05fr] lg:items-center">
                  <div>
                    <p className="mb-5 w-fit border-b border-[#9be15d]/50 pb-3 text-base font-medium text-[#9be15d] md:text-lg">{readinessSection.eyebrow}</p>
                    <h2 className="max-w-[620px] text-[clamp(3rem,6vw,5.5rem)] font-normal leading-[0.96] tracking-[-0.055em] text-[#f4f0e8]">
                      {readinessSection.title} <span className="text-[#9be15d]">{readinessSection.accent}</span> {readinessSection.titleSuffix}
                    </h2>
                    <p className="mt-6 max-w-[500px] text-base leading-relaxed text-[#c9d0cb]/72 md:text-xl">
                      {readinessSection.description}
                    </p>
                    <div className="mt-8 grid max-w-[520px] grid-cols-3 border-y border-[#f4f0e8]/10">
                      {readinessSection.summary.map((item) => (
                        <div key={item.label} className="border-r border-[#f4f0e8]/10 py-5 pr-4 last:border-r-0 last:pl-4 sm:px-5 first:pl-0">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-[#8b9691]">{item.label}</p>
                          <p className="mt-2 text-xl font-medium text-[#f4f0e8] md:text-2xl">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#f4f0e8]/12 bg-[#0c0f0e] p-5 md:p-6">
                    <div className="flex items-start justify-between gap-5">
                      <div>
                        <p className="text-sm font-black text-[#f4f0e8]">ipaShip</p>
                        <h3 className="mt-4 text-2xl font-normal tracking-[-0.03em] text-[#f4f0e8] md:text-4xl">{readinessSection.panelTitle}</h3>
                      </div>
                      <div className="grid h-24 w-24 shrink-0 place-items-center rounded-full border-[10px] border-[#9be15d] bg-[#080a09] md:h-32 md:w-32">
                        <span className="text-center">
                          <span className="block text-3xl font-black text-[#f4f0e8] md:text-5xl">{readinessSection.score}</span>
                          <span className="text-[10px] text-[#8b9691] md:text-xs">score</span>
                        </span>
                      </div>
                    </div>

                    <div className="mt-7 grid gap-3 sm:grid-cols-3">
                      {readinessSection.metrics.map((metric) => (
                        <div key={metric.label} className="border border-[#f4f0e8]/10 bg-[#f4f0e8]/[0.025] p-4">
                          <p className="text-3xl font-black text-[#f4f0e8]">{metric.value}</p>
                          <p className="mt-2 text-sm text-[#9be15d]">{metric.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section id="security" className="relative mt-8 min-h-[700px] overflow-hidden border border-[#f4f0e8]/10 bg-[#050606] shadow-[0_34px_110px_rgba(0,0,0,0.42)] md:mt-12">
                <img src="/images/ipaship-bg-workflow.png" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-72" draggable={false} />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,6,6,0.72),rgba(5,6,6,0.18)_42%,rgba(5,6,6,0.86))]" />
                <div className="relative z-10 flex min-h-[700px] flex-col px-6 py-10 md:px-10 md:py-14">
                  <p className="text-sm font-medium uppercase tracking-[0.34em] text-[#9be15d]">{workflowSection.eyebrow} <span className="ml-4 text-[#c9d0cb]/70">{workflowSection.label}</span></p>
                  <h2 className="mt-10 max-w-[760px] text-[clamp(3.4rem,6vw,6rem)] font-normal leading-[0.95] tracking-[-0.045em] text-[#f4f0e8]">
                    {workflowSection.title}
                  </h2>
                  <p className="mt-6 max-w-[540px] text-xl leading-relaxed text-[#c9d0cb]/70">
                    {workflowSection.description}
                  </p>

                  <div className="mt-auto grid gap-5 md:grid-cols-4">
                    {workflowSection.steps.map((item) => (
                      <div key={item.step} className="rounded-xl border border-[#f4f0e8]/14 bg-[#050606]/68 p-5 backdrop-blur-md">
                        <p className="text-sm font-medium text-[#9be15d]">{item.step}</p>
                        <h3 className="mt-2 text-2xl font-normal text-[#f4f0e8]">{item.title}</h3>
                        <pre className="mt-5 min-h-[92px] whitespace-pre-wrap rounded-lg border border-[#f4f0e8]/12 bg-[#f4f0e8]/[0.035] p-4 font-mono text-xs leading-relaxed text-[#c9d0cb]/76">{item.body}</pre>
                      </div>
                    ))}
                  </div>

                  <div className="mt-10 grid gap-5 border-t border-[#f4f0e8]/12 pt-8 md:grid-cols-3">
                    {workflowSection.security.map(({ title, description, icon: Icon }) => (
                      <div key={title} className="flex gap-5">
                        <Icon className="h-9 w-9 shrink-0 text-[#9be15d]" />
                        <div>
                          <h3 className="text-xl font-medium text-[#f4f0e8]">{title}</h3>
                          <p className="mt-2 max-w-[290px] text-sm leading-relaxed text-[#c9d0cb]/72">{description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section id="open-source" className="relative my-8 min-h-[620px] overflow-hidden border border-[#f4f0e8]/10 bg-[#050606] shadow-[0_34px_110px_rgba(0,0,0,0.42)] md:my-12">
                <img src="/images/ipaship-bg-cta.png" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-82" draggable={false} />
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,6,6,0.9),rgba(5,6,6,0.62)_42%,rgba(5,6,6,0.18)_100%)]" />
                <div className="relative z-10 flex min-h-[620px] flex-col justify-between px-6 py-10 md:px-10 md:py-12">
                  <div />
                  <div>
                    <h2 className="max-w-[860px] text-[clamp(3.7rem,7vw,6.6rem)] font-normal leading-[0.95] tracking-[-0.055em] text-[#f4f0e8]">
                      {ctaSection.title}
                    </h2>
                    <p className="mt-6 max-w-[520px] text-xl leading-relaxed text-[#c9d0cb]/78">
                      {ctaSection.description}
                    </p>
                    <div className="mt-9 flex flex-wrap items-center gap-8">
                      <button
                        type="button"
                        onClick={() => file ? handleRunAudit() : fileInputRef.current?.click()}
                        disabled={isUploading || (!!file && !isReady)}
                        className="inline-flex min-w-[230px] items-center justify-center gap-5 rounded-md bg-[#9be15d] px-7 py-4 text-lg font-medium text-[#050606] transition-colors hover:bg-[#b7f278] disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {ctaSection.primary}
                        <span className="text-3xl leading-none">→</span>
                      </button>
                      <Link
                        href="https://github.com/atharvnaik1/ipaship-app-reviewer"
                        target="_blank"
                        className="text-lg font-medium text-[#f4f0e8] underline decoration-[#f4f0e8]/70 underline-offset-8 transition-colors hover:text-[#9be15d]"
                      >
                        {ctaSection.secondary}
                      </Link>
                    </div>
                  </div>
                  <footer className="flex flex-col gap-4 border-t border-[#f4f0e8]/18 pt-7 md:flex-row md:items-center md:justify-between">
                    <Link href="https://ipaship.com" target="_blank" className="text-2xl font-black tracking-[-0.04em] text-[#f4f0e8] transition-colors hover:text-[#9be15d]">ipaShip</Link>
                    <div className="flex flex-wrap gap-8 text-sm text-[#f4f0e8]">
                      <a href="https://ipaship.com/privacy" className="transition-colors hover:text-[#9be15d]">Security</a>
                      <a href="https://ipaship.com/about" className="transition-colors hover:text-[#9be15d]">Docs</a>
                      <a href="https://github.com/atharvnaik1/ipaship-app-reviewer" className="transition-colors hover:text-[#9be15d]">Source</a>
                    </div>
                  </footer>
                </div>
              </section>
            </motion.div>
          )}

          {/* ═══════════════ ANALYZING STATE ═══════════════ */}
          {(phase === 'uploading' || phase === 'analyzing') && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-8 md:py-12"
            >
              <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
                <aside className="rounded-2xl border border-[#f4f0e8]/10 bg-[#090c0b]/88 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
                  <div className="flex items-center justify-between gap-4 border-b border-[#f4f0e8]/10 pb-5">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#9be15d]">Live audit</p>
                      <h2 className="mt-2 text-2xl font-black text-[#f4f0e8]">
                        {phase === 'uploading' ? 'Extracting bundle' : 'Reviewing source'}
                      </h2>
                    </div>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
                      className="grid h-12 w-12 place-items-center rounded-full border border-[#9be15d]/25 bg-[#9be15d]/10"
                    >
                      <Loader2 className="h-6 w-6 text-[#9be15d]" />
                    </motion.div>
                  </div>

                  <div className="mt-5 rounded-xl border border-[#f4f0e8]/10 bg-[#f4f0e8]/[0.035] p-4">
                    <p className="truncate text-sm font-semibold text-[#f4f0e8]">{file?.name || 'App bundle'}</p>
                    <div className="mt-2 flex items-center justify-between text-xs text-[#8b9691]">
                      <span>{file ? formatFileSize(file.size) : 'Waiting for file'}</span>
                      <span>{uploadSpeed || `${uploadProgress}%`}</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#f4f0e8]/10">
                      <motion.div
                        className="h-full rounded-full bg-[#9be15d]"
                        animate={{ width: phase === 'uploading' ? `${Math.max(uploadProgress, 8)}%` : '100%' }}
                        transition={{ duration: 0.4 }}
                      />
                    </div>
                  </div>

                  <div className="mt-6 space-y-3">
                    {auditProgressSteps.map((step, index) => {
                      const activeIndex = phase === 'uploading' ? 1 : reportContent ? 3 : 2;
                      const isActive = index === activeIndex;
                      const isDone = index < activeIndex;
                      return (
                        <div key={step.label} className={`flex gap-3 rounded-xl border p-3 ${isActive ? 'border-[#9be15d]/35 bg-[#9be15d]/8' : 'border-[#f4f0e8]/10 bg-[#f4f0e8]/[0.02]'}`}>
                          <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[10px] font-black ${isDone ? 'border-[#9be15d] bg-[#9be15d] text-[#050606]' : isActive ? 'border-[#9be15d] text-[#9be15d]' : 'border-[#f4f0e8]/18 text-[#8b9691]'}`}>
                            {isDone ? '✓' : index + 1}
                          </span>
                          <span>
                            <span className="block text-sm font-semibold text-[#f4f0e8]">{step.label}</span>
                            <span className="mt-0.5 block text-xs text-[#8b9691]">{step.description}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {filesScanned > 0 && (
                    <div className="mt-6">
                      <button
                        onClick={() => setShowFileList(!showFileList)}
                        className="flex w-full items-center justify-between rounded-xl border border-[#f4f0e8]/10 bg-[#f4f0e8]/[0.035] px-4 py-3 text-left text-xs font-semibold text-[#c9d0cb] transition-colors hover:border-[#9be15d]/35 hover:text-[#f4f0e8]"
                      >
                        <span className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-[#9be15d]" />
                          {filesScanned} source files queued
                        </span>
                        <motion.div animate={{ rotate: showFileList ? 180 : 0 }}>
                          <ChevronDown className="h-4 w-4" />
                        </motion.div>
                      </button>

                      <AnimatePresence>
                        {showFileList && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1, marginTop: 10 }}
                            exit={{ height: 0, opacity: 0, marginTop: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="max-h-48 overflow-y-auto rounded-xl border border-[#f4f0e8]/10 bg-black/35 p-3 custom-scrollbar">
                              {fileNames.map((name, i) => (
                                <div key={`${name}-${i}`} className="flex items-center gap-2 border-b border-[#f4f0e8]/[0.05] py-1.5 font-mono text-[10px] text-[#8b9691] last:border-0">
                                  <div className="h-1 w-1 shrink-0 rounded-full bg-[#9be15d]/60" />
                                  <span className="truncate">{name}</span>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </aside>

                <section className="min-h-[560px] overflow-hidden rounded-2xl border border-[#f4f0e8]/10 bg-[#070909] shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
                  <div className="flex items-center justify-between border-b border-[#f4f0e8]/10 bg-[#050606]/88 px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <div className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#9be15d] opacity-70" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#9be15d]" />
                      </div>
                      <span className="text-xs font-bold uppercase tracking-[0.24em] text-[#c9d0cb]">Streaming report</span>
                    </div>
                    <span className="hidden text-xs text-[#8b9691] sm:inline">
                      {reportContent ? `${reportContent.length.toLocaleString()} chars` : 'Waiting for first token'}
                    </span>
                  </div>
                  <div ref={reportRef} className="max-h-[620px] min-h-[500px] overflow-y-auto bg-[radial-gradient(circle_at_20%_0%,rgba(155,225,93,0.08),transparent_28%)] p-5 custom-scrollbar md:p-8">
                    {reportContent ? (
                      <div className="prose prose-invert max-w-none text-xs leading-relaxed md:text-sm">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{reportContent}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="flex min-h-[430px] flex-col items-center justify-center text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-[#9be15d]" />
                        <p className="mt-5 text-lg font-semibold text-[#f4f0e8]">Preparing policy context</p>
                        <p className="mt-2 max-w-sm text-sm leading-relaxed text-[#8b9691]">The report stream will appear here as soon as the model starts returning findings.</p>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </motion.div>
          )}

          {/* ═══════════════ COMPLETE STATE ═══════════════ */}
          {phase === 'complete' && reportContent && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="py-8 md:py-12 space-y-6"
            >
              {/* Status bar */}
              <div className="rounded-2xl border border-[#9be15d]/20 bg-[#07100c]/88 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.28)] md:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-xl border border-[#9be15d]/25 bg-[#9be15d]/12">
                      <CheckCircle className="w-5 h-5 text-[#9be15d]" />
                    </div>
                  <div>
                      <h3 className="text-[#f4f0e8] font-bold text-sm">Audit Complete</h3>
                      <p className="text-[#8b9691] text-xs">{filesScanned} files analyzed{file ? ` · ${file.name}` : ''}</p>
                    </div>
                  </div>

                  <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 xl:w-auto">
                    <button
                      onClick={handleExportFixPlan}
                      disabled={!hasReport}
                      className="rounded-xl bg-[#9be15d] px-4 py-2.5 text-xs font-black text-[#050606] transition-colors hover:bg-[#b7f278] disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Fix Plan
                    </button>
                    <button
                      onClick={handleExportReport}
                      disabled={!hasReport}
                      className="rounded-xl border border-[#f4f0e8]/12 bg-[#f4f0e8]/8 px-4 py-2.5 text-xs font-semibold text-[#f4f0e8] transition-colors hover:bg-[#f4f0e8]/12 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" /> Markdown
                    </button>
                    <button
                      onClick={handleExportPdf}
                      disabled={!hasReport}
                      className="rounded-xl border border-[#f4f0e8]/12 bg-[#f4f0e8]/8 px-4 py-2.5 text-xs font-semibold text-[#f4f0e8] transition-colors hover:bg-[#f4f0e8]/12 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      <FileText className="w-3.5 h-3.5" /> PDF
                    </button>
                    <button
                      onClick={() => {
                        setPhase('idle');
                        setReportContent('');
                        setFile(null);
                        setUploadedFileId(null);
                        setUploadError('');
                        setUploadProgress(0);
                        setUploadSpeed('');
                        setIsAutoAnalyzing(false);
                        autoTriggeredFileIdRef.current = null;
                      }}
                      className="rounded-xl border border-[#f4f0e8]/12 bg-transparent px-4 py-2.5 text-xs font-semibold text-[#f4f0e8] transition-colors hover:bg-[#f4f0e8]/8 flex items-center justify-center gap-1.5"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> New Audit
                    </button>
                  </div>
                </div>
              </div>

              {/* Review Readiness Dashboard */}
              <div className="overflow-hidden rounded-2xl border border-[#f4f0e8]/10 bg-[#070909]/92">
                <div className="px-5 md:px-6 py-4 border-b border-[#f4f0e8]/10 bg-[#050606]/80 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-[#8b9691] font-bold">Review Readiness Intelligence</p>
                    <h2 className="text-xl md:text-2xl font-black text-[#f4f0e8] mt-1">Submission Command Center</h2>
                  </div>
                  <div className={`px-3 py-2 rounded-xl border text-xs font-black ${readinessTone}`}>
                    {reportSummary.verdict === 'UNKNOWN' ? 'PENDING VERDICT' : reportSummary.verdict}
                  </div>
                </div>

                <div className="p-5 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <div className="lg:col-span-3 rounded-xl border border-[#f4f0e8]/10 bg-[#f4f0e8]/[0.035] p-5">
                    <p className="text-xs font-semibold text-[#8b9691]">Readiness Score</p>
                    <div className="mt-3 flex items-end gap-2">
                      <span className="text-5xl font-black text-[#f4f0e8] leading-none">
                        {reportSummary.score === null ? 'Pending' : reportSummary.score}
                      </span>
                      {reportSummary.score !== null && <span className="text-sm font-bold text-[#8b9691] mb-1">/100</span>}
                    </div>
                    <p className="text-xs text-[#8b9691] mt-4">
                      {reportSummary.estimatedFixEffort ? `Estimated fix effort: ${reportSummary.estimatedFixEffort}` : 'Score appears after the report includes readiness metrics.'}
                    </p>
                  </div>

                  <div className="lg:col-span-4 grid grid-cols-2 gap-3">
                    {severityCards.map((item) => (
                      <div key={item.label} className={`rounded-xl border p-4 ${item.className}`}>
                        <p className="text-2xl font-black leading-none">{item.value}</p>
                        <p className="text-[10px] uppercase tracking-wider font-bold mt-2">{item.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="lg:col-span-5 rounded-xl border border-[#f4f0e8]/10 bg-[#f4f0e8]/[0.035] p-5">
                    <p className="text-xs font-bold text-[#f4f0e8] uppercase tracking-wider">Recommended Next Action</p>
                    <p className="text-sm text-[#c9d0cb]/76 leading-relaxed mt-2">
                      {reportSummary.recommendedNextAction || blockers[0] || 'Review the full report and resolve the highest severity items first.'}
                    </p>
                    {reportSummary.policyCategories.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-4">
                        {reportSummary.policyCategories.slice(0, 5).map((category: string) => (
                          <span key={category} className="px-2.5 py-1 rounded-full border border-[#f4f0e8]/10 bg-[#f4f0e8]/5 text-[10px] font-semibold text-[#8b9691]">
                            {category}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="lg:col-span-6 rounded-xl border border-[#f4f0e8]/10 bg-[#f4f0e8]/[0.035] p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <AlertTriangle className="w-4 h-4 text-orange-300" />
                      <p className="text-xs font-bold text-[#f4f0e8] uppercase tracking-wider">Top Blockers</p>
                    </div>
                    {blockers.length > 0 ? (
                      <ul className="space-y-3">
                        {blockers.map((item: string) => (
                          <li key={item} className="flex gap-3 text-sm text-[#c9d0cb]/76 leading-relaxed">
                            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-orange-300 shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-[#8b9691]">No blocker list was found in the structured summary.</p>
                    )}
                  </div>

                  <div className="lg:col-span-6 rounded-xl border border-[#f4f0e8]/10 bg-[#f4f0e8]/[0.035] p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <CheckCircle className="w-4 h-4 text-green-300" />
                      <p className="text-xs font-bold text-[#f4f0e8] uppercase tracking-wider">Quick Wins</p>
                    </div>
                    {quickWins.length > 0 ? (
                      <ul className="space-y-3">
                        {quickWins.map((item: string) => (
                          <li key={item} className="flex gap-3 text-sm text-[#c9d0cb]/76 leading-relaxed">
                            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-green-300 shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-[#8b9691]">Quick wins will appear when the report includes low-effort remediation items.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Report */}
              <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/30">
                <div className="px-5 md:px-8 py-3 border-b border-white/10 bg-black/50 sticky top-0 z-20 backdrop-blur-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="bg-gradient-to-br from-primary to-blue-500 w-6 h-6 rounded-lg flex items-center justify-center">
                        <Apple className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-sm font-bold text-white">ipaShip</span>
                      <span className="text-[10px] text-muted-foreground font-medium hidden sm:inline">Compliance Report</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-medium">
                      {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 pt-2 border-t border-white/5">
                    <a href="mailto:hello@ipaship.com" className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-white font-medium transition-colors">
                      <Mail className="w-3 h-3" /> hello@ipaship.com
                    </a>
                    <a href="https://github.com/atharvnaik1/ipaship-app-reviewer" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-white font-medium transition-colors">
                      <Github className="w-3 h-3" /> Source
                    </a>
                  </div>
                </div>

                <div className="p-5 md:p-10 overflow-y-auto max-h-[75vh] custom-scrollbar">
                  <div ref={completeReportRef} className="prose prose-invert max-w-none text-sm md:text-base leading-relaxed prose-headings:text-foreground prose-p:text-muted-foreground prose-p:leading-relaxed prose-li:text-muted-foreground prose-li:my-1 prose-strong:text-white prose-strong:font-bold prose-a:text-primary prose-a:transition-colors prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:font-mono prose-code:text-xs prose-code:border prose-code:border-primary/20 prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-xl prose-pre:p-4">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        // ── Tables ───────────────────────────────────────
                        table: ({ children }) => (
                          <div className="overflow-x-auto my-6 rounded-xl border border-white/10 shadow-lg">
                            <table className="w-full text-sm border-collapse">{children}</table>
                          </div>
                        ),
                        thead: ({ children }) => (
                          <thead className="bg-white/[0.06] border-b border-white/10">{children}</thead>
                        ),
                        tbody: ({ children }) => (
                          <tbody className="divide-y divide-white/[0.05]">{children}</tbody>
                        ),
                        tr: ({ children }) => (
                          <tr className="hover:bg-white/[0.03] transition-colors">{children}</tr>
                        ),
                        th: ({ children }) => (
                          <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                            {children}
                          </th>
                        ),
                        td: ({ children }) => {
                          const text = String(children ?? '');
                          // Severity badge colouring
                          if (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(text.trim())) {
                            const colours: Record<string, string> = {
                              CRITICAL: 'bg-red-500/20 text-red-300 border-red-500/30',
                              HIGH: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
                              MEDIUM: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
                              LOW: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
                            };
                            return (
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${colours[text.trim()]}`}>
                                  {text.trim()}
                                </span>
                              </td>
                            );
                          }
                          return <td className="px-4 py-3 text-sm text-muted-foreground align-middle">{children}</td>;
                        },
                        // ── Ordered list — Phase 2 numbered items ────────
                        ol: ({ children }) => (
                          <ol className="my-4 space-y-3 list-none pl-0">{children}</ol>
                        ),
                        li: ({ children, ...props }) => {
                          // Only style top-level items inside ol
                          const ordered = (props as any).ordered ?? false;
                          if (ordered) {
                            const index = (props as any).index ?? 0;
                            return (
                              <li className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10 transition-all">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 border border-primary/30 text-primary text-[10px] font-black flex items-center justify-center mt-0.5">
                                  {index + 1}
                                </span>
                                <span className="text-sm text-muted-foreground leading-relaxed flex-1">{children}</span>
                              </li>
                            );
                          }
                          return <li className="text-sm text-muted-foreground leading-relaxed my-1.5 pl-1">{children}</li>;
                        },
                        // ── Blockquote ────────────────────────────────────
                        blockquote: ({ children }) => (
                          <blockquote className="my-4 pl-4 border-l-2 border-primary/40 bg-primary/5 rounded-r-xl py-3 pr-4 text-sm text-muted-foreground">
                            {children}
                          </blockquote>
                        ),
                        // ── Headings ──────────────────────────────────────
                        h2: ({ children }) => (
                          <h2 className="text-xl font-black text-white mt-10 mb-4 pb-2 border-b border-white/10 flex items-center gap-2">
                            {children}
                          </h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="text-base font-bold text-white/90 mt-6 mb-3">{children}</h3>
                        ),
                      }}
                    >
                      {reportContent}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* AI Debugger Component */}
      <AIDebugger 
        phase={phase} 
        filesScanned={filesScanned} 
        reportContent={reportContent} 
      />

    </main>
  );
}
