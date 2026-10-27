const MAX_ITEMS = 2000;
const KINDS = ['stairs', 'lifts'];
const CATEGORIES = new Set(['', 'main', 'platform']);
const TOWERS = new Set(['', 'T1', 'T2', 'T3', 'T5']);
const towerName = value => value === 'T4' ? 'T5' : value;
const generationOf = item => item.generation ?? 1;
const fields = item => [Number(item.f1), Number(item.f2), Number(item.fire || false), item.category || '', item.tower];
const nextNumber = items => Math.max(0, ...items.map(item => item.id)) + 1;
const itemFromRow = row => ({ id: row.item_id, generation: row.generation, f1: Boolean(row.f1), f2: Boolean(row.f2), tower: towerName(row.tower), ...(row.kind === 'lifts' ? { fire: Boolean(row.fire), category: row.category } : {}) });

export class InputError extends Error {
  constructor(message, status = 400, opId = null) { super(message); this.status = status; this.opId = opId; }
}

export function validateSnapshot(raw) {
  if (!raw || typeof raw !== 'object') throw new InputError('invalid_snapshot');
  const result = { stairs: [], lifts: [], deleted: { stairs: [], lifts: [] }, nextIds: {} };
  for (const kind of KINDS) {
    const versions = new Set();
    const validate = (items, archive = false) => {
      if (!Array.isArray(items) || items.length > MAX_ITEMS) throw new InputError('invalid_items');
      let previousId = 0, previousGeneration = 0;
      return items.map(item => {
        const generation = item && generationOf(item);
        if (!item || !Number.isInteger(item.id) || item.id < 1 || item.id > MAX_ITEMS || !Number.isInteger(generation) || generation < 1 || generation > 1000000 || item.id < previousId || (item.id === previousId && (!archive || generation <= previousGeneration)) || versions.has(item.id + ':' + generation) || typeof item.f1 !== 'boolean' || typeof item.f2 !== 'boolean') throw new InputError('invalid_item');
        previousId = item.id; previousGeneration = generation; versions.add(item.id + ':' + generation);
        if (kind === 'lifts' && (typeof item.fire !== 'boolean' || !CATEGORIES.has(item.category))) throw new InputError('invalid_lift');
        const tower = towerName(item.tower || '');
        if (!TOWERS.has(tower)) throw new InputError('invalid_tower');
        return { id: item.id, generation, f1: item.f1, f2: item.f2, tower, ...(kind === 'lifts' ? { fire: item.fire, category: item.category } : {}) };
      });
    };
    result[kind] = validate(raw[kind]);
    result.deleted[kind] = validate(raw.deleted?.[kind] || [], true);
    if (result[kind].some(item => result.deleted[kind].some(old => old.id === item.id && old.generation >= item.generation))) throw new InputError('invalid_generation');
    result.nextIds[kind] = nextNumber(result[kind]);
  }
  return result;
}

export async function readRegister(db, userId) {
  const profile = await db.prepare('SELECT revision FROM register_profiles WHERE user_id = ?').bind(userId).first();
  if (!profile) return { initialized: false, revision: 0 };
  const rows = await db.prepare('SELECT kind, item_id, f1, f2, fire, category, tower, deleted, generation FROM register_items WHERE user_id = ? ORDER BY item_id').bind(userId).all();
  // Compatibility repairs are bounded by this register and run outside schema migrations.
  if (rows.results.some(row => row.tower === 'T4')) await db.prepare("UPDATE register_items SET tower = 'T5' WHERE user_id = ? AND tower = 'T4'").bind(userId).run();
  if (rows.results.some(row => row.deleted)) await db.prepare('INSERT INTO register_deleted_items (user_id, kind, item_id, generation, f1, f2, fire, category, tower) SELECT user_id, kind, item_id, generation, f1, f2, fire, category, tower FROM register_items WHERE user_id = ? AND deleted = 1 ON CONFLICT DO NOTHING').bind(userId).run();
  await db.prepare("UPDATE register_deleted_items SET tower = 'T5' WHERE user_id = ? AND tower = 'T4'").bind(userId).run();
  const archived = await db.prepare('SELECT kind, item_id, generation, f1, f2, fire, category, tower FROM register_deleted_items WHERE user_id = ? ORDER BY item_id, generation').bind(userId).all();
  const data = { stairs: [], lifts: [], deleted: { stairs: [], lifts: [] }, nextIds: {} };
  for (const row of rows.results) if (!row.deleted) data[row.kind].push(itemFromRow(row));
  for (const row of archived.results) data.deleted[row.kind].push(itemFromRow(row));
  for (const kind of KINDS) data.nextIds[kind] = nextNumber(data[kind]);
  return { initialized: true, revision: profile.revision, data };
}

