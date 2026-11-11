/* =========================================================================
   STASH — sincronização com o Google Drive
   - Usa a "pasta do app" (appDataFolder): oculta, o Stash só enxerga ela.
   - stash.json guarda itens, categorias, correções e exclusões.
   - Cada imagem/print vira um arquivo "img-<id>", enviado uma vez só.
   - Junção: em cada item vale a edição mais recente; exclusões ficam
     registradas para o item não "voltar" de outro aparelho.
   - Login: Google Identity Services (token de ~1 h, guardado neste navegador).
   ========================================================================= */
window.Stash = window.Stash || {};

Stash.cloud = (function () {
  var SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  var API = 'https://www.googleapis.com/drive/v3/';
  var UP = 'https://www.googleapis.com/upload/drive/v3/';
  var TK = 'stash.drive.token';
  var app = null, token = null, status = 'off', lastError = '';
  var timer = null, running = null, again = false, lastAuto = 0, pending = 0;

  /* ---------- token ---------- */
  function loadToken() {
    try { var t = JSON.parse(localStorage.getItem(TK)); if (t && t.exp > Date.now() + 60000) token = t; } catch (e) {}
  }
  function hasToken() { return !!(token && token.exp > Date.now() + 60000); }
  function clientId() { return (app.state().settings.driveClientId || Stash.DRIVE_CLIENT_ID || '').trim(); }
  function enabled() { return !!(app.state().settings.driveConnected && clientId()); }
  function available() { return /^https?:/.test(location.protocol); }
  function setStatus(s, err) { status = s; lastError = err || ''; app.onStatus(); }

  var gisPromise = null;
  function loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (gisPromise) return gisPromise;
    gisPromise = new Promise(function (resolve, reject) {
      var sc = document.createElement('script');
      sc.src = 'https://accounts.google.com/gsi/client';
      sc.async = true;
      sc.onload = function () { resolve(); };
      sc.onerror = function () { gisPromise = null; reject(new Error('Não consegui carregar o login do Google (sem internet?)')); };
      document.head.appendChild(sc);
    });
    return gisPromise;
  }

  /* No app da Tela de Início do iPhone/iPad a janela de login não volta para o app.
     Lá o login é feito indo para a página do Google e voltando (redirecionamento). */
  function isIosApp() {
    var standalone = window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return standalone && ios;
  }
  function redirectUri() { return location.origin + location.pathname.replace(/index\.html$/, ''); }
  function signInRedirect(connecting) {
    var st = Math.random().toString(36).slice(2) + Date.now().toString(36);
    try {
      localStorage.setItem('stash.oauth.state', st);
      if (connecting) localStorage.setItem('stash.oauth.connect', '1');
    } catch (e) {}
    var q = {
      client_id: clientId(), redirect_uri: redirectUri(), response_type: 'token',
      scope: SCOPE, include_granted_scopes: 'true', state: st
    };
    location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + Object.keys(q).map(function (k) { return k + '=' + encodeURIComponent(q[k]); }).join('&');
    return new Promise(function () {}); // a página vai sair daqui
  }
  // Volta do login por redirecionamento: o token vem no "#" do endereço
  function takeRedirect() {
    if (!/[#&]access_token=/.test(location.hash) && !/[#&]error=/.test(location.hash)) return null;
    var h = new URLSearchParams(location.hash.slice(1));
    var expected = null;
    try { expected = localStorage.getItem('stash.oauth.state'); localStorage.removeItem('stash.oauth.state'); } catch (e) {}
    var connecting = false;
    try { connecting = localStorage.getItem('stash.oauth.connect') === '1'; localStorage.removeItem('stash.oauth.connect'); } catch (e) {}
    if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
    if (h.get('error')) return { error: h.get('error') === 'access_denied' ? 'Login cancelado' : 'Login falhou: ' + h.get('error') };
    if (!expected || h.get('state') !== expected) return { error: 'Login inválido, tente de novo' };
    token = { access: h.get('access_token'), exp: Date.now() + (Number(h.get('expires_in')) || 3600) * 1000 };
    try { localStorage.setItem(TK, JSON.stringify(token)); } catch (e) {}
    return { ok: true, connecting: connecting };
  }

  // Precisa ser chamado direto de um clique (senão o navegador bloqueia a janela de login)
  function signIn(connecting) {
    if (clientId() && isIosApp()) return signInRedirect(connecting);
    return new Promise(function (resolve, reject) {
      if (!clientId()) return reject(new Error('Falta o ID do cliente OAuth'));
      if (!(window.google && google.accounts && google.accounts.oauth2)) {
        return loadGis().then(function () { reject(new Error('Login carregado. Toque de novo para entrar.')); }, reject);
      }
      var client = google.accounts.oauth2.initTokenClient({
        client_id: clientId(),
        scope: SCOPE,
        callback: function (r) {
          if (r.error) return reject(new Error(r.error_description || r.error));
          token = { access: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 };
          try { localStorage.setItem(TK, JSON.stringify(token)); } catch (e) {}
          resolve();
        },
        error_callback: function (e) {
          reject(new Error(e && e.type === 'popup_closed' ? 'Login cancelado' : e && e.type === 'popup_failed_to_open' ? 'O navegador bloqueou a janela de login' : (e && (e.message || e.type)) || 'Falha no login'));
        }
      });
      client.requestAccessToken({ prompt: '' });
    });
  }

  function signOut() {
    if (token && window.google && google.accounts && google.accounts.oauth2) {
      try { google.accounts.oauth2.revoke(token.access, function () {}); } catch (e) {}
    }
    token = null;
    try { localStorage.removeItem(TK); } catch (e) {}
  }

  /* ---------- Drive ---------- */
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  // Falha de rede (no Safari: "Load failed"): tenta de novo algumas vezes antes de desistir
  async function api(url, opt) {
    opt = opt || {};
    opt.headers = Object.assign({ Authorization: 'Bearer ' + token.access }, opt.headers || {});
    var r, delays = [1500, 4000];
    for (var attempt = 0; ; attempt++) {
      try { r = await fetch(url, opt); break; }
      catch (e) {
        if (attempt >= delays.length || document.hidden) {
          var n = new Error('sem conexão com o Google Drive'); n.network = true; n.detail = e && e.message; throw n;
        }
        await wait(delays[attempt]);
      }
    }
    if (r.status === 401) {
      token = null; try { localStorage.removeItem(TK); } catch (e) {}
      var a = new Error('Login expirou'); a.auth = true; throw a;
    }
    if (!r.ok) {
      var t = ''; try { t = await r.text(); } catch (e) {}
      var m = t; try { m = JSON.parse(t).error.message; } catch (e) {}
      throw new Error('Drive ' + r.status + (m ? ': ' + String(m).slice(0, 160) : ''));
    }
    return r;
  }
  async function findFile(name) {
    var q = encodeURIComponent("name='" + name + "' and trashed=false");
    var r = await api(API + 'files?spaces=appDataFolder&q=' + q + '&fields=files(id,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=5');
    var j = await r.json();
    return (j.files || [])[0] || null;
  }
  async function upload(name, blob, fileId) {
    var type = blob.type || 'application/octet-stream';
    var buf;
    try { buf = await Stash.toBuffer(blob); }      // lê os bytes antes de enviar (evita o bug do Safari)
    catch (e) { var u = new Error('arquivo ilegível neste aparelho'); u.unreadable = true; throw u; }
    blob = new Blob([buf], { type: type });
    if (fileId) {
      var r = await api(UP + 'files/' + fileId + '?uploadType=media&fields=id', {
        method: 'PATCH', headers: { 'Content-Type': type }, body: buf
      });
      return (await r.json()).id;
    }
    var fd = new FormData();
    fd.append('metadata', new Blob([JSON.stringify({ name: name, parents: ['appDataFolder'] })], { type: 'application/json' }));
    fd.append('file', blob);
    var r2 = await api(UP + 'files?uploadType=multipart&fields=id', { method: 'POST', body: fd });
    return (await r2.json()).id;
  }

  /* ---------- junção ---------- */
  function snapshot(st) {
    return {
      app: 'stash', version: 1, savedAt: Date.now(),
      items: st.items.map(function (i) { var c = Object.assign({}, i); delete c.loading; return c; }),
      categories: st.categories, catsUpdated: st.catsUpdated || 0,
      learned: st.learned, learnedUpdated: st.learnedUpdated || 0,
      deleted: st.deleted || {}, cloudImages: st.cloudImages || {}
    };
  }

  function merge(local, remote) {
    var out = {
      items: local.items, categories: local.categories, catsUpdated: local.catsUpdated || 0,
      learned: local.learned, learnedUpdated: local.learnedUpdated || 0,
      deleted: Object.assign({}, local.deleted || {}), cloudImages: Object.assign({}, local.cloudImages || {})
    };
    if (!remote || !Array.isArray(remote.items)) return out;

    Object.keys(remote.deleted || {}).forEach(function (k) { out.deleted[k] = Math.max(out.deleted[k] || 0, remote.deleted[k]); });
    out.cloudImages = Object.assign({}, remote.cloudImages || {}, out.cloudImages);

    var map = {};
    remote.items.forEach(function (i) { map[i.id] = i; });
    local.items.forEach(function (i) {
      var r = map[i.id];
      if (!r || i.loading || (i.updated || 0) >= (r.updated || 0)) map[i.id] = i;
    });
    var items = Object.keys(map).map(function (k) { return map[k]; })
      .filter(function (i) { return !(out.deleted[i.id] && out.deleted[i.id] >= (i.updated || 0)); });
    // o mesmo link guardado em dois aparelhos: fica o mais recente
    var byUrl = {};
    items.sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
    items = items.filter(function (i) { if (!i.url) return true; if (byUrl[i.url]) return false; byUrl[i.url] = 1; return true; });
    items.sort(function (a, b) { return (b.created || 0) - (a.created || 0); });
    items.forEach(function (i) { i.loading = !!i.loading; });
    out.items = items;

    if ((remote.catsUpdated || 0) > out.catsUpdated && Array.isArray(remote.categories) && remote.categories.length) {
      out.categories = remote.categories; out.catsUpdated = remote.catsUpdated;
    }
    if ((remote.learnedUpdated || 0) > out.learnedUpdated && remote.learned) {
      out.learned = remote.learned; out.learnedUpdated = remote.learnedUpdated;
    }
    return out;
  }

  /* ---------- sincronizar ---------- */
  function sync() {
    if (!enabled() || !available()) { setStatus('off'); return Promise.resolve(); }
    if (!hasToken()) { setStatus('login'); return Promise.resolve(); }
    if (running) { again = true; return running; }
    clearTimeout(timer);
    running = (async function () {
      setStatus('syncing');
      var step = 'buscar os dados da nuvem';
      try {
        var f = await findFile('stash.json');
        var remote = null;
        if (f) { step = 'baixar os dados da nuvem'; var r = await api(API + 'files/' + f.id + '?alt=media'); remote = await r.json(); }
        app.apply(merge(app.state(), remote));

        // envia imagens que ainda não estão na nuvem: uma imagem com problema não trava o resto
        step = 'enviar imagens';
        var st = app.state();
        st.cloudImages = st.cloudImages || {};
        var ids = [];
        st.items.forEach(function (i) { [i.imageId, i.printId].forEach(function (x) { if (x && ids.indexOf(x) === -1) ids.push(x); }); });
        pending = 0;
        for (var k = 0; k < ids.length; k++) {
          if (st.cloudImages[ids[k]]) continue;
          try {
            var blob = await Stash.idb.getImage(ids[k]);
            if (!blob) continue;                        // imagem de outro aparelho que ainda não chegou aqui
            st.cloudImages[ids[k]] = await upload('img-' + ids[k], blob);
            if (blob.size) Stash.idb.putImage(ids[k], blob).catch(function () {}); // regrava no formato novo
          } catch (e) {
            if (e.auth) throw e;
            if (e.network && document.hidden) throw e;
            console.warn('[Stash] imagem não enviada:', ids[k], e);
            pending++;
          }
        }

        step = 'enviar os dados';
        await upload('stash.json', new Blob([JSON.stringify(snapshot(st))], { type: 'application/json' }), f && f.id);
        st.lastSync = Date.now();
        app.saveLocal();
        setStatus('ok');
        if (pending) schedule(60000);                   // tenta as imagens pendentes de novo daqui a pouco
      } catch (e) {
        console.warn('[Stash] Drive (' + step + '):', e);
        if (e.auth) setStatus('login');
        else if (e.network) {
          // o iOS corta a conexão quando o app vai para segundo plano: tenta de novo sozinho
          setStatus('error', 'sem conexão ao ' + step + '. Tento de novo sozinho');
          schedule(document.hidden ? 5000 : 20000);
        } else setStatus('error', e.message + ' (ao ' + step + ')');
      }
      running = null;
      if (again) { again = false; schedule(1500); }
    })();
    return running;
  }

  function schedule(ms) {
    if (!enabled() || !hasToken() || !available()) return;
    clearTimeout(timer);
    timer = setTimeout(sync, ms == null ? 4000 : ms);
  }

  // imagem que veio de outro aparelho e ainda não está neste
  async function fetchImage(id) {
    var st = app.state();
    var fid = st.cloudImages && st.cloudImages[id];
    if (!fid || !hasToken()) return null;
    try {
      var r = await api(API + 'files/' + fid + '?alt=media');
      var blob = await r.blob();
      await Stash.idb.putImage(id, blob);
      return blob;
    } catch (e) { return null; }
  }
  function deleteImage(id) {
    var st = app.state();
    var fid = st.cloudImages && st.cloudImages[id];
    if (!fid) return;
    delete st.cloudImages[id];
    if (hasToken()) api(API + 'files/' + fid, { method: 'DELETE' }).catch(function () {});
  }

  function init(hooks) {
    app = hooks;
    loadToken();
    var back = takeRedirect();
    if (back && back.error) setTimeout(function () { app.toast(back.error); }, 300);
    if (back && back.ok && back.connecting) {
      var st = app.state().settings;
      if (!st.driveClientId) st.driveClientId = clientId();
      st.driveConnected = true;
      app.saveLocal();
      setTimeout(function () { app.toast('Google Drive conectado'); }, 300);
    }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible' || !enabled()) return;
      if (Date.now() - lastAuto < 15000 && status !== 'error') return;
      lastAuto = Date.now();
      if (hasToken()) sync(); else setStatus('login');
    });
    if (!enabled() || !available()) { status = 'off'; return; }
    if (!isIosApp()) loadGis().catch(function () {});
    if (hasToken()) sync(); else setStatus('login');
  }

  return {
    init: init, sync: sync, isIosApp: isIosApp, schedule: schedule, signIn: signIn, signOut: signOut, loadGis: loadGis,
    fetchImage: fetchImage, deleteImage: deleteImage, merge: merge,
    enabled: enabled, available: available, hasToken: hasToken,
    status: function () { return status; }, error: function () { return lastError; }, pending: function () { return pending; }
  };
})();
