import { useEffect, useRef, useState } from 'react'
import { createShapeId, type Editor, type TLFrameShape, type TLShapeId } from 'tldraw'
import {
	PRESENTATION_ORDER_KEY,
	getCurrentPresentationFrameId,
	getPresentationFrames,
	jumpToPresentationFrame,
	movePresentationFrame,
	renamePresentationFrame,
} from './presentation'
import { slideOrganizerStyles } from './slideOrganizerStyles'

const SLIDE_SIZE = { w: 640, h: 360 }
const SLIDE_GAP = 80

/** Create an editable tldraw frame and insert it at the requested position in the saved slide order. */
export function createPresentationSlide(editor: Editor): TLShapeId | null {
	if (editor.getIsReadonly()) return null
	const frames = getPresentationFrames(editor)
	const selected = new Set(editor.getSelectedShapeIds())
	const anchor = frames.find((frame) => selected.has(frame.id))
		?? frames.find((frame) => frame.id === getCurrentPresentationFrameId(editor, frames))
	const viewportCenter = editor.getViewportPageBounds().center
	let x = anchor ? anchor.x + anchor.props.w + SLIDE_GAP : viewportCenter.x - SLIDE_SIZE.w / 2
	const y = anchor ? anchor.y : viewportCenter.y - SLIDE_SIZE.h / 2
	const occupied = editor.getCurrentPageShapes().flatMap((shape) => {
		const bounds = editor.getShapePageBounds(shape.id)
		return bounds ? [{ x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }] : []
	})
	for (let attempt = 0; attempt < occupied.length; attempt++) {
		const collision = occupied.find((box) => x < box.x + box.w + SLIDE_GAP && x + SLIDE_SIZE.w + SLIDE_GAP > box.x
			&& y < box.y + box.h + SLIDE_GAP && y + SLIDE_SIZE.h + SLIDE_GAP > box.y)
		if (!collision) break
		x = collision.x + collision.w + SLIDE_GAP
	}
	const id = createShapeId()
	if (!editor.canCreateShapes([id])) return null
	const page = editor.getCurrentPage()
	const order = frames.map((frame) => frame.id)
	const insertAt = anchor ? order.indexOf(anchor.id) + 1 : order.length
	order.splice(insertAt, 0, id)
	const mark = editor.markHistoryStoppingPoint('Create slide')
	try {
		editor.run(() => {
			editor.createShape({ id, parentId: page.id, type: 'frame', x, y,
				props: { ...SLIDE_SIZE, name: `Slide ${frames.length + 1}` } })
			if (!editor.getShape(id)) throw new Error('Could not create the slide frame.')
			editor.updatePage({ id: page.id, meta: { ...page.meta, [PRESENTATION_ORDER_KEY]: order } })
		})
	} catch (cause) {
		editor.bailToMark(mark)
		throw cause
	}
	editor.markHistoryStoppingPoint('Slide created')
	editor.select(id)
	const bounds = editor.getShapePageBounds(id)
	if (bounds) editor.zoomToBounds(bounds, { inset: 48 })
	return id
}

/** Export at a readable internal size, with a white slide surface even in dark mode. */
export function getSlidePreviewExportOptions(frame: TLFrameShape) {
	return {
		background: true,
		darkMode: false,
		padding: 0,
		pixelRatio: 1,
		scale: Math.min(1, 240 / Math.max(frame.props.w, frame.props.h)),
	} as const
}

function Icon({ name }: { name: 'slides' | 'close' | 'up' | 'down' | 'edit' | 'plus' | 'more' | 'play' }) {
	const path = {
		slides: <><rect x="3" y="4" width="18" height="15" rx="2" /><path d="M7 8h10M7 12h6M7 16h9" /></>,
		close: <path d="M5 5l14 14M19 5 5 19" />,
		up: <path d="m6 14 6-6 6 6" />,
		down: <path d="m6 10 6 6 6-6" />,
		edit: <><path d="m5 17 11-11 3 3L8 20H5z" /><path d="m14.5 7.5 3 3" /></>,
		plus: <path d="M12 4v16M4 12h16" />,
		more: <><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></>,
		play: <path d="m8 5 11 7-11 7z" />,
	}[name]
	return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{path}</svg>
}

