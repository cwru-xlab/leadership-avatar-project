/**
 * The coached moment's session date as the rest of the app shows a date
 * ("Oct 2"), never the raw ISO timestamp the API carries. An unparseable
 * value yields "" so the caller can drop the clause instead of rendering
 * "Invalid Date". Pure, so `scripts/verify-coached-avatar-mount.ts` can call it.
 */
export function formatMomentDate(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone });
}
