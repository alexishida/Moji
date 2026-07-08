import { useEffect, useRef } from 'react'
import { Decoration, type DecorationSet, EditorView, keymap, lineNumbers } from '@codemirror/view'
import { EditorState, Compartment, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { search, searchKeymap, SearchQuery } from '@codemirror/search'
import { tags } from '@lezer/highlight'
import type { Theme } from '../../electron/shared'

interface EditorProps {
  value: string
  theme: Theme
  searchTerm: string
  onChange: (value: string) => void
}

const externalSearchTerm = StateEffect.define<string>()
const externalSearchMark = Decoration.mark({ class: 'cm-external-searchMatch' })

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

function buildSearchDecorations(state: EditorState, rawTerm: string): DecorationSet {
  const term = rawTerm.trim()
  if (!term) return Decoration.none

  const query = new SearchQuery({ search: term, caseSensitive: false, literal: true })
  if (!query.valid) return Decoration.none

  const builder = new RangeSetBuilder<Decoration>()
  const cursor = query.getCursor(state)
  for (let match = cursor.next(); !match.done; match = cursor.next()) {
    const { from, to } = match.value
    if (from !== to) builder.add(from, to, externalSearchMark)
  }
  return builder.finish()
}

const externalSearchHighlight = StateField.define<{ term: string; decorations: DecorationSet }>({
  create() {
    return { term: '', decorations: Decoration.none }
  },
  update(value, tr) {
    let term = value.term
    for (const effect of tr.effects) {
      if (effect.is(externalSearchTerm)) term = effect.value
    }
    if (term === value.term && !tr.docChanged) return value
    return { term, decorations: buildSearchDecorations(tr.state, term) }
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations)
})

/** CodeMirror 6 Markdown source editor with theme-aware styling. */
export function Editor({ value, theme, searchTerm, onChange }: EditorProps): JSX.Element {
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
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
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
    const effects = [externalSearchTerm.of(searchTerm)]

    if (!term) {
      view.dispatch({ effects })
      return
    }

    const query = new SearchQuery({ search: term, caseSensitive: false, literal: true })
    const cursor = query.getCursor(view.state)
    const first = cursor.next()
    if (first.done) {
      view.dispatch({ effects })
      return
    }

    const selection = { anchor: first.value.from, head: first.value.to }
    view.dispatch({
      selection,
      effects: [...effects, EditorView.scrollIntoView(first.value.from, { y: 'center' })],
      userEvent: 'select.search'
    })
  }, [searchTerm])

  return <div className="editor-pane pane" ref={hostRef} />
}
