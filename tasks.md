# Tasks — Bugs encontrados

Levantamento feito sobre o estado do repositorio no commit `e4c0eab` (branch `v1.0.6`).
Correcoes aplicadas em commit(s) subsequente(s); ver status em cada item.

Legenda de severidade:

- **P0** — perda de dados ou app inutilizavel.
- **P1** — funcionalidade quebrada em fluxo real.
- **P2** — comportamento incorreto em caso de borda, lixo em disco, desempenho.
- **P3** — polimento, consistencia, documentacao.

Status: ✅ Corrigido · 🟡 Revisado, sem alteracao (decisao de produto/ambiguo) · ⛔ Nao e bug

---

## P0 — Perda de dados

### 1. ✅ Guarda de fechamento descarta alteracoes nao salvas apos 5 segundos

- Arquivos: [electron/main.ts](electron/main.ts)
- Era: `requestClose()` armava um timer fixo de 5000ms que forcava o fechamento antes mesmo do
  usuario responder ao `ConfirmDialog`.
- Corrigido: o timer fixo foi removido. O fechamento forcado agora so acontece via
  `webContents.on('unresponsive', ...)` (o proprio detector de travamento do Chromium, que so
  dispara quando a *thread principal do renderer* para de responder — nao enquanto ele
  legitimamente aguarda a escolha do usuario num dialogo) e via `render-process-gone` (crash).
  Um novo estado `closePending` substitui o timer para saber se ha um fechamento em andamento.

### 2. ✅ Crash do renderer fecha o app imediatamente, sem guarda

- Arquivo: [electron/main.ts](electron/main.ts)
- Era: `render-process-gone` sempre chamava `forceCloseOrQuit()`, mesmo fora de um fluxo de
  fechamento.
- Corrigido: so forca o fechamento quando `closePending || pendingQuit` (um close/quit ja estava
  em andamento e o renderer que devia responder morreu). Fora disso, a janela e recarregada
  (`mainWindow.reload()`) em vez de o app inteiro ser encerrado.

### 3. ✅ Compactacao de rascunho pode duplicar edicoes apos crash

- Arquivos: [electron/draftJournal.ts](electron/draftJournal.ts), [electron/draftStore.ts](electron/draftStore.ts)
- Era: `writeSnapshot()` gravava o snapshot novo e so depois removia o journal; um crash entre as
  duas operacoes deixava um journal orfao cujas edicoes o snapshot ja continha, duplicando-as no
  proximo replay.
- Corrigido: todo journal recem-criado agora comeca com um cabecalho (`encodeJournalHeader`)
  registrando o tamanho do snapshot em que foi baseado. `readContent()` descarta o journal (em
  vez de reaplica-lo) quando esse tamanho nao bate mais com o snapshot atual em disco.

---

## P1 — Funcionalidade quebrada

### 4. ✅ `checkForUpdate` nunca resolve quando a rede trava

- Arquivo: [electron/updater.ts](electron/updater.ts)
- Corrigido: `check()` agora usa `Promise.race` entre `updater.checkForUpdates()` e o timeout,
  retornando assim que qualquer um dos dois resolver.

### 5. ✅ Abrir varios arquivos pelo SO/CLI descarta todos menos um

- Arquivo: [electron/main.ts](electron/main.ts)
- Corrigido: `fileFromArgv` virou `filesFromArgv` (devolve todos os `.md` validos, nao so o
  primeiro); `pendingOpenPath` virou `pendingOpenPaths: string[]`, drenado em ordem por
  `flushPendingOpenPaths()`. `second-instance` agora abre todos os arquivos do argv, nao so um.

### 6. ✅ Cancelar "abrir varios" nao para a abertura no renderer

- Arquivo: [src/App.tsx](src/App.tsx)
- Corrigido: `OpenManySessionState` ganhou um campo `canceled`; `cancelOpenMany` marca a sessao e
  esvazia a fila local, e `drainOpenManyQueue`/o handler de progresso passam a respeitar essa
  flag em vez de continuar abrindo o que ja havia chegado.

