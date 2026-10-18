import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import ProjectList from './components/ProjectList';
import ProjectDetail from './components/ProjectDetail';
import UploadModal from './components/UploadModal';
import VersionHistoryModal from './components/VersionHistoryModal';
import { fetchProjects, fetchProjectDetails } from './api';
import { Search, Server, Cpu, HardDrive, ShieldCheck, AlertCircle } from 'lucide-react';

export default function App() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Navigation / View State
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedBuildId, setSelectedBuildId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadDefaultProjectId, setUploadDefaultProjectId] = useState('');
  
  const [historyModalProject, setHistoryModalProject] = useState(null);
  const [historyDeployments, setHistoryDeployments] = useState([]);

  // Load all projects
  const loadProjects = async (silent = false) => {
    try {
      if (!silent) setIsRefreshing(true);
      setError('');
      const list = await fetchProjects();
      setProjects(list);
    } catch (err) {
      console.error(err);
      if (!silent) setError(err.message || 'Failed to load projects');
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
    const interval = setInterval(() => loadProjects(true), 8000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenUpload = (defaultId = '') => {
    setUploadDefaultProjectId(defaultId);
    setIsUploadModalOpen(true);
  };

  const handleBuildStarted = (projectId, buildId) => {
    setSelectedProjectId(projectId);
    setSelectedBuildId(buildId);
    loadProjects(true);
  };

  const handleOpenHistory = async (project) => {
    try {
      const data = await fetchProjectDetails(project.projectId);
      setHistoryModalProject(data.project);
      setHistoryDeployments(data.deployments || []);
    } catch (err) {
      setHistoryModalProject(project);
      setHistoryDeployments([]);
    }
  };

  const filteredProjects = projects.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      (p.projectId && p.projectId.toLowerCase().includes(q)) ||
      (p.projectName && p.projectName.toLowerCase().includes(q))
    );
  });

  const currentProject = projects.find((p) => p.projectId === selectedProjectId);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans">
      
      {/* Top Header */}
      <Header
        onOpenUpload={() => handleOpenUpload('')}
        onRefresh={() => loadProjects(false)}
        isRefreshing={isRefreshing}
        onGoHome={() => {
          setSelectedProjectId(null);
          setSelectedBuildId(null);
        }}
        currentProject={currentProject}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-sm flex items-center space-x-3">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {selectedProjectId ? (
          /* Single Project Detail & Logs View */
          <ProjectDetail
            projectId={selectedProjectId}
            initialBuildId={selectedBuildId}
            onBack={() => {
              setSelectedProjectId(null);
              setSelectedBuildId(null);
              loadProjects(true);
            }}
            onDeployUpdate={(projId) => handleOpenUpload(projId)}
          />
        ) : (
          /* Projects Overview Grid */
          <div className="space-y-6">
            
            {/* Overview Stats & Search Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-black text-white tracking-tight">Hosted Projects</h1>
                <p className="text-sm text-slate-400 mt-0.5">
                  Automated builds, subpath hosting, and instant version rollbacks on AWS
                </p>
              </div>

              {/* Search Bar */}
              <div className="relative w-full md:w-72">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
            </div>

            {/* Architecture Banner */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2">
              <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800/60 flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Cpu className="h-4 w-4" />
                </div>
                <div className="text-xs">
                  <div className="text-slate-400">Build Engine</div>
                  <div className="font-semibold text-slate-200">AWS CodeBuild</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800/60 flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                  <Server className="h-4 w-4" />
                </div>
                <div className="text-xs">
                  <div className="text-slate-400">Edge Routing</div>
                  <div className="font-semibold text-slate-200">CloudFront CDN</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800/60 flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                  <HardDrive className="h-4 w-4" />
                </div>
                <div className="text-xs">
                  <div className="text-slate-400">Storage</div>
                  <div className="font-semibold text-slate-200">Amazon S3 (OAC)</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800/60 flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div className="text-xs">
                  <div className="text-slate-400">Rollback Speed</div>
                  <div className="font-semibold text-slate-200">&lt; 3 Seconds</div>
                </div>
              </div>
            </div>

            {/* Project Grid */}
            <ProjectList
              projects={filteredProjects}
              onSelectProject={(projId, buildId) => {
                setSelectedProjectId(projId);
                setSelectedBuildId(buildId);
              }}
              onDeployUpdate={(projId) => handleOpenUpload(projId)}
              onOpenHistory={handleOpenHistory}
            />

          </div>
        )}

      </main>

      {/* Modals */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        defaultProjectId={uploadDefaultProjectId}
        onBuildStarted={handleBuildStarted}
      />

      {historyModalProject && (
        <VersionHistoryModal
          isOpen={!!historyModalProject}
          onClose={() => setHistoryModalProject(null)}
          project={historyModalProject}
          deployments={historyDeployments}
          onRollbackComplete={() => {
            loadProjects(true);
          }}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-600">
        Serverless Automated Build & Deployment Platform • Built with AWS Serverless Primitives
      </footer>

    </div>
  );
}
