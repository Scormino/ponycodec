// Pony Town save codec - byte compatible port of the original
// `src/ts/common/compressPony.ts` (0.53.1-alpha).
//
// The only structural difference to the original is that the sprite tables
// are not hard-coded: the number of types/patterns and the colour count of
// every (type, pattern) pair are read from the extracted sprite schema
// (`src/schemaData.ts`), which is generated from the original build.

import { findLastIndex, toInt, pushUniq, array, clamp, includes, att, merge } from './utils';
import { fromByteArray, toByteArray } from './base64';
import { bitWriter, bitReader, ReadBits, WriteBits, countBits, numberToBitCount } from './bitUtils';
import { BLACK, WHITE, TRANSPARENT } from './colors';
import { parseColorFast, colorToHexRGB } from './color';
import { CM_SIZE, MAX_COLORS, SLEEVED_ACCESSORIES } from './constants';
import { getSetField, SchemaSetField } from './schema';
import { syncLockedPonyInfoNumber, syncLockedPonyInfo, createBasePony } from './ponyInfo';
import { PonyInfoNumber, SpriteSet, PonyInfo, PonyInfoBase } from './interfaces';

export const VERSION = 4;

interface FieldDefinition<T> {
	name: keyof PonyInfo;
	default?: T;
	omit?: (info: PonyInfoBase<any, SpriteSet<any>>) => boolean;
	dontSave?: boolean;
}

interface SetDefinition extends FieldDefinition<PrecompressedSet> {
	preserveOnZero?: boolean;
	minColors?: number;
}

export interface PrecompressedSet {
	type: number;
	pattern: number;
	colors: number;
	fillLocks: number;
	fills: number[];
	outlineLocks: number;
	outlines: number[];
}

export interface Precompressed {
	version: number;
	colors: number[];
	setFields: (PrecompressedSet | undefined)[];
	colorFields: number[];
	numberFields: number[];
	booleanFields: boolean[];
	cm: number[];
}

const identity = <T>(x: T) => x;
const not = <T>(x: T) => !x;

function emptyOrUnlocked<T>(set: SpriteSet<T> | undefined): boolean {
	return !set || !set.type || !set.lockFills || set.lockFills.every(x => !x);
}

function emptyOrZeroLocked<T>(set: SpriteSet<T> | undefined, customOutlines: boolean): boolean {
	return !set || (
		set.type === 0 && set.pattern === 0 && set.lockFills !== undefined && set.lockFills[0] === true &&
		(!customOutlines || (set.lockOutlines !== undefined && set.lockOutlines[0] === true)));
}

function empty<T>(set: SpriteSet<T> | undefined): boolean {
	return !set || !set.type;
}

function omitMane(info: PonyInfoNumber) {
	return empty(info.mane) && emptyOrUnlocked(info.backMane)
		&& emptyOrUnlocked(info.tail) && emptyOrUnlocked(info.facialHair);
}

function omitHead(info: PonyInfoNumber): boolean {
	return emptyOrZeroLocked(info.head, !!info.customOutlines);
}

function omitSleeves(info: PonyInfoNumber) {
	return !info.chestAccessory || !includes(SLEEVED_ACCESSORIES, toInt(info.chestAccessory.type));
}

function omitFrontHooves(info: PonyInfoNumber) {
	return empty(info.frontHooves) && emptyOrUnlocked(info.backHooves);
}

function readTimes(read: ReadBits, count: number, bitsPerItem: number): number[] {
	const result: number[] = [];

	for (let i = 0; i < count; i++) {
		result[i] = read(bitsPerItem);
	}

	return result;
}

// NOTE: do not reorder or remove - the order is part of the wire format
const setFieldDefs: { name: keyof PonyInfo; omit?: (info: any) => boolean; }[] = [
	{ name: 'extraAccessory' },
	{ name: 'nose' },
	{ name: 'ears' },
	{ name: 'mane', omit: omitMane },
	{ name: 'backMane' },
	{ name: 'tail' },
	{ name: 'horn' },
	{ name: 'wings' },
	{ name: 'frontHooves', omit: omitFrontHooves },
	{ name: 'backHooves' },
	{ name: 'facialHair' },
	{ name: 'headAccessory' },
	{ name: 'earAccessory' },
	{ name: 'faceAccessory' },
	{ name: 'neckAccessory' },
	{ name: 'frontLegAccessory' },
	{ name: 'backLegAccessory', omit: info => !!info.lockBackLegAccessory },
	{ name: 'backAccessory' },
	{ name: 'waistAccessory' },
	{ name: 'chestAccessory' },
	{ name: 'sleeveAccessory', omit: omitSleeves },
	{ name: 'head', omit: omitHead },
	{ name: 'frontLegAccessoryRight', omit: info => !info.unlockFrontLegAccessory },
	{ name: 'backLegAccessoryRight', omit: info => !info.unlockBackLegAccessory || !!info.lockBackLegAccessory },
];

