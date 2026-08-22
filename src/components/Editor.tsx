import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, type CSSProperties } from 'react'
import { Decoration, type Command, type DecorationSet, EditorView, keymap, lineNumbers } from '@codemirror/view'
import { Annotation, EditorSelection, EditorState, Compartment, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting, defaultHighlightStyle, indentUnit } from '@codemirror/language'
import { search, searchKeymap, SearchQuery } from '@codemirror/search'
import { tags } from '@lezer/highlight'
import type { DraftEditPayload, Theme } from '../../electron/shared'
import { extractMarkdownOutline } from '../lib/markdown'
import { measureRendererNextFrame } from '../lib/performanceMetrics'
import { collectDraftEdits } from '../lib/draftEdits'
import { EDITOR_INDENT_UNIT, indentWithTab, outdentWithShiftTab } from '../lib/editorIndent'
import type { OutlineItem } from '../lib/outline'

interface EditorProps {
  documentId: string
  documentIds: readonly string[]
  value: string
  theme: Theme
  fontSize: number
  searchTerm: string
  activeSearchIndex: number | null
  highlightActive: boolean
  headingToReveal: { line: number; request: number } | null
  outlineVisible: boolean
  onSearchMatchCountChange: (count: number) => void
  onChange: (documentId: string, stats: EditorDocumentStats) => void
  /** Edits of one transaction, for incremental draft autosave. */
  onEdits: (documentId: string, edits: DraftEditPayload[]) => void
  onIdleStatsChange: (documentId: string, stats: EditorIdleStats) => void
  onOutlineChange: (documentId: string, outline: OutlineItem[]) => void
  onBlur: () => void
  /** First source line showing in the viewport, used to follow along in the live preview. */
  onVisibleLineChange?: (line: number) => void
}

export interface EditorHandle {
  getContent: () => string
  replaceContent: (content: string) => void
  /** Zero-based source line at the top of the viewport. */
  getTopVisibleLine: () => number
  /** Scroll so `line` (zero-based, fractional allowed) sits at the top of the viewport. */
  scrollToLine: (line: number) => void
}

export interface EditorDocumentStats {
  length: number
  lines: number
}

export interface EditorIdleStats extends EditorDocumentStats {
  tokens: number
  words: number
}

const externalSearchTerm = StateEffect.define<string>()
const externalSearchIndex = StateEffect.define<number | null>()
const externalHighlightActive = StateEffect.define<boolean>()
const externalContentSync = Annotation.define<boolean>()
const externalSearchMark = Decoration.mark({ class: 'cm-external-searchMatch' })
const externalSearchActiveMark = Decoration.mark({ class: 'cm-external-searchMatch cm-external-searchMatch--active' })
const MAX_SEARCH_DECORATIONS = 2_000

const oneDarkProEditorTheme = EditorView.theme({
  '&': {
    color: '#abb2bf',
    backgroundColor: '#282c34'
  },
  '.cm-content': {
    caretColor: '#abb2bf'
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#528bff'
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: '#3e4451'
  },
  '.cm-panels': {
    color: '#abb2bf',
    backgroundColor: '#282c34'
  },
  '.cm-gutters': {
    color: '#5c6370',
    backgroundColor: '#282c34',
    border: 'none'
  },
  '.cm-activeLine, .cm-activeLineGutter': {
    backgroundColor: '#2c313a'
  }
}, { dark: true })

const oneDarkProHighlightStyle = HighlightStyle.define([
  { tag: [tags.heading, tags.keyword, tags.modifier], color: '#c678dd' },
  { tag: [tags.atom, tags.number, tags.bool], color: '#d19a66' },
  { tag: [tags.string, tags.special(tags.string)], color: '#98c379' },
  { tag: [tags.comment, tags.quote], color: '#5c6370', fontStyle: 'italic' },
  { tag: [tags.variableName, tags.propertyName], color: '#abb2bf' },
  { tag: [tags.typeName, tags.className, tags.labelName], color: '#e5c07b' },
  { tag: [tags.definition(tags.name), tags.function(tags.variableName)], color: '#61afef' },
  { tag: [tags.operator, tags.punctuation, tags.separator], color: '#56b6c2' },
  { tag: [tags.link, tags.url, tags.escape], color: '#e06c75' },
  { tag: [tags.emphasis], fontStyle: 'italic' },
  { tag: [tags.strong], fontWeight: '700' }
])

