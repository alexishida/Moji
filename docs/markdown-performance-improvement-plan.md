# Plano de otimização e suporte a Markdown grande

> Status: proposta técnica. Nenhuma melhoria descrita neste documento está implementada apenas por constar aqui.

## Objetivo

Tornar Moji mais rápido na inicialização, abertura, edição, visualização e exportação. Aumentar tamanho de Markdown suportado sem travamentos, picos excessivos de memória ou perda de dados.

## Estado observado

- Abertura de `.md` e `.markdown` não possui limite explícito de tamanho.
- Rascunhos sem caminho possuem limite de `10 * 1024 * 1024` caracteres.
- CodeMirror converte documento completo para `string` em cada alteração.
- React mantém conteúdo integral no estado e recalcula metadados durante edição.
- Preview e outline são recalculados mesmo quando preview não está visível.
- Markdown passa por múltiplos ciclos de parse, serialização, sanitização e criação de DOM.
- Preview injeta documento inteiro no DOM.
- Imagens locais são lidas integralmente, convertidas para base64 e enviadas por IPC.
- Abertura múltipla usa leitura concorrente sem limite.
- Exportação envia HTML completo por IPC e carrega conteúdo em uma `data:` URL.
- Conversão PNG trabalha pixel a pixel no processo principal.
- Bundle principal do renderer possui aproximadamente 4,71 MB sem compressão.
- `highlight.js` registra aproximadamente 196 linguagens no bundle principal.
- Typecheck e 71 testes existentes passam, mas não existem testes de `App`, `Editor`, `Preview`, Electron E2E ou regressão de desempenho.

## Metas propostas

Metas precisam ser calibradas após primeira rodada de benchmarks em hardware de referência.

| Perfil | Tamanho inicial | Comportamento esperado |
|---|---:|---|
| Normal | até 5 MB | Todos os recursos ativos e preview automático |
| Grande | 5–20 MB | Processamento assíncrono, debounce adaptativo e recursos caros sob demanda |
| Muito grande | acima de 20 MB | Editor primeiro, preview sob demanda e DOM virtualizado |
| Teste de resistência | 50 MB | Abrir, editar e salvar texto simples sem crash ou perda de conteúdo |

Métricas principais:

- Tempo até janela utilizável.
- Tempo de abertura por tamanho e tipo de documento.
- Latência de digitação `p50`, `p95` e pior caso.
- Tempo para alternar entre Editor e Preview.
- Memória do renderer, main process e janela de exportação.
- Tempo e pico de memória de HTML, PDF e PNG.
- Quantidade de trabalhos descartados ou obsoletos no pipeline de preview.

## Ordem recomendada

1. Medir estado atual.
2. Remover trabalho oculto no modo Editor.
3. Desacoplar digitação do estado integral React.
4. Consolidar pipeline Markdown e mover CPU pesada para worker.
5. Reformular rascunhos e IPC de arquivos grandes.
6. Reduzir custo de DOM, imagens, busca e Mermaid.
7. Otimizar exportação.
8. Reduzir bundle e custo de inicialização.
9. Adicionar testes e guardas contra regressão.

## Tasks

### Fase 0 — Benchmark e observabilidade

#### PERF-001 — Criar corpus de desempenho

- [x] Gerar documentos sintéticos de 1, 5, 20 e 50 MB sem versionar arquivos gigantes.
- [x] Cobrir texto simples, headings, código, tabelas, KaTeX, Mermaid e imagens.
- [x] Criar cenário com muitas abas abertas.
- [x] Criar cenário com arquivo contendo muitas linhas curtas.
- [x] Criar cenário com poucas linhas muito longas.

Critério de aceite:

- Corpus reproduzível por script e utilizável em benchmark local e CI dedicada.

Comando: `npm run benchmark:corpus`. Saída padrão: `.tmp/benchmark-corpus/` (ignorada pelo Git).

#### PERF-002 — Instrumentar operações principais

- [x] Adicionar `performance.mark`/`performance.measure` na abertura, parse, sanitização, outline, Mermaid e montagem do preview.
- [x] Medir latência entre transação CodeMirror e próximo frame.
- [x] Medir memória de renderer, main process e janela de exportação.
- [x] Registrar tamanho do Markdown, tamanho do HTML e quantidade de nós/blocos.
- [x] Manter telemetria local; não enviar dados do usuário.

Critério de aceite:

- Relatório local mostra tempo e memória por etapa sem registrar conteúdo do documento. Em DevTools, use `window.__mojiPerformance.getReport()`.

#### PERF-003 — Definir orçamento de desempenho

- [x] Registrar baseline do estado atual em `docs/baseline-v1.json` (`npm run benchmark:record`).
- [x] Definir hardware de referência.
- [x] Definir limites para abertura, digitação, preview, memória e exportação.
- [x] Definir tolerância de regressão para CI.

Dependência: `PERF-001`, `PERF-002`.

Documento: `docs/performance-budget.md`.

### Fase 1 — Digitação e estado React

#### PERF-101 — Parar preview oculto no modo Editor

- [x] Não executar `renderMarkdown` quando preview estiver desmontado.
- [x] Não executar `buildOutline` quando outline estiver fechado.
- [x] Em Editor com outline aberto, extrair somente headings do Markdown.
- [x] Renderizar preview ao entrar no modo Preview.
- [x] Confirmar que exportação sempre usa conteúdo mais recente.

Critério de aceite:

- Digitar no Editor não executa renderização HTML nem DOMPurify.
- Outline continua atualizando sem depender do HTML completo.

Impacto: muito alto. Esforço: médio.

#### PERF-102 — Desacoplar CodeMirror do conteúdo integral React

- [x] Manter estado CodeMirror como fonte principal enquanto documento está em edição.
- [x] Enviar imediatamente ao React somente revisão, `dirty` e metadados necessários.
- [x] Materializar `string` completa apenas para salvar, exportar, autosave, trocar aba ou gerar preview.
- [x] Preservar histórico, seleção e cursor ao trocar abas enquanto o Editor está montado.
- [x] Garantir que fechamento com alterações não salvas continue protegido.

Critério de aceite:

- Uma tecla não atualiza array completo de documentos com nova string integral.
- Salvar logo após digitar persiste conteúdo mais recente.

Impacto: muito alto. Esforço: alto.

#### PERF-103 — Representar estado sujo por revisão

