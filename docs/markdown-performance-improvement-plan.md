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

- [ ] Gerar documentos sintéticos de 1, 5, 20 e 50 MB sem versionar arquivos gigantes.
- [ ] Cobrir texto simples, headings, código, tabelas, KaTeX, Mermaid e imagens.
- [ ] Criar cenário com muitas abas abertas.
- [ ] Criar cenário com arquivo contendo muitas linhas curtas.
- [ ] Criar cenário com poucas linhas muito longas.

Critério de aceite:

- Corpus reproduzível por script e utilizável em benchmark local e CI dedicada.

#### PERF-002 — Instrumentar operações principais

- [ ] Adicionar `performance.mark`/`performance.measure` na abertura, parse, sanitização, outline, Mermaid e montagem do preview.
- [ ] Medir latência entre transação CodeMirror e próximo frame.
- [ ] Medir memória de renderer, main process e janela de exportação.
- [ ] Registrar tamanho do Markdown, tamanho do HTML e quantidade de nós/blocos.
- [ ] Manter telemetria local; não enviar dados do usuário.

Critério de aceite:

- Relatório local mostra tempo e memória por etapa sem registrar conteúdo do documento.

#### PERF-003 — Definir orçamento de desempenho

- [ ] Registrar baseline do estado atual.
- [ ] Definir hardware de referência.
- [ ] Definir limites para abertura, digitação, preview, memória e exportação.
- [ ] Definir tolerância de regressão para CI.

Dependência: `PERF-001`, `PERF-002`.

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

- [ ] Manter estado CodeMirror como fonte principal enquanto documento está em edição.
- [ ] Enviar imediatamente ao React somente revisão, `dirty` e metadados necessários.
- [ ] Materializar `string` completa apenas para salvar, exportar, autosave, trocar aba ou gerar preview.
- [ ] Preservar histórico, seleção e cursor ao trocar abas.
- [ ] Garantir que fechamento com alterações não salvas continue protegido.

Critério de aceite:

- Uma tecla não atualiza array completo de documentos com nova string integral.
- Salvar logo após digitar persiste conteúdo mais recente.

Impacto: muito alto. Esforço: alto.

#### PERF-103 — Representar estado sujo por revisão

- [ ] Substituir comparações repetidas entre `content` e `savedContent` por revisões ou flag explícita.
- [ ] Manter revisão salva, revisão editada e revisão persistida do rascunho.
- [ ] Validar fluxos salvar, salvar como, descartar, fechar aba e encerrar app.

Critério de aceite:

- Renderizações React não comparam strings grandes para determinar estado sujo.

Dependência: pode ser feita junto de `PERF-102`.

#### PERF-104 — Tornar estatísticas incrementais ou ociosas

- [ ] Obter linhas por `state.doc.lines`.
- [ ] Obter comprimento por `state.doc.length`.
- [x] Calcular palavras e tokens após debounce ou período ocioso.
- [x] Evitar `split` e `Array.from` sobre documento inteiro por tecla.
- [ ] Avaliar atualização incremental pelas regiões alteradas.

Critério de aceite:

- Digitação não executa contagem integral de palavras, linhas e tokens.

Impacto: alto. Esforço: baixo a médio.

#### PERF-105 — Isolar rerenders do chrome

- [ ] Separar estado de documento, busca, configurações, exportação e atualização.
- [ ] Evitar rerender de `TopBar`, `DocumentTabs`, `Sidebar` e `StatusBar` por cada tecla quando dados usados não mudaram.
- [ ] Remover callbacks inline que invalidem memoização onde medição provar custo.
- [ ] Dividir responsabilidades atualmente concentradas em `App.tsx`.

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

- [ ] Avaliar Web Worker, worker thread ou `utilityProcess` para Markdown, highlight e KaTeX.
- [ ] Manter renderer livre para entrada e pintura.
- [ ] Definir contrato tipado de pedido e resposta.
- [ ] Não expor Node ou IPC genérico ao renderer.
- [ ] Preservar sanitização antes de `dangerouslySetInnerHTML`.

Critério de aceite:

- Parse de documento grande não bloqueia digitação ou animações da UI.

Dependência: `PERF-201`.

#### PERF-204 — Implementar fila “latest wins”

- [ ] Associar geração crescente a cada pedido de preview.
- [ ] Descartar resultado obsoleto.
- [ ] Remover trabalho ainda não iniciado quando pedido novo substituir anterior.
- [ ] Impedir acúmulo de renderizações Mermaid obsoletas.
- [ ] Registrar quantidade de trabalhos descartados nas métricas locais.

