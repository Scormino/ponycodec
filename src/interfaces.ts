// Trimmed copy of the original Pony Town 0.53.1-alpha
// `src/ts/common/interfaces.ts` - only the parts needed by the codec
// and the palette layer.

export interface SpriteSetBase {
	type?: number;
	pattern?: number;
}

export interface SpriteSet<T> extends SpriteSetBase {
	fills?: (T | undefined)[];
	outlines?: (T | undefined)[];
	lockFills?: boolean[];
	lockOutlines?: boolean[];
}

export interface PonyInfoBase<T, SET> {
	head: SET | undefined;
	nose: SET | undefined;
	ears: SET | undefined;
	horn: SET | undefined;
	wings: SET | undefined;
	frontHooves: SET | undefined;
	backHooves: SET | undefined;

	mane: SET | undefined;
	backMane: SET | undefined;
	tail: SET | undefined;
	facialHair: SET | undefined;

	headAccessory: SET | undefined;
	earAccessory: SET | undefined;
	faceAccessory: SET | undefined;
	neckAccessory: SET | undefined;
	frontLegAccessory: SET | undefined;
	backLegAccessory: SET | undefined;
	frontLegAccessoryRight: SET | undefined;
	backLegAccessoryRight: SET | undefined;
	lockBackLegAccessory: boolean | undefined;
	unlockFrontLegAccessory: boolean | undefined;
	unlockBackLegAccessory: boolean | undefined;
	backAccessory: SET | undefined;
	waistAccessory: SET | undefined;
	chestAccessory: SET | undefined;
	sleeveAccessory: SET | undefined;
	extraAccessory: SET | undefined;

	coatFill: T | undefined;
	coatOutline: T | undefined;
	lockCoatOutline: boolean | undefined;

	eyelashes: number | undefined;
	eyeColorLeft: T | undefined;
	eyeColorRight: T | undefined;
	eyeWhitesLeft: T | undefined;
	eyeWhites: T | undefined;
	eyeOpennessLeft: number | undefined;
	eyeOpennessRight: number | undefined;
	eyeshadow: boolean | undefined;
	eyeshadowColor: T | undefined;
	lockEyes: boolean | undefined;
	lockEyeColor: boolean | undefined;
	unlockEyeWhites: boolean | undefined;
	unlockEyelashColor: boolean | undefined;
	eyelashColor: T | undefined;
	eyelashColorLeft: T | undefined;

	fangs: number | undefined;
	muzzle: number | undefined;
	freckles: number | undefined; // TODO: remove
	frecklesColor: T | undefined; // TODO: remove
	magicColor: T | undefined;

	cm: T[] | undefined;
	cmFlip: boolean | undefined;

	customOutlines: boolean | undefined;
	freeOutlines: boolean | undefined;
	darkenLockedOutlines: boolean | undefined;
}

export interface PonyInfo extends PonyInfoBase<string, SpriteSet<string>> {
}

export interface PonyInfoNumber extends PonyInfoBase<number, SpriteSet<number>> {
}

// palette

export interface Palette {
	x: number;
	y: number;
	u: number;
	v: number;
	refs: number;
	colors: Uint32Array;
}

export interface PaletteManager {
	add(colors: number[]): Palette;
	addArray(colors: Uint32Array): Palette;
	init(): void;
}

export interface PaletteSpriteSet extends SpriteSetBase {
	type: number;
	pattern: number;
	palette: Palette;
	extraPalette?: Palette;
}

export interface PalettePonyInfo extends PonyInfoBase<Palette, PaletteSpriteSet> {
	coatPalette: Palette;
	eyePaletteLeft: Palette;
	eyePalette: Palette;
	cmPalette?: Palette;
	defaultPalette: Palette;
	waterPalette: Palette;
	body: PaletteSpriteSet | undefined;
	backLegs: PaletteSpriteSet | undefined;
	frontLegs: PaletteSpriteSet | undefined;
	magicColorValue: number;
}
