import { FormEvent, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
	DEFAULT_COLLECTION_TITLE,
	useBoardIndex,
	validateBoardTitle,
	validateCollectionTitle,
	type LocalBoardCollection,
} from './boardIndex'
import { filterBoardsByName, openBoardFromDashboard } from './dashboardModel'
import { useBoardPreview } from './useBoardPreview'
import { AccountTools } from '../auth/AccountTools'
import './BoardDashboard.css'

function formatOpenedAt(timestamp: number): string {
	const elapsed = Math.max(0, Date.now() - timestamp)
	if (elapsed < 60_000) return 'Opened just now'
	if (elapsed < 60 * 60_000) return `Opened ${Math.floor(elapsed / 60_000)}m ago`
	if (elapsed < 24 * 60 * 60_000) return `Opened ${Math.floor(elapsed / (60 * 60_000))}h ago`
	if (elapsed < 7 * 24 * 60 * 60_000) return `Opened ${Math.floor(elapsed / (24 * 60 * 60_000))}d ago`
	return `Opened ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(timestamp)}`
}

function CollectionEditor({
	collection,
	onSave,
	onCancel,
}: {
	collection?: LocalBoardCollection
	onSave(title: string): void
	onCancel(): void
}) {
	const [title, setTitle] = useState(collection?.title ?? '')
	const [error, setError] = useState('')
	const inputId = useId()
	const submit = (event: FormEvent) => {
		event.preventDefault()
		try {
			onSave(validateCollectionTitle(title))
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Enter a collection name.')
		}
	}
	return <form className="board-dashboard-collection-form" onSubmit={submit} onKeyDown={(event) => {
		if (event.key === 'Escape') {
			event.preventDefault()
			onCancel()
		}
	}}>
		<label className="board-dashboard-visually-hidden" htmlFor={inputId}>Collection name</label>
		<div className="board-dashboard-collection-input-row">
			<input
				autoFocus
				id={inputId}
				maxLength={64}
				value={title}
				aria-invalid={Boolean(error)}
				aria-describedby={error ? `${inputId}-error` : undefined}
				onChange={(event) => { setTitle(event.target.value); setError('') }}
			/>
			<button type="submit" aria-label="Save collection" title="Save collection">
				<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8" /></svg>
			</button>
			<button type="button" aria-label="Cancel" title="Cancel" onClick={onCancel}>
				<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
			</button>
		</div>
		{error && <p id={`${inputId}-error`} role="alert">{error}</p>}
	</form>
}