- [x] Substituir comparações repetidas entre `content` e `savedContent` por revisões ou flag explícita.
- [x] Manter revisão salva, revisão editada e revisão persistida do rascunho.
- [x] Validar fluxos salvar, salvar como, descartar, fechar aba e encerrar app.

Critério de aceite:

- Renderizações React não comparam strings grandes para determinar estado sujo.

Dependência: pode ser feita junto de `PERF-102`.

#### PERF-104 — Tornar estatísticas incrementais ou ociosas

- [x] Obter linhas por `state.doc.lines`.
- [x] Obter comprimento por `state.doc.length`.
- [x] Calcular palavras e tokens após debounce ou período ocioso.
- [x] Evitar `split` e `Array.from` sobre documento inteiro por tecla.
- [x] Avaliar atualização incremental pelas regiões alteradas: `length` e `lines` vêm do estado incremental do CodeMirror; palavras/tokens exigem contexto de fronteira e seguem cálculo ocioso após 350 ms.

Critério de aceite:

- Digitação não executa contagem integral de palavras, linhas e tokens.

Impacto: alto. Esforço: baixo a médio.

#### PERF-105 — Isolar rerenders do chrome

- [x] Separar estado de documento, busca, configurações, exportação e atualização.
- [x] Evitar rerender de `TopBar`, `DocumentTabs`, `Sidebar` e `StatusBar` por cada tecla quando dados usados não mudaram.
- [x] Remover callbacks inline que invalidem memoização onde medição provar custo.
- [x] Dividir responsabilidades atualmente concentradas em `App.tsx` com hooks de estado por domínio.

Critério de aceite:

- React Profiler confirma que digitação rerenderiza somente superfícies necessárias.

### Fase 2 — Pipeline Markdown

#### PERF-201 — Fazer parse único

- [x] Alterar pipeline para produzir `{ html, outline, headingLines }` em uma passagem lógica.
- [x] Derivar outline dos tokens Markdown, não de novo `DOMParser` sobre HTML.
- [x] Guardar linha de origem de cada heading para navegação no Editor.
- [x] Eliminar novo parse ao clicar em item do outline.
- [x] Preservar IDs únicos produzidos pelo plugin de anchors.

Critério de aceite:

- Uma geração de preview não executa parse separado para outline.
- Navegação de outline no Editor não reparsa documento inteiro.

Impacto: alto. Esforço: médio.

#### PERF-202 — Resolver links e imagens durante renderização

- [x] Substituir `<template>` intermediário por regras do renderer do `markdown-it`.
- [x] Resolver URLs relativas durante emissão de tokens `image` e `link`.
- [x] Preservar sanitização final com DOMPurify.
- [x] Cobrir caminhos Windows, UNC, Linux e macOS.

Critério de aceite:

- Documento salvo sem imagens não passa por DOM intermediário apenas para resolver URLs.

#### PERF-203 — Mover CPU pesada para worker

- [x] Avaliar Web Worker, worker thread ou `utilityProcess` para Markdown, highlight e KaTeX: Web Worker atende parse/highlight; processos Node não possuem DOM para sanitização; KaTeX exige carregamento assíncrono compatível com worker.
- [x] Manter renderer livre para entrada e pintura.
- [x] Definir contrato tipado de pedido e resposta.
- [x] Não expor Node ou IPC genérico ao renderer.
- [x] Preservar sanitização antes de `dangerouslySetInnerHTML`.

Critério de aceite:

- Parse de documento grande não bloqueia digitação ou animações da UI.

Dependência: `PERF-201`.

#### PERF-204 — Implementar fila “latest wins”

- [x] Associar geração crescente a cada pedido de preview.
- [x] Descartar resultado obsoleto.
- [x] Remover trabalho ainda não iniciado quando pedido novo substituir anterior.
- [x] Impedir acúmulo de renderizações Mermaid obsoletas.
- [x] Registrar quantidade de trabalhos descartados nas métricas locais.

Critério de aceite:

- Alterações rápidas deixam no máximo trabalho atual e último pedido relevante.

#### PERF-205 — Adotar agendamento adaptativo

- [x] Manter resposta rápida para documentos pequenos.
- [x] Aumentar debounce conforme tamanho do documento.
- [x] Usar processamento sob demanda no perfil muito grande.
- [x] Não usar `startTransition` como substituto de trabalho fora da thread principal.

Critério de aceite:

- Documento grande não inicia preview novo mais rápido que pipeline consegue concluir.

### Fase 3 — DOM, imagens, busca e Mermaid

#### PERF-301 — Reduzir custo de layout fora da tela

- [x] Aplicar `content-visibility: auto` em blocos seguros do preview.
- [x] Definir `contain-intrinsic-size` para reduzir salto visual.
- [x] Medir tabelas, imagens, blocos de código e fórmulas.
- [x] Validar seleção de texto, anchors, scroll-spy e busca.

Critério de aceite:

- Documento longo reduz tempo de layout e pintura sem quebrar navegação.

Captura diagnóstica em build de produção (`docs/baseline-v1.json`): 458 tabelas montaram em 49,9 ms; 565 imagens em 42,7 ms, com 8 assets próximos carregados sob demanda; 585 blocos de código em 124,3 ms; 259 fórmulas em 195,4 ms. Testes DOM cobrem seleção atravessando código, anchors codificados, scroll-spy com bloco pulado por `content-visibility` e busca em tabela, código e fórmula.

#### PERF-302 — Implementar preview por blocos ou virtualizado

- [x] Dividir documento por blocos ou seções de primeiro nível.
- [x] Renderizar viewport com overscan no perfil muito grande.
- [x] Preservar altura estimada, scroll e navegação por heading.
- [x] Tratar busca ativa em bloco ainda não montado.
- [x] Manter exportação fora da virtualização.

Critério de aceite:

- Quantidade de nós montados fica limitada pela viewport em documento muito grande.

Captura diagnóstica em build de produção (`docs/baseline-v1.json`): o cenário de 50 MB foi dividido em 51 blocos virtuais e manteve apenas 2 montados (6 nós DOM) na viewport inicial, com montagem em 121 ms. A exportação continua solicitando uma renderização integral independente.

Dependência: iniciar somente se `PERF-301` não atingir orçamento.

#### PERF-303 — Substituir imagens base64 por protocolo local seguro

