// Differential test of the WebGL renderer.
//
// The WebGL renderer of the example (`example/webgl/main.js`) is simulated on
// the CPU: the shader of the original game is evaluated for every pixel of
// every sprite and the result is compared with the result of the CPU
// rasterizer of the port (`src/raster.ts`).
//
// The simulation covers:
//
//   - the layout of the palette texture (the colours of a palette are placed
//     in consecutive texels),
//   - the lookup of the colour of the palette in the shader
//     (`paletteCoord.x + paletteIndex * pixelSize`),
//   - the mask of the sprite type (the channel with the palette index and the
//     shading),
//   - the colour of the sprite (the colour of the palette, the shade and the
//     tint).
//
// Runs on Node 9.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IMAGES = path.join(ROOT, 'pony-town-src', 'assets', 'images');

const portPalette = require(path.join(ROOT, 'dist', 'src', 'palette.js'));
const portRender = require(path.join(ROOT, 'dist', 'src', 'render.js'));
const portRaster = require(path.join(ROOT, 'dist', 'src', 'raster.js'));
const portPonyInfo = require(path.join(ROOT, 'dist', 'src', 'ponyInfo.js'));

const { decodePng } = require(path.join(ROOT, 'example', 'png.js'));
const random = require(path.join(__dirname, 'random-pony.js')).createRandom(0x51ed270b);

const PALETTE_TEXTURE_SIZE = 512;
const WIDTH = 80;
const HEIGHT = 70;

// the mask of the sprite type, the same values as the original game
// (`paletteSpriteBatch.ts`)
const TYPES = [
	[255, 0, 0, 0],
	[0, 0, 255, 0],
	[0, 0, 0, 0],
	[255, 0, 0, 255],
	[0, 255, 0, 255],
	[0, 0, 255, 255],
	[0, 0, 0, 255],
];

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

// --- the palette texture ---

class PaletteTexture {
	constructor() {
		this.palettes = [];
		this.data = new Uint8Array(PALETTE_TEXTURE_SIZE * PALETTE_TEXTURE_SIZE * 4);
	}

	add(colors) {
		for (const palette of this.palettes) {
			if (palette.colors.length === colors.length) {
				let equal = true;

				for (let i = 0; i < colors.length; i++) {
					if (palette.colors[i] !== colors[i]) {
						equal = false;
						break;
					}
				}

				if (equal) {
					return palette;
				}
			}
		}

		const palette = { colors: colors, u: 0, v: 0, x: 0, y: 0 };
		this.palettes.push(palette);

		return palette;
	}

	arrange() {
		let x = 0;
		let y = 0;

		for (const palette of this.palettes) {
			if (x + palette.colors.length > PALETTE_TEXTURE_SIZE) {
				x = 0;
				y++;
			}

			palette.x = x;
			palette.y = y;
			palette.u = (x + 0.5) / PALETTE_TEXTURE_SIZE;
			palette.v = (y + 0.5) / PALETTE_TEXTURE_SIZE;

			let offset = (x + y * PALETTE_TEXTURE_SIZE) * 4;

			for (const color of palette.colors) {
				this.data[offset++] = (color >>> 24) & 0xff;
				this.data[offset++] = (color >>> 16) & 0xff;
				this.data[offset++] = (color >>> 8) & 0xff;
				this.data[offset++] = color & 0xff;
			}

			x += palette.colors.length;
		}
	}

	// the colour of the palette that the shader samples
	sample(u, v) {
		const x = Math.min(PALETTE_TEXTURE_SIZE - 1, Math.max(0, Math.floor(u * PALETTE_TEXTURE_SIZE)));
		const y = Math.min(PALETTE_TEXTURE_SIZE - 1, Math.max(0, Math.floor(v * PALETTE_TEXTURE_SIZE)));
		const offset = (x + y * PALETTE_TEXTURE_SIZE) * 4;

		return [
			this.data[offset], this.data[offset + 1], this.data[offset + 2], this.data[offset + 3]
		];
	}
}

// --- the simulation of the shader ---

function shadeOf(type) {
	return TYPES[type];
}

