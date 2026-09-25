import assert from 'node:assert/strict'
import test from 'node:test'
import { MessagePort } from 'node:worker_threads'
import type { Editor, TLFrameShape } from 'tldraw'
import {
	PresentationController,
	getCurrentPresentationFrameId,
	getPresentationFrames,
	handlePresentationKeydown,
	jumpToPresentationFrame,
	movePresentationFrame,
	orderPresentationFrames,
	renamePresentationFrame,
	requestPresentationFullscreen,
} from './presentation'
import { createPresentationSlide, getSlidePreviewExportOptions } from './slideOrganizer'

for (const handle of (process as NodeJS.Process & { _getActiveHandles(): unknown[] })._getActiveHandles()) {
	if (handle instanceof MessagePort) handle.unref()
}

function frame(id: string, x: number, y: number, parentId = 'page:current') {
	return {
		id,
		type: 'frame',
		parentId,
		x,
		y,
		rotation: 0,
		props: { w: 640, h: 360, name: id, color: 'blue' },
	} as TLFrameShape
}

function keyEvent(key: string, options: Partial<Pick<KeyboardEvent, 'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'code'>> = {}) {
	let prevented = false
	let stopped = false
	return {
		event: {
			key,
			code: options.code ?? '',
			altKey: options.altKey ?? false,
			shiftKey: options.shiftKey ?? false,
			ctrlKey: options.ctrlKey ?? false,
			metaKey: options.metaKey ?? false,
			target: null,
			preventDefault: () => { prevented = true },
			stopPropagation: () => { stopped = true },
		} as unknown as KeyboardEvent,
		wasHandled: () => prevented && stopped,
	}
}

test('orders frames in stable top-to-bottom, left-to-right spatial order', () => {
	const frames = [frame('lower', 0, 500), frame('right', 800, 0), frame('left', 0, 0), frame('same-position-a', 0, 0), frame('same-position-b', 0, 0)]
	assert.deepEqual(orderPresentationFrames(frames).map(({ id }) => id), [
		'left', 'same-position-a', 'same-position-b', 'right', 'lower',
	])
})

test('explicit slide order ignores stale IDs and appends new frames in spatial order', () => {
	const frames = [frame('frame:new-lower', 0, 500), frame('frame:second', 600, 0), frame('frame:new-upper', 0, 0), frame('frame:first', 100, 0)]
	assert.deepEqual(orderPresentationFrames(frames, ['frame:deleted', 'frame:second', 'frame:second', 'frame:first']).map(({ id }) => id), [
		'frame:second', 'frame:first', 'frame:new-upper', 'frame:new-lower',
	])
})

test('reorder stores page metadata, survives reload, and can be undone without moving frames', () => {
	const frames = [frame('frame:one', 0, 0), frame('frame:two', 800, 0), frame('frame:three', 0, 500)]
	let page = { id: 'page:current', meta: { unrelated: 'kept' } as Record<string, unknown> }
	const history: Array<typeof page> = []
	let marks = 0
	const editor = {
		getCurrentPageId: () => page.id,
		getCurrentPage: () => page,
		getCurrentPageShapes: () => frames,
		markHistoryStoppingPoint: () => { marks += 1 },
		updatePage: (partial: Partial<typeof page>) => { history.push(structuredClone(page)); page = { ...page, ...partial } },
	} as unknown as Editor
	const before = structuredClone(frames)
	assert.equal(movePresentationFrame(editor, 'frame:three', 0), true)
	assert.deepEqual(getPresentationFrames(editor).map(({ id }) => id), ['frame:three', 'frame:one', 'frame:two'])
	assert.equal(page.meta.unrelated, 'kept')
	assert.equal(marks, 1)
	assert.deepEqual(frames, before, 'reordering does not change frame positions or contents')
	assert.equal(movePresentationFrame(editor, 'frame:three', 0), false, 'a no-op must not add history')
	assert.equal(marks, 1)

	const savedPage = structuredClone(page)
	const reloadedEditor = {
		getCurrentPageId: () => savedPage.id,
		getCurrentPage: () => savedPage,
		getCurrentPageShapes: () => structuredClone(frames),
	} as unknown as Editor
	assert.deepEqual(getPresentationFrames(reloadedEditor).map(({ id }) => id), ['frame:three', 'frame:one', 'frame:two'])
	page = history.pop()!
	assert.deepEqual(getPresentationFrames(editor).map(({ id }) => id), ['frame:one', 'frame:two', 'frame:three'], 'undo returns to spatial fallback')
})

