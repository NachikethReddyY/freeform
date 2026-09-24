export const DEFAULT_WBOARD_URL = 'http://localhost:5173'

export function localBaseUrl(value = process.env.WBOARD_URL ?? DEFAULT_WBOARD_URL): URL {
	const url = new URL(value)
	if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
		throw new Error('WBOARD_URL must be an HTTP loopback origin, for example http://127.0.0.1:5173')
	}
	return url
}

export async function requestBoardApi(path: string, options: RequestInit = {}, base = localBaseUrl()): Promise<Record<string, unknown>> {
	if (!path.startsWith('/api/rooms/')) throw new Error('Only local whiteboard room routes are supported')
	const response = await fetch(new URL(path, base), {
		...options,
		redirect: 'error',
		headers: { 'Content-Type': 'application/json', ...options.headers },
		signal: AbortSignal.any([AbortSignal.timeout(15_000), ...(options.signal ? [options.signal] : [])]),
	})
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
