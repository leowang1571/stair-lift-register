import { InputError, validateSnapshot, bootstrapRegister } from './register-store.mjs';
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
export const hashKey = async key => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))));
const random = size => hex(crypto.getRandomValues(new Uint8Array(size)));
export async function resolveProject(db, authorization) {
  const match = /^Bearer ([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(authorization || '');
  if (!match) throw new InputError('invalid_project_link', 401);
  const row = await db.prepare('SELECT id, name, view_key, view_hash, edit_hash FROM register_projects WHERE id = ?').bind(match[1]).first();
  const hash = await hashKey(match[2]);
  if (!row || (hash !== row.edit_hash && hash !== row.view_hash)) throw new InputError('invalid_project_link', 401);
  const role = hash === row.edit_hash ? 'edit' : 'view';
  return { accountId: 'project:' + row.id, role, project: { id: row.id, name: row.name }, ...(role === 'edit' ? { viewKey: row.view_key } : {}) };
}
export async function createProject(db, raw, rateIdentity = 'local') {
  if (typeof raw?.name !== 'string' || !raw.name.trim() || raw.name.trim().length > 60) throw new InputError('invalid_project_name');
  const data = validateSnapshot(raw.data);
  const bucket = Math.floor(Date.now() / 3600000) + ':' + await hashKey(rateIdentity);
  const allowed = await db.prepare('INSERT INTO register_project_limits (bucket, hits) VALUES (?, 1) ON CONFLICT(bucket) DO UPDATE SET hits = hits + 1 WHERE hits < 30 RETURNING hits').bind(bucket).first();
  if (!allowed) throw new InputError('too_many_projects', 429);
  const id = random(16), viewKey = random(32), editKey = random(32);
  await db.prepare('INSERT INTO register_projects (id, name, view_key, view_hash, edit_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, raw.name.trim(), viewKey, await hashKey(viewKey), await hashKey(editKey), Date.now()).run();
  const result = await bootstrapRegister(db, 'project:' + id, data);
  return { accountId: 'project:' + id, role: 'edit', project: { id, name: raw.name.trim() }, viewKey, editKey, ...result };
}
