// A static file server for the examples of the port.
//
// Usage: node scripts/serve.js [port]
//
// The WebGL example loads the compiled modules and the sprite sheets with
// `fetch`, so it must be served over http.
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const url = require('url');

const ROOT = path.resolve(__dirname, '..');
const PORT = parseInt(process.argv[2], 10) || 8123;

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.png': 'image/png',
	'.glsl': 'text/plain; charset=utf-8',
	'.map': 'application/json; charset=utf-8',
};

const server = http.createServer((request, response) => {
	const pathname = decodeURIComponent(url.parse(request.url || '/').pathname || '/');

	// the pages of the example can report their result here, it is used to
	// check the examples in a headless browser
	if (request.method === 'POST' && pathname === '/report') {
		let body = '';

		request.on('data', chunk => body += chunk);
		request.on('end', () => {
			const file = path.join(ROOT, 'out', 'browser-report.txt');

			if (!fs.existsSync(path.dirname(file))) {
				fs.mkdirSync(path.dirname(file));
			}

			fs.writeFileSync(file, body);
			response.writeHead(204);
			response.end();

			console.log('the browser reported ' + body.length + ' characters');
		});

		return;
	}

	let file = path.join(ROOT, path.normalize(pathname).replace(/^([/\\])+/, ''));

	// no files outside of the project
	if (file.indexOf(ROOT) !== 0) {
		response.writeHead(403);
		response.end('forbidden');
		return;
	}

	if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
		file = path.join(file, 'index.html');
	}

	fs.readFile(file, (error, data) => {
		if (error) {
			response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
			response.end('not found: ' + pathname);
			return;
		}

		response.writeHead(200, {
			'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
			'Cache-Control': 'no-cache',
		});
		response.end(data);
	});
});

server.listen(PORT, '127.0.0.1', () => {
	console.log('serving ' + ROOT + ' on http://127.0.0.1:' + PORT + '/');
	console.log('the WebGL example: http://127.0.0.1:' + PORT + '/example/webgl/');
});
