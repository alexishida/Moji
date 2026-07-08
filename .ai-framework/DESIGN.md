# Design System

Este arquivo define o padrão visual do projeto.
Use estas diretrizes como referência ao criar ou alterar CSS, componentes e telas, mantendo consistência de layout, tipografia, cores, espaçamento e comportamento responsivo.

A fonte de verdade dos tokens é [`src/styles/theme.css`](../src/styles/theme.css). Este documento espelha esses valores.

## Princípios

- Leitura em primeiro lugar: coluna centrada, largura confortável, cromo mínimo.
- Consistência via tokens (variáveis CSS). Não usar cores/medidas soltas.
- Dois temas de igual qualidade: claro e escuro, ambos com contraste adequado.
- Reutilizar componentes e classes existentes antes de criar variações.

## Estrutura (shell)

Layout em três zonas fixas ao redor da área de leitura:

- **Top bar** (`--topbar-h` = 52px): marca à esquerda + nome do arquivo; abas segmentadas *Preview/Editor* ao centro; tema, configurações e menu (⋮) à direita.
- **Sidebar** (`--sidebar-w` = 260px): cabeçalho de biblioteca, botão primário *Novo documento*, navegação (Documentos), *Outline* derivado dos títulos, e rodapé (Configurações, Ajuda).
- **Status bar** (`--statusbar-h` = 34px): marca/versão à esquerda; *Guia*, *Exportar PDF* e contagem de palavras à direita.
- **Main**: preview (ou editor + preview em modo edição), coluna de leitura centrada em `--reading-width`.

## Tipografia

| Token | Valor |
|-------|-------|
| `--font-sans` | system-ui, -apple-system, 'Segoe UI', Roboto, Ubuntu, Cantarell, sans-serif |
| `--font-mono` | 'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace |
| Corpo do preview | 16px / linha 1.7 |
| Editor | 14px, monoespaçada |
| Largura de leitura | `--reading-width` = 760px |

## Cores — Tema Claro

| Token | Valor |
|-------|-------|
| `--bg` | `#ffffff` |
| `--bg-elevated` | `#f6f7f9` |
| `--bg-inset` | `#eef0f3` |
| `--text` | `#1f2328` |
| `--text-muted` | `#656d76` |
| `--border` | `#d5dae0` |
| `--accent` | `#2f6fed` |
| `--code-bg` | `#f4f6f8` |
| `--danger` | `#cf222e` |
| `--brand` | `#2f6fed` |
| `--sidebar-bg` | `#f4f6fb` |
| `--chrome-bg` | `#fbfcfe` |
| `--nav-hover-bg` | `#e9edf7` |
| `--nav-active-bg` | `#e3eafc` |
| `--nav-active-text` | `#2f6fed` |
| `--segment-track` | `#eaedf3` |
| `--segment-active-bg` | `#ffffff` |

## Cores — Tema Escuro

| Token | Valor |
|-------|-------|
| `--bg` | `#1e1e1e` |
| `--bg-elevated` | `#252526` |
| `--bg-inset` | `#2b2b2b` |
| `--text` | `#e7e7e7` |
| `--text-muted` | `#9aa0a6` |
| `--border` | `#3a3a3a` |
| `--accent` | `#4c9aff` |
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

O tema é aplicado via atributo `data-theme="light|dark"` no elemento `<html>`. Todo componente e o preview devem herdar cores dos tokens, nunca de valores fixos.

## Espaçamento e Raio

| Token | Valor |
|-------|-------|
| `--space-1..6` | 4, 8, 12, 16, 24, 32 px |
| `--radius` | 8px |
| `--radius-sm` | 5px |
| `--topbar-h` | 52px |
| `--statusbar-h` | 34px |
| `--sidebar-w` | 260px |

## Componentes base

- **Top bar** (`.topbar`): barra superior de `--topbar-h`, fundo `--chrome-bg`, borda inferior `--border`. Grid de três zonas: marca + arquivo à esquerda, abas segmentadas ao centro, ações à direita.
- **Abas segmentadas** (`.segment`): trilho `--segment-track` com pílula ativa em `--segment-active-bg`. Alterna *Preview* (leitura) e *Editor* (edição).
- **Sidebar** (`.sidebar`): coluna de `--sidebar-w`, fundo `--sidebar-bg`. Itens `.navitem` (hover `--nav-hover-bg`, ativo `--nav-active-bg`/`--nav-active-text`) e árvore `.outline` com indentação por nível de título e realce do título visível.
- **Status bar** (`.statusbar`): rodapé de `--statusbar-h`, fundo `--chrome-bg`; links discretos e contagem de palavras em `--accent`.
- **Botão de ícone** (`.iconbtn`): 34px, sem borda, hover `--bg-inset`; `--active` usa `--accent`.
- **Botão** (`.btn`): 30px de altura, borda `--border`, hover em `--bg-inset`. Variante `--primary` usa `--accent`; `--block` ocupa a largura total; `--active` indica estado ligado.
- **Preview** (`.markdown-body`): coluna de leitura centrada, hierarquia clara de headings, blocos de código com `--code-bg` e realce de sintaxe via tokens `--hl-*`.
- **Diálogo** (`.dialog`): modal centrado para confirmações (ex.: alterações não salvas), com backdrop escurecido.
- **Notice** (`.notice`): toast inferior temporário; variante de erro usa `--danger`.

## Acessibilidade

- Contraste mínimo AA para texto sobre `--bg` em ambos os temas.
- Áreas clicáveis com no mínimo 28–30px de altura.
- Estados de foco/hover visíveis; ações de menu com atalhos de teclado.
