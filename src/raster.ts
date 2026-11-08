// CPU rasterizer - a port of `drawImagePalette` of
// `src/ts/graphics/contextSpriteBatch.ts` of the original Pony Town 0.53.1-alpha.
//
// The sprite sheet of the palettized sprites stores, for every pixel, the index
// of the colour of the palette in one of the channels and the shade of the
// pixel in another one. The index of the channel depends on the type of the
// sprite (see `typeOffsets`).
//
// The colour of a pixel is the colour of the palette, multiplied with the
// shade of the pixel and with the tint of the sprite.

import { getR, getG, getB, getAlpha, colorToRGBA } from './color';
import { Palette } from './interfaces';
import { PoseSprite } from './poseData';

export interface RasterImage {
	width: number;
	height: number;
	data: Uint8ClampedArray;
}

export function createImage(width: number, height: number, fill?: number): RasterImage {
	const data = new Uint8ClampedArray(width * height * 4);

	if (fill !== undefined) {
		const r = getR(fill);
		const g = getG(fill);
		const b = getB(fill);
		const a = getAlpha(fill);

		for (let i = 0; i < data.length; i += 4) {
			data[i] = r;
			data[i + 1] = g;
			data[i + 2] = b;
			data[i + 3] = a;
		}
	}

	return { width, height, data };
}

// the offset of the channel with the index of the palette colour
const typeOffsets = [0, 2, 3, 0, 1, 2, 3];

function blendColor(base: number, tint: number, shade: number): number {
	return (((((base * tint) | 0) * shade) | 0) / 65025) | 0;
}

function blendPrecise(
	dstData: Uint8ClampedArray, dst0: number, r: number, g: number, b: number, alpha: number
) {
	if (alpha === 0xff || dstData[dst0 + 3] === 0) {
		dstData[dst0] = r;
		dstData[dst0 + 1] = g;
		dstData[dst0 + 2] = b;
		dstData[dst0 + 3] = alpha;
	} else {
		const dstAlpha = (0xff - alpha) | 0;
		dstData[dst0] = ((((r * alpha) | 0) / 255) | 0) + ((((dstData[dst0] * dstAlpha) | 0) / 255) | 0);
		dstData[dst0 + 1] = ((((g * alpha) | 0) / 255) | 0) + ((((dstData[dst0 + 1] * dstAlpha) | 0) / 255) | 0);
		dstData[dst0 + 2] = ((((b * alpha) | 0) / 255) | 0) + ((((dstData[dst0 + 2] * dstAlpha) | 0) / 255) | 0);
		const a = (alpha + ((((dstData[dst0 + 3] * dstAlpha) | 0) / 255) | 0)) | 0;
		dstData[dst0 + 3] = a > 0xff ? 0xff : a;
	}
}

function min(a: number, b: number): number {
	return a < b ? a : b;
}

function min3(a: number, b: number, c: number): number {
	return min(min(a, b), c);
}

// Draws a sprite of a palettized sprite sheet with a palette.
export function drawImagePalette(
	dst: RasterImage, src: RasterImage, sprite: PoseSprite, tint: number, palette: Palette,
	x: number, y: number
) {
	if (sprite.w === 0 || sprite.h === 0) {
		return;
	}

	const { r, g, b, a } = colorToRGBA(tint);
	const alpha = a | 0;
	const colors = palette.colors;
	const dstData = dst.data;
	const srcData = src.data;
	const dstWidth = dst.width | 0;
	const srcWidth = src.width | 0;
	const disableShading = sprite.type > 2;
	const offset = typeOffsets[sprite.type];

	let sx = sprite.x;
	let sy = sprite.y;
	let sw = sprite.w;
	let sh = sprite.h;
	let dx = Math.round(x + sprite.ox);
	let dy = Math.round(y + sprite.oy);

	let w = sw;
	let h = sh;

	const xx = min3(0, sx, dx);
	w += xx;
	dx -= xx;
	sx -= xx;

	const yy = min3(0, sy, dy);
	h += yy;
	dy -= yy;
	sy -= yy;

	w += min3(0, src.width - (sx + w), dst.width - (dx + w));
	h += min3(0, src.height - (sy + h), dst.height - (dy + h));

	if (w <= 0 || h <= 0) {
		return;
	}

	for (let y2 = 0; y2 < h; y2++) {
		for (let x2 = 0; x2 < w; x2++) {
			const srcO = ((sx + x2) + (sy + y2) * srcWidth) << 2;
			const index = srcData[srcO + offset];
			const color = colors[index];

			if (color === undefined) {
				continue;
			}

			const srcAlpha = blendColor(getAlpha(color), alpha, 255);

			if (srcAlpha !== 0) {
				const shade = disableShading ? 255 : srcData[srcO + 1];
				const rr = blendColor(getR(color), r, shade);
				const gg = blendColor(getG(color), g, shade);
				const bb = blendColor(getB(color), b, shade);
				const dst0 = ((dx + x2) + (dy + y2) * dstWidth) << 2;
				blendPrecise(dstData, dst0, rr, gg, bb, srcAlpha);
			}
		}
	}
}