const setFields: SetDefinition[] = setFieldDefs.map(def => {
	const field: SchemaSetField = getSetField(def.name as string);

	return {
		name: def.name,
		preserveOnZero: field.preserveOnZero,
		minColors: field.minColors,
		omit: def.omit,
	};
});

const booleanFields: FieldDefinition<boolean>[] = [
	{ name: 'customOutlines' },
	{ name: 'lockEyes' },
	{ name: 'lockEyeColor' },
	{ name: 'lockCoatOutline', omit: info => !info.customOutlines },
	{
		name: 'lockBackLegAccessory', omit: info =>
			empty(info.frontLegAccessory) && empty(info.backLegAccessory) &&
			empty(info.frontLegAccessoryRight) && empty(info.backLegAccessoryRight)
	},
	{ name: 'eyeshadow' },
	{ name: 'cmFlip', omit: info => info.cm === undefined || info.cm.every(not) },
	{ name: 'unlockEyeWhites' },
	{ name: 'freeOutlines' },
	{ name: 'unlockFrontLegAccessory' },
	{ name: 'unlockBackLegAccessory', omit: info => !!info.lockBackLegAccessory },
	{ name: 'unlockEyelashColor' },
	{ name: 'darkenLockedOutlines', omit: info => !info.freeOutlines },
];

const numberFields: FieldDefinition<number>[] = [
	{ name: 'eyelashes' },
	{ name: 'eyeOpennessRight' },
	{ name: 'eyeOpennessLeft', omit: info => !!info.lockEyes },
	{ name: 'fangs' },
	{ name: 'muzzle' },
	{ name: 'freckles', dontSave: true }, // TODO: remove
];

const colorFields: FieldDefinition<number>[] = [
	{ name: 'coatFill' },
	{ name: 'coatOutline', omit: info => !info.customOutlines || !!info.lockCoatOutline },
	{ name: 'eyeColorRight' },
	{ name: 'eyeColorLeft', omit: info => !!info.lockEyeColor },
	{ name: 'eyeWhites', default: WHITE },
	{ name: 'eyeshadowColor', omit: info => !info.eyeshadow },
	{ name: 'frecklesColor', omit: info => !info.freckles, dontSave: true }, // TODO: remove
	{ name: 'eyeWhitesLeft', default: WHITE, omit: info => !info.unlockEyeWhites },
	{ name: 'eyelashColor' },
	{ name: 'eyelashColorLeft', omit: info => !info.unlockEyelashColor },
	{ name: 'magicColor', default: WHITE },
];

const omittableFields: FieldDefinition<any>[] = [
	...setFields,
	...booleanFields,
	...numberFields,
	...colorFields,
].filter(f => !!f.omit);

const VERSION_BITS = 6; // max 63
const COLORS_LENGTH_BITS = 10; // max 1024
const BOOLEAN_FIELDS_LENGTH_BITS = 4; // max 15
const NUMBER_FIELDS_LENGTH_BITS = 4; // max 15
const COLOR_FIELDS_LENGTH_BITS = 4; // max 15
const SET_FIELDS_LENGTH_BITS = 6; // max 63
const CM_LENGTH_BITS = 5; // max 31
const NUMBERS_BITS = 6; // max 63

function trimRight<T>(items: T[]): T[] {
	const index = findLastIndex(items, x => !!x);
	return (index !== (items.length - 1)) ? items.slice(0, index + 1) : items;
}

export function precompressCM<T>(cm: (T | undefined)[] | undefined, addColor: (color: T | undefined) => number): number[] {
	const result: number[] = [];

	if (cm) {
		let length = CM_SIZE * CM_SIZE;

		while (length > 0 && !cm[length - 1]) {
			length--;
		}

		for (let i = 0; i < length; i++) {
			result.push(addColor(cm[i]));
		}
	}

	return result;
}

// lock sets

