## 1. Contratos, configurações e segredos

- [ ] 1.1 Definir tipos de idioma, `TranslationRequest`/`TranslationResult`, estados e canais IPC em `electron/shared.ts`.
- [ ] 1.2 Estender configurações com endpoint, modelo e preferências não sensíveis, defaults e validação em `electron/settings.ts`.
- [ ] 1.3 Criar armazenamento de credencial no processo principal com `safeStorage`, fallback somente de sessão e remoção segura.
- [ ] 1.4 Adicionar handlers IPC de configuração, teste e tradução com validação de endpoint, host, timeout, modelo, idiomas e tamanho do Markdown.
- [ ] 1.5 Expor API de tradução mínima e tipada em `electron/preload.ts` e `src/types/api.d.ts`, sem expor chave nem IPC genérico.

## 2. Cliente de tradução seguro

- [ ] 2.1 Implementar cliente principal para endpoint OpenAI Chat Completions compatível, resposta JSON estruturada e instruções de preservação de Markdown.
- [ ] 2.2 Implementar timeout e cancelamento com `AbortController`, limpeza de requisições pendentes e mapeamento de erros sem dados sensíveis.
- [ ] 2.3 Definir constante central de limite de documento e validar resposta traduzida antes de devolvê-la ao renderer.
- [ ] 2.4 Cobrir cliente, validação de IPC, armazenamento de segredo e casos de falha com testes unitários.

## 3. Configuração e interface de tradução

- [ ] 3.1 Adicionar seção localizada de tradução em Configurações para endpoint, modelo, status de credencial, salvar/remover e testar conexão.
- [ ] 3.2 Criar `TranslationDialog`/painel inline seguindo chrome de modais existente, com origem automática/manual, destino, detecção, confiança, progresso, cancelar e erros.
- [ ] 3.3 Adicionar ação Traduzir no `TopBar`, disponibilidade por documento/modo e orientação para Configurações quando necessário.
- [ ] 3.4 Adicionar estado temporário de tradução por aba em `App.tsx`, integrar chamada IPC e invalidar resultado se conteúdo fonte mudar.
- [ ] 3.5 Estender preview para comparação original/tradução responsiva, rótulos acessíveis e alternância em janelas estreitas.
- [ ] 3.6 Implementar copiar para clipboard e aplicar no editor com confirmação, dirty state, bloqueio para documento somente leitura e limpeza do resultado temporário.
- [ ] 3.7 Adicionar mensagens em todos arquivos `src/locales/` e estilos por tokens em `src/styles/app.css`.

## 4. Verificação e documentação

- [ ] 4.1 Testar fluxos de origem detectada, confiança baixa, origem manual, sucesso, cancelamento, timeout, resposta inválida e configuração ausente.
- [ ] 4.2 Testar preservação de front matter, URLs, código, fórmulas e Mermaid no contrato enviado ao provedor.
- [ ] 4.3 Testar revisão responsiva, cópia, aplicação confirmada, documento somente leitura e invalidação após edição.
- [ ] 4.4 Atualizar README e `.ai-framework/DESIGN.md` com configuração, fluxo e componentes efetivamente implementados.
- [ ] 4.5 Executar `npm run typecheck` e `npm test` e corrigir regressões.
