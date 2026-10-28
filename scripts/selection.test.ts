import test from "node:test";
import assert from "node:assert/strict";
import {createSelectionState, selectionReducer, reorderSelection, previewIds} from "../src/selection.ts";
test("P1 focus and tab-independent checked selection do not replace each other",()=>{
 let state=selectionReducer(createSelectionState('personal'),{type:'checked',update:['personal','sample']});
 state=selectionReducer(state,{type:'focus',id:'third'});
 assert.deepEqual(state.checked,['personal','sample']);assert.deepEqual(previewIds(state),['third']);
 state=selectionReducer(state,{type:'preview',set:true});assert.deepEqual(previewIds(state),['personal','sample']);
 state=selectionReducer(state,{type:'focus',id:'old-revision'});assert.deepEqual(previewIds(state),['old-revision']);assert.equal(state.checked.length,2);
});
test("P1 chip reorder preserves input and validates boundaries",()=>{
 const original=['personal','sample','third'];const reordered=reorderSelection(original,'sample',-1);assert.deepEqual(reordered,['sample','personal','third']);assert.deepEqual(original,['personal','sample','third']);
 assert.deepEqual(reorderSelection(reordered,'sample',1),original);assert.equal(reorderSelection(original,'personal',-1),original);assert.equal(reorderSelection(original,'third',1),original);assert.equal(reorderSelection(original,'missing',1),original);
 const state=selectionReducer({...createSelectionState('personal'),checked:original},{type:'checked',update:current=>current.filter(id=>id!=='sample')});assert.deepEqual(state.checked,['personal','third']);assert.equal(state.focused,'personal');
});
test("P1 reordering checked prompts changes set preview without changing focused prompt",()=>{
 let state=selectionReducer(createSelectionState('focused'),{type:'checked',update:['first','second']});state=selectionReducer(state,{type:'preview',set:true});
 state=selectionReducer(state,{type:'checked',update:current=>reorderSelection(current,'second',-1)});
 assert.deepEqual(previewIds(state),['second','first']);assert.equal(state.focused,'focused');
});
