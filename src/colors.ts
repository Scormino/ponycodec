// Colour constants and fill -> outline derivation, ported from the original
// Pony Town 0.53.1-alpha `src/ts/common/colors.ts` (+ `darkenForOutline`,
// which lived in `ponyInfo.ts` and is moved here to avoid a circular import).

import {
	colorFromHSVA, colorToHSVA, colorToHexRGB, parseColorFast, getR, getG, getB, getAlpha, colorFromRGBA
} from './color';

export const TRANSPARENT = 0;
export const WHITE = 0xffffffff;
export const BLACK = 0x000000ff;
export const ORANGE = 0xffa500ff;
export const BLUE = 0x0000ffff;
export const GREEN = 0x00ff00ff;
export const YELLOW = 0xffff00ff;
export const MAGENTA = 0xff00ffff;
export const CYAN = 0x00ffffff;
export const GRAY = 0x444444ff;
export const RED = 0xff0000ff;
export const HOTPINK = 0xff69b4ff;
export const PURPLE = 0x800080ff;

// game
export const SHADOW_COLOR = 0x0000004c;
export const CLOUD_SHADOW_COLOR = 0x00000033;
export const SHINES_COLOR = 0xffffff66;
export const FAR_COLOR = 0xccccccff;

export function fillToOutline(color: string | undefined): string | undefined {
	return color ? colorToHexRGB(fillToOutlineColor(parseColorFast(color))) : undefined;
}

export function fillToOutlineWithDarken(color: string | undefined): string | undefined {
	return color ? colorToHexRGB(darkenForOutline(fillToOutlineColor(parseColorFast(color)))) : undefined;
}

export function fillToOutlineColor(color: number): number {
	const { h, s, v, a } = colorToHSVA(color);
	return colorFromHSVA(h, Math.min(s * 1.3, 1), v * 0.7, a);
}

// ponyInfo.ts: darkenForOutline
export function darkenForOutline(color: number): number {
	const mult = (159 / 255);
	const r = (mult * getR(color)) | 0;
	const g = (mult * getG(color)) | 0;
	const b = (mult * getB(color)) | 0;
	const a = getAlpha(color);
	return colorFromRGBA(r, g, b, a);
}
