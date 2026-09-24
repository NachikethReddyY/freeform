import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { localBaseUrl } from './api'

export async function connectWboard() {
	const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
	const client = new Client({ name: 'wboard-local-client', version: '1.0.0' })
	const transport = new StdioClientTransport({
		command: process.execPath,
		args: ['--import', 'tsx', resolve(root, 'mcp/server.ts')],
		cwd: root,
		env: { ...getDefaultEnvironment(), WBOARD_URL: localBaseUrl().origin },
		stderr: 'inherit',
	})
	await client.connect(transport, { timeout: 10_000 })
	return client
}
