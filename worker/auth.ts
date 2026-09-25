const COOKIE_NAME = 'freeform_session'
const SESSION_MS = 7 * 24 * 60 * 60 * 1000
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const ATTEMPT_LIMIT = 5
const PBKDF2_ITERATIONS = 210_000

type Owner = { salt: string; passwordHash: string; createdAt: number }
type Session = { expiresAt: number }
type Attempts = { count: number; expiresAt: number }
type McpToken = { hash: string; createdAt: number }

export type AuthState = {
	authenticated: boolean
	setupRequired: boolean
	owner: { id: 'local-owner' } | null
}

export interface AuthKv {
	get<T>(key: string): Promise<T | undefined>
	put(key: string, value: unknown): Promise<void>
	delete(key: string): Promise<boolean>
	list<T>(prefix: string): Promise<Map<string, T>>
}

export interface AuthStore extends AuthKv {
	transaction<T>(fn: (store: AuthKv) => Promise<T>): Promise<T>
}

export class AuthError extends Error {
	constructor(readonly status: number, message: string) { super(message) }
}

const ownerKey = 'auth:v1:owner'
const attemptKey = 'auth:v1:attempts'
const sessionKey = (hash: string) => `auth:v1:session:${hash}`
const mcpPrefix = 'auth:v1:mcp:'
const mcpKey = (id: string) => `${mcpPrefix}${id}`

const bytesToHex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
const hexToBytes = (value: string): Uint8Array => Uint8Array.from(value.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16))
const randomHex = (bytes: number): string => bytesToHex(crypto.getRandomValues(new Uint8Array(bytes)))

async function sha256(value: string): Promise<string> {
	return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
}

export async function hashSessionToken(token: string): Promise<string> {
	if (!isSessionToken(token)) throw new AuthError(400, 'Invalid owner session')
	return sha256(token)
}

async function passwordHash(password: string, salt: string): Promise<string> {
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
	const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(salt) as BufferSource, iterations: PBKDF2_ITERATIONS }, key, 256)
	return bytesToHex(new Uint8Array(bits))
}

function equalHex(left: string, right: string): boolean {
	if (left.length !== right.length) return false
	let difference = 0
	for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
	return difference === 0
}

function hasValidPassword(password: string): boolean {
	return password.length >= 12 && password.length <= 256 && new TextEncoder().encode(password).byteLength <= 1024
}

function isSessionToken(value: string | null | undefined): value is string {
	return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}

export function parseSessionCookie(cookie: string | null): string | null {
	if (!cookie) return null
	const match = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))
	const token = match?.slice(COOKIE_NAME.length + 1)
	return isSessionToken(token) ? token : null
}

export function getSessionCookie(token: string | null, origin: string): string {
	const secure = new URL(origin).protocol === 'https:' ? '; Secure' : ''
	return `${COOKIE_NAME}=${token ?? ''}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? SESSION_MS / 1000 : 0}${secure}`
}

export function assertLocalAuthRequest(request: Request, allowOriginlessMutation = false): void {
	const url = new URL(request.url)
	if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new AuthError(403, 'Authentication is available on loopback only')
	const expectedOrigin = `${url.protocol === 'ws:' ? 'http:' : url.protocol === 'wss:' ? 'https:' : url.protocol}//${url.host}`
	const origin = request.headers.get('origin')
	if (origin && origin !== expectedOrigin) throw new AuthError(403, 'Cross-origin requests are not allowed')
	if (request.headers.get('sec-fetch-site') === 'cross-site') throw new AuthError(403, 'Cross-site requests are not allowed')
	if (!['GET', 'HEAD'].includes(request.method) && origin !== expectedOrigin && !(allowOriginlessMutation && !origin)) throw new AuthError(403, 'A same-origin request is required')
}