export function compressLockSet(set: boolean[] | undefined, count: number): number {
	const locks = set && set.slice ? set.slice(0, count) : [];
	return locks.reduce((result, l, i) => result | (l ? (1 << i) : 0), 0);
}

export function decompressLockSet(set: number, count: number, defaultValues: boolean[]): boolean[] {
	const result: boolean[] = [];

	for (let i = 0; i < MAX_COLORS; i++) {
		result[i] = i < count ? !!(set & (1 << i)) : defaultValues[i];
	}

	return result;
}

// colors

export function precompressColorSet<T>(
	set: (T | undefined)[] | undefined, count: number, locks: number, defaultColor: T, addColor: (color: T) => number
): number[] {
	const result: number[] = [];

	if (set) {
		for (let i = 0; i < count; i++) {
			if ((locks & (1 << i)) === 0) {
				const color = set[i];
				result.push(!color || color === defaultColor ? 0 : addColor(color));
			}
		}
	}

	return result;
}

export function postdecompressColorSet<T>(
	colors: number[], count: number, locks: number, colorList: number[], parseColor: (color: number) => T
): T[] {
	const result: T[] = [];

	for (let i = 0, j = 0; i < count; i++) {
		const locked = (locks & (1 << i)) !== 0;
		result.push(parseColor((locked ? 0 : colorList[colors[j++] - 1]) || BLACK));
	}

	return result;
}

// set

const ALL_UNLOCKED = array(MAX_COLORS, false);
const ALL_LOCKED = array(MAX_COLORS, true);

export function precompressSet<T>(
	set: SpriteSet<T> | undefined, def: SetDefinition, customOutlines: boolean, defaultColor: T, addColor: (color: T) => number
): PrecompressedSet | undefined {
	if (!set)
		return undefined;

	const field = getSetField(def.name as string);
	const type = clamp(toInt(set.type), 0, field.types.length - 1);

	if (type === 0 && !def.preserveOnZero)
		return undefined;

	const patterns = field.types[type];
	const pattern = clamp(toInt(set.pattern), 0, patterns ? patterns.length - 1 : 0);
	const colorCount = patterns ? (patterns[pattern] || 0) : 0;
	const colors = Math.max(colorCount, def.minColors || 0);

	if (type === 0 && pattern === 0 && colors === 0)
		return undefined;

	const fillLocks = compressLockSet(set.lockFills, colors);
	const fills = precompressColorSet(set.fills, colors, fillLocks, defaultColor, addColor);
	const outlineLocks = customOutlines ? compressLockSet(set.lockOutlines, colors) : 0;
	const outlines = customOutlines ? precompressColorSet(set.outlines, colors, outlineLocks, defaultColor, addColor) : [];

	return { type, pattern, colors, fillLocks, fills, outlineLocks, outlines };
}

export function postdecompressSet<T>(
	set: PrecompressedSet, _def: SetDefinition, customOutlines: boolean, colorList: number[], parseColor: (color: number) => T
): SpriteSet<T> | undefined {
	return {
		type: set.type,
		pattern: set.pattern,
		lockFills: decompressLockSet(set.fillLocks, set.colors, ALL_UNLOCKED),
		fills: postdecompressColorSet(set.fills, set.colors, set.fillLocks, colorList, parseColor),
		lockOutlines: customOutlines ?
			decompressLockSet(set.outlineLocks, set.colors, ALL_LOCKED) :
			ALL_LOCKED,
		outlines: customOutlines ? postdecompressColorSet(set.outlines, set.colors, set.outlineLocks, colorList, parseColor) : [],
	};
}

// helpers

function precompressFields<TDef extends FieldDefinition<TResult>, TValue, TResult>(
	data: any, defs: TDef[], defaultValue: TResult, encode: (value: TValue | undefined, def: TDef) => TResult
): TResult[] {
	return trimRight(defs.map(def => {
		if (def.dontSave || (def.omit && def.omit(data))) {
			return defaultValue;
		} else {
			return encode(data[def.name], def);
		}
	}));
}

function postdecompressFields<TDef extends FieldDefinition<TValue>, TValue, TResult>(
	result: any, defs: TDef[], values: (TValue | undefined)[], defaultValue: TValue, decode: (value: TValue, def: TDef) => TResult
): void {
	for (let i = 0; i < defs.length; i++) {
		const def = defs[i];
		const value = i >= values.length ? undefined : values[i];
		result[def.name] = decode(value === undefined ? defaultValue : value, def);
	}
}

// pony

