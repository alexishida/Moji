/** Built-in Markdown guide, opened from the status bar "Guide" link. */
const GUIDE_MARKDOWN = {
  en: `# Markdown Guide

Use this guide as a quick reference while writing or reviewing Markdown.

## Document structure

Use headings to organize content. The outline uses these headings for navigation.

~~~markdown
# Page title
## Main section
### Detail section
~~~

## Text formatting

- \`*italic*\` renders as *italic*
- \`**bold**\` renders as **bold**
- \`***bold italic***\` combines both
- \`~~deleted text~~\` renders as deleted text when supported
- \`npm run typecheck\` highlights short code or commands

## Lists

~~~markdown
- Bulleted item
- Another item
  - Nested item

1. First step
2. Second step
3. Third step
~~~

## Task lists

~~~markdown
- [x] Done
- [ ] To do
- [ ] Waiting for review
~~~

## Links and images

~~~markdown
[OpenAI](https://openai.com)
![Alt text for the image](image.png)
~~~

Use clear link text and describe images with useful alt text.

## Quotes and separators

~~~markdown
> A blockquote is useful for citations, notes, and callouts.

---
~~~

## Code blocks

Add the language name after the opening fence for syntax highlighting.

~~~markdown
\`\`\`ts
function preview(markdown: string) {
  return renderMarkdown(markdown)
}
\`\`\`
~~~

## Tables

~~~markdown
| Feature | Status | Notes |
|---------|:------:|-------|
| Tables  | Yes    | Good for comparisons |
| Tasks   | Yes    | Useful for checklists |
~~~

## HTML safety

Raw HTML can be written in Markdown, but unsafe tags and attributes are sanitized before preview and export.

## Fast checklist

- Start with one \`#\` title
- Keep heading levels in order
- Use blank lines between sections
- Add alt text to images
- Use fenced code blocks for multi-line code
- Preview before exporting to HTML, PDF, or PNG
`,
  'pt-BR': `# Guia de Markdown

Use este guia como referência rápida enquanto escreve ou revisa Markdown.

## Estrutura do documento

Use títulos para organizar o conteúdo. O sumário usa esses títulos para navegação.

~~~markdown
# Título da página
## Seção principal
### Seção de detalhe
~~~

## Formatação de texto

- \`*itálico*\` vira *itálico*
- \`**negrito**\` vira **negrito**
- \`***negrito e itálico***\` combina os dois
- \`~~texto removido~~\` vira texto removido quando suportado
- \`npm run typecheck\` destaca comandos ou trechos curtos

## Listas

~~~markdown
- Item com marcador
- Outro item
  - Item aninhado

1. Primeiro passo
2. Segundo passo
3. Terceiro passo
~~~

## Listas de tarefas

~~~markdown
- [x] Concluído
- [ ] A fazer
- [ ] Aguardando revisão
~~~

## Links e imagens

~~~markdown
[OpenAI](https://openai.com)
![Texto alternativo da imagem](imagem.png)
~~~

Use textos de link claros e descreva imagens com texto alternativo útil.

## Citações e separadores

~~~markdown
> Uma citação é útil para referências, notas e destaques.

---
~~~

## Blocos de código

Adicione o nome da linguagem depois da cerca inicial para ativar destaque de sintaxe.

~~~markdown
\`\`\`ts
function preview(markdown: string) {
  return renderMarkdown(markdown)
}
\`\`\`
~~~

## Tabelas

~~~markdown
| Recurso | Status | Observações |
|---------|:------:|-------------|
| Tabelas | Sim    | Boas para comparações |
| Tarefas | Sim    | Úteis para checklists |
~~~

## Segurança de HTML

HTML puro pode ser escrito no Markdown, mas tags e atributos inseguros são sanitizados antes da visualização e exportação.

## Checklist rápido

- Comece com um título \`#\`
- Mantenha a ordem dos níveis de título
- Use linhas em branco entre seções
- Adicione texto alternativo nas imagens
- Use blocos cercados para código com várias linhas
- Revise antes de exportar para HTML, PDF ou PNG
`,
  es: `# Guía de Markdown

Usa esta guía como referencia rápida mientras escribes o revisas Markdown.

## Estructura del documento

Usa encabezados para organizar el contenido. El esquema usa esos encabezados para navegar.

~~~markdown
# Título de la página
## Sección principal
### Sección de detalle
~~~

## Formato de texto

- \`*cursiva*\` se muestra como *cursiva*
- \`**negrita**\` se muestra como **negrita**
- \`***negrita y cursiva***\` combina ambos
- \`~~texto eliminado~~\` se muestra como texto eliminado cuando está disponible
- \`npm run typecheck\` resalta comandos o fragmentos cortos

## Listas

~~~markdown
- Elemento con viñeta
- Otro elemento
  - Elemento anidado

1. Primer paso
2. Segundo paso
3. Tercer paso
~~~

## Listas de tareas

~~~markdown
- [x] Terminado
- [ ] Por hacer
- [ ] En revisión
~~~

## Enlaces e imágenes

~~~markdown
[OpenAI](https://openai.com)
![Texto alternativo de la imagen](imagen.png)
~~~

Usa textos de enlace claros y describe las imágenes con texto alternativo útil.

## Citas y separadores

~~~markdown
> Una cita sirve para referencias, notas y destacados.

---
~~~

## Bloques de código

Agrega el nombre del lenguaje después de la cerca inicial para activar el resaltado de sintaxis.

~~~markdown
\`\`\`ts
function preview(markdown: string) {
  return renderMarkdown(markdown)
}
\`\`\`
~~~

## Tablas

~~~markdown
| Recurso | Estado | Notas |
|---------|:------:|-------|
| Tablas  | Sí     | Buenas para comparar |
| Tareas  | Sí     | Útiles para checklists |
~~~

## Seguridad de HTML

Puedes escribir HTML puro en Markdown, pero las etiquetas y atributos inseguros se sanitizan antes de la vista previa y la exportación.

## Checklist rápido

- Empieza con un título \`#\`
- Mantén el orden de niveles de encabezado
- Usa líneas en blanco entre secciones
- Agrega texto alternativo a las imágenes
- Usa bloques cercados para código de varias líneas
- Revisa antes de exportar a HTML, PDF o PNG
`
} as const

export function getGuideMarkdown(language: string): string {
  return GUIDE_MARKDOWN[language as keyof typeof GUIDE_MARKDOWN] ?? GUIDE_MARKDOWN.en
}
