# automatic-updates Specification

## Purpose
TBD - created by archiving change add-automatic-updates. Update Purpose after archive.
## Requirements
### Requirement: Packaged app checks stable GitHub releases
The system SHALL check for a newer stable GitHub Release after startup when running as an installed Windows NSIS application or Linux AppImage, and SHALL not perform update checks in development or unsupported package formats.

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

### Requirement: User controls update download and installation
The system SHALL let user start download of an available update, observe progress, defer restart, or restart to install after download completes.

#### Scenario: Download update
- **WHEN** user selects download for an available version
- **THEN** application downloads compatible update, reports progress, and marks update ready after integrity verification

#### Scenario: Install ready update
- **WHEN** user selects restart after update is ready and close is approved
- **THEN** application exits, installs downloaded update, and starts updated version

#### Scenario: Defer ready update
- **WHEN** user chooses to continue working after update download
- **THEN** application remains open and update can install on later exit or explicit restart

#### Scenario: Update actions are visually identifiable
- **WHEN** update notice presents download, restart, retry, or defer actions
- **THEN** every action button includes an icon matching its purpose alongside localized text

### Requirement: Update failure remains recoverable
The system SHALL report update errors without closing application or blocking document operations, and SHALL allow later check or download retry.

#### Scenario: Network or filesystem update error
- **WHEN** release check or update download fails
- **THEN** application reports localized failure state and continues current editing session

### Requirement: Release publishing includes update metadata
The system SHALL publish Windows NSIS and Linux AppImage artifacts with platform-specific electron-updater metadata from version tags.

#### Scenario: Version tag is pushed
- **WHEN** maintainer pushes a tag matching package version
- **THEN** GitHub Actions builds and publishes non-draft release artifacts and matching `latest.yml` and `latest-linux.yml` metadata

