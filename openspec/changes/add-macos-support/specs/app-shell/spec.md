## MODIFIED Requirements

### Requirement: Cross-platform desktop application
The system SHALL run as a desktop application on Windows, Linux, and macOS, built with Electron and a React renderer, packaged into installable artifacts for each platform.

#### Scenario: Launch on Windows
- **WHEN** a user runs the installed application on Windows
- **THEN** the application window opens showing the empty/welcome state without errors

#### Scenario: Launch on Linux
- **WHEN** a user runs the packaged application (AppImage or deb) on Linux
- **THEN** the application window opens showing the empty/welcome state without errors

#### Scenario: Launch on macOS
- **WHEN** a user runs the packaged application (universal DMG or ZIP) on Apple Silicon or Intel macOS
- **THEN** the application window opens showing the empty/welcome state without errors

### Requirement: Native application menu
The system SHALL install a native application menu on macOS exposing the standard system roles, because macOS dispatches clipboard and window shortcuts through the application menu. The system SHALL NOT install a menu on Windows or Linux, where every action is reachable from the in-app top bar.

#### Scenario: Clipboard shortcuts in the editor on macOS
- **WHEN** the user presses Cmd+C, Cmd+V, Cmd+X, or Cmd+A while editing a document or typing in a search field on macOS
- **THEN** the corresponding clipboard action is applied to the focused field

#### Scenario: No menu bar on Windows and Linux
- **WHEN** the application window is focused on Windows or Linux
- **THEN** no application menu bar is shown, and file, search, export, and theme actions remain available from the in-app top bar

## ADDED Requirements

### Requirement: Quitting is distinct from closing the window
The system SHALL treat quitting the application as distinct from closing its window on macOS, where closing the last window leaves the process running. Every exit path SHALL pass through the unsaved-changes guard before the application terminates.

#### Scenario: Quit with unsaved documents on macOS
- **WHEN** the user chooses Quit from the application menu or the Dock, or presses Cmd+Q, while a document has unsaved changes
- **THEN** the unsaved-changes confirmation appears, and the application terminates only after the user saves or discards

#### Scenario: Cancel a quit
- **WHEN** the user cancels the unsaved-changes confirmation raised by a quit
- **THEN** the application stays open with every document and its unsaved content intact

#### Scenario: Quit with no unsaved documents
- **WHEN** the user quits and no document has unsaved changes
- **THEN** the application process terminates rather than leaving a windowless app running

#### Scenario: The guard survives a window being closed and reopened
- **WHEN** the user closes the window on macOS, leaving the app running, then reopens it from the Dock and makes an unsaved edit
- **THEN** closing that window raises the unsaved-changes confirmation again, rather than discarding the work silently
