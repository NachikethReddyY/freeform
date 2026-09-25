import { useEffect, useState } from 'react'
import { createAgentToken, listAgentTokens, revokeAgentToken, type AgentTokenRecord, type CreatedAgentToken } from './agentTokens'
import { useAuth } from './AuthGate'

export function AccountTools() {
	const { logout } = useAuth()
	const [open, setOpen] = useState(false)
	const [tokens, setTokens] = useState<AgentTokenRecord[]>([])
	const [newToken, setNewToken] = useState<CreatedAgentToken | null>(null)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	const [copied, setCopied] = useState(false)

	useEffect(() => {
		if (!open) return
		let active = true
		void listAgentTokens().then(
			(value) => { if (active) setTokens(value) },
			(cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load agent tokens.') },
		)
		return () => { active = false }
	}, [open])

	const toggle = () => {
		setOpen((value) => !value)
		setNewToken(null)
		setCopied(false)
		setError('')
	}
	const create = async () => {
		setBusy(true)
		setError('')
		try {
			const created = await createAgentToken()
			setTokens((current) => [{ id: created.id, createdAt: created.createdAt }, ...current])
			setNewToken(created)
			setCopied(false)
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Could not create an agent token.')
		} finally {
			setBusy(false)
		}
	}
	const copy = async () => {
		if (!newToken) return
		try {
			await navigator.clipboard.writeText(newToken.token)
			setCopied(true)
		} catch {
			setError('Clipboard access is unavailable. Select and copy the token instead.')
		}
	}
	const revoke = async (id: string) => {
		setBusy(true)
		setError('')
		try {
			await revokeAgentToken(id)
			setTokens((current) => current.filter((token) => token.id !== id))
			if (newToken?.id === id) setNewToken(null)
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Could not revoke the token.')
		} finally {
			setBusy(false)
		}
	}
	const signOut = async () => {
		setBusy(true)
		setError('')
		try {
			await logout()
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Could not sign out.')
			setBusy(false)
		}
	}

	return <div className="board-dashboard-account">
		<button className="board-dashboard-account-toggle" type="button" aria-expanded={open} onClick={toggle}>
			<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.6a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2ZM4 17v-1.7a6 6 0 0 1 12 0V17H4Z" /></svg>
			<span>Account</span>
			<svg className="board-dashboard-account-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d={open ? 'm5 12 5-5 5 5' : 'm5 8 5 5 5-5'} /></svg>
		</button>
		{open && <div className="board-dashboard-account-menu">
			<div className="board-dashboard-agent-header"><span>Agent access</span><button type="button" title="Create agent token" aria-label="Create agent token" disabled={busy} onClick={() => void create()}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg></button></div>
			{newToken && <div className="board-dashboard-new-token">
				<p>Copy now. This token is shown once.</p>
				<div><input aria-label="New agent token" readOnly value={newToken.token} onFocus={(event) => event.currentTarget.select()} /><button type="button" aria-label="Copy agent token" title="Copy agent token" onClick={() => void copy()}><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6" y="5" width="10" height="12" rx="1" /><path d="M12.5 5V3H5a1 1 0 0 0-1 1v10h2" /></svg></button></div>
				{copied && <small role="status">Copied</small>}
			</div>}
			{tokens.length > 0 && <div className="board-dashboard-token-list" aria-label="Agent tokens">{tokens.map((token) => <div key={token.id} className="board-dashboard-token-row"><span title={token.id}>{token.id.slice(0, 12)}…</span><button type="button" disabled={busy} title="Revoke agent token" aria-label={`Revoke agent token ${token.id}`} onClick={() => void revoke(token.id)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5h12M7 5V3.5h6V5m-8 0 .7 11.5h8.6L15 5M8 8v5.5m4-5.5v5.5" /></svg></button></div>)}</div>}
			{tokens.length === 0 && <p className="board-dashboard-account-hint">No agent tokens yet.</p>}
			<button type="button" className="board-dashboard-signout" disabled={busy} onClick={() => void signOut()}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 3H4v14h4M12 6l4 4-4 4M6 10h10" /></svg><span>Sign out</span></button>
			{error && <p className="board-dashboard-account-error" role="alert">{error}</p>}
		</div>}
	</div>
}
