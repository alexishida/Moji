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

### Main Process (`electron/`)

- `main.ts`: janela (`BrowserWindow` 1000x760, min 640x480), single-instance lock com forward de argumentos de arquivo, handlers IPC, abertura via dialogo nativo, CLI (`process.argv`), evento `open-file` (macOS/Linux) e drag-drop (via `webUtils.getPathForFile`).
- `preload.ts`: expoe API segura ao renderer via `contextBridge` com tipagem completa (`RendererApi`).
- `shared.ts`: tipos e constantes compartilhados entre main, preload e renderer (tipos de resultado IPC, `Settings`, `ExportFormat`, `SUPPORTED_LANGUAGES`, `IPC` channels).
- `settings.ts`: persiste configuracoes do usuario em `settings.json` no `userData`; resolve idioma inicial a partir do locale do SO; aplica limites numericos (`boundedNumber`).
- `export.ts`: exporta documento ativo como PDF (via `printToPDF` em `BrowserWindow` oculta), PNG (via `capturePage().toPNG()`) ou HTML (escrita direta). Suporta A4/Letter/Legal e portrait/landscape.

### Renderer (`src/`)

- `App.tsx`: estado principal (documentos, aba ativa, modo view/edit/search/export, tema Markdown, drag-drop, outline scroll-spy, contagem de palavras/linhas/tokens).
- `src/components/`: 14 componentes React (`AboutDialog`, `ConfirmDialog`, `DocumentTabs`, `Editor`, `ExportDialog`, `icons`, `OutlineTree`, `Preview`, `SettingsButton`, `SettingsDialog`, `Sidebar`, `StatusBar`, `TopBar`, `Welcome`).
- `src/lib/`: utilitarios (`exportHtml`, `markdown`, `outline`, `previewScroll`, `useDebounced`).
- `src/locales/`: arquivos JSON de traducao para `en`, `pt-BR`, `es`, `ja`, `zh`, `ru`.
- `src/styles/`: `theme.css` (tokens), `markdown.css` (preview/exportacao), `app.css` (layout).
- `src/types/`: `api.d.ts` (tipagem da API do preload), `vite-env.d.ts`.

### Demais diretorios

- `samples/`: documentos Markdown de referencia empacotados com o app.
- `scripts/`: script auxiliar para `electron-vite`.
- `build/`: icones e recursos para `electron-builder`.
- `openspec/specs/`: especificacoes de comportamento atuais (6 dominios: app-shell, appearance, document-export, internationalization, markdown-editing, markdown-viewing).

### Stack tecnica

- Markdown renderizado por `markdown-it` com plugins (`markdown-it-anchor`, `markdown-it-task-lists`, `markdown-it-footnote`, `markdown-it-deflist`, `markdown-it-sub`, `markdown-it-sup`, `markdown-it-mark`, `markdown-it-ins`, `markdown-it-abbr`, `markdown-it-emoji`, `markdown-it-texmath`), formulas LaTeX via `katex`, codigo destacado com `highlight.js` e HTML sanitizado com `DOMPurify`.
- Editor baseado em CodeMirror 6 (`@codemirror/commands`, `@codemirror/lang-markdown`, `@codemirror/search`).
- Internacionalizacao com `i18next` + `react-i18next`.
- Build/desenvolvimento com `electron-vite`.
- Empacotamento com `electron-builder` (NSIS para Windows, AppImage/deb para Linux).

### Formatos de exportacao suportados

`pdf`, `html`, `png` (definido em `ExportFormat` no `electron/shared.ts`).

### Idiomas suportados

`en`, `pt-BR`, `es`, `ja`, `zh`, `ru` (definido em `SUPPORTED_LANGUAGES` no `electron/shared.ts`).

## Regras de Codigo

- Escrever codigo claro, organizado e de facil manutencao.
- Respeitar a estrutura atual: `electron/main.ts` para janela/IPC/ciclo de vida; `electron/preload.ts` para ponte segura; `electron/shared.ts` para tipos/contratos; `electron/settings.ts` para persistencia; `electron/export.ts` para exportacao; `src/` para renderer/componentes/libs/estilos/locales.
- Manter `nodeIntegration: false`, `contextIsolation: true` e `sandbox: true` no renderer.
- Sanitizar HTML renderizado antes de usar `dangerouslySetInnerHTML`.
- Abrir links externos no navegador do sistema (`shell.openExternal`), nao dentro do app.
- Tratar arquivos suportados como `.md` e `.markdown`.
- Proteger fechamento de documento/app quando houver alteracoes nao salvas (fluxo `requestClose` -> `confirmClose` -> `forceQuit`).
- Ao adicionar formato de exportacao, atualizar `ExportFormat` em `electron/shared.ts`, filtros em `electron/export.ts`, UI em `ExportDialog.tsx`, traducoes nos locales e documentacao.
- Ao adicionar idioma, atualizar `SUPPORTED_LANGUAGES` em `electron/shared.ts`, criar locale JSON em `src/locales/` e documentar.
- Paineis inline do workspace (exportacao, configuracoes, sobre) compartilham a estrutura de `.export-dialog`; reutilizar esse padrao ao criar novos.
- Exibir a versao do app a partir de `package.json`, nao com string fixa.
- Ao modificar `electron/shared.ts`, verificar consistencia com `electron/preload.ts` (API exposta) e handlers em `electron/main.ts`.
- Configuracoes de usuario persistem via `electron/settings.ts` em JSON; adicionar novos campos com valores default e validacao de limites (`boundedNumber`).

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
