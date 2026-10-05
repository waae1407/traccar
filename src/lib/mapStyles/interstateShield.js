/**
 * Creates a US Interstate Highway shield sprite as ImageData for MapLibre.
 * Red top band, blue body, white border — the classic badge look.
 * Uses 9-slice stretching (stretchX) so the shield widens for multi-digit
 * route numbers (5, 95, 405) without distorting the rounded edges.
 */
export function createInterstateShieldImage() {
  const W = 80, H = 52;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const r = 9;        // corner radius
  const x0 = 2, y0 = 2;
  const x1 = W - 2, y1 = H - 2;
  const bandH = 16;   // red band height

  function traceRoundRect(x, y, w, h, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  // Blue body (full shield background)
  ctx.fillStyle = "#1a4e9e";
  traceRoundRect(x0, y0, x1 - x0, y1 - y0, r);
  ctx.fill();

  // Red top band (clipped to the top portion of the rounded rect)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.lineTo(x1 - r, y0);
  ctx.quadraticCurveTo(x1, y0, x1, y0 + r);
  ctx.lineTo(x1, y0 + bandH);
  ctx.lineTo(x0, y0 + bandH);
  ctx.lineTo(x0, y0 + r);
  ctx.quadraticCurveTo(x0, y0, x0 + r, y0);
  ctx.closePath();
  ctx.fillStyle = "#c41e3a";
  ctx.fill();
  ctx.restore();

  // White divider line between red and blue
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0 + 3, y0 + bandH);
  ctx.lineTo(x1 - 3, y0 + bandH);
  ctx.stroke();

  // White border outline
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  traceRoundRect(x0, y0, x1 - x0, y1 - y0, r);
  ctx.stroke();

  return ctx.getImageData(0, 0, W, H);
}