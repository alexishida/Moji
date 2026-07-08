# Regras para IA

Este arquivo e a fonte oficial das regras do projeto.

Projeto atual: Moji, aplicativo desktop Electron + React + TypeScript para abrir, visualizar, editar e exportar arquivos Markdown.

## Regras Gerais

- Responder e alterar com base no estado real do repositorio.
- Antes de documentar feature, confirmar se esta integrada no fluxo principal, nao apenas presente em componente isolado.
- Manter alteracoes pequenas e alinhadas ao pedido.
- Preservar mudancas locais de usuario; nao reverter arquivos fora do escopo solicitado.
- Preferir `rg` para localizar arquivos/texto.
- Usar `npm run typecheck` para validar TypeScript quando houver alteracao em codigo.

## Stack e Arquitetura

- Main process Electron em `electron/`.
- Renderer React em `src/`.
- Ponte segura via `electron/preload.ts` e `contextBridge`.
- Tipos e contratos IPC compartilhados em `electron/shared.ts`.
- Markdown renderizado por `markdown-it` com plugins (`markdown-it-anchor`, `markdown-it-task-lists`, `markdown-it-footnote`, `markdown-it-deflist`, `markdown-it-sub`, `markdown-it-sup`, `markdown-it-mark`, `markdown-it-ins`, `markdown-it-abbr`, `markdown-it-emoji`, `markdown-it-texmath`), fórmulas LaTeX via `katex`, código destacado com `highlight.js` e HTML sanitizado com `DOMPurify`.
- Editor baseado em CodeMirror 6.
- Internacionalizacao com `i18next` e arquivos em `src/locales/`.
- Build/desenvolvimento com `electron-vite`.
- Empacotamento com `electron-builder`.

## Regras de Codigo

- Escrever codigo claro, organizado e de facil manutencao.
- Respeitar a estrutura atual: `electron/` para main/preload/IPC/export/settings/menu; `src/` para renderer/componentes/libs/estilos/locales.
- Manter `nodeIntegration: false`, `contextIsolation: true` e `sandbox: true` no renderer.
- Sanitizar HTML renderizado antes de usar `dangerouslySetInnerHTML`.
- Abrir links externos no navegador do sistema, nao dentro do app.
- Tratar arquivos suportados como `.md` e `.markdown`.
- Proteger fechamento de documento/app quando houver alteracoes nao salvas.
- Ao adicionar formato de exportacao, atualizar `ExportFormat`, filtros, UI, traducoes e documentacao.
- Ao adicionar idioma, atualizar `SUPPORTED_LANGUAGES`, locale JSON e menu nativo.

## Regras de Layout e Design

O padrao visual esta documentado em `.ai-framework/DESIGN.md`.

- Usar `src/styles/theme.css` como fonte de tokens.
- Manter chrome do app escuro; alternancia de tema vale para o preview Markdown. Exportacao (HTML/PDF/PNG) sempre usa o tema claro.
- Reutilizar classes/componentes existentes antes de criar variacoes.
- Manter layout compacto: top bar, abas de documentos, sidebar/outline, workspace e status bar.
- Priorizar leitura, contraste, truncamento de textos longos e estados visuais previsiveis.
- Nao usar cores, sombras, raios ou espacamentos soltos quando houver token existente.
- Garantir que textos nao estourem botoes, abas, popovers ou dialogos.
- Criar novas solucoes visuais somente quando houver necessidade real de produto, usabilidade ou escala.

## Documentacao

- `README.md` deve descrever uso, recursos e comandos reais do projeto.
- `.ai-framework/DESIGN.md` deve espelhar tokens e componentes implementados.
- Nao prometer recursos incompletos como prontos; se necessario, marcar como em andamento.
- Atualizar README, DESIGN e regras quando mudar arquitetura, exportacao, temas, idiomas ou fluxo principal.

## Guard Rails

- Nao executar comandos diretamente em ambiente de producao.
- Nao fazer alteracoes destrutivas ou irreversiveis sem confirmacao explicita e explicacao do impacto.
- Nao introduzir dependencias, abstracoes, estilos ou estruturas apenas por preferencia pessoal.
- Nao ignorar impacto em seguranca, desempenho, usabilidade, manutencao ou consistencia visual.
- Nao editar arquivos gerados ou lockfiles sem necessidade ligada ao pedido.
