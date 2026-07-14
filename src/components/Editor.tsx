import { useEffect, useRef } from 'react'
import { Decoration, type Command, type DecorationSet, EditorView, keymap, lineNumbers } from '@codemirror/view'
import { EditorSelection, EditorState, Compartment, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { search, searchKeymap, SearchQuery } from '@codemirror/search'
import { tags } from '@lezer/highlight'
import type { Theme } from '../../electron/shared'
import { findMarkdownHeadingLine } from '../lib/markdown'

interface EditorProps {
  value: string
  theme: Theme
  searchTerm: string
  activeSearchIndex: number | null
  highlightActive: boolean
  headingToReveal: { id: string; request: number } | null
  onChange: (value: string) => void
}

const externalSearchTerm = StateEffect.define<string>()
const externalSearchIndex = StateEffect.define<number | null>()
const externalHighlightActive = StateEffect.define<boolean>()
const externalSearchMark = Decoration.mark({ class: 'cm-external-searchMatch' })
const externalSearchActiveMark = Decoration.mark({ class: 'cm-external-searchMatch cm-external-searchMatch--active' })

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
  { key: 'Mod-Shift-k', run: wrapMarkdown('```\n', '\n```', 'code') }
]

function buildSearchDecorations(
  state: EditorState,
  rawTerm: string,
  activeIndex: number | null,
  highlightActive: boolean
): DecorationSet {
  const term = rawTerm.trim()
  if (!term) return Decoration.none

  const query = new SearchQuery({ search: term, caseSensitive: false, literal: true })
  if (!query.valid) return Decoration.none

  const builder = new RangeSetBuilder<Decoration>()
  const cursor = query.getCursor(state)
  for (let index = 0, match = cursor.next(); !match.done; index += 1, match = cursor.next()) {
    const { from, to } = match.value
    if (from !== to) {
      const isActive = highlightActive && index === activeIndex
      builder.add(from, to, isActive ? externalSearchActiveMark : externalSearchMark)
    }
  }
  return builder.finish()
}

const externalSearchHighlight = StateField.define<{
  term: string
  activeIndex: number | null
  highlightActive: boolean
  decorations: DecorationSet
}>({
  create() {
    return { term: '', activeIndex: null, highlightActive: false, decorations: Decoration.none }
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
    return { term, activeIndex, highlightActive, decorations: buildSearchDecorations(tr.state, term, activeIndex, highlightActive) }
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations)
})

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

/** CodeMirror 6 Markdown source editor with theme-aware styling. */
export function Editor({ value, theme, searchTerm, activeSearchIndex, highlightActive, headingToReveal, onChange }: EditorProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const themeCompartment = useRef(new Compartment())
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Create the editor once.
  useEffect(() => {
    if (!hostRef.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        markdown(),
        search(),
        externalSearchHighlight,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        EditorView.lineWrapping,
        themeCompartment.current.of(theme === 'dark' ? oneDarkProExtensions : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString())
        })
      ]
    })
    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external content changes (e.g. a newly opened file) into the editor.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (value !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
    }
  }, [value])

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

    const query = new SearchQuery({ search: term, caseSensitive: false, literal: true })
    const cursor = query.getCursor(view.state)
    const matchIndex = activeSearchIndex ?? 0
    let selected: { from: number; to: number } | null = null

    for (let index = 0, match = cursor.next(); !match.done; index += 1, match = cursor.next()) {
      if (index === matchIndex) {
        selected = match.value
        break
      }
    }

    if (!selected) {
      view.dispatch({ effects })
      return
    }

    const selection = { anchor: selected.from }
    view.dispatch({
      selection,
      effects: [...effects, EditorView.scrollIntoView(selected.from, { y: 'center' })],
      userEvent: 'select.search'
    })
    if (!activeElementAcceptsText()) view.focus()
  }, [activeSearchIndex, searchTerm, highlightActive])

  useEffect(() => {
    const view = viewRef.current
    if (!view || !headingToReveal) return
    const line = findMarkdownHeadingLine(view.state.doc.toString(), headingToReveal.id)
    if (line === null) return
    const position = view.state.doc.line(line + 1).from
    view.dispatch({
      selection: { anchor: position },
      effects: EditorView.scrollIntoView(position, { y: 'center' }),
      userEvent: 'select.outline'
    })
    view.focus()
  }, [headingToReveal])

  return <div className="editor-pane pane" ref={hostRef} />
}
