export const slideOrganizerStyles = `
.freeform-slide-organizer {
	position: fixed;
	top: 8px;
	right: 12px;
	z-index: 330;
	font: 12px 'Geist Sans', sans-serif;
	color: var(--tl-color-text);
	pointer-events: auto;
}
.freeform-slide-organizer button { font: inherit; cursor: pointer; }
.freeform-slide-organizer button:disabled { cursor: default; opacity: .38; }
.freeform-slide-organizer button:focus-visible,
.freeform-slide-organizer input:focus-visible { outline: 2px solid var(--tl-color-focus); outline-offset: 1px; }
.freeform-slide-organizer svg { width: 18px; height: 18px; flex: none; }
.freeform-slide-organizer__trigger {
	display: grid;
	place-items: center;
	width: 34px;
	height: 34px;
	margin-left: auto;
	padding: 0;
	border: 1px solid var(--tl-color-divider);
	border-radius: 7px;
	background: var(--tl-color-panel);
	color: var(--tl-color-text);
	box-shadow: var(--tl-shadow-2);
}
.freeform-slide-organizer__trigger:hover,
.freeform-slide-organizer__trigger[aria-expanded='true'] { background: var(--tl-color-muted-1); }
.freeform-slide-organizer__panel {
	width: min(324px, calc(100vw - 24px));
	margin-top: 7px;
	border: 1px solid var(--tl-color-divider);
	border-radius: 9px;
	background: var(--tl-color-panel);
	box-shadow: var(--tl-shadow-3);
	overflow: hidden;
}
.freeform-slide-organizer__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	min-height: 36px;
	padding: 3px 7px 3px 11px;
	border-bottom: 1px solid var(--tl-color-divider);
}
.freeform-slide-organizer__header strong { font-size: 12px; font-weight: 600; }
.freeform-slide-organizer__header span { margin-left: 5px; color: var(--tl-color-text-3); font-weight: 400; }
.freeform-slide-organizer__icon {
	display: grid;
	place-items: center;
	width: 27px;
	height: 27px;
	flex: none;
	padding: 0;
	border: 0;
	border-radius: 4px;
	background: transparent;
	color: var(--tl-color-text-2);
}
.freeform-slide-organizer__icon:hover:not(:disabled) { background: var(--tl-color-muted-1); color: var(--tl-color-text); }
.freeform-slide-organizer__icon svg { width: 16px; height: 16px; }
.freeform-slide-organizer__list {
	max-height: min(480px, calc(100vh - 112px));
	margin: 0;
	padding: 5px;
	list-style: none;
	overflow-y: auto;
}
.freeform-slide-organizer__row {
	display: flex;
	align-items: center;
	gap: 5px;
	min-height: 56px;
	padding: 3px;
	border-radius: 5px;
}
.freeform-slide-organizer__row:hover,
.freeform-slide-organizer__row:focus-within { background: var(--tl-color-muted-1); }
.freeform-slide-organizer__row[data-active='true'] {
	background: var(--tl-color-muted-1);
	box-shadow: inset 2px 0 var(--tl-color-focus);
}
.freeform-slide-organizer__row[data-active='true'] .freeform-slide-organizer__name { font-weight: 600; }
.freeform-slide-organizer__row[data-active='true'] .freeform-slide-organizer__number { color: var(--tl-color-text); }
.freeform-slide-organizer__number { width: 15px; flex: none; color: var(--tl-color-text-3); font-size: 11px; text-align: center; }
.freeform-slide-organizer__preview {
	display: grid;
	place-items: center;
	width: 80px;
	height: 50px;
	flex: none;
	border: 1px solid var(--tl-color-divider);
	border-radius: 3px;
	background: #fff;
	overflow: hidden;
}
.freeform-slide-organizer__preview img { width: 100%; height: 100%; object-fit: contain; }
.freeform-slide-organizer__name {
	min-width: 0;
	flex: 1;
	padding: 5px 1px;
	border: 0;
	background: transparent;
	color: var(--tl-color-text);
	text-align: left;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.freeform-slide-organizer__name:hover { text-decoration: underline; }
.freeform-slide-organizer__name-input {
	width: 0;
	min-width: 0;
	flex: 1;
	padding: 5px 4px;
	border: 1px solid var(--tl-color-focus);
	border-radius: 4px;
	background: var(--tl-color-low);
	color: var(--tl-color-text);
	font: inherit;
}
.freeform-slide-organizer__actions { display: flex; flex: none; gap: 0; }
.freeform-slide-organizer__empty { margin: 0; padding: 15px 12px; color: var(--tl-color-text-2); line-height: 1.45; }
@media (max-width: 480px) {
	.freeform-slide-organizer { right: 8px; }
	.freeform-slide-organizer__panel { width: min(324px, calc(100vw - 16px)); }
}
`
