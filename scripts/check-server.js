'use strict';

const http = require('http');

const URLS = [
	'/example/webgl/',
	'/example/webgl/main.js',
	'/example/webgl/loader.js',
	'/example/webgl/shaders/palette-layers.glsl',
	'/dist/src/render.js',
	'/dist/src/poseData.js',
	'/dist/src/palette.js',
	'/dist/src/ponyInfo.js',
	'/pony-town-src/assets/images/pony2.png',
	'/pony-town-src/assets/images/pony2a.png',
];

function get(path) {
	return new Promise(resolve => {
		http.get({ host: '127.0.0.1', port: 8123, path: path }, response => {
			let size = 0;

			response.on('data', chunk => size += chunk.length);
			response.on('end', () => resolve({ status: response.statusCode, type: response.headers['content-type'], size: size }));
		}).on('error', error => resolve({ status: 0, type: String(error), size: 0 }));
	});
}

async function main() {
	for (const path of URLS) {
		const result = await get(path);

		console.log(result.status + '  ' + String(result.size).padStart(8) + '  ' + (result.type || '') + '  ' + path);
	}
}

main();
