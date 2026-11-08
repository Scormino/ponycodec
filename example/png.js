// A minimal PNG decoder and encoder (no dependencies).
//
// Supports the formats of the sprite sheets of the original game:
// 8 bit RGB (the palettized sprite sheet) and 4/8 bit palette (the alpha sheet).
'use strict';

const zlib = require('zlib');

const CRC_TABLE = (() => {
	const table = new Int32Array(256);

	for (let n = 0; n < 256; n++) {
		let c = n;

		for (let k = 0; k < 8; k++) {
			c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
		}

		table[n] = c;
	}

	return table;
})();

function crc32(buf) {
	let c = 0xffffffff;

	for (let i = 0; i < buf.length; i++) {
		c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	}

	return (c ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
	const p = a + b - c;
	const pa = Math.abs(p - a);
	const pb = Math.abs(p - b);
	const pc = Math.abs(p - c);

	if (pa <= pb && pa <= pc) {
		return a;
	}

	return pb <= pc ? b : c;
}

// Decodes a PNG file into { width, height, data } - the data is RGBA.
function decodePng(buffer) {
	if (buffer.readUInt32BE(0) !== 0x89504e47) {
		throw new Error('Not a PNG file');
	}

	let offset = 8;
	let width = 0;
	let height = 0;
	let bitDepth = 0;
	let colorType = 0;
	let interlace = 0;
	let palette = null;
	let transparency = null;
	const idat = [];

	while (offset < buffer.length) {
		const length = buffer.readUInt32BE(offset);
		const type = buffer.toString('ascii', offset + 4, offset + 8);
		const data = buffer.slice(offset + 8, offset + 8 + length);
		offset += 12 + length;

		if (type === 'IHDR') {
			width = data.readUInt32BE(0);
			height = data.readUInt32BE(4);
			bitDepth = data[8];
			colorType = data[9];
			interlace = data[12];
		} else if (type === 'PLTE') {
			palette = data;
		} else if (type === 'tRNS') {
			transparency = data;
		} else if (type === 'IDAT') {
			idat.push(data);
		} else if (type === 'IEND') {
			break;
		}
	}

	if (interlace !== 0) {
		throw new Error('Interlaced PNG is not supported');
	}

	const raw = zlib.inflateSync(Buffer.concat(idat));
	const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4;
	const bpp = Math.max(1, (channels * bitDepth) >> 3);
	const bytesPerLine = Math.ceil((channels * bitDepth * width) / 8);
	const out = Buffer.alloc(bytesPerLine * height);

	let pos = 0;

	for (let y = 0; y < height; y++) {
		const filter = raw[pos++];
		const line = raw.slice(pos, pos + bytesPerLine);
		pos += bytesPerLine;
		const cur = out.slice(y * bytesPerLine, (y + 1) * bytesPerLine);
		const prev = y > 0 ? out.slice((y - 1) * bytesPerLine, y * bytesPerLine) : null;

		for (let i = 0; i < bytesPerLine; i++) {
			const x = line[i];
			const a = i >= bpp ? cur[i - bpp] : 0;
			const b = prev ? prev[i] : 0;
			const c = (prev && i >= bpp) ? prev[i - bpp] : 0;
			let value;

			switch (filter) {
				case 0: value = x; break;
				case 1: value = x + a; break;
				case 2: value = x + b; break;
				case 3: value = x + ((a + b) >> 1); break;
				case 4: value = x + paeth(a, b, c); break;
				default: throw new Error('Unsupported PNG filter: ' + filter);
			}

			cur[i] = value & 0xff;
		}
	}

	const data = new Uint8ClampedArray(width * height * 4);

	for (let y = 0; y < height; y++) {
		const line = out.slice(y * bytesPerLine, (y + 1) * bytesPerLine);

		for (let x = 0; x < width; x++) {
			const dst = (y * width + x) << 2;

			if (colorType === 3) {
				let index;

				if (bitDepth === 8) {
					index = line[x];
				} else if (bitDepth === 4) {
					index = (x & 1) === 0 ? (line[x >> 1] >> 4) : (line[x >> 1] & 15);
				} else if (bitDepth === 2) {
					index = (line[x >> 2] >> (6 - (x & 3) * 2)) & 3;
				} else {
					index = (line[x >> 3] >> (7 - (x & 7) * 1)) & 1;
				}

				const p = index * 3;
				data[dst] = palette[p];
				data[dst + 1] = palette[p + 1];
				data[dst + 2] = palette[p + 2];
				data[dst + 3] = transparency && index < transparency.length ? transparency[index] : 255;
			} else {
				const step = bitDepth === 16 ? 2 : 1;
				const base = colorType === 0 || colorType === 4 ? 0 : (colorType === 2 ? 0 : 1);

				if (colorType === 0) {
					const v = line[x * step];
					data[dst] = v;
					data[dst + 1] = v;
					data[dst + 2] = v;
					data[dst + 3] = 255;
				} else if (colorType === 2) {
					const p = x * 3 * step;
					data[dst] = line[p];
					data[dst + 1] = line[p + step];
					data[dst + 2] = line[p + 2 * step];
					data[dst + 3] = 255;
				} else if (colorType === 4) {
					const v = line[x * 2 * step];
					data[dst] = v;
					data[dst + 1] = v;
					data[dst + 2] = v;
					data[dst + 3] = line[x * 2 * step + step];
				} else {
					const p = x * 4 * step;
					data[dst] = line[p];
					data[dst + 1] = line[p + step];
					data[dst + 2] = line[p + 2 * step];
					data[dst + 3] = line[p + 3 * step];
				}
			}
		}
	}

	return { width, height, data };
}

// Encodes RGBA data into a PNG file.
function encodePng(width, height, data) {
	const bytesPerLine = width * 4;
	const raw = Buffer.alloc((bytesPerLine + 1) * height);

	for (let y = 0; y < height; y++) {
		raw[y * (bytesPerLine + 1)] = 0;
		Buffer.from(data.buffer, data.byteOffset + y * bytesPerLine, bytesPerLine)
			.copy(raw, y * (bytesPerLine + 1) + 1);
	}

	const chunks = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];

	function chunk(type, data) {
		const typeBuf = Buffer.from(type, 'ascii');
		const buf = Buffer.concat([typeBuf, data]);
		const length = Buffer.alloc(4);
		length.writeUInt32BE(data.length, 0);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(crc32(buf), 0);
		return Buffer.concat([length, buf, crc]);
	}

	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8;
	ihdr[9] = 6;
	chunks.push(chunk('IHDR', ihdr));
	chunks.push(chunk('IDAT', zlib.deflateSync(raw)));
	chunks.push(chunk('IEND', Buffer.alloc(0)));

	return Buffer.concat(chunks);
}

module.exports = { decodePng, encodePng };
