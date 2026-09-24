import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { localBaseUrl } from './api'

// Explicit overrides also work for Codex subcommands that only read user-level MCP config.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const overrides = [
	`mcp_servers.wboard.command=${JSON.stringify(process.execPath)}`,
	`mcp_servers.wboard.args=${JSON.stringify(['--import', 'tsx', resolve(root, 'mcp/server.ts')])}`,
	`mcp_servers.wboard.cwd=${JSON.stringify(root)}`,
	`mcp_servers.wboard.env.WBOARD_URL=${JSON.stringify(localBaseUrl().origin)}`,
	'mcp_servers.wboard.startup_timeout_sec=20',
	'mcp_servers.wboard.tool_timeout_sec=20',
]
const child = spawn('codex', ['--cd', root, ...overrides.flatMap((value) => ['-c', value]), ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' })
child.on('error', (error) => { console.error(error.message); process.exitCode = 1 })
child.on('exit', (code) => { process.exitCode = code ?? 1 })
