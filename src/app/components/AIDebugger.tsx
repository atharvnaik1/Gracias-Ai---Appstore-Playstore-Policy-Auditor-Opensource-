'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Bug, Play, Pause, Trash2, ChevronDown, ChevronUp, X, Send } from 'lucide-react';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

interface AIDebuggerProps {
  phase: string;
  filesScanned: number;
  reportContent: string;
}

export default function AIDebugger({ phase, filesScanned, reportContent }: AIDebuggerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Add system logs based on phase changes
  useEffect(() => {
    const newLog: LogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      level: 'info',
      message: `System phase changed to: ${phase}`
    };
    setLogs(prev => [...prev, newLog]);
  }, [phase]);

  useEffect(() => {
    if (filesScanned > 0) {
      const newLog: LogEntry = {
        timestamp: new Date().toLocaleTimeString(),
        level: 'debug',
        message: `File scanned. Total: ${filesScanned}`
      };
      setLogs(prev => [...prev, newLog]);
    }
  }, [filesScanned]);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleSendPrompt = () => {
    if (!prompt.trim()) return;
    const userLog: LogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      level: 'debug',
      message: `AI Query: ${prompt}`
    };
    setLogs(prev => [...prev, userLog]);
    
    // Simulate AI response
    setTimeout(() => {
      const aiLog: LogEntry = {
        timestamp: new Date().toLocaleTimeString(),
        level: 'info',
        message: `AI Response: Analysis of "${prompt}" complete. The current state is ${phase} with ${filesScanned} files scanned.`
      };
      setLogs(prev => [...prev, aiLog]);
    }, 1000);
    
    setPrompt('');
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 p-4 rounded-full bg-primary text-white shadow-lg hover:scale-110 transition-all z-50 flex items-center gap-2 font-bold text-sm"
      >
        <Bug className="w-5 h-5" />
        AI Debugger
      </button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`fixed bottom-6 right-6 w-96 bg-black/90 border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl flex flex-col transition-all ${isMinimized ? 'h-14' : 'h-[500px]'}`}
    >
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between bg-primary/10">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">ipaShip AI Debugger</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setIsMinimized(!isMinimized)} className="p-1 hover:bg-white/5 rounded">
            {isMinimized ? <ChevronUp className="w-4 h-4 text-white" /> : <ChevronDown className="w-4 h-4 text-white" />}
          </button>
          <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-red-500/20 rounded group">
            <X className="w-4 h-4 text-white group-hover:text-red-400" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Status Bar */}
          <div className="px-4 py-2 bg-white/5 border-b border-white/5 flex items-center justify-between text-[10px] font-mono text-muted-foreground uppercase">
            <div className="flex gap-3">
              <span>Phase: <span className="text-primary">{phase}</span></span>
              <span>Files: <span className="text-blue-400">{filesScanned}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsPaused(!isPaused)} 
                className={`flex items-center gap-1 hover:text-white transition-colors ${isPaused ? 'text-amber-400' : ''}`}
              >
                {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                {isPaused ? 'Resume' : 'Pause'}
              </button>
              <button onClick={() => setLogs([])} className="hover:text-red-400 transition-colors">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Logs */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar font-mono text-[11px]">
            {logs.map((log, i) => (
              <div key={i} className="flex gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                <span className="text-muted-foreground shrink-0">[{log.timestamp}]</span>
                <span className={`font-bold shrink-0 ${
                  log.level === 'error' ? 'text-red-400' : 
                  log.level === 'warn' ? 'text-amber-400' : 
                  log.level === 'info' ? 'text-primary' : 'text-blue-400'
                }`}>{log.level.toUpperCase()}:</span>
                <span className="text-white/80">{log.message}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>

          {/* Interactive Console */}
          <div className="p-4 border-t border-white/10 bg-white/5">
            <div className="relative">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendPrompt()}
                placeholder="Ask the AI about current scan..."
                className="w-full bg-black/50 border border-white/10 rounded-xl py-2 pl-3 pr-10 text-xs text-white placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-all"
              />
              <button 
                onClick={handleSendPrompt}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-primary transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}
