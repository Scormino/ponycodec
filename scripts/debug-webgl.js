// Finds the first difference between the CPU rasterizer of the port and the
// simulation of the WebGL renderer of the example.
//
// Every draw command is rendered separately and the result is compared with
// the result of the simulation, then the whole image is compared. The script
// prints the first difference it finds.
//
// Usage: node scripts/debug-webgl.js [index of the random pony]
//
//   -1  the default pony of the save
//   -2  the default pony of the code (the pony of the example)
//   0+  a random pony
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IMAGES = path.join(ROOT, 'pony-town-src', 'assets', 'images');

const portPalette = require(path.join(ROOT, 'dist', 'src', 'palette.js'));
const portRender = require(path.join(ROOT, 'dist', 'src', 'render.js'));
const portRaster = require(path.join(ROOT, 'dist', 'src', 'raster.js'));
const portIndex = require(path.join(ROOT, 'dist', 'src', 'index.js'));
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

// the palette texture of the example
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

	sample(u, v) {
		const x = Math.min(PALETTE_TEXTURE_SIZE - 1, Math.max(0, Math.floor(u * PALETTE_TEXTURE_SIZE)));
		const y = Math.min(PALETTE_TEXTURE_SIZE - 1, Math.max(0, Math.floor(v * PALETTE_TEXTURE_SIZE)));
		const offset = (x + y * PALETTE_TEXTURE_SIZE) * 4;

		return [this.data[offset], this.data[offset + 1], this.data[offset + 2], this.data[offset + 3]];
	}
}

// the colour of a pixel of a sprite as the shader of the original game
// calculates it
function shaderPixel(sheet, sprite, palettes, palette, tint, px, py) {
	const offset = (px + py * sheet.width) * 4;
	const spriteR = sheet.data[offset] / 255;
	const spriteG = sheet.data[offset + 1] / 255;
	const spriteB = sheet.data[offset + 2] / 255;
	const spriteA = sheet.data[offset + 3] / 255;

	const mask = TYPES[sprite.type];
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

// draws a sprite with the simulation of the shader
function simulate(image, sheet, sprite, palettes, palette, tint, x, y) {
	const dx = Math.round(x + sprite.ox);
	const dy = Math.round(y + sprite.oy);

	for (let sy = 0; sy < sprite.h; sy++) {
		for (let sx = 0; sx < sprite.w; sx++) {
			const px = sprite.x + sx;
			const py = sprite.y + sy;
			const tx = dx + sx;
			const ty = dy + sy;

			if (px < 0 || py < 0 || px >= sheet.width || py >= sheet.height) {
				continue;
			}

			if (tx < 0 || ty < 0 || tx >= WIDTH || ty >= HEIGHT) {
				continue;
			}

			const pixel = shaderPixel(sheet, sprite, palettes, palette, tint, px, py);
			const offset = (tx + ty * WIDTH) * 4;

			if (pixel.a <= 0) {
				continue;
			}

			const dstR = image.data[offset] / 255;
			const dstG = image.data[offset + 1] / 255;
			const dstB = image.data[offset + 2] / 255;

			image.data[offset] = Math.round((pixel.r * pixel.a + dstR * (1 - pixel.a)) * 255);
			image.data[offset + 1] = Math.round((pixel.g * pixel.a + dstG * (1 - pixel.a)) * 255);
			image.data[offset + 2] = Math.round((pixel.b * pixel.a + dstB * (1 - pixel.a)) * 255);
			image.data[offset + 3] = Math.round(pixel.a * 255 + image.data[offset + 3] * (1 - pixel.a));
		}
	}
}

function compare(a, b, message) {
	for (let i = 0; i < a.data.length; i += 4) {
		for (let c = 0; c < 4; c++) {
			if (Math.abs(a.data[i + c] - b.data[i + c]) > 2) {
				const p = i / 4;

				console.log(message + ': the pixel ' + (p % WIDTH) + ',' + Math.floor(p / WIDTH) +
					' the channel ' + c + ': ' + a.data[i + c] + ' != ' + b.data[i + c] + ' (' +
					Array.prototype.slice.call(a.data, i, i + 4).join(',') + ' != ' +
					Array.prototype.slice.call(b.data, i, i + 4).join(',') + ')');

				return false;
			}
		}
	}

	return true;
}

function main() {
	const index = parseInt(process.argv[2], 10);
	const sheet = loadSheet('pony2.png', 'pony2a.png');

	let info = portIndex.decompressPony(portIndex.compressPony(
		portIndex.decompressPonyString('EAP/AADapSD/1wA2QAJpDQBPwAMADEAcIDCAgA==')));

	if (index === -2) {
		info = portPonyInfo.createDefaultPony();
	} else if (index >= 0) {
		for (let i = 0; i <= index; i++) {
			info = portIndex.decompressPony(portIndex.compressPony(random.randomPony(true)));
		}
	}

	const commands = portRender.drawPonyCommands(portPalette.toPalette(info), WIDTH / 2, HEIGHT);
	const palettes = new PaletteTexture();

	for (const command of commands) {
		command.palette = palettes.add(command.palette.colors);
	}

	palettes.arrange();

	// every draw command
	for (let c = 0; c < commands.length; c++) {
		const command = commands[c];

		const image = portRaster.createImage(WIDTH, HEIGHT, 0x000000ff);
		portRaster.drawImagePalette(image, sheet, command.sprite, command.tint, command.palette, command.x, command.y);

		const simulated = portRaster.createImage(WIDTH, HEIGHT, 0x000000ff);
		simulate(simulated, sheet, command.sprite, palettes, command.palette, command.tint, command.x, command.y);

		if (!compare(image, simulated, 'the command ' + c)) {
			return;
		}
	}

	// the whole image
	const image = portRaster.createImage(WIDTH, HEIGHT, 0x000000ff);
	const simulated = portRaster.createImage(WIDTH, HEIGHT, 0x000000ff);

	for (const command of commands) {
		portRaster.drawImagePalette(image, sheet, command.sprite, command.tint, command.palette, command.x, command.y);
		simulate(simulated, sheet, command.sprite, palettes, command.palette, command.tint, command.x, command.y);
	}

	if (!compare(image, simulated, 'the image')) {
		return;
	}

	console.log('no differences');
}

main();
