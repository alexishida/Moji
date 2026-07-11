## ADDED Requirements

### Requirement: Localized guide resource naming
The system SHALL store each bundled Markdown guide as `markdown-guide.<locale>.md`, where `<locale>` exactly matches one registered supported language code.

#### Scenario: Bundled guide filenames are inspected
- **WHEN** application samples are packaged
- **THEN** guides exist as `markdown-guide.en.md`, `markdown-guide.pt-BR.md`, `markdown-guide.es.md`, `markdown-guide.ja.md`, `markdown-guide.zh.md`, and `markdown-guide.ru.md`

#### Scenario: Active-language guide is opened
- **WHEN** user opens Markdown Guide in any supported language
- **THEN** application reads matching `markdown-guide.<locale>.md` resource and displays its localized content