test('rename validates input, preserves other frame props, and supports cancel/no-op', () => {
	let currentFrame = frame('frame:one', 0, 0)
	const initialProps = structuredClone(currentFrame.props)
	let marks = 0
	const editor = {
		getCurrentPageId: () => 'page:current',
		getCurrentPageShapes: () => [currentFrame],
		markHistoryStoppingPoint: () => { marks += 1 },
		updateShape: (change: { props: Partial<TLFrameShape['props']> }) => {
			currentFrame = { ...currentFrame, props: { ...currentFrame.props, ...change.props } }
		},
	} as unknown as Editor
	assert.equal(renamePresentationFrame(editor, 'frame:one', ''), false)
	assert.equal(renamePresentationFrame(editor, 'frame:one', 'frame:one'), false, 'cancelled or unchanged names do not create history')
	assert.equal(marks, 0)
	assert.equal(renamePresentationFrame(editor, 'frame:one', '  Closing ideas  '), true)
	assert.equal(currentFrame.props.name, 'Closing ideas')
	assert.deepEqual({ ...currentFrame.props, name: initialProps.name }, initialProps)
	assert.equal(marks, 1)
})

test('jump to a slide fits its frame and does not select or mutate board content', () => {
	const target = frame('frame:target', 300, 400)
	const initial = structuredClone(target)
	const zoomed: Array<{ x: number; y: number; w: number; h: number }> = []
	const editor = {
		getCurrentPageId: () => 'page:current',
		getCurrentPageShapes: () => [target],
		getShapePageBounds: (id: string) => id === target.id ? { x: 300, y: 400, w: 640, h: 360 } : undefined,
		zoomToBounds: (bounds: { x: number; y: number; w: number; h: number }) => { zoomed.push(bounds) },
	} as unknown as Editor
	assert.equal(jumpToPresentationFrame(editor, target.id), true)
	assert.deepEqual(zoomed, [{ x: 300, y: 400, w: 640, h: 360 }])
	assert.equal(jumpToPresentationFrame(editor, 'frame:missing'), false)
	assert.deepEqual(target, initial)
})

test('current slide follows selected frame or viewport center and clears in the gap', () => {
	const first = frame('frame:first', 0, 0)
	const second = frame('frame:second', 700, 0)
	let selected: string[] = []
	let viewport = { x: 100, y: 50, w: 400, h: 300 }
	const editor = {
		getCurrentPageId: () => 'page:current',
		getCurrentPageShapes: () => [first, second],
		getSelectedShapeIds: () => selected,
		getViewportPageBounds: () => ({ ...viewport, center: { x: viewport.x + viewport.w / 2, y: viewport.y + viewport.h / 2 } }),
		getShapePageBounds: (id: string) => id === first.id
			? { x: 0, y: 0, width: 640, height: 360 }
			: id === second.id ? { x: 700, y: 0, width: 640, height: 360 } : undefined,
	} as unknown as Editor
	assert.equal(getCurrentPresentationFrameId(editor), first.id)
	viewport = { x: 750, y: 50, w: 400, h: 300 }
	assert.equal(getCurrentPresentationFrameId(editor), second.id)
	viewport = { x: 580, y: 500, w: 400, h: 300 }
	assert.equal(getCurrentPresentationFrameId(editor), null)
	selected = [first.id]
	assert.equal(getCurrentPresentationFrameId(editor), first.id, 'selected frame wins when the viewport is between slides')
})

test('slide preview uses a legible light export at a sufficient internal size', () => {
	const options = getSlidePreviewExportOptions(frame('frame:wide', 0, 0))
	assert.equal(options.darkMode, false)
	assert.equal(options.background, true)
	assert.equal(options.padding, 0)
	assert.ok(640 * options.scale >= 190, 'frame is exported with enough detail for the thumbnail')
})