- [x] Criar protocolo interno específico para assets locais.
- [x] Autorizar somente caminhos ligados ao documento aberto.
- [x] Servir bytes sem conversão base64.
- [x] Adicionar `loading="lazy"` e `decoding="async"`.
- [x] Limitar concorrência de carregamento.
- [x] Cachear por caminho, tamanho e `mtime`.
- [x] Invalidar cache após alteração externa.

Critério de aceite:

- Imagem local não atravessa IPC como data URL.
- Imagens fora da viewport não são lidas imediatamente.

Impacto: alto em documentos com imagens. Esforço: alto.

#### PERF-304 — Otimizar busca

- [x] Evitar cópias integrais com `toLowerCase` quando busca estiver ativa.
- [x] Compartilhar resultado de busca entre contador, decoração e navegação no Editor.
- [x] Usar API do CodeMirror no Editor como fonte única de matches.
- [x] Tornar varredura do preview incremental por bloco.
- [x] Parar varredura do Editor ao atingir limite de decorações.
- [x] Preservar busca por frase atravessando elementos inline.

Critério de aceite:

- Uma mudança de termo produz uma varredura lógica, não múltiplas varreduras integrais.

Varredura do preview processa blocos em fatias de até 8 ms, com cancelamento de termo/faixa obsoletos. Teste DOM confirma frase única atravessando nós de texto dentro de elementos inline.

#### PERF-305 — Coalescer Mermaid

- [x] Manter cache atual por tema e fonte.
- [x] Cancelar ou ignorar renderizações obsoletas antes de iniciar Mermaid.
- [x] Evitar recriar DOM completo duas vezes ao concluir diagramas.
- [x] Avaliar patch apenas nos placeholders Mermaid.
- [x] Limitar concorrência e memória do cache por bytes, não somente quantidade.

Critério de aceite:

- Troca rápida de documento/tema não cria fila longa de diagramas antigos.

Preview aplica SVG sanitizado diretamente em cada `pre.mermaid-diagram-candidate`; HTML completo continua reservado à exportação. Teste DOM preserva identidade dos nós vizinhos, e benchmark registra uma única montagem não vazia do preview antes do patch Mermaid.

### Fase 4 — Arquivos, IPC e rascunhos

#### PERF-401 — Medir arquivo antes de ler

- [x] Executar `stat` antes da leitura.
- [x] Classificar documento nos perfis Normal, Grande e Muito grande.
- [x] Selecionar Editor para perfil Muito grande, sem bloquear abertura por tamanho.
- [x] Validar arquivo regular e extensão suportada.
- [x] Tratar mudança ou remoção entre `stat` e leitura.

Critério de aceite:

- Aplicação conhece tamanho antes de alocar conteúdo integral.

#### PERF-402 — Limitar abertura múltipla

- [x] Substituir `Promise.all` irrestrito por concorrência limitada (3 leituras).
- [x] Entregar documentos ao renderer progressivamente.
- [x] Manter sucessos mesmo quando outro arquivo falhar.
- [x] Exibir progresso para seleção grande.
- [x] Permitir cancelamento antes de carregar todos.

Critério de aceite:

- Pico de memória não cresce com todos os arquivos selecionados sendo lidos ao mesmo tempo.

`file:open-dialog` retorna `sessionId` assim que o diálogo fecha; cada arquivo lido é enviado ao renderer por `file:open-many-progress` conforme conclui, com `document` só quando bem-sucedido. `file:open-many-done` fecha a sessão com o resumo de erros e a flag `canceled`. Seleções com 4 ou mais arquivos exibem banner de progresso com contagem e botão cancelar; `file:open-many-cancel` aborta leituras ainda não iniciadas via `AbortSignal` repassado ao `readFile`, preservando os documentos já entregues.

#### PERF-403 — Reduzir cópias entre main e renderer

- [x] Medir custo atual de string pelo `ipcRenderer.invoke`.
- [x] Avaliar `MessagePort` com `ArrayBuffer` transferível.
- [x] Avaliar leitura em chunks e `TextDecoder` no renderer.
- [x] Garantir tratamento correto de UTF-8 e BOM entre chunks.
- [x] Manter API preload estreita e tipada.

Critério de aceite:

- Conteúdo grande não fica duplicado desnecessariamente durante entrega IPC.

Medição: `npm run benchmark:ipc` compara os transportes; as tabelas estão em `docs/performance-budget.md`. Em documento de 50 MB o pico em main cai de 240 MB para 2 MB e o payload do IPC cai de 94,9 MB para 50,1 MB. No aplicativo empacotado, a entrega completa de 50 MB — leitura, IPC, decodificação e context bridge — leva 73 ms, medida por `document:ipc-delivery`.

`ArrayBuffer` transferível foi avaliado e **não** é aplicável: o transfer list de `MessagePortMain` aceita somente `MessagePortMain`, e main e renderer são processos distintos, onde transferência sem cópia é impossível — os bytes sempre atravessam o pipe por clone estruturado. O `MessagePort` foi adotado por outro motivo: dá um canal privado por pedido, o que permite emitir chunks conforme são lidos em vez de devolver um único valor completo como `invoke` exige. É isso que mantém o pico de main constante.

Entrega atual: `readPathStream` recebe uma porta criada no preload, responde `meta`, uma sequência de `chunk` de 1 MiB e `end`. O preload decodifica com `TextDecoder` em modo streaming, que resolve sequências multibyte partidas na fronteira e consome o BOM mesmo quando seus três bytes caem em chunks diferentes; `electron/documentDecoder.test.ts` cobre todo tamanho de chunk de 1 até o documento inteiro. A API do preload não cresceu: `readPath` mantém assinatura e tipo de retorno, e apenas o `OpenResult` final atravessa o context bridge.

`doc:open` passou a enviar somente metadados, e o renderer busca o conteúdo pelo mesmo `readPath`, de modo que texto de documento cruza o processo em um único caminho. Isto mudou um contrato do main: resolver `openDocument` deixou de significar que o renderer já tem o documento, e o harness de benchmark passou a esperar a aba correspondente ficar ativa antes de interagir. A entrega de `PERF-402` continua enviando strings por sessão, com pico limitado pelas 3 leituras concorrentes.

#### PERF-404 — Separar rascunhos em arquivos

- [x] Substituir `drafts.json` com conteúdos integrais por manifesto pequeno.
- [x] Persistir conteúdo de cada rascunho em arquivo próprio.
- [x] Usar arquivo temporário e rename atômico.
- [x] Recuperar rascunhos após interrupção no meio de escrita.
- [x] Migrar `drafts.json` existente sem perda.
- [x] Remover arquivo antigo somente após migração confirmada.

