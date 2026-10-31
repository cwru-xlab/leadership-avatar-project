"use client";

import { visualBands, vocalBands } from "@/lib/metrics/bands";
import type { CameraMode, VisualMetrics, VocalMetrics } from "@/lib/metrics/types";

/** What the shared session capture produced this visit. */
export interface DeliveryCapture {
  cameraMode: CameraMode;
  visual: VisualMetrics | null;
  vocal: VocalMetrics | null;
}

/**
 * End-of-session delivery, as bands (never raw meters): the coached summary
 * and the voice drill result render this same card. REQ-85: it is only ever
 * mounted after the session/attempt has finished.
 */
export default function DeliveryBandsCard({
  delivery,
  emptyNote,
}: {
  delivery: DeliveryCapture | null;
  /** Shown when nothing was captured on this visit. */
  emptyNote: string;
}) {
  const vocalRows = delivery?.vocal ? vocalBands(delivery.vocal) : [];
  const visualRows = delivery?.visual ? visualBands(delivery.visual) : [];

  return (
    <article className="space-y-3 rounded-xl border border-line bg-white p-5" aria-label="Delivery">
      <h2 className="font-display font-medium text-lg text-ink">Delivery</h2>
      {delivery ? (
        <>
          {vocalRows.length > 0 ? (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              {vocalRows.map((row) => (
                <div key={`vocal-${row.label}`}>
                  <dt className="text-xs font-semibold text-muted">{row.label}</dt>
                  <dd className="text-sm text-ink">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-ink">There wasn&apos;t enough speech captured to describe your voice.</p>
          )}
          {delivery.cameraMode === "OFF" ? (
            <p className="text-sm text-ink">Your camera was off, so visual delivery wasn&apos;t measured.</p>
          ) : visualRows.length > 0 ? (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              {visualRows.map((row) => (
                <div key={`visual-${row.label}`}>
                  <dt className="text-xs font-semibold text-muted">{row.label}</dt>
                  <dd className="text-sm text-ink">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-ink">Your camera couldn&apos;t be measured this time.</p>
          )}
        </>
      ) : (
        <p className="text-sm text-ink">{emptyNote}</p>
      )}
    </article>
  );
}
