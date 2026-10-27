export const TOWERS = ['', 'T1', 'T2', 'T3', 'T5'];
const KINDS = ['stairs', 'lifts'];
const canonicalTower = tower => tower === 'T4' ? 'T5' : TOWERS.includes(tower) ? tower : '';
export const validItems = (items, versions = false) => Array.isArray(items) && items.length <= 2000 && items.every((item, index) => {
  const previous = items[index - 1], generation = item?.generation ?? 1;
  return item && Number.isInteger(item.id) && item.id >= 1 && item.id <= 2000 && Number.isInteger(generation) && generation >= 1 && generation <= 1000000 && (!previous || item.id > previous.id || versions && item.id === previous.id && generation > (previous.generation ?? 1)) && typeof item.f1 === 'boolean' && typeof item.f2 === 'boolean';
});
const normalizeItem = (kind, item) => ({ id: item.id, generation: item.generation ?? 1, f1: item.f1, f2: item.f2, tower: canonicalTower(item.tower), ...(kind === 'lifts' ? { fire: item.fire === true, category: ['main', 'platform'].includes(item.category) ? item.category : '' } : {}) });
const nextNumber = items => Math.max(0, ...items.map(item => item.id)) + 1;
export const nextGeneration = (state, kind, id) => Math.max(0, ...[...state[kind], ...state.deleted[kind]].filter(item => item.id === id).map(item => item.generation)) + 1;
export function normalizeState(raw) {
  const result = { stairs: [], lifts: [], deleted: { stairs: [], lifts: [] }, nextIds: {}, mode: raw.mode === 'lifts' ? 'lifts' : 'stairs' };
  for (const kind of KINDS) {
    result[kind] = raw[kind].map(item => normalizeItem(kind, item));
    const activeVersions = new Set(result[kind].map(item => item.id + ':' + item.generation));
    result.deleted[kind] = (validItems(raw.deleted?.[kind], true) ? raw.deleted[kind] : []).filter(item => !activeVersions.has(item.id + ':' + (item.generation ?? 1))).map(item => normalizeItem(kind, item));
    result.nextIds[kind] = nextNumber(result[kind]);
  }
  return result;
}
export function snapshotState(value) {
  return { stairs: value.stairs.map(item => ({ ...item })), lifts: value.lifts.map(item => ({ ...item })), deleted: { stairs: value.deleted.stairs.map(item => ({ ...item })), lifts: value.deleted.lifts.map(item => ({ ...item })) }, nextIds: { ...value.nextIds } };
}
export function applyLocalOperation(state, op) {
  const active = state[op.kind], removed = state.deleted[op.kind], generation = op.generation ?? 1;
  const sort = items => items.sort((a, b) => a.id - b.id || a.generation - b.generation);
  if (op.type === 'ensure') {
    const newest = Math.max(0, ...removed.filter(item => item.id === op.itemId).map(item => item.generation));
    if (!active.some(item => item.id === op.itemId) && generation === newest + 1) { active.push(normalizeItem(op.kind, { id: op.itemId, generation, f1: false, f2: false })); sort(active); }
  } else if (op.type === 'delete') {
    const index = active.findIndex(item => item.id === op.itemId && item.generation === generation);
    if (index >= 0) { const [item] = active.splice(index, 1); if (!removed.some(old => old.id === item.id && old.generation === generation)) removed.push(item); sort(removed); }
  } else if (op.type === 'restore') {
    const index = removed.findIndex(item => item.id === op.itemId && item.generation === generation);
    if (index >= 0 && !active.some(item => item.id === op.itemId)) { const newGeneration = nextGeneration(state, op.kind, op.itemId); const [item] = removed.splice(index, 1); active.push({ ...item, generation: newGeneration }); sort(active); }
  } else if (op.type === 'patch') {
    const item = active.find(item => item.id === op.itemId && item.generation === generation);
    if (item) Object.assign(item, op.fields, Object.hasOwn(op.fields, 'tower') ? { tower: canonicalTower(op.fields.tower) } : {});
  }
  state.nextIds[op.kind] = nextNumber(active);
  return state;
}
