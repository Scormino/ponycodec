// The shader of the palettized sprites.
//
// It is a copy of `src/ts/graphics/shaders/palette-layers.glsl` of the
// original Pony Town 0.53.1-alpha.
//
// The palette texture contains the colours of a palette in consecutive texels,
// so the index of a colour is the value of the channel of the sprite with the
// palette index (0 - 255) and the size of a texel of the palette texture is
// `256 / textureSize` (the same value as `PaletteManager.pixelSize` of the
// original game).
//
// VERTEX

attribute vec2 position;
attribute vec4 texcoords;
attribute vec4 vertexColor;
attribute vec4 vertexColor1;

uniform mat4 transform;
uniform vec4 lighting;

varying vec4 textureCoord;
varying vec4 vColor;
varying vec4 vColor1;

void main() {
	textureCoord = texcoords;
	vColor = vertexColor * lighting;
	vColor1 = vertexColor1;
	gl_Position = transform * vec4(position, 0, 1);
}

// FRAGMENT

precision mediump float;

uniform sampler2D sampler1; // sprite
uniform sampler2D sampler2; // palette
uniform float pixelSize;
uniform float textureSize;

varying vec4 textureCoord;
varying vec4 vColor;
varying vec4 vColor1;

void main() {
	vec4 sprite = texture2D(sampler1, textureCoord.xy / textureSize);

	float shade = clamp(sprite.g + vColor1.a, 0.0, 1.0);

	vec4 mask = vec4(vColor1.rgb, 1.0 - (vColor1.r + vColor1.g + vColor1.b));
	float paletteIndex = dot(mask, sprite);

	vec2 paletteCoord = textureCoord.zw;
	vec4 palette = texture2D(sampler2, vec2(paletteCoord.x + paletteIndex * pixelSize, paletteCoord.y));

	gl_FragColor = vec4(palette.xyz * shade, palette.w) * vColor;
}
