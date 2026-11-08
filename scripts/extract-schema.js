// Stage 2: extract the real sprite schema from the original 0.53.1-alpha build.
// Runs on Node 9 against pony-town-src/src/scripts (compiled original).
'use strict';

global.DEVELOPMENT = false;
global.SERVER = true;
global.CLIENT = false;
global.PRODUCTION = false;

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'pony-town-src', 'src', 'scripts');
const OUT = path.join(__dirname, '..', 'schema', 'schema-v4.json');

// require ponyUtils first: it mutates sprites (pops summer hat / headphones),
// exactly like the original module init order in compressPony.js
const sprites = require(path.join(SRC, 'generated', 'sprites.js'));
const ponyUtils = require(path.join(SRC, 'client', 'ponyUtils.js'));
const pkg = require(path.join(__dirname, '..', 'pony-town-src', 'package.json'));

// mirror of compressPony.ts setFields (name -> ColorExtraSets source, minColors)
// NOTE: do not reorder - order is part of the wire format
const setFields = [
	{ name: 'extraAccessory', sets: ponyUtils.mergedExtraAccessories, preserveOnZero: true },
	{ name: 'nose', sets: sprites.noses[0], preserveOnZero: true },
	{ name: 'ears', sets: sprites.ears, preserveOnZero: true },
	{ name: 'mane', sets: ponyUtils.mergedManes, preserveOnZero: true, minColors: 1 },
	{ name: 'backMane', sets: ponyUtils.mergedBackManes },
	{ name: 'tail', sets: sprites.tails[0] },
	{ name: 'horn', sets: sprites.horns },
	{ name: 'wings', sets: sprites.wings[0] },
	{ name: 'frontHooves', sets: ponyUtils.frontHooves[1], preserveOnZero: true, minColors: 1 },
	{ name: 'backHooves', sets: sprites.backLegHooves[1] },
	{ name: 'facialHair', sets: ponyUtils.mergedFacialHair },
	{ name: 'headAccessory', sets: ponyUtils.mergedHeadAccessories },
	{ name: 'earAccessory', sets: sprites.earAccessories },
	{ name: 'faceAccessory', sets: sprites.faceAccessories },
	{ name: 'neckAccessory', sets: sprites.neckAccessories[1] },
	{ name: 'frontLegAccessory', sets: sprites.frontLegAccessories[1] },
	{ name: 'backLegAccessory', sets: sprites.backLegAccessories[1] },
	{ name: 'backAccessory', sets: ponyUtils.mergedBackAccessories },
	{ name: 'waistAccessory', sets: sprites.waistAccessories[1] },
	{ name: 'chestAccessory', sets: sprites.chestAccessories[1] },
	{ name: 'sleeveAccessory', sets: sprites.frontLegSleeves[1], preserveOnZero: true },
	{ name: 'head', sets: sprites.head0[1], preserveOnZero: true },
	{ name: 'frontLegAccessoryRight', sets: sprites.frontLegAccessories[1] },
	{ name: 'backLegAccessoryRight', sets: sprites.backLegAccessories[1] },
];

// client/spriteUtils.ts:26
function getColorCount(sprite) {
	return sprite && sprite.colors ? Math.floor((sprite.colors - 1) / 2) : 0;
}

function spriteRect(sprite) {
	if (!sprite) return null;
	return { x: sprite.x, y: sprite.y, w: sprite.w, h: sprite.h, ox: sprite.ox, oy: sprite.oy, type: sprite.type };
}

function serializePattern(entry) {
	if (!entry) {
		return { colors: 0, sprite: null, extra: null, palettes: null };
	}
	const palettes = entry.palettes
		? entry.palettes.map(p => Array.prototype.slice.call(p))
		: null;
	return {
		colors: getColorCount(entry),
		rawColors: entry.colors === undefined ? null : entry.colors,
		sprite: spriteRect(entry.color),
		extra: spriteRect(entry.extra),
		palettes,
	};
}

function main() {
	if (!setFields.every(f => !!f.sets)) {
		const missing = setFields.filter(f => !f.sets).map(f => f.name);
		throw new Error('Undefined set in setFields: ' + missing.join(', '));
	}

	const schema = {
		version: pkg.version,
		source: 'drewdru/ponyTown@master (compiled src/scripts)',
		sheets: sprites.spriteSheets.map(sheet => ({
			src: sheet.src,
			srcA: sheet.srcA || null,
			palette: !!sheet.palette,
		})),
		defaultPalette: Array.prototype.slice.call(sprites.defaultPalette),
		setFields: setFields.map(def => ({
			name: def.name,
			preserveOnZero: !!def.preserveOnZero,
			minColors: def.minColors || 0,
			typeCount: def.sets.length,
			types: def.sets.map(typeSet => {
				if (!typeSet) return null;
				return typeSet.map(serializePattern);
			}),
		})),
		sets: {
			SLEEVED_ACCESSORIES: ponyUtils.SLEEVED_ACCESSORIES.slice(),
			SLEEVED_BACK_ACCESSORIES: ponyUtils.SLEEVED_BACK_ACCESSORIES.slice(),
		},
	};

	// Node 9 has no fs.mkdirSync recursive option
	(function mkdirp(dir) {
		if (fs.existsSync(dir)) return;
		mkdirp(path.dirname(dir));
		fs.mkdirSync(dir);
	})(path.dirname(OUT));

	fs.writeFileSync(OUT, JSON.stringify(schema));

	const summary = schema.setFields.map(f =>
		f.name + ':' + f.typeCount + ' types, max ' +
		Math.max.apply(null, f.types.map(t => t ? t.length : 0)) + ' patterns').join('\n  ');
	console.log('schema-v4.json written (' + fs.statSync(OUT).size + ' bytes)');
	console.log('  ' + summary);
}

main();
