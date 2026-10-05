/**
 * US Interstate shield (MUTCD M1-1) rendered per route number for MapLibre.
 * Outline paths are the official 2-digit / 3-digit shield blanks
 * (scalloped top, curved sides, pointed base). The route number is baked
 * into each image so the shield never gets squeezed by icon-text-fit.
 */
export const INTERSTATE_PREFIX = "interstate-";
export const SHIELD_PIXEL_RATIO = 2;

const UNIT = 1.35; // CSS px per SVG unit → 2-digit shield ≈ 27px tall
const PAD = 2;     // CSS px of room for the white border + shadow

const VARIANTS = {
  2: {
    w: 19.966, h: 19.967, textMaxW: 15,
    red: "M 0.947932,4.492575 C 1.35797,3.1682318 2.031962,1.6935751 2.836314,0.60694576 3.94387,0.91532547 5.110448,1.0801112 6.315035,1.0801112 c 1.273479,0 2.504331,-0.18408309 3.6677638,-0.52736015 1.1635332,0.34326693 2.3943852,0.52736015 3.6677632,0.52736015 1.204722,0 2.371333,-0.16477559 3.478722,-0.47316544 0.804317,1.08662934 1.478746,2.56128614 1.888784,3.88562924 z",
    blue: "M 19.467147,7.7278308 C 19.467147,13.477184 15.401609,18.278329 9.983,19.424482 4.564391,18.278496 0.498853,13.477184 0.498853,7.7278308 h 3.4e-5 c 0,-1.0620908 0.188628,-2.2549333 0.449046,-3.2352558 h 18.070135 c 0.260373,0.9803226 0.449079,2.173165 0.449079,3.2352558 z",
    outline: "m 19.467147,7.7278308 c 0,5.7493532 -4.065538,10.5504982 -9.4841473,11.6966512 C 4.5643907,18.278496 0.49885325,13.477184 0.49885325,7.7278308 h 3.327e-5 c 0,-1.0620908 0.13874807,-2.0918331 0.39916608,-3.0721556 C 1.3080913,3.331332 2.0319622,1.6935751 2.8363141,0.60694576 3.9438703,0.91532547 5.110448,1.0801112 6.3150351,1.0801112 c 1.2734788,0 2.5043311,-0.18408309 3.6677637,-0.52736015 1.1635332,0.34326693 2.3943852,0.52736015 3.6677632,0.52736015 1.204722,0 2.371333,-0.16477559 3.478722,-0.47316544 0.804317,1.08662934 1.52869,2.72438624 1.938728,4.04872934 0.260373,0.9803226 0.399135,2.0100649 0.399135,3.0721557 z",
    divider: "M 0.9479325,4.492575 H 19.018068",
  },
  3: {
    w: 24.966, h: 19.967, textMaxW: 20,
    red: "M 0.49931998,4.499264 C 0.66013121,3.2329581 1.1086041,1.7689041 1.5831516,0.63365107 h 2.661e-4 C 3.2767759,1.093957 5.0568447,1.33942 6.8932125,1.33942 c 1.9385508,0 3.8141485,-0.273486 5.5912885,-0.78449493 1.777174,0.51101193 3.652772,0.78449493 5.59129,0.78449493 1.8365,0 3.616502,-0.245446 5.309794,-0.70576893 C 23.860133,1.768803 24.305902,3.232823 24.46668,4.499264 Z",
    blue: "m 24.46668,4.4992637 c 0.03805,0.41447 -0.01248,0.992128 -0.01248,1.416525 h 3e-6 c 0,6.9563073 -5.225427,12.6940743 -11.971197,13.5128543 C 5.7372308,18.609796 0.51180302,12.872096 0.51180302,5.9157887 h 4.988e-5 c 0,-0.424397 -0.0505759,-1.002055 -0.0125329,-1.416525 z",
    outline: "m 24.454197,5.915789 c 0,6.956307 -5.225427,12.694074 -11.971197,13.512854 C 5.7372308,18.609796 0.51180302,12.872096 0.51180302,5.915789 h 4.988e-5 c 0,-0.4243975 0.0194519,-0.8442461 0.0574949,-1.2587162 C 0.73015903,3.3907669 1.1086041,1.7689039 1.5831516,0.63365107 h 2.661e-4 C 3.2767759,1.0939572 5.0568447,1.33942 6.8932125,1.33942 c 1.9385508,0 3.8141485,-0.2734863 5.5912885,-0.78449529 1.777174,0.51101239 3.652772,0.78449529 5.59129,0.78449529 1.8365,0 3.616502,-0.245446 5.309794,-0.70576893 0.474548,1.13515163 0.850324,2.75698093 1.011102,4.02342173 0.03805,0.4144701 0.05751,0.8343187 0.05751,1.2587162 z",
    divider: "M 0.49931998,4.4992637 H 24.46668",
  },
};

/** "I 405;US 101" → "405" */
export function cleanRouteRef(raw) {
  return String(raw || "").split(";")[0].replace(/^(I|US|SR|CA|STATE)[\s-]*/i, "").trim();
}

export function createInterstateShieldImage(rawRef) {
  const ref = cleanRouteRef(rawRef);
  const v = ref.length >= 3 ? VARIANTS[3] : VARIANTS[2];
  const s = UNIT * SHIELD_PIXEL_RATIO;
  const pad = PAD * SHIELD_PIXEL_RATIO;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(v.w * s + pad * 2);
  canvas.height = Math.ceil(v.h * s + pad * 2);
  const ctx = canvas.getContext("2d");
  ctx.translate(pad, pad);
  ctx.scale(s, s);

  const outline = new Path2D(v.outline);

  // Soft shadow lifts the shield off the dark basemap
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.65)";
  ctx.shadowBlur = 3;
  ctx.fillStyle = "#003f87";
  ctx.fill(outline);
  ctx.restore();

  ctx.fillStyle = "#bf2033";
  ctx.fill(new Path2D(v.red));
  ctx.fillStyle = "#003f87";
  ctx.fill(new Path2D(v.blue));

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.lineJoin = "round";
  ctx.stroke(outline);
  ctx.stroke(new Path2D(v.divider));

  // Route number, centered in the blue field
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = `700 ${12.5 * s}px 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  const m = ctx.measureText(ref);
  const baseline = pad + 11.3 * s + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  ctx.fillText(ref, pad + (v.w / 2) * s, baseline, v.textMaxW * s);

  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}