Critério de aceite:

- Salvar um rascunho não serializa nem reescreve todos os demais.

Layout em `userData`: `drafts/manifest.json` guarda apenas `{ id, title }` por rascunho, e cada conteúdo vive em `drafts/<id>.md`, legível à mão se a recuperação precisar ser manual. Salvar um rascunho escreve o arquivo dele e, somente quando o título muda ou o rascunho é novo, reescreve o manifesto — os demais conteúdos nunca são reserializados. Teste dedicado grava um sentinela no arquivo de outro rascunho e confirma que ele sobrevive a um `saveDraft` vizinho.

Toda escrita usa arquivo `.tmp` e `rename`. A ordem é deliberada: em `saveDraft` o conteúdo é gravado antes do manifesto, de modo que o manifesto nunca aponta para arquivo inexistente; em `removeDraft` o manifesto é gravado antes do `unlink`. Uma interrupção em qualquer ponto deixa no máximo um arquivo órfão, e a carga seguinte remove órfãos e `.tmp` residuais, além de descartar entrada de manifesto cujo conteúdo não chegou.

Migração ocorre na primeira carga: conteúdos são gravados, o manifesto é escrito e relido para confirmação, e só então o `drafts.json` antigo é removido. Se a interrupção acontecer antes do `unlink`, a carga seguinte encontra manifesto já preenchido e descarta o legado sem sobrescrever o dado novo. `DraftStore` recebe o diretório por parâmetro, então os 12 testes rodam contra sistema de arquivos real, não contra mock.

`electron/drafts.ts` passou a ser apenas o wrapper que fornece `app.getPath('userData')`, e `main.ts` reusa `isDraft`/`isDraftId` do store em vez de repetir os limites de validação.

Migração verificada no aplicativo empacotado contra `userData` real: `drafts.json` com dois rascunhos foi convertido em `manifest.json` de 180 bytes mais dois arquivos de conteúdo, com o legado removido e o texto preservado.

Essa verificação revelou dois defeitos que os testes iniciais não pegavam. `JSON.parse` falha quando o arquivo legado tem BOM, e o tratamento desse erro apagava o arquivo — ou seja, um `drafts.json` gravado por editor que usa assinatura UTF-8 seria descartado com todos os rascunhos dentro. A leitura passou a remover BOM, reusando `stripLeadingBom`, agora exportado de `documentDecoder.ts` e compartilhado com `main.ts`. Além disso, legado ilegível deixou de ser apagado: ele é a única cópia daqueles rascunhos, então permanece no disco para recuperação manual.

#### PERF-405 — Tornar autosave incremental

- [x] Registrar mudanças CodeMirror em journal por rascunho.
- [x] Compactar journal periodicamente em snapshot.
- [x] Forçar flush ao perder foco, trocar aba e fechar app.
- [x] Serializar operações concorrentes por rascunho.
- [x] Recuperar snapshot + journal na inicialização.

Critério de aceite:

- Editar um rascunho grande não reescreve conteúdo inteiro a cada 750 ms.

Dependência: `PERF-102`, `PERF-404`.

Cada rascunho ganhou `drafts/<id>.journal`, com um array JSON por linha. O autosave envia os lotes acumulados por `drafts:append-edits`, e o custo de uma tecla passa a acompanhar o tamanho da edição, não o do documento. O snapshot só é reescrito quando o journal passa de 256 KB, quando um salvamento completo o substitui, ou quando o journal não descreve o estado atual.

Lotes não podem ser achatados: as edições de cada transação são expressas contra o texto que a transação anterior produziu, então o protocolo transporta `DraftEditPayload[][]` e aplica um lote por vez. `collectDraftEdits` isola a extração de `iterChanges`, e `src/lib/draftEdits.test.ts` roda transações reais do CodeMirror para provar que replay e editor chegam ao mesmo texto.

Segurança contra divergência: o renderer envia o comprimento esperado; se o texto reconstruído não bater, nada é gravado e o retorno é `out-of-sync`, o que faz o renderer gravar um snapshot completo. Uma entrada de journal errada corromperia todo replay futuro, então o caminho de dúvida sempre degrada para o comportamento anterior em vez de escrever. Entrada final truncada por queda é descartada, preservando tudo que veio antes.

Flush forçado ocorre ao perder foco do editor, ao trocar de aba e antes de avaliar alterações não salvas no fechamento — assim sair do app não descarta a janela entre a última tecla e o próximo tick do debounce.

Verificado no aplicativo empacotado: após digitar 40 caracteres, esperar o autosave e digitar outros 40, o snapshot permaneceu com 40 bytes e o journal recebeu 40 entradas, uma por transação. O replay do que ficou em disco reconstrói exatamente os 80 caracteres. O benchmark ganhou o cenário `draft/autosave` para manter esse caminho exercitado.

Concorrência: as filas passaram a ser por rascunho, com o manifesto serializado à parte. Isso expôs três defeitos que só aparecem com escritas paralelas, todos corrigidos e cobertos por teste: a lista compartilhada era reconstruída a partir de uma cópia lida antes de um `await`, perdendo o rascunho mais lento; a carga rodava por operação e sua limpeza de órfãos apagava o `.tmp` de outro rascunho entre `writeFile` e `rename`; e a ordem armazenada seguia a conclusão das escritas, fazendo as abas trocarem de posição entre sessões. A carga agora acontece uma única vez e a posição de cada rascunho é fixada na ordem em que foi solicitada.

#### PERF-406 — Revisar limite de rascunho

- [x] Remover limite fixo de 10 milhões de caracteres após novo armazenamento.
- [x] Definir proteção baseada em bytes, espaço disponível e orçamento de memória.
- [x] Exibir erro claro quando persistência não for possível.
- [x] Nunca truncar rascunho silenciosamente.

Critério de aceite:

- Rascunho de teste acima de 10 MB salva e restaura integralmente.

Dependência: `PERF-404`; idealmente `PERF-405`.

`isDraft` deixou de medir conteúdo: o antigo teto de 10 milhões de caracteres não correspondia a nenhum recurso real da máquina — recusava texto que caberia e aceitava texto que não caberia. Quanto se pode guardar passou a ser decidido no momento da escrita, em `electron/draftCapacity.ts`, contra os dois recursos que de fato acabam. O limite de título continua, porque título vive no manifesto reescrito por inteiro.