Critério de aceite:

- Alterações rápidas deixam no máximo trabalho atual e último pedido relevante.

#### PERF-205 — Adotar agendamento adaptativo

- [ ] Manter resposta rápida para documentos pequenos.
- [ ] Aumentar debounce conforme bytes, linhas ou custo medido.
- [ ] Usar processamento sob demanda no perfil muito grande.
- [ ] Não usar `startTransition` como substituto de trabalho fora da thread principal.

Critério de aceite:

- Documento grande não inicia preview novo mais rápido que pipeline consegue concluir.

### Fase 3 — DOM, imagens, busca e Mermaid

#### PERF-301 — Reduzir custo de layout fora da tela

- [ ] Aplicar `content-visibility: auto` em blocos seguros do preview.
- [ ] Definir `contain-intrinsic-size` para reduzir salto visual.
- [ ] Medir tabelas, imagens, blocos de código e fórmulas.
- [ ] Validar seleção de texto, anchors, scroll-spy e busca.

Critério de aceite:

- Documento longo reduz tempo de layout e pintura sem quebrar navegação.

#### PERF-302 — Implementar preview por blocos ou virtualizado

- [ ] Dividir documento por blocos ou seções de primeiro nível.
- [ ] Renderizar viewport com overscan no perfil muito grande.
- [ ] Preservar altura estimada, scroll e navegação por heading.
- [ ] Tratar busca ativa em bloco ainda não montado.
- [ ] Manter exportação fora da virtualização.

Critério de aceite:

- Quantidade de nós montados fica limitada pela viewport em documento muito grande.

Dependência: iniciar somente se `PERF-301` não atingir orçamento.

#### PERF-303 — Substituir imagens base64 por protocolo local seguro

- [ ] Criar protocolo interno específico para assets locais.
- [ ] Autorizar somente caminhos ligados ao documento aberto.
- [ ] Servir bytes sem conversão base64.
- [ ] Adicionar `loading="lazy"` e `decoding="async"`.
- [ ] Limitar concorrência de carregamento.
- [ ] Cachear por caminho, tamanho e `mtime`.
- [ ] Invalidar cache após alteração externa.

Critério de aceite:

- Imagem local não atravessa IPC como data URL.
- Imagens fora da viewport não são lidas imediatamente.

Impacto: alto em documentos com imagens. Esforço: alto.

#### PERF-304 — Otimizar busca

- [ ] Evitar cópias integrais com `toLowerCase` quando busca estiver ativa.
- [ ] Compartilhar resultado de busca entre contador, decoração e navegação.
- [ ] Usar API do CodeMirror no Editor como fonte única de matches.
- [ ] Tornar varredura do preview incremental por bloco.
- [ ] Parar varredura ao atingir limite, sem montar primeiro todos os grupos de texto.
- [ ] Preservar busca por frase atravessando elementos inline.

Critério de aceite:

- Uma mudança de termo produz uma varredura lógica, não múltiplas varreduras integrais.

#### PERF-305 — Coalescer Mermaid

- [ ] Manter cache atual por tema e fonte.
- [ ] Cancelar ou ignorar renderizações obsoletas antes de iniciar Mermaid.
- [ ] Evitar recriar DOM completo duas vezes ao concluir diagramas.
- [ ] Avaliar patch apenas nos placeholders Mermaid.
- [ ] Limitar concorrência e memória do cache por bytes, não somente quantidade.

Critério de aceite:

- Troca rápida de documento/tema não cria fila longa de diagramas antigos.

### Fase 4 — Arquivos, IPC e rascunhos

#### PERF-401 — Medir arquivo antes de ler

- [ ] Executar `stat` antes da leitura.
- [ ] Classificar documento nos perfis Normal, Grande e Muito grande.
- [ ] Exibir modo escolhido sem bloquear arquivo apenas pelo tamanho.
- [ ] Validar arquivo regular e extensão suportada.
- [ ] Tratar mudança ou remoção entre `stat` e leitura.

Critério de aceite:

- Aplicação conhece tamanho antes de alocar conteúdo integral.

#### PERF-402 — Limitar abertura múltipla

- [ ] Substituir `Promise.all` irrestrito por concorrência limitada.
- [ ] Entregar documentos ao renderer progressivamente.
- [ ] Manter sucessos mesmo quando outro arquivo falhar.
- [ ] Exibir progresso para seleção grande.
- [ ] Permitir cancelamento antes de carregar todos.

