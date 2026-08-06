## MODIFIED Requirements

### Requirement: Renderer update access remains narrow
The system SHALL expose only typed update status and check operations through preload, and SHALL not expose Electron updater, raw IPC objects, local update download, or local update installation operations to renderer.

#### Scenario: Renderer subscribes to update state
- **WHEN** main process update state changes
- **THEN** renderer receives serializable state through dedicated preload listener without access to native event object

## REMOVED Requirements

### Requirement: Update restart protects unsaved documents
**Reason**: The application no longer installs updates or restarts as part of the update flow.

**Migration**: Users retain their editing session while opening GitHub Releases and install an update separately.
