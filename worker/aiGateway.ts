import { z } from 'zod'
import { DiagramSchema, type Diagram } from '../shared/diagram'

const REQUEST_BYTES = 64 * 1024
const RESPONSE_BYTES = 256 * 1024
const MAX_MESSAGE_CHARS = 16_000
const MODEL_LIMIT = 100

const ConnectionSchema = z.object({
	provider: z.enum(['ollama', 'openai-compatible']),
	baseUrl: z.string().min(1).max(500),
	apiKey: z.string().max(512).optional(),
}).strict()

const ChatSchema = ConnectionSchema.extend({
	model: z.string().trim().min(1).max(160),
	mode: z.enum(['chat', 'diagram']).default('chat'),
	messages: z.array(z.object({
		role: z.enum(['system', 'user', 'assistant']),
		content: z.string().trim().min(1).max(8_000),
	}).strict()).min(1).max(24),
}).strict()

type Provider = z.infer<typeof ConnectionSchema>['provider']
type GatewayFetch = typeof fetch

class AiGatewayError extends Error {
	constructor(readonly status: number, message: string) { super(message) }
}

function isLoopback(hostname: string): boolean {
	return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

/** Accept a local model endpoint or a public HTTPS API base. Requests never follow redirects. */
export function parseProviderBaseUrl(value: string, provider: Provider, appOrigin = 'http://localhost:5173'): URL {
	if (/%|\/\.\.?(?:\/|$)/i.test(value)) throw new AiGatewayError(400, 'Use a plain provider URL without encoded paths or parent segments')
	let url: URL
	try { url = new URL(value) }
	catch { throw new AiGatewayError(400, 'Enter a valid provider URL') }
	if (url.username || url.password || url.search || url.hash) throw new AiGatewayError(400, 'Provider URL cannot contain credentials, query, or fragment')
	if (url.hostname.endsWith('.')) throw new AiGatewayError(400, 'Provider URL cannot use a trailing-dot hostname')
	if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new AiGatewayError(400, 'Provider URL must use HTTP or HTTPS')
	const appUrl = new URL(appOrigin)
	if (url.origin === appOrigin || (isLoopback(url.hostname) && isLoopback(appUrl.hostname) && url.port === appUrl.port && url.protocol === appUrl.protocol)) {
		throw new AiGatewayError(400, 'The provider URL cannot point back to FreeForm')
	}
	const local = isLoopback(url.hostname)
	if (url.protocol === 'http:' && !local) throw new AiGatewayError(400, 'Plain HTTP is allowed only for a loopback model server')
	if (!local) {
		if (url.protocol !== 'https:' || url.port || !url.hostname.includes('.') || /(?:^|\.)(?:localhost|local|lan|internal|home|invalid|test|onion)$/.test(url.hostname) || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':')) {
			throw new AiGatewayError(400, 'Use a public HTTPS provider hostname')
		}
	}
	if (provider === 'ollama' && url.pathname !== '/') throw new AiGatewayError(400, 'Ollama URL should be the server root')
	url.pathname = `${url.pathname.replace(/\/$/, '')}/`
	return url
}

function checkLocalRequest(request: Request): void {
	const url = new URL(request.url)
	if (!isLoopback(url.hostname)) throw new AiGatewayError(403, 'AI connections are available on loopback only')
	const origin = request.headers.get('origin')
	if (origin && origin !== url.origin) throw new AiGatewayError(403, 'Cross-origin AI requests are not allowed')
	if (request.headers.get('sec-fetch-site') === 'cross-site') throw new AiGatewayError(403, 'Cross-site AI requests are not allowed')
}

async function readBoundedJson(request: Request): Promise<unknown> {
	if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new AiGatewayError(415, 'Use application/json')
	const declared = Number(request.headers.get('content-length') ?? 0)
	if (declared > REQUEST_BYTES) throw new AiGatewayError(413, 'AI request exceeds 64 KiB')
	if (!request.body) throw new AiGatewayError(400, 'Missing JSON body')
	const bytes = await readBytes(request.body, REQUEST_BYTES, 413, 'AI request exceeds 64 KiB', request.signal)
	try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
	catch { throw new AiGatewayError(400, 'Invalid JSON body') }
}