Orçamento de memória: todos os rascunhos somados não passam de 25% do `heap_size_limit` do V8, com piso de 128 MB para que uma heap pequena ainda aceite rascunhos muito acima do teto antigo. `DraftStore` mantém o custo de cada rascunho em bytes, então a verificação não relê a lista a cada tecla. Rascunhos já em disco são contados na carga, nunca rejeitados: texto que já é do usuário não se perde por causa do orçamento.

Espaço em disco: `statfs` responde o espaço livre do volume, e a escrita precisa caber com 32 MB de folga — a escrita atômica cria a cópia temporária enquanto o arquivo anterior ainda existe, e encher o volume até o último byte quebra bem mais que o autosave. Onde a plataforma não sabe responder, a resposta é `null` e a gravação segue: incerteza não recusa salvamento. `ENOSPC`, `EDQUOT` e `EFBIG` vindos da escrita são traduzidos para a mesma recusa, cobrindo o volume que enche entre a verificação e a gravação.

Medida única em bytes UTF-8 para os dois recursos: é exatamente o que o arquivo ocupa em disco e é igual ou maior que o custo da string no V8 — string de um byte gasta um byte por caractere, e todo caractere que o V8 guarda em dois bytes precisa de dois ou mais em UTF-8.

Recusa é integral e informativa. `DraftPersistError` carrega `{ reason, requiredBytes, availableBytes }`, o main repassa esses números em `DraftResult`/`DraftAppendResult`, e o renderer monta a mensagem por `draftFailureNotice`, dizendo quanto faltou e que nada foi cortado do texto. Nenhum caminho grava versão encurtada: escrita falha remove o `.tmp` e mantém o conteúdo anterior, o journal só recebe lote que passou na verificação, e o texto no editor continua intacto para nova tentativa depois de liberar espaço.

Testes cobrem rascunho de 12 MB salvo e restaurado caractere a caractere, recusa por orçamento com o arquivo anterior preservado e sem `.tmp` residual, orçamento compartilhado que volta a caber após remover outro rascunho, recusa por disco com os dois números, gravação normal quando o espaço livre é desconhecido, e recusa no caminho incremental sem criar journal.

### Fase 5 — Exportação

#### PERF-501 — Remover `data:` URL da exportação

- [x] Carregar HTML por arquivo temporário ou protocolo interno.
- [x] Evitar `encodeURIComponent` sobre documento integral.
- [x] Limpar temporários após sucesso, erro ou cancelamento.
- [x] Preservar resolução de assets locais.
- [x] Manter janela oculta com sandbox, isolamento e Node desativado.

Critério de aceite:

- PDF e PNG não criam cópia percent-encoded do HTML inteiro.

`createExportWindow` deu lugar a `createExportPage`, que grava o HTML em `mkdtemp('moji-export-')` e usa `loadFile`. A janela mantém `sandbox`, `contextIsolation`, `nodeIntegration: false` e `webSecurity` como antes.

Resolução de assets exigiu cuidado além de trocar o transporte. Imagens e links de Markdown já saem do renderer como `file:` absoluto, então não dependem de base alguma; o que dependia era HTML cru escrito à mão dentro do documento, com `src` relativo, que antes resolvia por `baseURLForDataURL`. Carregado de um diretório temporário, esse `src` passaria a resolver contra o temporário. Por isso a cópia entregue à janela recebe `<base href>` com o mesmo valor que `baseURLForDataURL` tinha. A cópia que o usuário exporta como HTML não recebe: o arquivo salvo continua sem caminho local dentro.

O temporário é removido em qualquer saída — sucesso, falha de renderização e falha ao carregar a própria página —, porque `release()` roda no `finally` e o construtor descarta o diretório antes de propagar o erro. Testes cobrem os três caminhos.

#### PERF-502 — Mover encoder PNG para worker

- [x] Mover conversão BGRA→RGBA para worker ou utility process.
- [x] Manter main process responsivo durante exportação.
- [x] Preservar alpha, ordem das fatias e CRC válido.
- [x] Tratar cancelamento e falha do worker.

Critério de aceite:

- Exportar PNG longo não congela janela principal.

Escolha de mecanismo: `worker_threads`, não `utilityProcess`. O deflate já roda no thread pool do libuv e nunca bloqueou; o que bloqueava era só o laço de pixels, e uma thread no mesmo processo permite entregar os bytes por `postMessage` sem atravessar um pipe. `electron/pngScanlines.ts` isola o laço, `electron/pngWorker.ts` é a entrada da thread e `electron/pngScanlineConverter.ts` é o cliente.

O laço não é opcional, então toda falha degrada em vez de propagar: worker que não inicia, worker que responde com erro e worker que morre no meio levam a conversão de volta para a thread chamadora. Uma exportação que não produz arquivo seria pior que uma que trava por um instante.

Isso decidiu a questão de copiar ou transferir. Transferir o bitmap capturado evitaria a cópia, mas o desanexa: se o worker morresse em seguida, o fallback leria um buffer vazio e gravaria uma faixa preta sem erro algum. A fatia é copiada, o `memcpy` custa muito menos que o laço que ele protege, e o teste confirma que o chamador continua com seus bytes depois da conversão. Outro teste compara a saída do worker com a da conversão local byte a byte.

Empacotamento: o build do main deixou o modo `lib` e passou a declarar dois entries, de modo que `out/main/pngWorker.js` fica ao lado de `main.js` e `new Worker` o encontra por `__dirname`. `out/**/*` já entra no pacote, então `electron-builder.yml` não mudou. O bundle do main cresceu 2 KB.

Não medido: a responsividade da janela durante uma exportação longa foi obtida por construção, não por captura. Falta uma medição com aplicativo empacotado, junto de `PERF-504`.

#### PERF-503 — Escrever PNG em streaming

- [x] Escrever assinatura e `IHDR` diretamente no destino.
- [x] Emitir múltiplos chunks `IDAT` durante deflate.
- [x] Evitar acumular todos os buffers comprimidos.
- [x] Evitar `Buffer.concat` final do PNG completo.
- [x] Finalizar com `IEND` e rename atômico.

Critério de aceite:

- Pico de memória segue tamanho de uma fatia mais buffers pequenos, não tamanho do PNG completo.