### 7. ✅ Exportar PNG de imagem comum falha por canvas contaminado

- Arquivo: [electron/main.ts](electron/main.ts)
- Corrigido: o schema `moji-asset` agora declara `corsEnabled: true` e o handler do protocolo
  responde com `access-control-allow-origin: *`, entao desenhar uma imagem `moji-asset://` num
  canvas e depois chamar `toDataURL()` deixa de lancar `SecurityError`.

### 8. ✅ Sincronizacao do split nunca alcanca o fim do documento

- Arquivo: [src/lib/splitScroll.ts](src/lib/splitScroll.ts)
- Corrigido: em `editorLineForPreviewTop`, o ultimo trecho agora fecha em
  `{ line: lines, top: Math.max(maxScrollTop, start.top) }` em vez de `contentHeight`, entao
  rolar o preview ate o fim mapeia corretamente para a ultima linha do editor.

---

## P2 — Casos de borda, lixo em disco, desempenho

### 9. ✅ Nomes reservados do Windows nao sao tratados na sanitizacao

- Arquivo: [electron/ipcInput.ts](electron/ipcInput.ts)
- Corrigido: `sanitizeFileNameComponent` agora detecta `CON`/`PRN`/`AUX`/`NUL`/`COM0-9`/`LPT0-9`
  (com ou sem extensao, case-insensitive) e prefixa com `_`. Cobre tambem `exportBaseName` em
  `electron/export.ts`, que ja usava essa mesma funcao.

### 10. ✅ Arquivo `.png.tmp` fica para tras quando o `rename` final falha

- Arquivo: [electron/png.ts](electron/png.ts)
- Corrigido: `rename(temporary, destination)` agora esta em seu proprio `try/catch`, que remove
  o `.tmp` antes de repropagar o erro.

### 11. ✅ `settings.json` e gravado sem atomicidade

- Arquivo: [electron/settings.ts](electron/settings.ts)
- Corrigido: nova `writeFileAtomicSync` (tmp + rename) usada por `updateSettings`, no mesmo
  padrao ja usado em `draftStore.ts`.

### 12. ✅ Altura do documento na exportacao PNG e medida antes do `setContentSize`

- Arquivo: [electron/export.ts](electron/export.ts)
- Corrigido: a area de conteudo agora e ajustada para `size.width x size.height` e aguarda
  `waitForPaint` *antes* da primeira medicao de `scrollHeight`, cobrindo temas de exportacao com
  CSS relativo a altura (`vh`, `min-height: 100vh`).

### 13. ✅ Ordem do rascunho se perde quando um save chega depois do remove

- Arquivo: [electron/draftStore.ts](electron/draftStore.ts)
- Corrigido: novo `Set<string> retired` marcado sincronamente em `removeDraft`. `saveDraft` e
  `appendEdits` viram no-op para um id ja retirado, entao um autosave atrasado nao ressuscita
  mais o rascunho (nem sua posicao na lista).

### 14. ✅ `getVirtualActiveHeadingId` varre todos os blocos a cada scroll

- Arquivo: [src/lib/previewVirtualization.ts](src/lib/previewVirtualization.ts)
- Corrigido: agora usa `blockAtOffset` (busca binaria, ja existente no arquivo) para achar o
  bloco na posicao de rolagem antes de varrer para tras atras do heading mais proximo.

### 15. ✅ `mapWithConcurrency` aborta o lote inteiro se o mapper lancar

- Arquivo: [electron/openPool.ts](electron/openPool.ts)
- Corrigido: novo `onError` opcional em `MapWithConcurrencyOptions`; quando informado, uma
  rejeicao de um item e reportada e o resto do lote continua em vez de derrubar o `Promise.all`
  inteiro. Sem `onError`, o comportamento (relancar) e preservado.

