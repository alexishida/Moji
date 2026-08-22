# Orçamento de desempenho

Este documento define o orçamento aprovado para o Moji. Ele é aplicado a builds de produção, sem DevTools abertas, com o corpus gerado por `npm run benchmark:corpus`.

## Ambiente de referência

A primeira captura deve ser feita três vezes, após reiniciar o aplicativo entre execuções, nesta máquina de referência:

| Item | Referência |
| --- | --- |
| Sistema | Windows 11 Pro x64, versão 10.0.26200 |
| CPU | AMD Ryzen 7 5800X, 8 núcleos / 16 threads |
| Memória | 32 GB |
| GPU | NVIDIA GeForce RTX 3080 |
| Armazenamento | SSD local; corpus fora de diretório sincronizado ou rede |
| Aplicativo | build empacotado de produção, Electron definido no `package-lock.json` |

Fechar processos que consumam CPU, disco ou GPU de forma relevante. Usar resolução de 1920 × 1080, escala de 100%, energia em modo equilibrado ou melhor. Registrar versão de Windows, Electron, commit, perfil de energia e qualquer desvio junto à captura.

## Captura de baseline

Baseline é mediana de três execuções completas do corpus. Cada operação começa com aplicativo recém-aberto; descartar primeira abertura quando ela incluir cache ou compilação que não ocorra em release. Coletar `window.__mojiPerformance.getReport()` após cada cenário, sem texto de documento ou caminhos.

| Cenário | Operação | Medida |
| --- | --- | --- |
| `plain-1mb.md` | abrir em Editor | `document:open` e tempo externo até editor utilizável |
| `rich-5mb.md` | abrir e mostrar Preview | `markdown:render` + `preview:mount` |
| `layout-tables.md` | montar 458 tabelas | `preview:mount` + contagem `preview:dom` |
| `layout-images.md` | montar 565 imagens e carregar somente proximidade da viewport | `preview:mount` + `preview:image-load` |
| `layout-code.md` | montar 585 blocos de código | `preview:mount` + contagem `preview:dom` |
| `layout-formulas.md` | montar 259 fórmulas KaTeX | `preview:mount` + contagem `preview:dom` |
| `plain-1mb.md` | 100 inserções sequenciais | `editor:transaction-to-frame` p50 e p95 |
| `short-lines-20mb.md` | abrir em Editor | pico de memória de renderer e main |
| `long-lines-50mb.md` | abrir, inserir, salvar | sucesso e pico de memória |
| `rich-5mb.md` | exportar HTML, PDF e PNG | duração e memória da janela de exportação |
| `many-tabs/` | abrir 24 abas | memória de renderer e main |

`docs/baseline-v1.json` contém primeira captura observada em build de produção. Recrie-a com `npm run benchmark:record`; o comando grava exports transitórios em `.tmp/benchmark-exports/`. A futura comparação de CI (`PERF-703`) deve calcular média, p50, p95 e pico de memória a partir dessas capturas. Os limites abaixo são contrato de produto.

Captura diagnóstica PERF-301 de 16/08/2026, em uma rodada local: tabelas 49,9 ms; imagens 42,7 ms; código 124,3 ms; fórmulas 195,4 ms. Valores medem `preview:mount`; servem para validar composição e instrumentação, não substituem mediana de três rodadas exigida para baseline de regressão.

## Transporte de documento entre main e renderer

`npm run benchmark:ipc` compara os dois transportes possíveis para entregar o conteúdo ao renderer. Ele modela a etapa de clone estruturado com `v8.serialize`/`v8.deserialize`, que é o mesmo algoritmo usado pelo IPC do Electron; não mede o pipe do Chromium, portanto serve para comparar transportes, não como tempo de abertura fim a fim.

Medição local de 16/08/2026, mediana de três execuções, chunk de 1 MiB, Node 25.4:

| Documento | Transporte | Total | Payload no IPC | Pico em main |
| --- | --- | ---: | ---: | ---: |
| 1 MB | string (`invoke`) | 4 ms | 1,9 MB | 4,8 MB |
| 1 MB | bytes (`MessagePort`) | 2 ms | 1,0 MB | 2,0 MB |
| 5 MB | string (`invoke`) | 19 ms | 9,5 MB | 24,0 MB |
| 5 MB | bytes (`MessagePort`) | 11 ms | 5,0 MB | 2,0 MB |
| 20 MB | string (`invoke`) | 58 ms | 38,0 MB | 96,0 MB |
| 20 MB | bytes (`MessagePort`) | 47 ms | 20,1 MB | 2,0 MB |
| 50 MB | string (`invoke`) | 134 ms | 94,9 MB | 240,0 MB |
| 50 MB | bytes (`MessagePort`) | 95 ms | 50,1 MB | 2,0 MB |

