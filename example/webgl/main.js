// The WebGL example of the pony renderer.
//
// The draw commands are produced by the port (`src/render.ts`), the palettes
// are packed into a palette texture and the sprites are drawn with the shader
// of the original game.
//
// The page must be served over http (the modules and the images are loaded
// with `fetch`), for example:
//
//   node scripts/serve.js
//
// and then open http://127.0.0.1:8123/example/webgl/
(function () {
'use strict';

const DIST = '../../dist/src/';
const IMAGES = '../../pony-town-src/assets/images/';
const SHADER = 'shaders/palette-layers.glsl';

const PALETTE_TEXTURE_SIZE = 512;
const CANVAS_WIDTH = 80;
const CANVAS_HEIGHT = 70;

// the modules of the port that are needed to render a pony
const MODULES = [
	'base64', 'bitUtils', 'color', 'colors', 'compressPony', 'constants', 'interfaces',
	'palette', 'ponyInfo', 'poseData', 'render', 'renderData', 'schema', 'schemaData', 'utils',
];

// --- a minimal CommonJS loader for the compiled port ---

const loader = createPonyLoader(async name => {
	const response = await fetch(DIST + name + '.js');

	if (!response.ok) {
		throw new Error('Cannot load ' + name + '.js: ' + response.status);
	}

	return response.text();
});

// --- the images ---

function loadImage(url) {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error('Cannot load ' + url));
		image.src = url;
	});
}

function getImageData(image) {
	const canvas = document.createElement('canvas');
	canvas.width = image.width;
	canvas.height = image.height;

	const context = canvas.getContext('2d');
	context.drawImage(image, 0, 0);

	return context.getImageData(0, 0, image.width, image.height);
}

// the palettized sprite sheet of the original game
async function loadSpriteSheet() {
	const [image, alpha] = await Promise.all([
		loadImage(IMAGES + 'pony2.png'),
		loadImage(IMAGES + 'pony2a.png'),
	]);

	const data = getImageData(image);
	const alphaData = getImageData(alpha).data;

	for (let i = 0; i < data.data.length; i += 4) {
		data.data[i + 3] = alphaData[i];
	}

	return data;
}

// --- the palettes ---

// the palettes of the draw commands are packed into a texture, the same way
// the original game does it (`PaletteManager`)
class PaletteTexture {
	constructor(gl) {
		this.gl = gl;
		this.palettes = [];
		this.texture = gl.createTexture();
		this.data = new Uint8Array(PALETTE_TEXTURE_SIZE * PALETTE_TEXTURE_SIZE * 4);
	}

	add(colors) {
		for (const palette of this.palettes) {
			if (palette.colors.length === colors.length) {
				let equal = true;

				for (let i = 0; i < colors.length; i++) {
					if (palette.colors[i] !== colors[i]) {
						equal = false;
						break;
					}
				}

				if (equal) {
					return palette;
				}
			}
		}

		const palette = { colors: colors, u: 0, v: 0, x: 0, y: 0 };
		this.palettes.push(palette);

		return palette;
	}

	// the colours are placed in consecutive texels, the palettes are placed
	// in rows
	arrange() {
		let x = 0;
		let y = 0;

		for (const palette of this.palettes) {
			if (x + palette.colors.length > PALETTE_TEXTURE_SIZE) {
				x = 0;
				y++;
			}

			palette.x = x;
			palette.y = y;
			palette.u = (x + 0.5) / PALETTE_TEXTURE_SIZE;
			palette.v = (y + 0.5) / PALETTE_TEXTURE_SIZE;

			let offset = (x + y * PALETTE_TEXTURE_SIZE) * 4;

			for (const color of palette.colors) {
				this.data[offset++] = (color >>> 24) & 0xff;
				this.data[offset++] = (color >>> 16) & 0xff;
				this.data[offset++] = (color >>> 8) & 0xff;
				this.data[offset++] = color & 0xff;
			}

			x += palette.colors.length;
		}
	}

	upload() {
		const gl = this.gl;

		gl.bindTexture(gl.TEXTURE_2D, this.texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, PALETTE_TEXTURE_SIZE, PALETTE_TEXTURE_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.data);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	}
}

// --- the renderer ---

