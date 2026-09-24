import {
	parseTldrawJsonFile,
	serializeTldrawJson,
	type Editor,
	type TLImageAsset,
	type TLImageExportOptions,
	type TLShapeId,
	type TLStoreSnapshot,
	type TLVideoAsset,
} from 'tldraw'
import { createLocalBoard, type BoardIndexStorage } from '../boards/boardIndex'

/** A native .tldr is JSON with tldraw's own schema and all document records. */
export const MAX_NATIVE_FILE_BYTES = 25 * 1024 * 1024
export const MAX_EMBEDDED_ASSET_BYTES = 10 * 1024 * 1024
const DRAFT_DATABASE = 'freeform-board-imports'
const DRAFT_STORE = 'pending'

export interface DraftStore {
	get(id: string): Promise<string | null>
	put(id: string, json: string): Promise<void>
	delete(id: string): Promise<void>
}

export interface ParsedNativeBoard {
	snapshot: TLStoreSnapshot
	pageCount: number
	shapeCount: number
	embeddedAssetCount: number
}

type MediaAsset = TLImageAsset | TLVideoAsset

function parseError(type: string): Error {
	switch (type) {
		case 'fileFormatVersionTooNew': return new Error('This board was saved by a newer version of tldraw.')
		case 'migrationFailed': return new Error('This board uses an unsupported tldraw schema.')
		default: return new Error('Choose a valid tldraw .tldr or JSON board file.')
	}
}

/** Parse with the installed SDK before any room or catalog write. */
export function parseNativeBoard(editor: Editor, json: string): ParsedNativeBoard {
	if (new Blob([json]).size > MAX_NATIVE_FILE_BYTES) throw new Error('This board file is too large (25 MB maximum).')
	const result = parseTldrawJsonFile({ json, schema: editor.store.schema })
	if (!result.ok) throw parseError(result.error.type)
	const snapshot = result.value.getStoreSnapshot()
	const records = Object.values(snapshot.store)
	const pageCount = records.filter((record) => record.typeName === 'page').length
	if (!pageCount) throw new Error('This board has no pages.')
	const shapeCount = records.filter((record) => record.typeName === 'shape').length
	const embeddedAssets = embeddedMediaAssets(snapshot)
	for (const record of records) {
		if (record.typeName !== 'asset' || (record.type !== 'image' && record.type !== 'video')) continue
		if (record.props.src?.startsWith('blob:') || record.props.src?.startsWith('file:')) {
			throw new Error('A local media link could not be included. Download the board again after the asset loads.')
		}
	}
	for (const asset of embeddedAssets) {
		if (embeddedDataSize(asset.props.src!) > MAX_EMBEDDED_ASSET_BYTES) {
			throw new Error(`An embedded asset is too large (10 MB maximum): ${asset.props.name || asset.id}`)
		}
	}
	const embeddedAssetCount = embeddedAssets.length
	return { snapshot, pageCount, shapeCount, embeddedAssetCount }
}

export async function exportNativeBoard(editor: Editor): Promise<Blob> {
	return new Blob([await serializeTldrawJson(editor)], { type: 'application/vnd.tldraw+json' })
}

export type ImageScope = 'board' | 'selection'
export type ImageFormat = 'png' | 'svg'

export function getImageExportIds(editor: Editor, scope: ImageScope): TLShapeId[] {
	const ids = scope === 'selection' ? [...editor.getSelectedShapeIds()] : [...editor.getCurrentPageShapeIds()]
	if (!ids.length) throw new Error(scope === 'selection' ? 'Select shapes to export.' : 'Add shapes to this page before exporting an image.')
	return ids
}

export async function exportImageBlob(editor: Editor, format: ImageFormat, scope: ImageScope): Promise<Blob> {
	const ids = getImageExportIds(editor, scope)
	const options: TLImageExportOptions = { format, padding: 24, background: scope === 'board', scale: 1 }
	return (await editor.toImage(ids, options)).blob
}

function boardNameFromFile(name: string): string {
	return name.replace(/\.(tldr|json)$/i, '').trim().slice(0, 64) || 'Imported board'
}

function generateImportId(): string {
	return `board-${crypto.randomUUID()}`
}

/** Stage first, then register the new board. The source editor is never changed. */
export async function stageNativeImport(
	editor: Editor,
	file: Pick<File, 'name' | 'size' | 'text'>,
	drafts: DraftStore,
	options: { boardStorage?: BoardIndexStorage; createId?: () => string } = {},
): Promise<string> {
	if (file.size > MAX_NATIVE_FILE_BYTES) throw new Error('This board file is too large (25 MB maximum).')
	if (!/\.(tldr|json)$/i.test(file.name)) throw new Error('Choose a .tldr or .json board file.')
	const json = await file.text()
	parseNativeBoard(editor, json)
	const id = options.createId?.() ?? generateImportId()
	await drafts.put(id, json)
	try {
		createLocalBoard(boardNameFromFile(file.name), options.boardStorage, { createId: () => id })
	} catch (cause) {
		await drafts.delete(id)
		throw cause
	}
	return id
}