function BoardPreviewCard({
	board,
	collectionTitle,
	collections,
	selectionMode,
	selected,
	inTrash,
	onActivate,
	onRename,
	onMove,
	onDelete,
	onRestore,
}: {
	board: ReturnType<typeof useBoardIndex>['boards'][number]
	collectionTitle: string
	collections: LocalBoardCollection[]
	selectionMode: boolean
	selected: boolean
	inTrash: boolean
	onActivate(): void
	onRename(title: string): void
	onMove(collectionId: string): void
	onDelete(): void
	onRestore(): void
}) {
	const { url, loading } = useBoardPreview(board.id)
	const [menuOpen, setMenuOpen] = useState(false)
	const [menuPlacement, setMenuPlacement] = useState<{ above: boolean; maxHeight: number } | null>(null)
	const menuButtonRef = useRef<HTMLButtonElement>(null)
	const menuRef = useRef<HTMLDivElement>(null)
	const [editing, setEditing] = useState(false)
	const [title, setTitle] = useState(board.title)
	const [error, setError] = useState('')
	const [feedback, setFeedback] = useState('')
	const inputId = useId()
	useLayoutEffect(() => {
		if (!menuOpen) return
		const placeMenu = () => {
			if (!menuButtonRef.current || !menuRef.current) return
			const trigger = menuButtonRef.current.getBoundingClientRect()
			const below = window.innerHeight - trigger.bottom - 8
			const above = trigger.top - 8
			const openAbove = below < menuRef.current.scrollHeight + 5 && above > below
			setMenuPlacement({ above: openAbove, maxHeight: Math.max(0, Math.floor(openAbove ? above : below) - 5) })
		}
		placeMenu()
		window.addEventListener('resize', placeMenu)
		window.addEventListener('scroll', placeMenu, true)
		return () => {
			window.removeEventListener('resize', placeMenu)
			window.removeEventListener('scroll', placeMenu, true)
		}
	}, [menuOpen])
	const saveTitle = (event: FormEvent) => {
		event.preventDefault()
		try {
			const validatedTitle = validateBoardTitle(title)
			onRename(validatedTitle)
			setTitle(validatedTitle)
			setEditing(false)
			setError('')
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Enter a board name.')
		}
	}
	const cancelRename = () => {
		setTitle(board.title)
		setError('')
		setEditing(false)
	}
	const copyLink = async () => {
		const link = `${window.location.origin}/${encodeURIComponent(board.id)}`
		try {
			await navigator.clipboard.writeText(link)
			setFeedback('Link copied')
		} catch {
			setFeedback('Clipboard access unavailable')
		}
		setMenuOpen(false)
		window.setTimeout(() => setFeedback(''), 2400)
	}
	return <article className="board-dashboard-card">
		<button
			type="button"
			className={`board-dashboard-open-card${selected ? ' is-selected' : ''}`}
			aria-label={selectionMode ? `${selected ? 'Deselect' : 'Select'} board ${board.title}` : inTrash ? `Restore and open board ${board.title}` : `Open board ${board.title}`}
			aria-pressed={selectionMode ? selected : undefined}
			onClick={onActivate}
		>
			<span className="board-dashboard-preview" aria-hidden="true">
				{url
					? <img src={url} alt="" />
					: <>
						<span className="board-dashboard-preview-mark" aria-hidden="true"><img src="/freeform-logo.svg" alt="" /></span>
						<span className="board-dashboard-preview-note">{loading ? 'Loading preview' : 'Open board to create preview'}</span>
					</>}
				{selectionMode && <span className="board-dashboard-selection-mark" aria-hidden="true">{selected ? '✓' : ''}</span>}
			</span>
		</button>
		<div className="board-dashboard-card-details">
			{editing
				? <form className="board-dashboard-board-name-form" onSubmit={saveTitle} onKeyDown={(event) => {
					if (event.key === 'Escape') {
						event.preventDefault()
						event.stopPropagation()
						cancelRename()
					}
				}}>
					<label className="board-dashboard-visually-hidden" htmlFor={inputId}>Board name</label>
					<input id={inputId} autoFocus maxLength={64} value={title} aria-invalid={Boolean(error)} aria-describedby={error ? `${inputId}-error` : undefined} onChange={(event) => { setTitle(event.target.value); setError('') }} />
					<button type="submit" aria-label="Save board name" title="Save board name"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8" /></svg></button>
					<button type="button" aria-label="Cancel board rename" title="Cancel board rename" onClick={cancelRename}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg></button>
					{error && <p id={`${inputId}-error`} role="alert">{error}</p>}
				</form>
				: <button type="button" className="board-dashboard-card-copy" onClick={onActivate}>
					<strong>{board.title}</strong>
					<small>{formatOpenedAt(board.lastOpenedAt)}</small>
				</button>}
		</div>
		<div className="board-dashboard-card-footer">
			<span>{collectionTitle}</span>
			{feedback && <small role="status">{feedback}</small>}
			<div className="board-dashboard-card-menu-wrap">
				<button ref={menuButtonRef} type="button" className="board-dashboard-card-menu-button" aria-label={`Board actions for ${board.title}`} aria-haspopup="true" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>···</button>
				{menuOpen && <div ref={menuRef} className={`board-dashboard-card-menu${menuPlacement?.above ? ' is-above' : ''}`} style={{ maxHeight: menuPlacement ? `${menuPlacement.maxHeight}px` : undefined }} role="group" aria-label={`Actions for ${board.title}`}>
					{inTrash
						? <button type="button" onClick={() => { onRestore(); setMenuOpen(false) }}>Restore</button>
						: <>
							<button type="button" onClick={() => { setTitle(board.title); setEditing(true); setMenuOpen(false) }}>Rename</button>
							<label>
								<span>Move to</span>
								<select aria-label={`Move ${board.title} to collection`} value="" onChange={(event) => { if (event.target.value) { onMove(event.target.value); setMenuOpen(false) } }}>
									<option value="" disabled>Collection…</option>
									{collections.map((collection) => <option value={collection.id} key={collection.id}>{collection.title}</option>)}
								</select>
							</label>
							<button type="button" onClick={() => { onDelete(); setMenuOpen(false) }}>Delete</button>
						</>}
					<button type="button" onClick={() => void copyLink()}>Copy board link</button>
				</div>}
			</div>
		</div>
	</article>
}

