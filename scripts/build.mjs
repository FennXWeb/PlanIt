import fs from 'node:fs';
import path from 'node:path';
const output = path.resolve('dist');
fs.mkdirSync(output,{recursive:true});
for(const name of ['index.html','styles.css','favicon.svg','manifest.webmanifest','sw.js','src']) {
  if(!fs.existsSync(name)) throw new Error('Missing app asset: '+name);
  fs.cpSync(name,path.join(output,name),{recursive:true});
}
fs.writeFileSync(path.join(output,'.nojekyll'),'');
console.log('PlanIt static app built in dist/');