const oneDarkProExtensions = [oneDarkProEditorTheme, syntaxHighlighting(oneDarkProHighlightStyle)]

function wrapMarkdown(before: string, after = before, placeholder = ''): Command {
  return (view) => {
    const transaction = view.state.changeByRange((range) => {
      const selected = view.state.sliceDoc(range.from, range.to)
      const inner = selected || placeholder
      const insert = `${before}${inner}${after}`
      const anchor = range.from + before.length
      const head = anchor + inner.length

      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.range(anchor, head)
      }
    })
    view.dispatch(transaction, { scrollIntoView: true, userEvent: 'input.markdown' })
    view.focus()
    return true
  }
}

const insertLink: Command = (view) => {
  const transaction = view.state.changeByRange((range) => {
    const selected = view.state.sliceDoc(range.from, range.to) || 'text'
    const before = `[${selected}](`
    const after = 'url)'

    return {
      changes: { from: range.from, to: range.to, insert: `${before}${after}` },
      range: EditorSelection.range(range.from + before.length, range.from + before.length + 3)
    }
  })
  view.dispatch(transaction, { scrollIntoView: true, userEvent: 'input.markdown' })
  view.focus()
  return true
}

function toggleLinePrefix(prefix: string): Command {
  return (view) => {
    const changes = view.state.changeByRange((range) => {
      const line = view.state.doc.lineAt(range.from)
      const text = line.text
      const trimmedStart = text.length - text.trimStart().length
      const markerFrom = line.from + trimmedStart

      if (text.slice(trimmedStart).startsWith(prefix)) {
        return {
          changes: { from: markerFrom, to: markerFrom + prefix.length, insert: '' },
          range: EditorSelection.cursor(Math.max(line.from, range.head - prefix.length))
        }
      }

      return {
        changes: { from: markerFrom, insert: prefix },
        range: EditorSelection.cursor(range.head + prefix.length)
      }
    })
    view.dispatch(changes, { scrollIntoView: true, userEvent: 'input.markdown' })
    view.focus()
    return true
  }
}

const markdownKeymap = [
  { key: 'Mod-b', run: wrapMarkdown('**', '**', 'bold') },
  { key: 'Mod-i', run: wrapMarkdown('*', '*', 'italic') },
  { key: 'Mod-k', run: insertLink },
  { key: 'Mod-l', run: toggleLinePrefix('- ') },
  { key: 'Mod-Shift-l', run: toggleLinePrefix('- [ ] ') },
  { key: 'Tab', run: indentWithTab, preventDefault: true },
  { key: 'Shift-Tab', run: outdentWithShiftTab, preventDefault: true },
  { key: 'Mod-Shift-k', run: wrapMarkdown('```\n', '\n```', 'code') },
  // Tab indents instead of moving focus, which traps keyboard users inside the editor.
  // `Mod-Escape` was tried first (it's what CodeMirror's own docs suggest as an escape
  // hatch), but Windows reserves plain Ctrl+Escape for the Start menu and never delivers
  // it to the app. `Mod-m` matches the binding Monaco/VS Code already ships for the same
  // "toggle tab moves focus" affordance, so it also lands as something some users already know.
  {
    key: 'Mod-m',
    run: (view: EditorView) => {
      view.contentDOM.blur()
      return true
    }
  }
]

// App.tsx owns Ctrl+F, F3/Ctrl+G, and Escape through its own top-bar search UI and the
// window-level keydown listener doesn't stopPropagation, so leaving CodeMirror's own
// bindings in place fires both handlers for the same keystroke.
const appOwnedSearchKeys = new Set(['Mod-f', 'F3', 'Mod-g', 'Escape'])
const editorSearchKeymap = searchKeymap.filter((binding) => !appOwnedSearchKeys.has(binding.key ?? ''))

interface SearchMatch {
  from: number
  to: number
}

interface SearchDecorations {
  decorations: DecorationSet
  matches: SearchMatch[]
}

