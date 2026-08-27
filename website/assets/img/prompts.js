// Two improved creative hero prompts for Agent Pi website.
// Designed to: (a) preserve large negative space for text overlay,
// (b) avoid watermark collision zones,
// (c) achieve premium brand-grade composition rather than generic stock.

// HERO DARK — cinematic, aurora-ribbon dark backdrop
const heroDarkPrompt = `A cinematic dark hero background for a premium AI tech brand website. 16:9 widescreen composition, extremely wide.

Background: deep midnight navy gradient base, transitioning from near-black at the corners (#06090F) to a slightly lifted tone (#0A1228) toward the upper-left third, with rich atmospheric depth.

Two flowing aurora ribbons of silk-thin luminescent light sweep diagonally from the upper-left corner toward the center, then dissolve and fade to mist before crossing past the vertical center line. Ribbon A in electric cobalt blue (#4F8DFF) sits as the brighter primary, ribbon B in cool cyan (#3AD6E8) trails parallel as a softer secondary. Each ribbon has: volumetric core glow, feathered translucent edges, 3-4 layered wisps for depth, soft chromatic-aberration fringe at the brightest curves.

Negative space rule (CRITICAL): the entire right two-thirds of the canvas AND the bottom half must remain visually clean — only the faintest grid and a whisper of mist may exist there, providing extensive safe area for centered text overlay. Nothing busy on the right side.

Background detail: a barely-there engineering grid in muted slate (#0F1A33), 1px hairline, ~80px cell, fading from 12% opacity in the upper-left quadrant to 0% across the rest of the frame. A single barely-visible constellation: 5 tiny cyan dots forming a subtle diagonal pattern in the upper-right corner, connected by hair-thin lines at 18% opacity.

Atmosphere: subtle vignette, gentle cinematic film grain (ISO 200 aesthetic), faint volumetric haze, soft lens bloom from the ribbon light source.

Color discipline: strictly navy + electric blue + cyan. No purple, no magenta, no warm tones.

Aesthetic reference: James Turrell light installations meets Apple keynote stage backdrops meets Porsche Taycan launch film.

Camera feel: cinematic 35mm equivalent, deep depth-of-field, soft focus only at the very edges.

Output quality: premium, calm, restrained, engineering-grade elegance. Editorial fine-art quality.

ABSOLUTELY NO text, letters, words, logos, watermarks, symbols, characters, glyphs, signatures, UI elements, or branding of any kind. The image must be purely visual abstract composition.`;

// HERO LIGHT — airy, ink-wash light backdrop
const heroLightPrompt = `An ethereal light hero background for a premium AI tech brand website. 16:9 widescreen composition, extremely wide.

Base: airy off-white paper (#F6F8FC) with a barely-perceptible warm undertone, slight fine paper grain texture for tactility.

Single bold organic ink brushstroke flows from the upper-left corner diagonally toward the lower-center, then curves up gently and dissolves into mist before reaching the right third. The stroke uses diluted cobalt (#2F6DF0) at ~30% opacity, layered 2-3 times for translucent depth, with soft bleeding edges reminiscent of sumi-e ink on wet paper. A second much fainter companion stroke in pale teal (#0FB5C9) at 15% opacity follows a parallel path, offset slightly downward.

Negative space rule (CRITICAL): the entire right two-thirds AND the center vertical column must remain almost pure white with only the faintest tonal hint, providing extensive safe area for centered text overlay. The brushstrokes must stay confined to the upper-left quadrant and lower-left edge.

Background grid: extremely subtle hairline engineering grid in #E1E8F2, 1px thin, ~96px cell, visible only in the lower-right corner and fading completely elsewhere.

Accent: a tiny constellation of 3 small pale-blue dots in the upper-right area, connected by 2 hair-thin lines at 22% opacity, suggesting a minimal data network.

Bottom-left corner has the faintest whisper of warmer tone (#FBF7F2) for color balance.

Aesthetic reference: Aesop brand visual language meets MUJI catalog meets traditional Japanese sumi-e meets Bauhaus minimalism meets Apple's "white space" advertising.

Color palette discipline: only off-white + diluted blue + faint teal. No saturated colors, no warm orange, no purple, no strong contrast.

Photographic mood: bright studio daylight, completely flat and clean, no shadows, no lens flare, no highlights.

Output quality: editorial fine-art quality, museum-grade minimalism, calm and restrained.

ABSOLUTELY NO text, letters, words, logos, watermarks, symbols, characters, glyphs, signatures, UI elements, or branding of any kind. The image must be purely visual abstract composition.`;

module.exports = { heroDarkPrompt, heroLightPrompt };