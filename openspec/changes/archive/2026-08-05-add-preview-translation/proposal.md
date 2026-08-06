## Why

Leitores de documentos Markdown em outro idioma precisam sair do Moji, copiar conteúdo e correr risco de perder formatação para entendê-lo. Tradução revisável dentro do workspace reduz essa interrupção sem substituir documento original por acidente.

## What Changes

- Adicionar ação **Traduzir** para documento aberto, acessível no modo de visualização.
- Abrir painel inline com idioma de origem detectado e uma seleção que permite corrigi-lo, além do idioma de destino; idioma da interface é apenas sugestão de destino, nunca alteração implícita.
- Traduzir Markdown preservando estrutura e mostrar resultado em prévia isolada, lado a lado quando houver espaço e em painel alternável em janelas estreitas.
- Permitir copiar resultado ou aplicá-lo ao editor somente após confirmação; aplicar substitui conteúdo da aba, entra em modo de edição e passa pelo fluxo existente de alterações não salvas.
- Permitir usuário configurar endpoint compatível de tradução e sua credencial localmente. Sem configuração, painel explica pré-requisito e oferece atalho para Configurações; nenhuma credencial ou provedor público é embutido.
- Tratar estados de detecção incerta, tradução em andamento, falha, cancelamento e documento somente leitura de forma explícita e localizada.

## Capabilities

### New Capabilities

- `document-translation`: Detecção, solicitação, revisão e aplicação segura de traduções de documentos Markdown.

### Modified Capabilities

<!-- Nenhuma. Requisitos existentes de edição e internacionalização continuam valendo; integração é definida pela nova capacidade. -->

## Impact

- Renderer: `App.tsx`, `TopBar`, novo painel de tradução, estilos e mensagens em todos locale JSON.
- IPC seguro: contratos em `electron/shared.ts`, ponte limitada em `preload.ts`, validação e cliente HTTP no processo principal; renderer não recebe chave ou acesso genérico a IPC.
- Configurações: endpoint e preferências de tradução persistidos; segredo fica em armazenamento seguro do sistema ou é solicitado por sessão, nunca salvo em texto simples no `settings.json`.
- Testes de validação de entrada, estados de UI e preservação de Markdown. Pode exigir camada de credenciais do SO; nenhuma dependência de provedor de tradução é pressuposta.
