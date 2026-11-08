// Differential test: the ported codec vs. the original Pony Town 0.53.1-alpha
// implementation (compiled `src/scripts` of the original repository).
//
// Runs on Node 9.

'use strict';

global.DEVELOPMENT = false;
global.SERVER = true;
global.CLIENT = false;
global.PRODUCTION = false;

const path = require('path');

const ROOT = path.join(__dirname, '..');
const ORIGINAL = path.join(ROOT, 'pony-town-src', 'src', 'scripts');
const PORT = path.join(ROOT, 'dist', 'src');

const original = require(path.join(ORIGINAL, 'common', 'compressPony.js'));
const originalInfo = require(path.join(ORIGINAL, 'common', 'ponyInfo.js'));

const port = require(path.join(PORT, 'compressPony.js'));
const portInfo = require(path.join(PORT, 'ponyInfo.js'));
const portBitUtils = require(path.join(PORT, 'bitUtils.js'));
const portBase64 = require(path.join(PORT, 'base64.js'));

// legacy writer: identical to the v4 writer, but the number of set fields is
// written with 5 bits and the version is < 4
function writeLegacyPony(data, version) {
	const colorBits = Math.max(portBitUtils.numberToBitCount(data.colors.length), 1);
	const customOutlines = !!data.booleanFields[0];

	const writeFields = (write, lengthBits, fields, writeField) => {
		write(fields.length, lengthBits);
		fields.forEach(writeField);
	};

	return portBase64.fromByteArray(portBitUtils.bitWriter(write => {
		write(version, 6);
		writeFields(write, 10, data.colors, x => write(x >> 8, 24));
		writeFields(write, 4, data.booleanFields, x => write(x ? 1 : 0, 1));
		writeFields(write, 4, data.numberFields, x => write(x, 6));
		writeFields(write, 4, data.colorFields, x => write(x, colorBits));
		writeFields(write, 5, data.setFields, x => port.writeSet(write, colorBits, customOutlines, x));
		writeFields(write, 5, data.cm, x => write(x, colorBits));
	}));
}

let failures = 0;
let checks = 0;

function fail(message) {
	failures++;
	console.log('  FAIL: ' + message);
}

function check(condition, message) {
	checks++;

	if (!condition) {
		fail(message);
	}
}

function deepEqual(a, b, path, diff) {
	if (a === b) {
		return true;
	}

	if (typeof a !== typeof b) {
		diff.push(path + ': type ' + typeof a + ' !== ' + typeof b);
		return false;
	}

	if (a === null || b === null || typeof a !== 'object') {
		diff.push(path + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b));
		return false;
	}

	if (Array.isArray(a) !== Array.isArray(b)) {
		diff.push(path + ': array mismatch');
		return false;
	}

	if (Array.isArray(a)) {
		if (a.length !== b.length) {
			diff.push(path + ': length ' + a.length + ' !== ' + b.length);
			return false;
		}

		for (let i = 0; i < a.length; i++) {
			if (!deepEqual(a[i], b[i], path + '[' + i + ']', diff)) {
				return false;
			}
		}

		return true;
	}

	const keysA = Object.keys(a);
	const keysB = Object.keys(b);

	if (keysA.length !== keysB.length) {
		diff.push(path + ': keys ' + JSON.stringify(keysA) + ' !== ' + JSON.stringify(keysB));
		return false;
	}

	for (const key of keysA) {
		if (!Object.prototype.hasOwnProperty.call(b, key)) {
			diff.push(path + '.' + key + ': missing');
			return false;
		}

		if (!deepEqual(a[key], b[key], path + '.' + key, diff)) {
			return false;
		}
	}

	return true;
}

// turns a PalettePonyInfo into a plain object that can be compared:
// the palettes are reduced to their colour arrays
function normalizePalette(info) {
	const result = {};

	for (const key of Object.keys(info)) {
		const value = info[key];

		if (value && typeof value === 'object' && value.colors) {
			result[key] = {
				type: value.type,
				pattern: value.pattern,
				colors: Array.prototype.slice.call(value.palette ? value.palette.colors : value.colors),
				extra: value.extraPalette
					? Array.prototype.slice.call(value.extraPalette.colors)
					: undefined,
			};
		} else if (value && typeof value === 'object' && value.palette) {
			result[key] = {
				type: value.type,
				pattern: value.pattern,
				colors: Array.prototype.slice.call(value.palette.colors),
				extra: value.extraPalette
					? Array.prototype.slice.call(value.extraPalette.colors)
					: undefined,
			};
		} else {
			result[key] = value;
		}
	}

	return result;
}

function compare(label, a, b) {
	const diff = [];
	checks++;

	if (!deepEqual(a, b, label, diff)) {
		fail(label + '\n        ' + diff.join('\n        '));
		return false;
	}

	return true;
}

// random helpers (deterministic)

let seed = 0x12345678;

function rnd() {
	seed ^= seed << 13; seed >>>= 0;
	seed ^= seed >> 17;
	seed ^= seed << 5; seed >>>= 0;
	return seed / 0x100000000;
}