test('creating a slide inserts a native frame after the selected slide and saves its order', () => {
	const first = frame('shape:first', 0, 0)
	const second = frame('shape:second', 0, 500)
	const shapes: TLFrameShape[] = [first, second]
	let page = { id: 'page:current', meta: { freeformPresentationOrder: [second.id, first.id], unrelated: 'kept' } }
	let selected: string[] = [first.id]
	const zoomed: string[] = []
	const editor = {
		getIsReadonly: () => false,
		getCurrentPageId: () => page.id,
		getCurrentPage: () => page,
		getCurrentPageShapes: () => shapes,
		getSelectedShapeIds: () => selected,
		getShapePageBounds: (id: string) => { const found = shapes.find((shape) => shape.id === id); return found && { x: found.x, y: found.y, w: found.props.w, h: found.props.h, maxX: found.x + found.props.w, maxY: found.y + found.props.h } },
		getViewportPageBounds: () => ({ center: { x: 100, y: 100 } }),
		canCreateShapes: () => true,
		markHistoryStoppingPoint: () => 'mark',
		run: (task: () => void) => task(),
		createShape: (partial: TLFrameShape) => { shapes.push(partial) },
		getShape: (id: string) => shapes.find((shape) => shape.id === id),
		updatePage: (partial: typeof page) => { page = { ...page, ...partial } },
		select: (id: string) => { selected = [id] },
		zoomToBounds: (bounds: { x: number }) => { zoomed.push(String(bounds.x)) },
	} as unknown as Editor

	const id = createPresentationSlide(editor)
	assert.ok(id)
	const created = shapes.find((shape) => shape.id === id)!
	assert.equal(created.type, 'frame')
	assert.equal(created.props.name, 'Slide 3')
	assert.deepEqual({ x: created.x, y: created.y, w: created.props.w, h: created.props.h }, { x: 720, y: 0, w: 640, h: 360 })
	assert.deepEqual(page.meta.freeformPresentationOrder, [second.id, first.id, id])
	assert.equal(page.meta.unrelated, 'kept')
	assert.deepEqual(selected, [id])
	assert.deepEqual(zoomed, ['720'])
})

test('creating the first slide uses the viewport and readonly mode blocks creation', () => {
	let created: TLFrameShape | undefined
	let readonly = true
	const editor = {
		getIsReadonly: () => readonly,
		getCurrentPageId: () => 'page:current',
		getCurrentPage: () => ({ id: 'page:current', meta: {} }),
		getCurrentPageShapes: () => created ? [created] : [],
		getSelectedShapeIds: () => [],
		getViewportPageBounds: () => ({ center: { x: 1000, y: 1000 } }),
		canCreateShapes: () => true,
		markHistoryStoppingPoint: () => 'mark',
		run: (task: () => void) => task(),
		createShape: (partial: TLFrameShape) => { created = partial },
		getShape: (id: string) => created?.id === id ? created : undefined,
		updatePage: () => undefined,
		select: () => undefined,
		getShapePageBounds: () => ({ x: 680, y: 820 }),
		zoomToBounds: () => undefined,
	} as unknown as Editor
	assert.equal(createPresentationSlide(editor), null)
	readonly = false
	assert.ok(createPresentationSlide(editor))
	assert.deepEqual({ x: created?.x, y: created?.y, w: created?.props.w, h: created?.props.h }, { x: 680, y: 820, w: 640, h: 360 })
})

test('presenter follows saved order and keeps the current slide when order changes', () => {
	const frames = [frame('frame:one', 0, 0), frame('frame:two', 600, 0), frame('frame:three', 0, 500)]
	let page = { id: 'page:current', meta: { freeformPresentationOrder: ['frame:three', 'frame:one', 'frame:two'] } }
	const shown: string[] = []
	const container = { dataset: {} as Record<string, string | undefined>, ownerDocument: { fullscreenEnabled: false, fullscreenElement: null } }
	const editor = {
		getCurrentPageId: () => page.id,
		getCurrentPage: () => page,
		getCurrentPageShapes: () => frames,
		getCamera: () => ({ x: 0, y: 0, z: 1 }),
		getSelectedShapeIds: () => [],
		getInstanceState: () => ({ isReadonly: false }),
		getShapePageBounds: (id: string) => {
			shown.push(id)
			return { x: 0, y: 0, w: 640, h: 360 }
		},
		getShape: (id: string) => frames.find((candidate) => candidate.id === id),
		setSelectedShapes: () => undefined,
		updateInstanceState: () => undefined,
		setCamera: () => undefined,
		zoomToBounds: () => undefined,
		getContainer: () => container,
	} as unknown as Editor
	const presenter = new PresentationController(editor)
	assert.equal(presenter.start(), true)
	assert.equal(presenter.currentFrame?.id, 'frame:three')
	assert.equal(presenter.goToFrame('frame:two'), true)
	assert.equal(presenter.currentIndex, 2)
	page = { ...page, meta: { freeformPresentationOrder: ['frame:two', 'frame:one', 'frame:three'] } }
	presenter.refresh()
	assert.equal(presenter.currentFrame?.id, 'frame:two')
	assert.equal(presenter.currentIndex, 0)
	assert.equal(presenter.next(), true)
	assert.equal(presenter.currentFrame?.id, 'frame:one')
	assert.deepEqual(shown, ['frame:three', 'frame:two', 'frame:two', 'frame:one'])
	presenter.exit()
})

