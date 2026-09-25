import { createContext, FormEvent, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getSession, login, logout, register, validateSetup } from './authClient'
import { createAuthTabSync, type AuthTabSync } from './authTabSync'
import { AuthenticatedWorkspace, beginSessionRecheck, completeSessionRecheck, statusFromSession, type AuthStatus } from './authGateState'
import './auth.css'

interface AuthContextValue {
	status: AuthStatus
	refresh(): Promise<void>
	register(password: string): Promise<void>
	login(password: string): Promise<void>
	logout(): Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
	const [status, setStatus] = useState<AuthStatus>({ kind: 'loading' })
	const requestVersion = useRef(0)
	const tabSync = useRef<AuthTabSync | null>(null)

	useEffect(() => {
		let active = true
		const version = ++requestVersion.current
		void getSession().then(
			(session) => { if (active && requestVersion.current === version) setStatus(statusFromSession(session)) },
			(error: unknown) => { if (active && requestVersion.current === version) setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Could not load your account.' }) },
		)
		return () => { active = false }
	}, [])

	const refresh = useCallback(async () => {
		const version = ++requestVersion.current
		setStatus({ kind: 'loading' })
		try {
			const session = await getSession()
			if (requestVersion.current === version) setStatus(statusFromSession(session))
		} catch (error) {
			if (requestVersion.current === version) setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Could not load your account.' })
		}
	}, [])

	useEffect(() => {
		const sync = createAuthTabSync(
			() => {
				requestVersion.current++
				setStatus({ kind: 'signed-out' })
			},
			() => {
				const version = ++requestVersion.current
				// Retain the mounted editor so an active presentation and its remote
				// survive a successful recheck. AuthGate hides and inerts it meanwhile.
				setStatus(beginSessionRecheck)
				void getSession().then(
					(session) => {
						if (requestVersion.current !== version) return
						setStatus((current) => completeSessionRecheck(current, session))
					},
					(error: unknown) => {
						if (requestVersion.current === version) setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Could not load your account.' })
					},
				)
			},
		)
		tabSync.current = sync
		return () => {
			sync.close()
			if (tabSync.current === sync) tabSync.current = null
		}
	}, [])
	const registerOwner = useCallback(async (password: string) => {
		const session = await register(password)
		requestVersion.current++
		setStatus(statusFromSession(session))
	}, [])
	const loginOwner = useCallback(async (password: string) => {
		const session = await login(password)
		requestVersion.current++
		setStatus(statusFromSession(session))
	}, [])
	const logoutOwner = useCallback(async () => {
		const session = await logout()
		requestVersion.current++
		setStatus(statusFromSession(session))
		tabSync.current?.broadcastSignOut()
	}, [])
	const value = useMemo<AuthContextValue>(() => ({
		status,
		refresh,
		register: registerOwner,
		login: loginOwner,
		logout: logoutOwner,
	}), [status, refresh, registerOwner, loginOwner, logoutOwner])

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
	const auth = useContext(AuthContext)
	if (!auth) throw new Error('AuthProvider is missing')
	return auth
}

function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
	return <svg viewBox="0 0 20 20" aria-hidden="true">
		<path d="M2.3 10s2.8-4.6 7.7-4.6 7.7 4.6 7.7 4.6-2.8 4.6-7.7 4.6S2.3 10 2.3 10Z" />
		<circle cx="10" cy="10" r="2.4" />
		{!visible && <path d="M3 17 17 3" />}
	</svg>
}

function AuthForm({ setup }: { setup: boolean }) {
	const { register: registerOwner, login: loginOwner } = useAuth()
	const [password, setPassword] = useState('')
	const [confirmPassword, setConfirmPassword] = useState('')
	const [claimExistingBoards, setClaimExistingBoards] = useState(false)
	const [showPassword, setShowPassword] = useState(false)
	const [pending, setPending] = useState(false)
	const [error, setError] = useState('')
	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		if (pending) return
		if (setup) {
			const validationError = validateSetup(password, confirmPassword, claimExistingBoards)
			if (validationError) { setError(validationError); return }
		}
		setPending(true)
		setError('')
		try {
			if (setup) await registerOwner(password)
			else await loginOwner(password)
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Please try again.')
		} finally {
			setPending(false)
		}
	}
	return <main className="freeform-auth-page">
		<div className="freeform-auth-card">
			<div className="freeform-auth-brand"><img src="/freeform-logo.svg" alt="" /><span>FreeForm</span></div>
			<h1>{setup ? 'Set up your workspace' : 'Welcome back'}</h1>
			<p className="freeform-auth-intro">{setup ? 'Create a password for this local workspace.' : 'Sign in to open your boards.'}</p>
			<form onSubmit={(event) => void submit(event)} noValidate>
				<label htmlFor="freeform-auth-password">Password</label>
				<div className="freeform-auth-password-field">
					<input id="freeform-auth-password" autoFocus required type={showPassword ? 'text' : 'password'} autoComplete={setup ? 'new-password' : 'current-password'} minLength={setup ? 12 : undefined} maxLength={256} value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} aria-invalid={Boolean(error)} aria-describedby={error ? 'freeform-auth-error' : undefined} />
					<button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((shown) => !shown)}><PasswordVisibilityIcon visible={showPassword} /></button>
				</div>
				{setup && <>
					<label htmlFor="freeform-auth-confirm">Confirm password</label>
					<input id="freeform-auth-confirm" required type={showPassword ? 'text' : 'password'} autoComplete="new-password" maxLength={256} value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setError('') }} aria-invalid={Boolean(error)} aria-describedby={error ? 'freeform-auth-error' : undefined} />
					<label className="freeform-auth-claim" htmlFor="freeform-auth-claim">
						<input id="freeform-auth-claim" type="checkbox" checked={claimExistingBoards} onChange={(event) => { setClaimExistingBoards(event.target.checked); setError('') }} />
						<span>Keep existing boards in this workspace</span>
					</label>
				</>}
				{error && <p id="freeform-auth-error" className="freeform-auth-error" role="alert">{error}</p>}
				<button className="freeform-auth-submit" type="submit" disabled={pending}>{pending ? 'Please wait…' : setup ? 'Create account' : 'Sign in'}</button>
			</form>
		</div>
	</main>
}

export function AuthGate({ children }: { children: ReactNode }) {
	const { status, refresh } = useAuth()
	if (status.kind === 'loading') return <main className="freeform-auth-page"><span className="freeform-auth-loading" role="status">Opening FreeForm…</span></main>
	if (status.kind === 'error') return <main className="freeform-auth-page"><div className="freeform-auth-card"><h1>Could not open FreeForm</h1><p className="freeform-auth-error" role="alert">{status.message}</p><button className="freeform-auth-submit" type="button" onClick={() => void refresh()}>Try again</button></div></main>
	if (status.kind === 'setup') return <AuthForm setup />
	if (status.kind === 'signed-out') return <AuthForm setup={false} />
	return <AuthenticatedWorkspace key={status.ownerId} checking={Boolean(status.verifying)}>{children}</AuthenticatedWorkspace>
}
