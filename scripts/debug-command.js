// Prints the draw commands that cover the given pixel of the rendered pony.
//
// Usage: node scripts/debug-command.js [x] [y] [index of the random pony]
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IMAGES = path.join(ROOT, 'pony-town-src', 'assets', 'images');

const portPalette = require(path.join(ROOT, 'dist', 'src', 'palette.js'));
const portRender = require(path.join(ROOT, 'dist', 'src', 'render.js'));
const portIndex = require(path.join(ROOT, 'dist', 'src', 'index.js'));

const random = require(path.join(__dirname, 'random-pony.js')).createRandom(0x51ed270b);

function main() {
	const x = parseInt(process.argv[2], 10) || 35;
	const y = parseInt(process.argv[3], 10) || 8;
	const index = parseInt(process.argv[4], 10) || -1;

	let info = portIndex.decompressPony(portIndex.compressPony(
		portIndex.decompressPonyString('EAP/AADapSD/1wA2QAJpDQBPwAMADEAcIDCAgA==')));

	if (index >= 0) {
		for (let i = 0; i <= index; i++) {
			info = portIndex.decompressPony(portIndex.compressPony(random.randomPony(true)));
		}
	}

	const commands = portRender.drawPonyCommands(portPalette.toPalette(info), 40, 70);

	for (let c = 0; c < commands.length; c++) {
		const command = commands[c];
		const sprite = command.sprite;
		const dx = Math.round(command.x + sprite.ox);
		const dy = Math.round(command.y + sprite.oy);

		if (x >= dx && x < dx + sprite.w && y >= dy && y < dy + sprite.h) {
			console.log('command ' + c + ': the sprite ' + [sprite.x, sprite.y, sprite.w, sprite.h].join(',') +
				' at ' + dx + ',' + dy + ' type ' + sprite.type +
				' the tint ' + command.tint.toString(16) +
				' the palette ' + Array.prototype.slice.call(command.palette.colors).map(c => c.toString(16)).join(','));
		}
	}
}

main();
