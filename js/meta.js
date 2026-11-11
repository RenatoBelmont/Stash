/* =========================================================================
   STASH — leitura de links
   Título, descrição e imagem vêm de serviços online gratuitos:
   - noembed.com  (oEmbed: YouTube, Vimeo, TikTok, X/Twitter, SoundCloud…)
   - microlink.io (qualquer site; plano grátis ≈ 50 consultas/dia)
   ========================================================================= */
window.Stash = window.Stash || {};

Stash.meta = (function () {
  function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
  function normalizeUrl(u) {
    u = u.trim().replace(/[)\].,;!?'"]+$/, '');
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    return u;
  }
  function extractUrls(text) {
    var m = String(text || '').match(/(https?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+)/gi) || [];
    var seen = {};
    return m.map(normalizeUrl).filter(function (u) { if (seen[u]) return false; seen[u] = 1; return true; });
  }
  var isImageUrl = function (u) { return /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?.*)?$/i.test(u); };
  var isVideoFile = function (u) { return /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(u); };
  function youtubeId(u) {
    var m = String(u).match(/(?:youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
    return m ? m[1] : null;
  }
  function mediaType(u) {
    var h = host(u);
    if (isImageUrl(u)) return 'imagem';
    if (isVideoFile(u) || youtubeId(u) || /tiktok\.com|vimeo\.com|twitch\.tv/.test(h) || /instagram\.com\/(reels?|tv)\//.test(u)) return 'vídeo';
    if (/instagram\.com|twitter\.com|^x\.com|threads\.net|facebook\.com|reddit\.com|bsky\.app/.test(h)) return 'post';
    return 'site';
  }
  function prettyFromUrl(u) {
    if (youtubeId(u)) return /\/shorts\//.test(u) ? 'Short do YouTube' : 'Vídeo do YouTube';
    var h = host(u);
    if (/instagram\.com/.test(h)) return /\/(reels?|tv)\//.test(u) ? 'Reel do Instagram' : 'Post do Instagram';
    if (/tiktok\.com/.test(h)) return 'Vídeo do TikTok';
    if (/(^|\.)(x|twitter)\.com$/.test(h)) return 'Post do X';
    if (/threads\.(net|com)/.test(h)) return 'Post do Threads';
    if (/facebook\.com|fb\.watch/.test(h)) return 'Post do Facebook';
    if (/pinterest\.|pin\.it/.test(h) && /\/pin\//.test(u)) return 'Pin do Pinterest';
    if (/docs\.google\.com/.test(h)) return /\/spreadsheets\//.test(u) ? 'Planilha do Google' : /\/presentation\//.test(u) ? 'Apresentação do Google' : /\/forms\//.test(u) ? 'Formulário do Google' : 'Documento do Google';
    if (/drive\.google\.com/.test(h)) return 'Arquivo do Google Drive';
    try {
      var x = new URL(u);
      var segs = x.pathname.split('/').filter(Boolean);
      var seg = segs.filter(function (s) { return !/^\d+$/.test(s) && s.length > 2; }).pop() || x.hostname.replace(/^www\./, '');
      return decodeURIComponent(seg).replace(/[-_+]/g, ' ').replace(/\.\w+$/, '').replace(/\s+/g, ' ').trim()
        .replace(/^\w/, function (c) { return c.toUpperCase(); });
    } catch (e) { return u; }
  }
  function timeout(p, ms) {
    return Promise.race([p, new Promise(function (_, r) { setTimeout(function () { r(new Error('timeout')); }, ms); })]);
  }

  async function fetchMeta(url) {
    var meta = { title: '', description: '', image: '', logo: '', publisher: host(url), author: '' };
    var yt = youtubeId(url);
    if (yt) meta.image = 'https://i.ytimg.com/vi/' + yt + '/hqdefault.jpg';
    if (isImageUrl(url)) { meta.image = url; }

    try {
      var r = await timeout(fetch('https://noembed.com/embed?url=' + encodeURIComponent(url)), 7000);
      var j = await r.json();
      if (j && !j.error) {
        meta.title = j.title || '';
        meta.author = j.author_name || '';
        meta.image = meta.image || j.thumbnail_url || '';
        if (j.provider_name) meta.publisher = j.provider_name;
      }
    } catch (e) { /* segue para o próximo serviço */ }

    if (!meta.title || !meta.description || !meta.image) {
      try {
        var r2 = await timeout(fetch('https://api.microlink.io/?url=' + encodeURIComponent(url)), 10000);
        var j2 = await r2.json();
        if (j2.status === 'success' && j2.data) {
          var d = j2.data;
          meta.title = meta.title || d.title || '';
          meta.description = meta.description || d.description || '';
          meta.image = meta.image || (d.image && d.image.url) || '';
          meta.logo = (d.logo && d.logo.url) || '';
          if (d.publisher) meta.publisher = d.publisher;
          meta.author = meta.author || d.author || '';
        }
      } catch (e) { /* sem metadados: o item fica com o título tirado do link */ }
    }
    if (!meta.logo) meta.logo = 'https://www.google.com/s2/favicons?domain=' + host(url) + '&sz=64';
    // títulos genéricos de redes sociais não ajudam
    if (/^(instagram|tiktok|x|facebook|login|log in|entrar)$/i.test(meta.title.trim())) meta.title = '';
    meta.titleFromUrl = !meta.title;
    if (!meta.title) meta.title = prettyFromUrl(url);
    return meta;
  }

  // Sites "genéricos": a categoria depende do conteúdo, não do site (não dá para memorizar por site)
  var GENERIC = /(^|\.)(youtube\.com|youtu\.be|instagram\.com|tiktok\.com|x\.com|twitter\.com|threads\.net|threads\.com|facebook\.com|fb\.watch|reddit\.com|bsky\.app|pinterest\.[a-z.]+|pin\.it|vimeo\.com|tumblr\.com|linkedin\.com|t\.co|bit\.ly|google\.com|drive\.google\.com|medium\.com|substack\.com)$/;
  function isGenericHost(h) { return GENERIC.test(h); }

  // Google Docs / Planilhas / Apresentações / arquivos do Drive: devolve o id do arquivo
  function googleFileId(u) {
    if (!/(^|\.)(docs|drive)\.google\.com$/.test(host(u))) return '';
    var m = String(u).match(/\/d\/([\w-]{20,})/) || String(u).match(/[?&]id=([\w-]{20,})/);
    return m ? m[1] : '';
  }

  /* Texto de qualquer página pública, via Jina Reader (grátis, sem chave). Devolve null se não der. */
  async function readPage(url) {
    try {
      var r = await timeout(fetch('https://r.jina.ai/' + url), 25000);
      if (!r.ok) return null;
      var t = await r.text();
      var title = (t.match(/^Title:\s*(.+)$/m) || [])[1] || '';
      var body = t.split(/^Markdown Content:\s*$/m)[1] || t;
      body = body.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\n{3,}/g, '\n\n').trim();
      // páginas de login / bloqueio não ajudam
      var head = body.slice(0, 600);
      if (body.length < 80 || (body.length < 1500 && /(sign in|log in|faça login|fazer login)/i.test(head))) return null;
      return { title: title.trim(), text: body };
    } catch (e) { return null; }
  }

  return {
    googleFileId: googleFileId, readPage: readPage,
    host: host, isGenericHost: isGenericHost, extractUrls: extractUrls, isImageUrl: isImageUrl, isVideoFile: isVideoFile,
    youtubeId: youtubeId, mediaType: mediaType, prettyFromUrl: prettyFromUrl, fetchMeta: fetchMeta
  };
})();
