import { useEffect, useMemo, useReducer } from 'react'
import { createPortal } from 'react-dom'
import type { Editor, TLFrameShape, TLShapeId } from 'tldraw'
import { SlideOrganizer } from './slideOrganizer'
import { PresentationStage } from './presentationStage'

export const PRESENTATION_ORDER_KEY = 'freeformPresentationOrder'

/** Explicit IDs live on the page record; absent/new frames retain a predictable spatial fallback. */
export function orderPresentationFrames(frames: readonly TLFrameShape[], explicitOrder?: unknown): TLFrameShape[] {
	const spatial = [...frames].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id))
	if (!Array.isArray(explicitOrder)) return spatial
	const byId = new Map(spatial.map((frame) => [frame.id, frame]))
	const ordered: TLFrameShape[] = []
	for (const id of explicitOrder) {
		if (typeof id !== 'string') continue
		const frame = byId.get(id as TLShapeId)
		if (!frame) continue
		ordered.push(frame)
		byId.delete(frame.id)
	}
	return [...ordered, ...spatial.filter((frame) => byId.has(frame.id))]
}

export function getPresentationFrames(editor: Editor): TLFrameShape[] {
	const pageId = editor.getCurrentPageId()
	const frames = editor.getCurrentPageShapes().filter(
		(shape): shape is TLFrameShape => shape.type === 'frame' && shape.parentId === pageId
	)
	return orderPresentationFrames(frames, editor.getCurrentPage?.().meta[PRESENTATION_ORDER_KEY])
}

/** Move a slide by list index and write one undoable, shared page record. */
export function movePresentationFrame(editor: Editor, frameId: TLShapeId | string, targetIndex: number): boolean {
	if (editor.getIsReadonly?.()) return false
	const frames = getPresentationFrames(editor)
	const sourceIndex = frames.findIndex((frame) => frame.id === frameId)
	if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= frames.length || targetIndex === sourceIndex) return false
	const reordered = [...frames]
	const [moved] = reordered.splice(sourceIndex, 1)
	reordered.splice(targetIndex, 0, moved)
	const page = editor.getCurrentPage()
	editor.markHistoryStoppingPoint('reorder slides')
	editor.updatePage({
		id: page.id,
		meta: { ...page.meta, [PRESENTATION_ORDER_KEY]: reordered.map((frame) => frame.id) },
	})
	return true
}

export function renamePresentationFrame(editor: Editor, frameId: TLShapeId | string, requestedName: string): boolean {
	if (editor.getIsReadonly?.()) return false
	const frame = getPresentationFrames(editor).find((candidate) => candidate.id === frameId)
	const name = requestedName.trim()
	if (!frame || frame.isLocked || !name || name === frame.props.name) return false
	editor.markHistoryStoppingPoint('rename slide')
	editor.updateShape({ id: frame.id, type: 'frame', props: { name } })
	return true
}

export function jumpToPresentationFrame(editor: Editor, frameId: TLShapeId | string): boolean {
	const frame = getPresentationFrames(editor).find((candidate) => candidate.id === frameId)
	if (!frame) return false
	const bounds = editor.getShapePageBounds(frame.id)
	if (!bounds) return false
	editor.zoomToBounds(bounds, { inset: 48 })
	return true
}

/** The slide under the camera is current; selection helps when the camera is between frames. */
export function getCurrentPresentationFrameId(editor: Editor, frames: readonly TLFrameShape[] = getPresentationFrames(editor)): TLShapeId | null {
	const center = editor.getViewportPageBounds().center
	const visible = frames.find((frame) => {
		const bounds = editor.getShapePageBounds(frame.id)
		return bounds && center.x >= bounds.x && center.x <= bounds.x + bounds.width
			&& center.y >= bounds.y && center.y <= bounds.y + bounds.height
	})
	if (visible) return visible.id
	const selected = new Set(editor.getSelectedShapeIds())
	return frames.find((frame) => selected.has(frame.id))?.id ?? null
}

export async function requestPresentationFullscreen(
	element: HTMLElement,
	documentRef?: Document
): Promise<boolean> {
	const hostDocument = documentRef ?? element.ownerDocument ?? (typeof document === 'undefined' ? undefined : document)
	if (!hostDocument || hostDocument.fullscreenElement || !hostDocument.fullscreenEnabled || typeof element.requestFullscreen !== 'function') return false
	try {
		await element.requestFullscreen()
		return true
	} catch {
		return false
	}
}

