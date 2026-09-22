"use client";

import { useEffect, useRef } from "react";

/**
 * A muted, mirrored, click-transparent live preview of the student's own
 * camera stream. Purely presentational - no inference, no scoring, no
 * coaching text. CONTEXT.md defers live coaching explicitly; this component
 * must never display a metric, a percentage, a rating or any performance
 * judgement, only the student's own video.
 *
 * Renders nothing when `stream` is null, so a camera-off session renders no
 * DOM at all.
 */
export interface SelfViewThumbnailProps {
  stream: MediaStream | null;
  className?: string;
}

export function SelfViewThumbnail({
  stream,
  className,
}: SelfViewThumbnailProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
    return () => {
      el.srcObject = null;
    };
  }, [stream]);

  if (!stream) return null;

  return (
    <div
      className={
        "fixed bottom-4 right-4 z-40 w-44 h-[132px] overflow-hidden rounded-2xl border border-[#d4e2e9] bg-black/80 pointer-events-none shadow-lg relative " +
        (className ?? "")
      }
    >
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className="h-full w-full scale-x-[-1] object-cover"
      />
      <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
        You
      </span>
      <span className="sr-only">
        Local preview of your own camera. This preview is not recorded or
        transmitted anywhere.
      </span>
    </div>
  );
}

export default SelfViewThumbnail;