test('presentation navigates frames, fits camera, and restores camera and selection without editing the board', () => {
	const first = frame('frame:first', 100, 200)
	const second = frame('frame:second', 900, 200)
	const selectedShape = { ...first, id: 'shape:selected', type: 'geo' as const }
	const pageShapes = [second, { ...first, type: 'geo' }, first, frame('nested', 0, 0, 'shape:group'), selectedShape]
	const originalCamera = { x: -34, y: 19, z: 0.75 }
	let readonly = false
	const originalSelection = ['shape:selected']
	const data = structuredClone(pageShapes)
	const cameraBounds: Array<{ x: number; y: number; w: number; h: number }> = []
	let camera = originalCamera
	let selected = [...originalSelection]
	const documentRef = { fullscreenEnabled: false, fullscreenElement: null }
	const container = { dataset: {} as Record<string, string | undefined>, ownerDocument: documentRef }
	const editor = {
		getCurrentPageId: () => 'page:current',
		getCurrentPageShapes: () => pageShapes,
		getCamera: () => camera,
		getSelectedShapeIds: () => selected,
		getInstanceState: () => ({ isReadonly: readonly }),
		getShapePageBounds: (id: string) => {
			const shape = pageShapes.find((candidate) => candidate.id === id)
			return shape ? { x: shape.x, y: shape.y, w: shape.props.w, h: shape.props.h } : undefined
		},
		getShape: (id: string) => pageShapes.find((shape) => shape.id === id),
		setSelectedShapes: (ids: string[]) => { selected = ids },
		updateInstanceState: (partial: { isReadonly?: boolean }) => { if (typeof partial.isReadonly === 'boolean') readonly = partial.isReadonly },
		setCamera: (point: typeof camera) => { camera = point },
		zoomToBounds: (bounds: { x: number; y: number; w: number; h: number }) => { cameraBounds.push(bounds) },
		getContainer: () => container,
	} as unknown as Editor
	const presentation = new PresentationController(editor)

	assert.equal(presentation.start(), true)
	assert.equal(presentation.currentIndex, 0)
	assert.equal(presentation.slideCount, 2)
	assert.deepEqual(cameraBounds[0], { x: 100, y: 200, w: 640, h: 360 })
	assert.deepEqual(selected, [], 'presentation hides selection handles while presenting')
	assert.equal(readonly, true, 'presenting must prevent local canvas edits')
	assert.equal(container.dataset.freeformPresentation, 'true')
	assert.equal(presentation.next(), true)
	assert.deepEqual(cameraBounds[1], { x: 900, y: 200, w: 640, h: 360 })
	assert.equal(presentation.next(), false)
	assert.equal(presentation.previous(), true)
	selected = ['shape:temporary']
	assert.equal(presentation.exit(), true)
	assert.deepEqual(camera, originalCamera)
	assert.deepEqual(selected, originalSelection)
	assert.equal(readonly, false, 'exiting must restore the editor read-only setting')
	assert.equal(container.dataset.freeformPresentation, undefined)
	assert.deepEqual(pageShapes, data, 'presentation must not write to canvas shape records')

	assert.equal(presentation.start(), true)
	assert.equal(presentation.next(), true)
	presentation.dispose()
	assert.equal(presentation.isPresenting, false, 'disposing the controls exits an active presentation')
	assert.deepEqual(camera, originalCamera)
	assert.deepEqual(selected, originalSelection)
	assert.equal(readonly, false)
	assert.equal(container.dataset.freeformPresentation, undefined)
})

test('keyboard navigation handles arrow/page keys and Escape only while presenting', () => {
	const editor = {
		getCurrentPageId: () => 'page:current',
		getCurrentPageShapes: () => [frame('one', 0, 0), frame('two', 700, 0)],
		getCamera: () => ({ x: 0, y: 0, z: 1 }),
		getSelectedShapeIds: () => [],
		getInstanceState: () => ({ isReadonly: false }),
		getShapePageBounds: () => undefined,
		setSelectedShapes: () => undefined,
		updateInstanceState: () => undefined,
		setCamera: () => undefined,
		zoomToBounds: () => undefined,
		getContainer: () => ({ dataset: {} as Record<string, string | undefined>, ownerDocument: { fullscreenEnabled: false, fullscreenElement: null } }),
	} as unknown as Editor
	const presentation = new PresentationController(editor)
	const start = keyEvent('p', { altKey: true, shiftKey: true })
	assert.equal(handlePresentationKeydown(start.event, presentation), true)
	const next = keyEvent('PageDown')
	assert.equal(handlePresentationKeydown(next.event, presentation), true)
	assert.equal(presentation.currentIndex, 1)
	assert.equal(next.wasHandled(), true)
	const exit = keyEvent('Escape')
	assert.equal(handlePresentationKeydown(exit.event, presentation), true)
	assert.equal(presentation.isPresenting, false)
})