`createPngEncoder` deu lugar a `createPngFileWriter(destination)`, que abre o arquivo antes da primeira captura. O estado anterior descrevia a si mesmo como streaming, e era pela metade: convertia e comprimia fatia a fatia, mas acumulava todo o resultado do deflate em um array e terminava com `Buffer.concat` do PNG inteiro, de modo que o pico ainda acompanhava o tamanho da imagem final. Agora cada bloco que o deflate emite vira um `IDAT` escrito na hora.

O tamanho impôs a ordem da escrita. `IHDR` abre o arquivo mas a altura só é conhecida depois da última fatia, então ele é gravado com tamanho zero e reescrito no fim, sobre os mesmos 25 bytes que ocupa logo após a assinatura. O consumo do deflate usa `for await`, o que dá backpressure e garante que os `IDAT` cheguem ao arquivo na ordem em que foram comprimidos.

Bytes vão para um `.tmp` irmão do destino, renomeado só quando a imagem fecha; irmão para que o rename fique no mesmo sistema de arquivos e seja atômico. Falha em qualquer ponto chama `abort()`, que destrói o deflate e remove o parcial: uma exportação interrompida não deixa PNG truncado onde o usuário pediu uma imagem. Testes cobrem múltiplos `IDAT` com round-trip das scanlines, a ausência do destino durante a captura e a limpeza após falha, tanto no encoder quanto no caminho completo de exportação.

Dependência: pode ser feita junto de `PERF-502`.

#### PERF-504 — Adicionar progresso e cancelamento

- [x] Reportar fase: render, fontes, captura, compressão e escrita.
- [x] Reportar fatia atual/total no PNG.
- [x] Permitir cancelamento seguro.
- [x] Remover arquivo parcial após cancelamento.
- [x] Não permitir duas exportações pesadas simultâneas sem controle.

A exportação passou a ser uma sessão. `doc:export-progress` empurra `{ phase, slice, slices }` ao renderer e `doc:export-cancel` pede parada, seguindo o mesmo par de canais que `PERF-402` já usava para abertura múltipla. `ExportProgress.tsx` mostra a fase e, quando há mais de uma fatia, a contagem e a barra.

"Cancelamento seguro" definiu onde ele pode acontecer. A sessão não interrompe trabalho em andamento: ela marca a intenção, e `checkpoint()` lança em pontos onde nada está pela metade — antes de carregar a página, depois das fontes, entre fatias e antes de fechar o arquivo. No meio de uma fatia o arquivo teria linhas incompletas, então o cancelamento espera a fatia terminar. O parcial some por dois caminhos: o PNG por `writer.abort()`, que já removia seu `.tmp`; HTML e PDF por `unlink` do destino, já que ambos são escritos em uma chamada só.

Exportação simultânea é recusada, não enfileirada: cada uma segura uma janela oculta, um pipeline de captura e uma thread, e duas ao mesmo tempo tornariam o progresso exibido ambíguo. A sessão abre antes do diálogo de salvar, de modo que um segundo pedido enquanto o usuário ainda escolhe o destino também é recusado.

Não validado em execução: a UI de progresso tem cobertura de tipo e build, mas não foi exercitada com o aplicativo aberto. As fases, a contagem de fatias, a recusa de concorrência e os dois caminhos de limpeza têm teste.

#### PERF-505 — Substituir esperas fixas por confirmação de pintura

- [x] Medir necessidade dos atrasos de 50 ms.
- [x] Usar frames ou sinal determinístico após scroll/layout.
- [x] Validar última fatia e documentos com imagens/fontes.

Critério de aceite:

- Captura não repete/corta faixas e não espera além do necessário.

Os dois atrasos de 50 ms — um após `setContentSize`, outro após cada `scrollTo` — deram lugar a `waitForPaint`, que aguarda dois `requestAnimationFrame` aninhados: o primeiro dispara depois que a mudança entra no layout, o segundo quando o quadro que a carrega foi produzido. Um teto de 500 ms protege contra página que nunca agenda quadro; é rede de segurança, não o caminho esperado.

Sobre medir: 50 ms por fatia era simultaneamente desperdício e aposta. Em um documento de 30000 px são quinze fatias, ou 750 ms gastos sem relação com o que a página precisava, e em máquina lenta nada garantia que fosse suficiente. O sinal de quadro elimina os dois lados. A medição que falta é a comparação de duração ponta a ponta em aplicativo empacotado, que exige a rodada de benchmark de `PERF-703`.

A última fatia ganhou teste dedicado porque é onde a captura erra: a página para de rolar antes do fim, e a captura tem de vir de mais abaixo dentro da viewport. Com documento de 6644 px, fatia de 2048 px e rolagem travada em 4596 px, as bandas ladrilham 0–2048, 2048–4096, 4096–6144 e 6144–6644, somando exatamente a altura do documento, sem faixa repetida. Documentos com fontes continuam cobertos por `document.fonts.ready`; imagens locais são carregadas por caminho absoluto antes da captura, e o teste de exportação com imagens do corpus segue em `PERF-703`.

### Fase 6 — Inicialização e bundle

#### PERF-601 — Reduzir linguagens do highlight.js

- [x] Trocar import completo por `highlight.js/lib/core`.
- [x] Registrar conjunto comum definido pelo produto.
- [x] Importar linguagens adicionais sob demanda quando viável.
- [x] Manter fallback escapado para linguagem desconhecida.
- [x] Medir redução do bundle principal: 3,66 MB sem compressão (`npm run build`), ante aproximadamente 4,71 MB.

Critério de aceite:

- Bundle inicial não contém registro de aproximadamente 196 linguagens.

Impacto: alto na inicialização. Esforço: médio.

"Quando viável" tinha um obstáculo concreto: o gancho `highlight` do markdown-it é síncrono, então não há como buscar uma linguagem no meio da renderização. A solução é resolver antes de parsear — `registerLanguagesIn` varre as cercas do documento, importa o que falta e só então o parse começa, dentro de `renderMarkdownDocumentRawAsync`, que já esperava por KaTeX pelo mesmo motivo.

Vinte e duas linguagens de cauda longa saíram para carregamento sob demanda, cada uma virando chunk próprio (`elixir` 5,2 KB, `perl` 9,1 KB, `lua` 2,6 KB, entre outras). O bundle inicial cresceu 6,5 KB com o registro e o scanner, e em troca nenhum documento paga por linguagem que não usa. Falha de rede é engolida: o bloco cai no mesmo texto escapado que uma linguagem desconhecida já produz, em vez de derrubar a renderização inteira.

