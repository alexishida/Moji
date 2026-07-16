## ADDED Requirements

### Requirement: Translation entry point and setup guidance
The system SHALL provide a localized Translate action for an open document in preview mode. The action SHALL be disabled when no document is open. When translation service configuration is incomplete, opening the translation panel SHALL explain the missing prerequisite and provide a localized route to Settings without sending document content.

#### Scenario: Open translation for a configured document
- **WHEN** the user activates Translate while an open document has a configured translation service
- **THEN** the system opens an inline translation panel for that document without modifying its content or changing its current mode

#### Scenario: Service is not configured
- **WHEN** the user activates Translate with no usable endpoint or credential
- **THEN** the system explains that configuration is required and offers a Settings action without transmitting the document

### Requirement: Source detection and language selection
The system SHALL initialize the source language as automatic detection and SHALL let the user select a supported source language instead. The system SHALL suggest the current interface language as target, allow the user to select any supported target language other than the effective source, and show the detected source language and confidence before translation proceeds when automatic detection is used.

#### Scenario: Accept detected source language
- **WHEN** automatic detection identifies a source language with sufficient confidence
- **THEN** the system displays the detected language and lets the user translate it to the selected target language

#### Scenario: Correct uncertain source language
- **WHEN** automatic detection returns low confidence
- **THEN** the system warns the user and requires source-language confirmation or manual selection before it sends the translation request

### Requirement: Preserve Markdown translation boundaries
The system SHALL send the document through the configured translation service from the main process and SHALL request translated Markdown while preserving document structure. It MUST instruct the service not to translate front matter keys and values, URLs, inline code, fenced code blocks, mathematical expressions, or Mermaid source.

#### Scenario: Translate a document containing protected Markdown regions
- **WHEN** the user translates a document containing prose, front matter, URLs, code, math, and Mermaid
- **THEN** the request identifies those protected regions as content to preserve and the returned result is kept separate from the source document

### Requirement: Review translated result before mutation
The system SHALL render a successful translation as a temporary, labeled preview associated with the document content that was translated. It SHALL retain access to the original preview and show original and translation side by side when workspace width permits, or provide an accessible switcher when it does not. Any source-document edit SHALL invalidate its temporary translation result.

#### Scenario: Review translation beside original
- **WHEN** a translation succeeds in a workspace wide enough for comparison
- **THEN** the system shows labeled original and translated previews without changing the source document

#### Scenario: Source changes after translation
- **WHEN** the user edits the document after receiving a translation
- **THEN** the system discards the stale translation result and renders the updated source preview

### Requirement: Copy or apply translated content deliberately
The system SHALL offer a Copy translation action and an Apply to editor action after a successful translation. Copy SHALL only write the translated Markdown to the clipboard. Apply SHALL require confirmation, replace the active document content only after confirmation, enter editor mode, and use existing dirty-state behavior. For a read-only document, Apply SHALL be unavailable while Copy remains available.

#### Scenario: Apply a reviewed translation
- **WHEN** the user confirms Apply to editor for a writable document
- **THEN** the system replaces the active document content with translated Markdown, marks it unsaved, clears the temporary result, and opens the editor

#### Scenario: Copy translation from a read-only document
- **WHEN** the user receives a translation for a read-only document
- **THEN** the user can copy its Markdown and cannot apply it to the document

### Requirement: Secure translation service configuration
The system SHALL persist endpoint, model, source preference, and target preference as non-sensitive settings. It SHALL store a translation credential only in OS-backed encrypted storage when available; otherwise it SHALL keep the credential only for the active session and disclose that it will not be remembered. The renderer MUST NOT receive, persist, log, or display the credential.

#### Scenario: Persist credential on a supported platform
- **WHEN** the user saves a valid translation credential and OS encryption is available
- **THEN** the system stores it encrypted outside `settings.json` and exposes only a configured status to the renderer

#### Scenario: Encryption unavailable
- **WHEN** the user provides a credential on a platform without available OS encryption
- **THEN** the system uses it for the current session only and tells the user it will not be persisted

### Requirement: Validate and contain translation requests
The main process SHALL validate renderer-supplied Markdown size, language values, endpoint scheme and host, model identifier, and request timeout before calling the translation service. It SHALL support user cancellation, timeout, and malformed or failed responses without changing the document or exposing credentials.

#### Scenario: Cancel an in-progress translation
- **WHEN** the user cancels a pending translation
- **THEN** the system aborts the request when possible, restores actionable panel controls, and leaves the original document unchanged

#### Scenario: Translation service fails
- **WHEN** the service times out, rejects the request, or returns an invalid result
- **THEN** the system displays a localized actionable error, preserves the source document and any prior valid result, and does not expose credential data