### 16. 🟡 Sessoes de "abrir varios" podem vazar no renderer

- Sem alteracao de codigo alem da correcao do item 6 (que tambem fecha a sessao mais cedo em
  caso de cancelamento). Na pratica o `finally` de `runOpenManySession` sempre envia
  `IPC.openManyDone`, e o `Map` de sessoes vive no `useRef` do componente raiz — so persistiria
  "para sempre" dentro de uma mesma carga de pagina sem o evento nunca chegar, cenario que exige
  a janela ja estar sendo destruida (e o processo encerrando junto). Risco residual baixo; nao
  justificou a complexidade de um mecanismo de expiracao adicional.

---

## P3 — Consistencia e polimento

### 17. 🟡 CSP permite `img-src https:` num leitor offline

- Decisao de produto (bloquear imagens remotas por padrao vs. manter compatibilidade com
  documentos que usam badges/imagens externas). Nao alterado sem definicao do usuario.

### 18. ✅ Mensagens de erro do main expoem caminhos completos

- Arquivos: [src/lib/errorMessages.ts](src/lib/errorMessages.ts) (novo), [src/App.tsx](src/App.tsx),
  locales (`en`, `pt-BR`, `es`, `ja`, `zh`, `ru`)
- Corrigido: nova `friendlyErrorMessage()` mapeia `ENOENT`/`ENOTDIR` → "arquivo nao encontrado",
  `EACCES`/`EPERM` → "permissao negada", `EBUSY` → "arquivo em uso" (chaves localizadas em
  `notice.errorReason.*`); qualquer outro codigo tem o caminho entre aspas no final da mensagem
  removido antes de ser exibido. Aplicado em todos os pontos que exibiam `res.error`/`err.message`
  cru em `src/App.tsx`.

### 19. ✅ Nome do arquivo do diagrama usa indice errado no preview virtualizado

- Arquivo: [src/components/MermaidDiagramDialog.tsx](src/components/MermaidDiagramDialog.tsx)
- Corrigido: o sufixo numerico do nome sugerido de exportacao (`-N`) so e adicionado quando
  `showNavigation` e verdadeiro (ou seja, quando o indice realmente reflete a posicao no
  documento); no preview virtualizado o nome fica sem o numero em vez de usar um valor errado.

### 20. 🟡 `toggleSplitView` a partir do modo leitura tem ida sem volta simetrica

- Ambiguo sem definicao de produto: ficar em `edit` apos desligar o split (comportamento atual)
  e uma escolha razoavel — o usuario ainda pode estar editando, so sem o preview ao lado. Nao
  alterado.

### 21. ⛔ Nao e bug — comportamento intencional

- O app deve apenas notificar sobre atualizacoes disponiveis e levar o usuario a pagina de
  releases do GitHub para baixar manualmente; nao deve baixar/instalar sozinho. Confirmado pelo
  usuario. Nenhuma alteracao feita.

### 22. ✅ `Ctrl+Q` no renderer usa `window.close()`

- Arquivos: [electron/shared.ts](electron/shared.ts), [electron/main.ts](electron/main.ts),
  [electron/preload.ts](electron/preload.ts), [src/App.tsx](src/App.tsx)
- Corrigido: novo canal IPC `IPC.requestQuit` (renderer → main) exposto como
  `window.api.requestQuit()`, que chama a mesma `requestQuit()` guardada usada pelo menu nativo
  do macOS. `Ctrl+Q` agora passa por ali em vez de `window.close()`, que no macOS so fechava a
  janela sem encerrar o processo.

---

## Verificacao

```
npm run typecheck
```

Passou limpo apos cada rodada de correcoes acima. Nao ha suite de testes automatizada no
projeto; os itens 1, 2, 5, 6, 7, 8 e 12 continuam precisando de verificacao manual no app
rodando (`npm run dev`) antes de release.
