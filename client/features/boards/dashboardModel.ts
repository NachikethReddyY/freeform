import type { LocalBoard } from './boardIndex'

/** Search intentionally covers board names only; canvas contents are not read. */
export function filterBoardsByName(boards: LocalBoard[], query: string): LocalBoard[] {
	const normalized = query.trim().toLocaleLowerCase()
	if (!normalized) return boards
	return boards.filter((board) => board.title.toLocaleLowerCase().includes(normalized))
}

/** A board opened from Trash must be restored before the editor resolves its title. */
export function openBoardFromDashboard(
	board: LocalBoard,
	restoreBoard: (id: string) => LocalBoard | undefined,
	navigate: (path: string) => void,
): boolean {
	if (board.deletedAt !== null && !restoreBoard(board.id)) return false
	navigate(`/${board.id}`)
	return true
}
