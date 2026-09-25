import { useState } from 'react'
import { useValue, type Editor } from 'tldraw'
import {
	insertSavedBlock, insertStarter, loadPersonalBlocks, removePersonalBlock,
	saveSelectionAsBlock, type StorageLike,
} from './library'
import type { StarterId } from './templates'
import { TECHNICAL_NODES, createStandaloneNode } from '../technicalNodes'
import { exportSelectedDiagramAsMermaid } from '../mermaidExport'
import './library.css'

const STARTER_ITEMS: { id: StarterId; label: string; icon: React.ReactNode }[] = [
	{ id: 'flowchart', label: 'Flow', icon: <><rect x="2" y="2" width="7" height="5" rx="1"/><path d="M9 4.5h5v7"/><rect x="12" y="12" width="7" height="5" rx="1"/></> },
	{ id: 'mind-map', label: 'Mind', icon: <><circle cx="11" cy="10" r="2.5"/><path d="M9 8 5 4m8 4 4-4m-8 8-4 5m8-5 4 5"/><circle cx="4" cy="3" r="1"/><circle cx="18" cy="3" r="1"/><circle cx="4" cy="18" r="1"/><circle cx="18" cy="18" r="1"/></> },
	{ id: 'erd', label: 'ERD', icon: <><rect x="2" y="2" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/><path d="M5 5h1m-1 2h2m9 9h1m-1 2h2M9 5h7v8"/></> },
	{ id: 'sequence', label: 'Seq', icon: <><path d="M4 3v16m7-16v16m7-16v16M4 7h13m-3-3 3 3-3 3M18 14H5m3-3-3 3 3 3"/></> },
	{ id: 'architecture', label: 'Stack', icon: <><rect x="2" y="8" width="6" height="6" rx="1"/><rect x="15" y="2" width="6" height="6" rx="1"/><rect x="15" y="14" width="6" height="6" rx="1"/><path d="M8 11h4V5h3m-3 6v6h3"/></> },
	{ id: 'api-stack', label: 'API', icon: <><rect x="2" y="8" width="5" height="6" rx="1"/><rect x="10" y="8" width="5" height="6" rx="1"/><rect x="18" y="3" width="3" height="5" rx="1"/><rect x="18" y="14" width="3" height="5" rx="1"/><path d="M7 11h3m5 0h2V5h1m-1 6v5h1"/></> },
	{ id: 'data-model', label: 'Data', icon: <><rect x="2" y="4" width="5" height="14" rx="1"/><rect x="9" y="4" width="5" height="14" rx="1"/><rect x="16" y="4" width="5" height="14" rx="1"/><path d="M3.5 7h2m5 0h2m5 0h2M7 11h2m5 0h2"/></> },
	{ id: 'request-flow', label: 'Req', icon: <><rect x="2" y="8" width="5" height="6" rx="1"/><path d="M7 11h5m-2-2 2 2-2 2m2-2h3m0 0 3-5m-3 5 3 5"/><circle cx="19" cy="5" r="2"/><circle cx="19" cy="17" r="2"/></> },
]

const starterNames: Record<StarterId, string> = {
	flowchart: 'flowchart', 'mind-map': 'mind map', erd: 'entity relationship',
	sequence: 'sequence', architecture: 'architecture', 'api-stack': 'API stack',
	'data-model': 'data model', 'request-flow': 'request flow',
}

function Icon({ children }: { children: React.ReactNode }) {
	return <svg viewBox="0 0 22 22" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
}

