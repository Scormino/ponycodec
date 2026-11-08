'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { decodePng } = require(path.join(ROOT, 'example', 'png.js'));

const image = decodePng(fs.readFileSync(path.join(ROOT, 'out', 'webgl-page.png')));

console.log('the screenshot is ' + image.width + 'x' + image.height);

// the canvas of the page is at (25, 65), it is 80x70 pixels
const chars = ' .:-=+*#%@';
let nonBackground = 0;
let lines = [];

for (let y = 0; y < image.height; y++) {
	let line = '';

	for (let x = 0; x < image.width; x++) {
		const offset = (x + y * image.width) * 4;
		const r = image.data[offset];
		const g = image.data[offset + 1];
		const b = image.data[offset + 2];

		// the background of the page is #2b2b3d
		const background = Math.abs(r - 0x2b) < 6 && Math.abs(g - 0x2b) < 6 && Math.abs(b - 0x3d) < 6;

		if (!background) {
			nonBackground++;
		}

		const luminance = (r * 0.3 + g * 0.6 + b * 0.1);
		line += background ? ' ' : chars[Math.min(chars.length - 1, Math.floor(luminance / 256 * chars.length))];
	}

	lines.push(line);
}

console.log(lines.join('\n'));
console.log(nonBackground + ' pixels are not the background of the page');
