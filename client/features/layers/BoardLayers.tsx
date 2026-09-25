import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useValue, type Editor, type TLShapeId } from 'tldraw'
import { buildLayerTree, selectLayer, type LayerItem } from './layersModel'
import './boardLayers.css'

function Glyph({ type }: { type: LayerItem['type'] }) {
	let drawing: ReactNode
	switch (type) {
	case 'frame': drawing = <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 8h18" /></>; break
	case 'group': drawing = <><rect x="2.5" y="2.5" width="19" height="19" rx="2" strokeDasharray="2 2" /><rect x="7" y="7" width="10" height="10" rx="1" /></>; break
	case 'arrow': drawing = <><path d="M3 12h17m-6-6 6 6-6 6" /></>; break
	case 'text': drawing = <><path d="M4 5h16M12 5v14m-4 0h8" /></>; break
	case 'note': drawing = <><path d="M4 3h16v13l-5 5H4zM15 21v-5h5" /></>; break
	case 'image': drawing = <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8" cy="9" r="1" /><path d="m5 17 5-5 4 4 3-3 3 3" /></>; break
	case 'geo': drawing = <rect x="4" y="4" width="16" height="16" rx="2" />; break
	default: drawing = <><path d="M4 12h16M12 4v16" /></>
	}
	return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{drawing}</svg>
}

function LayerRows({ items, selected, editor, rowRefs }: {
	items: readonly LayerItem[]
	selected: ReadonlySet<TLShapeId>
	editor: Editor
	rowRefs: React.RefObject<Map<TLShapeId, HTMLButtonElement>>
}) {
	return <ul className="freeform-layers__list">
		{items.map((item) => {
			const isSelected = selected.has(item.id)
			return <li key={item.id} className="freeform-layers__item">
				<button type="button" ref={(node) => { if (node) rowRefs.current.set(item.id, node); else rowRefs.current.delete(item.id) }}
					className="freeform-layers__row" data-selected={isSelected}
					aria-pressed={isSelected}
					aria-label={`${item.label}, ${item.type}${isSelected ? ', selected' : ''}`}
					title={item.label} onClick={() => selectLayer(editor, item.id)}>
					<Glyph type={item.type} /><span className="freeform-layers__name">{item.label}</span>
				</button>
				{item.children.length > 0 && <LayerRows items={item.children} selected={selected} editor={editor} rowRefs={rowRefs} />}
			</li>
		})}
	</ul>
}

/** Closed by default. Place the trigger in an existing toolbar; no editor records are created. */
export function BoardLayers({ editor, placement = 'below', className = '' }: {
	editor: Editor
	placement?: 'above' | 'below'
	className?: string
}) {
	const [open, setOpen] = useState(false)
	const panelId = useId()
	const root = useRef<HTMLDivElement>(null)
	const trigger = useRef<HTMLButtonElement>(null)
	const rows = useRef(new Map<TLShapeId, HTMLButtonElement>())
	const items = useValue('FreeForm layers', () => buildLayerTree(editor), [editor])
	const selectedIds = useValue('FreeForm layers selection', () => editor.getSelectedShapeIds(), [editor])
	const selected = new Set(selectedIds)
	const pageId = useValue('FreeForm layers page', () => editor.getCurrentPageId(), [editor])

	useEffect(() => {
		if (!open) return
		const document = editor.getContainer().ownerDocument
		const onOutsidePointer = (event: PointerEvent) => {
			if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
		}
		document.addEventListener('pointerdown', onOutsidePointer, true)
		return () => document.removeEventListener('pointerdown', onOutsidePointer, true)
	}, [editor, open])

	useEffect(() => {
		if (!open) return
		for (const id of selectedIds) {
			const row = rows.current.get(id)
			if (!row) continue
			row.scrollIntoView({ block: 'nearest' })
			break
		}
	}, [open, pageId, selectedIds])

	return <div ref={root} className={`freeform-layers freeform-layers--${placement} ${className}`} onPointerDown={(event) => event.stopPropagation()}>
		<button ref={trigger} type="button" className="freeform-layers__trigger" aria-label="Layers" title="Layers"
			aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
				<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" />
			</svg>
		</button>
		{open && <section id={panelId} className="freeform-layers__panel" aria-label="Layers"
			onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus() } }}>
			<header className="freeform-layers__header"><strong>Layers</strong>
				<button type="button" className="freeform-layers__close" aria-label="Close layers" title="Close layers"
					onClick={() => { setOpen(false); trigger.current?.focus() }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19" /></svg></button>
			</header>
			{items.length ? <div className="freeform-layers__scroll"><LayerRows items={items} selected={selected} editor={editor} rowRefs={rows} /></div>
				: <p className="freeform-layers__empty">No shapes on this page.</p>}
		</section>}
	</div>
}
