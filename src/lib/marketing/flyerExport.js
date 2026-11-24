import html2canvas from "html2canvas";
import {
  CALIFORNIA_BG,
  URIDE_LOGO_WHITE,
  FLYER_W,
  FLYER_H,
  PHONE,
} from "./flyerAssets";

/**
 * A finished flyer file, at 2x the artboard (2398 x 2624).
 *
 * Two rendering paths are composited so the export is the same artwork the
 * screen shows: the SVG artboard, then the live app screen drawn into the
 * tilted phone window. An SVG loaded as an image cannot fetch external files,
 * so the landscape and logo are inlined as data URLs first.
 */

async function toDataUrl(url) {
  const blob = await fetch(url).then((r) => r.blob());
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function artworkImage(svgEl) {
  const [bg, logo] = await Promise.all([toDataUrl(CALIFORNIA_BG), toDataUrl(URIDE_LOGO_WHITE)]);
  const clone = svgEl.cloneNode(true);
  clone.querySelectorAll("image").forEach((img) => {
    if (img.getAttribute("href") === CALIFORNIA_BG) img.setAttribute("href", bg);
    if (img.getAttribute("href") === URIDE_LOGO_WHITE) img.setAttribute("href", logo);
  });
  const markup = new XMLSerializer().serializeToString(clone);
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The artwork could not be rendered"));
    img.src = src;
  });
}

/**
 * The live screen sits inside scaled, rotated ancestors, which html2canvas
 * measures wrongly. A flat native-size clone is captured instead, then the
 * rotation is applied to the canvas.
 */
async function phoneImage(frameEl, scale) {
  const holder = document.createElement("div");
  holder.style.cssText = `position:fixed;left:-10000px;top:0;width:${PHONE.w}px;height:${PHONE.h}px;overflow:hidden;`;
  const clone = frameEl.firstElementChild.cloneNode(true);
  holder.appendChild(clone);
  document.body.appendChild(holder);
  try {
    return await html2canvas(clone, {
      backgroundColor: "#0a0b0f",
      width: PHONE.w,
      height: PHONE.h,
      scale,
      useCORS: true,
      logging: false,
    });
  } finally {
    holder.remove();
  }
}

export async function exportFlyerPng(stageEl, fileName, scale = 2) {
  if (!stageEl) throw new Error("The flyer is still loading");

  const svgEl = stageEl.querySelector("svg");
  const frameEl = stageEl.querySelector("[data-flyer-phone]");
  if (!svgEl) throw new Error("The flyer is still loading");

  const canvas = document.createElement("canvas");
  canvas.width = FLYER_W * scale;
  canvas.height = FLYER_H * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  ctx.drawImage(await artworkImage(svgEl), 0, 0, FLYER_W, FLYER_H);

  if (frameEl) {
    const shot = await phoneImage(frameEl, scale);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(PHONE.x, PHONE.y, PHONE.w, PHONE.h, PHONE.radius);
    ctx.clip();
    ctx.translate(PHONE.x + PHONE.w / 2, PHONE.y + PHONE.h / 2);
    ctx.rotate((PHONE.rotate * Math.PI) / 180);
    ctx.drawImage(shot, -PHONE.w / 2, -PHONE.h / 2, PHONE.w, PHONE.h);
    ctx.restore();
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}