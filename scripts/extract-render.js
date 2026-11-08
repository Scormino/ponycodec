// Stage 2b: extract the sprite data the renderer needs (the merged sets, the
// extra palettes, the default palette and the water palette).
//
// Runs on Node 9 against pony-town-src/src/scripts (compiled original).
'use strict';

global.DEVELOPMENT = false;
global.SERVER = true;
global.CLIENT = false;
global.PRODUCTION = false;

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'pony-town-src', 'src', 'scripts');
const OUT = path.join(__dirname, '..', 'schema', 'render-v1.json');

// require ponyUtils first: it mutates sprites (pops summer hat / headphones)
// and builds the merged sets, exactly like the original module init order
const sprites = require(path.join(SRC, 'generated', 'sprites.js'));
const ponyUtils = require(path.join(SRC, 'client', 'ponyUtils.js'));
const pkg = require(path.join(__dirname, '..', 'pony-town-src', 'package.json'));

// the sets used by common/ponyInfo.ts:toPaletteGeneric
// NOTE: the renderer uses the *merged* sets, the codec uses the raw ones
const renderSets = [
	{ name: 'body', sets: sprites.body[1] },
	{ name: 'head', sets: sprites.head0[1] },
	{ name: 'nose', sets: sprites.noses[0] },
	{ name: 'ears', sets: sprites.ears },
	{ name: 'horn', sets: sprites.horns },
	{ name: 'wings', sets: sprites.wings[0] },
	{ name: 'frontLegs', sets: sprites.frontLegs[1] },
	{ name: 'backLegs', sets: sprites.backLegs[1] },
	{ name: 'frontHooves', sets: sprites.frontLegHooves[1] },
	{ name: 'backHooves', sets: sprites.backLegHooves[1] },
	{ name: 'mane', sets: ponyUtils.mergedManes },
	{ name: 'backMane', sets: ponyUtils.mergedBackManes },
	{ name: 'tail', sets: sprites.tails[0] },
	{ name: 'facialHair', sets: ponyUtils.mergedFacialHair },
	{ name: 'headAccessory', sets: ponyUtils.mergedHeadAccessories },
	{ name: 'earAccessory', sets: ponyUtils.mergedEarAccessories },
	{ name: 'faceAccessory', sets: ponyUtils.mergedFaceAccessories, extra: true },
	{ name: 'neckAccessory', sets: sprites.neckAccessories[1] },
	{ name: 'frontLegAccessory', sets: sprites.frontLegAccessories[1] },
	{ name: 'backLegAccessory', sets: sprites.backLegAccessories[1] },
	{ name: 'frontLegAccessoryRight', sets: sprites.frontLegAccessories[1] },
	{ name: 'backLegAccessoryRight', sets: sprites.backLegAccessories[1] },
	{ name: 'backAccessory', sets: ponyUtils.mergedBackAccessories },
	{ name: 'waistAccessory', sets: sprites.waistAccessories[1] },
	{ name: 'chestAccessory', sets: ponyUtils.mergedChestAccessories },
	{ name: 'sleeveAccessory', sets: sprites.frontLegSleeves[1] },
	{ name: 'extraAccessory', sets: ponyUtils.mergedExtraAccessories },
];

// client/spriteUtils.ts:26
function getColorCount(sprite) {
	return sprite && sprite.colors ? Math.floor((sprite.colors - 1) / 2) : 0;
}

function serializePattern(entry) {
	if (!entry) {
		return null;
	}
	return {
		colors: getColorCount(entry),
		rawColors: entry.colors === undefined ? null : entry.colors,
		color: entry.color ? {
			x: entry.color.x, y: entry.color.y, w: entry.color.w, h: entry.color.h,
			ox: entry.color.ox, oy: entry.color.oy, type: entry.color.type,
		} : null,
		extra: entry.extra ? {
			x: entry.extra.x, y: entry.extra.y, w: entry.extra.w, h: entry.extra.h,
			ox: entry.extra.ox, oy: entry.extra.oy, type: entry.extra.type,
		} : null,
		palettes: entry.palettes ? entry.palettes.map(p => Array.prototype.slice.call(p)) : null,
	};
}

function main() {
	if (!renderSets.every(f => !!f.sets)) {
		const missing = renderSets.filter(f => !f.sets).map(f => f.name);
		throw new Error('Undefined set in renderSets: ' + missing.join(', '));
	}

	const schema = {
		version: pkg.version,
		source: 'drewdru/ponyTown@master (compiled src/scripts)',
		defaultPalette: Array.prototype.slice.call(sprites.defaultPalette),
		waterPalette: Array.prototype.slice.call(sprites.pony_wake_1.palette),
		sets: renderSets.map(def => ({
			name: def.name,
			extra: !!def.extra,
			typeCount: def.sets.length,
			types: def.sets.map(typeSet => {
				if (!typeSet) return null;
				return typeSet.map(serializePattern);
			}),
		})),
	};

	(function mkdirp(dir) {
		if (fs.existsSync(dir)) return;
		mkdirp(path.dirname(dir));
		fs.mkdirSync(dir);
	})(path.dirname(OUT));

	fs.writeFileSync(OUT, JSON.stringify(schema));

	console.log('render-v1.json written (' + fs.statSync(OUT).size + ' bytes)');
	console.log('  ' + schema.sets.map(s =>
		s.name + ':' + s.typeCount + ' types, ' +
		s.types.reduce((n, t) => n + (t ? t.filter(x => x).length : 0), 0) + ' patterns').join('\n  '));
}

main();