#### PERF-602 — Carregar editor e painéis pesados sob demanda

- [x] Aplicar import dinâmico no Editor.
- [x] Carregar código de exportação somente ao abrir exportação.
- [x] Avaliar carregamento tardio do visualizador Mermaid: import dinâmico já ocorre ao renderizar diagrama.
- [x] Manter preload previsível para evitar atraso ao primeiro uso.

Critério de aceite:

- Tela inicial não carrega CodeMirror e CSS/fontes de exportação antes de necessidade.

`warmLazyChunks` busca o chunk do Editor em `requestIdleCallback`, com teto de 2 s e `setTimeout` como reserva. Tirar o CodeMirror da partida resolveu a inicialização mas empurrava o custo para a primeira tecla; aquecer enquanto a janela está ociosa mantém os dois lados, e o registro de módulos garante que o `lazy` posterior não busque de novo.

O chunk de exportação (380,93 KB, com as fontes KaTeX embutidas) deliberadamente não é aquecido: exportar é ação ocasional e precedida de um diálogo, tempo mais que suficiente para buscá-lo.

#### PERF-603 — Carregar KaTeX sob demanda

- [x] Detectar presença potencial de matemática antes de carregar engine.
- [x] Separar pipeline base do pipeline matemático.
- [x] Preservar comportamento para TeX inválido.
- [x] Evitar falso negativo em documentos compatíveis: qualquer `$` aciona o pipeline matemático.

Critério de aceite:

- Documento sem matemática não carrega engine KaTeX durante preview.

#### PERF-604 — Reduzir fontes empacotadas

- [x] Manter WOFF2 onde Chromium não precisa de WOFF/TTF.
- [x] Carregar CSS com fontes embutidas de exportação somente ao exportar.
- [x] Medir renderer após build: 19 WOFF2 (256.168 bytes), sem WOFF/TTF.
- [ ] Validar KaTeX em Windows, Linux e macOS.

O CSS com fontes embutidas já estava sob demanda e faltava constatar: `virtual:katex-fonts-css` só é importado por `src/lib/exportHtml.ts`, que por sua vez só entra por `await import('./lib/exportHtml')` no momento de exportar. O build confirma a separação — o chunk `exportHtml-*.js` sai com 380,93 kB, fora do bundle inicial.

`PERF-501` tornou obsoleta a justificativa registrada no plugin `katexEmbeddedFonts`, que dizia embutir as fontes porque a exportação carregava de uma `data:` URL. O comentário foi corrigido: as fontes continuam embutidas, agora porque o HTML exportado precisa ser autossuficiente no disco do usuário.

Aberto por falta de ambiente: validação de KaTeX em Windows e Linux. Só macOS foi exercitado nesta rodada.

#### PERF-605 — Remover dependência de Google Fonts no runtime

- [ ] Usar stack do sistema.
- [x] Remover preconnect e stylesheet remotos da aplicação.
- [x] Exportar HTML sem dependência externa de fonte.
- [x] Ajustar CSP após remoção dos domínios externos.
- [x] Validar PDF/PNG offline sem espera de rede.

Critério de aceite:

- Aplicação e exportação PDF/PNG funcionam sem acesso a Google Fonts.

A validação virou teste em vez de inspeção: `src/lib/exportHtml.test.ts` afirma que o HTML gerado não cita `fonts.googleapis.com` nem `fonts.gstatic.com`, não tem `preconnect`, nenhum `link`/`script` apontando para `http(s):` e nenhum `url()` remoto em CSS — qualquer um deles faria a janela oculta esperar rede antes de capturar. Outro teste confirma que as fontes KaTeX viajam como `data:font/woff2`, e não como `url(fonts/…)` relativo, que resolveria contra o diretório onde o usuário salvou o arquivo.

Rodar isso exigiu alinhar o runner com o build: `vitest.config.ts` não conhecia `virtual:katex-fonts-css` nem `?inline`, então qualquer teste que tocasse o pipeline de exportação falhava ao importar. O runner passou a resolver o módulo virtual por um stub com regra-marcador — o que os testes precisam observar é que o conteúdo chega ao documento exportado, não um megabyte de fontes — e a habilitar `css: true`. Também passou a aceitar `*.test.tsx`, que `PERF-701` exige.

Aberto por decisão de produto: "usar stack do sistema" significaria remover o Inter empacotado, o que muda a aparência do aplicativo. O critério de aceite já é cumprido por outro caminho — o Inter é servido localmente por `@fontsource`, não pelo Google Fonts, e `--font-sans` já cai para `system-ui` em seguida. Trocar a tipografia é decisão de quem cuida do produto, não consequência de desempenho.

### Fase 7 — Testes, build e segurança

#### PERF-701 — Criar testes de componentes críticos

- [x] Testar integração entre `App` e `Editor`.
- [x] Testar que modo Editor não renderiza preview oculto.
- [x] Testar troca de aba com conteúdo ainda não materializado.
- [ ] Testar preview, busca, imagens lazy e outline.
- [x] Incluir padrão `*.test.tsx` no Vitest.

`src/App.test.tsx` monta a janela real com `window.api` inteiro em stub, escolhendo o ambiente por `@vitest-environment jsdom`, que é como o Vitest 4 seleciona ambiente por arquivo — `environmentMatchGlobs` não existe mais. Duas dependências entraram: `@testing-library/react` e `@testing-library/user-event`. O CodeMirror é substituído por um `textarea`, porque jsdom não tem as APIs de layout que ele exige e o alvo aqui é o comportamento do `App` em volta do editor.

O primeiro teste escrito falhou e apontou um resquício de `PERF-101`: com nenhum documento aberto, o `App` ainda mandava renderizar Markdown vazio, embora a tela mostrada fosse a de boas-vindas e o preview nem estivesse montado. O efeito ganhou a condição que faltava.

Coberto: montagem sem documento, restauração de rascunho da sessão anterior, uma única renderização para o documento restaurado, ausência de renderização após entrar no modo Editor, e ida e volta entre Editor e Preview preservando o texto.

Aberto: busca, imagens lazy e outline seguem sem teste de componente. Os três dependem de layout e de `IntersectionObserver`, que jsdom não fornece, e cobri-los aqui exigiria simular o que o navegador faz — é cenário para o E2E de `PERF-702`.

#### PERF-702 — Criar testes Electron E2E

