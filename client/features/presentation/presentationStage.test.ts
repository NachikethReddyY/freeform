import assert from 'node:assert/strict'
import test from 'node:test'
import type { Editor, TLFrameShape, TLShapeId } from 'tldraw'
import { getPresentationCamera, exportPresentationSlide, exportPresentationSlideWithRetry, getLaserSegment } from './presentationStage'

test('a small frame expands into a centered slide without exposing nearby canvas', () => {
	const camera = getPresentationCamera({ x: 200, y: 500, w: 320, h: 180 }, 1280, 720)
	assert.ok(camera.scale > 1)
	assert.ok(Math.abs(camera.x + (200 + 160) * camera.scale - 640) < 0.01)
	assert.ok(Math.abs(camera.y + (500 + 90) * camera.scale - 360) < 0.01)
	const below = getPresentationCamera({ x: 200, y: 1200, w: 320, h: 180 }, 1280, 720)
	assert.ok(below.y < camera.y, 'a lower frame makes the stage move upward')
})

test('slide export uses tldraw single-frame path and clips to the frame bounds', async () => {
	const frame = { id: 'shape:frame', type: 'frame' } as TLFrameShape
	const bounds = { x: 70, y: 90, w: 640, h: 360 }
	let called: { ids: TLShapeId[]; options: Record<string, unknown> } | undefined
	const editor = {
		getShapePageBounds: () => bounds,
		getSvgString: async (ids: TLShapeId[], options: Record<string, unknown>) => {
			called = { ids, options }
			return { svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', width: 640, height: 360 }
		},
	} as unknown as Editor
	const slide = await exportPresentationSlide(editor, frame)
	assert.deepEqual(called?.ids, [frame.id], 'native single-frame export includes nested content without the frame border')
	assert.deepEqual(called?.options, { bounds, background: false, darkMode: false, padding: 0 })
	assert.equal(slide?.svg.includes('<svg'), true)
	await exportPresentationSlide(editor, frame, true)
	assert.deepEqual(called?.options, { bounds, background: false, darkMode: true, padding: 0 }, 'dark slides export inverted content over the seamless stage surface')
})

test('a transient first-frame export failure retries before leaving the presentation blank', async () => {
	const frame = { id: 'shape:first', type: 'frame' } as TLFrameShape
	let attempts = 0
	const editor = {
		getShapePageBounds: () => ({ x: 0, y: 0, w: 640, h: 360 }),
		getSvgString: async () => {
			attempts += 1
			if (attempts === 1) throw new Error('font still loading')
			return { svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>First slide</text></svg>' }
		},
	} as unknown as Editor
	const delays: number[] = []
	const slide = await exportPresentationSlideWithRetry(editor, frame, false, async (ms) => { delays.push(ms) })
	assert.equal(attempts, 2)
	assert.deepEqual(delays, [160])
	assert.match(slide?.svg ?? '', /First slide/)
})

test('laser movement creates a visible segment only for continuous motion', () => {
	const previous = { x: 20, y: 40, at: 100 }
	assert.deepEqual(getLaserSegment(previous, 70, 80, 116, 3), { id: 3, x1: 20, y1: 40, x2: 70, y2: 80 })
	assert.equal(getLaserSegment(previous, 21, 41, 116, 4), null, 'jitter does not create a trail')
	assert.equal(getLaserSegment(previous, 70, 80, 250, 5), null, 'a pause does not connect distant cursor positions')
	assert.equal(getLaserSegment(previous, 700, 80, 116, 6), null, 'a large jump does not paint across the slide')
})