function buildSearchDecorations(
  state: EditorState,
  rawTerm: string,
  activeIndex: number | null,
  highlightActive: boolean
): SearchDecorations {
  const term = rawTerm.trim()
  if (!term) return { decorations: Decoration.none, matches: [] }

  const query = new SearchQuery({ search: term, caseSensitive: false, literal: true })
  if (!query.valid) return { decorations: Decoration.none, matches: [] }

  const builder = new RangeSetBuilder<Decoration>()
  const matches: SearchMatch[] = []
  const cursor = query.getCursor(state)
  for (let index = 0, match = cursor.next(); !match.done && index < MAX_SEARCH_DECORATIONS; index += 1, match = cursor.next()) {
    const { from, to } = match.value
    if (from !== to) {
      const isActive = highlightActive && index === activeIndex
      builder.add(from, to, isActive ? externalSearchActiveMark : externalSearchMark)
      matches.push({ from, to })
    }
  }
  return { decorations: builder.finish(), matches }
}

const externalSearchHighlight = StateField.define<{
  term: string
  activeIndex: number | null
  highlightActive: boolean
  decorations: DecorationSet
  matches: SearchMatch[]
}>({
  create() {
    return { term: '', activeIndex: null, highlightActive: false, decorations: Decoration.none, matches: [] }
  },
  update(value, tr) {
    let term = value.term
    let activeIndex = value.activeIndex
    let highlightActive = value.highlightActive
    for (const effect of tr.effects) {
      if (effect.is(externalSearchTerm)) term = effect.value
      if (effect.is(externalSearchIndex)) activeIndex = effect.value
      if (effect.is(externalHighlightActive)) highlightActive = effect.value
    }
    if (
      term === value.term &&
      activeIndex === value.activeIndex &&
      highlightActive === value.highlightActive &&
      !tr.docChanged
    )
      return value
    const result = buildSearchDecorations(tr.state, term, activeIndex, highlightActive)
    return { term, activeIndex, highlightActive, ...result }
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations)
})

/** Reads layout, so it must never run while CodeMirror is applying an update. */
function topVisibleLine(view: EditorView): number {
  const rect = view.scrollDOM.getBoundingClientRect()
  const position = view.posAtCoords({ x: rect.left + 1, y: rect.top + 1 }, false)
  return view.state.doc.lineAt(position).number - 1
}

/**
 * Put `line` at the top of the editor viewport.
 *
 * Screen coordinates are the only space both the line block and the scroller agree on, so the
 * distance is measured there and applied to `scrollTop`; the fractional part of `line` moves
 * inside a wrapped line, which keeps the preview mapping continuous instead of stepping.
 */
function scrollLineToTop(view: EditorView, line: number): void {
  const doc = view.state.doc
  const index = Math.min(Math.max(0, Math.floor(line)), doc.lines - 1)
  const fraction = Math.min(Math.max(line - index, 0), 1)
  const block = view.lineBlockAt(doc.line(index + 1).from)
  const scroller = view.scrollDOM
  const delta = view.documentTop + block.top + fraction * block.height - scroller.getBoundingClientRect().top
  const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
  const next = Math.min(Math.max(0, scroller.scrollTop + delta), maxScrollTop)
  if (Math.abs(scroller.scrollTop - next) > 1) scroller.scrollTop = next
}

function activeElementAcceptsText(): boolean {
  const element = document.activeElement
  if (!(element instanceof HTMLElement)) return false

  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element.isContentEditable
  )
}

function countIdleStats(state: EditorState): EditorIdleStats {
  const text = state.doc.toString().trim()
  let words = 0
  let tokens = 0
  let insideWord = false

  for (const character of text) {
    tokens += 1
    if (/\s/.test(character)) {
      insideWord = false
    } else if (!insideWord) {
      words += 1
      insideWord = true
    }
  }

  return { length: state.doc.length, lines: state.doc.lines, words, tokens: Math.ceil(tokens / 4) }
}