function SlidePreview({ editor, frame, revision }: { editor: Editor; frame: TLFrameShape; revision: number }) {
	const ref = useRef<HTMLDivElement>(null)
	const objectUrlRef = useRef<string | undefined>(undefined)
	const [visible, setVisible] = useState(false)
	const [url, setUrl] = useState<string>()
	useEffect(() => () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current) }, [])
	useEffect(() => {
		if (visible) return
		const element = ref.current
		if (!element) return
		if (typeof IntersectionObserver === 'undefined') {
			setVisible(true)
			return
		}
		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) {
				setVisible(true)
				observer.disconnect()
			}
		}, { rootMargin: '100px' })
		observer.observe(element)
		return () => observer.disconnect()
	}, [visible])
	useEffect(() => {
		if (!visible) return
		let disposed = false
		void editor.getSvgString([frame.id], getSlidePreviewExportOptions(frame))
			.then((result) => {
				if (disposed || !result) return
				const nextUrl = URL.createObjectURL(new Blob([result.svg], { type: 'image/svg+xml' }))
				if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
				objectUrlRef.current = nextUrl
				setUrl(nextUrl)
			})
			.catch(() => { if (!disposed) setUrl(undefined) })
		return () => { disposed = true }
	}, [editor, frame.id, revision, visible])
	return <div ref={ref} className="freeform-slide-organizer__preview" aria-hidden="true">
		{url && <img src={url} alt="" draggable={false} />}
	</div>
}

export interface SlideOrganizerProps {
	editor: Editor
	onPresentFrame?: (frameId: TLShapeId) => void
}

