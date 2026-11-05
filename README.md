# Stash

Guarde links de sites, vídeos, posts de redes sociais, imagens e prints. O Stash busca o título e a imagem de cada link e **organiza sozinho por categorias**: Modelos 3D, Séries, Filmes, Animes, Jogos, Inspirações, Ideias, Artigos, Vídeos, Música, Receitas, Ferramentas, Compras e as que você criar.

HTML + CSS + JS puro, sem build. Mesmo padrão visual do Waypoint (claro creme / escuro zinco, destaque âmbar, ícones Lucide).

## Como abrir

- **No celular e no PC (recomendado):** https://renatobelmont.github.io/Stash/
  - Android (Chrome): menu ⋮ → *Instalar app*. Depois, em qualquer app, *Compartilhar* → **Stash** (links e imagens).
  - iPhone (Safari): *Compartilhar* → *Adicionar à Tela de Início*. O iOS não deixa apps web aparecerem no menu Compartilhar: copie o link e use o botão **+** → *Colar*.
- **Local:** abra `index.html` direto no navegador (funciona sem servidor; só o "Compartilhar" do celular e o modo offline precisam do GitHub Pages).

> Os dados ficam salvos **no navegador e no endereço** onde o Stash foi aberto. O Stash do GitHub Pages e o do arquivo local guardam coisas separadas. Use *Configurações → Exportar/Importar backup* para levar de um para o outro e para não perder nada.

## Como ele organiza

1. **Pelo site** (ex.: Printables → Modelos 3D, MyAnimeList → Animes, Steam → Jogos).
2. **Pelo conteúdo**: palavras-chave no título e na descrição (um vídeo do YouTube sobre impressão 3D vai para Modelos 3D).
3. **Aprende com você**: mudou a categoria de um link? Os próximos links daquele site vão para lá. Redes sociais (Instagram, TikTok, YouTube…) não são memorizadas por site, porque cada post é de um assunto.
4. **Gemini (opcional e grátis)**: entende o assunto do link e **lê imagens e prints**. Crie uma chave em https://aistudio.google.com/apikey e cole em *Configurações*. O Stash escolhe sozinho o melhor modelo Flash disponível. No plano grátis, o Google pode usar o conteúdo enviado para melhorar os produtos dele.

## Prints

Posts do Instagram, TikTok e Facebook costumam bloquear a prévia. Guarde o link **junto com um print** (no botão **+**, ou anexando depois em *Detalhes → Anexar print*): o print vira a imagem do card e, com o Gemini ligado, é lido para classificar e dar um título.

## Status e nota

Categorias podem acompanhar status (ex.: Séries: *Quero ver → Assistindo → Visto*; Jogos: *Quero jogar → Jogando → Zerado*) e nota de 1 a 5 estrelas. Configure em cada categoria (botão direito, ou segurar no celular).

## Atalhos

- **Ctrl+V** em qualquer lugar: guarda links ou imagens copiadas.
- **Arrastar e soltar** links ou imagens na página.
- **Favorito "+ Stash"** (em *Configurações*): arraste para a barra de favoritos e clique em qualquer página para guardá-la.

## Serviços online usados

- [noembed.com](https://noembed.com) e [microlink.io](https://microlink.io) (grátis, ~50 consultas/dia): título, descrição e imagem dos links.
- [Lucide](https://lucide.dev) via jsDelivr (versão fixa 0.460.0): ícones.
- Gemini API (opcional).

## Estrutura

```
index.html            página
manifest.webmanifest  app instalável + "Compartilhar" no Android
sw.js                 offline + recebe compartilhamentos
css/style.css         visual (padrão Waypoint)
js/data.js            categorias, status e ícones padrão
js/storage.js         localStorage, IndexedDB (imagens) e ícones
js/meta.js            leitura de links (noembed/microlink)
js/classify.js        regras + Gemini
js/app.js             interface
assets/               ícone e logo
```
