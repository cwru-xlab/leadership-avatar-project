/**
 * Per-avatar video framing for the live session.
 *
 * WHY THIS EXISTS. The five custom Weatherhead faculty avatars were filmed
 * STANDING, full-length in their own offices — Scott Cowen's shot runs from
 * head to below the knees. Played at full frame in an interview or a
 * difficult conversation, that reads as someone presenting at you across a
 * room rather than sitting across a table, which is the wrong register for
 * every scenario this app runs. HeyGen's public roster needs none of this:
 * `lib/avatar-roster.ts` already curates it down to seated framings.
 *
 * WHY CSS. `POST /v1/sessions/start` takes no crop, framing, zoom or
 * resolution parameter — the avatar arrives as a raw LiveKit WebRTC video
 * track, so framing is entirely a client-side rendering concern. A transform
 * on the <video> inside its existing `overflow-hidden` container is the whole
 * mechanism, and it is GPU-composited rather than re-encoded.
 *
 * WHY NOT IN S3. These avatars' records live in a shared S3 bucket that the
 * kiosk repo also reads, so a framing value stored there would silently
 * change how the kiosk renders them too. Keeping it local to this repo scopes
 * the decision to this app.
 *
 * TUNING. `scale` magnifies; `originY` is the point held fixed while it does,
 * as a percentage from the top. Values were set by measuring each avatar's
 * head-top and waist in its own preview still, so they differ per person:
 * Cowen's shot is the widest and needs the most, Hawkins' is already close to
 * a medium shot and needs the least. They are starting points — adjust them
 * against a live session, not a still. Raising `scale` crops tighter; raising
 * `originY` pushes the subject up in frame.
 *
 * NOTE: magnifying a stream shrinks the pixels behind it. `StartAvatarRequest`
 * currently requests `quality: "low"`; if a crop here looks soft, raise the
 * quality rather than fighting it with a smaller scale.
 */

export interface AvatarFraming {
  /** Magnification. 1 = untouched. */
  scale: number;
  /** Percent from the top held fixed while scaling. */
  originY: number;
}

/**
 * Keyed by LiveAvatar avatar id. An avatar absent from this map renders
 * untouched — which is the correct default and what every public-catalog
 * avatar relies on.
 */
const FRAMING_BY_AVATAR_ID: Readonly<Record<string, AvatarFraming>> = {
  // Scott Cowen — full-length, body continues past the bottom edge.
  "52b24044-7b0c-4211-b113-239443801a5b": { scale: 1.55, originY: 10 },
  // Richard Boyatsis — full-length, hands clasped at the belt.
  "c0fdc362-a015-40b9-bb20-ec8805ddb01e": { scale: 1.4, originY: 10 },
  // Michael Goldberg — standing, hands low in frame.
  "77c6f78c-8154-40f0-be95-fdaa6d0f2f19": { scale: 1.38, originY: 10 },
  // John Paul Stephens — standing, hands clasped mid-frame.
  "0f0eec42-9bcb-4365-8b31-09b2d30b594d": { scale: 1.3, originY: 10 },
  // Jenny Hawkins — already close to a medium shot; least correction.
  "0192261e-bef3-4de4-be8d-8ed075b9aea9": { scale: 1.25, originY: 10 },
};

/**
 * CSS for an avatar's <video>, or `null` when it needs no correction.
 * Returning null rather than an identity transform keeps untouched avatars
 * off the compositor path entirely.
 */
export function avatarFramingStyle(
  avatarId: string | null | undefined,
): { transform: string; transformOrigin: string } | null {
  if (!avatarId) return null;
  const framing = FRAMING_BY_AVATAR_ID[avatarId];
  if (!framing) return null;
  return {
    transform: `scale(${framing.scale})`,
    transformOrigin: `50% ${framing.originY}%`,
  };
}

