/* =========================================================================
   STASH — classificação
   1) Regras locais: site (domínio) + palavras-chave + o que você já corrigiu.
   2) Gemini (opcional, chave gratuita do Google AI Studio): entende o
      conteúdo do link e também lê imagens/prints.
   ========================================================================= */
window.Stash = window.Stash || {};

Stash.classify = (function () {
  var M = Stash.meta;

  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function rules(state, item) {
    var url = (item.url || '').toLowerCase();
    var h = item.url ? M.host(item.url) : '';
    var text = [item.title, item.description, item.author, item.notes].join(' ').toLowerCase();
    var scores = {};
    if (h && !M.isGenericHost(h) && state.learned[h]) scores[state.learned[h]] = 15;

    state.categories.forEach(function (c) {
      var s = scores[c.id] || 0;
      (c.domains || []).forEach(function (d) {
        d = String(d).toLowerCase().trim();
        if (d && (h.indexOf(d) !== -1 || url.indexOf(d) !== -1)) s += 10;
      });
      (c.keywords || []).forEach(function (k) {
        k = String(k).toLowerCase().trim();
        if (!k) return;
        var re = new RegExp('(^|[^\\p{L}\\p{N}])' + escRe(k) + '($|[^\\p{L}\\p{N}])', 'iu');
        if (re.test(text)) s += 3;
        else if (url.indexOf(k.replace(/\s+/g, '-')) !== -1) s += 1;
      });
      if (s) scores[c.id] = s;
    });

    // IMDb, TMDB e streamings: série ou filme?
    if (/imdb\.com|justwatch\.com|netflix\.com|primevideo|disneyplus|max\.com|hbomax|globoplay|apple\.com\/.*tv/.test(h + url)) {
      if (/tv series|tv mini series|série|season|temporada|\/tv\//i.test(text + ' ' + url)) bump('series', 12);
      else bump('filmes', 8);
    }
    function bump(id, n) { if (has(id)) scores[id] = (scores[id] || 0) + n; }

    // "Vídeos" é genérico: perde para um assunto específico (ex.: vídeo sobre impressão 3D → Modelos 3D)
    if (scores.videos) {
      var best = Object.keys(scores).filter(function (k) { return k !== 'videos'; })
        .sort(function (a, b) { return scores[b] - scores[a]; })[0];
      if (best && scores[best] >= 3) scores.videos = Math.min(scores.videos, scores[best] - 1);
    }

    var ranked = Object.keys(scores).filter(has).sort(function (a, b) { return scores[b] - scores[a]; });
    function has(id) { return state.categories.some(function (c) { return c.id === id; }); }
    var fallback = item.kind === 'imagem' && has('inspiracao') ? 'inspiracao' : (has('outros') ? 'outros' : state.categories[0].id);
    return { category: ranked[0] || fallback, confidence: ranked.length ? scores[ranked[0]] : 0, tags: autoTags(state, item) };
  }

  function autoTags(state, item) {
    var tags = [];
    var text = [item.title, item.description].join(' ').toLowerCase();
    state.categories.forEach(function (c) {
      (c.keywords || []).forEach(function (k) {
        k = k.toLowerCase();
        if (k.length > 2 && text.indexOf(k) !== -1 && tags.indexOf(k) === -1) tags.push(k);
      });
    });
    if (item.url) {
      var parts = M.host(item.url).split('.');
      var site = parts.length > 1 ? parts[parts.length - 2] : parts[0];
      if (site && tags.indexOf(site) === -1) tags.push(site);
    }
    return tags.slice(0, 5);
  }

  /* ---------------- Gemini ---------------- */
  var API = 'https://generativelanguage.googleapis.com/v1beta/';
  var lastCall = 0;
  var queue = Promise.resolve();

  // Uma chamada por vez, com folga entre elas (o plano grátis limita pedidos por minuto)
  function serial(fn) {
    var p = queue.then(async function () {
      var wait = 1500 - (Date.now() - lastCall);
      if (wait > 0) await new Promise(function (r) { setTimeout(r, wait); });
      lastCall = Date.now();
      return fn();
    });
    queue = p.catch(function () {});
    return p;
  }

  async function listModels(key) {
    var r = await fetch(API + 'models?pageSize=200', { headers: { 'x-goog-api-key': key } });
    var j = await r.json();
    if (!r.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status));
    return (j.models || [])
      .filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') !== -1; })
      .map(function (m) { return m.name.replace(/^models\//, ''); })
      .filter(function (n) { return /^gemini/.test(n) && !/(tts|image|live|audio|embedding|vision|thinking-exp|computer|robotics)/.test(n); });
  }

  // Escolhe o melhor "Flash" disponível (rápido e com cota grátis maior)
  function pickModel(names) {
    function ver(n) { var m = n.match(/gemini-(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; }
    function score(n) {
      var s = ver(n) * 100;
      if (/flash/.test(n)) s += 50;
      if (/lite/.test(n)) s -= 20;
      if (/pro/.test(n)) s -= 60;
      if (/preview|exp/.test(n)) s -= 30;
      if (/-\d{3}$|-\d{2}-\d{4}$/.test(n)) s -= 5;
      if (/latest/.test(n)) s += 2;
      return s;
    }
    return names.slice().sort(function (a, b) { return score(b) - score(a); })[0] || 'gemini-2.5-flash';
  }

  async function ensureModel(state) {
    var s = state.settings;
    if (s.geminiModel) return s.geminiModel;
    try {
      s.geminiModels = await listModels(s.geminiKey);
      s.geminiModel = pickModel(s.geminiModels);
    } catch (e) { s.geminiModel = 'gemini-2.5-flash'; }
    return s.geminiModel;
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(',')[1]); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsDataURL(blob);
    });
  }

  async function gemini(state, item, imageBlob, retried) {
    var s = state.settings;
    var model = await ensureModel(state);
    var cats = state.categories.map(function (c) { return '- ' + c.id + ': ' + c.name; }).join('\n');
    var prompt =
      'Você organiza uma coleção pessoal de links e imagens salvos da internet.\n' +
      'Escolha UMA categoria para o item abaixo (use o id exato) e sugira até 5 tags curtas em português, em minúsculas.\n' +
      'Se o item for um vídeo ou post de rede social, classifique pelo ASSUNTO (ex.: vídeo sobre impressão 3D → categoria de modelos 3D).\n' +
      (imageBlob ? 'Há uma imagem/print anexado: leia o que aparece nela (textos, títulos, logos) para entender o assunto.\n' : '') +
      '\nCategorias:\n' + cats + '\n\n' +
      'Item:\n' +
      (item.url ? 'URL: ' + item.url + '\n' : '') +
      (item.publisher ? 'Site: ' + item.publisher + '\n' : '') +
      (item.title && !item.titleFromUrl ? 'Título: ' + item.title + '\n' : '') +
      (item.description ? 'Descrição: ' + item.description + '\n' : '') +
      (item.author ? 'Autor: ' + item.author + '\n' : '') +
      (item.notes ? 'Nota do usuário: ' + item.notes + '\n' : '') +
      '\nResponda só com JSON: {"category":"<id>","title":"<título curto e claro em português, se o atual for ruim ou ausente>","summary":"<resumo de 1 frase>","tags":["..."]}';

    var parts = [{ text: prompt }];
    if (imageBlob) parts.push({ inline_data: { mime_type: imageBlob.type || 'image/jpeg', data: await blobToBase64(imageBlob) } });

    var r = await fetch(API + 'models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.geminiKey },
      body: JSON.stringify({ contents: [{ role: 'user', parts: parts }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } })
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      // modelo descontinuado/renomeado: atualiza a lista e tenta de novo uma vez
      if (r.status === 404 && !retried) { s.geminiModel = ''; return gemini(state, item, imageBlob, true); }
      var err = new Error((j.error && j.error.message) || ('HTTP ' + r.status));
      err.status = r.status;
      throw err;
    }
    var txt = ((((j.candidates || [])[0] || {}).content || {}).parts || []).map(function (p) { return p.text || ''; }).join('');
    var out = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    if (!state.categories.some(function (c) { return c.id === out.category; })) out.category = null;
    out.tags = (out.tags || []).map(function (t) { return String(t).toLowerCase().replace(/^#/, '').trim(); }).filter(Boolean).slice(0, 5);
    return out;
  }

  function ai(state, item, imageBlob) {
    return serial(function () { return gemini(state, item, imageBlob); });
  }

  async function test(state) {
    state.settings.geminiModel = state.settings.geminiModel || '';
    var out = await ai(state, { url: 'https://www.printables.com/model/3161-3d-benchy', title: '3DBenchy - The jolly 3D printing torture-test', description: 'A 3D printing calibration model', publisher: 'Printables' });
    return out;
  }

  return { rules: rules, ai: ai, listModels: listModels, pickModel: pickModel, test: test };
})();
