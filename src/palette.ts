// Palette layer - a port of `src/ts/common/ponyInfo.ts` (toPaletteGeneric)
// of the original Pony Town 0.53.1-alpha.
//
// The palette of a pony is the list of colours that is uploaded to the GPU
// for every sprite. The colours are the fills and the outlines of a set,
// interleaved: [fill0, outline0, fill1, outline1, ...]. The first entry of
// the array is unused (index 0 is the "no colour" slot).

import { renderSets, renderDefaultPalette, renderWaterPalette, RenderSet, RenderPattern } from './renderData';
import { Palette, PaletteManager, PalettePonyInfo, PaletteSpriteSet, PonyInfo, PonyInfoNumber, SpriteSet } from './interfaces';
import { BLACK, WHITE, TRANSPARENT, darkenForOutline } from './colors';
import { parseColorFast, colorToHexRGB } from './color';
import { toInt, att } from './utils';
import { CM_SIZE } from './constants';

// manager that just keeps the colour arrays in memory - used for tests and
// for the CPU renderer
export const mockPaletteManager: PaletteManager = {
	add(colors: number[]): Palette {
		return this.addArray(new Uint32Array(colors));
	},
	addArray(colors: Uint32Array): Palette {
		return { x: 0, y: 0, u: 0, v: 0, refs: 1, colors };
	},
	init(): void {
		// nothing to do
	},
};

function getRenderSet(name: string): RenderSet {
	for (const set of renderSets) {
		if (set.name === name) {
			return set;
		}
	}

	throw new Error('Unknown render set: ' + name);
}

export function toColorList(colors: (string | undefined)[]): Uint32Array {
	const result = new Uint32Array(colors.length + 1);

	for (let i = 0; i < colors.length; i++) {
		result[i + 1] = parseFast(colors[i]);
	}

	return result;
}

export function toColorListNumber(colors: (number | undefined)[]): Uint32Array {
	const result = new Uint32Array(colors.length + 1);

	for (let i = 0; i < colors.length; i++) {
		result[i + 1] = colors[i] || BLACK;
	}

	return result;
}

function parseFast(color: string | undefined): number {
	return color ? parseColorFast(color) : BLACK;
}

function parseCMColor(color: string): number {
	return color ? parseColorFast(color) : TRANSPARENT;
}

function getColorsGeneric(
	fillColors: (string | undefined)[] | undefined, outlineColors: (string | undefined)[] | undefined,
	defaultColor: string, length: number, darken: boolean
): string[] {
	const fills = fillColors || [];
	const outlines = outlineColors || [];
	const colors: string[] = [];

	for (let i = 0; i < length; i++) {
		colors[i * 2] = fills[i] || defaultColor;

		if (darken) {
			colors[i * 2 + 1] = outlines[i]
				? colorToHexRGB(darkenForOutline(parseColorFast(outlines[i]!)))
				: defaultColor;
		} else {
			colors[i * 2 + 1] = outlines[i] || defaultColor;
		}
	}

	return colors;
}

export function getColorsFromSet(set: SpriteSet<string>, defaultColor: string, darken: boolean): string[] {
	const length = Math.max(set.fills ? set.fills.length : 0, set.outlines ? set.outlines.length : 0);
	return getColorsGeneric(set.fills, set.outlines, defaultColor, length, darken);
}

export type GetColorsForSet<T> = (set: SpriteSet<T>, count: number, darken: boolean) => Uint32Array;

export const getColorsForSet: GetColorsForSet<string> = (set, count, darken) => {
	const colors = getColorsGeneric(set.fills, set.outlines, '000000', count, darken);
	return toColorList(colors);
};

const emptyArray: number[] = [];

export const getColorsForSetNumber: GetColorsForSet<number> = (set, length, darken) => {
	const fills = set.fills || emptyArray;
	const outlines = set.outlines || emptyArray;
	const result = new Uint32Array(length * 2 + 1);

	for (let i = 0; i < length; i++) {
		result[((i << 1) + 1) | 0] = i < fills.length ? (fills[i] || BLACK) : BLACK;

		if (darken) {
			result[((i << 1) + 2) | 0] = i < outlines.length ? darkenForOutline(outlines[i] || BLACK) : BLACK;
		} else {
			result[((i << 1) + 2) | 0] = i < outlines.length ? (outlines[i] || BLACK) : BLACK;
		}
	}

	return result;
};

