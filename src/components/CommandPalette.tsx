import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { IconSearch, IconX } from './icons'

export interface PaletteCommand {
  id: string
  label: string
  shortcut?: string
  disabled?: boolean
  run: () => void
}

interface CommandPaletteProps {
  open: boolean
  commands: PaletteCommand[]
  onClose: () => void
}

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

export function CommandPalette({ open, commands, onClose }: CommandPaletteProps): JSX.Element | null {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filteredCommands = useMemo(() => {
    const term = normalize(query.trim())
    if (!term) return commands
    return commands.filter((command) => normalize(`${command.label} ${command.shortcut ?? ''}`).includes(term))
  }, [commands, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelected(0)
    window.setTimeout(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    setSelected((index) => Math.min(index, Math.max(0, filteredCommands.length - 1)))
  }, [filteredCommands.length])

  if (!open) return null

  const runCommand = (command: PaletteCommand): void => {
    if (command.disabled) return
    onClose()
    command.run()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelected((index) => Math.min(index + 1, Math.max(0, filteredCommands.length - 1)))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelected((index) => Math.max(0, index - 1))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const command = filteredCommands[selected]
      if (command) runCommand(command)
    }
  }

  return (
    <div className="command-palette-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="command-palette"
        role="dialog"
        aria-label={t('commandPalette.title')}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="command-palette__search">
          <IconSearch width={16} height={16} />
          <input
            ref={inputRef}
            className="command-palette__input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={t('commandPalette.placeholder')}
          />
          <button className="iconbtn command-palette__close" type="button" onClick={onClose} aria-label={t('toolbar.close')}>
            <IconX width={16} height={16} />
          </button>
        </div>

        <div className="command-palette__list" role="listbox" aria-label={t('commandPalette.title')}>
          {filteredCommands.length > 0 ? (
            filteredCommands.map((command, index) => (
              <button
                key={command.id}
                type="button"
                className={`command-palette__item ${index === selected ? 'command-palette__item--active' : ''}`}
                disabled={command.disabled}
                role="option"
                aria-selected={index === selected}
                onMouseEnter={() => setSelected(index)}
                onClick={() => runCommand(command)}
              >
                <span className="command-palette__label">{command.label}</span>
                {command.shortcut && <span className="command-palette__shortcut">{command.shortcut}</span>}
              </button>
            ))
          ) : (
            <p className="command-palette__empty">{t('commandPalette.noResults')}</p>
          )}
        </div>
      </section>
    </div>
  )
}
