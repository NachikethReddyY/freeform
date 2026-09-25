import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { TldrawUiKbd, useActions, useEditor, useTools, useValue } from 'tldraw'
import { canLayoutSelectedDiagram, layoutSelectedDiagram } from '../diagrams/layout'
import { addConnectedNode, canAddConnectedNode, type ConnectedNodeDirection } from '../diagrams/connectedNode'
import { createStandaloneNode, type TechnicalNodeKind } from '../diagrams/technicalNodes'
import { availableCommandDefinitions, filterCommands, isPaletteShortcut, moveActiveIndex, type CommandDefinition } from './commands'
import './commandPalette.css'

export interface CommandPaletteProps { open: boolean; onOpenChange: (open: boolean) => void }
type PaletteCommand = CommandDefinition & { onSelect: () => void | Promise<void>; kbd?: string }
const connectedDirectionById: Record<string, ConnectedNodeDirection> = {
	'connect-up': 'up', 'connect-right': 'right', 'connect-down': 'down', 'connect-left': 'left',
}
const technicalKindById: Record<string, TechnicalNodeKind> = {
	'create-api': 'api', 'create-database': 'database', 'create-service': 'service',
	'create-queue': 'queue', 'create-function': 'function', 'create-cloud': 'cloud',
}

/** Mount inside Tldraw to reuse its configured tool and action registries. */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
	const editor = useEditor()
	const tools = useTools()
	const actions = useActions()
	const id = useId()
	const dialog = useRef<HTMLDialogElement>(null)
	const input = useRef<HTMLInputElement>(null)
	const closeButton = useRef<HTMLButtonElement>(null)
	const [query, setQuery] = useState('')
	const [active, setActive] = useState(0)
	const [error, setError] = useState('')
	const { readonly, selected, canArrangeDiagram, canArrangeTree, canArrangeRadial, canConnectNode, canCreateNode } = useValue('palette availability', () => ({
		readonly: editor.getIsReadonly(),
		selected: editor.getSelectedShapeIds().length,
		canArrangeDiagram: canLayoutSelectedDiagram(editor),
		canArrangeTree: canLayoutSelectedDiagram(editor, 'tree'),
		canArrangeRadial: canLayoutSelectedDiagram(editor, 'radial'),
		canConnectNode: canAddConnectedNode(editor),
		canCreateNode: !editor.getIsReadonly() && editor.getCurrentPageShapeIds().size < editor.options.maxShapesPerPage,
	}), [editor])
	const commands = useMemo(() => availableCommandDefinitions(canArrangeDiagram, canConnectNode, canCreateNode, canArrangeTree, canArrangeRadial).flatMap<PaletteCommand>((definition) => {
		if (definition.kind === 'custom') {
			if (definition.id === 'arrange-diagram') return [{ ...definition, onSelect: () => { layoutSelectedDiagram(editor) } }]
			if (definition.id === 'arrange-vertical') return [{ ...definition, onSelect: () => { layoutSelectedDiagram(editor, 'vertical') } }]
			if (definition.id === 'arrange-tree') return [{ ...definition, onSelect: () => { layoutSelectedDiagram(editor, 'tree') } }]
			if (definition.id === 'arrange-radial') return [{ ...definition, onSelect: () => { layoutSelectedDiagram(editor, 'radial') } }]
			if (definition.id === 'arrange-compact') return [{ ...definition, onSelect: () => { layoutSelectedDiagram(editor, 'compact') } }]
			if (definition.id === 'create-node') return [{ ...definition, onSelect: () => { createStandaloneNode(editor) } }]
			const technicalKind = technicalKindById[definition.id]
			if (technicalKind) return [{ ...definition, onSelect: () => { createStandaloneNode(editor, technicalKind) } }]
			const direction = connectedDirectionById[definition.id]
			if (!direction) return []
			return [{ ...definition, onSelect: () => { addConnectedNode(editor, direction) } }]
		}
		const native = definition.kind === 'tool' ? tools[definition.id] : actions[definition.id]
		if (!native || (readonly && !native.readonlyOk) || (definition.id === 'zoom-to-selection' && selected === 0)) return []
		return [{ ...definition, onSelect: () => native.onSelect('dialog'), kbd: native.kbd }]
	}), [actions, tools, editor, readonly, selected, canArrangeDiagram, canArrangeTree, canArrangeRadial, canConnectNode, canCreateNode])
	const matches = filterCommands(commands, query)
	const selectedIndex = Math.min(active, Math.max(0, matches.length - 1))

	useEffect(() => {
		const keydown = (event: KeyboardEvent) => {
			if (!isPaletteShortcut(event) || event.defaultPrevented) return
			const target = event.target
			if (!open && (editor.getEditingShapeId() || editor.menus.hasAnyOpenMenus() || target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]'))) return
			event.preventDefault(); event.stopPropagation()
			onOpenChange(!open)
		}
		document.addEventListener('keydown', keydown, true)
		return () => document.removeEventListener('keydown', keydown, true)
	}, [editor, open, onOpenChange])

	useEffect(() => {
		const element = dialog.current
		if (!element) return
		if (open) {
			setQuery(''); setActive(0); setError('')
			if (!element.open) element.showModal()
			input.current?.focus()
		} else if (element.open) element.close()
	}, [open])

	useEffect(() => {
		if (open) document.getElementById(`${id}-command-${selectedIndex}`)?.scrollIntoView({ block: 'nearest' })
	}, [open, id, selectedIndex, query])

	const choose = async (command: typeof commands[number]) => {
		try {
			// The label editor must receive focus after the modal releases it.
			const needsCanvasFocus = command.id in connectedDirectionById || command.id === 'create-node'
				|| command.id in technicalKindById || command.id.startsWith('arrange-') || command.id === 'toggle-focus-mode'
			if (needsCanvasFocus) {
				onOpenChange(false)
				dialog.current?.close()
				// Let the dialog's native focus restoration finish before the shape editor opens.
				await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
				editor.focus()
				await command.onSelect()
				return
			}
			// Native commands still delegate to tldraw's configured registry.
			await command.onSelect()
			onOpenChange(false)
			dialog.current?.close()
			if (!editor.getEditingShapeId()) editor.focus()
		} catch (cause) { setError(cause instanceof Error ? cause.message : 'This command could not run.') }
	}

	return <dialog ref={dialog} className="freeform-command-palette" aria-labelledby={`${id}-title`}
		onCancel={(event) => { event.preventDefault(); onOpenChange(false) }}
		onClose={() => onOpenChange(false)}
		onPointerDown={(event) => {
			event.stopPropagation()
			const bounds = event.currentTarget.getBoundingClientRect()
			if (event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) onOpenChange(false)
		}}
		onKeyDown={(event) => {
			event.stopPropagation()
			if (event.key === 'Tab') {
				event.preventDefault()
				if (document.activeElement === input.current) closeButton.current?.focus()
				else input.current?.focus()
				return
			}
			if (event.nativeEvent.isComposing || event.target !== input.current) return
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault(); setActive(moveActiveIndex(selectedIndex, event.key === 'ArrowDown' ? 1 : -1, matches.length))
			} else if (event.key === 'Enter') {
				event.preventDefault(); const command = matches[selectedIndex]; if (command) void choose(command)
			}
		}}>
		<header><h2 id={`${id}-title`}>Commands</h2><button ref={closeButton} type="button" onClick={() => onOpenChange(false)} aria-label="Close command palette">Esc</button></header>
		<input ref={input} type="text" role="combobox" aria-label="Search commands" aria-autocomplete="list" aria-expanded={open}
			aria-controls={`${id}-results`} aria-activedescendant={matches.length ? `${id}-command-${selectedIndex}` : undefined}
			placeholder="Search tools and actions…" value={query} onChange={(event) => { setQuery(event.target.value); setActive(0); setError('') }} />
		{error && <p role="alert">{error}</p>}
		<ul id={`${id}-results`} role="listbox" aria-label="Commands" tabIndex={-1}>
			{matches.map((command, index) => <li id={`${id}-command-${index}`} key={command.id} role="option" aria-selected={index === selectedIndex}
				onPointerMove={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => void choose(command)}>
				<span>{command.label}</span>{command.kbd && <TldrawUiKbd>{command.kbd}</TldrawUiKbd>}
			</li>)}
		</ul>
		{matches.length === 0 && <p role="status">No matching commands.</p>}
	</dialog>
}