function getExtraPalette(pattern: RenderPattern | undefined, manager: PaletteManager): Palette | undefined {
	const extraPalette = pattern && pattern.palettes && pattern.palettes[0];
	return extraPalette ? manager.addArray(new Uint32Array(extraPalette)) : undefined;
}

export function toPaletteSet<T>(
	set: SpriteSet<T>, setName: string, manager: PaletteManager, getColors: GetColorsForSet<T>,
	hasExtra: boolean, darken: boolean
): PaletteSpriteSet | undefined {
	const renderSet = getRenderSet(setName);
	const pattern = att(att(renderSet.types, set.type), set.pattern) as RenderPattern | undefined;
	const colorCount = pattern !== undefined ? pattern.colors : 0;
	const colors = getColors(set, colorCount, darken);

	return {
		type: toInt(set.type),
		pattern: toInt(set.pattern),
		palette: manager.addArray(colors),
		extraPalette: hasExtra ? getExtraPalette(pattern, manager) : undefined,
	};
}

function createCMPalette<T>(
	cm: T[] | undefined, manager: PaletteManager, parseColor: (color: T) => number
): Palette | undefined {
	const size = CM_SIZE * CM_SIZE;

	if (cm === undefined || cm.length === 0 || cm.length > size) {
		return undefined;
	}

	const result = new Uint32Array(size);

	for (let i = 0; i < cm.length; i++) {
		result[i] = parseColor(cm[i]);
	}

	return manager.addArray(result);
}

export type ToSet<T> = (set: SpriteSet<T> | undefined, setName: string, extra?: boolean) => PaletteSpriteSet | undefined;

export function createToPaletteSet<T>(
	manager: PaletteManager, getColors: GetColorsForSet<T>, extra: boolean, darken: boolean
): ToSet<T> {
	return (set, setName) => set === undefined
		? undefined
		: toPaletteSet(set, setName, manager, getColors, extra, darken);
}

