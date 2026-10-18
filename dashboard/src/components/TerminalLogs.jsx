import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Copy, Check, ArrowDown, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { fetchBuildLogs } from '../api';

export default function TerminalLogs({ projectId, buildId, onStatusChange }) {
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState('QUEUED');
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isPolling, setIsPolling] = useState(true);
  const [duration, setDuration] = useState(0);

  const terminalRef = useRef(null);
  const nextTokenRef = useRef(null);
  const pollTimerRef = useRef(null);
  const startTimeRef = useRef(Date.now());

  // Duration counter
  useEffect(() => {
    let timer;
    if (status === 'IN_PROGRESS' || status === 'QUEUED') {
      timer = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [status]);

  // Polling loop for CloudWatch logs
  useEffect(() => {
    if (!projectId || !buildId) return;

    let isMounted = true;

    async function poll() {
      try {
        const data = await fetchBuildLogs(projectId, buildId, nextTokenRef.current);
        if (!isMounted) return;

        if (data.events && data.events.length > 0) {
          setLogs((prev) => {
            const newLogs = [...prev];
            data.events.forEach((ev) => {
              // Avoid duplicates
              if (!newLogs.some((l) => l.timestamp === ev.timestamp && l.message === ev.message)) {
                newLogs.push(ev);
              }
            });
            return newLogs;
          });
        }

        if (data.nextForwardToken) {
          nextTokenRef.current = data.nextForwardToken;
        }

        if (data.status) {
          setStatus(data.status);
          if (onStatusChange) onStatusChange(data.status);
        }

        // Stop polling if build completed
        if (['SUCCEEDED', 'FAILED', 'STOPPED'].includes(data.status)) {
          setIsPolling(false);
        } else {
          pollTimerRef.current = setTimeout(poll, 2500);
        }

      } catch (err) {
        console.error('Log fetch error:', err);
        if (isMounted) {
          pollTimerRef.current = setTimeout(poll, 4000);
        }
      }
    }

    poll();

    return () => {
      isMounted = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [projectId, buildId]);

  // Auto-scroll terminal
  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleCopy = () => {
    const rawText = logs.map((l) => l.message).join('');
    navigator.clipboard.writeText(rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col h-[520px]">
      
      {/* Terminal Title Bar */}
      <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-3">
          <div className="flex space-x-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
            <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
            <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
          </div>
          <div className="flex items-center space-x-2 text-slate-300 font-mono">
            <Terminal className="h-3.5 w-3.5 text-emerald-400" />
            <span className="font-semibold">{projectId}</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">{buildId}</span>
          </div>
        </div>

        {/* Status & Actions */}
        <div className="flex items-center space-x-4">
          
          {/* Duration */}
          <div className="flex items-center space-x-1 text-slate-400 font-mono">
            <Clock className="h-3.5 w-3.5" />
            <span>{duration}s</span>
          </div>

          {/* Status Badge */}
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium border"
               style={{
                 borderColor: status === 'SUCCEEDED' ? '#166534' : status === 'FAILED' ? '#991b1b' : '#1e3a8a',
                 backgroundColor: status === 'SUCCEEDED' ? 'rgba(22, 101, 52, 0.2)' : status === 'FAILED' ? 'rgba(153, 27, 27, 0.2)' : 'rgba(30, 58, 138, 0.2)',
                 color: status === 'SUCCEEDED' ? '#4ade80' : status === 'FAILED' ? '#f87171' : '#60a5fa'
               }}>
            {status === 'IN_PROGRESS' && <Loader2 className="h-3 w-3 animate-spin" />}
            {status === 'QUEUED' && <Loader2 className="h-3 w-3 animate-spin" />}
            {status === 'SUCCEEDED' && <CheckCircle2 className="h-3 w-3" />}
            {status === 'FAILED' && <XCircle className="h-3 w-3" />}
            <span>{status}</span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center space-x-1.5 border-l border-slate-800 pl-3">
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`p-1.5 rounded hover:bg-slate-800 transition ${autoScroll ? 'text-emerald-400' : 'text-slate-500'}`}
              title="Toggle Auto Scroll"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleCopy}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
              title="Copy All Logs"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>

        </div>
      </div>

      {/* Terminal Output Body */}
      <div
        ref={terminalRef}
        className="flex-1 p-4 bg-slate-950 font-mono text-[12.5px] leading-relaxed overflow-y-auto text-slate-300 selection:bg-emerald-500 selection:text-black space-y-1"
      >
        {logs.length === 0 ? (
          <div className="text-slate-500 italic py-8 text-center flex flex-col items-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-500 mb-2" />
            <span>Establishing CloudWatch log stream with CodeBuild runner...</span>
          </div>
        ) : (
          logs.map((log, index) => {
            const isError = log.message.includes('ERROR') || log.message.includes('ERR!') || log.message.includes('failed');
            const isSuccess = log.message.includes('success') || log.message.includes('SUCCEEDED') || log.message.includes('completed');
            const isPhase = log.message.includes('=== Phase');

            return (
              <div key={index} className="flex items-start space-x-3 hover:bg-slate-900/40 px-1 rounded">
                <span className="text-slate-600 select-none text-[10px] pt-0.5 w-7 text-right shrink-0">
                  {index + 1}
                </span>
                <span
                  className={`break-all whitespace-pre-wrap ${
                    isPhase
                      ? 'text-emerald-400 font-bold'
                      : isError
                      ? 'text-rose-400 font-medium'
                      : isSuccess
                      ? 'text-emerald-300'
                      : 'text-slate-300'
                  }`}
                >
                  {log.message}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="bg-slate-950/80 px-4 py-2 border-t border-slate-800 text-[11px] text-slate-500 flex justify-between items-center">
        <span>AWS CodeBuild • Container runtime Node.js 20</span>
        <span>{isPolling ? 'Live streaming...' : 'Stream closed'}</span>
      </div>

    </div>
  );
}
