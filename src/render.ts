// Render core - a port of the standing pose of `src/ts/client/ponyDraw.ts` of
// the original Pony Town 0.53.1-alpha.
//
// The renderer does not draw anything itself, it produces an ordered list of
// draw commands. Every command is a sprite rectangle, a tint colour, a palette
// and the position of the anchor of the sprite. The list can be rendered with
// the CPU rasterizer (`src/raster.ts`) or with WebGL (see `example/webgl`).
//
// The order of the commands and the positions of the parts are the same as in
// the original, so the result is the same picture.

import { PoseSet, PoseSprite, PoseEye, poseSprites, poseOffsets, poseConstants, poseFrame, poseHeadFrame } from './poseData';
import { Palette, PalettePonyInfo, PaletteSpriteSet } from './interfaces';
import { WHITE, SHADOW_COLOR, SHINES_COLOR } from './colors';

export interface DrawCommand {
	// the sprite that is drawn
	sprite: PoseSprite;
	// the colour that is multiplied with the palette colour
	tint: number;
	// the palette of the sprite
	palette: Palette;
	// the position of the anchor of the sprite
	x: number;
	y: number;
}

function clamp(value: number, min: number, max: number): number {
	return value > min ? (value < max ? value : max) : min;
}

function at<T>(items: T[] | null | undefined, index: number): T | null | undefined {
	if (!items) {
		return undefined;
	}

	return items[clamp(index | 0, 0, items.length - 1)];
}

function att<T>(items: T[] | null | undefined, index: number): T | null | undefined {
	if (!items) {
		return undefined;
	}

	return items[clamp(index | 0, 0, items.length - 1)];
}

const NO_MANE_HEAD_ACCESSORIES = [0, 16];
const SLEEVED_ACCESSORIES = [2, 3, 4];
const SLEEVED_BACK_ACCESSORIES = [5, 6];
const CHEST_ACCESSORIES_IN_FRONT = [1];

function partChecker(parts: number[]) {
	const set = parts.slice();

	return (part: PaletteSpriteSet | undefined): boolean =>
		part !== undefined && !!part.type && set.indexOf(part.type) >= 0;
}

const behindBackAccessory = partChecker([1]);
const sleevedAccessory = partChecker(SLEEVED_ACCESSORIES);
const sleevedBackAccessory = partChecker(SLEEVED_BACK_ACCESSORIES);
const chestAccessoryInFront = partChecker(CHEST_ACCESSORIES_IN_FRONT);

export interface RenderOptions {
	// draw the shadow of the pony
	shadow?: boolean;
	// the colour of the shadow
	shadowColor?: number;
	// draw the selection
	selected?: boolean;
	// the extra accessory (the toys of the original are not supported)
	extra?: boolean;
	// do not draw the ears
	noEars?: boolean;
}

export interface PonyRenderOptions extends RenderOptions {
	// the eyes are drawn with the neutral expression
	expression?: undefined;
}

const defaultOptions: PonyRenderOptions = {
	shadow: true,
	selected: false,
	extra: true,
	noEars: false,
};

function drawSet(
	commands: DrawCommand[], set: PoseSet | undefined, paletteSet: PaletteSpriteSet | undefined,
	x: number, y: number, tint: number
) {
	if (set === undefined || paletteSet === undefined) {
		return;
	}

	const patterns = att(set.types, paletteSet.type);

	if (patterns !== undefined && patterns !== null) {
		const patternSprite = at(patterns, paletteSet.pattern);

		if (patternSprite !== undefined && patternSprite !== null && patternSprite.color !== null) {
			commands.push({
				sprite: patternSprite.color,
				tint,
				palette: paletteSet.palette,
				x, y,
			});
		}
	}
}

function drawTypePattern(
	commands: DrawCommand[], set: PoseSet | undefined, type: number, pattern: number,
	palette: Palette, extraPalette: Palette | undefined, x: number, y: number, tint: number
) {
	if (set === undefined) {
		return;
	}

	const patterns = att(set.types, type);

	if (patterns === undefined || patterns === null) {
		return;
	}

	const patternSprite = at(patterns, pattern);

	if (patternSprite === undefined || patternSprite === null) {
		return;
	}

	if (patternSprite.color !== null) {
		commands.push({ sprite: patternSprite.color, tint, palette, x, y });
	}

	if (patternSprite.extra !== null && extraPalette !== undefined) {
		commands.push({ sprite: patternSprite.extra, tint: WHITE, palette: extraPalette, x, y });
	}
}

