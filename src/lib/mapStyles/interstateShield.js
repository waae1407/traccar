/**
 * Creates a US Interstate Highway shield sprite as ImageData for MapLibre.
 * Proper shield shape: arched top, rounded sides narrowing to a pointed bottom.
 * Red header (#B31B20) + blue body (#00478F) + white divider + black border.
 * Uses 9-slice stretching (stretchX) so the shield widens for multi-digit
 * route numbers (5, 95, 405) without distorting the arch or point.
 */
export function createInterstateShieldImage() {
  const W = 60, H = 68;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const cx = W / 2;
  const margin = 3;
  const halfW = (W - margin * 2) / 2;
  const archTop = margin;
  const archDepth = 7;
  const widestY = H * 0.40;
  const pointY = H - margin;
  const bandH = Math.round(H * 0.25); // red header ~25% of height

  function traceShield() {
    ctx.beginPath();
    ctx.moveTo(cx - halfW, archTop + archDepth);
    ctx.bezierCurveTo(cx - halfW, archTop, cx - 3, archTop, cx, archTop);
    ctx.bezierCurveTo(cx + 3, archTop, cx + halfW, archTop, cx + halfW, archTop + archDepth);
    ctx.bezierCurveTo(cx + halfW, widestY, cx + 3, pointY - 8, cx, pointY);
    ctx.bezierCurveTo(cx - 3, pointY - 8, cx - halfW, widestY, cx - halfW, archTop + archDepth);
    ctx.closePath();
  }

  // Blue body (full shield fill)
  traceShield();
  ctx.fillStyle = "#00478F";
  ctx.fill();

  // Red header (clipped to top 25%)
  ctx.save();
  traceShield();
  ctx.clip();
  ctx.fillStyle = "#B31B20";
  ctx.fillRect(0, 0, W, bandH);
  // White divider line between red and blue
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, bandH);
  ctx.lineTo(W, bandH);
  ctx.stroke();
  ctx.restore();

  // Black border outline
  traceShield();
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.stroke();

  return ctx.getImageData(0, 0, W, H);
}