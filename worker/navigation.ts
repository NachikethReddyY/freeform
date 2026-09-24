type AssetHandler = { fetch(url: string): Promise<Response> }

export function handleUnknownRequest(request: Request, assets: AssetHandler): Promise<Response> | Response {
	const path = new URL(request.url).pathname
	// The client has a dashboard and one board route. Keep API, MCP, and missing files as real 404s.
	if ((request.method === 'GET' || request.method === 'HEAD') && (path === '/' || /^\/(?!api$|mcp$)[a-zA-Z0-9_-]{1,128}$/.test(path))) {
		return assets.fetch(request.url)
	}
	return new Response('Not found', { status: 404 })
}
