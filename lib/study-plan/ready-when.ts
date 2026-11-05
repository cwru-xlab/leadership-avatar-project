/**
 * The model is told to write `successCriteria` as "Ready when" guidance, and
 * some stored plans begin with those words while others do not. The UI prints
 * its own "Ready when" label, so the stored prefix is dropped at render time
 * (stored plans are never rewritten) and the remainder starts as a sentence.
 * An empty result means the string held only the label: render nothing.
 */
const READY_WHEN_PREFIX = /^\s*(?:(?:you(?:['’]re| are)|you(?:['’]ll| will) be)\s+)?ready[\s-]+when\b[\s:;,.\-–—]*/i;

export function readyWhenText(successCriteria: string): string {
  const rest = successCriteria.replace(READY_WHEN_PREFIX, "").trim();
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}
