/**
 * Turns a raw error string from the main process into something safe and useful to show the
 * user.
 *
 * Node's `fs` errors read like `ENOENT: no such file or directory, stat 'D:\Users\...\doc.md'`:
 * a code no one recognizes, followed by the document's full path on disk. Recognized codes get
 * a short, translated reason instead; anything else keeps its message but with a trailing
 * quoted path stripped, so an error toast never leaks a filesystem layout the user did not
 * choose to share.
 */

const ERROR_CODE = /^([A-Z][A-Z0-9]{1,9}):/
const TRAILING_QUOTED_PATH = /,?\s*'[^']*'\s*$/

export function friendlyErrorMessage(error: string, t: (key: string) => string): string {
  const code = ERROR_CODE.exec(error)?.[1]
  switch (code) {
    case 'ENOENT':
    case 'ENOTDIR':
      return t('notice.errorReason.notFound')
    case 'EACCES':
    case 'EPERM':
      return t('notice.errorReason.permissionDenied')
    case 'EBUSY':
      return t('notice.errorReason.busy')
    default:
      return error.replace(TRAILING_QUOTED_PATH, '').trim() || error
  }
}