async function readBytes(stream: ReadableStream<Uint8Array>, limit: number, status: number, message: string, signal?: AbortSignal): Promise<Uint8Array> {
	const reader = stream.getReader()
	const chunks: Uint8Array[] = []
	let length = 0
	const cancelOnAbort = () => { void reader.cancel(signal?.reason).catch(() => {}) }
	signal?.addEventListener('abort', cancelOnAbort, { once: true })
	try {
		while (true) {
			if (signal?.aborted) {
				await reader.cancel(signal.reason).catch(() => {})
				throw new AiGatewayError(499, 'AI request canceled')
			}
			const { done, value } = await reader.read()
			if (signal?.aborted) throw new AiGatewayError(499, 'AI request canceled')
			if (done) break
			length += value.byteLength
			if (length > limit) { await reader.cancel(); throw new AiGatewayError(status, message) }
			chunks.push(value)
		}
	} finally { signal?.removeEventListener('abort', cancelOnAbort); reader.releaseLock() }
	const bytes = new Uint8Array(length)
	let offset = 0
	for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
	return bytes
}

async function providerJson(url: URL, apiKey: string | undefined, fetcher: GatewayFetch, body?: unknown, signal?: AbortSignal): Promise<unknown> {
	const headers = new Headers({ Accept: 'application/json' })
	if (body) headers.set('content-type', 'application/json')
	if (apiKey) headers.set('authorization', `Bearer ${apiKey}`)
	const timeout = AbortSignal.timeout(body ? 45_000 : 8_000)
	const providerSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
	let response: Response
	try {
		response = await fetcher(url.toString(), {
			method: body ? 'POST' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {}),
			redirect: 'manual', signal: providerSignal,
		})
	} catch (cause) {
		if (signal?.aborted) throw new AiGatewayError(499, 'AI request canceled')
		if (timeout.aborted) throw new AiGatewayError(504, 'Model provider timed out')
		if (cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError')) throw new AiGatewayError(504, 'Model provider timed out')
		throw new AiGatewayError(502, 'Cannot reach the model provider')
	}
	if (response.status >= 300 && response.status < 400) throw new AiGatewayError(502, 'Model provider redirected the request')
	if (response.status === 401 || response.status === 403) throw new AiGatewayError(502, 'Model provider rejected the API key')
	if (response.status === 429) throw new AiGatewayError(429, 'Model provider rate limit reached')
	if (!response.ok) throw new AiGatewayError(502, `Model provider returned HTTP ${response.status}`)
	const declared = Number(response.headers.get('content-length') ?? 0)
	if (declared > RESPONSE_BYTES) throw new AiGatewayError(502, 'Model provider response is too large')
	if (!response.body) throw new AiGatewayError(502, 'Model provider returned an empty response')
	let bytes: Uint8Array
	try { bytes = await readBytes(response.body, RESPONSE_BYTES, 502, 'Model provider response is too large', providerSignal) }
	catch (cause) {
		if (signal?.aborted) throw new AiGatewayError(499, 'AI request canceled')
		if (timeout.aborted) throw new AiGatewayError(504, 'Model provider timed out')
		if (cause instanceof AiGatewayError) throw cause
		throw new AiGatewayError(502, 'Model provider response was interrupted')
	}
	try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
	catch { throw new AiGatewayError(502, 'Model provider returned invalid JSON') }
}

function gatewayErrorResponse(cause: unknown): Response {
	if (cause instanceof AiGatewayError) return Response.json({ error: cause.message }, { status: cause.status, headers: { 'Cache-Control': 'no-store' } })
	if (cause instanceof z.ZodError) return Response.json({ error: 'Invalid AI request', issues: cause.issues.slice(0, 6).map(({ path, message }) => ({ path, message })) }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
	return Response.json({ error: 'AI connection failed' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
}

function modelEntries(input: unknown, provider: Provider): { id: string; name: string }[] {
	const raw = provider === 'ollama' ? z.object({ models: z.array(z.unknown()) }).safeParse(input) : z.object({ data: z.array(z.unknown()) }).safeParse(input)
	if (!raw.success) throw new AiGatewayError(502, 'Model provider returned an invalid model list')
	const entries = provider === 'ollama' ? (raw.data as { models: unknown[] }).models : (raw.data as { data: unknown[] }).data
	const found: { id: string; name: string }[] = []
	const seen = new Set<string>()
	for (const value of entries) {
		const parsed = z.object({ id: z.string().min(1).max(160).optional(), name: z.string().min(1).max(160).optional() }).safeParse(value)
		if (!parsed.success) continue
		const id = provider === 'ollama' ? parsed.data.name : parsed.data.id
		if (!id || seen.has(id)) continue
		seen.add(id)
		found.push({ id, name: id })
		if (found.length === MODEL_LIMIT) break
	}
	return found
}

const diagramSystemPrompt = `Create a FreeForm diagram. Return strict JSON only: {"message":"brief explanation","diagram":{"title":"name","nodes":[{"id":"unique_id","kind":"rectangle","label":"text","x":0,"y":0,"w":180,"h":90,"color":"blue"}],"edges":[{"id":"unique_edge","from":"source_id","to":"target_id","label":"text","color":"black"}]}}. Node kind: rectangle, ellipse, diamond, or note. Color: black, grey, blue, green, red, orange, violet, or yellow. Use 1–80 nodes and 0–120 edges. Every edge must connect two distinct node IDs. Coordinates are canvas units. Do not include code or markdown.`

function assistantContent(input: unknown, provider: Provider): string {
	const content = provider === 'ollama'
		? z.object({ message: z.object({ content: z.string() }) }).safeParse(input)
		: z.object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1) }).safeParse(input)
	if (!content.success) throw new AiGatewayError(502, 'Model provider returned an invalid chat response')
	const text = provider === 'ollama' ? (content.data as { message: { content: string } }).message.content : (content.data as { choices: { message: { content: string } }[] }).choices[0].message.content
	if (text.length > 96_000) throw new AiGatewayError(502, 'Model answer is too large')
	return text
}

