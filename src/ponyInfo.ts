// Pony model + lock synchronisation, ported from the original
// `src/ts/common/ponyInfo.ts` of Pony Town 0.53.1-alpha.

import { toInt, array, includes } from './utils';
import { MAX_COLORS, SLEEVED_ACCESSORIES } from './constants';
import { parseColorFast } from './color';
import { BLACK, WHITE, TRANSPARENT, fillToOutline, fillToOutlineColor, fillToOutlineWithDarken, darkenForOutline } from './colors';
import { PonyInfo, PonyInfoBase, PonyInfoNumber, SpriteSet } from './interfaces';

const FILLS = ['1e90ff', '32cd32', 'da70d6', 'dc143c', '7fffd4'];

type PonyInfoGeneric<T> = PonyInfoBase<T, SpriteSet<T>>;

export function spriteSet(type: number, lockFirstFill = true, fill = 'ffd700', otherFills = FILLS): SpriteSet<string> {
	if (otherFills.length !== (MAX_COLORS - 1))
		throw new Error('Invalid fills count');

	const fills = [fill, ...otherFills];
	const outlines = fills.map(fillToOutline);

	return {
		type,
		pattern: 0,
		fills,
		outlines,
		lockFills: [lockFirstFill, ...array(MAX_COLORS - 1, false)],
		lockOutlines: array(MAX_COLORS, true),
	};
}

export function createDefaultPony(): PonyInfo {
	const pony = createBasePony();
	pony.mane!.type = 2;
	pony.backMane!.type = 1;
	pony.tail!.type = 1;
	return pony;
}

export function createBasePony(): PonyInfo {
	return syncLockedPonyInfo({
		head: spriteSet(0, true, 'ff0000', ['800000', '32cd32', 'da70d6', 'dc143c', '7fffd4']),
		nose: spriteSet(0, true, 'ff0000', ['800000', '32cd32', 'da70d6', 'dc143c', '7fffd4']),
		ears: spriteSet(0, true, 'ff0000'),
		horn: spriteSet(0, true, 'ff0000'),
		wings: spriteSet(0, true, 'ff0000'),
		frontHooves: spriteSet(0, false, 'ffa500', ['ffff00', '32cd32', 'da70d6', 'dc143c', '7fffd4']),
		backHooves: spriteSet(0, true, 'ffa500'),

		mane: spriteSet(0, false),
		backMane: spriteSet(0),
		tail: spriteSet(0),
		facialHair: spriteSet(0),

		headAccessory: spriteSet(0, false, 'ee82ee'),
		earAccessory: spriteSet(0, false, '808080'),
		faceAccessory: spriteSet(0, false, '000000'),
		neckAccessory: spriteSet(0, false, 'ee82ee'),
		frontLegAccessory: spriteSet(0, false, 'ee82ee'),
		backLegAccessory: spriteSet(0, false, 'ee82ee'),
		frontLegAccessoryRight: spriteSet(0, false, 'ee82ee'),
		backLegAccessoryRight: spriteSet(0, false, 'ee82ee'),
		lockBackLegAccessory: true,
		unlockFrontLegAccessory: false,
		unlockBackLegAccessory: false,
		backAccessory: spriteSet(0, false, 'ee82ee'),
		waistAccessory: spriteSet(0, false, '95856f', ['674b43', '4f4f4f', '525252', 'c37850', '8a3d34']),
		chestAccessory: spriteSet(0, false, 'ee82ee'),
		sleeveAccessory: spriteSet(0, true, 'ee82ee'),
		extraAccessory: {
			...spriteSet(0, true, 'ff0000', ['daa520', 'ffd700', 'ffd700', 'ffd700', 'ffd700']),
			lockFills: array(5, true),
		},

		coatFill: 'ff0000',
		coatOutline: '8b0000',
		lockCoatOutline: true,

		eyelashes: 0,
		eyeColorLeft: 'daa520',
		eyeColorRight: 'daa520',
		eyeWhitesLeft: 'ffffff',
		eyeWhites: 'ffffff',
		eyeOpennessLeft: 1,
		eyeOpennessRight: 1,
		eyeshadow: false,
		eyeshadowColor: '000000',
		lockEyes: true,
		lockEyeColor: true,
		unlockEyeWhites: false,
		unlockEyelashColor: false,
		eyelashColor: '000000',
		eyelashColorLeft: '000000',

		fangs: 0,
		muzzle: 0,
		freckles: 0,
		frecklesColor: '8b0000',
		magicColor: 'ffffff',

		cm: [],
		cmFlip: false,

		customOutlines: false,
		freeOutlines: false,
		darkenLockedOutlines: false,
	});
}

