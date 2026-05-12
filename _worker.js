// Cloudflare Pages _worker.js
// Proxies /auth/* and /api/* and /whoop/* and /oura/* requests to the
// kuzuri-whoop Worker, while serving the rest of the site normally.
// This makes cookies SAME-ORIGIN — the app and API are both on pages.dev,
// so Set-Cookie headers are committed reliably on all browsers.

const WORKER_URL = 'https://kuzuri-whoop.abdullaaqeel-ishaq.workers.dev';

const PROXY_PREFIXES = ['/auth/', '/api/', '/whoop/', '/oura/'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const shouldProxy = PROXY_PREFIXES.some(p => url.pathname.startsWith(p));

    if (shouldProxy) {
      // Build the upstream URL — same path + query, different origin
      const upstream = new URL(url.pathname + url.search, WORKER_URL);

      // Forward the request to the Worker, preserving method, headers, body
      const proxyReq = new Request(upstream.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
        redirect: 'manual', // handle redirects ourselves so Set-Cookie is preserved
      });

      const resp = await fetch(proxyReq);

      // For redirects (e.g. /auth/handoff → /?kz_signin=1), rewrite the
      // Location header from workers.dev back to pages.dev so the browser
      // stays on the same origin.
      if (resp.status >= 300 && resp.status < 400) {
        const location = resp.headers.get('Location');
        if (location) {
          const loc = new URL(location, WORKER_URL);
          // If redirect goes back to the Worker origin, rewrite to pages.dev
          if (loc.origin === WORKER_URL || loc.hostname.endsWith('.workers.dev')) {
            loc.host = url.host;
            loc.protocol = url.protocol;
          }
          // Rewrite Set-Cookie domain if present — strip domain attribute
          // so cookie is scoped to pages.dev automatically
          const headers = new Headers(resp.headers);
          headers.set('Location', loc.toString());

          // Rewrite Set-Cookie to remove Domain= so it applies to pages.dev
          const cookies = resp.headers.getAll ? resp.headers.getAll('Set-Cookie') : [];
          if (cookies.length) {
            headers.delete('Set-Cookie');
            cookies.forEach(c => {
              // Remove Domain= attribute — let browser scope to current host
              const cleaned = c.replace(/;\s*Domain=[^;]*/gi, '');
              headers.append('Set-Cookie', cleaned);
            });
          }

          return new Response(null, {
            status: resp.status,
            headers,
          });
        }
      }

      // For normal responses, pass through but rewrite Set-Cookie domain
      const headers = new Headers(resp.headers);
      // Remove CORS headers — not needed since we're same-origin now
      headers.delete('Access-Control-Allow-Origin');
      headers.delete('Access-Control-Allow-Credentials');
      headers.delete('Access-Control-Allow-Methods');
      headers.delete('Access-Control-Allow-Headers');

      // Rewrite cookies to remove Domain= 
      const cookies = resp.headers.getAll ? resp.headers.getAll('Set-Cookie') : [];
      if (cookies.length) {
        headers.delete('Set-Cookie');
        cookies.forEach(c => {
          const cleaned = c.replace(/;\s*Domain=[^;]*/gi, '');
          headers.append('Set-Cookie', cleaned);
        });
      }

      return new Response(resp.body, {
        status: resp.status,
        headers,
      });
    }

    // Not a proxy path — serve the Pages asset normally
    return env.ASSETS.fetch(request);
  },
};