type Info<T> = PonyInfoBase<T, SpriteSet<T>>;

export function precompressPony<T>(info: Info<T>, defaultColor: T, parseColor: (color: T) => number): Precompressed {
	const colors: number[] = [];
	const customOutlines = !!info.customOutlines;
	const addColor = (color: T | undefined) => {
		const c = color === undefined ? 0 : parseColor(color);
		return c === 0 ? 0 : pushUniq(colors, c);
	};

	return {
		version: VERSION,
		colors,
		booleanFields: precompressFields(info, booleanFields, false as boolean, x => !!x),
		numberFields: precompressFields(info, numberFields, 0, toInt),
		colorFields: precompressFields(info, colorFields, 0,
			(x: T | undefined, def) => (x === undefined || parseColor(x) === (def.default || BLACK)) ? 0 : addColor(x)),
		setFields: precompressFields(info, setFields, undefined,
			(x: SpriteSet<T> | undefined, def: SetDefinition) => precompressSet(x, def, customOutlines, defaultColor, addColor)),
		cm: precompressCM(info.cm, addColor),
	};
}

const frecklesToPattern = [0, 1, 1, 2, 2, 2, 1];
const frecklesToColor: number[][] = [[], [1], [1, 2], [2], [1], [1, 2], [2]];

function fixVersion<T>(result: Info<T>, data: Precompressed, parseColor: (color: number) => T): void {
	if (data.version < 3) {
		result.head = {
			type: 0,
			pattern: frecklesToPattern[result.freckles || 0] || 0,
			fills: [result.coatFill],
			outlines: [result.coatOutline],
			lockFills: [true, true, true, true, true, true],
			lockOutlines: [true, true, true, true, true, true],
		};

		frecklesToColor[result.freckles || 0].forEach(index => {
			result.head!.fills![index] = result.frecklesColor || parseColor(BLACK);
			result.head!.lockFills![index] = false;
		});
	}
}

export function postdecompressPony<T>(data: Precompressed, parseColor: (color: number) => T): Info<T> {
	// NOTE: this is the readable equivalent of the original `fastPostdecompressPony`
	// (which is the same function generated by `new Function` for speed)

	const result: Info<T> = {} as any;
	postdecompressFields(result, booleanFields, data.booleanFields, false as boolean, identity);
	postdecompressFields(result, numberFields, data.numberFields, 0 as number, identity);
	postdecompressFields(result, colorFields, data.colorFields, 0 as number,
		(x, def) => parseColor(data.colors[x - 1] || def.default || BLACK));
	const customOutlines = !!result.customOutlines;
	postdecompressFields(result, setFields, data.setFields, undefined,
		(x, def) => x === undefined ? undefined : postdecompressSet(x, def, customOutlines, data.colors, parseColor));

	result.cm = data.cm.length ? data.cm.map(x => parseColor(data.colors[x - 1] || TRANSPARENT)) : undefined;

	omittableFields.forEach(def => {
		if (def.omit && def.omit(result)) {
			result[def.name] = undefined;
		}
	});

	fixVersion(result, data, parseColor);

	return result;
}

// set

const TYPE_BITS = 5; // max 31
const PATTERN_BITS = 4; // max 15
const COLORS_BITS = 3; // max 7

export function writeSet(write: WriteBits, colorBits: number, customOutlines: boolean, set: PrecompressedSet | undefined): void {
	write(set ? 1 : 0, 1);

	if (set) {
		write(set.type, TYPE_BITS);
		write(set.pattern, PATTERN_BITS);
		write(set.colors - 1, COLORS_BITS);
		write(set.fillLocks, set.colors);
		set.fills.forEach(c => write(c, colorBits));

		if (customOutlines) {
			write(set.outlineLocks, set.colors);
			set.outlines.forEach(c => write(c, colorBits));
		}
	}
}

export function readSet(read: ReadBits, colorBits: number, customOutlines: boolean): PrecompressedSet | undefined {
	const has = read(1);

	if (has) {
		const type = read(TYPE_BITS);
		const pattern = read(PATTERN_BITS);
		const colors = read(COLORS_BITS) + 1;
		const fillLocks = read(colors);
		const fills = readTimes(read, colors - countBits(fillLocks), colorBits);
		const outlineLocks = customOutlines ? read(colors) : 0;
		const outlines = customOutlines ? readTimes(read, colors - countBits(outlineLocks), colorBits) : [];
		return { type, pattern, colors, fillLocks, fills, outlineLocks, outlines };
	} else {
		return undefined;
	}
}

