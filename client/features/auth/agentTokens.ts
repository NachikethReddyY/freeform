import { AuthRequestError } from './authClient'

export interface AgentTokenRecord {
	id: string
	createdAt: number
}

export interface CreatedAgentToken extends AgentTokenRecord {
	token: string
}

async function request<T>(method: 'GET' | 'POST' | 'DELETE', body: object | undefined, fetcher: typeof fetch): Promise<T> {
	let response: Response
	try {
		response = await fetcher('/api/mcp/tokens', {
			method,
			credentials: 'same-origin',
			cache: 'no-store',
			...(method === 'GET' ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) }),
		})
	} catch {
		throw new AuthRequestError('Could not connect to FreeForm. Try again.', 0)
	}
	const result: unknown = await response.json().catch(() => null)
	if (!response.ok) {
		const message = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
			? result.error
			: 'This request could not be completed.'
		throw new AuthRequestError(message, response.status)
	}
	return result as T
}

export async function listAgentTokens(fetcher: typeof fetch = fetch): Promise<AgentTokenRecord[]> {
	const result = await request<{ tokens: AgentTokenRecord[] }>('GET', undefined, fetcher)
	return Array.isArray(result?.tokens) ? result.tokens : []
}

export function createAgentToken(fetcher: typeof fetch = fetch): Promise<CreatedAgentToken> {
	return request<CreatedAgentToken>('POST', undefined, fetcher)
}

export function revokeAgentToken(id: string, fetcher: typeof fetch = fetch): Promise<{ revoked: true }> {
	return request<{ revoked: true }>('DELETE', { id }, fetcher)
}