// sync

type FillToOutline<T> = (fill: T | undefined) => T | undefined;

export function getBaseFill<T>(set?: SpriteSet<T>): T | undefined {
	return set && set.fills && set.fills[0];
}

export function getBaseOutline<T>(set?: SpriteSet<T>): T | undefined {
	return set && set.outlines && set.outlines[0];
}

export function syncLockedSpriteSet<T>(
	set: SpriteSet<T> | undefined, customOutlines: boolean, fillToOutline: FillToOutline<T>, baseFill?: T,
	baseOutline?: T
): void {
	if (set === undefined)
		return;

	const fills = set.fills;

	if (!fills)
		return;

	const lockFills = set.lockFills;

	if (lockFills) {
		for (let i = 0; i < lockFills.length; i++) {
			if (lockFills[i]) {
				fills[i] = i === 0 ? baseFill : fills[0];
			}
		}
	}

	const outlines = set.outlines;
	const lockOutlines = set.lockOutlines;

	if (outlines && lockOutlines) {
		for (let i = 0; i < lockOutlines.length; i++) {
			if (!customOutlines) {
				lockOutlines[i] = true;
			}

			if (lockOutlines[i]) {
				if (i === 0 && baseOutline && lockFills && lockFills[i]) {
					outlines[i] = baseOutline;
				} else {
					outlines[i] = fillToOutline(fills[i]);
				}
			}
		}
	}
}

function syncLockedSpritesSet2<T>(
	set: SpriteSet<T> | undefined, fillToOutline: FillToOutline<T>, baseFills: (T | undefined)[],
	baseOutlines: (T | undefined)[]
): void {
	if (set && set.fills && set.lockFills) {
		set.lockFills.forEach((locked, i) => {
			if (locked) {
				set.fills![i] = baseFills[i];
			}
		});
	}

	if (set && set.fills && set.outlines && set.lockOutlines) {
		set.lockOutlines.forEach((locked, i) => {
			if (locked) {
				if (baseOutlines[i] && set.lockFills && set.lockFills[i]) {
					set.outlines![i] = baseOutlines[i];
				} else {
					set.outlines![i] = fillToOutline(set.fills![i]);
				}
			}
		});
	}
}

function getFillOf2<T>(set: SpriteSet<T> | undefined, defaultColor: T): T | undefined {
	return (set && set.type && set.fills && set.fills[0]) || defaultColor;
}

function getOutlineOf2<T>(set: SpriteSet<T> | undefined, defaultColor: T): T | undefined {
	return (set && set.type && set.outlines && set.outlines[0]) || defaultColor;
}

