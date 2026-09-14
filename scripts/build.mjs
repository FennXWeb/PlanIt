import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const output = path.resolve('dist');
fs.mkdirSync(output,{recursive:true});
for(const name of ['index.html','privacy.html','styles.css','favicon.svg','manifest.webmanifest','sw.js','src']) {
  if(!fs.existsSync(name)) throw new Error('Missing app asset: '+name);
  fs.cpSync(name,path.join(output,name),{recursive:true});
}
fs.writeFileSync(path.join(output,'.nojekyll'),'');
// This is a public browser client ID, never a secret. A repository variable lets
// the site owner activate Drive without putting account credentials in source.
const googleClientId=process.env.GOOGLE_CLIENT_ID?.trim();
if(googleClientId){
 if(!/^[\w-]+\.apps\.googleusercontent\.com$/.test(googleClientId))throw Error('GOOGLE_CLIENT_ID must be a public Google OAuth web client ID.');
 fs.writeFileSync(path.join(output,'src/cloud-config.js'),`export const GOOGLE_CLIENT_ID = ${JSON.stringify(googleClientId)};\n`);
}
// A changed app shell must change the worker itself or installed browsers would keep old assets.
const digest=createHash('sha256');
for(const name of ['index.html','privacy.html','styles.css','favicon.svg','manifest.webmanifest',...fs.readdirSync('src').sort().map(name=>'src/'+name)])digest.update(fs.readFileSync(path.join(output,name)));
const cacheName='planit-shell-'+digest.digest('hex').slice(0,16);
fs.writeFileSync(path.join(output,'sw.js'),fs.readFileSync('sw.js','utf8').replace('planit-shell-v1',cacheName));
console.log('PlanIt static app built in dist/');
