import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,ROUTINES,comparePriority} from '../src/data.js';
import {taskBase,createDay,scheduleDay,generateTasks,integrateTour,manualPlacement,refreshRoutines} from '../src/engine.js';
import {validateState,saveWorkspace,loadWorkspace,STORAGE_KEY} from '../src/storage.js';

function fixture(){
 const s=initialState();
 s.profile={name:'Lead',leadId:'p1'};
 s.departments=[{id:'14',name:'Kitchen'},{id:'17',name:'Home'}];
 s.team=[{id:'p1',name:'Lead',role:'Team lead',active:true,departments:[]}];
 s.aisles=[{id:'a1',label:'H1',department:'14',topstock:true,zoneMinutes:20,topMinutes:20},{id:'a2',label:'H2',department:'14',topstock:true,zoneMinutes:20,topMinutes:20}];
 for(const cfg of Object.values(s.settings.routines))cfg.enabled=false;
 return s;
}
const shift=(overrides={})=>({personId:'p1',start:420,end:960,mealStart:660,mealMinutes:60,breaks:[{start:540,minutes:15}],...overrides});
const plan=(tasks=[],sf=shift())=>({date:'2026-09-15',shifts:[sf],tasks,tour:[],reviewed:false,warnings:[]});

test('every routine, including department scans and modulars, inherits configured priority and limits',()=>{
 const s=fixture();
 for(const cfg of Object.values(s.settings.routines))Object.assign(cfg,{enabled:true,priority:'urgent',earliestStart:480,deadline:900});
 s.settings.rfid['14']={enabled:true,days:[2]};
 s.modulars=[{id:'m1',department:'14',category:'23',description:'Cookware',sections:2,minutes:90,completed:false,dueDate:''}];
 const tasks=generateTasks(s,plan());
 for(const kind of [...ROUTINES.map(r=>r.id),'outs'])assert.ok(tasks.some(t=>t.kind===kind),kind+' generated');
 for(const t of tasks){assert.equal(t.priority,'urgent',t.kind);assert.equal(t.earliestStart,480);assert.equal(t.deadline,900);}
 assert.equal(tasks.find(t=>t.kind==='modular').minutes,90);
 assert.equal(tasks.find(t=>t.kind==='topstock').minutes,20);
});

test('priority controls who gets scarce capacity regardless of task input order',()=>{
 const d=scheduleDay(fixture(),plan(['low','normal','high','urgent'].map(priority=>taskBase({priority,minutes:30})),shift({end:480,mealMinutes:0,breaks:[]})));
 assert.deepEqual(d.tasks.filter(t=>t.assignedTo).map(t=>t.priority),['high','urgent']);
 assert.equal(d.tasks.find(t=>t.priority==='urgent').segments[0].start,420);
 assert.equal(d.tasks.find(t=>t.priority==='high').segments[0].start,450);
});

test('within the same priority, earliest finish-by tasks reserve time before flexible work',()=>{
 const tasks=[taskBase({title:'Flexible',minutes:60}),taskBase({title:'Later',minutes:30,deadline:480}),taskBase({title:'First',minutes:30,deadline:450})];
 const d=scheduleDay(fixture(),plan(tasks));
 assert.equal(d.tasks.find(t=>t.title==='First').segments[0].start,420);
 assert.equal(d.tasks.find(t=>t.title==='Later').segments[0].start,450);
 assert.equal(d.tasks.find(t=>t.title==='Flexible').segments[0].start,480);
 assert.deepEqual([...tasks].sort(comparePriority).map(t=>t.title),['First','Later','Flexible']);
});

test('time limits intersect shifts and breaks, and finishing exactly at the deadline is allowed',()=>{
 const s=fixture(),t=taskBase({minutes:30,earliestStart:525,deadline:570});
 const d=scheduleDay(s,plan([t]));
 assert.deepEqual(d.tasks[0].segments,[{start:525,end:540},{start:555,end:570}]);
 assert.throws(()=>manualPlacement(s,d,t.id,'p1',560),/required start \/ finish/);
 assert.throws(()=>manualPlacement(s,d,t.id,'p1',500),/required start \/ finish/);
});

test('impossible finish-by limits remain unscheduled, including midnight on the plan day',()=>{
 for(const deadline of [0,419,449,700]){
  const d=scheduleDay(fixture(),plan([taskBase({minutes:deadline===700?60:30,earliestStart:deadline===700?630:null,deadline})]));
  assert.equal(d.tasks[0].assignedTo,'');assert.deepEqual(d.tasks[0].segments,[]);
  assert.match(d.tasks[0].unscheduledReason,/Cannot finish by/);assert.ok(d.warnings.length);
 }
});