// The colour of a pixel of a sprite as the shader of the original game
// calculates it.
function shaderPixel(sheet, sprite, palettes, palette, tint, px, py) {
	const offset = (px + py * sheet.width) * 4;
	const spriteR = sheet.data[offset] / 255;
	const spriteG = sheet.data[offset + 1] / 255;
	const spriteB = sheet.data[offset + 2] / 255;
	const spriteA = sheet.data[offset + 3] / 255;

	const mask = shadeOf(sprite.type);
	const shade = Math.min(1, Math.max(0, spriteG + mask[3] / 255));

	const paletteIndex =
		mask[0] / 255 * spriteR +
		mask[1] / 255 * spriteG +
		mask[2] / 255 * spriteB +
		(1 - (mask[0] + mask[1] + mask[2]) / 255) * spriteA;

	const color = palettes.sample(palette.u + paletteIndex * (256 / PALETTE_TEXTURE_SIZE), palette.v);

	const tintR = ((tint >>> 24) & 0xff) / 255;
	const tintG = ((tint >>> 16) & 0xff) / 255;
	const tintB = ((tint >>> 8) & 0xff) / 255;
	const tintA = (tint & 0xff) / 255;

	return {
		r: (color[0] / 255) * shade * tintR,
		g: (color[1] / 255) * shade * tintG,
		b: (color[2] / 255) * shade * tintB,
		a: (color[3] / 255) * tintA,
		color: color,
		index: paletteIndex,
		shade: shade,
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

function testPony(name, info, sheet) {
	const commands = portRender.drawPonyCommands(portPalette.toPalette(info), WIDTH / 2, HEIGHT);
	const palettes = new PaletteTexture();

	for (const command of commands) {
		command.palette = palettes.add(command.palette.colors);
	}

	palettes.arrange();

	// the colours of the palettes must be the same as the ones of the CPU
	// rasterizer
	for (const command of commands) {
		checks++;

		if (command.palette.colors.length !== command.palette.colors.length) {
			fail(name + ': the palette is different');
		}
	}

	// the image of the CPU rasterizer
	//
	// The image is filled with an opaque colour: the CPU rasterizer replaces
	// the pixels of a transparent background with the colour of the sprite
	// (`blendPrecise`), while the GPU blends the sprite with the background,
	// so the two renderers can be compared only on an opaque background.
	const image = portRaster.createImage(WIDTH, HEIGHT, 0x000000ff);

	for (const command of commands) {
		portRaster.drawImagePalette(image, sheet, command.sprite, command.tint, command.palette, command.x, command.y);
	}

	// the simulation of the shader
	const simulated = portRaster.createImage(WIDTH, HEIGHT, 0x000000ff);

	for (const command of commands) {
		const sprite = command.sprite;
		const dx = Math.round(command.x + sprite.ox);
		const dy = Math.round(command.y + sprite.oy);

		for (let y = 0; y < sprite.h; y++) {
			for (let x = 0; x < sprite.w; x++) {
				const sx = sprite.x + x;
				const sy = sprite.y + y;
				const tx = dx + x;
				const ty = dy + y;

				if (sx < 0 || sy < 0 || sx >= sheet.width || sy >= sheet.height) {
					continue;
				}

				if (tx < 0 || ty < 0 || tx >= WIDTH || ty >= HEIGHT) {
					continue;
				}

				const pixel = shaderPixel(sheet, sprite, palettes, command.palette, command.tint, sx, sy);
				const offset = (tx + ty * WIDTH) * 4;

				// the colour of the palette that the shader samples must be the
				// same as the colour of the palette of the CPU rasterizer
				const index = Math.round(pixel.index * 255);
				const cpuColor = command.palette.colors[index];

				checks++;

				if (cpuColor === undefined) {
					fail(name + ': the index ' + index + ' is out of the palette');
				} else if (((cpuColor >>> 24) & 0xff) !== pixel.color[0] ||
					((cpuColor >>> 16) & 0xff) !== pixel.color[1] ||
					((cpuColor >>> 8) & 0xff) !== pixel.color[2] ||
					(cpuColor & 0xff) !== pixel.color[3]) {
					fail(name + ': the colour of the palette ' + index + ' is different');
				}

				if (pixel.a <= 0) {
					continue;
				}

				// the blending of the GPU: src * srcAlpha + dst * (1 - srcAlpha)
				const dstR = simulated.data[offset] / 255;
				const dstG = simulated.data[offset + 1] / 255;
				const dstB = simulated.data[offset + 2] / 255;

				simulated.data[offset] = Math.round((pixel.r * pixel.a + dstR * (1 - pixel.a)) * 255);
				simulated.data[offset + 1] = Math.round((pixel.g * pixel.a + dstG * (1 - pixel.a)) * 255);
				simulated.data[offset + 2] = Math.round((pixel.b * pixel.a + dstB * (1 - pixel.a)) * 255);
				simulated.data[offset + 3] = Math.round(pixel.a * 255 + simulated.data[offset + 3] * (1 - pixel.a));
			}
		}
	}

	// the comparison of the images
	let different = 0;
	let maxDifference = 0;

	for (let i = 0; i < image.data.length; i += 4) {
		checks++;

		for (let c = 0; c < 4; c++) {
			const difference = Math.abs(image.data[i + c] - simulated.data[i + c]);

			if (difference > maxDifference) {
				maxDifference = difference;
			}

			if (difference > 2) {
				different++;

				if (different < 10) {
					const p = i / 4;
					fail(name + ': the pixel ' + (p % WIDTH) + ',' + Math.floor(p / WIDTH) + ': the channel ' + c + ': ' +
						image.data[i + c] + ' != ' + simulated.data[i + c] + ' (' +
						Array.prototype.slice.call(image.data, i, i + 4).join(',') + ' != ' +
						Array.prototype.slice.call(simulated.data, i, i + 4).join(',') + ')');
				}

				break;
			}
		}
	}

	return { commands: commands.length, maxDifference: maxDifference };
}

function main() {
	const count = parseInt(process.argv[2], 10) || 50;
	const sheet = loadSheet('pony2.png', 'pony2a.png');

	const defaultPony = portPonyInfo.createDefaultPony();
	const result = testPony('default pony', defaultPony, sheet);

	for (let i = 0; i < count; i++) {
		const info = require(path.join(ROOT, 'dist', 'src', 'index.js')).decompressPony(
			require(path.join(ROOT, 'dist', 'src', 'index.js')).compressPony(random.randomPony(true)));

		testPony('random pony #' + i, info, sheet);
	}

	console.log('');
	console.log(result.commands + ' sprites in the default pony');
	console.log(checks + ' checks, ' + failures + ' failures');

	if (failures > 0) {
		process.exit(1);
	}
}

main();
