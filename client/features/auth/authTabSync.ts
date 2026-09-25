const AUTH_CHANNEL = 'freeform:auth:v1'

export interface AuthTabSync {
	broadcastSignOut(): void
	close(): void
}

/** Keep open boards behind the sign-in gate when another tab signs out. */
export function createAuthTabSync(
	onSignOut: () => void,
	onFocus: () => void,
	options: { channelName?: string; focusTarget?: EventTarget | null } = {},
): AuthTabSync {
	const channel = typeof BroadcastChannel === 'undefined'
		? null
		: new BroadcastChannel(options.channelName ?? AUTH_CHANNEL)
	const focusTarget = options.focusTarget === undefined
		? (typeof window === 'undefined' ? null : window)
		: options.focusTarget
	const onMessage = (event: MessageEvent) => {
		if (event.data?.kind === 'signed-out') onSignOut()
	}
	channel?.addEventListener('message', onMessage)
	focusTarget?.addEventListener('focus', onFocus)

	return {
		broadcastSignOut: () => channel?.postMessage({ kind: 'signed-out' }),
		close: () => {
			channel?.removeEventListener('message', onMessage)
			channel?.close()
			focusTarget?.removeEventListener('focus', onFocus)
		},
	}
}
