import React, { useState } from 'react';
import { X, RotateCcw, CheckCircle2, XCircle, Clock, ExternalLink, AlertTriangle, Loader2 } from 'lucide-react';
import { triggerRollback } from '../api';

export default function VersionHistoryModal({ isOpen, onClose, project, deployments, onRollbackComplete }) {
  const [rollingBackId, setRollingBackId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen || !project) return null;

  const currentLiveId = project.currentLiveBuildId;

  const handleRollback = async (buildId) => {
    try {
      setErrorMsg('');
      setRollingBackId(buildId);
      await triggerRollback(project.projectId, buildId);
      setConfirmId(null);
      if (onRollbackComplete) {
        onRollbackComplete(buildId);
      }
      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to rollback');
    } finally {
      setRollingBackId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-6 shadow-2xl relative text-slate-100 flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center space-x-2">
              <RotateCcw className="h-5 w-5 text-emerald-400" />
              <span>Deployment History & Rollback</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Project: <span className="text-slate-200 font-mono">{project.projectId}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Deployments List */}
        <div className="overflow-y-auto mt-4 pr-1 space-y-3 flex-1">
          {deployments.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              No deployments recorded yet for this project.
            </div>
          ) : (
            deployments.map((dep) => {
              const isLive = dep.buildId === currentLiveId;
              const isSucceeded = dep.status === 'SUCCEEDED';
              const isRollbackEvent = dep.type === 'ROLLBACK';

              return (
                <div
                  key={dep.buildId}
                  className={`p-4 rounded-xl border transition flex items-center justify-between ${
                    isLive
                      ? 'bg-emerald-950/20 border-emerald-500/40 ring-1 ring-emerald-500/30'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Left: Metadata */}
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2.5">
                      <span className="font-mono text-sm font-semibold text-white">
                        {dep.buildId}
                      </span>
                      {isLive && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          Active Live
                        </span>
                      )}
                      {isRollbackEvent && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          Rollback Event
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-3 text-xs text-slate-400">
                      <span className="flex items-center space-x-1">
                        <Clock className="h-3.5 w-3.5 text-slate-500" />
                        <span>{new Date(dep.createdAt || dep.startTime).toLocaleString()}</span>
                      </span>
                      {dep.duration && <span>• {dep.duration}s</span>}
                    </div>
                  </div>

                  {/* Right: Status & Rollback Action */}
                  <div className="flex items-center space-x-3">
                    
                    {/* Status Badge */}
                    <div className="flex items-center space-x-1 text-xs font-mono font-medium">
                      {dep.status === 'SUCCEEDED' ? (
                        <span className="text-emerald-400 flex items-center space-x-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>SUCCEEDED</span>
                        </span>
                      ) : dep.status === 'FAILED' ? (
                        <span className="text-rose-400 flex items-center space-x-1">
                          <XCircle className="h-3.5 w-3.5" />
                          <span>FAILED</span>
                        </span>
                      ) : (
                        <span className="text-blue-400">{dep.status}</span>
                      )}
                    </div>

                    {/* Rollback Trigger */}
                    {!isLive && isSucceeded && !isRollbackEvent && (
                      confirmId === dep.buildId ? (
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleRollback(dep.buildId)}
                            disabled={rollingBackId === dep.buildId}
                            className="px-2.5 py-1 text-xs font-semibold rounded bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center space-x-1"
                          >
                            {rollingBackId === dep.buildId ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <span>Confirm</span>
                            )}
                          </button>
                          <button
                            onClick={() => setConfirmId(null)}
                            className="px-2 py-1 text-xs rounded border border-slate-700 text-slate-400 hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmId(dep.buildId)}
                          className="px-2.5 py-1 text-xs font-medium rounded border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition flex items-center space-x-1.5"
                          title="Instantly restore this version to live"
                        >
                          <RotateCcw className="h-3 w-3 text-slate-400" />
                          <span>Rollback</span>
                        </button>
                      )
                    )}

                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-slate-800 text-right text-xs text-slate-500">
          Rollbacks are zero-downtime S3 server-side copies with instant CloudFront cache invalidation.
        </div>

      </div>
    </div>
  );
}
