// Only the public app shell is cached. Google authorization and private cloud requests are never cached.
const CACHE='planit-shell-v1';
const FILES=['./','./index.html','./privacy.html','./styles.css','./favicon.svg','./manifest.webmanifest','./src/app.js','./src/theme.css','./src/welcome.js','./src/data.js','./src/engine.js','./src/storage.js','./src/demo.js','./src/cloud.js','./src/google-drive.js','./src/cloud-config.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('planit-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url),scope=new URL(self.registration.scope);
 if(event.request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
 const relative='./'+url.pathname.slice(scope.pathname.length);
 if(url.search||!FILES.includes(relative))return;
 // Versioned cache keeps modules consistent; updates activate when all tabs close.
 event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
