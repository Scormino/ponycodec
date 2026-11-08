// Checks the WebGL example of the port.
//
// The example loads the compiled modules of the port with its own CommonJS
// loader (`example/webgl/loader.js`), so the loader is checked here with the
// same modules and the same drawing code: the draw commands of the example
// must be the same as the draw commands of the CPU renderer.
//
// Usage: node scripts/check-webgl.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'src');

const createLoader = require(path.join(ROOT, 'example', 'webgl', 'loader.js'));

const MODULES = [
	'base64', 'bitUtils', 'color', 'colors', 'compressPony', 'constants', 'interfaces',
	'palette', 'ponyInfo', 'poseData', 'render', 'renderData', 'schema', 'schemaData', 'utils',
];

const CANVAS_WIDTH = 80;
const CANVAS_HEIGHT = 70;

let checks = 0;
let failures = 0;

function fail(message) {
	failures++;
	console.log('FAIL: ' + message);
}

async function main() {
	const loader = createLoader(async name => {
		const file = path.join(DIST, name + '.js');

		if (!fs.existsSync(file)) {
			throw new Error('The module ' + name + ' is not built');
		}

		return fs.readFileSync(file, 'utf8');
	});

	await loader.preload(MODULES);

	const ponyInfo = loader.require('ponyInfo');
	const palette = loader.require('palette');
	const render = loader.require('render');

	// the modules of the port are loaded by the example
	const info = ponyInfo.createDefaultPony();
	const commands = render.drawPonyCommands(palette.toPalette(info), CANVAS_WIDTH / 2, CANVAS_HEIGHT);

	checks++;

	if (commands.length === 0) {
		fail('the example does not draw anything');
	}

	// the draw commands of the example must be the same as the draw commands
	// of the CPU renderer
	const referencePalette = require(path.join(DIST, 'palette.js'));
	const referenceRender = require(path.join(DIST, 'render.js'));
	const referenceCommands = referenceRender.drawPonyCommands(
		referencePalette.toPalette(info), CANVAS_WIDTH / 2, CANVAS_HEIGHT);

	checks++;

	if (referenceCommands.length !== commands.length) {
		fail('the number of the draw commands is different');
	} else {
		for (let i = 0; i < commands.length; i++) {
			checks++;

			const a = commands[i];
			const b = referenceCommands[i];

			if (a.x !== b.x || a.y !== b.y || a.tint !== b.tint ||
				a.sprite.x !== b.sprite.x || a.sprite.y !== b.sprite.y ||
				a.sprite.w !== b.sprite.w || a.sprite.h !== b.sprite.h ||
				a.sprite.ox !== b.sprite.ox || a.sprite.oy !== b.sprite.oy ||
				a.sprite.type !== b.sprite.type) {
				fail('the draw command ' + i + ' is different');
				break;
			}
		}
	}

	console.log('');
	console.log(commands.length + ' sprites in the default pony');
	console.log(checks + ' checks, ' + failures + ' failures');

	if (failures > 0) {
		process.exit(1);
	}
}

main().catch(error => {
	console.log('ERROR: ' + (error.stack || error.message));
	process.exit(1);
});