export async function bootstrapRegister(db, userId, raw) {
  const data = validateSnapshot(raw), token = crypto.randomUUID();
  const statements = [db.prepare('INSERT INTO register_profiles (user_id, init_token, next_stair_id, next_lift_id) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING').bind(userId, token, data.nextIds.stairs, data.nextIds.lifts)];
  for (const kind of KINDS) {
    const slots = new Map(data[kind].map(item => [item.id, { ...item, deleted: false }]));
    for (const item of data.deleted[kind]) if (!slots.has(item.id) || slots.get(item.id).deleted && slots.get(item.id).generation < item.generation) slots.set(item.id, { ...item, deleted: true });
    statements.push(db.prepare(`INSERT INTO register_items (user_id, kind, item_id, generation, f1, f2, fire, category, tower, deleted)
      SELECT ?, ?, json_extract(value, '$.id'), json_extract(value, '$.generation'), json_extract(value, '$.f1'), json_extract(value, '$.f2'),
      COALESCE(json_extract(value, '$.fire'), 0), COALESCE(json_extract(value, '$.category'), ''), json_extract(value, '$.tower'), json_extract(value, '$.deleted')
      FROM json_each(?) WHERE EXISTS (SELECT 1 FROM register_profiles WHERE user_id = ? AND init_token = ?) ON CONFLICT DO NOTHING`).bind(userId, kind, JSON.stringify([...slots.values()]), userId, token));
    statements.push(db.prepare(`INSERT INTO register_deleted_items (user_id, kind, item_id, generation, f1, f2, fire, category, tower)
      SELECT ?, ?, json_extract(value, '$.id'), json_extract(value, '$.generation'), json_extract(value, '$.f1'), json_extract(value, '$.f2'),
      COALESCE(json_extract(value, '$.fire'), 0), COALESCE(json_extract(value, '$.category'), ''), json_extract(value, '$.tower')
      FROM json_each(?) WHERE EXISTS (SELECT 1 FROM register_profiles WHERE user_id = ? AND init_token = ?) ON CONFLICT DO NOTHING`).bind(userId, kind, JSON.stringify(data.deleted[kind]), userId, token));
  }
  await db.batch(statements);
  return readRegister(db, userId);
}

