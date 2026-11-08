// Extracts the data that is needed to draw a pony in the standing pose:
// the sprite rectangles of every drawn part, the part offsets and the pose constants.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'pony-town-src', 'src', 'scripts');

global.DEVELOPMENT = false;
global.SERVER = true;
global.CLIENT = false;
global.PRODUCTION = false;

const sprites = require(path.join(SRC, 'generated', 'sprites.js'));
const ponyUtils = require(path.join(SRC, 'client', 'ponyUtils.js'));
const offsets = require(path.join(SRC, 'common', 'offsets.js'));
const animations = require(path.join(SRC, 'client', 'ponyAnimations.js'));
const colors = require(path.join(SRC, 'common', 'colors.js'));

// the index of the sheet that contains a sprite
const sheetIndex = new Map();

sprites.spriteSheets.forEach((sheet, index) => {
	sheet.sprites.forEach(sprite => {
		if (sprite && !sheetIndex.has(sprite)) {
			sheetIndex.set(sprite, index);
		}
	});
});

function serializeSprite(sprite) {
	if (!sprite) {
		return null;
	}
	return {
		x: sprite.x, y: sprite.y, w: sprite.w, h: sprite.h,
		ox: sprite.oy === undefined ? sprite.oy : sprite.ox,
		oy: sprite.oy,
		type: sprite.type,
		sheet: sheetIndex.has(sprite) ? sheetIndex.get(sprite) : 0,
	};
}

// [frame][type][pattern] => { color, extra }
function serializeSet(set) {
	if (!set) {
		return null;
	}
	return set.map(type => type === undefined ? null : type.map(pattern => {
		if (!pattern) {
			return null;
		}
		return {
			colors: pattern.colors,
			color: serializeSprite(pattern.color),
			extra: serializeSprite(pattern.extra),
		};
	}));
}

function serializeEye(eye) {
	if (!eye) {
		return null;
	}
	return {
		base: serializeSprite(eye.base),
		irises: eye.irises ? eye.irises.map(serializeSprite) : null,
		shadow: serializeSprite(eye.shadow),
		shine: serializeSprite(eye.shine),
	};
}

function serializeNose(nose) {
	if (!nose) {
		return null;
	}
	return {
		colors: nose.colors,
		color: serializeSprite(nose.color),
		mouth: serializeSprite(nose.mouth),
		fangs: serializeSprite(nose.fangs),
	};
}

// the standing pose
const frame = animations.defaultBodyAnimation.frames[0];
const headFrame = animations.defaultHeadAnimation.frames[0];

