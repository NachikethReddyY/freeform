export interface AuthSession {
	authenticated: boolean
	setupRequired: boolean
	owner: { id: string } | null
}

export class AuthRequestError extends Error {
	constructor(message: string, readonly status: number) {
		super(message)
		this.name = 'AuthRequestError'
	}
}

const sessionFetch: RequestInit = { credentials: 'same-origin', cache: 'no-store' }

async function requestSession(path: string, init: RequestInit, fetcher: typeof fetch): Promise<AuthSession> {
	let response: Response
	try {
		response = await fetcher(path, { ...sessionFetch, ...init })
	} catch {
		throw new AuthRequestError('Could not connect to FreeForm. Check the local server and try again.', 0)
	}

	const body: unknown = await response.json().catch(() => null)
	if (!response.ok) {
		const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
			? body.error
			: 'This request could not be completed. Try again.'
		throw new AuthRequestError(message, response.status)
	}
	if (!body || typeof body !== 'object' || !('authenticated' in body) || typeof body.authenticated !== 'boolean'
		|| !('setupRequired' in body) || typeof body.setupRequired !== 'boolean'
		|| !('owner' in body) || (body.owner !== null && (typeof body.owner !== 'object' || !('id' in body.owner) || typeof body.owner.id !== 'string'))) {
		throw new AuthRequestError('FreeForm returned an unexpected account response.', response.status)
	}
	return body as AuthSession
}

export function getSession(fetcher: typeof fetch = fetch): Promise<AuthSession> {
	return requestSession('/api/me', { method: 'GET' }, fetcher)
}

function postSession(path: string, body: object | undefined, fetcher: typeof fetch): Promise<AuthSession> {
	return requestSession(path, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body ?? {}),
	}, fetcher)
}

export function register(password: string, fetcher: typeof fetch = fetch): Promise<AuthSession> {
	return postSession('/api/register', { password, claimExistingBoards: true }, fetcher)
}

export function login(password: string, fetcher: typeof fetch = fetch): Promise<AuthSession> {
	return postSession('/api/login', { password }, fetcher)
}

export function logout(fetcher: typeof fetch = fetch): Promise<AuthSession> {
	return postSession('/api/logout', undefined, fetcher)
}

export function validateSetup(password: string, confirmPassword: string, claimExistingBoards: boolean): string | null {
	if (password.length < 12) return 'Use at least 12 characters for your password.'
	if (password.length > 256) return 'Use no more than 256 characters for your password.'
	if (password !== confirmPassword) return 'Passwords do not match.'
	if (!claimExistingBoards) return 'Confirm that this account will keep the existing local boards.'
	return null
}
