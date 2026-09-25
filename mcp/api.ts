import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DEFAULT_WBOARD_URL = 'http://localhost:5173'

const agentTokenPattern = /^ffm_[0-9a-f]{64}$/
const defaultTokenFile = () => join(homedir(), '.auth', 'freeform-mcp-token')

export function localBaseUrl(value = process.env.WBOARD_URL ?? DEFAULT_WBOARD_URL): URL {
	const url = new URL(value)
	if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
		throw new Error('WBOARD_URL must be an HTTP loopback origin, for example http://127.0.0.1:5173')
	}
	return url
}

function validateAgentToken(value: string, source: string): string {
	const token = value.trim()
	if (!agentTokenPattern.test(token)) throw new Error(`${source} must contain a FreeForm agent token from the dashboard`)
	return token
}

export async function loadAgentToken({ environment = process.env, tokenFile = defaultTokenFile() }: {
	environment?: NodeJS.ProcessEnv
	tokenFile?: string
} = {}): Promise<string> {
	if (environment.WBOARD_TOKEN !== undefined) return validateAgentToken(environment.WBOARD_TOKEN, 'WBOARD_TOKEN')
	let handle
	try {
		handle = await open(tokenFile, constants.O_RDONLY | constants.O_NOFOLLOW)
	} catch (cause) {
		if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ELOOP') {
			throw new Error('FreeForm agent token must be stored in a regular file, not a symbolic link')
		}
		if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ENOENT') {
			throw new Error('FreeForm agent token is missing. Create one in the dashboard, then set WBOARD_TOKEN or save it to ~/.auth/freeform-mcp-token with chmod 600')
		}
		throw cause
	}
	try {
		const details = await handle.stat()
		if (!details.isFile()) throw new Error('FreeForm agent token must be stored in a regular file')
		if ((details.mode & 0o777) !== 0o600) throw new Error('FreeForm agent token file must be private; run chmod 600 ~/.auth/freeform-mcp-token')
		if (details.size > 256) throw new Error('FreeForm agent token file is invalid')
		return validateAgentToken(await handle.readFile({ encoding: 'utf8' }), 'FreeForm agent token file')
	} finally {
		await handle.close()
	}
}

interface BoardApiDependencies {
	loadToken: () => Promise<string>
	fetcher: typeof fetch
}

export function createBoardApiRequester({ loadToken = loadAgentToken, fetcher = fetch }: Partial<BoardApiDependencies> = {}) {
	return async function requestBoardApi(path: string, options: RequestInit = {}, base = localBaseUrl()): Promise<Record<string, unknown>> {
		localBaseUrl(base.href)
		const url = new URL(path, base)
		if (!path.startsWith('/api/rooms/') || url.origin !== base.origin || !url.pathname.startsWith('/api/rooms/') || url.hash) {
			throw new Error('Only local whiteboard room routes are supported')
		}
		const headers = new Headers(options.headers)
		if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
		headers.set('Authorization', `Bearer ${await loadToken()}`)
		const response = await fetcher(url, {
			...options,
			redirect: 'error',
			headers,
			signal: AbortSignal.any([AbortSignal.timeout(15_000), ...(options.signal ? [options.signal] : [])]),
		})
		if (response.status === 401) throw new Error('FreeForm agent token was rejected or revoked. Create a new token in the dashboard and update WBOARD_TOKEN or ~/.auth/freeform-mcp-token')
		const text = await response.text()
		if (text.length > 2 * 1024 * 1024) throw new Error('Whiteboard response exceeded 2 MiB')
		let body: unknown
		try { body = JSON.parse(text) }
		catch { throw new Error(`Whiteboard returned a non-JSON response (${response.status}). Start pnpm dev first.`) }
		if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Whiteboard returned an invalid response')
		const result = body as Record<string, unknown>
		if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : `Whiteboard request failed (${response.status})`)
		return result
	}
}

export const requestBoardApi = createBoardApiRequester()
