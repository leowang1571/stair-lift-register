import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validItems, normalizeState, applyLocalOperation, snapshotState } from '../public/register-model.mjs';

test('sparse and empty lists are valid and old T4 values are converted in active and deleted records', () => {
  const item = { id: 16, f1: true, f2: false, tower: 'T4' };
  const state = normalizeState({ stairs: [item], lifts: [], deleted: { lifts: [{ ...item, id: 20, fire: true, category: 'main' }] } });
  assert.equal(validItems([]), true);assert.equal(validItems([item]), true);
  assert.equal(state.stairs[0].tower, 'T5');assert.equal(state.deleted.lifts[0].tower, 'T5');
  assert.equal(state.nextIds.stairs,17);assert.equal(state.nextIds.lifts,1);
  assert.equal(validItems([item,item]),false);
});
test('reused numbers start blank and stale edits cannot change a new record with the same number',()=>{
 const state=normalizeState({stairs:[{id:1,f1:true,f2:true,tower:'T5'}],lifts:[]});
 applyLocalOperation(state,{type:'delete',kind:'stairs',itemId:1,generation:1});assert.equal(state.nextIds.stairs,1);
 applyLocalOperation(state,{type:'ensure',kind:'stairs',itemId:1,generation:1});assert.equal(state.stairs.length,0);
 applyLocalOperation(state,{type:'ensure',kind:'stairs',itemId:1,generation:2});assert.equal(state.nextIds.stairs,2);assert.equal(state.stairs[0].f1,false);
 applyLocalOperation(state,{type:'patch',kind:'stairs',itemId:1,generation:1,fields:{f1:true}});assert.equal(state.stairs[0].f1,false);
 applyLocalOperation(state,{type:'restore',kind:'stairs',itemId:1,generation:1});assert.equal(state.stairs[0].generation,2);
 applyLocalOperation(state,{type:'delete',kind:'stairs',itemId:1,generation:2});
 applyLocalOperation(state,{type:'restore',kind:'stairs',itemId:1,generation:1});
 assert.equal(state.stairs[0].generation,3);assert.equal(state.stairs[0].f1,true);assert.equal(state.stairs[0].tower,'T5');
 assert.deepEqual(normalizeState(snapshotState(state)).deleted,state.deleted);
});
