import { InputError, readRegister, bootstrapRegister, applyOperations } from './register-store.mjs';
import { resolveProject, createProject } from './project-access.mjs';
export const reply = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' } });
const PAGES_ORIGIN = 'https://leowang1571.github.io';
function externalOrigin(request) {
  const origin = request.headers.get('origin');
  return origin && origin !== new URL(request.url).origin ? origin : null;
}
async function withCors(request, work) {
  const origin = externalOrigin(request);
  if (origin && origin !== PAGES_ORIGIN) return reply({ error: 'invalid_origin' }, 403);
  const response = request.method === 'OPTIONS' ? new Response(null, {status: 204}) : await work();
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  headers.set('Access-Control-Max-Age', '600');
  headers.append('Vary', 'Origin');
  return new Response(response.body, {status: response.status, headers});
}
/** @param {string | null} legacyUserId */
export function registerRequest(request, db, legacyUserId = null) {
  return withCors(request, () => handleRegister(request, db, externalOrigin(request) ? null : legacyUserId));
}
export function projectsRequest(request, db) {
  return withCors(request, () => handleProjects(request, db));
}
function writeAllowed(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin && origin !== PAGES_ORIGIN) throw new InputError('invalid_origin', 403);
  if (!request.headers.get('content-type')?.includes('application/json')) throw new InputError('invalid_content_type', 415);
}
async function body(request) { const text = await request.text(); if (text.length > 250000) throw new InputError('request_too_large', 413); return JSON.parse(text); }
function failure(error) { return error instanceof InputError ? reply({ error: error.message, ...(error.opId ? {opId:error.opId} : {}) }, error.status) : error instanceof SyntaxError ? reply({ error: 'invalid_json' }, 400) : reply({ error: 'storage_unavailable' }, 503); }
/** @param {string | null} legacyUserId */
async function handleRegister(request, db, legacyUserId = null) {
  if (!db) return reply({ error: 'storage_unavailable' }, 503);
  try {
    const authorization = request.headers.get('authorization');
    const identity = authorization ? await resolveProject(db, authorization) : legacyUserId ? { accountId: legacyUserId, role: 'edit' } : null;
    if (!identity) return reply({ error: 'project_required' }, 401);
    if (request.method === 'GET') return reply({ ...identity, ...(await readRegister(db, identity.accountId)) });
    if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
    if (identity.role !== 'edit') return reply({ error: 'read_only_project' }, 403);
    writeAllowed(request);
    const value = await body(request);
    const result = value.action === 'bootstrap' ? await bootstrapRegister(db, identity.accountId, value.data) : value.action === 'operations' ? await applyOperations(db, identity.accountId, value.operations) : null;
    return result ? reply({ ...identity, ...result }) : reply({ error: 'invalid_action' }, 400);
  } catch (error) { return failure(error); }
}
async function handleProjects(request, db) {
  if (!db) return reply({ error: 'storage_unavailable' }, 503);
  if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
  try { writeAllowed(request); return reply(await createProject(db, await body(request), request.headers.get('cf-connecting-ip') || 'unknown'), 201); }
  catch (error) { return failure(error); }
}
