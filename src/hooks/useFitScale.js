import { useEffect, useState } from "react";

/** Scales a fixed-size artboard down to whatever width its container has. */
export default function useFitScale(ref, designWidth) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / designWidth);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, designWidth]);

  return scale;
}