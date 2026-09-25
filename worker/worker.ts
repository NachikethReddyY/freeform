import { handleUnfurlRequest } from 'cloudflare-workers-unfurl'
import { AutoRouter, error, IRequest } from 'itty-router'
import { handleAssetDownload, handleAssetUpload } from './assetUploads'
import { handleAiChat, handleAiModels } from './aiGateway'
import { RoomIdSchema } from '../shared/diagram'
import { checkLocalDiagramRequest, diagramErrorResponse } from './diagramProposals'
import { handleUnknownRequest } from './navigation'
import { assertLocalAuthRequest, authErrorResponse, AuthError } from './auth'

// make sure our sync durable object is made available to cloudflare
export { TldrawDurableObject } from './TldrawDurableObject'
export { AuthDurableObject } from './AuthDurableObject'

function authObject(env: Env) {
	return env.AUTH_DURABLE_OBJECT.get(env.AUTH_DURABLE_OBJECT.idFromName('local-owner'))
}

function authApi(request: Request, env: Env): Promise<Response> {
	try {
		assertLocalAuthRequest(request)
		return authObject(env).fetch(request.url, {
			method: request.method,
			headers: request.headers,
			body: request.body,
		})
	} catch (cause) { return Promise.resolve(authErrorResponse(cause)) }
}

async function protectedRoute(
	request: Request,
	env: Env,
	handle: () => unknown | Promise<unknown>,
	options: { boardApi?: boolean; websocket?: boolean } = {},
): Promise<Response> {
	try {
		assertLocalAuthRequest(request, options.boardApi && /^Bearer\s+/i.test(request.headers.get('authorization') ?? ''))
		if (options.websocket) {
			const address = new URL(request.url)
			const expectedOrigin = `${address.protocol === 'ws:' ? 'http:' : address.protocol === 'wss:' ? 'https:' : address.protocol}//${address.host}`
			if (request.headers.get('origin') !== expectedOrigin) throw new AuthError(403, 'A same-origin WebSocket is required')
		}
		const url = new URL('/internal/authorize', request.url)
		const headers = new Headers()
		for (const key of ['cookie', 'authorization']) {
			const value = request.headers.get(key)
			if (value) headers.set(key, value)
		}
		if (options.boardApi) headers.set('x-freeform-scope', 'board')
		const response = await authObject(env).fetch(url.toString(), { headers })
		if (!response.ok) return Response.json({ error: 'Sign in to access this board' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
		const result = await handle()
		return result instanceof Response ? result : Response.json(result)
	} catch (cause) { return authErrorResponse(cause) }
}

// we use itty-router (https://itty.dev/) to handle routing. in this example we turn on CORS because
// we're hosting the worker separately to the client. you should restrict this to your own domain.
const router = AutoRouter<IRequest, [env: Env, ctx: ExecutionContext]>({
	catch: (e) => {
		console.error(e)
		return error(e)
	},
})
	.get('/api/me', authApi)
	.post('/api/register', authApi)
	.post('/api/login', authApi)
	.post('/api/logout', authApi)
	.all('/api/mcp/tokens', authApi)
	.post('/api/ai/models', (request, env) => protectedRoute(request, env, () => handleAiModels(request)))
	.post('/api/ai/chat', (request, env) => protectedRoute(request, env, () => handleAiChat(request)))
	.get('/api/presentation/:roomId/:sessionId', (request, env) => {
		const relay = () => {
			const id = env.TLDRAW_DURABLE_OBJECT.idFromName(request.params.roomId)
			return env.TLDRAW_DURABLE_OBJECT.get(id).fetch(request.url, { headers: request.headers })
		}
		return new URL(request.url).searchParams.get('role') === 'host'
			? protectedRoute(request, env, relay, { websocket: true })
			: relay()
	})
	// Personal diagram tools use the same room authority, while proposals stay outside its document.
	.all('/api/rooms/:roomId/*', async (request, env) => {
		return protectedRoute(request, env, async () => {
			try {
				checkLocalDiagramRequest(request)
				const roomId = RoomIdSchema.parse(request.params.roomId)
				const id = env.TLDRAW_DURABLE_OBJECT.idFromName(roomId)
				return await env.TLDRAW_DURABLE_OBJECT.get(id).fetch(request.url, {
					method: request.method,
					headers: request.headers,
					body: request.body,
				})
			} catch (cause) { return diagramErrorResponse(cause) }
		}, { boardApi: true })
	})
	// requests to /connect are routed to the Durable Object, and handle realtime websocket syncing
	.get('/api/connect/:roomId', (request, env) => {
		return protectedRoute(request, env, () => {
			const id = env.TLDRAW_DURABLE_OBJECT.idFromName(request.params.roomId)
			const room = env.TLDRAW_DURABLE_OBJECT.get(id)
			return room.fetch(request.url, { headers: request.headers, body: request.body })
		}, { websocket: true })
	})

	// assets can be uploaded to the bucket under /uploads:
	.post('/api/uploads/:uploadId', (request, env) => protectedRoute(request, env, () => handleAssetUpload(request, env)))

	// they can be retrieved from the bucket too:
	.get('/api/uploads/:uploadId', (request, env, ctx) => protectedRoute(request, env, () => handleAssetDownload(request, env, ctx)))

	// bookmarks need to extract metadata from pasted URLs:
	.get('/api/unfurl', (request, env) => protectedRoute(request, env, () => handleUnfurlRequest(request)))
	.all('*', (request, env) => handleUnknownRequest(request, env.ASSETS))

export default {
	fetch: router.fetch,
}
