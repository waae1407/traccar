/** Type sizing rules copied from the approved master template. */

export function headlineSize(headline) {
  const longest = Math.max(
    12,
    ...String(headline || "")
      .split("\n")
      .map((line) => line.length)
  );
  return Math.min(83, Math.floor((1100 / longest) * 0.85));
}

export function featureSize(feature) {
  return Math.min(82, Math.floor(680 / Math.max(1, String(feature || "").length)));
}

export function toLines(text) {
  return String(text || "").split("\n");
}