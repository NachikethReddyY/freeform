# Local board previews

`<BoardPreviewRecorder roomId={roomId} />` mounts inside `Tldraw` and its UI asset provider. It records the **current page** on first open, page changes, and document changes after a 900 ms pause. Camera movement and selection do not trigger exports. No synced shape records are changed.

`useBoardPreview(roomId)` returns `{ url, loading, updatedAt }`. Render `url` as an image when present. The hook revokes its object URLs on replacement/unmount and refreshes after same-tab and cross-tab writes.

`readBoardPreview(roomId)` returns `Promise<BoardPreview | null>`. Previews contain a PNG Blob, dimensions, page ID, room ID, and capture timestamp. Storage is IndexedDB database `freeform-board-previews`, scoped to this browser origin. PNGs have a maximum side of 480 px and maximum size of 256 KiB. They use a light background for consistent dashboard display.

A blank current page clears the image. Export/storage failures preserve the previous image; older in-flight writes cannot replace a newer image or resurrect a cleared one. Unmounting cancels queued captures and prevents late writes. Storage denial leaves the dashboard fallback usable.

Automatic export permits local/data/blob assets and local fonts only. The recorder resolves native font aliases through `useAssetUrls().fonts`; the app maps `tldraw_draw` to the bundled Excalifont file. Pages containing remote font presets, remote media, bookmarks, or embeds retain the last successful preview (or the empty fallback) rather than triggering background external requests. Large PNGs exceeding the byte limit are also skipped.

Previews are available after a board has been opened in this browser and a capture has completed. Leaving a board before the debounce finishes can leave its previous preview. Thumbnails are not shared between browser profiles, origins, or devices, and clearing browser storage removes them. The source board remains authoritative.

Focused checks: `pnpm test:boards`. Actual browser evidence, including two-room isolation/reload and cleanup, is in `.evidence/board-previews/`.
