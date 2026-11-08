// Prints the draw commands of the original and of the port side by side for
// one random pony.
//
// Usage: node scripts/dump-render.js [pony index]
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

const portPalette = require(path.join(ROOT, 'dist', 'src', 'palette.js'));
const portRender = require(path.join(ROOT, 'dist', 'src', 'render.js'));
const portCodec = require(path.join(ROOT, 'dist', 'src', 'index.js'));

const random = require(path.join(__dirname, 'random-pony.js')).createRandom(0x51ed270b);

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
				rect: '(' + sprite.x + ',' + sprite.y + ',' + sprite.w + ',' + sprite.h + ')',
				ox: sprite.ox, oy: sprite.oy, type: sprite.type,
				tint: (color >>> 0).toString(16),
				pos: Math.round(transform[0] * x + transform[2] * y + transform[4]) + ',' +
					Math.round(transform[1] * x + transform[3] * y + transform[5]),
				colors: palette && palette.colors ? Array.prototype.slice.call(palette.colors).length : 0,
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

function main() {
	const index = parseInt(process.argv[2], 10) || 0;

	for (let i = 0; i <= index; i++) {
		const info = portCodec.decompressPony(portCodec.compressPony(random.randomPony(true)));

		const opts = {
			flipped: false, selected: i % 7 === 0, shadow: i % 5 !== 0, extra: i % 11 !== 0, toy: 0,
			swimming: false, bounce: false, shadowColor: originalColors.SHADOW_COLOR,
			noEars: i % 13 === 0, gameTime: 0, no: 0, useAllHooves: false,
		};

		const ponyX = 40 + random.rndInt(200);
		const ponyY = 70 + random.rndInt(200);

		const originalPalette = originalPonyInfo.toPalette(info, originalPonyInfo.mockPaletteManager);
		const portPaletteInfo = portPalette.toPalette(info);

		const batch = createFakeBatch();
		originalPonyDraw.drawPony(batch, originalPalette, {
			animation: originalAnimations.stand, animationFrame: 0,
			headAnimation: undefined, headAnimationFrame: 0,
			headTurned: false, headTilt: 0, headTurn: 0, blinkFrame: 0,
			expression: undefined, holding: undefined, blushColor: 0, flags: 0,
		}, ponyX, ponyY, opts);

		const commands = portRender.drawPonyCommands(portPaletteInfo, ponyX, ponyY, {
			shadow: opts.shadow,
			shadowColor: opts.shadowColor,
			selected: opts.selected,
			extra: opts.extra,
			noEars: opts.noEars,
		});

		if (i !== index) {
			continue;
		}

		console.log('the pony info:');
		console.log(JSON.stringify(info, null, 1).substr(0, 4000));

		const count = Math.max(batch.commands.length, commands.length);

		for (let j = 0; j < count; j++) {
			const a = batch.commands[j];
			const b = commands[j];

			console.log(
				(j + ' ').padEnd(4) +
				(a ? (a.rect + ' t' + a.type + ' tint' + a.tint + ' @' + a.pos + ' c' + a.colors).padEnd(52) : '-'.padEnd(52)) +
				'| ' +
				(b ? ('(' + b.sprite.x + ',' + b.sprite.y + ',' + b.sprite.w + ',' + b.sprite.h + ')' +
					' t' + b.sprite.type + ' tint' + (b.tint >>> 0).toString(16) +
					' @' + b.x + ',' + b.y + ' c' + b.palette.colors.length) : '-'));
		}
	}
}

main();
