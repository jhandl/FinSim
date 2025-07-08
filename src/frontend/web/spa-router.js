/**
 * SPA Router for Ireland Financial Simulator
 * Handles routing between landing page (/) and simulator (/#ifs)
 * Uses hash-based routing for simplified navigation
 */

// Route configurations
const routes = {
    '/': {
        title: 'Ireland Financial Simulator - Home',
        contentPath: '/src/frontend/web/landing/index.html',
        favicon: '/src/frontend/web/ifs/IFS.ico'
    },
    '/#ifs': {
        title: 'Ireland Financial Simulator',
        contentPath: '/src/frontend/web/ifs/index.html',
        favicon: '/src/frontend/web/ifs/IFS.ico'
    }
};

// Track loaded assets to avoid duplicates
const loadedAssets = {
    styles: new Set(),
    scripts: new Set()
};

// Initialize the router
document.addEventListener('DOMContentLoaded', () => {
    initRouter();
});

/**
 * Initialize the router, handle initial route and set up event listeners
 */
function initRouter() {
    // Handle initial route
    handleRoute(window.location.hash || '/');
    
    // Listen for hash changes
    window.addEventListener('hashchange', () => {
        handleRoute(window.location.hash || '/');
    });
    
    // Listen for navigation messages from iframes
    window.addEventListener('message', (event) => {
        // Only accept messages from our own iframes
        if (!event.source.frameElement || !event.source.frameElement.id === 'app-frame') {
            return;
        }
        
        const { type, href } = event.data;
        if (type === 'navigate' && href) {
            // Only handle specific routes we know about
            if (href === '/' || href === '/#ifs') {
                navigateTo(href);
            }
        }
    });
}

/**
 * Navigate to a specific path
 */
function navigateTo(path) {
    if (path === '/') {
        // Use the origin to get the base URL without any hash
        window.location.href = window.location.origin + window.location.pathname;
    } else {
        window.location.hash = path.replace('/#', '');
    }
}

/**
 * Handle routing based on the current path
 */
function handleRoute(route) {
    // Basic route handling based on hash
    if (route === '' || route === '/') {
        loadPage(routes['/']);
    } else if (route === '#ifs') {
        loadPage(routes['/#ifs']);
    } else {
        // Handle 404 or redirect to default
        navigateTo('/');
    }
}

/**
 * Load a page based on the route configuration
 */
async function loadPage(routeConfig) {
    try {
        // Update document title and favicon
        document.title = routeConfig.title;
        updateFavicon(routeConfig.favicon);
        
        // Get the container
        const container = document.getElementById('app-container');
        
        // Remove the existing iframe (this destroys its entire context)
        const oldFrame = document.getElementById('app-frame');
        if (oldFrame) {
            oldFrame.remove();
        }
        
        // Create a new iframe
        const newFrame = document.createElement('iframe');
        newFrame.id = 'app-frame';
        newFrame.style.cssText = 'width: 100%; height: 100%; border: none; overflow: hidden;';
        
        // Add the new iframe to the container
        container.appendChild(newFrame);
        
        // Build iframe source (cache-busted)
        // XXX
        //newFrame.src = routeConfig.contentPath + '?v=' + new Date().getTime();
        newFrame.src = routeConfig.contentPath;
        
    } catch (error) {
        document.getElementById('app-container').innerHTML = `
            <div style="text-align: center; margin-top: 50px;">
                <h1>Error Loading Page</h1>
                <p>${error.message}</p>
                <button onclick="handleRoute('/')">Return to Home</button>
            </div>
        `;
    }
}

/**
 * Update the favicon based on current route
 */
function updateFavicon(faviconPath) {
    const existingFavicon = document.querySelector('link[rel="icon"]');
    if (existingFavicon) {
        document.head.removeChild(existingFavicon);
    }
    
    const favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.type = 'image/x-icon';
    favicon.href = faviconPath;
    document.head.appendChild(favicon);
}

/**
 * Clear page-specific assets when navigating to avoid conflicts
 */
