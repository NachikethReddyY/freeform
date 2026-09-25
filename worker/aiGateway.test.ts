import assert from 'node:assert/strict'
import test from 'node:test'
import { handleAiChat, handleAiModels, parseProviderBaseUrl } from './aiGateway'

const origin = 'http://localhost:5173'
const jsonRequest = (path: string, body: unknown, headers: Record<string, string> = {}) => new Request(`${origin}${path}`, {
	method: 'POST', headers: { 'content-type': 'application/json', origin, ...headers }, body: JSON.stringify(body),
})
const modelConnection = { provider: 'openai-compatible', baseUrl: 'https://api.example.com/v1', apiKey: 'secret-key' }
const localConnection = { provider: 'ollama', baseUrl: 'http://localhost:11434' }

test('provider URLs allow explicit loopback or public HTTPS origins, never arbitrary local targets', () => {
	assert.equal(parseProviderBaseUrl('http://localhost:11434', 'ollama').href, 'http://localhost:11434/')
	assert.equal(parseProviderBaseUrl('http://127.0.0.1:1234/v1', 'openai-compatible').href, 'http://127.0.0.1:1234/v1/')
	assert.equal(parseProviderBaseUrl('https://api.example.com/v1', 'openai-compatible').href, 'https://api.example.com/v1/')
	for (const url of [
		'http://api.example.com/v1', 'https://10.0.0.1/v1', 'http://192.168.1.1:11434',
		'http://metadata.google.internal', 'http://localhost:5173/v1', 'http://127.0.0.1:5173/v1',
		'https://user:password@api.example.com/v1', 'https://api.example.com/v1?token=secret',
		'https://api.example.com:8443/v1', 'https://api.example.com/v1/../admin',
		'https://service.local.', 'https://localhost.',
	]) assert.throws(() => parseProviderBaseUrl(url, 'openai-compatible'))
})

test('Ollama requests never receive a key from a previous provider connection', async () => {
	let outbound: Request | undefined
	const response = await handleAiModels(jsonRequest('/api/ai/models', { ...localConnection, apiKey: 'old-key' }), async (input, init) => {
		outbound = new Request(input, init)
		return Response.json({ models: [] })
	})
	assert.equal(response.status, 200)
	assert.equal(outbound?.headers.get('authorization'), null)
})

