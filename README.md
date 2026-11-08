# ponycodec

A byte-compatible pony codec for [Pony Town](https://pony.town) 0.53.1-alpha and a
focused renderer for the standing pose.

The project has two independent parts:

* **the codec** — `compressPony` / `decompressPony` produce exactly the same bytes as the
  original server and read the original saves back, including the legacy versions 1, 2 and 3;
* **the renderer** — the draw commands of the standing pose and a CPU rasterizer that produce
  the same pixels as the original client, plus a WebGL example that draws the pony with the
  shader of the original game.

Everything in this repository is verified against the original game automatically, see
[FINAL_VERIFICATION.md](FINAL_VERIFICATION.md).

## License

The code of this project is released into the public domain under the
[Unlicense](https://unlicense.org). The art and the music of Pony Town are licensed under
**CC BY-NC 4.0** and are *not* part of this project: the sprite sheets of the original game
are read from the checkout of the original game (`pony-town-src/assets/images`) and stay
under their own license. A commercial use of the ported game is therefore not allowed.

## Scope

The renderer covers **the standing pose only**:

* the body, the head, the mane, the tail, the legs, the hooves, the socks and the claws;
* the eyes (the neutral, open eyes), the markings, the accessories and the body colours;
* the shadow.

Everything else of the original game is out of scope: the animations (the walk, the run, the
sleep), the facial expressions, the blinking, the head turns, the toys, the room, the
multiplayer, the server and the editor. The codec is complete, the renderer is a subset.

## Requirements

* Node.js 9 or newer (the code is ES2017 and is compiled by TypeScript 3.9);
* TypeScript 3.9 (`npm install typescript`) — the only build dependency;
* a checkout of the original game in `pony-town-src` (the reference implementation and the
  sprite sheets).

The original game is not modified, it is only read: the scripts in `scripts/` extract the
data of the original and the tests compare the port with it.

## Build and test

```sh
npm run build          # tsc -p tsconfig.json -> dist/
npm test               # the unit tests (dist/test/run.js)
npm run diff           # the codec is compared with the original
npm run diff-render    # the draw commands are compared with the original
npm run diff-pixels    # the rendered pixels are compared with the original
npm run diff-webgl     # the WebGL shader is compared with the CPU rasterizer
npm run check-webgl    # the WebGL example loads the port and draws the same pony
npm run check-browser  # the WebGL example renders the same pixels as the CPU rasterizer, in a browser
npm run serve          # serves the project on http://127.0.0.1:8123 for the examples
npm run example        # renders out/pony.png with the CPU rasterizer
```

The `diff*` scripts need the checkout of the original game in `pony-town-src`.

## The API

```ts
import {
	compressPony, decompressPony,        // the numeric (server) representation
	compressPonyString, decompressPonyString, // the string (client) representation
	canonicalize, isCanonical,
	createDefaultPony, toPalette, drawPonyCommands,
} from './src/index';
```

* `compressPony(info)` returns the base64 of the save, `decompressPony(save)` reads a save
  back (a base64 string or the bytes of a save);
* the canonical form of a save is the numeric one: the server stores
  `compressPony(decompressPony(save))`, so `canonicalize` returns exactly that string;
* `toPalette(info)` builds the palettes of a pony, `drawPonyCommands(palette, x, y)` returns
  the list of the sprites of the standing pose, and `src/raster.ts` draws them.

## The structure

```
src/            the port
  compressPony.ts   the codec (the same format as the original server)
  canonicalize.ts   the canonical form of a save
  ponyInfo.ts       the pony, the sets and the locks
  palette.ts        the palettes of a pony
  render.ts         the draw commands of the standing pose
  raster.ts         the CPU rasterizer
  color.ts          the colours of the original game
  schema.ts         the schema of the save format
  poseData.ts       the generated sprite rectangles of the standing pose
  renderData.ts     the generated sprite rectangles of the original renderer
  schemaData.ts     the generated schema of the save format
schema/         the generated JSON schemas (the source of the generated modules)
scripts/        the extraction of the data of the original game and the differential tests
test/           the unit tests
example/        the examples
  render.ts     the CPU renderer (out/pony.png)
  webgl/        the WebGL renderer
```

The three generated modules (`schemaData.ts`, `renderData.ts`, `poseData.ts`) are produced
from the original game by the scripts in `scripts/`:

```sh
npm run extract-schema && npm run gen-schema
npm run extract-render && npm run gen-render
npm run extract-pose   && npm run gen-pose
```

They are checked in, so the build does not need the original game — only the tests do.

## The examples

### The CPU renderer

```sh
npm run example
node dist/example/render.js out/pony.png
node dist/example/render.js out/pony.png EAP/AADapSD/1wA2QAJpDQBPwAMADEAcIDCAgA==
```

The image is 80x70 pixels, the size of a pony in the game.

### The WebGL renderer

`example/webgl` draws the pony with WebGL, using the shader of the original game
(`example/webgl/shaders/palette-layers.glsl`) and the palette texture of the original
(`PaletteManager`).

The page loads the compiled port and the sprite sheets with `fetch`, so it must be served
over http:

```sh
npm run serve
```

and then open <http://127.0.0.1:8123/example/webgl/> (the pony) or
<http://127.0.0.1:8123/example/webgl/verify.html> (the verification page).

The verification page draws the pony with the WebGL renderer, reads the pixels of the canvas
back with `readPixels` and compares them with the CPU rasterizer of the port, which is loaded
in the browser too. It prints the two images as ASCII art and the number of the different
pixels.

`npm run check-browser` does the same in a headless browser: it starts the server if it is
not running, opens the verification page, reads the report from `out/browser-report.txt` and
fails if the pixels are not equal. The result is 5 600 pixels compared, 0 different pixels.

The example is also checked without a browser: `npm run check-webgl` checks that it loads the
port with its own module loader and produces the same draw commands as the CPU renderer, and
`npm run diff-webgl` simulates the shader of the original game on the CPU and compares the
result with the CPU rasterizer of the port pixel by pixel.
