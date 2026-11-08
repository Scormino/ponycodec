# Final verification

The port is verified against the original game automatically. Every check below is
reproducible with the scripts in `scripts/` and the checkout of the original game in
`pony-town-src`.

| # | What is verified | How | Result |
|---|------------------|-----|--------|
| 1 | The codec produces the same bytes as the original | `npm run diff` | 13 273 checks, 0 failures |
| 2 | The unit tests of the port | `npm test` | 41 tests, 0 failures |
| 3 | The draw commands of the standing pose | `npm run diff-render` | 12 686 commands, 236 277 checks, 0 failures |
| 4 | The rendered pixels | `npm run diff-pixels` | 576 800 pixels, 0 failures |
| 5 | The WebGL shader of the example | `npm run diff-webgl` | 528 909 checks, 0 failures |
| 6 | The WebGL example | `npm run check-webgl` | 24 checks, 0 failures |
| 7 | The WebGL example in a browser | `npm run check-browser` | 5 600 pixels, 0 different pixels |

## The environment

* Windows, PowerShell 5.1;
* Node.js 9.11.2 (`node --version`);
* TypeScript 3.9.10 (`pony-town-src/node_modules/typescript`);
* the original game: Pony Town 0.53.1-alpha, cloned into `pony-town-src`;
* the browser: Chrome 156.0.8078.47, headless, with the software rasterizer of the WebGL
  (`--enable-unsafe-swiftshader --use-angle=swiftshader`);
* the build: `tsc -p tsconfig.json` (`es2017`, `commonjs`, `strict`, `outDir: dist`).

The original game is not modified. The scripts of the original are loaded directly from
`pony-town-src/src/scripts` (the compiled output of the original repository) and are
compared with the port. The original modules expect a few global flags, so the scripts set
`DEVELOPMENT`, `SERVER`, `CLIENT`, `PRODUCTION`, `BETA`, `TOOLS`, `TESTS`, `TIMING` and
`DEBUG` before they are loaded.

## 1. The codec (`npm run diff`)

`scripts/diff-test.js` compares the port with `src/scripts/common/compressPony.js` and
`src/scripts/common/ponyInfo.js` of the original:

* the default pony is compressed to the same string in both implementations;
* 2 000 random ponies are compressed in the string variant and in the numeric variant and
  the results are compared byte for byte, then they are decompressed by both
  implementations and the ponies are compared field by field;
* the port decodes the saves of the original and the original decodes the saves of the
  port (the cross-check);
* the canonical form (the server stores `compressPony(decompressPony(save))`) is compared
  for 200 random saves, and the idempotency of the canonical form is checked;
* the legacy saves of the versions 1, 2 and 3 (the set fields are written with 5 bits
  instead of 6) are decoded by both implementations and are upgraded to the version 4 the
  same way;
* the migration of the freckles into the head (`fixVersion`) is compared for the versions
  1, 2 and 3 and for every number of the freckles;
* the palettes of 250 random ponies are compared colour by colour.

The result: **13 273 checks, 0 failures**.

## 2. The unit tests (`npm test`)

`test/run.ts` is a standalone suite (no test framework) with 41 tests: the base64 codec,
the colours, the schema of the save format, the bit utilities, the codec, the legacy
saves, the canonical form and the locks. It also contains the two regression tests of the
bug that was found during the verification: `isCanonical` used to return `true` for every
save, now it detects a save that is not in the canonical form, both in the string and in
the binary representation.

The result: **41 tests, 0 failures**.

## 3. The draw commands (`npm run diff-render`)

`scripts/diff-render.js` calls the original `drawPony` with a fake sprite batch that
records every draw command, and compares the recorded commands with the commands of
`drawPonyCommands` of the port. For every command the sprite rectangle (`x`, `y`, `w`,
`h`), the offset (`ox`, `oy`), the type of the sprite, the position, the tint and every
colour of the palette are compared.

The tested ponies are the default pony, the default pony at three different positions,
the default pony with the options `selected`, `shadow: false`, `extra: false` and
`noEars: true`, and 300 random ponies at random positions with the options mixed in.

The result: **12 686 commands compared, 236 277 checks, 0 failures**.

The claws were the last missing part of the renderer: the original draws the claws of the
front hooves only when the hoof set is of the type 3 and the sock set is not empty
(`hoof === frontHooves` and `hasClaws && hasSocks`). The port reproduces this, the
difference was found by this test.

## 4. The pixels (`npm run diff-pixels`)

`scripts/diff-pixels.js` renders the same pony twice: once with the original CPU
rasterizer (`ContextSpriteBatch` of the original game, on a mock canvas that implements
`getImageData` and `putImageData`) and once with the port (`src/render.ts` and
`src/raster.ts`). The two images are compared pixel by pixel, with all four channels
compared exactly (not with a tolerance).

