## MODIFIED Requirements

### Requirement: Packaged app checks stable GitHub releases
The system SHALL check for a newer stable GitHub Release after startup when running as an installed Windows NSIS application or Linux AppImage, and SHALL not perform update checks in development or unsupported package formats.

#### Scenario: New stable release exists
- **WHEN** a supported packaged application starts and GitHub contains a higher stable semantic version
- **THEN** the application reports that version as available without interrupting document editing, shows an update notice, and offers an update action that opens the official Moji GitHub Releases page in the system browser

#### Scenario: No new release exists
- **WHEN** a supported packaged application checks and current version is latest
- **THEN** the update state becomes up to date without showing an intrusive notice

#### Scenario: User checks manually from About view
- **WHEN** user selects the icon-labelled check-for-updates action at the end of the About view
- **THEN** application checks GitHub Releases and shows current check result in the About view and global update notice when action is needed

#### Scenario: Linux DEB build starts
- **WHEN** Moji runs on Linux without the `APPIMAGE` runtime marker
- **THEN** automatic update is marked unsupported and no replacement is attempted

#### Scenario: macOS build starts
- **WHEN** Moji runs on macOS
- **THEN** automatic update is marked unsupported and no replacement is attempted, because unsigned macOS builds cannot safely replace their application bundle

## ADDED Requirements

### Requirement: User obtains available updates from GitHub Releases
The system SHALL present a visually identifiable blue update action in both the global update notice and About view while an update is available. Selecting either action SHALL open the official Moji GitHub Releases page in the system browser without downloading, installing, or restarting the application.

#### Scenario: User selects update from notice
- **WHEN** an update notice is visible and user selects its update action
- **THEN** the system browser opens the official Moji GitHub Releases page and the current editing session remains open

#### Scenario: User selects update from About view
- **WHEN** the About view reports an available update and user selects its update action
- **THEN** the system browser opens the official Moji GitHub Releases page and the About view remains open

#### Scenario: Update action is identifiable
- **WHEN** an update is available
- **THEN** each update action includes localized text and an update-related icon, with primary blue button styling

## MODIFIED Requirements

### Requirement: Update failure remains recoverable
The system SHALL report update-check errors without closing application or blocking document operations, and SHALL allow a later check retry.

#### Scenario: Network or filesystem update error
- **WHEN** a release check fails because of a network or local runtime error
- **THEN** application reports localized failure state, continues current editing session, and lets user retry the check

#### Scenario: Release check error
- **WHEN** checking GitHub Releases fails
- **THEN** application reports localized failure state, continues current editing session, and lets user retry the check

## REMOVED Requirements

### Requirement: User controls update download and installation
**Reason**: Updates are obtained manually from the official GitHub Releases page instead of through application-managed download and installation.

**Migration**: Replace download, restart, defer, and update-progress UI with the blue action that opens the official GitHub Releases page.
