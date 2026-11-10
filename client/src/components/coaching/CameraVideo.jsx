import React, { useEffect, useRef } from 'react';
import { cn } from '../ui';

/**
 * Shows a camera stream as a mirrored self-view. The mirroring is CSS only: the face model reads the
 * raw frames from its own hidden video element (see hooks/useFaceCoaching.js), so the analysis never
 * depends on how this preview is drawn. Nothing here records or uploads anything.
 */
export default function CameraVideo({ stream, className, label = 'Your camera preview' }) {
  const ref = useRef(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return undefined;
    video.srcObject = stream || null;
    if (stream) video.play().catch(() => {});
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <video
      ref={ref}
      muted
      playsInline
      autoPlay
      aria-label={label}
      className={cn('-scale-x-100 bg-ink-deep object-cover', className)}
    />
  );
}
