/** Inline stroke icons — no external assets, CSP-safe, theme-aware via currentColor. */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
}

export const IconMoon = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </svg>
)

export const IconSun = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
)

export const IconSettings = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9.4A1.7 1.7 0 0 0 10.6 3V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 17 4.6l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>
)

export const IconInfo = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 10v6" />
    <path d="M12 7h.01" />
  </svg>
)

export const IconTextSize = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M4 7V4h16v3M9 20h6M12 4v16" />
  </svg>
)

export const IconLayoutWidth = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M4 5v14M20 5v14M8 12h8M8 12l3-3M8 12l3 3M16 12l-3-3M16 12l-3 3" />
  </svg>
)

export const IconMinus = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M5 12h14" />
  </svg>
)

export const IconPlus = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconAlertTriangle = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M10.3 4.4 2.7 17.6A2.2 2.2 0 0 0 4.6 21h14.8a2.2 2.2 0 0 0 1.9-3.4L13.7 4.4a2.2 2.2 0 0 0-3.4 0Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
)

export const IconFilePlus = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <path d="M14 3v5h5M12 12v6M9 15h6" />
  </svg>
)

/** Plain document with text lines — recent-file rows on the Welcome screen. */
export const IconFileText = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <path d="M14 3v5h5M8 13h8M8 17h5" />
  </svg>
)

export const IconList = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
)

export const IconEye = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

export const IconOpen = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2" />
  </svg>
)

export const IconPencil = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)

export const IconBook = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Z" />
    <path d="M4 5v14" />
  </svg>
)

export const IconDownload = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
  </svg>
)

export const IconRefresh = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M20 6v5h-5" />
    <path d="M18.2 16.5A8 8 0 1 1 20 11" />
  </svg>
)

export const IconRestart = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M12 3v9" />
    <path d="M7.1 5.6a8 8 0 1 0 9.8 0" />
  </svg>
)

export const IconX = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
)

export const IconTrash = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M4 7h16" />
    <path d="M10 11v6M14 11v6" />
    <path d="M6 7l1 14h10l1-14" />
    <path d="M9 7V4h6v3" />
  </svg>
)

export const IconFilePdf = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <path d="M14 3v5h5M8 16h.01M11 16h.01M14 16h.01M8 12h8" />
  </svg>
)

export const IconCode = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="m9 18-6-6 6-6M15 6l6 6-6 6" />
  </svg>
)

export const IconImage = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.4" />
    <path d="m7 17 4-4 3 3 2-2 3 3" />
  </svg>
)

/** Four inward corners â€” fit content to the available viewer area. */
export const IconFitToView = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M8 4H4v4M16 4h4v4M4 16v4h4M20 16v4h-4" />
    <path d="m9 9-5-5M15 9l5-5M9 15l-5 5M15 15l5 5" />
  </svg>
)

export const IconSave = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
    <path d="M17 21v-8H7v8M7 3v5h8" />
  </svg>
)

export const IconReplace = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M4 7h9M4 17h7" />
    <path d="M16 5l3 3-3 3" />
    <path d="M19 8H9" />
    <path d="M13 15l-3 3 3 3" />
    <path d="M10 18h10" />
  </svg>
)

/** Magnifier — "find next" in the replace popover. */
export const IconSearch = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
)

export const IconCommand = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M8 8H6a3 3 0 1 1 3-3v14a3 3 0 1 1-3-3h12a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3Z" />
  </svg>
)

/** Swap arrows looping — "replace all" in the replace popover. */
export const IconReplaceAll = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M14 4l3 3-3 3" />
    <path d="M17 7H8a3 3 0 0 0-3 3v1" />
    <path d="M10 20l-3-3 3-3" />
    <path d="M7 17h9a3 3 0 0 0 3-3v-1" />
  </svg>
)

/** Right chevron — rotates to point down when its outline node is expanded. */
export const IconChevronRight = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)

/** Block — marks a Requirement heading in the outline. */
export const IconBlock = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M4 10h16" />
  </svg>
)

/** Flow / branch-into — marks a Scenario heading (subordinate step). */
export const IconFlow = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M8 4v7a3 3 0 0 0 3 3h6" />
    <path d="m14 11 4 3-4 3" />
  </svg>
)

/** Chevrons apart — "expand all" outline groups. */
export const IconExpandAll = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="m7 5 5 5 5-5M7 14l5 5 5-5" />
  </svg>
)

/** Chevrons together — "collapse all" outline groups. */
export const IconCollapseAll = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="m7 10 5-5 5 5M7 19l5-5 5 5" />
  </svg>
)

/** Panel with a divided left column — toggles the outline sidebar. */
export const IconSidebar = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </svg>
)
