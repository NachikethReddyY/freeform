import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { renderPlaintextFromRichText, useEditor, useValue, type Editor, type TLPageId, type TLShape } from 'tldraw'
import type { Diagram } from '../../../shared/diagram'
import { DiagramPreview } from '../diagrams/DiagramPreview'
import { applyNativeDiagram } from '../diagrams/native'
import { buildChatMessages, draftAfterSuccessfulReply, parseAiReply, type AiMessage } from './aiChatModel'
import './aiChat.css'

type Provider = 'ollama' | 'openai-compatible'
type Mode = 'chat' | 'diagram'
interface SavedSettings { provider: Provider; baseUrl: string; model: string }
interface Turn { role: 'user' | 'assistant'; content: string; diagram?: Diagram; pageId?: TLPageId; warning?: string; added?: boolean }

const SETTINGS_KEY = 'freeform:ai:settings:v1'
const defaultSettings: SavedSettings = { provider: 'ollama', baseUrl: 'http://127.0.0.1:11434', model: '' }

function readSettings(): SavedSettings {
	try {
		const value = JSON.parse(sessionStorage.getItem(SETTINGS_KEY) ?? 'null') as Partial<SavedSettings> | null
		if (value && (value.provider === 'ollama' || value.provider === 'openai-compatible') && typeof value.baseUrl === 'string' && typeof value.model === 'string') return value as SavedSettings
	} catch { /* The default stays usable if browser storage is unavailable. */ }
	return defaultSettings
}

function compactPageContext(editor: Editor, shapes: readonly TLShape[], pageName: string) {
	const content = shapes.slice(0, 32).map((shape) => {
		let text = ''
		if (shape.type === 'text' || shape.type === 'geo' || shape.type === 'note' || shape.type === 'arrow') {
			text = renderPlaintextFromRichText(editor, shape.props.richText).slice(0, 180)
		}
		return { type: shape.type, x: Math.round(shape.x), y: Math.round(shape.y), ...(text ? { text } : {}) }
	})
	return { page: pageName.slice(0, 100), totalShapes: shapes.length, shapes: content }
}

async function postAi(path: string, body: unknown, signal: AbortSignal): Promise<unknown> {
	const response = await fetch(path, {
		method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
		signal: AbortSignal.any([signal, AbortSignal.timeout(50_000)]),
	})
	const value: unknown = await response.json()
	if (!response.ok) {
		const error = value && typeof value === 'object' && 'error' in value && typeof value.error === 'string' ? value.error : `AI request failed (${response.status})`
		throw new Error(error)
	}
	return value
}

