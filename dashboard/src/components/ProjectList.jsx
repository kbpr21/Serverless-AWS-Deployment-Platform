import React from 'react';
import { ExternalLink, Terminal, RotateCcw, Upload, CheckCircle2, XCircle, Clock, Globe, ArrowRight } from 'lucide-react';

export default function ProjectList({ projects, onSelectProject, onDeployUpdate, onOpenHistory }) {
  if (projects.length === 0) {
    return (
      <div className="border border-dashed border-slate-800 rounded-2xl p-12 text-center bg-slate-900/30 max-w-xl mx-auto my-12">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4">
          <Globe className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-white mb-1">No Projects Deployed Yet</h3>
        <p className="text-sm text-slate-400 mb-6">
          Deploy your first Vite, React, Vue, or static HTML web application to AWS serverless hosting in seconds.
        </p>
        <button
          onClick={() => onDeployUpdate('')}
          className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm transition shadow-lg shadow-emerald-500/20"
        >
          <Upload className="h-4 w-4" />
          <span>Deploy Project</span>
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {projects.map((proj) => {
        const liveUrl = proj.liveUrl || `/projects/${proj.projectId}/live/`;
        const status = proj.latestBuildStatus || 'READY';

        return (
          <div
            key={proj.projectId}
            className="bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 shadow-lg transition-all hover:-translate-y-0.5 flex flex-col justify-between group"
          >
            {/* Top metadata */}
            <div>
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0 pr-2">
                  <h3 className="font-bold text-white text-base truncate group-hover:text-emerald-400 transition-colors">
                    {proj.projectName || proj.projectId}
                  </h3>
                  <p className="text-xs font-mono text-slate-400 truncate">
                    /projects/{proj.projectId}
                  </p>
                </div>

                {/* Status Indicator */}
                <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium shrink-0 border"
                     style={{
                       borderColor: status === 'SUCCEEDED' ? '#166534' : status === 'FAILED' ? '#991b1b' : '#1e3a8a',
                       backgroundColor: status === 'SUCCEEDED' ? 'rgba(22, 101, 52, 0.2)' : status === 'FAILED' ? 'rgba(153, 27, 27, 0.2)' : 'rgba(30, 58, 138, 0.2)',
                       color: status === 'SUCCEEDED' ? '#4ade80' : status === 'FAILED' ? '#f87171' : '#60a5fa'
                     }}>
                  {status === 'SUCCEEDED' ? <CheckCircle2 className="h-3 w-3" /> :
                   status === 'FAILED' ? <XCircle className="h-3 w-3" /> :
                   <Clock className="h-3 w-3" />}
                  <span>{status}</span>
                </div>
              </div>

              {/* Version & Timestamps */}
              <div className="space-y-1.5 py-3 border-y border-slate-800/80 text-xs">
                <div className="flex justify-between items-center text-slate-400">
                  <span>Current Version:</span>
                  <span className="font-mono text-slate-200 truncate max-w-[170px]" title={proj.currentLiveBuildId}>
                    {proj.currentLiveBuildId || 'None'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Last Deployed:</span>
                  <span className="text-slate-300">
                    {proj.lastDeployedAt || proj.updatedAt
                      ? new Date(proj.lastDeployedAt || proj.updatedAt).toLocaleDateString()
                      : 'Recently'}
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="mt-5 pt-1 space-y-2.5">
              
              {/* Primary action: Open live site */}
              <a
                href={liveUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-flex items-center justify-center space-x-2 px-3 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 hover:text-white font-medium text-xs border border-slate-700/60 transition group/btn"
              >
                <span>Visit Live Application</span>
                <ExternalLink className="h-3.5 w-3.5 text-slate-400 group-hover/btn:text-emerald-400 transition-colors" />
              </a>

              {/* Secondary actions toolbar */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => onSelectProject(proj.projectId, proj.latestBuildId || proj.currentLiveBuildId)}
                  className="px-2 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-950/60 text-slate-300 hover:text-white text-xs flex items-center justify-center space-x-1 transition"
                  title="View Live Terminal Logs"
                >
                  <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Logs</span>
                </button>

                <button
                  onClick={() => onOpenHistory(proj)}
                  className="px-2 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-950/60 text-slate-300 hover:text-white text-xs flex items-center justify-center space-x-1 transition"
                  title="View Deployment History & Rollback"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-blue-400" />
                  <span>History</span>
                </button>

                <button
                  onClick={() => onDeployUpdate(proj.projectId)}
                  className="px-2 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-950/60 text-slate-300 hover:text-white text-xs flex items-center justify-center space-x-1 transition"
                  title="Deploy a new version archive"
                >
                  <Upload className="h-3.5 w-3.5 text-slate-400" />
                  <span>Deploy</span>
                </button>
              </div>

            </div>

          </div>
        );
      })}
    </div>
  );
}
