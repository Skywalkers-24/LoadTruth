import {
  CircleUserRoundIcon,
  ContactRoundIcon,
  SmileIcon,
  UserRoundIcon,
  UserStarIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A friendly, non-gendered member avatar. Each member gets a deterministic
 * person glyph and a palette color from a hash of their seed (email), so a
 * member list looks varied and human without labeling anyone by gender. Shared
 * by the login screen and the app-shell user block so they stay consistent.
 */
const AVATAR_GLYPHS = [
  UserRoundIcon,
  CircleUserRoundIcon,
  ContactRoundIcon,
  SmileIcon,
  UserStarIcon,
];
const AVATAR_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--color-brand)",
];

function hashIndex(key: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % mod;
}

export function MemberAvatar({
  seed,
  size = 18,
  className,
}: {
  seed: string;
  size?: number;
  className?: string;
}) {
  const Glyph = AVATAR_GLYPHS[hashIndex(seed, AVATAR_GLYPHS.length)]!;
  const color = AVATAR_COLORS[hashIndex(`${seed}c`, AVATAR_COLORS.length)]!;
  return (
    <span
      className={cn("grid size-9 shrink-0 place-items-center rounded-full", className)}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)`,
        color,
      }}
      aria-hidden
    >
      <Glyph size={size} />
    </span>
  );
}
