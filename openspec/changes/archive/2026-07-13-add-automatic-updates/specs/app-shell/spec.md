## ADDED Requirements

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
