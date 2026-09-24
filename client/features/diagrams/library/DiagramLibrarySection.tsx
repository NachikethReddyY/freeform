import { useState } from 'react'
import { useValue, type Editor } from 'tldraw'
import {
	insertSavedBlock, insertStarter, loadPersonalBlocks, removePersonalBlock,
	saveSelectionAsBlock, type StorageLike,
} from './library'
import type { StarterId } from './templates'
import './library.css'

const STARTER_ITEMS: { id: StarterId; label: string; icon: React.ReactNode }[] = [
	{ id: 'flowchart', label: 'Flow', icon: <><rect x="2" y="2" width="7" height="5" rx="1"/><path d="M9 4.5h5v7"/><rect x="12" y="12" width="7" height="5" rx="1"/></> },
	{ id: 'mind-map', label: 'Mind', icon: <><circle cx="11" cy="10" r="2.5"/><path d="M9 8 5 4m8 4 4-4m-8 8-4 5m8-5 4 5"/><circle cx="4" cy="3" r="1"/><circle cx="18" cy="3" r="1"/><circle cx="4" cy="18" r="1"/><circle cx="18" cy="18" r="1"/></> },
	{ id: 'erd', label: 'ERD', icon: <><rect x="2" y="2" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/><path d="M5 5h1m-1 2h2m9 9h1m-1 2h2M9 5h7v8"/></> },
	{ id: 'sequence', label: 'Seq', icon: <><path d="M4 3v16m7-16v16m7-16v16M4 7h13m-3-3 3 3-3 3M18 14H5m3-3-3 3 3 3"/></> },
	{ id: 'architecture', label: 'Stack', icon: <><rect x="2" y="8" width="6" height="6" rx="1"/><rect x="15" y="2" width="6" height="6" rx="1"/><rect x="15" y="14" width="6" height="6" rx="1"/><path d="M8 11h4V5h3m-3 6v6h3"/></> },
]

const starterNames: Record<StarterId, string> = {
	flowchart: 'flowchart', 'mind-map': 'mind map', erd: 'entity relationship',
	sequence: 'sequence', architecture: 'architecture',
}

function Icon({ children }: { children: React.ReactNode }) {
	return <svg viewBox="0 0 22 22" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
}

function PlusIcon() { return <Icon><path d="M11 4v14M4 11h14" /></Icon> }
function SaveIcon() { return <Icon><path d="M4 3h12l3 3v13H3V3h1m3 0v6h8V3M7 19v-7h8v7" /></Icon> }
function TrashIcon() { return <Icon><path d="M4 6h14m-2 0-.7 13H6.7L6 6m3-3h4l1 3M9 9v7m4-7v7" /></Icon> }
function BlocksIcon() { return <Icon><rect x="2" y="2" width="7" height="7" rx="1"/><rect x="13" y="2" width="7" height="7" rx="1"/><rect x="2" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></Icon> }

export function DiagramLibrarySection({ editor, storage = localStorage }: { editor: Editor; storage?: StorageLike }) {
	const [blocks, setBlocks] = useState(() => loadPersonalBlocks(storage))
	const [naming, setNaming] = useState(false)
	const [name, setName] = useState('')
	const [error, setError] = useState('')
	const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null)
	const { selection, readonly } = useValue('diagram library availability', () => ({
		selection: editor.getSelectedShapeIds().length, readonly: editor.getIsReadonly(),
	}), [editor])

	const act = (task: () => void) => {
		try { task(); setError('') }
		catch (cause) { setError(cause instanceof Error ? cause.message : 'Library action failed.') }
	}

	const save = () => act(() => {
		saveSelectionAsBlock(editor, name, storage)
		setBlocks(loadPersonalBlocks(storage)); setNaming(false); setName('')
	})

	return <div className="freeform-diagram-library" aria-label="Diagram library">
		<div className="freeform-diagram-library-heading">Starters</div>
		<div className="freeform-diagram-starters">
			{STARTER_ITEMS.map(({ id, label, icon }) => <button key={id} type="button" disabled={readonly}
				title={`Insert ${starterNames[id]} starter`}
				aria-label={`Insert ${starterNames[id]} starter`}
				onClick={() => act(() => { insertStarter(editor, id) })}>
				<Icon>{icon}</Icon><span>{label}</span>
			</button>)}
		</div>
		<div className="freeform-diagram-library-heading freeform-diagram-library-heading--blocks">
			<span>My blocks</span>
			<button type="button" className="freeform-diagram-icon-button" title="Save selection as a block" aria-label="Save selection as a block"
				disabled={readonly || selection === 0} onClick={() => { setNaming(true); setArmedDeleteId(null); setError('') }}><SaveIcon /></button>
		</div>
		{naming && <form className="freeform-diagram-save" onSubmit={(event) => { event.preventDefault(); save() }}>
			<input autoFocus type="text" maxLength={60} aria-label="Block name" placeholder="Block name" value={name} onChange={(event) => setName(event.target.value)}
				onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setNaming(false); setName('') } }} />
			<button type="submit" disabled={!name.trim()}>Save</button>
			<button type="button" className="freeform-diagram-icon-button" aria-label="Cancel saving block" title="Cancel" onClick={() => { setNaming(false); setName('') }}>×</button>
		</form>}
		{blocks.length > 0 && <div className="freeform-diagram-blocks">
			{blocks.map((block) => <div className="freeform-diagram-block" key={block.id}>
				<BlocksIcon /><span title={block.name}>{block.name}</span>
				<button type="button" className="freeform-diagram-icon-button" disabled={readonly} title={`Insert ${block.name}`} aria-label={`Insert ${block.name}`}
					onClick={() => act(() => { insertSavedBlock(editor, block) })}><PlusIcon /></button>
				<button type="button" className="freeform-diagram-icon-button" title={armedDeleteId === block.id ? `Confirm remove ${block.name}` : `Remove ${block.name}`}
					aria-label={armedDeleteId === block.id ? `Confirm remove ${block.name}` : `Remove ${block.name}`}
					data-armed={armedDeleteId === block.id} onClick={() => {
						if (armedDeleteId !== block.id) { setArmedDeleteId(block.id); return }
						act(() => { removePersonalBlock(block.id, storage); setBlocks(loadPersonalBlocks(storage)); setArmedDeleteId(null) })
					}}><TrashIcon /></button>
			</div>)}
		</div>}
		{error && <p className="freeform-diagram-library-error" role="alert">{error}</p>}
	</div>
}
