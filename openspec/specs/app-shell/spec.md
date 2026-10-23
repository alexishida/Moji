# app-shell Specification

## Purpose
TBD - created by archiving change add-markdown-viewer-editor. Update Purpose after archive.
## Requirements
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

### Requirement: Native application menu
The system SHALL install a native application menu on macOS exposing the standard system roles, because macOS dispatches clipboard and window shortcuts through the application menu. The system SHALL NOT install a menu on Windows or Linux, where every action is reachable from the in-app top bar.

#### Scenario: Menu actions available
- **WHEN** the application window is focused on macOS
- **THEN** the native menu exposes the standard application, Edit, and Window roles required by the platform

#### Scenario: Clipboard shortcuts in the editor on macOS
- **WHEN** the user presses Cmd+C, Cmd+V, Cmd+X, or Cmd+A while editing a document or typing in a search field on macOS
- **THEN** the corresponding clipboard action is applied to the focused field

#### Scenario: No menu bar on Windows and Linux
- **WHEN** the application window is focused on Windows or Linux
- **THEN** no application menu bar is shown, and file, search, export, and theme actions remain available from the in-app top bar

### Requirement: Secure renderer boundary
The system SHALL isolate the renderer process from Node.js, exposing only an explicit, minimal API from the main process through a preload bridge for file and export operations.

#### Scenario: Renderer cannot access Node directly
- **WHEN** the renderer executes application code
- **THEN** `nodeIntegration` is disabled and `contextIsolation` is enabled, and file/export access occurs only through the exposed preload API

### Requirement: Renderer update access remains narrow
The system SHALL expose only typed update status and check operations through preload, and SHALL not expose Electron updater, raw IPC objects, local update download, or local update installation operations to renderer.

#### Scenario: Renderer subscribes to update state
- **WHEN** main process update state changes
- **THEN** renderer receives serializable state through dedicated preload listener without access to native event object

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

### Requirement: Explorer sidebar lists Markdown files of loaded folders
The system SHALL provide an explorer sidebar where the user loads folders through the native folder picker and sees only the `.md` and `.markdown` files inside them, as a collapsible tree. The explorer SHALL be shown or hidden from the top bar or with Ctrl+Shift+B, and both the folder list and the visibility SHALL persist between sessions.

#### Scenario: Load a folder
- **WHEN** the user clicks "Add folder" in the explorer and picks a folder
- **THEN** the folder appears as a root listing its Markdown files and the subfolders that contain them, skipping hidden folders, symlinks, and `node_modules`

#### Scenario: Open a folder from the top bar
- **WHEN** the user clicks "Open Folder" beside New / Open / Save, or presses Ctrl+Shift+O, and picks a folder
- **THEN** the folder is added to the explorer and the explorer is shown if it was hidden

#### Scenario: Create a new file in the explorer
- **WHEN** the user chooses "New file" for a loaded folder and enters a name
- **THEN** an empty Markdown file with that name (`.md` added when missing) is created in that folder without a native dialog, and it opens in the editor
- **AND** if a file with that name already exists, nothing is overwritten and the error is shown next to the name field

#### Scenario: Rename a file in the explorer
- **WHEN** the user renames a file from the explorer
- **THEN** the file is renamed in the same folder, and any open tab and recent-file entry follow the new name

#### Scenario: Delete from the explorer
- **WHEN** the user chooses Delete for explorer entries (context menu or Delete key)
- **THEN** a native confirmation names what will be removed, and on confirmation the entries move to the OS trash; a loaded root folder can only be removed from the explorer, never deleted

#### Scenario: Cut, copy and paste in the explorer
- **WHEN** the user copies or cuts Markdown files and pastes them into an explorer folder, or drags them onto one
- **THEN** copies get a ` copy` suffix instead of overwriting, moves refuse to replace an existing file, and open tabs follow moved files

#### Scenario: Tab context menu
- **WHEN** the user right-clicks a document tab
- **THEN** the menu offers close actions, Save, Save As, Copy Path, Copy Relative Path, Reveal in Explorer View, Reveal in File Explorer, Open with Default App, Rename, and toggles for the explorer, outline, and live preview, each disabled when it does not apply

#### Scenario: Open a file from the explorer
- **WHEN** the user clicks a Markdown file in the explorer
- **THEN** the file opens in a tab and is highlighted as the active document

#### Scenario: Hide and show the explorer
- **WHEN** the user clicks the explorer button in the top bar or presses Ctrl+Shift+B
- **THEN** the explorer toggles between hidden and visible, and the choice is kept after restart

#### Scenario: File outside every loaded folder
- **WHEN** the renderer asks to open, through the explorer, a path that is not a real Markdown file inside a loaded folder
- **THEN** the request is refused and the file is not read

### Requirement: File access is limited to what the user opened
The system SHALL write only to files the user has opened or chosen through a save dialog, and SHALL load local images only from directories of documents that have been opened.

#### Scenario: Write to a file that was never opened
- **WHEN** a write is requested for a path that the user has not opened or chosen
- **THEN** the write is refused, regardless of the file's extension

#### Scenario: Image outside any opened document's directory
- **WHEN** a local image is requested from a directory where no document has been opened
- **THEN** the request is refused

### Requirement: Drafts are bounded by storage, not by a fixed length
The system SHALL persist drafts larger than ten million characters, and SHALL refuse with a clear reason rather than truncating when storage cannot hold one.

#### Scenario: Draft larger than the old character limit
- **WHEN** a draft above ten megabytes is auto-saved
- **THEN** it is stored and restored in full in the next session

#### Scenario: Draft cannot be persisted
- **WHEN** a draft exceeds the size ceiling or the disk lacks room for it
- **THEN** the user is told why, and no truncated copy is written
