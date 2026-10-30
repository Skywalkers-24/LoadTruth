import { useEffect, useState, type RefObject } from "react";

/**
 * Returns true once the referenced element enters the viewport (plus rootMargin).
 * Once true, stays true so active components do not unmount on scroll.
 */
export function useInView(
  ref: RefObject<HTMLElement | null>,
  rootMargin = "300px",
  initial = false,
): boolean {
  const [isInView, setIsInView] = useState(initial);

  useEffect(() => {
    if (initial) return;
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, rootMargin, initial]);

  return isInView;
}
