import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const output = path.resolve('dist');
fs.mkdirSync(output,{recursive:true});
for(const name of ['index.html','styles.css','favicon.svg','manifest.webmanifest','sw.js','src']) {
  if(!fs.existsSync(name)) throw new Error('Missing app asset: '+name);
  fs.cpSync(name,path.join(output,name),{recursive:true});
}
fs.writeFileSync(path.join(output,'.nojekyll'),'');
// A changed app shell must change the worker itself or installed browsers would keep old assets.
const digest=createHash('sha256');
for(const name of ['index.html','styles.css','favicon.svg','manifest.webmanifest',...fs.readdirSync('src').sort().map(name=>'src/'+name)])digest.update(fs.readFileSync(name));
const cacheName='planit-shell-'+digest.digest('hex').slice(0,16);
fs.writeFileSync(path.join(output,'sw.js'),fs.readFileSync('sw.js','utf8').replace('planit-shell-v1',cacheName));
console.log('PlanIt static app built in dist/');