- [ ] Abrir documento por diálogo, CLI, associação e drag-drop.
- [ ] Digitar, salvar, salvar como e restaurar rascunho.
- [ ] Validar fechamento com alterações não salvas.
- [ ] Validar documentos grandes nos três perfis.
- [ ] Validar exportação HTML, PDF e PNG.

#### PERF-703 — Criar benchmark de regressão

- [x] Executar corpus definido em `PERF-001`.
- [x] Comparar com baseline versionado.
- [x] Falhar somente em regressão acima da tolerância definida.
- [x] Separar benchmark sensível de suíte unitária rápida quando necessário.
- [ ] Publicar resultado como artefato de CI.

`scripts/compare-benchmark.cjs` traduz a "Política de regressão no CI" de `docs/performance-budget.md` em código, exposto como `npm run benchmark:compare`. O baseline é um despejo bruto de métricas, não o formato reduzido que o orçamento descreve, então os dois lados passam pela mesma função de agregação — mediana por métrica, maior valor de memória entre os processos — e a comparação nunca depende de como o runner por acaso gravou.

Duas regras precisavam ser explícitas para o gate valer alguma coisa. Falha exige ultrapassar o limite absoluto **e** a tolerância relativa, porque cada um sozinho é ruído ou custo já aceito: ficar 5× mais lento e ainda muito abaixo do orçamento não é regressão, e um baseline que já estava acima do orçamento não deve reprovar todo commit seguinte. Medições curtas ganham margem fixa de 10 ms antes de o percentual valer, senão oscilação de relógio reprova sozinha. Métrica ausente é reportada como não comparada, nunca convertida em aprovação — que é o que a política chama de erro de infraestrutura.

Onze testes cobrem o agregador e cada braço da decisão. Rodar o comparador contra o próprio baseline aprova e revela uma lacuna real: `editor:transaction-to-frame` não existe em `baseline-v1.json`, embora o orçamento defina limite para ele, e a memória do cenário de exportação PNG também não foi registrada. Os dois limites só passam a valer depois que uma nova captura incluir essas métricas.

Aberto: publicação como artefato depende de haver CI, o que está em `PERF-704`.

#### PERF-704 — Tornar build verificável

- [ ] Fazer build de release depender de typecheck e testes.
- [ ] Adicionar workflow real para Windows, Linux e macOS.
- [ ] Confirmar afirmações do changelog e README contra arquivos existentes.
- [ ] Evitar empacotar fixtures e artefatos de benchmark.

#### SEC-701 — Restringir capacidades de arquivo do IPC

- [x] Registrar caminhos explicitamente abertos ou escolhidos pelo usuário.
- [x] Permitir leitura de assets somente a partir de diretórios autorizados.
- [x] Impedir renderer comprometido de ler imagem arbitrária.
- [x] Impedir escrita arbitrária apenas por fornecer caminho `.md`.
- [x] Validar remetente e formato de todos os pedidos IPC.
- [x] Manter `sandbox: true`, `contextIsolation: true` e `nodeIntegration: false`.

Critério de aceite:

- APIs de arquivo operam por capacidades concedidas, sem ponte genérica ou acesso irrestrito.

`electron/fileCapabilities.ts` guarda o que o renderer pode tocar. Antes, o registro era um conjunto solto de diretórios preenchido dentro do streaming de documento, isto é, o renderer autorizava um diretório apenas pedindo para ler um arquivo dentro dele.

O furo mais sério estava na escrita: `file:save` aceitava qualquer caminho terminado em `.md`, e extensão não é autorização — bastava nomear o arquivo para sobrescrevê-lo. Agora escrever exige capacidade concedida, e `saveAs` concede o que o usuário acabou de escolher no diálogo.

Onde a concessão acontece foi a parte que exigiu correção de rumo. A primeira versão exigia capacidade também para ler, e isso quebrava dois fluxos legítimos: "abrir recente" e arrastar-e-soltar entregam ao renderer um caminho que nunca passou pelo funil do main. Ambos são maneiras reais de uma pessoa abrir um documento, então abrir passou a ser o ato que concede, e o que ficou confinado é o que vem depois — escrita e carregamento de assets.

Limite que isso deixa, dito com precisão: um renderer comprometido continua podendo ler qualquer `.md` do sistema, porque a funcionalidade exige isso, e ao lê-lo torna o diretório dele legível para imagens. O que ele não consegue mais é escrever em arquivo que ninguém abriu, nem ler imagem de diretório onde nenhum documento foi aberto. Fechar o resto exigiria rotear recentes e drop pelo main, o que centralizaria o código sem mudar a garantia, já que o caminho continuaria vindo do renderer.

Remetente: os 17 `handle` e o único `on` passaram por `handleFromRenderer`/`onFromRenderer`, que recusam o que não vem do frame principal da janela do aplicativo. A verificação ficou em um lugar só, em vez de ser presumida por cada handler. Formato já era validado por `ipcInput.ts`. As flags de segurança da janela não mudaram.

## Dependências principais

```text
PERF-001 + PERF-002
        |
        v
    PERF-003
        |
        +--> PERF-101 --> PERF-201 --> PERF-203 --> PERF-204
        |
        +--> PERF-102 --> PERF-103
        |         |
        |         +--> PERF-405 --> PERF-406
        |
        +--> PERF-401 --> PERF-402 --> PERF-403
        |
        +--> PERF-501 --> PERF-502/503 --> PERF-504
```

## Definition of Done global

- [ ] Comportamento documentado em especificações aplicáveis antes de marcar recurso como pronto.
- [ ] `npm run typecheck` passa.
- [ ] `npm test` passa.
- [ ] Testes E2E relevantes passam nos sistemas suportados.
- [ ] Benchmark não excede orçamento aprovado.
- [ ] Nenhum caminho reduz segurança do renderer ou remove sanitização.
- [ ] Fluxos salvar, autosave, descarte e fechamento não perdem conteúdo.
- [ ] Preview, outline, busca, Mermaid, imagens e exportações mantêm comportamento atual.
- [ ] README, CHANGELOG, regras e documentação de design são atualizados somente quando mudança estiver integrada.

## Resultado esperado

Após fases prioritárias, digitação deixa de depender de parse integral. Preview passa a ser assíncrono e sob demanda. Rascunhos deixam limite rígido atual. Arquivos grandes usam recursos adaptativos. Exportação deixa main process responsivo. Bundle inicial reduz. Benchmarks passam a impedir regressões futuras.
