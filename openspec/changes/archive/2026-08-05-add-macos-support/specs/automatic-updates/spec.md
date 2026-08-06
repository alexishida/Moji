## MODIFIED Requirements

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
