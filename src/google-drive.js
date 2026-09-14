import {MAX_CLOUD_BYTES,validateDescriptor,validateSnapshot} from './cloud.js';
export const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.appdata';
let libraryPromise;
export function loadGoogleIdentity(){
 if(globalThis.google?.accounts?.oauth2)return Promise.resolve();
 if(libraryPromise)return libraryPromise;
 libraryPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
  const timer=setTimeout(()=>{script.remove();libraryPromise=null;reject(Error('Google sign-in did not load. Check your connection and try again.'));},15000);
  script.onload=()=>{clearTimeout(timer);if(globalThis.google?.accounts?.oauth2)resolve();else{libraryPromise=null;reject(Error('Google sign-in is unavailable in this browser.'));}};
  script.onerror=()=>{clearTimeout(timer);script.remove();libraryPromise=null;reject(Error('Google sign-in could not load. Check your connection or content blocker.'));};
  document.head.append(script);
 });return libraryPromise;
}
// Call from a click handler after the library is ready, preserving popup activation.
export function authorizeGoogle(clientId){
 if(!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId))return Promise.reject(Error('Google Drive connection needs the site owner’s one-time setup.'));
 return new Promise((resolve,reject)=>{
  const oauth=globalThis.google?.accounts?.oauth2;if(!oauth){reject(Error('Wait for Google sign-in to finish loading, then try again.'));return;}
  const client=oauth.initTokenClient({client_id:clientId,scope:DRIVE_SCOPE,include_granted_scopes:false,
   callback:response=>{if(response.error||!response.access_token){reject(Error('Google Drive access was not granted. Your workspace stays local.'));return;}if(!oauth.hasGrantedAllScopes(response,DRIVE_SCOPE)){reject(Error('Allow PlanIt’s private app-data access to enable sync.'));return;}resolve(new GoogleDrive(response.access_token,Number(response.expires_in)));},
   error_callback:()=>reject(Error('Google sign-in was closed or blocked. Try Connect again and allow the sign-in popup.'))});
  client.requestAccessToken({prompt:'select_account'});
 });
}
export class GoogleDrive {
 constructor(token,expiresIn=3600,fetcher=globalThis.fetch){this.token=token;this.expiresAt=Date.now()+Math.max(0,expiresIn-60)*1000;this.fetcher=fetcher;}
 disconnect(){this.token='';}
 async request(path,options={}){
  if(!this.token||Date.now()>=this.expiresAt){const e=Error('Google authorization expired · reconnect to sync. Local edits are safe.');e.code='auth';throw e;}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  try{
   const response=await this.fetcher('https://www.googleapis.com/'+path,{...options,credentials:'omit',cache:'no-store',signal:controller.signal,headers:{...options.headers,Authorization:'Bearer '+this.token}});
   if(response.status===401){this.token='';const e=Error('Reconnect Google Drive to resume sync. Local edits are safe.');e.code='auth';throw e;}
   if(!response.ok)throw Error(response.status===403?'Google Drive denied access or storage is full. Check app permissions, account storage, and the site’s Drive setup.':response.status===429?'Google Drive is busy. Sync will retry; local edits are safe.':'Google Drive could not complete the request. Sync will retry; local edits are safe.');
   return response;
  }catch(error){if(error.name==='AbortError'||error instanceof TypeError)throw Error('Unable to reach Google Drive. Local edits are safe; sync will retry when connected.');throw error;}
  finally{clearTimeout(timer);}
 }
 async account(){const data=await (await this.request('drive/v3/about?fields=user(permissionId,emailAddress)')).json();if(!data.user?.permissionId)throw Error('Google account could not be identified. Sync stopped.');return {id:data.user.permissionId,email:data.user.emailAddress||'Google account'};}
 async list(){
  const records=[];let page='';const seenPages=new Set();
  do{
   const query=new URLSearchParams({spaces:'appDataFolder',q:"trashed = false and appProperties has { key='planitSync' and value='1' }",fields:'nextPageToken,files(id,description,size)',pageSize:'1000'});if(page)query.set('pageToken',page);
   const data=await (await this.request('drive/v3/files?'+query)).json();
   if(!Array.isArray(data.files))throw Error('Google Drive returned an incomplete file list. Sync stopped.');
   for(const file of data.files){let descriptor;try{descriptor=validateDescriptor(JSON.parse(file.description));}catch{throw Error('A PlanIt cloud version is unreadable. Local work has not been changed.');}if(!/^[\w-]+$/.test(file.id)||Number(file.size)>MAX_CLOUD_BYTES)throw Error('A cloud version is too large or invalid. Local work is unchanged.');records.push({...descriptor,fileId:file.id});}
   page=data.nextPageToken||'';
   if(records.length>10000||page&&seenPages.has(page))throw Error('Cloud history is too large to check safely. Export a backup before clearing PlanIt’s app data in Google Drive.');
   seenPages.add(page);
  }while(page);
  return records;
 }
 async read(record){
  if(!/^[\w-]+$/.test(record.fileId))throw Error('Invalid cloud file.');
  const response=await this.request('drive/v3/files/'+record.fileId+'?alt=media');
  const text=await response.text();if(new TextEncoder().encode(text).byteLength>MAX_CLOUD_BYTES)throw Error('This cloud workspace is too large to load.');
  return validateSnapshot(JSON.parse(text),record);
 }
 async write(snapshot){
  const data=JSON.stringify(snapshot);if(new TextEncoder().encode(data).byteLength>MAX_CLOUD_BYTES)throw Error('Cloud sync supports workspaces up to 4 MB. Export a backup to keep this larger workspace safe.');
  const boundary='planit_'+crypto.randomUUID().replaceAll('-','');
  const metadata={name:'planit-'+snapshot.id+'.json',mimeType:'application/json',parents:['appDataFolder'],appProperties:{planitSync:'1'},description:JSON.stringify(validateDescriptor(snapshot))};
  const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${data}\r\n--${boundary}--`;
  await this.request('upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
 }
}
