## Context

Moji é um desktop app Electron para ler e editar Markdown. Hoje o preview renderiza somente `document.content`; edições afetam a mesma aba, geram estado dirty e usam confirmação antes de descarte. O app não possui cliente de tradução, nem dependência de provedor ou armazenamento de segredo. Renderer é sandboxed e só pode alcançar recursos nativos por API tipada no preload.

Usuário precisa entender Markdown em outro idioma sem exportar/copiá-lo para outro serviço e sem que uma resposta de IA substitua original automaticamente. Feature precisa respeitar Markdown, documentos somente leitura, localização atual e estado de alterações não salvas.

## Goals / Non-Goals

**Goals:**

- Dar caminho claro de visualização: abrir tradução, confirmar/ajustar idioma, ler resultado, decidir copiar ou aplicar.
- Detectar idioma de origem por padrão, mas manter controle humano sobre origem e destino.
- Preservar estrutura Markdown e nunca mutar documento antes de ação explícita de aplicar.
- Manter chave fora do renderer e fora de `settings.json` em texto simples.
- Funcionar com serviço local ou remoto compatível, sem acoplar Moji a um fornecedor.

**Non-Goals:**

- Tradução offline, em streaming, por seleção parcial ou em lote entre abas.
- Edição inline da prévia traduzida, memória de traduções ou comparação por diff.
- Traduzir interface do app, diagramas Mermaid, blocos de código, URLs ou valores de front matter.
- Oferecer conta, cobrança ou credencial própria do Moji.

## Decisions

### Painel de revisão no workspace

`TopBar` recebe botão Traduzir, habilitado somente com documento aberto. Clique abre painel inline no padrão `.export-dialog`, sem trocar modo da aba. Painel exibe origem (`Detectar automaticamente` inicialmente), destino, idioma de origem confirmado/declarado, controles Traduzir/Cancelar e estado.

Resultado bem-sucedido fica em estado temporário por aba, associado ao hash do conteúdo enviado, origem e destino. Preview passa a renderizar resultado temporário e identifica claramente “Tradução — <idioma>”; original continua recuperável com “Ver original”. Em largura suficiente, original e tradução ficam lado a lado; sob largura mínima, controle alterna uma visualização por vez. Resultado obsoleto após qualquer edição no documento é descartado, em vez de ser mostrado como atual.

Alternativa: substituir preview imediatamente. Rejeitada: oculta origem, dificulta revisão e torna erro de tradução menos visível.

### Aplicar é uma mutação explícita

“Copiar tradução” escreve somente clipboard. “Aplicar no editor” pede confirmação contendo idioma alvo e avisa que o conteúdo da aba será substituído. Ao confirmar, `App` atualiza `document.content`, marca aba dirty, remove resultado temporário e muda para editor. Documento somente leitura oferece apenas visualizar e copiar; aplicar fica desabilitado com explicação.

Alternativa: criar nova aba traduzida. Rejeitada para v1: cria problema de título, caminho, estado dirty e expectativa de salvar; copiar permite esse fluxo sem ampliar modelo de documentos.

### Idiomas: automático com correção humana

Origem aceita `auto` e os seis idiomas já enviados pelo app (`en`, `pt-BR`, `es`, `ja`, `zh`, `ru`). Destino usa mesmos seis e exclui origem efetiva; idioma de interface é sugestão inicial, nunca destino automático. Se `auto` for usado, backend retorna idioma detectado e uma confiança normalizada. Confiança baixa mostra aviso e exige que usuário confirme ou escolha origem antes de enviar tradução. Campo manual também cobre identificações erradas.

Alternativa: detectar e traduzir em um clique. Rejeitada: tradução de idioma curto, misto ou ambíguo tende a falhar sem feedback.

### Cliente de provedor compatível, no processo principal

Definir `TranslationRequest`/`TranslationResult` em `electron/shared.ts` e uma operação IPC estreita `translateDocument`. Preload expõe somente essa operação; main valida tamanho do documento, enum de idioma, URL HTTPS ou loopback HTTP, modelo e timeout antes de fazer `fetch`. Configuração define URL de endpoint compatível com OpenAI Chat Completions e identificador de modelo. Solicitação exige resposta JSON com `translatedMarkdown`, `detectedSourceLanguage` e `confidence` e instrui modelo a manter front matter, URLs, inline/fenced code, math e Mermaid sem tradução.

Alternativa: chamar provedor direto do renderer. Rejeitada: vaza chave, quebra isolamento e permite acesso de rede mais amplo a contexto não confiável. Alternativa: embutir serviço público. Rejeitada: cria custo, risco de privacidade e dependência operacional sem consentimento.

### Credencial segura e configuração separada

`Settings` armazena apenas endpoint, modelo e preferências não sensíveis. Main usa `safeStorage` para cifrar segredo em arquivo separado sob `userData`; se criptografia do SO não estiver disponível, solicita chave para sessão e informa que ela não será lembrada. Tela Configurações mostra status da credencial, permite salvar/remover e testar conexão. Chave nunca aparece em estado React, logs, resultados IPC ou mensagens de erro.

Alternativa: guardar API key no `settings.json`. Rejeitada: é texto simples e viola expectativa de segredo local.

## Risks / Trade-offs

- [Markdown retornado inválido ou estrutura alterada] → Validar presença de resposta, manter original intacto, avisar usuário e permitir apenas copiar/aplicar resultado explicitamente; testes usam documentos com código, Mermaid e front matter.
- [Idioma detectado incorretamente] → Mostrar idioma/confiança, alertar para confiança baixa e oferecer seleção manual antes de traduzir.
- [Texto confidencial sai do dispositivo] → Exigir configuração consciente do endpoint, mostrar destino do serviço no painel e não incluir provedor implícito.
- [Endpoint lento, indisponível ou resposta malformada] → Timeout, cancelamento via `AbortController`, mensagens localizadas e preservação de resultado anterior válido.
- [Chave não pode ser cifrada em Linux] → Preferir credencial de sessão a persistência insegura e deixar esse estado visível.
- [Documento grande excede limite de contexto] → Aplicar limite de tamanho configurado/validado e explicar erro sem enviar fragmento silenciosamente.

## Migration Plan

1. Adicionar campos de configuração não sensíveis com defaults que deixam tradução desconfigurada.
2. Introduzir armazenamento separado de segredo e IPC, mantendo documentos e `settings.json` existentes compatíveis.
3. Entregar painel desabilitado guiando para Configurações até endpoint e credencial válidos existirem.
4. Rollback remove UI e IPC novos; configurações desconhecidas permanecem ignoradas por versões anteriores e segredo pode ser apagado manualmente pelo app.

## Open Questions

- Limite inicial de caracteres/tokens deve ser definido após escolher modelos suportados; implementar constante central, não limite solto na UI.
- Teste de conexão deve validar somente autenticação/endpoint ou também executar tradução curta; preferência inicial: chamada mínima sem enviar documento do usuário.