function clearPageAssets() {
    // Clear the app root content
    document.getElementById('app-root').innerHTML = '';
    
    // Remove all app-specific stylesheets (based on path pattern)
    const stylesheets = document.querySelectorAll('link[rel="stylesheet"]');
    stylesheets.forEach(stylesheet => {
        // Keep truly external stylesheets (like Google Fonts)
        // Remove any stylesheet that includes our app's path pattern
        if (stylesheet.href.includes('/src/frontend/web/')) {
            stylesheet.parentNode.removeChild(stylesheet);
        }
    });

    // Remove all style tags
    const styleTags = document.querySelectorAll('style');
    styleTags.forEach(style => {
        style.parentNode.removeChild(style);
    });
    
    // Reset body styles
    document.body.removeAttribute('style');
    document.body.className = '';
    
    // Clear the loaded assets tracking
    loadedAssets.styles.clear();
    loadedAssets.scripts.clear();
}

/**
 * Process the HTML content of a page and inject it into the SPA
 */
function processPageContent(htmlContent, sourcePath) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    
    // Get the base path for resolving relative URLs
    const basePath = getBasePath(sourcePath);
    
    // Clear previous page assets to prevent conflicts
    clearPageAssets();
    
    // Handle <link> stylesheets
    doc.querySelectorAll('link[rel="stylesheet"]').forEach(style => {
        if (!style.href) return;
        const absoluteHref = ensureAbsolutePath(style.href, basePath);
        
        // Create new stylesheet link
        const newStyle = document.createElement('link');
        newStyle.rel = 'stylesheet';
        newStyle.href = absoluteHref;
        document.head.appendChild(newStyle);
    });
    
    // Set page content
    const appRoot = document.getElementById('app-root');
    
    // Copy all body children to app-root
    Array.from(doc.body.children).forEach(child => {
        appRoot.appendChild(child.cloneNode(true));
    });
    
    // Load scripts in sequence
    const scripts = Array.from(doc.querySelectorAll('script'));
    
    loadScriptsSequentially(scripts, basePath).then(() => {
        // Scripts loaded
    });
}

/**
 * Load scripts sequentially to maintain execution order
 */
async function loadScriptsSequentially(scripts, basePath) {
    for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i];
        await loadScript(script, basePath);
    }
}

/**
 * Load a single script and return a promise that resolves when loaded
 */
function loadScript(script, basePath) {
    return new Promise((resolve) => {
        const newScript = document.createElement('script');
        
        // Get script type
        let isModule = false;
        for (const attr of script.attributes) {
            if (attr.name === 'type' && attr.value === 'module') {
                isModule = true;
            }
        }
        
        // Handle external scripts
        if (script.src) {
            const absoluteSrc = ensureAbsolutePath(script.src, basePath);
            
            // Skip if already loaded (except for modules)
            if (!isModule && loadedAssets.scripts.has(absoluteSrc)) {
                resolve();
                return;
            }
            
            newScript.src = absoluteSrc;
            
            // Only track regular scripts, always reload modules
            if (!isModule) {
                loadedAssets.scripts.add(absoluteSrc);
            }
            
            newScript.onload = () => {
                resolve();
            };
            newScript.onerror = (error) => {
                resolve(); // Resolve anyway to continue loading other scripts
            };
        } else {
            // Handle inline scripts
            newScript.textContent = script.textContent;
        }
        
        // Copy other attributes
        for (const attr of script.attributes) {
            if (attr.name !== 'src') {
                newScript.setAttribute(attr.name, attr.value);
            }
        }
        
        document.body.appendChild(newScript);
        
        // If it's an inline script, resolve immediately
        if (!script.src) {
            resolve();
        }
    });
}

/**
 * Ensure a path is absolute
 */
function ensureAbsolutePath(path, basePath) {
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
        return path;
    }
    
    if (path.startsWith('/')) {
        return path;
    }
    
    return `${basePath}${path}`;
}

/**
 * Get the base path for resolving relative URLs
 */
function getBasePath(sourcePath) {
    const lastSlashIndex = sourcePath.lastIndexOf('/');
    if (lastSlashIndex >= 0) {
        return sourcePath.substring(0, lastSlashIndex + 1);
    }
    return '/src/frontend/web/';
} 