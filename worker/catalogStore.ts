import { mergeBoardCatalogs, parseBoardCatalog, type BoardCatalog } from '../shared/boardCatalog'
import type { AuthStore } from './auth'

const CATALOG_KEY = 'catalog:v1:owner'

export interface CatalogSnapshot {
	revision: number
	catalog: BoardCatalog
}

const emptyCatalog: BoardCatalog = { boards: [], collections: [] }

/** The existing owner Durable Object uses SQLite-backed storage; no new binding or migration is required. */
export class CatalogStore {
	constructor(private readonly store: AuthStore) {}

	async read(): Promise<CatalogSnapshot> {
		return await this.store.get<CatalogSnapshot>(CATALOG_KEY) ?? { revision: 0, catalog: emptyCatalog }
	}

	async sync(input: unknown): Promise<CatalogSnapshot> {
		const incoming = parseBoardCatalog(input)
		return this.store.transaction(async (tx) => {
			const current = await tx.get<CatalogSnapshot>(CATALOG_KEY) ?? { revision: 0, catalog: emptyCatalog }
			const merged = mergeBoardCatalogs(current.catalog, incoming)
			if (JSON.stringify(merged) === JSON.stringify(current.catalog)) return current
			const next = { revision: current.revision + 1, catalog: merged }
			await tx.put(CATALOG_KEY, next)
			return next
		})
	}
}
