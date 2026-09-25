import type { ReactNode } from 'react'
import type { AuthSession } from './authClient'

export type AuthStatus =
	| { kind: 'loading' }
	| { kind: 'setup' }
	| { kind: 'signed-out' }
	| { kind: 'signed-in'; ownerId: string; verifying?: boolean }
	| { kind: 'error'; message: string }

export function statusFromSession(session: AuthSession): AuthStatus {
	if (session.authenticated && session.owner) return { kind: 'signed-in', ownerId: session.owner.id }
	return { kind: session.setupRequired ? 'setup' : 'signed-out' }
}

/** Keep the editor mounted, but hide and disable cached content until the cookie is checked. */
export function beginSessionRecheck(status: AuthStatus): AuthStatus {
	return status.kind === 'signed-in' ? { ...status, verifying: true } : { kind: 'loading' }
}

export function completeSessionRecheck(status: AuthStatus, session: AuthSession): AuthStatus {
	const next = statusFromSession(session)
	return status.kind === 'signed-in' && next.kind === 'signed-in' && status.ownerId === next.ownerId && !status.verifying
		? status
		: next
}

export function AuthenticatedWorkspace({ checking, children }: { checking: boolean; children: ReactNode }) {
	return <>
		<div style={{ display: 'contents', visibility: checking ? 'hidden' : 'visible' }} aria-hidden={checking} inert={checking}>
			{children}
		</div>
		{checking && <main className="freeform-auth-page" style={{ zIndex: 10000 }}><span className="freeform-auth-loading" role="status">Opening FreeForm…</span></main>}
	</>
}