/** Optional top-right panel; frame order and names are stored in tldraw document records. */
export function SlideOrganizer({ editor, onPresentFrame }: SlideOrganizerProps) {
	const rootRef = useRef<HTMLDivElement>(null)
	const renameButtonRefs = useRef(new Map<TLShapeId, HTMLButtonElement>())
	const cancelledRename = useRef(false)
	const renameFinished = useRef(false)
	const [open, setOpen] = useState(false)
	const [revision, setRevision] = useState(0)
	const [previewRevision, setPreviewRevision] = useState(0)
	const [editingId, setEditingId] = useState<TLShapeId | null>(null)
	const [menuOpenId, setMenuOpenId] = useState<TLShapeId | null>(null)
	const [draft, setDraft] = useState('')
	const frames = getPresentationFrames(editor)
	const activeFrameId = getCurrentPresentationFrameId(editor, frames)
	const readonly = editor.getIsReadonly()

	useEffect(() => {
		if (!open) return
		let timer: ReturnType<typeof setTimeout> | undefined
		const unsubscribeDocument = editor.store.listen(() => {
			setRevision((value) => value + 1)
			if (timer) clearTimeout(timer)
			timer = setTimeout(() => setPreviewRevision((value) => value + 1), 350)
		}, { scope: 'document' })
		let pageId = editor.getCurrentPageId()
		let wasReadonly = editor.getIsReadonly()
		let camera = editor.getCamera()
		let selection = editor.getSelectedShapeIds().join(',')
		let currentFrameId = getCurrentPresentationFrameId(editor)
		const unsubscribeSession = editor.store.listen(() => {
			const currentPageId = editor.getCurrentPageId()
			const isReadonly = editor.getIsReadonly()
			const currentCamera = editor.getCamera()
			const currentSelection = editor.getSelectedShapeIds().join(',')
			if (currentPageId === pageId && isReadonly === wasReadonly
				&& currentCamera.x === camera.x && currentCamera.y === camera.y && currentCamera.z === camera.z
				&& currentSelection === selection) return
			const activeId = getCurrentPresentationFrameId(editor)
			const changed = currentPageId !== pageId || isReadonly !== wasReadonly || activeId !== currentFrameId
			pageId = currentPageId
			wasReadonly = isReadonly
			camera = currentCamera
			selection = currentSelection
			currentFrameId = activeId
			if (changed) setRevision((value) => value + 1)
		}, { scope: 'session' })
		return () => {
			unsubscribeDocument()
			unsubscribeSession()
			if (timer) clearTimeout(timer)
		}
	}, [editor, open])

	useEffect(() => {
		if (!open) return
		const documentRef = editor.getContainer().ownerDocument
		const onPointerDown = (event: PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return
			event.preventDefault()
			event.stopPropagation()
			event.stopImmediatePropagation()
			if (editingId) {
				cancelledRename.current = true
				renameFinished.current = true
				setEditingId(null)
				requestAnimationFrame(() => renameButtonRefs.current.get(editingId)?.focus())
				return
			}
			if (menuOpenId) { setMenuOpenId(null); return }
			setOpen(false)
			rootRef.current?.querySelector<HTMLButtonElement>('.freeform-slide-organizer__trigger')?.focus()
		}
		documentRef.addEventListener('pointerdown', onPointerDown, true)
		const windowRef = documentRef.defaultView ?? window
		windowRef.addEventListener('keydown', onKeyDown, true)
		return () => {
			documentRef.removeEventListener('pointerdown', onPointerDown, true)
			windowRef.removeEventListener('keydown', onKeyDown, true)
		}
	}, [editor, editingId, menuOpenId, open])

	const finishRename = (id: TLShapeId) => {
		if (renameFinished.current) return
		renameFinished.current = true
		if (!cancelledRename.current) renamePresentationFrame(editor, id, draft)
		cancelledRename.current = false
		setEditingId(null)
		requestAnimationFrame(() => renameButtonRefs.current.get(id)?.focus())
	}
	const beginRename = (frame: TLFrameShape) => {
		cancelledRename.current = false
		renameFinished.current = false
		setDraft(frame.props.name)
		setMenuOpenId(null)
		setEditingId(frame.id)
	}

	return <div ref={rootRef} className="freeform-slide-organizer" data-open={open} data-revision={revision}>
		<style>{slideOrganizerStyles}</style>
		<button type="button" className="freeform-slide-organizer__trigger" aria-label="Slides" title="Slides" aria-expanded={open} aria-controls="freeform-slide-list" onClick={() => setOpen((value) => !value)}>
			<Icon name="slides" />
		</button>
		{open && <section id="freeform-slide-list" className="freeform-slide-organizer__panel" aria-label="Slides">
			<header className="freeform-slide-organizer__header">
				<strong>Slides <span>{frames.length}</span></strong>
				<button type="button" className="freeform-slide-organizer__icon" aria-label="Close slides" title="Close slides" onClick={() => setOpen(false)}><Icon name="close" /></button>
			</header>
			<button type="button" className="freeform-slide-organizer__create" disabled={readonly} onClick={() => { createPresentationSlide(editor); setMenuOpenId(null) }}><Icon name="plus" />Create slide</button>
			{frames.length === 0 ? <p className="freeform-slide-organizer__empty">No slides yet.</p> : <ol className="freeform-slide-organizer__list">
				{frames.map((frame, index) => <li key={frame.id} className="freeform-slide-organizer__row" data-active={frame.id === activeFrameId}>
					<span className="freeform-slide-organizer__number">{index + 1}</span>
					<SlidePreview editor={editor} frame={frame} revision={previewRevision} />
					{editingId === frame.id ? <input
						className="freeform-slide-organizer__name-input"
						aria-label={`Slide ${index + 1} name`}
						autoFocus
						maxLength={100}
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						onBlur={() => finishRename(frame.id)}
						onKeyDown={(event) => {
							if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); finishRename(frame.id) }
						}}
					/> : <button type="button" className="freeform-slide-organizer__name" title={frame.props.name || `Slide ${index + 1}`} aria-current={frame.id === activeFrameId ? 'location' : undefined} onClick={() => jumpToPresentationFrame(editor, frame.id)}>{frame.props.name.trim() || `Slide ${index + 1}`}</button>}
					<button type="button" className="freeform-slide-organizer__icon" aria-label={`Slide ${index + 1} actions`} title="Slide actions" aria-haspopup="menu" aria-expanded={menuOpenId === frame.id} ref={(node) => { if (node) renameButtonRefs.current.set(frame.id, node); else renameButtonRefs.current.delete(frame.id) }} onClick={() => setMenuOpenId((current) => current === frame.id ? null : frame.id)}><Icon name="more" /></button>
					{menuOpenId === frame.id && <div className="freeform-slide-organizer__menu" role="menu" aria-label={`Slide ${index + 1} actions`}>
						<button type="button" role="menuitem" disabled={readonly || frame.isLocked} onClick={() => beginRename(frame)}><Icon name="edit" />Rename</button>
						<button type="button" role="menuitem" disabled={readonly || index === 0} onClick={() => { movePresentationFrame(editor, frame.id, index - 1); setMenuOpenId(null) }}><Icon name="up" />Move up</button>
						<button type="button" role="menuitem" disabled={readonly || index === frames.length - 1} onClick={() => { movePresentationFrame(editor, frame.id, index + 1); setMenuOpenId(null) }}><Icon name="down" />Move down</button>
						{onPresentFrame && <button type="button" role="menuitem" onClick={() => { setMenuOpenId(null); setOpen(false); onPresentFrame(frame.id) }}><Icon name="play" />Start presentation</button>}
					</div>}
				</li>)}
			</ol>}
		</section>}
	</div>
}