export async function exitPresentationFullscreen(element: HTMLElement, documentRef?: Document) {
	const hostDocument = documentRef ?? element.ownerDocument ?? (typeof document === 'undefined' ? undefined : document)
	if (!hostDocument?.fullscreenElement || !hostDocument.exitFullscreen) return false
	if (hostDocument.fullscreenElement !== element && !hostDocument.fullscreenElement.contains(element)) return false
	try {
		await hostDocument.exitFullscreen()
		return true
	} catch {
		return false
	}
}

type PresentationListener = () => void

export class PresentationController {
	private frames: TLFrameShape[] = []
	private index = -1
	private lastFrameId: TLShapeId | null = null
	private originalCamera: ReturnType<Editor['getCamera']> | null = null
	private originalSelection: TLShapeId[] | null = null
	private originalReadonly: boolean | null = null
	private ownsFullscreen = false
	private transitionTimer: ReturnType<typeof setTimeout> | null = null
	private readonly listeners = new Set<PresentationListener>()

	constructor(private readonly editor: Editor) {}

	get isPresenting() {
		return this.index >= 0
	}

	get currentIndex() {
		return this.index
	}

	get slideCount() {
		return this.frames.length
	}

	get currentFrame() {
		return this.frames[this.index]
	}

	get previousFrameId() {
		return this.lastFrameId
	}

	subscribe(listener: PresentationListener) {
		this.listeners.add(listener)
		return () => { this.listeners.delete(listener) }
	}

	start() {
		if (this.isPresenting) return false
		const frames = getPresentationFrames(this.editor)
		if (frames.length === 0) return false

		this.frames = frames
		this.index = 0
		this.lastFrameId = null
		this.originalCamera = { ...this.editor.getCamera() }
		this.originalSelection = [...this.editor.getSelectedShapeIds()]
		this.originalReadonly = this.editor.getInstanceState().isReadonly
		this.editor.setSelectedShapes([])
		this.showCurrentFrame()
		this.editor.updateInstanceState({ isReadonly: true }, { history: 'ignore' })
		const container = this.editor.getContainer()
		container.dataset.freeformPresentation = 'true'
		this.emit()
		return true
	}

	async enterFullscreen() {
		if (!this.isPresenting) return false
		const container = this.editor.getContainer()
		const entered = await requestPresentationFullscreen(container)
		this.ownsFullscreen = entered && container.ownerDocument.fullscreenElement === container
		if (this.ownsFullscreen && this.isPresenting) this.showCurrentFrame()
		else if (entered) await exitPresentationFullscreen(container)
		return this.ownsFullscreen
	}

	next() {
		return this.goTo(this.index + 1)
	}

	previous() {
		return this.goTo(this.index - 1)
	}

	goToFrame(frameId: TLShapeId | string) {
		return this.goTo(this.frames.findIndex((frame) => frame.id === frameId))
	}

	refresh() {
		if (!this.isPresenting) {
			this.emit()
			return
		}
		const currentId = this.currentFrame?.id
		const frames = getPresentationFrames(this.editor)
		if (frames.length === 0) {
			this.exit()
			return
		}
		this.frames = frames
		const currentIndex = frames.findIndex((frame) => frame.id === currentId)
		this.index = currentIndex >= 0 ? currentIndex : Math.min(this.index, frames.length - 1)
		this.showCurrentFrame()
		this.emit()
	}

	exit() {
		if (!this.isPresenting) return false
		if (this.transitionTimer) clearTimeout(this.transitionTimer)
		this.transitionTimer = null
		const container = this.editor.getContainer()
		delete container.dataset.freeformPresentation
		if (this.ownsFullscreen) void exitPresentationFullscreen(container)
		this.ownsFullscreen = false
		if (this.originalCamera) this.editor.setCamera(this.originalCamera)
		if (this.originalSelection) {
			const selection = this.originalSelection.filter((id) => this.editor.getShape(id))
			this.editor.setSelectedShapes(selection)
		}
		if (this.originalReadonly !== null) this.editor.updateInstanceState({ isReadonly: this.originalReadonly }, { history: 'ignore' })
		this.originalCamera = null
		this.originalSelection = null
		this.originalReadonly = null
		this.frames = []
		this.index = -1
		this.lastFrameId = null
		this.emit()
		return true
	}

	dispose() {
		this.listeners.clear()
		this.exit()
	}

	fullscreenChanged() {
		// Safari leaves element fullscreen when the presenter opens its remote tab.
		// Keep the presentation alive; the stage still fills its tab and Escape or
		// the explicit Exit control remains the intentional way to end it.
		if (this.ownsFullscreen && !this.editor.getContainer().ownerDocument.fullscreenElement) this.ownsFullscreen = false
	}

