import { handleUnfurlRequest } from 'cloudflare-workers-unfurl'
import { AutoRouter, error, IRequest } from 'itty-router'
import { handleAssetDownload, handleAssetUpload } from './assetUploads'
import { RoomIdSchema } from '../shared/diagram'
import { checkLocalDiagramRequest, diagramErrorResponse } from './diagramProposals'
import { handleUnknownRequest } from './navigation'

// make sure our sync durable object is made available to cloudflare
export { TldrawDurableObject } from './TldrawDurableObject'

// we use itty-router (https://itty.dev/) to handle routing. in this example we turn on CORS because
// we're hosting the worker separately to the client. you should restrict this to your own domain.
const router = AutoRouter<IRequest, [env: Env, ctx: ExecutionContext]>({
	catch: (e) => {
		console.error(e)
		return error(e)
	},
})
	// Personal diagram tools use the same room authority, while proposals stay outside its document.
	.all('/api/rooms/:roomId/*', async (request, env) => {
		try {
			checkLocalDiagramRequest(request)
			const roomId = RoomIdSchema.parse(request.params.roomId)
			const id = env.TLDRAW_DURABLE_OBJECT.idFromName(roomId)
			return await env.TLDRAW_DURABLE_OBJECT.get(id).fetch(request.url, {
				method: request.method,
				headers: request.headers,
				body: request.body,
			})
		} catch (cause) { return diagramErrorResponse(cause) }
	})
	// requests to /connect are routed to the Durable Object, and handle realtime websocket syncing
	.get('/api/connect/:roomId', (request, env) => {
		const id = env.TLDRAW_DURABLE_OBJECT.idFromName(request.params.roomId)
		const room = env.TLDRAW_DURABLE_OBJECT.get(id)
		return room.fetch(request.url, { headers: request.headers, body: request.body })
	})

	// assets can be uploaded to the bucket under /uploads:
	.post('/api/uploads/:uploadId', handleAssetUpload)

	// they can be retrieved from the bucket too:
	.get('/api/uploads/:uploadId', handleAssetDownload)

	// bookmarks need to extract metadata from pasted URLs:
	.get('/api/unfurl', handleUnfurlRequest)
	.all('*', (request, env) => handleUnknownRequest(request, env.ASSETS))

export default {
	fetch: router.fetch,
}
