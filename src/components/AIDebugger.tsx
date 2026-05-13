'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bug, Play, Pause, Square, Terminal,
  MessageSquare, Eye, ChevronRight, ChevronDown,
  AlertCircle, CheckCircle, Info, Trash2, Download
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Breakpoint {
  id: string;
  filePattern: string;
  condition?: string;
  enabled: boolean;
}

interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'info' | 'warn' | 'error' | 'breakpoint' | 'ai';
  message: string;
  details?: any;
}

interface DebugState {
  variables: Record<string, any>;
  callStack: string[];
  currentFile?: string;
  lineNumber?: number;
}

interface AIDebuggerProps {
  auditLogs: string[];
  auditState?: any;
  onPromptAI?: (prompt: string, context: any) => Promise<string>;
}

export default function AIDebugger({ auditLogs, auditState, onPromptAI }: AIDebuggerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'console' | 'breakpoints' | 'state' | 'ai'>('console');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [breakpoints, setBreakpoints] = useState<Breakpoint[]>([]);
  const [debugState, setDebugState] = useState<DebugState>({
    variables: {},
    callStack: [],
  });
  const [isDebugging, setIsDebugging] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [newBreakpointPattern, setNewBreakpointPattern] = useState('');
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll console to bottom
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Add initial log when debugger opens
  useEffect(() => {
    if (isOpen && logs.length === 0) {
      addLog('info', '🔧 AI Debugger initialized. Ready to debug.');
    }
  }, [isOpen]);

  // Process audit logs
  useEffect(() => {
    if (auditLogs && auditLogs.length > 0) {
      const lastLog = auditLogs[auditLogs.length - 1];
      if (lastLog && isDebugging) {
        addLog('info', lastLog);
        checkBreakpoints(lastLog);
      }
    }
  }, [auditLogs, isDebugging]);

  const addLog = (type: LogEntry['type'], message: string, details?: any) => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      type,
      message,
      details,
    }]);
  };

  const checkBreakpoints = (logMessage: string) => {
    breakpoints.forEach(bp => {
      if (bp.enabled && logMessage.includes(bp.filePattern)) {
        addLog('breakpoint', `⏸️ Breakpoint hit: "${bp.filePattern}"`, { breakpoint: bp });
        setIsDebugging(false);
        
        // Capture state at breakpoint
        setDebugState(prev => ({
          ...prev,
          variables: {
            ...prev.variables,
            lastLog: logMessage,
            timestamp: new Date().toISOString(),
          },
        }));
      }
    });
  };

  const addBreakpoint = () => {
    if (!newBreakpointPattern.trim()) return;
    
    const bp: Breakpoint = {
      id: Math.random().toString(36).substr(2, 9),
      filePattern: newBreakpointPattern,
      enabled: true,
    };
    
    setBreakpoints(prev => [...prev, bp]);
    setNewBreakpointPattern('');
    addLog('info', `➕ Breakpoint added: "${bp.filePattern}"`);
  };

  const toggleBreakpoint = (id: string) => {
    setBreakpoints(prev => prev.map(bp =>
      bp.id === id ? { ...bp, enabled: !bp.enabled } : bp
    ));
  };

  const removeBreakpoint = (id: string) => {
    setBreakpoints(prev => prev.filter(bp => bp.id !== id));
  };

  const startDebugging = () => {
    setIsDebugging(true);
    addLog('info', '▶️ Debugging started');
  };

  const pauseDebugging = () => {
    setIsDebugging(false);
    addLog('info', '⏸️ Debugging paused');
  };

  const stopDebugging = () => {
    setIsDebugging(false);
    addLog('info', '⏹️ Debugging stopped');
  };

  const clearLogs = () => {
    setLogs([]);
    addLog('info', '🗑️ Console cleared');
  };

  const exportLogs = () => {
    const logText = logs.map(l => 
      `[${l.timestamp.toLocaleTimeString()}] [${l.type.toUpperCase()}] ${l.message}`
    ).join('\n');
    
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-logs-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    addLog('info', '💾 Logs exported');
  };

  const askAI = async () => {
    if (!aiPrompt.trim() || !onPromptAI) return;
    
    setIsAiLoading(true);
    addLog('ai', `🤔 Asking AI: "${aiPrompt}"`);
    
    try {
      const context = {
        logs: logs.slice(-20),
        state: debugState,
        breakpoints,
        auditState,
      };
      
      const response = await onPromptAI(aiPrompt, context);
      setAiResponse(response);
      addLog('ai', `🤖 AI Response received (${response.length} chars)`);
    } catch (error) {
      addLog('error', `❌ AI request failed: ${error}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const getLogIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'error': return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'warn': return <AlertCircle className="w-4 h-4 text-yellow-400" />;
      case 'breakpoint': return <Pause className="w-4 h-4 text-purple-400" />;
      case 'ai': return <MessageSquare className="w-4 h-4 text-blue-400" />;
      default: return <Info className="w-4 h-4 text-gray-400" />;
    }
  };

  const getLogColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'error': return 'text-red-400 bg-red-400/10';
      case 'warn': return 'text-yellow-400 bg-yellow-400/10';
      case 'breakpoint': return 'text-purple-400 bg-purple-400/10';
      case 'ai': return 'text-blue-400 bg-blue-400/10';
      default: return 'text-gray-400 bg-gray-400/10';
    }
  };

  return (
    <>
      {/* Floating Debug Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full shadow-lg hover:shadow-xl transition-shadow"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Bug className="w-5 h-5" />
        <span className="font-medium">AI Debugger</span>
        {isDebugging && (
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        )}
      </motion.button>

      {/* Debugger Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-6 z-50 w-[600px] max-w-[90vw] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <Bug className="w-5 h-5 text-purple-400" />
                <span className="font-semibold text-white">AI Debugger</span>
                {isDebugging && (
                  <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded-full">
                    Running
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Control Buttons */}
                {!isDebugging ? (
                  <button
                    onClick={startDebugging}
                    className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
                    title="Start Debugging"
                  >
                    <Play className="w-4 h-4 text-green-400" />
                  </button>
                ) : (
                  <button
                    onClick={pauseDebugging}
                    className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
                    title="Pause"
                  >
                    <Pause className="w-4 h-4 text-yellow-400" />
                  </button>
                )}
                <button
                  onClick={stopDebugging}
                  className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
                  title="Stop"
                >
                  <Square className="w-4 h-4 text-red-400" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <span className="text-gray-400">✕</span>
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-700">
              {(['console', 'breakpoints', 'state', 'ai'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 px-4 py-2 text-sm font-medium capitalize transition-colors ${
                    activeTab === tab
                      ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-400/10'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                  }`}
                >
                  {tab === 'ai' ? '🤖 AI Chat' : tab}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="h-[400px] overflow-auto">
              {/* Console Tab */}
              {activeTab === 'console' && (
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-gray-400">
                      {logs.length} entries
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={exportLogs}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        Export
                      </button>
                      <button
                        onClick={clearLogs}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        Clear
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-1 font-mono text-sm">
                    {logs.map((log) => (
                      <div
                        key={log.id}
                        className={`flex items-start gap-2 p-2 rounded ${getLogColor(log.type)}`}
                      >
                        {getLogIcon(log.type)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-xs opacity-60">
                            <span>{log.timestamp.toLocaleTimeString()}</span>
                            <span className="uppercase">[{log.type}]</span>
                          </div>
                          <div className="mt-0.5 break-words">{log.message}</div>
                        </div>
                      </div>
                    ))}
                    <div ref={consoleEndRef} />
                  </div>
                </div>
              )}

              {/* Breakpoints Tab */}
              {activeTab === 'breakpoints' && (
                <div className="p-4 space-y-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newBreakpointPattern}
                      onChange={(e) => setNewBreakpointPattern(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addBreakpoint()}
                      placeholder="Add breakpoint pattern (e.g., 'error', 'upload')..."
                      className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                    />
                    <button
                      onClick={addBreakpoint}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                    >
                      Add
                    </button>
                  </div>

                  <div className="space-y-2">
                    {breakpoints.length === 0 ? (
                      <div className="text-center text-gray-500 py-8">
                        <Pause className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>No breakpoints set</p>
                        <p className="text-sm mt-1">Add patterns to pause execution</p>
                      </div>
                    ) : (
                      breakpoints.map((bp) => (
                        <div
                          key={bp.id}
                          className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg"
                        >
                          <button
                            onClick={() => toggleBreakpoint(bp.id)}
                            className={`w-4 h-4 rounded border transition-colors ${
                              bp.enabled
                                ? 'bg-purple-500 border-purple-500'
                                : 'border-gray-500'
                            }`}
                          >
                            {bp.enabled && <CheckCircle className="w-3 h-3 text-white" />}
                          </button>
                          <span className={`flex-1 ${bp.enabled ? 'text-white' : 'text-gray-500 line-through'}`}>
                            "{bp.filePattern}"
                          </span>
                          <button
                            onClick={() => removeBreakpoint(bp.id)}
                            className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* State Tab */}
              {activeTab === 'state' && (
                <div className="p-4">
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                      <Eye className="w-4 h-4" />
                      Variables
                    </h4>
                    <pre className="p-3 bg-gray-800 rounded-lg text-xs text-gray-300 overflow-auto max-h-[150px]">
                      {JSON.stringify(debugState.variables, null, 2) || '// No variables captured'}
                    </pre>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                      <Terminal className="w-4 h-4" />
                      Call Stack
                    </h4>
                    {debugState.callStack.length === 0 ? (
                      <div className="text-gray-500 text-sm py-4 text-center">
                        No call stack captured
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {debugState.callStack.map((frame, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm text-gray-300">
                            <span className="text-gray-500">#{i}</span>
                            <ChevronRight className="w-3 h-3" />
                            {frame}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* AI Chat Tab */}
              {activeTab === 'ai' && (
                <div className="p-4 space-y-4">
                  <div className="h-[250px] overflow-auto space-y-3">
                    {aiResponse ? (
                      <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                        <div className="flex items-center gap-2 mb-2 text-blue-400">
                          <MessageSquare className="w-4 h-4" />
                          <span className="text-sm font-medium">AI Response</span>
                        </div>
                        <div className="prose prose-invert prose-sm max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {aiResponse}
                          </ReactMarkdown>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 py-8">
                        <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>Ask AI about your debug session</p>
                        <p className="text-sm mt-1">AI has access to logs, state, and breakpoints</p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && askAI()}
                      placeholder="Ask AI about the current state, logs, or errors..."
                      disabled={isAiLoading}
                      className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                    />
                    <button
                      onClick={askAI}
                      disabled={isAiLoading || !aiPrompt.trim()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
                    >
                      {isAiLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Thinking...
                        </>
                      ) : (
                        <>
                          <MessageSquare className="w-4 h-4" />
                          Ask
                        </>
                      )}
                    </button>
                  </div>

                  <div className="text-xs text-gray-500">
                    <p>💡 Try asking:</p>
                    <ul className="list-disc list-inside mt-1 space-y-0.5">
                      <li>"What errors occurred in the last 10 logs?"</li>
                      <li>"Explain the current state variables"</li>
                      <li>"Why did my breakpoint trigger?"</li>
                      <li>"Suggest fixes for the warnings"</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
