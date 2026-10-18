// API Client for Serverless Deployment Platform

const BASE_URL = import.meta.env.VITE_API_ENDPOINT || '/api';

export async function fetchProjects() {
  const res = await fetch(`${BASE_URL}/projects`);
  if (!res.ok) throw new Error(`Failed to load projects: ${res.statusText}`);
  const data = await res.json();
  return data.projects || [];
}

export async function fetchProjectDetails(projectId) {
  const res = await fetch(`${BASE_URL}/projects/${projectId}`);
  if (!res.ok) throw new Error(`Failed to load project details: ${res.statusText}`);
  return await res.json();
}

export async function requestUploadUrl(projectId, projectName) {
  const res = await fetch(`${BASE_URL}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, projectName }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to request upload URL');
  }
  return await res.json();
}

export function uploadToS3(presignedUrl, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', 'application/zip');

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`S3 upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during S3 upload'));
    xhr.send(file);
  });
}

export async function triggerBuildStart(projectId, buildId) {
  const res = await fetch(`${BASE_URL}/builds/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, buildId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to trigger build');
  }
  return await res.json();
}

export async function fetchBuildLogs(projectId, buildId, nextToken = null) {
  const url = new URL(`${BASE_URL}/projects/${projectId}/builds/${buildId}/logs`, window.location.origin);
  if (nextToken) url.searchParams.set('nextToken', nextToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch logs');
  }
  return await res.json();
}

export async function triggerRollback(projectId, targetBuildId) {
  const res = await fetch(`${BASE_URL}/projects/${projectId}/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetBuildId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to rollback deployment');
  }
  return await res.json();
}

export async function deleteProject(projectId) {
  const res = await fetch(`${BASE_URL}/projects/${projectId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete project');
  }
  return await res.json();
}
