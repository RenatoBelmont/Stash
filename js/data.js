/* =========================================================================
   STASH — dados padrão
   Categorias, conjuntos de status e ícones disponíveis.
   ========================================================================= */
window.Stash = window.Stash || {};

/* Status: as chaves são sempre as mesmas (fila → andamento → feito / abandonado);
   cada categoria escolhe um "conjunto" que só muda os nomes exibidos. */
Stash.STATUS_KEYS = ['fila', 'andamento', 'feito', 'abandonado'];
Stash.STATUS_COLORS = { fila: '#60a5fa', andamento: '#fbbf24', feito: '#34d399', abandonado: '#a1a1aa' };
Stash.STATUS_ICONS = { fila: 'bookmark', andamento: 'loader-circle', feito: 'check', abandonado: 'x' };
Stash.STATUS_SETS = {
  geral:    { rotulo: 'Genérico',           nomes: ['Na fila', 'Em andamento', 'Concluído', 'Abandonado'] },
  ver:      { rotulo: 'Assistir',           nomes: ['Quero ver', 'Assistindo', 'Visto', 'Abandonei'] },
  jogar:    { rotulo: 'Jogar',              nomes: ['Quero jogar', 'Jogando', 'Zerado', 'Abandonei'] },
  ler:      { rotulo: 'Ler',                nomes: ['Ler depois', 'Lendo', 'Lido', 'Abandonei'] },
  imprimir: { rotulo: 'Imprimir',           nomes: ['Quero imprimir', 'Imprimindo', 'Impresso', 'Desisti'] },
  fazer:    { rotulo: 'Fazer',              nomes: ['Quero fazer', 'Fazendo', 'Feito', 'Desisti'] },
  ouvir:    { rotulo: 'Ouvir',              nomes: ['Ouvir depois', 'Ouvindo', 'Ouvido', 'Abandonei'] },
  comprar:  { rotulo: 'Comprar',            nomes: ['Quero comprar', 'Aguardando', 'Comprado', 'Desisti'] }
};