export async function applyOperations(db, userId, operations) {
  if (!Array.isArray(operations) || operations.length < 1 || operations.length > 24) throw new InputError('invalid_operations');
  for (const op of operations) if (!op || typeof op.opId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(op.opId) || !KINDS.includes(op.kind) || !Number.isInteger(op.itemId) || op.itemId < 1 || op.itemId > MAX_ITEMS || !Number.isInteger(op.generation ?? 1) || (op.generation ?? 1) < 1 || (op.generation ?? 1) > 1000000) throw new InputError('invalid_operation');
  const current = await readRegister(db, userId);
  if (!current.initialized) throw new InputError('not_initialized', 409);
  const prior = await db.prepare(`SELECT op_id FROM register_operations WHERE user_id = ? AND op_id IN (${operations.map(() => '?').join(',')})`).bind(userId, ...operations.map(op => op.opId)).all();
  const applied = new Set(prior.results.map(row => row.op_id));
  const slots = {}, archive = {};
  for (const kind of KINDS) {
    slots[kind] = new Map(); archive[kind] = new Map(current.data.deleted[kind].map(item => [item.id + ':' + item.generation, item]));
    for (const item of current.data.deleted[kind]) if (!slots[kind].has(item.id) || slots[kind].get(item.id).generation < item.generation) slots[kind].set(item.id, { ...item, deleted: true });
    for (const item of current.data[kind]) slots[kind].set(item.id, { ...item, deleted: false });
  }
  const statements = [];
  for (const op of operations) {
    if (applied.has(op.opId)) continue;
    const generation = op.generation ?? 1, slot = slots[op.kind].get(op.itemId);
    const guard = 'NOT EXISTS (SELECT 1 FROM register_operations WHERE user_id = ? AND op_id = ?)';
    if (op.type === 'ensure') {
      const bound = Math.max(nextNumber([...slots[op.kind].values()].filter(item => !item.deleted)), Math.max(0, ...slots[op.kind].keys()) + 1);
      if (op.itemId > bound) throw new InputError('nonsequential_id', 409);
      if (!slot) {
        if (generation !== 1) throw new InputError('invalid_generation');
        statements.push(db.prepare(`INSERT INTO register_items (user_id, kind, item_id, generation) SELECT ?, ?, ?, 1 WHERE ${guard} ON CONFLICT DO NOTHING`).bind(userId, op.kind, op.itemId, userId, op.opId));
        slots[op.kind].set(op.itemId, { id: op.itemId, generation, f1: false, f2: false, fire: false, category: '', tower: '', deleted: false });
      } else if (slot.deleted && generation === slot.generation + 1) {
        statements.push(db.prepare(`UPDATE register_items SET generation = ?, deleted = 0, f1 = 0, f2 = 0, fire = 0, category = '', tower = '' WHERE user_id = ? AND kind = ? AND item_id = ? AND deleted = 1 AND generation = ? AND ${guard}`).bind(generation, userId, op.kind, op.itemId, slot.generation, userId, op.opId));
        slots[op.kind].set(op.itemId, { id: op.itemId, generation, f1: false, f2: false, fire: false, category: '', tower: '', deleted: false });
      }
    } else if (op.type === 'delete') {
      if (!slot) throw new InputError('invalid_item');
      statements.push(db.prepare(`INSERT INTO register_deleted_items (user_id, kind, item_id, generation, f1, f2, fire, category, tower) SELECT user_id, kind, item_id, generation, f1, f2, fire, category, tower FROM register_items WHERE user_id = ? AND kind = ? AND item_id = ? AND deleted = 0 AND generation = ? AND ${guard} ON CONFLICT DO NOTHING`).bind(userId, op.kind, op.itemId, generation, userId, op.opId));
      statements.push(db.prepare(`UPDATE register_items SET deleted = 1 WHERE user_id = ? AND kind = ? AND item_id = ? AND generation = ? AND ${guard}`).bind(userId, op.kind, op.itemId, generation, userId, op.opId));
      if (!slot.deleted && slot.generation === generation) { archive[op.kind].set(op.itemId + ':' + generation, { ...slot }); slot.deleted = true; }
    } else if (op.type === 'restore') {
      const old = archive[op.kind].get(op.itemId + ':' + generation);
      if (old) {
      if (slot && !slot.deleted) throw new InputError('restore_conflict', 409, op.opId);
      const newGeneration = (slot?.generation || generation) + 1;
      statements.push(db.prepare(`UPDATE register_items SET f1 = ?, f2 = ?, fire = ?, category = ?, tower = ?, generation = ?, deleted = 0 WHERE user_id = ? AND kind = ? AND item_id = ? AND deleted = 1 AND generation = ? AND ${guard}`).bind(...fields(old), newGeneration, userId, op.kind, op.itemId, slot.generation, userId, op.opId));
      // Only remove the archive entry if the immediately preceding restore updated its slot.
      statements.push(db.prepare('DELETE FROM register_deleted_items WHERE user_id = ? AND kind = ? AND item_id = ? AND generation = ? AND changes() > 0').bind(userId, op.kind, op.itemId, generation));
      slots[op.kind].set(op.itemId, { ...old, generation: newGeneration, deleted: false }); archive[op.kind].delete(op.itemId + ':' + generation);
      }
    } else if (op.type === 'patch') {
      if (!slot || !op.fields || typeof op.fields !== 'object' || Array.isArray(op.fields)) throw new InputError('invalid_patch');
      const entries = Object.entries(op.fields).map(([key, value]) => [key, key === 'tower' ? towerName(value) : value]);
      if (!entries.length || entries.length > 5) throw new InputError('invalid_fields');
      for (const [key, value] of entries) if (!(key === 'tower' ? TOWERS.has(value) : key === 'category' ? op.kind === 'lifts' && CATEGORIES.has(value) : ['f1', 'f2', ...(op.kind === 'lifts' ? ['fire'] : [])].includes(key) && typeof value === 'boolean')) throw new InputError('invalid_field');
      statements.push(db.prepare(`UPDATE register_items SET ${entries.map(([key]) => key + ' = ?').join(', ')} WHERE user_id = ? AND kind = ? AND item_id = ? AND deleted = 0 AND generation = ? AND ${guard}`).bind(...entries.map(([, value]) => typeof value === 'boolean' ? Number(value) : value), userId, op.kind, op.itemId, generation, userId, op.opId));
      if (!slot.deleted && slot.generation === generation) Object.assign(slot, Object.fromEntries(entries));
    } else throw new InputError('invalid_operation_type');
    statements.push(db.prepare('INSERT INTO register_operations (user_id, op_id) VALUES (?, ?) ON CONFLICT DO NOTHING').bind(userId, op.opId));
    applied.add(op.opId);
  }
  statements.push(db.prepare('UPDATE register_profiles SET revision = revision + 1 WHERE user_id = ?').bind(userId));
  await db.batch(statements);
  return readRegister(db, userId);
}