function syncLockedBasePonyInfo<T>(
	info: PonyInfoGeneric<T>, fillToOutline: FillToOutline<T>, defaultColor: T
): PonyInfoGeneric<T> {
	const customOutlines = !!info.customOutlines;

	if (!customOutlines || info.lockCoatOutline) {
		info.coatOutline = fillToOutline(info.coatFill);
	}

	if (info.lockEyes) {
		info.eyeOpennessLeft = info.eyeOpennessRight;
	}

	if (info.lockEyeColor) {
		info.eyeColorLeft = info.eyeColorRight;
	}

	if (!info.unlockEyeWhites) {
		info.eyeWhitesLeft = info.eyeWhites;
	}

	if (!info.unlockEyelashColor) {
		info.eyelashColorLeft = info.eyelashColor;
	}

	syncLockedSpriteSet<T>(info.head, customOutlines, fillToOutline, info.coatFill, info.coatOutline);
	syncLockedSpriteSet<T>(info.nose, customOutlines, fillToOutline, info.coatFill, info.coatOutline);
	syncLockedSpriteSet<T>(info.ears, customOutlines, fillToOutline, info.coatFill, info.coatOutline);
	syncLockedSpriteSet<T>(info.horn, customOutlines, fillToOutline, info.coatFill, info.coatOutline);
	syncLockedSpriteSet<T>(info.wings, customOutlines, fillToOutline, info.coatFill, info.coatOutline);
	syncLockedSpriteSet<T>(info.frontHooves, customOutlines, fillToOutline, info.coatFill, info.coatOutline);
	syncLockedSpriteSet<T>(
		info.backHooves, customOutlines, fillToOutline, getBaseFill(info.frontHooves), getBaseOutline(info.frontHooves));

	syncLockedSpriteSet<T>(info.mane, customOutlines, fillToOutline);

	const baseManeFill = getBaseFill(info.mane);
	const baseManeOutline = getBaseOutline(info.mane);

	syncLockedSpriteSet<T>(info.backMane, customOutlines, fillToOutline, baseManeFill, baseManeOutline);
	syncLockedSpriteSet<T>(info.tail, customOutlines, fillToOutline, baseManeFill, baseManeOutline);
	syncLockedSpriteSet<T>(info.facialHair, customOutlines, fillToOutline, baseManeFill, baseManeOutline);

	syncLockedSpriteSet<T>(info.headAccessory, customOutlines, fillToOutline);
	syncLockedSpriteSet<T>(info.earAccessory, customOutlines, fillToOutline);
	syncLockedSpriteSet<T>(info.faceAccessory, customOutlines, fillToOutline);
	syncLockedSpriteSet<T>(info.neckAccessory, customOutlines, fillToOutline);
	syncLockedSpriteSet<T>(info.frontLegAccessory, customOutlines, fillToOutline);
	syncLockedSpriteSet<T>(info.backLegAccessory, customOutlines, fillToOutline);
	syncLockedSpriteSet<T>(info.frontLegAccessoryRight, customOutlines, fillToOutline);
	syncLockedSpriteSet<T>(info.backLegAccessoryRight, customOutlines, fillToOutline);
	syncLockedSpriteSet<T>(info.backAccessory, customOutlines, fillToOutline);
	syncLockedSpriteSet<T>(info.waistAccessory, customOutlines, fillToOutline);
	syncLockedSpriteSet<T>(info.chestAccessory, customOutlines, fillToOutline);

	if (info.chestAccessory && !info.sleeveAccessory && includes(SLEEVED_ACCESSORIES, toInt(info.chestAccessory.type))) {
		info.sleeveAccessory = {
			type: 0,
			pattern: 0,
			fills: [],
			outlines: [],
			lockFills: array(MAX_COLORS, true),
			lockOutlines: array(MAX_COLORS, true),
		};
	}

	syncLockedSpriteSet<T>(
		info.sleeveAccessory, customOutlines, fillToOutline, getBaseFill(info.chestAccessory), getBaseOutline(info.chestAccessory));

	syncLockedSpritesSet2<T>(info.extraAccessory, fillToOutline, [
		info.coatFill,
		info.eyeColorRight,
		getFillOf2(info.mane, defaultColor),
		getFillOf2(info.backMane, defaultColor),
		getFillOf2(info.tail, defaultColor),
	], [
			info.coatOutline,
			info.eyeColorRight,
			getOutlineOf2(info.mane, defaultColor),
			getOutlineOf2(info.backMane, defaultColor),
			getOutlineOf2(info.tail, defaultColor),
		]);

	return info;
}

export function syncLockedPonyInfo(info: PonyInfo): PonyInfo {
	const darkenLocked = !!info.freeOutlines && !!info.darkenLockedOutlines;
	const fillToOutlineFunc = darkenLocked ? fillToOutlineWithDarken : fillToOutline;
	return syncLockedBasePonyInfo<string>(info as any, fillToOutlineFunc, '000000') as any;
}

function fillToOutlineSafe(color: number | undefined): number {
	return fillToOutlineColor((color === undefined || color === 0) ? BLACK : color);
}

function fillToOutlineSafeWithDarken(color: number | undefined): number {
	return darkenForOutline(fillToOutlineColor((color === undefined || color === 0) ? BLACK : color));
}

export function syncLockedPonyInfoNumber(info: PonyInfoNumber): PonyInfoNumber {
	const darkenLocked = !!info.freeOutlines && !!info.darkenLockedOutlines;
	const fillToOutlineFunc = darkenLocked ? fillToOutlineSafeWithDarken : fillToOutlineSafe;
	return syncLockedBasePonyInfo<number>(info as any, fillToOutlineFunc, BLACK) as any;
}

// misc helpers shared with the palette layer

export function parseFast(color: string | undefined): number {
	return color ? parseColorFast(color) : BLACK;
}

export function parseCMColor(color: string): number {
	return color ? parseColorFast(color) : TRANSPARENT;
}

export { toInt, WHITE };
