'use strict';

// Runs the verification page (`example/webgl/verify.html`) in a headless browser
// and checks its report.
//
// The page draws the pony with the WebGL renderer of the example, reads the
// pixels of the canvas back and compares them with the CPU rasterizer of the
// port. The result is sent to the server of the example (`scripts/serve.js`)
// and written into `out/browser-report.txt`, so it can be read from the command
// line (the standard output of the browser is not reliable in the headless
// mode).
//
// The server is started if it is not running, the browser is found in the
// standard locations or in the `CHROME` environment variable.

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const REPORT = path.join(ROOT, 'out', 'browser-report.txt');
const URL = 'http://127.0.0.1:8123/example/webgl/verify.html';
const PORT = 8123;
const WAIT_FOR_SERVER = 15000;
const WAIT_FOR_REPORT = 120000;
const BROWSER_ARGS = [
	'--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
	'--no-sandbox', '--disable-extensions', '--no-first-run', '--no-default-browser-check',
	'--virtual-time-budget=30000',
];

const BROWSERS = [
	process.env.CHROME,
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

function findBrowser() {
	for (const browser of BROWSERS) {
		if (browser && fs.existsSync(browser)) {
			return browser;
		}
	}

	throw new Error('Cannot find a browser, set the CHROME environment variable');
}

function isServerRunning() {
	return new Promise(resolve => {
		const request = http.get({ host: '127.0.0.1', port: PORT, path: '/example/webgl/verify.html' }, response => {
			response.resume();
			resolve(response.statusCode === 200);
		});

		request.on('error', () => resolve(false));
		request.setTimeout(1000, () => (request.destroy(), resolve(false)));
	});
}

function sleep(milliseconds) {
	return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function waitForServer() {
	const started = Date.now();

	while ((Date.now() - started) < WAIT_FOR_SERVER) {
		if (await isServerRunning()) {
			return;
		}

		await sleep(250);
	}

	throw new Error('The server did not start (' + URL + ')');
}

async function startServer() {
	if (await isServerRunning()) {
		console.log('the server is already running');
		return;
	}

	console.log('starting the server (scripts/serve.js)');

	const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.js')], {
		cwd: ROOT, detached: true, stdio: 'ignore',
	});

	server.unref();

	await waitForServer();
}

async function waitForReport() {
	const started = Date.now();

	while ((Date.now() - started) < WAIT_FOR_REPORT) {
		if (fs.existsSync(REPORT)) {
			const report = fs.readFileSync(REPORT, 'utf8');

			if (report.indexOf('pixels compared') !== -1 || report.indexOf('ERROR') !== -1) {
				return report;
			}
		}

		await sleep(500);
	}

	throw new Error('The browser did not send a report within ' + (WAIT_FOR_REPORT / 1000) + ' seconds');
}

async function main() {
	const browser = findBrowser();

	console.log('the browser: ' + browser);

	await startServer();

	if (fs.existsSync(REPORT)) {
		fs.unlinkSync(REPORT);
	}

	// the browser exits when the page is loaded, the result is sent by the page
	// itself, so the exit code of the browser is not checked
	spawnSync(browser, BROWSER_ARGS.concat([URL]), {
		stdio: 'ignore',
		timeout: 120000,
		windowsHide: true,
	});

	const report = await waitForReport();

	console.log('');
	console.log(report.replace(/^\s*\n/, ''));
	console.log('');

	const different = /(\d+) different pixels/.exec(report);
	const passed = different !== null && Number(different[1]) === 0 && report.indexOf('FAILED') === -1;

	if (!passed) {
		throw new Error('The WebGL renderer of the example does not match the CPU rasterizer');
	}

	console.log('the browser check passed');
}

main().catch(error => {
	console.error('ERROR: ' + (error.stack || error.message));
	process.exit(1);
});
