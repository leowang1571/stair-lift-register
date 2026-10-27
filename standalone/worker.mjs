import { registerRequest, projectsRequest } from '../lib/register-api.mjs';

// Independent deployment: project links provide access; no ChatGPT auth required.
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/api/register') return registerRequest(request, env.DB);
    if (path === '/api/projects') return projectsRequest(request, env.DB);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('Referrer-Policy', 'no-referrer');
    if (path === '/') headers.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, headers });
  },
};
