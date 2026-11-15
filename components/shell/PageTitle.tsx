import clsx from "clsx";

/**
 * The title of a plain student page header: Newsreader 28/32 in CWRU Blue,
 * with the short Orange rule under it (`.la-title-rule`). Hero headers on a
 * CWRU Blue band (`PracticeHero`, the study plan band) put the same rule
 * under their own title. Mastery doesn't use this: its body stays free of
 * the accent so it can't be read as the level-2 orange.
 *
 * Server-safe (no client hooks).
 */
export default function PageTitle({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <h1
      className={clsx(
        "la-title-rule font-display text-[28px] font-medium leading-[1.1] tracking-[-0.01em] text-cwru-blue md:text-[32px]",
        className,
      )}
      id={id}
    >
      {children}
    </h1>
  );
}