export function authErrorResponse(cause: unknown): Response {
	const status = cause instanceof AuthError ? cause.status : 500
	if (!(cause instanceof AuthError)) console.error('Authentication request failed', cause instanceof Error ? cause.message : 'Unknown error')
	return Response.json({ error: cause instanceof AuthError ? cause.message : 'Authentication failed' }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export class OwnerAuthService {
	constructor(private readonly store: AuthStore) {}

	async me(token?: string | null, now = Date.now()): Promise<AuthState> {
		const owner = await this.store.get<Owner>(ownerKey)
		if (!owner) return { authenticated: false, setupRequired: true, owner: null }
		if (!isSessionToken(token)) return { authenticated: false, setupRequired: false, owner: null }
		const session = await this.store.get<Session>(sessionKey(await sha256(token)))
		return session && session.expiresAt > now
			? { authenticated: true, setupRequired: false, owner: { id: 'local-owner' } }
			: { authenticated: false, setupRequired: false, owner: null }
	}

	async register(password: string, claimExistingBoards: boolean, now = Date.now()): Promise<{ token: string; state: AuthState }> {
		if (!hasValidPassword(password)) throw new AuthError(400, 'Use a password with 12 to 256 characters')
		if (claimExistingBoards !== true) throw new AuthError(400, 'Confirm that this owner account claims existing local boards')
		const salt = randomHex(16)
		const hash = await passwordHash(password, salt)
		const token = randomHex(32)
		const tokenHash = await sha256(token)
		await this.store.transaction(async (store) => {
			if (await store.get<Owner>(ownerKey)) throw new AuthError(409, 'An owner account already exists')
			await store.put(ownerKey, { salt, passwordHash: hash, createdAt: now } satisfies Owner)
			await store.put(sessionKey(tokenHash), { expiresAt: now + SESSION_MS } satisfies Session)
		})
		return { token, state: { authenticated: true, setupRequired: false, owner: { id: 'local-owner' } } }
	}

	async login(password: string, now = Date.now()): Promise<{ token: string; state: AuthState }> {
		await this.store.transaction(async (store) => {
			const previous = await store.get<Attempts>(attemptKey)
			const current = previous && previous.expiresAt > now ? previous : { count: 0, expiresAt: now + ATTEMPT_WINDOW_MS }
			if (current.count >= ATTEMPT_LIMIT) throw new AuthError(429, 'Too many attempts. Try again in 15 minutes.')
			await store.put(attemptKey, { count: current.count + 1, expiresAt: current.expiresAt } satisfies Attempts)
		})
		const owner = await this.store.get<Owner>(ownerKey)
		const candidate = owner && typeof password === 'string' && password.length <= 256
			? await passwordHash(password, owner.salt) : ''
		if (!owner || !equalHex(candidate, owner.passwordHash)) {
			throw new AuthError(401, 'Invalid password')
		}
		const token = randomHex(32)
		await this.store.transaction(async (store) => {
			await store.delete(attemptKey)
			await store.put(sessionKey(await sha256(token)), { expiresAt: now + SESSION_MS } satisfies Session)
		})
		return { token, state: { authenticated: true, setupRequired: false, owner: { id: 'local-owner' } } }
	}

	async logout(token: string | null | undefined): Promise<void> {
		if (isSessionToken(token)) await this.store.delete(sessionKey(await sha256(token)))
	}

	async sessionHash(token: string): Promise<string> {
		return hashSessionToken(token)
	}

	async verifySessionHash(hash: string, now = Date.now()): Promise<boolean> {
		if (!/^[0-9a-f]{64}$/.test(hash) || !await this.store.get<Owner>(ownerKey)) return false
		const session = await this.store.get<Session>(sessionKey(hash))
		return Boolean(session && session.expiresAt > now)
	}

	private async requireOwner(token: string | null | undefined): Promise<void> {
		if (!(await this.me(token)).authenticated) throw new AuthError(401, 'Sign in to manage agent tokens')
	}

	async createMcpToken(ownerSession: string | null | undefined, now = Date.now()): Promise<{ id: string; token: string; createdAt: number }> {
		await this.requireOwner(ownerSession)
		const id = randomHex(8)
		const token = `ffm_${randomHex(32)}`
		await this.store.transaction(async (store) => {
			if ((await store.list<McpToken>(mcpPrefix)).size >= 8) throw new AuthError(429, 'Revoke an agent token before creating another')
			await store.put(mcpKey(id), { hash: await sha256(token), createdAt: now } satisfies McpToken)
		})
		return { id, token, createdAt: now }
	}

	async listMcpTokens(ownerSession: string | null | undefined): Promise<{ tokens: { id: string; createdAt: number }[] }> {
		await this.requireOwner(ownerSession)
		const entries = await this.store.list<McpToken>(mcpPrefix)
		return { tokens: [...entries].map(([key, value]) => ({ id: key.slice(mcpPrefix.length), createdAt: value.createdAt })).sort((left, right) => right.createdAt - left.createdAt) }
	}

	async revokeMcpToken(ownerSession: string | null | undefined, id: string): Promise<{ revoked: true }> {
		await this.requireOwner(ownerSession)
		if (!/^[0-9a-f]{16}$/.test(id)) throw new AuthError(400, 'Invalid agent token id')
		await this.store.delete(mcpKey(id))
		return { revoked: true }
	}

	async verifyMcpToken(token: string | null | undefined): Promise<boolean> {
		if (!token || !/^ffm_[0-9a-f]{64}$/.test(token) || !await this.store.get<Owner>(ownerKey)) return false
		const hash = await sha256(token)
		const entries = await this.store.list<McpToken>(mcpPrefix)
		return [...entries.values()].some((value) => equalHex(value.hash, hash))
	}
}
