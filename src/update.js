// Recovery is intentionally outside the offline shell: it can update a stale app.
// Never clear localStorage, IndexedDB, private backups, or cloud files here.
export async function refreshApp(serviceWorkers,timeout=45000){
 const registration=await serviceWorkers.register('./sw.js',{updateViaCache:'none'});
 await registration.update();
 const candidate=registration.installing||registration.waiting;
 if(!candidate)return;
 await new Promise((resolve,reject)=>{
  const finish=error=>{clearTimeout(timer);candidate.removeEventListener('statechange',check);error?reject(error):resolve();};
  const check=()=>{
   if(candidate.state==='activated'){finish();return;}
   if(candidate.state==='redundant'){finish(Error('The update could not install. Check your connection and try again.'));return;}
   if(candidate.state==='installed')candidate.postMessage({type:'PLANIT_ACTIVATE_UPDATE'});
  };
  const timer=setTimeout(()=>finish(Error('The update is still pending. Close other PlanIt tabs and try again.')),timeout);
  candidate.addEventListener('statechange',check);check();
 });
}
if(typeof document!=='undefined'){
 const button=document.querySelector('#update'),status=document.querySelector('#status'),open=document.querySelector('#open');
 button.addEventListener('click',async()=>{
  button.disabled=true;status.textContent='Downloading the latest app files…';
  try{
   if('serviceWorker' in navigator)await refreshApp(navigator.serviceWorker);
   status.textContent='App files are up to date. Open PlanIt below, then connect Google Drive in Settings.';open.hidden=false;
  }catch(error){status.textContent=error.message||'The update failed. Check your connection and try again.';}
  finally{button.disabled=false;}
 });
}
