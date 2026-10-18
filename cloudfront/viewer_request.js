function handler(event) {
    var request = event.request;
    var uri = request.uri;

    // 1. Projects Routing: /projects/<projectId>/...
    if (uri.startsWith('/projects/')) {
        var parts = uri.split('/').filter(Boolean); // ['projects', '<projectId>', ...]
        var projectId = parts[1];

        if (!projectId) {
            request.uri = '/dashboard/index.html';
            return request;
        }

        // Canonical redirect for naked project roots without trailing slash:
        // e.g. /projects/foo, /projects/foo/ or /projects/foo/live -> /projects/foo/live/
        if (uri === '/projects/' + projectId || 
            uri === '/projects/' + projectId + '/' || 
            uri === '/projects/' + projectId + '/live') {
            return {
                statusCode: 302,
                statusDescription: 'Found',
                headers: {
                    'location': { value: '/projects/' + projectId + '/live/' }
                }
            };
        }

        // Remaining path after /projects/<projectId>
        var subParts = parts.slice(2);
        
        // Strip optional 'live' prefix if provided by user/URL
        if (subParts.length > 0 && subParts[0] === 'live') {
            subParts = subParts.slice(1);
        }

        var remainingPath = subParts.join('/');

        // If root of project or ends with '/'
        if (!remainingPath || remainingPath === '' || uri.endsWith('/')) {
            request.uri = '/hosted/' + projectId + '/live/index.html';
            return request;
        }

        // Check if path has a file extension (e.g., .js, .css, .png, .html, .svg)
        var lastSegment = subParts[subParts.length - 1];
        var hasExtension = lastSegment.indexOf('.') !== -1;

        if (hasExtension) {
            // Static asset request: /hosted/<projectId>/live/<remainingPath>
            request.uri = '/hosted/' + projectId + '/live/' + remainingPath;
        } else {
            // SPA Client-side route fallback: /hosted/<projectId>/live/index.html
            request.uri = '/hosted/' + projectId + '/live/index.html';
        }
        return request;
    }

    // 2. Dashboard UI Routing: / or /dashboard/*
    if (uri === '/' || uri === '/dashboard' || uri === '/dashboard/') {
        request.uri = '/dashboard/index.html';
        return request;
    }

    if (uri.startsWith('/dashboard/')) {
        var dashParts = uri.split('/').filter(Boolean);
        var lastDashSegment = dashParts[dashParts.length - 1];
        var hasDashExtension = lastDashSegment.indexOf('.') !== -1;

        if (hasDashExtension) {
            // Keep original static asset URI e.g. /dashboard/assets/index.js
            return request;
        } else {
            // SPA fallback for dashboard routes
            request.uri = '/dashboard/index.html';
            return request;
        }
    }

    // 3. Fallback for root-level static files (e.g. /favicon.ico, /assets/...)
    if (uri.indexOf('.') !== -1) {
        request.uri = '/dashboard' + uri;
        return request;
    }

    // Default SPA fallback to Dashboard
    request.uri = '/dashboard/index.html';
    return request;
}
