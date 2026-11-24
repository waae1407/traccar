/**
 * Locked master artwork for the California Edition flyer.
 *
 * The landscape is a single high-resolution frame bled across the full artboard
 * and feathered on its left edge, so there is no visible seam where the photo
 * meets the dark side of the flyer.
 */

export const FLYER_W = 1199;
export const FLYER_H = 1312;

export const LANDSCAPE_BG =
  "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/735cfea2f8c36d9eb48bdbbf98b1ec7a_generated_image.png";

/** Landscape placement: full height, feathered left edge. */
export const LANDSCAPE = {
  x: 430,
  y: 0,
  w: 769,
  h: 1312,
  feather: 220,
};

export const MAGENTA = "#ff007e";
export const CTA_PINK = "#f50079";
export const INK = "#10141b";

/** Screen window inside the tilted phone frame (absolute artboard coords). */
export const PHONE = {
  x: 727,
  y: 260,
  w: 310,
  h: 560,
  radius: 38,
  rotate: 8,
};