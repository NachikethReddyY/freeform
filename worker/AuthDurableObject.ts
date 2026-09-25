import { DurableObject } from 'cloudflare:workers'
import {
	AuthError,
	OwnerAuthService,
	assertLocalAuthRequest,
	authErrorResponse,
	getSessionCookie,
	parseSessionCookie,
	type AuthKv,
	type AuthStore,
} from './auth'

const jsonHeaders = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' }

async function readJson(request: Request): Promise<Record<string, unknown>> {
	if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new AuthError(415, 'Use application/json')
	const declared = Number(request.headers.get('content-length') ?? 0)
	if (declared > 2048) throw new AuthError(413, 'Request is too large')
	if (!request.body) throw new AuthError(400, 'Missing request body')
	const reader = request.body.getReader()
	const chunks: Uint8Array[] = []
	let length = 0
	try {
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			length += value.byteLength
			if (length > 2048) { await reader.cancel(); throw new AuthError(413, 'Request is too large') }
			chunks.push(value)
		}
	} finally { reader.releaseLock() }
	const bytes = new Uint8Array(length)
	let offset = 0
	for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
	let value: unknown
	try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
	catch { throw new AuthError(400, 'Invalid JSON') }
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuthError(400, 'Expected a JSON object')
	return value as Record<string, unknown>
}

export class AuthDurableObject extends DurableObject {
	private readonly service: OwnerAuthService

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env)
		const storage = ctx.storage
		const adapt = (source: DurableObjectStorage | DurableObjectTransaction): AuthKv => ({
			get: <T>(key: string) => source.get<T>(key),
			put: (key: string, value: unknown) => source.put(key, value),
			delete: (key: string) => source.delete(key),
			list: <T>(prefix: string) => source.list<T>({ prefix }),
		})
		const store: AuthStore = {
			...adapt(storage),
			transaction: <T>(fn: (tx: AuthKv) => Promise<T>) => storage.transaction((tx) => fn(adapt(tx))),
		}
		this.service = new OwnerAuthService(store)
	}

	async fetch(request: Request): Promise<Response> {
		try {
			const path = new URL(request.url).pathname
			const token = parseSessionCookie(request.headers.get('cookie'))
			if (path === '/internal/authorize') {
				const authorization = request.headers.get('authorization')
				const bearer = authorization?.replace(/^Bearer\s+/i, '')
				const authorized = authorization
					? request.headers.get('x-freeform-scope') === 'board' && await this.service.verifyMcpToken(bearer)
					: (await this.service.me(token)).authenticated
				return Response.json({ authorized }, { status: authorized ? 200 : 401, headers: jsonHeaders })
			}
			if (path === '/internal/session-hash') {
				const authorized = await this.service.verifySessionHash(request.headers.get('x-freeform-session-hash') ?? '')
				return Response.json({ authorized }, { status: authorized ? 200 : 401, headers: jsonHeaders })
			}
			assertLocalAuthRequest(request)
			if (path === '/api/me' && request.method === 'GET') return Response.json(await this.service.me(token), { headers: jsonHeaders })
			if (path === '/api/register' && request.method === 'POST') {
				const input = await readJson(request)
				if (typeof input.password !== 'string') throw new AuthError(400, 'Enter a password')
				const result = await this.service.register(input.password, input.claimExistingBoards === true)
				return Response.json(result.state, { headers: { ...jsonHeaders, 'Set-Cookie': getSessionCookie(result.token, new URL(request.url).origin) } })
			}
			if (path === '/api/login' && request.method === 'POST') {
				const input = await readJson(request)
				if (typeof input.password !== 'string') throw new AuthError(400, 'Enter a password')
				const result = await this.service.login(input.password)
				return Response.json(result.state, { headers: { ...jsonHeaders, 'Set-Cookie': getSessionCookie(result.token, new URL(request.url).origin) } })
			}
			if (path === '/api/logout' && request.method === 'POST') {
				await this.service.logout(token)
				return Response.json({ authenticated: false, setupRequired: false, owner: null }, { headers: { ...jsonHeaders, 'Set-Cookie': getSessionCookie(null, new URL(request.url).origin) } })
			}
			if (path === '/api/mcp/tokens') {
				if (request.method === 'GET') return Response.json(await this.service.listMcpTokens(token), { headers: jsonHeaders })
				if (request.method === 'POST') return Response.json(await this.service.createMcpToken(token), { status: 201, headers: jsonHeaders })
				if (request.method === 'DELETE') {
					const input = await readJson(request)
					return Response.json(await this.service.revokeMcpToken(token, String(input.id ?? '')), { headers: jsonHeaders })
				}
			}
			return Response.json({ error: 'Not found' }, { status: 404, headers: jsonHeaders })
		} catch (cause) { return authErrorResponse(cause) }
	}
}
