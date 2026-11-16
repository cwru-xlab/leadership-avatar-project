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
 * vertically — a head-biased `object-position: 50% 0%` is a literal no-op here
 * and only a zoom can crop in on a face. Anyone "simplifying" this to an
 * object-position offset will silently restore the old thumbnails.
 *
 * WHY TWO VALUES AND NOT 54. Head height was measured as a fraction of the
 * source frame on a per-shoot-family basis (see the probe grids that produced
 * `screenshots/thumb-legibility/probe-measure-*.png`):
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
 * HORIZONTAL STAYS CENTRED. Every subject measured within a few points of the
 * frame's horizontal centre, so `50%` is correct and no per-avatar X is needed.
 */
export function rosterThumbnailFramingStyle(faculty: boolean | undefined): {
  transform: string;
  transformOrigin: string;
} {
  const framing: AvatarFraming = faculty
    ? { scale: 2.7, originY: 6 }
    : { scale: 1.6, originY: 10 };
  return {
    transform: `scale(${framing.scale})`,
    transformOrigin: `50% ${framing.originY}%`,
  };
}
