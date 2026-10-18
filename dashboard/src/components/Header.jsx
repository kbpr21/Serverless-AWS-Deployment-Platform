import React from 'react';
import { Cloud, Plus, RefreshCw, Zap, ExternalLink } from 'lucide-react';

export default function Header({ onOpenUpload, onRefresh, isRefreshing, onGoHome, currentProject }) {
  return (
    <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Brand & Breadcrumbs */}
        <div className="flex items-center space-x-4">
          <button 
            onClick={onGoHome}
            className="flex items-center space-x-2.5 text-white hover:opacity-80 transition group text-left"
          >
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                Apex Deploy
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs font-mono px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/50">
                Serverless AWS
              </span>
            </div>
          </button>

          {currentProject && (
            <div className="flex items-center space-x-2 text-sm text-slate-400">
              <span>/</span>
              <span className="font-medium text-slate-200">{currentProject.projectName || currentProject.projectId}</span>
            </div>
          )}
        </div>

        {/* Global Actions */}
        <div className="flex items-center space-x-3">
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 text-slate-400 hover:text-white rounded-lg border border-slate-800 hover:bg-slate-800/50 transition disabled:opacity-50"
            title="Refresh state"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          <button
            onClick={onOpenUpload}
            className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm shadow-sm shadow-emerald-500/20 transition-all hover:scale-[1.02]"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            <span>Deploy Project</span>
          </button>
        </div>

      </div>
    </header>
  );
}
