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

/** Feature name sizing. `available` shrinks the run when an icon sits beside it. */
export function featureSize(feature, available = 680) {
  return Math.min(82, Math.floor(available / Math.max(1, String(feature || "").length)));
}

export function toLines(text) {
  return String(text || "").split("\n");
}