Critério de aceite:

- Pico de memória não cresce com todos os arquivos selecionados sendo lidos ao mesmo tempo.

#### PERF-403 — Reduzir cópias entre main e renderer

- [ ] Medir custo atual de string pelo `ipcRenderer.invoke`.
- [ ] Avaliar `MessagePort` com `ArrayBuffer` transferível.
- [ ] Avaliar leitura em chunks e `TextDecoder` no renderer.
- [ ] Garantir tratamento correto de UTF-8 e BOM entre chunks.
- [ ] Manter API preload estreita e tipada.

Critério de aceite:

- Conteúdo grande não fica duplicado desnecessariamente durante entrega IPC.

#### PERF-404 — Separar rascunhos em arquivos

- [ ] Substituir `drafts.json` com conteúdos integrais por manifesto pequeno.
- [ ] Persistir conteúdo de cada rascunho em arquivo próprio.
- [ ] Usar arquivo temporário e rename atômico.
- [ ] Recuperar rascunhos após interrupção no meio de escrita.
- [ ] Migrar `drafts.json` existente sem perda.
- [ ] Remover arquivo antigo somente após migração confirmada.

Critério de aceite:

- Salvar um rascunho não serializa nem reescreve todos os demais.

#### PERF-405 — Tornar autosave incremental

- [ ] Registrar mudanças CodeMirror em journal por rascunho.
- [ ] Compactar journal periodicamente em snapshot.
- [ ] Forçar flush ao perder foco, trocar aba e fechar app.
- [ ] Serializar operações concorrentes por rascunho.
- [ ] Recuperar snapshot + journal na inicialização.

Critério de aceite:

- Editar um rascunho grande não reescreve conteúdo inteiro a cada 750 ms.

Dependência: `PERF-102`, `PERF-404`.

#### PERF-406 — Revisar limite de rascunho

- [ ] Remover limite fixo de 10 milhões de caracteres após novo armazenamento.
- [ ] Definir proteção baseada em bytes, espaço disponível e orçamento de memória.
- [ ] Exibir erro claro quando persistência não for possível.
- [ ] Nunca truncar rascunho silenciosamente.

Critério de aceite:

- Rascunho de teste acima de 10 MB salva e restaura integralmente.

Dependência: `PERF-404`; idealmente `PERF-405`.

### Fase 5 — Exportação

#### PERF-501 — Remover `data:` URL da exportação

- [ ] Carregar HTML por arquivo temporário ou protocolo interno.
- [ ] Evitar `encodeURIComponent` sobre documento integral.
- [ ] Limpar temporários após sucesso, erro ou cancelamento.
- [ ] Preservar resolução de assets locais.
- [ ] Manter janela oculta com sandbox, isolamento e Node desativado.

Critério de aceite:

- PDF e PNG não criam cópia percent-encoded do HTML inteiro.

#### PERF-502 — Mover encoder PNG para worker

- [ ] Mover conversão BGRA→RGBA para worker ou utility process.
- [ ] Manter main process responsivo durante exportação.
- [ ] Preservar alpha, ordem das fatias e CRC válido.
- [ ] Tratar cancelamento e falha do worker.

Critério de aceite:

- Exportar PNG longo não congela janela principal.

#### PERF-503 — Escrever PNG em streaming

- [ ] Escrever assinatura e `IHDR` diretamente no destino.
- [ ] Emitir múltiplos chunks `IDAT` durante deflate.
- [ ] Evitar acumular todos os buffers comprimidos.
- [ ] Evitar `Buffer.concat` final do PNG completo.
- [ ] Finalizar com `IEND` e rename atômico.

Critério de aceite:

- Pico de memória segue tamanho de uma fatia mais buffers pequenos, não tamanho do PNG completo.

Dependência: pode ser feita junto de `PERF-502`.

#### PERF-504 — Adicionar progresso e cancelamento

- [ ] Reportar fase: render, fontes, captura, compressão e escrita.
- [ ] Reportar fatia atual/total no PNG.
- [ ] Permitir cancelamento seguro.
- [ ] Remover arquivo parcial após cancelamento.
- [ ] Não permitir duas exportações pesadas simultâneas sem controle.

#### PERF-505 — Substituir esperas fixas por confirmação de pintura

- [ ] Medir necessidade dos atrasos de 50 ms.
- [ ] Usar frames ou sinal determinístico após scroll/layout.
- [ ] Validar última fatia e documentos com imagens/fontes.

Critério de aceite:

