"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";

/**
 * Shared motion primitives for the dashboard. All of them respect
 * prefers-reduced-motion: when the user opts out, content appears instantly
 * with no transform or count animation.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

/** Fade-and-rise a block into view on mount. */
export function FadeIn({
  children,
  delay = 0,
  y = 8,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Stagger a list of children. Wrap items in <StaggerItem>. Starts when the
 * container scrolls into view so long pages animate as the user reaches them.
 */
export function Stagger({
  children,
  className,
  step = 0.05,
}: {
  children: ReactNode;
  className?: string;
  step?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={inView ? "show" : "hidden"}
      variants={{ show: { transition: { staggerChildren: step } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={{
        hidden: reduce ? { opacity: 1 } : { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Count a number up to its target when it scrolls into view. `format` turns the
 * live numeric value into the displayed string (currency, percent, etc.).
 */
export function CountUp({
  value,
  format = (n) => String(Math.round(n)),
  className,
  durationMs = 900,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
  durationMs?: number;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { duration: durationMs, bounce: 0 });
  const [text, setText] = useState(() => format(reduce ? value : 0));

  useEffect(() => {
    if (reduce) {
      setText(format(value));
      return;
    }
    if (inView) mv.set(value);
  }, [inView, value, reduce, mv, format]);

  const rounded = useTransform(spring, (v) => format(v));
  useEffect(() => rounded.on("change", setText), [rounded]);

  return (
    <span ref={ref} className={className}>
      {text}
    </span>
  );
}

export { motion };
