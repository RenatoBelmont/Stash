/* =========================================================================
   STASH — interface
   ========================================================================= */
(function () {
  'use strict';
  var S = Stash, M = S.meta, C = S.classify, I = S.icon;
  var state = S.store.load();
  var view = { cat: 'all', q: '', sort: 'new', status: 'all' };
  var imgUrls = {};       // id da imagem → URL local (blob:)
  var imgPending = {};
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : { matches: false, addEventListener: function () {} };
  var aiWarned = 0;

  /* ---------- utilidades ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function save() { if (!S.store.save(state)) toast('Não foi possível salvar (armazenamento cheio?). Exporte um backup.'); }
  function catById(id) { return state.categories.find(function (c) { return c.id === id; }) || state.categories.find(function (c) { return c.id === 'outros'; }) || state.categories[0]; }
  function statusNames(cat) { return (S.STATUS_SETS[cat && cat.status] || S.STATUS_SETS.geral).nomes; }
  function uniq(a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); }
  function fmtDate(t) { return new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', ''); }
  function appUrl() { return /^https?:/.test(location.protocol) ? location.origin + location.pathname : S.PAGES_URL; }
  function aiOn() { return !!(state.settings.geminiKey && state.settings.aiMode !== 'off'); }
  var toastTimer;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('on'); }, 2800);
  }

  /* ---------- imagens (IndexedDB) ---------- */
  function compressImage(file) {
    return new Promise(function (resolve) {
      if (!/^image\/(png|jpe?g|webp|bmp|avif)$/.test(file.type)) return resolve(file);
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var max = 1600, w = img.naturalWidth, h = img.naturalHeight;
        var k = Math.min(1, max / Math.max(w, h));
        var cv = document.createElement('canvas');
        cv.width = Math.round(w * k); cv.height = Math.round(h * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob(function (b) {
          if (b && b.type === 'image/webp') return resolve(b.size < file.size ? b : file);
          cv.toBlob(function (j) { resolve(j && j.size < file.size ? j : file); }, 'image/jpeg', 0.85);
        }, 'image/webp', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  async function saveImage(file) {
    var id = 'img_' + uid();
    var blob = await compressImage(file);
    await S.idb.putImage(id, blob);
    imgUrls[id] = URL.createObjectURL(blob);
    return id;
  }
  function imgSrc(id) {
    if (!id) return '';
    if (imgUrls[id]) return imgUrls[id];
    if (!imgPending[id]) {
      imgPending[id] = S.idb.getImage(id).then(function (b) {
        if (b) { imgUrls[id] = URL.createObjectURL(b); renderGrid(); }
      }).catch(function () {});
    }
    return '';
  }
  function getBlob(id) { return id ? S.idb.getImage(id).catch(function () { return null; }) : Promise.resolve(null); }
  function thumbOf(item) { return imgSrc(item.imageId) || imgSrc(item.printId) || item.image || ''; }

  /* ---------- tema ---------- */
  function isDark() { var t = state.settings.theme; return t === 'dark' || (t === 'system' && mq.matches); }
  function applyTheme() {
    document.documentElement.classList.toggle('dark', isDark());
    var m = document.querySelector('meta[name=theme-color]');
    if (m) m.content = isDark() ? '#09090b' : '#fcfaf6';
    var b = $('#themeBtn');
    if (b) {
      var t = state.settings.theme;
      b.innerHTML = I(t === 'system' ? 'monitor' : t === 'light' ? 'sun' : 'moon', 16);
      b.title = 'Tema: ' + (t === 'system' ? 'Sistema' : t === 'light' ? 'Claro' : 'Escuro') + ' (clique para trocar)';
    }
  }
  function cycleTheme() {
    var order = ['system', 'light', 'dark'];
    state.settings.theme = order[(order.indexOf(state.settings.theme) + 1) % 3];
    save(); applyTheme();
    toast('Tema: ' + { system: 'Sistema', light: 'Claro', dark: 'Escuro' }[state.settings.theme]);
  }
  /* ---------- estrutura da página ---------- */
  function shell() {
    $('#app').innerHTML =
      '<header class="app-header">' +
      '  <div class="wrap header-top">' +
      '    <div class="header-brand">' +
      '      <div class="header-logo"><img src="assets/logo.svg" alt=""></div>' +
      '      <div style="min-width:0"><h1 class="header-title">Stash</h1><p class="header-subtitle" id="subtitle"></p></div>' +
      '    </div>' +
      '    <div class="header-actions">' +
      '      <button type="button" class="btn-ghost btn-icon" id="settingsBtn" title="Configurações" aria-label="Configurações">' + I('settings', 16) + '</button>' +
      '      <button type="button" class="btn-ghost btn-icon" id="themeBtn" aria-label="Alternar tema"></button>' +
      '    </div>' +
      '  </div>' +
      '  <nav class="chips" id="chips" aria-label="Categorias"></nav>' +
      '</header>' +
      '<div class="wrap layout">' +
      '  <aside class="sidebar card-surface" id="sidebar" aria-label="Categorias"></aside>' +
      '  <main style="min-width:0">' +
      '    <section class="add-box card-surface" id="addBox">' +
      '      <div class="add-row">' +
      '        <input class="input-field" id="addInput" autocomplete="off" placeholder="Cole um link de site, vídeo, post ou imagem… (ou Ctrl+V em qualquer lugar)">' +
      '        <button type="button" class="btn-ghost btn-icon" id="addImageBtn" title="Adicionar imagem ou print">' + I('image-plus', 18) + '</button>' +
      '        <button type="button" class="btn-primary" id="addBtn">' + I('plus', 16) + 'Guardar</button>' +
      '      </div>' +
      '      <div class="add-hint" id="addHint"></div>' +
      '    </section>' +
      '    <div class="toolbar">' +
      '      <h2 class="view-title" id="viewTitle"></h2>' +
      '      <label class="search">' + I('search', 15) + '<input class="input-field" id="search" type="search" placeholder="Buscar título, tag, site, nota…"></label>' +
      '      <select class="input-field" id="sort" aria-label="Ordenar">' +
      '        <option value="new">Mais recentes</option><option value="old">Mais antigos</option><option value="az">A–Z</option>' +
      '        <option value="fav">Favoritos primeiro</option><option value="rating">Melhor nota</option>' +
      '      </select>' +
      '    </div>' +
      '    <div class="status-filter" id="statusFilter"></div>' +
      '    <div class="grid" id="grid"></div>' +
      '  </main>' +
      '</div>' +
      '<button type="button" class="fab" id="fab" aria-label="Guardar algo">' + I('plus', 26) + '</button>' +
      '<input type="file" id="fileInput" accept="image/*" multiple hidden>' +
      '<input type="file" id="printInput" accept="image/*" hidden>' +
      '<input type="file" id="importInput" accept=".json,application/json" hidden>' +
      '<dialog class="sheet" id="dlg"></dialog>' +
      '<div class="toast" id="toast" role="status"></div>' +
      '<div class="drop-veil" id="dropVeil">' + I('download', 28) + 'Solte para guardar no Stash</div>';
  }

  /* ---------- render ---------- */
  function render() { renderNav(); renderHeader(); renderGrid(); }

  function counts() {
    var c = {};
    state.items.forEach(function (i) { c[i.category] = (c[i.category] || 0) + 1; });
    return c;
  }
  function renderNav() {
    var c = counts();
    var favs = state.items.filter(function (i) { return i.fav; }).length;
    var side = '', chips = '';
    function navBtn(id, icon, name, n, color) {
      var on = view.cat === id ? ' active' : '';
      var st = color ? ' style="--c:' + esc(color) + '"' : '';
      side += '<button type="button" class="nav-item' + on + '" data-cat="' + esc(id) + '"' + st + '>' + I(icon, 16, 'cat-ic') + '<span>' + esc(name) + '</span><span class="count">' + n + '</span></button>';
      chips += '<button type="button" class="chip' + on + '" data-cat="' + esc(id) + '"' + st + '>' + I(icon, 14, 'cat-ic') + esc(name) + '<span class="count">' + n + '</span></button>';
    }
    navBtn('all', 'layers', 'Tudo', state.items.length);
    navBtn('fav', 'star', 'Favoritos', favs, '#fbbf24');
    side += '<div class="section-title nav-sep">Categorias</div>';
    state.categories.forEach(function (cat) { navBtn(cat.id, cat.icon, cat.name, c[cat.id] || 0, cat.color); });
    side += '<button type="button" class="nav-item nav-add" id="addCatBtn">' + I('plus', 16) + 'Nova categoria</button>';
    side += '<p class="note" style="padding:.5rem .625rem 0">Clique com o botão direito (ou segure) numa categoria para editar.</p>';
    chips += '<button type="button" class="chip" id="addCatChip">' + I('plus', 14) + 'Categoria</button>';
    $('#sidebar').innerHTML = side;
    $('#chips').innerHTML = chips;
    var active = $('#chips .chip.active');
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function renderHeader() {
    var n = state.items.length;
    $('#subtitle').textContent = n ? n + (n === 1 ? ' item guardado' : ' itens guardados') : 'Tudo que você acha pela internet, organizado';
    var title = view.cat === 'all' ? I('layers', 20, 'cat-ic') + 'Tudo' : view.cat === 'fav' ? I('star', 20, 'cat-ic') + 'Favoritos' : '';
    if (!title) { var cat = catById(view.cat); title = I(cat.icon, 20, 'cat-ic') + esc(cat.name); $('#viewTitle').style.setProperty('--c', cat.color); }
    else $('#viewTitle').style.setProperty('--c', view.cat === 'fav' ? '#fbbf24' : 'currentColor');
    $('#viewTitle').innerHTML = title;
    $('#addHint').innerHTML = aiOn()
      ? '<span class="ai-pill on">' + I('sparkles', 12) + 'Gemini ativo</span> classifica pelo conteúdo e lê imagens e prints'
      : '<span class="ai-pill">' + I('sparkles', 12) + 'Só regras</span> organiza pelo site e por palavras-chave · <a class="inline" href="#" data-open-settings>ativar o Gemini grátis</a>';
    applyTheme();
  }

  function filtered() {
    var q = view.q.toLowerCase().trim();
    var list = state.items.filter(function (i) {
      if (view.cat === 'fav' && !i.fav) return false;
      if (view.cat !== 'all' && view.cat !== 'fav' && i.category !== view.cat) return false;
      if (view.status !== 'all' && i.status !== view.status) return false;
      if (!q) return true;
      return [i.title, i.description, i.url, i.publisher, i.notes, i.author, (i.tags || []).join(' '), catById(i.category).name]
        .join(' ').toLowerCase().indexOf(q) !== -1;
    });
    var s = view.sort;
    list.sort(function (a, b) {
      if (s === 'old') return a.created - b.created;
      if (s === 'az') return String(a.title).localeCompare(String(b.title), 'pt-BR');
      if (s === 'fav') return (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || b.created - a.created;
      if (s === 'rating') return (b.rating || 0) - (a.rating || 0) || b.created - a.created;
      return b.created - a.created;
    });
    return list;
  }

  function renderStatusFilter() {
    var box = $('#statusFilter');
    var cat = (view.cat !== 'all' && view.cat !== 'fav') ? catById(view.cat) : null;
    var show = cat ? !!cat.status : state.items.some(function (i) { return i.status; });
    if (!show) { box.innerHTML = ''; box.hidden = true; if (view.status !== 'all') view.status = 'all'; return; }
    box.hidden = false;
    var names = statusNames(cat);
    var html = '<div class="seg"><button type="button" class="' + (view.status === 'all' ? 'on' : '') + '" data-status="all">Todos</button>';
    S.STATUS_KEYS.forEach(function (k, ix) {
      html += '<button type="button" class="' + (view.status === k ? 'on' : '') + '" data-status="' + k + '" style="--s:' + S.STATUS_COLORS[k] + '">' + I(S.STATUS_ICONS[k], 13) + esc(names[ix]) + '</button>';
    });
    box.innerHTML = html + '</div>';
  }

  function cardHtml(i) {
    var cat = catById(i.category);
    var src = thumbOf(i);
    var kindIc = i.kind === 'imagem' ? 'image' : i.type === 'vídeo' ? 'circle-play' : i.printId ? 'camera' : '';
    var status = '';
    if (i.status && cat.status) {
      var ix = S.STATUS_KEYS.indexOf(i.status);
      status = '<span class="status-pill" style="--s:' + S.STATUS_COLORS[i.status] + '">' + I(S.STATUS_ICONS[i.status], 11) + esc(statusNames(cat)[ix]) + '</span>';
    }
    var stars = i.rating ? '<span class="stars-mini">' + '★★★★★'.slice(0, i.rating) + '</span>' : '';
    var tags = (i.tags || []).slice(0, 3).map(function (t) { return '<span class="tag">#' + esc(t) + '</span>'; }).join('');
    var logo = i.kind === 'link' && i.logo ? '<img src="' + esc(i.logo) + '" alt="" loading="lazy" onerror="this.remove()">' : '';
    return '<article class="item-card card-surface" data-id="' + esc(i.id) + '" tabindex="0">' +
      '<div class="thumb" style="--c:' + esc(cat.color) + '">' +
      '<span class="ph">' + I(cat.icon, 34) + '</span>' +
      (src ? '<img src="' + esc(src) + '" alt="" loading="lazy" onerror="this.remove()">' : '') +
      '<span class="cat-badge" style="--c:' + esc(cat.color) + '"><span class="dot"></span>' + esc(cat.name) + '</span>' +
      (i.fav ? '<span class="fav-mark">' + I('star', 13) + '</span>' : '') +
      (kindIc ? '<span class="kind-mark">' + I(kindIc, 13) + '</span>' : '') +
      (i.loading ? '<div class="loading-veil">' + I('loader-circle', 16, 'spin') + 'Organizando…</div>' : '') +
      '</div>' +
      '<div class="card-body">' +
      '<div class="card-title">' + esc(i.title) + '</div>' +
      (i.description ? '<div class="card-desc">' + esc(i.description) + '</div>' : '') +
      (status || stars ? '<div class="card-row">' + status + stars + '</div>' : '') +
      (tags ? '<div class="card-row tags-row">' + tags + '</div>' : '') +
      '<div class="card-meta">' + logo + '<span>' + esc(i.kind === 'link' ? i.publisher : 'Imagem') + ' · ' + fmtDate(i.created) + '</span>' +
      (i.ai ? '<span title="Classificado pelo Gemini" style="margin-left:auto;display:inline-flex">' + I('sparkles', 11) + '</span>' : '') + '</div>' +
      '</div></article>';
  }

  function renderGrid() {
    renderStatusFilter();
    var list = filtered();
    var grid = $('#grid');
    if (!state.items.length) {
      grid.innerHTML = '<div class="empty"><img src="assets/logo.svg" alt=""><h3>Seu Stash está vazio</h3>' +
        '<p class="secondary">Guarde aqui tudo que você encontra pela internet. Ele organiza sozinho.</p>' +
        '<ol><li>Cole um link na caixa acima (ou no botão <b>+</b> no celular)</li><li>Ou cole/arraste uma imagem ou print</li>' +
        '<li>Ele busca título e imagem e escolhe a categoria</li><li>Corrigiu uma categoria? Ele aprende para a próxima</li></ol></div>';
      return;
    }
    if (!list.length) {
      grid.innerHTML = '<div class="empty"><span class="muted">' + I('search', 32) + '</span><p class="secondary">Nada por aqui' + (view.q ? ' com essa busca' : ' ainda') + '.</p></div>';
      return;
    }
    grid.innerHTML = list.map(cardHtml).join('');
  }

  /* ---------- adicionar ---------- */
  function newItem(o) {
    return Object.assign({
      id: uid(), kind: 'link', url: '', type: 'site', title: '', titleFromUrl: true, userTitle: false, description: '',
      image: '', imageId: '', printId: '', logo: '', publisher: '', author: '', category: 'outros', tags: [],
      notes: '', fav: false, status: null, rating: 0, ai: false, created: Date.now(), updated: Date.now(), loading: true
    }, o);
  }

  async function addStuff(opts) {
    var urls = (opts.urls || []).slice(), files = (opts.files || []).slice();
    var created = [];
    // 1 link + imagem juntos = o print daquele link (ex.: post do Instagram)
    var print = urls.length === 1 && files.length ? files.shift() : null;

    for (var u = 0; u < urls.length; u++) {
      var url = urls[u];
      var dup = state.items.find(function (i) { return i.url === url; });
      if (dup) { toast('Já está no Stash: ' + dup.title); continue; }
      var it = newItem({ url: url, type: M.mediaType(url), title: opts.title || M.prettyFromUrl(url), hintTitle: opts.title || '', publisher: M.host(url) });
      if (M.isImageUrl(url)) it.image = url;
      if (print) { try { it.printId = await saveImage(print); } catch (e) { toast('Não consegui guardar a imagem neste navegador.'); } }
      created.push(it);
    }
    for (var f = 0; f < files.length; f++) {
      try {
        var id = await saveImage(files[f]);
        created.push(newItem({ kind: 'imagem', type: 'imagem', imageId: id, title: opts.title || ('Imagem de ' + new Date().toLocaleDateString('pt-BR')), publisher: 'Imagem' }));
      } catch (e) { toast('Não consegui guardar a imagem neste navegador.'); }
    }
    if (!created.length) { if (!urls.length && !files.length) toast('Nenhum link ou imagem encontrado.'); return; }

    for (var k = created.length - 1; k >= 0; k--) state.items.unshift(created[k]);
    if (view.cat !== 'all') { view.cat = 'all'; view.status = 'all'; }
    save(); render();
    aiWarned = 0;
    await pool(created, 3, function (it) { return processItem(it, { isNew: true }); });
    toast(created.length === 1 ? 'Guardado em ' + catById(created[0].category).name : created.length + ' itens guardados e organizados');
  }

  async function pool(list, n, fn) {
    var idx = 0;
    async function worker() { while (idx < list.length) { var it = list[idx++]; await fn(it); } }
    var ws = []; for (var i = 0; i < Math.min(n, list.length); i++) ws.push(worker());
    await Promise.all(ws);
  }

  async function processItem(item, opt) {
    opt = opt || {};
    item.loading = true; renderGrid();
    try {
      if (item.kind === 'link') {
        var m = await M.fetchMeta(item.url);
        if (m.titleFromUrl && item.hintTitle) { m.title = item.hintTitle; m.titleFromUrl = false; }
        if (item.userTitle) { delete m.title; delete m.titleFromUrl; }
        if (item.image && !m.image) delete m.image;
        Object.assign(item, m);
      }
      var r = C.rules(state, item);
      item.category = r.category;
      item.tags = r.tags;
      item.ai = false;
      var useAI = aiOn() && (state.settings.aiMode === 'always' || opt.forceAI || r.confidence < 6 || item.kind === 'imagem' || !!item.printId);
      if (useAI) {
        try {
          var blob = await getBlob(item.imageId || item.printId);
          var out = await C.ai(state, item, blob);
          if (out.category) item.category = out.category;
          if (out.tags && out.tags.length) item.tags = out.tags;
          if (out.title && (item.titleFromUrl || item.kind === 'imagem') && !item.userTitle) { item.title = out.title; item.titleFromUrl = false; }
          if (out.summary && !item.description) item.description = out.summary;
          item.ai = true;
          save();
        } catch (e) { aiError(e); }
      }
      // o que você corrigiu antes vale mais que tudo
      var h = item.url ? M.host(item.url) : '';
      if (h && !M.isGenericHost(h) && state.learned[h] && state.categories.some(function (c) { return c.id === state.learned[h]; })) item.category = state.learned[h];
      if (opt.isNew && catById(item.category).status && !item.status) item.status = 'fila';
    } catch (e) { console.warn('[Stash]', e); }
    item.loading = false; item.updated = Date.now();
    save(); render();
  }

  function aiError(e) {
    console.warn('[Stash] Gemini:', e);
    if (aiWarned++) return;
    if (e.status === 429) toast('Limite grátis do Gemini atingido por agora. Usei as regras locais.');
    else if (e.status === 400 || e.status === 401 || e.status === 403) toast('O Gemini recusou a chave. Confira em Configurações.');
    else toast('Gemini indisponível agora. Usei as regras locais.');
  }

  /* ---------- diálogo genérico ---------- */
  function openDialog(html, onReady) {
    var d = $('#dlg');
    d.innerHTML = html;
    if (!d.open) d.showModal();
    d.scrollTop = 0;
    if (onReady) onReady(d);
    return d;
  }
  function closeDialog() { var d = $('#dlg'); if (d.open) d.close(); }
  function head(icon, title, color) {
    return '<div class="sheet-head"><h3' + (color ? ' style="color:' + esc(color) + '"' : '') + '>' + I(icon, 18) + '<span style="color:rgb(var(--text-primary));overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(title) + '</span></h3>' +
      '<button type="button" class="btn-ghost btn-icon btn-sm" data-close aria-label="Fechar">' + I('x', 16) + '</button></div>';
  }

  /* ---------- adicionar (celular / botão +) ---------- */
  function openAdd() {
    var picked = [];
    openDialog(head('plus', 'Guardar no Stash') +
      '<div class="sheet-body">' +
      '<label class="field"><span>Links (um ou vários)</span><textarea class="input-field" id="aText" placeholder="Cole aqui links de sites, vídeos, posts…"></textarea></label>' +
      '<div class="btns"><button type="button" class="btn-ghost" id="aPaste">' + I('clipboard-paste', 16) + 'Colar</button>' +
      '<button type="button" class="btn-ghost" id="aImg">' + I('image-plus', 16) + 'Imagem / print</button></div>' +
      '<p class="note" id="aFiles">Dica: um link + um print juntos viram um item só, com o print como imagem. Ajuda muito em posts do Instagram e TikTok.</p>' +
      '</div>' +
      '<div class="sheet-foot"><span class="spacer"></span><button type="button" class="btn-primary" id="aGo">' + I('download', 16) + 'Guardar</button></div>',
      function (d) {
        $('#aPaste', d).onclick = async function () {
          try { var t = await navigator.clipboard.readText(); $('#aText', d).value = ($('#aText', d).value + '\n' + t).trim(); }
          catch (e) { toast('O navegador não liberou a área de transferência. Toque e segure no campo → Colar.'); }
        };
        $('#aImg', d).onclick = function () {
          var inp = $('#fileInput');
          inp.onchange = function () {
            picked = picked.concat(Array.prototype.slice.call(inp.files)); inp.value = '';
            $('#aFiles', d).innerHTML = I('image', 13) + ' ' + picked.length + (picked.length === 1 ? ' imagem selecionada' : ' imagens selecionadas');
          };
          inp.click();
        };
        $('#aGo', d).onclick = function () {
          var urls = M.extractUrls($('#aText', d).value);
          closeDialog();
          addStuff({ urls: urls, files: picked });
        };
        setTimeout(function () { $('#aText', d).focus(); }, 50);
      });
  }

  /* ---------- detalhes do item ---------- */
  function mediaHtml(it) {
    var yt = it.url && M.youtubeId(it.url);
    if (yt) return '<iframe class="preview-embed" src="https://www.youtube.com/embed/' + yt + '" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe>';
    if (it.url && M.isVideoFile(it.url)) return '<video class="preview-media" src="' + esc(it.url) + '" controls></video>';
    var src = thumbOf(it);
    return src ? '<img class="preview-media" src="' + esc(src) + '" alt="" onerror="this.remove()">' : '';
  }

  function openItem(id) {
    var item = state.items.find(function (x) { return x.id === id; });
    if (!item) return;
    var draft = JSON.parse(JSON.stringify(item));
    var cat = catById(draft.category);

    function statusBlock() {
      var c = catById(draft.category);
      if (!c.status) return '';
      var names = statusNames(c);
      var seg = S.STATUS_KEYS.map(function (k, ix) {
        return '<button type="button" data-st="' + k + '" class="' + (draft.status === k ? 'on' : '') + '" style="--s:' + S.STATUS_COLORS[k] + '">' + I(S.STATUS_ICONS[k], 13) + esc(names[ix]) + '</button>';
      }).join('');
      var stars = '';
      for (var n = 1; n <= 5; n++) stars += '<button type="button" data-star="' + n + '" class="' + (draft.rating >= n ? 'on' : '') + '" aria-label="' + n + ' estrela(s)">' + I('star', 20) + '</button>';
      return '<div class="field"><span>Status</span><div class="seg">' + seg + '</div></div>' +
        '<div class="field"><span>Sua nota</span><div class="stars">' + stars + '</div></div>';
    }
    function printBlock() {
      if (draft.kind !== 'link') return '';
      var src = imgSrc(draft.printId);
      return draft.printId
        ? '<div class="print-box">' + (src ? '<img src="' + esc(src) + '" alt="">' : '') + '<div class="grow"><b class="small">Print anexado</b><p class="note">Usado como imagem do card' + (aiOn() ? ' e lido pelo Gemini.' : '.') + '</p></div>' +
          '<button type="button" class="btn-ghost btn-sm" id="pSwap">Trocar</button><button type="button" class="btn-ghost btn-sm danger" id="pDel">' + I('trash-2', 14) + '</button></div>'
        : '<div class="print-box"><span class="muted">' + I('camera', 22) + '</span><div class="grow"><b class="small">Anexar print</b><p class="note">Para posts que não mostram prévia (Instagram, TikTok…).' + (aiOn() ? ' O Gemini lê o print e classifica melhor.' : '') + '</p></div>' +
          '<button type="button" class="btn-ghost btn-sm" id="pAdd">' + I('paperclip', 14) + 'Anexar</button></div>';
    }

    var html = head(cat.icon, draft.kind === 'link' ? (draft.publisher || 'Link') : 'Imagem', cat.color) +
      '<div class="sheet-body">' +
      '<div id="mediaBox">' + mediaHtml(draft) + '</div>' +
      (draft.url ? '<a class="link-out" href="' + esc(draft.url) + '" target="_blank" rel="noopener">' + I('external-link', 14) + '<span>' + esc(draft.url) + '</span></a>' : '') +
      (draft.description ? '<p class="secondary small">' + esc(draft.description) + '</p>' : '') +
      '<label class="field"><span>Título</span><input class="input-field" id="fTitle" value="' + esc(draft.title) + '"></label>' +
      '<label class="field"><span>Categoria</span><select class="input-field" id="fCat">' +
      state.categories.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === draft.category ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></label>' +
      (draft.url && !M.isGenericHost(M.host(draft.url)) ? '<label class="check" id="learnRow" hidden><input type="checkbox" id="fLearn" checked><span>Lembrar: próximos links de <b>' + esc(M.host(draft.url)) + '</b> vão para esta categoria</span></label>' : '') +
      '<div id="statusBox" style="display:flex;flex-direction:column;gap:.875rem">' + statusBlock() + '</div>' +
      '<label class="field"><span>Tags (separadas por vírgula)</span><input class="input-field" id="fTags" value="' + esc((draft.tags || []).join(', ')) + '"></label>' +
      '<label class="field"><span>Notas</span><textarea class="input-field" id="fNotes" placeholder="Por que guardei isso? Ideias, onde usar…">' + esc(draft.notes) + '</textarea></label>' +
      '<div id="printBox">' + printBlock() + '</div>' +
      '<p class="note">Guardado em ' + new Date(draft.created).toLocaleString('pt-BR') + (draft.ai ? ' · classificado pelo Gemini' : ' · classificado pelas regras') + '</p>' +
      '</div>' +
      '<div class="sheet-foot">' +
      '<button type="button" class="btn-primary" id="fSave">' + I('check', 16) + 'Salvar</button>' +
      '<button type="button" class="btn-ghost btn-icon" id="fFav" title="Favorito">' + I('star', 16) + '</button>' +
      '<button type="button" class="btn-ghost btn-icon" id="fRe" title="Reanalisar">' + I('refresh-cw', 16) + '</button>' +
      '<span class="spacer"></span>' +
      '<button type="button" class="btn-ghost btn-icon danger" id="fDel" title="Excluir">' + I('trash-2', 16) + '</button>' +
      '</div>';

    openDialog(html, function (d) {
      function favUi() { var b = $('#fFav', d); b.classList.toggle('active', !!draft.fav); b.style.color = draft.fav ? '#f59e0b' : ''; b.querySelector('svg').style.fill = draft.fav ? '#fbbf24' : 'none'; }
      function bindStatus() {
        $$('[data-st]', d).forEach(function (b) {
          b.onclick = function () { draft.status = draft.status === b.dataset.st ? null : b.dataset.st; $('#statusBox', d).innerHTML = statusBlock(); bindStatus(); };
        });
        $$('[data-star]', d).forEach(function (b) {
          b.onclick = function () { var n = +b.dataset.star; draft.rating = draft.rating === n ? 0 : n; $('#statusBox', d).innerHTML = statusBlock(); bindStatus(); };
        });
      }
      function bindPrint() {
        var pick = function () {
          var inp = $('#printInput');
          inp.onchange = async function () {
            var f = inp.files[0]; inp.value = '';
            if (!f) return;
            try { draft.printId = await saveImage(f); draft._newPrint = true; } catch (e) { toast('Não consegui guardar a imagem.'); return; }
            $('#printBox', d).innerHTML = printBlock(); bindPrint();
            $('#mediaBox', d).innerHTML = mediaHtml(draft);
            if (aiOn()) toast('Print anexado. Toque em Salvar: o Gemini vai reanalisar com ele.');
          };
          inp.click();
        };
        if ($('#pAdd', d)) $('#pAdd', d).onclick = pick;
        if ($('#pSwap', d)) $('#pSwap', d).onclick = pick;
        if ($('#pDel', d)) $('#pDel', d).onclick = function () { draft.printId = ''; $('#printBox', d).innerHTML = printBlock(); bindPrint(); $('#mediaBox', d).innerHTML = mediaHtml(draft); };
      }
      favUi(); bindStatus(); bindPrint();
      $('#fFav', d).onclick = function () { draft.fav = !draft.fav; favUi(); };
      $('#fCat', d).onchange = function () {
        draft.category = this.value;
        if ($('#learnRow', d)) $('#learnRow', d).hidden = draft.category === item.category;
        if (catById(draft.category).status && !draft.status) draft.status = 'fila';
        $('#statusBox', d).innerHTML = statusBlock(); bindStatus();
      };

      function commit() {
        var oldPrint = item.printId;
        var title = $('#fTitle', d).value.trim();
        if (title && title !== item.title) { draft.title = title; draft.userTitle = true; draft.titleFromUrl = false; }
        draft.tags = uniq($('#fTags', d).value.split(',').map(function (s) { return s.trim().toLowerCase().replace(/^#/, ''); }));
        draft.notes = $('#fNotes', d).value;
        if (draft.url && draft.category !== item.category && $('#fLearn', d) && $('#fLearn', d).checked) state.learned[M.host(draft.url)] = draft.category;
        var newPrint = !!draft._newPrint; delete draft._newPrint;
        if (oldPrint && oldPrint !== draft.printId) S.idb.delImage(oldPrint).catch(function () {});
        draft.updated = Date.now();
        Object.assign(item, draft);
        save(); render();
        return newPrint;
      }
      $('#fSave', d).onclick = function () {
        var newPrint = commit();
        closeDialog();
        if (newPrint && aiOn()) processItem(item, { forceAI: true });
        else toast('Salvo');
      };
      $('#fRe', d).onclick = function () {
        commit(); closeDialog(); aiWarned = 0;
        processItem(item, { forceAI: true }).then(function () { toast('Reanalisado: ' + catById(item.category).name); });
      };
      $('#fDel', d).onclick = function () {
        if (!confirm('Excluir "' + item.title + '"?')) return;
        [item.imageId, item.printId, draft.printId].forEach(function (x) { if (x) S.idb.delImage(x).catch(function () {}); });
        state.items = state.items.filter(function (x) { return x.id !== item.id; });
        save(); render(); closeDialog(); toast('Excluído');
      };
    });
  }

  /* ---------- categorias ---------- */
  function openCat(id) {
    var c = id ? catById(id) : { id: '', name: '', icon: 'folder', color: '#60a5fa', status: null, domains: [], keywords: [] };
    var d0 = JSON.parse(JSON.stringify(c));
    function iconsHtml() {
      return S.ICON_CHOICES.map(function (n) { return '<button type="button" data-ic="' + n + '" class="' + (d0.icon === n ? 'on' : '') + '" title="' + n + '">' + I(n, 18) + '</button>'; }).join('');
    }
    function swatchHtml() {
      return S.COLOR_CHOICES.map(function (col) { return '<button type="button" data-col="' + col + '" class="' + (d0.color === col ? 'on' : '') + '" style="--c:' + col + '" aria-label="' + col + '"></button>'; }).join('') +
        '<input type="color" id="cColor" value="' + esc(d0.color) + '" title="Outra cor">';
    }
    var statusOpts = '<option value="">Sem status</option>' + Object.keys(S.STATUS_SETS).map(function (k) {
      return '<option value="' + k + '"' + (d0.status === k ? ' selected' : '') + '>' + esc(S.STATUS_SETS[k].rotulo) + ' (' + esc(S.STATUS_SETS[k].nomes.slice(0, 3).join(' → ')) + ')</option>';
    }).join('');

    openDialog(head(d0.icon, id ? 'Editar categoria' : 'Nova categoria', d0.color) +
      '<div class="sheet-body">' +
      '<label class="field"><span>Nome</span><input class="input-field" id="cName" value="' + esc(d0.name) + '" placeholder="Ex.: Viagens"></label>' +
      '<div class="field"><span>Ícone</span><div class="icon-grid" id="cIcons">' + iconsHtml() + '</div></div>' +
      '<div class="field"><span>Cor</span><div class="swatches" id="cSw">' + swatchHtml() + '</div></div>' +
      '<label class="field"><span>Acompanhar status</span><select class="input-field" id="cStatus">' + statusOpts + '</select></label>' +
      '<label class="field"><span>Sites que caem aqui (um por linha)</span><textarea class="input-field" id="cDom" placeholder="exemplo.com">' + esc((d0.domains || []).join('\n')) + '</textarea></label>' +
      '<label class="field"><span>Palavras-chave no título ou descrição (separadas por vírgula)</span><textarea class="input-field" id="cKw">' + esc((d0.keywords || []).join(', ')) + '</textarea></label>' +
      '<p class="note">O Gemini usa o nome da categoria para decidir. Sites e palavras-chave valem para as regras locais.</p>' +
      '</div>' +
      '<div class="sheet-foot"><button type="button" class="btn-primary" id="cSave">' + I('check', 16) + 'Salvar</button><span class="spacer"></span>' +
      (id && id !== 'outros' ? '<button type="button" class="btn-ghost danger" id="cDel">' + I('trash-2', 16) + 'Excluir</button>' : '') + '</div>',
      function (d) {
        function bind() {
          $$('[data-ic]', d).forEach(function (b) { b.onclick = function () { d0.icon = b.dataset.ic; $('#cIcons', d).innerHTML = iconsHtml(); bind(); }; });
          $$('[data-col]', d).forEach(function (b) { b.onclick = function () { d0.color = b.dataset.col; $('#cSw', d).innerHTML = swatchHtml(); bind(); }; });
          $('#cColor', d).oninput = function () { d0.color = this.value; };
        }
        bind();
        $('#cSave', d).onclick = function () {
          var name = $('#cName', d).value.trim();
          if (!name) { toast('Dê um nome para a categoria'); return; }
          var data = {
            name: name, icon: d0.icon, color: d0.color, status: $('#cStatus', d).value || null,
            domains: $('#cDom', d).value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean),
            keywords: $('#cKw', d).value.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
          };
          if (id) Object.assign(c, data);
          else {
            var nc = Object.assign({ id: 'c_' + uid() }, data);
            var outros = state.categories.findIndex(function (x) { return x.id === 'outros'; });
            state.categories.splice(outros === -1 ? state.categories.length : outros, 0, nc);
          }
          save(); render(); closeDialog(); toast('Categoria salva');
        };
        if ($('#cDel', d)) $('#cDel', d).onclick = function () {
          if (!confirm('Excluir a categoria "' + c.name + '"? Os itens dela vão para "Outros".')) return;
          state.items.forEach(function (i) { if (i.category === id) i.category = 'outros'; });
          state.categories = state.categories.filter(function (x) { return x.id !== id; });
          Object.keys(state.learned).forEach(function (k) { if (state.learned[k] === id) delete state.learned[k]; });
          if (view.cat === id) view.cat = 'all';
          save(); render(); closeDialog();
        };
      });
  }

  /* ---------- configurações ---------- */
  function openSettings() {
    var s = state.settings;
    var models = uniq([s.geminiModel].concat(s.geminiModels || []));
    var bm = "javascript:(function(){window.open('" + appUrl() + "?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'_blank')})()";
    openDialog(head('settings', 'Configurações') +
      '<div class="sheet-body">' +

      '<section class="settings-sec"><h4>' + I('sparkles', 16) + 'Inteligência artificial (Gemini, grátis)</h4>' +
      '<p class="note">Com o Gemini, o Stash entende o assunto do link e lê imagens e prints. Sem ele, organiza pelo site e por palavras-chave. ' +
      'Crie uma chave grátis em <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> (não pede cartão).</p>' +
      '<label class="field"><span>Chave da API do Gemini</span><div class="key-row"><input class="input-field" id="sKey" type="password" autocomplete="off" value="' + esc(s.geminiKey) + '" placeholder="AIza…">' +
      '<button type="button" class="btn-ghost btn-icon" id="sShow" title="Mostrar/ocultar">' + I('eye', 16) + '</button></div></label>' +
      '<div class="field-row"><label class="field"><span>Modelo</span><div class="key-row"><select class="input-field" id="sModel">' +
      (models.length ? models.map(function (m) { return '<option' + (m === s.geminiModel ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('') : '<option value="">Automático (melhor Flash)</option>') +
      '</select><button type="button" class="btn-ghost btn-icon" id="sList" title="Atualizar lista de modelos">' + I('refresh-cw', 16) + '</button></div></label>' +
      '<label class="field"><span>Quando usar</span><select class="input-field" id="sMode">' +
      '<option value="doubt"' + (s.aiMode === 'doubt' ? ' selected' : '') + '>Quando as regras ficam em dúvida + imagens</option>' +
      '<option value="always"' + (s.aiMode === 'always' ? ' selected' : '') + '>Sempre</option>' +
      '<option value="off"' + (s.aiMode === 'off' ? ' selected' : '') + '>Desligado</option></select></label></div>' +
      '<div class="btns"><button type="button" class="btn-primary btn-sm" id="sSaveAi">' + I('check', 14) + 'Salvar</button><button type="button" class="btn-ghost btn-sm" id="sTest">' + I('wand-sparkles', 14) + 'Testar</button></div>' +
      '<p class="note" id="sTestOut">A chave fica salva só neste navegador. No plano grátis, o Google pode usar o conteúdo enviado (títulos, links e prints) para melhorar os produtos dele.</p>' +
      '</section>' +

      '<section class="settings-sec"><h4>' + I('sun', 16) + 'Aparência</h4>' +
      '<div class="seg" id="sTheme">' +
      [['system', 'monitor', 'Sistema'], ['light', 'sun', 'Claro'], ['dark', 'moon', 'Escuro']].map(function (t) {
        return '<button type="button" data-theme="' + t[0] + '" class="' + (s.theme === t[0] ? 'on' : '') + '">' + I(t[1], 14) + t[2] + '</button>';
      }).join('') + '</div></section>' +

      '<section class="settings-sec"><h4>' + I('share-2', 16) + 'Guardar de qualquer lugar</h4>' +
      '<p class="note"><b>No computador:</b> arraste o botão abaixo para a barra de favoritos. Em qualquer página, clique nele para mandar a página para o Stash.</p>' +
      '<div><a class="bookmarklet" href="' + esc(bm) + '" onclick="event.preventDefault()">' + I('bookmark-plus', 16) + '+ Stash</a></div>' +
      '<p class="note"><b>No Android:</b> abra o Stash pelo Chrome em <a href="' + esc(S.PAGES_URL) + '" target="_blank" rel="noopener">' + esc(S.PAGES_URL.replace('https://', '')) + '</a>, toque em ⋮ → <i>Instalar app</i>. ' +
      'Depois, no Instagram, TikTok, YouTube ou na galeria, toque em <i>Compartilhar</i> → <b>Stash</b>.<br>' +
      '<b>No iPhone:</b> Compartilhar → <i>Adicionar à Tela de Início</i>. O iPhone não mostra apps web no menu Compartilhar; copie o link e use o botão <b>+</b> → Colar.</p>' +
      '</section>' +

      '<section class="settings-sec"><h4>' + I('hard-drive', 16) + 'Dados</h4>' +
      '<p class="note">Tudo fica salvo neste navegador, neste endereço. O Stash aberto pelo arquivo no PC e o do GitHub Pages guardam coisas separadas: use o backup para levar de um para o outro.</p>' +
      '<div class="btns"><button type="button" class="btn-ghost btn-sm" id="sExport">' + I('download', 14) + 'Exportar backup</button>' +
      '<button type="button" class="btn-ghost btn-sm" id="sImport">' + I('upload', 14) + 'Importar backup</button></div>' +
      '<div class="btns"><button type="button" class="btn-ghost btn-sm" id="sReclass">' + I('refresh-cw', 14) + 'Reclassificar tudo (regras)</button>' +
      '<button type="button" class="btn-ghost btn-sm" id="sForget">' + I('x', 14) + 'Esquecer correções (' + Object.keys(state.learned).length + ')</button>' +
      '<button type="button" class="btn-ghost btn-sm danger" id="sResetCats">Restaurar categorias padrão</button></div>' +
      '</section>' +
      '</div>',
      function (d) {
        $('#sShow', d).onclick = function () { var k = $('#sKey', d); k.type = k.type === 'password' ? 'text' : 'password'; };
        function readAi() {
          var key = $('#sKey', d).value.trim();
          if (key !== s.geminiKey) { s.geminiModel = ''; s.geminiModels = []; }
          s.geminiKey = key;
          var sel = $('#sModel', d).value; if (sel && key === s.geminiKey && s.geminiModels.length) s.geminiModel = sel;
          s.aiMode = $('#sMode', d).value;
        }
        $('#sList', d).onclick = async function () {
          var key = $('#sKey', d).value.trim();
          if (!key) { toast('Cole a chave primeiro'); return; }
          try {
            var list = await C.listModels(key);
            s.geminiKey = key; s.geminiModels = list;
            if (!s.geminiModel || list.indexOf(s.geminiModel) === -1) s.geminiModel = C.pickModel(list);
            save();
            $('#sModel', d).innerHTML = list.map(function (m) { return '<option' + (m === s.geminiModel ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('');
            toast(list.length + ' modelos encontrados');
          } catch (e) { toast('Não consegui listar: ' + e.message); }
        };
        $('#sSaveAi', d).onclick = function () { readAi(); save(); renderHeader(); toast(s.geminiKey ? 'Gemini configurado' : 'Gemini desligado'); };
        $('#sTest', d).onclick = async function () {
          readAi(); save();
          var out = $('#sTestOut', d);
          if (!s.geminiKey) { out.textContent = 'Cole a chave primeiro.'; return; }
          out.innerHTML = I('loader-circle', 13, 'spin') + ' Testando…';
          try {
            var r = await C.test(state); save();
            out.innerHTML = '✅ Funcionou! O modelo <b>' + esc(s.geminiModel) + '</b> classificou um link de teste como <b>' + esc(r.category ? catById(r.category).name : '?') + '</b>.';
            if ($('#sModel', d).value !== s.geminiModel) $('#sModel', d).innerHTML = uniq([s.geminiModel].concat(s.geminiModels)).map(function (m) { return '<option' + (m === s.geminiModel ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('');
            renderHeader();
          } catch (e) {
            out.innerHTML = '❌ ' + (e.status === 429 ? 'Limite grátis atingido por agora. Tente em alguns minutos.' : e.status === 400 || e.status === 403 ? 'Chave inválida ou sem permissão.' : 'Erro: ' + esc(e.message));
          }
        };
        $$('[data-theme]', d).forEach(function (b) {
          b.onclick = function () { s.theme = b.dataset.theme; save(); applyTheme(); $$('[data-theme]', d).forEach(function (x) { x.classList.toggle('on', x === b); }); };
        });
        $('#sExport', d).onclick = exportBackup;
        $('#sImport', d).onclick = function () { $('#importInput').click(); };
        $('#sReclass', d).onclick = function () {
          if (!confirm('Reclassificar todos os itens pelas regras locais? (Categorias escolhidas pelo Gemini ou por você podem mudar.)')) return;
          state.items.forEach(function (i) {
            var r = C.rules(state, i); i.category = r.category; i.ai = false;
            var h = i.url ? M.host(i.url) : ''; if (h && !M.isGenericHost(h) && state.learned[h]) i.category = state.learned[h];
          });
          save(); render(); toast('Tudo reclassificado');
        };
        $('#sForget', d).onclick = function () { state.learned = {}; save(); this.innerHTML = I('x', 14) + 'Esquecer correções (0)'; toast('Correções esquecidas'); };
        $('#sResetCats', d).onclick = function () {
          if (!confirm('Restaurar as categorias padrão? Categorias criadas por você serão removidas (os itens delas vão para "Outros").')) return;
          state.categories = JSON.parse(JSON.stringify(S.DEFAULT_CATEGORIES));
          state.items.forEach(function (i) { if (!state.categories.some(function (c) { return c.id === i.category; })) i.category = 'outros'; });
          view.cat = 'all'; save(); render(); closeDialog();
        };
      });
  }

  /* ---------- backup ---------- */
  function blobToDataUrl(b) { return new Promise(function (r) { var fr = new FileReader(); fr.onload = function () { r(fr.result); }; fr.onerror = function () { r(null); }; fr.readAsDataURL(b); }); }
  async function exportBackup() {
    toast('Preparando backup…');
    var images = {};
    var ids = uniq([].concat.apply([], state.items.map(function (i) { return [i.imageId, i.printId]; })));
    for (var k = 0; k < ids.length; k++) { var b = await getBlob(ids[k]); if (b) images[ids[k]] = await blobToDataUrl(b); }
    var data = { app: 'stash', version: 1, exported: new Date().toISOString(), state: JSON.parse(JSON.stringify(state, function (k2, v) { return k2 === 'loading' ? undefined : v; })), images: images };
    data.state.settings = Object.assign({}, data.state.settings, { geminiKey: '' }); // a chave não vai no arquivo
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    a.download = 'stash-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    toast('Backup exportado');
  }
  async function importBackup(file) {
    try {
      var data = JSON.parse(await file.text());
      var src = data.state || data; // aceita também o backup do primeiro protótipo ("Cérebro Digital")
      if (!Array.isArray(src.items)) throw new Error('formato');
      var known = {}; state.items.forEach(function (i) { if (i.url) known[i.url] = 1; known[i.id] = 1; });
      (src.categories || []).forEach(function (c) {
        if (state.categories.some(function (x) { return x.id === c.id; })) return;
        if (!/^[a-z0-9-]+$/.test(c.icon || '')) c.icon = 'folder';
        var o = state.categories.findIndex(function (x) { return x.id === 'outros'; });
        state.categories.splice(o === -1 ? state.categories.length : o, 0, c);
      });
      var n = 0;
      for (var k = 0; k < src.items.length; k++) {
        var it = src.items[k];
        if ((it.url && known[it.url]) || known[it.id]) continue;
        it = newItem(Object.assign({}, it, { loading: false }));
        if (!it.kind) it.kind = it.url ? 'link' : 'imagem';
        state.items.push(it); n++;
      }
      var imgs = data.images || {};
      for (var id in imgs) {
        try { var blob = await (await fetch(imgs[id])).blob(); await S.idb.putImage(id, blob); imgUrls[id] = URL.createObjectURL(blob); } catch (e) {}
      }
      Object.assign(state.learned, src.learned || {});
      save(); render(); closeDialog();
      toast(n + ' itens importados');
    } catch (e) { toast('Arquivo de backup inválido'); }
  }

  /* ---------- o que chega de fora (favorito "+ Stash", Compartilhar do celular) ---------- */
  async function handleIncoming() {
    var p = new URLSearchParams(location.search);
    var touched = false;
    if (p.has('url') || p.has('text')) {
      touched = true;
      var urls = M.extractUrls((p.get('url') || '') + ' ' + (p.get('text') || ''));
      if (urls.length) addStuff({ urls: urls, title: p.get('title') || '' });
      else toast('Nada para guardar nesse compartilhamento.');
    }
    if (p.has('shared')) {
      touched = true;
      try {
        var entries = await S.idb.takeInbox();
        for (var k = 0; k < entries.length; k++) {
          var e = entries[k];
          var u = M.extractUrls((e.url || '') + ' ' + (e.text || ''));
          var t = e.title && !/^(instagram|tiktok|youtube|x|threads|pinterest)$/i.test(e.title) ? e.title : '';
          await addStuff({ urls: u, files: e.files || [], title: t });
        }
      } catch (err) { toast('Não consegui ler o compartilhamento.'); }
    }
    if (touched && history.replaceState) history.replaceState(null, '', location.pathname);
  }

  /* ---------- eventos ---------- */
  function bind() {
    $('#addBtn').onclick = function () {
      var v = $('#addInput').value; $('#addInput').value = '';
      addStuff({ urls: M.extractUrls(v) });
    };
    $('#addInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('#addBtn').click(); });
    $('#addImageBtn').onclick = function () {
      var inp = $('#fileInput');
      inp.onchange = function () {
        var files = Array.prototype.slice.call(inp.files); inp.value = '';
        var urls = M.extractUrls($('#addInput').value); $('#addInput').value = '';
        addStuff({ urls: urls, files: files });
      };
      inp.click();
    };
    $('#fab').onclick = openAdd;
    $('#themeBtn').onclick = cycleTheme;
    $('#settingsBtn').onclick = openSettings;
    $('#importInput').onchange = function () { var f = this.files[0]; this.value = ''; if (f) importBackup(f); };
    $('#search').oninput = function () { view.q = this.value; renderGrid(); };
    $('#sort').onchange = function () { view.sort = this.value; renderGrid(); };

    document.addEventListener('click', function (e) {
      var t = e.target;
      var nav = t.closest('[data-cat]');
      if (nav) { view.cat = nav.dataset.cat; view.status = 'all'; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      if (t.closest('#addCatBtn, #addCatChip')) { openCat(null); return; }
      var st = t.closest('[data-status]');
      if (st) { view.status = st.dataset.status; renderGrid(); return; }
      var card = t.closest('.item-card');
      if (card) { openItem(card.dataset.id); return; }
      if (t.closest('[data-open-settings]')) { e.preventDefault(); openSettings(); return; }
      if (t.closest('[data-close]')) { closeDialog(); return; }
      if (t.id === 'dlg') closeDialog(); // clique fora do diálogo
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('item-card')) openItem(e.target.dataset.id);
    });
    // editar categoria: botão direito no PC, segurar no celular
    document.addEventListener('contextmenu', function (e) {
      var nav = e.target.closest('[data-cat]');
      if (nav && nav.dataset.cat !== 'all' && nav.dataset.cat !== 'fav') { e.preventDefault(); openCat(nav.dataset.cat); }
    });
    var holdTimer = null;
    document.addEventListener('touchstart', function (e) {
      var nav = e.target.closest && e.target.closest('[data-cat]');
      if (!nav || nav.dataset.cat === 'all' || nav.dataset.cat === 'fav') return;
      holdTimer = setTimeout(function () { holdTimer = null; openCat(nav.dataset.cat); }, 550);
    }, { passive: true });
    ['touchend', 'touchmove', 'touchcancel'].forEach(function (ev) { document.addEventListener(ev, function () { clearTimeout(holdTimer); }, { passive: true }); });

    // colar em qualquer lugar (links ou imagens)
    document.addEventListener('paste', function (e) {
      if (e.target.closest && e.target.closest('input, textarea, dialog')) return;
      var cd = e.clipboardData; if (!cd) return;
      var files = Array.prototype.slice.call(cd.files || []).filter(function (f) { return /^image\//.test(f.type); });
      var urls = M.extractUrls(cd.getData('text'));
      if (files.length || urls.length) { e.preventDefault(); addStuff({ urls: urls, files: files }); }
    });
    // arrastar e soltar
    var depth = 0, veil = $('#dropVeil');
    document.addEventListener('dragenter', function (e) { if ($('#dlg').open) return; e.preventDefault(); depth++; veil.classList.add('on'); });
    document.addEventListener('dragover', function (e) { e.preventDefault(); });
    document.addEventListener('dragleave', function () { depth = Math.max(0, depth - 1); if (!depth) veil.classList.remove('on'); });
    document.addEventListener('drop', function (e) {
      e.preventDefault(); depth = 0; veil.classList.remove('on');
      if ($('#dlg').open) return;
      var dt = e.dataTransfer;
      var files = Array.prototype.slice.call(dt.files || []).filter(function (f) { return /^image\//.test(f.type); });
      var urls = files.length ? [] : M.extractUrls(dt.getData('text/uri-list') || dt.getData('text/plain'));
      addStuff({ urls: urls, files: files });
    });

    if (mq.addEventListener) mq.addEventListener('change', function () { if (state.settings.theme === 'system') applyTheme(); });
    // outra aba mudou os dados → recarrega
    window.addEventListener('storage', function (e) { if (e.key === 'stash.v1') { state = S.store.load(); render(); } });
  }

  function registerSW() {
    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('[Stash] SW', e); });
    }
  }

  /* ---------- início ---------- */
  shell();
  bind();
  render();
  registerSW();
  handleIncoming();
  window.StashApp = { state: function () { return state; }, addStuff: addStuff }; // para depuração no console
})();