// helpers

function writeFields<T>(write: WriteBits, lengthBits: number, fields: T[], writeField: (value: T) => void): void {
	write(fields.length, lengthBits);
	fields.forEach(writeField);
}

function readFields<T>(read: ReadBits, lengthBits: number, readField: (read: ReadBits) => T): T[] {
	const length = read(lengthBits);
	const result: T[] = [];

	for (let i = 0; i < length; i++) {
		result.push(readField(read));
	}

	return result;
}

// pony

export function writePony(write: WriteBits, data: Precompressed): void {
	const colorBits = Math.max(numberToBitCount(data.colors.length), 1);
	const customOutlines = !!data.booleanFields[0];
	write(data.version, VERSION_BITS);
	writeFields(write, COLORS_LENGTH_BITS, data.colors, x => write(x >> 8, 24));
	writeFields(write, BOOLEAN_FIELDS_LENGTH_BITS, data.booleanFields, x => write(x ? 1 : 0, 1));
	writeFields(write, NUMBER_FIELDS_LENGTH_BITS, data.numberFields, x => write(x, NUMBERS_BITS));
	writeFields(write, COLOR_FIELDS_LENGTH_BITS, data.colorFields, x => write(x, colorBits));
	writeFields(write, SET_FIELDS_LENGTH_BITS, data.setFields, x => writeSet(write, colorBits, customOutlines, x));
	writeFields(write, CM_LENGTH_BITS, data.cm, x => write(x, colorBits));
}

const readColorValue = (read: ReadBits) => ((read(24) << 8) | 0xff) >>> 0;
const readBoolean = (read: ReadBits) => !!read(1);
const readBits = (bits: number) => (read: ReadBits) => read(bits);
const readNumber = readBits(NUMBERS_BITS);

export function readPony(read: ReadBits): Precompressed {
	const version = read(VERSION_BITS);

	if (version > VERSION) {
		throw new Error('Invalid version');
	}

	const colors = readFields(read, COLORS_LENGTH_BITS, readColorValue);
	const colorBits = Math.max(numberToBitCount(colors.length), 1);
	const readColor = readBits(colorBits);
	const booleanFields = readFields(read, BOOLEAN_FIELDS_LENGTH_BITS, readBoolean);
	const customOutlines = !!booleanFields[0];
	const numberFields = readFields(read, NUMBER_FIELDS_LENGTH_BITS, readNumber);
	const colorFields = readFields(read, COLOR_FIELDS_LENGTH_BITS, readColor);
	const setFields = readFields(read, version < 4 ? 5 : SET_FIELDS_LENGTH_BITS, read => readSet(read, colorBits, customOutlines));
	const cm = readFields(read, CM_LENGTH_BITS, readColor);
	return { version, colors, booleanFields, numberFields, colorFields, setFields, cm };
}

function writePonyToString(data: Precompressed): string {
	return fromByteArray(bitWriter(write => writePony(write, data)));
}

function readPonyFromBuffer(info: Uint8Array): Precompressed {
	return readPony(bitReader(info));
}

function readPonyFromString(info: string): Precompressed {
	return info ? readPonyFromBuffer(toByteArray(info)) : {
		version: VERSION,
		colors: [],
		booleanFields: [],
		numberFields: [],
		colorFields: [],
		setFields: [],
		cm: [],
	};
}

// compress

export function compressPony(info: PonyInfoNumber): string {
	return writePonyToString(precompressPony(info, BLACK, identity));
}

export function decompressPony(info: string | Uint8Array): PonyInfoNumber {
	const data = typeof info === 'string' ? readPonyFromString(info) : readPonyFromBuffer(info);
	const pony = postdecompressPony(data, identity);
	return syncLockedPonyInfoNumber(pony);
}

// compress (string)

function parseColorFastSafe(color: string): number {
	return color ? parseColorFast(color) : TRANSPARENT;
}

function colorToString(color: number): string {
	return color ? colorToHexRGB(color) : '';
}

export function compressPonyString(info: PonyInfo): string {
	return writePonyToString(precompressPony(info, '000000', parseColorFastSafe));
}

export function decompressPonyString(info: string, editable = false): PonyInfo {
	const data = readPonyFromString(info);
	const pony = postdecompressPony(data, colorToString);
	const result = editable ? merge(createBasePony(), pony) : pony;
	return syncLockedPonyInfo(result);
}
