# app-shell Specification

## Purpose
TBD - created by archiving change add-markdown-viewer-editor. Update Purpose after archive.
## Requirements
### Requirement: Cross-platform desktop application
The system SHALL run as a desktop application on Windows and Linux, built with Electron and a React renderer, packaged into installable artifacts for each platform.

#### Scenario: Launch on Windows
- **WHEN** a user runs the installed application on Windows
- **THEN** the application window opens showing the empty/welcome state without errors

#### Scenario: Launch on Linux
- **WHEN** a user runs the packaged application (AppImage or deb) on Linux
- **THEN** the application window opens showing the empty/welcome state without errors

### Requirement: Open Markdown file by clicking it
The system SHALL register a file association for `.md` and `.markdown` files so that opening such a file from the OS file manager launches the application with that file loaded and rendered.

#### Scenario: Double-click a Markdown file
- **WHEN** the user double-clicks a `.md` file in the OS file manager and the app is set as the handler
- **THEN** the application launches (or focuses if already running) and displays the rendered preview of that file

#### Scenario: Open file passed as CLI argument
- **WHEN** the application is started with a file path argument (e.g. `app document.md`)
- **THEN** the application loads and renders that file on startup

### Requirement: Open Markdown file within the app
The system SHALL let users open a Markdown file from inside the app via a file dialog and via drag-and-drop onto the window.

#### Scenario: Open via file dialog
- **WHEN** the user chooses "Open" from the menu and selects a `.md` file
- **THEN** the file content is loaded and the rendered preview is displayed

#### Scenario: Drag and drop a file
- **WHEN** the user drags a `.md` file onto the application window
- **THEN** the file is loaded and its rendered preview is displayed

#### Scenario: Reject unsupported file
- **WHEN** the user attempts to open a file whose extension is not `.md` or `.markdown`
- **THEN** the application shows a non-blocking notice and does not replace the current document

### Requirement: Open Markdown folder workspace
The system SHALL let users open a folder as a Markdown workspace without opening every file as a tab immediately.

#### Scenario: Open folder via dialog
- **WHEN** the user chooses Open Folder and selects a directory
- **THEN** the sidebar shows Markdown files from that folder and no document tab is created until the user chooses a file

#### Scenario: Open file from workspace
- **WHEN** the user selects a Markdown file in the workspace sidebar
- **THEN** that file opens in a document tab, or its existing tab is activated

#### Scenario: Search workspace
- **WHEN** the user searches from the workspace sidebar
- **THEN** matching Markdown files show path, line, column, and excerpt results, and selecting a result opens the file

#### Scenario: Drag and drop a folder
- **WHEN** the user drags a folder onto the application window
- **THEN** the folder opens as the active workspace instead of showing an unsupported-file notice

### Requirement: Native application menu
The system SHALL provide a native application menu exposing core actions: Open, Save, Save As, Export, toggle Edit mode, and toggle Theme, each with a keyboard shortcut.

#### Scenario: Menu actions available
- **WHEN** the application window is focused
- **THEN** the native menu lists Open, Save, Save As, Export, Toggle Edit, and Toggle Theme, and invoking each triggers its corresponding action

### Requirement: Secure renderer boundary
The system SHALL isolate the renderer process from Node.js, exposing only an explicit, minimal API from the main process through a preload bridge for file and export operations.

#### Scenario: Renderer cannot access Node directly
- **WHEN** the renderer executes application code
- **THEN** `nodeIntegration` is disabled and `contextIsolation` is enabled, and file/export access occurs only through the exposed preload API

### Requirement: Update restart protects unsaved documents
The system SHALL use existing unsaved-document confirmation before restarting to install a downloaded update.

#### Scenario: User cancels update restart with unsaved work
- **WHEN** update is ready, documents contain unsaved changes, and user cancels close confirmation
- **THEN** application remains open and does not begin update installation

#### Scenario: User approves update restart
- **WHEN** update is ready and user approves closing all unsaved documents
- **THEN** application authorizes updater installation and exits through controlled restart flow

### Requirement: Renderer update access remains narrow
The system SHALL expose only typed update status, check, download, and install operations through preload and SHALL not expose Electron updater or raw IPC objects to renderer.

#### Scenario: Renderer subscribes to update state
- **WHEN** main process update state changes
- **THEN** renderer receives serializable state through dedicated preload listener without access to native event object