O ganho dominante é memória, não tempo. O clone estruturado de uma string com acentuação usa duas bytes por caractere, então o payload cai aproximadamente à metade ao enviar UTF-8. O pico em main deixa de acompanhar o tamanho do documento e passa a ser constante — um chunk mais sua cópia serializada — porque main nunca materializa a string completa.

Medição no aplicativo empacotado, mesma rodada de `npm run benchmark:record`. `document:open-stream` mede o lado do main; `document:ipc-delivery` mede o caminho completo visto pelo renderer, incluindo IPC, decodificação em streaming e context bridge:

| Cenário | Tamanho | Chunks | `document:open-stream` | `document:ipc-delivery` |
| --- | ---: | ---: | ---: | ---: |
| `plain-1mb.md` | 1 MB | 1 | 2 ms | 3 ms |
| `rich-5mb.md` | 5 MB | 5 | 7 ms | 9 ms |
| `short-lines-20mb.md` | 20 MB | 20 | 28 ms | 36 ms |
| `long-lines-50mb.md` | 50 MB | 50 | 65 ms | 73 ms |

## Limites absolutos

| Área | Cenário | Limite |
| --- | --- | ---: |
| Abertura | `plain-1mb.md` até editor utilizável, p95 | 1 s |
| Abertura | `rich-5mb.md` até editor utilizável, p95 | 3 s |
| Abertura | `short-lines-20mb.md` até editor utilizável, p95 | 8 s |
| Abertura | `long-lines-50mb.md` até editor utilizável, p95 | 15 s |
| Digitação | `editor:transaction-to-frame`, p95 em 1 MB | 50 ms |
| Digitação | `editor:transaction-to-frame`, p95 em 20 MB | 100 ms |
| Preview | `markdown:render` + `preview:mount`, p95 em 1 MB | 1.5 s |
| Preview | `markdown:render` + `preview:mount`, p95 em 5 MB | 5 s |
| Memória | renderer em documento de 20 MB | 1.2 GB |
| Memória | renderer + main + exportação durante cenário de 5 MB | 2.0 GB |
| Exportação | HTML de 5 MB, p95 | 5 s |
| Exportação | PDF de 5 MB, p95 | 15 s |
| Exportação | PNG de 5 MB, p95 | 20 s |
| Resistência | 50 MB: abrir, editar e salvar | sem crash, sem perda de conteúdo |

Memória usa maior valor disponível entre `usedJSHeapBytes`, memória do processo e processo de exportação. Se plataforma não expuser contador necessário, cenário registra `unsupported` e não converte ausência em zero.

## Política de regressão no CI

Benchmark roda fora da suíte unitária rápida, em executor Windows dedicado e estável. Cada cenário roda três vezes; CI compara mediana de duração e maior pico de memória contra `baseline-v1.json` gerado na mesma classe de executor.

- Duração: regressão relativa máxima de 15%.
- Memória: regressão relativa máxima de 10%.
- Picos de 0 a 50 ms têm margem fixa de 10 ms para evitar flutuação de relógio.
- CI falha somente se métrica ultrapassar limite absoluto **e** tolerância relativa. Isto mantém orçamento firme sem bloquear por ruído de executor.
- Nova baseline exige PR explícito, resultado completo anexado e justificativa. Não atualizar baseline para mascarar regressão.
- Falha por ambiente indisponível, métrica ausente ou corpus inválido é erro de infraestrutura, não aprovação automática.

## Formato mínimo de `baseline-v1.json`

```json
{
  "schemaVersion": 1,
  "commit": "<git-sha>",
  "environment": {
    "os": "Windows 11 Pro 10.0.26200 x64",
    "cpu": "AMD Ryzen 7 5800X",
    "memoryBytes": 34269659136,
    "electron": "<version>",
    "appVersion": "<version>"
  },
  "scenarios": {
    "plain-1mb/open": { "medianMs": 0, "p95Ms": 0, "peakMemoryBytes": 0 }
  }
}
```
