/**
 * A card grid whose rows always fill the width: no empty slot at the end of a
 * row at any breakpoint. Give it the most cards a row may hold per breakpoint;
 * it splits the cards into as few rows as possible with row sizes differing by
 * at most one, longer rows first (7 at four → 4 + 3, 5 at three → 3 + 2, 6 at
 * four → 3 + 3), on a 12-column track.
 *
 * Each child is wrapped in its own cell (`li` when `as="ul"`), so pass the card
 * itself; give it `h-full` to stretch to the row. Server-safe: no hooks.
 */
import { Children, type ReactNode } from "react";
import clsx from "clsx";

import { balancedSpans } from "@/lib/layout/balanced";

type Breakpoint = "sm" | "md" | "lg" | "xl";
type PerRow = 1 | 2 | 3 | 4;

// Literal class names so Tailwind generates them. Keyed by span (of 12).
const SPAN: Record<Breakpoint, Record<number, string>> = {
  sm: { 3: "sm:col-span-3", 4: "sm:col-span-4", 6: "sm:col-span-6", 12: "sm:col-span-12" },
  md: { 3: "md:col-span-3", 4: "md:col-span-4", 6: "md:col-span-6", 12: "md:col-span-12" },
  lg: { 3: "lg:col-span-3", 4: "lg:col-span-4", 6: "lg:col-span-6", 12: "lg:col-span-12" },
  xl: { 3: "xl:col-span-3", 4: "xl:col-span-4", 6: "xl:col-span-6", 12: "xl:col-span-12" },
};
const TRACK: Record<Breakpoint, string> = {
  sm: "sm:grid-cols-12",
  md: "md:grid-cols-12",
  lg: "lg:grid-cols-12",
  xl: "xl:grid-cols-12",
};
const ORDER: Breakpoint[] = ["sm", "md", "lg", "xl"];

export default function BalancedGrid({
  children,
  perRow,
  as = "ul",
  className,
  ...rest
}: {
  children: ReactNode;
  /** Most cards per row from each breakpoint up; below the first one, cards stack. */
  perRow: Partial<Record<Breakpoint, PerRow>>;
  as?: "ul" | "div";
  className?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, "children" | "className">) {
  const items = Children.toArray(children);
  const breakpoints = ORDER.filter((bp) => perRow[bp]);
  const spans = breakpoints.map((bp) => [bp, balancedSpans(items.length, perRow[bp]!)] as const);
  const Container = as;
  const Cell = as === "ul" ? "li" : "div";
  return (
    <Container
      className={clsx("grid grid-cols-1", breakpoints[0] && TRACK[breakpoints[0]], className)}
      data-balanced-grid=""
      {...rest}
    >
      {items.map((item, index) => (
        <Cell
          key={(item as { key?: string | null }).key ?? index}
          className={clsx("flex min-w-0 flex-col", spans.map(([bp, s]) => SPAN[bp][s[index]]))}
        >
          {item}
        </Cell>
      ))}
    </Container>
  );
}
