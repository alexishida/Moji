# appearance Specification

## Purpose
TBD - created by archiving change add-markdown-viewer-editor. Update Purpose after archive.
## Requirements
### Requirement: Clean minimal template
The system SHALL present a clean, minimal, distraction-free interface: generous reading width, clear typographic hierarchy, and controls that stay out of the way of the content.

#### Scenario: Distraction-free reading layout
- **WHEN** a document is displayed in view mode
- **THEN** the content is shown in a centered, readable column with consistent spacing and no unnecessary chrome

#### Scenario: Reading column follows configured percentage
- **WHEN** the user sets a reading width between 20% and 100% in 5% increments in Settings
- **THEN** the preview shows a centered column using that percentage of the available preview width for every document
- **AND** the column keeps a 480px readable minimum, capped by the available preview width on narrow windows

#### Scenario: Reading width persists across launches
- **WHEN** the user changes the reading width, closes the app, and reopens it
- **THEN** the previously configured reading width is applied on startup

#### Scenario: Toggle full reading width
- **WHEN** the user toggles reading width while a document is in view mode
- **THEN** the preview switches between the configured width and the full available width for the current session

#### Scenario: Preview starts with default reading layout
- **WHEN** the application starts
- **THEN** the preview font size is 16px, the full-width toggle is off, and the reading column uses the persisted configured width (60% by default)

### Requirement: Light and dark theme
The system SHALL provide both a light and a dark theme and let the user toggle between them at any time. Both preview content and application chrome SHALL adapt to the active theme with adequate contrast.

#### Scenario: Toggle to dark theme
- **WHEN** the user toggles the theme to dark
- **THEN** the entire UI, including the rendered preview and code blocks, switches to dark styling with readable contrast

#### Scenario: Toggle back to light theme
- **WHEN** the user toggles the theme to light
- **THEN** the entire UI switches back to light styling

### Requirement: Persist theme preference
The system SHALL remember the last selected theme and apply it on the next launch.

#### Scenario: Theme restored on restart
- **WHEN** the user selects a theme, closes the app, and reopens it
- **THEN** the previously selected theme is applied on startup

### Requirement: Follow system theme by default
On first run, the system SHALL default to the operating system's color scheme preference.

#### Scenario: First run matches OS
- **WHEN** the user launches the app for the first time with the OS set to dark mode
- **THEN** the app starts in the dark theme