test('earliest start alone is optional and never schedules before its limit',()=>{
 const d=scheduleDay(fixture(),plan([taskBase({earliestStart:705,minutes:30})]));
 assert.deepEqual(d.tasks[0].segments,[{start:720,end:750}]);
 const legacy=scheduleDay(fixture(),plan([taskBase({minutes:30})]));
 assert.deepEqual(legacy.tasks[0].segments,[{start:420,end:450}]);
});

test('following-day deadlines are explicit and respected with overnight windows and manual placement',()=>{
 const s=fixture(),sf=shift({start:1320,end:420,mealStart:120,breaks:[]});
 const t=taskBase({minutes:30,earliestStart:1650,deadline:1680,window:{start:180,end:300}});
 const d=scheduleDay(s,plan([t],sf));
 assert.deepEqual(d.tasks[0].segments,[{start:1650,end:1680}]);
 assert.equal(manualPlacement(s,d,t.id,'p1',1650).locked,true);
 assert.throws(()=>manualPlacement(s,d,t.id,'p1',1670),/required start \/ finish/);
 const sameDay=scheduleDay(s,plan([taskBase({minutes:30,deadline:240})],sf));
 assert.equal(sameDay.tasks[0].assignedTo,'');
});

test('reshop deadlines narrow each window and incompatible windows stay visible',()=>{
 const s=fixture();Object.assign(s.settings.routines.reshops,{enabled:true,deadline:645,priority:'high'});
 s.settings.reshopWindows=[{start:600,end:660},{start:780,end:840}];
 const d=createDay(s,'2026-09-15',[shift()]);
 assert.deepEqual(d.tasks[0].segments,[{start:600,end:630}]);
 assert.equal(d.tasks[1].assignedTo,'');assert.match(d.tasks[1].unscheduledReason,/10:45 am/);
});

test('rebalance from now never moves unfinished work past a hard deadline',()=>{
 const s=fixture(),d=scheduleDay(s,plan([taskBase({minutes:30,deadline:480})]));
 const next=scheduleDay(s,d,{notBefore:470});
 assert.equal(next.tasks[0].assignedTo,'');
 d.tasks[0].status='done';d.tasks[0].progress=100;
 assert.deepEqual(scheduleDay(s,d,{notBefore:900}).tasks[0].segments,d.tasks[0].segments);
});

test('tour zoning still replaces automatic zoning even when its routine has urgent priority',()=>{
 const s=fixture();Object.assign(s.settings.routines.zone,{enabled:true,priority:'urgent',earliestStart:900,deadline:920});
 s.settings.zoneWindow={start:900,end:940};
 const d=createDay(s,'2026-09-15',[shift()]);
 const next=integrateTour(s,d,[taskBase({kind:'zone',aisleId:'a2',department:'14',minutes:20,priority:'low'})]);
 assert.equal(next.tasks.length,1);assert.equal(next.tasks[0].aisleId,'a2');assert.equal(next.tasks[0].source,'tour');
 assert.deepEqual(next.tasks[0].segments,[{start:900,end:920}]);assert.equal(next.tasks[0].deadline,920);
});

test('zoning with no capacity inside required times explains the empty automatic fill',()=>{
 const s=fixture();Object.assign(s.settings.routines.zone,{enabled:true,deadline:800});
 const d=createDay(s,'2026-09-15',[shift()]);
 assert.equal(d.tasks.length,0);assert.match(d.warnings.join(' '),/No automatic zoning fits/);
});

test('tightening automatic zoning deadlines does not displace an existing tour assignment',()=>{
 const s=fixture();s.settings.routines.zone.enabled=true;s.settings.zoneWindow={start:900,end:920};
 const d=integrateTour(s,createDay(s,'2026-09-15',[shift()]),[taskBase({kind:'zone',aisleId:'a2',minutes:20,priority:'low'})]);
 Object.assign(s.settings.routines.zone,{priority:'urgent',deadline:920});
 const next=refreshRoutines(s,d);
 assert.equal(next.tasks.length,1);assert.equal(next.tasks[0].source,'tour');assert.equal(next.tasks[0].aisleId,'a2');
 assert.deepEqual(next.tasks[0].segments,[{start:900,end:920}]);
});

