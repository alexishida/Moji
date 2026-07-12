# appearance Specification

## Purpose
TBD - created by archiving change add-markdown-viewer-editor. Update Purpose after archive.
## Requirements
### Requirement: Clean minimal template
The system SHALL present a clean, minimal, distraction-free interface: generous reading width, clear typographic hierarchy, and controls that stay out of the way of the content.

#### Scenario: Distraction-free reading layout
- **WHEN** a document is displayed in view mode
- **THEN** the content is shown in a centered, readable column with consistent spacing and no unnecessary chrome

#### Scenario: Preview follows available window width
- **WHEN** fluid reading width is enabled and the application window is resized
- **THEN** the reading column grows or shrinks to occupy the available preview width

#### Scenario: Toggle fixed reading width
- **WHEN** the user toggles reading width while a document is in view mode
- **THEN** the preview switches between a fixed centered column and a fluid centered column for the current session

#### Scenario: Preview starts with default reading layout
- **WHEN** the application starts
- **THEN** the preview font size is 16px and the reading column uses fixed width, regardless of the previous session

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
