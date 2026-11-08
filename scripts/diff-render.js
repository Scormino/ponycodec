// Differential test of the render core.
//
// The original `drawPony` is called with a fake batch that records the draw
// commands. The recorded commands are compared with the commands of the port
// (`src/render.ts`).
//
// Runs on Node 9.
'use strict';

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'pony-town-src', 'src', 'scripts');

global.DEVELOPMENT = false;
global.SERVER = true;
global.CLIENT = false;
global.PRODUCTION = false;
global.BETA = false;
global.TOOLS = false;

const originalPonyDraw = require(path.join(SRC, 'client', 'ponyDraw.js'));
const originalAnimations = require(path.join(SRC, 'client', 'ponyAnimations.js'));
const originalPonyInfo = require(path.join(SRC, 'common', 'ponyInfo.js'));
const originalColors = require(path.join(SRC, 'common', 'colors.js'));
const originalCodec = require(path.join(SRC, 'common', 'ponyInfo.js'));

const portPalette = require(path.join(ROOT, 'dist', 'src', 'palette.js'));
const portRender = require(path.join(ROOT, 'dist', 'src', 'render.js'));
const portCodec = require(path.join(ROOT, 'dist', 'src', 'index.js'));

const random = require(path.join(__dirname, 'random-pony.js')).createRandom(0x51ed270b);

// --- the fake batch ---

function createFakeBatch() {
	const commands = [];
	const stack = [];
	let transform = [1, 0, 0, 1, 0, 0];

	function multiply(a, b) {
		return [
			a[0] * b[0] + a[2] * b[1],
			a[1] * b[0] + a[3] * b[1],
			a[0] * b[2] + a[2] * b[3],
			a[1] * b[2] + a[3] * b[3],
			a[0] * b[4] + a[2] * b[5] + a[4],
			a[1] * b[4] + a[3] * b[5] + a[5],
		];
	}

	return {
		commands,
		drawSprite(sprite, color, palette, x, y) {
			if (!sprite) {
				return;
			}

			commands.push({
				x: sprite.x, y: sprite.y, w: sprite.w, h: sprite.h,
				ox: sprite.ox, oy: sprite.oy, type: sprite.type,
				color,
				palette: palette && palette.colors ? Array.prototype.slice.call(palette.colors) : null,
				x0: transform[0] * x + transform[2] * y + transform[4],
				y0: transform[1] * x + transform[3] * y + transform[5],
			});
		},
		drawRect() { },
		save() { stack.push(transform); },
		restore() { transform = stack.pop() || [1, 0, 0, 1, 0, 0]; },
		multiplyTransform(m) { transform = multiply(transform, m); },
		crop() { },
		clearCrop() { },
	};
}

// --- the state and the options ---

function createState() {
	return {
		animation: originalAnimations.stand, animationFrame: 0,
		headAnimation: undefined, headAnimationFrame: 0,
		headTurned: false, headTilt: 0, headTurn: 0, blinkFrame: 0,
		expression: undefined, holding: undefined, blushColor: 0, flags: 0,
	};
}

function createOptions() {
	return {
		flipped: false, selected: false, shadow: true, extra: true, toy: 0,
		swimming: false, bounce: false, shadowColor: originalColors.SHADOW_COLOR,
		noEars: false, gameTime: 0, no: 0, useAllHooves: false,
	};
}

// --- the comparison ---

let checks = 0;
let failures = 0;

function fail(message) {
	failures++;

	if (failures < 40) {
		console.log('FAIL: ' + message);
	}
}

function compareCommands(name, original, portCommands) {
	checks++;

	if (original.length !== portCommands.length) {
		fail(name + ': the number of the commands is different: ' + original.length + ' != ' + portCommands.length);
	}

	const count = Math.min(original.length, portCommands.length);

	for (let i = 0; i < count; i++) {
		const a = original[i];
		const b = portCommands[i];

		for (const key of ['x', 'y', 'w', 'h', 'ox', 'oy', 'type', 'x0', 'y0']) {
			checks++;

			if (a[key] !== b[key]) {
				fail(name + ': command ' + i + ': ' + key + ': ' + a[key] + ' != ' + b[key]);
			}
		}

		checks++;

		if ((a.color >>> 0) !== (b.color >>> 0)) {
			fail(name + ': command ' + i + ': the tint: ' + (a.color >>> 0) + ' != ' + (b.color >>> 0));
		}

		checks++;

		if (!a.palette || !b.palette || a.palette.length !== b.palette.length) {
			fail(name + ': command ' + i + ': the palette is different');
		} else {
			for (let j = 0; j < a.palette.length; j++) {
				checks++;

				if (a.palette[j] !== b.palette[j]) {
					fail(name + ': command ' + i + ': the palette colour ' + j + ': ' +
						a.palette[j] + ' != ' + b.palette[j]);
					break;
				}
			}
		}
	}
}

// --- the test ---

function testPony(name, info, ponyX, ponyY, options) {
	const originalPalette = originalPonyInfo.toPalette(info, originalPonyInfo.mockPaletteManager);
	const portPaletteInfo = portPalette.toPalette(info);

	const batch = createFakeBatch();
	originalPonyDraw.drawPony(batch, originalPalette, createState(), ponyX, ponyY, options);

	const commands = portRender.drawPonyCommands(portPaletteInfo, ponyX, ponyY, {
		shadow: options.shadow,
		shadowColor: options.shadowColor,
		selected: options.selected,
		extra: options.extra,
		noEars: options.noEars,
	});

	compareCommands(name, batch.commands, commands.map(c => ({
		x: c.sprite.x, y: c.sprite.y, w: c.sprite.w, h: c.sprite.h,
		ox: c.sprite.ox, oy: c.sprite.oy, type: c.sprite.type,
		color: c.tint,
		palette: Array.prototype.slice.call(c.palette.colors),
		x0: c.x, y0: c.y,
	})));

	return batch.commands.length;
}

function main() {
	const count = parseInt(process.argv[2], 10) || 300;
	let total = 0;

	// the default pony
	const defaultPony = originalPonyInfo.createDefaultPony();
	total += testPony('default pony', defaultPony, 40, 70, createOptions());

	// the default pony in a few positions
	for (const position of [[0, 0], [123, 45], [-30, 200]]) {
		total += testPony('default pony at ' + position, defaultPony, position[0], position[1], createOptions());
	}

	// the default pony with the options
	const options = createOptions();
	options.selected = true;
	total += testPony('default pony selected', defaultPony, 40, 70, options);

	const noShadow = createOptions();
	noShadow.shadow = false;
	total += testPony('default pony without the shadow', defaultPony, 40, 70, noShadow);

	const noExtra = createOptions();
	noExtra.extra = false;
	total += testPony('default pony without the extra accessory', defaultPony, 40, 70, noExtra);

	const noEars = createOptions();
	noEars.noEars = true;
	total += testPony('default pony without the ears', defaultPony, 40, 70, noEars);

	// random ponies
	for (let i = 0; i < count; i++) {
		const info = portCodec.decompressPony(portCodec.compressPony(random.randomPony(true)));

		const opts = createOptions();
		opts.selected = i % 7 === 0;
		opts.shadow = i % 5 !== 0;
		opts.extra = i % 11 !== 0;
		opts.noEars = i % 13 === 0;

		total += testPony('random pony #' + i, info, 40 + random.rndInt(200), 70 + random.rndInt(200), opts);
	}

	console.log('');
	console.log(total + ' commands compared');
	console.log(checks + ' checks, ' + failures + ' failures');

	if (failures > 0) {
		process.exit(1);
	}
}

main();
