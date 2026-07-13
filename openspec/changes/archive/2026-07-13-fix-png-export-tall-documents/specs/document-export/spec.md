## ADDED Requirements

### Requirement: PNG export handles documents of any height
The system SHALL export a PNG containing the whole document regardless of its rendered height, and SHALL NOT fail or silently crop when the document exceeds the platform's single-capture limit.

#### Scenario: Export a document taller than the capture limit
- **WHEN** the user exports a document whose rendered height exceeds what one screen capture can hold
- **THEN** a PNG is written containing the entire document, top to bottom

#### Scenario: Stitched image contains no repeated content
- **WHEN** a tall document is captured in more than one pass
- **THEN** the resulting image contains each band of the document exactly once, in order, and its height matches the rendered document

#### Scenario: Export a short document
- **WHEN** the user exports a document that fits within a single capture
- **THEN** the PNG is produced as before, in one pass

#### Scenario: Scrollbars stay out of the image
- **WHEN** a tall document is captured on a platform with classic scrollbars
- **THEN** no scrollbar appears in the exported image and the content keeps its full width
