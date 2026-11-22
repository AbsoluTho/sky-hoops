const CACHE='skyhoops-v15';
const FILES=['./','index.html','manifest.webmanifest','favicon.svg','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png',
 'basquete/','basquete/index.html','oval-turbo/','oval-turbo/index.html','oval-turbo/favicon.svg','oval-turbo/icons/icon-512.png','vendor/mqtt.min.js','vendor/mp.js','pedrada/','pedrada/index.html','pedrada/icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)));
});