export function BoardDashboard() {
	const navigate = useNavigate()
	const {
		boards,
		collections,
		trashBoards,
		createBoard,
		createCollection,
		renameCollection,
		renameBoard,
		moveBoard,
		deleteBoard,
		restoreBoard,
	} = useBoardIndex()
	const [query, setQuery] = useState('')
	const [selectedCollectionId, setSelectedCollectionId] = useState('all')
	const [creatingCollection, setCreatingCollection] = useState(false)
	const [renamingCollectionId, setRenamingCollectionId] = useState<string | null>(null)
	const [selectionMode, setSelectionMode] = useState(false)
	const [selectedBoardIds, setSelectedBoardIds] = useState<Set<string>>(() => new Set())

	const inTrash = selectedCollectionId === 'trash'
	const selectedCollection = collections.find((collection) => collection.id === selectedCollectionId)
	const filteredBoards = useMemo(() => {
		const inCollection = inTrash
			? trashBoards
			: selectedCollectionId === 'all'
				? boards
				: boards.filter((board) => board.collectionId === selectedCollectionId)
		return filterBoardsByName(inCollection, query)
	}, [boards, inTrash, query, selectedCollectionId, trashBoards])

	const collectionLabel = (id: string) => collections.find((collection) => collection.id === id)?.title ?? DEFAULT_COLLECTION_TITLE
	const openBoard = (board: ReturnType<typeof useBoardIndex>['boards'][number]) => {
		openBoardFromDashboard(board, restoreBoard, navigate)
	}
	const startBoard = () => {
		const board = createBoard(undefined, selectedCollectionId === 'all' ? undefined : selectedCollectionId)
		navigate(`/${board.id}`)
	}
	const toggleBoardSelection = (id: string) => {
		setSelectedBoardIds((current) => {
			const next = new Set(current)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}
	const leaveSelectionMode = () => {
		setSelectionMode(false)
		setSelectedBoardIds(new Set())
	}
	const moveSelectedBoards = (collectionId: string) => {
		for (const id of selectedBoardIds) moveBoard(id, collectionId)
		leaveSelectionMode()
	}
	const confirmDeleteBoard = (id: string, title: string) => {
		if (!window.confirm(`Delete “${title}”? It will move to Trash. Its canvas and uploaded media stay saved, and you can restore it later.`)) return
		deleteBoard(id)
	}
	const openSelectedBoard = () => {
		if (selectedBoardIds.size !== 1) return
		navigate(`/${selectedBoardIds.values().next().value}`)
	}
	const updateQuery = (value: string) => {
		setQuery(value)
		setSelectedBoardIds(new Set())
	}
	const updateCollectionFilter = (id: string) => {
		setSelectedCollectionId(id)
		if (id === 'trash') leaveSelectionMode()
		else setSelectedBoardIds(new Set())
	}
	const saveNewCollection = (title: string) => {
		const collection = createCollection(title)
		setCreatingCollection(false)
		setSelectedCollectionId(collection.id)
	}
	const saveCollectionName = (id: string, title: string) => {
		renameCollection(id, title)
		setRenamingCollectionId(null)
	}

	return <div className="board-dashboard" onKeyDown={(event) => {
		if (event.key === 'Escape' && selectionMode) leaveSelectionMode()
	}}>
		<div className="board-dashboard-layout">
			<aside className="board-dashboard-sidebar" aria-label="Board collections">
				<Link className="board-dashboard-brand" to="/" aria-label="FreeForm dashboard">
					<img src="/freeform-logo.svg" alt="" />
					<strong>FreeForm</strong>
				</Link>
				<div className="board-dashboard-search">
					<label htmlFor="board-dashboard-search">Search board names</label>
					<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg>
					<input
						id="board-dashboard-search"
						type="search"
						placeholder="Quick search"
						value={query}
						onChange={(event) => updateQuery(event.target.value)}
					/>
				</div>
				<nav className="board-dashboard-collections" aria-label="Board navigation">
					<button type="button" className={`board-dashboard-home${selectedCollectionId === 'all' ? ' is-selected' : ''}`} aria-current={selectedCollectionId === 'all' ? 'page' : undefined} onClick={() => updateCollectionFilter('all')}>
						<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="2.5" width="15" height="15" rx="2" /><path d="M8 2.5v15M8 8h9.5" /></svg>
						<span>Dashboard</span><small>{boards.length}</small>
					</button>
					<div className="board-dashboard-sidebar-heading">
						<h2>Collections</h2>
						<button type="button" aria-label="Add collection" title="Add collection" onClick={() => setCreatingCollection(true)}>+</button>
					</div>
					{collections.map((collection) => <div className="board-dashboard-collection-row" key={collection.id}>
						{renamingCollectionId === collection.id
							? <CollectionEditor collection={collection} onSave={(title) => saveCollectionName(collection.id, title)} onCancel={() => setRenamingCollectionId(null)} />
							: <>
								<button type="button" className={selectedCollectionId === collection.id ? 'is-selected' : ''} aria-current={selectedCollectionId === collection.id ? 'page' : undefined} onClick={() => updateCollectionFilter(collection.id)}>
									<span>{collection.title}</span><small>{boards.filter((board) => board.collectionId === collection.id).length}</small>
								</button>
								<button type="button" className="board-dashboard-rename-collection" aria-label={`Rename ${collection.title}`} title={`Rename ${collection.title}`} onClick={() => setRenamingCollectionId(collection.id)}>···</button>
							</>}
					</div>)}
					<button type="button" className={`board-dashboard-trash${selectedCollectionId === 'trash' ? ' is-selected' : ''}`} aria-current={selectedCollectionId === 'trash' ? 'page' : undefined} onClick={() => updateCollectionFilter('trash')}>
						<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 5h13M7 5V3.5h6V5m-8 0 .7 11.5h8.6L15 5M8 8v5.5m4-5.5v5.5" /></svg>
						<span>Trash</span><small>{trashBoards.length}</small>
					</button>
				</nav>
				{creatingCollection && <CollectionEditor onSave={saveNewCollection} onCancel={() => setCreatingCollection(false)} />}
				<AccountTools />
			</aside>

			<main className="board-dashboard-main">
				<div className="board-dashboard-title-row">
					<h1>{inTrash ? 'Trash' : selectedCollection?.title ?? 'Dashboard'}</h1>
					{!inTrash && <button type="button" className="board-dashboard-start" onClick={startBoard}>
						<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m3 17 3.7-.8L16.5 6.4a2 2 0 0 0-2.9-2.9L3.8 13.3 3 17Z" /><path d="m12.7 4.4 2.9 2.9" /></svg>
						<span>Start drawing</span>
					</button>}
				</div>
				<div className="board-dashboard-section-row">
					<div className="board-dashboard-section-heading">
						<h2>{query.trim() ? 'Search results' : inTrash ? 'Deleted boards' : selectedCollection ? 'Boards' : 'Recently opened'}</h2>
						<p className="board-dashboard-count">{filteredBoards.length} {filteredBoards.length === 1 ? 'board' : 'boards'}</p>
					</div>
					<div className="board-dashboard-content-actions">
						{selectionMode && selectedBoardIds.size > 0 && <div className="board-dashboard-selection-toolbar" aria-label="Selected board actions">
							<span>{selectedBoardIds.size} selected</span>
							{selectedBoardIds.size === 1 && <button type="button" onClick={openSelectedBoard}>Open</button>}
							<label className="board-dashboard-visually-hidden" htmlFor="board-dashboard-move-selected">Move selected to a collection</label>
							<select id="board-dashboard-move-selected" defaultValue="" onChange={(event) => moveSelectedBoards(event.target.value)}>
								<option value="" disabled>Move selected to…</option>
								{collections.map((collection) => <option value={collection.id} key={collection.id}>{collection.title}</option>)}
							</select>
						</div>}
						<div className="board-dashboard-count-and-select">
							{!inTrash && <button type="button" aria-label={selectionMode ? 'Done selecting boards' : 'Select boards'} aria-pressed={selectionMode} onClick={() => selectionMode ? leaveSelectionMode() : setSelectionMode(true)}>
								<svg className="board-dashboard-select-icon" viewBox="0 0 20 20" aria-hidden="true">
									{selectionMode ? <><rect x="2.5" y="2.5" width="15" height="15" rx="3" /><path d="m6 10 2.5 2.5L14 7" /></> : <rect x="3" y="3" width="14" height="14" rx="3" />}
								</svg>
								<span>{selectionMode ? 'Done' : 'Select'}</span>
							</button>}
						</div>
					</div>
				</div>

				<div className="board-dashboard-grid">
					{filteredBoards.map((board) => <BoardPreviewCard
						key={board.id}
						board={board}
						collectionTitle={collectionLabel(board.collectionId)}
						collections={collections}
						selectionMode={selectionMode}
						selected={selectedBoardIds.has(board.id)}
						inTrash={inTrash}
						onActivate={() => selectionMode ? toggleBoardSelection(board.id) : openBoard(board)}
						onRename={(title) => renameBoard(board.id, title)}
						onMove={(collectionId) => moveBoard(board.id, collectionId)}
						onDelete={() => confirmDeleteBoard(board.id, board.title)}
						onRestore={() => restoreBoard(board.id)}
					/>)}
				</div>
				{filteredBoards.length === 0 && <div className="board-dashboard-empty">
					<p>{query ? 'No board names match your search.' : inTrash ? 'Trash is empty.' : selectedCollectionId !== 'all' ? 'This collection is empty.' : 'Your boards will appear here.'}</p>
					{query && <button type="button" onClick={() => setQuery('')}>Clear search</button>}
				</div>}
			</main>
		</div>
	</div>
}
