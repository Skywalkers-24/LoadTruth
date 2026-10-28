"use client";

import { useEffect, useState, type RefObject } from "react";

export interface FitCountOptions {
  /** Measure only when true (e.g. the fixed-height desktop layout). */
  enabled: boolean;
  /** Count to use when disabled or before the first measurement. */
  fallback: number;
  /** Selector for one rendered item, to read its real height. */
  itemSelector: string;
  /** Item height to assume until an item has rendered. */
  estimatePx: number;
  /** Vertical gap between items. */
  gapPx: number;
  /** Height inside the container that items can't use (padding, a pager). */
  reservePx: number;
  min: number;
  max: number;
  /** Changes when the items re-render, so their real height is re-read. */
  remeasureKey?: unknown;
}

/** How many items of a given height fit in `available` px. Pure, for tests. */
export function fitCount(
  available: number,
  itemPx: number,
  gapPx: number,
  min: number,
  max: number,
): number {
  if (itemPx <= 0) return min;
  const n = Math.floor((available + gapPx) / (itemPx + gapPx));
  return Math.min(max, Math.max(min, n));
}

/**
 * Number of list items that fit the container's current height. Recomputes on
 * resize, so a list page fills a tall monitor and shrinks on a short laptop.
 */
export function useFitCount(ref: RefObject<HTMLElement | null>, opts: FitCountOptions): number {
  const { enabled, fallback, itemSelector, estimatePx, gapPx, reservePx, min, max, remeasureKey } =
    opts;
  const [count, setCount] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) {
      setCount(fallback);
      return;
    }
    const measure = () => {
      const item = el.querySelector<HTMLElement>(itemSelector);
      const itemPx = item?.offsetHeight || estimatePx;
      setCount(fitCount(el.clientHeight - reservePx, itemPx, gapPx, min, max));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, enabled, fallback, itemSelector, estimatePx, gapPx, reservePx, min, max, remeasureKey]);

  return count;
}