function drawSprite(commands: DrawCommand[], sprite: PoseSprite | null, tint: number, palette: Palette, x: number, y: number) {
	if (sprite !== null) {
		commands.push({ sprite, tint, palette, x, y });
	}
}

function drawLeg(
	commands: DrawCommand[], x: number, y: number,
	leg: PoseSet | undefined, hoof: PoseSet | undefined, sock: PoseSet | undefined,
	legSet: PaletteSpriteSet | undefined, sockSet: PaletteSpriteSet | undefined, hoofSet: PaletteSpriteSet | undefined,
	hoovesInFront: boolean[], color: number, cmPalette: Palette | undefined, cmFlip: boolean, cmX: number, cmY: number,
	frontHooves: boolean
) {
	const hoofInFront = hoofSet !== undefined && !!hoovesInFront[hoofSet.type];

	drawSet(commands, leg, legSet, x, y, color);

	if (!hoofInFront) {
		drawSet(commands, hoof, hoofSet, x, y, color);
	}

	// custom markings
	if (cmPalette !== undefined) {
		drawSprite(commands, cmFlip ? poseSprites.cmsFlip : poseSprites.cms, WHITE, cmPalette, cmX, cmY);
	}

	drawSet(commands, sock, sockSet, x, y, color);

	if (hoofInFront) {
		// the claws replace the hoof when the leg has a sock
		const hasClaws = hoofSet !== undefined && hoofSet.type === 3 && frontHooves;
		const hasSocks = !!(sockSet && sockSet.type > 0);
		const hoofSprites = (hasClaws && hasSocks) ? poseSprites.claws : hoof;

		drawSet(commands, hoofSprites, hoofSet, x, y, color);
	}
}

const frontHoovesInFront = [false, false, true, true, false, false];
const backHoovesInFront = [false, false, true, false, false];

function drawEye(
	commands: DrawCommand[], eye: PoseEye | null,
	iris: number, info: PalettePonyInfo, eyeColor: Palette, eyePalette: Palette, x: number, y: number
) {
	if (eye === null) {
		return;
	}

	if (info.eyeshadow === true) {
		drawSprite(commands, eye.shadow, WHITE, info.eyeshadowColor || info.defaultPalette, x, y);
		drawSprite(commands, eye.shine, SHINES_COLOR, info.defaultPalette, x, y);
	}

	drawSprite(commands, eye.base, WHITE, eyePalette, x, y);

	const sprite = eye.irises ? at(eye.irises, iris) : undefined;

	drawSprite(commands, sprite === undefined ? null : sprite, WHITE, eyeColor, x, y);
}