	private goTo(nextIndex: number) {
		if (!this.isPresenting || nextIndex < 0 || nextIndex >= this.frames.length) return false
		if (nextIndex === this.index) return true
		if (this.transitionTimer) clearTimeout(this.transitionTimer)
		this.lastFrameId = this.currentFrame?.id ?? null
		this.index = nextIndex
		this.showCurrentFrame()
		this.emit()
		this.transitionTimer = setTimeout(() => {
			this.lastFrameId = null
			this.transitionTimer = null
			this.emit()
		}, 480)
		return true
	}

	private showCurrentFrame() {
		const frame = this.currentFrame
		if (!frame) return
		const bounds = this.editor.getShapePageBounds(frame.id)
		if (!bounds) return
		this.editor.zoomToBounds(bounds, { inset: 32, animation: { duration: 440 } })
	}

	private emit() {
		for (const listener of this.listeners) listener()
	}
}

function isTypingTarget(target: EventTarget | null) {
	if (!target || typeof target !== 'object') return false
	const element = target as HTMLElement
	return element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
}

export function handlePresentationKeydown(event: KeyboardEvent, presentation: PresentationController) {
	if (isTypingTarget(event.target)) return false
	if (!presentation.isPresenting) {
		// On macOS, Option+Shift+P can change `key` to a Unicode glyph; `code`
		// remains the physical P key and keeps the advertised shortcut reliable.
		const isPresentationKey = event.key.toLowerCase() === 'p' || event.code === 'KeyP'
		if (!isPresentationKey || !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return false
		const started = presentation.start()
		if (started) {
			event.preventDefault()
			event.stopPropagation()
			event.stopImmediatePropagation?.()
		}
		return started
	}
	if (event.altKey || event.ctrlKey || event.metaKey) return false
	let handled = true
	switch (event.key) {
		case 'ArrowRight':
		case 'PageDown':
		case ' ':
			presentation.next()
			break
		case 'ArrowLeft':
		case 'PageUp':
			presentation.previous()
			break
		case 'Escape':
			presentation.exit()
			break
		default:
			handled = false
	}
	if (handled) {
		event.preventDefault()
		event.stopPropagation()
		event.stopImmediatePropagation?.()
	}
	return handled
}

export interface PresentationControlsProps {
	editor: Editor
}

/** Minimal controls for the host editor to mount in its UI. Presentation does not edit shape records. */
export function PresentationControls({ editor }: PresentationControlsProps) {
	const presentation = useMemo(() => new PresentationController(editor), [editor])
	const [, redraw] = useReducer((value: number) => value + 1, 0)
	useEffect(() => presentation.subscribe(redraw), [presentation])
	useEffect(() => editor.store.listen(() => presentation.refresh(), { scope: 'document' }), [editor, presentation])
	useEffect(() => () => presentation.dispose(), [presentation])
	useEffect(() => {
		const documentRef = editor.getContainer().ownerDocument
		const onFullscreenChange = () => presentation.fullscreenChanged()
		documentRef.addEventListener('fullscreenchange', onFullscreenChange)
		return () => documentRef.removeEventListener('fullscreenchange', onFullscreenChange)
	}, [editor, presentation])
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => handlePresentationKeydown(event, presentation)
		window.addEventListener('keydown', onKeyDown, true)
		return () => window.removeEventListener('keydown', onKeyDown, true)
	}, [presentation])

	if (!presentation.isPresenting) {
		return (
			<>
				<button
					type="button"
					className="freeform-presentation__start"
					aria-label="Present board"
					title="Present board (Alt+Shift+P)"
					style={{ width: 34, height: 34, padding: 0, display: 'grid', placeItems: 'center' }}
					disabled={getPresentationFrames(editor).length === 0}
					onClick={() => presentation.start()}
				>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
						<rect x="3" y="4" width="18" height="12" rx="1.5" />
						<path d="M12 16v4M8 20h8" />
						<path d="m10 7 5 3-5 3Z" fill="currentColor" stroke="none" />
					</svg>
				</button>
				<SlideOrganizer editor={editor} onPresentFrame={(frameId) => {
					if (presentation.start()) presentation.goToFrame(frameId)
				}} />
			</>
		)
	}

	// The canvas overlay is below tldraw's UI stacking layer; fullscreen stage must be its sibling.
	return createPortal(<PresentationStage
		editor={editor}
		frames={getPresentationFrames(editor)}
		index={presentation.currentIndex}
		previousFrameId={presentation.previousFrameId}
		onPrevious={() => presentation.previous()}
		onNext={() => presentation.next()}
		onEnterFullscreen={() => presentation.enterFullscreen()}
		onExit={() => presentation.exit()}
	/>, editor.getContainer())
}