// the mask of the sprite type, the same values as the original game
// (`paletteSpriteBatch.ts`)
const TYPES = [
	[255, 0, 0, 0],
	[0, 0, 255, 0],
	[0, 0, 0, 0],
	[255, 0, 0, 255],
	[0, 255, 0, 255],
	[0, 0, 255, 255],
	[0, 0, 0, 255],
];

const BYTES_PER_VERTEX = 2 * 4 + 4 * 4 + 4 + 4;

function createShader(gl, type, source) {
	const shader = gl.createShader(type);
	gl.shaderSource(shader, source);
	gl.compileShader(shader);

	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		throw new Error('Cannot compile the shader: ' + gl.getShaderInfoLog(shader));
	}

	return shader;
}

function createProgram(gl, source) {
	// the shader file contains both shaders, they are separated by the
	// `// FRAGMENT` marker (the same way as the original game does it)
	const index = source.indexOf('// FRAGMENT');

	if (index === -1) {
		throw new Error('Missing fragment shader separator');
	}

	const program = gl.createProgram();
	gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, source.substring(0, index)));
	gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, source.substring(index)));
	gl.linkProgram(program);

	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		throw new Error('Cannot link the program: ' + gl.getProgramInfoLog(program));
	}

	return program;
}

function pushVertex(vertices, index, x, y, u, v, pu, pv, color, color1) {
	vertices.floats[index + 0] = x;
	vertices.floats[index + 1] = y;
	vertices.floats[index + 2] = u;
	vertices.floats[index + 3] = v;
	vertices.floats[index + 4] = pu;
	vertices.floats[index + 5] = pv;

	// the index is in floats, the colours are written as bytes
	const byteIndex = index * 4;

	vertices.bytes[byteIndex + 24] = (color >>> 24) & 0xff;
	vertices.bytes[byteIndex + 25] = (color >>> 16) & 0xff;
	vertices.bytes[byteIndex + 26] = (color >>> 8) & 0xff;
	vertices.bytes[byteIndex + 27] = color & 0xff;

	const mask = TYPES[color1];
	vertices.bytes[byteIndex + 28] = mask[0];
	vertices.bytes[byteIndex + 29] = mask[1];
	vertices.bytes[byteIndex + 30] = mask[2];
	vertices.bytes[byteIndex + 31] = mask[3];
}

function pushQuad(vertices, index, sprite, color, palette, x, y) {
	const u1 = sprite.x + 0.1;
	const v1 = sprite.y + 0.1;
	const u2 = sprite.x + sprite.w;
	const v2 = sprite.y + sprite.h;

	const dx = x + sprite.ox;
	const dy = y + sprite.oy;
	const dx2 = dx + sprite.w;
	const dy2 = dy + sprite.h;

	// the quad is pushed as two triangles, `(0, 1, 2)` and `(0, 2, 3)` (the
	// original game uses an index buffer with those indices)
	pushVertex(vertices, index + 0, dx, dy, u1, v1, palette.u, palette.v, color, sprite.type);
	pushVertex(vertices, index + 8, dx2, dy, u2, v1, palette.u, palette.v, color, sprite.type);
	pushVertex(vertices, index + 16, dx2, dy2, u2, v2, palette.u, palette.v, color, sprite.type);

	pushVertex(vertices, index + 24, dx, dy, u1, v1, palette.u, palette.v, color, sprite.type);
	pushVertex(vertices, index + 32, dx2, dy2, u2, v2, palette.u, palette.v, color, sprite.type);
	pushVertex(vertices, index + 40, dx, dy2, u1, v2, palette.u, palette.v, color, sprite.type);

	return index + 48;
}

