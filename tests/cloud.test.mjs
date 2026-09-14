import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../src/data.js';
import {CloudSync,cloudHeads,workspaceHash,validateSnapshot,SYNC_KEY,CLOUD_RECOVERY_KEY,MAX_CLOUD_BYTES} from '../src/cloud.js';
import {GoogleDrive,DRIVE_SCOPE} from '../src/google-drive.js';

function fixture(name='Lead'){
 const s=initialState();s.profile={name,leadId:'p1'};s.departments=[{id:'14',name:'Kitchen'}];s.team=[{id:'p1',name,role:'Team lead',active:true,departments:[]}];return s;
}
function memory(){const data=new Map();return {data,getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}
function drive(){return {records:[],async list(){return structuredClone(this.records.map(({workspace,...record})=>record));},async read(record){const value=this.records.find(r=>r.id===record.id);return validateSnapshot(structuredClone(value),record);},async write(value){this.records.push({...structuredClone(value),fileId:'file_'+value.id});}};}
function device(remote,state=fixture(),storage=memory()){
 const local={state,editing:false,applied:0};
 const sync=new CloudSync({storage,getLocal:()=>local.state,isEditing:()=>local.editing,replaceLocal:async value=>{local.state={...value,revision:(local.state?.revision||0)+1};local.applied++;}});
 return {sync,local,storage,async connect(){await sync.connect(remote,{id:'account1',email:'lead@example.test'});}};
}

test('cloud hashes ignore local revisions and object-key ordering',async()=>{
 const a=fixture(),b=structuredClone(a);b.revision=93;b.profile={leadId:'p1',name:'Lead'};
 assert.equal(await workspaceHash(a),await workspaceHash(b));b.profile.name='Different';assert.notEqual(await workspaceHash(a),await workspaceHash(b));
});
test('desktop saves and a new mobile device restores and continues the same workspace',async()=>{
 const remote=drive(),desktop=device(remote);await desktop.connect();await desktop.sync.sync();
 assert.equal(remote.records.length,1);assert.equal(desktop.sync.status.kind,'synced');
 const mobile=device(remote,initialState());await mobile.connect();await mobile.sync.sync();assert.equal(mobile.local.state.profile.name,'Lead');
 mobile.local.state.departments[0].name='Cookware';await mobile.sync.sync();await desktop.sync.sync();
 assert.equal(desktop.local.state.departments[0].name,'Cookware');assert.equal(cloudHeads(await remote.list()).length,1);
});
test('offline edits on both devices cause a conflict without overwriting either workspace',async()=>{
 const remote=drive(),a=device(remote);await a.connect();await a.sync.sync();
 const b=device(remote,initialState());await b.connect();await b.sync.sync();
 a.local.state.profile.name='Desktop edits';b.local.state.profile.name='Mobile edits';
 await a.sync.sync();const before=remote.records.length;await b.sync.sync();
 assert.equal(b.sync.status.kind,'conflict');assert.equal(remote.records.length,before);assert.equal(b.local.state.profile.name,'Mobile edits');
 await b.sync.resolve('local');assert.equal(b.sync.conflict,null);assert.equal(JSON.parse(b.storage.getItem(CLOUD_RECOVERY_KEY)).profile.name,'Mobile edits');
 await a.sync.sync();assert.equal(a.local.state.profile.name,'Mobile edits');assert.ok(remote.records.some(r=>r.workspace.profile.name==='Desktop edits'));
});
test('simultaneous first saves remain separate cloud heads and can be resolved',async()=>{
 const remote=drive(),a=device(remote,fixture('A')),b=device(remote,fixture('B'));await a.connect();await b.connect();
 await Promise.all([a.sync.sync(),b.sync.sync()]);
 assert.equal(cloudHeads(await remote.list()).length,2);
 // The first writer can finish checking before the second upload arrives.
 await a.sync.sync();await b.sync.sync();assert.equal(a.sync.status.kind,'conflict');assert.equal(b.sync.status.kind,'conflict');
 const chosen=remote.records.find(r=>r.workspace.profile.name==='A');await b.sync.resolve(chosen.id);
 assert.equal(b.local.state.profile.name,'A');assert.equal(JSON.parse(b.storage.getItem(CLOUD_RECOVERY_KEY)).profile.name,'B');
 assert.equal(cloudHeads(await remote.list()).length,1);assert.equal(remote.records.length,3);
});
test('connecting an existing unrelated local workspace asks before replacing it',async()=>{
 const remote=drive(),a=device(remote);await a.connect();await a.sync.sync();
 const b=device(remote,fixture('Another workspace'));await b.connect();await b.sync.sync();
 assert.equal(b.sync.status.kind,'conflict');assert.equal(b.local.applied,0);assert.equal(remote.records.length,1);
});
test('open forms defer inbound changes and local edits during download are preserved',async()=>{
 const remote=drive(),a=device(remote);await a.connect();await a.sync.sync();
 const b=device(remote,initialState());await b.connect();b.local.editing=true;await b.sync.sync();assert.equal(b.local.applied,0);assert.equal(b.sync.status.kind,'pending');
 b.local.editing=false;const read=remote.read.bind(remote);remote.read=async r=>{const value=await read(r);b.local.state=fixture('Typed while loading');return value;};
 await b.sync.sync();assert.equal(b.local.state.profile.name,'Typed while loading');assert.equal(b.local.applied,0);
});
test('edits made during an upload remain pending and upload on the next sync',async()=>{
 const remote=drive(),a=device(remote);await a.connect();const write=remote.write.bind(remote);let once=true;
 remote.write=async value=>{await write(value);if(once){once=false;a.local.state.profile.name='Newer edits';}};
 await a.sync.sync();assert.equal(a.sync.status.kind,'pending');assert.equal(remote.records[0].workspace.profile.name,'Lead');
 await a.sync.sync();assert.equal(a.sync.status.kind,'synced');assert.equal(remote.records.at(-1).workspace.profile.name,'Newer edits');
});
test('disconnecting during a download prevents replacing local work or re-enabling sync',async()=>{
 const remote=drive(),a=device(remote);await a.connect();await a.sync.sync();const b=device(remote,initialState());await b.connect();
 const read=remote.read.bind(remote);remote.read=async r=>{const value=await read(r);b.sync.disconnect();return value;};
 await b.sync.sync();assert.equal(b.local.state.profile,null);assert.equal(b.storage.getItem(SYNC_KEY),null);assert.equal(b.sync.status.kind,'off');
});
test('different Google accounts cannot silently receive a linked workspace',async()=>{
 const remote=drive(),a=device(remote);await a.connect();await a.sync.sync();
 await assert.rejects(()=>a.sync.connect(drive(),{id:'account2',email:'other@example.test'}),/different Google account/);
 assert.equal(a.sync.meta.accountId,'account1');assert.equal(a.sync.transport,remote);
});
test('missing remote history requires a decision instead of automatic recreation',async()=>{
 const remote=drive(),a=device(remote);await a.connect();await a.sync.sync();remote.records=[];await a.sync.sync();
 assert.equal(a.sync.status.kind,'conflict');assert.equal(remote.records.length,0);await a.sync.resolve('local');assert.equal(remote.records.length,1);
});
test('empty first-run state never uploads an incomplete workspace',async()=>{
 const remote=drive(),a=device(remote,initialState());await a.connect();await a.sync.sync();assert.equal(remote.records.length,0);assert.equal(a.sync.status.kind,'empty');
});
test('network failures keep local work and can recover without duplicating acknowledged saves',async()=>{
 const remote=drive(),a=device(remote);await a.connect();const list=remote.list.bind(remote);remote.list=async()=>{throw Error('Offline');};
 await a.sync.sync();assert.equal(a.sync.status.kind,'error');assert.equal(a.local.state.profile.name,'Lead');remote.list=list;await a.sync.sync();assert.equal(remote.records.length,1);
 await a.sync.sync();assert.equal(remote.records.length,1);
});
test('an upload with a lost response is recognized on retry without another cloud copy',async()=>{
 const remote=drive(),a=device(remote);await a.connect();const write=remote.write.bind(remote);
 remote.write=async value=>{await write(value);throw Error('Response lost');};
 await a.sync.sync();assert.equal(a.sync.status.kind,'error');assert.equal(remote.records.length,1);
 remote.write=write;await a.sync.sync();assert.equal(remote.records.length,1);assert.equal(a.sync.status.kind,'synced');
});
test('corrupt cloud data cannot replace a valid device workspace',async()=>{
 const remote=drive(),a=device(remote);await a.connect();await a.sync.sync();remote.records[0].workspace.profile.name='Tampered';
 const b=device(remote,initialState());await b.connect();await b.sync.sync();assert.equal(b.sync.status.kind,'error');assert.equal(b.local.state.profile,null);
});
test('restoring a connection stores metadata but never an access token',async()=>{
 const remote=drive(),a=device(remote);await a.connect();await a.sync.sync();
 const b=device(remote,structuredClone(a.local.state),a.storage);assert.equal(b.sync.status.kind,'reconnect');assert.equal(b.sync.transport,null);
 assert.deepEqual(Object.keys(JSON.parse(a.storage.getItem(SYNC_KEY))).sort(),['accountId','baseHash','baseId','email','enabled','lastSynced']);
});
test('new local edits during a conflict resolution upload are not discarded',async()=>{
 const remote=drive(),a=device(remote);await a.connect();await a.sync.sync();const b=device(remote,fixture('Other'));await b.connect();await b.sync.sync();
 const chosen=b.sync.conflict.heads[0].id,write=remote.write.bind(remote);remote.write=async value=>{await write(value);b.local.state.profile.name='Edited while resolving';};
 await assert.rejects(()=>b.sync.resolve(chosen),/New local edits were kept/);assert.equal(b.local.state.profile.name,'Edited while resolving');assert.ok(b.sync.conflict);
});
test('new cloud saves during conflict review invalidate the old selection',async()=>{
 const remote=drive(),a=device(remote);await a.connect();await a.sync.sync();const b=device(remote,fixture('Other'));await b.connect();await b.sync.sync();
 a.local.state.profile.name='Newer cloud';await a.sync.sync();await b.sync.resolve('local');assert.equal(b.sync.status.kind,'conflict');assert.equal(b.local.state.profile.name,'Other');
 assert.equal(remote.records.length,2);
});
test('ambiguous duplicate commit metadata and invalid history are rejected',()=>{
 const record={format:'planit-sync-v1',id:'one',hash:'a'.repeat(64),parents:[],createdAt:'2026-09-15T00:00:00Z'};
 assert.equal(cloudHeads([record,{...record}]).length,1);
 assert.throws(()=>cloudHeads([record,{...record,hash:'b'.repeat(64)}]),/disagree/);
 assert.throws(()=>cloudHeads([{...record,parents:['one']}]),/unreadable/);
});
test('Drive transport uses only private app-data scope and never puts tokens in URLs',async()=>{
 const calls=[],api=new GoogleDrive('test-access-token',3600,async(url,options)=>{calls.push({url,options});return {ok:true,status:200,json:async()=>({user:{permissionId:'account1',emailAddress:'lead@example.test'}})};});
 assert.equal(DRIVE_SCOPE,'https://www.googleapis.com/auth/drive.appdata');assert.equal((await api.account()).id,'account1');
 assert.ok(!calls[0].url.includes('test-access-token'));assert.equal(calls[0].options.headers.Authorization,'Bearer test-access-token');assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.cache,'no-store');
});
test('expired or revoked authorization stops requests and requests reconnection',async()=>{
 let calls=0;const expired=new GoogleDrive('token',0,async()=>{calls++;});await assert.rejects(()=>expired.list(),e=>e.code==='auth');assert.equal(calls,0);
 const revoked=new GoogleDrive('token',3600,async()=>({ok:false,status:401}));await assert.rejects(()=>revoked.list(),e=>e.code==='auth');assert.equal(revoked.token,'');
});
test('Drive pagination checks all pages and rejects incomplete listings',async()=>{
 let calls=0;const api=new GoogleDrive('token',3600,async url=>({ok:true,status:200,json:async()=>{calls++;return calls===1?{files:[],nextPageToken:'next'}:{files:[]};}}));
 assert.deepEqual(await api.list(),[]);assert.equal(calls,2);
 const bad=new GoogleDrive('token',3600,async()=>({ok:true,status:200,json:async()=>({})}));await assert.rejects(()=>bad.list(),/incomplete/);
});
test('cloud uploads create new private files rather than overwriting another device’s file',async()=>{
 const calls=[],api=new GoogleDrive('token',3600,async(url,options)=>{calls.push({url,options});return {ok:true,status:200};});
 const state=fixture(),snapshot={format:'planit-sync-v1',id:'v1',parents:[],createdAt:new Date().toISOString(),hash:await workspaceHash(state),workspace:state};
 await api.write(snapshot);assert.equal(calls[0].options.method,'POST');assert.match(calls[0].options.body,/"parents":\["appDataFolder"\]/);assert.match(calls[0].options.body,/"planitSync":"1"/);
 await assert.rejects(()=>api.write({...snapshot,workspace:{oversized:'x'.repeat(MAX_CLOUD_BYTES)}}),/4 MB/);assert.equal(calls.length,1);
});
