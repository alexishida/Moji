# Tasks — Bugs encontrados

Levantamento feito sobre o estado do repositorio no commit `e4c0eab` (branch `v1.0.6`).
Nenhuma correcao foi aplicada; este arquivo e a lista de trabalho.

Legenda de severidade:

- **P0** — perda de dados ou app inutilizavel.
- **P1** — funcionalidade quebrada em fluxo real.
- **P2** — comportamento incorreto em caso de borda, lixo em disco, desempenho.
- **P3** — polimento, consistencia, documentacao.

---

## P0 — Perda de dados

### 1. Guarda de fechamento descarta alteracoes nao salvas apos 5 segundos

- Arquivos: [electron/main.ts:380](electron/main.ts#L380), [electron/main.ts:405-412](electron/main.ts#L405-L412), [src/App.tsx:903-925](src/App.tsx#L903-L925)
- `requestClose()` arma `closeGuardTimer` com `CLOSE_GUARD_TIMEOUT_MS = 5000`. O renderer responde
  `confirmClose` somente depois que o usuario clica no `ConfirmDialog` (`askUnsaved()` fica pendente
  ate a escolha humana) e, na opcao "salvar", tambem depois do dialogo nativo de Salvar Como.
- Resultado: se o usuario levar mais de 5s lendo o dialogo, `forceCloseOrQuit()` dispara,
  marca `forceQuit = true` e fecha a janela. Todo documento sujo e perdido sem aviso.
- O timeout tambem corre durante `flushPendingDrafts()` no inicio de `confirmAnyUnsaved`.
- Correcao esperada: o timer nao pode ser um prazo para o usuario. Opcoes: rearmar o guard apenas
  contra renderer nao responsivo (`webContents.isLoading()`/ping de vida), ou o renderer enviar um
  "recebi, estou perguntando ao usuario" que cancela o timer, mantendo o fallback so para o caso de
  nenhuma resposta ao evento.

### 2. Crash do renderer fecha o app imediatamente, sem guarda

- Arquivo: [electron/main.ts:610-612](electron/main.ts#L610-L612)
- `mainWindow.webContents.on('render-process-gone', () => forceCloseOrQuit())` esta registrado
  incondicionalmente, nao apenas quando ha um fechamento pendente.
- Qualquer crash do renderer (OOM em documento gigante, falha de GPU, `Aw, Snap`) encerra o app na
  hora, em vez de recarregar a janela ou avisar. Documentos com caminho e edicoes nao salvas somem.
- Correcao esperada: so acionar `forceCloseOrQuit()` quando `closeGuardTimer !== null || pendingQuit`.
  Fora disso, tratar como crash: reportar e recarregar a janela.

### 3. Compactacao de rascunho pode duplicar edicoes apos crash

- Arquivo: [electron/draftStore.ts:189-193](electron/draftStore.ts#L189-L193), usado em
  [draftStore.ts:421](electron/draftStore.ts#L421)
- `writeSnapshot()` faz `writeFileAtomic(content)` e depois `removeIfPresent(journal)`. Um crash
  entre as duas operacoes deixa o snapshot novo (que ja inclui as edicoes) junto do journal antigo.
- No proximo `load()`, `readContent()` chama `replayJournal(snapshot, journal)` e reaplica edicoes ja
  presentes, corrompendo o rascunho recuperado.
- Correcao esperada: gravar o journal com um marcador de geracao/base (ou renomear o journal para
  `.journal.old` antes do rename do snapshot e so entao apagar), de modo que o replay descarte um
  journal cuja base nao corresponde ao snapshot.

---

## P1 — Funcionalidade quebrada

### 4. `checkForUpdate` nunca resolve quando a rede trava

- Arquivo: [electron/updater.ts:80-100](electron/updater.ts#L80-L100)
- O timeout apenas publica `status: 'error'`; o `await updater.checkForUpdates()` continua pendente.
  Como `check()` so retorna depois desse await, a promessa devolvida ao `ipcRenderer.invoke` do canal
  `IPC.checkForUpdate` nunca resolve.
- Efeito: o botao "Tentar novamente" do `UpdateNotice` e a tela de Configuracoes ficam presos.
- Correcao esperada: `Promise.race` entre `checkForUpdates()` e o timeout, retornando o estado
  publicado quando o timeout vencer.

### 5. Abrir varios arquivos pelo SO/CLI descarta todos menos um

- Arquivos: [electron/main.ts:143-150](electron/main.ts#L143-L150), [main.ts:40](electron/main.ts#L40),
  [main.ts:794](electron/main.ts#L794), [main.ts:816](electron/main.ts#L816)
- `fileFromArgv()` retorna no primeiro `.md` encontrado e `pendingOpenPath` e um unico slot.
- Selecionar 5 arquivos no Explorer e usar "Abrir com Moji" abre apenas 1. O mesmo vale para varios
  `open-file` no macOS antes do renderer ficar pronto: cada um sobrescreve `pendingOpenPath`.
- Correcao esperada: trocar por `pendingOpenPaths: string[]` e fazer `fileFromArgv` devolver todos os
  caminhos validos, drenando a fila em `flushPendingOpenPath()`.

### 6. Cancelar "abrir varios" nao para a abertura no renderer

- Arquivos: [src/App.tsx:953-958](src/App.tsx#L953-L958), [src/App.tsx:1004-1032](src/App.tsx#L1004-L1032)
- `cancelOpenMany` aborta apenas a varredura do main. O renderer continua drenando `session.queue`
  com todos os metadados ja recebidos, abrindo abas que o usuario acabou de cancelar.
- Correcao esperada: marcar a sessao como cancelada no renderer, limpar `queue` e interromper o laco
  de `drainOpenManyQueue`.

### 7. Exportar PNG de imagem comum falha por canvas contaminado

- Arquivo: [src/components/MermaidDiagramDialog.tsx:137-152](src/components/MermaidDiagramDialog.tsx#L137-L152)
- `imageToPngDataUrl()` desenha `content.imageSrc` (tipicamente `moji-asset://local/...`) no canvas e
  chama `toDataURL()`. O protocolo `moji-asset` esta registrado como `standard`/`secure`/`supportFetchAPI`
  ([main.ts:52-55](electron/main.ts#L52-L55)) mas **sem** `corsEnabled`, portanto a origem e diferente da
  do renderer e o canvas fica contaminado.
- Efeito esperado: `SecurityError: Tainted canvases may not be exported` ao exportar qualquer imagem
  nao-Mermaid pelo visualizador.
- Correcao esperada: adicionar `corsEnabled: true` ao schema privilegiado e servir
  `Access-Control-Allow-Origin` no handler, ou ler os bytes via IPC e montar um `data:` URL antes de
  desenhar. Validar tambem SVGs que referenciam `<image href="moji-asset://...">`.
- Confirmar com um teste manual: preview -> clicar em uma imagem `.png` local -> botao de exportar.

### 8. Sincronizacao do split nunca alcanca o fim do documento

- Arquivo: [src/lib/splitScroll.ts:120-128](src/lib/splitScroll.ts#L120-L128)
- Em `editorLineForPreviewTop`, `target` e limitado a `maxScrollTop`, mas o ultimo trecho usa
  `end = { line: lines, top: contentHeight }`. Como `contentHeight > maxScrollTop`, o progresso do
  ultimo intervalo nunca chega a 1.
- Efeito: rolando o preview ate o fim, o editor para antes da ultima linha.
- Correcao esperada: para o ultimo ancoradouro, usar `maxScrollTop` como `end.top` (ou normalizar o
  progresso pelo alcance rolavel real).

---

## P2 — Casos de borda, lixo em disco, desempenho

### 9. Nomes reservados do Windows nao sao tratados na sanitizacao

- Arquivo: [electron/ipcInput.ts:64-77](electron/ipcInput.ts#L64-L77)
- `sanitizeFileNameComponent` remove caracteres invalidos e pontos finais, mas nao trata os nomes de
  dispositivo (`CON`, `PRN`, `AUX`, `NUL`, `COM1`-`COM9`, `LPT1`-`LPT9`), com ou sem extensao.
- Um documento chamado "CON" gera `CON.md`; o `writeFile` falha no Windows com erro cru mostrado ao
  usuario.
- Afeta tambem `exportBaseName` em [electron/export.ts:124-126](electron/export.ts#L124-L126).
- Correcao esperada: prefixar/sufixar quando o nome (sem extensao) casar com a lista reservada.

### 10. Arquivo `.png.tmp` fica para tras quando o `rename` final falha

- Arquivo: [electron/png.ts:188](electron/png.ts#L188)
- `finish()` fecha o handle e so entao faz `rename(temporary, destination)`. Se o destino estiver
  bloqueado ou somente leitura, o rename lanca fora do `try` que faz `closeAndUnlink()`, deixando o
  `.tmp` no diretorio escolhido pelo usuario.
- Correcao esperada: envolver o `rename` e remover o temporario em caso de falha.

### 11. `settings.json` e gravado sem atomicidade

- Arquivo: [electron/settings.ts:139-148](electron/settings.ts#L139-L148)
- `writeFileSync` direto no arquivo final. Um crash ou queda de energia no meio da gravacao deixa
  JSON truncado; `getSettings()` cai no `catch` e volta para os defaults, perdendo idioma, recentes,
  `lastDialogDirectory` e `windowBounds`.
- A gravacao acontece com frequencia (resize/move da janela, cada mudanca de configuracao), o que
  aumenta a janela de exposicao.
- Correcao esperada: aplicar o mesmo padrao `writeFileAtomic` (tmp + rename) ja usado em
  [draftStore.ts:88-96](electron/draftStore.ts#L88-L96).

### 12. Altura do documento na exportacao PNG e medida antes do `setContentSize`

- Arquivo: [electron/export.ts:474-486](electron/export.ts#L474-L486)
- `documentHeight` e lido antes de `win.setContentSize(size.width, ...)`. O reflow apos o resize pode
  mudar `scrollHeight`, mas `totalHeight` nao e remedido.
- Se o conteudo crescer, o PNG sai truncado no rodape; se encolher, sobra faixa em branco.
- Correcao esperada: aplicar `setContentSize` primeiro, aguardar `waitForPaint` e so entao medir.

### 13. Ordem do rascunho se perde quando um save chega depois do remove

- Arquivo: [electron/draftStore.ts:451-463](electron/draftStore.ts#L451-L463)
- `removeDraft` agora faz `this.order.delete(id)`. Se um autosave atrasado do mesmo id for enfileirado
  depois, `reserveOrder` atribui uma posicao nova no fim e a aba reaparece fora de ordem.
- Correcao esperada: ignorar saves para ids ja removidos na sessao, ou manter a posicao em um mapa de
  tumbas.

### 14. `getVirtualActiveHeadingId` varre todos os blocos a cada scroll

- Arquivo: [src/lib/previewVirtualization.ts:89-101](src/lib/previewVirtualization.ts#L89-L101),
  chamado em [src/components/Preview.tsx:552](src/components/Preview.tsx#L552)
- Laco linear sobre `blocks` a cada evento de rolagem do preview virtualizado, justamente no modo
  usado para documentos muito grandes.
- Correcao esperada: reaproveitar a busca binaria de `blockAtOffset` para localizar o bloco e so entao
  varrer para tras ate achar o heading.

### 15. `mapWithConcurrency` aborta o lote inteiro se o mapper lancar

- Arquivo: [electron/openPool.ts:20-33](electron/openPool.ts#L20-L33)
- `await mapper(...)` sem `try/catch`: uma rejeicao derruba o `Promise.all` e os itens restantes nunca
  sao processados nem reportados. Hoje o unico chamador captura tudo internamente, mas a utilidade e
  fragil para o proximo uso.
- Correcao esperada: capturar por item e reportar via `onResult`, ou documentar explicitamente o
  contrato de "mapper nunca rejeita".

### 16. Sessoes de "abrir varios" podem vazar no renderer

- Arquivo: [src/App.tsx:934-943](src/App.tsx#L934-L943)
- `openSessionsRef` so remove a entrada em `finishOpenManySession`, que depende de `IPC.openManyDone`.
  Se o evento nao chegar (janela recarregada, sender destruido), a entrada e a fila ficam retidas.
- Correcao esperada: limpar o mapa na desmontagem do efeito de IPC e/ou expirar sessoes antigas.

---

## P3 — Consistencia e polimento

### 17. CSP permite `img-src https:` num leitor offline

- Arquivo: [src/index.html:8](src/index.html#L8)
- Um `.md` de terceiros com `![](https://.../pixel.png)` faz o app buscar o recurso, revelando IP e
  user-agent de quem abriu o documento.
- Decidir explicitamente: manter (e documentar) ou bloquear remoto por padrao com opcao em
  Configuracoes.

### 18. Mensagens de erro do main expoem caminhos completos

- Arquivos: [electron/main.ts:200-209](electron/main.ts#L200-L209), consumidas em
  [src/App.tsx:968-978](src/App.tsx#L968-L978)
- `resolveDocumentMetadata` devolve `err.message` cru (`ENOENT: no such file or directory, stat 'D:\...'`),
  exibido direto no toast via `notice.openFailed`.
- Correcao esperada: mapear os codigos comuns (`ENOENT`, `EACCES`, `EBUSY`) para mensagens localizadas
  e guardar o texto cru so para log.

### 19. Nome do arquivo do diagrama usa indice errado no preview virtualizado

- Arquivos: [src/components/Preview.tsx:636-643](src/components/Preview.tsx#L636-L643),
  [src/components/MermaidDiagramDialog.tsx:460](src/components/MermaidDiagramDialog.tsx#L460)
- Com `showNavigation={false}` a navegacao some, mas `diagramIndex` continua sendo usado no nome
  sugerido (`arquivo-nome-N.png`). Nesse modo o indice conta apenas os diagramas montados, entao o
  `N` nao corresponde a posicao real no documento.
- Correcao esperada: derivar o indice dos blocos do documento (nao do DOM montado) ou omitir o sufixo
  quando ele nao for confiavel.

### 20. `toggleSplitView` a partir do modo leitura tem ida sem volta simetrica

- Arquivo: [src/App.tsx:1388-1400](src/App.tsx#L1388-L1400)
- Vindo de `view`, o atalho troca para `edit` e liga o split. Acionado de novo (agora em `edit`), ele
  desliga o split e deixa o usuario no editor, nao de volta em `view`.
- Confirmar se esse e o comportamento desejado; se nao, guardar o modo anterior e restaura-lo.

### 21. `.ai-framework/RULES.md` e README descrevem atualizacao automatica que nao existe

- Arquivos: [.ai-framework/RULES.md](.ai-framework/RULES.md), [README.md](README.md),
  [electron/updater.ts:60](electron/updater.ts#L60)
- Com `autoDownload = false` e o `UpdateNotice` apenas abrindo a pagina de Releases, o app **notifica**
  sobre atualizacoes; ele nao baixa nem instala. `electron-updater` nunca chama `downloadUpdate()` nem
  `quitAndInstall()`.
- Correcao esperada: ajustar a documentacao para "notificacao de atualizacao", ou implementar de fato
  o download/instalacao (`UpdateStatus` precisaria de `downloading`/`ready`).

### 22. `Ctrl+Q` no renderer usa `window.close()`

- Arquivo: [src/App.tsx:1712-1716](src/App.tsx#L1712-L1716)
- Fecha a janela em vez de passar por `requestQuit()`. No macOS, onde fechar a janela nao encerra o
  app, o atalho anunciado como "Quit" nas Configuracoes nao encerra o processo.
- Correcao esperada: expor um `requestQuit` pelo preload, ou remover `Ctrl+Q` da lista de atalhos no
  macOS (onde `Cmd+Q` ja e roteado pelo menu).

---

## Verificacao

Depois de cada correcao:

```
npm run typecheck
```

Nao ha suite de testes automatizada no projeto; os itens 1, 2, 5, 6, 7, 8 e 12 precisam de
verificacao manual no app rodando (`npm run dev`).
