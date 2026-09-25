import assert from 'node:assert/strict'
import test from 'node:test'
import { MessagePort } from 'node:worker_threads'
import { Box } from 'tldraw'
import { arrowBodyClipPath } from './FreeformArrowShapeUtil'

for (const handle of (process as NodeJS.Process & { _getActiveHandles(): unknown[] })._getActiveHandles()) {
	if (handle instanceof MessagePort) handle.unref()
}

test('arrow label cutout removes the center stroke while retaining both arrow ends', () => {
	const clip = arrowBodyClipPath(new Box(0, 0, 300, 0), new Box(112, -18, 76, 36))
	assert.match(clip, /^M -100 -100 /, 'clip covers the complete arrow and arrowheads')
	assert.match(clip, /M 112 -18 L 112 18 L 188 18 L 188 -18 Z$/, 'center label makes a reverse-winding hole')
})
