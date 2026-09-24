# Native shapes and custom colors

This module keeps tldraw's built-in shape types, bindings, and serialization. It customizes the native arrow's middle handle to produce an Excalidraw-style three-point curve. No literal Excalidraw code is copied.

## Host integration

```tsx
import { freeformColorShapeUtils, FreeformColorPicker, CustomColorDefaults } from '../editor/excalidrawShapes'

<Tldraw shapeUtils={freeformColorShapeUtils}><CustomColorDefaults /></Tldraw>

// Inside DefaultStylePanel, replace StylePanelColorPicker:
<FreeformColorPicker />
```

The overrides configure native `geo`, `text`, `draw`, and `line` renderers using the public `getCustomDisplayValues` option. `FreeformArrowShapeUtil` extends the native arrow renderer for the curve. The shape schemas are unchanged, so the existing sync server validates them. All clients that need the custom appearance must use these overrides.

`applyCustomColor(editor, hex)` accepts three- or six-digit RGB HEX, normalizes it, colors selected unlocked supported shapes, and sets the current editor's drawing default. Selected groups recurse into their contents; frames do not. Invalid input throws before mutation. The return value is the number of selected shapes changed. Read-only editors return zero. With no selection, it sets the default without changing existing shapes.

`applyNativeColor(editor, color, { markHistory?, setNext? })` clears selected custom overrides before setting a native color. Unless `setNext` is false, it also clears the custom drawing default. This works when the native token already matches the underlying token. The picker retains the native history/selection/next-style handler, and uses a mixed native swatch state when a custom color is active.

The final multicolor swatch opens a compact popover. Its native color input applies on change; HEX applies with Enter. Escape/outside click discards an unsubmitted HEX draft. The swatch shows the selected custom color, or the drawing default when nothing is selected. Presets clear the default, including keyboard activation of an already-selected preset.

The geometry Background palette below Stroke uses a separate `freeformBackgroundColor` metadata value. Presets and the native custom chooser set a solid fill; Transparent clears it. The preference applies to new geometry drawn in the current editor session. Existing older geo records without the background field retain their linked custom fill until edited; changing their stroke snapshots that visible fill first. SVG and PNG use the same native renderer. Other shape types retain their native fill behavior.

## Persistence and rendering

The validated payload is stored with each shape:

```json
{"freeformColor":{"version":1,"hex":"#12abcd","base":"black"}}
```

The base is the shape's native color token. An override with an unknown version, invalid HEX, or a mismatched base is ignored. Reset uses `freeformColor: null`, preserving other metadata. Shapes therefore remain valid under the default server schema, and metadata travels atomically through sync, reload, duplication, and undo. SVG export uses the same native display-value path. Literal RGB stays the same in light/dark mode; tinted fills adapt to the mode.

`CustomColorDefaults` adds the override atomically in a public `beforeCreate` side effect for user-created native `geo`, `text`, `arrow`, and `line` shapes in their `.pointing` states, and `draw` in `.drawing`. Tool lock retains the preference. Remote records, programmatic imports in idle/select states, duplicates, and records with an existing custom-color payload keep their colors. The drawing preference is local to the mounted editor and resets on reload; created shape colors sync and persist normally. `getDefaultCustomColor(editor)` and `setDefaultCustomColor(editor, hexOrNull)` expose the local preference for integrations.

Notes, frames, highlights, and media are not recolored. Native geo/arrow labels retain their independent label color. Use the provided helper/picker to return to a native preset. No automatic per-room palette registration or global color-enum mutation is used.

## Native sketch and arrow controls

- Rectangle: press `R`; choose Stroke style → Draw. tldraw seeds its sketch path from the shape ID.
- Curved arrow: press `A`, draw and select it, then drag its middle handle anywhere on the canvas. The arrow becomes a smooth curve through that point, including turns close to either endpoint. The control point persists in `meta.freeformCurve`; endpoints and bindings remain native. Existing arrows without a control point retain their native appearance.
- Elbow arrow: select an arrow and choose the native elbow kind; long enough middle segments expose a movable handle.

The one-handle curve follows the three-point behavior in the supplied Excalidraw reference. It does not provide an arbitrary multi-point arrow editor or Excalidraw's exact RoughJS appearance.

## Sources inspected

- Installed tldraw 5.4.2: `shapes/geo/GeoShapeBody.tsx`, `shapes/arrow/ArrowShapeUtil.tsx`, `shapes/shared/getDisplayValues.ts`, and native shape `toSvg` methods.
- Installed `@tldraw/tlschema` 5.4.2: `styles/TLColorStyle.ts`, `styles/StyleProp.ts`, and `shapes/TLBaseShape.ts`.
- [Official themes documentation](https://tldraw.dev/sdk-features/themes): theme colors must register before store loading. Runtime registrations are global and missing theme names are removed.
- [Official native shape documentation](https://tldraw.dev/sdk-features/default-shapes): arc/elbow arrow props.
- Read-only Excalidraw donor revision `4850bf33`: `packages/element/src/shape.ts` uses RoughJS; its root license is MIT. No donor code, icon, or dependency was imported.

Run focused checks with `pnpm exec tsx --test --test-force-exit client/editor/excalidrawShapes/*.test.ts` and `pnpm exec tsc --noEmit`.