test('presentation shortcut uses the physical P key when macOS Option changes the key value', () => {
	const editor = {
		getCurrentPageId: () => 'page:current',
		getCurrentPageShapes: () => [frame('one', 0, 0)],
		getCamera: () => ({ x: 0, y: 0, z: 1 }),
		getSelectedShapeIds: () => [],
		getInstanceState: () => ({ isReadonly: false }),
		getShapePageBounds: () => undefined,
		setSelectedShapes: () => undefined,
		updateInstanceState: () => undefined,
		setCamera: () => undefined,
		zoomToBounds: () => undefined,
		getContainer: () => ({ dataset: {} as Record<string, string | undefined>, ownerDocument: { fullscreenEnabled: false, fullscreenElement: null } }),
	} as unknown as Editor
	const presentation = new PresentationController(editor)
	const start = keyEvent('∏', { code: 'KeyP', altKey: true, shiftKey: true })
	assert.equal(handlePresentationKeydown(start.event, presentation), true)
	assert.equal(presentation.isPresenting, true)
	presentation.exit()
})

test('fullscreen gracefully reports unsupported browsers', async () => {
	const target = {} as HTMLElement
	const host = { fullscreenEnabled: false, fullscreenElement: null, exitFullscreen: async () => undefined } as unknown as Document
	assert.equal(await requestPresentationFullscreen(target, host), false)
})

test('fullscreen enters only when supported and calls the browser API', async () => {
	let requested = false
	const host = { fullscreenEnabled: true, fullscreenElement: null } as unknown as Document
	const target = {
		ownerDocument: host,
		requestFullscreen: async () => { requested = true },
	} as unknown as HTMLElement
	assert.equal(await requestPresentationFullscreen(target), true)
	assert.equal(requested, true)
})

test('presentation stays in its tab for a remote, and optional fullscreen can be left without ending it', async () => {
	const first = frame('frame:fullscreen', 0, 0)
	const documentRef: { fullscreenEnabled: boolean; fullscreenElement: Element | null; exitFullscreen: () => Promise<void> } = {
		fullscreenEnabled: true,
		fullscreenElement: null,
		exitFullscreen: async () => { documentRef.fullscreenElement = null },
	}
	const container = {
		dataset: {} as Record<string, string | undefined>,
		ownerDocument: documentRef,
		requestFullscreen: async () => { documentRef.fullscreenElement = container as unknown as Element },
	}
	let camera = { x: 30, y: -20, z: 0.8 }
	let readonly = false
	const originalCamera = { ...camera }
	const editor = {
		getCurrentPageId: () => 'page:current',
		getCurrentPageShapes: () => [first],
		getCamera: () => camera,
		getSelectedShapeIds: () => [],
		getInstanceState: () => ({ isReadonly: readonly }),
		getShapePageBounds: () => ({ x: 0, y: 0, w: 640, h: 360 }),
		getShape: () => first,
		setSelectedShapes: () => undefined,
		updateInstanceState: (partial: { isReadonly?: boolean }) => { if (typeof partial.isReadonly === 'boolean') readonly = partial.isReadonly },
		setCamera: (point: typeof camera) => { camera = point },
		zoomToBounds: () => undefined,
		getContainer: () => container,
	} as unknown as Editor
	const presentation = new PresentationController(editor)
	assert.equal(presentation.start(), true)
	await new Promise<void>((resolve) => setImmediate(resolve))
	assert.equal(documentRef.fullscreenElement, null, 'starting a presentation keeps the tab available for a remote')
	assert.equal(await presentation.enterFullscreen(), true)
	assert.equal(documentRef.fullscreenElement, container)
	assert.equal(readonly, true)

	documentRef.fullscreenElement = null
	presentation.fullscreenChanged()
	assert.equal(presentation.isPresenting, true)
	assert.equal(readonly, true)
	assert.equal(container.dataset.freeformPresentation, 'true')
	assert.equal(presentation.exit(), true)
	assert.equal(presentation.isPresenting, false)
	assert.equal(readonly, false)
	assert.deepEqual(camera, originalCamera)
	assert.equal(container.dataset.freeformPresentation, undefined)
})
