// Verifies the WebGL renderer in the browser.
//
// The pony is drawn with the WebGL renderer of the example, the pixels of the
// canvas are read back and compared with the pixels of the CPU rasterizer of
// the port (`src/raster.ts`), which is loaded in the browser too.
//
// The CPU rasterizer stores the colour of a pixel without the alpha (the
// original game blends the sprites over a transparent image), while the GPU
// blends them over an opaque background, so the expected colour of a pixel is
// the colour of the CPU rasterizer multiplied by its alpha.
//
// The result is written into the `result` element.
(function () {
'use strict';

const MODULES = [
	'base64', 'bitUtils', 'color', 'colors', 'compressPony', 'constants', 'interfaces',
	'palette', 'ponyInfo', 'poseData', 'raster', 'render', 'renderData', 'schema', 'schemaData', 'utils',
];

const DIST = '../../dist/src/';
const TOLERANCE = 3;

const loader = createPonyLoader(async name => {
	const response = await fetch(DIST + name + '.js');

	if (!response.ok) {
		throw new Error('Cannot load ' + name + '.js: ' + response.status);
	}

	return response.text();
});

function log(element, text) {
	element.textContent += text + '\n';
}

// sends the result back to the server, so the result of a headless browser can
// be read from the command line
function report(text) {
	try {
		fetch('/report', { method: 'POST', body: text });
	} catch (error) {
		// the report is a convenience, the result is in the page anyway
	}
}

// a picture of the image, so it can be looked at in a terminal
function ascii(image, width, height, y0, flipY) {
	const chars = ' .:-=+*#%@';
	const lines = [];

	for (let y = 0; y < height; y++) {
		const row = flipY ? (height - 1 - y) : y;
		let line = '';

		for (let x = 0; x < width; x++) {
			const offset = (row * width + x) * 4;
			const alpha = image[offset + 3] / 255;
			const luminance = (image[offset] * 0.3 + image[offset + 1] * 0.6 + image[offset + 2] * 0.1) * alpha;

			line += chars[Math.min(chars.length - 1, Math.floor(luminance / 256 * chars.length))];
		}

		lines.push(line);
	}

	return lines.join('\n');
}

async function main() {
	const result = document.getElementById('result');

	result.textContent = '';

	try {
		await loader.preload(MODULES);
		await ponyExample.ready;
	} catch (error) {
		log(result, 'ERROR: ' + (error.stack || error.message));
		report(result.textContent);
		return;
	}

	const raster = loader.require('raster');
	const commands = ponyExample.commands;
	const sheet = ponyExample.sheet;
	const gl = ponyExample.gl;
	const canvas = ponyExample.canvas;

	// the CPU rasterizer
	const image = raster.createImage(canvas.width, canvas.height, 0);

	for (const command of commands) {
		raster.drawImagePalette(image, sheet, command.sprite, command.tint, command.palette, command.x, command.y);
	}

	// the pixels of the canvas
	//
	// the pony is drawn again right before the pixels are read back, because
	// the drawing buffer is discarded after the frame is composited
	const pixels = new Uint8Array(canvas.width * canvas.height * 4);

	ponyExample.draw();

	const glError = gl.getError();

	log(result, 'renderer: ' + gl.getParameter(gl.VERSION) + ' / ' + gl.getParameter(gl.RENDERER));
	log(result, 'gl.getError() after the draw: ' + glError);

	gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

	let different = 0;
	let maxDifference = 0;
	let firstDifferences = 0;

	const count = (flipY, flipX) => {
		let result = 0;

		for (let y = 0; y < canvas.height; y++) {
			for (let x = 0; x < canvas.width; x++) {
				const cpu = ((y) * canvas.width + x) * 4;
				const gpu = ((flipY ? canvas.height - 1 - y : y) * canvas.width + (flipX ? canvas.width - 1 - x : x)) * 4;
				const alpha = image.data[cpu + 3];

				for (let c = 0; c < 3; c++) {
					const expected = Math.round(image.data[cpu + c] * alpha / 255);

					if (Math.abs(pixels[gpu + c] - expected) > TOLERANCE) {
						result++;
						break;
					}
				}
			}
		}

		return result;
	};

	for (let y = 0; y < canvas.height; y++) {
		for (let x = 0; x < canvas.width; x++) {
			// the origin of the OpenGL is at the bottom
			const cpu = ((y) * canvas.width + x) * 4;
			const gpu = ((canvas.height - 1 - y) * canvas.width + x) * 4;

			const alpha = image.data[cpu + 3];

			for (let c = 0; c < 3; c++) {
				const expected = Math.round(image.data[cpu + c] * alpha / 255);
				const difference = Math.abs(pixels[gpu + c] - expected);

				if (difference > maxDifference) {
					maxDifference = difference;
				}

				if (difference > TOLERANCE) {
					different++;

					if (firstDifferences < 10) {
						log(result, 'the pixel ' + x + ',' + y + ' the channel ' + c + ': ' +
							pixels[gpu + c] + ' != ' + expected + ' (the CPU ' +
							[image.data[cpu], image.data[cpu + 1], image.data[cpu + 2], alpha].join(',') + ')');
						firstDifferences++;
					}

					break;
				}
			}
		}
	}

	log(result, '');
	log(result, canvas.width * canvas.height + ' pixels compared, the tolerance is ' + TOLERANCE);
	log(result, 'the maximum difference is ' + maxDifference);
	log(result, different + ' different pixels');
	log(result, 'flipped vertically: ' + count(true, false) + ' different pixels');
	log(result, 'flipped horizontally: ' + count(false, true) + ' different pixels');
	log(result, 'flipped in both directions: ' + count(true, true) + ' different pixels');
	log(result, '');
	log(result, 'the WebGL image:');
	log(result, ascii(pixels, canvas.width, canvas.height, 0, false));
	log(result, '');
	log(result, 'the CPU image:');
	log(result, ascii(image.data, canvas.width, canvas.height, 0, false));

	result.textContent += different === 0 ? '\nOK\n' : '\nFAILED\n';

	document.title = 'Pony Town - pony renderer (WebGL) - ' + (different === 0 ? 'OK' : different + ' different pixels');

	report(result.textContent);
}

main().catch(error => {
	log(document.getElementById('result'), 'ERROR: ' + (error.stack || error.message));
});
})();