test('applying routines updates pending work and preserves completed, started, pinned, partial, and tour work',()=>{
 const s=fixture();s.settings.routines.pinpoint.enabled=true;
 const d=createDay(s,'2026-09-15',[shift()]);
 const fixed=[taskBase({source:'routine',kind:'bins',locked:true,assignedTo:'p1',segments:[{start:800,end:830}]}),taskBase({source:'routine',kind:'feature',status:'in-progress',assignedTo:'p1',segments:[{start:830,end:860}]}),taskBase({source:'routine',kind:'prices',status:'done',progress:100,assignedTo:'p1',segments:[{start:860,end:890}]}),taskBase({source:'routine',kind:'tags',progress:50}),taskBase({source:'tour',title:'Inspect display'})];
 d.tasks.push(...fixed);
 Object.assign(s.settings.routines.pinpoint,{priority:'urgent',earliestStart:480,deadline:510});
 const next=refreshRoutines(s,d),pinpoint=next.tasks.find(t=>t.kind==='pinpoint');
 assert.equal(pinpoint.priority,'urgent');assert.deepEqual(pinpoint.segments,[{start:480,end:510}]);
 for(const t of fixed){const kept=next.tasks.find(x=>x.id===t.id);assert.ok(kept);assert.equal(kept.progress,t.progress);if(t.locked||t.status!=='pending')assert.deepEqual(kept.segments,t.segments);}
 assert.equal(d.tasks[0].deadline,null,'original day is not mutated');
});

test('carryover keeps remaining duration, priority and daily limits without duplicating an aisle',()=>{
 const s=fixture();Object.assign(s.settings.routines.topstock,{enabled:true,priority:'urgent',earliestStart:480,deadline:540});
 const d=createDay(s,'2026-09-15',[shift()]);d.tasks[0].progress=50;d.reviewed=true;s.days=[d];
 const next=createDay(s,'2026-09-16',[shift()]),carry=next.tasks.find(t=>t.source==='carry');
 assert.equal(carry.minutes,10);assert.equal(carry.priority,'urgent');assert.equal(carry.earliestStart,480);assert.equal(carry.deadline,540);
 assert.equal(next.tasks.filter(t=>t.aisleId===carry.aisleId).length,1);
});

test('legacy workspaces migrate without replacing names, tasks or saved history',()=>{
 const s=fixture();s.days=[plan([taskBase({title:'Keep me'})])];
 for(const cfg of Object.values(s.settings.routines)){delete cfg.priority;delete cfg.deadline;delete cfg.earliestStart;}
 delete s.settings.routineSort;
 const result=validateState(JSON.parse(JSON.stringify(s)));
 assert.deepEqual(result.days,s.days);assert.deepEqual(result.profile,s.profile);assert.equal(result.aisles[0].description,'');
 assert.equal(result.settings.routines.zone.priority,'low');assert.equal(result.settings.routines.topstock.priority,'high');
 assert.equal(result.settings.routines.pinpoint.deadline,null);assert.equal(result.settings.routineSort,'priority');
 assert.equal(s.aisles[0].description,undefined,'migration does not mutate its input');
});

test('local saves and reloads preserve aisle descriptions and routine controls',()=>{
 const s=fixture(),values=new Map();
 globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 s.aisles[0].description='Cookware & bakeware — H1';s.settings.routineSort='library';
 Object.assign(s.settings.routines.pinpoint,{priority:'high',earliestStart:1440,deadline:1500});
 saveWorkspace(s);
 assert.ok(values.has(STORAGE_KEY));const loaded=loadWorkspace();assert.equal(loaded.message,'');
 assert.equal(loaded.state.aisles[0].description,s.aisles[0].description);
 assert.deepEqual(loaded.state.settings,s.settings);
});

test('malformed new backup fields are rejected instead of silently erasing local data',()=>{
 for(const mutate of [s=>s.aisles[0].description=123,s=>s.aisles[0].description='x'.repeat(501),s=>s.settings.routines.pinpoint.priority='invalid',s=>s.settings.routines.pinpoint.priority='__proto__',s=>s.settings.routines.pinpoint.deadline='09:00',s=>s.settings.routines.pinpoint.deadline=2880,s=>Object.assign(s.settings.routines.pinpoint,{earliestStart:600,deadline:500}),s=>s.settings.routineSort='unknown',s=>s.days=[plan([taskBase({earliestStart:600,deadline:600})])]]){
  const s=fixture();mutate(s);assert.throws(()=>validateState(s),/valid PlanIt/);
 }
});

test('repeating task limits are independent of company routine defaults and validated on import',()=>{
 const s=fixture();s.repeats=[{id:'r1',title:'Check feature',minutes:20,department:'14',assignee:'',priority:'high',days:[2],active:true,earliestStart:480,deadline:510}];
 const d=createDay(s,'2026-09-15',[shift()]);assert.deepEqual(d.tasks[0].segments,[{start:480,end:500}]);
 assert.equal(d.tasks[0].priority,'high');assert.equal(d.tasks[0].source,'repeat');
 s.days=[d];assert.ok(validateState(s));s.repeats[0].deadline=-1;assert.throws(()=>validateState(s));
});
