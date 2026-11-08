// Finds the sprite sets that contain the given sprite rectangles.
'use strict';

global.DEVELOPMENT = false;
global.SERVER = true;
global.CLIENT = false;
global.PRODUCTION = false;
global.BETA = false;

const SRC = 'C:/ponycodec/pony-town-src/src/scripts';
const S = require(SRC + '/generated/sprites.js');
const U = require(SRC + '/client/ponyUtils.js');

const targets = process.argv.slice(2).map(s => s.split(',').map(Number));

function rect(sprite) {
	return sprite ? [sprite.x, sprite.y, sprite.w, sprite.h].join(',') : 'null';
}

function scan(name, value, path) {
	if (!value || typeof value !== 'object') {
		return;
	}

	if (value.x !== undefined) {
		const r = rect(value);

		for (const t of targets) {
			if (t.join(',') === r) {
				console.log(name + path + ' = ' + r);
			}
		}

		return;
	}

	if (value.color || value.extra) {
		scan(name, value.color, path + '.color');
		scan(name, value.extra, path + '.extra');
		return;
	}

	if (Array.isArray(value)) {
		value.forEach((v, i) => scan(name, v, path + '[' + i + ']'));
	}
}

for (const n of Object.keys(S)) {
	scan('S.' + n, S[n], '');
}

for (const n of Object.keys(U)) {
	scan('U.' + n, U[n], '');
}
