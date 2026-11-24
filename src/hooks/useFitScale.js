import { useEffect, useState } from "react";

/**
 * Scales a fixed-size artboard down to its container.
 * Pass designHeight to also fit the viewport height (one-screen preview).
 * The artboard itself never changes size, so native-resolution export is kept.
 */
export default function useFitScale(ref, designWidth, designHeight = null) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const parent = el.parentElement;
      const w = (parent ? parent.clientWidth : 0) || window.innerWidth;
      let next = w / designWidth;
      if (designHeight) {
        const available = window.innerHeight * 0.9;
        next = Math.min(next, available / designHeight);
      }
      if (next > 0) setScale(next);
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (el.parentElement) observer.observe(el.parentElement);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ref, designWidth, designHeight]);

  return scale;
}