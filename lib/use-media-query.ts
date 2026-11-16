"use client";

/**
 * One SSR-safe media-query hook for the whole app.
 *
 * Lifted verbatim out of `components/mastery/MasteryPanel.tsx`, which had it
 * module-private, when the interviewer picker needed the same thing. Both
 * callers want "is the viewport at least this wide" as a plain boolean, and two
 * copies of a `matchMedia` subscription is exactly the kind of thing that
 * drifts — one gets a listener cleanup and the other does not.
 *
 * WHY IT STARTS FALSE, ALWAYS. There is no viewport on the server, so reading
 * `window.matchMedia` during the first render is a hydration mismatch: the
 * server renders the `false` branch and the client renders the `true` one, and
 * React discards the markup and warns. The first client render therefore agrees
 * with the server (`false`) and the real answer arrives in an effect, one
 * commit later. A caller must treat `false` as "not yet known OR genuinely
 * narrow", which is why this is only ever used to pick between two equally
 * valid presentations and never to decide whether something exists at all.
 */

import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
