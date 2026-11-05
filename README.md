# Stash

Guarde links de sites, vídeos, posts de redes sociais, imagens e prints. O Stash busca o título e a imagem de cada link e **organiza sozinho por categorias**: Modelos 3D, Séries, Filmes, Animes, Jogos, Inspirações, Ideias, Artigos, Vídeos, Música, Receitas, Ferramentas, Compras e as que você criar.

HTML + CSS + JS puro, sem build. Mesmo padrão visual do Waypoint (claro creme / escuro zinco, destaque âmbar, ícones Lucide).

## Como abrir

- **No celular e no PC (recomendado):** https://renatobelmont.github.io/Stash/
  - Android (Chrome): menu ⋮ → *Instalar app*. Depois, em qualquer app, *Compartilhar* → **Stash** (links e imagens).
  - iPhone (Safari): *Compartilhar* → *Adicionar à Tela de Início*. O iOS não deixa apps web aparecerem no menu Compartilhar: copie o link e use o botão **+** → *Colar*.
  - No app instalado (iPhone e Android) não existe o "puxar para atualizar" do navegador: o Stash tem o seu próprio. Puxe a tela para baixo no topo para sincronizar e buscar versão nova. Versões novas também carregam sozinhas ao reabrir o app.
  - No iPhone, o app da Tela de Início guarda os dados **separado do Safari**: conecte o Google Drive dentro do app também. Lá o login vai para a página do Google e volta (a janela de login não funciona no modo app do iOS).
- **Local:** abra `index.html` direto no navegador (funciona sem servidor; só o "Compartilhar" do celular e o modo offline precisam do GitHub Pages).

> Os dados ficam salvos **no navegador e no endereço** onde o Stash foi aberto. O Stash do GitHub Pages e o do arquivo local guardam coisas separadas. Use *Configurações → Exportar/Importar backup* para levar de um para o outro e para não perder nada.

## Como ele organiza

1. **Pelo site** (ex.: Printables → Modelos 3D, MyAnimeList → Animes, Steam → Jogos).
2. **Pelo conteúdo**: palavras-chave no título e na descrição (um vídeo do YouTube sobre impressão 3D vai para Modelos 3D).
3. **Aprende com você**: mudou a categoria de um link? Os próximos links daquele site vão para lá. Redes sociais (Instagram, TikTok, YouTube…) não são memorizadas por site, porque cada post é de um assunto.
4. **Gemini (opcional e grátis)**: entende o assunto do link e **lê imagens e prints**. Crie uma chave em https://aistudio.google.com/apikey e cole em *Configurações*. O Stash escolhe sozinho o melhor modelo Flash disponível. No plano grátis, o Google pode usar o conteúdo enviado para melhorar os produtos dele.

## Nuvem (Google Drive, grátis)

Sincroniza itens, categorias, correções e imagens entre aparelhos. Os dados ficam na **pasta oculta do app** no seu Drive (o Stash não enxerga seus outros arquivos). Só funciona no endereço do GitHub Pages: o arquivo aberto direto no PC não consegue fazer o login do Google.

Configuração única no [Google Cloud Console](https://console.cloud.google.com/) (grátis):
1. Novo projeto → *APIs e serviços → Biblioteca* → ativar **Google Drive API**.
2. *Tela de consentimento OAuth*: Externo, modo Teste, adicionar o seu e-mail como usuário de teste.
3. *Credenciais → ID do cliente OAuth → Aplicativo da Web*, origem autorizada `https://renatobelmont.github.io` e URI de redirecionamento autorizado `https://renatobelmont.github.io/Stash/` (usado pelo app da Tela de Início do iPhone).
4. Colar o ID do cliente em *Configurações → Nuvem* (ou em `Stash.DRIVE_CLIENT_ID`, em `js/data.js`) e clicar em **Conectar Google Drive**.

Como funciona: ao abrir e alguns segundos depois de cada mudança, o Stash baixa o `stash.json` da nuvem, junta com o do aparelho (em cada item vale a edição mais recente; itens excluídos ficam registrados para não voltarem) e envia de volta. Cada imagem vira um arquivo, enviado uma vez. O login do Google dura cerca de 1 hora: quando expira, o ícone de nuvem no topo fica laranja; toque nele para entrar de novo. A chave do Gemini não vai para a nuvem.

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
js/cloud.js           sincronização com o Google Drive
js/app.js             interface
assets/               ícone e logo
```
