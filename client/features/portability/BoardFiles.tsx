import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useValue, type Editor } from 'tldraw'
import { readBoardIndex } from '../boards/boardIndex'
import {
	browserDraftStore,
	completePendingImport,
	exportImageBlob,
	exportNativeBoard,
	stageNativeImport,
	type ImageFormat,
	type ImageScope,
} from './nativeBoard'
import { exportExcalidrawPage, type InterchangeReport } from './excalidraw/interchange'
import { convertExcalidrawToNativeJson } from './excalidraw/nativeFile'
import './BoardFiles.css'

function download(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = filename
	link.click()
	window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function filenameBase(roomId: string): string {
	let name = roomId
	try { name = readBoardIndex().find((board) => board.id === roomId)?.title ?? roomId } catch { /* URL identity is still safe. */ }
	return name.trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').slice(0, 64) || 'Board'
}

function message(cause: unknown): string {
	return cause instanceof Error ? cause.message : 'Could not complete this file action. Try again.'
}

function InterchangeDetails({ report }: { report: InterchangeReport }) {
	const skipped = Object.entries(report.skippedByType)
	const approximated = Object.entries(report.styleLosses)
	if (!skipped.length && !approximated.length) return null
	return <details className="freeform-board-files-details">
		<summary>Conversion details</summary>
		{skipped.length > 0 && <p>Skipped: {skipped.map(([type, count]) => `${type} ${count}`).join(', ')}</p>}
		{approximated.length > 0 && <p>Approximated: {approximated.map(([type, count]) => `${type} ${count}`).join(', ')}</p>}
	</details>
}

/** Compact trigger and panel. Keep mounted in every room so a staged import can hydrate its new room. */
export function BoardFiles({ editor }: { editor: Editor }) {
	const { roomId = '' } = useParams<{ roomId: string }>()
	const navigate = useNavigate()
	const root = useRef<HTMLDivElement>(null)
	const fileInput = useRef<HTMLInputElement>(null)
	const [open, setOpen] = useState(false)
	const [scope, setScope] = useState<ImageScope>('board')
	const [busy, setBusy] = useState('')
	const [pendingImport, setPendingImport] = useState(false)
	const [feedback, setFeedback] = useState<{ text: string; error: boolean; report?: InterchangeReport } | null>(null)
	const [excalidrawDraft, setExcalidrawDraft] = useState<{ json: string; name: string; report: InterchangeReport } | null>(null)
	const counts = useValue('board files counts', () => ({
		page: editor.getCurrentPageShapeIds().size,
		selected: editor.getSelectedShapeIds().length,
	}), [editor])

	useEffect(() => {
		if (!open) return
		const onPointerDown = (event: PointerEvent) => {
			if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') { event.stopPropagation(); setOpen(false) }
		}
		document.addEventListener('pointerdown', onPointerDown)
		document.addEventListener('keydown', onKeyDown, true)
		return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown, true) }
	}, [open])

	useEffect(() => {
		if (!roomId) return
		let cancelled = false
		void browserDraftStore.get(roomId).then(async (draft) => {
			if (!draft || cancelled) return
			setPendingImport(true)
			setOpen(true)
			setBusy('Importing board…')
			try {
				const result = await completePendingImport(editor, roomId, browserDraftStore)
				if (!cancelled && result === 'imported') {
					setPendingImport(false)
					setFeedback({ text: 'Board imported.', error: false })
				}
			} catch (cause) {
				if (!cancelled) setFeedback({ text: message(cause), error: true })
			} finally {
				if (!cancelled) setBusy('')
			}
		}).catch(() => { /* Import button reports storage errors where they occur. */ })
		return () => { cancelled = true }
	}, [editor, roomId])

	const retryImport = async () => {
		setBusy('Importing board…')
		setFeedback(null)
		try {
			const result = await completePendingImport(editor, roomId, browserDraftStore)
			if (result === 'imported') {
				setPendingImport(false)
				setFeedback({ text: 'Board imported.', error: false })
			}
		} catch (cause) {
			setFeedback({ text: message(cause), error: true })
		} finally { setBusy('') }
	}

	const runExport = async (kind: 'native' | 'excalidraw' | ImageFormat) => {
		setFeedback(null)
		setBusy('Preparing download…')
		try {
			const base = filenameBase(roomId)
			if (kind === 'native') {
				download(await exportNativeBoard(editor), `${base}.json`)
			} else if (kind === 'excalidraw') {
				const result = exportExcalidrawPage(editor)
				download(new Blob([result.json], { type: 'application/json' }), `${base}.excalidraw`)
				setFeedback({ text: `Downloaded ${result.report.convertedElements} elements${result.report.skippedElements ? ` · ${result.report.skippedElements} skipped` : ''}.`, error: false, report: result.report })
				return
			} else {
				download(await exportImageBlob(editor, kind, scope), `${base}${scope === 'selection' ? '-selection' : ''}.${kind}`)
			}
			setFeedback({ text: 'Downloaded.', error: false })
		} catch (cause) {
			setFeedback({ text: message(cause), error: true })
		} finally { setBusy('') }
	}

	const onImportFile = async (file: File | undefined) => {
		if (!file) return
		setFeedback(null)
		setExcalidrawDraft(null)
		setBusy('Checking file…')
		try {
			if (/\.excalidraw$/i.test(file.name)) {
				if (file.size > 25 * 1024 * 1024) throw new Error('This Excalidraw file is too large (25 MB maximum).')
				const result = await convertExcalidrawToNativeJson(await file.text())
				if (!result.report.convertedElements) throw new Error('No supported elements were found in this Excalidraw file.')
				setExcalidrawDraft({ json: result.json, name: file.name, report: result.report })
				setBusy('')
				return
			}
			const newRoomId = await stageNativeImport(editor, file, browserDraftStore)
			navigate(`/${encodeURIComponent(newRoomId)}`)
		} catch (cause) {
			setFeedback({ text: message(cause), error: true })
			setBusy('')
		}
	}

	const createExcalidrawBoard = async () => {
		if (!excalidrawDraft) return
		setBusy('Creating board…')
		setFeedback(null)
		try {
			const name = excalidrawDraft.name.replace(/\.excalidraw$/i, '.json')
			const file = new File([excalidrawDraft.json], name, { type: 'application/vnd.tldraw+json' })
			const newRoomId = await stageNativeImport(editor, file, browserDraftStore)
			setExcalidrawDraft(null)
			navigate(`/${encodeURIComponent(newRoomId)}`)
		} catch (cause) {
			setFeedback({ text: message(cause), error: true })
			setBusy('')
		}
	}

	return <div className="freeform-board-files" ref={root}>
		<button type="button" className="freeform-board-files-trigger" aria-label="Board files" title="Board files" aria-expanded={open} aria-controls="freeform-board-files-panel" onClick={() => setOpen((wasOpen) => !wasOpen)}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.5h9l5 5v12H5zM14 3.5v5h5M8 13h8M8 17h6" /></svg>
		</button>
		{open && <section id="freeform-board-files-panel" className="freeform-board-files-panel" aria-label="Board files">
			<header><strong>Files</strong><button type="button" aria-label="Close files" title="Close" onClick={() => setOpen(false)}>×</button></header>
			{excalidrawDraft ? <div className="freeform-board-files-preview">
				<strong>{excalidrawDraft.report.convertedElements} elements ready</strong>
				{excalidrawDraft.report.skippedElements > 0 && <span>{excalidrawDraft.report.skippedElements} skipped</span>}
				<InterchangeDetails report={excalidrawDraft.report} />
				<div className="freeform-board-files-preview-actions">
					<button type="button" disabled={Boolean(busy)} onClick={() => setExcalidrawDraft(null)}>Cancel</button>
					<button type="button" disabled={Boolean(busy)} onClick={() => { void createExcalidrawBoard() }}>Create board</button>
				</div>
			</div> : <>
			<button type="button" className="freeform-board-files-action" disabled={Boolean(busy)} onClick={() => fileInput.current?.click()}>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v4h16v-4" /></svg>
				<span>Import board</span>
			</button>
			<input ref={fileInput} type="file" aria-label="Choose board file" hidden onChange={(event) => {
				const file = event.currentTarget.files?.[0]
				event.currentTarget.value = ''
				void onImportFile(file)
			}} />
			<button type="button" className="freeform-board-files-action" disabled={Boolean(busy)} onClick={() => { void runExport('native') }}>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3" /></svg>
				<span>Download board <small>.json</small></span>
			</button>
			<button type="button" className="freeform-board-files-action" disabled={Boolean(busy) || !counts.page} onClick={() => { void runExport('excalidraw') }}>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18l6-12 4 8 3-5 3 9M7 15h10" /></svg>
				<span>Download Excalidraw <small>.excalidraw</small></span>
			</button>
			<div className="freeform-board-files-divider" />
			<div className="freeform-board-files-scope" role="group" aria-label="Image export area">
				<button type="button" aria-pressed={scope === 'board'} onClick={() => setScope('board')}>Page</button>
				<button type="button" aria-pressed={scope === 'selection'} onClick={() => setScope('selection')}>Selection</button>
			</div>
			<div className="freeform-board-files-formats" role="group" aria-label="Download image">
				{(['png', 'svg'] as const).map((format) => <button key={format} type="button" disabled={Boolean(busy) || (scope === 'selection' ? !counts.selected : !counts.page)} onClick={() => { void runExport(format) }}>
					{format.toUpperCase()}
				</button>)}
			</div>
			<p className="freeform-board-files-hint">Import opens a new room. Linked media needs its original URL.</p>
			</>}
		{busy && <p className="freeform-board-files-status" role="status">{busy}</p>}
		{feedback && <p className="freeform-board-files-status" role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
		{feedback?.report && <InterchangeDetails report={feedback.report} />}
		{pendingImport && feedback?.error && <button type="button" className="freeform-board-files-retry" disabled={Boolean(busy)} onClick={() => { void retryImport() }}>Retry import</button>}
		</section>}
	</div>
}
