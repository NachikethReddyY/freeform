import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { connectWboard } from '../../mcp/client'

// Pi has no native MCP transport. This project extension exposes only our local board tools.
export default function wboard(pi: ExtensionAPI) {
	let connection: ReturnType<typeof connectWboard> | undefined
	const connect = () => connection ??= connectWboard().catch((error) => { connection = undefined; throw error })
	const allowed = new Set(['read_board', 'propose_diagram', 'propose_sql_erd', 'propose_openapi_map', 'list_proposals'])
	const registered = new Set<string>()

	pi.on('session_start', async (_event, context) => {
		try {
			const client = await connect()
			const { tools } = await client.listTools()
			for (const tool of tools) {
				if (!allowed.has(tool.name) || registered.has(tool.name)) continue
				pi.registerTool({
					name: `wboard_${tool.name}`,
					label: `Whiteboard: ${tool.name.replaceAll('_', ' ')}`,
					description: tool.description ?? tool.name,
					// The advertised JSON schema comes from MCP; the server validates every call.
					parameters: Type.Unsafe<Record<string, unknown>>(tool.inputSchema),
					async execute(_callId, params, signal) {
						const connected = await connect()
						const response = CallToolResultSchema.parse(await connected.callTool({ name: tool.name, arguments: params }, undefined, { signal, timeout: 20_000 }))
						const content = response.content.filter((item) => item.type === 'text')
						if (response.isError) throw new Error(content.map((item) => item.text).join('\n'))
						return { content, details: response.structuredContent ?? {} }
					},
				})
				registered.add(tool.name)
			}
		} catch (error) { context.ui.notify(error instanceof Error ? error.message : 'Whiteboard connection failed', 'error') }
	})

	pi.registerCommand('wboard-check', {
		description: 'Check local whiteboard MCP without calling a model: /wboard-check [roomId]',
		handler: async (args, context) => {
			try {
				const client = await connect()
				const { tools } = await client.listTools()
				const response = CallToolResultSchema.parse(await client.callTool({ name: 'read_board', arguments: { roomId: args.trim() || 'mcp-check', limit: 1 } }))
				if (response.isError) throw new Error(response.content.filter((item) => item.type === 'text').map((item) => item.text).join('\n'))
				context.ui.notify(`Whiteboard MCP ready: ${tools.length} tools; local board API responds. No model called.`, 'info')
			} catch (error) { context.ui.notify(error instanceof Error ? error.message : 'Whiteboard check failed', 'error') }
		},
	})

	pi.on('session_shutdown', async () => {
		const pending = connection
		connection = undefined
		if (pending) await (await pending.catch(() => null))?.close()
	})
}
