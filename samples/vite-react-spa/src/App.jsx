import React, { useState } from 'react';

export default function App() {
  const [currentPage, setCurrentPage] = useState('home');
  const [clickCount, setClickCount] = useState(0);

  return (
    <div style={{ maxWidth: 800, margin: '40px auto', padding: '0 20px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: 20 }}>
        <h2 style={{ margin: 0, color: '#38bdf8' }}>⚡ Vite React SPA</h2>
        <nav style={{ display: 'flex', gap: 12 }}>
          {['home', 'features', 'about'].map((tab) => (
            <button
              key={tab}
              onClick={() => setCurrentPage(tab)}
              style={{
                background: currentPage === tab ? '#38bdf8' : '#1e293b',
                color: currentPage === tab ? '#0f172a' : '#94a3b8',
                border: '1px solid #475569',
                borderRadius: 6,
                padding: '6px 14px',
                cursor: 'pointer',
                fontWeight: 600,
                textTransform: 'capitalize'
              }}
            >
              {tab}
            </button>
          ))}
        </nav>
      </header>

      <main style={{ marginTop: 30, background: '#1e293b', padding: 30, borderRadius: 12, border: '1px solid #334155' }}>
        {currentPage === 'home' && (
          <div>
            <h3>Welcome to Vite + React on Serverless AWS</h3>
            <p style={{ color: '#cbd5e1', lineHeight: 1.6 }}>
              This Single Page Application was bundled using Vite, deployed to an isolated S3 subpath, and is served via Amazon CloudFront.
            </p>
            <div style={{ marginTop: 20 }}>
              <button
                onClick={() => setClickCount(c => c + 1)}
                style={{
                  background: '#22c55e',
                  color: '#052e16',
                  padding: '10px 18px',
                  borderRadius: 8,
                  border: 'none',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Interactive State Test: {clickCount}
              </button>
            </div>
          </div>
        )}

        {currentPage === 'features' && (
          <div>
            <h3>Platform Capabilities Tested</h3>
            <ul style={{ color: '#cbd5e1', lineHeight: 1.8 }}>
              <li><strong>Asset Resolution:</strong> Automatic base path configuration fixes Vite's default root-absolute asset URLs.</li>
              <li><strong>SPA Deep Routing:</strong> CloudFront Function rewrites client-side navigation paths to index.html without 404 errors.</li>
              <li><strong>Dynamic Compilation:</strong> AWS CodeBuild installs dependencies and runs build scripts on ephemeral containers.</li>
            </ul>
          </div>
        )}

        {currentPage === 'about' && (
          <div>
            <h3>About This Deployment</h3>
            <p style={{ color: '#cbd5e1', lineHeight: 1.6 }}>
              Built as part of the Serverless Automated Build & Deployment Platform project.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
