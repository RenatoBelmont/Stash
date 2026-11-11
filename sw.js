/* =========================================================================
   STASH — service worker
   - Deixa o app abrir sem internet (guarda os arquivos do app).
   - Recebe o que você manda pelo botão "Compartilhar" do celular
     (links, textos e imagens) e entrega para o app.
   ========================================================================= */
var CACHE = 'stash-v10';
var SHELL = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/data.js', './js/storage.js', './js/meta.js', './js/classify.js', './js/cloud.js', './js/app.js',
  './assets/icon.svg', './assets/logo.svg', './assets/icon-192.png', './assets/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function openDb() {
  return new Promise(function (resolve, reject) {
    var r = indexedDB.open('stash', 2); // v2: recria as gavetas se o banco existir vazio
    r.onupgradeneeded = function () {
      var d = r.result;
      if (!d.objectStoreNames.contains('images')) d.createObjectStore('images');
      if (!d.objectStoreNames.contains('inbox')) d.createObjectStore('inbox', { autoIncrement: true });
    };
    r.onsuccess = function () { var d = r.result; d.onversionchange = function () { d.close(); }; resolve(d); };
    r.onerror = function () { reject(r.error); };
  });
}

async function receiveShare(request) {
  try {
    var fd = await request.formData();
    var files = fd.getAll('media').filter(function (f) { return f && f.size; });
    var entry = { title: fd.get('title') || '', text: fd.get('text') || '', url: fd.get('url') || '', files: files, at: Date.now() };
    var db = await openDb();
    await new Promise(function (resolve, reject) {
      var t = db.transaction('inbox', 'readwrite');
      t.objectStore('inbox').add(entry);
      t.oncomplete = resolve; t.onerror = function () { reject(t.error); };
    });
    db.close();
  } catch (e) { /* se falhar, o app abre normalmente */ }
  return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  var url = new URL(req.url);

  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith(receiveShare(req));
    return;
  }
  if (req.method !== 'GET') return;

  // Arquivos do app: tenta a rede primeiro (pega atualizações), cai no cache sem internet
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match('./index.html'); });
    }));
    return;
  }
  // Biblioteca de ícones (versão fixa): cache primeiro
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.match(req).then(function (r) {
      return r || fetch(req).then(function (res) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); return res; });
    }));
  }
});
