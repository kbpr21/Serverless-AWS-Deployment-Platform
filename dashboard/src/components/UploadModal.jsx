import React, { useState, useRef } from 'react';
import { X, UploadCloud, FileArchive, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { requestUploadUrl, uploadToS3, triggerBuildStart } from '../api';

export default function UploadModal({ isOpen, onClose, onBuildStarted, defaultProjectId = '' }) {
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [projectName, setProjectName] = useState('');
  const [file, setFile] = useState(null);
  const [uploadStep, setUploadStep] = useState('idle'); // idle | presigning | uploading | starting | done | error
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (!selected.name.endsWith('.zip')) {
        setErrorMessage('Please select a .zip archive of your project.');
        return;
      }
      setFile(selected);
      setErrorMessage('');
      // Autofill projectId if empty
      if (!projectId) {
        const inferred = selected.name.replace(/\.zip$/i, '').toLowerCase().replace(/[^a-z0-9-_]/g, '-');
        setProjectId(inferred);
        setProjectName(selected.name.replace(/\.zip$/i, ''));
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      if (!dropped.name.endsWith('.zip')) {
        setErrorMessage('Please drop a .zip archive of your project.');
        return;
      }
      setFile(dropped);
      setErrorMessage('');
      if (!projectId) {
        const inferred = dropped.name.replace(/\.zip$/i, '').toLowerCase().replace(/[^a-z0-9-_]/g, '-');
        setProjectId(inferred);
        setProjectName(dropped.name.replace(/\.zip$/i, ''));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!projectId.trim()) {
      setErrorMessage('Project ID is required.');
      return;
    }
    if (!file) {
      setErrorMessage('Please select a project .zip file.');
      return;
    }

    try {
      setErrorMessage('');
      setUploadStep('presigning');
      
      // Step 1: Request S3 Presigned URL
      const { buildId, uploadUrl } = await requestUploadUrl(projectId.trim().toLowerCase(), projectName.trim());

      // Step 2: Upload directly to S3 via PUT
      setUploadStep('uploading');
      await uploadToS3(uploadUrl, file, (percent) => {
        setUploadProgress(percent);
      });

      // Step 3: Trigger CodeBuild execution
      setUploadStep('starting');
      await triggerBuildStart(projectId.trim().toLowerCase(), buildId);

      setUploadStep('done');
      setTimeout(() => {
        onBuildStarted(projectId.trim().toLowerCase(), buildId);
        onClose();
      }, 700);

    } catch (err) {
      console.error(err);
      setUploadStep('error');
      setErrorMessage(err.message || 'An error occurred during upload.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl relative text-slate-100">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition p-1"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-xl font-bold tracking-tight text-white mb-1">Deploy New Web Project</h2>
        <p className="text-xs text-slate-400 mb-5">
          Upload a ZIP containing your Vite, React, Vue, or static HTML project.
        </p>

        {errorMessage && (
          <div className="mb-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs flex items-start space-x-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Project ID */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Project Identifier
            </label>
            <input
              type="text"
              required
              disabled={uploadStep !== 'idle' && uploadStep !== 'error'}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '-'))}
              placeholder="e.g. portfolio-v2, docs-portal"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono disabled:opacity-50"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Used in live URL: <code className="text-slate-400">/projects/{projectId || '<id>'}/live/</code>
            </p>
          </div>

          {/* Project Display Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Display Name (Optional)
            </label>
            <input
              type="text"
              disabled={uploadStep !== 'idle' && uploadStep !== 'error'}
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. Personal Portfolio"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-50"
            />
          </div>

          {/* File Drag & Drop */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Project Archive (.ZIP)
            </label>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition ${
                file 
                  ? 'border-emerald-500/50 bg-emerald-950/10' 
                  : 'border-slate-800 hover:border-slate-700 bg-slate-950/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleFileChange}
                className="hidden"
              />

              {file ? (
                <div className="flex flex-col items-center">
                  <div className="h-10 w-10 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-2">
                    <FileArchive className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium text-white">{file.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB • Ready to upload
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <UploadCloud className="h-8 w-8 text-slate-500 mb-2" />
                  <p className="text-sm text-slate-300">
                    <span className="text-emerald-400 font-medium">Click to choose</span> or drag and drop
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Single .zip archive (up to 50MB)</p>
                </div>
              )}
            </div>
          </div>

          {/* Upload Progress Bar */}
          {uploadStep !== 'idle' && (
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-300 font-medium">
                  {uploadStep === 'presigning' && 'Preparing secure upload...'}
                  {uploadStep === 'uploading' && `Uploading archive: ${uploadProgress}%`}
                  {uploadStep === 'starting' && 'Starting CodeBuild runner...'}
                  {uploadStep === 'done' && 'Build pipeline initiated!'}
                  {uploadStep === 'error' && 'Failed'}
                </span>
                {uploadStep !== 'done' && uploadStep !== 'error' && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                )}
                {uploadStep === 'done' && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                )}
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-300 ease-out"
                  style={{
                    width: uploadStep === 'presigning' ? '10%' :
                           uploadStep === 'uploading' ? `${uploadProgress}%` :
                           uploadStep === 'starting' ? '95%' :
                           uploadStep === 'done' ? '100%' : '0%'
                  }}
                />
              </div>
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              type="button"
              disabled={uploadStep !== 'idle' && uploadStep !== 'error'}
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-800 text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploadStep !== 'idle' && uploadStep !== 'error'}
              className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm transition shadow-sm shadow-emerald-500/20 disabled:opacity-50"
            >
              Start Build & Deploy
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
