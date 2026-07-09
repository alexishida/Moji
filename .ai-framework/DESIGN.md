# Design System

Este arquivo descreve o padrao visual atual do Moji.

Fonte de verdade dos tokens: [`src/styles/theme.css`](../src/styles/theme.css). Componentes e telas devem usar esses tokens antes de criar novas cores, medidas ou variantes.

## Principios

- Leitura primeiro: preview limpo, coluna centralizada e cromo escuro discreto.
- Consistencia por tokens CSS; evitar valores soltos em componentes.
- App chrome sempre escuro; tema claro/escuro se aplica ao conteudo Markdown renderizado e aos arquivos exportados.
- Controles compactos, previsiveis e feitos para uso repetido.
- Reutilizar componentes/classes existentes antes de criar novas variacoes.

## Estrutura

O app Electron usa um shell em camadas:

- **Top bar** (`.topbar`): duas linhas sobre `--chrome-bg`. Primeira linha contem acoes de arquivo (*Novo*, *Abrir*, *Salvar*) e campo de busca com botao de substituicao. Segunda linha contem o seletor segmentado *Preview / Editor / Exportar* e acoes de tema, configuracoes e sobre (icone de informacao).
- **Document tabs** (`.document-tabs`): barra horizontal abaixo da top bar, visivel quando ha documentos abertos. Cada aba tem largura estavel, marcador de alteracao e botao de fechar.
- **Body** (`.body`): sidebar + area principal.
- **Sidebar** (`.sidebar`): coluna de `--sidebar-w`, visivel com documento aberto. No modo preview mostra a arvore de outline gerada dos headings (aninhada por nivel) e destaca o heading ativo.
- **Main/workspace** (`.main`, `.workspace`): renderiza welcome, preview, editor, dialogo inline de exportacao, painel inline de configuracoes ou painel inline de sobre.
- **Status bar** (`.statusbar`): rodape de `--statusbar-h`, com marca, guia Markdown e contagem de palavras.

## Temas

O chrome do aplicativo usa o tema escuro definido em `:root`.

O preview/export usa `data-md-theme="light|dark"` no container do Markdown. O tema claro sobrescreve apenas tokens de leitura:

- `--bg`
- `--bg-elevated`
- `--text`
- `--text-muted`
- `--border`
- `--border-strong`
- `--accent`
- `--code-bg`
- `--hl-*`

Nao usar `data-theme` no `<html>` para alternar a UI inteira; o estado atual alterna apenas a leitura/exportacao.

## Tokens

| Token | Valor atual |
|-------|-------------|
| `--font-sans` | `'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Ubuntu, Cantarell, sans-serif` |
| `--font-mono` | `'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace` |
| `--reading-width` | `760px` |
| `--radius` | `8px` |
| `--radius-sm` | `5px` |
| `--space-1..6` | `4, 8, 12, 16, 24, 32px` |
| `--toolbar-h` | `44px` |
| `--topbar-h` | `52px` |
| `--statusbar-h` | `34px` |
| `--sidebar-w` | `260px` |
| `--shadow` | sombra leve para popovers/dialogos |

## Cores

### Chrome escuro / Markdown escuro

| Token | Valor |
|-------|-------|
| `--bg` | `#1e1e1e` |
| `--bg-elevated` | `#252526` |
| `--bg-inset` | `#2b2b2b` |
| `--text` | `#e7e7e7` |
| `--text-muted` | `#9aa0a6` |
| `--border` | `#3a3a3a` |
| `--border-strong` | `#4a4a4a` |
| `--accent` | `#4c9aff` |
| `--accent-hover` | `#63a9ff` |
| `--accent-contrast` | `#0b1a33` |
| `--code-bg` | `#161616` |
| `--danger` | `#ff6b6b` |
| `--brand` | `#6ea8ff` |
| `--sidebar-bg` | `#1a1a1b` |
| `--chrome-bg` | `#202021` |
| `--nav-hover-bg` | `#2a2a2c` |
| `--nav-active-bg` | `#24314a` |
| `--nav-active-text` | `#7cb0ff` |
| `--segment-track` | `#2a2a2c` |
| `--segment-active-bg` | `#38383a` |

### Markdown claro

| Token | Valor |
|-------|-------|
| `--bg` | `#ffffff` |
| `--bg-elevated` | `#f6f7f9` |
| `--text` | `#1f2328` |
| `--text-muted` | `#656d76` |
| `--border` | `#d5dae0` |
| `--border-strong` | `#c2c9d1` |
| `--accent` | `#2f6fed` |
| `--code-bg` | `#f4f6f8` |

## Componentes

