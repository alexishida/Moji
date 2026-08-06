# automatic-updates Specification

## Purpose
TBD - created by archiving change add-automatic-updates. Update Purpose after archive.
## Requirements
### Requirement: Packaged app checks stable GitHub releases
The system SHALL check for a newer stable GitHub Release after startup when running as an installed Windows NSIS application or Linux AppImage, and SHALL not perform update checks in development or unsupported package formats. Linux DEB and macOS packages SHALL be treated as unsupported package formats.

#### Scenario: New stable release exists
- **WHEN** a supported packaged application starts and GitHub contains a higher stable semantic version
- **THEN** the application reports that version as available without interrupting document editing

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
- **THEN** automatic update is marked unsupported and no replacement is attempted, because Squirrel.Mac cannot replace an unsigned application bundle

### Requirement: Update failure remains recoverable
The system SHALL report update-check errors without closing application or blocking document operations, and SHALL allow a later check retry.

#### Scenario: Network or filesystem update error
- **WHEN** a release check fails because of a network or local runtime error
- **THEN** application reports localized failure state, continues current editing session, and lets user retry the check

#### Scenario: Release check error
- **WHEN** checking GitHub Releases fails
- **THEN** application reports localized failure state, continues current editing session, and lets user retry the check

### Requirement: Release publishing includes update metadata
The system SHALL publish Windows NSIS and Linux AppImage artifacts with platform-specific electron-updater metadata from version tags.

#### Scenario: Version tag is pushed
- **WHEN** maintainer pushes a tag matching package version
- **THEN** GitHub Actions builds and publishes non-draft release artifacts and matching `latest.yml` and `latest-linux.yml` metadata

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