function main() {
	const errorElement = document.getElementById('error');
	const canvas = document.getElementById('canvas');

	// the same options as the original game (`webglUtils.ts`)
	const gl = canvas.getContext('webgl', { alpha: false, premultipliedAlpha: false, antialias: false });

	if (!gl) {
		errorElement.textContent = 'WebGL is not supported by this browser.';
		return Promise.reject(new Error('WebGL is not supported by this browser.'));
	}

	return Promise.all([loader.preload(MODULES), loadSpriteSheet(), fetch(SHADER).then(r => r.text())])
		.then(([_, sheet, shaderSource]) => {
			const ponyInfo = loader.require('ponyInfo');
			const palette = loader.require('palette');
			const render = loader.require('render');

			const info = ponyInfo.createDefaultPony();
			const commands = render.drawPonyCommands(palette.toPalette(info), CANVAS_WIDTH / 2, CANVAS_HEIGHT);

			// the palettes
			const palettes = new PaletteTexture(gl);

			for (const command of commands) {
				command.palette = palettes.add(command.palette.colors);
			}

			palettes.arrange();
			palettes.upload();

			// the program
			const program = createProgram(gl, shaderSource);
			const positionLocation = gl.getAttribLocation(program, 'position');
			const texcoordLocation = gl.getAttribLocation(program, 'texcoords');
			const colorLocation = gl.getAttribLocation(program, 'vertexColor');
			const color1Location = gl.getAttribLocation(program, 'vertexColor1');

			// the vertices
			const buffer = gl.createBuffer();
			const arrayBuffer = new ArrayBuffer(commands.length * 6 * BYTES_PER_VERTEX);
			const vertices = { floats: new Float32Array(arrayBuffer), bytes: new Uint8Array(arrayBuffer) };

			let index = 0;

			for (const command of commands) {
				index = pushQuad(vertices, index, command.sprite, command.tint, command.palette, command.x, command.y);
			}

			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
			gl.bufferData(gl.ARRAY_BUFFER, arrayBuffer, gl.STATIC_DRAW);

			// the sprite sheet
			const sheetTexture = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, sheetTexture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sheet);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

			// the orthographic projection
			const transform = new Float32Array([
				2 / CANVAS_WIDTH, 0, 0, 0,
				0, -2 / CANVAS_HEIGHT, 0, 0,
				0, 0, -1, 0,
				-1, 1, 0, 1,
			]);

			// the draw
			//
			// the drawing buffer is discarded by the browser after the frame is
			// composited (`preserveDrawingBuffer` is not set, the same as in the
			// original game), so the verification page reads the pixels back in
			// the same task as this function is called
			function draw() {
				gl.viewport(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
				gl.clearColor(0, 0, 0, 0);
				gl.clear(gl.COLOR_BUFFER_BIT);
				gl.enable(gl.BLEND);
				gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

				gl.useProgram(program);
				gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

				const stride = BYTES_PER_VERTEX;

				gl.enableVertexAttribArray(positionLocation);
				gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, stride, 0);

				gl.enableVertexAttribArray(texcoordLocation);
				gl.vertexAttribPointer(texcoordLocation, 4, gl.FLOAT, false, stride, 8);

				gl.enableVertexAttribArray(colorLocation);
				gl.vertexAttribPointer(colorLocation, 4, gl.UNSIGNED_BYTE, true, stride, 24);

				gl.enableVertexAttribArray(color1Location);
				gl.vertexAttribPointer(color1Location, 4, gl.UNSIGNED_BYTE, true, stride, 28);

				gl.uniformMatrix4fv(gl.getUniformLocation(program, 'transform'), false, transform);
				gl.uniform4f(gl.getUniformLocation(program, 'lighting'), 1, 1, 1, 1);
				gl.uniform1f(gl.getUniformLocation(program, 'textureSize'), sheet.width);
				gl.uniform1f(gl.getUniformLocation(program, 'pixelSize'), 256 / PALETTE_TEXTURE_SIZE);

				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, sheetTexture);
				gl.uniform1i(gl.getUniformLocation(program, 'sampler1'), 0);

				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_2D, palettes.texture);
				gl.uniform1i(gl.getUniformLocation(program, 'sampler2'), 1);

				gl.drawArrays(gl.TRIANGLES, 0, commands.length * 6);
			}

			draw();

			document.title = 'Pony Town - pony renderer (WebGL) - ' + commands.length + ' sprites';

			// the result is exposed for the verification page
			// (`example/webgl/verify.html`)
			ponyExample.draw = draw;
			ponyExample.commands = commands;
			ponyExample.sheet = sheet;
			ponyExample.gl = gl;
			ponyExample.canvas = canvas;
		})
		.catch(error => {
			errorElement.textContent = error.stack || error.message;
			throw error;
		});
}

// the state of the example, it is used by the verification page
const ponyExample = {
	ready: null,
	draw: null,
	commands: null,
	sheet: null,
	gl: null,
	canvas: null,
};

if (typeof window !== 'undefined') {
	window.ponyExample = ponyExample;
}

ponyExample.ready = main();
})();
