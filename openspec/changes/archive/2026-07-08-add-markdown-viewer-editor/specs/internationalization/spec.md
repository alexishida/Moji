## ADDED Requirements

### Requirement: Localized user interface
The system SHALL present all user-facing interface text — native menu, dialogs, buttons, tooltips, status text, and messages — through a translation layer rather than hardcoded strings, so the entire UI can be shown in the active language.

#### Scenario: UI renders in the active language
- **WHEN** the active language is set to a supported language
- **THEN** all visible interface text (menu, controls, dialogs, notices) is displayed in that language

#### Scenario: No untranslated placeholder leaks
- **WHEN** the UI is displayed in any shipped language
- **THEN** no raw translation key or empty string is shown in place of a label

### Requirement: Shipped languages
The system SHALL ship at least Portuguese (pt-BR), English (en), and Spanish (es).

#### Scenario: Selectable shipped languages
- **WHEN** the user opens the language switcher
- **THEN** Portuguese (pt-BR), English (en), and Spanish (es) are listed as selectable options

### Requirement: Language switcher
The system SHALL let the user change the interface language at runtime, and the UI SHALL update without requiring a restart.

#### Scenario: Change language at runtime
- **WHEN** the user selects a different language from the switcher
- **THEN** the interface text updates to the selected language immediately, without restarting the app

### Requirement: Default to OS locale
On first run, the system SHALL select the interface language from the operating system locale when a matching shipped language is available, and SHALL fall back to English otherwise.

#### Scenario: OS locale matches a shipped language
- **WHEN** the app launches for the first time and the OS locale is `pt-BR`
- **THEN** the interface starts in Portuguese

#### Scenario: OS locale has no matching language
- **WHEN** the app launches for the first time and the OS locale is not among the shipped languages
- **THEN** the interface starts in English

### Requirement: Persist language preference
The system SHALL remember the last selected language and apply it on the next launch, overriding the OS-locale default.

#### Scenario: Language restored on restart
- **WHEN** the user selects a language, closes the app, and reopens it
- **THEN** the previously selected language is applied on startup

### Requirement: Extensible language set
The system SHALL structure translations as one resource file per language (keyed by stable message identifiers) so that adding a new language requires adding a locale file and registering it, without changing feature code.

#### Scenario: Add a new language via a locale file
- **WHEN** a new locale resource file is added and registered following the established key structure
- **THEN** the new language appears in the switcher and the UI renders in it, with no changes required to the viewing, editing, or export features

#### Scenario: Missing key falls back
- **WHEN** the active language's resource is missing a specific key
- **THEN** the system displays the English text for that key rather than a blank or the raw key
