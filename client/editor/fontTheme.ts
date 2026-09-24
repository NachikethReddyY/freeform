import { DEFAULT_THEME, type TLThemes } from 'tldraw'
import excalifontUrl from 'excalifont/fonts/Excalifont-Regular.woff2?url'

// tldraw loads rich-text weight/style variants by symbolic asset name. The package
// ships one face, so point every draw variant at that same family to avoid a
// Shantell Sans fallback when text is bold or italic.
export const boardAssetUrls = {
	fonts: {
		tldraw_draw: excalifontUrl,
		tldraw_draw_bold: excalifontUrl,
		tldraw_draw_italic: excalifontUrl,
		tldraw_draw_italic_bold: excalifontUrl,
	},
}

// Keep the built-in draw font style so existing shapes also use the new face.
export const boardThemes = {
	default: {
		...DEFAULT_THEME,
		fonts: {
			...DEFAULT_THEME.fonts,
			draw: {
			fontFamily: "'tldraw_draw', cursive",
			faces: [
				{
					family: 'tldraw_draw',
					src: { url: excalifontUrl, format: 'woff2' },
					weight: 'normal',
					style: 'normal',
				},
			],
		},
	},
	},
} satisfies Partial<TLThemes>
