## ADDED Requirements

### Requirement: Bundled Markdown guide is read-only
The system SHALL open bundled localized Markdown guides as read-only reference documents and SHALL preserve ordinary viewing capabilities.

#### Scenario: User opens Markdown Guide
- **WHEN** user opens a bundled guide from status bar
- **THEN** guide opens in Preview mode with Save and Editor actions disabled

#### Scenario: Save is triggered outside disabled control
- **WHEN** a save or save-as action targets a bundled guide through a shortcut or programmatic caller
- **THEN** system refuses filesystem write and shows localized read-only notice

#### Scenario: User reads or exports guide
- **WHEN** bundled guide is active
- **THEN** preview, search, outline navigation, export, and tab closing remain available