/**
 * Head-and-shoulders framing for the picker's COMPACT ROW thumbnail.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT THE MAP ABOVE. The compact roster row
 * shows each interviewer at 56px square. Every `previewUrl` in the catalog is
 * 16:9 (measured: 1280x720 for the 5 faculty and the 19 `Sitting`/`HR`/
 * `Therapist`/`Lawyer` looks, 1920x1080 for the 30 `(Friendly)` looks — 54 of
 * 54, no exceptions). A 16:9 still covering a 1:1 box renders at 78.2x44 for a
 * 44px box: `overflowY` is exactly ZERO. That number is the whole reason this
 * function exists, because it means `object-position` has nothing to slide
 * VERTICALLY — a head-biased `object-position: 50% 0%` is a literal no-op here
 * and only a zoom can crop in on a face. Anyone "simplifying" the vertical
 * crop to an object-position offset will silently restore the old thumbnails.
 * (Horizontally the opposite is true, and this function does use an
 * `object-position` X — see the note at the end on why the two axes differ.)
 *
 * WHY TWO VERTICAL VALUES AND NOT 54. Head height was measured as a fraction
 * of the source frame on a per-shoot-family basis (see the probe grids that
 * produced `screenshots/thumb-legibility/probe-measure-*.png`):
 *
 *   - FACULTY (5, standing full-length in their own offices): head top ~8%,
 *     chin ~26% — a head only ~0.17 of frame height. At 44px that is a ~7px
 *     face, which is why no size increase alone could fix this: even 64px
 *     uncropped only buys ~10px.
 *   - STOCK (49, seated at a desk): head top ~12-15%, chin ~45-49% — a head
 *     ~0.32-0.34 of frame height. Families B and C measured within two points
 *     of each other, so they take ONE rule; splitting them would be per-shoot
 *     precision the measurements do not support.
 *
 * So the smallest rule that serves the whole roster is two values keyed off the
 * `faculty` flag the catalog already carries, rather than a per-avatar table
 * that would need an entry for every avatar the account ever adds. An
 * unrecognised face falls to the STOCK rule, which is the safe default: the
 * curated public catalog is seated by construction (`lib/avatar-roster.ts`).
 *
 * THE ARITHMETIC. With the full source height visible, box position maps 1:1
 * to source fraction, so `scale(z)` about `50% originY%` shows the source band
 * from `originY*(1 - 1/z)` to `originY*(1 - 1/z) + 100/z` percent:
 *
 *   - faculty  z=2.7, originY=6  -> band  3.8%..40.8%, head fills ~49%
 *   - stock    z=1.6, originY=10 -> band  3.8%..66.3%, head fills ~54%
 *
 * Both land the head at roughly half the thumbnail with headroom above, which
 * is the framing a face needs to be identifiable at this size.
 *
 * HORIZONTAL DOES *NOT* ALWAYS STAY CENTRED — and this paragraph used to say it
 * did. It read "Every subject measured within a few points of the frame's
 * horizontal centre, so `50%` is correct and no per-avatar X is needed", and
 * that was a UNIVERSAL claim generalised from a SAMPLE: the probe grids behind
 * it covered twelve avatars (emily/alex/sophia, judy/dexter/katya,
 * michael/richard/michael, scott/john/jenny) and the two `Tech Expert` shoots
 * were not among them. In those two the subject is seated well right of frame
 * centre, so a crop about `50%` landed on the desk and the chair and pushed the
 * face to the edge of the box — the reported bug.
 *
 * ALL 54 ARE NOW MEASURED, horizontally, by `scripts/measure-roster-framing.ts`
 * against a 2.5%-pitch ruler laid over a head-band crop of each still
 * (`screenshots/roster-framing/ruler-*.png`). This sample is EXHAUSTIVE, not
 * sampled: every id in `lib/avatar-roster.ts` plus all five faculty. What it
 * found:
 *
 *   - 52 of 54 sit within ~2 points of centre. Every seated stock shoot — the
 *     blue-wall studio, the loft, the garden-window set, the two Therapist
 *     looks, the HR and Lawyer looks — frames its subject on the centre line,
 *     and so do all five faculty: Cowen, Stephens, Hawkins, Goldberg and
 *     Boyatsis each measure 49-51%. The original claim was right about the
 *     shoots it actually looked at.
 *   - THE `Tech Expert` SHOOT is the exception, and it is a SHOOT, not two
 *     coincidences. Bryan and Elenora are the same set — the same dark
 *     monitors and office chair, the same potted plant — and both sit at ~64%
 *     of frame width, about +14 points right of centre. The monitors fill the
 *     left half of the frame, which is what the old thumbnail was cropping.
 *
 * So the correction is ONE per-shoot-family value covering two avatars, not 54
 * hand-tuned numbers. It is keyed per avatar id anyway, mirroring
 * `FRAMING_BY_AVATAR_ID` above, because the catalog gives no shoot identifier
 * to key a family off; the comment on the entries records that they are one
 * shoot. Anything absent takes `DEFAULT_ORIGIN_X`, so the 52 genuinely centred
 * faces are untouched.
 *
 * VERTICAL WAS RE-MEASURED TOO, and the two-value rule survives: no shoot was
 * found whose head sits outside the band its family's rule assumes. The one
 * thing worth recording is that the `Tech Expert` subjects sit LOWER than the
 * rest of the seated roster (head top ~19-25% against ~12-18%), which the
 * stock rule already tolerates — their faces land slightly low in the
 * thumbnail rather than mis-framed — so it is noted here rather than fixed
 * with a third rule the measurements do not demand.
 *
 * WHY THE HORIZONTAL CORRECTION IS AN `object-position` AND THE VERTICAL ONE
 * IS NOT. These are not inconsistent, and the asymmetry is the whole point.
 * `overflowY` on a 16:9 still covering a 1:1 box is exactly ZERO, which is why
 * the vertical crop has to be a transform — there is no vertical slack for
 * `object-position` to slide. But `overflowX` is 16/9 - 1 = 0.778 BOX WIDTHS,
 * which is a great deal of slack, so horizontally `object-position` is not
 * inert at all: it is the right tool, and `object-position: X% 50%` puts
 * source fraction `(X/100 * 0.778 + 0.5) / (16/9)` at the box centre.
 * Inverting that, the X that centres source fraction `s` is
 * `100 * (16/9 * s - 0.5) / (16/9 - 1)`, so s=0.64 needs X=82%.
 *
 * It is also preferable to a horizontal `transform-origin`, which was the
 * other candidate. A `transform-origin` X is SCALE-DEPENDENT — the same 116%
 * lands source 63.9% at z=1.6 but 73.4% at z=2.7 — so the faculty and stock
 * rules would need different numbers for the same physical offset, and any
 * retune of `scale` would silently move every face sideways. `object-position`
 * is independent of `scale`, so one number per shoot means one thing forever.
 * The reachable range is source 28.1%..71.9%, which covers everything measured
 * here with room to spare.
 */
