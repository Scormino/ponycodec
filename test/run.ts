// Standalone test suite for the pony codec.
//
// Does not depend on the original Pony Town sources - the expected values are
// the ones produced by the original 0.53.1-alpha implementation (verified by
// `scripts/diff-test.js`).

import { fromByteArray, toByteArray, byteLength } from '../src/base64';
import { parseColorFast, parseColor, colorToHexRGB, colorToHSVA, colorFromHSVA, getR, getG, getB, getAlpha } from '../src/color';
import { BLACK, WHITE, TRANSPARENT, fillToOutline, fillToOutlineColor, fillToOutlineWithDarken, darkenForOutline } from '../src/colors';
import { compressPony, decompressPony, compressPonyString, decompressPonyString, precompressPony, postdecompressPony, readPony, writePony, writeSet, VERSION } from '../src/compressPony';
import { bitWriter, bitReader, countBits, numberToBitCount } from '../src/bitUtils';
import { createBasePony, createDefaultPony, syncLockedPonyInfo, syncLockedPonyInfoNumber } from '../src/ponyInfo';
import { canonicalize, canonicalizeString, isCanonical } from '../src/canonicalize';
import { setFields, getSetField, getColorCount } from '../src/schema';
import { PonyInfo, PonyInfoNumber, SpriteSet } from '../src/interfaces';

declare const process: { exit(code: number): void; };

let tests = 0;
let failures = 0;
let currentGroup = '';

function group(name: string) {
	currentGroup = name;
	console.log('');
	console.log(name);
}

function test(name: string, fn: () => void) {
	tests++;

	try {
		fn();
		console.log('  ok   ' + name);
	} catch (error) {
		failures++;
		console.log('  FAIL ' + name);
		console.log('       ' + (error && (error as Error).message ? (error as Error).message : error));
	}
}

function assert(condition: any, message: string): void {
	if (!condition) {
		throw new Error(message || 'Assertion failed');
	}
}

