import {validateState} from './storage.js';

export const SYNC_KEY='planit.google-sync.v1';
export const CLOUD_RECOVERY_KEY='planit.before-cloud-restore.v1';
export const MAX_CLOUD_BYTES=4*1024*1024;
const idValid=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(s);
const hashValid=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])])):value;
export function workspaceText(state){const valid=validateState(state);delete valid.revision;return JSON.stringify(canonical(valid));}
export async function workspaceHash(state){const bytes=new TextEncoder().encode(workspaceText(state));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function validateDescriptor(value){
 if(!value||value.format!=='planit-sync-v1'||!idValid(value.id)||!hashValid(value.hash)||!Array.isArray(value.parents)||value.parents.length>100||value.parents.some(p=>!idValid(p)||p===value.id)||new Set(value.parents).size!==value.parents.length||typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt)))throw Error('A cloud version is unreadable. Sync stopped; local work is unchanged.');
 return {format:value.format,id:value.id,hash:value.hash,parents:[...value.parents],createdAt:value.createdAt};
}
export function cloudHeads(records){
 const versions=new Map();
 for(const record of records){validateDescriptor(record);const previous=versions.get(record.id);if(previous&&JSON.stringify(validateDescriptor(previous))!==JSON.stringify(validateDescriptor(record)))throw Error('Cloud versions disagree. Sync stopped to protect your work.');versions.set(record.id,record);}
 const parents=new Set([...versions.values()].flatMap(r=>r.parents));
 const heads=[...versions.values()].filter(r=>!parents.has(r.id));
 if(records.length&&!heads.length)throw Error('Cloud history is invalid. Sync stopped to protect your work.');
 return heads.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
}
export async function validateSnapshot(raw,descriptor){
 const meta=validateDescriptor(raw);
 if(JSON.stringify(meta)!==JSON.stringify(validateDescriptor(descriptor)))throw Error('The cloud version does not match its saved record.');
 const workspace=validateState(raw.workspace);
 if(await workspaceHash(workspace)!==meta.hash)throw Error('The cloud backup is incomplete or damaged. Local work is unchanged.');
 return {...meta,workspace};
}

