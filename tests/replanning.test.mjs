import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,ROUTINES} from '../src/data.js';
import {taskBase,scheduleDay,reconfigureShifts,replanPlannerMove,overlap,pauses} from '../src/engine.js';
import {validateState} from '../src/storage.js';
const shift=(more={})=>({personId:'lead',start:420,end:960,mealStart:660,mealMinutes:60,breaks:[],...more});
function fixture(){const state=initialState();state.profile={name:'Lead',leadId:'lead'};state.departments=[{id:'14',name:'Kitchen'}];state.team=[{id:'lead',name:'Lead',role:'Lead',active:true,departments:[]}];return {state,day:{date:'2026-09-15',reviewed:false,shifts:[shift()],tasks:[],tour:[],warnings:[]}};}
function assertFits(day){for(const s of day.shifts){const segments=day.tasks.filter(t=>t.status!=='done'&&t.assignedTo===s.personId).flatMap(t=>t.segments);for(const [i,seg] of segments.entries()){assert.ok(seg.start>=s.start&&seg.end<=s.end);assert.ok(!pauses(s).some(p=>overlap(seg,p)));assert.ok(!segments.slice(i+1).some(p=>overlap(seg,p)));}}}
test('shift edits release pins, reflow started work around new meals, and preserve completed records',()=>{
 const {state,day}=fixture();const done=taskBase({status:'done',progress:100,assignedTo:'lead',segments:[{start:420,end:450}]});
 day.tasks=[done,taskBase({locked:true,assignedTo:'lead',segments:[{start:450,end:480}]}),taskBase({status:'in-progress',progress:50,minutes:60,assignedTo:'lead',segments:[{start:480,end:510}]})];
 const next=reconfigureShifts(state,day,[shift({start:600,mealStart:615})]);assert.deepEqual(next.tasks[0],done);assertFits(next);
 const started=next.tasks.find(t=>t.status==='in-progress');assert.equal(started.progress,50);assert.equal(started.segments.reduce((n,s)=>n+s.end-s.start,0),30);assert.ok(next.warnings.some(w=>w.includes('Completed work')));assert.equal(day.shifts[0].start,420);
});
test('removing a worker reassigns unfinished work and exposes capacity overflow',()=>{
 const {state,day}=fixture();state.team.push({...state.team[0],id:'other'});day.tasks=[taskBase({assignee:'lead',assignedTo:'lead',locked:true,minutes:30}),taskBase({minutes:60,deadline:440})];
 const next=reconfigureShifts(state,day,[shift({personId:'other',start:420,end:450,mealMinutes:0})]);assert.equal(next.tasks[0].assignedTo,'other');assert.equal(next.tasks[1].segments.length,0);assert.ok(next.tasks[1].unscheduledReason);assertFits(next);
});
test('dropping onto pinned pending work moves it without overlaps or losing tasks',()=>{
 const {state,day}=fixture();day.tasks=[taskBase({minutes:30}),taskBase({locked:true,assignee:'lead',assignedTo:'lead',segments:[{start:480,end:510}]}),taskBase({minutes:400})];
 const next=replanPlannerMove(state,day,day.tasks[0].id,'lead',480);assert.deepEqual(next.tasks[0].segments,[{start:480,end:510}]);assert.equal(next.tasks[1].locked,false);assert.equal(next.tasks.length,3);assertFits(next);assert.equal(day.tasks[1].locked,true);
});
test('reflow keeps hard deadlines and reports work displaced by a drop',()=>{
 const {state,day}=fixture();day.shifts=[shift({end:480,mealMinutes:0})];day.tasks=[taskBase({minutes:30}),taskBase({minutes:60,deadline:480})];
 const next=replanPlannerMove(state,day,day.tasks[0].id,'lead',420);assert.equal(next.tasks[1].segments.length,0);assert.ok(next.warnings.length);assertFits(next);
});
test('dragged routine order overrides labels while deadlines remain hard constraints',()=>{
 const {state,day}=fixture();state.settings.routineOrder=['bins',...ROUTINES.filter(r=>r.id!=='bins').map(r=>r.id)];day.shifts=[shift({end:480,mealMinutes:0})];
 day.tasks=[taskBase({kind:'topstock',source:'routine',priority:'urgent',minutes:30}),taskBase({kind:'bins',source:'routine',priority:'low',minutes:30})];
 let next=scheduleDay(state,day);assert.equal(next.tasks[1].segments[0].start,420);assert.equal(next.tasks[0].segments[0].start,450);
 day.tasks[0].deadline=445;next=scheduleDay(state,day);assert.equal(next.tasks[0].segments.length,0);
});
test('routine order round-trips through backups and rejects partial or duplicate lists',()=>{
 const {state}=fixture();state.settings.routineOrder=ROUTINES.map(r=>r.id).reverse();assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))).settings.routineOrder,state.settings.routineOrder);
 state.settings.routineOrder[0]=state.settings.routineOrder[1];assert.throws(()=>validateState(state),/valid PlanIt/);
 delete state.settings.routineOrder;assert.doesNotThrow(()=>validateState(state));
});
