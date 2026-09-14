import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshApp} from '../src/update.js';
function worker(state){const w=new EventTarget();w.state=state;w.messages=[];w.postMessage=message=>{w.messages.push(message);queueMicrotask(()=>{w.state='activated';w.dispatchEvent(new Event('statechange'));});};return w;}
function api(reg){return {async register(path,options){assert.equal(path,'./sw.js');assert.equal(options.updateViaCache,'none');return {...reg,update:async()=>{}};}};}
test('explicit update activates a waiting worker without accessing workspace storage',async()=>{const w=worker('installed');await refreshApp(api({waiting:w}));assert.deepEqual(w.messages,[{type:'PLANIT_ACTIVATE_UPDATE'}]);});
test('new installation takes precedence over an older waiting worker',async()=>{const newer=worker('installing'),older=worker('installed');const result=refreshApp(api({installing:newer,waiting:older}));setTimeout(()=>{newer.state='installed';newer.dispatchEvent(new Event('statechange'));},0);await result;assert.equal(newer.messages.length,1);assert.equal(older.messages.length,0);});
test('already-current app needs no activation',async()=>{await refreshApp(api({waiting:null,installing:null}));});
test('failed or stalled updates produce actionable errors',async()=>{await assert.rejects(()=>refreshApp(api({waiting:worker('redundant')})),/could not install/);await assert.rejects(()=>refreshApp(api({installing:worker('installing')}),10),/still pending/);});