function drawHead(
	commands: DrawCommand[], info: PalettePonyInfo, x: number, y: number, headSprites: PoseSet,
	options: PonyRenderOptions
) {
	const extraOffset = att(poseOffsets.extraAccessory, info.mane ? info.mane.type : 0) || { x: 0, y: 0 };
	const extraX = x + extraOffset.x;
	const extraY = y + extraOffset.y;

	// extra accessory behind the head
	if (options.extra && info.extraAccessory !== undefined) {
		drawSet(commands, poseSprites.extraAccessoriesBehind, info.extraAccessory, extraX, extraY, WHITE);
	}

	// head
	drawSet(commands, headSprites, info.head, x, y, WHITE);

	// eyes
	const eyeRight = att(poseSprites.eyeRight, info.eyeOpennessRight || 1);
	const eyeLeft = att(poseSprites.eyeLeft, info.eyeOpennessLeft || 1);
	const eyeColorLeft = info.eyeColorLeft || info.defaultPalette;
	const eyeColorRight = info.eyeColorRight || info.defaultPalette;
	const eyePaletteLeft = info.eyePaletteLeft || info.defaultPalette;
	const eyePaletteRight = info.eyePalette || info.defaultPalette;

	drawEye(commands, att(eyeLeft, info.eyelashes || 0) || null, 0, info, eyeColorLeft, eyePaletteLeft, x, y);
	drawEye(commands, att(eyeRight, info.eyelashes || 0) || null, 0, info, eyeColorRight, eyePaletteRight, x, y);

	// facial hair behind
	drawSet(commands, poseSprites.facialHairBehind, info.facialHair, x, y, WHITE);

	// face accessory
	const faceAccessory = info.faceAccessory;

	if (faceAccessory !== undefined) {
		drawTypePattern(
			commands, poseSprites.faceAccessories, faceAccessory.type, faceAccessory.pattern,
			faceAccessory.palette, faceAccessory.extraPalette, x, y, WHITE);
	}

	// nose and muzzle
	const muzzle = info.muzzle || 0;
	const noses = at(poseSprites.noses, muzzle);
	const noseType = info.nose ? info.nose.type : 0;
	const nosePatterns = noses === undefined || noses === null ? undefined : att(noses.types, noseType);
	const nose = nosePatterns === undefined || nosePatterns === null ? undefined : at(nosePatterns, 0);

	if (nose !== undefined && nose !== null) {
		drawSprite(commands, nose.mouth, WHITE, info.defaultPalette, x, y);
	}

	if (info.nose !== undefined && nosePatterns !== undefined && nosePatterns !== null) {
		const patternSprite = at(nosePatterns, info.nose.pattern);

		if (patternSprite !== undefined && patternSprite !== null && patternSprite.color !== null) {
			commands.push({ sprite: patternSprite.color, tint: WHITE, palette: info.nose.palette, x, y });
		}
	}

	if (info.fangs && nose !== undefined && nose !== null) {
		drawSprite(commands, nose.fangs, WHITE, info.defaultPalette, x, y);
	}

	// facial hair
	drawSet(commands, poseSprites.facialHair, info.facialHair, x, y, WHITE);

	const skipTopAndFrontMane = info.headAccessory !== undefined && info.headAccessory.type === 20;

	// back mane in front
	drawSet(commands, poseSprites.backFrontManes, info.backMane, x, y, WHITE);

	// top mane
	if (!skipTopAndFrontMane) {
		drawSet(commands, poseSprites.topManes, info.mane, x, y, WHITE);
	}

	// extra accessory in front
	if (options.extra && info.extraAccessory !== undefined) {
		drawSet(commands, poseSprites.extraAccessories, info.extraAccessory, extraX, extraY, WHITE);
	}

	// horns
	drawSet(commands, poseSprites.horns, info.horn, x, y, WHITE);

	// ears
	if (!options.noEars) {
		drawSet(commands, poseSprites.ears, info.ears, x, y, WHITE);
	}

	// face accessory (the second layer)
	if (faceAccessory !== undefined) {
		drawTypePattern(
			commands, poseSprites.faceAccessories2, faceAccessory.type, faceAccessory.pattern,
			faceAccessory.palette, faceAccessory.extraPalette, x, y, WHITE);
	}

	// ear accessory
	const earAccessoryOffset = att(poseOffsets.earAccessory, info.ears ? info.ears.type : 0) || { x: 0, y: 0 };

	drawSet(
		commands, poseSprites.earAccessories, info.earAccessory,
		x + earAccessoryOffset.x, y + earAccessoryOffset.y, WHITE);

	// front mane
	if (!skipTopAndFrontMane) {
		drawSet(commands, poseSprites.frontManes, info.mane, x, y, WHITE);
	}
}