function PlusIcon() { return <Icon><path d="M11 4v14M4 11h14" /></Icon> }
function SaveIcon() { return <Icon><path d="M4 3h12l3 3v13H3V3h1m3 0v6h8V3M7 19v-7h8v7" /></Icon> }
function TrashIcon() { return <Icon><path d="M4 6h14m-2 0-.7 13H6.7L6 6m3-3h4l1 3M9 9v7m4-7v7" /></Icon> }
function BlocksIcon() { return <Icon><rect x="2" y="2" width="7" height="7" rx="1"/><rect x="13" y="2" width="7" height="7" rx="1"/><rect x="2" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></Icon> }
function CodeIcon() { return <Icon><path d="m8 6-5 5 5 5m6-10 5 5-5 5m-1-12-4 14" /></Icon> }
function TechnicalIcon({ kind }: { kind: typeof TECHNICAL_NODES[number]['kind'] }) {
	switch (kind) {
	case 'api': return <Icon><rect x="2" y="4" width="18" height="14" rx="2"/><path d="M2 8h18M6 6h.01M9 6h.01m-2 7h8"/></Icon>
	case 'database': return <Icon><ellipse cx="11" cy="5" rx="8" ry="3"/><path d="M3 5v11c0 4 16 4 16 0V5M3 11c0 4 16 4 16 0"/></Icon>
	case 'service': return <Icon><rect x="2" y="3" width="18" height="16" rx="2"/><path d="M6 7h10M6 11h10M6 15h7"/></Icon>
	case 'queue': return <Icon><rect x="2" y="3" width="6" height="4" rx="1"/><rect x="2" y="9" width="6" height="4" rx="1"/><rect x="2" y="15" width="6" height="4" rx="1"/><path d="M8 5h10m-10 6h10m-10 6h10"/></Icon>
	case 'function': return <Icon><path d="m8 5-5 6 5 6m6-12 5 6-5 6M13 3l-4 16"/></Icon>
	case 'cloud': return <Icon><path d="M6 17h11a4 4 0 0 0 .2-8A6 6 0 0 0 6 9a4 4 0 0 0 0 8Z"/></Icon>
	}
}

export function DiagramLibrarySection({ editor, storage = localStorage }: { editor: Editor; storage?: StorageLike }) {
	const [blocks, setBlocks] = useState(() => loadPersonalBlocks(storage))
	const [naming, setNaming] = useState(false)
	const [name, setName] = useState('')
	const [error, setError] = useState('')
	const [feedback, setFeedback] = useState('')
	const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null)
	const { selection, readonly } = useValue('diagram library availability', () => ({
		selection: editor.getSelectedShapeIds().length, readonly: editor.getIsReadonly(),
	}), [editor])

	const act = (task: () => void) => {
		try { task(); setError(''); setFeedback('') }
		catch (cause) { setError(cause instanceof Error ? cause.message : 'Library action failed.') }
	}
	const copyMermaid = async () => {
		try {
			const result = exportSelectedDiagramAsMermaid(editor)
			await navigator.clipboard.writeText(result.source)
			const { shapes, arrows, approximatedShapes, normalizedLabels } = result.omitted
			const details = [
				shapes && `${shapes} shapes omitted`, arrows && `${arrows} arrows omitted`,
				approximatedShapes && `${approximatedShapes} shapes simplified`, normalizedLabels && `${normalizedLabels} labels normalized`,
			].filter(Boolean).join(', ')
			setFeedback(`Copied ${result.included.nodes} nodes and ${result.included.arrows} arrows${details ? ` · ${details}` : ''}.`)
			setError('')
		} catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not copy Mermaid.'); setFeedback('') }
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
		<div className="freeform-diagram-library-heading freeform-diagram-library-heading--nodes">
			<span>Nodes</span>
			<button type="button" className="freeform-diagram-icon-button" title="Copy selected diagram as Mermaid" aria-label="Copy selected diagram as Mermaid"
				disabled={selection === 0} onClick={() => { void copyMermaid() }}><CodeIcon /></button>
		</div>
		<div className="freeform-diagram-nodes">
			{TECHNICAL_NODES.map(({ kind, title }) => <button key={kind} type="button" disabled={readonly}
				aria-label={`Add ${title} node`} title={`Add ${title} node`} onClick={() => act(() => { createStandaloneNode(editor, kind) })}>
				<TechnicalIcon kind={kind} />
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
		{feedback && <p className="freeform-diagram-library-feedback" role="status">{feedback}</p>}
	</div>
}
