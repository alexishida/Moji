# Design System

Este arquivo define o padrão visual do projeto.
Use estas diretrizes como referência ao criar ou alterar CSS, componentes e telas, mantendo consistência de layout, tipografia, cores, espaçamento e comportamento responsivo.

A fonte de verdade dos tokens é [`src/styles/theme.css`](../src/styles/theme.css). Este documento espelha esses valores.

## Princípios

- Leitura em primeiro lugar: coluna centrada, largura confortável, cromo mínimo.
- Consistência via tokens (variáveis CSS). Não usar cores/medidas soltas.
- Dois temas de igual qualidade: claro e escuro, ambos com contraste adequado.
- Reutilizar componentes e classes existentes antes de criar variações.

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

O tema é aplicado via atributo `data-theme="light|dark"` no elemento `<html>`. Todo componente e o preview devem herdar cores dos tokens, nunca de valores fixos.

## Espaçamento e Raio

| Token | Valor |
|-------|-------|
| `--space-1..6` | 4, 8, 12, 16, 24, 32 px |
| `--radius` | 8px |
| `--radius-sm` | 5px |
| `--toolbar-h` | 44px |

## Componentes base

- **Toolbar**: barra superior de 44px, fundo `--bg-elevated`, borda inferior `--border`. Título centralizado, ações à esquerda (Abrir, Editar, Exportar) e à direita (idioma, tema).
- **Botão** (`.btn`): 30px de altura, borda `--border`, hover em `--bg-inset`. Variante `--primary` usa `--accent`; `--active` indica estado ligado (ex.: modo edição).
- **Preview** (`.markdown-body`): coluna de leitura centrada, hierarquia clara de headings, blocos de código com `--code-bg` e realce de sintaxe via tokens `--hl-*`.
- **Diálogo** (`.dialog`): modal centrado para confirmações (ex.: alterações não salvas), com backdrop escurecido.
- **Notice** (`.notice`): toast inferior temporário; variante de erro usa `--danger`.

## Acessibilidade

- Contraste mínimo AA para texto sobre `--bg` em ambos os temas.
- Áreas clicáveis com no mínimo 28–30px de altura.
- Estados de foco/hover visíveis; ações de menu com atalhos de teclado.
