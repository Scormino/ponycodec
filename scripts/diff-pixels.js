// Differential test of the render core on the pixel level.
//
// The original `drawPony` is rendered with the original CPU rasterizer
// (`ContextSpriteBatch` of the original game) on a mock canvas. The port
// (`src/render.ts` + `src/raster.ts`) is rendered into the same size image.
// The two images are compared pixel by pixel.
//
// Runs on Node 9.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'pony-town-src', 'src', 'scripts');
const IMAGES = path.join(ROOT, 'pony-town-src', 'assets', 'images');

global.DEVELOPMENT = false;
global.SERVER = true;
global.CLIENT = false;
global.PRODUCTION = false;
global.BETA = false;
global.TOOLS = false;
global.TESTS = false;
global.TIMING = false;
global.DEBUG = false;

const originalPonyDraw = require(path.join(SRC, 'client', 'ponyDraw.js'));
const originalAnimations = require(path.join(SRC, 'client', 'ponyAnimations.js'));
const originalPonyInfo = require(path.join(SRC, 'common', 'ponyInfo.js'));
const originalColors = require(path.join(SRC, 'common', 'colors.js'));
const originalContextBatch = require(path.join(SRC, 'graphics', 'contextSpriteBatch.js'));

const portPalette = require(path.join(ROOT, 'dist', 'src', 'palette.js'));
const portRender = require(path.join(ROOT, 'dist', 'src', 'render.js'));
const portRaster = require(path.join(ROOT, 'dist', 'src', 'raster.js'));
const portCodec = require(path.join(ROOT, 'dist', 'src', 'index.js'));

const { decodePng, encodePng } = require(path.join(ROOT, 'example', 'png.js'));
const random = require(path.join(__dirname, 'random-pony.js')).createRandom(0x51ed270b);

// --- the sprite sheet ---

function loadSheet(name, alphaName) {
	const sheet = decodePng(fs.readFileSync(path.join(IMAGES, name)));

	if (alphaName) {
		const alpha = decodePng(fs.readFileSync(path.join(IMAGES, alphaName)));

		for (let i = 0; i < sheet.data.length; i += 4) {
			sheet.data[i + 3] = alpha.data[i];
		}
	}

	return sheet;
}

// --- the mock canvas of the original ---

function createMockCanvas(width, height) {
	const data = new Uint8ClampedArray(width * height * 4);

	const context = {
		getImageData(x, y, w, h) {
			return { width: w, height: h, data: data };
		},
		putImageData() { },
	};

	return {
		width: width,
		height: height,
		data: data,
		getContext() { return context; },
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

// --- the test ---

let checks = 0;
let failures = 0;

function fail(message) {
	failures++;

	if (failures < 40) {
		console.log('FAIL: ' + message);
	}
}

function testPony(name, info, ponyX, ponyY, options, sheet, width, height) {
	// the original
	const originalPalette = originalPonyInfo.toPalette(info, originalPonyInfo.mockPaletteManager);
	const canvas = createMockCanvas(width, height);
	const batch = new originalContextBatch.ContextSpriteBatch(canvas);

	batch.start({ data: sheet, palette: true }, 0);
	originalPonyDraw.drawPony(batch, originalPalette, createState(), ponyX, ponyY, options);

	// the port
	const portPaletteInfo = portPalette.toPalette(info);
	const image = portRaster.createImage(width, height, 0);
	const commands = portRender.drawPonyCommands(portPaletteInfo, ponyX, ponyY, {
		shadow: options.shadow,
		shadowColor: options.shadowColor,
		selected: options.selected,
		extra: options.extra,
		noEars: options.noEars,
	});

	for (const command of commands) {
		portRaster.drawImagePalette(image, sheet, command.sprite, command.tint, command.palette, command.x, command.y);
	}

	// the comparison
	let different = 0;

	for (let i = 0; i < canvas.data.length; i += 4) {
		checks++;

		if (canvas.data[i] !== image.data[i] ||
			canvas.data[i + 1] !== image.data[i + 1] ||
			canvas.data[i + 2] !== image.data[i + 2] ||
			canvas.data[i + 3] !== image.data[i + 3]) {
			different++;

			if (different < 10) {
				const p = i / 4;
				fail(name + ': the pixel ' + (p % width) + ',' + Math.floor(p / width) + ': ' +
					[canvas.data[i], canvas.data[i + 1], canvas.data[i + 2], canvas.data[i + 3]].join(',') +
					' != ' +
					[image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]].join(','));
			}
		}
	}

	if (different > 0) {
		fail(name + ': ' + different + ' different pixels of ' + (width * height));

		if (name === 'default pony') {
			fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
			fs.writeFileSync(path.join(ROOT, 'out', 'original.png'), encodePng(width, height, canvas.data));
			fs.writeFileSync(path.join(ROOT, 'out', 'port.png'), encodePng(width, height, image.data));
		}
	}

	return different;
}

function main() {
	const count = parseInt(process.argv[2], 10) || 100;
	const width = 80;
	const height = 70;
	const sheet = loadSheet('pony2.png', 'pony2a.png');

	// the default pony
	const defaultPony = originalPonyInfo.createDefaultPony();
	testPony('default pony', defaultPony, 40, 70, createOptions(), sheet, width, height);

	// the default pony with the options
	const selected = createOptions();
	selected.selected = true;
	testPony('default pony selected', defaultPony, 40, 70, selected, sheet, width, height);

	const noShadow = createOptions();
	noShadow.shadow = false;
	testPony('default pony without the shadow', defaultPony, 40, 70, noShadow, sheet, width, height);

	// random ponies
	for (let i = 0; i < count; i++) {
		const info = portCodec.decompressPony(portCodec.compressPony(random.randomPony(true)));

		const opts = createOptions();
		opts.selected = i % 7 === 0;
		opts.shadow = i % 5 !== 0;
		opts.extra = i % 11 !== 0;
		opts.noEars = i % 13 === 0;

		testPony('random pony #' + i, info, 40, 70, opts, sheet, width, height);
	}

	console.log('');
	console.log(checks + ' pixels compared');
	console.log(checks + ' checks, ' + failures + ' failures');

	if (failures > 0) {
		process.exit(1);
	}
}

main();