function rndInt(max) {
	return Math.floor(rnd() * max) % Math.max(1, max);
}

const SET_FIELD_NAMES = [
	'extraAccessory', 'nose', 'ears', 'mane', 'backMane', 'tail', 'horn', 'wings',
	'frontHooves', 'backHooves', 'facialHair', 'headAccessory', 'earAccessory',
	'faceAccessory', 'neckAccessory', 'frontLegAccessory', 'backLegAccessory',
	'backAccessory', 'waistAccessory', 'chestAccessory', 'sleeveAccessory', 'head',
	'frontLegAccessoryRight', 'backLegAccessoryRight'
];

const TYPE_COUNTS = {
	extraAccessory: 2, nose: 3, ears: 6, mane: 32, backMane: 29, tail: 31, horn: 15, wings: 5,
	frontHooves: 6, backHooves: 5, facialHair: 16, headAccessory: 20, earAccessory: 13,
	faceAccessory: 15, neckAccessory: 15, frontLegAccessory: 2, backLegAccessory: 2,
	backAccessory: 6, waistAccessory: 4, chestAccessory: 5, sleeveAccessory: 4, head: 1,
	frontLegAccessoryRight: 2, backLegAccessoryRight: 2
};

function randomColor() {
	const r = rndInt(256);
	const g = rndInt(256);
	const b = rndInt(256);
	return ((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0;
}

function randomColorHex() {
	return ('000000' + randomColor().toString(16)).slice(-6);
}

function randomSet(name, number) {
	const typeCount = TYPE_COUNTS[name];

	if (rnd() < 0.15) {
		return undefined;
	}

	const type = rndInt(typeCount + 2); // sometimes out of range -> clamping
	const pattern = rndInt(8);
	const colorCount = rndInt(7);
	const fills = [];
	const outlines = [];
	const lockFills = [];
	const lockOutlines = [];

	for (let i = 0; i < 6; i++) {
		fills.push(number ? randomColor() : randomColorHex());
		outlines.push(number ? randomColor() : randomColorHex());
		lockFills.push(rnd() < 0.4);
		lockOutlines.push(rnd() < 0.4);
	}

	return { type, pattern, fills, outlines, lockFills, lockOutlines };
}

function randomPony(number) {
	const pony = {
		coatFill: number ? randomColor() : randomColorHex(),
		coatOutline: number ? randomColor() : randomColorHex(),
		lockCoatOutline: rnd() < 0.5,
		eyelashes: rndInt(8),
		eyeColorLeft: number ? randomColor() : randomColorHex(),
		eyeColorRight: number ? randomColor() : randomColorHex(),
		eyeWhitesLeft: number ? randomColor() : randomColorHex(),
		eyeWhites: number ? randomColor() : randomColorHex(),
		eyeOpennessLeft: rndInt(8),
		eyeOpennessRight: rndInt(8),
		eyeshadow: rnd() < 0.5,
		eyeshadowColor: number ? randomColor() : randomColorHex(),
		lockEyes: rnd() < 0.5,
		lockEyeColor: rnd() < 0.5,
		unlockEyeWhites: rnd() < 0.5,
		unlockEyelashColor: rnd() < 0.5,
		eyelashColor: number ? randomColor() : randomColorHex(),
		eyelashColorLeft: number ? randomColor() : randomColorHex(),
		fangs: rndInt(4),
		muzzle: rndInt(4),
		freckles: rndInt(7),
		frecklesColor: number ? randomColor() : randomColorHex(),
		magicColor: number ? randomColor() : randomColorHex(),
		cmFlip: rnd() < 0.5,
		customOutlines: rnd() < 0.5,
		freeOutlines: rnd() < 0.5,
		darkenLockedOutlines: rnd() < 0.5,
		lockBackLegAccessory: rnd() < 0.5,
		unlockFrontLegAccessory: rnd() < 0.5,
		unlockBackLegAccessory: rnd() < 0.5,
		cm: []
	};

	const cmLength = rndInt(26);

	for (let i = 0; i < cmLength; i++) {
		pony.cm.push(number ? randomColor() : randomColorHex());
	}

	for (const name of SET_FIELD_NAMES) {
		pony[name] = randomSet(name, number);
	}

	return pony;
}

function main() {
	console.log('Pony Town codec differential test (original 0.53.1-alpha vs. port)');
	console.log('');

	// 1. default pony

	const origDefault = originalInfo.createDefaultPony();
	const portDefault = portInfo.createDefaultPony();

	const origDefaultStr = original.compressPonyString(origDefault);
	const portDefaultStr = port.compressPonyString(portDefault);

	console.log('default pony (string): ' + origDefaultStr);
	compare('default pony (string) compressed', origDefaultStr, portDefaultStr);

	const origDefaultNum = original.decompressPony(origDefaultStr);
	const portDefaultNum = port.decompressPony(portDefaultStr);
	compare('default pony (number) decompressed', origDefaultNum, portDefaultNum);

	// 2. random ponies

	const COUNT = 2000;

	for (let i = 0; i < COUNT; i++) {
		// string variant
		const a = randomPony(false);

		const sa = original.compressPonyString(a);
		const sb = port.compressPonyString(a);

		if (sa !== sb) {
			fail('random string pony #' + i + ' compressed differently\n        ' + sa + '\n        ' + sb);
			checks++;
			break;
		}

		checks++;

		const da = original.decompressPonyString(sa);
		const db = port.decompressPonyString(sb);
		compare('random string pony #' + i + ' decompressed', da, db);

		// number variant
		const na = randomPony(true);

		const naStr = original.compressPony(na);
		const nbStr = port.compressPony(na);

		if (naStr !== nbStr) {
			fail('random number pony #' + i + ' compressed differently\n        ' + naStr + '\n        ' + nbStr);
			checks++;
			break;
		}

		checks++;

		const dna = original.decompressPony(naStr);
		const dnb = port.decompressPony(nbStr);
		compare('random number pony #' + i + ' decompressed', dna, dnb);

		// cross-check: the port must decode what the original produced
		const crossA = port.decompressPony(naStr);
		compare('random number pony #' + i + ' cross-decode', dna, crossA);

		const crossB = port.decompressPonyString(sa);
		compare('random string pony #' + i + ' cross-decode', da, crossB);
	}

	// 3. canonical form (server behaviour: decompress -> recompress)

	for (let i = 0; i < 200; i++) {
		const info = randomPony(true);
		const compressed = original.compressPony(info);

		const canonOriginal = original.compressPony(original.decompressPony(compressed));
		const canonPort = port.compressPony(port.decompressPony(compressed));

		if (canonOriginal !== canonPort) {
			fail('canonical form #' + i + ' differs\n        ' + canonOriginal + '\n        ' + canonPort);
			checks++;
			break;
		}

		checks++;

		// idempotency of the canonical form
		const canonTwice = port.compressPony(port.decompressPony(canonPort));

		if (canonTwice !== canonPort) {
			fail('canonical form #' + i + ' is not idempotent\n        ' + canonPort + '\n        ' + canonTwice);
			checks++;
			break;
		}

		checks++;
	}

	// 4. legacy saves (v1 / v2 / v3) - the set field length is written with 5
	//    bits instead of 6 and `fixVersion` rebuilds the head from the freckles

	for (const version of [1, 2, 3]) {
		for (let i = 0; i < 100; i++) {
			const info = randomPony(true);
			const legacy = writeLegacyPony(port.precompressPony(info, 0x000000ff, x => x), version);

			const a = original.decompressPony(legacy);
			const b = port.decompressPony(legacy);

			compare('legacy v' + version + ' pony #' + i + ' decompressed', a, b);

			// both must upgrade to the same v4 save
			const ua = original.compressPony(a);
			const ub = port.compressPony(b);

			if (ua !== ub) {
				fail('legacy v' + version + ' pony #' + i + ' upgrade differs\n        ' + ua + '\n        ' + ub);
				checks++;
				break;
			}

			checks++;
		}
	}

	// 5. legacy precompressed structures - `fixVersion` rebuilds the head set
	//    from the freckles for saves older than v3

	for (const version of [1, 2, 3]) {
		for (let freckles = 0; freckles <= 6; freckles++) {
			const data = {
				version,
				colors: [0xff0000ff, 0x8b0000ff, 0xdaa520ff, 0xffffffff, 0x000000ff, 0x8b0000ff],
				booleanFields: [true, false, false, false, false, false, false, false, false, false, false, false, false, false],
				numberFields: [1, 2, 2, 0, 0, freckles],
				colorFields: [1, 2, 3, 3, 5, 0, 6],
				setFields: [],
				cm: []
			};

			const a = original.postdecompressPony(data, x => x);
			const b = port.postdecompressPony(data, x => x);

			compare('legacy v' + version + ' postdecompress (freckles ' + freckles + ')', a, b);
		}
	}

	// 6. palette layer: the same pony must produce the same palettes

	const portPalette = require(path.join(PORT, 'palette.js'));

	for (let i = 0; i < 200; i++) {
		const info = original.decompressPony(original.compressPony(randomPony(true)));

		const pa = originalInfo.toPaletteNumber(info);
		const pb = portPalette.toPaletteNumber(info);

		compare('palette #' + i, normalizePalette(pa), normalizePalette(pb));
	}

	// the string variant uses the same palettes, but parses the colours

	for (let i = 0; i < 50; i++) {
		const info = original.decompressPonyString(original.compressPonyString(randomPony(false)));

		const pa = originalInfo.toPalette(info);
		const pb = portPalette.toPalette(info);

		compare('palette (string) #' + i, normalizePalette(pa), normalizePalette(pb));
	}

	console.log('');
	console.log(checks + ' checks, ' + failures + ' failures');

	if (failures) {
		process.exit(1);
	}

	console.log('OK');
}

main();