- **Top bar** (`.topbar`): flex column, `--chrome-bg`, area arrastavel via `-webkit-app-region: drag`; botoes e inputs internos devem usar `no-drag`.
- **Botoes de arquivo** (`.topbar__open-btn`): altura 30px, icone + texto, borda `--border`, hover em `--bg-inset`.
- **Busca/substituicao** (`.topbar__search`, `.topbar__replace-popover`): busca segue altura de 30px, fundo `--bg`, borda `--border` e tipografia de 13px. Substituicao abre em popover compacto ancorado no campo de busca, com input de destino, contador de ocorrencias e acoes para localizar proxima, substituir uma ocorrencia ou substituir todas.
- **Segment** (`.segment`, `.segment__btn`): trilho `--segment-track`, botoes de 30px, ativo em `--segment-active-bg`.
- **Icon button** (`.iconbtn`): 34x34px, sem borda visivel por padrao, hover em `--bg-inset`, ativo com `--accent`.
- **Document tabs** (`.document-tabs`, `.document-tab`): altura 35px; aba ativa usa `--bg` e filete superior `--accent`; marcador de dirty usa `--accent`.
- **Sidebar / outline** (`.sidebar`, `.outline-tree`, `.outline-item`): outline aparece no modo preview como arvore aninhada por nivel de heading. Cada grupo (`.outline-tree__children`) tem linha-guia vertical `--border`. Headings com filhos sao colapsaveis por chevron; botao no topo do painel (`.outline-head__toggle`) expande/colapsa tudo. Prefixos `Requirement:`/`Scenario:` viram icones (`IconBlock`/`IconFlow`) e saem do texto; Requirement usa peso maior e `--text`, Scenario recua com `--text-muted`. Titulos longos quebram em ate 2 linhas com `title` completo no hover. Item ativo usa `--nav-active-text`, fundo tenue `--nav-active-bg` e barra `inset 2px --accent`. O item ativo acompanha a rolagem do preview via scroll-spy (`getActivePreviewHeadingId` em `src/lib/previewScroll.ts`); clicar rola suavemente ate o heading.
- **Preview** (`.markdown-body`): largura maxima `--reading-width`, padding `--space-6 --space-5`, tipografia configuravel pelo painel de configuracoes (padrao 16px, linha 1.7), headings com hierarquia clara e codigo em `--code-bg`.
- **Editor** (`.editor-pane`, `.cm-editor`): ocupa toda a area principal, fonte mono 14px, line wrapping e tema escuro CodeMirror no estado atual.
- **Export dialog** (`.export-dialog`): dialogo inline centralizado, largura `min(760px, calc(100vw - 32px))`, lista de formatos PDF/HTML/PNG, configuracoes de pagina para PDF.
- **Settings dialog** (`.settings-dialog`): painel inline centralizado no mesmo padrao do export; contem idioma e configuracoes de preview como familia de fonte, tamanho e altura de linha. Idiomas embarcados atuais: English, Portugues (Brasil), Espanol e Japones.
- **About dialog** (`.about-dialog`): painel inline centralizado que reutiliza a estrutura de `.export-dialog`; mostra nome do app, versao (de `package.json`), autor, e-mail, link do repositorio e a explicacao do nome. Aberto pelo botao de informacao na top bar.
- **Popover/menu** (`.popover`, `.menu__list`): usar `--bg-elevated`, `--border`, `--shadow`, raio de ate `--radius`.
- **Confirm dialog** (`.dialog`): modal com backdrop, largura `min(420px, 90vw)`, usado para alteracoes nao salvas.
- **Notice** (`.notice`): toast inferior sobre a status bar; erro usa `--danger`.
- **Welcome** (`.welcome`): tela vazia centralizada com acoes principais de abrir/criar documento.

## Markdown Renderizado

O preview deve manter suporte visual para:

- headings com anchors
- links
- listas e task lists
- tabelas com overflow horizontal
- blockquotes
- codigo inline e blocos com highlight.js
- imagens responsivas
- destaque de busca via `.search-highlight` quando a busca estiver conectada

## Responsividade

- Janela minima atual: 640x480.
- Export dialog vira uma coluna abaixo de 720px.
- Texto em abas e nome de arquivo deve truncar com ellipsis; no outline, headings longos quebram em ate 2 linhas.
- Controles fixos nao devem mudar dimensao com hover, foco, dirty marker ou labels longos.

## Acessibilidade

- Contraste minimo AA para texto principal em temas claro e escuro.
- Alvos clicaveis principais com 30px ou mais.
- Estados hover/foco devem ser visiveis.
- Botoes iconicos precisam de `title` ou `aria-label`.
- Menus nativos mantem atalhos de teclado para abrir, salvar, salvar como, alternar editor e alternar tema.
