import React, { useState, useEffect } from 'react';
import { ArrowLeft, ExternalLink, Terminal, RotateCcw, Upload, CheckCircle2, XCircle, Clock, RefreshCw, Trash2 } from 'lucide-react';
import TerminalLogs from './TerminalLogs';
import VersionHistoryModal from './VersionHistoryModal';
import { fetchProjectDetails, deleteProject } from '../api';

export default function ProjectDetail({ projectId, initialBuildId, onBack, onDeployUpdate }) {
  const [projectData, setProjectData] = useState(null);
  const [activeBuildId, setActiveBuildId] = useState(initialBuildId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const loadDetails = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await fetchProjectDetails(projectId);
      setProjectData(data);
      if (!activeBuildId) {
        setActiveBuildId(data.project?.latestBuildId || data.project?.currentLiveBuildId);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to load project details');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to permanently delete project '${projectId}' and all its deployments, files, and versions? This cannot be undone.`)) {
      return;
    }
    try {
      setLoading(true);
      await deleteProject(projectId);
      onBack();
    } catch (err) {
      alert(`Failed to delete project: ${err.message}`);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      loadDetails();
    }
  }, [projectId]);

  const project = projectData?.project;
  const deployments = projectData?.deployments || [];
  const liveUrl = project?.liveUrl || `/projects/${projectId}/live/`;

  return (
    <div className="space-y-6">
      
      {/* Top Banner Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg border border-slate-800 hover:bg-slate-800/80 text-slate-400 hover:text-white transition"
            title="Back to all projects"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div>
            <div className="flex items-center space-x-2.5">
              <h2 className="text-xl font-bold text-white tracking-tight">
                {project?.projectName || projectId}
              </h2>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                {projectId}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Current Live Version:{' '}
              <span className="font-mono text-emerald-400 font-semibold">
                {project?.currentLiveBuildId || 'Not deployed'}
              </span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2.5">
          <button
            onClick={loadDetails}
            className="p-2 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition"
            title="Refresh Details"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          <button
            onClick={() => setShowHistoryModal(true)}
            className="px-3 py-2 rounded-lg border border-slate-800 hover:bg-slate-800/80 text-slate-300 hover:text-white text-xs font-medium flex items-center space-x-1.5 transition"
          >
            <RotateCcw className="h-3.5 w-3.5 text-blue-400" />
            <span>History & Rollback</span>
          </button>

          <button
            onClick={() => onDeployUpdate(projectId)}
            className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center space-x-1.5 transition shadow-sm shadow-emerald-500/20"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Deploy Update</span>
          </button>

          {project?.currentLiveBuildId && (
            <a
              href={liveUrl}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-950/20 text-emerald-300 hover:bg-emerald-950/40 text-xs font-semibold flex items-center space-x-1.5 transition"
            >
              <span>Visit Live App</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}

          <button
            onClick={handleDelete}
            className="p-2 rounded-lg border border-rose-950 hover:border-rose-800 bg-rose-950/20 hover:bg-rose-950/50 text-rose-400 hover:text-rose-300 transition"
            title="Delete Project and all versions"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

      </div>

      {/* Build Selector Bar (if project has multiple builds) */}
      {deployments.length > 0 && (
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-400 font-medium shrink-0">Viewing Build Logs:</span>
          {deployments.slice(0, 8).map((dep) => (
            <button
              key={dep.buildId}
              onClick={() => setActiveBuildId(dep.buildId)}
              className={`px-2.5 py-1 rounded-md font-mono transition shrink-0 border ${
                activeBuildId === dep.buildId
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40 font-bold'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {dep.buildId === project?.currentLiveBuildId ? '★ ' : ''}
              {dep.buildId}
            </button>
          ))}
        </div>
      )}

      {/* Live Terminal */}
      {activeBuildId ? (
        <TerminalLogs
          projectId={projectId}
          buildId={activeBuildId}
          onStatusChange={(status) => {
            if (status === 'SUCCEEDED' || status === 'FAILED') {
              loadDetails();
            }
          }}
        />
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400">
          No builds found. Deploy a project archive to trigger the build runner.
        </div>
      )}

      {/* Rollback Modal */}
      {showHistoryModal && (
        <VersionHistoryModal
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          project={project}
          deployments={deployments}
          onRollbackComplete={(newLiveId) => {
            loadDetails();
            setActiveBuildId(newLiveId);
          }}
        />
      )}

    </div>
  );
}