function decodeAnswer(text: string, mode: 'chat' | 'diagram'): { message: string; diagram?: Diagram; warning?: string } {
	const trimmed = text.trim()
	if (mode === 'chat') return { message: trimmed.slice(0, MAX_MESSAGE_CHARS) }
	const candidate = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] ?? trimmed
	let parsed: unknown
	try { parsed = JSON.parse(candidate) }
	catch { return { message: trimmed.slice(0, MAX_MESSAGE_CHARS), ...(mode === 'diagram' ? { warning: 'The model did not return a valid diagram. Ask it to try again.' } : {}) } }
	const envelope = z.object({ message: z.string().max(MAX_MESSAGE_CHARS).optional(), diagram: z.unknown().optional() }).passthrough().safeParse(parsed)
	if (!envelope.success || typeof parsed !== 'object' || !parsed || (!('message' in parsed) && !('diagram' in parsed))) return { message: trimmed.slice(0, MAX_MESSAGE_CHARS), ...(mode === 'diagram' ? { warning: 'The model did not return a valid diagram. Ask it to try again.' } : {}) }
	const message = envelope.data.message ?? ''
	if (envelope.data.diagram === undefined) return { message, ...(mode === 'diagram' ? { warning: 'The model did not return a valid diagram. Ask it to try again.' } : {}) }
	const diagram = DiagramSchema.safeParse(envelope.data.diagram)
	return diagram.success ? { message, diagram: diagram.data } : { message, warning: 'The model did not return a valid diagram. Ask it to try again.' }
}

export async function handleAiModels(request: Request, fetcher: GatewayFetch = fetch): Promise<Response> {
	try {
		checkLocalRequest(request)
		const connection = ConnectionSchema.parse(await readBoundedJson(request))
		const base = parseProviderBaseUrl(connection.baseUrl, connection.provider, new URL(request.url).origin)
		const url = new URL(connection.provider === 'ollama' ? 'api/tags' : 'models', base)
		const models = modelEntries(await providerJson(url, connection.provider === 'ollama' ? undefined : connection.apiKey, fetcher, undefined, request.signal), connection.provider)
		return Response.json({ models }, { headers: { 'Cache-Control': 'no-store' } })
	} catch (cause) { return gatewayErrorResponse(cause) }
}

export async function handleAiChat(request: Request, fetcher: GatewayFetch = fetch): Promise<Response> {
	try {
		checkLocalRequest(request)
		const input = ChatSchema.parse(await readBoundedJson(request))
		const base = parseProviderBaseUrl(input.baseUrl, input.provider, new URL(request.url).origin)
		const messages = input.mode === 'diagram' ? [{ role: 'system', content: diagramSystemPrompt }, ...input.messages] : input.messages
		const body = input.provider === 'ollama'
			? { model: input.model, messages, stream: false, options: { num_predict: 2048 } }
			: { model: input.model, messages, stream: false, ...(base.hostname === 'api.openai.com' ? { max_completion_tokens: 2048 } : { max_tokens: 2048 }) }
		const url = new URL(input.provider === 'ollama' ? 'api/chat' : 'chat/completions', base)
		const answer = decodeAnswer(assistantContent(await providerJson(url, input.provider === 'ollama' ? undefined : input.apiKey, fetcher, body, request.signal), input.provider), input.mode)
		return Response.json({ model: input.model, ...answer }, { headers: { 'Cache-Control': 'no-store' } })
	} catch (cause) { return gatewayErrorResponse(cause) }
}