// Immutable versions avoid a read-then-overwrite race between two devices.
// Concurrent saves create separate heads and are explicitly resolved by the user.
export class CloudSync {
 constructor({storage,getLocal,replaceLocal,isEditing=()=>false,onStatus=()=>{}}){
  Object.assign(this,{storage,getLocal,replaceLocal,isEditing,onStatus});
  this.transport=null;this.busy=false;this.generation=0;this.conflict=null;this.status={kind:'off',message:'Saved on this device'};
  this.meta={enabled:false,accountId:'',email:'',baseId:'',baseHash:'',lastSynced:''};
  try{const saved=JSON.parse(storage.getItem(SYNC_KEY)||'null');if(saved&&typeof saved.enabled==='boolean'&&typeof saved.accountId==='string'&&typeof saved.email==='string'&&(!saved.baseId||idValid(saved.baseId))&&(!saved.baseHash||hashValid(saved.baseHash)))this.meta={...this.meta,...saved};}catch{}
  if(this.meta.enabled)this.status={kind:'reconnect',message:'Reconnect Google Drive to resume sync'};
 }
 setStatus(kind,message){this.status={kind,message};this.onStatus(this.status);}
 persist(){this.storage.setItem(SYNC_KEY,JSON.stringify(this.meta));}
 changed(){if(this.meta.enabled)this.setStatus(this.transport?'pending':'reconnect',this.transport?'Changes saved locally · waiting to sync':'Changes saved locally · reconnect Google Drive');}
 async connect(transport,account){
  if(this.meta.accountId&&this.meta.accountId!==account.id)throw Error('This workspace is linked to a different Google account. Choose that account, or disconnect first to link another.');
  this.meta={...this.meta,enabled:true,accountId:account.id,email:account.email};this.persist();
  this.transport=transport;this.generation++;this.conflict=null;this.setStatus('pending','Google Drive connected · checking for changes');
 }
 disconnect(){this.generation++;this.transport?.disconnect?.();this.transport=null;this.conflict=null;this.meta={enabled:false,accountId:'',email:'',baseId:'',baseHash:'',lastSynced:''};this.storage.removeItem(SYNC_KEY);this.setStatus('off','Disconnected · local work and cloud versions kept');}
 async sync(){
  if(!this.meta.enabled||!this.transport||this.busy||this.conflict)return;
  this.busy=true;const generation=this.generation;
  const active=()=>{if(generation!==this.generation)throw Error('Connection changed.');};
  try{
   this.setStatus('syncing','Checking Google Drive…');
   const records=await this.transport.list();active();const heads=cloudHeads(records);
   const local=this.getLocal(),localHash=local?.profile?await workspaceHash(local):'';active();
   if(heads.length>1){this.conflict={heads};this.setStatus('conflict','Both devices have changes · choose which version to continue with');return;}
   const remote=heads[0];
   if(!remote){
    if(this.meta.baseId){this.conflict={heads:[]};this.setStatus('conflict','The linked cloud copy is missing · choose whether to upload this device');return;}
    if(!localHash){this.setStatus('empty','No cloud workspace yet · import a backup or finish setup');return;}
    await this.upload(local,[],generation);return;
   }
   if(remote.hash===localHash){this.accept(remote);return;}
   const dirty=!!localHash&&localHash!==this.meta.baseHash;
   if(dirty&&remote.id!==this.meta.baseId){this.conflict={heads};this.setStatus('conflict','Local and cloud work differ · choose a version before syncing');return;}
   if(dirty){await this.upload(local,[remote.id],generation);return;}
   if(this.isEditing()){this.setStatus('pending','Cloud update ready · finish or close your open form to load it');return;}
   const snapshot=await this.transport.read(remote);active();
   const current=this.getLocal(),currentHash=current?.profile?await workspaceHash(current):'';active();
   if(currentHash!==localHash||this.isEditing()){this.setStatus('pending','New local edits saved · cloud update will be checked again');return;}
   await this.replaceLocal(snapshot.workspace);active();this.accept(remote);
  }catch(error){if(generation===this.generation)this.setStatus(error.code==='auth'?'reconnect':'error',error.message||'Sync could not finish. Your work is saved locally.');}
  finally{this.busy=false;}
 }
 accept(version){this.meta.baseId=version.id;this.meta.baseHash=version.hash;this.meta.lastSynced=new Date().toISOString();this.persist();this.setStatus('synced','Up to date with Google Drive');}
 async upload(state,parents,generation){
  const transport=this.transport;
  const hash=await workspaceHash(state);
  if(generation!==this.generation)return;
  const descriptor={format:'planit-sync-v1',id:crypto.randomUUID(),hash,parents,createdAt:new Date().toISOString()};
  this.setStatus('syncing','Saving changes to Google Drive…');
  await transport.write({...descriptor,workspace:validateState(state)});
  if(generation!==this.generation)return;
  this.accept(descriptor);
  const heads=cloudHeads(await transport.list());
  if(generation!==this.generation)return;
  if(heads.length>1){this.conflict={heads};this.setStatus('conflict','Another device saved at the same time · review both versions');return;}
  const current=this.getLocal();if(current?.profile&&await workspaceHash(current)!==hash)this.setStatus('pending','Newer edits saved locally · waiting to sync');
 }
 async readVersion(versionId){const record=this.conflict?.heads.find(h=>h.id===versionId);if(!record)throw Error('That cloud version is no longer selected.');return this.transport.read(record);}
 async resolve(choice){
  if(this.busy||!this.conflict||!this.transport)throw Error('Open the sync conflict again before choosing a version.');
  const expected=this.conflict.heads.map(h=>h.id).sort().join(','),generation=this.generation;
  this.busy=true;
  try{
   const heads=cloudHeads(await this.transport.list());
   if(generation!==this.generation)return;
   if(heads.map(h=>h.id).sort().join(',')!==expected){this.conflict={heads};this.setStatus('conflict','Cloud work changed again · review the updated versions');return;}
   const local=this.getLocal(),localHash=local?.profile?await workspaceHash(local):'';
   let selected=local;
   if(choice!=='local'){const record=heads.find(h=>h.id===choice);if(!record)throw Error('Choose an available cloud version.');selected=(await this.transport.read(record)).workspace;}
   if(!selected?.profile)throw Error('Finish setup or import a backup before uploading this device.');
   if(generation!==this.generation)return;
   const current=this.getLocal(),currentHash=current?.profile?await workspaceHash(current):'';
   if(currentHash!==localHash)throw Error('Local work changed while choosing. Review the conflict again.');
   // Keep the superseded local workspace outside the normal rolling backup.
   if(local?.profile)this.storage.setItem(CLOUD_RECOVERY_KEY,JSON.stringify(local));
   await this.upload(selected,heads.map(h=>h.id),generation);
   if(generation!==this.generation)return;
   if(choice!=='local'){
    const now=this.getLocal(),nowHash=now?.profile?await workspaceHash(now):'';
    if(nowHash!==localHash)throw Error('New local edits were kept. The chosen version was saved in Drive; review the conflict again.');
    await this.replaceLocal(selected);
   }
   // A third device may have saved while the resolution was uploading.
   const finalHeads=cloudHeads(await this.transport.list());
   if(generation!==this.generation)return;
   if(finalHeads.length>1){this.conflict={heads:finalHeads};this.setStatus('conflict','Another device saved while resolving · review the new versions');return;}
   this.conflict=null;
   const finalLocal=this.getLocal();
   if(finalLocal?.profile&&await workspaceHash(finalLocal)!==this.meta.baseHash)this.setStatus('pending','New edits saved locally · waiting to sync');
   else this.setStatus('synced','Selected version saved · previous versions kept for recovery');
  }catch(error){if(generation===this.generation)this.setStatus(error.code==='auth'?'reconnect':'error',error.message);throw error;}
  finally{this.busy=false;}
 }
}