test('model listing is bounded and never relays the credential in its response', async () => {
	let outbound: Request | undefined
	const fetcher: typeof fetch = async (input, init) => {
		outbound = new Request(input, init)
		return Response.json({ data: [{ id: 'model-a' }, { id: 'model-b' }] })
	}
	const response = await handleAiModels(jsonRequest('/api/ai/models', modelConnection), fetcher)
	assert.equal(response.status, 200)
	assert.equal(outbound?.url, 'https://api.example.com/v1/models')
	assert.equal(outbound?.headers.get('authorization'), 'Bearer secret-key')
	assert.deepEqual(await response.json(), { models: [{ id: 'model-a', name: 'model-a' }, { id: 'model-b', name: 'model-b' }] })
	assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('Ollama model discovery uses the native tags API', async () => {
	let outbound: Request | undefined
	const response = await handleAiModels(jsonRequest('/api/ai/models', localConnection), async (input, init) => {
		outbound = new Request(input, init)
		return Response.json({ models: [{ name: 'llama3:latest' }] })
	})
	assert.equal(response.status, 200)
	assert.equal(outbound?.url, 'http://localhost:11434/api/tags')
	assert.deepEqual(await response.json(), { models: [{ id: 'llama3:latest', name: 'llama3:latest' }] })
})

test('general chat returns bounded assistant text without modifying the board', async () => {
	let body: unknown
	const response = await handleAiChat(jsonRequest('/api/ai/chat', { ...modelConnection, model: 'model-a', messages: [{ role: 'user', content: 'hello' }] }), async (input, init) => {
		assert.equal(new Request(input, init).url, 'https://api.example.com/v1/chat/completions')
		body = JSON.parse(String(init?.body))
		return Response.json({ choices: [{ message: { role: 'assistant', content: 'Hello from the model' } }] })
	})
	assert.equal(response.status, 200)
	assert.deepEqual(await response.json(), { model: 'model-a', message: 'Hello from the model' })
	assert.deepEqual((body as { messages: unknown }).messages, [{ role: 'user', content: 'hello' }])
})

test('general chat preserves code and JSON examples as text', async () => {
	const example = '{"message":"This is code, not a proposal"}'
	const response = await handleAiChat(jsonRequest('/api/ai/chat', { ...modelConnection, model: 'model-a', messages: [{ role: 'user', content: 'show JSON' }] }), async () => Response.json({ choices: [{ message: { content: example } }] }))
	assert.deepEqual(await response.json(), { model: 'model-a', message: example })
})

test('diagram mode supplies the schema prompt and returns only a valid diagram for review', async () => {
	let body: { messages: { role: string; content: string }[] } | undefined
	const diagram = { title: 'Flow', nodes: [
		{ id: 'browser', kind: 'rectangle', label: 'Browser', x: 0, y: 0 },
		{ id: 'api', kind: 'rectangle', label: 'API', x: 300, y: 0 },
	], edges: [{ id: 'request', from: 'browser', to: 'api', label: 'request' }] }
	const response = await handleAiChat(jsonRequest('/api/ai/chat', { ...localConnection, model: 'llama3', mode: 'diagram', messages: [{ role: 'user', content: 'draw request flow' }] }), async (_input, init) => {
		body = JSON.parse(String(init?.body))
		return Response.json({ message: { content: JSON.stringify({ message: 'Here is the flow.', diagram }) } })
	})
	assert.equal(response.status, 200)
	assert.match(body?.messages[0].content ?? '', /strict JSON/i)
	assert.equal(body?.messages[1].content, 'draw request flow')
	const data = await response.json() as { diagram?: { nodes: unknown[] }; message: string }
	assert.equal(data.message, 'Here is the flow.')
	assert.equal(data.diagram?.nodes.length, 2)
})

test('invalid model diagrams become a warning while the explanation remains available', async () => {
	const response = await handleAiChat(jsonRequest('/api/ai/chat', { ...modelConnection, model: 'model-a', mode: 'diagram', messages: [{ role: 'user', content: 'draw' }] }), async () => Response.json({ choices: [{ message: { content: JSON.stringify({ message: 'Here is a draft.', diagram: { title: 'Bad', nodes: [], edges: [] } }) } }] }))
	assert.equal(response.status, 200)
	const data = await response.json() as { diagram?: unknown; warning?: string; message: string }
	assert.equal(data.message, 'Here is a draft.')
	assert.equal(data.diagram, undefined)
	assert.match(data.warning ?? '', /valid diagram/i)
})

test('stopping an inbound chat request aborts the upstream provider call', async () => {
	const controller = new AbortController()
	const request = new Request(`${origin}/api/ai/chat`, {
		method: 'POST', headers: { 'content-type': 'application/json', origin },
		body: JSON.stringify({ ...modelConnection, model: 'model-a', messages: [{ role: 'user', content: 'hello' }] }),
		signal: controller.signal,
	})
	let upstreamSignal: AbortSignal | undefined
	const response = await handleAiChat(request, async (_input, init) => {
		upstreamSignal = init?.signal ?? undefined
		controller.abort()
		if (upstreamSignal?.aborted) throw new DOMException('Stopped', 'AbortError')
		return Response.json({ choices: [{ message: { content: 'The request continued' } }] })
	})
	assert.equal(upstreamSignal?.aborted, true)
	assert.equal(response.status, 499)
})

test('stopping while reading a provider response cancels the body before its next chunk', async () => {
	const controller = new AbortController()
	const request = new Request(`${origin}/api/ai/chat`, {
		method: 'POST', headers: { 'content-type': 'application/json', origin },
		body: JSON.stringify({ ...modelConnection, model: 'model-a', messages: [{ role: 'user', content: 'hello' }] }),
		signal: controller.signal,
	})
	let reading!: () => void
	const startedReading = new Promise<void>((resolve) => { reading = resolve })
	let canceled = false
	const responsePromise = handleAiChat(request, async () => new Response(new ReadableStream<Uint8Array>({
		pull() {
			reading()
		},
		cancel() { canceled = true },
	}, { highWaterMark: 0 })))
	await startedReading
	controller.abort()
	let timer: ReturnType<typeof setTimeout> | undefined
	const response = await Promise.race([
		responsePromise,
		new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Provider body was not canceled promptly')), 250) }),
	]).finally(() => clearTimeout(timer))
	assert.equal(response.status, 499)
	assert.equal(canceled, true)
	assert.deepEqual(await response.json(), { error: 'AI request canceled' })
})

test('a response body is canceled when Stop wins the race after provider headers', async () => {
	const controller = new AbortController()
	const request = new Request(`${origin}/api/ai/chat`, {
		method: 'POST', headers: { 'content-type': 'application/json', origin },
		body: JSON.stringify({ ...modelConnection, model: 'model-a', messages: [{ role: 'user', content: 'hello' }] }),
		signal: controller.signal,
	})
	let canceled = false
	const response = await handleAiChat(request, async () => {
		controller.abort()
		return new Response(new ReadableStream<Uint8Array>({ cancel() { canceled = true } }, { highWaterMark: 0 }))
	})
	assert.equal(response.status, 499)
	assert.equal(canceled, true)
})

test('rejects cross-origin calls, invalid bodies, upstream redirects and oversized responses', async () => {
	let calls = 0
	const fetcher: typeof fetch = async () => { calls++; return Response.json({ data: [] }) }
	assert.equal((await handleAiModels(jsonRequest('/api/ai/models', modelConnection, { origin: 'https://evil.example' }), fetcher)).status, 403)
	assert.equal((await handleAiModels(jsonRequest('/api/ai/models', modelConnection, { 'sec-fetch-site': 'cross-site' }), fetcher)).status, 403)
	assert.equal(calls, 0)
	assert.equal((await handleAiChat(jsonRequest('/api/ai/chat', { ...modelConnection, model: 'a', messages: [] }), fetcher)).status, 400)
	assert.equal((await handleAiModels(jsonRequest('/api/ai/models', modelConnection), async () => new Response(null, { status: 302, headers: { location: 'https://other.example/' } }))).status, 502)
	assert.equal((await handleAiModels(jsonRequest('/api/ai/models', modelConnection), async () => new Response('x'.repeat(300_000)))).status, 502)
	assert.equal((await handleAiModels(jsonRequest('/api/ai/models', modelConnection), async () => new Response('oops'))).status, 502)
	assert.deepEqual(await (await handleAiModels(jsonRequest('/api/ai/models', modelConnection), async () => new Response(null, { status: 401 }))).json(), { error: 'Model provider rejected the API key' })
})

test('provider failures distinguish timeout, rate limits, and interrupted responses', async () => {
	const request = () => jsonRequest('/api/ai/chat', { ...modelConnection, model: 'model-a', messages: [{ role: 'user', content: 'hello' }] })
	const timeout = await handleAiChat(request(), async () => { throw new DOMException('Timed out', 'TimeoutError') })
	assert.equal(timeout.status, 504)
	assert.deepEqual(await timeout.json(), { error: 'Model provider timed out' })
	const rateLimit = await handleAiChat(request(), async () => new Response(null, { status: 429 }))
	assert.equal(rateLimit.status, 429)
	assert.deepEqual(await rateLimit.json(), { error: 'Model provider rate limit reached' })
	const interrupted = await handleAiChat(request(), async () => new Response(new ReadableStream({
		start(controller) { controller.error(new Error('connection reset')) },
	})))
	assert.equal(interrupted.status, 502)
	assert.deepEqual(await interrupted.json(), { error: 'Model provider response was interrupted' })
})
