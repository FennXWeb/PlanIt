import {uid,weekday,monday,addDays,ROUTINES,PRIORITIES,routinePolicy,clockLabel} from './data.js';

export const overlap = (a,b) => a.start<b.end && b.start<a.end;
export function shiftBounds(shift){return {start:shift.start,end:shift.end<=shift.start?shift.end+1440:shift.end};}
export function pauses(shift){
 const bounds=shiftBounds(shift);
 const list=[...(shift.breaks||[])];
 if(shift.mealMinutes>0) list.push({start:shift.mealStart,minutes:shift.mealMinutes,meal:true});
 return list.map(p=>{const start=p.start<bounds.start?p.start+1440:p.start;return {...p,start,end:start+p.minutes};}).sort((a,b)=>a.start-b.start);
}
export function validateShifts(shifts){
 if(!shifts.length) return 'Select at least one person who is working.';
 if(new Set(shifts.map(s=>s.personId)).size!==shifts.length) return 'Each person can have one shift per day.';
 for(const s of shifts){
  const b=shiftBounds(s),p=pauses(s);
  if(![s.start,s.end,s.mealStart,s.mealMinutes].every(Number.isFinite)||s.start<0||s.start>=1440||s.end<0||s.end>=1440||b.end-b.start>960||b.end-b.start<30) return 'Shifts must be between 30 minutes and 16 hours.';
  if(p.some((a,i)=>!Number.isFinite(a.start)||!Number.isFinite(a.end)||a.end<=a.start||a.start<b.start||a.end>b.end||p.slice(i+1).some(c=>overlap(a,c)))) return 'Meals and rest breaks must fit inside the shift without overlapping.';
 }
 return '';
}
export function capacity(shift){const b=shiftBounds(shift);return b.end-b.start-pauses(shift).reduce((n,p)=>n+p.end-p.start,0);}
export function remaining(task){return Math.max(0,Math.ceil(task.minutes*(1-(task.progress||0)/100)));}
export function taskBase(options){return {id:uid(),key:uid(),title:'Task',kind:'custom',minutes:30,priority:'normal',department:'',aisleId:'',progress:0,status:'pending',assignee:'',assignedTo:'',segments:[],source:'custom',locked:false,notes:'',...options};}
export function historyTasks(state,before){return state.days.filter(d=>!before||d.date<before).flatMap(d=>d.tasks.map(t=>({...t,date:d.date})));}
export function lastAisleWork(state,aisleId,kind,before){return historyTasks(state,before).filter(t=>t.aisleId===aisleId&&t.kind===kind&&t.status==='done').map(t=>t.date).sort().at(-1)||'';}
export function topstockProgress(state,date){
 const start=monday(date),end=addDays(start,6);
 const done=new Set(state.days.filter(d=>d.date>=start&&d.date<=end&&d.date<=date).flatMap(d=>d.tasks.filter(t=>t.kind==='topstock'&&t.status==='done').map(t=>t.aisleId)));
 const aisles=state.aisles.filter(a=>a.topstock);
 return {total:aisles.length,done:aisles.filter(a=>done.has(a.id)).length,remaining:aisles.filter(a=>!done.has(a.id)),start,friday:addDays(start,4)};
}
function windowForShift(window,shift){
 if(!window) return shiftBounds(shift);
 const b=shiftBounds(shift);
 let start=window.start,end=window.end<=window.start?window.end+1440:window.end;
 // A window entirely before an overnight shift's start belongs to its next morning.
 if(b.end>1440&&end<=b.start){start+=1440;end+=1440;}
 return {start:Math.max(start,b.start),end:Math.min(end,b.end)};
}
function taskBounds(task,shift){
 const w=windowForShift(task.window,shift);
 // Limits are anchored to the plan date, including explicit following-day times.
 return {start:Math.max(w.start,task.earliestStart??0),end:Math.min(w.end,task.deadline??2880)};
}
function freeRanges(shift,reservations,task,notBefore=0){
 const w=taskBounds(task,shift);w.start=Math.max(w.start,notBefore);
 if(w.end<=w.start)return [];
 const blocks=[...pauses(shift),...reservations].filter(p=>overlap(p,w)).sort((a,b)=>a.start-b.start);
 const result=[];let cursor=w.start;
 for(const b of blocks){if(b.start>cursor)result.push({start:cursor,end:Math.min(b.start,w.end)});cursor=Math.max(cursor,b.end);}
 if(cursor<w.end) result.push({start:cursor,end:w.end});
 return result;
}
function allocate(ranges,minutes){const segments=[];let left=minutes;for(const r of ranges){const length=Math.min(left,r.end-r.start);if(length>0){segments.push({start:r.start,end:r.start+length});left-=length;}if(!left)break;}return left===0?segments:null;}
export function scheduleDay(state,day,{notBefore=0}={}){
 const tasks=structuredClone(day.tasks),reserved=Object.fromEntries(day.shifts.map(s=>[s.personId,[]]));
 const loads=Object.fromEntries(day.shifts.map(s=>[s.personId,0])),topLoads={};
 const warnings=[];
 for(const t of tasks){
  if(t.status==='done'||t.status==='in-progress'||t.locked){
   for(const seg of t.segments||[]){if(reserved[t.assignedTo]){reserved[t.assignedTo].push(seg);loads[t.assignedTo]+=seg.end-seg.start;}}
  } else {t.segments=[];t.assignedTo='';t.unscheduledReason='';}
  if(t.kind==='topstock'&&t.assignedTo)topLoads[t.assignedTo]=(topLoads[t.assignedTo]||0)+1;
 }
 const fixedOutsideLimits=tasks.filter(t=>t.status!=='done'&&(t.locked||t.status==='in-progress')&&t.segments.some(s=>s.start<(t.earliestStart??0)||s.end>(t.deadline??2880))).length;
 if(fixedOutsideLimits)warnings.push(`${fixedOutsideLimits} pinned or started task${fixedOutsideLimits===1?' is':'s are'} outside required routine times. Adjust the task details manually.`);
 const zonePolicy=routinePolicy(state.settings,'zone');
 const work=tasks.filter(t=>t.status!=='done'&&t.status!=='in-progress'&&!t.locked).sort((a,b)=>{
  // Priority first, then earliest hard deadline. A tour zone inherits at least the
  // routine's scheduling priority so automatic aisle fill cannot displace it.
  const tourZone=t=>t.kind==='zone'&&t.source==='tour';
  const rank=t=>tourZone(t)?Math.min(PRIORITIES[t.priority]??2,PRIORITIES[zonePolicy.priority]):PRIORITIES[t.priority]??2;
  const due=t=>tourZone(t)?Math.min(t.deadline??2880,zonePolicy.deadline??2880):t.deadline??2880;
  const score=t=>(t.source==='tour'?-30:0)+(t.window?-20:0)+(t.kind==='zone'&&t.source==='routine'?15:0);
  return rank(a)-rank(b)||due(a)-due(b)||score(a)-score(b)||((a.window?.end??3000)-(b.window?.end??3000));
 });
 for(const t of work){
  const candidates=[];
  for(const s of day.shifts){
   const person=state.team.find(p=>p.id===s.personId);
   if(t.assignee&&t.assignee!==s.personId)continue;
   if(t.department&&person?.departments?.length&&!person.departments.includes(t.department))continue;
   const segments=allocate(freeRanges(s,reserved[s.personId],t,notBefore),remaining(t));
   if(!segments)continue;
   candidates.push({id:s.personId,segments,load:loads[s.personId]/Math.max(1,capacity(s)),top:topLoads[s.personId]||0});
  }
  candidates.sort((a,b)=>(t.kind==='topstock'?a.top-b.top:0)||a.load-b.load||a.segments[0]?.start-b.segments[0]?.start||a.id.localeCompare(b.id));
  const best=candidates[0];
  if(best){t.assignedTo=best.id;t.segments=best.segments;reserved[best.id].push(...best.segments);loads[best.id]+=remaining(t);if(t.kind==='topstock')topLoads[best.id]=(topLoads[best.id]||0)+1;}
  else {t.unscheduledReason=t.deadline!=null?`Cannot finish by ${clockLabel(t.deadline)} with eligible staff, breaks, task windows, and higher-priority work.`:t.earliestStart!=null?`Not enough eligible time after ${clockLabel(t.earliestStart)} within the shift and task window.`:t.assignee?'The selected person is unavailable or has insufficient time.':t.window?'No eligible shift has enough free time in this task’s window.':'Not enough eligible shift capacity.';}
 }
 // Automatic zoning is a best-effort fill, not an obligation for every aisle today.
 const result=tasks.filter(t=>!(t.kind==='zone'&&t.source==='routine'&&!t.assignedTo&&t.status==='pending'));
 const automaticZones=tasks.filter(t=>t.kind==='zone'&&t.source==='routine');
 if(automaticZones.length&&!tasks.some(t=>t.kind==='zone'&&t.assignedTo)&&(automaticZones[0].deadline!=null||automaticZones[0].earliestStart!=null))warnings.push('No automatic zoning fits the required routine times. Adjust the zoning window, deadline, or staffing.');
 const count=result.filter(t=>t.status!=='done'&&!t.segments?.length).length;
 if(count)warnings.push(`${count} task${count===1?'':'s'} need capacity or reassignment.`);
 return {...day,tasks:result,warnings};
}
export function generateTasks(state,day){
 const tasks=[],dow=weekday(day.date),settings=state.settings;
 const add=options=>tasks.push(taskBase({source:'routine',...routinePolicy(settings,options.kind==='outs'?'rfid':options.kind),...options}));
 for(const r of ROUTINES){
  const cfg=settings.routines[r.id];if(!cfg?.enabled||!cfg.days.includes(dow))continue;
  if(['topstock','zone','reshops','rfid','modular'].includes(r.id))continue;
  add({key:`routine:${r.id}:${day.date}`,title:r.name,kind:r.id,minutes:cfg.minutes});
 }
 if(settings.routines.rfid.enabled){
  for(const d of state.departments){const rf=settings.rfid[d.id];
   if(rf?.enabled ? rf.days.includes(dow) : dow===2)add({key:`scan:${d.id}:${day.date}`,title:`${rf?.enabled?'RFID scan':'Deep out scan'} · D${d.id}`,kind:rf?.enabled?'rfid':'outs',department:d.id,minutes:settings.routines.rfid.minutes});
  }
 }
 if(settings.routines.topstock.enabled&&settings.topstockDays.includes(dow)){
  const progress=topstockProgress(state,day.date);
  const daysLeft=Array.from({length:Math.max(1,5-((dow+6)%7))},(_,i)=>addDays(day.date,i)).filter(d=>d<=progress.friday&&settings.topstockDays.includes(weekday(d))).length||1;
  const pending=progress.remaining.sort((a,b)=>lastAisleWork(state,a.id,'topstock',day.date).localeCompare(lastAisleWork(state,b.id,'topstock',day.date))||a.label.localeCompare(b.label,undefined,{numeric:true}));
  for(const a of pending.slice(0,Math.ceil(pending.length/daysLeft)))add({key:`topstock:${a.id}:${progress.start}`,title:`Top stock · ${a.label}`,kind:'topstock',aisleId:a.id,department:a.department,minutes:a.topMinutes||settings.routines.topstock.minutes});
 }
 if(settings.routines.reshops.enabled)settings.reshopWindows.forEach((w,i)=>add({key:`reshops:${i}:${day.date}`,title:'Reshops',kind:'reshops',minutes:settings.routines.reshops.minutes,window:{...w}}));
 if(settings.routines.zone.enabled){
  const sorted=[...state.aisles].sort((a,b)=>lastAisleWork(state,a.id,'zone',day.date).localeCompare(lastAisleWork(state,b.id,'zone',day.date))||a.label.localeCompare(b.label,undefined,{numeric:true}));
  sorted.forEach(a=>add({key:`zone:${a.id}:${day.date}`,title:`Zone · ${a.label}`,kind:'zone',aisleId:a.id,department:a.department,minutes:a.zoneMinutes||settings.routines.zone.minutes,window:{...settings.zoneWindow}}));
 }
 for(const r of state.repeats.filter(r=>r.active&&r.days.includes(dow)))add({...r,id:uid(),key:`repeat:${r.id}:${day.date}`,kind:'custom',source:'repeat',repeatId:r.id});
 if(settings.routines.modular.enabled){for(const m of state.modulars.filter(m=>!m.completed&&(!m.dueDate||m.dueDate<=day.date))){add({key:`modular:${m.id}`,title:`Modular ${m.category} · ${m.description}`,kind:'modular',department:m.department,minutes:m.minutes,modularId:m.id,notes:`${m.sections} sections`});}}
 return tasks;
}
export function unreviewedDay(state){return [...state.days].sort((a,b)=>a.date.localeCompare(b.date)).find(d=>!d.reviewed);}
export function refreshRoutines(state,day){
 const next=structuredClone(day);
 next.tasks=next.tasks.filter(t=>t.source!=='routine'||t.status!=='pending'||t.locked||t.progress>0);
 const fresh=generateTasks(state,next).filter(t=>!next.tasks.some(old=>old.key===t.key||(t.aisleId&&old.aisleId===t.aisleId&&old.kind===t.kind)||(t.modularId&&old.modularId===t.modularId)));
 next.tasks.push(...fresh);
 return scheduleDay(state,next);
}
export function createDay(state,date,shifts){
 if(state.days.some(d=>d.date===date))throw Error('A plan already exists for this date. Open it from the date selector.');
 if(unreviewedDay(state))throw Error('Complete the previous day’s follow-up first.');
 if(state.days.some(d=>d.date>date))throw Error('New plans must come after the latest planned day.');
 const error=validateShifts(shifts);if(error)throw Error(error);
 let day={date,shifts,tasks:[],tour:[],reviewed:false,warnings:[]};
 const previous=[...state.days].sort((a,b)=>a.date.localeCompare(b.date)).at(-1);
 const carry=(previous?.tasks||[]).filter(t=>t.status!=='done').map(t=>taskBase({...t,id:uid(),minutes:remaining(t),progress:0,status:'pending',segments:[],assignedTo:'',locked:false,source:'carry',actualMinutes:undefined,carryFrom:previous.date,assignee:shifts.some(s=>s.personId===t.assignee)?t.assignee:'',notes:[t.notes,`Carried from ${previous.date}${t.progress?` (${t.progress}% previously completed)`:''}`].filter(Boolean).join('\n')}));
 const routines=generateTasks(state,day);
 const identities=new Set(carry.map(t=>t.kind+':'+(t.aisleId||t.modularId||t.repeatId||'')));
 // A carried aisle/modular replaces today's generated equivalent. Daily general routines remain daily.
 day.tasks=[...carry,...routines.filter(t=>!((t.aisleId||t.modularId||t.repeatId)&&identities.has(t.kind+':'+(t.aisleId||t.modularId||t.repeatId))))];
 return scheduleDay(state,day);
}
export function integrateTour(state,day,notes,notBefore=0){
 const result=structuredClone(day),already=new Set(result.tour.map(n=>n.id));
 for(const note of notes){
  if(already.has(note.id))continue;
  result.tour.push({...note});
  if(note.kind==='zone'&&note.aisleId){
   const existing=result.tasks.find(t=>t.kind==='zone'&&t.aisleId===note.aisleId);
   if(existing?.status==='done'||existing?.status==='in-progress'||existing?.locked)continue;
   result.tasks=result.tasks.filter(t=>!(t.kind==='zone'&&t.aisleId===note.aisleId));
  }
  const zonePolicy=note.kind==='zone'?routinePolicy(state.settings,'zone'):{};
  result.tasks.push(taskBase({...note,earliestStart:zonePolicy.earliestStart??note.earliestStart,deadline:zonePolicy.deadline??note.deadline,id:uid(),key:`tour:${note.id}`,source:'tour',window:note.kind==='zone'?{...state.settings.zoneWindow}:undefined}));
 }
 // Restore candidate aisles that did not fit previously so unused zone time can be filled again.
 if(state.settings.routines.zone.enabled){const candidates=generateTasks(state,result).filter(t=>t.kind==='zone'&&!result.tasks.some(x=>x.kind==='zone'&&x.aisleId===t.aisleId));result.tasks.push(...candidates);}
 return scheduleDay(state,result,{notBefore});
}
export function manualPlacement(state,day,taskId,personId,start){
 const task=day.tasks.find(t=>t.id===taskId),shift=day.shifts.find(s=>s.personId===personId);
 if(!task||!shift)throw Error('Choose a task and an associate working this day.');
 if(task.status==='done')throw Error('Completed work cannot be rescheduled.');
 const person=state.team.find(p=>p.id===personId);
 if(task.department&&person?.departments?.length&&!person.departments.includes(task.department))throw Error('This associate is not assigned to that department.');
 const end=start+remaining(task),bounds=taskBounds(task,shift);
 const blocks=[...pauses(shift),...day.tasks.filter(t=>t.id!==taskId&&t.assignedTo===personId).flatMap(t=>t.segments||[])];
 if(!Number.isFinite(start)||start<bounds.start||end>bounds.end||blocks.some(b=>overlap(b,{start,end})))throw Error('That time overlaps another task, a break, or falls outside the shift, task window, or required start / finish times.');
 return {...task,assignee:personId,assignedTo:personId,segments:[{start,end}],locked:true,unscheduledReason:''};
}
export function dayMetrics(day){
 if(!day)return {total:0,done:0,percent:0,minutes:0,capacity:0,scheduled:0,unassigned:0};
 const total=day.tasks.length,done=day.tasks.filter(t=>t.status==='done').length;
 const minutes=day.tasks.reduce((n,t)=>n+t.minutes,0),cap=day.shifts.reduce((n,s)=>n+capacity(s),0);
 const scheduled=day.tasks.flatMap(t=>t.segments||[]).reduce((n,t)=>n+t.end-t.start,0);
 return {total,done,percent:total?Math.round(done/total*100):0,minutes,capacity:cap,scheduled,unassigned:day.tasks.filter(t=>t.status!=='done'&&!t.assignedTo).length};
}
export function personMetrics(state,id,from='',to='9999-12-31'){
 const days=state.days.filter(d=>d.date>=from&&d.date<=to),tasks=days.flatMap(d=>d.tasks).filter(t=>t.assignedTo===id);
 const zones=tasks.filter(t=>t.kind==='zone'),done=tasks.filter(t=>t.status==='done'),timed=done.filter(t=>t.actualMinutes>0);
 return {tasks:tasks.length,done:done.length,completion:tasks.length?Math.round(done.length/tasks.length*100):null,zone:zones.length?Math.round(zones.reduce((s,t)=>s+(t.progress||0),0)/zones.length):null,zones:zones.length,topstock:done.filter(t=>t.kind==='topstock').length,carry:tasks.filter(t=>t.source==='carry').length,plannedMinutes:tasks.reduce((s,t)=>s+t.minutes,0),actualRatio:timed.length?Math.round(timed.reduce((s,t)=>s+t.actualMinutes,0)/timed.reduce((s,t)=>s+t.minutes,0)*100):null,timed:timed.length,shifts:days.filter(d=>d.shifts.some(s=>s.personId===id)).length};
}
