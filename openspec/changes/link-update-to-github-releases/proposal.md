## Why

O fluxo atual tenta baixar e instalar atualizações dentro do aplicativo, mas não funciona de forma confiável para usuários. Quando há uma versão nova, o usuário precisa de um aviso claro e de um caminho seguro para baixar a release oficial.

## What Changes

- Substituir as ações de download e instalação automática pelo redirecionamento para a página oficial de GitHub Releases do Moji.
- Manter a verificação de nova versão e mostrar um aviso global quando uma atualização estiver disponível.
- Exibir um botão azul **Atualizar** no aviso e na tela Sobre quando houver uma versão nova; ambos abrem a página de releases no navegador padrão.
- Simplificar os estados e textos de atualização, removendo progresso de download, reinício e instalação local.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `automatic-updates`: a atualização disponível passa a direcionar o usuário para GitHub Releases, sem download ou instalação gerenciados pelo aplicativo.
- `app-shell`: a API de atualização exposta ao renderer deixa de incluir operações de download e instalação locais.

## Impact

- Afeta `electron/updater.ts`, contratos IPC em `electron/shared.ts` e `electron/preload.ts`, handlers em `electron/main.ts`, `src/App.tsx`, `UpdateNotice`, `AboutDialog`, estilos e traduções.
- Mantém `electron-updater` para descobrir releases compatíveis; não adiciona dependências.
- Remove fluxo de reinício para instalação e sua integração com proteção de documentos não salvos.