/** CodeMirror 6 Markdown source editor with theme-aware styling. */
export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor({ documentId, documentIds, value, theme, fontSize, searchTerm, activeSearchIndex, highlightActive, headingToReveal, outlineVisible, onSearchMatchCountChange, onChange, onEdits, onIdleStatsChange, onOutlineChange, onBlur, onVisibleLineChange }, ref): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const stateCacheRef = useRef(new Map<string, EditorState>())
  const activeDocumentIdRef = useRef(documentId)
  const idleStatsTimerRef = useRef<number | null>(null)
  const outlineTimerRef = useRef<number | null>(null)
  const outlineVisibleRef = useRef(outlineVisible)
  outlineVisibleRef.current = outlineVisible
  const themeCompartment = useRef(new Compartment())
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onEditsRef = useRef(onEdits)
  onEditsRef.current = onEdits
  const onBlurRef = useRef(onBlur)
  onBlurRef.current = onBlur
  const onSearchMatchCountChangeRef = useRef(onSearchMatchCountChange)
  onSearchMatchCountChangeRef.current = onSearchMatchCountChange
  const onIdleStatsChangeRef = useRef(onIdleStatsChange)
  onIdleStatsChangeRef.current = onIdleStatsChange
  const onOutlineChangeRef = useRef(onOutlineChange)
  onOutlineChangeRef.current = onOutlineChange
  const onVisibleLineChangeRef = useRef(onVisibleLineChange)
  onVisibleLineChangeRef.current = onVisibleLineChange
  const visibleLineFrame = useRef(0)

  // Deferred to the next frame: the editor refuses layout reads inside an update, and a
  // scroll can fire many times per frame.
  const notifyVisibleLine = useCallback(() => {
    if (visibleLineFrame.current !== 0 || !onVisibleLineChangeRef.current) return
    visibleLineFrame.current = window.requestAnimationFrame(() => {
      visibleLineFrame.current = 0
      const view = viewRef.current
      if (view) onVisibleLineChangeRef.current?.(topVisibleLine(view))
    })
  }, [])

  useImperativeHandle(ref, () => ({
    getContent: () => viewRef.current?.state.doc.toString() ?? value,
    replaceContent: (content: string) => {
      const view = viewRef.current
      if (!view) return
      const current = view.state.doc.toString()
      if (current === content) return
      view.dispatch({ changes: { from: 0, to: current.length, insert: content } })
    },
    getTopVisibleLine: () => {
      const view = viewRef.current
      return view ? topVisibleLine(view) : 0
    },
    scrollToLine: (line: number) => {
      const view = viewRef.current
      if (!view) return
      scrollLineToTop(view, line)
    }
  }), [value])

  const createState = (content: string): EditorState => EditorState.create({
    doc: content,
    extensions: [
        lineNumbers(),
        history(),
        keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap, ...editorSearchKeymap]),
        markdown(),
        indentUnit.of(EDITOR_INDENT_UNIT),
        search(),
        externalSearchHighlight,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        EditorView.lineWrapping,
        EditorView.domEventHandlers({
          blur: () => onBlurRef.current()
        }),
        themeCompartment.current.of(theme === 'dark' ? oneDarkProExtensions : []),
        EditorView.updateListener.of((update) => {
          const externalSync = update.transactions.some((transaction) => transaction.annotation(externalContentSync))
          if (update.docChanged || update.viewportChanged) notifyVisibleLine()
          if (update.docChanged && !externalSync) {
            const stats = { length: update.state.doc.length, lines: update.state.doc.lines }
            measureRendererNextFrame('editor:transaction-to-frame', stats)
            onChangeRef.current(activeDocumentIdRef.current, stats)
            const edits = collectDraftEdits(update.changes)
            if (edits.length > 0) onEditsRef.current(activeDocumentIdRef.current, edits)
            if (idleStatsTimerRef.current !== null) window.clearTimeout(idleStatsTimerRef.current)
            const documentId = activeDocumentIdRef.current
            idleStatsTimerRef.current = window.setTimeout(() => {
              if (activeDocumentIdRef.current !== documentId) return
              onIdleStatsChangeRef.current(documentId, countIdleStats(update.state))
              idleStatsTimerRef.current = null
            }, 350)
            if (outlineVisibleRef.current) {
              if (outlineTimerRef.current !== null) window.clearTimeout(outlineTimerRef.current)
              const documentId = activeDocumentIdRef.current
              outlineTimerRef.current = window.setTimeout(() => {
                if (activeDocumentIdRef.current === documentId) {
                  onOutlineChangeRef.current(documentId, extractMarkdownOutline(update.state.doc.toString()))
                }
                outlineTimerRef.current = null
              }, 150)
            }
          }
          if (update.docChanged || update.transactions.some((transaction) => transaction.effects.some((effect) => effect.is(externalSearchTerm)))) {
            onSearchMatchCountChangeRef.current(update.state.field(externalSearchHighlight).matches.length)
          }
        })
    ]
  })

  // Create the editor once.
  useEffect(() => {
    if (!hostRef.current) return
    const state = createState(value)
    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    stateCacheRef.current.set(documentId, state)
    return () => {
      if (idleStatsTimerRef.current !== null) window.clearTimeout(idleStatsTimerRef.current)
      if (outlineTimerRef.current !== null) window.clearTimeout(outlineTimerRef.current)
      if (visibleLineFrame.current !== 0) window.cancelAnimationFrame(visibleLineFrame.current)
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Scroll does not bubble, so it is observed on the scroller CodeMirror owns.
  useEffect(() => {
    const scroller = viewRef.current?.scrollDOM
    if (!scroller) return
    scroller.addEventListener('scroll', notifyVisibleLine, { passive: true })
    return () => scroller.removeEventListener('scroll', notifyVisibleLine)
  }, [notifyVisibleLine])

  // Keep one CodeMirror state per tab. State carries history, selection and
  // cursor, so moving between tabs does not replay another tab's editor state.
  useEffect(() => {
    const view = viewRef.current
    if (!view || activeDocumentIdRef.current === documentId) return
    const previousDocumentId = activeDocumentIdRef.current
    // The 350ms idle-stats timer (see the updateListener above) aborts once the active
    // document has moved on, so a tab switch right after typing must flush the stats for
    // the tab being left, or its status bar keeps showing the count from before the last edit.
    if (idleStatsTimerRef.current !== null) {
      window.clearTimeout(idleStatsTimerRef.current)
      idleStatsTimerRef.current = null
      onIdleStatsChangeRef.current(previousDocumentId, countIdleStats(view.state))
    }
    stateCacheRef.current.set(previousDocumentId, view.state)
    const cached = stateCacheRef.current.get(documentId)
    view.setState(cached ?? createState(value))
    activeDocumentIdRef.current = documentId
  }, [documentId])

  useEffect(() => {
    const openDocuments = new Set(documentIds)
    for (const id of stateCacheRef.current.keys()) {
      if (!openDocuments.has(id)) stateCacheRef.current.delete(id)
    }
  }, [documentIds])

  useEffect(() => {
    if (!outlineVisible) return
    const view = viewRef.current
    if (!view) return
    onOutlineChangeRef.current(documentId, extractMarkdownOutline(view.state.doc.toString()))
  }, [documentId, outlineVisible])

  // Sync external content changes (e.g. a newly opened file) into the editor.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (value !== current) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
        annotations: externalContentSync.of(true)
      })
    }
  }, [value])

  // Font size comes from CSS, so CodeMirror has to re-measure line heights itself.
  useEffect(() => {
    viewRef.current?.requestMeasure()
  }, [fontSize])

  // Reconfigure only the theme when it changes.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.current.reconfigure(theme === 'dark' ? oneDarkProExtensions : [])
    })
  }, [theme])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const term = searchTerm.trim()
    const effects = [
      externalSearchTerm.of(searchTerm),
      externalSearchIndex.of(activeSearchIndex),
      externalHighlightActive.of(highlightActive)
    ]

    if (!term) {
      view.dispatch({ effects })
      return
    }

    view.dispatch({ effects })
    const selected = view.state.field(externalSearchHighlight).matches[activeSearchIndex ?? 0]

    if (!selected) {
      return
    }

    const selection = { anchor: selected.from }
    view.dispatch({
      selection,
      effects: EditorView.scrollIntoView(selected.from, { y: 'center' }),
      userEvent: 'select.search'
    })
    if (!activeElementAcceptsText()) view.focus()
  }, [activeSearchIndex, documentId, searchTerm, highlightActive])

  useEffect(() => {
    const view = viewRef.current
    if (!view || !headingToReveal) return
    const position = view.state.doc.line(Math.min(headingToReveal.line + 1, view.state.doc.lines)).from
    view.dispatch({
      selection: { anchor: position },
      // Top, not centre: it matches where the preview puts a heading picked from the outline,
      // and it is the line the live preview follows.
      effects: EditorView.scrollIntoView(position, { y: 'start' }),
      userEvent: 'select.outline'
    })
    view.focus()
  }, [headingToReveal])

  return <div className="editor-pane pane" ref={hostRef} style={{ '--editor-font-size': `${fontSize}px` } as CSSProperties} />
})
