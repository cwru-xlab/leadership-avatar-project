/**
 * Column spans (of 12) that fill every row: `count` cards, at most `perRow` per
 * row, split into as few rows as possible with sizes differing by at most one
 * (7 at 4 → 4 + 3, 5 at 4 → 3 + 2, 6 at 4 → 3 + 3). Longer rows come first.
 * Row sizes 1–4 all divide 12, so `perRow` up to 4 always yields whole spans.
 */
export function balancedSpans(count: number, perRow: number): number[] {
  if (count <= 0) return [];
  const rows = Math.ceil(count / perRow);
  const base = Math.floor(count / rows);
  const extra = count % rows;
  const spans: number[] = [];
  for (let row = 0; row < rows; row++) {
    const size = base + (row < extra ? 1 : 0);
    for (let i = 0; i < size; i++) spans.push(12 / size);
  }
  return spans;
}