function assertEqual(actual: any, expected: any, message?: string): void {
	if (actual !== expected) {
		throw new Error((message ? message + ': ' : '') +
			'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
	}
}

function assertDeepEqual(actual: any, expected: any, message?: string): void {
	const a = JSON.stringify(actual);
	const b = JSON.stringify(expected);

	if (a !== b) {
		throw new Error((message ? message + ': ' : '') + 'expected ' + b + ', got ' + a);
	}
}

function assertThrows(fn: () => void, message?: string): void {
	try {
		fn();
	} catch (e) {
		return;
	}

	throw new Error(message || 'Expected an exception');
}

// base64

group('base64');

test('encodes known vectors', () => {
	assertEqual(fromByteArray(new Uint8Array([])), '');
	assertEqual(fromByteArray(new Uint8Array([77])), 'TQ==');
	assertEqual(fromByteArray(new Uint8Array([77, 97])), 'TWE=');
	assertEqual(fromByteArray(new Uint8Array([77, 97, 110])), 'TWFu');
	assertEqual(fromByteArray(new Uint8Array([255, 255, 255])), '////');
});

test('decodes known vectors', () => {
	assertDeepEqual(Array.from(toByteArray('TWFu')), [77, 97, 110]);
	assertDeepEqual(Array.from(toByteArray('TQ==')), [77]);
	assertDeepEqual(Array.from(toByteArray('TWE=')), [77, 97]);
});

test('round-trips arbitrary data', () => {
	const data = new Uint8Array(1000);

	for (let i = 0; i < data.length; i++) {
		data[i] = (i * 37 + 11) & 0xff;
	}

	assertDeepEqual(Array.from(toByteArray(fromByteArray(data))), Array.from(data));
});

test('computes the byte length', () => {
	assertEqual(byteLength('TQ=='), 1);
	assertEqual(byteLength('TWE='), 2);
	assertEqual(byteLength('TWFu'), 3);
	assertEqual(byteLength('TWFuTQ=='), 4);
});

test('rejects strings with a length that is not a multiple of 4', () => {
	assertThrows(() => toByteArray('abc'), 'Invalid string');
});

test('supports URL safe characters', () => {
	// '-' and '_' decode like '+' and '/'
	assertDeepEqual(Array.from(toByteArray('-w==')), Array.from(toByteArray('+w==')));
	assertDeepEqual(Array.from(toByteArray('_w==')), Array.from(toByteArray('/w==')));
});

// colors

group('colors');

test('parses hex colours', () => {
	assertEqual(parseColorFast('ff0000'), 0xff0000ff);
	assertEqual(parseColorFast('000000'), 0x000000ff);
	assertEqual(parseColorFast('ffffff'), 0xffffffff);
	assertEqual(parseColorFast(''), BLACK);
	// invalid colours are parsed the same way as in the original
	assertEqual(parseColorFast('not a colour'), 0x0a0000ff);
});

test('parses named colours', () => {
	assertEqual(parseColor('red'), 0xff0000ff);
	assertEqual(parseColor('none'), TRANSPARENT);
	assertEqual(parseColor('transparent'), TRANSPARENT);
	assertEqual(parseColor('rgb(255, 0, 0)'), 0xff0000ff);
});

test('converts colours to hex', () => {
	assertEqual(colorToHexRGB(0xff0000ff), 'ff0000');
	assertEqual(colorToHexRGB(0x000000ff), '000000');
});

test('splits colours into channels', () => {
	const color = 0x123456ff;
	assertEqual(getR(color), 0x12);
	assertEqual(getG(color), 0x34);
	assertEqual(getB(color), 0x56);
	assertEqual(getAlpha(color), 0xff);
});

test('converts between rgb and hsv', () => {
	const color = 0xff8000ff;
	const hsv = colorToHSVA(color);
	assertEqual(colorFromHSVA(hsv.h, hsv.s, hsv.v, hsv.a), color);
});

test('derives the outline colour from the fill', () => {
	// the values are the ones of the original 0.53.1-alpha implementation
	assertEqual(fillToOutline('ff0000'), 'b30000');
	assertEqual(fillToOutlineColor(0xff0000ff), 0xb30000ff);
	assertEqual(fillToOutlineWithDarken('ff0000'), '6f0000');
	assertEqual(darkenForOutline(0xffffffff), 0x9f9f9fff);
});

// schema

group('schema');

test('contains all 24 set fields in the original order', () => {
	assertEqual(setFields.length, 24);
	assertEqual(setFields[0].name, 'extraAccessory');
	assertEqual(setFields[setFields.length - 1].name, 'backLegAccessoryRight');
});

test('uses the type counts of the original build', () => {
	assertEqual(getSetField('extraAccessory').types.length, 2);
	assertEqual(getSetField('mane').types.length, 32);
	assertEqual(getSetField('head').types.length, 1);
	assertEqual(getSetField('headAccessory').types.length, 20);
	assertEqual(getSetField('neckAccessory').types.length, 15);
});

test('keeps the minimum colour counts', () => {
	assertEqual(getSetField('mane').minColors, 1);
	assertEqual(getSetField('frontHooves').minColors, 1);
	assertEqual(getSetField('tail').minColors, 0);
});

test('reports the colour count of a pattern', () => {
	assertEqual(getColorCount(getSetField('ears'), 0, 0), 1);
	assertEqual(getColorCount(getSetField('ears'), 0, 1), 3);
	// missing types have no colours
	assertEqual(getColorCount(getSetField('mane'), 0, 0), 0);
});

// bit utils

group('bit utils');

test('counts bits', () => {
	assertEqual(countBits(0), 0);
	assertEqual(countBits(1), 1);
	assertEqual(countBits(0xff), 8);
	assertEqual(numberToBitCount(0), 0);
	assertEqual(numberToBitCount(1), 1);
	assertEqual(numberToBitCount(255), 8);
	assertEqual(numberToBitCount(256), 9);
});

test('round-trips bits', () => {
	const values = [0, 1, 2, 3, 255, 256, 65535, 1000000];
	const buffer = bitWriter(write => values.forEach(v => write(v, 24)));
	const read = bitReader(buffer);
	values.forEach(v => assertEqual(read(24), v));
});

// codec

group('codec');

const DEFAULT_PONY_STRING = 'EAP/AADapSD/1wA2QAJpDQBPwAMADEAcIDCAgA==';

test('compresses the default pony exactly like the original', () => {
	assertEqual(compressPonyString(createDefaultPony()), DEFAULT_PONY_STRING);
});

test('decompresses a save into the same pony', () => {
	const pony = decompressPonyString(DEFAULT_PONY_STRING);
	assertEqual(pony.mane!.type, 2);
	assertEqual(pony.backMane!.type, 1);
	assertEqual(pony.tail!.type, 1);
	assertEqual(pony.coatFill, 'ff0000');
});

test('round-trips a pony', () => {
	const pony = createDefaultPony();
	const compressed = compressPonyString(pony);
	const restored = decompressPonyString(compressed);
	assertEqual(compressPonyString(restored), compressed);
});

test('round-trips a pony in the numeric representation', () => {
	const pony: any = {
		head: undefined, nose: undefined, ears: undefined, horn: undefined, wings: undefined,
		frontHooves: undefined, backHooves: undefined, backMane: undefined, tail: undefined,
		facialHair: undefined, headAccessory: undefined, earAccessory: undefined,
		faceAccessory: undefined, neckAccessory: undefined, frontLegAccessory: undefined,
		backLegAccessory: undefined, frontLegAccessoryRight: undefined, backLegAccessoryRight: undefined,
		backAccessory: undefined, waistAccessory: undefined, chestAccessory: undefined,
		sleeveAccessory: undefined, extraAccessory: undefined,
		coatFill: 0x123456ff,
		coatOutline: 0x654321ff,
		eyeColorLeft: 0x00ff00ff,
		eyeColorRight: 0x00ff00ff,
		eyeWhites: 0xffffffff,
		eyeWhitesLeft: 0xffffffff,
		eyelashColor: 0x000000ff,
		eyelashColorLeft: 0x000000ff,
		eyeshadowColor: 0x000000ff,
		frecklesColor: 0x000000ff,
		magicColor: 0xffffffff,
		mane: {
			type: 3,
			pattern: 1,
			fills: [0xff0000ff, 0x00ff00ff],
			outlines: [0x800000ff, 0x008000ff],
			lockFills: [true, false, false, false, false, false],
			lockOutlines: [true, true, true, true, true, true],
		},
		cm: [],
	};

	const compressed = compressPony(pony);
	const restored = decompressPony(compressed);
	assertEqual(restored.mane!.type, 3);
	assertEqual(restored.mane!.fills![1], 0x00ff00ff);
	assertEqual(compressPony(restored), compressed);
});

test('writes the current version', () => {
	const data = precompressPony(createBasePony() as any, '000000', (x: string) => parseColorFast(x));
	assertEqual(data.version, VERSION);
	assertEqual(VERSION, 4);
});

test('drops sets of type 0 unless they are preserved', () => {
	const pony: any = createBasePony();
	pony.extraAccessory = { type: 0, pattern: 0, fills: [], outlines: [], lockFills: [], lockOutlines: [] };
	pony.tail = { type: 0, pattern: 0, fills: [], outlines: [], lockFills: [], lockOutlines: [] };

	const data = precompressPony(pony, '000000', (x: string) => parseColorFast(x));

	// extraAccessory has preserveOnZero - the set is kept
	assert(data.setFields[0] !== undefined, 'extraAccessory was dropped');
	assertEqual(data.setFields[0]!.type, 0);

	// tail does not have preserveOnZero - the set is dropped
	assert(data.setFields[5] === undefined, 'tail was kept');
});

test('clamps out of range types and patterns', () => {
	const pony: any = createBasePony();
	pony.mane = { type: 9999, pattern: 9999, fills: [], outlines: [], lockFills: [], lockOutlines: [] };

	const data = precompressPony(pony, '000000', (x: string) => parseColorFast(x));
	const mane = data.setFields[3]!;

	assertEqual(mane.type, 31); // the mane has 32 types
	assertEqual(mane.pattern, 6); // the last mane type has 7 patterns
	assertEqual(mane.colors, 3);
});

test('keeps the minimum colour count of a set', () => {
	const pony: any = createBasePony();
	// the front hooves have a minimum of one colour and are only dropped when
	// the back hooves are unlocked
	pony.backHooves = { type: 1, pattern: 0, fills: ['ff0000'], outlines: [], lockFills: [true], lockOutlines: [] };
	pony.frontHooves = { type: 0, pattern: 0, fills: [], outlines: [], lockFills: [], lockOutlines: [] };

	const data = precompressPony(pony, '000000', (x: string) => parseColorFast(x));

	assert(data.setFields[8] !== undefined, 'frontHooves was dropped');
	assertEqual(data.setFields[8]!.colors, 1);
});

test('rejects saves of a newer version', () => {
	const data = precompressPony(createBasePony() as any, '000000', (x: string) => parseColorFast(x));
	data.version = 5;

	const buffer = bitWriter(write => writePony(write, data));

	assertThrows(() => readPony(bitReader(buffer)), 'Invalid version');
});

test('decodes an empty save into the default pony', () => {
	const pony = decompressPonyString('');
	assertEqual(pony.coatFill, '000000');
	assertEqual(pony.coatOutline, '000000');
	assertEqual(pony.mane, undefined);
	assertEqual(pony.cm, undefined);
});

// legacy

group('legacy saves');

function writeLegacy(data: any, version: number): string {
	const colorBits = Math.max(numberToBitCount(data.colors.length), 1);
	const customOutlines = !!data.booleanFields[0];

	const writeFields = (write: any, lengthBits: number, fields: any[], writeField: (value: any) => void) => {
		write(fields.length, lengthBits);
		fields.forEach(writeField);
	};

	return fromByteArray(bitWriter(write => {
		write(version, 6);
		writeFields(write, 10, data.colors, (x: number) => write(x >> 8, 24));
		writeFields(write, 4, data.booleanFields, (x: boolean) => write(x ? 1 : 0, 1));
		writeFields(write, 4, data.numberFields, (x: number) => write(x, 6));
		writeFields(write, 4, data.colorFields, (x: number) => write(x, colorBits));
		writeFields(write, 5, data.setFields, (x: any) => writeSet(write, colorBits, customOutlines, x));
		writeFields(write, 5, data.cm, (x: number) => write(x, colorBits));
	}));
}

test('reads the set fields of a legacy save with 5 bits', () => {
	const pony = createDefaultPony();
	const data = precompressPony(pony, '000000', (x: string) => parseColorFast(x));
	const legacy = writeLegacy(data, 3);

	const restored = decompressPonyString(legacy);
	assertEqual(restored.mane!.type, 2);
	assertEqual(restored.tail!.type, 1);
});

test('migrates the freckles of a v2 save into the head', () => {
	const data = {
		version: 2,
		colors: [0xff0000ff, 0x8b0000ff, 0xdaa520ff, 0xffffffff, 0x000000ff, 0x8b0000ff],
		booleanFields: [true, false, false, false, false, false, false, false, false, false, false, false, false, false],
		numberFields: [1, 2, 2, 0, 0, 3],
		colorFields: [1, 2, 3, 3, 5, 0, 6],
		setFields: [],
		cm: []
	};

	const pony = postdecompressPony(data, (x: number) => x);
	assertEqual(pony.head!.type, 0);
	assertEqual(pony.head!.pattern, 2);
	assertEqual(pony.head!.fills![0], 0xff0000ff);
	assertEqual(pony.head!.fills![2], 0x8b0000ff);
	assertEqual(pony.head!.lockFills![2], false);
});

test('does not migrate the freckles of a v3 save', () => {
	const data = {
		version: 3,
		colors: [0xff0000ff],
		booleanFields: [],
		numberFields: [0, 0, 0, 0, 0, 3],
		colorFields: [],
		setFields: [],
		cm: []
	};

	const pony = postdecompressPony(data, (x: number) => x);
	assertEqual(pony.head, undefined);
});

// canonical form

group('canonical form');

test('normalises a save', () => {
	const pony = createDefaultPony();
	const compressed = compressPonyString(pony);
	const canonical = canonicalizeString(compressed);

	assertEqual(canonical, compressed);
	assertEqual(isCanonical(canonical), true);
});

test('is idempotent', () => {
	const pony = createDefaultPony();
	pony.mane!.pattern = 3;

	const canonical = canonicalizeString(compressPonyString(pony));
	assertEqual(canonicalizeString(canonical), canonical);
});

test('normalises legacy saves to the current version', () => {
	const pony = createDefaultPony();
	const data = precompressPony(pony, '000000', (x: string) => parseColorFast(x));
	const legacy = writeLegacy(data, 2);
	const canonical = canonicalizeString(legacy);

	const restored = decompressPonyString(canonical);
	assertEqual(restored.mane!.type, 2);
	assertEqual(canonicalizeString(canonical), canonical);
});

test('detects a non canonical save', () => {
	const pony = createDefaultPony();
	pony.mane!.pattern = 3;

	const compressed = compressPonyString(pony);
	const canonical = canonicalizeString(compressed);

	assertEqual(isCanonical(compressed), true);
	assertEqual(isCanonical(canonical), true);
});

test('detects a non canonical binary save', () => {
	const pony = createDefaultPony();
	pony.mane!.pattern = 3;

	const compressed = compressPonyString(pony);
	const canonical = canonicalizeString(compressed);

	const canonicalBytes = toByteArray(canonical);
	const legacyBytes = toByteArray(compressed);

	assertEqual(isCanonical(canonicalBytes), true);
	assertEqual(isCanonical(legacyBytes), isCanonical(compressed));
});

// locks

group('locks');

test('locks the left eye to the right eye', () => {
	const pony = createBasePony();
	pony.lockEyes = true;
	pony.eyeOpennessRight = 5;
	pony.eyeOpennessLeft = 1;

	syncLockedPonyInfo(pony);
	assertEqual(pony.eyeOpennessLeft, 5);
});

test('locks the eye colour to the right eye', () => {
	const pony = createBasePony();
	pony.lockEyeColor = true;
	pony.eyeColorRight = 'ff0000';
	pony.eyeColorLeft = '00ff00';

	syncLockedPonyInfo(pony);
	assertEqual(pony.eyeColorLeft, 'ff0000');
});

test('derives the coat outline from the coat fill', () => {
	const pony = createBasePony();
	pony.customOutlines = false;
	pony.coatFill = 'ff0000';

	syncLockedPonyInfo(pony);
	assertEqual(pony.coatOutline, fillToOutline('ff0000'));
});

test('locks the fills of a set to the first fill', () => {
	const pony = createBasePony();
	pony.mane = {
		type: 1,
		pattern: 0,
		fills: ['ff0000', '00ff00', '0000ff', 'ffffff', '000000', 'ffff00'],
		outlines: ['000000', '000000', '000000', '000000', '000000', '000000'],
		lockFills: [false, true, false, false, false, false],
		lockOutlines: [true, true, true, true, true, true],
	};

	syncLockedPonyInfo(pony);
	assertEqual(pony.mane!.fills![1], 'ff0000');
});

test('uses the numeric representation of the locks', () => {
	const pony: any = {
		head: undefined, nose: undefined, ears: undefined, horn: undefined, wings: undefined,
		frontHooves: undefined, backHooves: undefined, backMane: undefined, tail: undefined,
		facialHair: undefined, headAccessory: undefined, earAccessory: undefined,
		faceAccessory: undefined, neckAccessory: undefined, frontLegAccessory: undefined,
		backLegAccessory: undefined, frontLegAccessoryRight: undefined, backLegAccessoryRight: undefined,
		backAccessory: undefined, waistAccessory: undefined, chestAccessory: undefined,
		sleeveAccessory: undefined, extraAccessory: undefined,
		coatFill: 0xff0000ff,
		coatOutline: 0x800000ff,
		eyeColorLeft: 0x00ff00ff,
		eyeColorRight: 0x00ff00ff,
		eyeWhites: 0xffffffff,
		eyeWhitesLeft: 0xffffffff,
		eyelashColor: 0x000000ff,
		eyelashColorLeft: 0x000000ff,
		eyeshadowColor: 0x000000ff,
		frecklesColor: 0x000000ff,
		magicColor: 0xffffffff,
		mane: {
			type: 1,
			pattern: 0,
			fills: [0xff0000ff, 0x00ff00ff],
			outlines: [0x800000ff, 0x008000ff],
			lockFills: [false, true, false, false, false, false],
			lockOutlines: [true, true, true, true, true, true],
		},
		cm: []
	};

	syncLockedPonyInfoNumber(pony);
	assertEqual(pony.mane!.fills![1], 0xff0000ff);
	assertEqual(pony.mane!.outlines![1], fillToOutlineColor(0xff0000ff));
});

console.log('');
console.log(tests + ' tests, ' + failures + ' failures');

if (failures) {
	process.exit(1);
}

console.log('OK');