// Builds the list of the draw commands of a pony in the standing pose.
export function drawPonyCommands(
	info: PalettePonyInfo, ponyX: number, ponyY: number, options?: PonyRenderOptions
): DrawCommand[] {
	const opts: PonyRenderOptions = options || defaultOptions;
	const commands: DrawCommand[] = [];

	const frame = poseFrame;
	const headFrame = poseHeadFrame;

	const baseX = ponyX - poseConstants.ponyWidth / 2;
	const baseY = ponyY - poseConstants.ponyHeight;
	const x = baseX + frame.bodyX;
	const y = baseY + frame.bodyY;
	const body = frame.body;

	const headOffset = at(poseOffsets.head, body) || { x: 0, y: 0 };
	const headX = x + frame.headX + headFrame.headX + headOffset.x;
	const headY = y + frame.headY + headFrame.headY + headOffset.y;

	const frontLegOffset = at(poseOffsets.frontLeg, body) || { x: 0, y: 0 };
	const backLegOffset = at(poseOffsets.backLeg, body) || { x: 0, y: 0 };
	const wingOffset = at(poseOffsets.wing, body) || { x: 0, y: 0 };
	const chestOffset = at(poseOffsets.chestAccessory, body) || { x: 0, y: 0 };
	const chestX = x + chestOffset.x;
	const chestY = y + chestOffset.y;
	const backOffset = at(poseOffsets.backAccessory, body) || { x: 0, y: 0 };
	const tailOffset = at(poseOffsets.tail, body) || { x: 0, y: 0 };
	const tailX = x + tailOffset.x;
	const tailY = y + tailOffset.y;
	const cmOffset = at(poseOffsets.cm, body) || { x: 0, y: 0 };

	const hatOffset = at(poseOffsets.headAccessory, info.mane ? info.mane.type : 0) || { x: 0, y: 0 };
	const noMane = !info.mane || NO_MANE_HEAD_ACCESSORIES.indexOf(info.mane.type) >= 0;

	// the summer hat is not offset
	const hatOffsetX = info.headAccessory !== undefined && info.headAccessory.type === 20 ? 0 : hatOffset.x;
	const hatOffsetY = info.headAccessory !== undefined && info.headAccessory.type === 20 ? 0 : hatOffset.y;

	const farColor = poseConstants.farColor;

	// selection
	if (opts.selected) {
		const selection = poseSprites.ponySelections[0];

		drawSprite(
			commands, selection === undefined ? null : selection, WHITE, info.defaultPalette,
			baseX + poseConstants.shadowOx, baseY + poseConstants.shadowOy);
	}

	// shadow
	if (opts.shadow) {
		const shadow = poseSprites.ponyShadows[0];

		drawSprite(
			commands, shadow === undefined ? null : shadow,
			opts.shadowColor === undefined ? SHADOW_COLOR : opts.shadowColor,
			info.defaultPalette,
			baseX + poseConstants.shadowOx, baseY + poseConstants.shadowOy);
	}

	// far wing
	drawSet(
		commands, poseSprites.wings, info.wings,
		x + poseConstants.farWingOx + wingOffset.x, y + poseConstants.farWingOy + wingOffset.y, farColor);

	// head accessories behind the head
	if (noMane) {
		drawSet(
			commands, poseSprites.headAccessoriesBehind, info.headAccessory,
			headX + hatOffsetX, headY + hatOffsetY, WHITE);
	}

	// ear accessory behind
	drawSet(commands, poseSprites.earAccessoriesBehind, info.earAccessory, headX, headY, WHITE);

	// far ear
	drawSet(commands, poseSprites.earsFar, info.ears, headX, headY, farColor);

	// horns behind
	drawSet(commands, poseSprites.hornsBehind, info.horn, headX, headY, WHITE);

	if (!noMane) {
		drawSet(
			commands, poseSprites.headAccessoriesBehind, info.headAccessory,
			headX + hatOffsetX, headY + hatOffsetY, WHITE);
	}

	// back mane behind
	drawSet(commands, poseSprites.backBehindManes, info.backMane, headX, headY, WHITE);

	// mane behind
	drawSet(commands, poseSprites.behindManes, info.mane, headX, headY, WHITE);

	// chest accessory behind
	drawSet(commands, poseSprites.chestBehind, info.chestAccessory, chestX, chestY, WHITE);

	// far legs
	const behindX = x + poseConstants.farOx;
	const behindY = y + poseConstants.farOy;

	const frontBehindX = behindX + frontLegOffset.x + frame.frontFarLegX;
	const frontBehindY = behindY + frontLegOffset.y + frame.frontFarLegY;
	const backBehindX = behindX + backLegOffset.x + frame.backFarLegX;
	const backBehindY = behindY + backLegOffset.y + frame.backFarLegY;

	const hasTailAccessory = behindBackAccessory(info.backAccessory);
	const hasSleeves = sleevedAccessory(info.chestAccessory);
	const hasBackSleeves = sleevedBackAccessory(info.backAccessory);

	// far back leg
	drawLeg(
		commands, backBehindX, backBehindY,
		poseSprites.backLegs, poseSprites.backLegHooves, poseSprites.backLegAccessories,
		info.backLegs, info.backLegAccessoryRight, info.backHooves, backHoovesInFront, farColor,
		undefined, false, 0, 0, false);

	// far front leg
	drawLeg(
		commands, frontBehindX, frontBehindY,
		poseSprites.frontLegs, poseSprites.frontLegHooves, poseSprites.frontLegAccessories,
		info.frontLegs, info.frontLegAccessoryRight, info.frontHooves, frontHoovesInFront, farColor,
		undefined, false, 0, 0, true);

	// far sleeves
	if (hasBackSleeves) {
		drawSet(commands, poseSprites.backLegSleeves, info.backAccessory, backBehindX, backBehindY, farColor);
	}

	if (hasSleeves) {
		drawSet(commands, poseSprites.frontLegSleeves, info.sleeveAccessory, frontBehindX, frontBehindY, farColor);
	}

	// tail
	drawSet(commands, poseSprites.tails, info.tail, tailX, tailY, WHITE);

	// tail accessory
	if (hasTailAccessory) {
		drawSet(commands, poseSprites.backAccessories, info.backAccessory, x + backOffset.x, y + backOffset.y, WHITE);
	}

	// body
	drawSet(commands, poseSprites.body, info.body, x, y, WHITE);

	// near legs
	const frontX = x + frontLegOffset.x + frame.frontLegX;
	const frontY = y + frontLegOffset.y + frame.frontLegY;
	const backX = x + backLegOffset.x + frame.backLegX;
	const backY = y + backLegOffset.y + frame.backLegY;

	// near back leg
	drawLeg(
		commands, backX, backY,
		poseSprites.backLegs, poseSprites.backLegHooves, poseSprites.backLegAccessories,
		info.backLegs, info.backLegAccessory, info.backHooves, backHoovesInFront, WHITE,
		info.cmPalette, false, x + cmOffset.x, y + cmOffset.y, false);

	// back accessory
	if (!hasTailAccessory) {
		drawSet(commands, poseSprites.backAccessories, info.backAccessory, x + backOffset.x, y + backOffset.y, WHITE);
	}

	// back sleeves
	if (hasBackSleeves) {
		drawSet(commands, poseSprites.backLegSleevesMerged, info.backAccessory, backX, backY, WHITE);
	}

	const isChestAccessoryInFront = chestAccessoryInFront(info.chestAccessory);

	// chest accessory
	if (!isChestAccessoryInFront) {
		drawSet(commands, poseSprites.chest, info.chestAccessory, chestX, chestY, WHITE);
	}

	// near front leg
	drawLeg(
		commands, frontX, frontY,
		poseSprites.frontLegs, poseSprites.frontLegHooves, poseSprites.frontLegAccessories,
		info.frontLegs, info.frontLegAccessory, info.frontHooves, frontHoovesInFront, WHITE,
		undefined, false, 0, 0, true);

	// front sleeves
	if (hasSleeves) {
		drawSet(commands, poseSprites.frontLegSleeves, info.sleeveAccessory, frontX, frontY, WHITE);
	}

	// chest accessory in front
	if (isChestAccessoryInFront) {
		drawSet(commands, poseSprites.chest, info.chestAccessory, chestX, chestY, WHITE);
	}

	// the second back leg
	drawLeg(
		commands, backX, backY,
		poseSprites.backLegs2, poseSprites.backLegHooves2, poseSprites.backLegAccessories2,
		info.backLegs, info.backLegAccessory, info.backHooves, backHoovesInFront, WHITE,
		undefined, false, 0, 0, false);

	// the second back sleeves
	if (hasBackSleeves) {
		drawSet(commands, poseSprites.backLegSleeves2, info.backAccessory, backX, backY, WHITE);
	}

	// neck accessory
	const neckOffset = at(poseOffsets.neckAccessory, body) || { x: 0, y: 0 };

	drawSet(commands, poseSprites.neckAccessories, info.neckAccessory, x + neckOffset.x, y + neckOffset.y, WHITE);

	// waist accessory
	const waistOffset = at(poseOffsets.waistAccessory, body) || { x: 0, y: 0 };

	drawSet(commands, poseSprites.waistAccessories, info.waistAccessory, x + waistOffset.x, y + waistOffset.y, WHITE);

	// near wing
	drawSet(commands, poseSprites.wings, info.wings, x + wingOffset.x, y + wingOffset.y, WHITE);

	// head
	drawHead(commands, info, headX, headY, poseSprites.head1, opts);

	// head accessory
	drawSet(
		commands, poseSprites.headAccessories, info.headAccessory,
		headX + hatOffsetX, headY + hatOffsetY, WHITE);

	return commands;
}
