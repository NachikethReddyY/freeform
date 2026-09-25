import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { localBaseUrl } from './api'

export function wboardChildEnvironment(defaults: Record<string, string>, origin: string, environment: NodeJS.ProcessEnv = process.env): Record<string, string> {
	return {
		...defaults,
		WBOARD_URL: origin,
		...(environment.WBOARD_TOKEN === undefined ? {} : { WBOARD_TOKEN: environment.WBOARD_TOKEN }),
	}
}

export async function connectWboard() {
	const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
	const client = new Client({ name: 'wboard-local-client', version: '1.0.0' })
	const transport = new StdioClientTransport({
		command: process.execPath,
		args: ['--import', 'tsx', resolve(root, 'mcp/server.ts')],
		cwd: root,
		env: wboardChildEnvironment(getDefaultEnvironment(), localBaseUrl().origin),
		stderr: 'inherit',
	})
	await client.connect(transport, { timeout: 10_000 })
	return client
}
