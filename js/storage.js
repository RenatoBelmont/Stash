/* =========================================================================
   STASH — armazenamento
   - Estado (itens, categorias, aprendizado, configurações): localStorage.
   - Imagens e prints: IndexedDB (cabe muito mais que o localStorage).
   - "inbox": o que chega pelo botão Compartilhar do celular (gravado pelo sw.js).
   ========================================================================= */
window.Stash = window.Stash || {};

Stash.store = (function () {
  var KEY = 'stash.v1';

  function fresh() {
    return {
      version: 1,
      items: [],
      categories: JSON.parse(JSON.stringify(Stash.DEFAULT_CATEGORIES)),
      learned: {},
      deleted: {},          // id do item → quando foi excluído (para não voltar de outro aparelho)
      cloudImages: {},      // id da imagem → id do arquivo no Google Drive
      catsUpdated: 0, learnedUpdated: 0, lastSync: 0,
      settings: { theme: 'system', aiMode: 'doubt', geminiKey: '', geminiModel: '', geminiModels: [], driveClientId: '', driveConnected: false }
    };
  }

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.items)) {
        var f = fresh();
        s.categories = s.categories && s.categories.length ? s.categories : f.categories;
        s.learned = s.learned || {};
        s.deleted = s.deleted || {};
        s.cloudImages = s.cloudImages || {};
        s.settings = Object.assign(f.settings, s.settings || {});
        s.items.forEach(function (i) { i.loading = false; });
        return s;
      }
    } catch (e) { /* estado corrompido ou bloqueado: começa do zero */ }
    return fresh();
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state, function (k, v) { return k === 'loading' ? undefined : v; }));
      return true;
    } catch (e) { return false; }
  }

  return { load: load, save: save, fresh: fresh };
})();

/* ---------- IndexedDB (mesmo nome/versão usados no sw.js) ---------- */
Stash.idb = (function () {
  var dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('IndexedDB indisponível'));
      var r = indexedDB.open('stash', 1);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains('images')) d.createObjectStore('images');
        if (!d.objectStoreNames.contains('inbox')) d.createObjectStore('inbox', { autoIncrement: true });
      };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
    return dbp;
  }
  function run(store, mode, fn) {
    return open().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction(store, mode);
        var req = fn(t.objectStore(store));
        t.oncomplete = function () { resolve(req ? req.result : undefined); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }
  return {
    putImage: function (id, blob) { return run('images', 'readwrite', function (s) { return s.put(blob, id); }); },
    getImage: function (id) { return run('images', 'readonly', function (s) { return s.get(id); }); },
    delImage: function (id) { return run('images', 'readwrite', function (s) { return s.delete(id); }); },
    allImageKeys: function () { return run('images', 'readonly', function (s) { return s.getAllKeys(); }); },
    takeInbox: function () {
      return run('inbox', 'readonly', function (s) { return s.getAll(); }).then(function (list) {
        return run('inbox', 'readwrite', function (s) { return s.clear(); }).then(function () { return list || []; });
      });
    }
  };
})();

/* ---------- Ícones Lucide como SVG inline (sem precisar de createIcons) ---------- */
Stash.icon = function (name, size, cls) {
  size = size || 16;
  var L = window.lucide && window.lucide.icons;
  var pas = String(name).replace(/(^|-)(\w)/g, function (_, a, b) { return b.toUpperCase(); });
  var node = L && L[pas];
  var inner = '';
  if (node) {
    var kids = (node.length === 3 && node[0] === 'svg') ? node[2] : node;
    inner = kids.map(function (k) {
      var attrs = Object.keys(k[1] || {}).map(function (a) { return a + '="' + k[1][a] + '"'; }).join(' ');
      return '<' + k[0] + ' ' + attrs + '/>';
    }).join('');
  } else {
    inner = '<circle cx="12" cy="12" r="4"/>'; // sem internet: um pontinho no lugar do ícone
  }
  return '<svg class="ic ' + (cls || '') + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
};