Stash.DEFAULT_CATEGORIES = [
  { id: '3d', name: 'Modelos 3D', icon: 'box', color: '#38bdf8', status: 'imprimir',
    domains: ['thingiverse.com', 'printables.com', 'makerworld.com', 'cults3d.com', 'myminifactory.com', 'thangs.com', 'sketchfab.com', 'grabcad.com', 'yeggi.com', 'printables'],
    keywords: ['stl', '3mf', '3d print', '3d printing', 'impressão 3d', 'impressao 3d', 'impressora 3d', '3d model', 'modelo 3d', 'filament', 'filamento', 'resin print', 'resina', 'bambu lab', 'prusa', 'creality', 'print in place', 'miniature', 'miniatura', 'fdm', 'benchy'] },
  { id: 'series', name: 'Séries', icon: 'tv', color: '#fb923c', status: 'ver',
    domains: ['tvmaze.com', 'serializd.com', 'tvtime.com', 'trakt.tv/shows', 'themoviedb.org/tv'],
    keywords: ['tv series', 'série', 'séries', 'season', 'temporada', 'episode', 'episódio', 'miniseries', 'minissérie', 'tv show', 'showrunner', 'renewed', 'renovada'] },
  { id: 'filmes', name: 'Filmes', icon: 'clapperboard', color: '#f87171', status: 'ver',
    domains: ['letterboxd.com', 'adorocinema.com', 'filmow.com', 'rottentomatoes.com/m/', 'trakt.tv/movies', 'themoviedb.org/movie'],
    keywords: ['movie', 'filme', 'film', 'cinema', 'trailer', 'box office', 'bilheteria', 'director', 'diretor', 'oscar', 'longa-metragem'] },
  { id: 'animes', name: 'Animes', icon: 'flower-2', color: '#f472b6', status: 'ver',
    domains: ['myanimelist.net', 'anilist.co', 'crunchyroll.com', 'kitsu.io', 'kitsu.app', 'anime-planet.com', 'mangadex.org', 'livechart.me'],
    keywords: ['anime', 'manga', 'mangá', 'shonen', 'shounen', 'seinen', 'isekai', 'crunchyroll', 'otaku', 'light novel', 'studio ghibli', 'mappa', 'ufotable', 'dublado', 'legendado'] },
  { id: 'jogos', name: 'Jogos', icon: 'gamepad-2', color: '#34d399', status: 'jogar',
    domains: ['store.steampowered.com', 'steamcommunity.com', 'epicgames.com', 'itch.io', 'gog.com', 'playstation.com', 'xbox.com', 'nintendo.com', 'ign.com', 'howlongtobeat.com', 'metacritic.com/game', 'backloggd.com', 'igdb.com', 'boardgamegeek.com', 'ludopedia.com.br'],
    keywords: ['game', 'jogo', 'gameplay', 'steam', 'playstation', 'xbox', 'nintendo', 'switch 2', 'rpg', 'fps', 'indie game', 'jogo indie', 'speedrun', 'gamer', 'dlc', 'early access', 'roguelike', 'roguelite', 'metroidvania', 'boardgame', 'board game', 'jogo de tabuleiro'] },
  { id: 'inspiracao', name: 'Inspirações', icon: 'sparkles', color: '#fbbf24', status: null,
    domains: ['pinterest.com', 'pin.it', 'behance.net', 'dribbble.com', 'artstation.com', 'deviantart.com', 'unsplash.com', 'awwwards.com', 'mobbin.com', 'savee.it', 'are.na', 'cosmos.so'],
    keywords: ['inspiration', 'inspiração', 'moodboard', 'aesthetic', 'estética', 'illustration', 'ilustração', 'concept art', 'wallpaper', 'logo design', 'paleta', 'palette', 'decor', 'decoração', 'fanart', 'artwork', 'pixel art'] },
  { id: 'ideias', name: 'Ideias & Projetos', icon: 'lightbulb', color: '#facc15', status: 'fazer',
    domains: ['instructables.com', 'hackaday.io', 'hackaday.com', 'producthunt.com'],
    keywords: ['diy', 'faça você mesmo', 'how to make', 'how i made', 'tutorial', 'projeto', 'project', 'ideia', 'idea', 'hack', 'arduino', 'raspberry pi', 'esp32', 'maker', 'side project'] },
  { id: 'artigos', name: 'Artigos & Leitura', icon: 'newspaper', color: '#a78bfa', status: 'ler',
    domains: ['medium.com', 'substack.com', 'dev.to', 'wikipedia.org', 'nytimes.com', 'theverge.com', 'wired.com', 'g1.globo.com', 'folha.uol.com.br', 'arstechnica.com', 'news.ycombinator.com', 'hashnode.dev', 'arxiv.org', 'gamedeveloper.com'],
    keywords: ['article', 'artigo', 'blog', 'news', 'notícia', 'noticia', 'essay', 'ensaio', 'opinion', 'paper', 'pesquisa', 'research', 'newsletter', 'guide', 'guia'] },
  { id: 'videos', name: 'Vídeos', icon: 'circle-play', color: '#fb7185', status: 'ver',
    domains: ['youtube.com', 'youtu.be', 'vimeo.com', 'tiktok.com', 'twitch.tv', 'dailymotion.com'],
    keywords: ['video', 'vídeo', 'vlog', 'shorts', 'reels', 'live'] },
  { id: 'musica', name: 'Música', icon: 'music', color: '#e879f9', status: 'ouvir',
    domains: ['open.spotify.com', 'spotify.com', 'soundcloud.com', 'music.apple.com', 'bandcamp.com', 'deezer.com', 'music.youtube.com', 'last.fm'],
    keywords: ['music', 'música', 'album', 'álbum', 'song', 'playlist', 'single', 'official audio', 'official music video', 'clipe', 'lyrics', 'letra', 'soundtrack', 'trilha sonora', 'ost'] },
  { id: 'receitas', name: 'Receitas', icon: 'chef-hat', color: '#a3e635', status: 'fazer',
    domains: ['tudogostoso.com.br', 'panelinha.com.br', 'allrecipes.com', 'receitas.globo.com', 'seriouseats.com'],
    keywords: ['receita', 'recipe', 'ingredientes', 'ingredients', 'cozinha', 'cooking', 'bolo', 'forno', 'air fryer', 'airfryer'] },
  { id: 'ferramentas', name: 'Ferramentas & Software', icon: 'wrench', color: '#2dd4bf', status: null,
    domains: ['github.com', 'gitlab.com', 'npmjs.com', 'alternativeto.net', 'chromewebstore.google.com', 'apps.apple.com', 'play.google.com', 'huggingface.co'],
    keywords: ['open source', 'open-source', 'software', 'tool', 'ferramenta', 'library', 'biblioteca', 'plugin', 'extension', 'extensão', 'framework', 'sdk', 'cli', 'self-hosted'] },
  { id: 'compras', name: 'Compras & Desejos', icon: 'shopping-cart', color: '#22d3ee', status: 'comprar',
    domains: ['amazon.', 'amzn.to', 'mercadolivre.com', 'aliexpress.com', 'shopee.com', 'magazineluiza.com', 'kabum.com.br', 'ebay.com', 'etsy.com', 'temu.com'],
    keywords: ['comprar', 'buy now', 'price', 'preço', 'frete', 'oferta', 'promoção', 'deal', 'sale', 'cupom'] },
  { id: 'outros', name: 'Outros', icon: 'package', color: '#a1a1aa', status: null, domains: [], keywords: [] }
];

/* Ícones (Lucide) que aparecem no seletor de categorias */
Stash.ICON_CHOICES = [
  'box', 'tv', 'clapperboard', 'film', 'flower-2', 'gamepad-2', 'puzzle', 'swords', 'sparkles', 'palette',
  'lightbulb', 'rocket', 'newspaper', 'book-open', 'graduation-cap', 'circle-play', 'music', 'headphones',
  'camera', 'image', 'chef-hat', 'wrench', 'code', 'bot', 'shopping-cart', 'shirt', 'heart', 'star',
  'map-pin', 'plane', 'car', 'dumbbell', 'dog', 'flask-conical', 'briefcase', 'pen-tool', 'printer',
  'globe', 'tag', 'folder', 'package', 'bookmark'
];

Stash.COLOR_CHOICES = ['#fbbf24', '#fb923c', '#f87171', '#fb7185', '#f472b6', '#e879f9', '#a78bfa', '#60a5fa',
  '#38bdf8', '#22d3ee', '#2dd4bf', '#34d399', '#a3e635', '#facc15', '#a1a1aa'];

Stash.PAGES_URL = 'https://renatobelmont.github.io/Stash/';
