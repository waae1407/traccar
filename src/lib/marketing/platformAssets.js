import html2canvas from "html2canvas";
import { INK } from "@/lib/marketing/flyerAssets";

/**
 * Platform canvases. The master flyer is never stretched or cropped: it is
 * drawn at its own aspect ratio, centred on the brand background, so the
 * approved California artwork keeps its proportions on every platform.
 */
export const PLATFORM_CANVAS = {
  instagram: { platform: "instagram", label: "Instagram", width: 1080, height: 1350 },
  facebook_pages: { platform: "facebook_pages", label: "Facebook", width: 1080, height: 1080 },
  x: { platform: "x", label: "X", width: 1200, height: 628 },
};

export async function captureFlyer(node) {
  return html2canvas(node, { backgroundColor: INK, scale: 1, useCORS: true, logging: false });
}

export function composePlatformCanvas(source, spec) {
  const out = document.createElement("canvas");
  out.width = spec.width;
  out.height = spec.height;
  const ctx = out.getContext("2d");
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, spec.width, spec.height);
  const scale = Math.min(spec.width / source.width, spec.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, (spec.width - width) / 2, (spec.height - height) / 2, width, height);
  return out;
}

export function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}