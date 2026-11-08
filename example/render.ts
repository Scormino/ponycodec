// Renders a pony to a PNG file with the CPU rasterizer.
//
// Usage:
//   node dist/example/render.js [out.png] [base64 save]
//
// The sprite sheets of the original game are read from
// `pony-town-src/assets/images`.
'use strict';

const fs = require('fs');
const path = require('path');

const { decodePng, encodePng } = require('../../example/png.js');
const { createDefaultPony } = require('../src/ponyInfo.js');
const { toPalette } = require('../src/palette.js');
const { drawPonyCommands } = require('../src/render.js');
const { createImage, drawImagePalette } = require('../src/raster.js');
const { compressPonyString, decompressPonyString } = require('../src/compressPony.js');

declare const process: { argv: string[] };
declare const __dirname: string;
declare function require(path: string): any;

const ROOT = path.resolve(__dirname, '..', '..');
const IMAGES = path.join(ROOT, 'pony-town-src', 'assets', 'images');

function loadSheet(name: string, alphaName?: string) {
	const sheet = decodePng(fs.readFileSync(path.join(IMAGES, name)));

	if (alphaName) {
		const alpha = decodePng(fs.readFileSync(path.join(IMAGES, alphaName)));

		for (let i = 0; i < sheet.data.length; i += 4) {
			sheet.data[i + 3] = alpha.data[i];
		}
	}

	return sheet;
}

function main() {
	const out = process.argv[2] || path.join(ROOT, 'out', 'pony.png');
	const save = process.argv[3];

	// the sprite sheet of the palettized sprites
	const sheet = loadSheet('pony2.png', 'pony2a.png');

	// the pony: either the default one or the one that is passed as a base64 save
	let info = createDefaultPony();

	if (save) {
		info = decompressPonyString(save, true);
	}

	const paletteInfo = toPalette(info);

	const width = 80;
	const height = 70;
	const image = createImage(width, height, 0x00000000);
	const commands = drawPonyCommands(paletteInfo, width / 2, height);

	for (const command of commands) {
		drawImagePalette(image, sheet, command.sprite, command.tint, command.palette, command.x, command.y);
	}

	if (!fs.existsSync(path.dirname(out))) {
		fs.mkdirSync(path.dirname(out));
	}

	fs.writeFileSync(out, encodePng(width, height, image.data));
	console.log('rendered ' + commands.length + ' sprites -> ' + out);

	// the compressed save of the rendered pony
	console.log('save: ' + compressPonyString(info));
}

main();