export function toPaletteGeneric<T>(
	info: PonyInfo | PonyInfoNumber, manager: PaletteManager,
	toColorList: (color: (T | undefined)[]) => Uint32Array,
	getColors: GetColorsForSet<T>, blackColor: T, whiteColor: T, parseCMColor: (color: T) => number
): PalettePonyInfo {
	const anyInfo = info as any;
	const darken = !anyInfo.freeOutlines;
	const toSet = createToPaletteSet(manager, getColors, false, darken);
	const toSetExtra = createToPaletteSet(manager, getColors, true, darken);

	const defaultSet: SpriteSet<T> = {
		type: 0,
		pattern: 0,
		fills: [anyInfo.coatFill],
		outlines: [anyInfo.coatOutline],
	};

	return {
		body: toSet(defaultSet, 'body'),
		head: toSet(anyInfo.head || defaultSet, 'head'),
		nose: toSet(anyInfo.nose, 'nose'),
		ears: toSet(anyInfo.ears || defaultSet, 'ears'),
		horn: toSet(anyInfo.horn, 'horn'),
		wings: toSet(anyInfo.wings, 'wings'),
		frontLegs: toSet(defaultSet, 'frontLegs'),
		backLegs: toSet(defaultSet, 'backLegs'),
		frontHooves: toSet(anyInfo.frontHooves, 'frontHooves'),
		backHooves: toSet(anyInfo.backHooves, 'backHooves'),

		mane: toSet(anyInfo.mane, 'mane'),
		backMane: toSet(anyInfo.backMane, 'backMane'),
		tail: toSet(anyInfo.tail, 'tail'),
		facialHair: toSet(anyInfo.facialHair, 'facialHair'),

		headAccessory: toSet(anyInfo.headAccessory, 'headAccessory'),
		earAccessory: toSet(anyInfo.earAccessory, 'earAccessory'),
		faceAccessory: toSetExtra(anyInfo.faceAccessory, 'faceAccessory'),
		neckAccessory: toSet(anyInfo.neckAccessory, 'neckAccessory'),
		frontLegAccessory: toSet(anyInfo.frontLegAccessory, 'frontLegAccessory'),
		backLegAccessory: toSet(
			anyInfo.lockBackLegAccessory ? anyInfo.frontLegAccessory : anyInfo.backLegAccessory, 'backLegAccessory'),
		frontLegAccessoryRight: toSet(
			anyInfo.unlockFrontLegAccessory ? anyInfo.frontLegAccessoryRight : anyInfo.frontLegAccessory,
			'frontLegAccessoryRight'),
		backLegAccessoryRight: toSet(
			anyInfo.lockBackLegAccessory
				? (anyInfo.unlockFrontLegAccessory ? anyInfo.frontLegAccessoryRight : anyInfo.frontLegAccessory)
				: (anyInfo.unlockBackLegAccessory ? anyInfo.backLegAccessoryRight : anyInfo.backLegAccessory),
			'backLegAccessoryRight'),
		lockBackLegAccessory: anyInfo.lockBackLegAccessory,
		unlockFrontLegAccessory: anyInfo.unlockFrontLegAccessory,
		unlockBackLegAccessory: anyInfo.unlockBackLegAccessory,
		backAccessory: toSet(anyInfo.backAccessory, 'backAccessory'),
		waistAccessory: toSet(anyInfo.waistAccessory, 'waistAccessory'),
		chestAccessory: toSet(anyInfo.chestAccessory, 'chestAccessory'),
		sleeveAccessory: toSet(anyInfo.sleeveAccessory, 'sleeveAccessory'),
		extraAccessory: toSet(anyInfo.extraAccessory, 'extraAccessory'),

		coatPalette: manager.addArray(toColorList([anyInfo.coatFill, anyInfo.coatOutline])),
		coatFill: undefined,
		coatOutline: undefined,
		lockCoatOutline: !!anyInfo.lockCoatOutline,

		eyelashes: toInt(anyInfo.eyelashes),
		eyePaletteLeft: manager.addArray(toColorList([
			anyInfo.eyeWhitesLeft || whiteColor,
			anyInfo.eyelashColor || blackColor
		])),
		eyePalette: manager.addArray(toColorList([
			anyInfo.eyeWhites || whiteColor,
			(anyInfo.unlockEyelashColor ? anyInfo.eyelashColorLeft : anyInfo.eyelashColor) || blackColor
		])),
		eyeColorLeft: manager.addArray(toColorList([anyInfo.eyeColorLeft])),
		eyeColorRight: manager.addArray(toColorList([anyInfo.eyeColorRight])),
		eyeWhitesLeft: undefined,
		eyeWhites: undefined,
		eyeOpennessLeft: toInt(anyInfo.eyeOpennessLeft),
		eyeOpennessRight: toInt(anyInfo.eyeOpennessRight),
		eyeshadow: anyInfo.eyeshadow,
		eyeshadowColor: manager.addArray(toColorList([anyInfo.eyeshadowColor])),
		lockEyes: !!anyInfo.lockEyes,
		lockEyeColor: !!anyInfo.lockEyeColor,
		unlockEyeWhites: !!anyInfo.unlockEyeWhites,
		unlockEyelashColor: !!anyInfo.unlockEyelashColor,
		eyelashColor: undefined,
		eyelashColorLeft: undefined,

		fangs: toInt(anyInfo.fangs),
		muzzle: toInt(anyInfo.muzzle),
		freckles: 0, // remove
		frecklesColor: undefined, // TODO: remove
		magicColor: undefined,
		magicColorValue: typeof anyInfo.magicColor === 'string'
			? parseColorFast(anyInfo.magicColor)
			: toInt(anyInfo.magicColor),

		cm: undefined,
		cmFlip: !!anyInfo.cmFlip,
		cmPalette: createCMPalette<T>(anyInfo.cm, manager, parseCMColor),

		customOutlines: !!anyInfo.customOutlines,
		freeOutlines: !!anyInfo.freeOutlines,
		darkenLockedOutlines: !!anyInfo.darkenLockedOutlines,
		defaultPalette: manager.addArray(new Uint32Array(renderDefaultPalette)),
		waterPalette: manager.addArray(new Uint32Array(renderWaterPalette)),
	} as PalettePonyInfo;
}

export function toPalette(info: PonyInfo, manager: PaletteManager = mockPaletteManager): PalettePonyInfo {
	return toPaletteGeneric<string>(
		info, manager, toColorList, getColorsForSet, '000000', 'ffffff', parseCMColor) as PalettePonyInfo;
}

export function toPaletteNumber(info: PonyInfoNumber, manager: PaletteManager = mockPaletteManager): PalettePonyInfo {
	return toPaletteGeneric<number>(
		info, manager, toColorListNumber, getColorsForSetNumber, BLACK, WHITE, x => x) as PalettePonyInfo;
}
