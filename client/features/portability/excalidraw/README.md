# Excalidraw interchange

`interchange.ts` converts Excalidraw version 2 documents into native tldraw shapes and bindings, and exports the current tldraw page to a partial `.excalidraw` document. `nativeFile.ts` creates native board JSON in a detached editor so the existing `stageNativeImport` path can register it as a separate board. Neither import function accepts nor mutates the open synced editor. The Files panel previews converted/skipped counts before creating a board and shows export omissions after download.

```ts
const { json: nativeJson, report } = await convertExcalidrawToNativeJson(await file.text())
// Present report before calling stageNativeImport with a named native JSON File.
const roomId = await stageNativeImport(editor, new File([nativeJson], `${name}.json`), browserDraftStore)
```

Import supports rectangles, ellipses, diamonds, standalone text, bound shape and arrow labels, straight two-point arrows and lines, arrow endpoint bindings, linked rectangle URLs, lock state, opacity, stroke color, and representable fills. Bound lines become no-head native arrows because native line shapes have no binding model. Export handles those no-head arrows as lines while their provenance metadata remains. Export covers only the current page and top-level supported shapes.

The `report` counts converted and skipped elements, skipped types, and approximated styles. Curved, elbow, rotated, and multi-point connectors; frames, images, freehand, embedded content, and nested shapes are skipped. Separate fill and stroke colors, arbitrary font sizes, corner roundness, grouping, frame membership, and some fill patterns are approximated or flattened and reported. Excalidraw v2 JSON is limited to 25 MB and 5,000 elements. Embedded files are not transferred.

This adapter uses Excalidraw's public v2 file format as a reference; no Excalidraw source code was copied. Run focused tests with `pnpm exec tsx --test --test-force-exit client/features/portability/excalidraw/interchange.test.ts`.
