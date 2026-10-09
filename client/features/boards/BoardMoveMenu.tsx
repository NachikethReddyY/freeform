import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { LocalBoardCollection } from './boardIndex'

export function BoardMoveMenu({ boardTitle, collectionId, collections, onMove }: {
	boardTitle: string
	collectionId: string
	collections: LocalBoardCollection[]
	onMove(collectionId: string): void
}) {
	const [open, setOpen] = useState(false)
	const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 0 })
	const triggerRef = useRef<HTMLButtonElement>(null)
	const menuRef = useRef<HTMLDivElement>(null)
	const menuId = useId()

	useLayoutEffect(() => {
		if (!open) return
		const placeMenu = () => {
			const trigger = triggerRef.current
			const submenu = menuRef.current
			const parent = trigger?.closest('.board-dashboard-card-menu')
			if (!trigger || !submenu || !parent) return
			const bounds = parent.getBoundingClientRect()
			const width = submenu.getBoundingClientRect().width
			const height = Math.min(submenu.scrollHeight + 2, window.innerHeight - 16)
			let left = bounds.right + 4
			let top = trigger.getBoundingClientRect().top - 6
			if (left + width > window.innerWidth - 8) {
				left = bounds.left - width - 4
				if (left < 8) {
					// Stack the second menu when two menus cannot fit side by side.
					left = bounds.right - width
					top = bounds.bottom + 4
					if (top + height > window.innerHeight - 8) top = bounds.top - height - 4
				}
			}
			setPosition({
				left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
				top: Math.max(8, Math.min(top, window.innerHeight - height - 8)),
				maxHeight: Math.max(0, window.innerHeight - 16),
			})
		}
		placeMenu()
		menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
		window.addEventListener('resize', placeMenu)
		window.addEventListener('scroll', placeMenu, true)
		return () => {
			window.removeEventListener('resize', placeMenu)
			window.removeEventListener('scroll', placeMenu, true)
		}
	}, [open, collections])

	const close = () => {
		setOpen(false)
		triggerRef.current?.focus({ preventScroll: true })
	}

	return <div className="board-dashboard-move-menu" onBlur={(event) => {
		if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
	}}>
		<button ref={triggerRef} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
			onClick={() => setOpen((value) => !value)}
			onKeyDown={(event) => {
				if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
					event.preventDefault()
					setOpen(true)
				}
			}}>
			<span>Move to</span>
			<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4" /></svg>
		</button>
		{open && <div ref={menuRef} id={menuId} className="board-dashboard-collection-menu" role="menu" aria-label={`Move ${boardTitle} to collection`}
			style={position} onKeyDown={(event) => {
				if (event.key === 'Escape' || event.key === 'ArrowLeft') {
					event.preventDefault()
					event.stopPropagation()
					close()
					return
				}
				const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'))
				const index = buttons.findIndex((button) => button === document.activeElement)
				let next: number
				switch (event.key) {
					case 'ArrowDown': next = (index + 1) % buttons.length; break
					case 'ArrowUp': next = (index - 1 + buttons.length) % buttons.length; break
					case 'Home': next = 0; break
					case 'End': next = buttons.length - 1; break
					default: return
				}
				event.preventDefault()
				buttons[next]?.focus()
			}}>
			{collections.map((collection) => <button key={collection.id} type="button" role="menuitemradio" tabIndex={-1}
				aria-checked={collection.id === collectionId} onClick={() => onMove(collection.id)}>
				<span>{collection.title}</span>
				{collection.id === collectionId && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg>}
			</button>)}
		</div>}
	</div>
}