export function AIChatPanel() {
	const editor = useEditor()
	const darkMode = useValue('AI chat theme', () => editor.user.getIsDarkMode(), [editor])
	const modelListId = useId()
	const [open, setOpen] = useState(false)
	const [settings, setSettings] = useState(readSettings)
	const [apiKey, setApiKey] = useState('')
	const [models, setModels] = useState<string[]>([])
	const [mode, setMode] = useState<Mode>('chat')
	const [includeBoard, setIncludeBoard] = useState(false)
	const [prompt, setPrompt] = useState('')
	const [turns, setTurns] = useState<Turn[]>([])
	const [busy, setBusy] = useState<'models' | 'message' | null>(null)
	const [error, setError] = useState('')
	const [notice, setNotice] = useState('')
	const [settingsOpen, setSettingsOpen] = useState(!settings.model)
	const controller = useRef<AbortController | null>(null)
	const promptRef = useRef<HTMLTextAreaElement>(null)
	const endRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		try { sessionStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* Session storage is optional. */ }
	}, [settings])
	useEffect(() => { if (open) promptRef.current?.focus() }, [open])
	useEffect(() => { if (open) endRef.current?.scrollIntoView({ block: 'end' }) }, [turns, open, busy])
	useEffect(() => () => controller.current?.abort(), [])

	const updateSettings = (patch: Partial<SavedSettings>) => setSettings((previous) => ({ ...previous, ...patch }))
	const connection = { provider: settings.provider, baseUrl: settings.baseUrl.trim(), ...(settings.provider === 'openai-compatible' && apiKey ? { apiKey } : {}) }
	const stop = () => { controller.current?.abort(); controller.current = null; setBusy(null) }

	const loadModels = async () => {
		if (busy) return
		const task = new AbortController(); controller.current = task; setBusy('models'); setError('')
		try {
			const value = await postAi('/api/ai/models', connection, task.signal)
			const listed = value && typeof value === 'object' && 'models' in value && Array.isArray(value.models)
				? value.models.flatMap((entry) => entry && typeof entry === 'object' && 'id' in entry && typeof entry.id === 'string' ? [entry.id] : []) as string[] : []
			if (!task.signal.aborted) {
				setModels(listed)
				if (!settings.model && listed.length === 1) updateSettings({ model: listed[0] })
				if (!listed.length) setError('No models were returned. Enter a model name or check the endpoint.')
			}
		} catch (cause) { if (!task.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not list models.') }
		finally { if (controller.current === task) { controller.current = null; setBusy(null) } }
	}

	const send = async () => {
		if (busy) return
		if (!settings.model.trim()) { setSettingsOpen(true); setError('Choose or enter a model first.'); return }
		const submittedPrompt = prompt
		const pageId = editor.getCurrentPageId()
		const boardContext = includeBoard ? compactPageContext(editor, editor.getCurrentPageShapes(), editor.getCurrentPage().name) : undefined
		let messages: AiMessage[]
		try { messages = buildChatMessages(turns.map(({ role, content }) => ({ role, content })), submittedPrompt, boardContext) }
		catch (cause) { setError(cause instanceof Error ? cause.message : 'Enter a message.'); return }
		const task = new AbortController(); controller.current = task; setBusy('message'); setError(''); setNotice('')
		try {
			const reply = parseAiReply(await postAi('/api/ai/chat', { ...connection, model: settings.model.trim(), messages, mode }, task.signal))
			if (task.signal.aborted) return
			setTurns((previous) => [...previous, { role: 'user', content: submittedPrompt.trim() }, { role: 'assistant', content: reply.content, diagram: reply.diagram, pageId, warning: reply.warning }])
			setPrompt((current) => draftAfterSuccessfulReply(current, submittedPrompt))
		} catch (cause) { if (!task.signal.aborted) setError(cause instanceof Error ? cause.message : 'AI request failed. Retry with your message preserved.') }
		finally { if (controller.current === task) { controller.current = null; setBusy(null) } }
	}

	const addDiagram = (diagram: Diagram, pageId: TLPageId, turnIndex: number) => {
		try {
			applyNativeDiagram(editor, diagram, crypto.randomUUID(), pageId, true)
			setTurns((previous) => previous.map((turn, index) => index === turnIndex ? { ...turn, added: true } : turn))
			setNotice('Diagram added. Undo removes it.'); setError('')
		} catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add the diagram.') }
	}

	return <div className="freeform-ai" onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
		<button type="button" className="freeform-ai-trigger" aria-label="AI chat" title="AI chat" aria-expanded={open} aria-controls="freeform-ai-panel" onClick={() => setOpen((wasOpen) => !wasOpen)}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-5 3v-13.5Z" /><path d="M8 9h8M8 12h5" /></svg>
		</button>
		{open && createPortal(<aside id="freeform-ai-panel" className={`freeform-ai-panel tl-theme__${darkMode ? 'dark' : 'light'}`} aria-label="AI chat" onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
			<header><h2>AI chat</h2><button type="button" aria-label="Close AI chat" title="Close" onClick={() => setOpen(false)}>×</button></header>
			<details open={settingsOpen} onToggle={(event) => setSettingsOpen(event.currentTarget.open)} className="freeform-ai-settings">
				<summary>{settings.model || 'Connect a model'}</summary>
				<div className="freeform-ai-settings-fields">
					<label>Provider<select value={settings.provider} onChange={(event) => {
						const provider = event.target.value as Provider
						updateSettings({ provider, baseUrl: provider === 'ollama' ? 'http://127.0.0.1:11434' : 'https://api.openai.com/v1', model: '' }); setModels([]); setApiKey('')
					}}><option value="ollama">Ollama (local)</option><option value="openai-compatible">OpenAI compatible</option></select></label>
					<label>Endpoint<input type="url" value={settings.baseUrl} spellCheck={false} onChange={(event) => { updateSettings({ baseUrl: event.target.value }); setModels([]); setApiKey('') }} /></label>
					{settings.provider !== 'ollama' && <label>API key <span>kept in this tab only</span><input type="password" value={apiKey} autoComplete="off" spellCheck={false} onChange={(event) => setApiKey(event.target.value)} /></label>}
					<div className="freeform-ai-model-line"><label>Model<input list={modelListId} value={settings.model} spellCheck={false} onChange={(event) => updateSettings({ model: event.target.value })} placeholder="Choose or type a model" /></label><datalist id={modelListId}>{models.map((model) => <option key={model} value={model} />)}</datalist><button type="button" disabled={busy !== null} onClick={() => void loadModels()}>Load models</button></div>
				</div>
			</details>
			<div className="freeform-ai-modes" role="group" aria-label="AI mode"><button type="button" aria-pressed={mode === 'chat'} onClick={() => setMode('chat')}>Ask</button><button type="button" aria-pressed={mode === 'diagram'} onClick={() => setMode('diagram')}>Draw</button></div>
			<div className="freeform-ai-turns" role="log" aria-live="polite">
				{turns.length === 0 && <p className="freeform-ai-empty">Ask a question or describe a diagram. Draw returns a preview you can add to the board.</p>}
				{turns.map((turn, index) => <article key={index} className={`freeform-ai-turn freeform-ai-turn--${turn.role}`}><span>{turn.role === 'user' ? 'You' : settings.model}</span>{turn.content && <p>{turn.content}</p>}{turn.warning && <p className="freeform-ai-warning">{turn.warning}</p>}{turn.diagram && <div className="freeform-ai-diagram"><DiagramPreview diagram={turn.diagram} /><div><strong>{turn.diagram.title}</strong><small>{turn.diagram.nodes.length} nodes · {turn.diagram.edges.length} arrows</small></div><button type="button" disabled={turn.added || turn.pageId !== editor.getCurrentPageId()} onClick={() => addDiagram(turn.diagram!, turn.pageId!, index)}>{turn.added ? 'Added' : 'Add to board'}</button>{turn.pageId !== editor.getCurrentPageId() && <small>Return to the original page to add this diagram.</small>}</div>}</article>)}
				{busy === 'message' && <p className="freeform-ai-pending" role="status">Waiting for {settings.model}…</p>}
				<div ref={endRef} />
			</div>
			{error && <p className="freeform-ai-error" role="alert">{error}</p>}{notice && <p className="freeform-ai-notice" role="status">{notice}</p>}
			<form onSubmit={(event) => { event.preventDefault(); void send() }} className="freeform-ai-compose">
				<label><input type="checkbox" checked={includeBoard} onChange={(event) => setIncludeBoard(event.target.checked)} /> Include current page in request</label>
				<textarea ref={promptRef} aria-label="Message to AI" placeholder={mode === 'diagram' ? 'Describe the diagram or paste code…' : 'Ask about your idea…'} maxLength={4000} rows={3} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} />
				<div>{busy === 'message' ? <button type="button" onClick={stop}>Stop</button> : <button type="submit" disabled={busy !== null || !prompt.trim()}>{mode === 'diagram' ? 'Create preview' : 'Send'}</button>}</div>
			</form>
		</aside>, editor.getContainer())}
	</div>
}
