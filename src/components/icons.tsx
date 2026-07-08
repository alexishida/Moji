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

export const IconKebab = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <circle cx="12" cy="5" r="1.4" />
    <circle cx="12" cy="12" r="1.4" />
    <circle cx="12" cy="19" r="1.4" />
  </svg>
)

export const IconFilePlus = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <path d="M14 3v5h5M12 12v6M9 15h6" />
  </svg>
)

export const IconFolder = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </svg>
)

export const IconList = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
)

export const IconHelp = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 3.5M12 17h.01" />
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

export const IconX = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
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

export const IconSave = (p: IconProps): JSX.Element => (
  <svg {...base} {...p}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
    <path d="M17 21v-8H7v8M7 3v5h8" />
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
