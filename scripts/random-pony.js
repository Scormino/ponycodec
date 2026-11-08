// A deterministic random pony generator, shared by the differential tests.
//
// The generated ponies are valid enough to be encoded by the codec, so they
// can be used both for the codec tests and for the render tests.
'use strict';

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

function createRandom(seed) {
	let state = seed === undefined ? 0x12345678 : seed >>> 0;

	function rnd() {
		state ^= state << 13; state >>>= 0;
		state ^= state >> 17;
		state ^= state << 5; state >>>= 0;
		return state / 0x100000000;
	}

	function rndInt(max) {
		return Math.floor(rnd() * max) % Math.max(1, max);
	}

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

	return { rnd, rndInt, randomColor, randomColorHex, randomSet, randomPony };
}

module.exports = { createRandom, SET_FIELD_NAMES, TYPE_COUNTS };
