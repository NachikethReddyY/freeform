import assert from 'node:assert/strict'
import test from 'node:test'
import { MessagePort } from 'node:worker_threads'
import { renderToStaticMarkup } from 'react-dom/server'
import { STARTERS } from './library/templates'
import { DiagramPreview } from './DiagramPreview'

for (const handle of (process as NodeJS.Process & { _getActiveHandles(): unknown[] })._getActiveHandles()) {
	if (handle instanceof MessagePort) handle.unref()
}

test('sequence preview hides binding guides and keeps message captions clear', () => {
	const sequence = STARTERS.find(({ id }) => id === 'sequence')!.diagram
	const markup = renderToStaticMarkup(<DiagramPreview diagram={sequence} />)
	assert.ok(!markup.includes('<ellipse'), 'guide anchors should not render as endpoint circles')
	assert.equal((markup.match(/class="wboard-diagrams-edge-label-bg"/g) ?? []).length, 4)
	for (const caption of ['Request', 'Query', 'Result', 'Response']) {
		assert.match(markup, new RegExp(`>${caption}</text>`))
	}
	assert.equal((markup.match(/stroke-dasharray=/g) ?? []).length, 3, 'lifelines should render dashed')
	assert.equal((markup.match(/marker-end=/g) ?? []).length, 4, 'lifelines should not have arrowheads')
})