function embeddedDataSize(src: string): number {
	const separator = src.indexOf(',')
	if (separator < 0 || !/^data:(image|video)\/[^;,]+(?:;[^;,]+)*;base64$/i.test(src.slice(0, separator))
		|| !/^[A-Za-z0-9+/]*={0,2}$/.test(src.slice(separator + 1))) {
		throw new Error('An embedded asset has an unsupported data format.')
	}
	return Math.ceil((src.length - separator - 1) * 3 / 4)
}

function embeddedMediaAssets(snapshot: TLStoreSnapshot): MediaAsset[] {
	return Object.values(snapshot.store).filter((record): record is MediaAsset =>
		record.typeName === 'asset' && (record.type === 'image' || record.type === 'video') && Boolean(record.props.src?.startsWith('data:'))
	)
}

function isBlankDestination(editor: Editor): boolean {
	const documentRecords = editor.store.allRecords().filter((record) =>
		record.typeName === 'shape' || record.typeName === 'asset' || record.typeName === 'binding' || record.typeName === 'page'
	)
	return documentRecords.filter((record) => record.typeName === 'page').length <= 1
		&& documentRecords.every((record) => record.typeName === 'page')
}

async function defaultUploadAsset(editor: Editor, asset: MediaAsset, file: File): Promise<MediaAsset> {
	// Tldraw's file handler sanitizes SVGs, enforces media limits, and uses this room's configured asset store.
	const result = await editor.getAssetForExternalContent({ type: 'file', file, assetId: asset.id })
	if (!result || result.type !== asset.type || !result.props.src) throw new Error(`Could not upload ${file.name}.`)
	return { ...asset, props: { ...asset.props, src: result.props.src } }
}

const pending = new Map<string, Promise<'none' | 'imported'>>()

/** Hydrate only a blank destination. Validation and uploads finish before document mutation. */
export function completePendingImport(
	editor: Editor,
	roomId: string,
	drafts: DraftStore,
	options: { uploadAsset?: (asset: MediaAsset, file: File) => Promise<MediaAsset> } = {},
): Promise<'none' | 'imported'> {
	const inFlight = pending.get(roomId)
	if (inFlight) return inFlight
	const task = completePendingImportOnce(editor, roomId, drafts, options)
	pending.set(roomId, task)
	void task.finally(() => { if (pending.get(roomId) === task) pending.delete(roomId) }).catch(() => {})
	return task
}

async function completePendingImportOnce(
	editor: Editor,
	roomId: string,
	drafts: DraftStore,
	options: { uploadAsset?: (asset: MediaAsset, file: File) => Promise<MediaAsset> },
): Promise<'none' | 'imported'> {
	const json = await drafts.get(roomId)
	if (!json) return 'none'
	if (!isBlankDestination(editor)) throw new Error('This destination board is not empty. The import is still safe to retry from a new board.')
	const parsed = parseNativeBoard(editor, json)
	const assets = embeddedMediaAssets(parsed.snapshot)
	const upload = options.uploadAsset ?? ((asset: MediaAsset, file: File) => defaultUploadAsset(editor, asset, file))
	const replacements: MediaAsset[] = []
	for (const asset of assets) {
		const blob = await fetch(asset.props.src!).then((response) => response.blob())
		if (blob.size > MAX_EMBEDDED_ASSET_BYTES) throw new Error(`An embedded asset is too large: ${asset.props.name || asset.id}`)
		const mimeType = blob.type || asset.props.mimeType || 'application/octet-stream'
		if (!mimeType.startsWith('image/') && !mimeType.startsWith('video/')) throw new Error('Only embedded image and video assets can be imported.')
		const file = new File([blob], asset.props.name || `${asset.id}.${asset.type}`, { type: mimeType })
		replacements.push(await upload(asset, file))
	}
	if (!isBlankDestination(editor)) throw new Error('The destination board changed while assets were uploading. The import was not applied.')
	for (const replacement of replacements) parsed.snapshot.store[replacement.id] = replacement
	editor.loadSnapshot(parsed.snapshot)
	if (!editor.getPage(editor.getCurrentPageId())) editor.setCurrentPage(editor.getPages()[0])
	editor.clearHistory()
	const bounds = editor.getCurrentPageBounds()
	if (bounds) editor.zoomToBounds(bounds, { immediate: true, targetZoom: 1 })
	await drafts.delete(roomId)
	return 'imported'
}

function openDraftDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DRAFT_DATABASE, 1)
		request.onerror = () => reject(request.error ?? new Error('Could not open import storage.'))
		request.onupgradeneeded = () => request.result.createObjectStore(DRAFT_STORE)
		request.onsuccess = () => resolve(request.result)
	})
}

function draftRequest<T>(operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	return openDraftDatabase().then((database) => new Promise<T>((resolve, reject) => {
		const transaction = database.transaction(DRAFT_STORE, 'readwrite')
		const request = operation(transaction.objectStore(DRAFT_STORE))
		transaction.oncomplete = () => { database.close(); resolve(request.result) }
		transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('Could not save import.')) }
		transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('Import storage was interrupted.')) }
	}))
}

export const browserDraftStore: DraftStore = {
	async get(id) { return (await draftRequest((store) => store.get(id) as IDBRequest<string | undefined>)) ?? null },
	async put(id, json) { await draftRequest((store) => store.put(json, id)) },
	async delete(id) { await draftRequest((store) => store.delete(id)) },
}