The tested ponies are the default pony, the default pony with `selected: true`, the default
pony without the shadow and 100 random ponies with the options mixed in.

The result: **576 800 pixels compared, 0 failures** — the port renders exactly the same
pixels as the original, including the alpha channel and the rounding of the blending.

## 5. The WebGL shader (`npm run diff-webgl`)

The WebGL example draws the pony with the shader of the original game
(`example/webgl/shaders/palette-layers.glsl`) and with the palette texture of the original
(`PaletteManager`: the colours of a palette in consecutive texels of a 512x512 texture,
`pixelSize = 256 / 512`).

`scripts/diff-webgl.js` simulates that shader on the CPU for every pixel of every sprite
and compares the result with the CPU rasterizer of the port:

* the colour that the shader samples from the palette texture is compared with the colour
  of the palette of the CPU rasterizer (the index of the colour, the shade, the tint);
* the composed image is compared pixel by pixel with a tolerance of 2 (the GPU blends in
  floating point, the CPU rasterizer blends with integers).

The image is filled with an opaque colour before the comparison, because the CPU
rasterizer of the original replaces the pixels of a transparent background with the colour
of the sprite (`blendPrecise`), while the GPU blends the sprite with the background.

The tested ponies are the default pony and 50 random ponies.

The result: **528 909 checks, 0 failures**.

## 6. The WebGL example (`npm run check-webgl`)

The example loads the compiled modules of the port with its own CommonJS loader
(`example/webgl/loader.js`). `scripts/check-webgl.js` loads the same modules with the
same loader in Node and checks that the example produces the same draw commands as the
CPU renderer (22 sprites of the default pony, the position, the tint, the sprite rectangle
and the type of every sprite are compared).

The result: **24 checks, 0 failures**.

## 7. The WebGL example in a browser (`npm run check-browser`)

`scripts/check-browser.js` starts the static server of the project (`scripts/serve.js`, port
8123) and opens the verification page (`example/webgl/verify.html`) in a headless browser.
The page:

* draws the pony with the WebGL renderer of the example (`example/webgl/main.js`), which uses
  the shader of the original game and the palette texture of the original;
* draws the same pony with the CPU rasterizer of the port (`src/raster.ts`), loaded in the
  browser with the module loader of the example;
* reads the pixels of the canvas back with `gl.readPixels` and compares them with the pixels
  of the CPU rasterizer multiplied by their alpha (the CPU rasterizer blends the sprites over
  a transparent image, the GPU blends them over an opaque background), with a tolerance of 3;
* sends the result to the server, which writes it into `out/browser-report.txt`.

The result: **5 600 pixels compared, 0 different pixels**, the maximum difference of a
channel is 1 (the GPU blends in floating point). The images of the page and of the report are
identical to the image of the CPU rasterizer.

The page draws the pony again immediately before `readPixels`, because the original context
options (`alpha: false`, `premultipliedAlpha: false`, `antialias: false`) do not include
`preserveDrawingBuffer`, so the drawing buffer is discarded after the frame is composited.

Two bugs of the example were found by this check and fixed: the bytes of the tint and of the
mask of a vertex were written at the offset of a float instead of the offset of a byte (which
corrupted the positions of the vertices and left the colours zero, so the canvas stayed
empty), and the stride of the vertex attributes and the number of the vertices of a sprite
did not match the layout of the quad (the original game draws the quads with an index
buffer).

## What is not verified

* **The GPU hardware.** The browser check runs with the software rasterizer of Chrome
  (`--use-angle=swiftshader`), because the environment has no GPU. The result should be
  identical on a GPU, but it is not checked.
* **The npm dependencies of the original game.** `npm install` in `pony-town-src` fails on
  the native module `canvas@2.11.2`. The CPU rasterizer of the original is therefore not
  used through the canvas, but through a mock canvas that implements the two methods the
  rasterizer needs. The sprite sheets are decoded with the decoder of the example
  (`example/png.js`), not with the decoder of the original.
* **The animations and the expressions.** The scope of the renderer is the standing pose
  only, so the animations, the facial expressions, the blinking, the head turns, the toys
  and the room are not ported and not verified.
* **The server, the editor, the multiplayer.** They are out of scope; the port contains
  the codec, the schema and the renderer only.

## The conclusion

The codec of the port is byte-compatible with the server of Pony Town 0.53.1-alpha: it
writes the same bytes, it reads the saves of the original (including the legacy versions)
and it produces the same canonical form.

The renderer of the port is pixel-identical to the client of the original game for the
standing pose: the same draw commands, the same pixels, and the same result when the shader
of the original game is simulated, and the same pixels again when the shader is executed by
a browser.

The known deviations are the ones that are documented above: the renderer covers the
standing pose only, and the browser check uses the software rasterizer of Chrome instead of
a GPU.
