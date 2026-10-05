import { cleanRouteRef, SHIELD_PIXEL_RATIO } from "./interstateShield";

/** Plain rounded route marker for non-Interstate highways (US / state routes). */
export const ROUTE_BADGE_PREFIX = "route-badge-";

export function createRouteBadgeImage(rawRef) {
  const ref = cleanRouteRef(rawRef);
  const pr = SHIELD_PIXEL_RATIO;
  const h = 18 * pr;
  const font = `700 ${13 * pr}px 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif`;

  const measure = document.createElement("canvas").getContext("2d");
  measure.font = font;
  const w = Math.ceil(Math.max(h, measure.measureText(ref).width + 10 * pr));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  const lw = pr;
  ctx.beginPath();
  ctx.roundRect(lw / 2, lw / 2, w - lw, h - lw, 4 * pr);
  ctx.fillStyle = "#F5F5F7";
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = "#1C1C1E";
  ctx.stroke();

  ctx.font = font;
  ctx.fillStyle = "#111111";
  ctx.textAlign = "center";
  const m = ctx.measureText(ref);
  ctx.fillText(ref, w / 2, h / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);

  return ctx.getImageData(0, 0, w, h);
}