- Captura não repete/corta faixas e não espera além do necessário.

### Fase 6 — Inicialização e bundle

#### PERF-601 — Reduzir linguagens do highlight.js

- [ ] Trocar import completo por `highlight.js/lib/core`.
- [ ] Registrar conjunto comum definido pelo produto.
- [ ] Importar linguagens adicionais sob demanda quando viável.
- [ ] Manter fallback escapado para linguagem desconhecida.
- [ ] Medir redução do bundle principal.

Critério de aceite:

- Bundle inicial não contém registro de aproximadamente 196 linguagens.

Impacto: alto na inicialização. Esforço: médio.

#### PERF-602 — Carregar editor e painéis pesados sob demanda

- [ ] Aplicar import dinâmico no Editor.
- [ ] Carregar código de exportação somente ao abrir exportação.
- [ ] Avaliar carregamento tardio do visualizador Mermaid.
- [ ] Manter preload previsível para evitar atraso ao primeiro uso.

Critério de aceite:

- Tela inicial não carrega CodeMirror e CSS/fontes de exportação antes de necessidade.

#### PERF-603 — Carregar KaTeX sob demanda

- [ ] Detectar presença potencial de matemática antes de carregar engine.
- [ ] Separar pipeline base do pipeline matemático.
- [ ] Preservar comportamento para TeX inválido.
- [ ] Evitar falso negativo em documentos compatíveis.

Critério de aceite:

- Documento sem matemática não carrega engine KaTeX durante preview.

#### PERF-604 — Reduzir fontes empacotadas

- [ ] Manter WOFF2 onde Chromium não precisa de WOFF/TTF.
- [ ] Carregar CSS com fontes embutidas de exportação somente ao exportar.
- [ ] Medir tamanho do renderer e instaladores.
- [ ] Validar KaTeX em Windows, Linux e macOS.

#### PERF-605 — Remover dependência de Google Fonts no runtime

- [ ] Usar fonte local empacotada ou stack do sistema.
- [ ] Remover preconnect e stylesheet remotos da aplicação.
- [ ] Definir política para HTML exportado portátil/offline.
- [ ] Ajustar CSP após remoção dos domínios externos.
- [ ] Validar PDF/PNG offline sem espera de rede.

Critério de aceite:

- Aplicação e exportação PDF/PNG funcionam sem acesso a Google Fonts.

### Fase 7 — Testes, build e segurança

#### PERF-701 — Criar testes de componentes críticos

- [ ] Testar integração entre `App` e `Editor`.
- [ ] Testar que modo Editor não renderiza preview oculto.
- [ ] Testar troca de aba com conteúdo ainda não materializado.
- [ ] Testar preview, busca, imagens lazy e outline.
- [ ] Incluir padrão `*.test.tsx` no Vitest.

#### PERF-702 — Criar testes Electron E2E

- [ ] Abrir documento por diálogo, CLI, associação e drag-drop.
- [ ] Digitar, salvar, salvar como e restaurar rascunho.
- [ ] Validar fechamento com alterações não salvas.
- [ ] Validar documentos grandes nos três perfis.
- [ ] Validar exportação HTML, PDF e PNG.

#### PERF-703 — Criar benchmark de regressão

- [ ] Executar corpus definido em `PERF-001`.
- [ ] Comparar com baseline versionado.
- [ ] Falhar somente em regressão acima da tolerância definida.
- [ ] Separar benchmark sensível de suíte unitária rápida quando necessário.
- [ ] Publicar resultado como artefato de CI.

#### PERF-704 — Tornar build verificável

- [ ] Fazer build de release depender de typecheck e testes.
- [ ] Adicionar workflow real para Windows, Linux e macOS.
- [ ] Confirmar afirmações do changelog e README contra arquivos existentes.
- [ ] Evitar empacotar fixtures e artefatos de benchmark.

#### SEC-701 — Restringir capacidades de arquivo do IPC

- [ ] Registrar caminhos explicitamente abertos ou escolhidos pelo usuário.
- [ ] Permitir leitura de assets somente a partir de diretórios autorizados.
- [ ] Impedir renderer comprometido de ler imagem arbitrária.
- [ ] Impedir escrita arbitrária apenas por fornecer caminho `.md`.
- [ ] Validar remetente e formato de todos os pedidos IPC.
- [ ] Manter `sandbox: true`, `contextIsolation: true` e `nodeIntegration: false`.

Critério de aceite:

- APIs de arquivo operam por capacidades concedidas, sem ponte genérica ou acesso irrestrito.

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