export interface ThumbnailFraming extends AvatarFraming {
  /**
   * `object-position` X, in percent. Not a source fraction: see the
   * conversion in this function's comment.
   */
  objectX: number;
}

/** Centred: what a shoot that framed its subject on the centre line needs. */
const DEFAULT_OBJECT_X = 50;

/**
 * `object-position` X for the shoots that DO NOT centre their subject, keyed
 * by LiveAvatar avatar id — the same shape as `FRAMING_BY_AVATAR_ID` above,
 * for the same reason: the catalog carries no shoot identifier to key a family
 * off. An avatar absent from this map takes `DEFAULT_OBJECT_X` and is
 * therefore untouched, which is the correct default for 52 of the 54.
 */
const THUMBNAIL_OBJECT_X_BY_AVATAR_ID: Readonly<Record<string, number>> = {
  // The `Tech Expert` shoot — ONE set, two avatars, measured at ~64% of frame
  // width because the monitors occupy the left half of the frame. 82% is the
  // `object-position` that centres source 64%.
  "64b526e4-741c-43b6-a918-4e40f3261c7a": 82, // Bryan Tech Expert
  "8175dfc2-7858-49d6-b5fa-0c135d1c4bad": 82, // Elenora Tech Expert
};

export function rosterThumbnailFramingStyle(
  faculty: boolean | undefined,
  avatarId?: string | null,
): {
  transform: string;
  transformOrigin: string;
  objectPosition: string;
} {
  const framing: ThumbnailFraming = {
    ...(faculty ? { scale: 2.7, originY: 6 } : { scale: 1.6, originY: 10 }),
    objectX:
      (avatarId ? THUMBNAIL_OBJECT_X_BY_AVATAR_ID[avatarId] : undefined) ??
      DEFAULT_OBJECT_X,
  };
  return {
    transform: `scale(${framing.scale})`,
    transformOrigin: `50% ${framing.originY}%`,
    // Y stays 50% — it has no slack to move and would be a no-op. X carries
    // the horizontal correction.
    objectPosition: `${framing.objectX}% 50%`,
  };
}
