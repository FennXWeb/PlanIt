import {initialState,ROUTINES,weekday} from './data.js';
import {validateShifts} from './engine.js';
export const STORAGE_KEY='planit.workspace.v1';
export const BACKUP_KEY='planit.recovery.v1';
const isObj=o=>!!o&&typeof o==='object'&&!Array.isArray(o);
const str=(v,max=1000)=>typeof v==='string'&&v.length<=max;
const safeId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const safeDept=v=>typeof v==='string'&&/^\d{1,3}$/.test(v);
const num=(v,min=0,max=100000)=>Number.isFinite(v)&&v>=min&&v<=max;
const list=(v,n=10000)=>Array.isArray(v)&&v.length<=n;
const days=v=>list(v,7)&&v.every(d=>Number.isInteger(d)&&d>=0&&d<=6);
const date=v=>str(v,10)&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(weekday(v))&&new Date(v+'T12:00:00').toISOString().slice(0,10)===v;
const windowValid=w=>isObj(w)&&num(w.start,0,1439)&&num(w.end,0,1440)&&w.start!==w.end;
const taskValid=t=>isObj(t)&&str(t.id,100)&&str(t.key,200)&&str(t.title,300)&&str(t.kind,30)&&num(t.minutes,1,960)&&num(t.progress,0,100)&&['pending','in-progress','done'].includes(t.status)&&['urgent','high','normal','low'].includes(t.priority)&&str(t.department,20)&&str(t.aisleId,100)&&str(t.assignee,100)&&str(t.assignedTo,100)&&str(t.source,30)&&str(t.notes,5000)&&typeof t.locked==='boolean'&&list(t.segments,100)&&t.segments.every(s=>isObj(s)&&num(s.start,0,2879)&&num(s.end,1,2880)&&s.start<s.end)&&(!t.window||windowValid(t.window))&&(t.status!=='done'||t.progress===100)&&(!t.actualMinutes||num(t.actualMinutes,1,2000));
export function validateState(raw){
 const fail=()=>{throw Error('This file is not a valid PlanIt v1 backup. Your current workspace has not been replaced.');};
 if(!isObj(raw)||raw.version!==1||!num(raw.revision)||!isObj(raw.profile)||!str(raw.profile.name,100)||!raw.profile.name.trim()||!safeId(raw.profile.leadId))fail();
 if(!list(raw.departments,120)||!raw.departments.length||raw.departments.some(d=>!isObj(d)||!str(d.id,20)||!str(d.name,100)))fail();
 if(!list(raw.aisles,2000)||raw.aisles.some(a=>!isObj(a)||!str(a.id,100)||!str(a.department,20)||!raw.departments.some(d=>d.id===a.department)||!str(a.label,40)||typeof a.topstock!=='boolean'||!num(a.zoneMinutes,5,480)||!num(a.topMinutes,5,480)))fail();
 if(!list(raw.team,200)||!raw.team.length||raw.team.some(p=>!isObj(p)||!str(p.id,100)||!str(p.name,100)||!str(p.role,100)||typeof p.active!=='boolean'||!list(p.departments,120)||p.departments.some(d=>!str(d,20))))fail();
 for(const collection of [raw.departments,raw.aisles,raw.team])if(new Set(collection.map(x=>x.id)).size!==collection.length)fail();
 if(!isObj(raw.settings)||!isObj(raw.settings.routines)||!isObj(raw.settings.rfid)||!windowValid(raw.settings.zoneWindow)||!list(raw.settings.reshopWindows,20)||!raw.settings.reshopWindows.every(windowValid)||!days(raw.settings.topstockDays))fail();
 for(const r of ROUTINES){const v=raw.settings.routines[r.id];if(!isObj(v)||typeof v.enabled!=='boolean'||!num(v.minutes,5,480)||!days(v.days))fail();}
 if(Object.values(raw.settings.rfid).some(r=>!isObj(r)||typeof r.enabled!=='boolean'||!days(r.days)))fail();
 if(!list(raw.days,5000)||raw.days.some(d=>!isObj(d)||!date(d.date)||typeof d.reviewed!=='boolean'||!list(d.shifts,200)||validateShifts(d.shifts)||d.shifts.some(s=>!raw.team.some(p=>p.id===s.personId))||!list(d.tasks)||!d.tasks.every(taskValid)||!list(d.tour)||d.tour.some(n=>!taskValid(n))||!list(d.warnings,100)||d.warnings.some(w=>!str(w))))fail();
 if(new Set(raw.days.map(d=>d.date)).size!==raw.days.length||raw.days.filter(d=>!d.reviewed).length>1)fail();
 if(!list(raw.repeats,1000)||raw.repeats.some(r=>!isObj(r)||!str(r.id,100)||!str(r.title,300)||!num(r.minutes,5,960)||!str(r.department,20)||!str(r.assignee,100)||!['urgent','high','normal','low'].includes(r.priority)||!days(r.days)||typeof r.active!=='boolean'||(r.window&&!windowValid(r.window))))fail();
 if(!list(raw.modulars,2000)||raw.modulars.some(m=>!isObj(m)||!str(m.id,100)||!str(m.department,20)||!str(m.category,50)||!str(m.description,300)||!num(m.sections,1,500)||!num(m.minutes,5,960)||typeof m.completed!=='boolean'||(m.dueDate&&!date(m.dueDate))))fail();
 if(!list(raw.tourDraft)||!raw.tourDraft.every(taskValid))fail();
 // Identifiers appear in form attributes and generated class names. Backups cannot inject markup.
 if(!raw.team.some(p=>p.id===raw.profile.leadId)||raw.departments.some(d=>!safeDept(d.id)))fail();
 if([...raw.team,...raw.aisles,...raw.repeats,...raw.modulars].some(x=>!safeId(x.id)))fail();
 const allTasks=[...raw.days.flatMap(d=>[...d.tasks,...d.tour]),...raw.tourDraft];
 if(allTasks.some(t=>!safeId(t.id)||!safeId(t.kind)||!safeId(t.source)||(t.department&&!safeDept(t.department))||[t.aisleId,t.assignee,t.assignedTo,t.modularId,t.repeatId].some(v=>v&&!safeId(v))))fail();
 if(raw.days.some(d=>new Set(d.tasks.map(t=>t.id)).size!==d.tasks.length))fail();
 return structuredClone(raw);
}
export function loadWorkspace(){
 try {const text=localStorage.getItem(STORAGE_KEY);if(!text)return {state:initialState(),message:''};
  try{return {state:validateState(JSON.parse(text)),message:''};}
  catch{return {state:initialState(),message:'Saved data could not be read. You can restore a backup in Settings, recover the last local save, or set up again.',corrupt:true};}
 }catch{return {state:initialState(),message:'Browser storage is unavailable. Changes will last only while this page stays open. Export a backup before leaving.',unavailable:true};}
}
export function saveWorkspace(state,{force=false}={}){
 const old=localStorage.getItem(STORAGE_KEY);
 if(old&&!force){let current;try{current=JSON.parse(old);}catch{throw Error('Saved data is unreadable. Export your current work before replacing it.');}if(current.revision!==state.revision)throw Error('Another tab changed this workspace. Reload this page before editing to avoid overwriting its changes.');}
 const next={...state,revision:state.revision+1};
 validateState(next);
 // Main save must succeed before the optional recovery snapshot is touched.
 localStorage.setItem(STORAGE_KEY,JSON.stringify(next));
 if(old){try{validateState(JSON.parse(old));localStorage.setItem(BACKUP_KEY,old);}catch{/* The last valid backup is retained. */}}
 return next;
}