const pose = {
	version: 1,
	constants: {
		ponyWidth: ponyUtils.PONY_WIDTH,
		ponyHeight: ponyUtils.PONY_HEIGHT,
		farOx: -3,
		farOy: -1,
		farWingOx: -4,
		farWingOy: 0,
		shadowOx: 20,
		shadowOy: 64,
		farColor: colors.FAR_COLOR,
		white: colors.WHITE,
		shinesColor: colors.SHINES_COLOR,
	},
	frame: {
		body: frame.body,
		head: frame.head,
		wing: frame.wing,
		tail: frame.tail,
		frontLeg: frame.frontLeg,
		frontFarLeg: frame.frontFarLeg,
		backLeg: frame.backLeg,
		backFarLeg: frame.backFarLeg,
		bodyX: frame.bodyX,
		bodyY: frame.bodyY,
		headX: frame.headX,
		headY: frame.headY,
		frontLegX: frame.frontLegX,
		frontLegY: frame.frontLegY,
		frontFarLegX: frame.frontFarLegX,
		frontFarLegY: frame.frontFarLegY,
		backLegX: frame.backLegX,
		backLegY: frame.backLegY,
		backFarLegX: frame.backFarLegX,
		backFarLegY: frame.backFarLegY,
	},
	headFrame: {
		headX: headFrame.headX,
		headY: headFrame.headY,
		left: headFrame.left,
		right: headFrame.right,
		mouth: headFrame.mouth,
	},
	offsets: {
		cm: offsets.cmOffsets.map(p => [p.x, p.y]),
		head: offsets.headOffsets.map(p => [p.x, p.y]),
		tail: offsets.tailOffsets.map(p => [p.x, p.y]),
		wing: offsets.wingOffsets.map(p => [p.x, p.y]),
		frontLeg: offsets.frontLegOffsets.map(p => [p.x, p.y]),
		backLeg: offsets.backLegOffsets.map(p => [p.x, p.y]),
		neckAccessory: offsets.neckAccessoryOffsets.map(p => [p.x, p.y]),
		backAccessory: offsets.backAccessoryOffsets.map(p => [p.x, p.y]),
		waistAccessory: offsets.waistAccessoryOffsets.map(p => [p.x, p.y]),
		chestAccessory: offsets.chestAccessoryOffsets.map(p => [p.x, p.y]),
		earAccessory: offsets.EAR_ACCESSORY_OFFSETS.map(p => [p.x, p.y]),
		headAccessory: offsets.HEAD_ACCESSORY_OFFSETS.map(p => [p.x, p.y]),
		extraAccessory: offsets.EXTRA_ACCESSORY_OFFSETS.map(p => [p.x, p.y]),
	},
	sprites: {
		body: serializeSet(sprites.body[frame.body]),
		head0: serializeSet(sprites.head0[frame.head]),
		head1: serializeSet(sprites.head1[frame.head]),
		ears: serializeSet(sprites.ears),
		earsFar: serializeSet(sprites.earsFar),
		horns: serializeSet(sprites.horns),
		hornsBehind: serializeSet(sprites.hornsBehind),
		behindManes: serializeSet(sprites.behindManes),
		topManes: serializeSet(sprites.topManes),
		frontManes: serializeSet(sprites.frontManes),
		backBehindManes: serializeSet(sprites.backBehindManes),
		backFrontManes: serializeSet(sprites.backFrontManes),
		facialHair: serializeSet(sprites.facialHair),
		facialHairBehind: serializeSet(sprites.facialHairBehind),
		headAccessories: serializeSet(sprites.headAccessories),
		headAccessoriesBehind: serializeSet(sprites.headAccessoriesBehind),
		earAccessories: serializeSet(sprites.earAccessories),
		earAccessoriesBehind: serializeSet(sprites.earAccessoriesBehind),
		faceAccessories: serializeSet(sprites.faceAccessories),
		faceAccessories2: serializeSet(sprites.faceAccessories2),
		extraAccessories: serializeSet(sprites.extraAccessories),
		extraAccessoriesBehind: serializeSet(sprites.extraAccessoriesBehind),
		frontLegs: serializeSet(sprites.frontLegs[frame.frontLeg]),
		backLegs: serializeSet(sprites.backLegs[frame.backLeg]),
		backLegs2: serializeSet(sprites.backLegs2[frame.backLeg]),
		frontLegHooves: serializeSet(ponyUtils.frontHooves[frame.frontLeg]),
		claws: serializeSet(ponyUtils.claws[frame.frontLeg]),
		backLegHooves: serializeSet(sprites.backLegHooves[frame.backLeg]),
		backLegHooves2: serializeSet(sprites.backLegHooves2[frame.backLeg]),
		frontLegAccessories: serializeSet(sprites.frontLegAccessories[frame.frontLeg]),
		backLegAccessories: serializeSet(sprites.backLegAccessories[frame.backLeg]),
		backLegAccessories2: serializeSet(sprites.backLegAccessories2[frame.backLeg]),
		frontLegSleeves: serializeSet(sprites.frontLegSleeves[frame.frontLeg]),
		backLegSleeves: serializeSet(sprites.backLegSleeves[frame.backLeg]),
		backLegSleevesMerged: serializeSet(ponyUtils.backLegSleeves[frame.backLeg]),
		backLegSleeves2: serializeSet(sprites.backLegSleeves2[frame.backLeg]),
		tails: serializeSet(ponyUtils.tails[frame.tail]),
		neckAccessories: serializeSet(ponyUtils.neckAccessories[frame.body]),
		backAccessories: serializeSet(ponyUtils.backAccessories[frame.body]),
		waistAccessories: serializeSet(ponyUtils.waistAccessories[frame.body]),
		chest: serializeSet(ponyUtils.chest[frame.body]),
		chestBehind: serializeSet(ponyUtils.chestBehind[frame.body]),
		wings: serializeSet(ponyUtils.wings[frame.wing]),
		noses: sprites.noses.map(muzzles => muzzles.map(types => types.map(serializeNose))),
		eyeLeft: sprites.eyeLeft.map(frame => frame ? frame.map(serializeEye) : null),
		eyeRight: sprites.eyeRight.map(frame => frame ? frame.map(serializeEye) : null),
		cms: serializeSprite(sprites.cms),
		cmsFlip: serializeSprite(sprites.cmsFlip),
		ponyShadows: sprites.ponyShadows.map(serializeSprite),
		ponySelections: sprites.ponySelections.map(serializeSprite),
	},
};

fs.writeFileSync(path.join(ROOT, 'schema', 'pose-v1.json'), JSON.stringify(pose));
console.log('pose-v1.json written (' + fs.statSync(path.join(ROOT, 'schema', 'pose-v1.json')).size + ' bytes)');
